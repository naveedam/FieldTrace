-- ============================================================================
-- FieldTrace — Asset & Consumables Tracking Schema
-- Enterprise fitout / commercial leasing: zone + asset QR anchors
-- Target: Supabase (Postgres 15+, RLS on, Storage for photos)
--
-- NAMESPACING: every FieldTrace table, sequence, function, storage bucket,
-- and policy is prefixed ft_ / "ft-" so this can be run inside an existing
-- Supabase project (e.g. one already hosting a ResolveHub-style schema with
-- its own `assets`, `documents`, etc.) with zero name collisions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists ft_locations (
  location_id   text primary key,           -- e.g. 'KRM1' (short site code, used in QR ids)
  name           text not null,
  address        text,
  created_at     timestamptz not null default now()
);

create table if not exists ft_zones (
  zone_id        text primary key,           -- matches Zone QR payload, e.g. 'ZN-KRM1-F2-RESTROOM-N'
  location_id    text not null references ft_locations(location_id) on delete cascade,
  floor_level    text not null,              -- e.g. 'F2'
  zone_type      text not null check (zone_type in ('Washroom','DB Room','Bay','Meeting Room','Pantry','Lobby','Server Room')),
  tenant_name    text,                       -- nullable: shared/common-area zones have no tenant
  qr_code_url    text,                       -- public URL of generated QR image (Storage)
  created_at     timestamptz not null default now()
);

create table if not exists ft_assets (
  asset_id        text primary key,          -- matches Asset QR payload, e.g. 'FIT-CHAIR-04921'
  category        text not null check (category in ('Task Chair','AV Display','Pod','Meeting Table','Standing Desk','Sofa','Projector','Access Point','Other')),
  make_model      text,
  current_zone_id text references ft_zones(zone_id) on delete set null,
  status          text not null default 'Active' check (status in ('Active','Maintenance','Scrapped','Missing')),
  warranty_expiry date,
  unit_cost       numeric(12,2),
  qr_code_url     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists ft_parts_inventory (
  part_id        uuid primary key default gen_random_uuid(),
  location_id    text not null references ft_locations(location_id) on delete cascade,
  part_name      text not null,
  category       text not null check (category in ('Electrical','Plumbing','HVAC')),
  stock_on_hand  integer not null default 0 check (stock_on_hand >= 0),
  min_threshold  integer not null default 5,
  unit           text not null default 'pcs',
  created_at     timestamptz not null default now()
);

-- Sequence backing the human-facing receipt code (#REC-8492 style)
create sequence if not exists ft_work_log_receipt_seq start 1000;

create table if not exists ft_work_logs (
  log_id           uuid primary key default gen_random_uuid(),
  zone_id          text not null references ft_zones(zone_id) on delete restrict,
  asset_id         text references ft_assets(asset_id) on delete set null,
  logged_by_phone  text not null check (logged_by_phone ~ '^[0-9]{10}$'),
  issue_type       text not null check (issue_type in ('Part Replacement','Routine Inspection')),
  category         text check (category in ('Electrical','Plumbing','HVAC')),
  action_taken     text,
  parts_used_id    uuid references ft_parts_inventory(part_id),
  parts_quantity   integer default 0 check (parts_quantity >= 0),
  scrap_returned   boolean not null default false,
  photo_url        text,
  receipt_code     text unique not null default ('REC-' || nextval('ft_work_log_receipt_seq')::text),
  created_at       timestamptz not null default now()
);

create table if not exists ft_asset_transfers (
  transfer_id     uuid primary key default gen_random_uuid(),
  asset_id        text not null references ft_assets(asset_id) on delete cascade,
  from_zone_id    text references ft_zones(zone_id),
  to_zone_id      text not null references ft_zones(zone_id),
  transferred_by  text not null check (transferred_by ~ '^[0-9]{10}$'),
  note            text,
  timestamp       timestamptz not null default now()
);

create table if not exists ft_maintenance_tickets (
  ticket_id       uuid primary key default gen_random_uuid(),
  asset_id        text not null references ft_assets(asset_id) on delete cascade,
  zone_id         text not null references ft_zones(zone_id),
  defect_type     text not null,
  description     text,
  photo_url       text,
  reported_by     text not null check (reported_by ~ '^[0-9]{10}$'),
  status          text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_ft_zones_location on ft_zones(location_id);
create index if not exists idx_ft_assets_zone on ft_assets(current_zone_id);
create index if not exists idx_ft_parts_location on ft_parts_inventory(location_id);
create index if not exists idx_ft_worklogs_zone_created on ft_work_logs(zone_id, created_at desc);
create index if not exists idx_ft_worklogs_created on ft_work_logs(created_at desc);
create index if not exists idx_ft_transfers_asset on ft_asset_transfers(asset_id);
create index if not exists idx_ft_tickets_status on ft_maintenance_tickets(status);

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------
create or replace function ft_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ft_assets_updated_at on ft_assets;
create trigger trg_ft_assets_updated_at
  before update on ft_assets
  for each row execute function ft_set_updated_at();

-- ----------------------------------------------------------------------------
-- RPC FUNCTIONS (security definer)
-- Field devices are zero-login (anon key). We never let anon write stock
-- counts or asset locations directly — everything goes through an atomic,
-- validated function so a stray client bug or replay can't corrupt state.
-- ----------------------------------------------------------------------------

-- Submit a work log for a zone; if it's a part replacement, atomically
-- decrements inventory and requires the scrap-returned confirmation.
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
begin
  if p_issue_type = 'Part Replacement' then
    if p_parts_used_id is null or p_parts_quantity is null or p_parts_quantity <= 0 then
      raise exception 'Part and quantity are required for a part replacement log';
    end if;
    if not p_scrap_returned then
      raise exception 'Scrap-return confirmation is required for a part replacement log';
    end if;

    select stock_on_hand into v_stock from ft_parts_inventory where part_id = p_parts_used_id for update;
    if v_stock is null then
      raise exception 'Unknown part';
    end if;
    if v_stock < p_parts_quantity then
      raise exception 'Insufficient stock: % on hand, % requested', v_stock, p_parts_quantity;
    end if;

    update ft_parts_inventory
      set stock_on_hand = stock_on_hand - p_parts_quantity
      where part_id = p_parts_used_id;
  end if;

  insert into ft_work_logs (
    zone_id, asset_id, logged_by_phone, issue_type, category,
    action_taken, parts_used_id, parts_quantity, scrap_returned, photo_url
  ) values (
    p_zone_id, p_asset_id, p_logged_by_phone, p_issue_type, p_category,
    p_action_taken, p_parts_used_id, coalesce(p_parts_quantity, 0), coalesce(p_scrap_returned, false), p_photo_url
  )
  returning ft_work_logs.log_id, ft_work_logs.receipt_code into v_log_id, v_receipt;

  return query select v_log_id, v_receipt;
end;
$$;

-- Relocate an asset to a new zone; atomically updates the asset and writes
-- the audit trail row so history can never drift from current state.
create or replace function ft_transfer_asset(
  p_asset_id       text,
  p_to_zone_id     text,
  p_transferred_by text,
  p_note           text default null
) returns void
language plpgsql security definer as $$
declare
  v_from_zone text;
begin
  select current_zone_id into v_from_zone from ft_assets where asset_id = p_asset_id for update;
  if v_from_zone is null and not exists (select 1 from ft_assets where asset_id = p_asset_id) then
    raise exception 'Unknown asset';
  end if;
  if not exists (select 1 from ft_zones where zone_id = p_to_zone_id) then
    raise exception 'Unknown destination zone';
  end if;

  update ft_assets set current_zone_id = p_to_zone_id where asset_id = p_asset_id;

  insert into ft_asset_transfers (asset_id, from_zone_id, to_zone_id, transferred_by, note)
  values (p_asset_id, v_from_zone, p_to_zone_id, p_transferred_by, p_note);
end;
$$;

-- File a defect/repair ticket and flag the asset as under Maintenance.
create or replace function ft_report_asset_defect(
  p_asset_id     text,
  p_defect_type  text,
  p_description  text,
  p_photo_url    text,
  p_reported_by  text
) returns uuid
language plpgsql security definer as $$
declare
  v_zone text;
  v_ticket_id uuid;
begin
  select current_zone_id into v_zone from ft_assets where asset_id = p_asset_id;
  if v_zone is null then
    raise exception 'Asset has no current zone on file';
  end if;

  insert into ft_maintenance_tickets (asset_id, zone_id, defect_type, description, photo_url, reported_by)
  values (p_asset_id, v_zone, p_defect_type, p_description, p_photo_url, p_reported_by)
  returning ticket_id into v_ticket_id;

  update ft_assets set status = 'Maintenance' where asset_id = p_asset_id;

  return v_ticket_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Field app runs on the anon key with zero login, so:
--  - anon may READ ft_zones/ft_assets/ft_parts_inventory/ft_locations
--    (needed to resolve a scanned QR)
--  - anon may write logs/transfers/tickets ONLY via the RPCs above
--    (table-level INSERT/UPDATE grants to anon are revoked; RPCs run as
--    security definer and bypass RLS deliberately, under function-level checks)
--  - admin dashboard should run behind Supabase Auth using a service role
--    or an authenticated 'facility_manager' role for writes outside the RPCs
-- ----------------------------------------------------------------------------

alter table ft_locations enable row level security;
alter table ft_zones enable row level security;
alter table ft_assets enable row level security;
alter table ft_parts_inventory enable row level security;
alter table ft_work_logs enable row level security;
alter table ft_asset_transfers enable row level security;
alter table ft_maintenance_tickets enable row level security;

-- Public read access needed to resolve a scanned QR with no login
drop policy if exists ft_anon_read_locations on ft_locations;
create policy ft_anon_read_locations on ft_locations for select using (true);

drop policy if exists ft_anon_read_zones on ft_zones;
create policy ft_anon_read_zones on ft_zones for select using (true);

drop policy if exists ft_anon_read_assets on ft_assets;
create policy ft_anon_read_assets on ft_assets for select using (true);

drop policy if exists ft_anon_read_parts on ft_parts_inventory;
create policy ft_anon_read_parts on ft_parts_inventory for select using (true);

-- Logs/transfers/tickets: readable by authenticated facility staff (admin
-- dashboard) only. Field writes happen exclusively through the RPCs, which
-- run as SECURITY DEFINER and therefore bypass these SELECT-only policies.
drop policy if exists ft_staff_read_work_logs on ft_work_logs;
create policy ft_staff_read_work_logs on ft_work_logs for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_transfers on ft_asset_transfers;
create policy ft_staff_read_transfers on ft_asset_transfers for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_read_tickets on ft_maintenance_tickets;
create policy ft_staff_read_tickets on ft_maintenance_tickets for select using (auth.role() = 'authenticated');

drop policy if exists ft_staff_write_tickets on ft_maintenance_tickets;
create policy ft_staff_write_tickets on ft_maintenance_tickets for update using (auth.role() = 'authenticated');

-- Lock down direct table writes for anon/authenticated; everything mutating
-- state goes through the RPC functions above.
revoke insert, update, delete on ft_locations, ft_zones, ft_assets, ft_parts_inventory,
  ft_work_logs, ft_asset_transfers, ft_maintenance_tickets from anon, authenticated;
grant select on ft_locations, ft_zones, ft_assets, ft_parts_inventory to anon, authenticated;
grant select on ft_work_logs, ft_asset_transfers, ft_maintenance_tickets to authenticated;

grant execute on function ft_submit_work_log to anon, authenticated;
grant execute on function ft_transfer_asset to anon, authenticated;
grant execute on function ft_report_asset_defect to anon, authenticated;

-- ----------------------------------------------------------------------------
-- STORAGE
-- Dedicated, prefixed public bucket for field photo evidence (forced
-- live-camera captures) — namespaced so it can't collide with a bucket an
-- existing project (e.g. ResolveHub's `documents` storage) already uses.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ft-incident-proofs', 'ft-incident-proofs', true)
on conflict (id) do nothing;

drop policy if exists "ft public read incident-proofs" on storage.objects;
create policy "ft public read incident-proofs" on storage.objects
  for select using (bucket_id = 'ft-incident-proofs');

drop policy if exists "ft anon upload incident-proofs" on storage.objects;
create policy "ft anon upload incident-proofs" on storage.objects
  for insert with check (bucket_id = 'ft-incident-proofs');

-- ============================================================================
-- SEED DATA
-- 1 location, 4 zones, 10 assets, 5 spare-part lines
-- ============================================================================

insert into ft_locations (location_id, name, address) values
  ('KRM1', 'Koramangala Business Park — Tower 1', '7th Block, Koramangala, Bengaluru')
on conflict (location_id) do nothing;

insert into ft_zones (zone_id, location_id, floor_level, zone_type, tenant_name) values
  ('ZN-KRM1-F2-RESTROOM-N', 'KRM1', 'F2', 'Washroom',      null),
  ('ZN-KRM1-F2-DBROOM-01',  'KRM1', 'F2', 'DB Room',       null),
  ('ZN-KRM1-F3-BAY-A',      'KRM1', 'F3', 'Bay',           'Nimbus Analytics'),
  ('ZN-KRM1-F3-MEET-201',   'KRM1', 'F3', 'Meeting Room',  'Nimbus Analytics')
on conflict (zone_id) do nothing;

insert into ft_assets (asset_id, category, make_model, current_zone_id, status, warranty_expiry, unit_cost) values
  ('FIT-CHAIR-04921', 'Task Chair',   'Herman Miller Aeron',      'ZN-KRM1-F3-BAY-A',    'Active', '2027-03-01', 68000),
  ('FIT-CHAIR-04922', 'Task Chair',   'Herman Miller Aeron',      'ZN-KRM1-F3-BAY-A',    'Active', '2027-03-01', 68000),
  ('FIT-CHAIR-04923', 'Task Chair',   'Featherlite Ergo',         'ZN-KRM1-F3-BAY-A',    'Active', '2026-11-15', 24000),
  ('FIT-CHAIR-04924', 'Task Chair',   'Featherlite Ergo',         'ZN-KRM1-F3-MEET-201', 'Active', '2026-11-15', 24000),
  ('FIT-CHAIR-04925', 'Task Chair',   'Featherlite Ergo',         'ZN-KRM1-F3-MEET-201', 'Maintenance', '2026-11-15', 24000),
  ('FIT-AV-01187',    'AV Display',   'Samsung QM75B 75in',       'ZN-KRM1-F3-MEET-201', 'Active', '2028-01-20', 185000),
  ('FIT-AV-01188',    'Projector',    'Epson EB-2250U',           'ZN-KRM1-F3-BAY-A',    'Active', '2026-06-10', 92000),
  ('FIT-POD-00341',   'Pod',          'Framery One',              'ZN-KRM1-F3-BAY-A',    'Active', '2029-01-01', 410000),
  ('FIT-DESK-02210',  'Standing Desk','UpDown Pro',                'ZN-KRM1-F3-BAY-A',    'Active', '2027-08-01', 31000),
  ('FIT-AP-00552',    'Access Point', 'Cisco Meraki MR46',        'ZN-KRM1-F2-DBROOM-01','Active', '2026-12-31', 18500)
on conflict (asset_id) do nothing;

insert into ft_parts_inventory (location_id, part_name, category, stock_on_hand, min_threshold, unit) values
  ('KRM1', '18W LED Downlight',        'Electrical', 42, 15, 'pcs'),
  ('KRM1', 'LED Driver 18-24W',        'Electrical', 18, 10, 'pcs'),
  ('KRM1', 'Cistern Inlet Valve',      'Plumbing',    9,  5, 'pcs'),
  ('KRM1', 'Concealed Flush Cistern',  'Plumbing',    4,  3, 'pcs'),
  ('KRM1', 'AC Return-Air Filter 24x24','HVAC',       12,  6, 'pcs')
on conflict do nothing;
