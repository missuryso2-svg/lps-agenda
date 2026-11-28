import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { pngChunk, uploadImages } from "../fixtures/upload-images.mjs";

const origin = "https://lps-agenda-staging.lpsagenda-qa.workers.dev";
const dbUrl = "https://kffhoimijhsddodqxezs.supabase.co";
const { K2C_URL, K2C_DB_URL, K2C_ACCESS, K2C_PUBLIC_KEY, K2C_SERVER_KEY } = process.env;
assert.equal(K2C_URL, origin);
assert.equal(K2C_DB_URL, dbUrl);
assert.ok(K2C_ACCESS && K2C_PUBLIC_KEY && K2C_SERVER_KEY && K2C_PUBLIC_KEY !== K2C_SERVER_KEY);
for (const [key, role] of [[K2C_PUBLIC_KEY, "anon"], [K2C_SERVER_KEY, "service_role"]]) {
  const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
  assert.equal(payload.ref, "kffhoimijhsddodqxezs");
  assert.equal(payload.role, role);
}

const admin = createClient(dbUrl, K2C_SERVER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accountIds = [];
const shops = [];
let phase = "preflight";
let suspended;
function ok(result) {
  if (result.error) throw new Error("Supabase returned an error", { cause: result.error });
  return result.data;
}
async function account(role) {
  const email = "k2c-" + randomUUID() + "@example.test";
  const password = randomUUID() + "aB!2";
  const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  accountIds.push(user.id);
  const cookies = new Map();
  const db = createServerClient(dbUrl, K2C_PUBLIC_KEY, {
    cookies: {
      getAll: () => Array.from(cookies.values()),
      setAll: (items) => items.forEach((item) => cookies.set(item.name, item)),
    },
  });
  ok(await db.auth.signInWithPassword({ email, password }));
  return { id: user.id, db, role, credentials: { email, password }, cookie: () => Array.from(cookies.values()).map(({ name, value }) => name + "=" + value).join("; ") };
}
async function shopFor(actor) {
  const id = randomUUID();
  ok(await admin.from("barbershops").insert({ id, name: "Barbearia sintética K2-C", slug: "k2c-" + id }));
  shops.push(id);
  ok(await admin.from("barbershop_members").insert({ barbershop_id: id, user_id: actor.id, role: actor.role }));
  return id;
}
function log(label, fields = {}) {
  console.log(JSON.stringify({ label, ...fields }));
}
function expectStatus(response, expected) {
  assert.ok([expected].flat().includes(response.status), "Unexpected status " + response.status + " expected " + expected);
}
async function request(label, path, { actor, method = "GET", body, headers = {}, access = true } = {}) {
  if (suspended) throw new Error("Worker probes suspended");
  const start = performance.now();
  const response = await fetch(origin + path, {
    method, body, redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: {
      ...(access ? { "cf-access-token": K2C_ACCESS } : {}),
      ...(actor ? { cookie: actor.cookie() } : {}),
      ...headers,
    },
  });
  log(label, { status: response.status, http_headers_ms: Math.round(performance.now() - start) });
  if (response.status >= 500) {
    const failure = await response.clone().text();
    if (response.status !== 503 || /\b1102\b|exceeded resource limits/i.test(failure)) {
      suspended = true;
      throw new Error("Worker error or possible resource exhaustion; probes stopped");
    }
  }
  return response;
}
const version = (key) => createHash("sha256").update(key ?? "").digest("base64url");

async function verifyOutput(bucket, key, width, height, alpha, crop) {
  const file = ok(await admin.storage.from(bucket).download(key));
  const buffer = Buffer.from(await file.arrayBuffer());
  const media = await sharp(buffer).metadata();
  assert.equal(file.type, "image/webp");
  assert.equal(media.format, "webp");
  assert.equal(media.width, width);
  assert.equal(media.height, height);
  assert.equal(media.hasAlpha, alpha);
  assert.equal(media.pages ?? 1, 1);
  assert.ok(!media.exif && !media.xmp && !media.icc);
  if (crop !== undefined) {
    const rgba = await sharp(buffer).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(Math.abs(rgba[3] - 102) <= 2);
    assert.ok(crop ? rgba[1] > 140 && rgba[0] < 80 : rgba[0] > 145 && rgba[1] < 80);
  }
  log("persisted_webp", { bucket, width, height, bytes: buffer.length, alpha });
}

try {
  phase = "access";
  for (const [label, path] of [["landing", "/"], ["login", "/login"], ["logo", "/api/barbershop/logo"], ["asset", "/brand/lps.webp"]]) {
    const denied = await request("anonymous_" + label, path, { access: false });
    expectStatus(denied, 302);
    assert.equal(new URL(denied.headers.get("location")).hostname, "orange-star-75c0.cloudflareaccess.com");
  }

  phase = "fixtures";
  const owner = await account("owner");
  const staff = await account("staff");
  const other = await account("owner");
  const shop = await shopFor(owner);
  await shopFor(other);
  ok(await admin.from("barbershop_members").insert({ barbershop_id: shop, user_id: staff.id, role: staff.role }));
  const barber = randomUUID();
  ok(await admin.from("barbers").insert({ id: barber, barbershop_id: shop, name: "Profissional K2-C QA" }));

  if (process.argv.includes("--data-api")) {
    phase = "data_api";
    const visitor = createClient(dbUrl, K2C_PUBLIC_KEY, { auth: { persistSession: false } });
    const customer = ok(await admin.from("customers").insert({ barbershop_id: shop, full_name: "Cliente K2-C", phone: "11999990000" }).select("id").single()).id;
    const service = ok(await admin.from("services").insert({ barbershop_id: shop, name: "Corte QA", duration_minutes: 30, price_cents: 6500 }).select("id").single()).id;
    ok(await admin.from("barber_services").insert({ barbershop_id: shop, barber_id: barber, service_id: service }));
    const start = new Date(Date.now() + 86_400_000);
    start.setUTCHours(13, 0, 0, 0);
    const weekday = start.getUTCDay();
    ok(await admin.from("business_hours").insert({ barbershop_id: shop, weekday, opens_at: "08:00", closes_at: "18:00" }));
    ok(await admin.from("barber_working_hours").insert({ barbershop_id: shop, barber_id: barber, weekday, starts_at: "08:00", ends_at: "18:00" }));
    phase = "data_api_appointment";
    const payload = { barbershop_id: shop, barber_id: barber, customer_id: customer, service_id: service,
      starts_at: start.toISOString(), ends_at: new Date(+start + 1_800_000).toISOString(), price_cents: 1, created_by: other.id };
    const row = ok(await staff.db.from("appointments").insert(payload).select("id,price_cents,created_by,status").single());
    assert.equal(row.price_cents, 6500);
    assert.equal(row.created_by, staff.id);
    assert.equal(row.status, "scheduled");
    for (const client of [staff.db, owner.db]) {
      for (const update of [{ price_cents: 1 }, { created_by: other.id }, { status: "completed" }]) {
        assert.equal((await client.from("appointments").update(update).eq("id", row.id)).error?.code, "23514");
      }
      assert.equal((await client.rpc("finance_capability")).error?.code, "42501");
    }
    ok(await owner.db.from("appointments").update({ status: "confirmed" }).eq("id", row.id));
    ok(await owner.db.from("services").update({ price_cents: 7900 }).eq("id", service));
    const historical = ok(await owner.db.from("appointments").select("price_cents,created_by,status").eq("id", row.id).single());
    assert.deepEqual(historical, { price_cents: 6500, created_by: staff.id, status: "confirmed" });
    assert.deepEqual(ok(await other.db.from("appointments").select("id").eq("id", row.id)), []);
    assert.deepEqual(ok(await other.db.from("customers").select("phone").eq("id", customer)), []);
    assert.equal((await visitor.from("appointments").select("id").eq("id", row.id)).error?.code, "42501");
    assert.equal((await visitor.rpc("finance_capability")).error?.code, "42501");
    log("PASS hosted Data API tenant isolation, PII, permitted transition, historical price and creator, financial RPC denials");
  } else if (process.argv.includes("--profile")) {
    phase = "profile";
    for (const [label, path, actor] of [
      ["login", "/login"], ["dashboard", "/dashboard", owner],
      ["agenda", "/dashboard/agenda", owner], ["qr", "/dashboard/qr", owner],
    ]) {
      const response = await request(label, path, { actor });
      expectStatus(response, 200);
      const document = await response.text();
      const csp = response.headers.get("content-security-policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      assert.ok(nonce && document.includes('nonce="' + nonce + '"'));
      assert.match(response.headers.get("cache-control") ?? "", /no-store|private/);
      assert.ok(!/\bunsafe-eval\b/.test(csp));
    }
    const response = await request("dashboard_access_without_app_session", "/dashboard");
    expectStatus(response, [302, 303, 307]);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
    log("PASS private HTML, nonce CSP and separated Access/application sessions");
    const loginAction = process.env.K2C_LOGIN_ACTION_ID;
    if (loginAction) {
      assert.match(loginAction, /^[a-f0-9]{42}$/);
      const actionHeaders = { origin, "content-type": "text/plain;charset=UTF-8", "next-action": loginAction, accept: "text/x-component" };
      const invalid = await request("login_action_zod_invalid", "/login", { method: "POST", headers: actionHeaders, body: JSON.stringify([{}]) });
      expectStatus(invalid, 200);
      assert.match(await invalid.text(), /Revise os campos destacados/);
      const valid = await request("login_action_valid", "/login", {
        method: "POST", headers: actionHeaders, body: JSON.stringify([owner.credentials, "/dashboard"]),
      });
      expectStatus(valid, [200, 303]);
      assert.match(valid.headers.get("x-action-redirect") ?? valid.headers.get("location") ?? "", /^\/dashboard(?:;|$)/);
      assert.ok(valid.headers.getSetCookie().some((line) => line.startsWith("sb-kffhoimijhsddodqxezs-auth-token")));
    }
  } else {
    phase = "media";
    const { png, jpeg, webp, animatedWebp, oversizedPixels, brokenPng } = await uploadImages();
    const badPixels = Buffer.concat([
      png.subarray(0, 33), pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0, 0, 0, 0])), pngChunk("IEND", Buffer.alloc(0)),
    ]);
    const atPixelLimit = await sharp({
      create: { width: 4000, height: 4000, channels: 3, background: "#506080" },
    }).png().toBuffer();
    const routes = [
      { name: "logo", bucket: "barbershop-logos", prefix: shop, path: "/api/barbershop/logo",
        read: async () => ok(await admin.from("barbershops").select("logo_url").eq("id", shop).single()).logo_url,
        headers: (key) => ({ "x-logo-shop": shop, "x-logo-version": version(key) }) },
      { name: "photo", bucket: "barber-photos", prefix: shop + "/" + barber, path: "/api/equipe/foto/" + barber,
        read: async () => ok(await admin.from("barbers").select("avatar_url").eq("id", barber).single()).avatar_url,
        headers: (key) => ({ "x-photo-version": encodeURIComponent(key ?? "") }) },
    ];
    for (const route of routes) {
      const change = (label, key, body, mime, account = owner, requestOrigin = origin) => request(route.name + "_" + label, route.path, {
        actor: account, method: body ? "POST" : "DELETE", body,
        headers: { origin: requestOrigin, "content-type": mime, ...route.headers(key) },
      });
      const list = async () => ok(await admin.storage.from(route.bucket).list(route.prefix));
      const logo = route.name === "logo";
      expectStatus(await change("staff", null, png, "image/png", staff), 403);
      expectStatus(await change("other_tenant", null, png, "image/png", other), logo ? 409 : 403);
      expectStatus(await request(route.name + "_foreign_origin", route.path, { actor: owner, method: "POST", body: png,
        headers: { ...route.headers(null), "content-type": "image/png", origin: "https://qa-origin.example.test",
          "x-forwarded-host": new URL(origin).host, "x-forwarded-proto": "https" } }), 403);
      for (const [format, bytes, width, height, alpha, crop] of [
        ["png", png, 1200, 600, true, !logo], ["jpeg", jpeg, 600, 1200, false],
        ["webp", webp, 1200, 600, true], ["png", atPixelLimit, 1200, 1200, false],
      ]) {
        expectStatus(await change("valid_" + format, await route.read(), bytes, "image/" + format), 200);
        const ref = await route.read();
        assert.ok(ref.startsWith(route.prefix + "/") && ref.endsWith(".webp"));
        await verifyOutput(route.bucket, ref, logo ? width : 480, logo ? height : 480, alpha, crop);
        assert.equal((await list()).length, 1);
      }
      const current = await route.read();
      for (const [label, bytes, mime] of [
        ["wrong_mime", jpeg, "image/png"], ["broken_crc", brokenPng, "image/png"],
        ["animated", animatedWebp, "image/webp"], ["oversized_pixels", oversizedPixels, "image/png"],
        ["oversized_file", Buffer.alloc(2 * 1024 * 1024 + 1), "image/png"], ["decode_failure", badPixels, "image/png"],
      ]) {
        expectStatus(await change(label, current, bytes, mime), label === "decode_failure" ? [400, 503] : 400);
        assert.equal(await route.read(), current);
        assert.equal((await list()).length, 1);
      }
      const race = await Promise.allSettled([
        change("concurrent_a", current, png, "image/png"), change("concurrent_b", current, webp, "image/webp"),
      ]);
      assert.deepEqual(race.map((result) => result.value?.status).sort(), [200, 409]);
      const winner = await route.read();
      assert.notEqual(winner, current);
      assert.equal((await list()).length, 1);
      if (!logo) {
        const image = await request("photo_private", route.path, { actor: owner });
        expectStatus(image, 200);
        assert.match(image.headers.get("cache-control"), /private, no-store/);
        expectStatus(await request("photo_other_tenant_read", route.path, { actor: other }), 404);
        assert.ok((await other.db.storage.from(route.bucket).download(winner)).error);
      }
      expectStatus(await change("stale_delete", current), 409);
      expectStatus(await change("delete", winner), 200);
      assert.equal(await route.read(), null);
      assert.equal((await list()).length, 0);
    }
    log("PASS hosted media matrix");
  }
} catch (error) {
  log("FAIL", { phase, message: error.code === "ERR_ASSERTION" && error.message.includes("Unexpected status") ? error.message : error.cause?.code ?? error.name, suspended: !!suspended });
  process.exitCode = 1;
} finally {
  try {
    for (const shop of shops) {
      for (const bucket of ["barbershop-logos", "barber-photos"]) {
        const storage = admin.storage.from(bucket);
        const leaves = ok(await storage.list(shop));
        const keys = [];
        for (const leaf of leaves) {
          if (leaf.id) keys.push(shop + "/" + leaf.name);
          else {
            const dir = shop + "/" + leaf.name;
            keys.push(...ok(await storage.list(dir)).filter(({ id }) => id).map(({ name }) => dir + "/" + name));
          }
        }
        if (keys.length) ok(await storage.remove(keys));
      }
      ok(await admin.from("barbershops").delete().eq("id", shop));
    }
    for (const id of accountIds) ok(await admin.auth.admin.deleteUser(id));
    log("PASS synthetic fixture cleanup");
  } catch {
    log("FAIL synthetic fixture cleanup");
    process.exitCode = 1;
  }
}
