# SKT Order Book

Construction-materials ordering app (cement, steel, add-ons) with a marketplace-style UI, an Express + PostgreSQL backend, PDF export, optional Google Sheets dual-write, and Docker Compose deployment.

## Features

- Marketplace-style storefront UI (blue top bar, orange "Submit Order" CTA, product-card add-ons)
- Light / dark theme toggle (🌙 / ☀️ button in the header, persisted in `localStorage`, respects OS `prefers-color-scheme` on first load)
- Party / delivery / cement / steel / add-ons / notes form with live order summary
- Orders persisted to **PostgreSQL** (normalized tables for cement, steel, add-ons)
- Per-order **PDF download** (pdfkit) from the API
- Optional **dual-write to Google Sheets** via an Apps Script web app URL
- Order history panel sourced from the database, with a PDF button per order
- One-command deployment with **Docker Compose**

## Repository layout

```
.
├── public/                     # Frontend served by the API
│   ├── index.html
│   ├── app.js                  # Talks to the backend, no Google Sheets call from the browser
│   └── style.css               # Marketplace styling + dark theme
├── server/
│   ├── index.js                # Express API (orders, PDF, Sheets forwarder)
│   ├── package.json
│   ├── Dockerfile              # Node 20 alpine image (bundles public/)
│   └── db/
│       ├── init.sql            # Postgres schema, auto-run on first DB boot
│       └── Dockerfile          # Small postgres:16-alpine image with init.sql baked in (mode 0644)
├── docker-compose.yml          # db + app services
├── index.html, app.js, style.css, skt-order-book-master.html
│                               # Legacy single-page versions (still post directly to Google Sheets)
└── README.md
```

## API

| Method | Path                       | Description                                   |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/api/health`              | Liveness + DB ping                            |
| POST   | `/api/orders`              | Save an order; also forwards to Google Sheets if configured |
| GET    | `/api/orders`              | List the 50 most recent orders                |
| GET    | `/api/orders/:id`          | Fetch one order with its line items           |
| GET    | `/api/orders/:id/pdf`      | Download the order as a PDF                   |
| GET    | `/api/orders/export.csv`   | Download the entire order history as CSV      |
| GET    | `/api/orders/export.pdf`   | Download the entire order history as a PDF report |

`POST /api/orders` body:

```json
{
  "id": "SKT-...optional",
  "party": "Acme",
  "mobile": "9999999999",
  "address": "...",
  "deliveryDate": "2026-05-20",
  "deliveryTime": "09:00",
  "priorities": ["Urgent"],
  "cement": [{ "brand": "Ramco", "type": "OPC 53", "qty": 50, "rate": 410 }],
  "steel":  [{ "brand": "Tata Tiscon", "size": "12mm", "qty": 1.5, "rate": 65000 }],
  "addons": { "cb": { "qty": 0, "rate": 0 }, "vw": { "qty": 0, "rate": 0 }, "cp": { "qty": 0, "rate": 0 } },
  "notes": "Call before delivery"
}
```

## Database schema

`server/db/init.sql` defines four tables:

- `orders` — top-level order header (id, party, mobile, address, delivery date/time, priorities, notes, grand_total, raw JSONB)
- `order_cement` — cement line items (brand, type, qty, rate) FK → `orders.id`
- `order_steel` — steel line items (brand, size, qty, rate) FK → `orders.id`
- `order_addons` — add-on line items (key, name, qty, rate) FK → `orders.id`

Indexes on `created_at DESC` and `delivery_date`.

## Run with Docker Compose

```bash
docker compose up --build
```

- App: <http://localhost:3000>
- Postgres: `localhost:5432` (user `skt`, password `skt`, db `skt_orders`)

To override the Google Sheets endpoint (or disable it):

```bash
GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec" docker compose up --build
# or to disable:
GOOGLE_APPS_SCRIPT_URL="" docker compose up --build
```

> **Note on re-init**: the `init.sql` runs only on first boot of an empty data volume.
> If the DB volume was created before init succeeded, drop it before re-running:
>
> ```bash
> docker compose down -v
> docker compose up --build
> ```

## Local dev (without Docker)

Requires Node 20+ and a running PostgreSQL with the schema loaded.

```bash
cd server
npm install
PGHOST=localhost PGPORT=5432 PGUSER=skt PGPASSWORD=skt PGDATABASE=skt_orders \
GOOGLE_APPS_SCRIPT_URL="" \
node index.js
```

Open <http://localhost:3000>.

## Environment variables (server)

| Variable                  | Default     | Purpose                                   |
| ------------------------- | ----------- | ----------------------------------------- |
| `PORT`                    | `3000`      | HTTP port                                 |
| `PGHOST`                  | `db`        | Postgres host                             |
| `PGPORT`                  | `5432`      | Postgres port                             |
| `PGUSER`                  | `skt`       | Postgres user                             |
| `PGPASSWORD`              | `skt`       | Postgres password                         |
| `PGDATABASE`              | `skt_orders`| Postgres database                         |
| `GOOGLE_APPS_SCRIPT_URL`  | _(unset)_   | If set, every saved order is also POSTed there (best-effort, non-blocking) |

## PDF export

Each saved order can be downloaded as a PDF:

- **After submitting** — the "Download Last Order as PDF" button appears.
- **From history** — open the 📋 history panel and click "Download PDF" on any row.
- **Directly** — `GET /api/orders/:id/pdf` returns a `Content-Disposition: attachment` PDF.

### Bulk export

From the history panel, "Export CSV" and "Export PDF" download the **entire order history**:

- **CSV** (`/api/orders/export.csv`) — one row per order with id, timestamps, party, mobile, delivery date/time, priorities, notes, grand total, and per-section line counts. UTF-8 BOM included so Excel renders ₹ correctly.
- **PDF** (`/api/orders/export.pdf`) — landscape A4 tabular report with auto-pagination and a grand-total of grand-totals at the end.

The PDF includes party details, delivery schedule, priority, cement/steel/add-on line items, notes, and the grand total.

## Theming

Click the 🌙 / ☀️ icon in the header to switch between light (default) and dark themes. The choice is saved in `localStorage` under `skt_theme`. On first load, the app respects `prefers-color-scheme`. Themed via CSS custom properties on `:root` and `[data-theme="dark"]`.

## Legacy single-page version

The repo root still contains the original three-file (`index.html`, `style.css`, `app.js`) and single-file (`skt-order-book-master.html`) versions. These post directly to Google Apps Script (the constant near the top of `app.js`) and use `localStorage` for history. Useful as a zero-backend fallback; not used by the Docker stack.

## Repository

`git@github.com:arunjora1992/vivek-project.git`
