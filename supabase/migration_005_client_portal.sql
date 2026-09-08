-- ============================================================================
-- FieldTrace — Migration 005: Client Portal
-- Run this AFTER migrations 1–4, same project.
--
-- Adds a magic-link, read-only client portal: a site/tenant closes out, an
-- admin creates a share scoped to specific zones, and the client opens
-- /portal/:token to see a curated before/after photo gallery and the asset
-- register (with warranty status, no cost data) for exactly those zones —
-- nothing else in the building.
--
-- This is the first EXTERNAL-facing surface in the app. Unlike the
-- zero-login field flows (gated only by knowing a QR code, safe because
-- there's nothing sensitive to see beyond one zone's work-log form), a
-- client portal exposes a real asset register, so access is gated by a
-- long, unguessable, individually revocable token — not by anyone finding
-- the URL pattern.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists ft_client_shares (
  share_id      uuid primary key default gen_random_uuid(),
  location_id   text not null references ft_locations(location_id) on delete cascade,
  label         text not null, -- admin-facing, e.g. "Nimbus Analytics — Floor 3"
  access_token  uuid not null default gen_random_uuid(), -- the actual secret in the URL; deliberately separate from share_id
  revoked       boolean not null default false,
  created_by    uuid references ft_personnel(personnel_id),
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_ft_client_shares_token on ft_client_shares(access_token);

create table if not exists ft_client_share_zones (
  id        uuid primary key default gen_random_uuid(),
  share_id  uuid not null references ft_client_shares(share_id) on delete cascade,
  zone_id   text not null references ft_zones(zone_id) on delete cascade,
  unique (share_id, zone_id)
);

create table if not exists ft_site_photos (
  photo_id     uuid primary key default gen_random_uuid(),
  location_id  text not null references ft_locations(location_id) on delete cascade,
  zone_id      text references ft_zones(zone_id) on delete cascade, -- nullable: a site-wide photo not tied to one zone
  stage        text not null check (stage in ('Before','After')),
  photo_url    text not null,
  caption      text,
  taken_at     date,
  uploaded_by  uuid references ft_personnel(personnel_id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_ft_client_shares_location on ft_client_shares(location_id);
create index if not exists idx_ft_client_share_zones_share on ft_client_share_zones(share_id);
create index if not exists idx_ft_site_photos_location on ft_site_photos(location_id);
create index if not exists idx_ft_site_photos_zone on ft_site_photos(zone_id);

-- ----------------------------------------------------------------------------
-- RLS — admin (staff) can read for management; all writes go through RPCs.
-- No direct anon access to these tables at all — the portal reads exclusively
-- through ft_get_client_portal, which validates the token itself.
-- ----------------------------------------------------------------------------
alter table ft_client_shares enable row level security;
alter table ft_client_share_zones enable row level security;
alter table ft_site_photos enable row level security;

drop policy if exists ft_staff_read_client_shares on ft_client_shares;
create policy ft_staff_read_client_shares on ft_client_shares for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_client_share_zones on ft_client_share_zones;
create policy ft_staff_read_client_share_zones on ft_client_share_zones for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_site_photos on ft_site_photos;
create policy ft_staff_read_site_photos on ft_site_photos for select using (auth.role() = 'authenticated');

revoke insert, update, delete on ft_client_shares, ft_client_share_zones, ft_site_photos from anon, authenticated;
grant select on ft_client_shares, ft_client_share_zones, ft_site_photos to authenticated;

-- ----------------------------------------------------------------------------
-- STORAGE — curated handover photos. Public read (the portal is an anon
-- visitor following a link, so images must be fetchable without a session),
-- staff-only upload.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ft-site-photos', 'ft-site-photos', true)
on conflict (id) do nothing;

drop policy if exists "ft public read site-photos" on storage.objects;
create policy "ft public read site-photos" on storage.objects
  for select using (bucket_id = 'ft-site-photos');

drop policy if exists "ft staff upload site-photos" on storage.objects;
create policy "ft staff upload site-photos" on storage.objects
  for insert with check (bucket_id = 'ft-site-photos' and auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- ADMIN RPCs — creating/managing shares and photos. Authenticated only.
-- ----------------------------------------------------------------------------

create or replace function ft_create_client_share(
  p_location_id text,
  p_zone_ids    text[],
  p_label       text
) returns ft_client_shares
language plpgsql security definer as $$
declare
  v_share ft_client_shares;
  v_personnel_id uuid;
  zid text;
begin
  if p_zone_ids is null or array_length(p_zone_ids, 1) is null then
    raise exception 'Select at least one zone for this share';
  end if;
  if not exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Unknown site %', p_location_id;
  end if;

  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

  insert into ft_client_shares (location_id, label, created_by)
  values (p_location_id, p_label, v_personnel_id)
  returning * into v_share;

  foreach zid in array p_zone_ids loop
    insert into ft_client_share_zones (share_id, zone_id) values (v_share.share_id, zid)
    on conflict do nothing;
  end loop;

  return v_share;
end;
$$;

create or replace function ft_revoke_client_share(
  p_share_id uuid
) returns void
language plpgsql security definer as $$
begin
  update ft_client_shares set revoked = true where share_id = p_share_id;
end;
$$;

create or replace function ft_add_site_photo(
  p_location_id text,
  p_zone_id     text,
  p_stage       text,
  p_photo_url   text,
  p_caption     text,
  p_taken_at    date
) returns ft_site_photos
language plpgsql security definer as $$
declare
  v_photo ft_site_photos;
  v_personnel_id uuid;
begin
  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

  insert into ft_site_photos (location_id, zone_id, stage, photo_url, caption, taken_at, uploaded_by)
  values (p_location_id, p_zone_id, p_stage, p_photo_url, p_caption, p_taken_at, v_personnel_id)
  returning * into v_photo;

  return v_photo;
end;
$$;

create or replace function ft_delete_site_photo(
  p_photo_id uuid
) returns void
language plpgsql security definer as $$
begin
  delete from ft_site_photos where photo_id = p_photo_id;
end;
$$;

grant execute on function ft_create_client_share to authenticated;
grant execute on function ft_revoke_client_share to authenticated;
grant execute on function ft_add_site_photo to authenticated;
grant execute on function ft_delete_site_photo to authenticated;

-- ----------------------------------------------------------------------------
-- CLIENT-FACING RPC — the only way an anon visitor reads any of this data.
-- Validates the token itself (not-revoked), scopes every query to exactly
-- the zones pinned to that share, and returns one composite jsonb payload.
-- Unit cost is deliberately never selected here.
-- ----------------------------------------------------------------------------
create or replace function ft_get_client_portal(
  p_token uuid
) returns jsonb
language plpgsql security definer as $$
declare
  v_share ft_client_shares;
  v_location ft_locations;
  v_result jsonb;
begin
  select * into v_share from ft_client_shares where access_token = p_token and revoked = false;
  if v_share is null then
    raise exception 'This link is invalid or has been revoked';
  end if;

  select * into v_location from ft_locations where location_id = v_share.location_id;

  select jsonb_build_object(
    'label', v_share.label,
    'site', jsonb_build_object('name', v_location.name, 'address', v_location.address),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'zone_id', z.zone_id, 'floor_level', z.floor_level,
        'zone_type', z.zone_type, 'tenant_name', z.tenant_name
      )), '[]'::jsonb)
      from ft_zones z
      where z.zone_id in (select zone_id from ft_client_share_zones where share_id = v_share.share_id)
    ),
    'assets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'asset_id', a.asset_id, 'category', a.category, 'make_model', a.make_model,
        'status', a.status, 'warranty_expiry', a.warranty_expiry, 'current_zone_id', a.current_zone_id
      )), '[]'::jsonb)
      from ft_assets a
      where a.current_zone_id in (select zone_id from ft_client_share_zones where share_id = v_share.share_id)
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'photo_id', p.photo_id, 'zone_id', p.zone_id, 'stage', p.stage,
        'photo_url', p.photo_url, 'caption', p.caption, 'taken_at', p.taken_at
      ) order by p.stage, p.taken_at nulls last), '[]'::jsonb)
      from ft_site_photos p
      where p.location_id = v_share.location_id
        and (p.zone_id is null or p.zone_id in (select zone_id from ft_client_share_zones where share_id = v_share.share_id))
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function ft_get_client_portal to anon, authenticated;
