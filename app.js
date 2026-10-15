(() => {
  const SHEET_ID = "1UtE3oILRosD0w5au4Nre5b4cIqJcu3weNHTIiWv1LYM";
  const GIDS = {
    schedule: "67588769",
    members: "1332261210",
    places: "447610135",
    links: "782002476",
  };
  const TABS = ["home", "schedule", "members", "coram", "links"];
  const CORAM_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyrIsEa1O3gueu7MOthSELphC86xVwQnZWf3YY8IkZXZPLkqHVu0g4XVXrz7XyaSJQd/exec";
  const CORAM_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const CORAM_DEFAULT_READ = 3;
  const CORAM_DEFAULT_PRAY = 20;
  const CORAM_TERM = {
    start: { y: 2026, m: 9, d: 13 },
    end: { y: 2027, m: 3, d: 13 },
  };
  // 양육일기 설문은 텀 둘째 주부터 받았다.
  const DIARY_FIRST_SUNDAY = { y: 2026, m: 9, d: 20 };
  const SESSION_KEY = "sarang_lbs_session_v1";
  const DIARY_TREND_WEEKS = 8;
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const CAT_STYLE = {
    사랑동산: "text-terra",
    대청부: "text-sage",
    사랑의교회: "text-church",
    휴일: "text-stone-500",
  };
  const PEER_TINT = [
    "bg-[#E8D5CF] text-[#8B3A2E]",
    "bg-[#D7E3DC] text-[#3F5C50]",
    "bg-[#D9DEEA] text-[#3A4768]",
    "bg-[#E8DFC8] text-[#7A6230]",
    "bg-[#E4D4D8] text-[#6B3B48]",
  ];
  const FILTERS = ["전체", "사랑동산", "대청부", "사랑의교회", "휴일"];

  let stickyHeadObserver = null;

  function syncStickyHead() {
    const stickyHead = document.querySelector("#main-scroll [data-sticky-head]");
    const scroller = document.getElementById("main-scroll");
    if (!stickyHead || !scroller) return;
    scroller.style.setProperty("--sticky-head", `${Math.round(stickyHead.getBoundingClientRect().height)}px`);
  }

  const state = {
    status: "loading",
    error: "",
    members: [],
    events: [],
    places: {},
    links: [],
    roster: [],
    rosterReady: false,
    scheduleVersion: "",
    coramRows: [],
    coramReady: false,
    coramOffset: 0,
    coramDrafts: {},
    coramSave: "idle",
    coramError: "",
    coramGoalEdit: null,
    coramGoalDraft: null,
    coramPane: "week",
    coramLook: null,
    coramFocus: "",
    sessionName: null,
    sessionToken: "",
    tab: "home",
    scheduleFilter: "전체",
    memberQuery: "",
    selectedMember: null,
    namePickerOpen: false,
    loginName: "",
    loginPassword: "",
    loginConfirm: "",
    loginGroup: "",
    loginMode: "enter",
    loginBusy: false,
    loginError: "",
    diaryStatus: "idle",
    diaryError: "",
    diaryEntries: [],
    diaryId: "",
    diaryTrendOpen: false,
    toast: "",
    refreshing: false,
  };

  let toastTimer = null;
  const appEl = document.getElementById("app");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  function cell(row, index) {
    const item = row.c?.[index];
    if (!item) return { v: null, f: null };
    return { v: item.v ?? null, f: item.f ?? null };
  }

  function parseGvizDate(value, formatted) {
    if (value == null || value === "") return null;
    if (typeof value === "string" && value.startsWith("Date(")) {
      const parts = value
        .slice(5, -1)
        .split(",")
        .map((n) => Number.parseInt(n.trim(), 10));
      const [y, m0, d] = parts;
      if ([y, m0, d].some((n) => Number.isNaN(n))) return null;
      return { y, m: m0 + 1, d };
    }
    if (formatted) {
      const iso = String(formatted).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (iso) {
        return { y: +iso[1], m: +iso[2], d: +iso[3] };
      }
      const md = String(formatted).match(/^(\d{1,2})\/(\d{1,2})$/);
      if (md) return { y: null, m: +md[1], d: +md[2] };
    }
    return null;
  }

  function ymd(date) {
    return date.y * 10000 + date.m * 100 + date.d;
  }

  function addDays(date, days) {
    const utc = Date.UTC(date.y, date.m - 1, date.d + days);
    const next = new Date(utc);
    return {
      y: next.getUTCFullYear(),
      m: next.getUTCMonth() + 1,
      d: next.getUTCDate(),
    };
  }

  function weekdayIndex(date) {
    return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  }

  function seoulToday() {
    const now = seoulNow();
    return { y: now.y, m: now.m, d: now.d };
  }

  function seoulNow() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
  }

  const TIME_LINES = [
    { from: 5, to: 11, lines: ["좋은 아침이에요", "아침부터 반가워요"] },
    { from: 11, to: 14, lines: ["점심은 맛있게 먹었나요?", "점심시간은 잘 보내고 있나요?"] },
    { from: 14, to: 18, lines: ["오후도 편하게 보내고 있나요?", "나른한 오후예요"] },
    { from: 18, to: 22, lines: ["저녁은 맛있게 드셨나요?", "오늘 하루도 수고했어요"] },
    { from: 22, to: 5, lines: ["늦은 시간이네요", "오늘도 고생 많았어요"] },
  ];

  function timeGreeting(now = seoulNow()) {
    const band =
      TIME_LINES.find((item) =>
        item.from < item.to ? now.h >= item.from && now.h < item.to : now.h >= item.from || now.h < item.to
      ) || TIME_LINES[TIME_LINES.length - 1];
    return band.lines[(now.y * 10000 + now.m * 100 + now.d) % band.lines.length];
  }

  function parseScheduleVersion(table) {
    const item = cell(table?.rows?.[0] || {}, 0);
    const formatted = String(item.f || "").trim();
    if (formatted) return formatted;
    const raw = item.v;
    if (raw == null || raw === "") return "";
    if (typeof raw === "string" && raw.startsWith("Date(")) {
      const date = parseGvizDate(raw, "");
      if (!date?.y) return "";
      const yy = String(date.y).slice(-2);
      const mm = String(date.m).padStart(2, "0");
      const dd = String(date.d).padStart(2, "0");
      return `${yy}.${mm}.${dd}`;
    }
    return String(raw).trim();
  }

  function scheduleVersionLabel(version) {
    const text = String(version || "").trim();
    if (!text) return "";
    return /ver\.?$/i.test(text) ? text : `${text} ver.`;
  }

  function weekRange(today) {
    const diff = weekdayIndex(today) === 0 ? 6 : weekdayIndex(today) - 1;
    const start = addDays(today, -diff);
    const end = addDays(start, 6);
    return { start, end };
  }

  function inRange(date, start, end) {
    if (!date?.y) return false;
    const n = ymd(date);
    return n >= ymd(start) && n <= ymd(end);
  }

  function formatPeer(value, formatted) {
    if (formatted) return String(formatted);
    const n = Number(value);
    if (Number.isNaN(n)) return String(value ?? "");
    return String(Math.trunc(n)).padStart(2, "0");
  }

  function peerRank(peer) {
    const n = Number.parseInt(String(peer).replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) return 999;
    return n <= 30 ? n + 100 : n;
  }

  function peerTint(peer) {
    const n = Number.parseInt(String(peer), 10);
    if (n === 0) return "bg-[#F3E4A6] text-[#6B5220]";
    const idx = Number.isNaN(n) ? 0 : n % PEER_TINT.length;
    return PEER_TINT[idx];
  }

  function initialOf(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "?";
    if (trimmed.startsWith("남궁")) return "남궁";
    return trimmed.charAt(0);
  }

  function initialClass(name, single, compound) {
    return initialOf(name).length > 1 ? compound : single;
  }

  function formatMd(date) {
    if (!date) return "";
    return `${date.m}/${date.d}`;
  }

  function formatRange(start, end) {
    return `${start.m}/${start.d}–${end.m}/${end.d}`;
  }

  function monthTitle(date) {
    return `${date.y}년 ${date.m}월`;
  }

  function loadGviz(gid, query = "") {
    return new Promise((resolve, reject) => {
      const cb = `gviz_cb_${gid || "sheet"}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("시트를 불러오는 시간이 너무 오래 걸립니다."));
      }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }

      window[cb] = (payload) => {
        cleanup();
        if (payload?.status === "ok" && payload.table) resolve(payload.table);
        else reject(new Error("시트 응답이 올바르지 않습니다."));
      };

      const gidPart = gid ? `&gid=${gid}` : "";
      script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${cb}${gidPart}${query}&t=${Date.now()}`;
      script.onerror = () => {
        cleanup();
        reject(new Error("시트를 불러오지 못했습니다."));
      };
      document.body.appendChild(script);
    });
  }

  function parseMembers(table) {
    return (table.rows || [])
      .map((row) => {
        const name = String(cell(row, 0).v || "").trim();
        if (!name || name === "이름") return null;
        const peer = formatPeer(cell(row, 1).v, cell(row, 1).f);
        const birth = parseGvizDate(cell(row, 2).v, cell(row, 2).f);
        const phone = String(cell(row, 3).v || "").trim();
        const role = String(cell(row, 4).v || "").trim();
        return { name, peer, birth, phone, role };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const rank = peerRank(a.peer) - peerRank(b.peer);
        if (rank !== 0) return rank;
        return a.name.localeCompare(b.name, "ko");
      });
  }

  function parseEvents(table) {
    return (table.rows || [])
      .map((row) => {
        const title = String(cell(row, 6).v || "").trim();
        if (!title) return null;
        const weekLabel = String(cell(row, 0).v || "").trim();
        const from = parseGvizDate(cell(row, 1).v, cell(row, 1).f);
        const date = parseGvizDate(cell(row, 3).v, cell(row, 3).f);
        if (date && !date.y && from?.y) date.y = from.y;
        if (!date?.y) return null;
        const weekday = String(cell(row, 4).v || WEEKDAYS[weekdayIndex(date)]).trim();
        const category = String(cell(row, 5).v || "").trim();
        return { weekLabel, date, weekday, category, title };
      })
      .filter(Boolean)
      .sort((a, b) => ymd(a.date) - ymd(b.date));
  }

  function parsePlaces(table) {
    const map = {};
    for (const row of table.rows || []) {
      const place = String(cell(row, 2).v || "").trim();
      if (!place || place === "장소") continue;
      const date = parseGvizDate(cell(row, 1).v, cell(row, 1).f);
      if (!date?.y) continue;
      map[ymd(date)] = place;
    }
    return map;
  }

  function linkUrl(item) {
    const raw = String(item.v || "").trim();
    const formatted = String(item.f || "").trim();
    const source = /^https?:\/\//i.test(raw) ? raw : formatted || raw;
    const match = source.match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0] : "";
  }

  function linkKind(url) {
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    const path = url.toLowerCase();
    if (host.includes("forms.gle") || path.includes("/forms")) return { kind: "form", hint: "구글 설문" };
    if (host.includes("notion.")) return { kind: "notion", hint: "노트" };
    if (host.includes("kakao")) return { kind: "chat", hint: "카카오" };
    if (host.includes("docs.google.com") && path.includes("/spreadsheets")) return { kind: "sheet", hint: "구글 시트" };
    if (host.includes("docs.google.com") && path.includes("/document")) return { kind: "doc", hint: "구글 문서" };
    if (host.includes("youtube.com") || host === "youtu.be") return { kind: "video", hint: "영상" };
    return { kind: "link", hint: host || "링크" };
  }

  function parseRoster(table) {
    if (!table) return [];
    return (table.rows || [])
      .map((row) => {
        const leader = String(cell(row, 0).v || "").trim();
        const name = String(cell(row, 1).v || "").trim();
        if (!leader || !name || leader === "순장 이름") return null;
        const kind = String(cell(row, 2).v || "").trim();
        const gender = String(cell(row, 4).v || "").trim();
        const peerCell = cell(row, 5);
        const peer =
          peerCell.v == null || peerCell.v === "" ? "" : formatPeer(peerCell.v, peerCell.f);
        return { leader, name, kind, gender, peer };
      })
      .filter(Boolean);
  }

  const DIARY_FORM_ID = "1FAIpQLSfB-_uUD9dw3CkCqjIA4-rduND0Qi-sPDnwmn6sNmHUq3JJ7g";
  const DIARY_ENTRY = {
    role: "830871812",
    name: "1040802585",
    headcount: "294826557",
    present: "2130633796",
    read: "1376005647",
    pray: "1036247086",
    qt: "1996792481",
  };

  function diaryRole(member) {
    return String(member?.role || "").includes("지기") ? "동산지기" : "순장";
  }

  function rosterTag(person) {
    const peer = String(person.peer || "").trim();
    const gender = String(person.gender || "").trim();
    if (peer && gender) return `${person.name}(${peer}/${gender})`;
    if (gender) return `${person.name}(${gender})`;
    if (peer) return `${person.name}(${peer})`;
    return person.name;
  }

  function presentRosterText(people) {
    return people.map((person) => `${rosterTag(person)} /  /`).join("\n");
  }

  function diaryPeople(member) {
    const keeper = String(member.role || "").includes("지기");
    return state.roster.filter((row) => row.leader === member.name && (keeper || row.kind === "순원"));
  }

  function coramDayCount(flags) {
    return (flags || []).filter(Boolean).length;
  }

  function coramDiaryRecord() {
    if (!state.coramReady || !state.sessionName) return null;
    const week = coramWeekKey(0);
    const draft = state.coramDrafts[week];
    if (draft && draft.name === state.sessionName) return draft;
    return state.coramRows.find((row) => row.name === state.sessionName && row.week === week) || null;
  }

  function diaryHref(link) {
    const member = currentMember();
    if (link.label !== "양육일기" || !member) return link.url;
    const people = diaryPeople(member);
    const params = new URLSearchParams();
    params.set("usp", "pp_url");
    params.set(`entry.${DIARY_ENTRY.role}`, diaryRole(member));
    params.set(`entry.${DIARY_ENTRY.name}`, member.name);
    if (state.rosterReady) {
      params.set(`entry.${DIARY_ENTRY.headcount}`, `/ ${people.length + 1}`);
      const present = presentRosterText(people);
      if (present) params.set(`entry.${DIARY_ENTRY.present}`, present);
    }
    const record = coramDiaryRecord();
    if (record) {
      params.set(`entry.${DIARY_ENTRY.read}`, `하루 ${record.readGoal}장 / ${coramDayCount(record.readDays)}일`);
      params.set(`entry.${DIARY_ENTRY.pray}`, `하루 ${record.prayGoal}분 / ${coramDayCount(record.prayDays)}일`);
      params.set(`entry.${DIARY_ENTRY.qt}`, `${Math.min(6, coramDayCount(record.qtDays))}일`);
    }
    return `https://docs.google.com/forms/d/e/${DIARY_FORM_ID}/viewform?${params.toString()}`;
  }

  function isoDate(date) {
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }

  function coramWeekStart(offset = state.coramOffset) {
    return addDays(weekRange(seoulToday()).start, offset * 7);
  }

  function coramWeekKey(offset = state.coramOffset) {
    return isoDate(coramWeekStart(offset));
  }

  function coramFlag(value) {
    if (value === true || value === 1) return true;
    const text = String(value ?? "").trim().toLowerCase();
    return text === "1" || text === "true" || text === "y" || text === "o" || text === "예";
  }

  function coramGoal(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.round(n);
  }

  function coramWeekValue(item) {
    const raw = item?.v;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
    const formatted = String(item?.f || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    const date = parseGvizDate(raw, item?.f);
    return date?.y ? isoDate(date) : "";
  }

  function parseCoram(table) {
    if (!table) return [];
    const headers = {};
    (table.cols || []).forEach((col, index) => {
      const label = String(col.label || "").trim();
      if (label) headers[label] = index;
    });
    const pick = (row, label) => cell(row, headers[label] ?? -1);
    return (table.rows || [])
      .map((row) => {
        const name = String(pick(row, "이름").v || "").trim();
        const week = coramWeekValue(pick(row, "주시작"));
        if (!name || name === "이름" || !week) return null;
        const days = (prefix, count) =>
          CORAM_DAYS.slice(0, count).map((label) => coramFlag(pick(row, `${prefix}${label}`).v));
        return {
          name,
          week,
          readGoal: coramGoal(pick(row, "통독장").v, CORAM_DEFAULT_READ),
          readDays: days("통독", 7),
          prayGoal: coramGoal(pick(row, "기도분").v, CORAM_DEFAULT_PRAY),
          prayDays: days("기도", 7),
          qtDays: days("QT", 6),
        };
      })
      .filter(Boolean);
  }

  function latestCoramGoals() {
    const byWeek = {};
    for (const row of state.coramRows) {
      if (row.name === state.sessionName) byWeek[row.week] = row;
    }
    for (const draft of Object.values(state.coramDrafts)) {
      if (draft?.name === state.sessionName) byWeek[draft.week] = draft;
    }
    const mine = Object.values(byWeek).sort((a, b) => (a.week < b.week ? 1 : -1));
    return {
      readGoal: mine[0]?.readGoal || CORAM_DEFAULT_READ,
      prayGoal: mine[0]?.prayGoal || CORAM_DEFAULT_PRAY,
    };
  }

  function coramRecordFor(week) {
    if (state.coramDrafts[week]) return state.coramDrafts[week];
    const existing = state.coramRows.find((row) => row.name === state.sessionName && row.week === week);
    if (existing) return existing;
    const goals = latestCoramGoals();
    return {
      name: state.sessionName,
      week,
      readGoal: goals.readGoal,
      readDays: [false, false, false, false, false, false, false],
      prayGoal: goals.prayGoal,
      prayDays: [false, false, false, false, false, false, false],
      qtDays: [false, false, false, false, false, false],
    };
  }

  function ensureCoramDraft(week) {
    if (!state.coramDrafts[week]) state.coramDrafts[week] = cloneCoram(coramRecordFor(week));
    state.coramDrafts[week].name = state.sessionName;
    state.coramDrafts[week].week = week;
    return state.coramDrafts[week];
  }

  function upsertCoramRow(record) {
    const next = cloneCoram(record);
    const index = state.coramRows.findIndex((row) => row.name === next.name && row.week === next.week);
    if (index === -1) state.coramRows.push(next);
    else state.coramRows[index] = next;
  }

  let coramSaveTimer = null;
  let coramSaveSeq = 0;

  function scheduleCoramSave() {
    state.coramSave = "saving";
    state.coramError = "";
    clearTimeout(coramSaveTimer);
    coramSaveTimer = setTimeout(() => {
      flushCoramSave();
    }, 400);
  }

  function postScript(body) {
    return new Promise((resolve, reject) => {
      if (!CORAM_SCRIPT_URL) {
        reject(new Error("unconfigured"));
        return;
      }
      const cb = `coram_cb_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        finish(() => reject(new Error("timeout")));
      }, 15000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }
      let settled = false;
      function finish(fn) {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      }
      window[cb] = (payload) => {
        finish(() => {
          if (payload?.ok) resolve(payload);
          else reject(new Error(payload?.error || "save"));
        });
      };
      const payload = encodeURIComponent(JSON.stringify(body));
      script.src = `${CORAM_SCRIPT_URL}?callback=${cb}&payload=${payload}&t=${Date.now()}`;
      script.onerror = () => {
        setTimeout(() => finish(() => reject(new Error("network"))), 800);
      };
      document.body.appendChild(script);
    });
  }

  function postCoram(record) {
    return postScript({
      action: "save",
      token: state.sessionToken,
      name: record.name,
      week: record.week,
      readGoal: record.readGoal,
      readDays: record.readDays,
      prayGoal: record.prayGoal,
      prayDays: record.prayDays,
      qtDays: record.qtDays,
    });
  }

  async function flushCoramSave() {
    const week = coramWeekKey();
    const draft = state.coramDrafts[week];
    if (!draft || !state.sessionName) return;
    const seq = ++coramSaveSeq;
    const snapshot = cloneCoram(draft);
    state.coramSave = "saving";
    try {
      await postCoram(snapshot);
      if (seq !== coramSaveSeq) return;
      upsertCoramRow(snapshot);
      state.coramSave = "saved";
      state.coramError = "";
    } catch (err) {
      if (seq !== coramSaveSeq) return;
      state.coramSave = "error";
      state.coramError =
        err?.message === "unconfigured"
          ? "시트로 보내는 주소를 아직 연결하지 못했어요"
          : err?.message === "auth"
            ? "이 이름으로는 시트에 남길 수 없어요"
            : "시트에 남기지 못했어요";
    }
    if (state.tab === "coram" && state.status === "ready" && state.sessionName) renderKeepingScroll();
  }

  function parseLinks(table) {
    return (table.rows || [])
      .map((row) => {
        const label = String(cell(row, 0).v || "").trim();
        if (!label || label === "구분") return null;
        const url = linkUrl(cell(row, 1));
        if (!url) return null;
        return { label, url, ...linkKind(url) };
      })
      .filter(Boolean);
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const exp = Number(parsed?.exp);
      if (typeof parsed?.name === "string" && typeof parsed?.token === "string" && exp > Date.now()) {
        return { name: parsed.name, token: parsed.token, exp };
      }
    } catch {
      /* 예전 로그인 기억은 아래에서 지웁니다. */
    }
    clearSession();
    return null;
  }

  function writeSession(name, token, exp) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name, token, exp }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function loadAll({ silent = false } = {}) {
    const started = Date.now();
    if (silent) {
      state.refreshing = true;
      paintPull("refresh");
    } else {
      state.status = "loading";
      state.error = "";
      render();
    }
    try {
      const versionPromise = loadGviz(GIDS.schedule, "&range=J1&headers=0").catch(() => null);
      const rosterPromise = loadGviz(
        "",
        `&sheet=${encodeURIComponent("순원정보")}&headers=1`
      ).catch(() => null);
      const coramPromise = loadGviz(
        "",
        `&sheet=${encodeURIComponent("코람데오")}&headers=1`
      ).catch(() => null);
      const [membersTable, eventsTable, placesTable, linksTable, versionTable, rosterTable, coramTable] =
        await Promise.all([
          loadGviz(GIDS.members),
          loadGviz(GIDS.schedule),
          loadGviz(GIDS.places),
          loadGviz(GIDS.links),
          versionPromise,
          rosterPromise,
          coramPromise,
        ]);
      state.members = parseMembers(membersTable);
      state.events = parseEvents(eventsTable);
      state.places = parsePlaces(placesTable);
      state.links = parseLinks(linksTable);
      state.roster = parseRoster(rosterTable);
      state.rosterReady = Boolean(rosterTable);
      state.coramRows = parseCoram(coramTable);
      state.coramReady = Boolean(coramTable);
      if (state.coramSave !== "saving" && state.coramSave !== "error") state.coramDrafts = {};
      state.scheduleVersion = parseScheduleVersion(versionTable);
      const saved = readSession();
      state.sessionName = saved && state.members.some((m) => m.name === saved.name) ? saved.name : null;
      state.sessionToken = state.sessionName ? saved.token : "";
      if (state.sessionName) {
        const tab = location.hash.replace("#", "");
        if (TABS.includes(tab) || tab === "diary") state.tab = tab;
      }
      state.status = "ready";
      state.error = "";
      if (silent) {
        const wait = 520 - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        showToast("다시 불러왔습니다");
      }
    } catch (err) {
      state.status = "error";
      state.error = err.message || "소식을 불러오지 못했습니다.";
    }
    state.refreshing = false;
    render();
    if (state.status === "ready" && state.tab === "diary") state.diaryStatus = "ready";
  }

  function currentMember() {
    return state.members.find((m) => m.name === state.sessionName) || null;
  }

  function weekEvents(range) {
    return state.events.filter((event) => inRange(event.date, range.start, range.end));
  }

  function placeFor(event) {
    if (event.category !== "대청부" || weekdayIndex(event.date) !== 0) return "";
    if (String(event.title).includes("GBS 없음")) return "";
    return state.places[ymd(event.date)] || "";
  }

  function birthdaySets(today, range) {
    const week = [];
    const month = [];
    for (const member of state.members) {
      if (!member.birth) continue;
      const inWeek = [...Array(7)].some((_, i) => {
        const day = addDays(range.start, i);
        return day.m === member.birth.m && day.d === member.birth.d;
      });
      if (inWeek) week.push(member);
      if (member.birth.m === today.m) month.push(member);
    }
    const byDate = (a, b) => a.birth.m * 100 + a.birth.d - (b.birth.m * 100 + b.birth.d);
    week.sort(byDate);
    month.sort(byDate);
    return { week, month };
  }

  function groupedMembers() {
    const q = state.memberQuery.trim();
    const list = q
      ? state.members.filter((m) => m.name.includes(q) || m.peer.includes(q))
      : state.members;
    const groups = [];
    for (const member of list) {
      const last = groups[groups.length - 1];
      if (!last || last.peer !== member.peer) {
        groups.push({ peer: member.peer, members: [member] });
      } else {
        last.members.push(member);
      }
    }
    return groups;
  }

  function groupedEvents() {
    const filtered =
      state.scheduleFilter === "전체"
        ? state.events
        : state.events.filter((event) => event.category === state.scheduleFilter);
    const groups = [];
    for (const event of filtered) {
      const key = `${event.date.y}-${event.date.m}`;
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, title: monthTitle(event.date), events: [event] });
      } else {
        last.events.push(event);
      }
    }
    return groups;
  }

  function showToast(message) {
    state.toast = message;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = "";
      render();
    }, 1500);
  }

  async function copyPhone(phone) {
    const text = String(phone || "").trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast("번호를 복사했습니다");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast("번호를 복사했습니다");
    }
  }

  function iconHome(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="${active ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>`;
  }
  function iconCal(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="${active ? "2.2" : "1.8"}"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>`;
  }
  function iconPeople(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="${active ? "2.2" : "1.8"}"><circle cx="9" cy="8" r="3"/><path d="M4 19c.5-3 2.4-5 5-5s4.5 2 5 5"/><circle cx="16.5" cy="8.5" r="2.4"/><path d="M16 14.2c2.2.3 3.8 2.2 4.3 4.8"/></svg>`;
  }
  function cloneCoram(record) {
    return {
      name: record.name,
      week: record.week,
      readGoal: record.readGoal,
      readDays: record.readDays.slice(),
      prayGoal: record.prayGoal,
      prayDays: record.prayDays.slice(),
      qtDays: record.qtDays.slice(),
    };
  }

  function iconLink(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="${active ? "2.2" : "1.8"}" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.4l1.6-1.6a5 5 0 0 0-7.1-7.1L10.6 6"/><path d="M14 11a5 5 0 0 0-7.5-.4L4.9 12.2a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>`;
  }
  function iconCoram(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="${active ? "2.2" : "1.8"}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2c-1.7-1.1-3.7-1.7-6.2-1.7v13.4c2.5 0 4.5.6 6.2 1.7 1.7-1.1 3.7-1.7 6.2-1.7V4.5c-2.5 0-4.5.6-6.2 1.7z"/><path d="M12 6.2v13.4"/></svg>`;
  }

  function chip(category) {
    if (!category) return "";
    const klass = CAT_STYLE[category] || "text-stone-600";
    return `<span class="inline-flex items-center gap-1.5 text-[12px] font-semibold ${klass}"><svg viewBox="0 0 24 24" class="h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.2-4.6-9.4-8.4C.8 9.2 2 5.8 5.4 5c2-.5 3.8.3 6.6 3.2C14.8 5.3 16.6 4.5 18.6 5c3.4.8 4.6 4.2 2.8 7.1-2.2 3.8-9.4 8.4-9.4 8.4z"/></svg>${esc(category)}</span>`;
  }

  function eventBody(event, { compact = false, showToday = false } = {}) {
    const textClass = compact ? "text-[15px]" : "text-[16px]";
    const place = placeFor(event);
    return `
      <div>
        <div class="flex flex-wrap items-center gap-2">
          ${chip(event.category)}
          ${showToday ? '<span class="text-[11px] font-semibold text-terra">오늘</span>' : ""}
        </div>
        <p class="mt-1 ${textClass} leading-snug break-keep">${esc(event.title)}</p>
        ${place ? `<p class="mt-1 text-[13px] text-muted">GBS 장소 : ${esc(place)}</p>` : ""}
      </div>`;
  }

  function homeDays(events, today) {
    const days = [];
    for (const event of events) {
      const last = days[days.length - 1];
      if (last && ymd(last[0].date) === ymd(event.date)) last.push(event);
      else days.push([event]);
    }
    return days
      .map((day) => {
        const event = day[0];
        const isToday = today && ymd(event.date) === ymd(today);
        return `
          <div class="flex items-start gap-3 ${isToday ? "rounded-2xl bg-terra/10 px-2 pt-2 pb-3 -mx-2" : "py-2"}">
            <div class="w-10 shrink-0 pt-0.5 text-center">
              <div class="text-[15px] font-semibold leading-none ${isToday ? "text-terra" : "text-ink"}">${event.date.d}</div>
              <div class="mt-1 text-[11px] leading-none text-muted">${esc(event.weekday)}</div>
            </div>
            <div class="min-w-0 flex-1 space-y-3">
              ${day.map((item, index) => eventBody(item, { compact: true, showToday: isToday && index === 0 })).join("")}
            </div>
          </div>`;
      })
      .join("");
  }

  function scheduleDay(events, today) {
    const event = events[0];
    const isToday = today && ymd(event.date) === ymd(today);
    const markerHtml = `<span class="absolute -left-2.5 top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${isToday ? "bg-terra" : "bg-stone-300"}"></span>`;
    return `
      <div class="flex items-start gap-3 ${isToday ? "rounded-2xl bg-terra/10 py-2 pr-2 -mr-2" : "py-2"}">
        <div class="w-10 shrink-0 pt-0.5 text-center">
          <div class="relative text-[15px] font-semibold leading-none ${isToday ? "text-terra" : "text-ink"}">
            ${markerHtml}
            ${event.date.d}
          </div>
          <div class="mt-1 text-[11px] leading-none text-muted">${esc(event.weekday)}</div>
        </div>
        <div class="min-w-0 flex-1 space-y-3">
          ${events.map((item, index) => eventBody(item, { showToday: isToday && index === 0 })).join("")}
        </div>
      </div>`;
  }

  function skeleton() {
    return `
      <div class="px-5 pt-6">
        <div class="h-4 w-28 rounded bg-stone-200/80"></div>
        <div class="mt-3 h-7 w-52 rounded bg-stone-200/80"></div>
        <div class="mt-2 h-4 w-40 rounded bg-stone-200/70"></div>
        <div class="mt-6 h-40 rounded-[24px] bg-ivory"></div>
        <div class="mt-4 h-28 rounded-[24px] bg-ivory"></div>
      </div>`;
  }

  function errorView() {
    return `
      <div class="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <p class="text-[18px] font-semibold">소식을 불러오지 못했습니다</p>
        <p class="mt-2 text-[14px] text-muted">${esc(state.error)}</p>
        <button data-action="retry" class="mt-6 h-[52px] w-full max-w-xs rounded-2xl bg-terra text-[16px] font-semibold text-ivory">다시 시도</button>
      </div>`;
  }

  function loginView() {
    const selected = state.members.find((m) => m.name === state.loginName);
    const setup = state.loginMode === "setup";
    const busy = state.loginBusy;
    return `
      <div class="flex min-h-dvh flex-col px-5 pb-10 pt-16">
        <p class="text-[13px] font-medium tracking-wide text-terra">사랑동산</p>
        <h1 class="mt-2 text-[28px] font-semibold leading-tight">사랑하기</h1>

        <label class="mt-10 text-[13px] font-medium text-muted">이름</label>
        <button data-action="open-name-picker" class="mt-2 flex h-[52px] items-center justify-between rounded-2xl border border-stone-200 bg-ivory px-4 text-left">
          <span class="${selected ? "text-ink" : "text-muted"}">${selected ? esc(selected.name) : "구성원 선택"}</span>
          <span class="text-muted">▾</span>
        </button>

        ${
          setup
            ? `<p class="mt-5 text-center text-[13px] leading-relaxed text-muted">개인 비밀번호를 설정해주세요. 비밀번호는 관리자도 볼 수 없어요.</p>`
            : ""
        }

        <label class="mt-5 text-[13px] font-medium text-muted" for="login-password">${setup ? "새 비밀번호" : "비밀번호"}</label>
        <input id="login-password" data-field="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}"
          class="mt-2 h-[52px] w-full rounded-2xl border border-stone-200 bg-ivory px-4 text-[16px] outline-none focus:border-terra"
          value="${esc(state.loginPassword)}" />

        ${
          setup
            ? `<label class="mt-5 text-[13px] font-medium text-muted" for="login-confirm">비밀번호 확인</label>
        <input id="login-confirm" data-field="confirm" type="password" autocomplete="new-password"
          class="mt-2 h-[52px] w-full rounded-2xl border border-stone-200 bg-ivory px-4 text-[16px] outline-none focus:border-terra"
          value="${esc(state.loginConfirm)}" />`
            : ""
        }

        ${state.loginError ? `<p class="mt-3 text-[13px] text-terra">${esc(state.loginError)}</p>` : ""}

        <button data-action="${setup ? "setup-password" : "login"}" ${busy ? "disabled" : ""}
          class="mt-8 h-[52px] w-full rounded-2xl bg-terra text-[16px] font-semibold text-ivory disabled:opacity-60">${busy ? "확인하는 중" : setup ? "비밀번호 정하기" : "사랑하기"}</button>
        ${
          setup
            ? `<button data-action="login-back" class="mt-4 h-[44px] w-full bg-transparent text-[14px] font-medium text-muted">로그인 화면으로</button>`
            : ""
        }
      </div>
      ${state.namePickerOpen ? namePicker() : ""}`;
  }

  function namePickerListHtml() {
    const groups = groupedMembers();
    if (!groups.length) {
      return `<p class="py-8 text-center text-[14px] text-muted">해당하는 이름이 없습니다</p>`;
    }
    return groups
      .map(
        (group) => `
      <p class="sticky top-0 bg-ivory py-2 text-[12px] font-semibold text-muted">${esc(group.peer)}또래</p>
      ${group.members
        .map(
          (m) => `
        <button data-action="pick-name" data-name="${esc(m.name)}" class="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left">
          <span class="flex h-9 w-9 items-center justify-center rounded-full font-semibold leading-none whitespace-nowrap ${initialClass(m.name, "text-[14px]", "text-[11px] tracking-tight")} ${peerTint(m.peer)}">${esc(initialOf(m.name))}</span>
          <span class="text-[16px]">${esc(m.name)}</span>
        </button>`
        )
        .join("")}`
      )
      .join("");
  }

  function memberListHtml() {
    const list = state.members;
    if (!list.length) {
      return `<p class="mt-10 text-center text-[14px] text-muted">등록된 구성원이 없습니다</p>`;
    }
    return `
      <div class="grid grid-cols-2 gap-2">
        ${list
          .map((m) => {
            return `
            <button data-action="open-member" data-name="${esc(m.name)}" class="flex h-full items-center gap-1 rounded-[24px] border border-stone-200/80 bg-ivory py-3 pl-3.5 pr-2.5 text-left active:bg-cream">
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1">
                  <span class="text-[16px] font-medium">${esc(m.name)}</span>
                  ${m.role ? `<span class="shrink-0 rounded-full border border-terra/30 px-1.5 py-0.5 text-[10px] font-medium leading-none text-terra">${esc(m.role)}</span>` : ""}
                </span>
                <span class="mt-1 block text-[12px] text-muted">${esc(m.peer)}또래 · ${formatMd(m.birth) || "생일 미등록"}</span>
              </span>
              <span class="shrink-0 text-[16px] leading-none text-stone-400" aria-hidden="true">›</span>
            </button>`;
          })
          .join("")}
      </div>`;
  }

  function namePicker() {
    return `
      <div id="name-picker-backdrop" class="absolute inset-0 z-40 bg-ink/30" data-action="close-name-picker"></div>
      <div id="name-picker" class="absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-ivory px-5 pb-5 pt-1 shadow-sheet sheet-up">
        <div data-sheet-handle class="-mx-5 flex h-8 items-center justify-center" style="touch-action: none" aria-hidden="true">
          <span class="h-1 w-10 rounded-full bg-stone-300"></span>
        </div>
        <p class="text-[17px] font-semibold">이름 선택</p>
        <div id="name-picker-list" class="mt-3 max-h-[50vh] overflow-y-auto hide-scroll">
          ${namePickerListHtml()}
        </div>
      </div>`;
  }

  const LINK_STYLE = {
    form: "bg-[#EDE7F6] text-[#673AB7]",
    notion: "bg-stone-200/80 text-ink",
    chat: "bg-gold/25 text-[#7A6230]",
    sheet: "bg-sage/15 text-sage",
    doc: "bg-church/10 text-church",
    video: "bg-terra/10 text-terra",
    link: "bg-stone-200/70 text-stone-600",
  };

  function linkGlyph(kind) {
    const wrap = (body) =>
      `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    if (kind === "form") return wrap(`<rect x="5" y="4" width="14" height="16" rx="2"/><circle cx="8.6" cy="8" r="1.45" fill="currentColor" stroke="none"/><path d="M11.6 8H16"/><circle cx="8.6" cy="12" r="1.45" fill="currentColor" stroke="none"/><path d="M11.6 12H16"/><circle cx="8.6" cy="16" r="1.45" fill="currentColor" stroke="none"/><path d="M11.6 16H14.5"/>`);
    if (kind === "notion") return wrap(`<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>`);
    if (kind === "chat") return wrap(`<path d="M6.5 16.2 4.5 20l4-1.4A8 8 0 1 0 6.5 16.2z"/>`);
    if (kind === "sheet") return wrap(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16M10 9v11"/>`);
    if (kind === "doc") return wrap(`<path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4M8.5 12.5h7M8.5 16.5h5"/>`);
    if (kind === "video") return wrap(`<rect x="3.5" y="6.5" width="11" height="11" rx="2"/><path d="M14.5 10.5 20 8v8l-5.5-2.5z"/>`);
    return wrap(`<path d="M10 14a5 5 0 0 0 7.2.4l1.4-1.4a5 5 0 0 0-7-7L10.2 7.4"/><path d="M14 10a5 5 0 0 0-7.2-.4L5.4 11a5 5 0 0 0 7 7l1.4-1.4"/>`);
  }

  function linkCard(link) {
    const style = LINK_STYLE[link.kind] || LINK_STYLE.link;
    const inner = `
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style}">${linkGlyph(link.kind)}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[16px] font-medium">${esc(link.label)}</span>
          <span class="mt-0.5 block text-[12px] text-muted">${esc(link.hint)}</span>
        </span>
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;
    if (link.label !== "양육일기") {
      return `
      <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 rounded-[24px] border border-stone-200/80 bg-ivory px-4 py-3.5 active:bg-cream">
        ${inner}
      </a>`;
    }
    return `
      <div class="overflow-hidden rounded-[24px] border border-stone-200/80 bg-ivory">
        <a href="${esc(diaryHref(link))}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 px-4 py-3.5 active:bg-cream">
          ${inner}
        </a>
        ${diaryEntryButton()}
      </div>`;
  }

  function diaryPerson(name, tag, note, visit) {
    return { name, tag, note, visit: visit || "" };
  }

  function diaryMockCatalog() {
    const page = (id, week, submitted, summary, body) => ({ id, week, submitted, summary, ...body });
    return [
      page("2026-10-05", "2026-10-05", "10/6에 적음", "김하늘, 이도윤과 함께 · 박서연은 결석", {
        present: [
          diaryPerson("김하늘", "01/여", "예배 자리가 조금씩 편해졌다고 했어요.", "수요일에 짧게 통화"),
          diaryPerson("이도윤", "02/남", "과제가 몰려 기도가 흐트러진 한 주였어요.", "금요일 저녁에 밥"),
        ],
        absent: [diaryPerson("박서연", "01/여", "가족 여행. 돌아오면 다시 만나기로 했어요.")],
        care: [],
        count: "6/8",
        mood: "나눔이 평소보다 길었고, 처음 나온 질문이 좋았던 주였어요.",
        faith: [
          ["주일예배", "1부 출석"],
          ["대청부 집회", "출석"],
          ["토요비전새벽예배", "두 번"],
          ["예습", "함"],
          ["성경 통독", "하루 3장 / 5일"],
          ["개인 기도", "하루 20분 / 6일"],
          ["QT", "5일"],
          ["주중모임", "수요기도회"],
        ],
        prayer: "순원들의 이름을 하나씩 불러 보며 기도하고 싶어요.",
        visit: "",
      }),
      page("2026-09-28", "2026-09-28", "9/29에 적음", "김하늘, 박서연과 함께", {
        present: [
          diaryPerson("김하늘", "01/여", "이번 주는 이야기보다 곁에 앉아 있는 시간이 많았어요."),
          diaryPerson("박서연", "01/여", "여행에서 돌아와 모임에 다시 앉았습니다."),
        ],
        absent: [],
        care: [],
        count: "5/8",
        mood: "짧은 나눔이었지만, 서로 안부를 빠짐없이 물었어요.",
        faith: [
          ["주일예배", "출석"],
          ["성경 통독", "하루 3장 / 3일"],
          ["개인 기도", "하루 20분 / 4일"],
          ["QT", "3일"],
        ],
        prayer: "돌아온 한 사람이 다시 자리에 앉은 것이 고마웠습니다.",
        visit: "",
      }),
      page("2026-09-21-b", "2026-09-21", "같은 주, 이어 적음", "이도윤에게 한 줄을 더", {
        present: [diaryPerson("이도윤", "02/남", "모임 후에 기도제목을 한 줄 더 받았어요. 시험이 끝나는 주까지 기억해 두려고 적습니다.")],
        absent: [],
        care: [],
        count: "",
        mood: "",
        faith: [],
        prayer: "",
        visit: "",
      }),
      page("2026-09-21", "2026-09-21", "9/22에 적음", "조용한 모임 · 박서연을 먼저 찾음", {
        present: [
          diaryPerson("김하늘", "01/여", "오늘은 듣기보다 질문을 많이 했어요."),
          diaryPerson("이도윤", "02/남", "말이 적었지만 끝까지 남아 자리를 정리했습니다."),
        ],
        absent: [],
        care: [diaryPerson("박서연", "01/여", "연락이 뜸해져서, 이번 주는 제가 먼저 안부를 물었어요.")],
        count: "5/8",
        mood: "모임은 조용했고, 그래서 한 사람의 이야기를 더 오래 들을 수 있었어요. 중간에 도윤이가 요즘 기도가 잘 안 된다고 솔직하게 말해 줘서, 다른 순원들도 하나둘 자기 이야기를 꺼냈습니다. 다음 주에는 나눔 시간을 조금 더 길게 잡아 보려고 해요.",
        faith: [
          ["주일예배", "2부 출석"],
          ["대청부 집회", "출석"],
          ["성경 통독", "하루 3장 / 4일"],
          ["개인 기도", "하루 15분 / 5일"],
          ["QT", "4일"],
        ],
        prayer: "먼저 연락하는 일을 미루지 않게 해 주세요.",
        visit: "",
      }),
      page("2026-09-14", "2026-09-14", "9/15에 적음", "김하늘, 이도윤, 박서연과 텀을 시작", {
        present: [
          diaryPerson("김하늘", "01/여", "이름을 다시 익히며 이번 텀의 기대를 나눴어요."),
          diaryPerson("이도윤", "02/남", "첫 모임이라 어색해했지만 마지막에는 웃었습니다."),
          diaryPerson("박서연", "01/여", "자신이 맡은 한 주를 스스로 말해 주었어요."),
        ],
        absent: [],
        care: [],
        count: "7/8",
        mood: "텀을 시작하는 주. 서로의 이름을 다시 익혔어요.",
        faith: [
          ["주일예배", "출석"],
          ["예습", "함"],
          ["성경 통독", "하루 2장 / 4일"],
          ["개인 기도", "하루 20분 / 4일"],
          ["QT", "4일"],
        ],
        prayer: "이번 텀 동안 이 순을 잘 품고 싶습니다.",
        visit: "있음 · 개강 후 한 번, 순의 전체를 두고 이야기를 나누고 싶습니다.",
      }),
    ];
  }

  function diaryMockPages() {
    return diaryMockCatalog().map((page) => {
      const start = parseIsoDate(page.week);
      const end = addDays(start, 6);
      return { ...page, range: formatRange(start, end), start, end };
    });
  }

  function diaryView() {
    if (state.diaryId) return diaryFormDetail();
    return diaryListScreen();
  }

  function diaryEntryButton() {
    return `
        <button type="button" data-action="open-diary" class="flex w-full items-center justify-between border-t border-stone-200/80 px-4 py-3 text-left active:bg-cream">
          <span>
            <span class="block text-[13px] font-medium">나의 양육일기 돌아보기</span>
            <span class="mt-0.5 block text-[12px] text-muted">${esc(diaryLatestLine())}</span>
          </span>
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>`;
  }

  function diaryTermWeeks() {
    const weeks = [];
    let cursor = weekRange(DIARY_FIRST_SUNDAY).start;
    while (ymd(addDays(cursor, 6)) <= ymd(CORAM_TERM.end)) {
      weeks.push({ weekKey: isoDate(cursor), sunday: addDays(cursor, 6) });
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }

  function diarySlots() {
    const today = ymd(seoulToday());
    const pages = diaryMockPages();
    return diaryTermWeeks()
      .filter((week) => ymd(week.sunday) <= today)
      .map((week) => {
        const filled = pages.filter((page) => page.week === week.weekKey);
        return {
          ...week,
          pages: filled,
          page: filled.find((page) => page.count) || filled[0] || null,
          dateLabel: formatMd(week.sunday),
        };
      });
  }

  function diaryLatestLine() {
    const latest = diarySlots()
      .filter((slot) => slot.page)
      .pop();
    return latest ? `최근 기록 · ${latest.dateLabel} GBS` : "아직 적힌 기록이 없어요";
  }

  function diarySlotById(id) {
    return diarySlots().find((slot) => slot.weekKey === id || slot.pages.some((page) => page.id === id));
  }

  function diaryCount(text) {
    const match = String(text || "").match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return null;
    const present = Number(match[1]);
    const total = Number(match[2]);
    return total > 0 ? { present, total } : null;
  }

  function diaryTrendChart(slots) {
    const points = slots.map((slot) => ({ slot, count: diaryCount(slot.page?.count) }));
    if (!points.some((point) => point.count)) return "";
    const maxPeople = Math.max(...points.map((point) => point.count?.total || 0), 1);
    const columnWidth = `${(100 / Math.min(points.length, DIARY_TREND_WEEKS)).toFixed(4)}%`;
    const height = (value) => `${((value / maxPeople) * 100).toFixed(1)}%`;
    const columns = points
      .map((point) => {
        const bars = point.count
          ? `<span class="absolute bottom-0 left-1/2 w-[30px] -translate-x-1/2 rounded-[3px] bg-[#E4DDD3]" style="height:${height(point.count.total)}"></span>
              <span class="absolute bottom-0 left-1/2 flex w-[24px] -translate-x-1/2 items-end justify-center rounded-[3px] bg-sage pb-1 text-[10px] font-semibold text-ivory" style="height:${height(point.count.present)}">${point.count.present}</span>`
          : "";
        return `
          <div class="flex-none" style="width:${columnWidth}">
            <div class="relative h-[108px]">${bars}</div>
            <p class="mt-2 text-center text-[10px] ${point.count ? "text-muted" : "text-stone-300"}">${esc(formatMd(point.slot.sunday))}</p>
          </div>`;
      })
      .join("");
    return `<div id="diary-trend" class="flex hide-scroll" style="overflow-x:auto" role="img" aria-label="주일별 라인업 대비 출석인원">${columns}</div>`;
  }

  function diaryLineup(slots) {
    for (let i = slots.length - 1; i >= 0; i--) {
      const count = diaryCount(slots[i].page?.count);
      if (count) return count.total;
    }
    return 0;
  }

  function diaryTrendSheet() {
    if (state.tab !== "diary" || !state.diaryTrendOpen) return "";
    const slots = diarySlots();
    const chart = diaryTrendChart(slots);
    const lineup = diaryLineup(slots);
    return `
      <div id="diary-trend-backdrop" class="absolute inset-0 z-40 bg-ink/30" data-action="close-diary-trend"></div>
      <div id="diary-trend-sheet" class="absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-ivory px-5 pb-6 pt-1 shadow-sheet sheet-up">
        <div data-sheet-handle class="-mx-5 flex h-8 items-center justify-center" style="touch-action: none" aria-hidden="true">
          <span class="h-1 w-10 rounded-full bg-stone-300"></span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <p class="text-[18px] font-semibold">출석 추세</p>
          ${
            chart
              ? `<span class="flex items-center gap-3 text-[11px] text-muted">
            <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 bg-[#E4DDD3]"></span>라인업(${lineup})</span>
            <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 bg-sage"></span>출석</span>
          </span>`
              : ""
          }
        </div>
        <div class="mt-4">${chart || `<p class="text-[13px] text-muted">아직 출석인원이 적힌 응답이 없어요.</p>`}</div>
      </div>`;
  }

  function diaryAverage(slots) {
    const counts = slots.map((slot) => diaryCount(slot.page?.count)).filter(Boolean);
    if (!counts.length) return "";
    return String(Number((counts.reduce((sum, count) => sum + count.present, 0) / counts.length).toFixed(1)));
  }

  function diaryTermStrip(slots) {
    const today = ymd(seoulToday());
    const written = new Set(slots.filter((slot) => slot.page).map((slot) => slot.weekKey));
    const months = [];
    diaryTermWeeks().forEach((week) => {
      const passed = ymd(week.sunday) <= today;
      const tone = written.has(week.weekKey) ? "bg-sage" : passed ? "border border-dashed border-stone-300" : "bg-[#E4DDD3]";
      let month = months[months.length - 1];
      if (!month || month.m !== week.sunday.m) {
        month = { m: week.sunday.m, started: false, cells: [] };
        months.push(month);
      }
      if (passed) month.started = true;
      month.cells.push(`<span class="h-3.5 flex-1 rounded-[2px] ${tone}"></span>`);
    });
    return months
      .map(
        (month) => `
          <div class="min-w-0" style="flex:${month.cells.length}">
            <div class="flex gap-[3px]">${month.cells.join("")}</div>
            <p class="mt-1 whitespace-nowrap text-[10px] ${month.started ? "text-muted" : "text-stone-400"}">${month.m}월</p>
          </div>`
      )
      .join("");
  }

  function diaryListRow(slot) {
    const page = slot.page;
    const count = diaryCount(page.count);
    const mood = page.mood
      ? `<span class="mt-1 block text-[14px] leading-relaxed text-stone-600" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(page.mood)}</span>`
      : `<span class="mt-1 block text-[13px] text-muted">분위기 응답이 없어요.</span>`;
    return `
      <li>
        <button type="button" data-action="open-diary-entry" data-id="${esc(page.id)}" class="flex w-full items-start gap-4 py-3.5 text-left active:opacity-60">
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-semibold leading-6 text-ink">${slot.sunday.d}일</span>
            ${mood}
          </span>
          <span class="flex shrink-0 flex-col items-end">
            ${count ? `<span class="text-[14px] leading-6 text-muted"><span class="font-semibold text-ink">${count.present}</span>/${count.total}</span>` : ""}
            <svg viewBox="0 0 24 24" class="-mr-1 mt-1.5 h-4 w-4 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          </span>
        </button>
      </li>`;
  }

  function diaryListScreen() {
    const slots = diarySlots();
    const written = slots.filter((slot) => slot.page);
    const average = diaryAverage(slots);
    const months = [];
    written
      .slice()
      .reverse()
      .forEach((slot) => {
        let month = months[months.length - 1];
        if (!month || month.m !== slot.sunday.m) {
          month = { m: slot.sunday.m, rows: [] };
          months.push(month);
        }
        month.rows.push(diaryListRow(slot));
      });
    const list = months.length
      ? months
          .map(
            (month) => `
          <section>
            <h2 class="sticky top-[var(--sticky-head,5.5rem)] z-10 bg-cream px-5 pb-2 pt-5 text-[13px] font-semibold text-muted">${month.m}월</h2>
            <ul class="mx-5 divide-y divide-stone-200 border-y border-stone-200">${month.rows.join("")}</ul>
          </section>`
          )
          .join("")
      : `<p class="px-5 pt-5 text-[13px] text-muted">아직 적힌 양육일기가 없어요.</p>`;
    return `
      <header class="px-5 pt-6">
        <button type="button" data-action="close-diary" class="block text-[13px] font-medium text-terra">‹ 주요링크</button>
        <h1 class="mt-3 text-[24px] font-semibold">양육일기 돌아보기</h1>
      </header>
      <div data-sticky-head class="sticky top-0 z-20 mt-4 border-b border-stone-200 bg-cream px-5 pb-2.5 pt-3">
        <div class="flex items-center justify-between gap-3">
          <p class="min-w-0 text-[13px] text-muted">양육일기 작성 <span class="font-semibold text-sage">${written.length}주</span>${
            average
              ? `<span class="mx-1.5 text-stone-300">|</span>평균 출석 <span class="font-semibold text-ink">${average}명</span> / ${diaryLineup(slots)}명`
              : ""
          }</p>
          <button type="button" data-action="open-diary-trend" class="flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-sage active:opacity-60">
            출석 추세
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          </button>
        </div>
        <div class="mt-2.5 flex gap-1.5" role="img" aria-label="이번 텀 주일마다 양육일기를 적었는지">${diaryTermStrip(slots)}</div>
      </div>
      <div class="pb-8">${list}</div>`;
  }

  function diaryFormDetail() {
    const page = diaryMockPages().find((item) => item.id === state.diaryId);
    const slot = diarySlotById(state.diaryId);
    const heading = slot ? `${slot.dateLabel} GBS` : "양육일기";
    if (!page) {
      return `
        <header class="px-5 pt-6">
          <button type="button" data-action="close-diary-entry" class="block text-[13px] font-medium text-terra">‹ 목록</button>
          <h1 class="mt-3 text-[24px] font-semibold">${esc(heading)}</h1>
          <p class="mt-4 text-[13px] text-muted">이 주일에는 적힌 응답이 없어요.</p>
        </header>`;
    }
    return diaryDetailSummary(page, slot);
  }

  function diaryBack() {
    return `<button type="button" data-action="close-diary-entry" class="block text-[13px] font-medium text-terra">‹ 목록</button>`;
  }

  function diaryOneOnOne(person) {
    return person.visit ? `<p class="mt-1.5 text-[12px] text-muted">원투원 · ${esc(person.visit)}</p>` : "";
  }

  function diaryDetailSummary(page, slot) {
    const count = diaryCount(page.count);
    const group = (title, list) =>
      list.length
        ? `<section class="mt-8">
          <p class="text-[13px] font-medium text-muted">${title} ${list.length}</p>
          <ul class="mt-2 divide-y divide-stone-200 border-y border-stone-200">
            ${list
              .map(
                (person) => `
              <li class="py-4">
                <p class="text-[15px] font-semibold">${esc(person.name)} <span class="text-[12px] font-normal text-muted">${esc(person.tag)}</span></p>
                <p class="mt-1.5 text-[14px] leading-relaxed">${esc(person.note)}</p>
                ${diaryOneOnOne(person)}
              </li>`
              )
              .join("")}
          </ul>
        </section>`
        : "";
    const meter = count
      ? `<div class="mt-6">
          <p class="text-[20px] font-semibold leading-snug">${count.total}명 중 <span class="text-sage">${count.present}명</span>이<br />함께했어요</p>
          <div class="mt-4 h-2.5 w-full rounded-[3px] bg-[#E4DDD3]"><div class="h-full rounded-[3px] bg-sage" style="width:${Math.round((count.present / count.total) * 100)}%"></div></div>
        </div>`
      : "";
    return `
      <header class="px-5 pt-6">
        ${diaryBack()}
        <h1 class="mt-3 text-[24px] font-semibold">${esc(slot.dateLabel)} GBS</h1>
        ${meter}
      </header>
      <div class="mt-8 px-5 pb-10">
        ${page.mood ? `<p class="text-[13px] font-medium text-muted">분위기</p><p class="mt-2 text-[16px] leading-relaxed">${esc(page.mood)}</p>` : ""}
        ${group("함께한 순원", page.present || [])}
        ${group("함께하지 못한 순원", [...(page.absent || []), ...(page.care || [])])}
      </div>`;
  }

  function linksView() {
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">주요링크</h1>
        <p class="mt-2 text-[13px] text-muted">자주 사용하게 될 링크를 모아 두었어요</p>
      </header>
      <div class="mt-6 space-y-3 px-5 pb-6">
        ${
          state.links.length
            ? state.links.map(linkCard).join("")
            : `<p class="mt-8 text-center text-[14px] text-muted">등록된 링크가 없습니다</p>`
        }
      </div>`;
  }

  function cancelCoramGoalEdit() {
    state.coramGoalEdit = null;
    state.coramGoalDraft = null;
  }

  function coramDayButtons(kind, flags, weekStart) {
    const today = seoulToday();
    const isCurrent = coramWeekKey(0) === isoDate(weekStart);
    const todayIndex = isCurrent ? (weekdayIndex(today) === 0 ? 6 : weekdayIndex(today) - 1) : -1;
    return `<div class="grid grid-cols-7 gap-1.5">${CORAM_DAYS.map((label, index) => {
      const todayMark = index === todayIndex;
      const shown = todayMark ? "오늘" : label;
      const size = todayMark ? "text-[11px]" : "text-[13px]";
      if (index >= flags.length) {
        const quietLabel = todayMark ? "오늘은 QT에 포함되지 않아요" : "일요일은 QT에 포함되지 않아요";
        return `<span aria-disabled="true" aria-label="${quietLabel}" class="flex aspect-square w-full items-center justify-center rounded-full border border-dashed border-stone-200 bg-stone-100 font-semibold text-stone-300 ${size}">${shown}</span>`;
      }
      const on = Boolean(flags[index]);
      const tone = on ? "border border-terra bg-terra text-ivory" : "border border-stone-200 bg-ivory text-ink";
      return `<button type="button" data-action="coram-day" data-kind="${kind}" data-index="${index}" aria-pressed="${on ? "true" : "false"}" aria-label="${shown} ${on ? "함" : "안 함"}" class="flex aspect-square w-full items-center justify-center rounded-full font-semibold ${size} ${tone}">${shown}</button>`;
    }).join("")}</div>`;
  }

  function coramGoalRow(kind, value, unit) {
    const editing = state.coramGoalEdit === kind;
    const shown = editing ? state.coramGoalDraft : value;
    const pencil = `<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>`;
    if (!editing) {
      return `
        <div class="flex items-center gap-1">
          <p class="text-[12px] text-muted">하루에</p>
          <p class="text-[15px] font-semibold">${shown}${unit}</p>
          <button type="button" data-action="coram-goal-edit" data-kind="${kind}" class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400" aria-label="하루 목표 수정">${pencil}</button>
        </div>`;
    }
    return `
      <div class="flex items-center">
        <p class="mr-0.5 text-[12px] text-muted">하루에</p>
        <button type="button" data-action="coram-goal" data-kind="${kind}" data-step="-1" class="flex h-7 w-6 items-center justify-center text-[15px] leading-none text-stone-400" aria-label="${unit} 줄이기">−</button>
        <p class="min-w-[2.6rem] text-center text-[15px] font-semibold">${shown}${unit}</p>
        <button type="button" data-action="coram-goal" data-kind="${kind}" data-step="1" class="flex h-7 w-6 items-center justify-center text-[15px] leading-none text-stone-400" aria-label="${unit} 늘리기">+</button>
        <button type="button" data-action="coram-goal-commit" data-kind="${kind}" class="ml-1 rounded-full bg-terra px-2.5 py-1 text-[12px] font-semibold text-ivory">결단</button>
      </div>`;
  }

  function coramCard({ title, aside = "", body }) {
    return `
      <section class="rounded-[24px] border border-stone-200/80 bg-ivory px-4 py-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-[16px] font-semibold">${title}</h2>
          ${aside}
        </div>
        ${body}
      </section>`;
  }

  function coramStatus() {
    if (state.coramSave === "saving") return `<p class="pt-1 text-center text-[12px] text-muted">기록을 저장하고 있어요</p>`;
    if (state.coramSave === "saved") return `<p class="pt-1 text-center text-[12px] text-muted">기록이 저장되었어요</p>`;
    if (state.coramSave === "error") {
      return `<div class="pt-1 text-center"><p class="text-[12px] text-terra">${esc(state.coramError || "시트에 남기지 못했어요")}</p><button type="button" data-action="coram-retry" class="mt-2 text-[13px] font-medium text-terra">다시 저장</button></div>`;
    }
    return "";
  }

  function parseIsoDate(text) {
    const match = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function shiftMonth(month, delta) {
    const next = new Date(Date.UTC(month.y, month.m - 1 + delta, 1));
    return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1 };
  }

  function sameMonth(a, b) {
    return a.y === b.y && a.m === b.m;
  }

  function coramInTerm(date) {
    const n = ymd(date);
    return n >= ymd(CORAM_TERM.start) && n <= ymd(CORAM_TERM.end);
  }

  function coramMonthKey(month) {
    return month.y * 12 + month.m;
  }

  function coramMonthInTerm(month) {
    const n = coramMonthKey(month);
    return n >= coramMonthKey(CORAM_TERM.start) && n <= coramMonthKey(CORAM_TERM.end);
  }

  function coramTermMonths() {
    const months = [];
    let cursor = { y: CORAM_TERM.start.y, m: CORAM_TERM.start.m };
    while (coramMonthInTerm(cursor)) {
      months.push(cursor);
      cursor = shiftMonth(cursor, 1);
    }
    return months;
  }

  function coramActiveMonth() {
    const today = seoulToday();
    const month = state.coramLook?.y ? state.coramLook : { y: today.y, m: today.m };
    if (coramMonthKey(month) < coramMonthKey(CORAM_TERM.start)) return { y: CORAM_TERM.start.y, m: CORAM_TERM.start.m };
    if (coramMonthKey(month) > coramMonthKey(CORAM_TERM.end)) return { y: CORAM_TERM.end.y, m: CORAM_TERM.end.m };
    return month;
  }

  function coramDayMap() {
    const byWeek = {};
    for (const row of state.coramRows) {
      if (row.name === state.sessionName) byWeek[row.week] = row;
    }
    for (const draft of Object.values(state.coramDrafts)) {
      if (draft?.name === state.sessionName) byWeek[draft.week] = draft;
    }
    const map = {};
    for (const row of Object.values(byWeek)) {
      const start = parseIsoDate(row.week);
      if (!start) continue;
      for (let index = 0; index < 7; index += 1) {
        const date = addDays(start, index);
        map[isoDate(date)] = {
          pray: Boolean(row.prayDays[index]),
          read: Boolean(row.readDays[index]),
          qt: index < 6 ? Boolean(row.qtDays[index]) : false,
          goalPray: row.prayGoal,
          goalRead: row.readGoal,
        };
      }
    }
    return map;
  }

  function coramApplies(date) {
    return weekdayIndex(date) === 0 ? ["pray", "read"] : ["pray", "read", "qt"];
  }

  function coramLevel(entry, date) {
    if (!entry) return 0;
    const keys = coramApplies(date);
    const done = keys.filter((key) => entry[key]).length;
    if (done === 0) return 0;
    if (done === keys.length) return 2;
    return 1;
  }

  function coramMonthStats(map, month) {
    const today = seoulToday();
    const total = daysInMonth(month.y, month.m);
    const stats = { pray: 0, read: 0, qt: 0 };
    for (let day = 1; day <= total; day += 1) {
      const date = { y: month.y, m: month.m, d: day };
      if (!coramInTerm(date) || ymd(date) > ymd(today)) continue;
      const entry = map[isoDate(date)];
      if (!entry) continue;
      if (entry.pray) stats.pray += 1;
      if (entry.read) stats.read += 1;
      if (weekdayIndex(date) !== 0 && entry.qt) stats.qt += 1;
    }
    return stats;
  }

  function coramMonthCells(month) {
    const first = { y: month.y, m: month.m, d: 1 };
    const lead = weekdayIndex(first) === 0 ? 6 : weekdayIndex(first) - 1;
    const cells = Array(lead).fill(null);
    const total = daysInMonth(month.y, month.m);
    for (let day = 1; day <= total; day += 1) cells.push({ y: month.y, m: month.m, d: day });
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function coramOffsetForDate(date) {
    const target = weekRange(date).start;
    const current = weekRange(seoulToday()).start;
    const diff = Date.UTC(target.y, target.m - 1, target.d) - Date.UTC(current.y, current.m - 1, current.d);
    return Math.round(diff / (7 * 86400000));
  }

  function coramDayDetail(entry, date) {
    const marks = [
      ["pray", "기도"],
      ["read", "통독"],
    ];
    if (weekdayIndex(date) !== 0) marks.push(["qt", "QT"]);
    const checks = marks
      .map(([key, label]) => {
        const on = Boolean(entry?.[key]);
        return `<span class="inline-flex items-center gap-1 text-[13px] ${on ? "font-semibold text-ink" : "text-stone-400"}"><span aria-hidden="true">${on ? "✓" : "–"}</span>${label}</span>`;
      })
      .join("");
    if (!entry) {
      return `<p class="mt-1 text-[13px] text-muted">남긴 기록이 없어요</p>`;
    }
    return `
      <p class="mt-1 text-[13px] text-muted">목표 기도 ${entry.goalPray}분 · 통독 ${entry.goalRead}장</p>
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">${checks}</div>`;
  }

  function coramFillClass(level, date) {
    const today = seoulToday();
    const quiet = "bg-[#E4DCD0] text-stone-600";
    if (ymd(date) === ymd(today) && level < 2) return "bg-white text-ink";
    if (!coramInTerm(date)) return "bg-[#F3EFE8] text-stone-400";
    if (ymd(date) > ymd(today) || level === 0) return quiet;
    if (level === 2) return "bg-terra text-ivory";
    if (level === 1) return "bg-[#E8C7C0] text-ink";
    return quiet;
  }

  function scrollCoramTo(id) {
    requestAnimationFrame(() => {
      const scroller = document.getElementById("main-scroll");
      if (!scroller) return;
      const el = id ? document.getElementById(id) : null;
      if (!el) {
        scroller.scrollTop = 0;
        return;
      }
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, top - 8);
    });
  }

  function coramWeekBody() {
    const start = coramWeekStart();
    const end = addDays(start, 6);
    const week = coramWeekKey();
    const record = coramRecordFor(week);
    const weekLabel = state.coramOffset === 0 ? `이번 주 · ${formatRange(start, end)}` : formatRange(start, end);
    const nextMuted = state.coramOffset >= 0;
    return `
      <div class="mt-6 space-y-3 px-5 pb-6">
        <div class="flex items-center justify-between rounded-[24px] border border-stone-200/80 bg-ivory px-2 py-2">
          <button type="button" data-action="coram-week" data-step="-1" class="flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none text-ink" aria-label="이전 주">‹</button>
          <p class="text-[14px] font-medium">${esc(weekLabel)}</p>
          <button type="button" data-action="coram-week" data-step="1" class="flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none ${nextMuted ? "text-stone-300" : "text-ink"}" ${nextMuted ? "disabled" : ""} aria-label="다음 주">›</button>
        </div>
        ${coramCard({
          title: "기도",
          aside: coramGoalRow("pray", record.prayGoal, "분"),
          body: coramDayButtons("pray", record.prayDays, start),
        })}
        ${coramCard({
          title: "통독",
          aside: coramGoalRow("read", record.readGoal, "장"),
          body: coramDayButtons("read", record.readDays, start),
        })}
        ${coramCard({
          title: "QT",
          body: coramDayButtons("qt", record.qtDays, start),
        })}
        <button type="button" data-action="coram-pane" data-pane="term" class="flex w-full items-center justify-between rounded-[24px] border border-stone-200/80 bg-ivory px-4 py-4 text-left">
          <span>
            <span class="block text-[16px] font-semibold">이번 텀 한 눈에 보기</span>
            <span class="mt-1 block text-[13px] text-muted">9월 13일–3월 13일</span>
          </span>
          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
        ${coramStatus()}
      </div>`;
  }

  function coramTermBody() {
    const map = coramDayMap();
    const today = seoulToday();
    const month = coramActiveMonth();
    const prevMuted = !coramMonthInTerm(shiftMonth(month, -1));
    const nextMuted = !coramMonthInTerm(shiftMonth(month, 1));
    const stats = coramMonthStats(map, month);
    const focus = parseIsoDate(state.coramFocus);
    const focusEntry = focus ? map[isoDate(focus)] : null;
    const cells = coramMonthCells(month)
      .map((date) => {
        if (!date) return `<span></span>`;
        const key = isoDate(date);
        const level = coramLevel(map[key], date);
        const closed = !coramInTerm(date) || ymd(date) > ymd(today);
        const selected = state.coramFocus === key;
        const klass = `${coramFillClass(level, date)} ${selected ? "outline outline-2 outline-ink" : ""}`;
        const label = `${date.m}월 ${date.d}일 ${WEEKDAYS[weekdayIndex(date)]}`;
        if (closed) {
          return `<span class="flex aspect-square items-center justify-center rounded-xl text-[12px] font-semibold ${klass}">${date.d}</span>`;
        }
        return `<button type="button" data-action="coram-focus" data-date="${key}" aria-label="${label}" aria-pressed="${selected ? "true" : "false"}" class="flex aspect-square items-center justify-center rounded-xl text-[12px] font-semibold ${klass}">${date.d}</button>`;
      })
      .join("");
    const termMonths = coramTermMonths()
      .map((item) => {
        const mini = coramMonthCells(item)
          .map((date) => {
            if (!date) return `<span class="aspect-square"></span>`;
            const level = coramLevel(map[isoDate(date)], date);
            return `<span class="aspect-square rounded-[2px] ${coramFillClass(level, date)}"></span>`;
          })
          .join("");
        const viewing = sameMonth(item, month);
        const shell = `flex w-full flex-col items-stretch rounded-2xl px-1.5 py-1.5 text-left ${viewing ? "bg-ivory ring-1 ring-terra" : ""}`;
        return `<button type="button" data-action="coram-pick-month" data-year="${item.y}" data-month="${item.m}" aria-label="${item.y}년 ${item.m}월" class="${shell}"><span class="mb-1 block w-full text-center"><span class="block text-[10px] leading-3 text-muted">${String(item.y).slice(2)}년</span><span class="block text-[11px] font-medium leading-4 text-ink">${item.m}월</span></span><span class="grid w-full grid-cols-7 gap-px">${mini}</span></button>`;
      })
      .join("");
    const detail = focus
      ? `<div class="mt-3 rounded-2xl bg-cream px-3 py-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[14px] font-medium">${focus.m}월 ${focus.d}일 ${WEEKDAYS[weekdayIndex(focus)]}</p>
            <button type="button" data-action="coram-jump-week" data-date="${isoDate(focus)}" class="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-terra">이 주 기록 수정하기<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
          </div>
          ${coramDayDetail(focusEntry, focus)}
        </div>`
      : "";
    const arrow = (step, muted, label) =>
      `<button type="button" data-action="coram-month" data-step="${step}" class="flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none ${muted ? "text-stone-300" : "text-ink"}" ${muted ? "disabled" : ""} aria-label="${label}">${step < 0 ? "‹" : "›"}</button>`;
    return `
      <div class="mt-6 space-y-3 px-5 pb-8">
        <section id="coram-month" class="rounded-[24px] border border-stone-200/80 bg-ivory px-4 py-4">
          <div class="flex items-center justify-between">
            ${arrow(-1, prevMuted, "이전 달")}
            <p class="text-[15px] font-semibold">${month.y}년 ${month.m}월</p>
            ${arrow(1, nextMuted, "다음 달")}
          </div>
          <p class="mt-1 text-center text-[13px] text-muted">기도 <span class="font-semibold text-ink">${stats.pray}</span> · 통독 <span class="font-semibold text-ink">${stats.read}</span> · QT <span class="font-semibold text-ink">${stats.qt}</span></p>
          <div class="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">${CORAM_DAYS.map((label) => `<span>${label}</span>`).join("")}</div>
          <div class="mt-1 grid grid-cols-7 gap-1">${cells}</div>
          ${detail}
          <div class="mt-3 flex items-center justify-center gap-3 text-[11px] text-muted">
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-[3px] bg-[#E4DCD0]"></span>없음</span>
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-[3px] bg-[#E8C7C0]"></span>일부</span>
            <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-[3px] bg-terra"></span>모두</span>
          </div>
        </section>
        <section class="px-1 pt-2">
          <h2 class="text-[16px] font-semibold">이번 텀</h2>
          <p class="mt-1 text-[13px] text-muted">달력을 누르면 해당 월이 위에서 보여집니다</p>
          <div class="mt-3 grid grid-cols-3 items-start gap-2">${termMonths}</div>
        </section>
      </div>`;
  }

  function coramView() {
    if (state.coramPane === "term") {
      return `
        <header class="px-5 pt-6">
          <button type="button" data-action="coram-pane" data-pane="week" class="text-[14px] font-medium text-terra">‹ 이번 주</button>
          <h1 class="mt-3 text-[24px] font-semibold">이번 텀 나의 코람데오</h1>
          <p class="mt-2 text-[13px] text-muted">9월 13일부터 3월 13일까지</p>
        </header>
        ${coramTermBody()}`;
    }
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">나의 코람데오</h1>
        <p class="mt-2 text-[13px] text-muted">한 주간 하나님 앞에 나아간 기록</p>
      </header>
      ${coramWeekBody()}`;
  }

  function tabbar() {
    const tab = (id, label, icon) => {
      const on = state.tab === id;
      return `
        <button data-action="tab" data-tab="${id}" class="flex flex-1 flex-col items-center gap-0.5 py-2.5 ${on ? "text-terra" : "text-muted"}">
          ${icon(on)}
          <span class="whitespace-nowrap text-[11px] font-medium">${label}</span>
        </button>`;
    };
    return `
      <nav class="tabbar-safe z-30 shrink-0 border-t border-stone-200/80 bg-ivory/95 backdrop-blur">
        <div class="flex px-2">
          ${tab("home", "홈", iconHome)}
          ${tab("schedule", "일정", iconCal)}
          ${tab("members", "구성원", iconPeople)}
          ${tab("coram", "코람데오", iconCoram)}
          ${tab("links", "주요링크", iconLink)}
        </div>
      </nav>`;
  }

  function greetingName(member) {
    if (!member?.name) return "";
    const title = String(member.role || "").includes("지기") ? "지기" : "순장";
    return `${member.name} ${title}님`;
  }

  function homeView(today, range) {
    const member = currentMember();
    const events = weekEvents(range);
    const { week, month } = birthdaySets(today, range);
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">안녕하세요, ${esc(greetingName(member))}</h1>
        <p class="mt-2 text-[13px] text-muted">${esc(timeGreeting())}</p>
      </header>

      <section class="mx-5 mt-6 rounded-[24px] border border-stone-200/80 bg-ivory p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-[18px] font-semibold">이번 주 일정</h2>
          <span class="shrink-0 text-[13px] font-medium text-stone-400">${esc(formatRange(range.start, range.end))}</span>
        </div>
        <div class="mt-3 divide-y divide-stone-100">
          ${
            events.length
              ? homeDays(events, today)
              : `<p class="py-4 text-[14px] text-muted">이번 주 등록된 일정이 없습니다</p>`
          }
        </div>
      </section>

      <section class="mx-5 mt-4 rounded-[24px] border border-stone-200/80 bg-ivory p-5">
        <h2 class="text-[18px] font-semibold">생일자</h2>
        ${
          week.length
            ? `<div class="mt-3 flex gap-3 overflow-x-auto hide-scroll pb-1">
                ${week
                  .map(
                    (m) => `
                  <div class="flex min-w-[92px] flex-col items-center rounded-2xl bg-gold/15 px-3 py-3">
                    <span class="flex h-10 w-10 items-center justify-center rounded-full bg-gold/30 font-semibold leading-none whitespace-nowrap text-[#7A6230] ${initialClass(m.name, "text-[14px]", "text-[12px] tracking-tight")}">${esc(initialOf(m.name))}</span>
                    <p class="mt-2 text-[13px] font-medium">${esc(m.name)}</p>
                    <p class="text-[11px] text-muted">${formatMd(m.birth)}</p>
                  </div>`
                  )
                  .join("")}
              </div>`
            : `<p class="mt-2 text-[14px] text-muted">이번 주 생일자가 없습니다</p>`
        }
        <p class="mt-4 text-[12px] font-semibold text-muted">이번 달</p>
        ${
          month.length
            ? `<ul class="mt-1 space-y-1">
                ${month
                  .map(
                    (m) => `
                  <li class="flex items-center justify-between py-1 text-[14px]">
                    <span>${esc(m.name)}</span>
                    <span class="text-muted">${formatMd(m.birth)}</span>
                  </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="mt-1 text-[14px] text-muted">이번 달 생일자가 없습니다</p>`
        }
      </section>

      <div class="px-5 pb-6 pt-8 text-center">
        <button data-action="logout" class="rounded-full border border-stone-200/70 px-5 py-2 text-[13px] text-stone-400">로그아웃</button>
      </div>`;
  }

  function sameWeek(a, b) {
    if (!a || !b) return false;
    return ymd(weekRange(a.date).start) === ymd(weekRange(b.date).start);
  }

  function scheduleRows(events, today, anchorYmd) {
    const days = [];
    for (const event of events) {
      const last = days[days.length - 1];
      if (last && ymd(last[0].date) === ymd(event.date)) last.push(event);
      else days.push([event]);
    }
    return days
      .map((day, index) => {
        const next = days[index + 1];
        const linked = next && sameWeek(day[0], next[0]);
        const line = linked
          ? `<div class="absolute -left-2.5 top-[17.5px] -bottom-[33.5px] w-px -translate-x-1/2 bg-stone-200"></div>`
          : "";
        const isAnchor = anchorYmd != null && ymd(day[0].date) === anchorYmd;
        return `<div class="relative mb-4"${isAnchor ? " data-schedule-anchor" : ""}>${line}${scheduleDay(day, today)}</div>`;
      })
      .join("");
  }

  function scheduleAnchorYmd(groups, today) {
    if (!today) return null;
    const todayN = ymd(today);
    for (const group of groups) {
      for (const event of group.events) {
        if (ymd(event.date) >= todayN) return ymd(event.date);
      }
    }
    return null;
  }

  function scrollScheduleToToday() {
    const scroller = document.getElementById("main-scroll");
    const target = scroller?.querySelector("[data-schedule-anchor]");
    if (!scroller || !target) return;
    const header = scroller.querySelector("header");
    const month = target.closest(".mb-5")?.querySelector("h2");
    const headerH = header ? header.offsetHeight : 0;
    const monthH = month ? month.offsetHeight : 0;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, top - headerH - monthH);
  }

  let scheduleJumpToToday = true;
  let scheduleScrollTop = 0;
  let scheduleDomFresh = false;
  let scheduleScrollToken = 0;

  function captureScheduleScroll() {
    if (state.tab !== "schedule" || scheduleJumpToToday || scheduleDomFresh) return;
    const scroller = document.getElementById("main-scroll");
    if (!scroller) return;
    scheduleScrollTop = scroller.scrollTop;
  }

  function queueScheduleScroll() {
    if (state.tab !== "schedule") {
      scheduleDomFresh = false;
      return;
    }
    const token = ++scheduleScrollToken;
    const jump = scheduleJumpToToday;
    const keep = scheduleScrollTop;
    scheduleDomFresh = true;
    requestAnimationFrame(() => {
      if (token !== scheduleScrollToken) return;
      const scroller = document.getElementById("main-scroll");
      if (!scroller) return;
      if (jump) scrollScheduleToToday();
      else scroller.scrollTop = keep;
      scheduleJumpToToday = false;
      scheduleScrollTop = scroller.scrollTop;
      scheduleDomFresh = false;
    });
  }

  function scheduleView(today) {
    const groups = groupedEvents();
    const anchorYmd = scheduleAnchorYmd(groups, today);
    return `
      <header data-sticky-head class="sticky top-0 z-30 bg-cream px-5 pb-3 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">이번 텀 일정</h1>
        ${scheduleVersionLabel(state.scheduleVersion) ? `<p class="mt-2 text-[13px] text-muted">${esc(scheduleVersionLabel(state.scheduleVersion))}</p>` : ""}
        <div class="mt-6 flex gap-1.5 overflow-x-auto hide-scroll">
          ${FILTERS.map((f) => {
            const on = state.scheduleFilter === f;
            return `<button data-action="filter" data-filter="${f}" class="shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-medium ${on ? "bg-terra text-ivory" : "bg-ivory text-muted border border-stone-200"}">${f}</button>`;
          }).join("")}
        </div>
      </header>
      <div class="px-5 pb-4">
        ${
          groups.length
            ? groups
                .map(
                  (group) => `
            <div class="mb-5">
              <h2 class="sticky top-[var(--sticky-head,7.5rem)] z-20 -mx-5 bg-cream px-5 py-2 text-[13px] font-semibold text-muted">${esc(group.title)}</h2>
              <div class="relative z-0 pl-5">
                ${scheduleRows(group.events, today, anchorYmd)}
              </div>
            </div>`
                )
                .join("")
            : `<p class="mt-8 text-center text-[14px] text-muted">해당하는 일정이 없습니다</p>`
        }
      </div>`;
  }

  function membersView() {
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">구성원</h1>
        <p class="mt-2 text-[13px] leading-snug text-muted">내가 너희를 사랑한 것 같이 서로 사랑하라(요15:12)</p>
      </header>
      <div id="member-list" class="mt-6 px-5 pb-4">
        ${memberListHtml()}
      </div>`;
  }

  function memberSheet() {
    const m = state.selectedMember;
    if (!m) return "";
    return `
      <div id="member-sheet-backdrop" class="absolute inset-0 z-40 bg-ink/30" data-action="close-member"></div>
      <div id="member-sheet" class="absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-ivory px-5 pb-8 pt-1 shadow-sheet sheet-up" style="touch-action: none">
        <div data-sheet-handle class="-mx-5 flex h-8 items-center justify-center" aria-hidden="true">
          <span class="h-1 w-10 rounded-full bg-stone-300"></span>
        </div>
        <div>
          <p class="text-[18px] font-semibold">${esc(m.name)}</p>
          <p class="text-[13px] text-muted">${esc(m.peer)}또래${m.role ? ` · ${esc(m.role)}` : ""} · 생일 ${formatMd(m.birth) || "미등록"}</p>
        </div>
        ${
          m.phone
            ? `
          <p class="mt-6 text-center text-[28px] font-semibold tracking-wide">${esc(m.phone)}</p>
          <button data-action="copy-phone" class="mt-5 h-[52px] w-full rounded-2xl bg-terra text-[16px] font-semibold text-ivory">번호 복사</button>`
            : `<p class="mt-6 text-center text-[14px] text-muted">등록된 전화번호가 없습니다</p>`
        }
      </div>`;
  }

  function toastView() {
    if (!state.toast) return "";
    return `<div class="pointer-events-none absolute inset-x-0 bottom-24 z-[60] px-8"><div class="toast-in rounded-full bg-ink/90 px-4 py-2.5 text-center text-[13px] text-ivory">${esc(state.toast)}</div></div>`;
  }

  function render() {
    captureScheduleScroll();
    if (state.status === "loading") {
      appEl.innerHTML = skeleton();
      return;
    }
    if (state.status === "error") {
      appEl.innerHTML = errorView();
      return;
    }
    if (!state.sessionName) {
      appEl.innerHTML = loginView() + toastView();
      bind();
      bindSheetDrag("name-picker", "name-picker-backdrop", "close-name-picker", { handleOnly: true });
      return;
    }

    const today = seoulToday();
    const range = weekRange(today);
    let body = "";
    if (state.tab === "schedule") body = scheduleView(today);
    else if (state.tab === "members") body = membersView();
    else if (state.tab === "coram") body = coramView();
    else if (state.tab === "links") body = linksView();
    else if (state.tab === "diary") body = diaryView();
    else body = homeView(today, range);

    appEl.innerHTML = `
      <div class="flex h-full min-h-0 flex-col overflow-hidden bg-cream">
        <div class="relative min-h-0 flex-1">
        <div id="main-scroll" class="h-full overflow-y-auto hide-scroll overscroll-y-contain pb-4">
          <div id="pull-indicator" class="flex items-center justify-center overflow-hidden" style="height:0">
            <div id="pull-badge" class="flex h-10 w-10 items-center justify-center rounded-full border border-terra/40 bg-ivory text-terra shadow-sm">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.3-5.7" stroke-linecap="round"/>
                <path d="M20 4v5h-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          ${body}
        </div>
        ${diaryTrendSheet()}
        </div>
        ${tabbar()}
      </div>
      ${memberSheet()}
      ${toastView()}`;
    bind();
    bindPullToRefresh();
    bindSheetDrag("member-sheet", "member-sheet-backdrop", "close-member");
    bindSheetDrag("diary-trend-sheet", "diary-trend-backdrop", "close-diary-trend", { handleOnly: true });
    if (stickyHeadObserver) {
      stickyHeadObserver.disconnect();
      stickyHeadObserver = null;
    }
    syncStickyHead();
    const stickyHead = document.querySelector("#main-scroll [data-sticky-head]");
    if (stickyHead && window.ResizeObserver) {
      stickyHeadObserver = new ResizeObserver(() => syncStickyHead());
      stickyHeadObserver.observe(stickyHead);
    }
    queueScheduleScroll();
    const diaryTrend = document.getElementById("diary-trend");
    if (diaryTrend) {
      diaryTrend.scrollLeft = diaryTrend.scrollWidth;
      requestAnimationFrame(() => {
        diaryTrend.scrollLeft = diaryTrend.scrollWidth;
      });
    }
    if (restoreScroll && state.tab === restoreScroll.tab) {
      const scroller = document.getElementById("main-scroll");
      if (scroller) scroller.scrollTop = restoreScroll.top;
    }
    restoreScroll = null;
  }

  let restoreScroll = null;

  function renderKeepingScroll() {
    const scroller = document.getElementById("main-scroll");
    restoreScroll = {
      tab: state.tab,
      top: scroller ? scroller.scrollTop : 0,
    };
    render();
  }

  function bindSheetDrag(sheetId, backdropId, closeAction, { handleOnly = false } = {}) {
    const sheet = document.getElementById(sheetId);
    const backdrop = document.getElementById(backdropId);
    if (!sheet) return;
    let startY = 0;
    let dragging = false;
    let delta = 0;
    let pointerId = null;
    let closeTimer = 0;

    function closeSheet() {
      handleAction(closeAction);
    }

    sheet.addEventListener("pointerdown", (event) => {
      if (handleOnly && !event.target.closest("[data-sheet-handle]")) return;
      if (event.target.closest("button")) return;
      clearTimeout(closeTimer);
      dragging = true;
      startY = event.clientY;
      delta = 0;
      pointerId = event.pointerId;
      sheet.classList.remove("sheet-up");
      sheet.style.transition = "none";
      if (backdrop) backdrop.style.transition = "none";
      try {
        sheet.setPointerCapture(event.pointerId);
      } catch {
        /* already captured or unsupported */
      }
    });

    sheet.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      delta = Math.max(0, event.clientY - startY);
      if (delta > 0 && event.cancelable) event.preventDefault();
      sheet.style.transform = `translateY(${delta}px)`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0.2, 1 - delta / 280));
    });

    function end(event) {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      const height = sheet.getBoundingClientRect().height || 1;
      const shouldClose = delta > Math.min(110, height * 0.22);
      sheet.style.transition = "transform 0.22s ease";
      if (backdrop) backdrop.style.transition = "opacity 0.22s ease";
      if (shouldClose) {
        sheet.style.transform = "translateY(110%)";
        if (backdrop) backdrop.style.opacity = "0";
        closeTimer = window.setTimeout(closeSheet, 200);
        return;
      }
      sheet.style.transform = "translateY(0)";
      if (backdrop) backdrop.style.opacity = "";
    }

    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  }

  function bindList(root) {
    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (event) => {
        const action = el.getAttribute("data-action");
        if (action === "close-name-picker" || action === "close-member" || action === "close-diary-trend") {
          event.stopPropagation();
        }
        handleAction(action, el);
      });
    });
  }

  function paintPull(mode, distance = 0) {
    const indicator = document.getElementById("pull-indicator");
    const badge = document.getElementById("pull-badge");
    const icon = badge?.querySelector("svg");
    if (!indicator || !badge || !icon) return;
    if (mode === "hidden") {
      indicator.style.height = "0px";
      badge.style.opacity = "0";
      badge.classList.remove("pull-ready", "pull-spin");
      icon.style.transform = "";
      return;
    }
    if (mode === "refresh") {
      indicator.style.height = "64px";
      badge.style.opacity = "1";
      badge.classList.add("pull-ready", "pull-spin");
      icon.style.transform = "";
      return;
    }
    const ready = distance > 72;
    indicator.style.height = `${Math.min(distance * 0.62, 76)}px`;
    badge.style.opacity = String(Math.min(1, 0.35 + distance / 80));
    badge.classList.toggle("pull-ready", ready);
    badge.classList.remove("pull-spin");
    icon.style.transform = `rotate(${Math.min(distance * 2.4, 220)}deg)`;
  }

  function bindPullToRefresh() {
    const scroller = document.getElementById("main-scroll");
    if (!scroller) return;
    let startY = 0;
    let pulling = false;
    let armed = false;
    let distance = 0;
    let pointerId = null;

    function begin(y, id) {
      if (scroller.scrollTop > 2 || state.refreshing) return;
      startY = y;
      pulling = true;
      armed = false;
      distance = 0;
      pointerId = id ?? null;
    }

    function move(y, event) {
      if (!pulling || state.refreshing) return;
      const dy = y - startY;
      if (dy > 8 && scroller.scrollTop <= 2) {
        armed = true;
        distance = dy;
        if (pointerId != null) {
          try {
            scroller.setPointerCapture(pointerId);
          } catch {
            /* already captured or unsupported */
          }
        }
        if (event.cancelable) event.preventDefault();
        paintPull("pull", dy);
        return;
      }
      if (dy <= 0) {
        distance = 0;
        armed = false;
        paintPull("hidden");
      }
    }

    function end() {
      if (!pulling) return;
      const shouldRefresh = armed && distance > 72 && !state.refreshing;
      pulling = false;
      armed = false;
      pointerId = null;
      distance = 0;
      if (shouldRefresh) {
        paintPull("refresh");
        loadAll({ silent: true });
        return;
      }
      paintPull("hidden");
    }

    scroller.addEventListener("pointerdown", (event) => begin(event.clientY, event.pointerId));
    scroller.addEventListener("pointermove", (event) => move(event.clientY, event));
    scroller.addEventListener("pointerup", end);
    scroller.addEventListener("pointercancel", end);
    scroller.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        begin(event.touches[0].clientY, null);
      },
      { passive: true }
    );
    scroller.addEventListener(
      "touchmove",
      (event) => {
        if (event.touches.length !== 1) return;
        move(event.touches[0].clientY, event);
      },
      { passive: false }
    );
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
  }

  function bind() {
    bindList(appEl);
    appEl.querySelectorAll("[data-field]").forEach((el) => {
      el.addEventListener("input", () => {
        const field = el.getAttribute("data-field");
        if (field === "password") state.loginPassword = el.value;
        if (field === "confirm") state.loginConfirm = el.value;
      });
      if (el.getAttribute("data-field") === "password" || el.getAttribute("data-field") === "confirm") {
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter") handleAction(state.loginMode === "setup" ? "setup-password" : "login");
        });
      }
    });
  }

  function loginErrorMessage(code) {
    if (code === "auth") return "이름 또는 비밀번호가 올바르지 않습니다";
    if (code === "group") return "함께 쓰던 비밀번호가 올바르지 않습니다";
    if (code === "taken") return "이미 비밀번호가 있어요. 그 비밀번호로 들어가 주세요.";
    if (code === "short") return "비밀번호는 네 글자 이상으로 정해 주세요";
    if (code === "timeout" || code === "network") return "연결하지 못했어요. 잠시 후 다시 시도해 주세요";
    return "잠시 후 다시 시도해 주세요";
  }

  function acceptSession(name, result) {
    state.sessionName = name;
    state.sessionToken = result.token;
    state.loginError = "";
    state.loginPassword = "";
    state.loginConfirm = "";
    state.loginGroup = "";
    state.loginMode = "enter";
    state.loginBusy = false;
    writeSession(name, result.token, result.exp);
    state.tab = "home";
    location.hash = "home";
  }

  async function submitPersonalLogin() {
    if (state.loginBusy) return;
    const nameOk = state.members.some((m) => m.name === state.loginName);
    if (!nameOk || !state.loginPassword) {
      state.loginError = "이름과 비밀번호를 입력해 주세요";
      render();
      return;
    }
    state.loginBusy = true;
    state.loginError = "";
    render();
    try {
      const result = await postScript({
        action: "login",
        name: state.loginName,
        password: state.loginPassword,
      });
      acceptSession(state.loginName, result);
    } catch (err) {
      state.loginBusy = false;
      if (err?.message === "setup") {
        state.loginGroup = state.loginPassword;
        state.loginPassword = "";
        state.loginConfirm = "";
        state.loginMode = "setup";
        state.loginError = "";
      } else {
        state.loginError = loginErrorMessage(err?.message);
      }
    }
    render();
  }

  async function submitPersonalSetup() {
    if (state.loginBusy) return;
    const nameOk = state.members.some((m) => m.name === state.loginName);
    if (!nameOk || !state.loginPassword) {
      state.loginError = "이름과 비밀번호를 입력해 주세요";
      render();
      return;
    }
    if (state.loginPassword.length < 4) {
      state.loginError = "비밀번호는 네 글자 이상으로 정해 주세요";
      render();
      return;
    }
    if (state.loginPassword !== state.loginConfirm) {
      state.loginError = "비밀번호가 서로 다릅니다";
      render();
      return;
    }
    if (!state.loginGroup) {
      state.loginMode = "enter";
      state.loginPassword = "";
      state.loginConfirm = "";
      state.loginError = "처음부터 다시 입력해 주세요";
      render();
      return;
    }
    state.loginBusy = true;
    state.loginError = "";
    render();
    try {
      const result = await postScript({
        action: "setup",
        name: state.loginName,
        password: state.loginPassword,
        groupPassword: state.loginGroup,
      });
      acceptSession(state.loginName, result);
    } catch (err) {
      state.loginBusy = false;
      if (err?.message === "taken") state.loginMode = "enter";
      state.loginError = loginErrorMessage(err?.message);
    }
    render();
  }

  async function loadDiary() {
    if (!state.sessionToken) return;
    state.diaryStatus = "loading";
    state.diaryError = "";
    render();
    try {
      const result = await postScript({ action: "diary", token: state.sessionToken });
      state.diaryEntries = Array.isArray(result.entries) ? result.entries : [];
      state.diaryStatus = "ready";
      state.diaryError = "";
    } catch (err) {
      state.diaryEntries = [];
      state.diaryStatus = "error";
      state.diaryError = err?.message || "diary";
    }
    if (state.tab === "diary") render();
  }

  function handleAction(action, el) {
    if (action === "retry") {
      loadAll();
      return;
    }
    if (action === "open-name-picker") {
      state.namePickerOpen = true;
      state.memberQuery = "";
      render();
      return;
    }
    if (action === "close-name-picker") {
      state.namePickerOpen = false;
      state.memberQuery = "";
      render();
      return;
    }
    if (action === "pick-name") {
      state.loginName = el.getAttribute("data-name");
      state.namePickerOpen = false;
      state.memberQuery = "";
      state.loginError = "";
      render();
      return;
    }
    if (action === "login") {
      submitPersonalLogin();
      return;
    }
    if (action === "setup-password") {
      submitPersonalSetup();
      return;
    }
    if (action === "login-back") {
      state.loginMode = "enter";
      state.loginPassword = "";
      state.loginConfirm = "";
      state.loginGroup = "";
      state.loginError = "";
      render();
      return;
    }
    if (action === "logout") {
      clearSession();
      state.sessionName = null;
      state.sessionToken = "";
      state.loginName = "";
      state.loginPassword = "";
      state.loginConfirm = "";
      state.loginGroup = "";
      state.loginMode = "enter";
      state.loginError = "";
      state.diaryStatus = "idle";
      state.diaryEntries = [];
      state.diaryId = "";
      state.tab = "home";
      location.hash = "";
      render();
      return;
    }
    if (action === "open-diary") {
      state.tab = "diary";
      state.diaryId = "";
      state.diaryTrendOpen = false;
      location.hash = "diary";
      render();
      return;
    }
    if (action === "close-diary") {
      state.tab = "links";
      state.diaryId = "";
      location.hash = "links";
      render();
      return;
    }
    if (action === "open-diary-entry") {
      state.diaryId = el.getAttribute("data-id") || "";
      render();
      return;
    }
    if (action === "close-diary-entry") {
      state.diaryId = "";
      render();
      return;
    }
    if (action === "open-diary-trend") {
      state.diaryTrendOpen = true;
      renderKeepingScroll();
      return;
    }
    if (action === "close-diary-trend") {
      state.diaryTrendOpen = false;
      renderKeepingScroll();
      return;
    }
    if (action === "tab") {
      const next = el.getAttribute("data-tab");
      if (state.tab === "coram" && next !== "coram") {
        cancelCoramGoalEdit();
        clearTimeout(coramSaveTimer);
        flushCoramSave();
      }
      if (next === "schedule") scheduleJumpToToday = true;
      state.tab = next;
      state.memberQuery = "";
      state.selectedMember = null;
      location.hash = state.tab;
      render();
      return;
    }
    if (action === "filter") {
      scheduleJumpToToday = true;
      state.scheduleFilter = el.getAttribute("data-filter");
      render();
      return;
    }
    if (action === "open-member") {
      const name = el.getAttribute("data-name");
      state.selectedMember = state.members.find((m) => m.name === name) || null;
      render();
      return;
    }
    if (action === "close-member") {
      state.selectedMember = null;
      render();
      return;
    }
    if (action === "copy-phone" && state.selectedMember) {
      copyPhone(state.selectedMember.phone);
      return;
    }
    if (action === "coram-week") {
      const step = Number(el.getAttribute("data-step"));
      const nextOffset = state.coramOffset + (step < 0 ? -1 : 1);
      if (nextOffset > 0) return;
      cancelCoramGoalEdit();
      clearTimeout(coramSaveTimer);
      flushCoramSave();
      state.coramOffset = nextOffset;
      render();
      return;
    }
    if (action === "coram-day") {
      const kind = el.getAttribute("data-kind");
      const index = Number(el.getAttribute("data-index"));
      const draft = ensureCoramDraft(coramWeekKey());
      const list = kind === "pray" ? draft.prayDays : kind === "read" ? draft.readDays : draft.qtDays;
      if (!list || !Number.isInteger(index) || index < 0 || index >= list.length) return;
      list[index] = !list[index];
      scheduleCoramSave();
      renderKeepingScroll();
      return;
    }
    if (action === "coram-goal-edit") {
      const kind = el.getAttribute("data-kind");
      const record = coramRecordFor(coramWeekKey());
      state.coramGoalEdit = kind;
      state.coramGoalDraft = kind === "read" ? record.readGoal : record.prayGoal;
      renderKeepingScroll();
      return;
    }
    if (action === "coram-goal") {
      const kind = el.getAttribute("data-kind");
      const step = Number(el.getAttribute("data-step"));
      if (state.coramGoalEdit !== kind || state.coramGoalDraft == null) return;
      if (kind === "read") state.coramGoalDraft = Math.min(30, Math.max(1, state.coramGoalDraft + step));
      if (kind === "pray") state.coramGoalDraft = Math.min(180, Math.max(5, state.coramGoalDraft + step * 5));
      renderKeepingScroll();
      return;
    }
    if (action === "coram-goal-commit") {
      const kind = el.getAttribute("data-kind");
      if (state.coramGoalEdit !== kind || state.coramGoalDraft == null) return;
      const draft = ensureCoramDraft(coramWeekKey());
      if (kind === "read") draft.readGoal = state.coramGoalDraft;
      if (kind === "pray") draft.prayGoal = state.coramGoalDraft;
      cancelCoramGoalEdit();
      scheduleCoramSave();
      renderKeepingScroll();
      return;
    }
    if (action === "coram-retry") {
      const draft = state.coramDrafts[coramWeekKey()];
      if (!draft) return;
      scheduleCoramSave();
      renderKeepingScroll();
      return;
    }
    if (action === "coram-pane") {
      state.coramPane = el.getAttribute("data-pane") === "term" ? "term" : "week";
      render();
      scrollCoramTo();
      return;
    }
    if (action === "coram-month") {
      const step = Number(el.getAttribute("data-step"));
      const next = shiftMonth(coramActiveMonth(), step < 0 ? -1 : 1);
      if (!coramMonthInTerm(next)) return;
      state.coramLook = next;
      const focus = parseIsoDate(state.coramFocus);
      if (!focus || !sameMonth(focus, next)) state.coramFocus = "";
      render();
      return;
    }
    if (action === "coram-pick-month") {
      const next = { y: Number(el.getAttribute("data-year")), m: Number(el.getAttribute("data-month")) };
      if (!next.y || !next.m || !coramMonthInTerm(next)) return;
      state.coramLook = next;
      const focus = parseIsoDate(state.coramFocus);
      if (!focus || !sameMonth(focus, next)) state.coramFocus = "";
      render();
      scrollCoramTo("coram-month");
      return;
    }
    if (action === "coram-focus") {
      const date = el.getAttribute("data-date");
      state.coramFocus = state.coramFocus === date ? "" : date;
      renderKeepingScroll();
      return;
    }
    if (action === "coram-jump-week") {
      const date = parseIsoDate(el.getAttribute("data-date"));
      if (!date) return;
      const offset = coramOffsetForDate(date);
      if (offset > 0) return;
      cancelCoramGoalEdit();
      state.coramOffset = offset;
      state.coramPane = "week";
      render();
      scrollCoramTo();
    }
  }

  window.addEventListener("hashchange", () => {
    if (!state.sessionName) return;
    const tab = location.hash.replace("#", "");
    if ((TABS.includes(tab) || tab === "diary") && tab !== state.tab) {
      if (tab === "schedule") scheduleJumpToToday = true;
      state.tab = tab;
      state.diaryId = "";
      state.diaryTrendOpen = false;
      render();
    }
  });

  loadAll();
})();
