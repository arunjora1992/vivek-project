const express = require("express");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";

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
      `INSERT INTO orders (id, party_name, mobile, address, delivery_date, delivery_time, priorities, notes, grand_total, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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

app.get("/api/orders", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, created_at, party_name, mobile, delivery_date, delivery_time, grand_total
       FROM orders ORDER BY created_at DESC LIMIT 50`
    );
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

app.get("/api/orders/export.csv", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.created_at, o.party_name, o.mobile, o.address,
              o.delivery_date, o.delivery_time, o.priorities, o.notes, o.grand_total,
              COALESCE((SELECT COUNT(*) FROM order_cement c WHERE c.order_id = o.id), 0) AS cement_lines,
              COALESCE((SELECT COUNT(*) FROM order_steel s  WHERE s.order_id = o.id), 0) AS steel_lines,
              COALESCE((SELECT COUNT(*) FROM order_addons a WHERE a.order_id = o.id), 0) AS addon_lines
       FROM orders o
       ORDER BY o.created_at DESC`
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="skt-orders-${new Date().toISOString().slice(0, 10)}.csv"`
    );

    const headers = [
      "id", "created_at", "party_name", "mobile", "address",
      "delivery_date", "delivery_time", "priorities", "notes",
      "grand_total", "cement_lines", "steel_lines", "addon_lines"
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
        csvEscape(row.delivery_date instanceof Date ? row.delivery_date.toISOString().slice(0, 10) : row.delivery_date),
        csvEscape(row.delivery_time),
        csvEscape((row.priorities || []).join("|")),
        csvEscape(row.notes),
        csvEscape(Number(row.grand_total).toFixed(2)),
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

app.get("/api/orders/export.pdf", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, created_at, party_name, mobile, delivery_date, delivery_time, priorities, grand_total
       FROM orders ORDER BY created_at DESC`
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="skt-orders-${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    doc.pipe(res);

    doc.fontSize(18).text("SKT Order Book — Order History", { align: "center" });
    doc.fontSize(10).fillColor("#666")
      .text(`Generated: ${new Date().toLocaleString("en-IN")}`, { align: "center" })
      .text(`Total orders: ${r.rows.length}`, { align: "center" });
    doc.moveDown();
    doc.fillColor("#000");

    const cols = [
      { label: "ID",       width: 95 },
      { label: "Created",  width: 95 },
      { label: "Party",    width: 110 },
      { label: "Mobile",   width: 70 },
      { label: "Delivery", width: 80 },
      { label: "Priority", width: 80 },
      { label: "Total (₹)", width: 80 },
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
    for (const row of r.rows) {
      const total = Number(row.grand_total) || 0;
      grand += total;
      drawRow([
        row.id,
        new Date(row.created_at).toLocaleDateString("en-IN"),
        row.party_name,
        row.mobile,
        new Date(row.delivery_date).toLocaleDateString("en-IN"),
        (row.priorities || []).join(", "),
        total.toFixed(2),
      ]);
    }

    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(12)
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

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders/:id/pdf", async (req, res) => {
  try {
    const order = await loadOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${order.id}.pdf"`
    );

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    doc.fontSize(20).text("SKT Order Book", { align: "center" });
    doc.fontSize(11).fillColor("#666").text("Construction Materials Order", { align: "center" });
    doc.moveDown();
    doc.fillColor("#000");

    doc.fontSize(12).text(`Order ID: ${order.id}`);
    doc.text(`Created: ${new Date(order.created_at).toLocaleString("en-IN")}`);
    doc.moveDown(0.5);

    doc.fontSize(14).text("Party Details", { underline: true });
    doc.fontSize(11)
      .text(`Name: ${order.party_name}`)
      .text(`Mobile: ${order.mobile}`)
      .text(`Address: ${order.address}`);
    doc.moveDown(0.5);

    doc.fontSize(14).text("Delivery", { underline: true });
    doc.fontSize(11)
      .text(`Date: ${new Date(order.delivery_date).toLocaleDateString("en-IN")}`)
      .text(`Time: ${order.delivery_time || "-"}`)
      .text(`Priority: ${(order.priorities || []).join(", ") || "-"}`);
    doc.moveDown(0.5);

    let grand = 0;
    const drawSection = (title, rows, cols) => {
      if (!rows.length) return;
      doc.fontSize(14).text(title, { underline: true });
      doc.fontSize(11);
      rows.forEach(r => {
        const qty = Number(r.qty);
        const rate = Number(r.rate);
        const amt = qty * rate;
        grand += amt;
        const left = cols.map(c => `${c.label}: ${r[c.field]}`).join("  ");
        doc.text(`${left}  Qty: ${qty}  Rate: ₹${rate}  Amount: ₹${amt.toFixed(2)}`);
      });
      doc.moveDown(0.5);
    };

    drawSection("Cement", order.cement, [
      { label: "Brand", field: "brand" },
      { label: "Type", field: "type" },
    ]);
    drawSection("Steel", order.steel, [
      { label: "Brand", field: "brand" },
      { label: "Size", field: "size" },
    ]);

    if (order.addons.length) {
      doc.fontSize(14).text("Add-ons", { underline: true });
      doc.fontSize(11);
      order.addons.forEach(a => {
        const qty = Number(a.qty);
        const rate = Number(a.rate);
        const amt = qty * rate;
        grand += amt;
        doc.text(`${a.addon_name}  Qty: ${qty}  Rate: ₹${rate}  Amount: ₹${amt.toFixed(2)}`);
      });
      doc.moveDown(0.5);
    }

    if (order.notes) {
      doc.fontSize(14).text("Notes", { underline: true });
      doc.fontSize(11).text(order.notes);
      doc.moveDown(0.5);
    }

    doc.moveDown();
    doc.fontSize(14).text(`Grand Total: ₹${grand.toFixed(2)}`, { align: "right" });

    doc.end();
  } catch (e) {
    console.error("PDF generation failed", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`SKT Order Book server listening on ${PORT}`);
});
