import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Run only against a newly provisioned QA stack and a build compiled for its URL.
const project = process.env.B2A2_QA_PROJECT ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nextURL = "http://127.0.0.1:59130";
assert.match(project, /^b2a2-app-\d+$/);
assert.equal(url, "http://127.0.0.1:59121");
const container = "supabase_db_" + project;
assert.match(execFileSync("docker", ["port", "supabase_kong_" + project, "8000/tcp"], { encoding: "utf8" }), /:59121\b/);
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const manifests = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actions = Object.fromEntries(Object.entries(manifests.node).map(([id, entry]) => [entry.exportedName, id]));
const ids = () => randomUUID();
const slug = () => "qa-" + ids();
function sql(command) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "postgres"], { input: command, encoding: "utf8" }).trim();
}
async function session() {
  const email = ids() + "@example.test";
  const password = ids() + "aB!";
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(result.error);
  const jar = new Map();
  const client = createServerClient(url, anon, { cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)),
  } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { client, id: login.data.user.id, cookies: () => Array.from(jar, ([k,v]) => k + "=" + v).join("; ") };
}
let server;
async function stopNext() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
}
async function startNext(enabled) {
  await stopNext();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "59130"],
    { windowsHide: true, stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_APP_URL: nextURL,
      ASAAS_API_KEY: "", ASAAS_WEBHOOK_TOKEN: "", MANUAL_TRIAL_ONBOARDING_ENABLED: String(enabled) } });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error("QA Next failed to start");
    const r = await fetch(nextURL + "/login").catch(() => null);
    if (r?.ok) return;
    await pause(150);
  }
  throw new Error("QA Next did not become ready");
}
async function action(actor, name, args, path = "/onboarding") {
  assert.ok(actions[name], name);
  const res = await fetch(nextURL + path, { method: "POST", redirect: "manual",
    headers: { "next-action": actions[name], origin: nextURL, "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component", cookie: actor.cookies() }, body: JSON.stringify(args) });
  return { res, body: await res.text() };
}
const legacy = "create_barbershop";
const manual = "create_barbershop_with_manual_trial";
const fields = { name: "Barbearia QA", slug: slug(), phone: "", timezone: "America/Sao_Paulo" };
const params = { p_name: fields.name, p_slug: fields.slug, p_phone: null, p_timezone: fields.timezone };
const intent = ids();
const args = { ...params, p_intent_id: intent };
function denied(reply, code = "42501") { assert.equal(reply.error?.code, code, reply.error?.message); }
function confirmed(reply) {
  assert.match(reply.res.headers.get("x-action-redirect") ?? "", /^\/dashboard/);
  const cookie = reply.res.headers.getSetCookie().find(value => value.startsWith("lps.active_barbershop="));
  assert.ok(cookie);
  const shop = cookie.split(";")[0].split("=")[1];
  assert.match(shop, /^[a-f\d-]{36}$/);
  return shop;
}
function pass(label) { console.log("PASS " + label); }
assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
try {
  const owner = await session(), staff = await session(), other = await session();
  await startNext(false);
  const legacyShop = confirmed(await action(other, "createBarbershopAction", [{ ...fields, slug: slug() }]));
  assert.equal(sql("select count(*) from public.subscriptions where barbershop_id='" + legacyShop + "'"), "0");
  pass("Next off and DB off use legacy onboarding over HTTP");
  denied(await owner.client.rpc(manual, args));
  await startNext(true);
  const off = await action(owner, "createBarbershopAction", [fields, intent]);
  assert.match(off.body, /cadastro não está disponível/);
  assert.equal(off.res.headers.get("x-action-redirect"), null);
  pass("DB off rejects manual RPC and the enabled Next action");
  sql("update private.manual_trial_activation set enabled=true");
  denied(await owner.client.rpc(legacy, { ...params, p_slug: slug() }));
  denied(await owner.client.from("barbershops").insert({ name: fields.name, slug: slug() }));
  denied(await admin.from("barbershops").insert({ name: fields.name, slug: slug() }));
  denied(await owner.client.rpc("authorize_manual_trial_intent", { ...args, p_actor: owner.id }));
  denied(await owner.client.rpc(manual, args));
  pass("PostgREST enforces both gates for RPC and direct table writes");
  const create = () => action(owner, "createBarbershopAction", [fields, intent]);
  const [a,b] = await Promise.all([create(),create()]);
  const shop = confirmed(a);
  assert.equal(confirmed(b), shop);
  assert.equal(confirmed(await create()), shop);
  const counts = sql(`select
    (select count(*) from public.barbershop_members where barbershop_id='${shop}' and role='owner'),
    (select count(*) from public.subscriptions s join public.plans p on p.id=s.plan_id where barbershop_id='${shop}'
      and gateway='manual_pix' and status='trialing' and p.code='basico' and agreement_at is null
      and trial_ends_at-trial_started_at=interval '168 hours'),
    (select count(*) from public.payments where barbershop_id='${shop}')`);
  assert.equal(counts,"1|1|0");
  pass("parallel Next submissions and replay return same cookie and dashboard redirect; one 168-hour trial, zero invoices");
  const conflict = await action(other, "createBarbershopAction", [fields, intent]);
  assert.match(conflict.body, /identificador já está em uso/);
  assert.ok(!conflict.body.includes(shop));
  pass("cross-user slug collision gives a field error");
  const page = await fetch(nextURL + "/dashboard/plano", { headers: { cookie: owner.cookies() } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /LPS Solutions/);
  assert.match(html, /Teste gratuito/);
  assert.doesNotMatch(html, /Asaas Sandbox/);
  for (const [name,input] of [["startSubscriptionAction",{ planId:ids(),billingType:"pix",holderName:"QA Titular",document:"52998224725" }],
    ["changePlanAction",{planId:ids()}],["cancelSubscriptionAction",{}]]) {
    const result = await action(owner,name,[input],"/dashboard/plano");
    assert.match(result.body,/contratação online/);
  }
  pass("dashboard renders the manual trial and three legacy Next billing actions reject it");
  sql(`insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${staff.id}','staff')`);
  const projection = await owner.client.rpc("get_owner_manual_trial", {p_shop: shop});
  assert.ifError(projection.error);
  assert.equal(projection.data.days_left,7);
  assert.deepEqual(Object.keys(projection.data).sort(), ["access","days_left","next_step","plan","reason","trial_end","trial_start","trial_state"]);
  assert.equal(projection.data.trial_state,"running");
  assert.equal(projection.data.next_step,"contact_lps");
  for (const actor of [staff,other]) denied(await actor.client.rpc("get_owner_manual_trial", {p_shop:shop}));
  const raw = await owner.client.from("subscriptions").select("id").eq("barbershop_id",shop);
  assert.ifError(raw.error);
  assert.deepEqual(raw.data,[]);
  pass("PostgREST exposes owner projection only and preserves financial RLS");
  const barber = ids(), service = ids(), customer = ids(), appointment = ids();
  sql(`insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','QA Barber');
    insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values ('${service}','${shop}','QA Service',30,1000);
    insert into public.customers(id,barbershop_id,full_name) values ('${customer}','${shop}','QA Client');`);
  denied(await owner.client.from("barbers").insert({barbershop_id:shop,name:"QA second"}),"23514");
  const booking = {id:appointment, barbershop_id:shop, barber_id:barber,service_id:service,customer_id:customer,
    starts_at:"2031-01-02T12:00:00Z",ends_at:"2031-01-02T12:30:00Z",price_cents:1000};
  assert.ifError((await owner.client.from("appointments").insert(booking)).error);
  sql(`update public.subscriptions set trial_started_at='2020-01-01Z',trial_ends_at='2020-01-08Z' where barbershop_id='${shop}'`);
  const expiredPage = await fetch(nextURL + "/dashboard/plano", { headers: { cookie: owner.cookies() } });
  assert.equal(expiredPage.status,200);
  const expiredHtml = await expiredPage.text();
  assert.match(expiredHtml,/Teste encerrado/);
  assert.match(expiredHtml,/0 dias restantes/);
  assert.match(expiredHtml,/LPS Solutions/);
  denied(await owner.client.from("appointments").insert({...booking,id:ids(),starts_at:"2031-01-03T12:00Z",ends_at:"2031-01-03T12:30Z"}),"P0001");
  denied(await owner.client.from("appointments").update({starts_at:"2031-01-04T12:00Z",ends_at:"2031-01-04T12:30Z"}).eq("id",appointment),"P0001");
  const kept = await owner.client.from("appointments").select("starts_at").eq("id",appointment).single();
  assert.ifError(kept.error);
  assert.equal(Date.parse(kept.data.starts_at),Date.parse(booking.starts_at));
  pass("direct booking and rescheduling obey expiry, retained booking readable, Basic limit enforced");
  await startNext(false);
  const mismatch = await action(other,"createBarbershopAction",[{...fields,slug:slug()}]);
  assert.match(mismatch.body,/cadastro não está disponível/);
  pass("Next off with DB on cannot create a legacy shop");
} finally {
  try { sql("update private.manual_trial_activation set enabled=false"); }
  finally { await stopNext(); }
}
assert.equal(sql("select enabled from private.manual_trial_activation"),"f");
pass("QA DB flag off and isolated Next server stopped");
