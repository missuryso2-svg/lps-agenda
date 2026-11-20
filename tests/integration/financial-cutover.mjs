import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  action,
  ids,
  nextURL,
  session,
  sql,
  startNext,
  stopNext,
} from "./local-next-qa.mjs";

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
  const cookies = signup.res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const inbox = "http://127.0.0.1:59124/api/v1";
  let mail;
  for (let attempt = 0; attempt < 20 && !mail; attempt++) {
    const list = await (
      await fetch(inbox + "/search?query=" + encodeURIComponent("to:" + email))
    ).json();
    mail = list.messages?.find((m) => m.To.some((t) => t.Address === email));
    if (!mail) await delay(250);
  }
  assert.ok(mail, "local Mailpit must receive the confirmation");
  const message = await (await fetch(inbox + "/message/" + mail.ID)).json();
  const href = message.HTML.match(
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
  await confirmSignup();
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
