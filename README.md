# FieldTrace

Mobile-first PWA for tracking physical assets and consumable parts across leased,
multi-tenant fitout floors using QR field anchors. Two zero-login field workflows
(zone servicing, asset audit/move) plus an authenticated facility-manager dashboard.

## Stack

- React 18 + Vite + Tailwind CSS, `react-router-dom`, `lucide-react`
- Supabase: Postgres + Row Level Security + Storage (`incident-proofs` bucket)
- `qrcode.react` for the print-ready QR batch generator
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

## 3. Run

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
batch of these (with printable QR images) from `/admin/qr-batch`.

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
supabase/migration.sql        Full schema, RLS, RPCs, seed data
src/
  lib/supabaseClient.js       Client + incident-photo upload helper
  lib/toast.jsx                Toast notification system
  hooks/useOnlineStatus.js
  components/                 ErrorBoundary, PhotoCapture, shared UI kit
  pages/
    Landing.jsx
    Scan.jsx                  Dispatches ?type=zone|asset
    ZoneScan.jsx               Workflow A
    AssetScan.jsx               Workflow B (identity card, relocate, defect)
    admin/
      AdminLayout.jsx           Auth gate + nav shell
      Dashboard.jsx             Burn alerts, consumables tally, tickets
      Reconciliation.jsx        Zone/tenant filter + exit-audit CSV export
      QRGenerator.jsx           Print-ready QR batch generator
```
