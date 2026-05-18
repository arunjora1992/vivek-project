// ═══════════════════════════════════════════════════════════
// SKT ORDER BOOK - APPLICATION LOGIC (Backend + PostgreSQL)
// ═══════════════════════════════════════════════════════════

const API_BASE = ""; // same origin

// ─── DATA ───
const CEMENT_BRANDS = ["Maha", "Dalmia", "Ramco", "Ultratech", "Zuari", "Chettinad", "Priya"];
const CEMENT_TYPES = ["OPC 53", "OPC 43", "PPC", "PSC"];
const STEEL_BRANDS = ["Apollo", "Tata Tiscon", "JSW Neosteel", "SAIL", "Kamachi", "Rathi"];
const STEEL_SIZES = ["8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "32mm"];

let cementItems = [];
let steelItems = [];
let lastOrderId = null;

// ─── INIT ───
document.addEventListener("DOMContentLoaded", () => {
  setupPriorityChips();
  setupAddons();
  setupValidationListeners();
  setupHistoryFilters();
  setDefaultDateTime();
  syncThemeButton();
  addCementRow();
  addSteelRow();
  renderSummary();
});

// ─── VALIDATION ───
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/;

function setFieldError(id, message) {
  const errEl = document.getElementById(`error-${id}`);
  const inputEl = document.getElementById(id);
  if (errEl) errEl.textContent = message || "";
  if (inputEl) inputEl.classList.toggle("has-error", !!message);
  return !message;
}

function clearAllErrors() {
  document.querySelectorAll(".field-error").forEach(el => (el.textContent = ""));
  document.querySelectorAll(".has-error").forEach(el => el.classList.remove("has-error"));
  document.querySelectorAll(".priority-group.has-error").forEach(el => el.classList.remove("has-error"));
}

function validateField(id) {
  const el = document.getElementById(id);
  if (!el) return true;
  const v = (el.value || "").trim();
  switch (id) {
    case "partyName":
      return setFieldError(id, v ? "" : "Party name is required");
    case "mobile":
      if (!v) return setFieldError(id, "Mobile is required");
      if (!/^\d{10}$/.test(v)) return setFieldError(id, "Enter a 10-digit mobile number");
      return setFieldError(id, "");
    case "address":
      return setFieldError(id, v ? "" : "Delivery address is required");
    case "deliveryDate":
      return setFieldError(id, v ? "" : "Delivery date is required");
    case "gstNumber":
      if (!v) return setFieldError(id, "");
      return setFieldError(id, GSTIN_RE.test(v.toUpperCase()) ? "" : "Invalid GSTIN format (15 chars, e.g. 33ABCDE1234F1Z5)");
    default:
      return true;
  }
}

function setupValidationListeners() {
  ["partyName", "mobile", "address", "deliveryDate", "gstNumber"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("blur", () => validateField(id));
    el.addEventListener("input", () => {
      if (el.classList.contains("has-error")) validateField(id);
    });
  });
}

function validateAll() {
  clearAllErrors();
  let ok = true;
  ok = validateField("partyName") && ok;
  ok = validateField("mobile") && ok;
  ok = validateField("address") && ok;
  ok = validateField("deliveryDate") && ok;
  ok = validateField("gstNumber") && ok;

  const priorities = Array.from(document.querySelectorAll(".priority-chip.active")).length;
  if (!priorities) {
    setFieldError("priorities", "Select at least one priority");
    document.querySelector(".priority-group")?.classList.add("has-error");
    ok = false;
  }

  return ok;
}

// ─── THEME ───
function syncThemeButton() {
  const btn = document.getElementById("themeBtn");
  if (!btn) return;
  const theme = document.documentElement.getAttribute("data-theme") || "light";
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
  btn.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("skt_theme", next);
  syncThemeButton();
}

function setDefaultDateTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];
  document.getElementById("deliveryDate").value = dateStr;
  document.getElementById("deliveryDate").min = now.toISOString().split("T")[0];
  document.getElementById("deliveryTime").value = "09:00";
}

function setupPriorityChips() {
  document.querySelectorAll(".priority-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      const input = chip.querySelector("input");
      input.checked = !input.checked;
      chip.classList.toggle("active", input.checked);
      renderSummary();
    });
  });
}

function addCementRow() {
  const id = Date.now();
  cementItems.push(id);
  const container = document.getElementById("cementItemsList");
  const row = document.createElement("div");
  row.className = "material-row";
  row.id = `cement-${id}`;
  row.innerHTML = `
    <div class="form-group">
      <label class="form-label">Brand</label>
      <select class="form-select" onchange="renderSummary()">
        <option value="">Select</option>
        ${CEMENT_BRANDS.map(b => `<option value="${b}">${b}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select class="form-select" onchange="renderSummary()">
        <option value="">Select</option>
        ${CEMENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Qty (Bags)</label>
      <input type="number" class="form-input" placeholder="0" min="0" oninput="renderSummary()">
    </div>
    <div class="form-group">
      <label class="form-label">Rate (₹)</label>
      <input type="number" class="form-input" placeholder="0" min="0" oninput="renderSummary()">
    </div>
    <button class="btn-remove" onclick="removeCementRow(${id})" title="Remove">✕</button>
  `;
  container.appendChild(row);
}

function removeCementRow(id) {
  document.getElementById(`cement-${id}`)?.remove();
  cementItems = cementItems.filter(i => i !== id);
  renderSummary();
}

function addSteelRow() {
  const id = Date.now();
  steelItems.push(id);
  const container = document.getElementById("steelItemsList");
  const row = document.createElement("div");
  row.className = "material-row";
  row.id = `steel-${id}`;
  row.innerHTML = `
    <div class="form-group">
      <label class="form-label">Brand</label>
      <select class="form-select" onchange="renderSummary()">
        <option value="">Select</option>
        ${STEEL_BRANDS.map(b => `<option value="${b}">${b}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Size</label>
      <select class="form-select" onchange="renderSummary()">
        <option value="">Select</option>
        ${STEEL_SIZES.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Qty (Ton)</label>
      <input type="number" class="form-input" placeholder="0" min="0" step="0.1" oninput="renderSummary()">
    </div>
    <div class="form-group">
      <label class="form-label">Rate (₹)</label>
      <input type="number" class="form-input" placeholder="0" min="0" oninput="renderSummary()">
    </div>
    <button class="btn-remove" onclick="removeSteelRow(${id})" title="Remove">✕</button>
  `;
  container.appendChild(row);
}

function removeSteelRow(id) {
  document.getElementById(`steel-${id}`)?.remove();
  steelItems = steelItems.filter(i => i !== id);
  renderSummary();
}

function setupAddons() {
  document.querySelectorAll(".addon-card input").forEach(input => {
    input.addEventListener("input", () => {
      const card = input.closest(".addon-card");
      const inputs = card.querySelectorAll("input");
      const hasValue = Array.from(inputs).some(i => parseFloat(i.value) > 0);
      card.classList.toggle("active", hasValue);
      renderSummary();
    });
  });
}

function renderSummary() {
  const container = document.getElementById("summaryItems");
  let items = [];
  let grandTotal = 0;

  document.querySelectorAll("[id^='cement-']").forEach(row => {
    const selects = row.querySelectorAll("select");
    const inputs = row.querySelectorAll("input[type='number']");
    const brand = selects[0]?.value;
    const type = selects[1]?.value;
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (brand && qty > 0 && rate > 0) {
      const amt = qty * rate;
      grandTotal += amt;
      items.push({ label: `🧱 ${brand} ${type}`, detail: `${qty} bags × ₹${rate}`, amount: amt });
    }
  });

  document.querySelectorAll("[id^='steel-']").forEach(row => {
    const selects = row.querySelectorAll("select");
    const inputs = row.querySelectorAll("input[type='number']");
    const brand = selects[0]?.value;
    const size = selects[1]?.value;
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (brand && qty > 0 && rate > 0) {
      const amt = qty * rate;
      grandTotal += amt;
      items.push({ label: `🔩 ${brand} ${size}`, detail: `${qty} ton × ₹${rate}`, amount: amt });
    }
  });

  document.querySelectorAll(".addon-card").forEach(card => {
    const name = card.dataset.name;
    const inputs = card.querySelectorAll("input[type='number']");
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (qty > 0 && rate > 0) {
      const amt = qty * rate;
      grandTotal += amt;
      items.push({ label: `📦 ${name}`, detail: `${qty} × ₹${rate}`, amount: amt });
    }
  });

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-summary">Add items to see the summary</div>`;
    return;
  }

  let html = "";
  items.forEach(item => {
    html += `
      <div class="summary-row">
        <div><span class="summary-label">${item.label}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${item.detail}</span></div>
        <span class="summary-value">₹${item.amount.toLocaleString("en-IN")}</span>
      </div>`;
  });

  html += `
    <div class="summary-row total">
      <span class="summary-label" style="font-size:16px;font-weight:600">Grand Total</span>
      <span class="summary-value">₹${grandTotal.toLocaleString("en-IN")}</span>
    </div>`;

  container.innerHTML = html;
}

function collectOrderData() {
  const formErrEl = document.getElementById("error-form");
  if (formErrEl) formErrEl.textContent = "";

  if (!validateAll()) {
    if (formErrEl) formErrEl.textContent = "Please fix the highlighted fields above.";
    const firstErr = document.querySelector(".has-error, .priority-group.has-error");
    firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }

  const party = document.getElementById("partyName").value.trim();
  const mobile = document.getElementById("mobile").value.trim();
  const address = document.getElementById("address").value.trim();
  const deliveryDate = document.getElementById("deliveryDate").value;
  const deliveryTime = document.getElementById("deliveryTime").value;
  const notes = document.getElementById("notes").value.trim();
  const gstNumber = (document.getElementById("gstNumber")?.value || "").trim().toUpperCase();

  const priorities = [];
  document.querySelectorAll(".priority-chip.active").forEach(chip => {
    priorities.push(chip.dataset.value);
  });

  const cement = [];
  document.querySelectorAll("[id^='cement-']").forEach(row => {
    const selects = row.querySelectorAll("select");
    const inputs = row.querySelectorAll("input[type='number']");
    const brand = selects[0]?.value;
    const type = selects[1]?.value;
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (brand && type && qty > 0 && rate > 0) {
      cement.push({ brand, type, qty, rate });
    }
  });

  const steel = [];
  document.querySelectorAll("[id^='steel-']").forEach(row => {
    const selects = row.querySelectorAll("select");
    const inputs = row.querySelectorAll("input[type='number']");
    const brand = selects[0]?.value;
    const size = selects[1]?.value;
    const qty = parseFloat(inputs[0]?.value) || 0;
    const rate = parseFloat(inputs[1]?.value) || 0;
    if (brand && size && qty > 0 && rate > 0) {
      steel.push({ brand, size, qty, rate });
    }
  });

  const addons = {};
  document.querySelectorAll(".addon-card").forEach(card => {
    const key = card.dataset.key;
    const inputs = card.querySelectorAll("input[type='number']");
    addons[key] = { qty: parseFloat(inputs[0]?.value) || 0, rate: parseFloat(inputs[1]?.value) || 0 };
  });

  if (cement.length === 0 && steel.length === 0) {
    if (formErrEl) formErrEl.textContent = "Add at least one Cement or Steel item before submitting.";
    formErrEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }

  return {
    id: "SKT-" + Date.now(),
    party, mobile, address, gstNumber, deliveryDate, deliveryTime,
    priorities, cement, steel, addons, notes
  };
}

async function submitOrder() {
  const order = collectOrderData();
  if (!order) return;

  const btn = document.getElementById("submitBtn");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    lastOrderId = data.id;
    showToast("✅ Order submitted! ID: " + data.id, "success");
    document.getElementById("lastPdfBtn").style.display = "block";
    resetForm();
  } catch (error) {
    console.error("Submit error:", error);
    showToast("❌ Failed to submit: " + error.message, "error");
  }

  btn.classList.remove("loading");
  btn.disabled = false;
}

function downloadLastPdf() {
  if (!lastOrderId) return;
  downloadOrderPdf(lastOrderId);
}

function downloadOrderPdf(id) {
  window.open(`${API_BASE}/api/orders/${encodeURIComponent(id)}/pdf`, "_blank");
}

function historyFilterQuery() {
  const params = new URLSearchParams();
  if (historyFilterState.q) params.set("q", historyFilterState.q);
  if (historyFilterState.status && historyFilterState.status !== "all")
    params.set("status", historyFilterState.status);
  if (historyFilterState.from) params.set("from", historyFilterState.from);
  if (historyFilterState.to)   params.set("to",   historyFilterState.to);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function downloadHistoryCsv() {
  window.open(`${API_BASE}/api/orders/export.csv${historyFilterQuery()}`, "_blank");
}

function downloadHistoryPdf() {
  window.open(`${API_BASE}/api/orders/export.pdf${historyFilterQuery()}`, "_blank");
}

async function toggleDelivered(id, checked) {
  const item = document.getElementById(`history-${id}`);
  const input = item?.querySelector(".delivery-toggle input");
  try {
    const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(id)}/delivered`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivered: !!checked }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (item) {
      item.classList.toggle("delivered", !!data.delivered);
      const labelEl = item.querySelector(".delivery-label");
      if (labelEl) labelEl.textContent = data.delivered ? "Delivered" : "Pending";
      let stamp = item.querySelector(".hi-delivered-at");
      if (data.delivered) {
        const when = new Date(data.delivered_at).toLocaleString("en-IN");
        if (!stamp) {
          stamp = document.createElement("p");
          stamp.className = "hi-delivered-at";
          item.querySelector("button.btn-add").insertAdjacentElement("beforebegin", stamp);
        }
        stamp.textContent = `✅ ${when}`;
      } else if (stamp) {
        stamp.remove();
      }
    }
    showToast(data.delivered ? "Marked as delivered" : "Marked as pending", "success");
  } catch (e) {
    if (input) input.checked = !checked;
    showToast("Failed to update: " + e.message, "error");
  }
}

function resetForm() {
  clearAllErrors();
  const formErrEl = document.getElementById("error-form");
  if (formErrEl) formErrEl.textContent = "";
  document.getElementById("partyName").value = "";
  document.getElementById("mobile").value = "";
  document.getElementById("address").value = "";
  const gst = document.getElementById("gstNumber"); if (gst) gst.value = "";
  document.getElementById("notes").value = "";

  document.querySelectorAll(".priority-chip").forEach(chip => {
    chip.classList.remove("active");
    chip.querySelector("input").checked = false;
  });

  document.getElementById("cementItemsList").innerHTML = "";
  cementItems = [];
  addCementRow();

  document.getElementById("steelItemsList").innerHTML = "";
  steelItems = [];
  addSteelRow();

  document.querySelectorAll(".addon-card input").forEach(i => { i.value = ""; });
  document.querySelectorAll(".addon-card").forEach(c => c.classList.remove("active"));

  setDefaultDateTime();
  renderSummary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(40px)"; toast.style.transition = "all 0.3s"; setTimeout(() => toast.remove(), 300); }, 4000);
}

let historyFilterState = { q: "", status: "all", from: "", to: "" };
let historyDebounce = null;

function setupHistoryFilters() {
  const search = document.getElementById("historySearch");
  const from = document.getElementById("historyFrom");
  const to = document.getElementById("historyTo");

  search?.addEventListener("input", () => {
    historyFilterState.q = search.value.trim();
    debouncedRenderHistory();
  });
  from?.addEventListener("change", () => {
    historyFilterState.from = from.value;
    renderHistory();
  });
  to?.addEventListener("change", () => {
    historyFilterState.to = to.value;
    renderHistory();
  });
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      historyFilterState.status = chip.dataset.status;
      renderHistory();
    });
  });
}

function debouncedRenderHistory() {
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(renderHistory, 250);
}

function clearHistoryFilters() {
  historyFilterState = { q: "", status: "all", from: "", to: "" };
  const s = document.getElementById("historySearch"); if (s) s.value = "";
  const f = document.getElementById("historyFrom"); if (f) f.value = "";
  const t = document.getElementById("historyTo"); if (t) t.value = "";
  document.querySelectorAll(".filter-chip").forEach(c =>
    c.classList.toggle("active", c.dataset.status === "all")
  );
  renderHistory();
}

async function toggleHistory() {
  const panel = document.getElementById("historyPanel");
  const backdrop = document.getElementById("historyBackdrop");
  const isActive = panel.classList.contains("active");
  panel.classList.toggle("active", !isActive);
  backdrop.classList.toggle("active", !isActive);
  if (!isActive) await renderHistory();
}

async function renderHistory() {
  const list = document.getElementById("historyList");
  const summary = document.getElementById("historySummary");
  list.innerHTML = `<div class="empty-summary">Loading…</div>`;
  if (summary) summary.textContent = "";

  const params = new URLSearchParams();
  if (historyFilterState.q) params.set("q", historyFilterState.q);
  if (historyFilterState.status && historyFilterState.status !== "all")
    params.set("status", historyFilterState.status);
  if (historyFilterState.from) params.set("from", historyFilterState.from);
  if (historyFilterState.to)   params.set("to",   historyFilterState.to);

  try {
    const res = await fetch(`${API_BASE}/api/orders?${params.toString()}`);
    const orders = await res.json();

    if (summary) {
      const total = orders.reduce((s, o) => s + Number(o.grand_total || 0), 0);
      const delivered = orders.filter(o => o.delivered).length;
      summary.textContent =
        `${orders.length} order${orders.length === 1 ? "" : "s"} • ${delivered} delivered • ₹${total.toLocaleString("en-IN")}`;
    }

    if (!orders.length) {
      list.innerHTML = `<div class="empty-summary">No orders match the filters</div>`;
      return;
    }
    list.innerHTML = orders.map(o => {
      const delivered = !!o.delivered;
      const deliveredAt = o.delivered_at
        ? new Date(o.delivered_at).toLocaleString("en-IN")
        : "";
      return `
        <div class="history-item ${delivered ? "delivered" : ""}" id="history-${o.id}">
          <div class="history-item-top">
            <span class="hi-id">${o.id}</span>
            <label class="delivery-toggle" title="Toggle delivered">
              <input type="checkbox" ${delivered ? "checked" : ""}
                onchange="toggleDelivered('${o.id}', this.checked)">
              <span class="delivery-switch"></span>
              <span class="delivery-label">${delivered ? "Delivered" : "Pending"}</span>
            </label>
          </div>
          <h4>${o.party_name}</h4>
          <p>📱 ${o.mobile} | 📅 ${o.delivery_date?.toString().split("T")[0]} ${o.delivery_time || ""}</p>
          <p>Total: ₹${Number(o.grand_total).toLocaleString("en-IN")}</p>
          ${delivered ? `<p class="hi-delivered-at">✅ ${deliveredAt}</p>` : ""}
          <button class="btn-add" style="margin-top:6px" onclick="downloadOrderPdf('${o.id}')">📄 Download PDF</button>
        </div>
      `;
    }).join("");
  } catch (e) {
    list.innerHTML = `<div class="empty-summary">Failed to load: ${e.message}</div>`;
  }
}

function confirmReset() {
  document.getElementById("resetModal").classList.add("active");
}

function closeModal() {
  document.getElementById("resetModal").classList.remove("active");
}

function doReset() {
  closeModal();
  resetForm();
  showToast("Form cleared", "info");
}
