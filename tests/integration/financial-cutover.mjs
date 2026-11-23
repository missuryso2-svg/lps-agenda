import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import {
  action,
  ids,
  nextURL,
  session,
  sql,
  startNext,
  stopNext,
} from "./local-next-qa.mjs";

function responseCookies(response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
}

function mergeCookies(...cookieSets) {
  const jar = new Map();
  for (const cookie of cookieSets.flat()) {
    const separator = cookie.indexOf("=");
    if (separator > 0)
      jar.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

async function waitForMail(email, expectedType) {
  const inbox = "http://127.0.0.1:59124/api/v1";
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (
      await fetch(inbox + "/search?query=" + encodeURIComponent("to:" + email))
    ).json();
    for (const mail of list.messages ?? []) {
      if (!mail.To.some((recipient) => recipient.Address === email)) continue;
      const html = (await (await fetch(inbox + "/message/" + mail.ID)).json()).HTML;
      if (
        !expectedType ||
        new RegExp("type(?:=|%3D)" + expectedType, "i").test(html)
      )
        return html;
    }
    await delay(250);
  }
  assert.fail("local Mailpit must receive the expected email type");
}

async function confirmSignup() {
  const email = ids() + "@example.test";
  const password = ids() + "Aa!";
  const signup = await action(
    { cookies: () => "" },
    "signUpAction",
    [
      {
        fullName: "Cadastro de QA",
        email,
        password,
        confirmPassword: password,
        acceptTerms: true,
      },
    ],
    "/cadastro",
  );
  assert.ok(
    signup.body.includes("Cadastro recebido"),
    "signup must request email confirmation",
  );
  const cookies = mergeCookies(responseCookies(signup.res));
  const message = await waitForMail(email, "signup");
  const href = message.match(
    /href="([^"]*\/auth\/v1\/verify\?[^"]+)"/i,
  )?.[1];
  assert.ok(href, "local confirmation link");
  const verification = new URL(href.replaceAll("&amp;", "&"));
  assert.ok(
    ["127.0.0.1", "localhost"].includes(verification.hostname) &&
      verification.port === "59121",
  );
  const response = await fetch(verification, { redirect: "manual" });
  const callback = new URL(response.headers.get("location"));
  assert.ok(
    callback.origin === nextURL &&
      callback.pathname === "/auth/callback" &&
      callback.searchParams.has("code"),
    "QA Auth must allow the loopback Next callback",
  );
  const confirmed = await fetch(callback, {
    headers: { cookie: cookies },
    redirect: "manual",
  });
  assert.ok(
    new URL(confirmed.headers.get("location")).pathname === "/dashboard",
    "confirmed signup must reach dashboard",
  );
  console.log(
    "PASS signup, confirmation email via local Mailpit and Next PKCE callback",
  );
  return { email, password };
}

async function recoverPassword(account) {
  const anonymous = { cookies: () => "" };
  const requested = await action(
    anonymous,
    "forgotPasswordAction",
    [{ email: account.email }],
    "/recuperar-senha",
  );
  assert.match(requested.body, /Se existir uma conta/);

  const nonexistent = await action(
    anonymous,
    "forgotPasswordAction",
    [{ email: ids() + "@example.test" }],
    "/recuperar-senha",
  );
  assert.match(nonexistent.body, /Se existir uma conta/);

  const message = await waitForMail(account.email, "recovery");
  const href = message.match(
    /href="([^"]*\/auth\/v1\/verify\?[^"]+)"/i,
  )?.[1];
  assert.ok(href, "local password recovery link");
  const verification = new URL(href.replaceAll("&amp;", "&"));
  assert.ok(
    ["127.0.0.1", "localhost"].includes(verification.hostname) &&
      verification.port === "59121",
  );
  const verified = await fetch(verification, { redirect: "manual" });
  const callback = new URL(verified.headers.get("location"));
  assert.equal(callback.origin, nextURL);
  assert.equal(callback.pathname, "/auth/callback");
  assert.ok(
    callback.searchParams.has("code") || callback.searchParams.has("token_hash"),
  );

  const recoveryCookies = mergeCookies(responseCookies(requested.res));
  const callbackResponse = await fetch(callback, {
    headers: { cookie: recoveryCookies },
    redirect: "manual",
  });
  assert.equal(
    new URL(callbackResponse.headers.get("location")).pathname,
    "/redefinir-senha",
    "recovery callback must establish a session for the reset screen",
  );
  let authenticatedCookies = mergeCookies(
    recoveryCookies,
    responseCookies(callbackResponse),
  );

  const newPassword = ids() + "Aa!";
  const reset = await action(
    { cookies: () => authenticatedCookies },
    "resetPasswordAction",
    [{ password: newPassword, confirmPassword: newPassword }],
    "/redefinir-senha",
  );
  assert.match(
    reset.res.headers.get("x-action-redirect") ?? "",
    /\/dashboard/,
  );
  authenticatedCookies = mergeCookies(
    authenticatedCookies,
    responseCookies(reset.res),
  );

  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const newLogin = await auth.auth.signInWithPassword({
    email: account.email,
    password: newPassword,
  });
  assert.ifError(newLogin.error);
  const oldPasswordLogin = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ok(oldPasswordLogin.error, "the previous password must stop working");

  const signedInPage = await fetch(nextURL + "/dashboard", {
    headers: { cookie: authenticatedCookies },
    redirect: "manual",
  });
  assert.ok(
    !new URL(signedInPage.headers.get("location") ?? nextURL).pathname.includes(
      "/login",
    ),
    "the verified recovery session must reach the protected dashboard flow",
  );

  const signedOut = await action(
    { cookies: () => authenticatedCookies },
    "signOutAction",
    [],
    "/dashboard",
  );
  assert.match(
    signedOut.res.headers.get("x-action-redirect") ?? "",
    /\/login/,
  );
  const clearedCookies = mergeCookies(
    authenticatedCookies,
    responseCookies(signedOut.res),
  );
  const afterLogout = await fetch(nextURL + "/dashboard", {
    headers: { cookie: clearedCookies },
    redirect: "manual",
  });
  assert.match(afterLogout.headers.get("location") ?? "", /\/login\?proximo=/);

  const staleCookies = authenticatedCookies
    .split("; ")
    .map((cookie) => {
      const separator = cookie.indexOf("=");
      const name = cookie.slice(0, separator);
      return name.includes("auth-token")
        ? `${name}=invalid-expired-session`
        : cookie;
    })
    .join("; ");
  const expiredSession = await fetch(nextURL + "/dashboard", {
    headers: { cookie: staleCookies },
    redirect: "manual",
  });
  assert.match(
    expiredSession.headers.get("location") ?? "",
    /\/login\?proximo=/,
    "an expired/invalid session must not pass the protected route",
  );
  console.log(
    "PASS password recovery email, generic response, verified reset, old password rejection, logout and stale-session redirect",
  );
}

const [manager, ordinary] = await Promise.all([session(), session()]);
sql(`insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
     values('${manager.id}','manager',session_user,'QA cutover')`);
const snapshot = () =>
  sql(
    "select (select count(*) from public.subscriptions),(select count(*) from public.payments),(select count(*) from private.overdue_runs)",
  );
const before = snapshot();
try {
  process.env.LPS_COMMERCIAL_WHATSAPP = "5571999555390";
  await startNext(false);
  const account = await confirmSignup();
  await recoverPassword(account);
  const rpc = await manager.client.rpc("finance_health");
  assert.ifError(rpc.error);
  assert.equal(rpc.data.worker_state, "disabled");
  assert.equal(rpc.data.trial_db, false);
  assert.equal(
    (await ordinary.client.rpc("finance_health")).error.code,
    "42501",
  );
  for (const name of ["run_overdue", "process_manual_overdue"]) {
    assert.equal(
      (await manager.client.rpc(name, { batch_size: 1 })).error.code,
      "PGRST202",
    );
    assert.equal(
      (await manager.client.schema("private").rpc(name, { batch_size: 1 }))
        .error.code,
      "PGRST106",
    );
  }
  const page = await fetch(nextURL + "/admin/assinaturas/saude", {
    headers: { cookie: manager.cookies() },
  });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(
    html.includes("Worker de inadimplência") && html.includes("Desligado"),
  );
  assert.ok(!html.includes("Indicadores indisponíveis"));
  for (const path of [
    "/api/cron/trial-finalization",
    "/api/cron/billing-compensation",
  ]) {
    const response = await fetch(nextURL + path, {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
    });
    assert.equal(response.status, 401);
  }
  const origin = await fetch(nextURL);
  const landing = await origin.text();
  const hrefs = [...landing.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map(
    (match) => new URL(match[1]),
  );
  assert.equal(hrefs.length, 4);
  assert.deepEqual(
    hrefs.map((h) => h.pathname),
    Array(4).fill("/5571999555390"),
  );
  assert.equal(new Set(hrefs.map((h) => h.searchParams.get("text"))).size, 4);
  assert.ok(hrefs.every((h) => [...h.searchParams.keys()].join() === "text"));
  const shop = ids();
  sql(`insert into public.barbershops(id,name,slug) values('${shop}','QA nova','e-${shop}');
      insert into public.barbershop_members(barbershop_id,user_id,role) values('${shop}','${ordinary.id}','owner')`);
  const plan = sql("select id from public.plans where code='basico'");
  const denied = await action(
    ordinary,
    "startSubscriptionAction",
    [
      {
        planId: plan,
        billingType: "pix",
        holderName: "QA local",
        document: "52998224725",
      },
    ],
    "/dashboard/plano",
  );
  assert.match(denied.body, /consulte a LPS Solutions/);
  assert.equal(snapshot(), before);
  console.log(
    "PASS health via manager session, ordinary denial, private worker isolation, invalid cron authorization, four official links and unchanged financial records",
  );
} finally {
  await stopNext();
}
