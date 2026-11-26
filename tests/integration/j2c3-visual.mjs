// Local screenshot and HTTP performance matrix with the same synthetic tenant in both builds.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ids, nextURL, session, sql } from "./local-next-qa.mjs";
import { browserCookies } from "./j2c-fixture.mjs";

const [stage, evidenceRoot, focus] = process.argv.slice(2);
const titles = { financeiro: "Financeiro", configuracoes: "Configurações", plano: "Plano e assinatura", qr: "QR Code de agendamento" };
const routes = focus === "--qr-only" ? ["qr"] : Object.keys(titles);
assert.ok(["before", "after"].includes(stage) && evidenceRoot);
const file = process.env.C3_QA_FIXTURE;
assert.match(file, /[\\/]Temp[\\/]lps-c3-fixture\.json$/i);
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const output = resolve(evidenceRoot, "screenshots", stage);
await mkdir(output, { recursive: true });
let fixture;
if (stage === "before" && !focus) {
  const owner = await session();
  const shop = ids(), contract = ids();
  const slug = "aurora-qa-" + ids().slice(0, 8);
  sql([
    "insert into public.barbershops(id,name,slug,description,phone,address_city,address_state) values ('" +
      shop + "','Barbearia Aurora QA','" + slug + "','Cortes e barba com hora marcada.','11999990000','São Paulo','SP');",
    "insert into public.barbershop_members(barbershop_id,user_id,role) values ('" + shop + "','" + owner.id + "','owner');",
    "update public.profiles set full_name='Ana Ribeiro · QA' where id='" + owner.id + "';",
    "insert into public.subscriptions(id,barbershop_id,plan_id,status,gateway_subscription_id,contracted_price_cents)" +
      " select '" + contract + "','" + shop + "',id,'active','qa-" + contract + "',6379 from public.plans where code='basico';",
    "insert into public.payments(barbershop_id,subscription_id,scope,amount_cents,status,method,paid_at,gateway_payment_id)" +
      " values ('" + shop + "','" + contract + "','platform_subscription',4123,'paid','boleto',now(),'qa-" + contract + "');",
    "insert into public.payments(barbershop_id,scope,amount_cents,status,method,created_at,paid_at) select '" +
      shop + "','shop_service',cents,'paid','pix',now()-(n*interval '3 days'),now()-(n*interval '3 days')" +
      " from unnest(array[7500,5500,10500,8900,4050,6820]) with ordinality r(cents,n);",
    "insert into public.payments(barbershop_id,scope,amount_cents,status,method) values ('" + shop +
      "','shop_service',6500,'pending','cash');",
  ].join("\n"));
  fixture = { cookies: browserCookies(owner), shop, slug };
  await writeFile(file, JSON.stringify(fixture));
} else {
  fixture = JSON.parse(await readFile(file, "utf8"));
}
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });

const metricsPath = resolve(evidenceRoot, "metrics-" + stage + ".json");
const entries = focus
  ? JSON.parse(await readFile(metricsPath, "utf8")).filter(entry => !routes.includes(entry.route))
  : [];
const contrastPairs = [
  ["ink", "surface", 4.5], ["muted", "surface", 4.5], ["ink", "accent-soft", 4.5],
  ["accent", "accent-soft", 4.5], ["focus", "surface", 3],
];
function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const components = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255);
  const linear = components.map(value => value <= 0.04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
try {
  for (const width of [375, 768, 1280, 1920]) {
    for (const colorScheme of ["light", "dark"]) {
      for (const route of routes) {
        const context = await browser.newContext({
          viewport: { width, height: width === 375 ? 844 : 940 },
          colorScheme, reducedMotion: "reduce", locale: "pt-BR",
        });
        try {
          await context.addCookies(fixture.cookies);
          await context.route("**/*", req => [nextURL, api].includes(new URL(req.request().url()).origin)
            ? req.continue() : req.abort());
          await context.addInitScript(mode => {
            localStorage.setItem("theme", mode);
            window.measurement = { lcp: 0, cls: 0, csp: [] };
            new PerformanceObserver(list => {
              for (const e of list.getEntries()) window.measurement.lcp = e.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver(list => {
              for (const e of list.getEntries()) if (!e.hadRecentInput) window.measurement.cls += e.value;
            }).observe({ type: "layout-shift", buffered: true });
            document.addEventListener("securitypolicyviolation", e => {
              window.measurement.csp.push(e.violatedDirective);
            });
          }, colorScheme);
          const page = await context.newPage();
          const response = await page.goto(nextURL + "/dashboard/" + route);
          assert.equal(response.status(), 200);
          assert.equal(new URL(page.url()).pathname, "/dashboard/" + route);
          assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
          await page.getByRole("main").getByRole("heading", { level: 2, name: titles[route], exact: true }).waitFor();
          if (route === "qr") await page.getByRole("main").getByRole("img", { name: /QR Code de agendamento/ }).waitFor();
          await page.waitForFunction(theme => document.documentElement.classList.contains(theme), colorScheme);
          await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          const measures = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            return {
              ttfb: nav.responseStart, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
              js: performance.getEntriesByType("resource").filter(r => /\.js(?:\?|$)/.test(r.name))
                .reduce((total, r) => total + r.transferSize, 0),
              overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
              ...window.measurement,
            };
          });
          if (stage === "after") {
            assert.equal(measures.overflow, 0, route + " at " + width + "/" + colorScheme);
            const values = await page.locator(".j2-dashboard").evaluate(element => {
              const style = getComputedStyle(element);
              const tokens = ["ink", "surface", "muted", "accent-soft", "accent", "focus"];
              return Object.fromEntries(tokens.map(name => [name, style.getPropertyValue("--lps-" + name).trim()]));
            });
            measures.minContrast = Math.min(...contrastPairs.map(([first, second, expected]) => {
              const [low, high] = [luminance(values[first]), luminance(values[second])].sort((a,b) => a-b);
              const ratio = (high + .05) / (low + .05);
              assert.ok(ratio >= expected, first + " / " + second + " " + ratio);
              return +ratio.toFixed(2);
            }));
            assert.deepEqual(measures.csp, [], route);
            assert.doesNotMatch(await page.locator("main").innerText(), /\b168\s*(?:h\b|horas\b)/i);
          }
          await page.screenshot({ path: resolve(output, route + "-" + width + "-" + colorScheme + ".png"), fullPage: true });
          entries.push({ width, colorScheme, route, ...measures });
          console.log("PASS " + stage + " " + route + " " + width + " " + colorScheme + " overflow=" + measures.overflow);
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await writeFile(metricsPath, JSON.stringify(entries, null, 2) + "\n");
  await browser.close();
}
