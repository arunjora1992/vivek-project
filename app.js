// ═══════════════════════════════════════════════════════════
// SKT ORDER BOOK - APPLICATION LOGIC
// ═══════════════════════════════════════════════════════════

// ⚠️ PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BELOW
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbznbYg8u5ysQkqmfPkCHt8e8xoDU0MsbQKUsheV5Ha2ZxlCTk3gZL_T4pBr5P_zuYgWvA/exec";

// ─── DATA ───
const CEMENT_BRANDS = ["Maha", "Dalmia", "Ramco", "Ultratech", "Zuari", "Chettinad", "Priya"];
const CEMENT_TYPES = ["OPC 53", "OPC 43", "PPC", "PSC"];
const STEEL_BRANDS = ["Apollo", "Tata Tiscon", "JSW Neosteel", "SAIL", "Kamachi", "Rathi"];
const STEEL_SIZES = ["8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "32mm"];

let cementItems = [];
let steelItems = [];
let orderHistory = JSON.parse(localStorage.getItem("skt_orders") || "[]");

// ─── INIT ───
document.addEventListener("DOMContentLoaded", () => {
  setupPriorityChips();
  setupAddons();
  setDefaultDateTime();
  addCementRow();
  addSteelRow();
  renderSummary();
});

// ─── DATE/TIME DEFAULTS ───
function setDefaultDateTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];
  document.getElementById("deliveryDate").value = dateStr;
  document.getElementById("deliveryDate").min = now.toISOString().split("T")[0];
  document.getElementById("deliveryTime").value = "09:00";
}

// ─── PRIORITY CHIPS ───
function setupPriorityChips() {
  document.querySelectorAll(".priority-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
      chip.querySelector("input").checked = chip.classList.contains("active");
      renderSummary();
    });
  });
}

// ─── CEMENT ROWS ───
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

// ─── STEEL ROWS ───
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

// ─── ADDONS ───
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

// ─── SUMMARY ───
function renderSummary() {
  const container = document.getElementById("summaryItems");
  let items = [];
  let grandTotal = 0;

  // Cement
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

  // Steel
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

  // Addons
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

// ─── COLLECT ORDER DATA ───
function collectOrderData() {
  const party = document.getElementById("partyName").value.trim();
  const mobile = document.getElementById("mobile").value.trim();
  const address = document.getElementById("address").value.trim();
  const deliveryDate = document.getElementById("deliveryDate").value;
  const deliveryTime = document.getElementById("deliveryTime").value;
  const notes = document.getElementById("notes").value.trim();

  const priorities = [];
  document.querySelectorAll(".priority-chip.active").forEach(chip => {
    priorities.push(chip.dataset.value);
  });

  // Validation
  if (!party) { showToast("Please enter Party Name", "error"); return null; }
  if (!mobile || mobile.length < 10) { showToast("Please enter valid Mobile number", "error"); return null; }
  if (!address) { showToast("Please enter Address", "error"); return null; }
  if (!deliveryDate) { showToast("Please select Delivery Date", "error"); return null; }
  if (priorities.length === 0) { showToast("Please select at least one Priority", "error"); return null; }

  // Cement items
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

  // Steel items
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

  // Addons
  const addonsCards = document.querySelectorAll(".addon-card");
  const addons = {};
  addonsCards.forEach(card => {
    const key = card.dataset.key;
    const inputs = card.querySelectorAll("input[type='number']");
    addons[key] = { qty: parseFloat(inputs[0]?.value) || 0, rate: parseFloat(inputs[1]?.value) || 0 };
  });

  if (cement.length === 0 && steel.length === 0) {
    showToast("Please add at least one Cement or Steel item", "error");
    return null;
  }

  return {
    date: new Date().toISOString(),
    id: "SKT-" + Date.now(),
    party, mobile, address, deliveryDate, deliveryTime,
    priorities, cement, steel, addons, notes
  };
}

// ─── SUBMIT ───
async function submitOrder() {
  const order = collectOrderData();
  if (!order) return;

  const btn = document.getElementById("submitBtn");
  btn.classList.add("loading");
  btn.disabled = true;

  // Save locally
  orderHistory.unshift(order);
  if (orderHistory.length > 50) orderHistory = orderHistory.slice(0, 50);
  localStorage.setItem("skt_orders", JSON.stringify(orderHistory));

  if (!GOOGLE_APPS_SCRIPT_URL) {
    showToast("⚠️ Order saved locally. Set Apps Script URL for cloud sync.", "info");
    btn.classList.remove("loading");
    btn.disabled = false;
    resetForm();
    return;
  }

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });

    showToast("✅ Order submitted successfully! ID: " + order.id, "success");
    resetForm();
  } catch (error) {
    console.error("Submit error:", error);
    showToast("Order saved locally. Cloud sync failed - check your connection.", "error");
  }

  btn.classList.remove("loading");
  btn.disabled = false;
}

// ─── RESET FORM ───
function resetForm() {
  document.getElementById("partyName").value = "";
  document.getElementById("mobile").value = "";
  document.getElementById("address").value = "";
  document.getElementById("notes").value = "";

  document.querySelectorAll(".priority-chip").forEach(chip => {
    chip.classList.remove("active");
    chip.querySelector("input").checked = false;
  });

  // Reset cement
  document.getElementById("cementItemsList").innerHTML = "";
  cementItems = [];
  addCementRow();

  // Reset steel
  document.getElementById("steelItemsList").innerHTML = "";
  steelItems = [];
  addSteelRow();

  // Reset addons
  document.querySelectorAll(".addon-card input").forEach(i => { i.value = ""; });
  document.querySelectorAll(".addon-card").forEach(c => c.classList.remove("active"));

  setDefaultDateTime();
  renderSummary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ─── TOAST NOTIFICATIONS ───
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(40px)"; toast.style.transition = "all 0.3s"; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ─── HISTORY PANEL ───
function toggleHistory() {
  const panel = document.getElementById("historyPanel");
  const backdrop = document.getElementById("historyBackdrop");
  const isActive = panel.classList.contains("active");
  panel.classList.toggle("active", !isActive);
  backdrop.classList.toggle("active", !isActive);
  if (!isActive) renderHistory();
}

function renderHistory() {
  const list = document.getElementById("historyList");
  if (orderHistory.length === 0) {
    list.innerHTML = `<div class="empty-summary">No orders yet</div>`;
    return;
  }
  list.innerHTML = orderHistory.slice(0, 20).map(o => `
    <div class="history-item">
      <span class="hi-id">${o.id}</span>
      <h4>${o.party}</h4>
      <p>📱 ${o.mobile} | 📅 ${o.deliveryDate} ${o.deliveryTime || ""}</p>
      <p>${o.cement?.length ? o.cement.length + " cement" : ""} ${o.steel?.length ? o.steel.length + " steel" : ""}</p>
    </div>
  `).join("");
}

// ─── CONFIRM RESET ───
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
