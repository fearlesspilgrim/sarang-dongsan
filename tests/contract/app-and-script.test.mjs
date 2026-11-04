import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "app.js"), "utf8");
const script = readFileSync(join(root, "apps-script/Code.gs"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

test("앱은 켤 때 공용 비밀번호 시트를 읽지 않고 기도제목 시트만 더 읽는다", () => {
  assert.match(app, /sheet=\$\{encodeURIComponent\("기도제목"\)\}/);
  assert.doesNotMatch(app, /GIDS\.login/);
  assert.doesNotMatch(app, /gid=1674760346/);
});

test("기도제목 저장은 개인 로그인 토큰을 보낸다", () => {
  assert.match(app, /action: "기도제목저장"/);
  assert.match(app, /token: state\.sessionToken/);
  assert.doesNotMatch(app, /password: state\.password/);
  assert.doesNotMatch(app, /PRAYER_MAX/);
});

test("스크립트는 양육일기 읽기와 기도제목 저장을 같이 둔다", () => {
  assert.match(script, /action === "diary"/);
  assert.match(script, /action === "기도제목저장"/);
  const save = script.slice(script.indexOf("function savePrayer"));
  const body = save.slice(0, save.indexOf("function ensurePrayerSheet"));
  assert.match(body, /tokenSubject/);
  assert.doesNotMatch(body, /passwordMatches/);
  assert.doesNotMatch(script, /PRAYER_MAX/);
});

test("캐시 번호가 index에 붙어 있다", () => {
  assert.match(html, /app\.js\?v=\d+/);
});

test("양육일기 돌아보기는 설문 응답을 정제해 쓴다", () => {
  assert.match(app, /function diaryPageFromEntry/);
  assert.match(app, /function diaryPages/);
  assert.doesNotMatch(app, /diaryMockCatalog/);
  assert.match(app, /loadDiary\(\)/);
});

test("로그인 토큰은 한글 이름을 UTF-8로 넣는다", () => {
  const issue = script.slice(script.indexOf("function issueToken_"), script.indexOf("function tokenSubject"));
  assert.match(issue, /Utilities\.Charset\.UTF_8/);
  assert.doesNotMatch(issue, /base64EncodeWebSafe\(JSON\.stringify/);
});

test("양육일기 읽기는 구성원 확인과 화면 칸만 보낸다", () => {
  const list = script.slice(script.indexOf("function listDiary"), script.indexOf("function checkDiarySheet"));
  assert.match(list, /memberExists/);
  assert.match(list, /diaryFieldAllowed_/);
  assert.match(list, /DIARY_SHEET_NAME/);
  assert.doesNotMatch(list, /\brole:/);
  assert.match(script, /getSheetByName\(DIARY_SHEET_NAME\)/);
  assert.doesNotMatch(script, /DriveApp/);
});

test("양육일기는 돌아보기 화면을 열 때만 받아 온다", () => {
  assert.match(app, /function loadDiaryIfOpen/);
  assert.doesNotMatch(app, /if \(state\.sessionName\) loadDiary\(\);/);
});
