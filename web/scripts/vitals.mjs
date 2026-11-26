// LAB SCRIPT (phase 7b): Core Web Vitals of real pages, in a real browser.
// Run (from web/): node scripts/vitals.mjs [base URL] [runs]
//   e.g. node scripts/vitals.mjs https://tix-book.vercel.app 5
// Read-only: it only opens public pages and types in the search box (no
// logging in, nothing is saved), so it's safe against production.
//
// Each run is a fresh browser context (empty cache, no cookies), like a
// first visit. Two profiles:
// - desktop: no throttling
// - mobile: 4× slower CPU and a slow 4G network (150 ms, 1.6 Mbit/s), close
//   to Lighthouse's mobile setting, where problems show up first
// Measured with the browser's own PerformanceObserver API, as the
// web-vitals library does:
// - LCP: when the biggest text or image finished painting (good ≤ 2.5 s)
// - CLS: how much the layout jumped (good ≤ 0.1)
// - INP: the slowest interaction → next paint (good ≤ 200 ms); here a click
//   in the search box and typing one letter, so it's an approximation
// - TTFB: when the first byte of the HTML arrived
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const RUNS = Number(process.argv[3] ?? 5);

const PROFILES = {
  desktop: { viewport: { width: 1350, height: 940 }, cpu: 1, network: null },
  mobile: {
    viewport: { width: 390, height: 844 },
    cpu: 4,
    network: {
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 90_000,
    },
  },
};

// Runs in the page, before any of its own scripts
function observeVitals() {
  window.__v = { lcp: 0, lcpEl: "", cls: 0, inp: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__v.lcp = e.startTime;
      window.__v.lcpEl = e.element ? e.element.tagName.toLowerCase() : "";
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (!e.hadRecentInput) window.__v.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (e.interactionId)
        window.__v.inp = Math.max(window.__v.inp, e.duration);
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
}

async function measure(browser, profile, path, click) {
  const context = await browser.newContext({ viewport: profile.viewport });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      ...profile.network,
    });
  }
  await page.addInitScript(observeVitals);
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90_000 });
  let interacted = false;
  if (click) {
    const target = page.getByRole(click.role, { name: click.name }).first();
    if (await target.count()) {
      await target.click();
      await page.keyboard.type("a");
      interacted = true;
      await page.waitForTimeout(1500);
    }
  }
  // LCP and CLS are final once the user interacts or the page is hidden
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => ({
    ...window.__v,
    ttfb: performance.getEntriesByType("navigation")[0].responseStart,
  }));
  await context.close();
  return { ...v, interacted };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch();
try {
  // An event page: the first event linked from the home page
  const probe = await browser.newPage();
  await probe.goto(base + "/", { waitUntil: "networkidle", timeout: 90_000 });
  const href = await probe
    .locator('a[href^="/events/"]')
    .first()
    .getAttribute("href");
  await probe.close();

  const pages = [
    {
      name: "home",
      path: "/",
      click: { role: "searchbox", name: "Search events" },
    },
    { name: "event", path: href, click: null },
  ];
  const rows = [];
  for (const [profileName, profile] of Object.entries(PROFILES)) {
    for (const p of pages) {
      const runs = [];
      for (let i = 0; i < RUNS; i++)
        runs.push(await measure(browser, profile, p.path, p.click));
      rows.push({
        profile: profileName,
        page: p.name,
        "TTFB ms": Math.round(median(runs.map((r) => r.ttfb))),
        "LCP ms": Math.round(median(runs.map((r) => r.lcp))),
        "LCP element": runs.at(-1).lcpEl,
        CLS: Number(median(runs.map((r) => r.cls)).toFixed(3)),
        "INP ms": p.click
          ? runs.some((r) => r.interacted)
            ? Math.round(median(runs.map((r) => r.inp))) || "<16"
            : "no target"
          : "-",
      });
    }
  }
  console.log(
    `${base}, median of ${RUNS} fresh visits, ${new Date().toISOString()}`,
  );
  console.table(rows);
} finally {
  await browser.close();
}
