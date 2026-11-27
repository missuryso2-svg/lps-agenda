import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { browserCookies } from "./j2c-fixture.mjs";
import { nextURL } from "./local-next-qa.mjs";
import { authenticate, fixture, root } from "./j2e-fixture.mjs";

const [stage, evidence, createFlag] = process.argv.slice(2);
assert.ok(["before", "after"].includes(stage) && evidence);
const qa = await fixture(createFlag === "--seed");
const actor = await authenticate(qa.manager);
const target = resolve(evidence, "screenshots", stage);
await mkdir(target, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT));
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const combinations = [];
const pairs = [
  ["--lps-ink", "--lps-surface", 4.5], ["--lps-muted", "--lps-surface", 4.5],
  ["--lps-accent", "--lps-surface", 4.5], ["--lps-positive", "--fa-good-bg", 4.5],
  ["--fa-warning", "--fa-warning-bg", 4.5], ["--lps-danger", "--fa-danger-bg", 4.5],
  ["--lps-on-action", "--lps-action", 4.5], ["--lps-focus", "--lps-surface", 3],
];

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const [r, g, b] = hex.match(/[\da-f]{2}/gi).map(pair => parseInt(pair, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const routes = [
  ["visao", root + "?mes=" + qa.competence, /Visão financeira/],
  ["barbearias", root + "/barbearias?nome=" + encodeURIComponent(qa.prefix), /^Barbearias$/],
  ["trial", root + "/barbearias/" + qa.active.id, qa.active.name],
  ["mensalidades", root + "/mensalidades?mes=" + qa.competence + "&situacao=pending", /^Mensalidades$/],
  ["historico", root + "/historico?barbearia=" + qa.paid.id, /Histórico financeiro/],
  ["operadores", root + "/operadores", /Operadores financeiros/],
  ["saude", root + "/saude", /^Saúde financeira$/],
];
try {
  for (const width of [375, 768, 1280, 1920]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 900 : 980 },
        colorScheme: theme, reducedMotion: "reduce", locale: "pt-BR",
      });
      try {
        await context.route("**/*", route => [nextURL, api].includes(new URL(route.request().url()).origin)
          ? route.continue() : route.abort());
        await context.addCookies(browserCookies(actor));
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
        const pages = [];
        for (const [file, route, heading] of routes) {
          const response = await page.goto(nextURL + route);
          assert.equal(response.status(), 200);
          assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
          await page.getByRole("heading", { name: heading, exact: true, level: 1 }).waitFor();
          await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
          await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length && window.qa.lcp > 0);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          const measured = await page.evaluate(() => ({
            ttfb: performance.getEntriesByType("navigation")[0].responseStart,
            fcp: performance.getEntriesByName("first-contentful-paint")[0].startTime,
            js: performance.getEntriesByType("resource").filter(entry => /\.js(?:\?|$)/.test(entry.name))
              .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            ...window.qa,
          }));
          if (stage === "after") {
            assert.equal(measured.overflow, 0, file + " " + width);
            assert.deepEqual(measured.csp, []);
            if (file === "visao") {
              const colors = await page.locator(".fa-shell").evaluate((element, names) => {
                const computed = getComputedStyle(element);
                return Object.fromEntries(names.map(name => [name, computed.getPropertyValue(name).trim()]));
              }, [...new Set(pairs.flatMap(pair => pair.slice(0, 2)))]);
              measured.minContrast = Math.min(...pairs.map(([foreground, background, required]) => {
                const [low, high] = [luminance(colors[foreground]), luminance(colors[background])].sort((a, b) => a - b);
                const ratio = (high + 0.05) / (low + 0.05);
                assert.ok(ratio >= required, foreground + " / " + background + " " + ratio);
                return +ratio.toFixed(2);
              }));
            }
          }
          pages.push({ route: file, ...measured });
          // Keep all matrices for the three operational views and representative comparisons for other routes.
          if (["visao", "trial", "mensalidades"].includes(file) || [375, 1280].includes(width)) {
            await page.screenshot({ path: resolve(target, file + "-" + width + "-" + theme + ".png") });
          }
        }
        combinations.push({ width, theme, pages });
        console.log("PASS " + stage + " " + width + " " + theme + " (" + pages.length + " rotas)");
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await writeFile(resolve(evidence, "metrics-" + stage + ".json"), JSON.stringify(combinations, null, 2) + "\n");
  await browser.close();
}
