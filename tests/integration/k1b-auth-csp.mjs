import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { admin, ids, nextURL, sql } from "./local-next-qa.mjs";

const baseline = process.argv[2] === "baseline";
const email = "k1b-" + ids() + "@example.test", password = ids() + "Qa1!";
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
assert.ifError(error);
assert.ok(data.user);
const shop = ids(), barber = ids();
sql("insert into public.barbershops(id,name,slug) values('" + shop + "','QA Auth','auth-k1b-" + shop + "');"
  + "insert into public.barbershop_members(barbershop_id,user_id,role) values('" + shop + "','" + data.user.id + "','owner');"
  + "insert into public.barbers(id,barbershop_id,name) values('" + barber + "','" + shop + "','QA Auth');","supabase_admin");
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT));
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const context = await browser.newContext();
await context.route("**/*",route=>[nextURL,process.env.NEXT_PUBLIC_SUPABASE_URL].includes(new URL(route.request().url()).origin)
  ? route.continue() : route.abort());
await context.addInitScript(() => {
  window.qaCsp = [];
  document.addEventListener("securitypolicyviolation",e=>window.qaCsp.push({
    route:location.pathname, kind:e.blockedURI==="eval"?"eval":"other", directive:e.violatedDirective,
    source:e.sourceFile?new URL(e.sourceFile).pathname:null, column:e.columnNumber,
  }));
});
const page = await context.newPage();
try {
  const response = await page.goto(nextURL + "/login");
  const csp = response.headers()["content-security-policy"];
  assert.match(csp, /'nonce-[^']+' 'strict-dynamic'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(response.headers()["x-content-type-options"],"nosniff");
  assert.equal(response.headers()["x-frame-options"],"DENY");
  assert.equal(response.headers()["referrer-policy"],"strict-origin-when-cross-origin");
  assert.equal(response.headers()["strict-transport-security"],"max-age=31536000");
  assert.match(response.headers()["permissions-policy"],/camera=\(\)/);
  await page.getByLabel("E-mail", {exact:true}).fill(email);
  await page.getByLabel("Senha",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.waitForURL(url=>url.pathname==="/dashboard" || url.pathname==="/onboarding");
  await page.waitForFunction(()=>document.readyState==="complete");
  const events = await page.evaluate(()=>window.qaCsp);
  if (baseline) {
    assert.ok(events.some(event=>event.kind==="eval" && event.directive==="script-src" && event.route==="/login"));
    for (const event of events) console.log(JSON.stringify(event));
    console.log("PASS reproduced blocked eval in production login, authentication succeeds");
  } else {
    // The dashboard may introduce other client code after login.
    assert.deepEqual(events.filter(event=>event.route==="/login"),[]);
    console.log("PASS real sign-in via Server Action, no CSP violations in production login");
    const protectedResponse=await page.goto(nextURL+"/dashboard");
    assert.match(protectedResponse.headers()["cache-control"]??"",/private|no-store/i);
    const sessions=(await context.cookies(nextURL)).filter(cookie=>cookie.name.startsWith("sb-"));
    assert.ok(sessions.length>0);
    const attributes=[...new Set(sessions.map(({sameSite,httpOnly,secure})=>JSON.stringify({sameSite,httpOnly,secure})))];
    console.log("Local session cookie attributes "+attributes.join(", "));

    const attempt=await context.request.delete(nextURL+"/api/equipe/foto/"+barber,{
      headers: { origin:"https://foreign.example", "x-forwarded-host": "foreign.example",
        "x-forwarded-proto":"https", "cf-connecting-ip":"203.0.113.10", "x-photo-version":"" },
    });
    assert.equal(attempt.status(),403);
    assert.equal((await attempt.json()).message,"Origem inválida.");
    console.log("PASS private authenticated response and invalid Origin rejected despite forwarded headers");
  }
} finally {
  await browser.close();
  sql("delete from public.barbershops where id='"+shop+"';delete from auth.users where id='"+data.user.id+"'", "supabase_admin");
}
