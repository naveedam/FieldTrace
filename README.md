# FieldTrace

Mobile-first PWA for tracking physical assets and consumable parts across leased,
multi-tenant fitout floors using QR field anchors. Two zero-login field workflows
(zone servicing, asset audit/move) plus an authenticated facility-manager dashboard.

## Stack

- React 18 + Vite + Tailwind CSS, `react-router-dom`, `lucide-react`
- Supabase: Postgres + Row Level Security + Storage (`incident-proofs` bucket)
- `qrcode.react` for print-ready QR tags (Asset Provisioning, zone tags)
- `vite-plugin-pwa` for installable, offline-shell PWA behavior

## 1. Provision Supabase

Every FieldTrace object — tables, sequence, functions, storage bucket, RLS
policies — is prefixed `ft_` / `ft-`, so this is safe to run inside an
**existing** Supabase project that already hosts other apps/schemas (e.g. one
with its own `assets`, `documents`, `cases` tables). Nothing in this
migration can collide with an unrelated schema unless it also happens to use
the `ft_` prefix.

1. Use an existing Supabase project, or create a new one.
2. Open the SQL editor and run `supabase/migration.sql` in full. It creates
   `ft_locations`, `ft_zones`, `ft_assets`, `ft_parts_inventory`,
   `ft_work_logs`, `ft_asset_transfers`, `ft_maintenance_tickets`, RLS
   policies, the `ft_submit_work_log` / `ft_transfer_asset` /
   `ft_report_asset_defect` RPC functions, the public `ft-incident-proofs`
   storage bucket, and seed data (1 location, 4 zones, 10 assets, 5
   spare-part lines).
3. Create at least one Supabase Auth user (email/password) for facility
   managers — the `/admin` dashboard is gated behind Supabase Auth and RLS
   checks `auth.role() = 'authenticated'` for reading logs/transfers/tickets.
   That auth setup is shared across every app in the project, so if you
   already have Supabase Auth users from another product in this project,
   they can sign in to `/admin` too.

## 2. Configure the app

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Project Settings → API in your Supabase dashboard
```

## 3. Admin Management Module (migration 002)

`supabase/migration_002_admin.sql` adds staff management and a storekeeper
approval gate on top of the base schema. Run it in the SQL editor after
`migration.sql`, against the same project.

**New tables:** `ft_personnel` (name, phone, role, agency/vendor, active
flag) and `ft_personnel_site_assignments` (which sites each person can work).
`ft_work_logs` gets a `personnel_id` link — populated automatically by phone
number match when a technician submits a log — plus `gate_status`,
`gate_approved_by`, `gate_approved_at`.

**Behavior change worth knowing about:** in the base schema,
`ft_submit_work_log` decremented `stock_on_hand` the moment a technician
submitted a Part Replacement log. This migration moves that deduction to a
new `ft_approve_work_log(receipt_code, approved_by)` function, called from
the new Storekeeper Gate — stock now only moves once a storekeeper looks up
the receipt code, checks the scrap photo, and taps Approve. A technician's
submission still requires the scrap-return checkbox and creates the receipt
code exactly as before; it just no longer touches inventory by itself. If
you'd rather keep instant deduction at submission, don't run this migration's
`ft_submit_work_log` redefinition (or revert to the version in `migration.sql`).

**New admin tabs:**
- **Sites & Spaces** (`/admin/sites`) — add a location, drill into its zones
  by floor, and "Quick-add zones" to bulk-create a standard set of rooms
  (Restroom N/S, DB Main, Pantry, Meeting Room, Open Bay) with generated QR
  slugs in one action via `ft_quick_add_zones`.
- **Personnel** (`/admin/personnel`) — staff table with role badges, assigned
  sites, and an active/inactive toggle. "Add staff" validates the phone
  number client-side before calling `ft_add_personnel`.
- **Storekeeper Gate** (`/admin/gate`) — search a receipt code, review part,
  quantity, zone, technician, and scrap photo, then Approve to deduct stock.
  All three tabs sit behind the same Supabase Auth login as the rest of
  `/admin` — there's no separate zero-login kiosk mode for storekeepers in
  this build. As of migration 002, `ft_approve_work_log` still took an
  `approved_by` parameter the client passed as `null`; **migration 003
  replaces this with a proper `auth.uid()`-based mapping — see below.**

**Gap that existed at this point, since closed:** Quick-add zones fixed bulk
zone creation, but there was still no admin UI for registering a new *asset*
before printing its tag — the old `/admin/qr-batch` generated asset QR codes
as pure labels without inserting a row in `ft_assets`, so a freshly printed
tag for an unregistered ID would correctly show "not recognized." **Migration
003's Asset Provisioning / Register & Print flow (below) closes this loop —
every printed asset tag now corresponds to a row inserted in the same action.**

## 5. Asset Provisioning, Inventory Ledger, Auth↔Personnel (migration 003)

`supabase/migration_003_provisioning.sql` adds the following. Run it after
`migration.sql` and `migration_002_admin.sql`, same project.

> **Naming note:** the product brief for this migration referred to a
> `ft_sites` table. This schema's site table is `ft_locations` (from
> `migration.sql`) — there's no separate `ft_sites`. `app_url` is added to
> `ft_locations`.

**Asset Provisioning replaces QR Batch.** The old `/admin/qr-batch` page
printed QR labels without touching the database — that's what caused the
"asset tag not recognized" scan you hit earlier. It's now `/admin/provisioning`
("Asset Provisioning" in the nav), and the primary flow is **Register &
Print**: pick a site + zone + category + count, click **Create & Print**, and
`ft_register_assets(...)`:
1. finds the next free serial for that category (scans existing `FIT-<PREFIX>-NNNNN`
   IDs site-wide and continues the sequence — so it picks up correctly from
   your existing seed data like `FIT-CHAIR-04921...04925`),
2. inserts one real `ft_assets` row per unit, assigned to the chosen zone,
3. stamps `qr_code_url` using the *site's* `app_url` (see below) — not a
   manually typed URL,
4. returns the inserted rows, which is the only data the printable sheet is
   ever built from.

The page shows the resulting ID range (`FIT-CHAIR-04922 → FIT-CHAIR-04933`)
and a `"N assets registered and QR sheet generated."` toast before you print.
Every tag that comes off this flow corresponds to a live `ft_assets` row —
scanning it will resolve. A secondary "Print a zone tag" section stays on the
same page for reprinting a tag for a zone that already exists (zones
themselves are created under Sites & Spaces, not here).

**Sites own the production URL.** `ft_locations.app_url` holds each site's
domain (e.g. `https://fieldtrace.vercel.app`). Asset Provisioning and zone
tag printing both read it from the selected site — there's no editable URL
field left in the UI. Set it once per site under **Sites & Spaces** (Add
Location now has an App URL field; existing sites — including your KRM1 from
before this migration — get one via the new **Edit** button). Provisioning
is blocked with an explicit error until a site has an `app_url` set.

**Inventory ledger.** Every Storekeeper Gate approval now writes a row to
`ft_inventory_txn` (`transaction_type='ISSUE'`, `part_id`, `quantity`,
`work_log_id`, `approved_by`, `created_at`) in the same transaction as the
`stock_on_hand` decrement — the approval flow itself is unchanged from
migration 002, this just adds the audit trail alongside it. `transaction_type`
also allows `RESTOCK`/`ADJUSTMENT` for when you add stock-in or manual
correction flows later; nothing writes those yet.

**Auth ↔ Personnel mapping.** `ft_personnel.auth_user_id` links a row to a
Supabase Auth user. `ft_approve_work_log` no longer takes a `p_approved_by`
parameter (the client used to pass `null`) — it now derives the approver from
`auth.uid()` server-side. For that to resolve to an actual name, someone
signed into `/admin` needs to link their login to their personnel record
first: on the **Personnel** tab, a row without a linked login shows a
**"This is me"** button (calls `ft_claim_personnel`), which is a one-time,
self-service claim — it refuses to link a login to more than one person, or
to a row someone else already claimed. Until a storekeeper does that, their
approvals still record a raw `auth.uid()` in `gate_approved_by_auth_uid` /
`ft_inventory_txn.approved_by_auth_uid`, so the audit trail is never fully
anonymous — it just won't show a friendly name until claimed.

## 6. Floor Plan Import & Pin Tagging (migration 004)

`supabase/migration_004_floorplans.sql` adds a third way to get assets into
`ft_assets`, inside the same Asset Provisioning page: upload a floor plan,
click to drop a pin per asset or asset group, then register everything at
once. Run it after migrations 1–3, same project.

**Format reality check, before you use this:** true DWG (native AutoCAD)
parsing isn't something this does or realistically could do without a paid
Autodesk Platform Services integration — that's a separate product decision,
not something bolted onto this app. What it does support is a **PDF or
image export** of a floor plan (from AutoCAD, Revit, SketchUp, or anything
else) — which is universal because every CAD tool can produce one. If you
upload a PDF, the browser rasterizes page 1 to a PNG client-side before
upload (via `pdfjs-dist`, dynamic-imported only when a PDF is actually
selected — see the bundle note below); images upload as-is. Either way, a
floor plan always ends up stored as a plain image, so the rest of the app
never has to think about file format again.

**Flow:** Asset Provisioning → "Import floor plan & tag assets" → pick a
site + floor label → upload → click anywhere on the rendered plan to open a
pin form (zone, category, make/model, quantity) → repeat for every asset or
asset group → review the pending-tags list (each pin shows as an amber
marker; anything missing a zone is flagged) → **Create & Print** registers
every pending tag through `ft_register_floor_plan_tags`, which reuses the
exact same serial-allocation logic as the plain Register & Print flow (see
`ft_allocate_and_insert_assets`, factored out in this migration so both
paths share one source of truth for "what's the next free ID"). Registered
pins turn green and lock — you can revisit a floor plan later and keep
adding new pins without touching what's already registered.

`ft_assets` also gained `floor_plan_id`, `pos_x`, `pos_y` (nullable) —
assets registered via a pin carry their exact placement on the plan, so a
future "map view" could plot them; assets from the plain Register & Print
flow leave these null since there's no plan to place them on.

**Bundle size note:** `pdfjs-dist` (~2.5MB combined with its worker) is
excluded from the PWA's install-time precache and only fetched the first
time an admin actually uploads a PDF (`vite.config.js`'s `workbox.globIgnores`
+ a `CacheFirst` runtime-caching rule) — a field technician scanning zone
and asset tags all day never downloads it. If you add more admin-only heavy
dependencies later, follow the same pattern: dynamic `import()` at the call
site, not a static import, and exclude the resulting chunk from precache.

## 7. Client Portal (migration 005)

`supabase/migration_005_client_portal.sql` adds a read-only, magic-link
portal you can hand to a tenant or client after a site goes live: a curated
before/after photo gallery and the asset register (category, make/model,
status, warranty — deliberately **not** unit cost) for exactly the zones
you choose to share. Run it after migrations 1–4, same project.

> **Naming note:** same as migration 003 — the "site" table here is
> `ft_locations`, not a separate `ft_sites`.

**This is the first external-facing surface in the app.** Every other
external-facing thing here (the zone/asset scan flows) is zero-login and
safe to be zero-login, because there's nothing sensitive behind a scan
beyond a work-order form for one zone. A client portal exposes a real asset
register, so it's gated differently: a long, unguessable, individually
revocable token (`ft_client_shares.access_token`), not by anyone finding the
URL pattern. There's still no login for the client — the link itself is the
credential, consistent with the zero-login philosophy everywhere else in
this app — but unlike a QR code, it's created and revoked deliberately by
your team, one share at a time, scoped to specific zones.

**Why zones, not the whole site:** a single site can have multiple tenants
on different floors (see the seed data — `ZN-KRM1-F3-BAY-A` and
`ZN-KRM1-F3-MEET-201` belong to Nimbus Analytics, `ZN-KRM1-F2-*` doesn't
belong to anyone). A share pins an explicit list of `zone_id`s at creation
time (`ft_client_share_zones`), so Tenant A can never see what's installed
on Tenant B's floor in the same building, and adding a new zone to the site
later doesn't silently widen an existing share.

**Flow:**
- Admin: **Client Portal** tab \u2192 pick a site \u2192 **Create share** \u2192 select the
  zones to include \u2192 get a link to send the client. **Add photo** to upload
  curated Before/After shots (a plain file picker, not the field app's
  forced-camera capture \u2014 these are meant to be professional handover
  photography, not live evidence).
- Client: opens `/portal/:token` \u2014 no login, no app. Sees the before/after
  gallery and the full asset register for their zones, grouped by category,
  with a **Print / Save as PDF** button for anyone who wants a physical or
  emailable copy.
- Revoking a share (the **Revoke** button) is immediate \u2014
  `ft_get_client_portal` checks `revoked = false` on every request, so a
  revoked link stops working on the client's very next page load, not
  eventually.

**Everything routes through one validated RPC.** `ft_get_client_portal(token)`
is the only way an anonymous visitor reads any of this data \u2014 it's granted
to `anon`, but it validates the token and scopes every query to that share's
pinned zones inside the function itself, then returns one composite `jsonb`
payload (site info, zones, assets, photos). There's no direct anon `SELECT`
grant on `ft_client_shares`, `ft_assets`, or `ft_site_photos` \u2014 the RPC is
the only door in, which keeps this consistent with every other write/read
path in this app that touches anon access.

## 8. Run

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

Deploy the contents of `dist/` to any static host (Vercel, Netlify, Cloudflare
Pages). It's a PWA — on a phone, "Add to Home Screen" gives a zero-install app
icon that opens straight into camera-scan workflows.

## How the QR routing works

Every physical sticker encodes a URL to the single `/scan` route with query
params, e.g.:

- Zone: `https://yourapp.com/scan?type=zone&id=ZN-KRM1-F2-RESTROOM-N`
- Asset: `https://yourapp.com/scan?type=asset&id=FIT-CHAIR-04921`

`src/pages/Scan.jsx` reads `type`/`id` and renders the matching workflow — no
login, no menu, camera opens directly into the right form. Generate a full
batch of these (with printable QR images) from `/admin/provisioning`.

## Why writes go through RPCs, not direct table access

Field devices authenticate with the Supabase anon key and never log in. To
avoid a compromised or buggy client corrupting stock counts or asset
locations, the anon/authenticated roles have **no direct INSERT/UPDATE grant**
on `ft_assets`, `ft_parts_inventory`, `ft_work_logs`, `ft_asset_transfers`, or
`ft_maintenance_tickets`. All three field mutations happen inside
`SECURITY DEFINER` Postgres functions that validate input and run atomically:

- `ft_submit_work_log(...)` — validates the scrap-return confirmation and
  stock availability, decrements `ft_parts_inventory.stock_on_hand`, and
  writes the work log in one transaction. Returns a generated receipt code
  (`REC-####`) for the technician to hand the storekeeper.
- `ft_transfer_asset(...)` — updates `ft_assets.current_zone_id` and appends
  the audit row to `ft_asset_transfers` atomically, so history can never
  drift from current state.
- `ft_report_asset_defect(...)` — files a `ft_maintenance_tickets` row and
  flips the asset's `status` to `Maintenance`.

## High-burn alert heuristic

`/admin/dashboard`'s alert panel flags any zone whose share of site-wide
part-replacement volume over the trailing 30 days exceeds 5% (defined in
`WINDOW_DAYS` / `BURN_THRESHOLD` in `src/pages/admin/Dashboard.jsx`). That's a
proxy for "this floor is burning through consumables disproportionately" —
either a genuine electrical/plumbing fault cluster or a leakage pattern worth
a site visit. Both the window and threshold are constants you'll likely want
to tune against real consumption data, or swap for a rate normalized against
each zone's asset count once you have more history.

## Camera-only photo capture

`PhotoCapture` uses `<input type="file" accept="image/*" capture="environment">`.
On iOS Safari and Android Chrome this opens the live camera directly rather
than a gallery/file picker, which is what prevents a technician from
submitting a stock photo instead of live evidence. It's a UX-level control,
not a cryptographic guarantee — pair it with the receipt-code /
storekeeper-confirmation loop for the parts that actually move.

## Project structure

```
supabase/
  migration.sql                Base schema, RLS, RPCs, seed data
  migration_002_admin.sql      Personnel, site assignments, storekeeper gate
  migration_003_provisioning.sql  Asset Provisioning, inventory ledger, auth↔personnel, site app_url
  migration_004_floorplans.sql    Floor plan import + pin tagging, ft_allocate_and_insert_assets refactor
  migration_005_client_portal.sql Magic-link client portal, before/after photos
src/
  lib/supabaseClient.js       Client + incident-photo + floor-plan + site-photo upload helpers
  lib/toast.jsx                Toast notification system
  lib/assetCategories.js      Shared category → ID prefix map
  lib/imageDimensions.js      Lightweight image dimension reader (no pdfjs dependency)
  lib/pdfRender.js            PDF page 1 → PNG rasterization (dynamic-imported only, see above)
  hooks/useOnlineStatus.js
  components/                 ErrorBoundary, PhotoCapture, Modal/Drawer, Skeleton, TagCard, shared UI kit
  pages/
    Landing.jsx
    Scan.jsx                  Dispatches ?type=zone|asset
    ZoneScan.jsx               Workflow A
    AssetScan.jsx               Workflow B (identity card, relocate, defect)
    ClientPortalView.jsx        Public /portal/:token — before/after + asset register, no login
    admin/
      AdminLayout.jsx           Auth gate + nav shell
      Dashboard.jsx             Burn alerts, consumables tally, tickets
      Reconciliation.jsx        Zone/tenant filter + exit-audit CSV export
      Provisioning.jsx          Asset Provisioning: Register & Print, floor plan import, zone tag printing
      FloorPlanImport.jsx       Upload + click-to-tag canvas + bulk register
      Sites.jsx                 Locations (incl. app_url), zone drill-down, quick-add zones
      Personnel.jsx             Staff table, add staff, claim login, active/inactive toggle
      Gate.jsx                  Storekeeper receipt lookup + approve/deduct
      ClientPortal.jsx          Manage shares + upload before/after photos
```
