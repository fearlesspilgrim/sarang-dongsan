(() => {
  const SHEET_ID = "1UtE3oILRosD0w5au4Nre5b4cIqJcu3weNHTIiWv1LYM";
  const GIDS = {
    schedule: "67588769",
    members: "1332261210",
    places: "447610135",
    links: "782002476",
    login: "1674760346",
  };
  const TABS = ["home", "schedule", "members", "links"];
  const SESSION_KEY = "sarang_lbs_session_v1";
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

  let scheduleStickyObserver = null;

  function syncScheduleSticky() {
    const stickyHeader = document.querySelector("#main-scroll header");
    const scroller = document.getElementById("main-scroll");
    if (!stickyHeader || !scroller) return;
    scroller.style.setProperty("--schedule-sticky", `${Math.round(stickyHeader.getBoundingClientRect().height)}px`);
  }

  const state = {
    status: "loading",
    error: "",
    members: [],
    events: [],
    places: {},
    links: [],
    password: "",
    sessionName: null,
    tab: "home",
    scheduleFilter: "전체",
    memberQuery: "",
    selectedMember: null,
    namePickerOpen: false,
    loginName: "",
    loginPassword: "",
    loginError: "",
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
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return { y: get("year"), m: get("month"), d: get("day") };
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

  function formatTodaySentence(date) {
    const day = weekdayIndex(date);
    if (day === 0) return `${date.m}월 ${date.d}일 주일이에요`;
    return `${date.m}월 ${date.d}일 ${WEEKDAYS[day]}요일이에요`;
  }

  function formatRange(start, end) {
    return `${start.m}/${start.d}–${end.m}/${end.d}`;
  }

  function monthTitle(date) {
    return `${date.y}년 ${date.m}월`;
  }

  function loadGviz(gid) {
    return new Promise((resolve, reject) => {
      const cb = `gviz_cb_${gid}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
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

      script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${cb}&gid=${gid}&t=${Date.now()}`;
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

  function parsePassword(table) {
    for (const row of table.rows || []) {
      const key = String(cell(row, 0).v || "").trim();
      const value = String(cell(row, 1).v || "").trim();
      if (key === "App_Password") return value;
    }
    const first = table.rows?.[0];
    return first ? String(cell(first, 1).v || "").trim() : "";
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.name === "string" ? parsed.name : null;
    } catch {
      return null;
    }
  }

  function writeSession(name) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name }));
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
      const [membersTable, eventsTable, placesTable, linksTable, loginTable] = await Promise.all([
        loadGviz(GIDS.members),
        loadGviz(GIDS.schedule),
        loadGviz(GIDS.places),
        loadGviz(GIDS.links),
        loadGviz(GIDS.login),
      ]);
      state.members = parseMembers(membersTable);
      state.events = parseEvents(eventsTable);
      state.places = parsePlaces(placesTable);
      state.links = parseLinks(linksTable);
      state.password = parsePassword(loginTable);
      const saved = readSession();
      state.sessionName =
        saved && state.members.some((m) => m.name === saved) ? saved : null;
      if (state.sessionName) {
        const tab = location.hash.replace("#", "");
        if (TABS.includes(tab)) state.tab = tab;
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
  function iconLink(active) {
    return `<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="${active ? "2.2" : "1.8"}" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.4l1.6-1.6a5 5 0 0 0-7.1-7.1L10.6 6"/><path d="M14 11a5 5 0 0 0-7.5-.4L4.9 12.2a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>`;
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

  function eventRow(event, { compact = false, today = null } = {}) {
    const isToday = today && ymd(event.date) === ymd(today);
    return `
      <div class="flex gap-3 ${isToday ? "items-center rounded-2xl bg-terra/10 px-2 pt-2 pb-3 -mx-2" : "items-start py-2"}">
        <div class="w-10 shrink-0 pt-0.5 text-center">
          <div class="relative text-[15px] font-semibold leading-none ${isToday ? "text-terra" : "text-ink"}">
            ${event.date.d}
          </div>
          <div class="mt-1 text-[11px] leading-none text-muted">${esc(event.weekday)}</div>
        </div>
        <div class="min-w-0 flex-1">
          ${eventBody(event, { compact, showToday: isToday })}
        </div>
      </div>`;
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
    return `
      <div class="flex min-h-dvh flex-col px-5 pb-10 pt-16">
        <p class="text-[13px] font-medium tracking-wide text-terra">사랑동산</p>
        <h1 class="mt-2 text-[28px] font-semibold leading-tight">사랑하기</h1>

        <label class="mt-10 text-[13px] font-medium text-muted">이름</label>
        <button data-action="open-name-picker" class="mt-2 flex h-[52px] items-center justify-between rounded-2xl border border-stone-200 bg-ivory px-4 text-left">
          <span class="${selected ? "text-ink" : "text-muted"}">${selected ? esc(selected.name) : "구성원 선택"}</span>
          <span class="text-muted">▾</span>
        </button>

        <label class="mt-5 text-[13px] font-medium text-muted" for="login-password">비밀번호</label>
        <input id="login-password" data-field="password" type="password" autocomplete="current-password"
          class="mt-2 h-[52px] w-full rounded-2xl border border-stone-200 bg-ivory px-4 text-[16px] outline-none focus:border-terra"
          value="${esc(state.loginPassword)}" />

        ${state.loginError ? `<p class="mt-3 text-[13px] text-terra">${esc(state.loginError)}</p>` : ""}

        <button data-action="login" class="mt-8 h-[52px] w-full rounded-2xl bg-terra text-[16px] font-semibold text-ivory">사랑하기</button>
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
      <div class="overflow-hidden rounded-[20px] border border-stone-200/80 bg-ivory">
        ${list
          .map((m, i) => {
            const isMe = m.name === state.sessionName;
            return `
            <button data-action="open-member" data-name="${esc(m.name)}" class="flex w-full items-center gap-3 px-3 py-3 text-left ${i ? "border-t border-stone-100" : ""}">
              <span class="flex h-11 w-11 items-center justify-center rounded-full font-semibold leading-none whitespace-nowrap ${initialClass(m.name, "text-[15px]", "text-[13px] tracking-tight")} ${peerTint(m.peer)}">${esc(initialOf(m.name))}</span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="text-[16px] font-medium">${esc(m.name)}</span>
                  ${isMe ? '<span class="rounded-full bg-terra/15 px-1.5 py-0.5 text-[10px] font-semibold text-terra">나</span>' : ""}
                  ${m.role ? `<span class="rounded-full border border-terra/30 px-1.5 py-0.5 text-[10px] font-medium text-terra">${esc(m.role)}</span>` : ""}
                </span>
                <span class="mt-0.5 block text-[12px] text-muted">${esc(m.peer)}또래 · ${formatMd(m.birth) || "생일 미등록"}</span>
              </span>
              <span class="text-muted">›</span>
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
    form: "bg-terra/10 text-terra",
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
    if (kind === "form") return wrap(`<path d="M8 3.5h6l4 4V20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4M9 13h6M9 17h4"/>`);
    if (kind === "notion") return wrap(`<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>`);
    if (kind === "chat") return wrap(`<path d="M6.5 16.2 4.5 20l4-1.4A8 8 0 1 0 6.5 16.2z"/>`);
    if (kind === "sheet") return wrap(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16M10 9v11"/>`);
    if (kind === "doc") return wrap(`<path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4M8.5 12.5h7M8.5 16.5h5"/>`);
    if (kind === "video") return wrap(`<rect x="3.5" y="6.5" width="11" height="11" rx="2"/><path d="M14.5 10.5 20 8v8l-5.5-2.5z"/>`);
    return wrap(`<path d="M10 14a5 5 0 0 0 7.2.4l1.4-1.4a5 5 0 0 0-7-7L10.2 7.4"/><path d="M14 10a5 5 0 0 0-7.2-.4L5.4 11a5 5 0 0 0 7 7l1.4-1.4"/>`);
  }

  function linkCard(link) {
    const style = LINK_STYLE[link.kind] || LINK_STYLE.link;
    return `
      <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 rounded-[22px] border border-stone-200/80 bg-ivory px-4 py-3.5 active:bg-cream">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style}">${linkGlyph(link.kind)}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[16px] font-medium">${esc(link.label)}</span>
          <span class="mt-0.5 block text-[12px] text-muted">${esc(link.hint)}</span>
        </span>
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </a>`;
  }

  function linksView() {
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">주요링크</h1>
        <p class="mt-2 text-[13px] text-muted">자주 여는 페이지를 모아 두었어요</p>
      </header>
      <div class="mt-5 space-y-3 px-5 pb-6">
        ${
          state.links.length
            ? state.links.map(linkCard).join("")
            : `<p class="mt-8 text-center text-[14px] text-muted">등록된 링크가 없습니다</p>`
        }
      </div>`;
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
          ${tab("links", "주요링크", iconLink)}
        </div>
      </nav>`;
  }

  function homeView(today, range) {
    const member = currentMember();
    const events = weekEvents(range);
    const { week, month } = birthdaySets(today, range);
    return `
      <header class="px-5 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">안녕하세요, ${esc(member?.name || "")}님</h1>
        <p class="mt-2 text-[13px] text-muted">${esc(formatTodaySentence(today))}</p>
      </header>

      <section class="mx-5 mt-6 rounded-[24px] border border-stone-200/80 bg-ivory p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-[18px] font-semibold">이번 주 일정</h2>
          <span class="shrink-0 text-[13px] font-medium text-stone-400">${esc(formatRange(range.start, range.end))}</span>
        </div>
        <div class="mt-3 divide-y divide-stone-100">
          ${
            events.length
              ? events.map((event) => eventRow(event, { compact: true, today })).join("")
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
      <header class="sticky top-0 z-30 bg-cream px-5 pb-3 pt-6">
        <p class="text-[13px] font-medium text-terra">사랑동산</p>
        <h1 class="mt-3 text-[24px] font-semibold">이번 텀 일정</h1>
        <div class="mt-3 flex gap-1.5 overflow-x-auto hide-scroll">
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
              <h2 class="sticky top-[var(--schedule-sticky,7.5rem)] z-20 -mx-5 bg-cream px-5 py-2 text-[13px] font-semibold text-muted">${esc(group.title)}</h2>
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
      </header>
      <div id="member-list" class="mt-4 px-5 pb-4">
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
        <div class="flex items-center gap-3">
          <span class="flex h-12 w-12 items-center justify-center rounded-full font-semibold leading-none whitespace-nowrap ${initialClass(m.name, "text-[16px]", "text-[14px] tracking-tight")} ${peerTint(m.peer)}">${esc(initialOf(m.name))}</span>
          <div>
            <p class="text-[18px] font-semibold">${esc(m.name)}</p>
            <p class="text-[13px] text-muted">${esc(m.peer)}또래${m.role ? ` · ${esc(m.role)}` : ""} · 생일 ${formatMd(m.birth) || "미등록"}</p>
          </div>
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
    else if (state.tab === "links") body = linksView();
    else body = homeView(today, range);

    appEl.innerHTML = `
      <div class="flex h-full min-h-0 flex-col overflow-hidden bg-cream">
        <div id="main-scroll" class="min-h-0 flex-1 overflow-y-auto hide-scroll overscroll-y-contain pb-4">
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
        ${tabbar()}
      </div>
      ${memberSheet()}
      ${toastView()}`;
    bind();
    bindPullToRefresh();
    bindSheetDrag("member-sheet", "member-sheet-backdrop", "close-member");
    if (scheduleStickyObserver) {
      scheduleStickyObserver.disconnect();
      scheduleStickyObserver = null;
    }
    syncScheduleSticky();
    const stickyHeader = document.querySelector("#main-scroll header");
    if (stickyHeader && window.ResizeObserver) {
      scheduleStickyObserver = new ResizeObserver(() => syncScheduleSticky());
      scheduleStickyObserver.observe(stickyHeader);
    }
    queueScheduleScroll();
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
        if (action === "close-name-picker" || action === "close-member") {
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
      });
      if (el.getAttribute("data-field") === "password") {
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter") handleAction("login");
        });
      }
    });
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
      render();
      return;
    }
    if (action === "login") {
      const nameOk = state.members.some((m) => m.name === state.loginName);
      const passOk = state.loginPassword === state.password;
      if (!nameOk || !passOk) {
        state.loginError = "이름 또는 비밀번호가 올바르지 않습니다";
        render();
        return;
      }
      state.sessionName = state.loginName;
      state.loginError = "";
      state.loginPassword = "";
      writeSession(state.sessionName);
      state.tab = "home";
      location.hash = "home";
      render();
      return;
    }
    if (action === "logout") {
      clearSession();
      state.sessionName = null;
      state.loginName = "";
      state.loginPassword = "";
      state.tab = "home";
      location.hash = "";
      render();
      return;
    }
    if (action === "tab") {
      const next = el.getAttribute("data-tab");
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
    }
  }

  window.addEventListener("hashchange", () => {
    if (!state.sessionName) return;
    const tab = location.hash.replace("#", "");
    if (TABS.includes(tab) && tab !== state.tab) {
      if (tab === "schedule") scheduleJumpToToday = true;
      state.tab = tab;
      render();
    }
  });

  loadAll();
})();
