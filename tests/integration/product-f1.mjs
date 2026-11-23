import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  ids,
  session,
  sql,
  startNext,
  stopNext,
  nextURL,
} from "./local-next-qa.mjs";
const [owner, staff, other] = await Promise.all([
  session(),
  session(),
  session(),
]);
const shop = ids(),
  foreign = ids(),
  barber = ids();
sql(`insert into public.barbershops(id,name,slug) values('${shop}','Equipe QA','f-${shop}'),('${foreign}','Outra QA','f-${foreign}');
insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${foreign}','${other.id}','owner');
insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','Profissional QA');
insert into public.customers(barbershop_id,full_name,phone) values ('${shop}','Contato QA','71999555390'),('${shop}','Sem telefone QA',null)`);
const endpoint = nextURL + "/api/equipe/foto/" + barber;
const png = await sharp({
  create: { width: 100, height: 100, channels: 3, background: "#e2bc49" },
})
  .png()
  .toBuffer();
async function change(user, method, version = "", body = png) {
  return fetch(endpoint, {
    method,
    headers: {
      cookie: user.cookies(),
      origin: nextURL,
      "x-photo-version": encodeURIComponent(version),
      "content-type": "image/png",
    },
    body: method === "POST" ? body : undefined,
  });
}
const { chromium } = await import(
  pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href
);
const browser = await chromium.launch({
  executablePath: process.env.C2_QA_CHROME,
});
try {
  await startNext(false);
  assert.equal((await change(staff, "POST")).status, 403);
  assert.equal((await change(other, "POST")).status, 403);
  const invalid = await change(owner, "POST", "", Buffer.from("bad"));
  assert.equal(invalid.status, 400, await invalid.text());
  const upload = await change(owner, "POST");
  assert.equal(upload.status, 200);
  const first = (await upload.json()).key;
  assert.ok(
    (await owner.client.storage.from("barber-photos").download(first)).data,
  );
  assert.ok(
    (await other.client.storage.from("barber-photos").download(first)).error,
  );
  assert.ok(
    (
      await staff.client.storage
        .from("barber-photos")
        .upload(first + ".webp", png)
    ).error,
  );
  const races = await Promise.all([
    change(owner, "POST", first),
    change(owner, "POST", first),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  const second = (await races.find((r) => r.ok).json()).key;
  assert.ok(
    (await owner.client.storage.from("barber-photos").download(first)).error,
  );
  assert.equal(
    (await fetch(endpoint, { headers: { cookie: staff.cookies() } })).status,
    200,
  );
  assert.equal(
    (await fetch(endpoint, { headers: { cookie: other.cookies() } })).status,
    404,
  );
  const ctx = await browser.newContext({ locale: "pt-BR" });
  await ctx.addCookies(
    owner
      .cookies()
      .split("; ")
      .map((s) => ({
        name: s.slice(0, s.indexOf("=")),
        value: s.slice(s.indexOf("=") + 1),
        url: nextURL,
      })),
  );
  const memberPage = await ctx.newPage();
  const visitor = await browser.newPage({ locale: "pt-BR" });
  for (const width of [375, 1280]) {
    for (const p of [memberPage, visitor])
      await p.setViewportSize({ width, height: 850 });
    for (const route of [
      "/",
      "/cadastro",
      "/dashboard/plano",
      "/dashboard/clientes",
      "/dashboard/equipe",
    ]) {
      const page = route.startsWith("/dashboard") ? memberPage : visitor;
      await page.goto(nextURL + route, { waitUntil: "networkidle" });
      assert.equal(new URL(page.url()).pathname, route);
      if (route === "/") {
        assert.ok(
          await page
            .getByText(
              "Teste de 168 horas no plano Básico, sujeito à liberação pela LPS Solutions.",
              {
                exact: true,
              },
            )
            .count(),
        );
        assert.match(
          await page.locator("body").innerText(),
          /Confirme a disponibilidade antes de criar sua barbearia/,
        );
        await page.locator("#planos").scrollIntoViewIfNeeded();
      }
      if (route === "/cadastro") {
        assert.match(
          await page.locator("body").innerText(),
          /sujeito à liberação pela LPS Solutions/,
        );
        assert.match(
          await page.locator("body").innerText(),
          /Confirme a disponibilidade antes de criar sua barbearia/,
        );
      }
      if (["/", "/dashboard/plano"].includes(route)) {
        assert.equal(await page.locator(".lp-plan-grid article").count(), 3);
        assert.ok(
          await page
            .getByRole("heading", { name: "Incluído em todos os planos" })
            .count(),
        );
        assert.doesNotMatch(
          await page.locator(".lp-plan-grid").innerText(),
          /R\$/,
        );
      }
      if (route.endsWith("clientes")) {
        const link = page
          .getByRole("link", {
            name: "Abrir WhatsApp de Contato QA em nova aba",
          })
          .first();
        assert.equal(
          await link.getAttribute("href"),
          "https://wa.me/5571999555390",
        );
        assert.equal(
          await page
            .getByRole("link", { name: /WhatsApp de Sem telefone QA/ })
            .count(),
          0,
        );
      }
      if (route.endsWith("equipe")) {
        await page
          .getByRole("button", { name: /editar/i })
          .first()
          .click();
        await page
          .locator("#barber-photo")
          .setInputFiles({
            name: "foto.png",
            mimeType: "image/png",
            buffer: png,
          });
        assert.ok(
          await page.getByRole("button", { name: "Salvar foto" }).isVisible(),
        );
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      );
      if (process.env.QA_SCREENS) {
        await mkdir(process.env.QA_SCREENS, { recursive: true });
        await page.screenshot({
          path: join(
            process.env.QA_SCREENS,
            "f1-" +
              (route.split("/").pop() || "landing") +
              "-" +
              width +
              ".png",
          ),
        });
      }
    }
  }
  assert.equal((await change(owner, "DELETE", second)).status, 200);
  assert.equal(
    (await fetch(endpoint, { headers: { cookie: owner.cookies() } })).status,
    404,
  );
  assert.ok(
    (await owner.client.storage.from("barber-photos").download(second)).error,
  );
  console.log(
    "PASS F1 real Storage, owner/staff/tenant isolation, CAS replacement, removal and browser at 375/1280",
  );
} finally {
  await browser.close();
  await stopNext();
}
