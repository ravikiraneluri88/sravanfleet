# RouteLedger / Sravan Fleet Portal

A dependency-free logistics operations workspace for Sravan Shipping Services. In local mode, open `index.html` in a modern browser; no build step or package install is required. Optional Supabase Auth and cloud persistence are available once configured.

## Workspace

- **Overview** provides dispatch KPIs, latest activity and shortcuts in an operations-dashboard layout.
- **Create LR** keeps the existing live lorry receipt form and preview, including the company logo, A4 landscape print sizing, four LR copies and terms pages.
- **LR history** stores up to 100 generated receipts and supports search by LR number, customer, route or vehicle plus a current-month filter.
- **Saved LRs** keeps generated receipts available in a dedicated reprint view, with direct Open and Print / PDF actions.
- **Customers** and **Vehicles & drivers** are local master-data registers with add, edit, delete and search flows.
- **Company profile** stores local document/workspace preferences.

## Storage, backup and privacy

Without Supabase configuration, data stays in this browser's `localStorage`. In **Settings**, use **Download backup** regularly; **Import backup** merges records and does not remove existing records. Keep the downloaded backup somewhere safe before changing browser profiles or enabling cloud sync.

When cloud mode is configured, sign-in uses Supabase Auth and each account's datasets sync to the `routeledger_data` table. Row Level Security restricts rows to their authenticated owner. The first account on a browser merges and uploads its existing local records; signing in later as a different account loads that account's cloud data instead. This initial version isolates data by user account; accounts do not automatically share a company workspace.

## Enable login and cloud storage

1. Create a Supabase project and keep its database password private.
2. In the Supabase SQL Editor, run the complete `supabase-setup.sql` file.
3. In **Project Settings → API**, copy the **Project URL** and **publishable/anon key** into `supabase-config.js` as `url` and `anonKey`. These browser values are public by design and are protected by Auth and RLS; **never** put a `service_role` or secret key in this repository.
4. In Supabase **Authentication → URL Configuration**, set the deployed site URL and add its URL to the allowed redirect URLs. Enable email/password sign-in. If email confirmations are enabled, complete the confirmation email before signing in.
5. Before first cloud sign-in, export a JSON backup under Settings. Sign up using the portal. With an empty cloud account, existing local records are merged and synced. Confirm that LRs, customers, locations, vehicles, jobs and settings appear before relying on cloud storage.
6. Deploy the static files (`index.html`, `app.js`, `styles.css`, `logo.jpg`, `supabase-config.js`) to a static host such as Cloudflare Pages or Vercel. No build command is needed; use the repository root as the site directory. `supabase-setup.sql` is setup material and does not need to be served.

Local records remain cached in the browser for offline resilience. Cloud sync errors are shown in Settings and queued datasets retry on the next successful sign-in. Keep separate backups; Supabase project/database backups are configured in the Supabase dashboard and depend on the selected plan.

## Print workflow

Complete the required LR fields, then use **Print / PDF**. To print later, open **Saved LRs** and select **Print / PDF** beside any saved receipt. LRs print in A4 landscape with compact margins, a fitted table and footer, and an isolated document layout so dashboard and navigation content do not create blank output pages.
