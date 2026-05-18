#!/usr/bin/env bash
# Seed a few sample orders for demo / testing.
# Usage:  ./scripts/seed-orders.sh [BASE_URL]
# Default BASE_URL is http://localhost:3000

set -euo pipefail
BASE="${1:-http://localhost:3000}"

post_order() {
  local label="$1"
  local payload="$2"
  local resp
  resp=$(curl -sf -X POST "$BASE/api/orders" \
    -H "Content-Type: application/json" \
    -d "$payload")
  echo "[seed] $label -> $resp"
}

mark_delivered() {
  local id="$1"
  curl -sf -X PATCH "$BASE/api/orders/$id/delivered" \
    -H "Content-Type: application/json" \
    -d '{"delivered":true}' >/dev/null
  echo "[seed] marked $id as delivered"
}

today=$(date +%F)
plus1=$(date -d "+1 day" +%F)
plus3=$(date -d "+3 day" +%F)
plus5=$(date -d "+5 day" +%F)
plus7=$(date -d "+7 day" +%F)

post_order "Acme Builders (Urgent)" "$(cat <<EOF
{
  "id": "SKT-DEMO-001",
  "party": "Acme Builders",
  "mobile": "9876543210",
  "address": "Plot 12, MG Road, Chennai 600001",
  "deliveryDate": "$plus1",
  "deliveryTime": "09:30",
  "priorities": ["Urgent"],
  "cement": [
    { "brand": "Ramco",      "type": "OPC 53", "qty": 200, "rate": 410 },
    { "brand": "Ultratech",  "type": "PPC",    "qty": 80,  "rate": 395 }
  ],
  "steel": [
    { "brand": "Tata Tiscon", "size": "12mm", "qty": 1.5, "rate": 65000 }
  ],
  "addons": { "cb": { "qty": 0, "rate": 0 }, "vw": { "qty": 5, "rate": 120 }, "cp": { "qty": 0, "rate": 0 } },
  "notes": "Call security at gate. Unload near tower B."
}
EOF
)"

post_order "Sai Constructions (VIP)" "$(cat <<EOF
{
  "id": "SKT-DEMO-002",
  "party": "Sai Constructions",
  "mobile": "9123456780",
  "address": "Site 9, Anna Salai, Madurai 625001",
  "deliveryDate": "$plus3",
  "deliveryTime": "07:00",
  "priorities": ["VIP", "Urgent"],
  "cement": [
    { "brand": "Dalmia", "type": "OPC 43", "qty": 120, "rate": 405 }
  ],
  "steel": [
    { "brand": "JSW Neosteel", "size": "16mm", "qty": 2.8, "rate": 64500 },
    { "brand": "SAIL",         "size": "10mm", "qty": 0.6, "rate": 66000 }
  ],
  "addons": { "cb": { "qty": 10, "rate": 90 }, "vw": { "qty": 0, "rate": 0 }, "cp": { "qty": 4, "rate": 280 } },
  "notes": "Owner will receive at site. Bills in company name."
}
EOF
)"

post_order "Green Valley Homes (Normal)" "$(cat <<EOF
{
  "id": "SKT-DEMO-003",
  "party": "Green Valley Homes",
  "mobile": "9988776655",
  "address": "Survey 41/2, Old Mahabalipuram Road, Chennai 600119",
  "deliveryDate": "$plus5",
  "deliveryTime": "11:00",
  "priorities": ["Normal"],
  "cement": [
    { "brand": "Chettinad", "type": "PSC", "qty": 60, "rate": 388 }
  ],
  "steel": [],
  "addons": { "cb": { "qty": 0, "rate": 0 }, "vw": { "qty": 0, "rate": 0 }, "cp": { "qty": 0, "rate": 0 } },
  "notes": ""
}
EOF
)"

post_order "Kavi Engineering (Urgent, steel only)" "$(cat <<EOF
{
  "id": "SKT-DEMO-004",
  "party": "Kavi Engineering",
  "mobile": "9001234567",
  "address": "Industrial Estate, Hosur 635126",
  "deliveryDate": "$today",
  "deliveryTime": "14:00",
  "priorities": ["Urgent"],
  "cement": [],
  "steel": [
    { "brand": "Kamachi", "size": "20mm", "qty": 4.2, "rate": 63000 },
    { "brand": "Rathi",   "size": "25mm", "qty": 1.0, "rate": 62500 }
  ],
  "addons": { "cb": { "qty": 0, "rate": 0 }, "vw": { "qty": 12, "rate": 110 }, "cp": { "qty": 0, "rate": 0 } },
  "notes": "Forklift available on site."
}
EOF
)"

post_order "Royal Residency (VIP, large)" "$(cat <<EOF
{
  "id": "SKT-DEMO-005",
  "party": "Royal Residency",
  "mobile": "9555444333",
  "address": "Beach Road, Pondicherry 605001",
  "deliveryDate": "$plus7",
  "deliveryTime": "08:00",
  "priorities": ["VIP"],
  "cement": [
    { "brand": "Maha",  "type": "OPC 53", "qty": 300, "rate": 415 },
    { "brand": "Priya", "type": "PPC",    "qty": 150, "rate": 392 }
  ],
  "steel": [
    { "brand": "Apollo",      "size": "8mm",  "qty": 0.8, "rate": 67000 },
    { "brand": "Tata Tiscon", "size": "12mm", "qty": 3.5, "rate": 65000 },
    { "brand": "Tata Tiscon", "size": "16mm", "qty": 2.2, "rate": 64500 }
  ],
  "addons": { "cb": { "qty": 20, "rate": 95 }, "vw": { "qty": 15, "rate": 115 }, "cp": { "qty": 6, "rate": 295 } },
  "notes": "Coastal site — keep cement bags on pallets."
}
EOF
)"

post_order "Zuari Distributors (Normal, small)" "$(cat <<EOF
{
  "id": "SKT-DEMO-006",
  "party": "Zuari Distributors",
  "mobile": "9711122233",
  "address": "Shop 4, GST Road, Tambaram 600045",
  "deliveryDate": "$plus3",
  "deliveryTime": "16:30",
  "priorities": ["Normal"],
  "cement": [
    { "brand": "Zuari", "type": "OPC 43", "qty": 30, "rate": 400 }
  ],
  "steel": [],
  "addons": { "cb": { "qty": 0, "rate": 0 }, "vw": { "qty": 0, "rate": 0 }, "cp": { "qty": 2, "rate": 285 } },
  "notes": "Cash on delivery."
}
EOF
)"

# Mark a couple as delivered to demo the toggle / status export.
mark_delivered "SKT-DEMO-003"
mark_delivered "SKT-DEMO-004"

echo "[seed] done. Check $BASE and the history panel."
