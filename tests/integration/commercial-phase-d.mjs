// Local-only. local-next-qa verifies the disposable Docker ID and loopback ports.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  action,
  admin,
  ids,
  nextURL,
  session,
  sql,
  startNext,
  stopNext,
} from "./local-next-qa.mjs";

const { chromium } = await import(
  pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href
);
const browser = await chromium.launch({
  executablePath: process.env.C2_QA_CHROME,
  headless: true,
});
const snapshots = process.env.PHASE_D_QA_SCREENSHOTS;
const issues = [];
const commercialNumber = "12025550123"; // Fictional NANP number, used only by the local QA server.
const planRoute = "/dashboard/plano";
const finance = "/admin/assinaturas";
const planCodes = ["Básico", "Profissional", "Premium"];
const prices = /R\$\s*(49,90|79,90|119,90)/;
const normalized = (s) => s.replaceAll("\u00a0", " ");
const fingerprint = () =>
  sql(
    "select (select count(*) from public.subscriptions), (select count(*) from public.payments), (select count(*) from private.financial_operators), (select count(*) from private.manual_trial_intents), (select enabled from private.manual_trial_activation)",
  );
async function openTab(actor) {
  const context = await browser.newContext({
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "wa.me")
      return route.fulfill({ status: 200, body: "Local link interception" });
    if (![nextURL, process.env.NEXT_PUBLIC_SUPABASE_URL].includes(u.origin)) {
      issues.push("Unexpected external request: " + u.hostname);
      return route.abort();
    }
    return route.continue();
  });
  if (actor)
    await context.addCookies(
      actor
        .cookies()
        .split("; ")
        .map((pair) => {
          const i = pair.indexOf("=");
          return {
            name: pair.slice(0, i),
            value: pair.slice(i + 1),
            url: nextURL,
          };
        }),
    );
  const page = await context.newPage();
  page.on("pageerror", (error) => issues.push(error.message));
  return page;
}
async function visit(page, path) {
  const res = await page.goto(nextURL + path, { waitUntil: "networkidle" });
  assert.ok(res?.ok(), path);
  assert.equal(new URL(page.url()).pathname, path);
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Serviço financeiro indisponível|Algo deu errado|Application error/i,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    path + " horizontal overflow",
  );
}
async function picture(page, name) {
  if (snapshots)
    await page.screenshot({ path: join(snapshots, name + ".png") });
}
async function restartWithNumber(number) {
  process.env.LPS_COMMERCIAL_WHATSAPP = number;
  await startNext(false);
}
try {
  if (snapshots) await mkdir(snapshots, { recursive: true });
  const [owner, manual, trial, legacy, manager, staff, operator] =
    await Promise.all(Array.from({ length: 7 }, () => session()));
  const [emptyShop, manualShop, trialShop, oldShop] = [
    ids(),
    ids(),
    ids(),
    ids(),
  ];
  const plan = sql("select id from public.plans where code='basico'");
  const oldContract = ids();
  const firstContractShop = ids();
  sql(`insert into public.barbershops(id,name,slug) values
    ('${firstContractShop}','QA Primeira assinatura','qa-${firstContractShop}'),
    ('${emptyShop}','QA Nova','qa-${emptyShop}'),('${manualShop}','QA Acordo','qa-${manualShop}'),
    ('${trialShop}','QA Teste','qa-${trialShop}'),('${oldShop}','QA Legado','qa-${oldShop}');
    insert into public.barbershop_members(barbershop_id,user_id,role) values
    ('${emptyShop}','${owner.id}','owner'),('${manualShop}','${manual.id}','owner'),
    ('${manualShop}','${staff.id}','staff'),('${trialShop}','${trial.id}','owner'),('${oldShop}','${legacy.id}','owner');
    insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values
    ('${manager.id}','manager',session_user,'QA local D'),('${operator.id}','operator',session_user,'QA local D');
    insert into public.subscriptions(id,barbershop_id,plan_id,status,gateway_subscription_id,contracted_price_cents)
    values('${oldContract}','${oldShop}','${plan}','active','qa-${oldContract}',6379);
    insert into public.payments(barbershop_id,subscription_id,scope,amount_cents,status,method,paid_at,gateway_payment_id)
    values('${oldShop}','${oldContract}','platform_subscription',4123,'paid','boleto',now(),'qa-${oldContract}');
    insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,trial_started_at,trial_ends_at)
    values ('${manualShop}','${plan}','manual_pix','inactive','trialing','uncontracted','2019-01-01Z','2019-01-08Z'),
    ('${trialShop}','${plan}','manual_pix','inactive','trialing','uncontracted',now(),now()+interval '168 hours');`);
  await restartWithNumber("");
  const month = new Date().toISOString().slice(0, 7),
    first = month + "-01T00:00";
  const fixture = await action(
    manager,
    "submitFinancialOperation",
    [
      {
        kind: "agreement",
        bookingImpactAccepted: true,
        op: ids(),
        confirmed: true,
        shop: manualShop,
        plan,
        amount: "43,21",
        coverage: first,
        first_month: month,
        due: first,
        renewal_day: "1",
        due_day: "1",
        offset: "0",
        time: "00:00",
        zone: "UTC",
        terms: "QA local",
        reference: "QA",
        reason: "Fixture de homologação",
      },
    ],
    finance,
  );
  assert.match(fixture.body, /Contrato registrado com sucesso/);
  const firstManual = await action(
    manager,
    "submitFinancialOperation",
    [
      {
        kind: "agreement",
        bookingImpactAccepted: true,
        op: ids(),
        confirmed: true,
        shop: firstContractShop,
        plan,
        amount: "43,21",
        coverage: first,
        first_month: month,
        due: first,
        renewal_day: "1",
        due_day: "1",
        offset: "0",
        time: "00:00",
        zone: "UTC",
        terms: "QA primeira contratação",
        reference: "QA novo contrato",
        reason: "Sem assinatura anterior",
      },
    ],
    finance,
  );
  assert.match(firstManual.body, /Contrato registrado com sucesso/);
  assert.equal(
    sql(`select status || ':' || gateway from public.subscriptions where barbershop_id='${firstContractShop}' and agreement_at is not null`),
    "pending:manual_pix",
  );
  const liveTrialAgreement = await action(
    manager,
    "submitFinancialOperation",
    [
      {
        kind: "agreement",
        bookingImpactAccepted: true,
        op: ids(),
        confirmed: true,
        shop: trialShop,
        plan,
        amount: "43,21",
        coverage: first,
        first_month: month,
        due: first,
        renewal_day: "1",
        due_day: "1",
        offset: "0",
        time: "00:00",
        zone: "UTC",
        terms: "QA conversão segura",
        reference: "QA trial ativo",
        reason: "Aguardando o fim do trial",
      },
    ],
    finance,
  );
  assert.match(liveTrialAgreement.body, /teste ainda válido/i);
  assert.equal(
    sql(`select status from public.subscriptions where barbershop_id='${trialShop}' and gateway='manual_pix'`),
    "trialing",
  );
  const agreementId = sql(
    `select id from public.subscriptions where barbershop_id='${manualShop}' and agreement_at is not null`,
  );
  const monthly = await action(
    manager,
    "submitFinancialOperation",
    [
      {
        kind: "invoice",
        op: ids(),
        confirmed: true,
        shop: manualShop,
        contract: agreementId,
        month,
      },
    ],
    finance,
  );
  assert.match(monthly.body, /Mensalidade registrada/);
  const projection = await manual.client.rpc("get_owner_manual_trial", {
    p_shop: manualShop,
  });
  assert.ifError(projection.error);
  assert.equal(projection.data.agreement.monthly_cents, 4321);
  assert.ok(projection.data.agreement.outstanding_due_at);
  for (const person of [owner, staff])
    assert.equal(
      (
        await person.client.rpc("get_owner_manual_trial", {
          p_shop: manualShop,
        })
      ).error.code,
      "42501",
    );
  for (const [person, role] of [
    [manager, "manager"],
    [operator, "operator"],
  ])
    assert.equal((await person.client.rpc("finance_capability")).data, role);
  assert.equal(
    (await manual.client.rpc("finance_capability")).error.code,
    "42501",
  );
  const initial = fingerprint();
  assert.match(initial, /\|f$/);
  const [guest, empty, privatePlan, trialPage, old, adminPage] =
    await Promise.all(
      [null, owner, manual, trial, legacy, manager].map(openTab),
    );
  for (const number of ["", "https://example.test"]) {
    if (number) await restartWithNumber(number);
    for (const [page, path] of [
      [guest, "/"],
      [empty, planRoute],
      [privatePlan, planRoute],
    ]) {
      await visit(page, path);
      assert.equal(await page.locator("a[href*='wa.me']").count(), 0);
      assert.match(
        await page.locator("main").innerText(),
        /Canal comercial em configuração/,
      );
    }
  }
  console.log(
    "PASS missing and invalid configuration, private projection and C2 roles",
  );
  await restartWithNumber(commercialNumber);
  for (const width of [375, 768, 1280]) {
    for (const page of [guest, empty, privatePlan, trialPage, old, adminPage])
      await page.setViewportSize({ width, height: 850 });
    await visit(guest, "/");
    assert.match(await guest.title(), /barbearias/i);
    await guest
      .getByRole("link", { name: "Conhecer os planos", exact: true })
      .last()
      .click();
    await guest.waitForURL("**/#planos");
    await guest.locator("#planos").scrollIntoViewIfNeeded();
    await picture(guest, "planos-" + width);
    for (const [page, path] of [
      [guest, "/"],
      [empty, planRoute],
    ]) {
      await visit(page, path);
      const publicCatalog = page === guest;
      const cards = page.locator(publicCatalog ? ".lp-plan-grid article" : ".j2-c3-catalog article");
      assert.equal(await cards.count(), 3);
      const catalogText = await page.locator("main").innerText();
      if (publicCatalog) assert.doesNotMatch(catalogText, prices);
      else {
        assert.match(catalogText, prices);
        assert.match(catalogText, /Preços de referência do catálogo/);
      }
      for (const [i, name] of planCodes.entries()) {
        const card = cards.nth(i);
        assert.match(await card.getByRole("heading").innerText(), new RegExp("^" + name));
        assert.match(
          await card.innerText(),
          [
            /1 profissional ativo/,
            /5 profissionais ativos/,
            /10 profissionais ativos/,
          ][i],
        );
        const link = card.getByRole("link");
        const url = new URL(await link.getAttribute("href"));
        assert.equal(url.origin, "https://wa.me");
        assert.equal(url.pathname, "/" + commercialNumber);
        assert.ok(url.searchParams.get("text").includes(name));
        await link.focus();
        assert.ok(await link.evaluate((el) => el === document.activeElement));
        const popup = page.waitForEvent("popup");
        await link.press("Enter");
        const opened = await popup;
        await opened.waitForLoadState();
        assert.equal(opened.url(), url.href);
        await opened.close();
      }
    }
    assert.equal(
      await guest
        .getByRole("link", { name: "Ver demonstração", exact: true })
        .getAttribute("href"),
      "/barbearia/barbearia-aurora",
    );
    for (const [page, path] of [
      [privatePlan, planRoute],
      [trialPage, planRoute],
      [old, planRoute],
      [adminPage, finance],
      [guest, "/login"],
      [guest, "/cadastro"],
      [guest, "/barbearia/barbearia-aurora"],
    ])
      await visit(page, path);
    const contractText = normalized(
      await privatePlan.locator("main").innerText(),
    );
    assert.match(contractText, /43,21/);
    assert.match(contractText, /Primeiro vencimento/);
    assert.match(contractText, /Vencimento mais antigo em aberto/);
    assert.match(contractText, prices);
    assert.match(contractText, /Preços de referência do catálogo/);
    assert.match(await trialPage.locator("main").innerText(), /Teste gratuito/);
    for (const page of [privatePlan, trialPage, empty])
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /Retomar contratação|Contratar plano|Iniciar teste grátis/,
      );
    const oldText = normalized(await old.locator("main").innerText());
    assert.match(oldText, /63,79/);
    assert.match(oldText, /41,23/);
    assert.ok(
      await old
        .getByRole("button", { name: "Cancelar assinatura" })
        .isVisible(),
    );
    assert.equal(
      await adminPage.locator("meta[name=robots]").getAttribute("content"),
      "noindex, nofollow",
    );
    await picture(privatePlan, "contrato-" + width);
    console.log(
      "PASS " +
        width +
        "px · plans, keyboard, intercepted WhatsApp, auth, demo, manual, trial, legacy, C2",
    );
  }
  await visit(adminPage, finance + "/operadores");
  assert.match(await adminPage.locator("main").innerText(), /Concessões/);
  const agent = await openTab(operator);
  await visit(agent, finance + "/mensalidades");
  assert.equal(await agent.locator("nav a[href$='/operadores']").count(), 0);
  const attempt = await action(
    owner,
    "startSubscriptionAction",
    [
      {
        planId: plan,
        billingType: "pix",
        holderName: "QA Local",
        document: "52998224725",
      },
    ],
    planRoute,
  );
  assert.match(attempt.body, /consulte a LPS Solutions/);
  assert.equal(fingerprint(), initial);
  const email = ids() + "@example.test",
    password = ids() + "Aa!";
  assert.ifError(
    (
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    ).error,
  );
  await visit(guest, "/login");
  await guest.getByLabel("E-mail", { exact: true }).fill(email);
  await guest.getByLabel("Senha", { exact: true }).fill(password);
  await guest.getByRole("button", { name: "Entrar", exact: true }).click();
  await guest.waitForURL("**/onboarding");
  assert.equal(fingerprint(), initial);
  assert.deepEqual(issues, []);
  console.log(
    "PASS unchanged financial rows, acquisition action closed, login and onboarding with flag off",
  );
} finally {
  await browser.close();
  await stopNext();
}
