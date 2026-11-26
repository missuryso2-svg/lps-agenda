import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { browserCookies, dashboardFixture } from "./j2c-fixture.mjs";
import { nextURL, startNext, stopNext } from "./local-next-qa.mjs";

const [stage, directory, flag] = process.argv.slice(2);
assert.ok(["before", "after"].includes(stage) && directory);
const metricsOnly = flag === "--metrics-only";
const output = resolve(directory, stage);
await mkdir(output, { recursive: true });
const fixture = await dashboardFixture();
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const agenda = "/dashboard/agenda?date=" + fixture.date;
const routes = [["painel", "/dashboard"], ["agenda", agenda], ["semana", agenda + "&view=week"]];
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const contrastPairs = [
  ["ink", "canvas", 4.5], ["ink", "surface", 4.5], ["ink", "subtle", 4.5],
  ["muted", "canvas", 4.5], ["muted", "surface", 4.5], ["muted", "subtle", 4.5],
  ["accent", "canvas", 4.5], ["accent", "surface", 4.5], ["accent", "subtle", 4.5],
  ["positive", "subtle", 4.5], ["danger", "surface", 4.5], ["danger", "subtle", 4.5],
  ["on-action", "action", 4.5], ["on-action", "action-hover", 4.5],
  ["inverse", "black", 4.5], ["edge", "surface", 3], ["edge", "canvas", 3],
  ["focus", "surface", 3], ["focus", "canvas", 3],
];

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const rgb = hex.match(/[\da-f]{2}/gi).map(channel => Number.parseInt(channel, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

async function assertContrast(page) {
  const names = [...new Set(contrastPairs.flatMap(([first, second]) => [first, second]))];
  const palette = await page.locator(".j2-dashboard").evaluate((element, colors) => {
    const styles = getComputedStyle(element);
    return Object.fromEntries(colors.map(color => [color, styles.getPropertyValue("--lps-" + color).trim()]));
  }, names);
  const minimum = { text: Infinity, controls: Infinity };
  for (const [foreground, background, threshold] of contrastPairs) {
    const [low, high] = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => a - b);
    const ratio = (high + 0.05) / (low + 0.05);
    assert.ok(ratio >= threshold, foreground + " / " + background + " ratio " + ratio);
    const group = threshold === 3 ? "controls" : "text";
    minimum[group] = Math.min(minimum[group], Number(ratio.toFixed(2)));
  }
  return minimum;
}

const metrics = [];
try {
  await startNext(false);
  for (const width of [375, 768, 1280, 1920]) {
    for (const theme of ["light", "dark"]) {
      for (const [route, path] of routes) {
        const context = await browser.newContext({
          viewport: { width, height: width === 375 ? 844 : 940 },
          colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR",
        });
        try {
          await context.addCookies(browserCookies(fixture.owner));
          await context.route("**/*", request => [nextURL, api].includes(new URL(request.request().url()).origin) ? request.continue() : request.abort());
          await context.addInitScript(mode => {
            localStorage.setItem("theme", mode);
            window.metrics = { lcp: null, cls: 0 };
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) window.metrics.lcp = entry.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.metrics.cls += entry.value;
            }).observe({ type: "layout-shift", buffered: true });
          }, theme);
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", () => errors.push("browser error"));
          page.on("console", message => {
            if (/violates? the following Content Security Policy/i.test(message.text())) errors.push("CSP violation");
          });
          const response = await page.goto(nextURL + path);
          assert.equal(response.status(), 200);
          assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
          await page.locator("main").getByText("Bruno Ferreira", { exact: true }).first().waitFor();
          await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const captured = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            const script = performance.getEntriesByType("resource")
              .filter(entry => /\.js(?:\?|$)/.test(entry.name))
              .reduce((sum, entry) => sum + entry.encodedBodySize, 0);
            return {
              ...window.metrics, fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime,
              ttfb: nav.responseStart, jsBytes: script,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          assert.deepEqual(errors, []);
          if (stage === "after" && !metricsOnly) {
            assert.equal(captured.overflow, 0, route + " overflow");
            assert.ok(captured.cls <= 0.1);
            captured.contrast = await assertContrast(page);
            assert.equal(await page.locator("main").getByRole("heading", { level: 1 }).count(), 1);
            await page.keyboard.press("Tab");
            const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
            assert.ok(await skip.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle === "solid"));
            await page.keyboard.press("Enter");
            assert.equal(await page.locator(":focus").getAttribute("id"), "conteudo-painel");
            assert.match(await page.locator("main").ariaSnapshot(), /heading/);
            if (width < 1024) {
              const trigger = page.getByRole("button", { name: "Abrir menu do painel" });
              await trigger.focus();
              await page.keyboard.press("Enter");
              const nav = page.getByRole("dialog", { name: "Menu do painel" });
              await nav.waitFor();
              assert.equal(await nav.evaluate(el => getComputedStyle(el).animationName), "none");
              await page.keyboard.press("Escape");
              await nav.waitFor({ state: "hidden" });
              assert.ok(await trigger.evaluate(el => el === document.activeElement));
            }
            await page.evaluate(() => {
              document.activeElement?.blur();
              window.scrollTo(0, 0);
            });
          }
          metrics.push({ route, width, theme, ...captured });
          if (!metricsOnly) {
            await page.screenshot({ path: resolve(output, route + "-" + width + "-" + theme + ".png"), fullPage: true, animations: "disabled" });
          }
        } finally {
          await context.close();
        }
      }
      console.log("PASS " + width + " " + theme + " · dashboard, daily and weekly agenda");
    }
  }
  await writeFile(resolve(output, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
} finally {
  await browser.close();
  await stopNext();
}
