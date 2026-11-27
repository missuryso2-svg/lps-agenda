import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nextURL, ids, sql } from "./local-next-qa.mjs";
import { authenticate, call, competence, dateTime, fixture, makeShop, planId, root, terms } from "./j2e-fixture.mjs";

const [directory] = process.argv.slice(2);
const out = resolve(directory, "states");
await mkdir(out, { recursive: true });
const qa = await fixture();
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const operator = await authenticate(qa.operator), manager = await authenticate(qa.manager);
const owner = await authenticate(qa.customer);
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT));
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const problems = [];
const pathFor = shop => root + "/barbearias/" + shop;
const method = action => "select count(*) from private.financial_journal where action='" + action + "' and shop=";
const invoiceMonth = competence + "-01";
const formatMoney = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const valueOf = locator => locator.evaluate(element => element.textContent.trim());
const problemsOn = page => page.on("pageerror", () => problems.push("uncaught page error"));
const capture = (page, name) => page.screenshot({ path: resolve(out, name + ".png") });

async function open(colorScheme = "dark") {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 }, colorScheme, reducedMotion: "reduce", locale: "pt-BR",
  });
  await context.route("**/*", route => {
    if ([nextURL, api].includes(new URL(route.request().url()).origin)) return route.continue();
    problems.push("external request");
    return route.abort();
  });
  await context.addInitScript(() => {
    window.financeViolations = [];
    document.addEventListener("securitypolicyviolation", event => window.financeViolations.push(event.violatedDirective));
  });
  const page = await context.newPage();
  problemsOn(page);
  return page;
}

async function visit(page, path) {
  const response = await page.goto(nextURL + path);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  // Wait for React to transfer the streamed segments out of their hidden staging nodes.
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'));
  return response;
}

async function login(page, account, expected) {
  await visit(page, root);
  await page.waitForURL(nextURL + "/login?proximo=%2Fadmin%2Fassinaturas");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  try {
    await page.waitForURL(nextURL + expected);
  } catch {
    assert.fail("Login sintético não chegou à rota esperada: " + new URL(page.url()).pathname);
  }
}

function operation(page, title) {
  return page.locator("details.fa-operation").filter({ has: page.getByText(title, { exact: true }) });
}

async function review(form, page) {
  await form.getByRole("button", { name: "Revisar dados" }).click();
  const dialog = page.getByRole("dialog", { name: "Conferir antes de confirmar" });
  await dialog.waitFor();
  return dialog;
}

async function fillAgreement(form, shopName, plan) {
  await form.locator('[name="plan"]').selectOption(plan);
  await form.locator('[name="amount"]').fill("68,79");
  await form.locator('[name="coverage"]').fill(dateTime());
  await form.locator('[name="first_month"]').fill(competence);
  await form.locator('[name="due"]').fill(dateTime(Date.now() + 7 * 86400000));
  await form.locator('[name="renewal_day"]').fill("15");
  await form.locator('[name="due_day"]').fill("15");
  await form.locator('[name="offset"]').fill("1");
  await form.locator('[name="time"]').fill("10:00");
  await form.locator('[name="zone"]').fill("UTC");
  await form.locator('[name="terms"]').fill("Condições aceitas para " + shopName);
  await form.locator('[name="reference"]').fill("J2E-" + ids());
  await form.locator('[name="reason"]').fill("Contratação manual solicitada no QA");
}

try {
  const denied = await open();
  await login(denied, qa.customer, "/admin/acesso-negado");
  await denied.getByRole("heading", { name: "Acesso financeiro negado" }).waitFor();
  assert.equal((await owner.client.rpc("finance_directory")).error?.code, "42501");
  assert.equal((await owner.client.rpc("finance_overview", { bill_month: invoiceMonth })).error?.code, "42501");
  const inaccessible = await owner.client.from("payments").select("id").eq("barbershop_id", qa.pending.id);
  if (inaccessible.error) assert.equal(inaccessible.error.code, "42501");
  else assert.deepEqual(inaccessible.data, []);
  await denied.context().close();

  const page = await open();
  await login(page, qa.operator, root);
  const managersPage = await open("light");
  await login(managersPage, qa.manager, root);
  // Start a fresh financial document so its CSP observations exclude the login route.
  await visit(managersPage, root);
  await managersPage.getByRole("link", { name: "Operadores" }).click();
  await managersPage.getByRole("heading", { name: "Operadores financeiros" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Operadores" }).count(), 0);
  await visit(page, root + "/operadores");
  await page.waitForURL(nextURL + "/admin/acesso-negado");
  assert.equal((await operator.client.rpc("finance_operator_list")).error?.code, "42501");
  console.log("PASS login and role split, ordinary owner denied app and aggregate RPCs, cross-tenant direct payment read blocked");

  await visit(page, root + "?mes=" + competence);
  const totalsBefore = await call(operator, "finance_overview", { bill_month: invoiceMonth });
  const received = page.locator(".fa-received dd");
  assert.equal(await valueOf(received), formatMoney(totalsBefore.received_cents));
  assert.equal(await valueOf(page.locator(".fa-money .fa-metric").last().locator("dd")), formatMoney(totalsBefore.open_cents));
  assert.equal(totalsBefore.received_cents, Number(sql("select coalesce(sum(amount_cents),0) from public.payments where gateway='manual_pix' and scope='platform_subscription' and status='paid' and competence='" + invoiceMonth + "'")));
  assert.equal(sql("select count(*) from public.payments where barbershop_id in ('" + qa.active.id + "','" + qa.expired.id + "')"), "0");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
  assert.ok(await skip.evaluate(element => document.activeElement === element && getComputedStyle(element).outlineWidth === "2px"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement.id === "finance-main");
  const toggle = page.getByRole("button", { name: /Alternar entre tema/ });
  await toggle.click();
  await page.waitForFunction(() => document.documentElement.classList.contains("light"));

  await visit(page, root + "/barbearias");
  await page.getByRole("textbox", { name: "Início do nome", exact: true }).fill(qa.prefix);
  await page.getByRole("combobox", { name: "Origem", exact: true }).selectOption("trial");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("rowheader", { name: qa.active.name }).waitFor();
  await page.getByRole("row", { name: /Trial encerrado/ }).getByText("Trial expirado", { exact: true }).waitFor();
  assert.equal(await page.getByRole("rowheader", { name: qa.paid.name }).count(), 0);
  const remaining = qa.active.id;
  const trialRow = (await call(operator, "finance_directory", { shop_id: remaining }))[0];
  assert.equal(trialRow.automatic_trial_state, "running");
  const days = trialRow.automatic_trial_days;
  await page.getByRole("row", { name: /Trial vigente/ }).getByText(new RegExp(days + " dia")).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /168\s*(h\b|horas)/i);
  const scroll = page.getByRole("region", { name: "Tabela de barbearias" });
  await scroll.focus();
  assert.ok(await scroll.evaluate(element => getComputedStyle(element).outlineWidth === "2px" && element.scrollWidth > element.clientWidth));
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.activeElement.scrollLeft > 0);

  const paginationPrefix = "Paginação QA " + ids().slice(0, 6);
  sql("insert into public.barbershops(name,slug) select '" + paginationPrefix + " - ' || n,'j2e-page-'||gen_random_uuid() from generate_series(1,22) n");
  await visit(page, root + "/barbearias?nome=" + encodeURIComponent(paginationPrefix));
  assert.equal(await page.getByRole("rowheader").count(), 20);
  await page.getByRole("link", { name: /Próxima página/ }).click();
  await page.getByText("2 barbearias nesta página").waitFor();
  assert.equal(await page.getByRole("rowheader").count(), 2);
  console.log("PASS totals from paid ledger only, focus and theme, global name/origin filter, active/expired days, cursor pagination");

  const trial = await makeShop("Conversão antecipada QA", { trial: true, elapsedHours: 160 });
  sql("insert into public.barbers(barbershop_id,name) values('" + trial.id + "','Profissional A'),('" + trial.id + "','Profissional B')");
  await visit(page, pathFor(trial.id));
  await page.getByRole("region", { name: "Trial automático" }).getByText("Último dia · 1 dia restante", { exact: true }).waitFor();
  const form = operation(page, "Aplicar assinatura manual");
  await form.getByText(/encerra o período grátis imediatamente/).waitFor();
  const impacts = form.getByRole("checkbox", { name: /bloquear imediatamente novos agendamentos/ });
  await fillAgreement(form, trial.name, planId("basico"));
  await form.getByRole("button", { name: "Revisar dados" }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await impacts.check();
  let dialog = await review(form, page);
  assert.equal(await dialog.getByRole("heading").evaluate(element => element === document.activeElement), true);
  await capture(page, "revisao-acordo");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("Revisar dados"));
  assert.equal(await form.locator('[name="amount"]').inputValue(), "68,79");
  dialog = await review(form, page);
  await dialog.getByRole("button", { name: "Confirmar operação" }).click();
  await dialog.getByRole("alert").getByText(/equipe ativa excede o limite/).waitFor();
  const contractCount = "select count(*) from public.subscriptions where agreement_at is not null and barbershop_id='" + trial.id + "'";
  assert.equal(sql(contractCount), "0");
  await dialog.getByRole("button", { name: "Voltar aos dados" }).click();
  await form.locator('[name="plan"]').selectOption(planId("premium"));
  // Refresh the proposed start to the database's current minute after review.
  await form.locator('[name="coverage"]').fill(dateTime());
  dialog = await review(form, page);
  await dialog.getByRole("button", { name: "Confirmar operação" }).dblclick();
  await page.getByText("Conversão aguarda conferência do Pix").waitFor();
  assert.equal(sql(contractCount), "1");
  assert.equal(sql(method("agreement") + "'" + trial.id + "'"), "1");
  assert.equal(sql("select private.booking_access_at('" + trial.id + "',now())->>'allowed'"), "false");
  assert.equal(sql("select count(*) from public.payments where barbershop_id='" + trial.id + "'"), "0");
  assert.equal((await call(operator, "finance_overview", { bill_month: invoiceMonth })).received_cents, totalsBefore.received_cents);
  const contract = sql("select id from public.subscriptions where agreement_at is not null and barbershop_id='" + trial.id + "'");
  console.log("PASS required warning and confirmation, focus return and draft, capacity rollback, single early conversion, no invoice or receipt from agreement");

  const issue = operation(page, "Emitir mensalidade");
  await issue.getByText("Emitir mensalidade", { exact: true }).click();
  await issue.locator('[name="month"]').fill(competence);
  dialog = await review(issue, page);
  await dialog.getByRole("button", { name: "Confirmar operação" }).click();
  await page.locator('article.fa-record .fa-badge[data-state="pending"]').waitFor();
  const invoice = sql("select id from public.payments where subscription_id='" + contract + "'");
  assert.equal(sql("select amount_cents from public.payments where id='" + invoice + "'"), "6879");
  assert.equal((await call(operator, "finance_overview", { bill_month: invoiceMonth })).received_cents, totalsBefore.received_cents);

  const pix = operation(page, "Conferir Pix");
  await pix.getByText("Conferir Pix", { exact: true }).click();
  await pix.locator('[name="amount"]').fill("1,00");
  await pix.locator('[name="credit"]').fill(dateTime());
  await pix.locator('[name="reference"]').fill("j2e-" + ids());
  await pix.getByRole("checkbox").check();
  await pix.getByRole("button", { name: "Revisar dados" }).click();
  await pix.getByRole("alert").getByText(/valor integral exigível/).waitFor();
  assert.equal(await pix.locator('[name="amount"]').getAttribute("aria-invalid"), "true");
  assert.equal(sql("select status from public.payments where id='" + invoice + "'"), "pending");
  await pix.locator('[name="amount"]').fill("68,79");
  dialog = await review(pix, page);
  await capture(page, "revisao-pix");
  await dialog.getByRole("button", { name: "Confirmar operação" }).click();
  await page.getByText("Convertido com Pix conferido", { exact: true }).waitFor();
  assert.equal(sql("select status from public.payments where id='" + invoice + "'"), "paid");
  assert.equal(sql("select private.booking_access_at('" + trial.id + "',now())->>'allowed'"), "true");
  const duplicate = await operator.client.rpc("finance_confirm_pix", {
    op: ids(), shop: trial.id, contract, invoice, received_cents: 6879, credited_at: new Date().toISOString(), checked: true,
  });
  assert.equal(duplicate.error?.code, "55000");
  assert.equal((await call(operator, "finance_overview", { bill_month: invoiceMonth })).received_cents, totalsBefore.received_cents + 6879);
  console.log("PASS manual issuance, wrong amount rejected with focus, manual Pix, duplicate rejected, coverage released and revenue correct");

  const contractForm = operation(page, "Administrar contrato");
  for (const [command, state, suspended] of [["suspend", "active", "t"], ["resume", "active", "f"], ["cancel", "canceled", "f"]]) {
    const summary = contractForm.getByText("Administrar contrato", { exact: true });
    if (!await contractForm.evaluate(element => element.open)) await summary.click();
    await contractForm.getByRole("button", { name: "Nova operação" }).click({ timeout: 350 }).catch(() => {});
    await contractForm.locator('[name="command"]').selectOption(command);
    await contractForm.locator('[name="reason"]').fill("Decisão financeira QA " + command);
    dialog = await review(contractForm, page);
    await dialog.getByRole("button", { name: "Confirmar operação" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(sql("select s.status||'|'||coalesce(h.suspended,false)::text from public.subscriptions s left join private.financial_holds h on h.contract=s.id where s.id='" + contract + "'"), state + "|" + (suspended === "t"));
  }
  assert.equal(sql("select status||'|'||amount_cents from public.payments where id='" + invoice + "'"), "paid|6879");
  await page.getByRole("link", { name: "Consultar histórico completo" }).click();
  await page.getByRole("heading", { name: "Histórico financeiro" }).waitFor();
  await page.getByText("Decisão financeira QA cancel", { exact: true }).waitFor();
  await page.getByText(operator.id, { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: /Editar|Excluir/i }).count(), 0);
  console.log("PASS suspension, resume and cancellation, paid amount retained, journal displays actor and reason read-only");

  const concurrent = await makeShop("Acordos concorrentes QA");
  const results = await Promise.all([operator, manager].map(account => account.client.rpc("finance_agreement", {
    op: ids(), shop: concurrent.id, reference: "J2E concorrência", reason: "Teste local de concorrência", terms: terms(5451),
  })));
  assert.equal(results.filter(result => result.data).length, 1);
  assert.ok(["55000", "23505"].includes(results.find(result => result.error).error.code));
  assert.equal(sql("select count(*) from public.subscriptions where agreement_at is not null and barbershop_id='" + concurrent.id + "'"), "1");
  assert.deepEqual(await page.evaluate(() => window.financeViolations), []);
  assert.deepEqual(await managersPage.evaluate(() => window.financeViolations), []);
  assert.deepEqual(problems, []);
  console.log("PASS concurrent authorized agreement, one commit, zero CSP violations and page errors");
} finally {
  await browser.close();
}
