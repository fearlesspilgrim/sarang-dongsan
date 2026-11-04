const MEMBER_GID = "1332261210";
const SCHEDULE_GID = "67588769";
const PLACES_GID = "447610135";
const LINKS_GID = "782002476";
const LOGIN_GID = "1674760346";

function cell(v, f) {
  return f == null ? { v } : { v, f };
}

function table(rows) {
  return { cols: [], rows: rows.map((c) => ({ c })) };
}

function gvizTable(url) {
  const parsed = new URL(url);
  const gid = parsed.searchParams.get("gid") || "";
  const sheet = parsed.searchParams.get("sheet") || "";
  const range = parsed.searchParams.get("range") || "";

  if (gid === LOGIN_GID) return { unexpected: "login-sheet" };
  if (gid === MEMBER_GID) {
    return table([
      [cell("김하늘"), cell("94"), cell(null, "12/17"), cell("010-0000-0001"), cell("동산지기")],
      [cell("이도윤"), cell("95"), cell(null, "2/9"), cell("010-0000-0002"), cell("")],
    ]);
  }
  if (gid === SCHEDULE_GID && range === "J1") {
    return table([[cell("26.09.29")]]);
  }
  if (gid === SCHEDULE_GID) {
    return table([
      [
        cell("1주"),
        cell("Date(2026,8,13)", "2026-09-13"),
        cell(""),
        cell("Date(2026,8,20)", "2026-09-20"),
        cell("일"),
        cell("사랑동산"),
        cell("9월 모임"),
      ],
      [
        cell("5주"),
        cell("Date(2026,8,13)", "2026-09-13"),
        cell(""),
        cell("Date(2026,9,17)", "2026-10-17"),
        cell("토"),
        cell("사랑동산"),
        cell("10월 모임"),
      ],
      [
        cell("5주"),
        cell("Date(2026,8,13)", "2026-09-13"),
        cell(""),
        cell("Date(2026,9,3)", "2026-10-03"),
        cell("토"),
        cell("휴일"),
        cell("개천절"),
      ],
    ]);
  }
  if (gid === PLACES_GID) {
    return table([
      [cell(""), cell("Date(2026,9,17)", "2026-10-17"), cell("집회실")],
    ]);
  }
  if (gid === LINKS_GID) {
    return table([
      [cell("양육일기"), cell("https://docs.google.com/forms/d/e/preview/viewform")],
      [cell("예습"), cell("https://www.notion.so/preview")],
    ]);
  }
  if (sheet === "순원정보") {
    return table([
      [cell("김하늘"), cell("김하늘"), cell("순장"), cell(""), cell("여"), cell("94")],
      [cell("김하늘"), cell("이도윤"), cell("순원"), cell(""), cell("남"), cell("95")],
    ]);
  }
  if (sheet === "코람데오") return table([]);
  if (sheet === "기도제목") {
    return table([
      [cell("김하늘"), cell("이번 주 건강을 위해"), cell("2026.10.05 11:00")],
      [cell("이도윤"), cell("학업과 진로를 위해"), cell("2026.10.05 11:00")],
    ]);
  }
  return table([]);
}

function jsonp(callback, payload) {
  return `${callback}(${JSON.stringify(payload)});`;
}

export async function installSheetMocks(page) {
  const gvizUrls = [];
  const scripts = [];

  await page.route(/docs\.google\.com\/spreadsheets\/.*\/gviz\/tq/, async (route) => {
    const url = route.request().url();
    gvizUrls.push(url);
    const cbMatch = url.match(/responseHandler:([^&]+)/);
    const callback = decodeURIComponent(cbMatch?.[1] || "callback");
    const built = gvizTable(url);
    if (built?.unexpected) {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: jsonp(callback, { status: "error", unexpected: built.unexpected }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: jsonp(callback, { status: "ok", table: built }),
    });
  });

  await page.route(/script\.google\.com\/macros\//, async (route) => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback") || "callback";
    let payload = {};
    try {
      payload = JSON.parse(url.searchParams.get("payload") || "{}");
    } catch {
      payload = {};
    }
    scripts.push(payload);
    let result = { ok: true };
    if (payload.action === "login") {
      result = { ok: true, token: "test-token", exp: Date.now() + 30 * 86400000 };
    } else if (payload.action === "setup") {
      result = { ok: true, token: "test-token", exp: Date.now() + 30 * 86400000 };
    } else if (payload.action === "diary") {
      result = {
        ok: true,
        entries: [
          {
            id: "12",
            when: "2026-10-11 21:10",
            role: "동산지기",
            fields: [
              { label: "이번 주 참석 인원 / 전체인원", value: "6/8" },
              { label: "모임 진행 분위기 및 은혜/애로사항", value: "나눔이 평소보다 길었어요." },
              {
                label: "출석 순원 기도제목 및 양육 현황",
                value: "김하늘(01/여) / 예배 자리가 편해졌어요. /\n이도윤(02/남) / 과제가 많았어요. /",
              },
              { label: "결석 순원 기도제목 및 양육 현황", value: "박서연(01/여) / 가족 여행 /" },
            ],
          },
          {
            id: "8",
            when: "2026-09-20 20:40",
            role: "동산지기",
            fields: [
              { label: "이번 주 참석 인원 / 전체인원", value: "7/8" },
              { label: "모임 진행 분위기 및 은혜/애로사항", value: "텀을 시작하는 주였어요." },
            ],
          },
        ],
      };
    } else if (payload.action === "기도제목저장") {
      if (!payload.token || payload.token !== "test-token" || payload.password) {
        result = { ok: false, error: "auth" };
      } else {
        result = { ok: true, updated: "2026-10-17 11:00" };
      }
    } else if (payload.action === "save") {
      result = payload.token ? { ok: true } : { ok: false, error: "auth" };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: jsonp(callback, result),
    });
  });

  return {
    gvizUrls,
    scripts,
    requestedLoginSheet() {
      return gvizUrls.some((url) => url.includes(`gid=${LOGIN_GID}`));
    },
    requestedPrayerSheet() {
      return gvizUrls.some((url) => decodeURIComponent(url).includes("sheet=기도제목"));
    },
  };
}

export async function seedSession(page, name = "김하늘") {
  await page.addInitScript(
    ({ sessionName }) => {
      localStorage.setItem(
        "sarang_lbs_session_v1",
        JSON.stringify({
          name: sessionName,
          token: "test-token",
          exp: Date.now() + 30 * 86400000,
        })
      );
    },
    { sessionName: name }
  );
}
