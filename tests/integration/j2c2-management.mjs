import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { browserCookies, dashboardFixture } from "./j2c-fixture.mjs";
import { action, ids, nextURL, sql, startNext, stopNext } from "./local-next-qa.mjs";

const fixture = await dashboardFixture();
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const issues = [];
const serviceId = sql("select id from public.services where barbershop_id='" + fixture.shop + "' and name='Corte clássico'");
const customerName = "Cliente local " + ids().slice(0, 8);
const barberName = "Profissional local " + ids().slice(0, 8);

async function tab(actor, width) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: "reduce", locale: "pt-BR" });
  await context.addCookies(browserCookies(actor));
  await context.route("**/*", route => {
    if ([nextURL, process.env.NEXT_PUBLIC_SUPABASE_URL].includes(new URL(route.request().url()).origin)) return route.continue();
    issues.push("external request");
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  page.on("pageerror", () => issues.push("page error"));
  page.on("console", message => {
    if (/violates? the following Content Security Policy/i.test(message.text())) issues.push("CSP violation");
  });
  return page;
}

async function visit(page, section, title) {
  const response = await page.goto(nextURL + "/dashboard/" + section);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  await page.getByRole("main").getByRole("heading", { name: title, exact: true }).waitFor();
}

function dialog(page) {
  return page.getByRole("dialog");
}

try {
  await startNext(false);
  const owner = await tab(fixture.owner, 1280);
  const staff = await tab(fixture.staff, 1280);
  const other = await tab(fixture.other, 375);

  await visit(staff, "clientes", "Clientes");
  const createCustomer = staff.getByRole("button", { name: "Novo cliente", exact: true });
  await createCustomer.focus();
  await staff.keyboard.press("Enter");
  await dialog(staff).waitFor();
  assert.equal(await dialog(staff).evaluate(el => getComputedStyle(el).animationName), "none");
  await staff.keyboard.press("Escape");
  await dialog(staff).waitFor({ state: "hidden" });
  await staff.waitForFunction(() => document.activeElement?.textContent?.includes("Novo cliente"));
  await createCustomer.click();
  await dialog(staff).getByLabel("Nome completo").fill(customerName);
  await dialog(staff).getByLabel("Telefone", { exact: true }).fill("11987654321");
  await dialog(staff).getByRole("button", { name: "Cadastrar cliente" }).click();
  await dialog(staff).waitFor({ state: "hidden" });
  const search = staff.getByRole("search");
  await search.getByRole("searchbox").fill(customerName);
  await search.getByRole("button", { name: "Buscar", exact: true }).click();
  await staff.waitForURL(url => url.searchParams.get("q") === customerName);
  await staff.getByRole("button", { name: "Ver detalhes de " + customerName }).first().click();
  await dialog(staff).getByRole("heading", { name: "Histórico do cadastro" }).waitFor();
  await dialog(staff).getByRole("button", { name: "Editar cliente" }).click();
  const changedName = customerName + " editado";
  await dialog(staff).getByLabel("Nome completo").fill(changedName);
  await dialog(staff).getByRole("button", { name: "Salvar alterações" }).click();
  await dialog(staff).waitFor({ state: "hidden" });
  assert.equal(sql("select count(*) from public.customers where barbershop_id='" + fixture.shop + "' and full_name='" + changedName + "'"), "1");
  await staff.getByRole("button", { name: "Arquivar " + changedName }).click();
  await dialog(staff).getByRole("button", { name: "Arquivar", exact: true }).click();
  await dialog(staff).waitFor({ state: "hidden" });
  await staff.getByRole("navigation", { name: "Situação dos clientes" }).getByRole("link", { name: /Arquivados/ }).click();
  await staff.getByRole("button", { name: "Reativar " + changedName }).click();
  await staff.getByRole("button", { name: "Reativar " + changedName }).waitFor({ state: "hidden" });
  assert.equal(sql("select is_active from public.customers where barbershop_id='" + fixture.shop + "' and full_name='" + changedName + "'"), "t");
  await visit(other, "clientes", "Clientes");
  assert.equal(await other.getByRole("main").getByText(changedName, { exact: true }).count(), 0);
  console.log("PASS customer creation, focus return, search, record history, editing, archive and restore; foreign tenant separated");

  await visit(owner, "servicos", "Serviços");
  await owner.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await dialog(owner).getByLabel("Nome do serviço").fill("Acabamento local");
  await dialog(owner).getByLabel("Preço (R$)").fill("22,50");
  await dialog(owner).getByLabel("Duração (min)").fill("15");
  await dialog(owner).getByRole("button", { name: "Cadastrar serviço" }).click();
  await dialog(owner).waitFor({ state: "hidden" });
  assert.equal(sql("select price_cents from public.services where barbershop_id='" + fixture.shop + "' and name='Acabamento local'"), "2250");
  await owner.getByRole("button", { name: "Editar Corte clássico", exact: true }).click();
  await dialog(owner).getByLabel("Preço (R$)").fill("82,90");
  await dialog(owner).getByRole("button", { name: "Salvar serviço" }).click();
  await dialog(owner).waitFor({ state: "hidden" });
  assert.equal(sql("select price_cents from public.services where id='" + serviceId + "'"), "8290");
  assert.equal(sql("select price_cents from public.appointments where id='" + fixture.appointments[0] + "'"), "6500");
  await owner.getByRole("switch", { name: "Desativar Corte clássico" }).click();
  await owner.getByRole("switch", { name: "Ativar Corte clássico" }).waitFor();
  await owner.getByRole("switch", { name: "Ativar Corte clássico" }).click();
  await owner.getByRole("switch", { name: "Desativar Corte clássico" }).waitFor();
  await visit(staff, "servicos", "Serviços");
  assert.equal(await staff.getByRole("button", { name: "Novo serviço", exact: true }).count(), 0);
  assert.equal(await staff.getByRole("switch", { name: /Corte clássico/ }).count(), 0);
  console.log("PASS service create/edit/toggle, cent amounts, historical price and staff read-only");

  await visit(owner, "equipe", "Equipe");
  assert.equal(sql("select string_agg(code || ':' || max_barbers, ',' order by code) from public.plans where code in ('basico','profissional','premium')"), "basico:1,premium:10,profissional:5");
  const catalog = await owner.getByRole("main").locator('[aria-label="Limites do catálogo"]').innerText();
  assert.match(catalog.replace(/\s+/g, " "), /Básico 1 Profissional 5 Premium 10/);
  await owner.getByRole("button", { name: "Novo profissional", exact: true }).click();
  await dialog(owner).getByLabel("Nome", { exact: true }).fill(barberName);
  await dialog(owner).getByRole("checkbox", { name: "Serviço Corte clássico" }).check();
  await dialog(owner).getByRole("button", { name: "Cadastrar profissional" }).click();
  await dialog(owner).waitFor({ state: "hidden" });
  const newBarber = sql("select id from public.barbers where barbershop_id='" + fixture.shop + "' and name='" + barberName + "'");
  assert.ok(newBarber);
  assert.equal(sql("select service_id from public.barber_services where barber_id='" + newBarber + "'"), serviceId);
  const professional = owner.locator("article").filter({ hasText: barberName });
  await professional.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog(owner).getByLabel("Nome", { exact: true }).fill(barberName + " editado");
  await dialog(owner).getByRole("button", { name: "Salvar profissional" }).click();
  await dialog(owner).waitFor({ state: "hidden" });
  const edited = owner.locator("article").filter({ hasText: barberName + " editado" });
  await edited.getByRole("switch", { name: /Desativar/ }).click();
  await edited.getByRole("switch", { name: /Ativar/ }).waitFor();
  await edited.getByRole("switch", { name: /Ativar/ }).click();
  await edited.getByRole("switch", { name: /Desativar/ }).waitFor();

  const first = ids(), second = ids();
  sql("insert into public.subscriptions(barbershop_id,plan_id,gateway,status,invoice_link_key,trial_started_at,trial_ends_at) select '" +
    fixture.second + "',id,'manual_pix','trialing','uncontracted',now(),now()+interval '7 days' from public.plans where code='basico'; " +
    "insert into public.barbers(id,barbershop_id,name,is_active) values ('" + first + "','" + fixture.second + "','Primeiro QA',false),('" + second + "','" + fixture.second + "','Segundo QA',false)");
  const selectedOwner = { cookies: () => fixture.owner.cookies() + "; lps.active_barbershop=" + fixture.second };
  const activated = await Promise.all([first, second].map(id => action(selectedOwner, "setBarberActiveAction", [id, true], "/dashboard/equipe")));
  assert.equal(activated.filter(result => /"status":"success"/.test(result.body)).length, 1);
  assert.equal(sql("select count(*) from public.barbers where barbershop_id='" + fixture.second + "' and is_active"), "1");
  await owner.context().addCookies([{ url: nextURL, name: "lps.active_barbershop", value: fixture.second }]);
  await visit(owner, "equipe", "Equipe");
  assert.match(await owner.getByRole("main").locator(".j2-management-limit").innerText(), /1 de 1 profissionais ativos/);
  console.log("PASS real catalog 1/5/10, professional create/edit/assignment/toggle and concurrent Basic activation limit");

  await owner.context().addCookies([{ url: nextURL, name: "lps.active_barbershop", value: fixture.shop }]);
  await visit(owner, "horarios", "Horários e disponibilidade");
  const closing = owner.getByLabel("Fechamento de Segunda-feira", { exact: true });
  await closing.fill("08:00");
  await owner.getByRole("button", { name: "Salvar horários" }).click();
  await owner.locator("#business-error-1").waitFor();
  assert.equal(await closing.getAttribute("aria-describedby"), "business-error-1");
  assert.equal(sql("select closes_at from public.business_hours where barbershop_id='" + fixture.shop + "' and weekday=1"), "19:00:00");
  await closing.fill("20:00");
  const saving = owner.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/dashboard/horarios"));
  await owner.getByRole("button", { name: "Salvar horários" }).click();
  assert.ok((await saving).ok());
  assert.equal(sql("select closes_at from public.business_hours where barbershop_id='" + fixture.shop + "' and weekday=1"), "20:00:00");
  await owner.getByRole("tab", { name: "Barbearia" }).focus();
  await owner.keyboard.press("ArrowRight");
  await owner.getByRole("tabpanel", { name: "Profissionais" }).waitFor();
  await visit(staff, "horarios", "Horários e disponibilidade");
  assert.equal(await staff.getByLabel("Abertura de Segunda-feira", { exact: true }).isDisabled(), true);
  assert.equal(await staff.getByRole("button", { name: "Salvar horários" }).count(), 0);
  assert.deepEqual(issues, []);
  console.log("PASS weekly hours invalid/valid intervals, ARIA error association, keyboard tabs, staff restriction and strict CSP");
} finally {
  await browser.close();
  await stopNext();
}
