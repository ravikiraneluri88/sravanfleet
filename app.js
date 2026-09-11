const form = document.getElementById("lrForm");
const preview = document.getElementById("lrPreview");
const toast = document.getElementById("toast");
const historyKey = "routeledger-lrs";
const copyNames = ["Consignor Copy", "Consignee Copy", "Transporter Copy", "Office Copy"];
const customerKey = "routeledger-customers";
const locationKey = "routeledger-locations";
const vehicleKey = "routeledger-vehicles";
const settingsKey = "routeledger-settings";
let editingLrNumber = "";

const equipmentNames = {
  "20ft-container": "20 ft container",
  "40ft-container": "40 ft container",
  "20ft-empty-tank": "20 ft empty tank",
  "20ft-loaded-tank": "20 ft loaded tank",
  "16tyre-trailer": "16 tyre trailer",
  "14tyre-trailer": "14 tyre trailer",
  truck: "Cargo truck"
};

const fields = ["lrNumber", "lrDate", "consignor", "consignorAddress", "consignorGst", "consignorPan",
  "consignee", "consigneeAddress", "consigneeGst", "consigneePan", "pickup", "delivery", "movementType",
  "returnLocation", "vehicleNumber", "driverName", "driverMobile", "commodity", "packages",
  "goodsValue", "grossWeight", "netWeight", "tareWeight", "goodsDescription",
  "containerNumber1", "containerNumber2", "sealNumber", "sealNumber2",
  "ewayBill", "beNumber", "invoiceNumber", "dcNumber", "wayBillNumber",
  "instructions"];

function formatDate(value) {
  if (!value) return "Not entered";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function displayValue(value, fallback = "Not entered") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function readStore(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFormData() {
  const data = {};
  fields.forEach((id) => { data[id] = document.getElementById(id).value; });
  data.equipment = document.querySelector('input[name="equipment"]:checked').value;
  return data;
}

function updatePreview() {
  const data = getFormData();
  document.querySelectorAll("[data-preview]").forEach((element) => {
    const key = element.dataset.preview;
    let value = data[key];
    if (key === "lrDate") value = formatDate(value);
    if (key === "equipment") value = equipmentNames[data.equipment];
    if (["grossWeight", "netWeight", "tareWeight"].includes(key) && value) value = `${value} MT`;
    if (key === "goodsValue") value = `₹ ${Number(value || 0).toLocaleString("en-IN")}`;
    if (key === "instructions") value = displayValue(value, "No special instructions added.");
    if (key === "returnSummary") value = data.movementType === "return"
      ? `Return trip${data.returnLocation ? ` · Return to ${data.returnLocation}` : ""}`
      : "One way movement";
    if (key === "routeArrow") value = data.movementType === "return" ? "↔" : "→";
    element.textContent = displayValue(value, key === "lrNumber" ? "LR-2026-0001" : undefined);
  });
  document.querySelectorAll(".equipment-option").forEach((option) => {
    option.classList.toggle("selected", option.querySelector("input").checked);
  });
  document.getElementById("saveStatus").textContent = "Unsaved changes";
  document.getElementById("returnLocationField").style.opacity = data.movementType === "return" ? "1" : ".5";
  renderPrintBatch(data);
}

function renderPrintBatch(data) {
  const batch = document.getElementById("printBatch");
  const source = document.getElementById("lrPreview");
  batch.innerHTML = "";
  copyNames.forEach((copyName) => {
    const front = source.cloneNode(true);
    front.removeAttribute("id");
    front.classList.add("print-front");
    const title = document.createElement("div");
    title.className = "print-copy-label";
    title.textContent = copyName;
    front.querySelector(".paper-title span").textContent = copyName.toUpperCase();
    front.insertBefore(title, front.firstChild);
    const terms = document.createElement("section");
    terms.className = "terms-page";
    terms.innerHTML = `
      <div class="terms-header">
        <div class="paper-logo"><span>R</span> SRAVAN SHIPPING SERVICES PRIVATE LIMITED</div>
        <strong>TERMS & CONDITIONS OF CARRIAGE</strong>
        <small>LR NO. ${displayValue(data.lrNumber, "LR-2026-0001")} · ${copyName.toUpperCase()}</small>
      </div>
      <ol>
        <li>The consignment is carried at the owner's risk unless insurance has been arranged by the consignor. The carrier is not responsible for loss or damage covered by insurance.</li>
        <li>The consignor confirms that the description, weight, value, packing and documents supplied for the goods are complete and accurate.</li>
        <li>All statutory documents, permits, invoices, e-way bills, customs documents and declarations required for transport shall be provided by the consignor.</li>
        <li>The carrier may refuse or stop carriage of prohibited, dangerous, leaking, incorrectly declared or inadequately packed goods.</li>
        <li>Loading, securing, unloading and the condition of the container or vehicle must be verified by the concerned parties before dispatch.</li>
        <li>Delivery will be made against the required documents and acknowledgement at the stated destination. Demurrage, detention, waiting and additional handling charges, if applicable, are payable by the responsible party.</li>
        <li>Any delay caused by weather, road restrictions, strikes, government action, breakdown, port congestion or other events beyond the carrier's control shall not constitute a breach of carriage.</li>
        <li>Claims must be notified in writing promptly and supported by the LR, delivery proof and relevant evidence, subject to applicable law.</li>
        <li>Any disputes relating to this LR are subject to the jurisdiction stated on the front of this LR.</li>
      </ol>
      <div class="terms-signatures"><span>Consignor acknowledgement</span><span>Authorized signatory</span></div>`;
    batch.append(front, terms);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function makeLrNumber() {
  const now = new Date();
  return `LR-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

function renderHistory() {
  const history = readStore(historyKey);
  document.getElementById("recentCount").textContent = history.length;
  const list = document.getElementById("recentList");
  const query = (document.getElementById("historySearch")?.value || "").toLowerCase().trim();
  const filter = document.getElementById("historyFilter")?.value || "all";
  const now = new Date();
  const visible = history.filter((item) => {
    const haystack = [item.lrNumber, item.consignor, item.consignee, item.pickup, item.delivery, item.vehicleNumber].join(" ").toLowerCase();
    const date = item.lrDate ? new Date(`${item.lrDate}T00:00:00`) : null;
    return (!query || haystack.includes(query)) && (filter !== "month" || (date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()));
  });
  if (!visible.length) {
    list.innerHTML = '<div class="empty-state">Your generated LRs will appear here.</div>';
  } else {
    list.innerHTML = visible.slice(0, 30).map((item) => `
      <div class="recent-row">
        <div><small>LR NUMBER</small><strong>${escapeHtml(item.lrNumber)}</strong></div>
        <div><small>ROUTE</small><strong>${escapeHtml(item.pickup || "—")} → ${escapeHtml(item.delivery || "—")}</strong></div>
        <div><small>EQUIPMENT</small><strong>${escapeHtml(equipmentNames[item.equipment] || item.equipment)}</strong></div>
        <div><small>CREATED</small><strong>${formatDate(item.lrDate)}</strong></div>
        <div class="history-actions"><button type="button" data-edit-history-lr="${escapeHtml(item.lrNumber)}">Edit</button><button type="button" data-history-lr="${escapeHtml(item.lrNumber)}">Load</button></div>
      </div>`).join("");
  }
  renderDashboard(history);
}

function saveHistory(data) {
  const history = readStore(historyKey);
  const updated = [data, ...history.filter((item) => item.lrNumber !== data.lrNumber)].slice(0, 100);
  localStorage.setItem(historyKey, JSON.stringify(updated));
  renderHistory();
}

function renderDashboard(history = readStore(historyKey)) {
  const month = new Date().toISOString().slice(0, 7);
  document.getElementById("kpiTotal").textContent = history.length;
  document.getElementById("kpiMonth").textContent = history.filter((item) => item.lrDate?.startsWith(month)).length;
  document.getElementById("kpiCustomers").textContent = readStore(customerKey).length;
  document.getElementById("kpiFleet").textContent = readStore(vehicleKey).length;
  const target = document.getElementById("dashboardRecent");
  if (!target) return;
  target.innerHTML = history.slice(0, 4).map((item) => `<div class="compact-row"><div><small>LR NUMBER</small><strong>${escapeHtml(item.lrNumber)}</strong></div><div><small>ROUTE</small><strong>${escapeHtml(item.pickup || "—")} → ${escapeHtml(item.delivery || "—")}</strong></div><div class="history-actions"><button type="button" data-edit-history-lr="${escapeHtml(item.lrNumber)}">Edit</button><button type="button" data-history-lr="${escapeHtml(item.lrNumber)}">Load</button></div></div>`).join("") || '<div class="empty-state">No dispatches yet. Create your first LR to see activity here.</div>';
}

function renderJobs() {
  const history = readStore(historyKey);
  const start = document.getElementById("jobsStartDate")?.value || "";
  const end = document.getElementById("jobsEndDate")?.value || "";
  const status = document.getElementById("jobsStatus")?.value || "all";
  const today = new Date().toISOString().slice(0, 10);
  const visible = history.filter((item) => {
    const date = item.lrDate || "";
    return (!start || date >= start) && (!end || date <= end)
      && (status === "all" || (status === "today" && date === today) || (status === "return" && item.movementType === "return"));
  });
  document.getElementById("jobsCount").textContent = history.length;
  document.getElementById("jobsVisibleCount").textContent = `${visible.length} job${visible.length === 1 ? "" : "s"}`;
  document.getElementById("jobsList").innerHTML = visible.map((item) => `
    <article class="job-card">
      <div class="job-status ${item.movementType === "return" ? "return" : ""}">${item.movementType === "return" ? "RETURN" : "ONE WAY"}</div>
      <div class="job-main"><small>LR NUMBER · ${escapeHtml(formatDate(item.lrDate))}</small><strong>${escapeHtml(item.lrNumber)}</strong><span>${escapeHtml(item.consignor || "Consignor not entered")} → ${escapeHtml(item.consignee || "Consignee not entered")}</span></div>
      <div><small>ROUTE</small><strong>${escapeHtml(item.pickup || "—")} → ${escapeHtml(item.delivery || "—")}</strong><span>${escapeHtml(equipmentNames[item.equipment] || item.equipment || "Equipment not entered")}</span></div>
      <div><small>VEHICLE</small><strong>${escapeHtml(item.vehicleNumber || "Not assigned")}</strong><span>${escapeHtml(item.driverName || "Driver not entered")}</span></div>
      <div class="job-actions"><button type="button" data-job-load="${escapeHtml(item.lrNumber)}">Load</button><button type="button" data-job-edit="${escapeHtml(item.lrNumber)}">Edit</button></div>
    </article>`).join("") || '<div class="empty-state">No jobs match the selected filters. Create and save an LR to add a route job.</div>';
}

function renderCustomers() {
  const query = (document.getElementById("customerSearch")?.value || "").toLowerCase();
  const items = readStore(customerKey).filter((item) => `${item.name} ${item.gst} ${item.contact}`.toLowerCase().includes(query));
  document.getElementById("customerList").innerHTML = items.map((item) => `<div class="master-row"><div><small>COMPANY</small><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.address || "Address not entered")}</span></div><div><small>GST / PAN</small><span>${escapeHtml(item.gst || "GST not entered")} · ${escapeHtml(item.pan || "PAN not entered")}</span></div><div><small>CONTACT</small><span>${escapeHtml(item.contact || "Not entered")}</span></div><div class="master-actions"><button type="button" data-edit-customer="${item.id}">Edit</button><button class="delete" type="button" data-delete-customer="${item.id}">Delete</button></div></div>`).join("") || '<div class="empty-state">No customers saved yet.</div>';
  const customers = readStore(customerKey);
  ["consignor", "consignee"].forEach((fieldId) => {
    const select = document.getElementById(fieldId);
    const currentValue = select.value;
    const label = fieldId === "consignor" ? "Select a saved consignor" : "Select a saved consignee";
    select.innerHTML = `<option value="">${label}</option>` + customers.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} · ${escapeHtml(item.gst || "GST not entered")}</option>`).join("");
    if (customers.some((item) => item.name === currentValue)) select.value = currentValue;
  });
}

function renderLocations() {
  const query = (document.getElementById("locationSearch")?.value || "").toLowerCase();
  const locations = readStore(locationKey);
  const items = locations.filter((item) => `${item.name} ${item.address} ${item.type}`.toLowerCase().includes(query));
  document.getElementById("locationList").innerHTML = items.map((item) => `<div class="master-row"><div><small>LOCATION</small><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.address)}</span></div><div><small>TYPE</small><span>${escapeHtml(item.type)}</span></div><div><small>USED FOR</small><span>From / To selection</span></div><div class="master-actions"><button type="button" data-edit-location="${item.id}">Edit</button><button class="delete" type="button" data-delete-location="${item.id}">Delete</button></div></div>`).join("") || '<div class="empty-state">No locations saved yet.</div>';
  ["pickup", "delivery"].forEach((fieldId) => {
    const select = document.getElementById(fieldId);
    const currentValue = select.value;
    const label = fieldId === "pickup" ? "Select a saved loading location" : "Select a saved delivery location";
    select.innerHTML = `<option value="">${label}</option>` + locations.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} · ${escapeHtml(item.type)}</option>`).join("");
    if (locations.some((item) => item.name === currentValue)) select.value = currentValue;
  });
}

function renderVehicles() {
  const query = (document.getElementById("vehicleSearch")?.value || "").toLowerCase();
  const vehicles = readStore(vehicleKey);
  const items = vehicles.filter((item) => `${item.number} ${item.driver} ${item.type}`.toLowerCase().includes(query));
  document.getElementById("vehicleList").innerHTML = items.map((item) => `<div class="master-row"><div><small>REGISTRATION</small><strong>${escapeHtml(item.number)}</strong></div><div><small>EQUIPMENT</small><span>${escapeHtml(item.type)}</span></div><div><small>DRIVER / MOBILE</small><span>${escapeHtml(item.driver)}${item.mobile ? ` · ${escapeHtml(item.mobile)}` : ""}</span></div><div class="master-actions"><button type="button" data-edit-vehicle="${item.id}">Edit</button><button class="delete" type="button" data-delete-vehicle="${item.id}">Delete</button></div></div>`).join("") || '<div class="empty-state">No vehicles saved yet.</div>';
  const select = document.getElementById("vehicleNumber");
  const currentValue = select.value;
  select.innerHTML = '<option value="">Select a saved vehicle</option>' + vehicles.map((item) => `<option value="${escapeHtml(item.number)}">${escapeHtml(item.number)} · ${escapeHtml(item.type)} · ${escapeHtml(item.driver)}</option>`).join("");
  if (vehicles.some((item) => item.number === currentValue)) select.value = currentValue;
}

function openModal(id, item = null) {
  const modal = document.getElementById(id);
  modal.hidden = false;
  if (id === "customerModal") {
    document.getElementById("customerForm").reset();
    document.getElementById("customerId").value = item?.id || "";
    document.getElementById("customerName").value = item?.name || "";
    document.getElementById("customerGst").value = item?.gst || "";
    document.getElementById("customerPan").value = item?.pan || "";
    document.getElementById("customerAddress").value = item?.address || "";
    document.getElementById("customerContact").value = item?.contact || "";
    document.getElementById("customerModalTitle").textContent = item ? "Edit customer" : "Add customer";
  } else if (id === "locationModal") {
    document.getElementById("locationForm").reset();
    document.getElementById("locationId").value = item?.id || "";
    document.getElementById("locationName").value = item?.name || "";
    document.getElementById("locationAddress").value = item?.address || "";
    document.getElementById("locationType").value = item?.type || "Loading point";
    document.getElementById("locationModalTitle").textContent = item ? "Edit location" : "Add location";
  } else {
    document.getElementById("vehicleForm").reset();
    document.getElementById("vehicleId").value = item?.id || "";
    document.getElementById("masterVehicleNumber").value = item?.number || "";
    document.getElementById("masterVehicleType").value = item?.type || "Container trailer";
    document.getElementById("masterDriverName").value = item?.driver || "";
    document.getElementById("masterDriverMobile").value = item?.mobile || "";
    document.getElementById("vehicleModalTitle").textContent = item ? "Edit vehicle" : "Add vehicle";
  }
}

function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
}

function activateView(view) {
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active-view", panel.dataset.panel === view));
  document.getElementById("recent").classList.toggle("active-view", view === "history");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".master-tab").forEach((item) => item.classList.toggle("active", item.dataset.masterView === view));
  if (["customers", "locations", "fleet"].includes(view)) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "customers"));
  }
  const copy = { dashboard: ["Operations overview", "A clear view of dispatch activity, customers and fleet readiness."], jobs: ["Jobs / Routes", "Plan, filter and review dispatch jobs created from your LRs."], create: ["Create lorry receipt", "Capture the trip, vehicle and cargo details in one dispatch-ready document."], history: ["LR history", "Search, review and reload previously generated receipts."], customers: ["Customers", "Manage the parties your operations team works with every day."], locations: ["From / To locations", "Manage saved loading, delivery, port and depot locations."], fleet: ["Vehicles & drivers", "Keep equipment and driver contacts ready for dispatch."], settings: ["Company profile", "Manage local workspace preferences and document defaults."] }[view] || null;
  if (copy) { document.getElementById("pageTitle").textContent = copy[0]; document.getElementById("pageIntro").textContent = copy[1]; }
  if (view === "customers") renderCustomers();
  if (view === "locations") renderLocations();
  if (view === "fleet") renderVehicles();
  if (view === "dashboard") renderDashboard();
  if (view === "jobs") renderJobs();
}

function loadData(data, editMode = false) {
  editingLrNumber = editMode ? data.lrNumber : "";
  fields.forEach((id) => {
    if (data[id] !== undefined) document.getElementById(id).value = data[id];
  });
  const equipment = document.querySelector(`input[name="equipment"][value="${data.equipment}"]`);
  if (equipment) equipment.checked = true;
  document.getElementById("vehicleNumber").disabled = editMode;
  updatePreview();
  document.getElementById("saveStatus").textContent = editMode ? "Editing saved LR · vehicle locked" : "Unsaved changes";
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(editMode ? `Editing ${data.lrNumber} · vehicle number locked` : `Loaded ${data.lrNumber}`);
}

document.getElementById("lrDate").value = new Date().toISOString().slice(0, 10);
document.getElementById("lrNumber").value = "LR-2026-0001";
document.getElementById("movementType").addEventListener("change", (event) => {
  document.getElementById("returnLocation").required = event.target.value === "return";
});
["consignor", "consignee"].forEach((party) => {
  document.getElementById(party).addEventListener("change", (event) => {
    const selected = readStore(customerKey).find((item) => item.name.toLowerCase() === event.target.value.trim().toLowerCase());
    if (!selected) return;
    const prefix = party === "consignor" ? "consignor" : "consignee";
    document.getElementById(`${prefix}Address`).value = selected.address || "";
    document.getElementById(`${prefix}Gst`).value = selected.gst || "";
    document.getElementById(`${prefix}Pan`).value = selected.pan || "";
    updatePreview();
    showToast(`${selected.name} details loaded`);
  });
});
form.addEventListener("input", updatePreview);
form.addEventListener("change", updatePreview);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = getFormData();
  if (editingLrNumber) data.lrNumber = editingLrNumber;
  saveHistory(data);
  editingLrNumber = "";
  document.getElementById("vehicleNumber").disabled = false;
  document.getElementById("saveStatus").textContent = "Saved just now";
  showToast(`${data.lrNumber} saved to recent LRs`);
});

function printCurrentLr() {
  if (!form.reportValidity()) {
    showToast("Complete the required fields before printing");
    return false;
  }
  const data = getFormData();
  saveHistory(data);
  renderPrintBatch(data);
  window.print();
  return true;
}

document.getElementById("printButton").addEventListener("click", printCurrentLr);
document.getElementById("printLrButton").addEventListener("click", printCurrentLr);

document.getElementById("clearForm").addEventListener("click", () => {
  form.reset();
  editingLrNumber = "";
  document.getElementById("vehicleNumber").disabled = false;
  document.getElementById("lrDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("lrNumber").value = makeLrNumber();
  document.getElementById("returnLocation").required = false;
  document.querySelector('input[name="equipment"][value="20ft-container"]').checked = true;
  updatePreview();
  showToast("New LR form ready");
});

document.getElementById("editLrButton").addEventListener("click", () => {
  if (!editingLrNumber) {
    showToast("Choose Edit from LR history to edit a saved LR");
    return;
  }
  document.getElementById("vehicleNumber").disabled = true;
  showToast("LR is ready to edit · vehicle number remains locked");
});

document.getElementById("clearLrButton").addEventListener("click", () => {
  document.getElementById("clearForm").click();
});

document.getElementById("cancelLrButton").addEventListener("click", () => {
  form.reset();
  editingLrNumber = "";
  document.getElementById("vehicleNumber").disabled = false;
  activateView("dashboard");
  window.location.hash = "dashboard";
  showToast("LR cancelled");
});

document.getElementById("clearHistory").addEventListener("click", () => {
  localStorage.removeItem(historyKey);
  renderHistory();
  showToast("Recent LR history cleared");
});

document.getElementById("recentList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-history-lr]");
  if (editButton) {
    const item = readStore(historyKey).find((entry) => entry.lrNumber === editButton.dataset.editHistoryLr);
    if (item) { activateView("create"); loadData(item, true); }
    return;
  }
  const button = event.target.closest("[data-history-lr]");
  if (!button) return;
  const history = readStore(historyKey);
  const item = history.find((entry) => entry.lrNumber === button.dataset.historyLr);
  if (item) { activateView("create"); loadData(item); }
});

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  const go = event.target.closest("[data-go-view]");
  if (nav || go) {
    event.preventDefault();
    activateView((nav || go).dataset.view || (nav || go).dataset.goView);
  }
  const opener = event.target.closest("[data-open-modal]");
  if (opener) openModal(opener.dataset.openModal);
  if (event.target.closest("[data-close-modal]")) closeModals();
  const masterTab = event.target.closest("[data-master-view]");
  if (masterTab) {
    event.preventDefault();
    activateView(masterTab.dataset.masterView);
  }
});

document.getElementById("dashboardRecent").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-history-lr]");
  if (editButton) {
    const item = readStore(historyKey).find((entry) => entry.lrNumber === editButton.dataset.editHistoryLr);
    if (item) { activateView("create"); loadData(item, true); }
    return;
  }
  const button = event.target.closest("[data-history-lr]");
  if (!button) return;
  const item = readStore(historyKey).find((entry) => entry.lrNumber === button.dataset.historyLr);
  if (item) { activateView("create"); loadData(item); }
});

document.getElementById("historySearch").addEventListener("input", renderHistory);
document.getElementById("historyFilter").addEventListener("change", renderHistory);
["jobsStartDate", "jobsEndDate", "jobsStatus"].forEach((id) => document.getElementById(id).addEventListener("input", renderJobs));
document.getElementById("clearJobsFilters").addEventListener("click", () => {
  document.getElementById("jobsStartDate").value = "";
  document.getElementById("jobsEndDate").value = "";
  document.getElementById("jobsStatus").value = "all";
  renderJobs();
});
document.getElementById("jobsList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-job-load], [data-job-edit]");
  if (!button) return;
  const lrNumber = button.dataset.jobLoad || button.dataset.jobEdit;
  const item = readStore(historyKey).find((entry) => entry.lrNumber === lrNumber);
  if (!item) return;
  activateView("create");
  loadData(item, Boolean(button.dataset.jobEdit));
});
document.getElementById("customerSearch").addEventListener("input", renderCustomers);
document.getElementById("locationSearch").addEventListener("input", renderLocations);
document.getElementById("vehicleSearch").addEventListener("input", renderVehicles);
document.getElementById("vehicleNumber").addEventListener("change", (event) => {
  const selected = readStore(vehicleKey).find((item) => item.number === event.target.value);
  if (!selected) return;
  document.getElementById("driverName").value = selected.driver || "";
  document.getElementById("driverMobile").value = selected.mobile || "";
  updatePreview();
  showToast(`${selected.number} selected`);
});

document.getElementById("customerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const items = readStore(customerKey);
  const id = document.getElementById("customerId").value || `customer-${Date.now()}`;
  const record = { id, name: document.getElementById("customerName").value.trim(), gst: document.getElementById("customerGst").value.trim(), pan: document.getElementById("customerPan").value.trim().toUpperCase(), address: document.getElementById("customerAddress").value.trim(), contact: document.getElementById("customerContact").value.trim() };
  writeStore(customerKey, [record, ...items.filter((item) => item.id !== id)]);
  closeModals(); renderCustomers(); renderDashboard(); showToast("Customer saved");
});

document.getElementById("vehicleForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const items = readStore(vehicleKey);
  const id = document.getElementById("vehicleId").value || `vehicle-${Date.now()}`;
  const record = { id, number: document.getElementById("masterVehicleNumber").value.trim(), type: document.getElementById("masterVehicleType").value, driver: document.getElementById("masterDriverName").value.trim(), mobile: document.getElementById("masterDriverMobile").value.trim() };
  writeStore(vehicleKey, [record, ...items.filter((item) => item.id !== id)]);
  closeModals(); renderVehicles(); renderDashboard(); showToast("Vehicle saved");
});

document.getElementById("locationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const items = readStore(locationKey);
  const id = document.getElementById("locationId").value || `location-${Date.now()}`;
  const record = {
    id,
    name: document.getElementById("locationName").value.trim(),
    address: document.getElementById("locationAddress").value.trim(),
    type: document.getElementById("locationType").value
  };
  writeStore(locationKey, [record, ...items.filter((item) => item.id !== id)]);
  closeModals();
  renderLocations();
  showToast("Location saved");
});

document.getElementById("customerList").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-customer]");
  const remove = event.target.closest("[data-delete-customer]");
  const items = readStore(customerKey);
  if (edit) openModal("customerModal", items.find((item) => item.id === edit.dataset.editCustomer));
  if (remove) { writeStore(customerKey, items.filter((item) => item.id !== remove.dataset.deleteCustomer)); renderCustomers(); renderDashboard(); showToast("Customer removed"); }
});

document.getElementById("vehicleList").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-vehicle]");
  const remove = event.target.closest("[data-delete-vehicle]");
  const items = readStore(vehicleKey);
  if (edit) openModal("vehicleModal", items.find((item) => item.id === edit.dataset.editVehicle));
  if (remove) { writeStore(vehicleKey, items.filter((item) => item.id !== remove.dataset.deleteVehicle)); renderVehicles(); renderDashboard(); showToast("Vehicle removed"); }
});

document.getElementById("locationList").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-location]");
  const remove = event.target.closest("[data-delete-location]");
  const items = readStore(locationKey);
  if (edit) openModal("locationModal", items.find((item) => item.id === edit.dataset.editLocation));
  if (remove) {
    writeStore(locationKey, items.filter((item) => item.id !== remove.dataset.deleteLocation));
    renderLocations();
    showToast("Location removed");
  }
});

const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || "null");
if (storedSettings) Object.keys(storedSettings).forEach((id) => { const input = document.getElementById(id); if (input) input.value = storedSettings[id]; });
document.getElementById("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = { settingCompany: document.getElementById("settingCompany").value.trim(), settingContact: document.getElementById("settingContact").value.trim(), settingContactLine: document.getElementById("settingContactLine").value.trim(), settingTerms: document.getElementById("settingTerms").value.trim() };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  showToast("Company profile saved locally");
});

window.addEventListener("hashchange", () => activateView(window.location.hash.replace("#", "") === "recent" ? "history" : (window.location.hash.replace("#", "") || "dashboard")));
renderCustomers();
renderLocations();
updatePreview();
renderHistory();
activateView(window.location.hash.replace("#", "") === "recent" ? "history" : (window.location.hash.replace("#", "") || "dashboard"));
