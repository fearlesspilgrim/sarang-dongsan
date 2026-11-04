import { expect, test } from "@playwright/test";
import { installSheetMocks, seedSession } from "../helpers/sheet-mocks.mjs";

test.describe("로그인 전", () => {
  test("개인 비밀번호 화면이 열린다", async ({ page }) => {
    const sheets = await installSheetMocks(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "사랑하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: /구성원 선택/ })).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
    await page.getByRole("button", { name: /구성원 선택/ }).click();
    await expect(page.getByRole("button", { name: /김하늘/ })).toBeVisible();
    expect(sheets.requestedLoginSheet()).toBe(false);
    expect(sheets.requestedPrayerSheet()).toBe(true);
  });

  test("이름과 비밀번호로 들어간다", async ({ page }) => {
    const sheets = await installSheetMocks(page);
    await page.goto("/");
    await page.getByRole("button", { name: /구성원 선택/ }).click();
    await page.getByRole("button", { name: /김하늘/ }).click();
    await page.getByLabel("비밀번호").fill("abcd");
    await page.getByRole("button", { name: "사랑하기" }).click();
    await expect(page.getByRole("heading", { name: /안녕하세요, 김하늘/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /내 기도제목/ })).toBeVisible();
    const login = sheets.scripts.find((item) => item.action === "login");
    expect(login?.name).toBe("김하늘");
    expect(login?.password).toBe("abcd");
    expect(sheets.scripts.some((item) => item.action === "diary")).toBe(false);
  });
});

test.describe("로그인한 뒤", () => {
  let sheets;

  test.beforeEach(async ({ page }) => {
    sheets = await installSheetMocks(page);
    await seedSession(page);
  });

  test("홈에 내 기도제목이 마지막 업데이트와 함께 보인다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /내 기도제목/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /마지막 업데이트 10월 5일/ })).toBeVisible();
  });

  test("기도제목은 길이 제한 없이 수정 화면에 열린다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /내 기도제목/ }).click();
    await expect(page.getByText("내 기도제목").last()).toBeVisible();
    await page.getByRole("button", { name: "수정" }).click();
    const area = page.getByPlaceholder("함께 기도할 내용을 적어 주세요");
    await expect(area).toBeVisible();
    await expect(area).not.toHaveAttribute("maxlength");
    await expect(page.locator("#prayer-count")).toHaveCount(0);
  });

  test("기도제목 저장은 로그인 토큰만 보낸다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /내 기도제목/ }).click();
    await page.getByRole("button", { name: "수정" }).click();
    await page.getByPlaceholder("함께 기도할 내용을 적어 주세요").fill("오늘도 감사함으로");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("기도제목을 남겼어요")).toBeVisible();
    const save = sheets.scripts.find((item) => item.action === "기도제목저장");
    expect(save?.token).toBe("test-token");
    expect(save?.name).toBe("김하늘");
    expect(save?.password).toBeUndefined();
    expect(save?.text).toBe("오늘도 감사함으로");
  });

  test("구성원 창에 기도제목과 옆 사람이 보인다", async ({ page }) => {
    await page.goto("/#members");
    await page.getByRole("button", { name: /이도윤/ }).click();
    await expect(page.getByRole("heading", { name: "기도제목" })).toBeVisible();
    await expect(page.getByRole("button", { name: "번호 복사" })).toBeVisible();
    await expect(page.locator('[data-action="member-next"]')).toBeVisible();
    await page.locator('[data-action="member-next"]').click();
    await expect(page.getByRole("button", { name: "수정" })).toBeVisible();
  });

  test("일정 달 제목이 붙는 줄과 같은 기준으로 붙는다", async ({ page }) => {
    await page.goto("/#schedule");
    await expect(page.getByRole("heading", { name: "이번 텀 일정" })).toBeVisible();
    await expect(page.locator("[data-sticky-head]")).toHaveCount(1);
    await expect(page.locator("[data-schedule-month='2026년 9월']")).toBeVisible();
    await expect(page.locator("[data-schedule-month='2026년 10월']")).toBeVisible();
    const sticky = await page.locator("#main-scroll").evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--sticky-head").trim()
    );
    expect(Number.parseInt(sticky, 10)).toBeGreaterThan(40);
    await page.getByRole("button", { name: "사랑동산", exact: true }).click();
    await expect(page.getByRole("heading", { name: "2026년 9월" })).toBeVisible();
    await expect(page.getByText("개천절")).toHaveCount(0);
  });

  test("양육일기 돌아보기는 설문 응답을 보여 준다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /안녕하세요, 김하늘/ })).toBeVisible();
    expect(sheets.scripts.some((item) => item.action === "diary")).toBe(false);
    await page.goto("/#links");
    await expect(page.getByRole("button", { name: /나의 양육일기 돌아보기/ })).toBeVisible();
    expect(sheets.scripts.some((item) => item.action === "diary")).toBe(false);
    await page.getByRole("button", { name: /나의 양육일기 돌아보기/ }).click();
    await expect(page.getByRole("heading", { name: "양육일기 돌아보기" })).toBeVisible();
    await expect(page.getByText("나눔이 평소보다 길었어요.")).toBeVisible();
    await expect(page.getByText("텀을 시작하는 주였어요.")).toBeVisible();
    expect(sheets.scripts.some((item) => item.action === "diary")).toBe(true);
    await expect(page.locator("[data-sticky-head]")).toHaveCount(1);
    await page.getByRole("button", { name: "11일" }).click();
    await expect(page.getByText("함께한 순원 2")).toBeVisible();
    await page.getByRole("button", { name: "‹ 목록" }).click();
    await page.getByRole("button", { name: "출석 추세" }).click();
    await expect(page.locator("#diary-trend-sheet")).toBeVisible();
  });

  test("코람데오 텀 보기 카드가 남아 있다", async ({ page }) => {
    await page.goto("/#coram");
    await expect(page.getByRole("button", { name: /이번 텀 한 눈에 보기/ })).toBeVisible();
  });
});
