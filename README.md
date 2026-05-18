# SKT Order Book

Construction-materials ordering app: a static UI (cement, steel, add-ons, history) backed by an Express + PostgreSQL API with PDF export.

## Architecture

- `public/` – served frontend (HTML / CSS / JS) that talks to the API
- `server/` – Node.js + Express API
  - `POST /api/orders` – save an order
  - `GET  /api/orders` – list recent orders
  - `GET  /api/orders/:id` – fetch one order
  - `GET  /api/orders/:id/pdf` – download an order as PDF
  - `GET  /api/health`
- `server/db/init.sql` – PostgreSQL schema (auto-run on first container start)
- `docker-compose.yml` – brings up `db` (PostgreSQL 16) and `app` (Node server)

The legacy single-page versions are still in the repo root: `index.html`, `style.css`, `app.js`, `skt-order-book-master.html`.

## Run with Docker Compose

```bash
docker compose up --build
```

Then open http://localhost:3000.

PostgreSQL is exposed on `localhost:5432` (user `skt`, password `skt`, db `skt_orders`).

## Local dev (no Docker)

```bash
cd server
npm install
PGHOST=localhost PGUSER=skt PGPASSWORD=skt PGDATABASE=skt_orders node index.js
```

## PDF export

Each saved order can be downloaded as a PDF via the “Download PDF” button in the history panel, or “Download Last Order as PDF” after submission.
