import { expect, test } from "@playwright/test";

const TARGET = {
  viewport: { width: 1536, height: 1024 },
  topbarHeight: 56,
  sidebarWidth: 236,
  contentX: 236,
  firstCardX: 252,
  firstCardY: 72,
  cardHeight: 122,
  chartY: 208,
  chartHeight: 340,
  analyticsY: 562,
  analyticsHeight: 260,
  bottomY: 836,
  bottomHeight: 244,
};

function closeTo(actual, expected, tolerance, label) {
  expect(actual, label).toBeGreaterThanOrEqual(expected - tolerance);
  expect(actual, label).toBeLessThanOrEqual(expected + tolerance);
}

async function firstBox(page, selector) {
  const locator = page.locator(selector).first();
  await expect(locator, `${selector} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${selector} should have a layout box`).not.toBeNull();
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(TARGET.viewport);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".kpi-card")).toHaveCount(7);
  await page.waitForTimeout(1_000);
});

test("desktop layout matches the generated reference proportions", async ({ page }) => {
  const shell = await firstBox(page, ".dashboard-shell");
  closeTo(shell.x, 0, 1, "dashboard shell x");
  closeTo(shell.y, 0, 1, "dashboard shell y");
  closeTo(shell.width, TARGET.viewport.width, 1, "dashboard shell width");
  expect(shell.height, "dashboard shell can grow vertically instead of clipping bottom cards").toBeGreaterThanOrEqual(TARGET.viewport.height);
  const topbar = await firstBox(page, ".topbar");
  closeTo(topbar.x, 0, 1, "topbar x");
  closeTo(topbar.y, 0, 1, "topbar y");
  closeTo(topbar.width, TARGET.viewport.width, 1, "topbar width");
  closeTo(topbar.height, TARGET.topbarHeight, 1, "topbar height");

  const sidebar = await firstBox(page, ".sidebar");
  closeTo(sidebar.x, 0, 1, "sidebar x");
  closeTo(sidebar.y, TARGET.topbarHeight, 1, "sidebar y");
  closeTo(sidebar.width, TARGET.sidebarWidth, 2, "sidebar width");

  const content = await firstBox(page, ".content");
  closeTo(content.x, TARGET.contentX, 2, "content x");
  closeTo(content.y, TARGET.topbarHeight, 2, "content y");

  await expect(page.locator(".paramount-header-logo")).toBeVisible();
  await expect(page.locator(".brand-lockup")).toContainText(/Global Ads Performance/i);

  const kpis = page.locator(".kpi-card");
  const firstKpi = await kpis.nth(0).boundingBox();
  const lastKpi = await kpis.nth(6).boundingBox();
  closeTo(firstKpi.x, TARGET.firstCardX, 4, "first KPI x");
  closeTo(firstKpi.y, TARGET.firstCardY, 5, "first KPI y");
  closeTo(firstKpi.height, TARGET.cardHeight, 4, "KPI height");
  closeTo(lastKpi.y, firstKpi.y, 1, "all KPI cards stay in one row");
  expect(lastKpi.x + lastKpi.width, "KPI row should end before right edge").toBeLessThanOrEqual(1526);

  const chartPanels = page.locator(".chart-grid > .panel");
  await expect(chartPanels).toHaveCount(3);
  const chartA = await chartPanels.nth(0).boundingBox();
  const chartB = await chartPanels.nth(1).boundingBox();
  const chartC = await chartPanels.nth(2).boundingBox();
  closeTo(chartA.x, TARGET.firstCardX, 4, "main chart x");
  closeTo(chartA.y, TARGET.chartY, 8, "main chart y");
  closeTo(chartA.height, TARGET.chartHeight, 22, "main chart height");
  expect(chartA.width, "main chart is the widest item in top chart row").toBeGreaterThan(chartB.width * 2.15);
  expect(chartC.width, "CPA panel is wider than donut panel").toBeGreaterThan(chartB.width * 1.35);
  closeTo(chartB.y, chartA.y, 1, "chart row y alignment");
  closeTo(chartC.y, chartA.y, 1, "chart row y alignment");

  const analyticPanels = page.locator(".analytics-grid > .panel");
  await expect(analyticPanels).toHaveCount(3);
  const analyticsA = await analyticPanels.nth(0).boundingBox();
  const analyticsB = await analyticPanels.nth(1).boundingBox();
  const analyticsC = await analyticPanels.nth(2).boundingBox();
  closeTo(analyticsA.y, TARGET.analyticsY, 18, "analytics row y");
  closeTo(analyticsA.height, TARGET.analyticsHeight, 24, "analytics row height");
  closeTo(analyticsB.y, analyticsA.y, 1, "analytics row y alignment");
  closeTo(analyticsC.y, analyticsA.y, 1, "analytics row y alignment");
  expect(analyticsB.width, "quadrant panel should be the largest middle analytic card").toBeGreaterThan(analyticsC.width * 1.55);

  const bottomGrid = await firstBox(page, ".bottom-grid");
  closeTo(bottomGrid.y, TARGET.bottomY, 5, "bottom row y");
  closeTo(bottomGrid.height, TARGET.bottomHeight, 5, "bottom row height");
  expect(bottomGrid.y, "bottom cards should begin in the first desktop viewport").toBeLessThanOrEqual(850);

  await expect(page.getByText(/Spend & Conversions Over Time/i)).toBeVisible();
  await expect(page.getByText(/Spend by Platform/i)).toBeVisible();
  await expect(page.getByText(/CPA by Campaign/i)).toBeVisible();
  await expect(page.getByText(/Budget Opportunities/i)).toBeVisible();

  await page.screenshot({
    path: "test-results/dashboard-layout-1536x1024.png",
    fullPage: false,
  });
});

test("desktop canvas scales to fill wide browser viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1024 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".kpi-card")).toHaveCount(7);

  const shell = await firstBox(page, ".dashboard-shell");
  closeTo(shell.x, 0, 1, "scaled shell starts at left edge");
  closeTo(shell.width, 1920, 2, "scaled shell fills viewport width");

  const topbar = await firstBox(page, ".topbar");
  closeTo(topbar.x, 0, 1, "scaled topbar starts at left edge");
  closeTo(topbar.width, 1920, 2, "scaled topbar fills viewport width");

  const sidebar = await firstBox(page, ".sidebar");
  closeTo(sidebar.x, 0, 1, "scaled sidebar starts at left edge");
  closeTo(sidebar.width, TARGET.sidebarWidth, 2, "scaled sidebar keeps reference width");

  const content = await firstBox(page, ".content");
  closeTo(content.x, TARGET.sidebarWidth, 2, "scaled content starts after sidebar");
  expect(content.width, "scaled content uses the available wide viewport").toBeGreaterThan(1660);

  const kpis = page.locator(".kpi-card");
  const lastKpi = await kpis.nth(6).boundingBox();
  expect(lastKpi.x + lastKpi.width, "KPI row expands toward the right edge").toBeGreaterThan(1880);

  await page.screenshot({
    path: "test-results/dashboard-layout-wide-1920x1024.png",
    fullPage: false,
  });
});

test("primary controls still work after visual calibration", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.locator(".dataset-select").selectOption("global_ads_performance");
  await expect(page.locator(".dataset-select")).toHaveValue("global_ads_performance");
  await expect(page.getByText(/Budget Opportunities/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Week$/ })).toBeVisible();

  await page.getByRole("button", { name: /^Week$/ }).click();
  await expect(page.getByRole("button", { name: /^Week$/ })).toHaveClass(/active/);

  await page.getByRole("button", { name: /^Month$/ }).click();
  await expect(page.getByRole("button", { name: /^Month$/ })).toHaveClass(/active/);

  await page.getByText(/Metric Dictionary/i).click();
  await expect(page.locator(".dictionary")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
