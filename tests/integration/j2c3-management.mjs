// Local-only integration for the four redesigned screens.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { action, ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";
import { browserCookies } from "./j2c-fixture.mjs";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const [owner, staff, outsider, payOwner, operator] = await Promise.all(Array.from({ length: 5 }, () => session()));
const foreign = ids();
let shop, paidShop;
const stateEvidence = process.env.C3_QA_STATES;
if (stateEvidence) await mkdir(stateEvidence, { recursive: true });
async function snapshot(page, state) {
  if (stateEvidence) await page.screenshot({ path: join(stateEvidence, state + ".png"), fullPage: true });
}

async function open(actor) {
  const context = await browser.newContext({ viewport: { width: 375, height: 844 }, reducedMotion: "reduce" });
  await context.addCookies(browserCookies(actor));
  await context.route("**/*", route => [nextURL, api].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.c3Csp = [];
    document.addEventListener("securitypolicyviolation", event => window.c3Csp.push(event.violatedDirective));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  return page;
}

function screen(page) {
  return page.locator("main:visible");
}

async function visit(page, path) {
  const response = await page.goto(nextURL + path);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  assert.equal(new URL(page.url()).pathname, path.split("?")[0]);
  await screen(page).locator(".j2-c3").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.doesNotMatch(await screen(page).locator(".j2-c3").innerText(), /\b168\s*(?:h\b|horas\b)/i);
}

try {
  assert.equal(sql("select enabled from private.automatic_premium_trial_activation"), "f");
  try {
    sql("update private.automatic_premium_trial_activation set enabled=true where singleton");
    for (const actor of [owner, payOwner]) {
      const { data, error } = await actor.client.rpc("create_barbershop", {
        p_name: "Barbearia Central QA", p_slug: "c3-" + ids().slice(0, 12),
      });
      assert.ifError(error);
      if (actor === owner) shop = data;
      else paidShop = data;
    }
  } finally {
    sql("update private.automatic_premium_trial_activation set enabled=false where singleton");
  }

  const barber = ids(), service = ids(), customer = ids();
  sql([
    "insert into public.barbershops(id,name,slug) values ('" + foreign + "','Outro tenant QA','qa-" + foreign + "');",
    "insert into public.barbershop_members(barbershop_id,user_id,role) values ('" + shop + "','" + staff.id + "','staff'),('" + foreign + "','" + outsider.id + "','owner');",
    "insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values ('" + operator.id + "','operator',session_user,'QA C3');",
    "insert into public.barbers(id,barbershop_id,name) values ('" + barber + "','" + shop + "','Rafael QA');",
    "insert into public.barbers(barbershop_id,name) select '" + shop + "','Profissional QA '||n from generate_series(2,6)n;",
    "insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values ('" + service + "','" + shop + "','Corte QA',30,6200);",
    "insert into public.barber_services(barbershop_id,barber_id,service_id) values ('" + shop + "','" + barber + "','" + service + "');",
    "insert into public.customers(id,barbershop_id,full_name) values ('" + customer + "','" + shop + "','Cliente QA');",
    "insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) select '" + shop + "',n,'09:00','18:00' from generate_series(0,6)n;",
    "insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) select '" + shop + "','" + barber + "',n,'09:00','18:00' from generate_series(0,6)n;",
    "insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,status,price_cents,created_by)" +
      " select '" + [shop,barber,service,customer].join("','") + "',d,d+interval '30 minutes','completed',6200,'" + owner.id +
      "' from (select (((now() at time zone 'America/Sao_Paulo')::date)+time '10:00') at time zone 'America/Sao_Paulo' as d) q;",
    "update public.services set price_cents=8900 where id='" + service + "';",
    "insert into public.payments(barbershop_id,scope,amount_cents,status,method,paid_at) values" +
      " ('" + shop + "','shop_service',12345,'paid','pix',now()),('" + foreign + "','shop_service',90812,'paid','cash',now());",
    "insert into public.payments(barbershop_id,scope,amount_cents,status,method,created_at,paid_at)" +
      " values ('" + shop + "','shop_service',2700,'paid','pix',now()-interval '1 month',now()-interval '1 month');",
  ].join("\n"));

  await startNext(false);
  const page = await open(owner);
  await visit(page, "/dashboard/financeiro");
  const modal = page.getByRole("dialog", { name: "Bem-vindo ao LPS Agenda!" });
  await modal.waitFor();
  await page.keyboard.press("Escape");
  await screen(page).getByText("R$ 123,45", { exact: false }).first().waitFor();
  await page.getByRole("region", { name: "Atendimentos concluídos" }).getByText(/62,00/).waitFor();
  assert.doesNotMatch(await screen(page).locator(".j2-c3").innerText(), /89,00|908,12/);
  await page.getByRole("link", { name: "Mês anterior" }).focus();
  assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle === "solid"));
  await page.keyboard.press("Enter");
  await page.waitForURL("**/financeiro?periodo=anterior");
  await screen(page).getByText(/27,00/).first().waitFor();
  assert.doesNotMatch(await screen(page).locator(".j2-c3").innerText(), /123,45/);
  const outsiderPage = await open(outsider);
  await visit(outsiderPage, "/dashboard/financeiro?periodo=anterior");
  await screen(outsiderPage).getByText("Nenhum pagamento de serviço neste período").waitFor();
  const staffPage = await open(staff);
  for (const route of ["financeiro", "plano", "configuracoes"]) {
    await staffPage.goto(nextURL + "/dashboard/" + route);
    await staffPage.waitForURL(url => url.origin === nextURL && url.pathname === "/dashboard" && url.searchParams.get("acesso") === "restrito");
  }
  console.log("PASS finance periods, stored historical price, empty state, owner/staff and tenant isolation");

  await visit(page, "/dashboard/configuracoes");
  const name = screen(page).getByLabel("Nome da barbearia", { exact: true });
  await name.fill("");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.locator("#name[aria-invalid=true]").waitFor();
  assert.equal(await name.getAttribute("aria-describedby"), "name-error");
  await name.fill("Barbearia atualizada QA");
  await screen(page).getByLabel("Cidade", { exact: true }).fill("São Paulo");
  await screen(page).getByLabel("Estado (UF)", { exact: true }).fill("SP");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await screen(page).getByText("Dados da barbearia atualizados.").waitFor();
  assert.equal(sql("select name from public.barbershops where id='" + shop + "'"), "Barbearia atualizada QA");
  const staffAttempt = await action(staff, "updateBarbershopAction", [{ name: "QA não autorizado", city: "", state: "", phone: "", description: "" }], "/dashboard/configuracoes");
  assert.match(staffAttempt.body, /Somente o proprietário/);
  assert.deepEqual(await page.evaluate(() => window.c3Csp), []);
  console.log("PASS settings inline validation, save, explicit staff denial and strict CSP");

  await visit(page, "/dashboard/plano");
  await screen(page).getByText("Você ainda tem 7 dias grátis.").waitFor();
  await screen(page).getByText(/registro confirmado do acordo encerra o período grátis imediatamente/).waitFor();
  await screen(page).getByText(/Para contratar Básico, ajuste a equipe/).waitFor();
  await screen(page).getByText(/Para contratar Profissional, ajuste a equipe/).waitFor();
  assert.match(await screen(page).locator(".j2-c3").innerText(), /49,90/);
  assert.match(await screen(page).locator(".j2-c3").innerText(), /119,90/);
  await snapshot(page, "trial-ativo");

  function trialEnd(expression) {
    sql([
      "begin;",
      "update private.automatic_premium_trials set started_at=(" + expression + ")-interval '168 hours',ends_at=(" + expression + "),welcomed_at=null where shop_id='" + shop + "';",
      "update public.subscriptions set trial_started_at=(" + expression + ")-interval '168 hours',trial_ends_at=(" + expression + ") where barbershop_id='" + shop + "';",
      "commit;",
    ].join("\n"));
  }
  trialEnd("least(transaction_timestamp()+interval '5 minutes',((transaction_timestamp() at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo' - interval '1 millisecond')");
  await visit(page, "/dashboard/plano");
  await screen(page).getByText(/Hoje é o último dia/).waitFor();
  trialEnd("transaction_timestamp()-interval '1 hour'");
  await visit(page, "/dashboard/plano");
  await screen(page).getByText("Seu período gratuito terminou. Escolha um plano para continuar utilizando o LPS Agenda.").waitFor();
  await page.getByRole("heading", { name: "Contratação manual" }).waitFor();
  await snapshot(page, "trial-expirado");
  assert.equal(sql("select count(*) from public.payments where scope='platform_subscription' and barbershop_id='" + shop + "'"), "0");

  const plan = sql("select id from public.plans where code='basico'");
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const terms = {
    plan_id: plan,
    monthly_cents: 5317, currency: "BRL", terms: "QA conversão",
    coverage_start: new Date().toISOString(), first_month: month,
    first_due: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    renewal_day: 15, due_day: 15, due_month_offset: 1, due_time: "10:00", zone: "UTC",
  };
  const agreement = { op: ids(), shop: paidShop, terms, reference: "qa-c3", reason: "QA conversão" };
  assert.equal((await operator.client.rpc("finance_agreement", agreement)).error?.code, "LP033");
  agreement.terms.booking_impact_accepted = true;
  const agreed = await operator.client.rpc("finance_agreement", agreement);
  assert.ifError(agreed.error);
  assert.equal(agreed.data.state, "pending");
  const contract = agreed.data.contract;
  const paidPage = await open(payOwner);
  await visit(paidPage, "/dashboard/plano");
  await screen(paidPage).getByText(/53,17/).waitFor();
  const invoice = await operator.client.rpc("finance_invoice", { op: ids(), shop: paidShop, contract, competence: month });
  assert.ifError(invoice.error);
  const verified = await operator.client.rpc("finance_confirm_pix", {
    op: ids(), shop: paidShop, contract, invoice: invoice.data.invoice, received_cents: 5317,
    credited_at: new Date().toISOString(), checked: true, reference: "qa-c3-" + ids(),
  });
  assert.ifError(verified.error);
  await visit(paidPage, "/dashboard/plano");
  await screen(paidPage).getByText("Cobertura paga").waitFor();
  await snapshot(paidPage, "assinatura-paga");
  console.log("PASS active, last day, expired, team incompatibility, early conversion consent and verified paid coverage");
} finally {
  await browser.close();
  await stopNext();
}
