import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import sharp from "sharp";
import { action, admin, ids, nextURL, session, sql } from "./local-next-qa.mjs";

// Assert both origins before seeding synthetic fixtures or performing mutations.
assert.equal(nextURL, "http://127.0.0.1:59331");
const origin = "https://agenda.example.org";
assert.equal(process.env.NEXT_PUBLIC_APP_URL, origin);
const strict = process.env.J1_EXPECT_STRICT_CSP === "true";
const [owner, staff, outsider] = await Promise.all([session(), session(), session()]);
const shop = ids(), foreign = ids(), barber = ids(), slug = "j1-" + shop.slice(0, 8);
const get = (path, actor) => fetch(nextURL + path, {
  redirect: "manual",
  headers: { cookie: actor?.cookies() ?? "" },
  signal: AbortSignal.timeout(20_000),
});
const failed = [];
async function check(label, fn) {
  try {
    await fn();
    console.log("PASS " + label);
  } catch (error) {
    failed.push(label);
    console.log("FAIL " + label + ": " + error.name + " " + (error.code ?? ""));
    if (error instanceof assert.AssertionError && typeof error.actual === "number")
      console.log("  actual=" + error.actual + " expected=" + error.expected);
  }
}

sql(`insert into public.barbershops(id,name,slug) values ('${shop}','J1 local','${slug}'),('${foreign}','J1 other tenant','j1-${foreign}');
 insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${foreign}','${outsider.id}','owner');
 insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','J1 professional');`);

await check("App Router, Proxy, fresh CSP nonces and private cache", async () => {
  const login = await get("/login");
  const nextLogin = await get("/login");
  const header = strict ? "content-security-policy" : "content-security-policy-report-only";
  const policy = login.headers.get(header);
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  assert.equal(login.status, 200);
  assert.ok(nonce && policy !== nextLogin.headers.get(header));
  const html = await login.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)];
    assert.ok(scripts.length > 0 && scripts.every(([tag]) => tag.includes('nonce="' + nonce + '"')));
  assert.equal((await get("/dashboard")).status, 307);
  const dashboard = await get("/dashboard", owner);
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("cache-control") ?? "", /private/);
  assert.match(dashboard.headers.get("cache-control") ?? "", /no-store/);
  assert.ok((await dashboard.text()).includes("J1 local"));
  const other = await get("/dashboard", outsider);
  assert.ok((await other.text()).includes("J1 other tenant"));
});

await check("authenticated Server Action writes only into the active tenant", async () => {
  const name = "J1 " + randomUUID().slice(0, 8);
  const { res } = await action(staff, "createCustomerAction",
    [{ fullName: name, phone: "11987654321", email: "", notes: "" }], "/dashboard/clientes");
  assert.equal(res.status, 200);
  assert.equal(sql(`select count(*) from public.customers where barbershop_id='${shop}' and full_name='${name}'`), "1");
  assert.equal(sql(`select count(*) from public.customers where barbershop_id='${foreign}' and full_name='${name}'`), "0");

  const manifest = JSON.parse(await readFile(process.env.B2A2_QA_ACTION_MANIFEST ?? ".next/server/server-reference-manifest.json", "utf8"));
  const [id] = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === "createCustomerAction");
  const denied = await fetch(nextURL + "/dashboard/clientes", {
    method: "POST", redirect: "manual",
    headers: { origin: "https://foreign.example.org", cookie: staff.cookies(), "next-action": id, "content-type": "text/plain" },
    body: JSON.stringify([{ fullName: name + " foreign", phone: "11987654322", email: "", notes: "" }]),
  });
  assert.ok(denied.status >= 400);
  assert.equal(sql(`select count(*) from public.customers where barbershop_id='${shop}' and full_name='${name} foreign'`), "0");
});

await check("Supabase password sign-in and session cookies survive the Worker response", async () => {
  const email = ids() + "@example.test";
  const password = ids() + "aB!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  sql(`insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${data.user.id}','staff')`);
  const { res } = await action({ cookies: () => "" }, "signInAction", [{ email, password }, "/dashboard"], "/login");
  assert.match(res.headers.get("x-action-redirect") ?? res.headers.get("location") ?? "", /\/dashboard/);
  const cookies = res.headers.getSetCookie().map(set => set.split(";", 1)[0]).join("; ");
  assert.ok(cookies.length > 0);
  const result = await get("/dashboard", { cookies: () => cookies });
  assert.equal(result.status, 200);
  assert.ok((await result.text()).includes("J1 local"));
});

const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: "transparent" } }).png().toBuffer();
const emptyVersion = createHash("sha256").update("").digest("base64url");
const logoHeaders = { "x-logo-shop": shop, "x-logo-version": emptyVersion };
const photoHeaders = { "x-photo-version": "" };
const logoPath = "/api/barbershop/logo";
const photoPath = "/api/equipe/foto/" + barber;
function upload(path, actor, headers, body, mime = "image/png", from = origin) {
  return fetch(nextURL + path, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { cookie: actor.cookies(), origin: from, "content-type": mime, ...headers },
    body,
  });
}
function objects(bucket) {
  return sql(`select count(*) from storage.objects where bucket_id='${bucket}' and name like '${shop}/%'`);
}
for (const [label, path, headers, bucket] of [
  ["logo", logoPath, logoHeaders, "barbershop-logos"],
  ["private photo", photoPath, photoHeaders, "barber-photos"],
]) {
  await check(label + " rejects CSRF, staff, and another tenant", async () => {
    assert.equal((await upload(path, owner, headers, png, "image/png", "https://foreign.example.org")).status, 403);
    assert.equal((await upload(path, staff, headers, png)).status, 403);
    assert.ok([403, 409].includes((await upload(path, outsider, headers, png)).status));
  });
  await check(label + " rejects fake format, truncated PNG and oversized body without Storage writes", async () => {
    for (const payload of [Buffer.from("<svg/>"), Buffer.alloc(2 * 1024 * 1024 + 1)])
      assert.equal((await upload(path, owner, headers, payload)).status, 400);
    const truncated = await upload(path, owner, headers, png.subarray(0, 22));
    assert.ok([400, 503].includes(truncated.status));
    assert.equal(objects(bucket), "0");
  });
  await check(label + " valid upload and WebP Storage round trip", async () => {
    const res = await upload(path, owner, headers, png);
    if (res.status !== 200) {
      assert.equal(objects(bucket), "0", "failed upload must leave Storage unchanged");
      if (res.status === 503) assert.match((await res.json()).message, /processador de imagens/i);
    }
    assert.equal(res.status, 200);
    const initial = label === "logo" ? await res.json() : null;
    const read = initial ? await fetch(initial.logoUrl) : await get(path, owner);
    assert.equal(read.status, 200);
    assert.match(read.headers.get("content-type") ?? "", /^image\/webp/);
    assert.equal((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).format, "webp");
    if (initial) {
      const replacement = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#be9744" } }).png().toBuffer();
      const replaced = await upload(path, owner, { ...headers, "x-logo-version": initial.version }, replacement);
      assert.equal(replaced.status, 200);
      const latest = await replaced.json();
      assert.notEqual(latest.logoUrl, initial.logoUrl);
      const current = await fetch(latest.logoUrl);
      assert.equal(current.status, 200);
      const metadata = await sharp(Buffer.from(await current.arrayBuffer())).metadata();
      assert.deepEqual([metadata.format, metadata.width, metadata.height], ["webp", 96, 64]);
      assert.equal(objects(bucket), "1");
    }
  });
}

// Verify the private read path even if the Workers decoder is unavailable.
await check("private Storage read and cross-tenant denial", async () => {
  if (objects("barber-photos") === "0") {
    const key = shop + "/" + barber + "/" + ids() + ".webp";
    const webp = await sharp(png).webp().toBuffer();
    const seeded = await admin.storage.from("barber-photos").upload(key, webp, { contentType: "image/webp" });
    assert.equal(seeded.error, null, "QA Storage seed failed with HTTP " + (seeded.error?.statusCode ?? "unknown"));
    const set = await admin.rpc("replace_barber_photo", {
      actor: owner.id, shop, professional: barber, previous: null, replacement: key,
    });
    assert.equal(set.error, null, "QA photo reference RPC failed with " + (set.error?.code ?? "unknown"));
    assert.equal(set.data, true);
  }
  const response = await get(photoPath, owner);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.equal((await get(photoPath, outsider)).status, 404);
  assert.equal((await get(photoPath)).status, 404);
});

await check("QR generated in Workers and A4 PDF generated in browser", async () => {
  const expected = origin + "/agendar/" + slug;
  const { chromium } = await (process.env.C2_QA_PLAYWRIGHT
    ? import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href)
    : import("playwright-core"));
  const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
  try {
    const ctx = await browser.newContext();
    await ctx.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    if (strict) {
      await ctx.route(nextURL + "/login", async route => {
        const original = await route.fetch();
        const html = (await original.text()).replace(/<head[^>]*>/, tag => tag + '<script id="j1-csp-probe">window.j1CspProbe = 1</script>');
        await route.fulfill({ response: original, body: html });
      });
      const anonymous = await ctx.newPage();
      await anonymous.goto(nextURL + "/login");
      assert.equal(await anonymous.locator("#j1-csp-probe").count(), 1);
      assert.equal(await anonymous.evaluate(() => window.j1CspProbe), undefined);
      await anonymous.close();
      console.log("PASS strict CSP blocks an unnonced inline script in Chrome");
    }
    await ctx.addCookies(owner.cookies().split("; ").map(pair => {
      const i = pair.indexOf("=");
      return { name: pair.slice(0, i), value: pair.slice(i + 1), url: nextURL };
    }));
    const page = await ctx.newPage();
    await page.goto(nextURL + "/dashboard/qr");
    const img = await page.getByRole("img", { name: /QR Code/ }).getAttribute("src", { timeout: 8000 });
    assert.ok(img?.startsWith("data:image/png;base64,"));
    const { data, info } = await sharp(Buffer.from(img.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, expected);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 12000 }),
      page.getByRole("button", { name: "Baixar PDF para imprimir" }).click({ timeout: 8000 }),
    ]);
    const pdf = await PDFDocument.load(await readFile(await download.path()));
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(Math.abs(pdf.getPage(0).getHeight() - 841.89) < 0.1);
  } finally {
    await browser.close();
  }
});
if (failed.length) process.exitCode = 1;
