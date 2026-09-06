-- ============================================================================
-- FieldTrace — Migration 002: Personnel & Admin Management
-- Run this AFTER migration.sql, against the same Supabase project.
-- Adds: ft_personnel, ft_personnel_site_assignments, a personnel_id link on
-- ft_work_logs, a Storekeeper Gate approval workflow, and the RPCs backing
-- the new /admin/sites, /admin/personnel, /admin/gate views.
--
-- ⚠ BEHAVIOR CHANGE from migration.sql:
-- Previously, ft_submit_work_log() decremented ft_parts_inventory.stock_on_hand
-- the moment a technician submitted a Part Replacement log — the "scrap
-- returned" checkbox was a client-side self-attestation only. The Storekeeper
-- Gate spec calls for the deduction to happen at physical hand-off instead:
-- a technician submits and gets a receipt code, but stock is untouched until
-- a storekeeper looks up that code and taps Approve. This migration moves
-- the decrement into a new ft_approve_work_log() function and adds gate_*
-- columns to track that approval separately from the technician's own
-- scrap_returned checkbox. If you want the old immediate-deduction behavior
-- instead, skip this migration's ft_submit_work_log redefinition.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists ft_personnel (
  personnel_id       uuid primary key default gen_random_uuid(),
  full_name          text not null,
  phone              text not null unique check (phone ~ '^[0-9]{10}$'),
  role               text not null check (role in ('Technician','Janitor','Storekeeper','FM','SuperAdmin')),
  agency_vendor_name text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists ft_personnel_site_assignments (
  assignment_id  uuid primary key default gen_random_uuid(),
  personnel_id   uuid not null references ft_personnel(personnel_id) on delete cascade,
  location_id    text not null references ft_locations(location_id) on delete cascade,
  assigned_at    timestamptz not null default now(),
  unique (personnel_id, location_id)
);

create index if not exists idx_ft_assignments_personnel on ft_personnel_site_assignments(personnel_id);
create index if not exists idx_ft_assignments_location on ft_personnel_site_assignments(location_id);

-- ----------------------------------------------------------------------------
-- ft_work_logs: link to personnel + storekeeper gate approval state
-- ----------------------------------------------------------------------------
alter table ft_work_logs
  add column if not exists personnel_id       uuid references ft_personnel(personnel_id),
  add column if not exists gate_status        text not null default 'Pending' check (gate_status in ('Pending','Approved')),
  add column if not exists gate_approved_by   uuid references ft_personnel(personnel_id),
  add column if not exists gate_approved_at   timestamptz;

-- Part-replacement logs start life needing a gate approval; routine
-- inspections have no parts to deduct, so treat them as pre-approved.
update ft_work_logs set gate_status = 'Approved' where issue_type = 'Routine Inspection' and gate_status = 'Pending';

create index if not exists idx_ft_worklogs_gate_status on ft_work_logs(gate_status);
create index if not exists idx_ft_worklogs_receipt on ft_work_logs(receipt_code);

-- ----------------------------------------------------------------------------
-- ft_submit_work_log — redefined: no longer decrements stock at submission.
-- Stock now moves only on storekeeper approval (see ft_approve_work_log).
-- Also best-effort-links the submitting phone to a known personnel row.
-- ----------------------------------------------------------------------------
create or replace function ft_submit_work_log(
  p_zone_id         text,
  p_asset_id        text,
  p_logged_by_phone text,
  p_issue_type      text,
  p_category        text,
  p_action_taken    text,
  p_parts_used_id   uuid,
  p_parts_quantity  integer,
  p_scrap_returned  boolean,
  p_photo_url       text
) returns table (log_id uuid, receipt_code text)
language plpgsql security definer as $$
declare
  v_log_id uuid;
  v_receipt text;
  v_stock integer;
  v_personnel_id uuid;
  v_gate_status text;
begin
  if p_issue_type = 'Part Replacement' then
    if p_parts_used_id is null or p_parts_quantity is null or p_parts_quantity <= 0 then
      raise exception 'Part and quantity are required for a part replacement log';
    end if;
    if not p_scrap_returned then
      raise exception 'Scrap-return confirmation is required for a part replacement log';
    end if;

    -- Soft availability check only — the authoritative deduction happens at
    -- gate approval, where stock could have moved since this check.
    select stock_on_hand into v_stock from ft_parts_inventory where part_id = p_parts_used_id;
    if v_stock is null then
      raise exception 'Unknown part';
    end if;
    if v_stock < p_parts_quantity then
      raise exception 'Insufficient stock: % on hand, % requested', v_stock, p_parts_quantity;
    end if;

    v_gate_status := 'Pending';
  else
    v_gate_status := 'Approved';
  end if;

  select personnel_id into v_personnel_id from ft_personnel where phone = p_logged_by_phone and is_active limit 1;

  insert into ft_work_logs (
    zone_id, asset_id, logged_by_phone, issue_type, category,
    action_taken, parts_used_id, parts_quantity, scrap_returned, photo_url,
    personnel_id, gate_status
  ) values (
    p_zone_id, p_asset_id, p_logged_by_phone, p_issue_type, p_category,
    p_action_taken, p_parts_used_id, coalesce(p_parts_quantity, 0), coalesce(p_scrap_returned, false), p_photo_url,
    v_personnel_id, v_gate_status
  )
  returning ft_work_logs.log_id, ft_work_logs.receipt_code into v_log_id, v_receipt;

  return query select v_log_id, v_receipt;
end;
$$;

-- ----------------------------------------------------------------------------
-- ft_approve_work_log — Storekeeper Gate: look a receipt code up, verify the
-- scrap in hand, tap approve. Decrements stock atomically and idempotently
-- (re-approving an already-approved code is a no-op, not a double deduction).
-- ----------------------------------------------------------------------------
create or replace function ft_approve_work_log(
  p_receipt_code      text,
  p_approved_by       uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_log record;
  v_stock integer;
begin
  select * into v_log from ft_work_logs where receipt_code = p_receipt_code for update;
  if v_log is null then
    raise exception 'No log found for receipt code %', p_receipt_code;
  end if;
  if v_log.gate_status = 'Approved' then
    return; -- idempotent: already approved, nothing to do
  end if;
  if v_log.issue_type != 'Part Replacement' or v_log.parts_used_id is null then
    raise exception 'This log has no part to approve/deduct';
  end if;

  select stock_on_hand into v_stock from ft_parts_inventory where part_id = v_log.parts_used_id for update;
  if v_stock < v_log.parts_quantity then
    raise exception 'Insufficient stock to approve: % on hand, % requested', v_stock, v_log.parts_quantity;
  end if;

  update ft_parts_inventory set stock_on_hand = stock_on_hand - v_log.parts_quantity where part_id = v_log.parts_used_id;

  update ft_work_logs
    set gate_status = 'Approved', gate_approved_by = p_approved_by, gate_approved_at = now()
    where log_id = v_log.log_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- ft_add_location — Sites & Spaces "Add Location"
-- ----------------------------------------------------------------------------
create or replace function ft_add_location(
  p_location_id text,
  p_name        text,
  p_address     text
) returns void
language plpgsql security definer as $$
begin
  if exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Site code % already exists', p_location_id;
  end if;
  insert into ft_locations (location_id, name, address) values (p_location_id, p_name, p_address);
end;
$$;

-- ----------------------------------------------------------------------------
-- ft_quick_add_zones — Sites & Spaces "Quick-Add Zones" drawer.
-- p_zone_specs is a jsonb array like:
--   [{"zone_type":"Washroom","suffix":"N","tenant_name":null}, ...]
-- Generates collision-safe zone_ids following the existing
-- ZN-<SITE>-<FLOOR>-<TYPE>-<SUFFIX> convention and bulk-inserts them.
-- ----------------------------------------------------------------------------
create or replace function ft_quick_add_zones(
  p_location_id text,
  p_floor       text,
  p_zone_specs  jsonb
) returns setof ft_zones
language plpgsql security definer as $$
declare
  spec jsonb;
  v_zone_id text;
  v_type_code text;
begin
  if not exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Unknown site %', p_location_id;
  end if;

  for spec in select * from jsonb_array_elements(p_zone_specs)
  loop
    v_type_code := upper(regexp_replace(spec->>'zone_type', '\s+', '', 'g'));
    v_zone_id := 'ZN-' || p_location_id || '-' || p_floor || '-' || v_type_code || '-' || upper(spec->>'suffix');

    insert into ft_zones (zone_id, location_id, floor_level, zone_type, tenant_name)
    values (v_zone_id, p_location_id, p_floor, spec->>'zone_type', nullif(spec->>'tenant_name', ''))
    on conflict (zone_id) do nothing;
  end loop;

  return query
    select z.* from ft_zones z
    where z.location_id = p_location_id and z.floor_level = p_floor
    order by z.zone_type;
end;
$$;

-- ----------------------------------------------------------------------------
-- ft_add_personnel — Personnel tab "Add Staff" modal
-- ----------------------------------------------------------------------------
create or replace function ft_add_personnel(
  p_full_name          text,
  p_phone              text,
  p_role               text,
  p_agency_vendor_name text,
  p_location_ids       text[]
) returns uuid
language plpgsql security definer as $$
declare
  v_personnel_id uuid;
  loc text;
begin
  if exists (select 1 from ft_personnel where phone = p_phone) then
    raise exception 'A staff member with phone % already exists', p_phone;
  end if;

  insert into ft_personnel (full_name, phone, role, agency_vendor_name)
  values (p_full_name, p_phone, p_role, p_agency_vendor_name)
  returning personnel_id into v_personnel_id;

  if p_location_ids is not null then
    foreach loc in array p_location_ids loop
      insert into ft_personnel_site_assignments (personnel_id, location_id)
      values (v_personnel_id, loc)
      on conflict do nothing;
    end loop;
  end if;

  return v_personnel_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- ft_set_personnel_active — Personnel tab Active/Inactive toggle
-- ----------------------------------------------------------------------------
create or replace function ft_set_personnel_active(
  p_personnel_id uuid,
  p_is_active    boolean
) returns void
language plpgsql security definer as $$
begin
  update ft_personnel set is_active = p_is_active where personnel_id = p_personnel_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- Sites/Personnel/Gate are all facility-staff surfaces behind Supabase Auth
-- (the existing /admin login) — no anon access to any of this.
-- ----------------------------------------------------------------------------
alter table ft_personnel enable row level security;
alter table ft_personnel_site_assignments enable row level security;

drop policy if exists ft_staff_read_personnel on ft_personnel;
create policy ft_staff_read_personnel on ft_personnel for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_assignments on ft_personnel_site_assignments;
create policy ft_staff_read_assignments on ft_personnel_site_assignments for select using (auth.role() = 'authenticated');

revoke insert, update, delete on ft_personnel, ft_personnel_site_assignments from anon, authenticated;
grant select on ft_personnel, ft_personnel_site_assignments to authenticated;

-- ft_approve_work_log, ft_add_location, ft_quick_add_zones, ft_add_personnel,
-- ft_set_personnel_active are all facility-staff actions — authenticated only,
-- unlike the zero-login field RPCs in migration.sql which also grant anon.
grant execute on function ft_approve_work_log to authenticated;
grant execute on function ft_add_location to authenticated;
grant execute on function ft_quick_add_zones to authenticated;
grant execute on function ft_add_personnel to authenticated;
grant execute on function ft_set_personnel_active to authenticated;

-- ft_submit_work_log was just redefined above (create or replace) — its
-- original grant to anon + authenticated from migration.sql still holds,
-- Postgres doesn't reset grants on a function redefinition, but re-asserting
-- costs nothing and keeps this file runnable on its own if grants were ever
-- dropped.
grant execute on function ft_submit_work_log to anon, authenticated;
