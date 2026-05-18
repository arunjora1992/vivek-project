const express = require("express");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

const SHOP = {
  name:    process.env.SHOP_NAME    || "SKT Order Book",
  tagline: process.env.SHOP_TAGLINE || "Construction Materials – Cement & Steel",
  address: process.env.SHOP_ADDRESS || "—",
  phone:   process.env.SHOP_PHONE   || "—",
  email:   process.env.SHOP_EMAIL   || "",
  gstin:   process.env.SHOP_GSTIN   || "",
};

async function forwardToGoogleSheet(payload) {
  if (!GOOGLE_APPS_SCRIPT_URL) return;
  try {
    const r = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.warn(`[sheets] non-OK response: ${r.status}`);
    }
  } catch (err) {
    console.warn(`[sheets] forward failed: ${err.message}`);
  }
}

const pool = new Pool({
  host: process.env.PGHOST || "db",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "skt",
  password: process.env.PGPASSWORD || "skt",
  database: process.env.PGDATABASE || "skt_orders",
  max: 10,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

async function runStartupMigrations() {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivered    BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS gst_number   TEXT
  `);
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

function calcGrandTotal(order) {
  let total = 0;
  (order.cement || []).forEach(c => { total += (+c.qty || 0) * (+c.rate || 0); });
  (order.steel || []).forEach(s => { total += (+s.qty || 0) * (+s.rate || 0); });
  Object.values(order.addons || {}).forEach(a => { total += (+a.qty || 0) * (+a.rate || 0); });
  return total;
}

const ADDON_NAMES = { cb: "Cover Box", vw: "VNC Wire", cp: "Concrete Pai" };

app.post("/api/orders", async (req, res) => {
  const order = req.body;
  if (!order || !order.party || !order.mobile || !order.address || !order.deliveryDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = order.id || "SKT-" + Date.now();
  const grandTotal = calcGrandTotal(order);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO orders (id, party_name, mobile, address, delivery_date, delivery_time, priorities, notes, grand_total, gst_number, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        order.party,
        order.mobile,
        order.address,
        order.deliveryDate,
        order.deliveryTime || null,
        order.priorities || [],
        order.notes || null,
        grandTotal,
        order.gstNumber || null,
        order,
      ]
    );

    for (const c of order.cement || []) {
      await client.query(
        `INSERT INTO order_cement (order_id, brand, type, qty, rate) VALUES ($1,$2,$3,$4,$5)`,
        [id, c.brand, c.type, c.qty, c.rate]
      );
    }
    for (const s of order.steel || []) {
      await client.query(
        `INSERT INTO order_steel (order_id, brand, size, qty, rate) VALUES ($1,$2,$3,$4,$5)`,
        [id, s.brand, s.size, s.qty, s.rate]
      );
    }
    for (const [key, a] of Object.entries(order.addons || {})) {
      if ((+a.qty || 0) > 0 && (+a.rate || 0) > 0) {
        await client.query(
          `INSERT INTO order_addons (order_id, addon_key, addon_name, qty, rate) VALUES ($1,$2,$3,$4,$5)`,
          [id, key, ADDON_NAMES[key] || key, a.qty, a.rate]
        );
      }
    }

    await client.query("COMMIT");

    forwardToGoogleSheet({ ...order, id, grandTotal });

    res.json({ id, grandTotal });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("POST /api/orders failed", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { q, status, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const where = [];
    const params = [];

    if (q && String(q).trim()) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(`(party_name ILIKE $${i} OR mobile ILIKE $${i} OR id ILIKE $${i})`);
    }
    if (status === "delivered") where.push("delivered = TRUE");
    else if (status === "pending") where.push("delivered = FALSE");

    if (from) { params.push(from); where.push(`delivery_date >= $${params.length}`); }
    if (to)   { params.push(to);   where.push(`delivery_date <= $${params.length}`); }

    const sql =
      `SELECT id, created_at, party_name, mobile, delivery_date, delivery_time,
              grand_total, delivered, delivered_at, gst_number
       FROM orders
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY created_at DESC
       LIMIT ${limit}`;

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildOrdersFilter(req) {
  const { q, status, from, to } = req.query;
  const where = [];
  const params = [];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    const i = params.length;
    where.push(`(party_name ILIKE $${i} OR mobile ILIKE $${i} OR id ILIKE $${i})`);
  }
  if (status === "delivered") where.push("delivered = TRUE");
  else if (status === "pending") where.push("delivered = FALSE");
  if (from) { params.push(from); where.push(`delivery_date >= $${params.length}`); }
  if (to)   { params.push(to);   where.push(`delivery_date <= $${params.length}`); }
  return { whereSql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

app.get("/api/orders/export.csv", async (req, res) => {
  try {
    const { whereSql, params } = buildOrdersFilter(req);
    const r = await pool.query(
      `SELECT o.id, o.created_at, o.party_name, o.mobile, o.address,
              o.delivery_date, o.delivery_time, o.priorities, o.notes, o.grand_total,
              o.delivered, o.delivered_at, o.gst_number,
              COALESCE((SELECT COUNT(*) FROM order_cement c WHERE c.order_id = o.id), 0) AS cement_lines,
              COALESCE((SELECT COUNT(*) FROM order_steel s  WHERE s.order_id = o.id), 0) AS steel_lines,
              COALESCE((SELECT COUNT(*) FROM order_addons a WHERE a.order_id = o.id), 0) AS addon_lines
       FROM orders o
       ${whereSql}
       ORDER BY o.created_at DESC`,
      params
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="skt-orders-${new Date().toISOString().slice(0, 10)}.csv"`
    );

    const headers = [
      "id", "created_at", "party_name", "mobile", "address", "gst_number",
      "delivery_date", "delivery_time", "priorities", "notes",
      "grand_total", "status", "delivered_at",
      "cement_lines", "steel_lines", "addon_lines"
    ];
    res.write("﻿"); // BOM so Excel picks up UTF-8
    res.write(headers.join(",") + "\n");
    for (const row of r.rows) {
      res.write([
        csvEscape(row.id),
        csvEscape(new Date(row.created_at).toISOString()),
        csvEscape(row.party_name),
        csvEscape(row.mobile),
        csvEscape(row.address),
        csvEscape(row.gst_number),
        csvEscape(row.delivery_date instanceof Date ? row.delivery_date.toISOString().slice(0, 10) : row.delivery_date),
        csvEscape(row.delivery_time),
        csvEscape((row.priorities || []).join("|")),
        csvEscape(row.notes),
        csvEscape(Number(row.grand_total).toFixed(2)),
        csvEscape(row.delivered ? "Delivered" : "Pending"),
        csvEscape(row.delivered_at ? new Date(row.delivered_at).toISOString() : ""),
        csvEscape(row.cement_lines),
        csvEscape(row.steel_lines),
        csvEscape(row.addon_lines),
      ].join(",") + "\n");
    }
    res.end();
  } catch (e) {
    console.error("CSV export failed", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders/export.pdf", async (req, res) => {
  try {
    const { whereSql, params } = buildOrdersFilter(req);
    const r = await pool.query(
      `SELECT id, created_at, party_name, mobile, delivery_date, delivery_time,
              priorities, grand_total, delivered, delivered_at
       FROM orders ${whereSql} ORDER BY created_at DESC`,
      params
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="skt-orders-${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    doc.pipe(res);

    drawLetterhead(doc, "Order History Report");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor("#545454")
      .text(`Generated: ${new Date().toLocaleString("en-IN")}`)
      .text(`Total orders: ${r.rows.length}`);
    doc.moveDown(0.5);
    doc.fillColor("#000");

    const cols = [
      { label: "ID",        width: 90 },
      { label: "Created",   width: 75 },
      { label: "Party",     width: 100 },
      { label: "Mobile",    width: 65 },
      { label: "Delivery",  width: 70 },
      { label: "Priority",  width: 70 },
      { label: "Status",    width: 70 },
      { label: "Total (₹)", width: 70 },
    ];
    const startX = doc.x;
    let y = doc.y;

    function drawRow(values, opts = {}) {
      const bold = !!opts.bold;
      doc.fontSize(9);
      if (bold) doc.font("Helvetica-Bold"); else doc.font("Helvetica");
      let x = startX;
      cols.forEach((c, i) => {
        doc.text(values[i] == null ? "" : String(values[i]), x + 3, y + 3, {
          width: c.width - 6,
          ellipsis: true,
          lineBreak: false,
        });
        doc.rect(x, y, c.width, 18).strokeColor("#cccccc").stroke();
        x += c.width;
      });
      y += 18;
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
        drawRow(cols.map(c => c.label), { bold: true });
      }
    }

    drawRow(cols.map(c => c.label), { bold: true });
    let grand = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    for (const row of r.rows) {
      const total = Number(row.grand_total) || 0;
      grand += total;
      if (row.delivered) deliveredCount++; else pendingCount++;
      drawRow([
        row.id,
        new Date(row.created_at).toLocaleDateString("en-IN"),
        row.party_name,
        row.mobile,
        new Date(row.delivery_date).toLocaleDateString("en-IN"),
        (row.priorities || []).join(", "),
        row.delivered ? "Delivered" : "Pending",
        total.toFixed(2),
      ]);
    }

    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(11)
      .text(`Delivered: ${deliveredCount}   |   Pending: ${pendingCount}`, { align: "right" });
    doc.fontSize(12)
      .text(`Grand Total (all orders): ₹${grand.toFixed(2)}`, { align: "right" });

    doc.end();
  } catch (e) {
    console.error("PDF history export failed", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

async function loadOrder(id) {
  const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (orderRes.rowCount === 0) return null;
  const order = orderRes.rows[0];
  const [cement, steel, addons] = await Promise.all([
    pool.query(`SELECT brand, type, qty, rate FROM order_cement WHERE order_id = $1`, [id]),
    pool.query(`SELECT brand, size, qty, rate FROM order_steel WHERE order_id = $1`, [id]),
    pool.query(`SELECT addon_key, addon_name, qty, rate FROM order_addons WHERE order_id = $1`, [id]),
  ]);
  return {
    ...order,
    cement: cement.rows,
    steel: steel.rows,
    addons: addons.rows,
  };
}

app.patch("/api/orders/:id/delivered", async (req, res) => {
  const { delivered } = req.body || {};
  if (typeof delivered !== "boolean") {
    return res.status(400).json({ error: "delivered must be a boolean" });
  }
  try {
    const r = await pool.query(
      `UPDATE orders
         SET delivered = $1,
             delivered_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING id, delivered, delivered_at`,
      [delivered, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function drawLetterhead(doc, label) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const innerW = pageW - margin * 2;

  doc.save();
  doc.rect(margin, margin, innerW, 70).fill("#2874F0");
  doc.fillColor("#FFC200").rect(margin, margin + 70, innerW, 4).fill();
  doc.restore();

  doc.save();
  doc.fillColor("#FFC200").rect(margin + 10, margin + 12, 46, 46).fill();
  doc.fillColor("#131921").fontSize(28).font("Helvetica-Bold")
    .text("S", margin + 22, margin + 18, { lineBreak: false });
  doc.restore();

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18)
    .text(SHOP.name, margin + 66, margin + 14, { lineBreak: false });
  doc.font("Helvetica").fontSize(10).fillColor("#E3F2FD")
    .text(SHOP.tagline, margin + 66, margin + 36, { lineBreak: false });

  const rightX = margin + innerW - 200;
  doc.font("Helvetica").fontSize(9).fillColor("#ffffff");
  doc.text(SHOP.address, rightX, margin + 12, { width: 200, align: "right" });
  const phoneEmail = [SHOP.phone, SHOP.email].filter(Boolean).join("  |  ");
  if (phoneEmail) doc.text(phoneEmail, rightX, margin + 36, { width: 200, align: "right" });
  if (SHOP.gstin) doc.text(`GSTIN: ${SHOP.gstin}`, rightX, margin + 50, { width: 200, align: "right" });

  doc.fillColor("#000");
  doc.y = margin + 90;

  if (label) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#FB641B")
      .text(label.toUpperCase(), { align: "right" });
    doc.fillColor("#000");
    doc.moveDown(0.3);
  }
}

function drawFooter(doc) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = doc.page.margins.left;
  doc.save();
  doc.fontSize(8).fillColor("#878787")
    .text(
      `${SHOP.name} • Computer-generated document • ${new Date().toLocaleString("en-IN")}`,
      margin,
      pageH - 30,
      { width: pageW - margin * 2, align: "center" }
    );
  doc.restore();
}

function drawOrderPage(doc, order, label) {
  drawLetterhead(doc, label);

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(14).text("Order Receipt");
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#545454");
  doc.text(`Order ID: ${order.id}`);
  doc.text(`Created: ${new Date(order.created_at).toLocaleString("en-IN")}`);
  doc.text(`Status: ${order.delivered ? "Delivered" : "Pending"}${order.delivered && order.delivered_at ? "  (" + new Date(order.delivered_at).toLocaleString("en-IN") + ")" : ""}`);
  doc.fillColor("#000");
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(11).text("Party Details");
  doc.font("Helvetica").fontSize(10)
    .text(`Name: ${order.party_name}`)
    .text(`Mobile: ${order.mobile}`)
    .text(`Address: ${order.address}`);
  if (order.gst_number) doc.text(`Party GSTIN: ${order.gst_number}`);
  doc.moveDown(0.4);

  doc.font("Helvetica-Bold").fontSize(11).text("Delivery");
  doc.font("Helvetica").fontSize(10)
    .text(`Date: ${new Date(order.delivery_date).toLocaleDateString("en-IN")}`)
    .text(`Time: ${order.delivery_time || "-"}`)
    .text(`Priority: ${(order.priorities || []).join(", ") || "-"}`);
  doc.moveDown(0.6);

  let grand = 0;
  const rowsToDraw = [];
  (order.cement || []).forEach(c => rowsToDraw.push({
    item: `Cement — ${c.brand} ${c.type}`,
    qty: Number(c.qty),
    unit: "Bags",
    rate: Number(c.rate),
  }));
  (order.steel || []).forEach(s => rowsToDraw.push({
    item: `Steel — ${s.brand} ${s.size}`,
    qty: Number(s.qty),
    unit: "Ton",
    rate: Number(s.rate),
  }));
  (order.addons || []).forEach(a => rowsToDraw.push({
    item: `Add-on — ${a.addon_name}`,
    qty: Number(a.qty),
    unit: "Nos",
    rate: Number(a.rate),
  }));

  const tableX = doc.page.margins.left;
  const tableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = [tableW - 270, 60, 50, 80, 80];
  let y = doc.y;

  doc.save();
  doc.rect(tableX, y, tableW, 20).fill("#F1F3F6");
  doc.fillColor("#212121").font("Helvetica-Bold").fontSize(10);
  doc.text("Item",       tableX + 6,                                y + 5, { width: colW[0] - 12 });
  doc.text("Qty",        tableX + colW[0] + 6,                      y + 5, { width: colW[1] - 12, align: "right" });
  doc.text("Unit",       tableX + colW[0] + colW[1] + 6,            y + 5, { width: colW[2] - 12 });
  doc.text("Rate (₹)",   tableX + colW[0] + colW[1] + colW[2] + 6,  y + 5, { width: colW[3] - 12, align: "right" });
  doc.text("Amount (₹)", tableX + colW[0] + colW[1] + colW[2] + colW[3] + 6, y + 5, { width: colW[4] - 12, align: "right" });
  doc.restore();
  y += 20;

  doc.font("Helvetica").fontSize(10).fillColor("#212121");
  rowsToDraw.forEach((r, i) => {
    const amt = r.qty * r.rate;
    grand += amt;
    if (i % 2 === 1) {
      doc.save(); doc.rect(tableX, y, tableW, 18).fill("#FAFAFA"); doc.restore();
    }
    doc.fillColor("#212121");
    doc.text(r.item,                          tableX + 6,                                          y + 4, { width: colW[0] - 12, ellipsis: true, lineBreak: false });
    doc.text(String(r.qty),                   tableX + colW[0] + 6,                                y + 4, { width: colW[1] - 12, align: "right" });
    doc.text(r.unit,                          tableX + colW[0] + colW[1] + 6,                      y + 4, { width: colW[2] - 12 });
    doc.text(r.rate.toFixed(2),               tableX + colW[0] + colW[1] + colW[2] + 6,            y + 4, { width: colW[3] - 12, align: "right" });
    doc.text(amt.toFixed(2),                  tableX + colW[0] + colW[1] + colW[2] + colW[3] + 6,  y + 4, { width: colW[4] - 12, align: "right" });
    y += 18;
  });

  doc.y = y + 8;
  doc.moveTo(tableX, doc.y).lineTo(tableX + tableW, doc.y).strokeColor("#BDBDBD").stroke();
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#388E3C")
    .text(`Grand Total: ₹${grand.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { align: "right" });
  doc.fillColor("#000");

  if (order.notes) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(11).text("Notes");
    doc.font("Helvetica").fontSize(10).text(order.notes);
  }

  doc.moveDown(2);
  doc.font("Helvetica").fontSize(9).fillColor("#545454")
    .text("Received in good condition.", { continued: false });
  doc.moveDown(2);
  const sigY = doc.y;
  doc.moveTo(tableX, sigY).lineTo(tableX + 180, sigY).strokeColor("#BDBDBD").stroke();
  doc.moveTo(tableX + tableW - 180, sigY).lineTo(tableX + tableW, sigY).stroke();
  doc.fontSize(9).fillColor("#878787")
    .text("Receiver Signature", tableX, sigY + 4)
    .text("Authorised Signatory", tableX + tableW - 180, sigY + 4, { width: 180, align: "right" });
  doc.fillColor("#000");

  drawFooter(doc);
}

app.get("/api/orders/:id/pdf", async (req, res) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });

    const copy = String(req.query.copy || "both").toLowerCase();
    const copies =
      copy === "office" ? ["Office Copy"] :
      copy === "party"  ? ["Party Copy"]  :
                          ["Office Copy", "Party Copy"];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${order.id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    copies.forEach((label, i) => {
      if (i > 0) doc.addPage();
      drawOrderPage(doc, order, label);
    });

    doc.end();
  } catch (e) {
    console.error("PDF generation failed", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

runStartupMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SKT Order Book server listening on ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup migration failed", err);
    process.exit(1);
  });
