const form = document.getElementById("lrForm");
const preview = document.getElementById("lrPreview");
const toast = document.getElementById("toast");
const historyKey = "routeledger-lrs";
const copyNames = ["Consignor Copy", "Consignee Copy", "Transporter Copy", "Office Copy"];
const customerKey = "routeledger-customers";
const locationKey = "routeledger-locations";
const vehicleKey = "routeledger-vehicles";
const settingsKey = "routeledger-settings";
const jobsKey = "routeledger-jobs";
const cloudSessionKey = "routeledger-cloud-session";
const cloudOwnerKey = "routeledger-cloud-owner";
const cloudQueueKey = "routeledger-cloud-queue";
const dataKeys = [historyKey, customerKey, locationKey, vehicleKey, settingsKey, jobsKey];
const cloudConfig = window.ROUTELEDGER_SUPABASE || {};
let editingLrNumber = "";
let cloudSession = null;
let cloudAuthMode = "login";

function cloudIsConfigured() {
  return Boolean(cloudConfig.url && cloudConfig.anonKey);
}

function setCloudStatus(message, isError = false) {
  const status = document.getElementById("cloudSyncStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function readCloudQueue() {
  return JSON.parse(localStorage.getItem(cloudQueueKey) || "{}");
}

function queueCloudKey(userId, key) {
  if (!userId) return;
  const queue = readCloudQueue();
  queue[userId] = [...new Set([...(queue[userId] || []), key])];
  localStorage.setItem(cloudQueueKey, JSON.stringify(queue));
}

function cloudHeaders(includeAuth = true) {
  const headers = { apikey: cloudConfig.anonKey, "Content-Type": "application/json" };
  if (includeAuth && cloudSession?.access_token) headers.Authorization = `Bearer ${cloudSession.access_token}`;
  return headers;
}

async function cloudRequest(path, options = {}, includeAuth = true) {
  const response = await fetch(`${cloudConfig.url.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { ...cloudHeaders(includeAuth), ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try { message = JSON.parse(body).msg || JSON.parse(body).message || JSON.parse(body).error_description || body; } catch {}
    throw new Error(message || `Cloud request failed (${response.status})`);
  }
  return body ? JSON.parse(body) : null;
}

async function saveCloudDataset(key, payload) {
  if (!cloudSession?.user?.id) return;
  const userId = cloudSession.user.id;
  queueCloudKey(userId, key);
  try {
    await cloudRequest("/rest/v1/routeledger_data?on_conflict=owner_id%2Cdata_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ owner_id: userId, data_key: key, payload, updated_at: new Date().toISOString() })
    });
    const queue = readCloudQueue();
    queue[userId] = (queue[userId] || []).filter((queuedKey) => queuedKey !== key);
    if (!queue[userId].length) delete queue[userId];
    localStorage.setItem(cloudQueueKey, JSON.stringify(queue));
    setCloudStatus(`Cloud sync active · last saved ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setCloudStatus(`Cloud sync pending: ${error.message}. Data is still saved in this browser.`, true);
  }
}

function datasetIdentity(key, item) {
  if (key === historyKey) return item.lrNumber;
  if (key === customerKey || key === locationKey) return item.id || item.name;
  if (key === vehicleKey) return item.id || item.number;
  if (key === jobsKey) return item.id;
  return null;
}

function mergeDataset(key, primary, secondary) {
  if (key === settingsKey) return { ...(secondary || {}), ...(primary || {}) };
  const values = new Map();
  [...(secondary || []), ...(primary || [])].forEach((item) => {
    const identity = datasetIdentity(key, item);
    if (identity) values.set(String(identity), item);
  });
  return [...values.values()];
}

async function hydrateCloudData() {
  const userId = cloudSession.user.id;
  const previousOwner = localStorage.getItem(cloudOwnerKey);
  const sameAccount = !previousOwner || previousOwner === userId;
  const rows = await cloudRequest("/rest/v1/routeledger_data?select=data_key,payload");
  const remote = Object.fromEntries(rows.map((row) => [row.data_key, row.payload]));
  const queuedForUser = readCloudQueue()[userId] || [];
  const migrated = [];
  dataKeys.forEach((key) => {
    const local = JSON.parse(localStorage.getItem(key) || (key === settingsKey ? "{}" : "[]"));
    const hasLocal = key === settingsKey ? Object.keys(local).length > 0 : local.length > 0;
    const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
    let result;
    if (!sameAccount) result = hasRemote ? remote[key] : (key === settingsKey ? {} : []);
    else if (!previousOwner || queuedForUser.includes(key) || !hasRemote) result = mergeDataset(key, local, remote[key]);
    else result = remote[key];
    localStorage.setItem(key, JSON.stringify(result));
    if (sameAccount && hasLocal && (!previousOwner || !hasRemote || queuedForUser.includes(key))) migrated.push(key);
  });
  localStorage.setItem(cloudOwnerKey, userId);
  const settings = JSON.parse(localStorage.getItem(settingsKey) || "{}");
  Object.keys(settings).forEach((id) => { const input = document.getElementById(id); if (input) input.value = settings[id]; });
  renderCustomers();
  renderLocations();
  populateJobOptions();
  renderHistory();
  renderDashboard();
  const queued = [...new Set([...queuedForUser, ...migrated])];
  if (queued.length) {
    setCloudStatus("Migrating saved browser data to your secured cloud account…");
    for (const key of queued) await saveCloudDataset(key, JSON.parse(localStorage.getItem(key) || "null"));
  }
  setCloudStatus(`Cloud sync active · signed in as ${cloudSession.user.email || "account"}`);
}

async function authRequest(path, payload, authToken) {
  const headers = cloudHeaders(false);
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${cloudConfig.url.replace(/\/$/, "")}/auth/v1/${path}`, {
    method: "POST", headers, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || "Authentication failed");
  return result;
}

async function establishCloudSession(session) {
  cloudSession = session;
  localStorage.setItem(cloudSessionKey, JSON.stringify(session));
  try {
    await hydrateCloudData();
    document.body.classList.add("cloud-authenticated");
    document.body.classList.remove("cloud-auth-required");
    document.getElementById("authGate").hidden = true;
    document.getElementById("logoutButton").hidden = false;
    document.getElementById("workspaceStatus").textContent = "Cloud workspace";
  } catch (error) {
    cloudSession = null;
    localStorage.removeItem(cloudSessionKey);
    document.body.classList.remove("cloud-authenticated");
    document.body.classList.add("cloud-auth-required");
    document.getElementById("authGate").hidden = false;
    document.getElementById("logoutButton").hidden = true;
    setAuthMessage(`Could not load protected cloud data: ${error.message}`);
    setCloudStatus(`Cloud connection failed: ${error.message}`, true);
  }
}

function setAuthMessage(message, isError = true) {
  const output = document.getElementById("authMessage");
  output.textContent = message;
  output.classList.toggle("error", isError);
}

function setAuthMode(mode) {
  cloudAuthMode = mode;
  const signup = mode === "signup";
  document.getElementById("authTitle").textContent = signup ? "Create your account" : "Sign in to RouteLedger";
  document.getElementById("authIntro").textContent = signup ? "Create a secure account for your cloud-synced dispatch records." : "Use your account to access your cloud-synced dispatch records.";
  document.getElementById("authSubmit").textContent = signup ? "Create account" : "Sign in";
  document.getElementById("authPassword").autocomplete = signup ? "new-password" : "current-password";
  document.getElementById("authModeToggle").textContent = signup ? "Already have an account? Sign in" : "Need an account? Create one";
  setAuthMessage("");
}

async function startCloudMode() {
  if (!cloudConfig.url && !cloudConfig.anonKey) {
    setCloudStatus("Local storage is active on this browser. Configure Supabase to enable login and cloud sync.");
    return;
  }
  document.body.classList.add("cloud-auth-required");
  document.getElementById("authGate").hidden = false;
  if (!cloudIsConfigured()) {
    setAuthMessage("Cloud setup is incomplete. Add the Supabase project URL and anon key to supabase-config.js.");
    return;
  }
  const stored = JSON.parse(localStorage.getItem(cloudSessionKey) || "null");
  if (!stored?.access_token) return;
  try {
    const refreshed = await authRequest("token?grant_type=refresh_token", { refresh_token: stored.refresh_token });
    await establishCloudSession(refreshed);
  } catch {
    localStorage.removeItem(cloudSessionKey);
    setAuthMessage("Your saved sign-in expired. Please sign in again.", false);
  }
}

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
  return JSON.parse(localStorage.getItem(key) || (key === settingsKey ? "{}" : "[]"));
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  if (cloudSession) void saveCloudDataset(key, value);
}

function getFormData() {
  const data = {};
  fields.forEach((id) => { data[id] = document.getElementById(id).value; });
  data.equipment = document.querySelector('input[name="equipment"]:checked').value;
  data.jobId = document.getElementById("jobId").value;
  return data;
}

function getSelectedJobCapacity(data) {
  const job = readStore(jobsKey).find((item) => item.id === data.jobId);
  if (!job) return { job: null, linked: 0, capacity: 0 };
  const linked = readStore(historyKey).filter((item) => item.jobId === data.jobId && item.lrNumber !== editingLrNumber).length;
  return { job, linked, capacity: Number(job.vehicleCount) || 1 };
}

function validateJobCapacity(data) {
  const { job, linked, capacity } = getSelectedJobCapacity(data);
  if (!job) {
    showToast("Select a valid Job ID before saving the LR");
    return false;
  }
  if (linked >= capacity) {
    showToast(`${job.id} already has ${capacity} LR${capacity === 1 ? "" : "s"} for ${capacity} vehicle${capacity === 1 ? "" : "s"}`);
    return false;
  }
  return true;
}

function makeJobNumber() {
  return `JOB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}

function populateJobOptions() {
  const jobs = readStore(jobsKey);
  const select = document.getElementById("jobId");
  const current = select.value;
  document.getElementById("jobIdOptions").innerHTML = jobs.map((job) => `<option value="${escapeHtml(job.id)}">${escapeHtml(job.consignor)} → ${escapeHtml(job.consignee)} · ${escapeHtml(job.pickup)} → ${escapeHtml(job.delivery)}</option>`).join("");
  select.value = current;
}

function applyJobToLr(jobId, notify = false) {
  const job = readStore(jobsKey).find((item) => item.id.toUpperCase() === jobId.trim().toUpperCase());
  if (!job) return false;
  document.getElementById("jobId").value = job.id;
  document.getElementById("consignor").value = job.consignor;
  document.getElementById("consignee").value = job.consignee;
  document.getElementById("pickup").value = job.pickup;
  document.getElementById("delivery").value = job.delivery;
  document.getElementById("movementType").value = job.movementType || "one-way";
  document.getElementById("returnLocation").value = job.returnLocation || "";
  const equipment = document.querySelector(`input[name="equipment"][value="${job.vehicleType}"]`);
  if (equipment) equipment.checked = true;
  document.getElementById("consignor").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("consignee").dispatchEvent(new Event("change", { bubbles: true }));
  updatePreview();
  if (notify) showToast(`${job.id} details loaded`);
  return true;
}

function populateJobModalOptions() {
  const customers = readStore(customerKey);
  const locations = readStore(locationKey);
  ["jobConsignor", "jobConsignee"].forEach((id) => {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="">Select customer</option>' + customers.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
  });
  ["jobPickup", "jobDelivery"].forEach((id) => {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="">Select location</option>' + locations.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
  });
  const returnSelect = document.getElementById("jobReturnLocation");
  returnSelect.innerHTML = '<option value="">Select return location</option>' + locations.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
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
  const value = (key, fallback = "") => escapeHtml(displayValue(data[key], fallback));
  const date = escapeHtml(formatDate(data.lrDate));
  batch.innerHTML = `
    <article class="word-lr">
      <header class="word-lr-header">
        <div class="word-lr-logo"><img src="logo.jpg" alt="Sravan Shipping Services Private Limited logo" /></div>
        <div class="word-lr-number">LR NO-<br><strong>${value("lrNumber", "2025-26-M06558")}</strong></div>
        <div class="word-lr-jurisdiction">Subject to Visakhapatnam Jurisdiction</div>
        <div class="word-lr-company">SRAVAN SHIPPING SERVICES PVT.<br>LTD.<small>H.O. Plot No. 12, IDA, Block-A, Mindi, Gajuwaka-530012, Andhra Pradesh</small></div>
      </header>
      <table class="word-lr-table">
        <tr><td colspan="4"><b>LOAD From :</b> ${value("pickup", "SRAVAN CFS 1")}</td><td colspan="3"><b>TO :</b> ${value("delivery", "ATCHUTAPURAM")}</td></tr>
        <tr><td colspan="4"><b>Unload At :</b> ${value("delivery", "ATCHUTAPURAM")}</td><td colspan="3"><b>Date :</b> ${date}</td></tr>
        <tr><td colspan="4"><b>Consignor: M/S</b><br>${value("consignor")}</td><td colspan="3"><b>Consignee: M/S</b><br>${value("consignee")}</td></tr>
        <tr><td colspan="4" class="word-lr-address">${value("consignorAddress", "SRAVAN SHIPPING SERVICES PRIVATE LIMITED, PLOT No. 12, IDA, BLOCK A, BESIDE VISAKHA DAIRY, MINDHI, GAJUWAKA, VISAKHAPATNAM - 530012")}</td><td colspan="3" class="word-lr-address">${value("consigneeAddress")}</td></tr>
        <tr><td colspan="4"><b>GSTIN -</b> ${value("consignorGst")}</td><td colspan="3"><b>GSTIN</b> ${value("consigneeGst")}</td></tr>
        <tr class="word-lr-headings"><th>Truck No.</th><th>Packages</th><th colspan="2">Weight</th><th>Description of Product</th><th colspan="2">GTSTIN</th></tr>
        <tr class="word-lr-main"><td rowspan="2">${value("vehicleNumber")}</td><td rowspan="2">${value("packages", "1 FCL @ TANK")}</td><td>Actual</td><td>Charged</td><td rowspan="2"><b>Cont. No :</b> ${value("containerNumber1")}<br><b>BE NO :</b> ${value("beNumber")}<br><b>Invoice No/Date :</b> ${value("invoiceNumber")}<br><b>Cargo :</b> ${value("commodity", data.goodsDescription)}<br><b>D.C. No. :</b> ${value("dcNumber")}<br><b>Way Bill No :</b> ${value("wayBillNumber")}<br><b>AT OWNER'S RISK</b></td><td colspan="2">${value("consigneeGst")}</td></tr>
        <tr class="word-lr-detail"><td colspan="2"><b>Gross</b> - ${value("grossWeight")}<br><b>Tare</b> - ${value("tareWeight")}<br><b>Net</b> - ${value("netWeight")}</td><td colspan="2">FTL / ${data.movementType === "return" ? "ROUND TRIP" : "ONE WAY"}<br>VALUE OF GOODS : ${value("goodsValue", "0")}</td></tr>
        <tr class="word-lr-notice"><td colspan="4"></td><td colspan="3">We have not availed any benefits under notification No.12/2003/St. Dated 20-06-2003 (Refer Notification No. 1/2006/date 01-03-2006)<br><b>To be billed at Visakhapatnam</b></td></tr>
      </table>
      <footer class="word-lr-footer">
        <p>For <b>SRAVAN SHIPPING SERVICES PVT. LTD.</b></p>
        <p>Please take Insurance of the Product in case of Road Accident. We will not be responsible.<br>Goods are accepted subject to Terms &amp; Conditions printed overleaf.</p>
        <div class="word-lr-signature">Authorised Signatory.</div>
        <div class="word-lr-driver"><span>Name of Owner: <b>SSSPL</b></span><span>Name of Driver: ${value("driverName")}</span><span>D.L. No.</span><span>Driver's Signature.</span></div>
      </footer>
    </article>`;
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
  document.getElementById("savedLrCount").textContent = history.length;
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
        <div class="history-actions"><button type="button" data-edit-history-lr="${escapeHtml(item.lrNumber)}">Edit</button><button type="button" data-history-lr="${escapeHtml(item.lrNumber)}">Load</button><button type="button" data-print-history-lr="${escapeHtml(item.lrNumber)}">Print</button></div>
      </div>`).join("");
  }
  renderDashboard(history);
  renderSavedLrs(history);
}

function renderSavedLrs(history = readStore(historyKey)) {
  const query = (document.getElementById("savedLrSearch")?.value || "").toLowerCase().trim();
  const visible = history.filter((item) =>
    [item.lrNumber, item.consignor, item.consignee, item.pickup, item.delivery, item.vehicleNumber]
      .join(" ").toLowerCase().includes(query));
  document.getElementById("savedLrList").innerHTML = visible.map((item) => `
    <article class="saved-lr-row">
      <div class="saved-lr-number"><small>LR NUMBER · ${escapeHtml(formatDate(item.lrDate))}</small><strong>${escapeHtml(item.lrNumber)}</strong></div>
      <div><small>PARTIES</small><strong>${escapeHtml(item.consignor || "—")} → ${escapeHtml(item.consignee || "—")}</strong></div>
      <div><small>ROUTE</small><strong>${escapeHtml(item.pickup || "—")} → ${escapeHtml(item.delivery || "—")}</strong></div>
      <div><small>VEHICLE</small><strong>${escapeHtml(item.vehicleNumber || "Not entered")}</strong></div>
      <div class="saved-lr-actions"><button type="button" data-load-saved-lr="${escapeHtml(item.lrNumber)}">Open</button><button class="button-primary" type="button" data-print-history-lr="${escapeHtml(item.lrNumber)}">Print / PDF</button></div>
    </article>`).join("") || '<div class="empty-state">No saved LRs match your search. Generated receipts will be available here for reprinting.</div>';
}

function saveHistory(data) {
  const history = readStore(historyKey);
  const updated = [data, ...history.filter((item) => item.lrNumber !== data.lrNumber)].slice(0, 100);
  writeStore(historyKey, updated);
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
  target.innerHTML = history.slice(0, 4).map((item) => `<div class="compact-row"><div><small>LR NUMBER</small><strong>${escapeHtml(item.lrNumber)}</strong></div><div><small>ROUTE</small><strong>${escapeHtml(item.pickup || "—")} → ${escapeHtml(item.delivery || "—")}</strong></div><div class="history-actions"><button type="button" data-edit-history-lr="${escapeHtml(item.lrNumber)}">Edit</button><button type="button" data-history-lr="${escapeHtml(item.lrNumber)}">Load</button><button type="button" data-print-history-lr="${escapeHtml(item.lrNumber)}">Print</button></div></div>`).join("") || '<div class="empty-state">No dispatches yet. Create your first LR to see activity here.</div>';
  const jobs = readStore(jobsKey);
  const dashboardJobs = document.getElementById("dashboardJobs");
  dashboardJobs.innerHTML = jobs.slice(0, 4).map((job) => {
    const linked = history.filter((item) => item.jobId === job.id).length;
    return `<div class="compact-row"><div><small>JOB ID</small><strong>${escapeHtml(job.id)}</strong></div><div><small>ROUTE · LRs</small><strong>${escapeHtml(job.pickup)} → ${escapeHtml(job.delivery)}</strong><span>${linked}/${Number(job.vehicleCount) || 1} LRs</span></div><div><small>VEHICLE TYPE</small><strong>${escapeHtml(equipmentNames[job.vehicleType] || job.vehicleType)}</strong></div></div>`;
  }).join("") || '<div class="empty-state">No jobs created yet. Use Create Job to add your first dispatch.</div>';
}

function renderJobs() {
  const jobs = readStore(jobsKey);
  const history = readStore(historyKey);
  const start = document.getElementById("jobsStartDate")?.value || "";
  const end = document.getElementById("jobsEndDate")?.value || "";
  const status = document.getElementById("jobsStatus")?.value || "all";
  const today = new Date().toISOString().slice(0, 10);
  const visible = jobs.filter((item) => {
    const date = item.jobDate || "";
    return (!start || date >= start) && (!end || date <= end)
      && (status === "all" || (status === "today" && date === today) || (status === "return" && item.movementType === "return"));
  });
  document.getElementById("jobsCount").textContent = jobs.length;
  document.getElementById("jobsVisibleCount").textContent = `${visible.length} job${visible.length === 1 ? "" : "s"}`;
  document.getElementById("jobsList").innerHTML = visible.map((item) => {
    const linkedLrs = history.filter((lr) => lr.jobId === item.id);
    return `
    <article class="job-card">
      <div class="job-status">${linkedLrs.length}/${Number(item.vehicleCount) || 1} LR${linkedLrs.length === 1 ? "" : "s"}</div>
      <div class="job-main"><small>JOB ID · ${escapeHtml(formatDate(item.jobDate))}</small><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.consignor)} → ${escapeHtml(item.consignee)}</span></div>
      <div><small>ROUTE</small><strong>${escapeHtml(item.pickup)} → ${escapeHtml(item.delivery)}</strong><span>${item.movementType === "return" ? `Return to ${escapeHtml(item.returnLocation || "origin")}` : "One way"} · ${escapeHtml(equipmentNames[item.vehicleType] || item.vehicleType)}</span></div>
      <div><small>LINKED LR</small><strong>${escapeHtml(linkedLrs[0]?.lrNumber || "Not created")}</strong><span>${linkedLrs.length > 1 ? `+${linkedLrs.length - 1} more` : "Create LR in this job"}</span></div>
      <div class="job-actions"><button type="button" data-job-create-lr="${escapeHtml(item.id)}">Create LR</button>${linkedLrs[0] ? `<button type="button" data-job-load="${escapeHtml(linkedLrs[0].lrNumber)}">Load</button>` : ""}</div>
    </article>`;
  }).join("") || '<div class="empty-state">No jobs match the selected filters. Create a job before creating its LR.</div>';
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
  } else if (id === "vehicleModal") {
    document.getElementById("vehicleForm").reset();
    document.getElementById("vehicleId").value = item?.id || "";
    document.getElementById("masterVehicleNumber").value = item?.number || "";
    document.getElementById("masterVehicleType").value = item?.type || "Container trailer";
    document.getElementById("masterDriverName").value = item?.driver || "";
    document.getElementById("masterDriverMobile").value = item?.mobile || "";
    document.getElementById("vehicleModalTitle").textContent = item ? "Edit vehicle" : "Add vehicle";
  } else if (id === "jobModal") {
    document.getElementById("jobForm").reset();
    document.getElementById("jobNumber").value = makeJobNumber();
    document.getElementById("jobDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("jobMovementType").value = "one-way";
    populateJobModalOptions();
  }
}

function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((modal) => { modal.hidden = true; });
}

function activateView(view) {
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active-view", panel.dataset.panel === view));
  document.getElementById("recent").classList.toggle("active-view", view === "history");
  document.getElementById("mainMenuButton").hidden = view === "dashboard";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".master-tab").forEach((item) => item.classList.toggle("active", item.dataset.masterView === view));
  if (["customers", "locations", "fleet"].includes(view)) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "customers"));
  }
  const copy = { dashboard: ["Operations overview", "A clear view of dispatch activity, customers and fleet readiness."], jobs: ["Jobs / Routes", "Plan, filter and review dispatch jobs created from your LRs."], create: ["Create lorry receipt", "Capture the trip, vehicle and cargo details in one dispatch-ready document."], history: ["LR history", "Search, review and reload previously generated receipts."], savedLrs: ["Saved LRs", "Open or print any previously generated lorry receipt."], customers: ["Customers", "Manage the parties your operations team works with every day."], locations: ["From / To locations", "Manage saved loading, delivery, port and depot locations."], fleet: ["Vehicles & drivers", "Keep equipment and driver contacts ready for dispatch."], settings: ["Company profile", "Manage local workspace preferences and document defaults."] }[view] || null;
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
  populateJobOptions();
  document.getElementById("jobId").value = data.jobId || "";
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
  if (!validateJobCapacity(data)) return;
  if (editingLrNumber) data.lrNumber = editingLrNumber;
  saveHistory(data);
  editingLrNumber = "";
  document.getElementById("vehicleNumber").disabled = false;
  document.getElementById("saveStatus").textContent = "Saved just now";
  showToast(`${data.lrNumber} saved to recent LRs`);
});

function printCurrentLr() {
  window.pendingPrintReturnView = document.querySelector("[data-panel].active-view")?.dataset.panel || "dashboard";
  activateView("create");
  if (!form.reportValidity()) {
    showToast("Complete the required fields before printing");
    return false;
  }
  const data = getFormData();
  const alreadySaved = readStore(historyKey).some((item) => item.lrNumber === data.lrNumber);
  if (!alreadySaved && !validateJobCapacity(data)) return false;
  saveHistory(data);
  renderPrintBatch(data);
  document.body.classList.add("printing-lr");
  document.getElementById("printBatch").getBoundingClientRect();
  window.print();
  return true;
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-lr");
  const returnView = window.pendingPrintReturnView || "dashboard";
  window.pendingPrintReturnView = "";
  activateView(returnView);
});

function printSavedLr(lrNumber) {
  const data = readStore(historyKey).find((item) => item.lrNumber === lrNumber);
  if (!data) {
    showToast("That saved LR could not be found");
    return;
  }
  loadData(data);
  printCurrentLr();
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
  writeStore(historyKey, []);
  renderHistory();
  showToast("Recent LR history cleared");
});

document.getElementById("recentList").addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-history-lr]");
  if (printButton) {
    printSavedLr(printButton.dataset.printHistoryLr);
    return;
  }
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

document.getElementById("savedLrList").addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-history-lr]");
  if (printButton) {
    printSavedLr(printButton.dataset.printHistoryLr);
    return;
  }
  const loadButton = event.target.closest("[data-load-saved-lr]");
  if (loadButton) {
    const item = readStore(historyKey).find((entry) => entry.lrNumber === loadButton.dataset.loadSavedLr);
    if (item) { activateView("create"); loadData(item); }
  }
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
  const printButton = event.target.closest("[data-print-history-lr]");
  if (printButton) {
    printSavedLr(printButton.dataset.printHistoryLr);
    return;
  }
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
document.getElementById("savedLrSearch").addEventListener("input", () => renderSavedLrs());
["jobsStartDate", "jobsEndDate", "jobsStatus"].forEach((id) => document.getElementById(id).addEventListener("input", renderJobs));
document.getElementById("clearJobsFilters").addEventListener("click", () => {
  document.getElementById("jobsStartDate").value = "";
  document.getElementById("jobsEndDate").value = "";
  document.getElementById("jobsStatus").value = "all";
  renderJobs();
});
document.getElementById("jobsList").addEventListener("click", (event) => {
  const createButton = event.target.closest("[data-job-create-lr]");
  if (createButton) {
    activateView("create");
    populateJobOptions();
    const job = readStore(jobsKey).find((item) => item.id === createButton.dataset.jobCreateLr);
    if (job) {
      document.getElementById("consignor").value = job.consignor;
      document.getElementById("consignee").value = job.consignee;
      document.getElementById("pickup").value = job.pickup;
      document.getElementById("delivery").value = job.delivery;
      document.getElementById("movementType").value = job.movementType || "one-way";
      document.getElementById("returnLocation").value = job.returnLocation || "";
      document.querySelector(`input[name="equipment"][value="${job.vehicleType}"]`).checked = true;
      document.getElementById("consignor").dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("consignee").dispatchEvent(new Event("change", { bubbles: true }));
    }
    applyJobToLr(createButton.dataset.jobCreateLr, false);
    updatePreview();
    showToast(`${createButton.dataset.jobCreateLr} selected for new LR`);
    return;
  }
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
document.getElementById("jobId").addEventListener("change", (event) => applyJobToLr(event.target.value, true));
document.getElementById("jobId").addEventListener("blur", (event) => {
  if (event.target.value.trim()) applyJobToLr(event.target.value, true);
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

document.getElementById("jobForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const jobs = readStore(jobsKey);
  const record = {
    id: document.getElementById("jobNumber").value,
    jobDate: document.getElementById("jobDate").value,
    consignor: document.getElementById("jobConsignor").value,
    consignee: document.getElementById("jobConsignee").value,
    pickup: document.getElementById("jobPickup").value,
    delivery: document.getElementById("jobDelivery").value,
    movementType: document.getElementById("jobMovementType").value,
    returnLocation: document.getElementById("jobReturnLocation").value,
    vehicleCount: Number(document.getElementById("jobVehicleCount").value),
    vehicleType: document.getElementById("jobVehicleType").value
  };
  writeStore(jobsKey, [record, ...jobs.filter((item) => item.id !== record.id)]);
  closeModals();
  populateJobOptions();
  renderJobs();
  activateView("jobs");
  showToast(`${record.id} created. Create the LR from this job.`);
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

function exportLocalBackup() {
  const backup = {
    format: "routeledger-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(dataKeys.map((key) => [key, readStore(key)]))
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `routeledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup downloaded");
}

async function importLocalBackup(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (backup.format !== "routeledger-backup" || !backup.data || typeof backup.data !== "object") {
    throw new Error("This is not a RouteLedger backup file.");
  }
  const imported = [];
  for (const key of dataKeys) {
    if (!(key in backup.data)) continue;
    const value = backup.data[key];
    if (key === settingsKey ? (!value || typeof value !== "object" || Array.isArray(value)) : !Array.isArray(value)) {
      throw new Error(`The backup contains invalid data for ${key}.`);
    }
    imported.push([key, value]);
  }
  if (!imported.length) throw new Error("The backup contains no supported RouteLedger data.");
  for (const [key, value] of imported) {
    const merged = mergeDataset(key, value, readStore(key));
    writeStore(key, merged);
  }
  renderCustomers();
  renderLocations();
  populateJobOptions();
  renderHistory();
  renderDashboard();
  showToast("Backup imported and merged with existing records");
}

const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || "null");
if (storedSettings) Object.keys(storedSettings).forEach((id) => { const input = document.getElementById(id); if (input) input.value = storedSettings[id]; });
document.getElementById("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = { settingCompany: document.getElementById("settingCompany").value.trim(), settingContact: document.getElementById("settingContact").value.trim(), settingContactLine: document.getElementById("settingContactLine").value.trim(), settingTerms: document.getElementById("settingTerms").value.trim() };
  writeStore(settingsKey, settings);
  showToast(cloudSession ? "Company profile saved and syncing" : "Company profile saved locally");
});

window.addEventListener("hashchange", () => activateView(window.location.hash.replace("#", "") === "recent" ? "history" : (window.location.hash.replace("#", "") || "dashboard")));
renderCustomers();
renderLocations();
populateJobOptions();
updatePreview();
renderHistory();
activateView(window.location.hash.replace("#", "") === "recent" ? "history" : (window.location.hash.replace("#", "") || "dashboard"));

document.getElementById("exportDataButton").addEventListener("click", exportLocalBackup);
document.getElementById("importDataButton").addEventListener("click", () => document.getElementById("importDataFile").click());
document.getElementById("importDataFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    await importLocalBackup(file);
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("authModeToggle").addEventListener("click", () => setAuthMode(cloudAuthMode === "login" ? "signup" : "login"));
document.getElementById("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cloudIsConfigured()) {
    setAuthMessage("Cloud setup is incomplete. Configure the Supabase URL and anon key first.");
    return;
  }
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const submit = document.getElementById("authSubmit");
  submit.disabled = true;
  submit.textContent = cloudAuthMode === "signup" ? "Creating account…" : "Signing in…";
  try {
    const result = cloudAuthMode === "signup"
      ? await authRequest("signup", { email, password })
      : await authRequest("token?grant_type=password", { email, password });
    if (!result.access_token || !result.user) {
      setAuthMessage("Check your email to confirm the new account, then return here to sign in.", false);
    } else {
      await establishCloudSession(result);
    }
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = cloudAuthMode === "signup" ? "Create account" : "Sign in";
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  const session = cloudSession;
  cloudSession = null;
  localStorage.removeItem(cloudSessionKey);
  document.body.classList.remove("cloud-authenticated");
  document.body.classList.add("cloud-auth-required");
  document.getElementById("authGate").hidden = false;
  document.getElementById("logoutButton").hidden = true;
  document.getElementById("workspaceStatus").textContent = "Local workspace";
  setAuthMessage("");
  setCloudStatus("Signed out. This browser's data remains saved.");
  if (session?.access_token) {
    try {
      await authRequest("logout", {}, session.access_token);
    } catch (error) {
      setCloudStatus(`Signed out locally, but remote sign-out failed: ${error.message}`, true);
    }
  }
});

void startCloudMode();
