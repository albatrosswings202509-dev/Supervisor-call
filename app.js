/**
 * ============================================================================
 * GITHUB AUTO-PUSH & TWO-WAY WEBHOOK CONFIGURATION
 * ============================================================================
 * 1. GITHUB_TOKEN: GitHub Personal Access Token (repo permission সহ)
 *    (নিরাপত্তার জন্য Script Properties-এ GITHUB_TOKEN নামে সেভ করতে পারেন, 
 *     অথবা নিচের ভেরিয়েবলে বসাতে পারেন)
 */
const GITHUB_CONFIG = {
  OWNER: "albatrosswings202509-dev",        // আপনার GitHub Username
  REPO: "Supervisor-call",        // আপনার GitHub Repository-এর নাম দিন
  BRANCH: "main",                           // আপনার ব্রাঞ্চ নাম (main অথবা master)
  FILE_PATH: "data.json",                   // রিপোজিটরিতে ফাইলের পাথ
  TOKEN: "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" // আপনার GitHub Personal Access Token (ghp_...)
};

/**
 * ১. ওয়েবসাইট থেকে লাইভ ডেটা রিড করার এন্ডপয়েন্ট (doGet)
 */
function doGet(e) {
  const data = buildDashboardPayload();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ২. ওয়েবসাইটের "+ Add Call" ফর্ম থেকে শিটে ডেটা যোগ + GitHub-এ অটো পুশ (doPost)
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "addCall" && body.payload) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("Call Details");
      const p = body.payload;

      // ফাঁকা রো খুঁজে বের করা (যদি আগে থেকে শুধু তারিখ দেওয়া থাকে)
      const values = sheet.getDataRange().getValues();
      let targetRow = values.length + 1;
      for (let i = 1; i < values.length; i++) {
        if (!values[i][1] && !values[i][2]) { // Dialed MSISDN ও AVAYA ID ফাঁকা থাকলে
          targetRow = i + 1;
          break;
        }
      }

      sheet.getRange(targetRow, 1, 1, 9).setValues([[
        p.date,
        p.msisdn,
        p.avaya,
        p.csaName,
        p.teamLeader,
        p.skill,
        p.supervisorInCall,
        p.callType,
        p.remarks || ""
      ]]);

      SpreadsheetApp.flush();

      // ওয়েবসাইট থেকে নতুন কল শিটে যুক্ত হওয়ার সাথে সাথে GitHub-এর data.json আপডেট করবে
      pushDataJsonToGitHub("Webpage Add Call: " + p.msisdn + " (" + p.csaName + ")");

      return ContentService
        .createTextOutput(JSON.stringify({ status: "success", row: targetRow }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ৩. শিট এডিট করলেই অটোমেটিক GitHub-এ পুশ করার ট্রিগার ফাংশন
 * (এটি Installable Edit Trigger হিসেবে সেট করতে হবে)
 */
function onSheetEditAutoPush(e) {
  if (!e || !e.range) return;
  const sheetName = e.range.getSheet().getName();

  // শুধুমাত্র "Call Details" বা "Alignment" ট্যাব এডিট হলেই পুশ ট্রিগার হবে
  if (sheetName !== "Call Details" && sheetName !== "Alignment") return;

  // একই সময়ে একাধিক সেলে এডিট করলে কনফ্লিক্ট এড়াতে LockService ব্যবহার
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    SpreadsheetApp.flush();
    const row = e.range.getRow();
    pushDataJsonToGitHub(`Auto-sync from Google Sheet (${sheetName} Row ${row})`);
  } catch (err) {
    console.error("Auto-push failed:", err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ৪. GitHub REST API-এর মাধ্যমে সরাসরি data.json আপডেট করার মূল ফাংশন
 */
function pushDataJsonToGitHub(commitMessage) {
  const scriptProps = PropertiesService.getScriptProperties();
  const token = scriptProps.getProperty("GITHUB_TOKEN") || GITHUB_CONFIG.TOKEN;

  if (!token || token.includes("PASTE_YOUR")) {
    throw new Error("GitHub Personal Access Token সেট করা হয়নি! GITHUB_CONFIG.TOKEN অথবা Script Properties-এ টোকেন দিন।");
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.OWNER}/${GITHUB_CONFIG.REPO}/contents/${GITHUB_CONFIG.FILE_PATH}`;
  const payloadData = buildDashboardPayload();
  const jsonString = JSON.stringify(payloadData, null, 2);

  // UTF-8 নিরাপদ Base64 এনকোডিং (বাংলা বা বিশেষ ক্যারেক্টারের জন্য)
  const base64Content = Utilities.base64Encode(Utilities.newBlob(jsonString, "application/json").getBytes());

  // ধাপ ক: যদি data.json আগে থেকেই রিপোজিটরিতে থাকে, তবে তার বর্তমান SHA বের করা
  let currentSha = null;
  const getResponse = UrlFetchApp.fetch(`${apiUrl}?ref=${GITHUB_CONFIG.BRANCH}`, {
    method: "get",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    muteHttpExceptions: true
  });

  if (getResponse.getResponseCode() === 200) {
    const fileMeta = JSON.parse(getResponse.getContentText());
    currentSha = fileMeta.sha;
  }

  // ধাপ খ: নতুন data.json ফাইলটি GitHub-এ PUT রিকোয়েস্ট দিয়ে কমিট করা
  const putBody = {
    message: commitMessage || `Sync data.json at ${new Date().toISOString()}`,
    content: base64Content,
    branch: GITHUB_CONFIG.BRANCH
  };

  if (currentSha) {
    putBody.sha = currentSha;
  }

  const putResponse = UrlFetchApp.fetch(apiUrl, {
    method: "put",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(putBody),
    muteHttpExceptions: true
  });

  const code = putResponse.getResponseCode();
  if (code === 200 || code === 201) {
    Logger.log("✅ Successfully pushed data.json to GitHub!");
  } else {
    throw new Error(`GitHub API Error (${code}): ${putResponse.getContentText()}`);
  }
}

/**
 * ৫. ওয়ান-ক্লিকে অটোমেটিক ট্রিগার সেটআপ করার ফাংশন
 * (Apps Script এডিটর থেকে এই ফাংশনটি একবার Run করলেই ট্রিগার সেট হয়ে যাবে)
 */
function setupAutoSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "onSheetEditAutoPush") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("onSheetEditAutoPush")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log("✅ Installable onEdit Trigger সফলভাবে চালু হয়েছে!");
}

/**
 * ৬. শিট থেকে Call Details ও Alignment এর ডেটা JSON ফরম্যাটে তৈরি করা
 */
function buildDashboardPayload() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const callSheet = ss.getSheetByName("Call Details");
  const alignSheet = ss.getSheetByName("Alignment");
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Dhaka";

  // Call Details রিড করা
  const callRows = callSheet ? callSheet.getDataRange().getValues() : [];
  const calls = [];
  for (let i = 1; i < callRows.length; i++) {
    const r = callRows[i];
    if (!r[1] && !r[2]) continue;
    const dateStr = r[0] instanceof Date
      ? Utilities.formatDate(r[0], tz, "yyyy-MM-dd")
      : String(r[0]).trim();

    calls.push({
      date: dateStr,
      msisdn: String(r[1]).trim(),
      avaya: String(r[2]).trim(),
      csaName: String(r[3]).trim(),
      teamLeader: String(r[4]).trim(),
      skill: String(r[5]).trim(),
      supervisorInCall: String(r[6]).trim(),
      callType: String(r[7]).trim(),
      remarks: String(r[8] || "").trim()
    });
  }

  // Alignment Roster রিড করা
  const alignRows = alignSheet ? alignSheet.getDataRange().getValues() : [];
  const alignment = [];
  for (let i = 1; i < alignRows.length; i++) {  
    const r = alignRows[i];
    if (!r[0] || String(r[0]).toLowerCase() === "avaya") continue;
    const dojStr = r[11] instanceof Date
      ? Utilities.formatDate(r[11], tz, "yyyy-MM-dd")
      : String(r[11]).trim();

    alignment.push({
      avaya: String(r[0]).trim(),
      name: String(r[4]).trim(),
      doj: dojStr,
      lob: String(r[16]).trim(),
      supervisor: String(r[17]).trim(),
      status: String(r[21] || "Active").trim()
    });
  }

  return {
    lastUpdated: new Date().toISOString(),
    totalAlignedAssociates: alignment.length,
    supervisors: [
      "Sattazit Gosh",
      "Sanjida Islam Tinny",
      "Mohammad Imam Hossain",
      "Fahad Hridoy",
      "Faria Sharmin Etu",
      "Mohammad Sabbir Hossain",
      "Nusrat Jahan Tamanna",
      "Kazi Md.Tareque",
      "Md Zahidul Islam Siam",
      "Md Ariful Islam Niloy",
      "Shajjadul Rhythm"
    ],
    calls: calls,
    alignment: alignment
  };
}
