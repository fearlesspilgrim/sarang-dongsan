// 26-2 사랑동산 시트에 묶인 스크립트입니다.
// 배포: 웹 앱, 실행 계정은 나, 액세스 권한은 모든 사용자.
var MEMBER_GID = 1332261210;
var LOGIN_GID = 1674760346;
var USER_SHEET_ID = "1jsdm-pqahQzvNOcjFgKKuxO92CdKaElOn19N2qmvRJY";
var TOKEN_DAYS = 180;
var CORAM_NAME = "코람데오";
var HEADERS = [
  "이름",
  "주시작",
  "통독장",
  "통독월",
  "통독화",
  "통독수",
  "통독목",
  "통독금",
  "통독토",
  "통독일",
  "기도분",
  "기도월",
  "기도화",
  "기도수",
  "기도목",
  "기도금",
  "기도토",
  "기도일",
  "QT월",
  "QT화",
  "QT수",
  "QT목",
  "QT금",
  "QT토",
  "수정시각",
];

function doGet(e) {
  var callback = String((e && e.parameter && e.parameter.callback) || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(callback)) callback = "callback";
  var result = { ok: false, error: "save" };
  try {
    var payload = JSON.parse((e.parameter && e.parameter.payload) || "{}");
    var action = String((payload && payload.action) || "save");
    if (action === "login") result = loginPersonal(payload);
    else if (action === "setup") result = setupPersonal(payload);
    else result = saveCoram(payload);
  } catch (err) {
    result = { ok: false, error: "save" };
  }
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(result) + ")").setMimeType(
    ContentService.MimeType.JAVASCRIPT
  );
}

function saveCoram(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String((data && data.name) || "").trim();
  var tokenName = tokenSubject(data && data.token);
  var allowed = Boolean(tokenName) && tokenName === name;
  if (!allowed && passwordMatches(ss, data && data.password)) allowed = true;
  if (!allowed || !memberExists(ss, name)) return { ok: false, error: "auth" };
  var week = String((data && data.week) || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return { ok: false, error: "save" };

  var readGoal = clampInt(data && data.readGoal != null && data.readGoal !== "" ? data.readGoal : 3, 1, 30);
  var prayGoal = clampInt(data && data.prayGoal != null && data.prayGoal !== "" ? data.prayGoal : 20, 5, 180);
  var row = [name, week, readGoal]
    .concat(flags(data.readDays, 7), [prayGoal], flags(data.prayDays, 7), flags(data.qtDays, 6), [
      Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"),
    ]);

  var sheet = ensureCoramSheet(ss);
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === name && normalizeWeek(values[r][1]) === week) {
      rowIndex = r + 1;
      break;
    }
  }
  if (rowIndex === -1) sheet.appendRow(row);
  else sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  return { ok: true };
}

function ensureCoramSheet(ss) {
  var sheet = ss.getSheetByName(CORAM_NAME);
  if (!sheet) sheet = ss.insertSheet(CORAM_NAME);
  if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "이름") {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange("B:B").setNumberFormat("@");
  return sheet;
}

function normalizeWeek(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Seoul", "yyyy-MM-dd");
  }
  var text = String(value || "").trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[1] + "-" + match[2] + "-" + match[3] : text;
}

function flags(list, count) {
  var out = [];
  for (var i = 0; i < count; i++) {
    var value = list && list[i];
    out.push(value === true || value === 1 || value === "1" ? 1 : "");
  }
  return out;
}

function clampInt(value, min, max) {
  var n = parseInt(value, 10);
  if (isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function loginPersonal(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String((data && data.name) || "").trim();
  var password = String((data && data.password) || "");
  if (!memberExists(ss, name) || !password) return { ok: false, error: "auth" };
  var sheet = ensureUserSheet_();
  var row = findUserRow_(sheet, name);
  if (row < 0) return { ok: false, error: "setup" };
  var hash = String(sheet.getRange(row, 2).getValue() || "");
  var salt = String(sheet.getRange(row, 3).getValue() || "");
  if (!hash || !salt || hashPassword_(password, salt) !== hash) return { ok: false, error: "auth" };
  return issueToken_(name);
}

function setupPersonal(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String((data && data.name) || "").trim();
  var password = String((data && data.password) || "");
  var groupPassword = String((data && data.groupPassword) || "");
  if (!memberExists(ss, name)) return { ok: false, error: "auth" };
  if (password.length < 4 || password.length > 100) return { ok: false, error: "short" };
  if (!passwordMatches(ss, groupPassword)) return { ok: false, error: "group" };
  var sheet = ensureUserSheet_();
  var row = findUserRow_(sheet, name);
  if (row > 0 && String(sheet.getRange(row, 2).getValue() || "")) return { ok: false, error: "taken" };
  var salt = Utilities.getUuid();
  var hash = hashPassword_(password, salt);
  if (row < 0) sheet.appendRow([name, hash, salt]);
  else sheet.getRange(row, 1, 1, 3).setValues([[name, hash, salt]]);
  return issueToken_(name);
}

function ensureUserSheet_() {
  var ss = SpreadsheetApp.openById(USER_SHEET_ID);
  var sheet = ss.getSheets()[0];
  if (String(sheet.getRange(1, 1).getValue() || "").trim() === "") {
    sheet.getRange(1, 1, 1, 3).setValues([["이름", "비밀번호확인", "솔트"]]);
    sheet.setFrozenRows(1);
  } else {
    if (String(sheet.getRange(1, 2).getValue() || "").trim() === "") sheet.getRange(1, 2).setValue("비밀번호확인");
    if (String(sheet.getRange(1, 3).getValue() || "").trim() === "") sheet.getRange(1, 3).setValue("솔트");
  }
  return sheet;
}

function findUserRow_(sheet, name) {
  var last = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, last, 1).getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === name) return i + 1;
  }
  return -1;
}

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + "\n" + String(password),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest);
}

function authSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("AUTH_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("AUTH_SECRET", secret);
  }
  return secret;
}

function issueToken_(name) {
  var exp = Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000;
  var body = Utilities.base64EncodeWebSafe(JSON.stringify({ name: name, exp: exp }));
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, authSecret_()));
  return { ok: true, token: body + "." + sig, exp: exp };
}

function tokenSubject(token) {
  var parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  var expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], authSecret_()));
  if (expected.length !== parts[1].length) return "";
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  if (mismatch) return "";
  try {
    var data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!data || !data.name || Number(data.exp) < Date.now()) return "";
    return String(data.name);
  } catch (err) {
    return "";
  }
}

function passwordMatches(ss, given) {
  var sheet = sheetByGid(ss, LOGIN_GID);
  if (!sheet) return false;
  var values = sheet.getDataRange().getValues();
  var expected = "";
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === "App_Password") expected = String(values[i][1] || "").trim();
  }
  if (!expected && values.length) expected = String(values[0][1] || "").trim();
  return expected !== "" && String(given || "") === expected;
}

function memberExists(ss, name) {
  var sheet = sheetByGid(ss, MEMBER_GID);
  if (!sheet || !name) return false;
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === name) return true;
  }
  return false;
}
