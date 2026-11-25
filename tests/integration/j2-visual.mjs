import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nextURL, startNext, stopNext } from "./local-next-qa.mjs";

const [stage, outputDirectory, option] = process.argv.slice(2);
assert.ok(["before", "after"].includes(stage) && outputDirectory);
const metricsOnly = option === "--metrics-only";
const output = resolve(outputDirectory, stage);
await mkdir(output, { recursive: true });
const { chromium } = await (process.env.C2_QA_PLAYWRIGHT
  ? import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href) : import("playwright-core"));

const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const metrics = [];
function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(channel => Number.parseInt(channel, 16) / 255);
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

const contrastPairs = [
  ["ink", "canvas", 4.5], ["ink", "surface", 4.5], ["ink", "subtle", 4.5],
  ["muted", "canvas", 4.5], ["muted", "surface", 4.5], ["muted", "subtle", 4.5],
  ["muted", "accent-soft", 4.5], ["accent", "canvas", 4.5], ["accent", "subtle", 4.5],
  ["accent", "accent-soft", 4.5], ["positive", "subtle", 4.5], ["danger", "surface", 4.5],
  ["on-action", "action", 4.5], ["on-action", "action-hover", 4.5],
  ["inverse", "black", 4.5], ["inverse-muted", "black", 4.5],
  ["focus", "canvas", 3], ["focus", "surface", 3], ["focus", "subtle", 3],
  ["edge", "canvas", 3], ["edge", "surface", 3], ["edge", "subtle", 3],
];
async function assertContrast(page) {
  const tokens = await page.evaluate(keys => {
    const styles = getComputedStyle(document.querySelector(".j2-site"));
    return Object.fromEntries(keys.map(key => [key, styles.getPropertyValue("--lps-" + key).trim()]));
  }, [...new Set(contrastPairs.flatMap(([foreground, background]) => [foreground, background]))]);
  return contrastPairs.map(([foreground, background, threshold]) => {
    const colors = [tokens[foreground], tokens[background]];
    assert.ok(colors.every(color => /^#[\da-f]{6}$/i.test(color)));
    const [dark, light] = colors.map(luminance).sort((a, b) => a - b);
    const ratio = (light + 0.05) / (dark + 0.05);
    assert.ok(ratio >= threshold, foreground + " / " + background + " ratio " + ratio);
    return { foreground, background, ratio: Number(ratio.toFixed(2)), threshold };
  });
}

async function assertKeyboard(page, width, theme) {
  const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
  await page.keyboard.press("Tab");
  assert.ok(await skip.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle === "solid"));
  await page.keyboard.press("Enter");
  await page.waitForURL("**/#conteudo");
  assert.equal(await page.locator(":focus").getAttribute("id"), "conteudo");

  const question = page.locator("#faq summary").first();
  await question.focus();
  await page.keyboard.press("Enter");
  assert.ok(await question.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineWidth === "2px"));
  assert.equal(await question.locator("..").getAttribute("open"), "");
  await page.keyboard.press("Space");
  assert.equal(await question.locator("..").getAttribute("open"), null);
  if (width < 1024) {
    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.focus();
    const bounds = await trigger.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, "menu target");
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    assert.equal(await drawer.evaluate(el => getComputedStyle(el).animationName), "none");
    await page.keyboard.press("Tab");
    assert.ok(await drawer.evaluate(el => el.contains(document.activeElement)));
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
  }

  const toggle = page.getByRole("button", { name: "Alternar entre tema claro e escuro" }).filter({ visible: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const opposite = theme === "dark" ? "light" : "dark";
  await page.waitForFunction(mode => document.documentElement.classList.contains(mode), opposite);
}

try {
  await startNext(false);
  for (const width of [375, 768, 1280, 1920]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 844 : 900 },
        deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR",
      });
      try {
        await context.route("**/*", route => {
          const url = new URL(route.request().url());
          return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        const pageErrors = [];
        const violations = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("console", message => {
          if (/violates? the following Content Security Policy/i.test(message.text())) violations.push(message.type());
        });
        await page.addInitScript((mode) => {
          localStorage.setItem("theme", mode);
          window.visualMetrics = { lcp: null, cls: 0, longTasks: 0 };
          for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
            new PerformanceObserver((list) => {
              for (const value of list.getEntries()) {
                if (type === "largest-contentful-paint") window.visualMetrics.lcp = value.startTime;
                if (type === "layout-shift" && !value.hadRecentInput) window.visualMetrics.cls += value.value;
                if (type === "longtask") window.visualMetrics.longTasks++;
              }
            }).observe({ type, buffered: true });
          }
        }, theme);
        const response = await page.goto(nextURL, { waitUntil: "load" });
        assert.equal(response.status(), 200);
        await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => performance.getEntriesByType("paint").some(entry => entry.name === "first-contentful-paint"));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await page.evaluate(() => {
          const navigation = performance.getEntriesByType("navigation")[0];
          const entries = performance.getEntriesByType("resource");
          return {
            ...window.visualMetrics,
            fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
            ttfb: navigation.responseStart,
            jsBytes: entries.filter(entry => /\.js(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
            imageBytes: entries.filter(entry => entry.initiatorType === "img" || entry.name.includes("/_next/image")).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          };
        });
        if (stage === "after" && !metricsOnly) {
          assert.equal(result.scroll, result.viewport, "horizontal overflow");
          assert.ok(result.cls <= 0.1, "initial CLS");
          assert.ok(/^default-src.*script-src.*'nonce-/i.test(response.headers()["content-security-policy"] ?? ""), "strict nonce CSP");
          result.contrast = await assertContrast(page);
          assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
          assert.equal(await page.locator("#planos .lp-plan-grid > article").count(), 3);
          assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
        }
        metrics.push({ width, theme, ...result });
        if (!metricsOnly) {
          await page.screenshot({ path: resolve(output, `${width}-${theme}.png`), fullPage: true, animations: "disabled" });
          if ([375, 1280].includes(width)) {
            await page.screenshot({ path: resolve(output, `${width}-${theme}-hero.png`), animations: "disabled" });
          }
        }
        if (stage === "after" && !metricsOnly) {
          await assertKeyboard(page, width, theme);
          assert.deepEqual(pageErrors, []);
          assert.deepEqual(violations, []);
          console.log("PASS " + width + " " + theme + " · layout, WCAG contrast pairs, nonce CSP, keyboard, FAQ and theme");
        }
      } finally {
        await context.close();
      }
    }
  }
  if (stage === "after" && !metricsOnly) {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, reducedMotion: "no-preference" });
    try {
      await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(nextURL);
      const trigger = page.getByRole("button", { name: "Abrir menu" });
      await trigger.click();
      const drawer = page.getByRole("dialog");
      await drawer.waitFor();
      assert.equal(await drawer.evaluate(el => getComputedStyle(el).animationName), "j2-slide-in");
      assert.equal(await drawer.evaluate(el => getComputedStyle(el).animationDuration), "0.2s");
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      console.log("PASS pointer menu 200 ms; keyboard dismisses and returns focus");
    } finally {
      await context.close();
    }
  }
  await writeFile(resolve(output, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
  console.log("Captured " + metrics.length + " width/theme combinations from the real local build.");
} finally {
  await browser.close();
  await stopNext();
}
