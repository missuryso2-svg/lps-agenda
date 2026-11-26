import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { admin, nextURL, session, startNext, stopNext } from "./local-next-qa.mjs";

const [stage, outputDirectory, flag] = process.argv.slice(2);
assert.ok(["before", "after"].includes(stage) && outputDirectory);
const metricsOnly = flag === "--metrics-only";
const output = resolve(outputDirectory, stage);
await mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const actor = await session();
assert.ifError((await admin.auth.admin.updateUserById(actor.id, {
  user_metadata: { full_name: "Ana Ribeiro" },
})).error);
const cookies = actor.cookies().split("; ").map(pair => {
  const index = pair.indexOf("=");
  return { name: pair.slice(0, index), value: pair.slice(index + 1), url: nextURL };
});
const routes = [
  ["/login", false], ["/cadastro", false], ["/recuperar-senha", false],
  ["/redefinir-senha", true], ["/onboarding", true],
];

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
  const palette = await page.locator(".account-experience").evaluate((element, colors) => {
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
      for (const [path, authenticated] of routes) {
        const context = await browser.newContext({
          viewport: { width, height: width < 768 ? 844 : 960 },
          deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR",
        });
        try {
          await context.route("**/*", route => {
            const url = new URL(route.request().url());
            return url.origin === nextURL ? route.continue() : route.abort();
          });
          if (authenticated) await context.addCookies(cookies);
          await context.addInitScript(mode => {
            localStorage.setItem("theme", mode);
            window.visualMetrics = { lcp: null, cls: 0, longTasks: 0 };
            for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
              new PerformanceObserver(list => {
                for (const value of list.getEntries()) {
                  if (type === "largest-contentful-paint") window.visualMetrics.lcp = value.startTime;
                  if (type === "layout-shift" && !value.hadRecentInput) window.visualMetrics.cls += value.value;
                  if (type === "longtask") window.visualMetrics.longTasks++;
                }
              }).observe({ type, buffered: true });
            }
          }, theme);
          const page = await context.newPage();
          const issues = [];
          page.on("pageerror", error => issues.push(error.message));
          page.on("console", message => {
            if (/violates? the following Content Security Policy/i.test(message.text())) issues.push(message.type());
          });
          const response = await page.goto(nextURL + path, { waitUntil: "load" });
          assert.equal(response.status(), 200, path);
          assert.equal(new URL(page.url()).pathname, path);
          assert.match(response.headers()["content-security-policy"], /script-src 'self' 'nonce-[^']+'/);
          await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
          const headings = page.getByRole("heading", { level: 1 });
          const forms = page.locator("main form");
          await headings.waitFor({ state: "visible" });
          await forms.waitFor({ state: "visible" });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const result = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            const entries = performance.getEntriesByType("resource");
            const bytes = predicate => entries.filter(predicate).reduce((sum, entry) => sum + entry.encodedBodySize, 0);
            return {
              ...window.visualMetrics,
              fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime,
              ttfb: nav.responseStart,
              jsBytes: bytes(entry => /\.js(?:\?|$)/.test(entry.name)),
              imageBytes: bytes(entry => entry.initiatorType === "img" || entry.name.includes("/_next/image") || /\.(?:webp|avif|png|jpe?g|svg)(?:\?|$)/i.test(entry.name)),
              viewport: document.documentElement.clientWidth,
              scroll: document.documentElement.scrollWidth,
            };
          });
          assert.equal(await headings.count(), 1, path + " heading");
          assert.equal(await forms.count(), 1, path + " form");
          if (stage === "after" && !metricsOnly) {
            assert.equal(result.scroll, result.viewport, path + " horizontal overflow");
            assert.ok(result.cls <= 0.1, path + " initial CLS");
            result.contrast = await assertContrast(page);
            await page.keyboard.press("Tab");
            const jump = page.getByRole("link", { name: "Ir para o conteúdo" });
            assert.ok(await jump.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle === "solid"));
            await page.keyboard.press("Enter");
            assert.equal(await page.locator(":focus").getAttribute("id"), "conteudo");
            const field = page.locator("main input:not([type=hidden])").first();
            await field.focus();
            assert.ok(await field.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle === "solid"));
            const accessibilityTree = await page.locator("main").ariaSnapshot();
            assert.match(accessibilityTree, /heading/);
            assert.match(accessibilityTree, /button/);
            assert.equal(await page.locator("main form").getAttribute("method"), "post");
            const label = path === "/recuperar-senha" ? "E-mail da conta"
              : path === "/redefinir-senha" ? "Nova senha"
              : path === "/onboarding" ? "Nome da barbearia"
              : path === "/cadastro" ? "Nome completo" : "E-mail";
            assert.ok(accessibilityTree.includes(label), "accessible label: " + label);
          }
          assert.deepEqual(issues, []);
          metrics.push({ path, width, theme, ...result });
          if (metricsOnly) continue;
          const name = [path.slice(1), width, theme].join("-");
          await page.evaluate(() => {
            document.activeElement?.blur();
            window.scrollTo(0, 0);
          });
          await page.screenshot({ path: resolve(output, name + ".png"), fullPage: true, animations: "disabled" });
        } finally {
          await context.close();
        }
      }
      console.log("PASS " + width + " " + theme + " · five routes, strict CSP and synthetic data");
    }
  }
  await writeFile(resolve(output, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
} finally {
  await browser.close();
  await stopNext();
}
