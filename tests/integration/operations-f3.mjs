// Only the disposable loopback stack accepted by local-next-qa is eligible.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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

const [owner, staff, other] = await Promise.all([
  session(),
  session(),
  session(),
]);
const shop = ids(),
  foreign = ids(),
  barber = ids(),
  service = ids(),
  customer = ids(),
  slug = "qa-" + shop.slice(0, 12);
const date = sql("select current_date+8"),
  nextDate = sql("select current_date+9"),
  weekday = new Date(date + "T12:00:00Z").getUTCDay();
sql(`insert into public.barbershops(id,name,slug,timezone) values ('${shop}','Agenda QA','${slug}','America/Manaus'),('${foreign}','Outra QA','x-${foreign}','America/Manaus');
insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${foreign}','${other.id}','owner');
insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','João QA');
insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values ('${service}','${shop}','Corte QA',30,4000);
insert into public.barber_services(barbershop_id,barber_id,service_id,created_at) values('${shop}','${barber}','${service}',now());
insert into public.customers(id,barbershop_id,full_name) values ('${customer}','${shop}','Cliente habitual');
insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) select '${shop}',d,'08:00','18:00' from generate_series(0,6)d;
insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) select '${shop}','${barber}',d,'09:00','17:00' from generate_series(0,6)d;`);
const agenda = "/dashboard/agenda",
  base = { barberId: barber, serviceId: service, date },
  count = (table) =>
    Number(
      sql(
        "select count(*) from public." +
          table +
          " where barbershop_id='" +
          shop +
          "'",
      ),
    );
const pause = (user, start, end, enabled = true) =>
  user.client.from("barber_breaks").upsert({
    barbershop_id: shop,
    barber_id: barber,
    weekday,
    starts_at: start,
    ends_at: end,
    is_active: enabled,
  });
const book = (user, time, name) =>
  user.client.rpc("book_new_walk_in", {
    shop,
    professional: barber,
    service,
    starts: date + "T" + time + ":00-04:00",
    customer_name: name,
    note: "",
  });
const complete = (user, booking, b, s) =>
  user.client.rpc("complete_rated_appointment", {
    shop,
    booking,
    barber_score: b,
    shop_score: s,
  });
const { chromium } = await import(
  pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href
);
const browser = await chromium.launch({
  executablePath: process.env.C2_QA_CHROME,
});
const issues = [];
async function open(user, width) {
  const ctx = await browser.newContext({
    locale: "pt-BR",
    reducedMotion: "reduce",
    viewport: { width, height: 850 },
  });
  await ctx.addCookies(
    user
      .cookies()
      .split("; ")
      .map((p) => ({
        url: nextURL,
        name: p.slice(0, p.indexOf("=")),
        value: p.slice(p.indexOf("=") + 1),
      })),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => issues.push(e.message));
  return page;
}
async function shot(page, name) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    name,
  );
  if (process.env.QA_SCREENS) {
    await mkdir(process.env.QA_SCREENS, { recursive: true });
    await page.screenshot({
      animations: "disabled",
      path: join(
        process.env.QA_SCREENS,
        "f3-" + name + "-" + page.viewportSize().width + ".png",
      ),
    });
  }
}
async function actionOk(user, method, args, path) {
  const { body } = await action(user, method, args, path);
  assert.match(body, /"status":"success"/, method);
  return body;
}
try {
  await startNext(false);
  assert.ok((await pause(staff, "12:00", "13:00")).error);
  assert.ok((await pause(other, "12:00", "13:00")).error);
  assert.ifError((await pause(owner, "12:00", "13:00")).error);
  for (const time of ["11:45", "12:00", "08:00", "16:45"])
    assert.ok((await book(staff, time, "Indisponível")).error, time);
  assert.equal(count("customers"), 1);
  const race = await Promise.all([
    book(staff, "09:00", "Concorrência"),
    book(owner, "09:00", "Concorrência"),
  ]);
  assert.equal(race.filter((r) => !r.error).length, 1);
  const raced = race.find((r) => !r.error).data;
  const collision = await Promise.all([
    pause(owner, "11:30", "13:00"),
    book(staff, "11:30", "Disputa pausa"),
  ]);
  assert.equal(collision.filter((r) => !r.error).length, 1);
  assert.ifError((await pause(owner, "12:00", "13:00")).error);
  assert.ok(
    (
      await other.client.rpc("book_new_walk_in", {
        shop,
        professional: barber,
        service,
        starts: date + "T15:00:00-04:00",
        customer_name: "Outra loja",
        note: "",
      })
    ).error,
  );
  const money = count("payments");
  assert.ok((await complete(other, raced, 1, 1)).error);
  assert.ok((await complete(staff, raced, 11, null)).error);
  assert.equal(
    sql("select status from public.appointments where id='" + raced + "'"),
    "scheduled",
  );
  const completed = await Promise.all([
    complete(staff, raced, 0, null),
    complete(staff, raced, 0, null),
  ]);
  completed.forEach((r) => assert.ifError(r.error));
  assert.ok((await complete(staff, raced, 10, null)).error);
  const independent = await book(staff, "09:30", "Só barbearia");
  assert.ifError(independent.error);
  assert.ifError((await complete(staff, independent.data, null, 10)).error);
  const optional = await book(owner, "10:00", "Sem nota");
  assert.ifError(optional.error);
  assert.ifError((await complete(owner, optional.data, null, null)).error);
  assert.equal(count("appointment_ratings"), 2);
  const summaries = await owner.client.rpc("rating_summary", { shop });
  assert.ifError(summaries.error);
  assert.equal(
    summaries.data.find((s) => s.barber_id === barber).average_score,
    0,
  );
  assert.equal(
    summaries.data.find((s) => s.barber_id === null).average_score,
    10,
  );
  assert.equal(
    (
      await staff.client
        .from("appointment_ratings")
        .select("*")
        .eq("barbershop_id", shop)
    ).data.length,
    0,
  );
  assert.equal(
    (await other.client.rpc("booking_notices", { shop })).data.length,
    0,
  );
  const common = { ...base, slug };
  const publicSlots = await actionOk(
    { cookies: () => "" },
    "getPublicAvailabilityAction",
    [common],
    "/agendar/" + slug,
  );
  assert.match(publicSlots, /"time":"13:00"/);
  assert.doesNotMatch(publicSlots, /"time":"(?:11:45|12:00)"/);
  const otherDay = await actionOk(
    staff,
    "getAppointmentAvailabilityAction",
    [{ ...base, date: nextDate }],
    agenda,
  );
  assert.match(otherDay, /"time":"12:00"/);
  await actionOk(
    { cookies: () => "" },
    "createPublicBookingAction",
    [
      {
        ...common,
        time: "14:00",
        fullName: "Cliente externo QA",
        phone: "11999990001",
        email: "",
      },
    ],
    "/agendar/" + slug,
  );
  await actionOk(
    owner,
    "createAppointmentAction",
    [
      {
        ...base,
        time: "14:30",
        customerId: customer,
        notes: "Reserva interna",
      },
    ],
    agenda,
  );
  const external = sql(
    "select id from public.appointments where barbershop_id='" +
      shop +
      "' and public_token is not null and created_by is null",
  );
  assert.ok(external);
  assert.equal(
    sql(
      "select count(*) from public.notifications where appointment_id='" +
        external +
        "'",
    ),
    "2",
  );
  const invalid = await action(
    other,
    "confirmAppointmentAction",
    [external],
    agenda,
  );
  assert.match(invalid.body, /"status":"error"/);
  const ownerPage = await open(owner, 1280),
    staffPage = await open(staff, 375);
  for (const page of [ownerPage, staffPage]) {
    await page.goto(nextURL + agenda + "?date=" + date, {
      waitUntil: "networkidle",
    });
    await page
      .getByRole("button", { name: "Notificações", exact: true })
      .click();
    const card = page
      .locator("article")
      .filter({ hasText: "Cliente externo QA" });
    await card.waitFor();
    await shot(page, "notificacoes");
    if (page === staffPage) {
      await card
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await card.getByText("Confirmado", { exact: true }).waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: "Notificações", exact: true })
        .click();
      await card.getByText("Confirmado", { exact: true }).waitFor();
      assert.equal(
        await card.getByRole("button", { name: "Marcar como lida" }).count(),
        0,
      );
    }
    await card.getByRole("button", { name: "Abrir agendamento" }).click();
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Cliente externo QA" })
      .waitFor();
    await page
      .getByRole("button", { name: "Concluir atendimento", exact: true })
      .click();
    await page.getByLabel("Avaliação do barbeiro").waitFor();
    assert.equal(
      await page.getByLabel("Avaliação do barbeiro").inputValue(),
      "",
    );
    await shot(page, "avaliacao");
    if (page === staffPage) {
      await page.getByLabel("Avaliação do barbeiro").selectOption("10");
      await page
        .getByRole("button", { name: "Concluir atendimento", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    } else {
      await page
        .getByRole("button", { name: "Fechar", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Notificações", exact: true })
        .click();
      await card.getByRole("button", { name: "Abrir agendamento" }).click();
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "Cliente externo QA" })
        .waitFor();
    }
  }
  assert.equal(
    sql(
      "select recorded_by from public.appointment_ratings where appointment_id='" +
        external +
        "'",
    ),
    staff.id,
  );
  for (const width of [375, 1280]) {
    await ownerPage.setViewportSize({ width, height: 850 });
    await ownerPage.goto(nextURL + "/dashboard/horarios", {
      waitUntil: "networkidle",
    });
    const panel = ownerPage.locator("section").filter({
      has: ownerPage.getByRole("heading", { name: "Pausa recorrente" }),
    });
    await panel.getByLabel("Dia da pausa").selectOption(String(weekday));
    assert.equal(
      await panel.getByLabel("Início da pausa").inputValue(),
      "12:00",
    );
    if (width === 375) {
      await panel.getByLabel("Início da pausa").fill("12:15");
      await panel.getByRole("button", { name: "Salvar pausa" }).click();
      await panel.getByText("Pausa salva.", { exact: true }).waitFor();
      assert.equal(
        sql(
          "select starts_at from public.barber_breaks where barbershop_id='" +
            shop +
            "' and weekday=" +
            weekday,
        ),
        "12:15:00",
      );
      await panel.getByLabel("Início da pausa").fill("12:00");
      await Promise.all([
        ownerPage.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            r.url().includes("/dashboard/horarios"),
        ),
        panel.getByRole("button", { name: "Salvar pausa" }).click(),
      ]);
    }
    await panel.scrollIntoViewIfNeeded();
    await shot(ownerPage, "horarios");
    await ownerPage.goto(nextURL + "/dashboard/equipe", {
      waitUntil: "networkidle",
    });
    await ownerPage
      .getByRole("heading", { name: "Avaliações dos atendimentos" })
      .scrollIntoViewIfNeeded();
    await shot(ownerPage, "medias");
  }
  await staffPage.goto(nextURL + agenda + "?date=" + date + "&new=1", {
    waitUntil: "networkidle",
  });
  const modal = staffPage.getByRole("dialog");
  await modal.getByLabel("Novo cliente presencial").fill("Cliente balcão QA");
  await modal.getByRole("button", { name: "Continuar" }).click();
  await modal.getByRole("button", { name: /Corte QA/ }).click();
  await modal.getByRole("button", { name: /João QA/ }).click();
  await modal.getByRole("button", { name: "Continuar" }).click();
  await modal.getByRole("button", { name: "15:00", exact: true }).click();
  await modal.getByRole("button", { name: "Continuar" }).click();
  await shot(staffPage, "presencial");
  await modal.getByRole("button", { name: "Confirmar agendamento" }).click();
  await modal.waitFor({ state: "hidden" });
  assert.equal(
    sql(
      "select count(*) from public.appointments a join public.customers c on c.id=a.customer_id where a.barbershop_id='" +
        shop +
        "' and c.full_name='Cliente balcão QA'",
    ),
    "1",
  );
  assert.equal(count("payments"), money);
  sql(
    "insert into public.subscriptions(barbershop_id,plan_id,gateway,status,invoice_link_key,trial_started_at,trial_ends_at) select '" +
      shop +
      "',id,'manual_pix','trialing','uncontracted',now()-interval '8 days',now()-interval '1 day' from public.plans where code='basico'",
  );
  const customers = count("customers");
  assert.equal(
    (await book(staff, "16:00", "Sem cobertura")).error?.code,
    "P0001",
  );
  assert.equal(count("customers"), customers);
  assert.deepEqual(issues, []);
  console.log(
    "PASS F3 SQL/Data API/Next/browser: concurrent reservations, pauses, ratings, confirmation, notifications and financial coverage",
  );
} finally {
  await browser.close();
  await stopNext();
}
