-- ============================================================================
-- FieldTrace — Migration 004: Floor Plan Import & Pin Tagging
-- Run this AFTER migration.sql, migration_002_admin.sql, and
-- migration_003_provisioning.sql, same project.
--
-- Adds the "Import floor plan & tag assets" flow inside Asset Provisioning:
-- upload a floor plan image (PDF is rasterized to an image client-side
-- before upload — see README), click to drop pins with category/zone/qty,
-- review, then register all pins in one action through the same serial
-- allocation logic as the existing Register & Print flow.
--
-- This migration also refactors ft_register_assets: its core "allocate next
-- serial + insert rows" logic moves into a new private helper,
-- ft_allocate_and_insert_assets(), which both ft_register_assets() and the
-- new ft_register_floor_plan_tags() call. ft_register_assets()'s external
-- signature and behavior are unchanged — the existing Register & Print UI
-- needs no frontend changes for this refactor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists ft_floor_plans (
  plan_id      uuid primary key default gen_random_uuid(),
  location_id  text not null references ft_locations(location_id) on delete cascade,
  floor_level  text not null,
  file_url     text not null,
  width        integer not null,
  height       integer not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ft_floor_plans_location on ft_floor_plans(location_id);

create table if not exists ft_floor_plan_tags (
  tag_id                   uuid primary key default gen_random_uuid(),
  plan_id                  uuid not null references ft_floor_plans(plan_id) on delete cascade,
  zone_id                  text references ft_zones(zone_id),
  category                 text not null check (category in ('Task Chair','AV Display','Pod','Meeting Table','Standing Desk','Sofa','Projector','Access Point','Other')),
  id_prefix                text not null,
  make_model               text,
  quantity                 integer not null default 1 check (quantity > 0),
  pos_x                    numeric not null check (pos_x >= 0 and pos_x <= 1), -- fraction of image width
  pos_y                    numeric not null check (pos_y >= 0 and pos_y <= 1), -- fraction of image height
  status                   text not null default 'Pending' check (status in ('Pending','Registered')),
  registered_asset_id_start text,
  registered_asset_id_end   text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_ft_floor_plan_tags_plan on ft_floor_plan_tags(plan_id);
create index if not exists idx_ft_floor_plan_tags_status on ft_floor_plan_tags(status);

-- Assets registered via a floor plan pin carry their placement back, so a
-- future "map view" can plot exactly where each asset sits on the plan.
-- Assets registered via the plain Register & Print flow leave these null.
alter table ft_assets add column if not exists floor_plan_id uuid references ft_floor_plans(plan_id);
alter table ft_assets add column if not exists pos_x numeric;
alter table ft_assets add column if not exists pos_y numeric;

-- ----------------------------------------------------------------------------
-- RLS — same pattern as the rest of /admin: authenticated read, no direct
-- writes, everything mutates through RPCs below.
-- ----------------------------------------------------------------------------
alter table ft_floor_plans enable row level security;
alter table ft_floor_plan_tags enable row level security;

drop policy if exists ft_staff_read_floor_plans on ft_floor_plans;
create policy ft_staff_read_floor_plans on ft_floor_plans for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_floor_plan_tags on ft_floor_plan_tags;
create policy ft_staff_read_floor_plan_tags on ft_floor_plan_tags for select using (auth.role() = 'authenticated');

revoke insert, update, delete on ft_floor_plans, ft_floor_plan_tags from anon, authenticated;
grant select on ft_floor_plans, ft_floor_plan_tags to authenticated;

-- ----------------------------------------------------------------------------
-- STORAGE — floor plan images. Admin-only upload; public read so the
-- tagging canvas and any future map view can just <img src=...> it.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ft-floorplans', 'ft-floorplans', true)
on conflict (id) do nothing;

drop policy if exists "ft public read floorplans" on storage.objects;
create policy "ft public read floorplans" on storage.objects
  for select using (bucket_id = 'ft-floorplans');

drop policy if exists "ft staff upload floorplans" on storage.objects;
create policy "ft staff upload floorplans" on storage.objects
  for insert with check (bucket_id = 'ft-floorplans' and auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- REFACTOR: ft_allocate_and_insert_assets — the core "next serial + insert"
-- logic extracted from migration 003's ft_register_assets, now shared by
-- both the plain Register & Print flow and floor-plan pin registration.
-- ----------------------------------------------------------------------------
create or replace function ft_allocate_and_insert_assets(
  p_category         text,
  p_id_prefix        text,
  p_make_model       text,
  p_zone_id          text,
  p_count            integer,
  p_unit_cost        numeric default null,
  p_warranty_expiry  date default null,
  p_floor_plan_id    uuid default null,
  p_pos_x            numeric default null,
  p_pos_y            numeric default null
) returns setof ft_assets
language plpgsql security definer as $$
declare
  v_location_id text;
  v_app_url text;
  v_max integer;
  v_next integer;
  v_asset_id text;
  i integer;
begin
  if p_count is null or p_count <= 0 or p_count > 500 then
    raise exception 'Count must be between 1 and 500';
  end if;

  select location_id into v_location_id from ft_zones where zone_id = p_zone_id;
  if v_location_id is null then
    raise exception 'Unknown zone %', p_zone_id;
  end if;

  select app_url into v_app_url from ft_locations where location_id = v_location_id;
  if v_app_url is null or v_app_url = '' then
    raise exception 'Site % has no app_url configured — set it in Sites & Spaces before provisioning assets', v_location_id;
  end if;

  select coalesce(max((regexp_match(asset_id, '(\d+)$'))[1]::integer), 0)
    into v_max
    from ft_assets
    where asset_id like 'FIT-' || upper(p_id_prefix) || '-%';

  v_next := v_max + 1;

  for i in 0 .. (p_count - 1) loop
    v_asset_id := 'FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + i)::text, 5, '0');
    insert into ft_assets (asset_id, category, make_model, current_zone_id, status, warranty_expiry, unit_cost, qr_code_url, floor_plan_id, pos_x, pos_y)
    values (
      v_asset_id, p_category, p_make_model, p_zone_id, 'Active', p_warranty_expiry, p_unit_cost,
      rtrim(v_app_url, '/') || '/scan?type=asset&id=' || v_asset_id,
      p_floor_plan_id, p_pos_x, p_pos_y
    );
  end loop;

  return query
    select * from ft_assets
    where asset_id between ('FIT-' || upper(p_id_prefix) || '-' || lpad(v_next::text, 5, '0'))
                        and ('FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + p_count - 1)::text, 5, '0'))
    order by asset_id;
end;
$$;

-- ft_register_assets: same external signature as migration 003, now a thin
-- wrapper over the shared helper. No frontend change needed for this.
create or replace function ft_register_assets(
  p_category         text,
  p_id_prefix        text,
  p_make_model       text,
  p_zone_id          text,
  p_count            integer,
  p_unit_cost        numeric default null,
  p_warranty_expiry  date default null
) returns setof ft_assets
language plpgsql security definer as $$
begin
  return query
    select * from ft_allocate_and_insert_assets(
      p_category, p_id_prefix, p_make_model, p_zone_id, p_count, p_unit_cost, p_warranty_expiry, null, null, null
    );
end;
$$;

grant execute on function ft_allocate_and_insert_assets to authenticated;
grant execute on function ft_register_assets to authenticated;

-- ----------------------------------------------------------------------------
-- FLOOR PLAN RPCs
-- ----------------------------------------------------------------------------

create or replace function ft_create_floor_plan(
  p_location_id text,
  p_floor_level text,
  p_file_url    text,
  p_width       integer,
  p_height      integer
) returns ft_floor_plans
language plpgsql security definer as $$
declare
  v_plan ft_floor_plans;
begin
  if not exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Unknown site %', p_location_id;
  end if;

  insert into ft_floor_plans (location_id, floor_level, file_url, width, height)
  values (p_location_id, p_floor_level, p_file_url, p_width, p_height)
  returning * into v_plan;

  return v_plan;
end;
$$;

create or replace function ft_add_floor_plan_tag(
  p_plan_id    uuid,
  p_zone_id    text,
  p_category   text,
  p_id_prefix  text,
  p_make_model text,
  p_quantity   integer,
  p_pos_x      numeric,
  p_pos_y      numeric
) returns ft_floor_plan_tags
language plpgsql security definer as $$
declare
  v_tag ft_floor_plan_tags;
begin
  if not exists (select 1 from ft_floor_plans where plan_id = p_plan_id) then
    raise exception 'Unknown floor plan';
  end if;

  insert into ft_floor_plan_tags (plan_id, zone_id, category, id_prefix, make_model, quantity, pos_x, pos_y)
  values (p_plan_id, p_zone_id, p_category, p_id_prefix, p_make_model, coalesce(p_quantity, 1), p_pos_x, p_pos_y)
  returning * into v_tag;

  return v_tag;
end;
$$;

create or replace function ft_update_floor_plan_tag(
  p_tag_id     uuid,
  p_zone_id    text,
  p_category   text,
  p_id_prefix  text,
  p_make_model text,
  p_quantity   integer,
  p_pos_x      numeric,
  p_pos_y      numeric
) returns void
language plpgsql security definer as $$
begin
  if exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and status = 'Registered') then
    raise exception 'This tag has already been registered and can no longer be edited';
  end if;

  update ft_floor_plan_tags
    set zone_id = p_zone_id,
        category = p_category,
        id_prefix = p_id_prefix,
        make_model = p_make_model,
        quantity = coalesce(p_quantity, quantity),
        pos_x = coalesce(p_pos_x, pos_x),
        pos_y = coalesce(p_pos_y, pos_y)
    where tag_id = p_tag_id;
end;
$$;

create or replace function ft_delete_floor_plan_tag(
  p_tag_id uuid
) returns void
language plpgsql security definer as $$
begin
  if exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and status = 'Registered') then
    raise exception 'This tag has already been registered and can no longer be removed';
  end if;
  delete from ft_floor_plan_tags where tag_id = p_tag_id;
end;
$$;

-- Registers every given (Pending) tag through the same serial-allocation
-- logic as the plain Register & Print flow, stamping floor_plan_id/pos_x/
-- pos_y on the created assets, and marks each tag Registered with the
-- resulting ID range. Returns every inserted asset across all tags, in the
-- order processed — the only data the printable sheet is built from.
create or replace function ft_register_floor_plan_tags(
  p_tag_ids uuid[]
) returns setof ft_assets
language plpgsql security definer as $$
declare
  v_tag record;
  v_asset ft_assets;
  v_first_id text;
  v_last_id text;
begin
  for v_tag in select * from ft_floor_plan_tags where tag_id = any(p_tag_ids) order by created_at
  loop
    if v_tag.status = 'Registered' then
      continue; -- idempotent: skip anything already registered
    end if;
    if v_tag.zone_id is null then
      raise exception 'Tag for % has no zone assigned — assign one before registering', v_tag.category;
    end if;

    v_first_id := null;
    v_last_id := null;

    for v_asset in
      select * from ft_allocate_and_insert_assets(
        v_tag.category, v_tag.id_prefix, v_tag.make_model, v_tag.zone_id, v_tag.quantity,
        null, null, v_tag.plan_id, v_tag.pos_x, v_tag.pos_y
      )
    loop
      if v_first_id is null then
        v_first_id := v_asset.asset_id;
      end if;
      v_last_id := v_asset.asset_id;
      return next v_asset;
    end loop;

    update ft_floor_plan_tags
      set status = 'Registered', registered_asset_id_start = v_first_id, registered_asset_id_end = v_last_id
      where tag_id = v_tag.tag_id;
  end loop;

  return;
end;
$$;

grant execute on function ft_create_floor_plan to authenticated;
grant execute on function ft_add_floor_plan_tag to authenticated;
grant execute on function ft_update_floor_plan_tag to authenticated;
grant execute on function ft_delete_floor_plan_tag to authenticated;
grant execute on function ft_register_floor_plan_tags to authenticated;
