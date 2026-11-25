import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { admin, ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const [owner, staff, stranger] = await Promise.all([session(), session(), session()]);
const shop = ids(), other = ids(), barber = ids(), foreignCustomer = ids();
const xss = '<img src=x onerror="window.i4Xss=1">';
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','I4 HTTP','qa-${shop}'),('${other}','I4 OTHER','qa-${other}');
 insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${other}','${stranger.id}','owner');
 insert into public.barbers(id,barbershop_id,name) values ('${barber}','${other}','Private photo');
 insert into public.customers(id,barbershop_id,full_name) values ('${foreignCustomer}','${other}','I4 private customer');`);
assert.ifError((await owner.client.from("customers").insert({ barbershop_id: shop, full_name: xss })).error);
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const get = (path, actor) => fetch(nextURL + path, { redirect: "manual", headers: { cookie: actor?.cookies() ?? "" } });
try {
  await startNext(false);
  for (const actor of [owner, staff]) {
    assert.deepEqual((await actor.client.from("customers").select("id").eq("id", foreignCustomer)).data, []);
    assert.deepEqual((await actor.client.from("customers").update({ full_name: "unauthorized" }).eq("id", foreignCustomer).select("id")).data, []);
    assert.ok((await actor.client.from("customers").insert({ barbershop_id: other, full_name: "unauthorized" })).error);
    assert.equal((await get("/api/equipe/foto/" + barber, actor)).status, 404);
    assert.ok((await actor.client.rpc("finance_capability")).error);
  }
  assert.ok((await anonymous.from("customers").select("id")).error);
  for (const client of [anonymous, owner.client, admin]) {
    assert.equal((await client.schema("private").rpc("process_manual_overdue", { batch_size: 1 })).error?.code, "PGRST106");
  }
  console.log("PASS Data API: tenant isolation, anon denial, private schema hidden, finance denied, private photo IDOR denied");
  const login = await get("/login");
  const html = await login.text();
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-frame-options"), "DENY");
  assert.equal(login.headers.get("x-content-type-options"), "nosniff");
  assert.doesNotMatch(login.headers.get("strict-transport-security"), /preload|includeSubDomains/);
  const report = login.headers.get("content-security-policy-report-only");
  const nonce = /'nonce-([^']+)'/.exec(report)?.[1];
  assert.ok(nonce);
  for (const script of html.matchAll(/<script\b[^>]*>/g)) assert.ok(script[0].includes('nonce="' + nonce + '"'), "Script nonce mismatch: " + script[0]);
  assert.notEqual((await get("/login")).headers.get("content-security-policy-report-only"), report);
  assert.equal((await get("/dashboard")).status, 307);
  const version = createHash("sha256").update("").digest("base64url");
  const headers = { cookie: owner.cookies(), origin: "https://invalid.example", "x-logo-shop": shop, "x-logo-version": version };
  assert.equal((await fetch(nextURL + "/api/barbershop/logo", { method: "DELETE", headers })).status, 403);
  const manifests = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const actionId = Object.entries(manifests.node).find(([,v]) => v.exportedName === "createCustomerAction")[0];
  const before = sql(`select count(*) from public.customers where barbershop_id='${shop}'`);
  const csrf = await fetch(nextURL + "/dashboard/clientes", { method: "POST", headers: {
    cookie: owner.cookies(), origin: "https://invalid.example", "next-action": actionId, "content-type": "text/plain;charset=UTF-8",
  }, body: JSON.stringify([{ fullName: "CSRF", phone: "11987654321", email: "", notes: "" }]) });
  assert.ok(csrf.status >= 400);
  assert.equal(sql(`select count(*) from public.customers where barbershop_id='${shop}'`), before);
  console.log("PASS per-request CSP nonce on all login scripts, security headers, anonymous redirect and cross-origin mutation rejection");
  const context = await browser.newContext();
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await context.addCookies(owner.cookies().split("; ").map(pair => {
    const split = pair.indexOf("=");
    return { name: pair.slice(0, split), value: pair.slice(split + 1), url: nextURL };
  }));
  const page = await context.newPage();
  await page.goto(nextURL + "/dashboard/clientes");
  await page.getByText(xss, { exact: true }).first().waitFor();
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  assert.equal(await page.evaluate(() => window.i4Xss), undefined);
  await page.goto(nextURL + "/dashboard/clientes?busca=" + encodeURIComponent("'),id.not.is.null;drop table customers;--"));
  assert.equal(sql(`select count(*) from public.customers where barbershop_id='${shop}'`), before);
  console.log("PASS stored HTML rendered as text and hostile search input preserves data");
  // Concurrent atomic limiter claims, then exercise the actual upload route.
  const bucket = "images:" + createHash("sha256").update(shop).digest("hex");
  const claims = await Promise.all(Array.from({ length: 31 }, () => admin.rpc("consume_booking_rate_limit", {
    p_bucket: bucket, p_limit: 30, p_window_seconds: 300,
  })));
  claims.forEach(result => assert.ifError(result.error));
  assert.equal(claims.filter(result => result.data === true).length, 30);
  const limited = await fetch(nextURL + "/api/barbershop/logo", { method: "DELETE", headers: { ...headers, origin: nextURL } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "300");
  console.log("PASS exactly 30 of 31 concurrent tenant image claims allowed; real route returns 429");
  await context.close();
  // The full policy is opt-in until hosted homologation. Test enforcement locally.
  process.env.CSP_ENFORCE = "true";
  await startNext(false);
  const strict = await browser.newContext();
  await strict.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await strict.route(nextURL + "/login", async route => {
    const original = await route.fetch();
    const html = (await original.text()).replace(/<head[^>]*>/, tag => tag + '<script id="i4-csp-probe">window.i4Injected = 1</script>');
    await route.fulfill({ response: original, body: html });
  });
  const strictPage = await strict.newPage();
  const response = await strictPage.goto(nextURL + "/login");
  assert.ok(response.headers()["content-security-policy"].includes("strict-dynamic"));
  await strictPage.getByLabel("E-mail", { exact: true }).fill("synthetic@example.test");
  assert.equal(await strictPage.locator("#i4-csp-probe").count(), 1);
  assert.equal(await strictPage.evaluate(() => window.i4Injected), undefined);
  assert.ok(await strictPage.locator("html").getAttribute("class"));
  console.log("PASS strict CSP in Chrome: theme script and input hydration work; unnonced inline script blocked");
  await strict.close();
} finally {
  await browser.close();
  await stopNext();
  delete process.env.CSP_ENFORCE;
}
