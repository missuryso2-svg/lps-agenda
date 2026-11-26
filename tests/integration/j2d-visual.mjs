import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nextURL } from "./local-next-qa.mjs";
import { visualFixture } from "./j2d-fixture.mjs";

const [stage, evidenceRoot] = process.argv.slice(2);
assert.ok(["before", "after"].includes(stage) && evidenceRoot);
const fixture = await visualFixture(process.env.J2D_QA_FIXTURE, stage);
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const target = resolve(evidenceRoot, "screenshots", stage);
await mkdir(target, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT));
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });

const metrics = [];
const colorPairs = [
  ["ink", "surface", 4.5], ["muted", "surface", 4.5], ["ink", "accent-soft", 4.5],
  ["on-action", "action", 4.5], ["focus", "surface", 3],
];
const luminance = hex => {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const linear = hex.match(/[\da-f]{2}/gi).map(pair => parseInt(pair, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
};
try {
  for (const width of [320, 375, 768, 1280, 1920]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 844 : 1000 },
        colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR",
      });
      try {
        await context.route("**/*", route => [nextURL, api].includes(new URL(route.request().url()).origin)
          ? route.continue() : route.abort());
        await context.addInitScript(mode => {
          localStorage.setItem("theme", mode);
          window.qa = { lcp: 0, cls: 0, csp: [] };
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.qa.lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.qa.cls += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
          document.addEventListener("securitypolicyviolation", event => window.qa.csp.push(event.violatedDirective));
        }, theme);
        const page = await context.newPage();
        const response = await page.goto(nextURL + "/agendar/" + fixture.slug);
        assert.equal(response.status(), 200);
        assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
        await page.getByRole("heading", { name: "Barbearia Aurora QA", exact: true }).waitFor();
        await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
        await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const measured = await page.evaluate(() => ({
          ttfb: performance.getEntriesByType("navigation")[0].responseStart,
          fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime,
          js: performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name))
            .reduce((sum, entry) => sum + entry.transferSize, 0),
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          ...window.qa,
        }));
        if (stage === "after") {
          assert.equal(measured.overflow, 0);
          assert.deepEqual(measured.csp, []);
          const tokens = await page.locator(".j2-book").evaluate((element, names) => {
            const style = getComputedStyle(element);
            return Object.fromEntries(names.map(name => [name, style.getPropertyValue("--lps-" + name).trim()]));
          }, [...new Set(colorPairs.flatMap(pair => pair.slice(0, 2)))]);
          measured.minContrast = Math.min(...colorPairs.map(([first, second, threshold]) => {
            const [small, large] = [luminance(tokens[first]), luminance(tokens[second])].sort((a,b) => a-b);
            const ratio = (large + .05) / (small + .05);
            assert.ok(ratio >= threshold, first + " / " + second + " " + ratio);
            return +ratio.toFixed(2);
          }));
        }
        await page.screenshot({ path: resolve(target, "servico-" + width + "-" + theme + ".png"), fullPage: true });
        await page.getByRole("button", { name: /Corte clássico/ }).click();
        await page.getByRole("button", { name: /Rafael QA/ }).click();
        await page.locator("#booking-date").fill(fixture.day);
        await page.getByRole("button", { name: "14:00", exact: true }).waitFor();
        if (stage === "after") {
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.deepEqual(await page.evaluate(() => window.qa.csp), []);
        }
        await page.screenshot({ path: resolve(target, "horario-" + width + "-" + theme + ".png"), fullPage: true });
        metrics.push({ width, theme, ...measured });
        console.log("PASS " + stage + " " + width + " " + theme + " overflow=" + measured.overflow);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await writeFile(resolve(evidenceRoot, "metrics-" + stage + ".json"), JSON.stringify(metrics, null, 2) + "\n");
  await browser.close();
}
