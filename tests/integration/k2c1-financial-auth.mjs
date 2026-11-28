import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const app = "https://lps-agenda-staging.lpsagenda-qa.workers.dev";
const ref = "kffhoimijhsddodqxezs";
const supabase = "https://" + ref + ".supabase.co";
const { K2C_URL, K2C_DB_URL, K2C_ACCESS, K2C_PUBLIC_KEY, K2C_SERVER_KEY,
  K2C_LOGIN_ACTION_ID, K2C_LOGOUT_ACTION_ID } = process.env;
assert.equal(K2C_URL, app);
assert.equal(K2C_DB_URL, supabase);
assert.ok(K2C_ACCESS);
for (const [key, role] of [[K2C_PUBLIC_KEY, "anon"], [K2C_SERVER_KEY, "service_role"]]) {
  const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
  assert.equal(claims.ref, ref);
  assert.equal(claims.role, role);
}
for (const id of [K2C_LOGIN_ACTION_ID, K2C_LOGOUT_ACTION_ID]) assert.match(id ?? "", /^[a-f0-9]{42}$/);

const run = "k2c1-" + randomUUID();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabase, K2C_SERVER_KEY, options);
const accounts = [];
let phase = "preflight";
let grants = false;

function query(sql) {
  try {
    return execFileSync(process.execPath, [
      resolve("node_modules/supabase/dist/supabase.js"), "db", "query",
      "--remote=" + ref, "--yes", "--output", "json", sql,
    ], { encoding: "utf8", timeout: 25_000, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch {
    throw new Error("Staging SQL did not complete");
  }
}
function ok(result) {
  if (result.error) throw new Error("unexpected Supabase response", { cause: result.error });
  return result.data;
}
function accessToken(db) {
  return db.auth.getSession().then(result => ok(result).session.access_token);
}
function rpcWithToken(token) {
  return createClient(supabase, K2C_PUBLIC_KEY, {
    ...options, global: { headers: { Authorization: "Bearer " + token } },
  });
}
async function fixture(label) {
  const credentials = { email: run + "-" + label + "@example.test", password: randomUUID() + "Qa!7" };
  const { user } = ok(await admin.auth.admin.createUser({ ...credentials, email_confirm: true }));
  assert.match(user.id, /^[a-f0-9-]{36}$/);
  accounts.push(user.id);
  const jar = new Map();
  const db = createServerClient(supabase, K2C_PUBLIC_KEY, {
    auth: { autoRefreshToken: false },
    cookies: {
      getAll: () => [...jar.values()],
      setAll: items => items.forEach(item => jar.set(item.name, item)),
    },
  });
  ok(await db.auth.signInWithPassword(credentials));
  return { user, db, credentials, cookie: () => [...jar.values()].map(({ name, value }) => name + "=" + value).join("; ") };
}
function codeFor(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const base32 = [...secret.toUpperCase().replace(/=+$/, "")].map(char => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const key = Buffer.from((base32.match(/.{8}/g) ?? []).map(byte => Number.parseInt(byte, 2)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
async function upgrade(db) {
  const factor = ok(await db.auth.mfa.enroll({ factorType: "totp" }));
  ok(await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codeFor(factor.totp.secret) }));
  assert.equal(ok(await db.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel, "aal2");
  return factor;
}
async function worker(path, init = {}) {
  const response = await fetch(app + path, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(12_000),
    headers: { "cf-access-token": K2C_ACCESS, ...init.headers },
  });
  assert.ok(response.status < 500, "Worker returned a server error; stop");
  return response;
}
async function redirectPath(response) {
  const header = response.headers.get("location") ?? response.headers.get("x-action-redirect")?.split(";")[0];
  const meta = header ? null : /<meta[^>]*http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/i.exec(await response.text());
  const dest = header ?? meta?.[1];
  assert.ok(dest);
  const target = new URL(dest, app);
  assert.equal(target.origin, app);
  return target.pathname;
}
function authCookies(response) {
  return response.headers.getSetCookie().filter(cookie => cookie.startsWith("sb-" + ref + "-auth-token"));
}
function authPost(id, cookie) {
  return { origin: app, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8",
    "next-action": id, ...(cookie ? { cookie } : {}) };
}

try {
  assert.ok(query("select case when to_regprocedure('private.has_live_financial_totp(uuid)') is null then 'K2C1_NOT_READY' else 'K2C1_READY' end as gate").includes("K2C1_READY"));
  phase = "synthetic_accounts";
  const manager = await fixture("manager");
  const operator = await fixture("operator");
  const ordinary = await fixture("ordinary");
  const uid = fixture => fixture.user.id;
  grants = true;
  query(`insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
      values ('${uid(manager)}','manager',session_user,'${run}'),
             ('${uid(operator)}','operator',session_user,'${run}');`);

  phase = "before_worker_aal1";
  assert.equal((await operator.db.rpc("finance_capability")).error?.code, "LP037");
  phase = "protected_worker_aal1_redirect";
  const a = await worker("/admin/assinaturas", { headers: { cookie: operator.cookie() } });
  assert.equal(await redirectPath(a), "/admin/mfa");
  phase = "protected_worker_aal1_form";
  const form = await worker("/admin/mfa", { headers: { cookie: operator.cookie() } });
  assert.equal(form.status, 200);
  assert.match(await form.text(), /Confirmação em duas etapas/);
  phase = "protected_worker_aal1_csp";
  assert.match(form.headers.get("content-security-policy") ?? "", /'nonce-[^']+' 'strict-dynamic'/);

  phase = "direct_negative";
  for (const account of [manager, operator]) {
    assert.equal((await account.db.rpc("finance_capability")).error?.code, "LP037");
    const denied = await account.db.rpc("finance_confirm_pix", {
      op: randomUUID(), shop: randomUUID(), contract: randomUUID(), invoice: randomUUID(),
      received_cents: 1, credited_at: new Date().toISOString(), checked: true,
    });
    assert.equal(denied.error?.code, "LP037");
  }
  assert.equal((await ordinary.db.rpc("finance_capability")).error?.code, "42501");
  console.log("PASS AAL1 role holders blocked by server, SQL reads and direct Pix RPC; ordinary user denied");

  phase = "direct_aal2_and_audit";
  const priorFactor = await upgrade(operator.db);
  await upgrade(manager.db);
  await upgrade(ordinary.db);
  assert.equal(ok(await operator.db.rpc("finance_capability")), "operator");
  assert.equal(ok(await manager.db.rpc("finance_capability")), "manager");
  assert.equal((await ordinary.db.rpc("finance_capability")).error?.code, "42501");
  assert.equal((await operator.db.rpc("finance_operator_list")).error?.code, "42501");
  assert.ok(ok(await manager.db.rpc("finance_operator_list")).some(row => row.user_id === uid(operator)));
  for (const account of [manager, operator]) {
    const page = await worker("/admin/assinaturas", { headers: { cookie: account.cookie() } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("cache-control") ?? "", /private|no-store/);
  }

  ok(await manager.db.rpc("finance_operator", { target: uid(ordinary), permission: "operator", reason: run }));
  assert.equal(ok(await ordinary.db.rpc("finance_capability")), "operator");
  ok(await manager.db.rpc("finance_operator", { target: uid(ordinary), permission: "revoke", reason: run }));
  assert.equal((await ordinary.db.rpc("finance_capability")).error?.code, "42501");
  const audit = ok(await manager.db.rpc("finance_operator_list"));
  assert.ok(audit.some(row => row.user_id === uid(ordinary) && row.revoked_at));
  assert.ok(query(`select case when exists(select from private.financial_operators
      where user_id='${uid(ordinary)}' and granted_by='${uid(manager)}' and revoked_by='${uid(manager)}'
      and grant_reason='${run}' and revoke_reason='${run}') then 'K2C1_AUDIT_OK' else 'FAILED' end as audit;`).includes("K2C1_AUDIT_OK"));
  console.log("PASS live TOTP AAL2 roles and private server pages, manager-only grant/revoke and durable audit actor");

  phase = "refresh_and_revocation";
  const refreshed = ok(await operator.db.auth.refreshSession()).session;
  assert.ok(refreshed.refresh_token);
  assert.equal(ok(await operator.db.rpc("finance_capability")), "operator");
  const beforeSignout = await accessToken(operator.db);
  ok(await operator.db.auth.signOut({ scope: "global" }));
  assert.equal((await rpcWithToken(beforeSignout).rpc("finance_capability")).error?.code, "LP037");
  assert.ok((await createClient(supabase, K2C_PUBLIC_KEY, options).auth.refreshSession({ refresh_token: refreshed.refresh_token })).error);

  phase = "staging_factor_recovery";
  ok(await manager.db.rpc("finance_operator", { target: uid(operator), permission: "revoke", reason: run }));
  ok(await admin.auth.admin.mfa.deleteFactor({ id: priorFactor.id, userId: uid(operator) }));
  ok(await operator.db.auth.signInWithPassword(operator.credentials));
  assert.equal((await operator.db.rpc("finance_capability")).error?.code, "42501");
  const replacement = await upgrade(operator.db);
  assert.notEqual(replacement.id, priorFactor.id);
  assert.equal((await operator.db.rpc("finance_capability")).error?.code, "42501");
  ok(await manager.db.rpc("finance_operator", { target: uid(operator), permission: "operator", reason: run }));
  assert.equal(ok(await operator.db.rpc("finance_capability")), "operator");
  console.log("PASS synthetic recovery withdraws grant, replaces lost factor and restores only after verified TOTP and manager approval");

  phase = "session_expiry";
  const signedManager = await accessToken(manager.db);
  const targetSession = JSON.parse(Buffer.from(signedManager.split(".")[1], "base64url")).session_id;
  assert.match(targetSession, /^[a-f0-9-]{36}$/);
  query(`update auth.sessions set not_after=now()-interval '1 second' where id='${targetSession}' and user_id='${uid(manager)}';`);
  assert.equal((await rpcWithToken(signedManager).rpc("finance_capability")).error?.code, "LP037");
  console.log("PASS AAL2 refresh retained scope, revoked token and expired session denied directly");

  phase = "worker_secure_cookie";
  const login = await worker("/login", { method: "POST", headers: authPost(K2C_LOGIN_ACTION_ID),
    body: JSON.stringify([ordinary.credentials, "/dashboard"]) });
  assert.equal(await redirectPath(login), "/dashboard");
  const session = authCookies(login).filter(cookie => !/; Max-Age=0/i.test(cookie));
  assert.ok(session.length);
  for (const cookie of session) {
    assert.match(cookie, /; Secure\b/i);
    assert.match(cookie, /; SameSite=Lax\b/i);
    assert.doesNotMatch(cookie, /; HttpOnly\b/i);
  }
  const appCookie = session.map(cookie => cookie.split(";")[0]).join("; ");
  const protectedRoute = await worker("/dashboard", { headers: { cookie: appCookie } });
  assert.equal(await redirectPath(protectedRoute), "/onboarding");
  const logout = await worker("/dashboard", { method: "POST", headers: authPost(K2C_LOGOUT_ACTION_ID, appCookie), body: "[]" });
  assert.equal(await redirectPath(logout), "/login");
  assert.ok(authCookies(logout).some(cookie => /; Max-Age=0/i.test(cookie) && /; Secure\b/i.test(cookie)));
  assert.equal(await redirectPath(await worker("/dashboard", { headers: { cookie: appCookie } })), "/login");
  const invalid = await worker("/api/barbershop/logo", { method: "DELETE",
    headers: { origin: "https://origin-qa.example.test", "x-forwarded-host": new URL(app).host,
      "x-forwarded-proto": "https", cookie: appCookie } });
  assert.equal(invalid.status, 403);
  console.log("PASS HTTPS login Secure/SameSite=Lax SDK cookie, logout clears and revokes session, foreign origin denied");
} catch (error) {
  const line = error.stack?.match(/k2c1-financial-auth\.mjs:(\d+)/)?.[1];
  console.log("FAIL synthetic acceptance " + phase + " " + (error.cause?.code ?? error.name) + (line ? " at " + line : ""));
  process.exitCode = 1;
} finally {
  try {
    if (grants) query(`delete from private.financial_operators
      where grant_reason='${run}' and user_id in (${accounts.map(id => "'" + id + "'").join(",")});`);
    for (const id of accounts) ok(await admin.auth.admin.deleteUser(id));
    console.log("PASS exact financial and Auth fixtures removed");
  } catch {
    console.log("FAIL synthetic cleanup requires operator verification");
    process.exitCode = 1;
  }
}
