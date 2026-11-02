/**
 * SUPERVISOR CALL ANALYTICS - ENGINE
 * Features: Instant UI Update, Perfect Date Filter, localStorage Cache
 */
const GH_OWNER = "albatrosswings202509-dev";
const GH_REPO = "Supervisor-call"; 
const GH_BRANCH = "main";
// Eikhane URL Obosshoi Diben!
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzK_0Wf_KIqWOW9isOnuFSSIRbDuJSte6i1QPATz4zWirj4Z62WzaTKvbGrOiY6UJk7mQ/exec"; 

let appData = {
  totalAlignedAssociates: 226,
  supervisors: ["Sattazit Gosh", "Sanjida Islam Tinny", "Mohammad Imam Hossain", "Fahad Hridoy", "Faria Sharmin Etu", "Mohammad Sabbir Hossain", "Nusrat Jahan Tamanna", "Kazi Md.Tareque", "Md Zahidul Islam Siam", "Md Ariful Islam Niloy", "Shajjadul Rhythm"],
  calls: [],
  alignment: []
};

let supervisorMode = "monthly";
let trendChartType = "line"; 
let tlChartInstance = null; let trendChartInstance = null;

function normalizeDate(raw) {
  if (!raw) return ""; const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. INSTANT LOAD FROM CACHE (NO DELAY)
  const cachedData = localStorage.getItem("supervisorAppCache");
  if (cachedData) {
    try { 
      appData = JSON.parse(cachedData); 
      if(appData.calls) appData.calls = appData.calls.map(c => ({...c, date: normalizeDate(c.date)}));
      initializeDateSelectors(); populateFilterDropdowns(); renderAll(); 
    } catch (e) {}
  }
  
  document.getElementById("activeDateSelect").onchange = () => { renderKPIs(); renderSupervisorLeaderboard(); };
  
  // 2. BACKGROUND FETCH FOR NEWEST DATA
  await syncData(false);
});

async function syncData(manual = false) {
  const syncIndicator = document.getElementById("syncIndicator");
  if (syncIndicator) syncIndicator.className = "w-2 h-2 rounded-full bg-cyanGlow animate-ping";
  
  let loaded = false;

  // Best: Fetch from Apps Script (Directly from Sheet)
  if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://script.google.com/")) {
    try {
      const gsRes = await fetch(APPS_SCRIPT_URL + "?action=getData&t=" + Date.now());
      if (gsRes.ok) { const gsJson = await gsRes.json(); if (gsJson && Array.isArray(gsJson.calls)) { appData = gsJson; loaded = true; }}
    } catch (e) {}
  }

  // Fallback: GitHub JSON
  if (!loaded) {
    try {
      const ghRes = await fetch(`https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/data.json?t=` + Date.now());
      if (ghRes.ok) { const ghJson = await ghRes.json(); if (ghJson && Array.isArray(ghJson.calls)) { appData = ghJson; loaded = true; }}
    } catch (e) {}
  }

  if (loaded) {
    appData.calls = appData.calls.map(c => ({...c, date: normalizeDate(c.date)}));
    localStorage.setItem("supervisorAppCache", JSON.stringify(appData));
    initializeDateSelectors(); populateFilterDropdowns(); renderAll();
  }

  if (syncIndicator) syncIndicator.className = "w-2 h-2 rounded-full bg-emerald-400";
}

function initializeDateSelectors() {
  const dates = [...new Set((appData.calls || []).map(c => c.date))].filter(Boolean).sort();
  const latest = dates.length > 0 ? dates[dates.length - 1] : "";
  const act = document.getElementById("activeDateSelect"); if (act && !act.value) act.value = latest;
  const inp = document.getElementById("inputDate"); if (inp && !inp.value) inp.value = latest;
}

function calculateTenure(dojStr) {
  if (!dojStr || String(dojStr).includes("#")) return "N/A";
  const doj = new Date(dojStr); if (isNaN(doj.getTime())) return dojStr;
  const now = new Date(); const diffDays = Math.max(0, Math.floor((now - doj) / (1000 * 60 * 60 * 24)));
  const years = Math.floor(diffDays / 365); const months = Math.floor((diffDays % 365) / 30);
  if (years > 0) return `${years}y ${months}m`; if (months > 0) return `${months}m`; return `${diffDays} days`;
}

function renderAll() {
  renderKPIs(); renderSupervisorLeaderboard(); renderTLImpactChart(); renderDailyTrendChart();
  applyCallFilters(); renderTopAssociates(); renderRepeatMsisdn();
}

// ----------------------------------------------------
// KPIs & CHARTS
// ----------------------------------------------------
function renderKPIs() {
  const calls = appData.calls || [];
  const activeDate = document.getElementById("activeDateSelect").value;
  const todayCalls = calls.filter(c => c.date === activeDate);
  document.getElementById("kpiMtdCalls").textContent = calls.length;
  document.getElementById("kpiTodayCalls").textContent = `${todayCalls.length} Calls`;

  const inC = calls.filter(c => (c.callType||"").toLowerCase() === "inbound").length;
  const outC = calls.filter(c => (c.callType||"").toLowerCase() === "outbound").length;
  const inPct = calls.length ? Math.round((inC/calls.length)*100) : 0;
  
  document.getElementById("kpiInboundPct").textContent = `${inPct}%`;
  document.getElementById("kpiOutboundPct").textContent = `${calls.length ? 100-inPct : 0}%`;
  document.getElementById("kpiInboundBar").style.width = `${inPct}%`;
  document.getElementById("kpiOutboundBar").style.width = `${calls.length ? 100-inPct : 0}%`;
  document.getElementById("kpiInboundCount").textContent = inC;
  document.getElementById("kpiOutboundCount").textContent = outC;

  const sc = { "Mass":0, "Premium":0, "Retailer-456":0, "Live Chat":0 };
  calls.forEach(c => { sc[c.skill||"Other"] = (sc[c.skill||"Other"]||0)+1; });
  document.getElementById("kpiSkillBreakdown").innerHTML = Object.entries(sc).map(([k,v]) => `
    <div class="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
      <span class="text-slate-300 font-medium">${k}</span><span class="font-bold text-cyanGlow">${v}</span>
    </div>`).join("");
}

function setSupervisorMode(m) {
  supervisorMode = m;
  document.getElementById("supToggleMonthly").className = m === "monthly" ? "px-2 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2 py-1 rounded text-slate-400";
  document.getElementById("supToggleDaily").className = m === "daily" ? "px-2 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2 py-1 rounded text-slate-400";
  renderSupervisorLeaderboard();
}

function renderSupervisorLeaderboard() {
  const activeDate = document.getElementById("activeDateSelect").value;
  const src = supervisorMode === "daily" ? (appData.calls||[]).filter(c => c.date === activeDate) : (appData.calls||[]);
  const cnt = {}; (appData.supervisors||[]).forEach(s => cnt[s]=0);
  src.forEach(c => { if(c.supervisorInCall && c.supervisorInCall!=="#N/A") cnt[c.supervisorInCall] = (cnt[c.supervisorInCall]||0)+1; });
  
  const arr = Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(1, arr[0]?.[1]||1);
  document.getElementById("supervisorLeaderboardList").innerHTML = arr.map(([n,v],i) => `
    <div class="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5">
      <div class="flex justify-between text-xs items-center">
        <span class="font-semibold text-slate-200"><span class="w-4 h-4 inline-flex items-center justify-center rounded-full bg-slate-800 text-cyanGlow mr-2 text-[9px]">${i+1}</span>${n}</span>
        <span class="font-bold text-cyanGlow">${v} calls</span>
      </div>
      <div class="w-full h-1 bg-slate-800 rounded-full"><div class="h-full bg-cyanGlow rounded-full" style="width:${(v/max)*100}%"></div></div>
    </div>`).join("");
}

function renderTLImpactChart() {
  const tc = {}; (appData.calls||[]).forEach(c => { tc[c.teamLeader||"Unknown"] = (tc[c.teamLeader||"Unknown"]||0)+1; });
  const arr = Object.entries(tc).sort((a,b)=>b[1]-a[1]);
  if(tlChartInstance) tlChartInstance.destroy();
  tlChartInstance = new Chart(document.getElementById("tlImpactChart"), {
    type: "bar", data: { labels: arr.map(i=>i[0]), datasets: [{ data: arr.map(i=>i[1]), backgroundColor: "#8b5cf6", borderRadius: 3 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales: { x:{grid:{color:"#1e293b"}}, y:{grid:{display:false}} } }
  });
}

function setTrendChartType(t) {
  trendChartType = t;
  document.getElementById("trendBtnLine").className = t==="line" ? "px-2 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2 py-1 rounded text-slate-400";
  document.getElementById("trendBtnBar").className = t==="bar" ? "px-2 py-1 rounded bg-cyanGlow text-obsidian font-bold" : "px-2 py-1 rounded text-slate-400";
  renderDailyTrendChart();
}

function renderDailyTrendChart() {
  const dm = {}; (appData.calls||[]).forEach(c => {
    if(!c.date) return; if(!dm[c.date]) dm[c.date] = {t:0, i:0, o:0};
    dm[c.date].t++; if((c.callType||"").toLowerCase()==="inbound") dm[c.date].i++; else dm[c.date].o++;
  });
  let dts = Object.keys(dm).sort();
  if(dts.length === 1) { 
    const bd = new Date(dts[0]); const p = new Date(bd); p.setDate(p.getDate()-1); const n = new Date(bd); n.setDate(n.getDate()+1);
    dts = [p.toISOString().slice(0,10), dts[0], n.toISOString().slice(0,10)];
    dm[dts[0]]={t:0,i:0,o:0}; dm[dts[2]]={t:0,i:0,o:0};
  }
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(document.getElementById("dailyTrendChart"), {
    type: trendChartType,
    data: { labels: dts, datasets: [
      { label:"Total", data:dts.map(d=>dm[d].t), borderColor:"#00f2fe", backgroundColor: trendChartType==="line"?"rgba(0,242,254,0.1)":"#00f2fe", fill:true, tension:0.3 },
      { label:"Inbound", data:dts.map(d=>dm[d].i), borderColor:"#8b5cf6", backgroundColor:"#8b5cf6", borderDash:trendChartType==="line"?[4,4]:[], tension:0.3 },
      { label:"Outbound", data:dts.map(d=>dm[d].o), borderColor:"#10b981", backgroundColor:"#10b981", tension:0.3 }
    ]},
    options: { responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{color:"#1e293b"}}, y:{grid:{color:"#1e293b"}} } }
  });
}

// ----------------------------------------------------
// DATE FILTER FIX LOGIC
// ----------------------------------------------------
function populateFilterDropdowns() {
  const s = [...new Set((appData.calls||[]).map(c=>c.supervisorInCall))].filter(x=>x&&x!=="#N/A");
  const t = [...new Set((appData.calls||[]).map(c=>c.teamLeader))].filter(Boolean);
  const sk = [...new Set((appData.calls||[]).map(c=>c.skill))].filter(Boolean);
  const html = (arr, lbl) => `<option value="ALL">${lbl}</option>` + arr.map(x=>`<option value="${x}">${x}</option>`).join("");
  document.getElementById("filterSupervisor").innerHTML = html(s, "All");
  document.getElementById("filterTL").innerHTML = html(t, "All");
  document.getElementById("filterSkill").innerHTML = html(sk, "All");
}

function applyCallFilters() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  const eD = document.getElementById("filterExactDate").value; // e.g. "2026-11-01"
  const sD = document.getElementById("filterStartDate").value;
  const enD = document.getElementById("filterEndDate").value;
  const sup = document.getElementById("filterSupervisor").value;
  const tl = document.getElementById("filterTL").value;
  const sk = document.getElementById("filterSkill").value;
  const typ = document.getElementById("filterCallType").value;

  const f = (appData.calls||[]).filter(c => {
    const d = c.date;
    const mQ = !q || String(c.avaya).includes(q) || String(c.csaName).toLowerCase().includes(q) || String(c.msisdn).includes(q);
    
    // DATE FILTER LOGIC
    let mDate = true;
    if (eD) {
      mDate = (d === eD); 
    } else {
      if (sD && d < sD) mDate = false;
      if (enD && d > enD) mDate = false;
    }

    return mQ && mDate && (sup==="ALL"||c.supervisorInCall===sup) && (tl==="ALL"||c.teamLeader===tl) && (sk==="ALL"||c.skill===sk) && (typ==="ALL"||c.callType===typ);
  });
  
  document.getElementById("filteredCallCountBadge").textContent = `${f.length} Records`;
  
  document.getElementById("callLogTableBody").innerHTML = f.map((c,i)=>`
    <tr class="hover:bg-slate-900 border-b border-slate-800">
      <td class="p-2 text-slate-500">${i+1}</td><td class="p-2">${c.date}</td>
      <td class="p-2 text-cyanGlow font-bold cursor-pointer" onclick="openMsisdnModal('${c.msisdn}')">${c.msisdn}</td>
      <td class="p-2">${c.avaya}</td><td class="p-2 text-white">${c.csaName}</td>
      <td class="p-2">${c.teamLeader}</td><td class="p-2">${c.skill}</td>
      <td class="p-2 text-neonViolet font-semibold">${c.supervisorInCall}</td>
      <td class="p-2"><span class="px-2 py-0.5 rounded text-[9px] border ${c.callType==='Inbound'?'border-cyan-500/50 text-cyan-400':'border-purple-500/50 text-purple-400'}">${c.callType}</span></td>
      <td class="p-2 text-slate-400">${c.remarks||"-"}</td>
    </tr>`).join("") || `<tr><td colspan="10" class="p-6 text-slate-500">No records match the filter.</td></tr>`;
}

function resetCallFilters() {
  ["searchInput","filterExactDate","filterStartDate","filterEndDate"].forEach(id=>document.getElementById(id).value="");
  ["filterSupervisor","filterTL","filterSkill","filterCallType"].forEach(id=>document.getElementById(id).value="ALL");
  applyCallFilters();
}

// ----------------------------------------------------
// TABS & MODALS
// ----------------------------------------------------
function switchTrackerTab(t) {
  document.getElementById("tabBtnTopAssoc").className = t==="topAssoc" ? "tab-active px-4 py-1.5 rounded-lg text-xs font-bold border border-slate-700" : "px-4 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-cyanGlow";
  document.getElementById("tabBtnRepeatMsisdn").className = t==="repeatMsisdn" ? "tab-active px-4 py-1.5 rounded-lg text-xs font-bold border border-slate-700" : "px-4 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-cyanGlow";
  document.getElementById("tabPanelTopAssoc").style.display = t==="topAssoc" ? "block" : "none";
  document.getElementById("tabPanelRepeatMsisdn").style.display = t==="repeatMsisdn" ? "block" : "none";
}

function renderTopAssociates() {
  const m = {}; (appData.calls||[]).forEach(c => {
    const k = c.avaya; if(!m[k]) m[k]={avaya:k, name:c.csaName, tl:c.teamLeader, sk:c.skill, cnt:0}; m[k].cnt++;
  });
  const arr = Object.values(m).sort((a,b)=>b.cnt-a.cnt);
  document.getElementById("topAssociatesBody").innerHTML = arr.map((a,i)=>`
    <tr class="border-b border-slate-800 hover:bg-slate-900">
      <td class="p-2 text-cyanGlow font-bold">#${i+1}</td><td class="p-2">${a.avaya}</td><td class="p-2 text-white font-semibold">${a.name}</td>
      <td class="p-2">${a.tl}</td><td class="p-2">${a.sk}</td><td class="p-2 font-bold text-neonViolet">${a.cnt}</td>
    </tr>`).join("");
}

function renderRepeatMsisdn() {
  const m = {}; (appData.calls||[]).forEach(c => {
    const k = c.msisdn; if(!m[k]) m[k]={m:k, cnt:0, dt:c.date, sup:c.supervisorInCall};
    m[k].cnt++; if(c.date>=m[k].dt) { m[k].dt=c.date; m[k].sup=c.supervisorInCall; }
  });
  const arr = Object.values(m).sort((a,b)=>b.cnt-a.cnt).slice(0,15);
  document.getElementById("repeatMsisdnBody").innerHTML = arr.map((a,i)=>`
    <tr class="border-b border-slate-800 hover:bg-slate-900">
      <td class="p-2">#${i+1}</td><td class="p-2 text-cyanGlow cursor-pointer font-bold" onclick="openMsisdnModal('${a.m}')">${a.m}</td>
      <td class="p-2 font-bold ${a.cnt>1?'text-rose-400':'text-white'}">${a.cnt} Calls</td>
      <td class="p-2">${a.dt}</td><td class="p-2 text-neonViolet">${a.sup}</td>
      <td class="p-2"><button onclick="openMsisdnModal('${a.m}')" class="text-xs bg-slate-800 px-2 py-1 rounded">View</button></td>
    </tr>`).join("");
}

function openMsisdnModal(m) {
  document.getElementById("modalMsisdnTitle").textContent = m;
  document.getElementById("msisdnHistoryList").innerHTML = (appData.calls||[]).filter(c=>c.msisdn===m).map(c=>`
    <div class="p-3 bg-slate-900 rounded border border-slate-800">
      <div class="font-bold text-cyanGlow">${c.date}</div>
      <div class="mt-1">CSA: ${c.csaName} | TL: ${c.teamLeader}</div>
      <div>Supervisor: <span class="text-neonViolet font-bold">${c.supervisorInCall}</span></div>
    </div>`).join("");
  document.getElementById("msisdnModal").classList.remove("hidden");
}
function closeMsisdnModal() { document.getElementById("msisdnModal").classList.add("hidden"); }
function openAddCallModal() { document.getElementById("addCallModal").classList.remove("hidden"); }
function closeAddCallModal() { document.getElementById("addCallModal").classList.add("hidden"); document.getElementById("submitStatusMsg").classList.add("hidden"); }

function autoFillAgentByAvaya(v) {
  const a = (appData.alignment||[]).find(x=>String(x.avaya)===String(v));
  if(a) { document.getElementById("inputCsaName").value=a.name; document.getElementById("inputTeamLeader").value=a.supervisor; document.getElementById("inputSkill").value=a.lob; }
}

// ----------------------------------------------------
// IMMEDIATE UPDATE LOGIC (MAGIC FIX)
// ----------------------------------------------------
async function submitNewCall(e) {
  e.preventDefault();
  const nc = {
    date: document.getElementById("inputDate").value, msisdn: document.getElementById("inputMsisdn").value,
    avaya: document.getElementById("inputAvaya").value, csaName: document.getElementById("inputCsaName").value,
    teamLeader: document.getElementById("inputTeamLeader").value, skill: document.getElementById("inputSkill").value,
    supervisorInCall: document.getElementById("inputSupervisorInCall").value, callType: document.getElementById("inputCallType").value,
    remarks: document.getElementById("inputRemarks").value
  };
  
  const msg = document.getElementById("submitStatusMsg"); msg.classList.remove("hidden");
  msg.className = "text-xs p-2 rounded bg-cyan-900 text-cyanGlow mt-2"; msg.textContent = "Syncing instantly...";
  const btn = document.getElementById("submitCallBtn"); btn.disabled = true;

  // 1. UPDATE UI INSTANTLY (No delay at all)
  appData.calls.unshift(nc); 
  
  // 2. SAVE TO BROWSER CACHE (So if page refreshes before github finishes, data stays!)
  localStorage.setItem("supervisorAppCache", JSON.stringify(appData));
  
  document.getElementById("activeDateSelect").value = nc.date;
  renderAll(); // Screen updates instantly

  // 3. PUSH TO GOOGLE SHEET & GITHUB IN BACKGROUND
  try {
    if (APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://")) {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "addCall", payload: nc })
      });
      msg.className = "text-xs p-2 rounded bg-emerald-900 text-emerald-400 mt-2"; 
      msg.textContent = "✓ Added to Sheet & GitHub!";
    } else {
      msg.className = "text-xs p-2 rounded bg-amber-900 text-amber-400 mt-2"; 
      msg.textContent = "Added locally. App Script URL missing.";
    }
  } catch(err) {
    msg.textContent = "Added locally. Background sync error.";
  }
  
  setTimeout(() => { document.getElementById("addCallForm").reset(); document.getElementById("inputDate").value = nc.date; closeAddCallModal(); btn.disabled = false; }, 1500);
}

function toggleTheme() { document.documentElement.classList.toggle("dark"); document.body.classList.toggle("dark"); }
