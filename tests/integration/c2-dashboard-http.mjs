import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  action,
  ids,
  nextURL,
  session,
  sql,
  startNext,
  stopNext,
} from "./local-next-qa.mjs";

const root = "/admin/assinaturas";
const pass = (msg) => console.log("PASS " + msg);
const page = async (actor, path = root) => {
  const response = await fetch(nextURL + path, {
    redirect: "manual",
    headers: { cookie: actor?.cookies() ?? "" },
  });
  return { response, html: await response.text() };
};
async function denied(actor, path = root) {
  const p = await page(actor, path);
  assert.ok(
    p.response.headers.get("location")?.endsWith("/admin/acesso-negado") ||
      /NEXT_REDIRECT[^\n]*acesso-negado/.test(p.html),
  );
  assert.doesNotMatch(p.html, /QA C2 Cobrança|Mensalidade contratada/);
}
async function mutate(actor, data, expected) {
  const result = await action(actor, "submitFinancialOperation", [data], root);
  assert.match(result.body, expected);
  return result;
}
assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
try {
  const [manager, operator, ordinary, owner, staff, legacy] = await Promise.all(
    [
      session(),
      session(),
      session(),
      session(),
      session(),
      session({ lps_role: "platform_admin" }),
    ],
  );
  const shop = ids(),
    plan = sql("select id from public.plans where code='basico'");
  sql(`insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
    values('${manager.id}','manager',session_user,'QA C2');
    insert into public.barbershops(id,name,slug) values ('${shop}','QA C2 Cobrança','qa-${shop}');
    insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff');
    insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,trial_started_at,trial_ends_at)
    values ('${shop}','${plan}','manual_pix','inactive','trialing','uncontracted','2019-01-01Z','2019-01-08Z');`);
  await startNext(false);
  const anon = await page(null);
  assert.match(anon.response.headers.get("location"), /login\?proximo=/);
  for (const person of [ordinary, owner, staff, legacy]) {
    await denied(person, root + "/barbearias/" + shop);
    assert.equal(
      (await person.client.rpc("finance_capability")).error.code,
      "42501",
    );
    await mutate(person, { kind: "pix" }, /Acesso financeiro negado/);
  }
  pass(
    "anonymous login return, four unauthorized identities, direct POST and direct RPC",
  );
  const grant = {
    kind: "operator",
    target: operator.id,
    permission: "operator",
    reason: "QA acesso",
    op: ids(),
    confirmed: true,
  };
  await mutate(manager, grant, /Permissão registrada/);
  assert.equal(
    (await operator.client.rpc("finance_capability")).data,
    "operator",
  );
  const home = await page(operator);
  assert.match(home.html, /Visão financeira/);
  assert.match(home.html, /noindex/);
  assert.match(home.response.headers.get("cache-control"), /private/);
  assert.match(home.response.headers.get("cache-control"), /no-store/);
  assert.doesNotMatch(operator.cookies(), /lps.active_barbershop/);
  assert.doesNotMatch(home.html, /href="\/admin\/assinaturas\/operadores"/);
  await denied(operator, root + "/operadores");
  assert.match((await page(manager, root + "/operadores")).html, /Concessões/);
  await mutate(
    manager,
    { ...grant, target: manager.id, permission: "revoke" },
    /negado/,
  );
  await mutate(
    operator,
    { ...grant, target: operator.id, permission: "manager" },
    /negado/,
  );
  pass(
    "operator without shop, manager-only directory, private no-store HTML and self-management denied",
  );
  const month = new Date().toISOString().slice(0, 7),
    first = month + "-01T00:00",
    detail = root + "/barbearias/" + shop;
  assert.match(
    (await page(operator, detail)).html,
    /Registrar acordo comercial/,
  );
  const agreement = {
    kind: "agreement",
    op: ids(),
    confirmed: true,
    shop,
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
    terms: "QA termos",
    reference: "QA contrato",
    reason: "QA acordo",
  };
  await mutate(operator, agreement, /Acordo registrado/);
  const contract = sql(
    `select id from public.subscriptions where barbershop_id='${shop}' and agreement_at is not null and contracted_price_cents=4321`,
  );
  assert.match(contract, /^[\da-f-]{36}$/);
  const issue = {
    kind: "invoice",
    op: ids(),
    confirmed: true,
    shop,
    contract,
    month,
  };
  await mutate(operator, issue, /Mensalidade registrada/);
  await mutate(operator, issue, /Mensalidade registrada/);
  const invoice = sql(
    `select id from public.payments where subscription_id='${contract}'`,
  );
  assert.match(invoice, /^[\da-f-]{36}$/);
  const invoicePage = await page(operator, detail);
  assert.match(invoicePage.html, /Confirmo que conferi o crédito/);
  assert.match(
    (await page(operator, root + "/mensalidades?mes=" + month)).html,
    /QA C2 Cobrança/,
  );
  const pix = {
    kind: "pix",
    op: ids(),
    confirmed: true,
    shop,
    contract,
    invoice,
    amount: "43,21",
    credit: new Date().toISOString().slice(0, 16),
    checked: true,
    reference: "qa-" + ids(),
  };
  await mutate(
    operator,
    { ...pix, checked: false },
    /confirmações obrigatórias/,
  );
  for (const amount of ["43,20", "43,22"])
    await mutate(operator, { ...pix, amount }, /Dados incompatíveis/);
  pass(
    "agreement at negotiated price, repeat issuance, exact cents and explicit attestation",
  );
  if (process.env.C2_QA_PLAYWRIGHT && process.env.C2_QA_CHROME) {
    const { chromium } = await import(
      pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href
    );
    const browser = await chromium.launch({
      executablePath: process.env.C2_QA_CHROME,
      headless: true,
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "pt-BR",
      });
      await context.addCookies(
        operator
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
      const tab = await context.newPage();
      await tab.goto(nextURL + detail, { waitUntil: "networkidle" });
      const pixSummary = tab
        .locator("article.fa-record")
        .filter({ hasText: contract })
        .locator("summary")
        .filter({ hasText: "Conferir Pix" });
      await pixSummary.waitFor();
      assert.equal(await pixSummary.count(), 1, "Pix control for this contract");
      await pixSummary.click();
      const form = tab
        .locator("details[open]")
        .filter({ hasText: "Confirmo que conferi" });
      const check = form.getByRole("checkbox");
      assert.equal(await check.isChecked(), false);
      await form.getByLabel("Valor recebido (R$)").fill("43,21");
      await form.getByLabel("Data e hora do crédito (UTC)").fill(pix.credit);
      await form
        .getByLabel("Referência bancária ou administrativa (opcional)")
        .fill(pix.reference);
      await form.getByRole("button", { name: "Revisar dados" }).click();
      assert.equal(
        await form.getByRole("button", { name: "Confirmar operação" }).count(),
        0,
      );
      await check.check();
      await form.getByRole("button", { name: "Revisar dados" }).click();
      await form.getByRole("button", { name: "Confirmar operação" }).waitFor();
      assert.equal(
        await form
          .getByRole("heading", { name: "Conferir antes de confirmar" })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await tab.setViewportSize({ width: 375, height: 800 });
      assert.equal(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const storageKey = [
        "lps.finance",
        operator.id,
        "pix",
        shop,
        contract,
        invoice,
      ].join("/");
      pix.op = await tab.evaluate(
        (key) => sessionStorage.getItem(key),
        storageKey,
      );
      assert.match(pix.op, /^[\da-f-]{36}$/);
      // Drop only the reply from our local Next instance, after PostgreSQL committed.
      await tab.route(nextURL + "/**", async (route) => {
        if (!route.request().headers()["next-action"]) {
          await route.continue();
          return;
        }
        const reply = await route.fetch();
        assert.equal(reply.status(), 200);
        await route.abort("failed");
      });
      await form.getByRole("button", { name: "Confirmar operação" }).click();
      await tab
        .getByRole("alert")
        .filter({ hasText: "Resposta interrompida" })
        .waitFor({ timeout: 10000 });
      assert.equal(
        sql(`select status from public.payments where id='${invoice}'`),
        "paid",
      );
      assert.equal(
        await tab.evaluate((key) => sessionStorage.getItem(key), storageKey),
        pix.op,
      );
      await tab.unroute(nextURL + "/**");
      await form.getByRole("button", { name: "Confirmar operação" }).click();
      await tab
        .getByText(/Pix conferido em/)
        .first()
        .waitFor({ timeout: 10000 });
      pass(
        "bank receipt survives a lost HTTP reply and browser retry with original operation ID",
      );
      await tab
        .getByRole("navigation", { name: "Administração de assinaturas" })
        .getByText("Barbearias", { exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Barbearias", exact: true })
        .waitFor();
      pass(
        "Chrome desktop and mobile navigation, unchecked attestation, two-step confirmation and keyboard focus",
      );
    } finally {
      await browser.close();
    }
  }
  await Promise.all([
    mutate(operator, pix, /Pix conferido em/),
    mutate(operator, pix, /Pix conferido em/),
  ]);
  await mutate(operator, pix, /Pix conferido em/);
  await mutate(manager, { ...pix, op: ids() }, /Parcela já encerrada/);
  const directory = await operator.client.rpc("finance_directory", {
    shop_id: shop,
  });
  assert.ifError(directory.error);
  assert.equal(
    Date.parse(directory.data[0].last_verified_at),
    Date.parse(
      sql(`select verified_at from public.payments where id='${invoice}'`),
    ),
  );
  assert.equal(
    sql(
      `select count(*) from public.audit_logs where entity_id='${invoice}' and metadata->>'status'='paid'`,
    ),
    "1",
  );
  assert.doesNotMatch(
    (await page(operator, detail)).html,
    /Confirmo que conferi o crédito/,
  );
  const command = {
    kind: "contract",
    op: ids(),
    shop,
    contract,
    confirmed: true,
    command: "suspend",
    reason: "QA pausa",
  };
  await mutate(operator, command, /Suspensão registrada/);
  await mutate(
    operator,
    { ...command, op: ids(), command: "resume" },
    /Retomada registrada/,
  );
  await mutate(
    operator,
    { ...command, op: ids(), command: "cancel" },
    /Cancelamento registrado/,
  );
  const trail = await page(
    operator,
    root + "/historico?barbearia=" + shop + "&acao=confirm_pix",
  );
  assert.match(trail.html, /Conferência de Pix/);
  assert.match(trail.html, new RegExp(invoice));
  assert.equal(
    sql(`select status from public.payments where id='${invoice}'`),
    "paid",
  );
  pass(
    "concurrent settlement and retry return receipt, contract actions preserve history, filtered journal",
  );
  await mutate(
    manager,
    { ...grant, op: ids(), permission: "revoke" },
    /Permissão registrada/,
  );
  await denied(operator);
  await mutate(operator, pix, /negado/);
  assert.equal(
    (await operator.client.rpc("finance_capability")).error.code,
    "42501",
  );
  assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
  pass("same session denied after revocation, manual onboarding off");
} finally {
  await stopNext();
}
