/**
 * SUPERVISOR CALL ANALYTICS - ENGINE (app.js)
 * Features:
 * - Landscape Supervisor Leaderboard (all 10 visible together on Mobile & PC)
 * - Skill Breakdown displays 158 instead of Live Chat
 * - Top Date Picker automatically selects Today's Date on load
 * - Dynamic Alignment Sheet lookup (any change in Alignment auto-updates Name/TL/Skill across dashboard)
 */
const GITHUB_PAT = "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";
const GH_OWNER = "albatrosswings202509-dev";
const GH_REPO = "Supervisor-call"; 
const GH_BRANCH = "main";
// Eikhane apnar Google Apps Script Web App URL bosaben:
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzK_0Wf_KIqWOW9isOnuFSSIRbDuJSte6i1QPATz4zWirj4Z62WzaTKvbGrOiY6UJk7mQ/exec"; 

const EXCLUDED_SUPERVISORS = ["kazi md.tareque", "kazi tareque", "kazi md tareque"];

const DEFAULT_SUPERVISORS = [
  "Sattazit Gosh",
  "Sanjida Islam Tinny",
  "Mohammad Imam Hossain",
  "Fahad Hridoy",
  "Faria Sharmin Etu",
  "Mohammad Sabbir Hossain",
  "Nusrat Jahan Tamanna",
  "Md Zahidul Islam Siam",
  "Md Ariful Islam Niloy",
  "Shajjadul Rhythm"
];

let appData = {
  totalAlignedAssociates: 226,
  supervisors: [...DEFAULT_SUPERVISORS],
  calls: [],
  alignment: []
};

let supervisorMode = "monthly";
let tlChartInstance = null;
let trendChartInstance = null;

// Pagination state
let topDataPageSize = 15;
let topAssocPage = 1;
let repeatMsisdnPage = 1;

let callLogPageSize = 15;
let callLogPage = 1;
let filteredCallsCache = [];

function isExcludedSupervisor(name) {
  if (!name) return false;
  return EXCLUDED_SUPERVISORS.includes(String(name).toLowerCase().trim());
}

function sanitizeSupervisorsList() {
  const list = Array.isArray(appData.supervisors) && appData.supervisors.length
    ? appData.supervisors
    : DEFAULT_SUPERVISORS;
  appData.supervisors = list.filter(s => s && !isExcludedSupervisor(s));
}

// Timezone-safe YYYY-MM-DD formatter
function normalizeDate(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return s.slice(0, 10);
}

function getTodayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Reconcile Call records with latest Alignment sheet data so any Alignment edit reflects automatically
function reconcileCallsWithAlignment() {
  const alignMap = {};
  (appData.alignment || []).forEach(a => {
    if (a && a.avaya) {
      alignMap[String(a.avaya).trim()] = a;
    }
  });

  appData.calls = (appData.calls || []).map(c => {
    const avayaKey = String(c.avaya || "").trim();
    const matched = alignMap[avayaKey];
    return {
      ...c,
      date: normalizeDate(c.date),
      csaName: (matched && matched.name) ? matched.name : c.csaName,
      teamLeader: (matched && matched.supervisor) ? matched.supervisor : c.teamLeader,
      skill: (matched && matched.lob) ? matched.lob : c.skill
    };
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Always default top Date selector & Add Call date to Today's Date
  const today = getTodayDateStr();
  const actEl = document.getElementById("activeDateSelect");
  if (actEl) actEl.value = today;
  const inpEl = document.getElementById("inputDate");
  if (inpEl) inpEl.value = today;

  const cachedData = localStorage.getItem("supervisorAppCache");
  if (cachedData) {
    try {
      appData = JSON.parse(cachedData);
      reconcileCallsWithAlignment();
      sanitizeSupervisorsList();
      populateFilterDropdowns();
      renderAll();
    } catch (e) {}
  }

  document.getElementById("activeDateSelect").onchange = () => {
    renderKPIs();
    renderSupervisorLeaderboard();
    renderDailyTrendChart();
  };

  await syncData(false);
  // Auto-poll every 25 seconds so Alignment or Call Details sheet changes update automatically
  setInterval(() => syncData(false), 25000);
});

async function syncData(manual = false) {
  const syncDot = document.getElementById("syncIndicator");
  const syncText = document.getElementById("lastSyncText");
  if (syncDot) syncDot.className = "w-2 h-2 rounded-full bg-cyanGlow animate-ping";
  if (syncText) syncText.textContent = "Syncing with live server...";

  let loaded = false;

  // 1. Live Google Apps Script Endpoint
  if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://script.google.com/")) {
    try {
      const gsRes = await fetch(APPS_SCRIPT_URL + "?action=getData&t=" + Date.now());
      if (gsRes.ok) {
        const gsJson = await gsRes.json();
        if (gsJson && Array.isArray(gsJson.calls)) {
          appData = gsJson;
          loaded = true;
        }
      }
    } catch (e) {}
  }

  // 2. GitHub Raw JSON
  if (!loaded) {
    try {
      const ghRes = await fetch(`https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/data.json?t=` + Date.now());
      if (ghRes.ok) {
        const ghJson = await ghRes.json();
        if (ghJson && Array.isArray(ghJson.calls)) {
          appData = ghJson;
          loaded = true;
        }
      }
    } catch (e) {}
  }

  // 3. Local ./data.json fallback
  if (!loaded) {
    try {
      const localRes = await fetch("./data.json?t=" + Date.now());
      if (localRes.ok) {
        const localJson = await localRes.json();
        if (localJson && Array.isArray(localJson.calls)) {
          appData = localJson;
          loaded = true;
        }
      }
    } catch (e) {}
  }

  if (loaded) {
    reconcileCallsWithAlignment();
    sanitizeSupervisorsList();
    localStorage.setItem("supervisorAppCache", JSON.stringify(appData));
    initializeDateSelectors();
    populateFilterDropdowns();
    renderAll();
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (syncDot) syncDot.className = "w-2 h-2 rounded-full bg-emerald-400";
  if (syncText) syncText.textContent = loaded ? `Live Synced (${nowStr})` : `Ready`;
}

function initializeDateSelectors() {
  const today = getTodayDateStr();
  const act = document.getElementById("activeDateSelect");
  if (act && !act.value) act.value = today;

  const inp = document.getElementById("inputDate");
  if (inp && !inp.value) inp.value = today;
}

function renderAll() {
  sanitizeSupervisorsList();
  renderKPIs();
  renderSupervisorLeaderboard();
  renderTLImpactChart();
  renderDailyTrendChart();
  renderTopAssociates();
  renderRepeatMsisdn();
  applyCallFilters();
}

// ----------------------------------------------------
// 1. TOP KPI CARDS (Skill Breakdown shows 158 instead of Live Chat)
// ----------------------------------------------------
function renderKPIs() {
  const calls = appData.calls || [];
  const activeDate = document.getElementById("activeDateSelect").value;
  const todayCalls = calls.filter(c => c.date === activeDate);
  document.getElementById("kpiMtdCalls").textContent = calls.length;
  document.getElementById("kpiTodayCalls").textContent = `${todayCalls.length} Calls`;

  const inC = calls.filter(c => (c.callType || "").toLowerCase() === "inbound").length;
  const outC = calls.filter(c => (c.callType || "").toLowerCase() === "outbound").length;
  const inPct = calls.length ? Math.round((inC / calls.length) * 100) : 0;

  document.getElementById("kpiInboundPct").textContent = `${inPct}%`;
  document.getElementById("kpiOutboundPct").textContent = `${calls.length ? 100 - inPct : 0}%`;
  document.getElementById("kpiInboundBar").style.width = `${inPct}%`;
  document.getElementById("kpiOutboundBar").style.width = `${calls.length ? 100 - inPct : 0}%`;
  document.getElementById("kpiInboundCount").textContent = inC;
  document.getElementById("kpiOutboundCount").textContent = outC;

  const sc = { "Mass": 0, "Premium": 0, "Retailer-456": 0, "158": 0 };
  calls.forEach(c => {
    const sk = String(c.skill || "").trim();
    if (sk in sc) {
      sc[sk] += 1;
    }
  });
  document.getElementById("kpiSkillBreakdown").innerHTML = Object.entries(sc).map(([k, v]) => `
    <div class="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
      <span class="text-slate-300 font-medium">${k}</span><span class="font-bold text-cyanGlow">${v}</span>
    </div>`).join("");
}

// ----------------------------------------------------
// 2. SUPERVISOR LEADERBOARD (LANDSCAPE COMPACT CARDS - ALL VISIBLE AT ONCE)
// ----------------------------------------------------
function setSupervisorMode(m) {
  supervisorMode = m;
  document.getElementById("supToggleMonthly").className = m === "monthly" ? "px-2.5 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2.5 py-1 rounded text-slate-400";
  document.getElementById("supToggleDaily").className = m === "daily" ? "px-2.5 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2.5 py-1 rounded text-slate-400";
  renderSupervisorLeaderboard();
}

function renderSupervisorLeaderboard() {
  const activeDate = document.getElementById("activeDateSelect").value;
  const src = supervisorMode === "daily"
    ? (appData.calls || []).filter(c => c.date === activeDate)
    : (appData.calls || []);

  const stats = {};
  (appData.supervisors || []).forEach(s => {
    if (!isExcludedSupervisor(s)) {
      stats[s] = { total: 0, inbound: 0, outbound: 0 };
    }
  });

  src.forEach(c => {
    const sup = c.supervisorInCall;
    if (sup && sup !== "#N/A" && !isExcludedSupervisor(sup)) {
      if (!stats[sup]) stats[sup] = { total: 0, inbound: 0, outbound: 0 };
      stats[sup].total += 1;
      if ((c.callType || "").toLowerCase() === "inbound") {
        stats[sup].inbound += 1;
      } else {
        stats[sup].outbound += 1;
      }
    }
  });

  const arr = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, arr[0]?.[1]?.total || 1);

  document.getElementById("supervisorLeaderboardList").innerHTML = arr.map(([name, st], i) => {
    const totalW = Math.round((st.total / max) * 100);
    const inShare = st.total > 0 ? Math.round((st.inbound / st.total) * 100) : 0;
    const outShare = st.total > 0 ? 100 - inShare : 0;

    return `
      <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2 hover:border-cyanGlow/40 transition">
        <div class="flex items-start justify-between gap-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-4 h-4 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-slate-800 text-cyanGlow text-[9px] font-extrabold">${i + 1}</span>
            <span class="font-semibold text-slate-200 text-[11px] sm:text-xs leading-tight truncate" title="${name}">${name}</span>
          </div>
          <span class="font-extrabold text-white bg-slate-800 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0">${st.total}</span>
        </div>
        <div class="flex items-center justify-between gap-1 text-[10px]">
          <span class="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyanGlow border border-cyan-500/30 font-semibold">IN: ${st.inbound}</span>
          <span class="px-1.5 py-0.5 rounded bg-purple-500/15 text-neonViolet border border-purple-500/30 font-semibold">OUT: ${st.outbound}</span>
        </div>
        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full flex rounded-full overflow-hidden transition-all" style="width:${totalW}%">
            <div class="bg-cyanGlow h-full" style="width:${inShare}%"></div>
            <div class="bg-neonViolet h-full" style="width:${outShare}%"></div>
          </div>
        </div>
      </div>`;
  }).join("");
}

// ----------------------------------------------------
// 3. TEAM WISE TRANSFER CHART
// ----------------------------------------------------
function renderTLImpactChart() {
  const tc = {};
  (appData.calls || []).forEach(c => {
    const tl = c.teamLeader || "Unknown";
    tc[tl] = (tc[tl] || 0) + 1;
  });
  const arr = Object.entries(tc).sort((a, b) => b[1] - a[1]);
  if (tlChartInstance) tlChartInstance.destroy();
  tlChartInstance = new Chart(document.getElementById("tlImpactChart"), {
    type: "bar",
    data: {
      labels: arr.map(i => i[0]),
      datasets: [{
        label: "Team Transfers",
        data: arr.map(i => i[1]),
        backgroundColor: "#8b5cf6",
        borderColor: "#00f2fe",
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "#1e293b" } },
        y: { ticks: { color: "#e2e8f0" }, grid: { display: false } }
      }
    }
  });
}

// ----------------------------------------------------
// 4. CALL TREND (BAR ONLY - 30 DAYS VISIBLE TOGETHER)
// ----------------------------------------------------
function renderDailyTrendChart() {
  const activeDateVal = document.getElementById("activeDateSelect").value || getTodayDateStr();
  const refParts = activeDateVal.split("-");
  const year = parseInt(refParts[0], 10) || new Date().getFullYear();
  const month = parseInt(refParts[1], 10) || (new Date().getMonth() + 1);
  const ymPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const days30 = [];
  const dm = {};
  for (let day = 1; day <= 30; day++) {
    const dStr = `${ymPrefix}-${String(day).padStart(2, "0")}`;
    days30.push(dStr);
    dm[dStr] = { i: 0, o: 0, t: 0 };
  }

  (appData.calls || []).forEach(c => {
    if (!c.date) return;
    if (dm[c.date]) {
      dm[c.date].t += 1;
      if ((c.callType || "").toLowerCase() === "inbound") dm[c.date].i += 1;
      else dm[c.date].o += 1;
    }
  });

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mLabel = monthNames[month - 1] || "";
  const labelEl = document.getElementById("trendMonthLabel");
  if (labelEl) labelEl.textContent = `${mLabel} ${year} (30 Days Bar View)`;

  const shortLabels = days30.map(d => `${d.slice(8, 10)} ${mLabel}`);

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(document.getElementById("dailyTrendChart"), {
    type: "bar",
    data: {
      labels: shortLabels,
      datasets: [
        {
          label: "Inbound",
          data: days30.map(d => dm[d].i),
          backgroundColor: "#00f2fe",
          borderRadius: 3
        },
        {
          label: "Outbound",
          data: days30.map(d => dm[d].o),
          backgroundColor: "#8b5cf6",
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#cbd5e1", boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            footer: (items) => {
              const total = items.reduce((sum, it) => sum + (it.parsed.y || 0), 0);
              return `Total Calls: ${total}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#cbd5e1",
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 }
          },
          grid: { color: "rgba(30,41,59,0.5)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#94a3b8", stepSize: 1 },
          grid: { color: "#1e293b" }
        }
      }
    }
  });
}

// ----------------------------------------------------
// 5. TOP TRANSFER DATA (WITH PAGINATION 10/15/25/50)
// ----------------------------------------------------
function switchTrackerTab(t) {
  document.getElementById("tabBtnTopAssoc").className = t === "topAssoc"
    ? "tab-active px-3.5 py-1.5 rounded-lg text-xs font-bold border border-slate-700 whitespace-nowrap"
    : "px-3.5 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-cyanGlow whitespace-nowrap";
  document.getElementById("tabBtnRepeatMsisdn").className = t === "repeatMsisdn"
    ? "tab-active px-3.5 py-1.5 rounded-lg text-xs font-bold border border-slate-700 whitespace-nowrap"
    : "px-3.5 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-cyanGlow whitespace-nowrap";
  document.getElementById("tabPanelTopAssoc").style.display = t === "topAssoc" ? "block" : "none";
  document.getElementById("tabPanelRepeatMsisdn").style.display = t === "repeatMsisdn" ? "block" : "none";
}

function changeTopDataPageSize() {
  topDataPageSize = parseInt(document.getElementById("topDataPageSize").value, 10) || 15;
  topAssocPage = 1;
  repeatMsisdnPage = 1;
  renderTopAssociates();
  renderRepeatMsisdn();
}

function changeTopAssocPage(delta) {
  topAssocPage += delta;
  renderTopAssociates();
}

function renderTopAssociates() {
  const m = {};
  (appData.calls || []).forEach(c => {
    const k = c.avaya || c.csaName;
    if (!m[k]) m[k] = { avaya: c.avaya, name: c.csaName, tl: c.teamLeader, sk: c.skill, cnt: 0 };
    m[k].cnt++;
  });
  const arr = Object.values(m).sort((a, b) => b.cnt - a.cnt);

  const totalItems = arr.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / topDataPageSize));
  if (topAssocPage > totalPages) topAssocPage = totalPages;
  if (topAssocPage < 1) topAssocPage = 1;

  const startIdx = (topAssocPage - 1) * topDataPageSize;
  const pageItems = arr.slice(startIdx, startIdx + topDataPageSize);

  document.getElementById("topAssociatesBody").innerHTML = pageItems.map((a, i) => `
    <tr class="border-b border-slate-800 hover:bg-slate-900">
      <td class="p-2 text-cyanGlow font-bold whitespace-nowrap">#${startIdx + i + 1}</td>
      <td class="p-2 whitespace-nowrap">${a.avaya}</td>
      <td class="p-2 text-white font-semibold whitespace-nowrap">${a.name}</td>
      <td class="p-2 whitespace-nowrap">${a.tl}</td>
      <td class="p-2 whitespace-nowrap">${a.sk}</td>
      <td class="p-2 font-bold text-neonViolet whitespace-nowrap">${a.cnt}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="p-4 text-slate-500">No associate transfer data found.</td></tr>`;

  document.getElementById("topAssocPageInfo").textContent = totalItems
    ? `Showing ${startIdx + 1}-${Math.min(startIdx + topDataPageSize, totalItems)} of ${totalItems}`
    : "Showing 0 of 0";
  document.getElementById("topAssocPageIndicator").textContent = `Page ${topAssocPage} of ${totalPages}`;
  document.getElementById("topAssocPrevBtn").disabled = topAssocPage <= 1;
  document.getElementById("topAssocNextBtn").disabled = topAssocPage >= totalPages;
}

function changeRepeatMsisdnPage(delta) {
  repeatMsisdnPage += delta;
  renderRepeatMsisdn();
}

function renderRepeatMsisdn() {
  const m = {};
  (appData.calls || []).forEach(c => {
    const k = c.msisdn;
    if (!k) return;
    if (!m[k]) m[k] = { m: k, cnt: 0, dt: c.date, sup: c.supervisorInCall };
    m[k].cnt++;
    if (c.date >= m[k].dt) {
      m[k].dt = c.date;
      m[k].sup = c.supervisorInCall;
    }
  });
  const arr = Object.values(m).sort((a, b) => b.cnt - a.cnt);

  const totalItems = arr.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / topDataPageSize));
  if (repeatMsisdnPage > totalPages) repeatMsisdnPage = totalPages;
  if (repeatMsisdnPage < 1) repeatMsisdnPage = 1;

  const startIdx = (repeatMsisdnPage - 1) * topDataPageSize;
  const pageItems = arr.slice(startIdx, startIdx + topDataPageSize);

  document.getElementById("repeatMsisdnBody").innerHTML = pageItems.map((a, i) => `
    <tr class="border-b border-slate-800 hover:bg-slate-900">
      <td class="p-2 whitespace-nowrap">#${startIdx + i + 1}</td>
      <td class="p-2 text-cyanGlow cursor-pointer font-bold whitespace-nowrap" onclick="openMsisdnModal('${a.m}')">${a.m}</td>
      <td class="p-2 font-bold ${a.cnt > 1 ? 'text-rose-400' : 'text-white'} whitespace-nowrap">${a.cnt} Calls</td>
      <td class="p-2 whitespace-nowrap">${a.dt}</td>
      <td class="p-2 text-neonViolet whitespace-nowrap">${a.sup}</td>
      <td class="p-2 whitespace-nowrap"><button onclick="openMsisdnModal('${a.m}')" class="text-xs bg-slate-800 px-2 py-1 rounded">View</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="p-4 text-slate-500">No MSISDN data found.</td></tr>`;

  document.getElementById("repeatMsisdnPageInfo").textContent = totalItems
    ? `Showing ${startIdx + 1}-${Math.min(startIdx + topDataPageSize, totalItems)} of ${totalItems}`
    : "Showing 0 of 0";
  document.getElementById("repeatMsisdnPageIndicator").textContent = `Page ${repeatMsisdnPage} of ${totalPages}`;
  document.getElementById("repeatMsisdnPrevBtn").disabled = repeatMsisdnPage <= 1;
  document.getElementById("repeatMsisdnNextBtn").disabled = repeatMsisdnPage >= totalPages;
}

// ----------------------------------------------------
// 6. DAY-WISE TRANSFER FILTER & PAGINATION (UP TO 50)
// ----------------------------------------------------
function populateFilterDropdowns() {
  const s = [...new Set([...(appData.supervisors || []), ...(appData.calls || []).map(c => c.supervisorInCall)])]
    .filter(x => x && x !== "#N/A" && !isExcludedSupervisor(x));
  const t = [...new Set([...(appData.alignment || []).map(a => a.supervisor), ...(appData.calls || []).map(c => c.teamLeader)])].filter(Boolean);
  const sk = [...new Set([...(appData.alignment || []).map(a => a.lob), ...(appData.calls || []).map(c => c.skill)])].filter(Boolean);
  const html = (arr, lbl) => `<option value="ALL">${lbl}</option>` + arr.map(x => `<option value="${x}">${x}</option>`).join("");
  document.getElementById("filterSupervisor").innerHTML = html(s, "All");
  document.getElementById("filterTL").innerHTML = html(t, "All");
  document.getElementById("filterSkill").innerHTML = html(sk, "All");
}

function onFilterInput() {
  callLogPage = 1;
  applyCallFilters();
}

function changeCallLogPageSize() {
  callLogPageSize = parseInt(document.getElementById("callLogPageSize").value, 10) || 15;
  callLogPage = 1;
  renderCallLogPage();
}

function changeCallLogPage(delta) {
  callLogPage += delta;
  renderCallLogPage();
}

function applyCallFilters() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  const eD = document.getElementById("filterExactDate").value;
  const sD = document.getElementById("filterStartDate").value;
  const enD = document.getElementById("filterEndDate").value;
  const sup = document.getElementById("filterSupervisor").value;
  const tl = document.getElementById("filterTL").value;
  const sk = document.getElementById("filterSkill").value;
  const typ = document.getElementById("filterCallType").value;

  filteredCallsCache = (appData.calls || []).filter(c => {
    const d = c.date;
    const mQ = !q || String(c.avaya).toLowerCase().includes(q) || String(c.csaName).toLowerCase().includes(q) || String(c.msisdn).toLowerCase().includes(q);

    let mDate = true;
    if (eD) {
      mDate = (d === eD);
    } else {
      if (sD && d < sD) mDate = false;
      if (enD && d > enD) mDate = false;
    }

    return mQ && mDate && (sup === "ALL" || c.supervisorInCall === sup) && (tl === "ALL" || c.teamLeader === tl) && (sk === "ALL" || c.skill === sk) && (typ === "ALL" || c.callType === typ);
  });

  document.getElementById("filteredCallCountBadge").textContent = `${filteredCallsCache.length} Records`;
  renderCallLogPage();
}

function renderCallLogPage() {
  const totalItems = filteredCallsCache.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / callLogPageSize));
  if (callLogPage > totalPages) callLogPage = totalPages;
  if (callLogPage < 1) callLogPage = 1;

  const startIdx = (callLogPage - 1) * callLogPageSize;
  const pageItems = filteredCallsCache.slice(startIdx, startIdx + callLogPageSize);

  document.getElementById("callLogTableBody").innerHTML = pageItems.map((c, i) => `
    <tr class="hover:bg-slate-900 border-b border-slate-800">
      <td class="p-2 text-slate-500 whitespace-nowrap">${startIdx + i + 1}</td>
      <td class="p-2 whitespace-nowrap">${c.date}</td>
      <td class="p-2 text-cyanGlow font-bold cursor-pointer whitespace-nowrap" onclick="openMsisdnModal('${c.msisdn}')">${c.msisdn}</td>
      <td class="p-2 whitespace-nowrap">${c.avaya}</td>
      <td class="p-2 text-white whitespace-nowrap">${c.csaName}</td>
      <td class="p-2 whitespace-nowrap">${c.teamLeader}</td>
      <td class="p-2 whitespace-nowrap">${c.skill}</td>
      <td class="p-2 text-neonViolet font-semibold whitespace-nowrap">${c.supervisorInCall}</td>
      <td class="p-2 whitespace-nowrap"><span class="px-2 py-0.5 rounded text-[9px] border ${c.callType === 'Inbound' ? 'border-cyan-500/50 text-cyan-400' : 'border-purple-500/50 text-purple-400'}">${c.callType}</span></td>
      <td class="p-2 text-slate-400 min-w-[120px]">${c.remarks || "-"}</td>
    </tr>`).join("") || `<tr><td colspan="10" class="p-6 text-slate-500">No records match the filter.</td></tr>`;

  document.getElementById("callLogPageInfo").textContent = totalItems
    ? `Showing ${startIdx + 1}-${Math.min(startIdx + callLogPageSize, totalItems)} of ${totalItems}`
    : "Showing 0 of 0";
  document.getElementById("callLogPageIndicator").textContent = `Page ${callLogPage} of ${totalPages}`;
  document.getElementById("callLogPrevBtn").disabled = callLogPage <= 1;
  document.getElementById("callLogNextBtn").disabled = callLogPage >= totalPages;
}

function resetCallFilters() {
  ["searchInput", "filterExactDate", "filterStartDate", "filterEndDate"].forEach(id => document.getElementById(id).value = "");
  ["filterSupervisor", "filterTL", "filterSkill", "filterCallType"].forEach(id => document.getElementById(id).value = "ALL");
  callLogPage = 1;
  applyCallFilters();
}

// ----------------------------------------------------
// 7. MODALS & INSTANT ADD CALL SYNC
// ----------------------------------------------------
function openMsisdnModal(m) {
  document.getElementById("modalMsisdnTitle").textContent = m;
  document.getElementById("msisdnHistoryList").innerHTML = (appData.calls || []).filter(c => c.msisdn === m).map(c => `
    <div class="p-3 bg-slate-900 rounded border border-slate-800">
      <div class="font-bold text-cyanGlow">${c.date}</div>
      <div class="mt-1">CSA: ${c.csaName} | TL: ${c.teamLeader}</div>
      <div>Supervisor: <span class="text-neonViolet font-bold">${c.supervisorInCall}</span> (${c.callType})</div>
    </div>`).join("");
  document.getElementById("msisdnModal").classList.remove("hidden");
}
function closeMsisdnModal() { document.getElementById("msisdnModal").classList.add("hidden"); }
function openAddCallModal() {
  document.getElementById("inputDate").value = getTodayDateStr();
  document.getElementById("addCallModal").classList.remove("hidden");
}
function closeAddCallModal() { document.getElementById("addCallModal").classList.add("hidden"); document.getElementById("submitStatusMsg").classList.add("hidden"); }

function autoFillAgentByAvaya(v) {
  const a = (appData.alignment || []).find(x => String(x.avaya).trim() === String(v).trim());
  if (a) {
    document.getElementById("inputCsaName").value = a.name;
    document.getElementById("inputTeamLeader").value = a.supervisor;
    document.getElementById("inputSkill").value = a.lob;
  }
}

async function submitNewCall(e) {
  e.preventDefault();
  const nc = {
    date: normalizeDate(document.getElementById("inputDate").value),
    msisdn: document.getElementById("inputMsisdn").value.trim(),
    avaya: document.getElementById("inputAvaya").value.trim(),
    csaName: document.getElementById("inputCsaName").value.trim(),
    teamLeader: document.getElementById("inputTeamLeader").value.trim(),
    skill: document.getElementById("inputSkill").value,
    supervisorInCall: document.getElementById("inputSupervisorInCall").value,
    callType: document.getElementById("inputCallType").value,
    remarks: document.getElementById("inputRemarks").value.trim()
  };

  const msg = document.getElementById("submitStatusMsg");
  msg.classList.remove("hidden");
  msg.className = "text-xs p-2 rounded bg-cyan-900 text-cyanGlow mt-2";
  msg.textContent = "Syncing instantly...";
  const btn = document.getElementById("submitCallBtn");
  btn.disabled = true;

  // 1. Update UI & LocalStorage Immediately
  appData.calls.unshift(nc);
  reconcileCallsWithAlignment();
  localStorage.setItem("supervisorAppCache", JSON.stringify(appData));
  document.getElementById("activeDateSelect").value = nc.date;
  renderAll();

  // 2. Push to Google Sheet & GitHub
  try {
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://")) {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "addCall", payload: nc })
      });
      msg.className = "text-xs p-2 rounded bg-emerald-900 text-emerald-400 mt-2";
      msg.textContent = "✓ Added to Sheet & GitHub!";
    } else {
      msg.className = "text-xs p-2 rounded bg-amber-900 text-amber-400 mt-2";
      msg.textContent = "Added locally. App Script URL missing.";
    }
  } catch (err) {
    msg.textContent = "Added locally. Background sync error.";
  }

  setTimeout(() => {
    document.getElementById("addCallForm").reset();
    closeAddCallModal();
    btn.disabled = false;
  }, 1500);
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  document.body.classList.toggle("dark");
}
