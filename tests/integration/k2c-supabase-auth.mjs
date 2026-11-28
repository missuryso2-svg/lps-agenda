import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as pause } from "node:timers/promises";

const url = "https://kffhoimijhsddodqxezs.supabase.co";
const origin = "https://lps-agenda-staging.lpsagenda-qa.workers.dev";
const { K2C_URL, K2C_DB_URL, K2C_ACCESS, K2C_PUBLIC_KEY, K2C_SERVER_KEY } = process.env;
assert.equal(K2C_DB_URL, url);
assert.equal(K2C_URL, origin);
assert.ok(K2C_ACCESS);
for (const [key, role] of [[K2C_PUBLIC_KEY, "anon"], [K2C_SERVER_KEY, "service_role"]]) {
  const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
  assert.equal(payload.ref, "kffhoimijhsddodqxezs");
  assert.equal(payload.role, role);
}
const make = (key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = make(K2C_SERVER_KEY);
const actor = make(K2C_PUBLIC_KEY);
const visitor = make(K2C_PUBLIC_KEY);
const ids = [];
let phase = "settings";
function ok(result) {
  if (result.error) throw new Error("Unexpected Supabase error", { cause: result.error });
  return result.data;
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let packed = 0, bits = 0;
  const key = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const value = alphabet.indexOf(char);
    assert.ok(value >= 0);
    packed = (packed << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push((packed >> bits) & 255);
    }
  }
  const steps = Buffer.alloc(8);
  steps.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(key)).update(steps).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

try {
  const response = await fetch(url + "/auth/v1/settings", { headers: { apikey: K2C_PUBLIC_KEY } });
  assert.ok(response.ok && (await response.json()).disable_signup);
  assert.equal((await visitor.from("appointments").select("id").limit(1)).error?.code, "42501");
  console.log("PASS anonymous Data API appointment denial and hosted signup disabled");

  phase = "callback";
  const mailFixture = { email: "k2c-link-" + randomUUID() + "@example.test", password: randomUUID() + "Qa!7" };
  const signup = ok(await admin.auth.admin.generateLink({ type: "signup", ...mailFixture }));
  ids.push(signup.user.id);
  const callback = async (type, token, next) => {
    const params = new URLSearchParams({ token_hash: token, type, next });
    return fetch(origin + "/auth/callback?" + params, {
      redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "cf-access-token": K2C_ACCESS },
    });
  };
  const confirmation = await callback("signup", signup.properties.hashed_token, "//qa-origin.example.test");
  assert.equal(confirmation.status, 307);
  assert.equal(new URL(confirmation.headers.get("location")).href, origin + "/dashboard");
  const cookie = confirmation.headers.getSetCookie().find((line) => /^sb-kffhoimijhsddodqxezs-auth-token(?:\.\d+)?=/.test(line));
  assert.match(cookie ?? "", /; Path=\//i);
  assert.match(cookie ?? "", /; SameSite=Lax/i);
  assert.equal((await make(K2C_PUBLIC_KEY).auth.signInWithPassword(mailFixture)).error, null);
  const replay = await callback("signup", signup.properties.hashed_token, "/dashboard");
  assert.equal(new URL(replay.headers.get("location")).pathname, "/login");
  const recovery = ok(await admin.auth.admin.generateLink({ type: "recovery", email: mailFixture.email }));
  const reset = await callback("recovery", recovery.properties.hashed_token, "/redefinir-senha");
  assert.equal(reset.status, 307);
  assert.equal(new URL(reset.headers.get("location")).href, origin + "/redefinir-senha");
  const reused = await callback("recovery", recovery.properties.hashed_token, "/redefinir-senha");
  assert.equal(new URL(reused.headers.get("location")).pathname, "/login");
  console.log("PASS hosted signup/recovery tokens accepted only once, callback targets internal and staging Auth cookie set");
  console.log("INFO staging Auth cookie attributes secure=" + /; Secure\b/i.test(cookie) + " httpOnly=" + /; HttpOnly\b/i.test(cookie));
  console.log("INFO signup and recovery links used Auth Admin generateLink; SMTP delivery was not exercised");
  const resetAction = process.env.K2C_RESET_ACTION_ID;
  if (resetAction) {
    assert.match(resetAction, /^[a-f0-9]{42}$/);
    const recoveredCookies = reset.headers.getSetCookie()
      .filter((line) => line.startsWith("sb-kffhoimijhsddodqxezs-auth-token") && !/; Max-Age=0/i.test(line))
      .map((line) => line.split(";")[0]).join("; ");
    assert.ok(recoveredCookies);
    const password = randomUUID() + "Qa!9";
    const changed = await fetch(origin + "/redefinir-senha", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "cf-access-token": K2C_ACCESS, origin, cookie: recoveredCookies,
        "content-type": "text/plain;charset=UTF-8", "next-action": resetAction, accept: "text/x-component" },
      body: JSON.stringify([{ password, confirmPassword: password }]),
    });
    assert.ok([200, 303].includes(changed.status));
    assert.match(changed.headers.get("x-action-redirect") ?? changed.headers.get("location") ?? "", /^\/dashboard(?:;|$)/);
    assert.ok((await make(K2C_PUBLIC_KEY).auth.signInWithPassword(mailFixture)).error);
    ok(await make(K2C_PUBLIC_KEY).auth.signInWithPassword({ ...mailFixture, password }));
    console.log("PASS application password reset invalidates the old password and accepts the replacement");
  }

  phase = "totp";
  const credentials = { email: "k2c-mfa-" + randomUUID() + "@example.test", password: randomUUID() + "Qa!7" };
  const user = ok(await admin.auth.admin.createUser({ ...credentials, email_confirm: true })).user;
  ids.push(user.id);
  const first = ok(await actor.auth.signInWithPassword(credentials)).session;
  assert.equal(ok(await actor.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel, "aal1");
  const factor = ok(await actor.auth.mfa.enroll({ factorType: "totp" }));
  ok(await actor.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }));
  assert.equal(ok(await actor.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel, "aal2");
  const verified = ok(await actor.auth.mfa.listFactors()).totp;
  assert.equal(verified.length, 1);
  assert.equal(verified[0].status, "verified");
  console.log("PASS hosted Supabase TOTP enrollment and AAL1 to AAL2 promotion");
  if (process.argv.includes("--observe-totp")) await pause(20_000);

  phase = "authorization";
  assert.equal((await actor.rpc("finance_capability")).error?.code, "42501");
  assert.equal((await actor.schema("private").from("financial_operators").select("user_id").limit(1)).error?.code, "PGRST106");
  const second = make(K2C_PUBLIC_KEY);
  const newSession = ok(await second.auth.signInWithPassword(credentials)).session;
  const newLevel = ok(await second.auth.mfa.getAuthenticatorAssuranceLevel());
  assert.equal(newLevel.currentLevel, "aal1");
  assert.equal(newLevel.nextLevel, "aal2");
  console.log("PASS new password session remains AAL1 and neither AAL2 alone nor REST private schema grants financial access");

  phase = "revocation";
  ok(await actor.auth.signOut({ scope: "global" }));
  for (const session of [first, newSession]) {
    const retry = await make(K2C_PUBLIC_KEY).auth.refreshSession({ refresh_token: session.refresh_token });
    assert.ok(retry.error);
  }
  const old = await make(K2C_PUBLIC_KEY).auth.getUser(newSession.access_token);
  console.log("PASS refresh tokens rejected after global sign-out; old access token accepted by getUser=" + Boolean(old.data.user));
} catch (error) {
  console.log("FAIL hosted Supabase Auth " + phase + " " + (error.cause?.code ?? error.name));
  process.exitCode = 1;
} finally {
  for (const id of ids) {
    if ((await admin.auth.admin.deleteUser(id)).error) {
      console.log("FAIL Auth fixture cleanup");
      process.exitCode = 1;
    } else console.log("PASS Auth fixture cleanup");
  }
}
