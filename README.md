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
| GET    | `/api/orders`              | List orders. Query: `q`, `status=pending\|delivered`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `limit` (default 100, max 500) |
| GET    | `/api/orders/:id`          | Fetch one order with its line items           |
| GET    | `/api/orders/:id/pdf`      | Download the order as a PDF. Query `copy=office\|party\|both` (default `both`) |
| GET    | `/api/orders/export.csv`   | Bulk CSV export (respects the same filter query params as `/api/orders`) |
| GET    | `/api/orders/export.pdf`   | Bulk PDF report (respects the same filter query params)               |
| PATCH  | `/api/orders/:id/delivered`| Mark an order as delivered / not delivered (`{ "delivered": true }`) |

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

## Deploy with Docker Desktop (Windows / macOS)

Step-by-step setup for someone running the project on Docker Desktop:

### 1. Install Docker Desktop

- Download from <https://www.docker.com/products/docker-desktop/> and install for your OS.
- Launch Docker Desktop and wait until the whale icon in the tray/menu bar shows **"Engine running"**.
- Verify from a terminal (PowerShell, Command Prompt, Terminal, or iTerm):
  ```bash
  docker --version
  docker compose version
  ```

### 2. Get the code

```bash
git clone git@github.com:arunjora1992/vivek-project.git
cd vivek-project
```

> Don't have SSH set up with GitHub? Use HTTPS instead:
> `git clone https://github.com/arunjora1992/vivek-project.git`

### 3. (Optional) Configure shop letterhead + Google Sheets

Copy the example env file and edit the values you care about (shop name, GSTIN, phone, address, optional Apps Script URL):

```bash
cp .env.example .env
# then edit .env in any editor
```

Docker Compose picks up `.env` automatically. Skip this step if you're fine with the defaults.

### 4. Build and start the stack

```bash
docker compose up --build -d
```

What this does:

- Builds two images: `skt-db` (Postgres 16 with `init.sql` baked in) and `skt-app` (Node 20 + Express).
- Starts both containers in the background (`-d`).
- The `db` service runs the schema on first start; the `app` service waits until the DB healthcheck passes, then applies the idempotent `delivered` / `gst_number` column migrations.

You'll see the new containers in Docker Desktop under **Containers** → **vivek-project** (compose project name). Expand the project to see `skt-db` and `skt-app` running.

### 5. Open the app

<http://localhost:3000>

API health probe: <http://localhost:3000/api/health> should return `{"status":"ok"}`.

### 6. (Optional) Seed demo orders

With the stack running:

```bash
# macOS / Linux / WSL
./scripts/seed-orders.sh

# Windows PowerShell — run via the running app container instead:
docker compose exec app sh -c 'apk add --no-cache bash >/dev/null 2>&1 || true'
docker compose cp scripts/seed-orders.sh app:/tmp/seed.sh
docker compose exec app sh /tmp/seed.sh http://localhost:3000
```

Six demo orders appear in the history panel; two are pre-marked as Delivered.

### 7. Day-to-day commands

| Action                                   | Command                                            |
| ---------------------------------------- | -------------------------------------------------- |
| Tail logs (both services)                | `docker compose logs -f`                           |
| Tail just the app                        | `docker compose logs -f app`                       |
| Restart after code changes               | `docker compose up --build -d`                     |
| Stop the stack (keeps the DB volume)     | `docker compose stop`                              |
| Stop and remove containers (keeps data)  | `docker compose down`                              |
| Wipe everything incl. DB data            | `docker compose down -v`                           |
| psql shell into Postgres                 | `docker compose exec db psql -U skt -d skt_orders` |
| Shell into the app container             | `docker compose exec app sh`                       |

All of these are also available as buttons in Docker Desktop:

- **Containers tab** → click the project → use the ▶ / ⏹ / 🗑 controls.
- **Containers tab** → click a container → **Logs** / **Exec** / **Files** tabs.
- **Volumes tab** → find `vivek-project_skt_pgdata` → use 🗑 to wipe DB data.

### 8. Troubleshooting

- **Port 3000 or 5432 already in use** — another app on your machine is bound to those ports. Either stop that app, or change the host-side port in `docker-compose.yml` (e.g. `"3001:3000"`) and reopen the app on the new port.
- **App container restarts in a loop with a DB error** — open `docker compose logs db`; if you see "Permission denied" on `init.sql`, rebuild the DB image with `docker compose build db`. (The repo already bakes the file into the image to avoid host-permission issues.)
- **`docker compose down -v` warning** — confirms you're wiping the Postgres volume. Only do this if you don't need the saved orders.
- **WSL 2 errors on Windows** — Docker Desktop needs WSL 2 enabled. Open Docker Desktop → Settings → General → "Use the WSL 2 based engine" should be on, then restart Docker Desktop.

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
| `SHOP_NAME`               | `SKT Order Book` | Letterhead — shop / business name             |
| `SHOP_TAGLINE`            | `Construction Materials — Cement & Steel` | Letterhead tagline |
| `SHOP_ADDRESS`            | `—`         | Letterhead address                            |
| `SHOP_PHONE`              | `—`         | Letterhead phone                              |
| `SHOP_EMAIL`              | _(unset)_   | Letterhead email                              |
| `SHOP_GSTIN`              | _(unset)_   | Shop GSTIN printed on PDFs                    |

## PDF export

Each saved order can be downloaded as a PDF:

- **After submitting** — the "Download Last Order as PDF" button appears.
- **From history** — open the 📋 history panel and click "Download PDF" on any row.
- **Directly** — `GET /api/orders/:id/pdf` returns a `Content-Disposition: attachment` PDF.
- **Letterhead** — each PDF carries a branded header (blue banner, yellow logo tile, shop name/tagline, address/phone/email/GSTIN) configured via the `SHOP_*` env vars. By default the endpoint returns **two pages — Office Copy then Party Copy**. Use `?copy=office` or `?copy=party` to fetch just one.

### Search + filter in history

The history panel has a search box (party / mobile / order ID), a Pending/Delivered chip filter, and a date range. Filters are applied server-side via `GET /api/orders` query params (`q`, `status`, `from`, `to`) — the bulk **Export CSV / PDF** buttons reuse the same filters, so you can download exactly the slice you're viewing.

### Inline validation

Required fields highlight with a red border and a per-field message instead of toast-only errors. The Party GSTIN field validates against the 15-character GSTIN pattern when filled.

### Bulk export

From the history panel, "Export CSV" and "Export PDF" download the **entire order history**:

- **CSV** (`/api/orders/export.csv`) — one row per order with id, timestamps, party, mobile, delivery date/time, priorities, notes, grand total, and per-section line counts. UTF-8 BOM included so Excel renders ₹ correctly.
- **PDF** (`/api/orders/export.pdf`) — landscape A4 tabular report with auto-pagination and a grand-total of grand-totals at the end.

The PDF includes party details, delivery schedule, priority, cement/steel/add-on line items, notes, and the grand total.

## Delivery status

Each row in the history panel has a toggle switch to mark the order as **Delivered** or **Pending**. Toggling calls `PATCH /api/orders/:id/delivered`, which updates `orders.delivered` and stamps `orders.delivered_at`. Delivered rows get a green left accent in the panel.

The `delivered` and `delivered_at` columns are added automatically on server start via an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration, so existing database volumes don't need to be re-initialised.

## Theming

Click the 🌙 / ☀️ icon in the header to switch between light (default) and dark themes. The choice is saved in `localStorage` under `skt_theme`. On first load, the app respects `prefers-color-scheme`. Themed via CSS custom properties on `:root` and `[data-theme="dark"]`.

## Legacy single-page version

The repo root still contains the original three-file (`index.html`, `style.css`, `app.js`) and single-file (`skt-order-book-master.html`) versions. These post directly to Google Apps Script (the constant near the top of `app.js`) and use `localStorage` for history. Useful as a zero-backend fallback; not used by the Docker stack.

## Repository

`git@github.com:arunjora1992/vivek-project.git`
