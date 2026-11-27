// End-to-end QA against the disposable loopback database and a local build.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import jsQR from "jsqr";
import sharp from "sharp";
import { action, ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";
import { bookingFixture } from "./j2d-fixture.mjs";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT));
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const mode = process.env.J2D_QA_RUNTIME ?? "node";
assert.ok(["node", "workers"].includes(mode));
const evidence = process.env.J2D_QA_STATES;
if (evidence) await mkdir(evidence, { recursive: true });

const legacyPhoto = "https://agenda.example.org/images/qa-portrait.webp";
const picture = await readFile("public/images/barbearia-480.webp");
const context = await browser.newContext({
  viewport: { width: 320, height: 844 }, locale: "pt-BR", reducedMotion: "reduce",
});
await context.route("**/*", route => {
  const url = route.request().url();
  if (url === legacyPhoto) return route.fulfill({ body: picture, contentType: "image/webp" });
  return [nextURL, api].includes(new URL(url).origin) ? route.continue() : route.abort();
});
await context.addInitScript(() => {
  window.cspEvents = [];
  document.addEventListener("securitypolicyviolation", e => window.cspEvents.push(e.violatedDirective));
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);

async function open(path, title) {
  const response = await page.goto(nextURL + path);
  assert.ok(response?.ok());
  assert.match(response.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  await page.getByRole("heading", { name: title, exact: true }).first().waitFor();
  await checkLayout();
}

async function checkLayout() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  assert.deepEqual(await page.evaluate(() => window.cspEvents), []);
}

async function capture(state) {
  if (evidence) await page.screenshot({ path: join(evidence, state + ".png"), fullPage: true });
}

const unavailable = "Agendamentos temporariamente indisponíveis";
const title = "Barbearia Aurora QA";
const visitor = { cookies: () => "" };
const publicPath = fixture => "/agendar/" + fixture.slug;
const payload = (fixture, extra = {}) => ({
  slug: fixture.slug, serviceId: fixture.service, barberId: fixture.barber,
  date: fixture.day, time: "14:00", fullName: "Cliente sintético", phone: "11987654321", email: "", ...extra,
});

try {
  if (mode === "node") await startNext(false);
  const qrOwner = mode === "workers" ? await session() : undefined;
  const fixture = await bookingFixture({ brand: true, owner: qrOwner });
  const other = await bookingFixture();
  let path = publicPath(fixture);
  if (qrOwner) {
    const privateContext = await browser.newContext();
    try {
      await privateContext.addCookies(qrOwner.cookies().split("; ").map(pair => {
        const split = pair.indexOf("=");
        return { name: pair.slice(0, split), value: pair.slice(split + 1), url: nextURL };
      }));
      const qrPage = await privateContext.newPage();
      await qrPage.goto(nextURL + "/dashboard/qr");
      const qr = await qrPage.getByRole("img", { name: /QR Code de agendamento/ }).getAttribute("src");
      assert.ok(qr?.startsWith("data:image/png;base64,"));
      const { data, info } = await sharp(Buffer.from(qr.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
      assert.equal(decoded, new URL(path, process.env.NEXT_PUBLIC_APP_URL).href);
      path = new URL(decoded).pathname;
      console.log("PASS decoded Worker QR points to the shop subsequently booked");
    } finally {
      await privateContext.close();
    }
  }
  sql("update public.barbers set avatar_url='" + legacyPhoto + "' where id='" + fixture.barber + "'");
  const raw = await fetch(nextURL + path).then(response => response.text());
  assert.ok(raw.includes("barbershop-logos"));
  assert.doesNotMatch(raw, /barber-photos|Serviço inativo QA|Profissional inativo QA|Serviço sem equipe QA/);
  await open(publicPath(other), title);
  assert.equal(await page.locator(".j2-book-logo img").count(), 0);
  assert.ok((await anon.from("appointments").select("id")).error);
  const key = sql("select avatar_url from public.barbers where id='" + fixture.alternate + "'");
  assert.ok((await anon.storage.from("barber-photos").download(key)).error);
  await open(path, title);
  const service = page.getByRole("button", { name: /Corte clássico/ });
  await service.focus();
  assert.ok(await service.evaluate(el => getComputedStyle(el).outlineStyle === "solid"));
  await page.keyboard.press("Enter");
  const professional = page.getByRole("heading", { name: "Escolha o profissional" });
  assert.ok(await professional.evaluate(el => document.activeElement === el));
  assert.equal(await page.locator(".j2-book-avatar img").count(), 1);
  await page.locator(".j2-book-avatar img").evaluate(async img => { await img.decode(); });
  await page.getByRole("button", { name: /Rafael QA/ }).click();

  await page.locator("#booking-date").fill(fixture.closed);
  await page.getByText("A barbearia não funciona neste dia.").waitFor();
  const fullDate = sql("select date '" + fixture.day + "' + 7");
  sql("insert into public.blocked_slots(barbershop_id,barber_id,starts_at,ends_at,reason) values ('" + fixture.shop + "','" + fixture.barber + "',('"
    + fullDate + " 09:00-03')::timestamptz,('" + fullDate + " 18:00-03')::timestamptz,'INFORMAÇÃO INTERNA QA')");
  await page.locator("#booking-date").fill(fullDate);
  await page.getByText("Não há horários livres neste dia para o profissional selecionado.").waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /INFORMAÇÃO INTERNA QA/);
  await page.locator("#booking-date").fill(fixture.day);
  await page.getByRole("button", { name: "14:00", exact: true }).click();
  const continueButton = page.getByRole("button", { name: "Continuar", exact: true });
  await continueButton.click();
  await page.getByRole("button", { name: "Confirmar reserva", exact: true }).click();
  await page.locator("#booking-name[aria-invalid=true]").waitFor();
  await page.locator("#booking-name").fill("Cliente sintético");
  await page.locator("#booking-phone").fill("+55 11 9 8765-4321");
  await page.locator("#booking-email").fill("email-invalido");
  await page.getByRole("button", { name: "Confirmar reserva", exact: true }).click();
  await page.locator("#booking-email[aria-invalid=true]").waitFor();
  await page.locator("#booking-email").fill("");
  assert.equal(await page.locator("#booking-phone").inputValue(), "(11) 98765-4321");
  await page.getByRole("button", { name: "Trocar horário" }).click();
  await page.locator("button[aria-pressed='true']").filter({ hasText: "14:00" }).waitFor();
  await continueButton.click();
  assert.equal(await page.locator("#booking-name").inputValue(), "Cliente sintético");
  await capture("resumo");
  console.log("PASS logo, legacy and private photos, catalog, closed/full days, review, validation, focus and CSP");

  const invalid = await action(visitor, "createPublicBookingAction", [payload(fixture, {
    serviceId: other.service, fullName: "",
  })], path);
  assert.match(invalid.body, /Revise os dados/);
  const crossed = await action(visitor, "getPublicAvailabilityAction", [payload(fixture, { barberId: other.barber })], path);
  assert.match(crossed.body, /"status":"error"/);
  assert.doesNotMatch(crossed.body, /Cliente sintético|INFORMAÇÃO INTERNA QA/);

  if (mode === "node") {
    const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
    const [bookingAction] = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === "createPublicBookingAction");
    const denied = await fetch(nextURL + path, {
      method: "POST", redirect: "manual",
      headers: { "next-action": bookingAction, origin: "https://foreign.example.org", "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify([payload(fixture)]),
    });
    assert.ok(denied.status >= 400);
    assert.equal(sql("select count(*) from public.appointments where barbershop_id='" + fixture.shop + "'"), "0");
    console.log("PASS public action rejects a foreign origin without writing a booking");
    const concurrent = await Promise.all([
      action(visitor, "createPublicBookingAction", [payload(fixture, { phone: "11943210981" })], path),
      action(visitor, "createPublicBookingAction", [payload(fixture, { phone: "11943210982" })], path),
    ]);
    assert.equal(concurrent.filter(result => /"status":"success"/.test(result.body)).length, 1);
    await page.getByRole("button", { name: "Confirmar reserva", exact: true }).click();
    await page.getByRole("alert").getByText(/horário selecionado não está mais disponível/i).waitFor();
    assert.equal(await page.getByRole("button", { name: "14:00", exact: true }).count(), 0);
    await page.getByText("14:00 · Indisponível").waitFor();
    await page.getByRole("button", { name: "14:30", exact: true }).click();
    await continueButton.click();
    assert.equal(await page.locator("#booking-name").inputValue(), "Cliente sintético");
    console.log("PASS concurrent booking, conflict refresh and contact draft preserved");
  }

  // Two events in the same task exercise the synchronous client latch.
  await page.getByRole("button", { name: "Confirmar reserva", exact: true }).evaluate(el => {
    el.click();
    el.click();
  });
  await page.waitForURL(url => url.pathname.includes("/reserva/"));
  await page.getByRole("heading", { name: "Seu agendamento foi realizado com sucesso!" }).waitFor();
  await checkLayout();
  const finalPath = new URL(page.url()).pathname;
  const [count, price] = sql("select count(*),min(price_cents) from public.appointments a join public.customers c on c.id=a.customer_id and c.barbershop_id=a.barbershop_id where a.barbershop_id='" + fixture.shop + "' and c.phone='11987654321'").split("|");
  assert.deepEqual([count, price], ["1", "6500"]);
  sql("update public.services set price_cents=8100 where id='" + fixture.service + "'");
  await open(finalPath + "?novo=1", "Seu agendamento foi realizado com sucesso!");
  assert.match(await page.locator("main").innerText(), /65,00/);
  assert.doesNotMatch(await page.locator("main").innerText(), /Cliente sintético|98765-4321|81,00/);
  const wrongShop = finalPath.replace(path, publicPath(other));
  const wrongResponse = await page.goto(nextURL + wrongShop);
  // A streamed not-found can start with HTTP 200. The mismatched tenant
  // must still receive neither reservation details nor the cancel control.
  assert.ok([200, 404].includes(wrongResponse.status()));
  assert.doesNotMatch(await wrongResponse.text(), /j2-book-confirmation|Cliente sintético|98765-4321/);
  assert.equal(await page.getByRole("button", { name: "Cancelar reserva" }).count(), 0);
  await open(finalPath + "?novo=1", "Seu agendamento foi realizado com sucesso!");
  await capture("confirmacao");
  console.log("PASS " + mode + " public booking, repeat click, historical price, private token isolation and confirmation");

  if (mode === "node") {
    const trial = await bookingFixture({ trial: true });
    await open(publicPath(trial), title);
    for (const [expression, expected] of [
      ["transaction_timestamp()+interval '1 hour'", title],
      ["transaction_timestamp()-interval '1 hour'", unavailable],
    ]) {
      sql("begin; update private.automatic_premium_trials set started_at=(" + expression +
        ")-interval '168 hours',ends_at=(" + expression + ") where shop_id='" + trial.shop +
        "'; update public.subscriptions set trial_started_at=(" + expression +
        ")-interval '168 hours',trial_ends_at=(" + expression + ") where barbershop_id='" + trial.shop + "'; commit;");
      await open(publicPath(trial), expected);
    }
    const contractShop = await bookingFixture({ trial: true });
    const operator = await session();
    sql("insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values ('" + operator.id + "','operator',session_user,'QA J2-D');");
    const plan = sql("select id from public.plans where code='basico'");
    const month = new Date().toISOString().slice(0, 7) + "-01";
    const agreement = await operator.client.rpc("finance_agreement", {
      op: ids(), shop: contractShop.shop, reference: "QA J2-D", reason: "Validação de cobertura",
      terms: { plan_id: plan, monthly_cents: 5317, currency: "BRL", terms: "QA",
        coverage_start: new Date().toISOString(), first_month: month,
        first_due: new Date(Date.now() + 7 * 86_400_000).toISOString(), renewal_day: 15,
        due_day: 15, due_month_offset: 1, due_time: "10:00", zone: "UTC", booking_impact_accepted: true, },
    });
    // The real Basic limit rejects a shop with two professionals.
    assert.equal(agreement.error?.code, "LP031");
    const premium = sql("select id from public.plans where code='premium'");
    const pending = await operator.client.rpc("finance_agreement", {
      op: ids(), shop: contractShop.shop, reference: "QA J2-D", reason: "Validação de cobertura",
      terms: { plan_id: premium, monthly_cents: 5317, currency: "BRL", terms: "QA",
        coverage_start: new Date().toISOString(), first_month: month,
        first_due: new Date(Date.now() + 7 * 86_400_000).toISOString(), renewal_day: 15,
        due_day: 15, due_month_offset: 1, due_time: "10:00", zone: "UTC", booking_impact_accepted: true, },
    });
    assert.ifError(pending.error);
    assert.equal(pending.data.state, "pending");
    await open(publicPath(contractShop), unavailable);
    const contract = pending.data.contract;
    const issued = await operator.client.rpc("finance_invoice", { op: ids(), shop: contractShop.shop, contract, competence: month });
    assert.ifError(issued.error);
    const pix = await operator.client.rpc("finance_confirm_pix", { op: ids(), shop: contractShop.shop, contract,
      invoice: issued.data.invoice, received_cents: 5317, credited_at: new Date().toISOString(), checked: true, reference: "qa-j2d-" + ids() });
    assert.ifError(pix.error);
    await open(publicPath(contractShop), title);
    for (const command of ["suspend", "cancel"]) {
      const operation = await operator.client.rpc("finance_contract_action", { op: ids(), shop: contractShop.shop, contract, command, reason: "QA J2-D" });
      assert.ifError(operation.error);
      await open(publicPath(contractShop), unavailable);
      assert.doesNotMatch(await page.locator("main").innerText(), /assinatura|Pix|mensalidade|trial|suspensa/i);
    }
    await capture("indisponivel");
    console.log("PASS trial running, last day, expired, pending, paid, suspended and canceled with neutral public copy");
  }
} finally {
  await browser.close();
  if (mode === "node") await stopNext();
}
