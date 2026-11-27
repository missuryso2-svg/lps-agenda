import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { browserCookies } from "./j2c-fixture.mjs";
import { bookingFixture } from "./j2d-fixture.mjs";
import { nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const enforce = process.argv.includes("--enforce");
const workers = process.argv.includes("--workers");
const owner = await session(), newcomer = await session(), manager = await session();
const fixture = await bookingFixture({ owner, trial: true });
sql(`insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
 values('${manager.id}','manager',session_user,'QA sintética K1-C')`);
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const screens = [
  ["landing", "/"], ["login", "/login"], ["cadastro", "/cadastro"], ["recuperacao", "/recuperar-senha"],
  ["onboarding", "/onboarding", newcomer], ["painel", "/dashboard", owner],
  ["agenda-dia", "/dashboard/agenda?date=" + fixture.day, owner],
  ["agenda-semana", "/dashboard/agenda?view=week&date=" + fixture.day, owner],
  ...["clientes", "servicos", "equipe", "horarios", "financeiro", "configuracoes", "plano", "qr"]
    .map((name) => [name, "/dashboard/" + name, owner]),
  ["agendamento", "/agendar/" + fixture.slug],
  ["administracao", "/admin/assinaturas", manager],
];
try {
  if (!workers) await startNext(true);
  for (const color of ["light", "dark"]) {
    const testedScreens = workers ? screens.filter(([name]) => ["clientes", "servicos", "equipe", "horarios"].includes(name)) : screens;
    for (const [screen, path, actor] of testedScreens) {
      const welcomeProbe = color === "light" && screen === "painel";
      const offerProbe = screen === "landing";
      const context = await browser.newContext({ viewport: { width: color === "light" ? 1280 : 375, height: 800 },
        colorScheme: color, reducedMotion: "reduce", locale: "pt-BR" });
      let step = "context";
      try {
        if (actor) await context.addCookies(browserCookies(actor));
        await context.addInitScript((theme) => {
          localStorage.setItem("theme", theme);
          window.qaViolations = [];
          document.addEventListener("securitypolicyviolation", (event) => {
            window.qaViolations.push(event.blockedURI === "eval" ? "eval" : event.effectiveDirective);
          });
        }, color);
        await context.route("**/*", (route) => [nextURL, process.env.NEXT_PUBLIC_SUPABASE_URL]
          .includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
        const page = await context.newPage();
        if (offerProbe) sql("update private.automatic_premium_trial_activation set enabled=true");
        step = "navigation";
        const response = await page.goto(nextURL + path);
        const expectedPath = path.split("?")[0];
        if (!response?.ok() || new URL(page.url()).pathname !== expectedPath) {
          step = response?.request().redirectedFrom() ? "redirect" : !response?.ok() ? "http_" + response?.status() : "redirect";
          throw new Error("Unexpected navigation");
        }
        step = "csp_header";
        assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
        if (offerProbe) {
          step = "trial_offer";
          await page.getByText("Crie sua conta e ganhe 7 dias grátis.", { exact: true }).first().waitFor({ timeout: 6000 });
        }
        if (welcomeProbe) {
          step = "trial_welcome";
          const dialog = page.getByRole("dialog", { name: "Bem-vindo ao LPS Agenda!" });
          await dialog.waitFor({ timeout: 6000 });
          await dialog.getByText("Você ganhou 7 dias grátis", { exact: true }).waitFor();
          assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)));
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          await page.getByRole("heading", { name: "Você está experimentando o plano Premium" }).waitFor();
        }
        step = "accessibility_tree";
        await page.getByRole("heading").first().waitFor({ state: "visible", timeout: 6000 });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Accessibility.enable");
        const { nodes } = await cdp.send("Accessibility.getFullAXTree");
        await cdp.detach();
        const exposed = nodes.filter((node) => !node.ignored);
        const landmarks = exposed.filter((node) => ["heading", "main", "dialog"].includes(node.role?.value)).length;
        step = "keyboard";
        const keyboard = [];
        for (let step = 0; step < 5; step++) {
          await page.keyboard.press("Tab");
          keyboard.push(await page.evaluate(() => {
            const el = document.activeElement;
            return el instanceof HTMLElement && el !== document.body && el.matches(":focus-visible");
          }));
        }
        const focusVisible = keyboard.filter(Boolean).length;
        const metrics = await page.evaluate(() => ({
          overflow_px: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          csp_violations: window.qaViolations.length,
          csp_categories: [...new Set(window.qaViolations)],
        }));
        const unnamed = exposed.filter((node) => ["button", "textbox", "combobox"].includes(node.role?.value)
          && !node.name?.value?.trim()).length;
        if (enforce && (!landmarks || !focusVisible || unnamed || metrics.overflow_px
          || metrics.csp_violations || !metrics.reduced_motion)) process.exitCode = 1;
        console.log(JSON.stringify({ screen, color, landmarks, focus_visible_samples: focusVisible,
          unnamed_candidates: unnamed, trial_offer: offerProbe, trial_welcome: welcomeProbe, ...metrics }));
      } catch {
        process.exitCode = 1;
        console.log(JSON.stringify({ screen, color, probe_failed: true, step }));
      } finally {
        if (offerProbe) sql("update private.automatic_premium_trial_activation set enabled=false");
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await stopNext();
}
