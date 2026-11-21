import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import sharp from "sharp";
import {
  ids,
  nextURL,
  session,
  sql,
  startNext,
  stopNext,
} from "./local-next-qa.mjs";

const origin = "https://agenda.example.org";
const [owner, staff, other] = await Promise.all([
  session(),
  session(),
  session(),
]);
const shop = ids(),
  second = ids(),
  barber = ids(),
  service = ids(),
  slug = "g1-" + shop.slice(0, 8);
const date = sql("select current_date+4"),
  expected = origin + "/agendar/" + slug;
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','Barbearia Horizonte QA','${slug}'),('${second}','Outro tenant QA','outra-${second}');
insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${second}','${other.id}','owner');
insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','Rafael QA');
insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values ('${service}','${shop}','Corte QA',30,4000);
insert into public.barber_services(barbershop_id,barber_id,service_id) values ('${shop}','${barber}','${service}');
insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) select '${shop}',d,'09:00','17:00' from generate_series(0,6)d;
insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) select '${shop}','${barber}',d,'09:00','17:00' from generate_series(0,6)d;
insert into public.barber_breaks values('${shop}','${barber}',extract(dow from date '${date}'),'12:00','13:00',true)`);
const { chromium } = await import(
  pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href
);
const browser = await chromium.launch({
  executablePath: process.env.C2_QA_CHROME,
});
const dir = process.env.QA_SCREENS ?? join(tmpdir(), "lps-g1-" + shop);
await mkdir(dir, { recursive: true });
async function tab(actor) {
  const ctx = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 375, height: 850 },
    reducedMotion: "reduce",
  });
  if (actor)
    await ctx.addCookies(
      actor
        .cookies()
        .split("; ")
        .map((v) => ({
          url: nextURL,
          name: v.slice(0, v.indexOf("=")),
          value: v.slice(v.indexOf("=") + 1),
        })),
    );
  return ctx.newPage();
}
try {
  await startNext(false);
  const page = await tab(staff);
  await page.goto(nextURL + "/dashboard/agenda");
  await page.getByRole("link", { name: "QR Code de agendamento" }).click();
  await page.getByRole("button", { name: "Mostrar QR Code" }).click();
  await page.getByRole("dialog").getByRole("img").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(dir, "g1-mobile.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  const tenant = await tab(other);
  await tenant.goto(nextURL + "/dashboard/qr?slug=" + slug);
  assert.equal(await tenant.getByRole("link", { name: expected }).count(), 0);
  await tenant
    .getByRole("link", { name: origin + "/agendar/outra-" + second })
    .waitFor();
  const anon = await tab();
  await anon.goto(nextURL + "/dashboard/qr");
  assert.equal(new URL(anon.url()).pathname, "/login");
  const png = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar QR Code" }).click();
  await (await png).saveAs(join(dir, "g1-qr.png"));
  const decoded = await sharp(join(dir, "g1-qr.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const payload = jsQR(
    new Uint8ClampedArray(decoded.data),
    decoded.info.width,
    decoded.info.height,
  )?.data;
  assert.equal(payload, expected);
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF para imprimir" }).click();
  await (await pdf).saveAs(join(dir, "g1-cartaz.pdf"));
  const doc = await PDFDocument.load(
    await readFile(join(dir, "g1-cartaz.pdf")),
  );
  assert.equal(doc.getPageCount(), 1);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.89) < 0.1);
  // The reserved HTTPS test origin is fulfilled exclusively by the local production build.
  const publicPage = await tab();
  await publicPage.route(origin + "/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      headers = { ...request.headers() };
    delete headers.host;
    delete headers.cookie;
    if (headers.origin) headers.origin = nextURL;
    const response = await route.fetch({
      url: nextURL + url.pathname + url.search,
      headers,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  await publicPage.goto(payload);
  await publicPage.getByRole("button", { name: /Corte QA/ }).click();
  await publicPage.getByRole("button", { name: /Rafael QA/ }).click();
  await publicPage.locator("#booking-date").fill(date);
  const slot = publicPage.getByRole("button", { name: "14:00", exact: true });
  await slot.waitFor();
  assert.equal(
    await publicPage
      .getByRole("button", { name: "12:00", exact: true })
      .count(),
    0,
  );
  await slot.click();
  await publicPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await publicPage.locator("#booking-name").fill("Pessoa de teste");
  await publicPage.locator("#booking-phone").fill("11999990000");
  await publicPage.getByRole("button", { name: "Confirmar reserva" }).click();
  await publicPage.waitForURL("**/reserva/**");
  assert.equal(
    sql(
      "select count(*) from public.notifications n join public.appointments a on a.id=n.appointment_id where a.barbershop_id='" +
        shop +
        "' and a.status='scheduled'",
    ),
    "2",
  );
  console.log(
    "PASS QR tenant, PNG decode, A4, phone layout, anonymous booking, lunch and F3 notices",
  );
} finally {
  await browser.close();
  await stopNext();
}
