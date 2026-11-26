// Run only on a disposable loopback QA stack. Never emit cookies or mail tokens.
import assert from "node:assert/strict";
import { measureTrialPages } from "./automatic-premium-benchmark.mjs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { browserCookies } from "./j2c-fixture.mjs";
import { ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const mail = "http://127.0.0.1:" + (process.env.J2B_QA_MAIL_PORT ?? "59324");
assert.match(mail, /^http:\/\/127\.0\.0\.1:59\d{3}$/);
const out = resolve(process.argv[2] ?? "docs/qa-trial-premium/screenshots");
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const problems = [];
const offer = "Crie sua conta e ganhe 7 dias grátis.";
const cta = "Começar meus 7 dias grátis";
const expiry = "Seu período gratuito terminou. Escolha um plano para continuar utilizando o LPS Agenda.";

async function open({ actor, width = 1280, theme = "light", reducedMotion = "reduce" } = {}) {
  const context = await browser.newContext({
    colorScheme: theme, reducedMotion, locale: "pt-BR",
    viewport: { width, height: width === 375 ? 844 : 940 },
  });
  if (actor) await context.addCookies(browserCookies(actor));
  await context.addInitScript(mode => {
    localStorage.setItem("theme", mode);
    window.qaCspViolations = [];
    document.addEventListener("securitypolicyviolation", e => window.qaCspViolations.push(e.violatedDirective));
  }, theme);
  await context.route("**/*", route => {
    if ([nextURL, api].includes(new URL(route.request().url()).origin)) return route.continue();
    problems.push("unexpected origin");
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", () => problems.push("uncaught page error"));
  page.on("console", message => {
    if (/violates? the following Content Security Policy|content security policy directive/i.test(message.text())) {
      problems.push("CSP violation");
    }
  });
  return { context, page };
}

async function visit(page, path) {
  const response = await page.goto(nextURL + path);
  assert.ok(response?.ok(), path);
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  return response;
}

async function confirmMail(page, recipient) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const list = await (await fetch(mail + "/api/v1/messages")).json();
    for (const record of list.messages.filter(record => record.To?.some(to => to.Address === recipient))) {
      const messageURL = mail + "/api/v1/message/" + encodeURIComponent(record.ID);
      const message = await (await fetch(messageURL)).json();
      const candidates = ((message.HTML ?? "") + " " + (message.Text ?? "")).match(/http:\/\/[^\s"'<>]+/g) ?? [];
      const verify = candidates.map(value => new URL(value.replaceAll("&amp;", "&")))
        .find(url => url.origin === api && url.pathname === "/auth/v1/verify" && url.searchParams.get("type") === "signup");
      if (!verify) continue;
      try {
        await page.goto(verify.href);
        await page.waitForURL(nextURL + "/onboarding", { timeout: 8000 });
      } catch {
        assert.fail("Synthetic confirmation did not complete routing to onboarding");
      }
      return;
    }
    await pause(200);
  }
  assert.fail("Missing synthetic signup mail in Mailpit");
}

async function createTrial(actor, name) {
  const slug = "trial-qa-" + ids().slice(0, 12);
  const { data: shop, error } = await actor.client.rpc("create_barbershop", { p_name: name, p_slug: slug });
  assert.ifError(error);
  return { shop, slug };
}

function phase(enabled) {
  sql("update private.automatic_premium_trial_activation set enabled=" + String(enabled));
}

const benchmark = process.env.TRIAL_QA_BENCHMARK === "true";
try {
  assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
  assert.equal(sql("select enabled from private.automatic_premium_trial_activation"), "f");
  await startNext(false);

  const { context, page } = await open({ width: 375, theme: "light" });
  await visit(page, "/");
  assert.equal(await page.getByRole("link", { name: cta }).count(), 0);
  assert.doesNotMatch(await page.locator("body").innerText(), /\b168\s*(?:h\b|horas\b)/i);
  phase(true);
  for (const route of ["/", "/cadastro", "/barbearia/barbearia-aurora"]) {
    await visit(page, route);
    await page.getByRole(route === "/cadastro" ? "button" : "link", { name: cta, exact: true }).first().waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /\b168\s*(?:h\b|horas\b)/i);
  }
  console.log("PASS disabled copy, enabled landing, plans, signup and demo, strict CSP");

  const email = "trial-" + ids().slice(0, 12) + "@example.test";
  const password = ids() + "Qa1!";
  await visit(page, "/cadastro");
  await page.getByRole("heading", { name: offer }).waitFor();
  await page.getByLabel("Nome completo", { exact: true }).fill("Ana Ribeiro");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /li e aceito/i }).check();
  await page.getByRole("button", { name: cta }).click();
  await page.getByRole("heading", { name: "Confira seu e-mail" }).waitFor();
  assert.equal(sql("select count(*) from auth.users where email='" + email + "' and email_confirmed_at is null"), "1");
  assert.equal(sql("select count(*) from private.automatic_premium_trials t join auth.users u on t.owner_id=u.id where u.email='" + email + "'"), "0");
  await confirmMail(page, email);
  await page.getByText(/seus 7 dias grátis no Premium começam ao concluir/i).waitFor();
  const name = "Barbearia Aurora QA";
  const slug = "aurora-qa-" + ids().slice(0, 8);
  await page.getByLabel("Nome da barbearia").fill(name);
  await page.waitForFunction(() => document.querySelector("#slug").value === "barbearia-aurora-qa");
  await page.getByLabel("Identificador").fill(slug);
  assert.equal(await page.getByLabel("Identificador").inputValue(), slug);
  await page.getByRole("button", { name: "Criar barbearia e continuar" }).click();
  try {
    await page.waitForURL(nextURL + "/dashboard", { timeout: 10_000 });
  } catch {
    const messages = await page.locator('[role="alert"], [id$="-feedback"]').allTextContents();
    assert.fail("Onboarding did not reach dashboard: " + new URL(page.url()).pathname + " " + messages.join("; "));
  }
  const dialog = page.getByRole("dialog", { name: "Bem-vindo ao LPS Agenda!" });
  await dialog.waitFor();
  await dialog.getByText("Você ganhou 7 dias grátis").waitFor();
  const explore = dialog.getByRole("button", { name: "Começar a explorar" });
  assert.ok(await explore.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.ok(await explore.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("Planos e contratação"));
  const greeting = page.getByRole("heading", { name: "Você está experimentando o plano Premium" });
  await greeting.waitFor();
  await page.getByRole("progressbar", { name: "Percentual do período grátis já utilizado" }).waitFor();
  await page.getByText("Você ainda tem 7 dias grátis.", { exact: true }).waitFor();
  const [shop, owner, start, end, plan, payments, platform] = sql([
    "select b.id,t.owner_id,t.started_at,t.ends_at,p.code,",
    "(select count(*) from public.payments where barbershop_id=b.id),",
    "(select count(*) from public.subscriptions where barbershop_id=b.id)",
    "from private.automatic_premium_trials t join public.barbershops b on b.id=t.shop_id",
    "join public.plans p on p.id=t.plan_id where b.slug='" + slug + "'",
  ].join(" ")).split("|");
  assert.ok(shop && owner);
  assert.equal(Date.parse(end) - Date.parse(start), 604_800_000);
  assert.deepEqual([plan, payments, platform], ["premium", "0", "1"]);
  console.log("PASS real signup, Mailpit confirmation, onboarding, seven days and no payment");

  await visit(page, "/dashboard/plano");
  await page.getByRole("heading", { name: "Premium", exact: true }).waitFor();
  assert.equal(await page.locator("#contratacao-manual").count(), 1);
  await visit(page, "/dashboard");
  await greeting.waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await context.clearCookies();
  await visit(page, "/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(nextURL + "/dashboard");
  await greeting.waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(sql("select ends_at from private.automatic_premium_trials where shop_id='" + shop + "'"), end);
  console.log("PASS keyboard focus, Escape and focus return, reload and relogin keep one welcome and original deadline");

  const [staff, outsider, financier] = await Promise.all([session(), session(), session()]);
  sql("insert into public.barbershop_members(barbershop_id,user_id,role) values ('" + shop + "','" + staff.id + "','staff')");
  sql("insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values ('" + financier.id + "','operator',session_user,'Synthetic UI regression')");
  for (const actor of [staff, outsider]) {
    assert.equal((await actor.client.rpc("get_owner_automatic_trial", { p_shop: shop })).error?.code, "42501");
    assert.equal((await actor.client.rpc("claim_automatic_trial_welcome", { p_shop: shop })).error?.code, "42501");
    assert.equal((await actor.client.rpc("finance_directory", { shop_id: shop })).error?.code, "42501");
  }
  const staffView = await open({ actor: staff });
  await visit(staffView.page, "/dashboard");
  assert.equal(await staffView.page.getByRole("heading", { name: "Você está experimentando o plano Premium" }).count(), 0);
  const financeView = await open({ actor: financier });
  await visit(financeView.page, "/admin/assinaturas/barbearias/" + shop);
  await financeView.page.getByText("Trial automático", { exact: true }).first().waitFor();
  await financeView.page.getByText(/confirmação encerra o período grátis imediatamente/).waitFor();
  await financeView.context.close();
  console.log("PASS financial operator view, downgrade and booking warning, staff and other tenant RPC isolation");

  const professional = ids(), service = ids(), customer = ids(), appointment = ids();
  sql([
    "insert into public.barbers(id,barbershop_id,name) values ('" + professional + "','" + shop + "','Rafael QA');",
    "insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values ('" + service + "','" + shop + "','Corte QA',30,5000);",
    "insert into public.barber_services(barbershop_id,barber_id,service_id) values ('" + shop + "','" + professional + "','" + service + "');",
    "insert into public.customers(id,barbershop_id,full_name) values ('" + customer + "','" + shop + "','Cliente QA');",
    "insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) select '" + shop + "',d,'09:00','19:00' from generate_series(0,6)d;",
    "insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) select '" + shop + "','" + professional + "',d,'09:00','19:00' from generate_series(0,6)d;",
    "insert into public.appointments(id,barbershop_id,customer_id,barber_id,service_id,starts_at,ends_at,status,price_cents,created_by) values ('" +
      [appointment, shop, customer, professional, service].join("','") +
      "',(((now() at time zone 'America/Sao_Paulo')::date+1)+time '10:00') at time zone 'America/Sao_Paulo'," +
      "(((now() at time zone 'America/Sao_Paulo')::date+1)+time '10:30') at time zone 'America/Sao_Paulo','scheduled',5000,'" + owner + "');",
  ].join("\n"));
  await visit(page, "/agendar/" + slug);
  await page.getByRole("heading", { name, exact: true }).waitFor();

  // Time-travel only on the local fixture through Postgres, never via Data API.
  sql([
    "begin;",
    "update private.automatic_premium_trials set started_at=transaction_timestamp()-interval '169 hours',ends_at=transaction_timestamp()-interval '1 hour',welcomed_at=null where shop_id='" + shop + "';",
    "update public.subscriptions set trial_started_at=transaction_timestamp()-interval '169 hours',trial_ends_at=transaction_timestamp()-interval '1 hour' where barbershop_id='" + shop + "';",
    "commit;",
  ].join("\n"));
  await visit(page, "/agendar/" + slug);
  await page.getByRole("heading", { name: "Agendamentos temporariamente indisponíveis" }).waitFor();
  await visit(page, "/dashboard");
  await page.getByText(expiry, { exact: true }).waitFor();
  await page.getByRole("link", { name: "Planos e contratação" }).click();
  await page.waitForURL(url => url.pathname === "/dashboard/plano");
  await page.getByRole("heading", { name: "Premium", exact: true }).waitFor();
  await visit(staffView.page, "/dashboard/agenda");
  await staffView.page.getByRole("heading", { name: "Agenda diária", exact: true }).waitFor();
  await staffView.context.close();
  assert.equal(sql("select (select count(*) from public.barbers where id='" + professional +
    "'), (select count(*) from public.services where id='" + service +
    "'), (select count(*) from public.customers where id='" + customer +
    "'), (select count(*) from public.appointments where id='" + appointment +
    "'), (select count(*) from public.payments where barbershop_id='" + shop + "')"), "1|1|1|1|0");
  assert.deepEqual(await page.evaluate(() => window.qaCspViolations), []);
  await context.close();
  console.log("PASS actual public booking before/after expiry, staff agenda, plan access, records preserved and no automatic invoice");

  for (const width of [375, 768, 1280, 1920]) {
    for (const theme of ["light", "dark"]) {
      const actor = await session();
      const fixture = await createTrial(actor, "Barbearia Aurora QA");
      sql("update public.profiles set full_name='Ana Ribeiro · QA' where id='" + actor.id + "'");
      const visual = await open({ actor, width, theme });
      const page = visual.page;
      await visit(page, "/dashboard");
      await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
      await page.evaluate(() => document.fonts.ready);
      const welcome = page.getByRole("dialog", { name: "Bem-vindo ao LPS Agenda!" });
      await welcome.waitFor();
      assert.ok(await welcome.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.x >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight &&
          getComputedStyle(el).animationName === "none";
      }));
      await page.screenshot({ path: resolve(out, "modal-" + width + "-" + theme + ".png") });
      await welcome.getByRole("button", { name: "Começar a explorar" }).click();
      await welcome.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "Você está experimentando o plano Premium" }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(await page.evaluate(() => window.qaCspViolations), []);
      await page.screenshot({ path: resolve(out, "aviso-" + width + "-" + theme + ".png") });
      await visual.context.close();
      assert.equal(sql("select count(*) from private.automatic_premium_trials where shop_id='" + fixture.shop + "' and welcomed_at is not null"), "1");
      console.log("PASS screenshot pair, strict CSP and reduced motion " + width + " " + theme);
    }
  }
  assert.deepEqual(problems, []);
  if (benchmark) {
    for (const state of ["enabled", "disabled"]) {
      phase(state === "enabled");
      for (const result of await measureTrialPages(nextURL)) {
        console.log("BENCH " + state + " " + JSON.stringify(result));
      }
    }
  }
} finally {
  phase(false);
  await browser.close();
  await stopNext();
}
