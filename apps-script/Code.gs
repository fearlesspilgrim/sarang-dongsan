// 26-2 사랑동산 시트에 묶인 스크립트입니다.
// 배포: 웹 앱, 실행 계정은 나, 액세스 권한은 모든 사용자.
var MEMBER_GID = 1332261210;
var LOGIN_GID = 1674760346;
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
    result = saveCoram(payload);
  } catch (err) {
    result = { ok: false, error: "save" };
  }
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(result) + ")").setMimeType(
    ContentService.MimeType.JAVASCRIPT
  );
}

function saveCoram(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!passwordMatches(ss, data && data.password)) return { ok: false, error: "auth" };
  var name = String((data && data.name) || "").trim();
  if (!memberExists(ss, name)) return { ok: false, error: "auth" };
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
