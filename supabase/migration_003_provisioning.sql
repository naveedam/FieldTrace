-- ============================================================================
-- FieldTrace — Migration 003: Asset Provisioning, Inventory Ledger,
-- Auth↔Personnel mapping, Site-owned production URL
-- Run this AFTER migration.sql and migration_002_admin.sql, same project.
--
-- Naming note: the product brief refers to a `ft_sites` table for the
-- app_url column. This schema's site table is `ft_locations` (created in
-- migration.sql) — there's no separate `ft_sites`. The app_url column below
-- is added to `ft_locations`, which is the "site" table in this schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4. SITES OWN THE PRODUCTION URL
-- ----------------------------------------------------------------------------
alter table ft_locations add column if not exists app_url text;

comment on column ft_locations.app_url is
  'Production URL this site''s QR codes resolve to, e.g. https://fieldtrace.vercel.app. Set once per site — Asset Provisioning and zone tag printing read it from here instead of a manually typed field.';

-- ft_add_location now also takes the site's app_url. Signature is changing
-- (new parameter), so drop before recreating rather than CREATE OR REPLACE,
-- which won't let a function's argument list change in place.
drop function if exists ft_add_location(text, text, text);

create or replace function ft_add_location(
  p_location_id text,
  p_name        text,
  p_address     text,
  p_app_url     text default null
) returns void
language plpgsql security definer as $$
begin
  if exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Site code % already exists', p_location_id;
  end if;
  insert into ft_locations (location_id, name, address, app_url) values (p_location_id, p_name, p_address, p_app_url);
end;
$$;

-- New: edit an existing site (needed since sites created before this
-- migration — like your existing KRM1 — won't have an app_url yet).
create or replace function ft_update_location(
  p_location_id text,
  p_name        text,
  p_address     text,
  p_app_url     text
) returns void
language plpgsql security definer as $$
begin
  if not exists (select 1 from ft_locations where location_id = p_location_id) then
    raise exception 'Unknown site %', p_location_id;
  end if;
  update ft_locations set name = p_name, address = p_address, app_url = p_app_url where location_id = p_location_id;
end;
$$;

grant execute on function ft_add_location to authenticated;
grant execute on function ft_update_location to authenticated;

-- ----------------------------------------------------------------------------
-- 1. ASSET PROVISIONING — Register & Print
-- Allocates the next serial(s) for a category, inserts real ft_assets rows
-- assigned to the chosen zone, and stamps qr_code_url using the owning
-- site's app_url. The printable sheet is only ever built from rows this
-- function actually returns, so a printed tag can never outrun a real record.
-- ----------------------------------------------------------------------------
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

  -- Next serial = 1 + highest existing numeric suffix for this prefix,
  -- site-wide (not per-zone), so IDs stay globally unique and sequential
  -- per category the way the original seed data (FIT-CHAIR-04921...) does.
  select coalesce(max((regexp_match(asset_id, '(\d+)$'))[1]::integer), 0)
    into v_max
    from ft_assets
    where asset_id like 'FIT-' || upper(p_id_prefix) || '-%';

  v_next := v_max + 1;

  for i in 0 .. (p_count - 1) loop
    v_asset_id := 'FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + i)::text, 5, '0');
    insert into ft_assets (asset_id, category, make_model, current_zone_id, status, warranty_expiry, unit_cost, qr_code_url)
    values (
      v_asset_id, p_category, p_make_model, p_zone_id, 'Active', p_warranty_expiry, p_unit_cost,
      rtrim(v_app_url, '/') || '/scan?type=asset&id=' || v_asset_id
    );
  end loop;

  return query
    select * from ft_assets
    where asset_id between ('FIT-' || upper(p_id_prefix) || '-' || lpad(v_next::text, 5, '0'))
                        and ('FIT-' || upper(p_id_prefix) || '-' || lpad((v_next + p_count - 1)::text, 5, '0'))
    order by asset_id;
end;
$$;

grant execute on function ft_register_assets to authenticated;

-- ----------------------------------------------------------------------------
-- 3. AUTH ↔ PERSONNEL MAPPING
-- Lets a signed-in Supabase Auth user (email-based, used for /admin login)
-- be linked to a ft_personnel row (phone-based, used for field submissions),
-- so approvals/audit trails can record the real actor instead of null.
-- ----------------------------------------------------------------------------
alter table ft_personnel add column if not exists auth_user_id uuid references auth.users(id);
create unique index if not exists uq_ft_personnel_auth_user on ft_personnel(auth_user_id) where auth_user_id is not null;

-- Self-service claim: a signed-in admin/storekeeper links themselves to a
-- pre-existing personnel row (created ahead of time by an FM). Prevents
-- claiming a row someone else already claimed, and claiming more than one
-- row with the same login.
create or replace function ft_claim_personnel(
  p_personnel_id uuid
) returns void
language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to claim a personnel record';
  end if;
  if exists (select 1 from ft_personnel where auth_user_id = auth.uid()) then
    raise exception 'Your login is already linked to a personnel record';
  end if;
  if exists (select 1 from ft_personnel where personnel_id = p_personnel_id and auth_user_id is not null) then
    raise exception 'This personnel record is already linked to a different login';
  end if;

  update ft_personnel set auth_user_id = auth.uid() where personnel_id = p_personnel_id;
end;
$$;

grant execute on function ft_claim_personnel to authenticated;

-- ----------------------------------------------------------------------------
-- 2. INVENTORY LEDGER
-- Every stock movement gets an auditable row. For now the only writer is
-- ft_approve_work_log's ISSUE at storekeeper approval, but transaction_type
-- allows RESTOCK/ADJUSTMENT to be added later without a schema change.
-- ----------------------------------------------------------------------------
create table if not exists ft_inventory_txn (
  txn_id             uuid primary key default gen_random_uuid(),
  transaction_type   text not null check (transaction_type in ('ISSUE','RESTOCK','ADJUSTMENT')),
  part_id            uuid not null references ft_parts_inventory(part_id),
  quantity           integer not null check (quantity > 0),
  work_log_id        uuid references ft_work_logs(log_id),
  approved_by        uuid references ft_personnel(personnel_id),
  approved_by_auth_uid uuid, -- raw auth.uid() fallback, kept even if approved_by has no personnel match
  created_at         timestamptz not null default now()
);

create index if not exists idx_ft_inventory_txn_part on ft_inventory_txn(part_id, created_at desc);
create index if not exists idx_ft_inventory_txn_worklog on ft_inventory_txn(work_log_id);

alter table ft_inventory_txn enable row level security;

drop policy if exists ft_staff_read_inventory_txn on ft_inventory_txn;
create policy ft_staff_read_inventory_txn on ft_inventory_txn for select using (auth.role() = 'authenticated');

revoke insert, update, delete on ft_inventory_txn from anon, authenticated;
grant select on ft_inventory_txn to authenticated;

-- ft_work_logs also needs a raw-auth fallback alongside gate_approved_by,
-- for the same reason ft_inventory_txn.approved_by_auth_uid exists.
alter table ft_work_logs add column if not exists gate_approved_by_auth_uid uuid;

-- ----------------------------------------------------------------------------
-- ft_approve_work_log — redefined:
--   • derives the approver from auth.uid() instead of a p_approved_by param
--     the client used to pass as null
--   • writes the ft_inventory_txn ISSUE row inside the same transaction as
--     the stock decrement, so stock can never change without a ledger entry
-- Signature is changing (dropping p_approved_by), so drop before recreate.
-- ----------------------------------------------------------------------------
drop function if exists ft_approve_work_log(text, uuid);

create or replace function ft_approve_work_log(
  p_receipt_code text
) returns void
language plpgsql security definer as $$
declare
  v_log record;
  v_stock integer;
  v_personnel_id uuid;
begin
  select personnel_id into v_personnel_id from ft_personnel where auth_user_id = auth.uid();

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

  insert into ft_inventory_txn (transaction_type, part_id, quantity, work_log_id, approved_by, approved_by_auth_uid)
  values ('ISSUE', v_log.parts_used_id, v_log.parts_quantity, v_log.log_id, v_personnel_id, auth.uid());

  update ft_work_logs
    set gate_status = 'Approved',
        gate_approved_by = v_personnel_id,
        gate_approved_by_auth_uid = auth.uid(),
        gate_approved_at = now()
    where log_id = v_log.log_id;
end;
$$;

grant execute on function ft_approve_work_log to authenticated;
