CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    party_name      TEXT NOT NULL,
    mobile          TEXT NOT NULL,
    address         TEXT NOT NULL,
    delivery_date   DATE NOT NULL,
    delivery_time   TEXT,
    priorities      TEXT[] NOT NULL DEFAULT '{}',
    notes           TEXT,
    grand_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    delivered       BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    raw             JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS order_cement (
    id          SERIAL PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    brand       TEXT NOT NULL,
    type        TEXT NOT NULL,
    qty         NUMERIC(12,2) NOT NULL,
    rate        NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_steel (
    id          SERIAL PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    brand       TEXT NOT NULL,
    size        TEXT NOT NULL,
    qty         NUMERIC(12,2) NOT NULL,
    rate        NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_addons (
    id          SERIAL PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    addon_key   TEXT NOT NULL,
    addon_name  TEXT NOT NULL,
    qty         NUMERIC(12,2) NOT NULL,
    rate        NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
