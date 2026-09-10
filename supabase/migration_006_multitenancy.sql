-- ============================================================================
-- FieldTrace — Migration 006: Multi-Tenancy
-- Run this AFTER migrations 1-5, same project.
--
-- Adds a real organization boundary. Every table that holds customer data
-- gets an org_id, every authenticated (staff) RLS policy and every
-- SECURITY DEFINER RPC is rewritten to enforce it, and two new RPCs let a
-- brand-new company create their own organization and let their staff
-- self-claim a pre-created personnel record by phone number -- without ever
-- browsing another org's data to do it.
--
-- IMPORTANT -- read before running against anything with real customer data:
-- SECURITY DEFINER functions bypass RLS entirely for their own internal
-- queries. RLS being org-scoped does NOT automatically make the RPCs
-- org-safe -- every RPC below has an explicit org check added to its body.
-- Before this is trusted with a second paying customer's real data, create
-- two test orgs and manually confirm one cannot read/write the other's rows
-- through every admin page and RPC -- see the verification checklist in the
-- chat response this migration shipped with.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORGANIZATIONS
-- ----------------------------------------------------------------------------
create table if not exists ft_organizations (
  org_id      uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into ft_organizations (name)
select 'FieldTrace Demo'
where not exists (select 1 from ft_organizations);

-- ----------------------------------------------------------------------------
-- 2. org_id ON EVERY DATA TABLE -- add, backfill to the default org, lock to
-- not null. All 15 tables that hold customer-owned data get this treatment.
-- ----------------------------------------------------------------------------
do $$
declare
  v_default_org uuid;
  v_table text;
  v_tables text[] := array[
    'ft_locations','ft_zones','ft_assets','ft_parts_inventory','ft_work_logs',
    'ft_asset_transfers','ft_maintenance_tickets','ft_personnel',
    'ft_personnel_site_assignments','ft_inventory_txn','ft_floor_plans',
    'ft_floor_plan_tags','ft_client_shares','ft_client_share_zones','ft_site_photos'
  ];
begin
  select org_id into v_default_org from ft_organizations order by created_at limit 1;

  foreach v_table in array v_tables loop
    execute format('alter table %I add column if not exists org_id uuid references ft_organizations(org_id)', v_table);
    execute format('update %I set org_id = %L where org_id is null', v_table, v_default_org);
    execute format('alter table %I alter column org_id set not null', v_table);
    execute format('create index if not exists idx_%s_org on %I(org_id)', v_table, v_table);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. PHONE UNIQUENESS BECOMES PER-ORG, NOT GLOBAL
-- ----------------------------------------------------------------------------
alter table ft_personnel drop constraint if exists ft_personnel_phone_key;
alter table ft_personnel add constraint uq_ft_personnel_org_phone unique (org_id, phone);

-- ----------------------------------------------------------------------------
-- 4. ft_current_org_id() -- the one function everything else builds on.
-- ----------------------------------------------------------------------------
create or replace function ft_current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from ft_personnel where auth_user_id = auth.uid() limit 1;
$$;

grant execute on function ft_current_org_id to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS -- rewritten for every table.
-- ----------------------------------------------------------------------------
drop policy if exists ft_anon_read_locations on ft_locations;
create policy ft_anon_read_locations on ft_locations for select to anon using (true);
drop policy if exists ft_org_read_locations on ft_locations;
create policy ft_org_read_locations on ft_locations for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_anon_read_zones on ft_zones;
create policy ft_anon_read_zones on ft_zones for select to anon using (true);
drop policy if exists ft_org_read_zones on ft_zones;
create policy ft_org_read_zones on ft_zones for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_anon_read_assets on ft_assets;
create policy ft_anon_read_assets on ft_assets for select to anon using (true);
drop policy if exists ft_org_read_assets on ft_assets;
create policy ft_org_read_assets on ft_assets for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_anon_read_parts on ft_parts_inventory;
create policy ft_anon_read_parts on ft_parts_inventory for select to anon using (true);
drop policy if exists ft_org_read_parts on ft_parts_inventory;
create policy ft_org_read_parts on ft_parts_inventory for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_work_logs on ft_work_logs;
create policy ft_staff_read_work_logs on ft_work_logs for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_transfers on ft_asset_transfers;
create policy ft_staff_read_transfers on ft_asset_transfers for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_tickets on ft_maintenance_tickets;
create policy ft_staff_read_tickets on ft_maintenance_tickets for select to authenticated using (org_id = ft_current_org_id());
drop policy if exists ft_staff_write_tickets on ft_maintenance_tickets;
create policy ft_staff_write_tickets on ft_maintenance_tickets for update to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_personnel on ft_personnel;
create policy ft_staff_read_personnel on ft_personnel for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_assignments on ft_personnel_site_assignments;
create policy ft_staff_read_assignments on ft_personnel_site_assignments for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_inventory_txn on ft_inventory_txn;
create policy ft_staff_read_inventory_txn on ft_inventory_txn for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_floor_plans on ft_floor_plans;
create policy ft_staff_read_floor_plans on ft_floor_plans for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_floor_plan_tags on ft_floor_plan_tags;
create policy ft_staff_read_floor_plan_tags on ft_floor_plan_tags for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_client_shares on ft_client_shares;
create policy ft_staff_read_client_shares on ft_client_shares for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_client_share_zones on ft_client_share_zones;
create policy ft_staff_read_client_share_zones on ft_client_share_zones for select to authenticated using (org_id = ft_current_org_id());

drop policy if exists ft_staff_read_site_photos on ft_site_photos;
create policy ft_staff_read_site_photos on ft_site_photos for select to authenticated using (org_id = ft_current_org_id());

-- ----------------------------------------------------------------------------
-- 6. RPCs
-- ----------------------------------------------------------------------------

drop function if exists ft_add_location(text, text, text, text);
create or replace function ft_add_location(
  p_location_id text, p_name text, p_address text, p_app_url text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := ft_current_org_id();
begin
  if v_org is null then raise exception 'Your account is not linked to an organization'; end if;
  if exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Site code % already exists', p_location_id;
  end if;
  insert into ft_locations (location_id, name, address, app_url, org_id)
  values (p_location_id, p_name, p_address, p_app_url, v_org);
end;
$$;

create or replace function ft_update_location(
  p_location_id text, p_name text, p_address text, p_app_url text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ft_locations set name = p_name, address = p_address, app_url = p_app_url
    where location_id = p_location_id and org_id = ft_current_org_id();
  if not found then raise exception 'Unknown site'; end if;
end;
$$;

create or replace function ft_quick_add_zones(
  p_location_id text, p_floor text, p_zone_specs jsonb
) returns setof ft_zones
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  spec jsonb;
  v_zone_id text;
  v_type_code text;
begin
  select org_id into v_org from ft_locations where location_id = p_location_id and org_id = ft_current_org_id();
  if v_org is null then raise exception 'Unknown site'; end if;

  for spec in select * from jsonb_array_elements(p_zone_specs) loop
    v_type_code := upper(regexp_replace(spec->>'zone_type', '\s+', '', 'g'));
    v_zone_id := 'ZN-' || p_location_id || '-' || p_floor || '-' || v_type_code || '-' || upper(spec->>'suffix');
    insert into ft_zones (zone_id, location_id, floor_level, zone_type, tenant_name, org_id)
    values (v_zone_id, p_location_id, p_floor, spec->>'zone_type', nullif(spec->>'tenant_name', ''), v_org)
    on conflict (zone_id) do nothing;
  end loop;

  return query select z.* from ft_zones z where z.location_id = p_location_id and z.floor_level = p_floor order by z.zone_type;
end;
$$;

create or replace function ft_allocate_and_insert_assets(
  p_category text, p_id_prefix text, p_make_model text, p_zone_id text, p_count integer,
  p_unit_cost numeric default null, p_warranty_expiry date default null,
  p_floor_plan_id uuid default null, p_pos_x numeric default null, p_pos_y numeric default null
) returns setof ft_assets
language plpgsql security definer set search_path = public as $$
declare
  v_location_id text;
  v_org uuid;
  v_app_url text;
  v_max integer;
  v_next integer;
  v_asset_id text;
  i integer;
begin
  if p_count is null or p_count <= 0 or p_count > 500 then raise exception 'Count must be between 1 and 500'; end if;

  select location_id, org_id into v_location_id, v_org from ft_zones where zone_id = p_zone_id and org_id = ft_current_org_id();
  if v_location_id is null then raise exception 'Unknown zone'; end if;

  select app_url into v_app_url from ft_locations where location_id = v_location_id;
  if v_app_url is null or v_app_url = '' then
    raise exception 'Site % has no app_url configured -- set it in Sites & Spaces before provisioning assets', v_location_id;
  end if;

  select coalesce(max((regexp_match(asset_id, '(\d+)$'))[1]::integer), 0)
    into v_max from ft_assets
    where asset_id like 'FIT-' || upper(p_id_prefix) || '-%' and org_id = v_org;

  v_next := v_max + 1;

  for i in 0 .. (p_count - 1) loop
    v_asset_id := 'FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + i)::text, 5, '0');
    insert into ft_assets (asset_id, category, make_model, current_zone_id, status, warranty_expiry, unit_cost, qr_code_url, floor_plan_id, pos_x, pos_y, org_id)
    values (v_asset_id, p_category, p_make_model, p_zone_id, 'Active', p_warranty_expiry, p_unit_cost,
            rtrim(v_app_url, '/') || '/scan?type=asset&id=' || v_asset_id, p_floor_plan_id, p_pos_x, p_pos_y, v_org);
  end loop;

  return query select * from ft_assets
    where asset_id between ('FIT-' || upper(p_id_prefix) || '-' || lpad(v_next::text, 5, '0'))
                        and ('FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + p_count - 1)::text, 5, '0'))
      and org_id = v_org
    order by asset_id;
end;
$$;

create or replace function ft_register_assets(
  p_category text, p_id_prefix text, p_make_model text, p_zone_id text, p_count integer,
  p_unit_cost numeric default null, p_warranty_expiry date default null
) returns setof ft_assets
language plpgsql security definer set search_path = public as $$
begin
  return query select * from ft_allocate_and_insert_assets(p_category, p_id_prefix, p_make_model, p_zone_id, p_count, p_unit_cost, p_warranty_expiry, null, null, null);
end;
$$;

create or replace function ft_add_personnel(
  p_full_name text, p_phone text, p_role text, p_agency_vendor_name text, p_location_ids text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := ft_current_org_id();
  v_personnel_id uuid;
  loc text;
begin
  if v_org is null then raise exception 'Your account is not linked to an organization'; end if;
  if exists (select 1 from ft_personnel where phone = p_phone and org_id = v_org) then
    raise exception 'A staff member with phone % already exists', p_phone;
  end if;
  if p_location_ids is not null and exists (
    select 1 from unnest(p_location_ids) loc where not exists (select 1 from ft_locations l where l.location_id = loc and l.org_id = v_org)
  ) then
    raise exception 'One or more selected sites are not in your organization';
  end if;

  insert into ft_personnel (full_name, phone, role, agency_vendor_name, org_id)
  values (p_full_name, p_phone, p_role, p_agency_vendor_name, v_org)
  returning personnel_id into v_personnel_id;

  if p_location_ids is not null then
    foreach loc in array p_location_ids loop
      insert into ft_personnel_site_assignments (personnel_id, location_id, org_id) values (v_personnel_id, loc, v_org)
      on conflict do nothing;
    end loop;
  end if;

  return v_personnel_id;
end;
$$;

create or replace function ft_set_personnel_active(p_personnel_id uuid, p_is_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ft_personnel set is_active = p_is_active where personnel_id = p_personnel_id and org_id = ft_current_org_id();
  if not found then raise exception 'Not found'; end if;
end;
$$;

create or replace function ft_submit_work_log(
  p_zone_id text, p_asset_id text, p_logged_by_phone text, p_issue_type text, p_category text,
  p_action_taken text, p_parts_used_id uuid, p_parts_quantity integer, p_scrap_returned boolean, p_photo_url text
) returns table (log_id uuid, receipt_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_log_id uuid;
  v_receipt text;
  v_stock integer;
  v_personnel_id uuid;
  v_gate_status text;
  v_org uuid;
begin
  select org_id into v_org from ft_zones where zone_id = p_zone_id;
  if v_org is null then raise exception 'Unknown zone'; end if;

  if p_issue_type = 'Part Replacement' then
    if p_parts_used_id is null or p_parts_quantity is null or p_parts_quantity <= 0 then
      raise exception 'Part and quantity are required for a part replacement log';
    end if;
    if not p_scrap_returned then raise exception 'Scrap-return confirmation is required for a part replacement log'; end if;

    select stock_on_hand into v_stock from ft_parts_inventory where part_id = p_parts_used_id and org_id = v_org;
    if v_stock is null then raise exception 'Unknown part'; end if;
    if v_stock < p_parts_quantity then raise exception 'Insufficient stock: % on hand, % requested', v_stock, p_parts_quantity; end if;

    v_gate_status := 'Pending';
  else
    v_gate_status := 'Approved';
  end if;

  select personnel_id into v_personnel_id from ft_personnel where phone = p_logged_by_phone and org_id = v_org and is_active limit 1;

  insert into ft_work_logs (
    zone_id, asset_id, logged_by_phone, issue_type, category, action_taken, parts_used_id,
    parts_quantity, scrap_returned, photo_url, personnel_id, gate_status, org_id
  ) values (
    p_zone_id, p_asset_id, p_logged_by_phone, p_issue_type, p_category, p_action_taken, p_parts_used_id,
    coalesce(p_parts_quantity, 0), coalesce(p_scrap_returned, false), p_photo_url, v_personnel_id, v_gate_status, v_org
  )
  returning ft_work_logs.log_id, ft_work_logs.receipt_code into v_log_id, v_receipt;

  return query select v_log_id, v_receipt;
end;
$$;

create or replace function ft_transfer_asset(
  p_asset_id text, p_to_zone_id text, p_transferred_by text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from_zone text;
  v_org uuid;
begin
  select current_zone_id, org_id into v_from_zone, v_org from ft_assets where asset_id = p_asset_id;
  if v_org is null then raise exception 'Unknown asset'; end if;
  if not exists (select 1 from ft_zones where zone_id = p_to_zone_id and org_id = v_org) then
    raise exception 'Unknown destination zone';
  end if;

  update ft_assets set current_zone_id = p_to_zone_id where asset_id = p_asset_id;
  insert into ft_asset_transfers (asset_id, from_zone_id, to_zone_id, transferred_by, note, org_id)
  values (p_asset_id, v_from_zone, p_to_zone_id, p_transferred_by, p_note, v_org);
end;
$$;

create or replace function ft_report_asset_defect(
  p_asset_id text, p_defect_type text, p_description text, p_photo_url text, p_reported_by text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone text;
  v_org uuid;
  v_ticket_id uuid;
begin
  select current_zone_id, org_id into v_zone, v_org from ft_assets where asset_id = p_asset_id;
  if v_zone is null then raise exception 'Asset has no current zone on file'; end if;

  insert into ft_maintenance_tickets (asset_id, zone_id, defect_type, description, photo_url, reported_by, org_id)
  values (p_asset_id, v_zone, p_defect_type, p_description, p_photo_url, p_reported_by, v_org)
  returning ticket_id into v_ticket_id;

  update ft_assets set status = 'Maintenance' where asset_id = p_asset_id;
  return v_ticket_id;
end;
$$;

create or replace function ft_approve_work_log(p_receipt_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_log record;
  v_stock integer;
  v_personnel_id uuid;
  v_org uuid := ft_current_org_id();
begin
  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

  select * into v_log from ft_work_logs where receipt_code = p_receipt_code and org_id = v_org for update;
  if v_log is null then raise exception 'No log found for receipt code %', p_receipt_code; end if;
  if v_log.gate_status = 'Approved' then return; end if;
  if v_log.issue_type != 'Part Replacement' or v_log.parts_used_id is null then raise exception 'This log has no part to approve/deduct'; end if;

  select stock_on_hand into v_stock from ft_parts_inventory where part_id = v_log.parts_used_id for update;
  if v_stock < v_log.parts_quantity then raise exception 'Insufficient stock to approve: % on hand, % requested', v_stock, v_log.parts_quantity; end if;

  update ft_parts_inventory set stock_on_hand = stock_on_hand - v_log.parts_quantity where part_id = v_log.parts_used_id;

  insert into ft_inventory_txn (transaction_type, part_id, quantity, work_log_id, approved_by, approved_by_auth_uid, org_id)
  values ('ISSUE', v_log.parts_used_id, v_log.parts_quantity, v_log.log_id, v_personnel_id, auth.uid(), v_org);

  update ft_work_logs set gate_status = 'Approved', gate_approved_by = v_personnel_id, gate_approved_by_auth_uid = auth.uid(), gate_approved_at = now()
    where log_id = v_log.log_id;
end;
$$;

create or replace function ft_create_floor_plan(
  p_location_id text, p_floor_level text, p_file_url text, p_width integer, p_height integer
) returns ft_floor_plans
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_plan ft_floor_plans;
begin
  select org_id into v_org from ft_locations where location_id = p_location_id and org_id = ft_current_org_id();
  if v_org is null then raise exception 'Unknown site'; end if;

  insert into ft_floor_plans (location_id, floor_level, file_url, width, height, org_id)
  values (p_location_id, p_floor_level, p_file_url, p_width, p_height, v_org)
  returning * into v_plan;
  return v_plan;
end;
$$;

create or replace function ft_add_floor_plan_tag(
  p_plan_id uuid, p_zone_id text, p_category text, p_id_prefix text, p_make_model text,
  p_quantity integer, p_pos_x numeric, p_pos_y numeric
) returns ft_floor_plan_tags
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_tag ft_floor_plan_tags;
begin
  select org_id into v_org from ft_floor_plans where plan_id = p_plan_id and org_id = ft_current_org_id();
  if v_org is null then raise exception 'Unknown floor plan'; end if;

  insert into ft_floor_plan_tags (plan_id, zone_id, category, id_prefix, make_model, quantity, pos_x, pos_y, org_id)
  values (p_plan_id, p_zone_id, p_category, p_id_prefix, p_make_model, coalesce(p_quantity, 1), p_pos_x, p_pos_y, v_org)
  returning * into v_tag;
  return v_tag;
end;
$$;

create or replace function ft_update_floor_plan_tag(
  p_tag_id uuid, p_zone_id text, p_category text, p_id_prefix text, p_make_model text,
  p_quantity integer, p_pos_x numeric, p_pos_y numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and org_id = ft_current_org_id()) then
    raise exception 'Unknown tag';
  end if;
  if exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and status = 'Registered') then
    raise exception 'This tag has already been registered and can no longer be edited';
  end if;

  update ft_floor_plan_tags
    set zone_id = p_zone_id, category = p_category, id_prefix = p_id_prefix, make_model = p_make_model,
        quantity = coalesce(p_quantity, quantity), pos_x = coalesce(p_pos_x, pos_x), pos_y = coalesce(p_pos_y, pos_y)
    where tag_id = p_tag_id;
end;
$$;

create or replace function ft_delete_floor_plan_tag(p_tag_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and org_id = ft_current_org_id()) then
    raise exception 'Unknown tag';
  end if;
  if exists (select 1 from ft_floor_plan_tags where tag_id = p_tag_id and status = 'Registered') then
    raise exception 'This tag has already been registered and can no longer be removed';
  end if;
  delete from ft_floor_plan_tags where tag_id = p_tag_id;
end;
$$;

create or replace function ft_register_floor_plan_tags(p_tag_ids uuid[]) returns setof ft_assets
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := ft_current_org_id();
  v_tag record;
  v_asset ft_assets;
  v_first_id text;
  v_last_id text;
begin
  for v_tag in select * from ft_floor_plan_tags where tag_id = any(p_tag_ids) and org_id = v_org order by created_at loop
    if v_tag.status = 'Registered' then continue; end if;
    if v_tag.zone_id is null then raise exception 'Tag for % has no zone assigned -- assign one before registering', v_tag.category; end if;

    v_first_id := null; v_last_id := null;
    for v_asset in select * from ft_allocate_and_insert_assets(v_tag.category, v_tag.id_prefix, v_tag.make_model, v_tag.zone_id, v_tag.quantity, null, null, v_tag.plan_id, v_tag.pos_x, v_tag.pos_y) loop
      if v_first_id is null then v_first_id := v_asset.asset_id; end if;
      v_last_id := v_asset.asset_id;
      return next v_asset;
    end loop;

    update ft_floor_plan_tags set status = 'Registered', registered_asset_id_start = v_first_id, registered_asset_id_end = v_last_id where tag_id = v_tag.tag_id;
  end loop;
  return;
end;
$$;

create or replace function ft_create_client_share(p_location_id text, p_zone_ids text[], p_label text) returns ft_client_shares
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_share ft_client_shares;
  v_personnel_id uuid;
  zid text;
begin
  select org_id into v_org from ft_locations where location_id = p_location_id and org_id = ft_current_org_id();
  if v_org is null then raise exception 'Unknown site'; end if;
  if p_zone_ids is null or array_length(p_zone_ids, 1) is null then raise exception 'Select at least one zone for this share'; end if;
  if exists (select 1 from unnest(p_zone_ids) z where not exists (select 1 from ft_zones where zone_id = z and org_id = v_org)) then
    raise exception 'One or more zones are not in this organization';
  end if;

  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

  insert into ft_client_shares (location_id, label, created_by, org_id) values (p_location_id, p_label, v_personnel_id, v_org)
  returning * into v_share;

  foreach zid in array p_zone_ids loop
    insert into ft_client_share_zones (share_id, zone_id, org_id) values (v_share.share_id, zid, v_org) on conflict do nothing;
  end loop;
  return v_share;
end;
$$;

create or replace function ft_revoke_client_share(p_share_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ft_client_shares set revoked = true where share_id = p_share_id and org_id = ft_current_org_id();
  if not found then raise exception 'Not found'; end if;
end;
$$;

create or replace function ft_add_site_photo(
  p_location_id text, p_zone_id text, p_stage text, p_photo_url text, p_caption text, p_taken_at date
) returns ft_site_photos
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_photo ft_site_photos;
  v_personnel_id uuid;
begin
  select org_id into v_org from ft_locations where location_id = p_location_id and org_id = ft_current_org_id();
  if v_org is null then raise exception 'Unknown site'; end if;

  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

  insert into ft_site_photos (location_id, zone_id, stage, photo_url, caption, taken_at, uploaded_by, org_id)
  values (p_location_id, p_zone_id, p_stage, p_photo_url, p_caption, p_taken_at, v_personnel_id, v_org)
  returning * into v_photo;
  return v_photo;
end;
$$;

create or replace function ft_delete_site_photo(p_photo_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from ft_site_photos where photo_id = p_photo_id and org_id = ft_current_org_id();
  if not found then raise exception 'Not found'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. NEW: self-serve organization creation and staff onboarding
-- ----------------------------------------------------------------------------
create or replace function ft_bootstrap_organization(p_org_name text, p_full_name text, p_phone text) returns ft_organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org ft_organizations;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  if exists (select 1 from ft_personnel where auth_user_id = auth.uid()) then
    raise exception 'Your account is already linked to an organization';
  end if;

  insert into ft_organizations (name) values (p_org_name) returning * into v_org;

  insert into ft_personnel (full_name, phone, role, auth_user_id, org_id)
  values (p_full_name, p_phone, 'SuperAdmin', auth.uid(), v_org.org_id);

  return v_org;
end;
$$;

create or replace function ft_find_and_claim_by_phone(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match record;
  v_count integer;
  v_org_name text;
begin
  if auth.uid() is null then raise exception 'Must be signed in'; end if;
  if exists (select 1 from ft_personnel where auth_user_id = auth.uid()) then
    raise exception 'Your account is already linked to an organization';
  end if;

  select count(*) into v_count from ft_personnel where phone = p_phone and auth_user_id is null;
  if v_count = 0 then
    raise exception 'No pending invite found for that phone number -- ask your admin to add you as staff first';
  end if;
  if v_count > 1 then
    raise exception 'Multiple pending invites match that phone number -- contact your admin to resolve this';
  end if;

  select * into v_match from ft_personnel where phone = p_phone and auth_user_id is null;
  update ft_personnel set auth_user_id = auth.uid() where personnel_id = v_match.personnel_id;

  select name into v_org_name from ft_organizations where org_id = v_match.org_id;
  return jsonb_build_object('full_name', v_match.full_name, 'role', v_match.role, 'org_name', v_org_name);
end;
$$;

grant execute on function ft_bootstrap_organization to authenticated;
grant execute on function ft_find_and_claim_by_phone to authenticated;

-- ----------------------------------------------------------------------------
-- 8. RE-ASSERT GRANTS
-- ----------------------------------------------------------------------------
grant execute on function ft_add_location to authenticated;
grant execute on function ft_update_location to authenticated;
grant execute on function ft_quick_add_zones to authenticated;
grant execute on function ft_allocate_and_insert_assets to authenticated;
grant execute on function ft_register_assets to authenticated;
grant execute on function ft_add_personnel to authenticated;
grant execute on function ft_set_personnel_active to authenticated;
grant execute on function ft_submit_work_log to anon, authenticated;
grant execute on function ft_transfer_asset to anon, authenticated;
grant execute on function ft_report_asset_defect to anon, authenticated;
grant execute on function ft_approve_work_log to authenticated;
grant execute on function ft_create_floor_plan to authenticated;
grant execute on function ft_add_floor_plan_tag to authenticated;
grant execute on function ft_update_floor_plan_tag to authenticated;
grant execute on function ft_delete_floor_plan_tag to authenticated;
grant execute on function ft_register_floor_plan_tags to authenticated;
grant execute on function ft_create_client_share to authenticated;
grant execute on function ft_revoke_client_share to authenticated;
grant execute on function ft_add_site_photo to authenticated;
grant execute on function ft_delete_site_photo to authenticated;
