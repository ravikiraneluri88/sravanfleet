# RouteLedger / Sravan Fleet Portal

A dependency-free, frontend-only logistics operations workspace for Sravan Shipping Services. Open `index.html` directly in a modern browser; no build step or package install is required.

## Workspace

- **Overview** provides dispatch KPIs, latest activity and shortcuts in an operations-dashboard layout.
- **Create LR** keeps the existing live lorry receipt form and preview, including the company logo, A4 landscape print sizing, four LR copies and terms pages.
- **LR history** stores up to 100 generated receipts and supports search by LR number, customer, route or vehicle plus a current-month filter.
- **Customers** and **Vehicles & drivers** are local master-data registers with add, edit, delete and search flows.
- **Company profile** stores local document/workspace preferences.

## Storage and privacy

All data is persisted in browser `localStorage` under `routeledger-lrs`, `routeledger-customers`, `routeledger-vehicles` and `routeledger-settings`. Nothing is sent to a server. Clearing site data or using “Clear history” removes the corresponding local records.

## Print workflow

Complete the required LR fields, then use **Print / PDF**. The browser print dialog produces the existing A4 landscape batch: consignor, consignee, transporter and office copies, each followed by its terms-and-conditions page.
