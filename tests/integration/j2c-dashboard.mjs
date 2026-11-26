import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { browserCookies, dashboardFixture } from "./j2c-fixture.mjs";
import { nextURL, sql, startNext, stopNext } from "./local-next-qa.mjs";

const fixture = await dashboardFixture();
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const agenda = "/dashboard/agenda?date=" + fixture.date;
const errors = [];

async function pageFor(actor, width) {
  const context = await browser.newContext({
    viewport: { width, height: 850 }, reducedMotion: "reduce", locale: "pt-BR",
  });
  await context.addCookies(browserCookies(actor));
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    if ([nextURL, process.env.NEXT_PUBLIC_SUPABASE_URL].includes(origin)) return route.continue();
    errors.push("external request");
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", () => errors.push("page error"));
  page.on("console", message => {
    if (/violates? the following Content Security Policy/i.test(message.text())) errors.push("CSP violation");
  });
  return page;
}

async function visit(page, path) {
  const response = await page.goto(nextURL + path);
  assert.ok(response?.ok(), path);
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
}

async function activeShop(page, name) {
  const trigger = page.getByRole("button", { name: "Barbearia ativa: " + name });
  await trigger.waitFor();
  return trigger;
}

try {
  await startNext(false);
  const owner = await pageFor(fixture.owner, 1280);
  const staff = await pageFor(fixture.staff, 375);
  const other = await pageFor(fixture.other, 768);

  await visit(owner, "/dashboard");
  await owner.getByRole("heading", { name: "Hoje na barbearia" }).waitFor();
  await owner.getByRole("main").getByText("Receita do mês", { exact: true }).waitFor();
  const trigger = await activeShop(owner, "Barbearia Central QA");
  await trigger.locator("img").waitFor();
  assert.ok(await trigger.locator("img").evaluate(img => img.complete && img.naturalWidth > 0));
  await trigger.click();
  const radios = owner.getByRole("menuitemradio");
  assert.equal(await radios.count(), 2);
  assert.equal(await radios.filter({ hasText: "Barbearia Central QA" }).getAttribute("aria-checked"), "true");
  await radios.filter({ hasText: "Barbearia Estação QA" }).click();
  const swapped = await activeShop(owner, "Barbearia Estação QA");
  assert.equal(await owner.locator("main").getByText("Caio Martins").count(), 0);
  await swapped.click();
  await owner.getByRole("menuitemradio").filter({ hasText: "Barbearia Central QA" }).click();
  await activeShop(owner, "Barbearia Central QA");
  await owner.getByRole("button", { name: "Abrir menu da conta" }).click();
  assert.equal(await owner.getByRole("menuitem", { name: "Configurações" }).isVisible(), true);
  await owner.keyboard.press("Escape");
  console.log("PASS owner revenue, actual custom logo, active membership radio, two permitted shop switches and account menu");

  await visit(staff, "/dashboard");
  await staff.getByRole("heading", { name: "Hoje na barbearia" }).waitFor();
  assert.equal(await staff.locator("main").getByText("Receita do mês", { exact: true }).count(), 0);
  await staff.getByRole("button", { name: "Abrir menu do painel" }).click();
  const drawer = staff.getByRole("dialog", { name: "Menu do painel" });
  await drawer.waitFor();
  assert.equal(await drawer.getByRole("link", { name: "Financeiro" }).count(), 0);
  const sidebarLink = drawer.getByRole("link", { name: "Visão geral" });
  assert.equal(await sidebarLink.getAttribute("aria-current"), "page");
  await staff.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  await visit(staff, "/dashboard/financeiro");
  await staff.getByRole("main").getByText("Área restrita ao proprietário", { exact: true }).waitFor();
  await visit(other, "/dashboard");
  await other.getByRole("heading", { name: "Hoje na barbearia" }).waitFor();
  assert.equal(await other.locator("main").getByText("Caio Martins").count(), 0);
  console.log("PASS staff navigation and finance guard; another tenant sees no appointments from the fixture shop");

  await visit(staff, agenda);
  await staff.getByRole("main").getByText("Intervalo reservado", { exact: true }).waitFor();
  assert.equal(await staff.getByRole("button", { name: "Agendar cliente presencial" }).isEnabled(), true);
  const detailTrigger = staff.getByRole("button", { name: /Bruno Ferreira.*Confirmado/ });
  await detailTrigger.focus();
  await staff.keyboard.press("Enter");
  const detail = staff.getByRole("dialog");
  await detail.getByRole("heading", { name: "Bruno Ferreira" }).waitFor();
  assert.equal(await detail.evaluate(el => getComputedStyle(el).animationName), "none");
  const before = await detail.evaluate(el => el.contains(document.activeElement));
  assert.ok(before, "focus enters the appointment dialog");
  await staff.keyboard.press("Escape");
  await detail.waitFor({ state: "hidden" });
  await staff.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Bruno Ferreira"));
  const selector = staff.getByRole("combobox", { name: "Filtrar por profissional" });
  await selector.click();
  await staff.getByRole("option", { name: "Marina Costa" }).click();
  await staff.waitForURL(url => url.searchParams.has("barber"));
  await staff.getByRole("heading", { name: "Marina Costa", exact: true }).waitFor();
  assert.equal(await staff.getByRole("heading", { name: "Rafael Lima", exact: true }).count(), 0);
  await staff.getByRole("link", { name: "Semana", exact: true }).click();
  await staff.getByRole("heading", { name: "Agenda semanal", exact: true }).waitFor();
  assert.equal(new URL(staff.url()).searchParams.get("view"), "week");
  const classes = await staff.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
  }));
  assert.equal(classes.viewport, classes.content);
  assert.equal(sql("select status || ':' || price_cents from public.appointments where id='" + fixture.appointments[1] + "'"), "confirmed:6500");
  console.log("PASS staff agenda, displayed time block, accessible detail/return focus, filter, week and preserved price");

  const tomorrow = sql("select ((now() at time zone 'America/Sao_Paulo')::date + 1)");
  await visit(staff, "/dashboard/agenda?date=" + tomorrow);
  const felipe = staff.getByRole("button", { name: /Felipe Souza.*Agendado/ });
  await felipe.click();
  await staff.getByRole("dialog").getByRole("button", { name: "Reagendar", exact: true }).click();
  const reschedule = staff.getByRole("dialog", { name: "Reagendar atendimento" });
  await reschedule.getByRole("button", { name: "11:00", exact: true }).click();
  await reschedule.getByRole("button", { name: "Confirmar novo horário" }).click();
  await reschedule.waitFor({ state: "hidden" });
  assert.equal(sql("select to_char(starts_at at time zone 'America/Sao_Paulo','HH24:MI') || ':' || price_cents from public.appointments where id='" + fixture.appointments[4] + "'"), "11:00:6500");
  await staff.getByRole("button", { name: /Felipe Souza.*11:00.*Agendado/ }).click();
  await staff.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  const cancel = staff.getByRole("dialog", { name: "Cancelar agendamento?" });
  await cancel.getByLabel("Motivo (opcional)").fill("Solicitação fictícia do cliente");
  await cancel.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await cancel.waitFor({ state: "hidden" });
  assert.equal(sql("select status || ':' || price_cents from public.appointments where id='" + fixture.appointments[4] + "'"), "cancelled:6500");
  assert.deepEqual(errors, []);
  console.log("PASS rescheduling and explicit cancellation via mobile dialogs preserve historical price");
} finally {
  await browser.close();
  await stopNext();
}
