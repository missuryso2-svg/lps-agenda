// Local QA only. Do not print cookies, link tokens, or generated credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { nextURL, sql, startNext, stopNext } from "./local-next-qa.mjs";

const mailURL = "http://127.0.0.1:" + (process.env.J2B_QA_MAIL_PORT ?? "59324");
assert.match(mailURL, /^http:\/\/127\.0\.0\.1:59\d{3}$/);
const apiURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
const email = "cadastro-" + randomUUID().slice(0, 12) + "@example.test";
const unknownEmail = "ausente-" + randomUUID().slice(0, 12) + "@example.test";
const originalPassword = randomUUID() + "Qa1!";
const newPassword = randomUUID() + "Qb2!";
const issues = [];

async function open(options = {}) {
  const context = await browser.newContext({ locale: "pt-BR", reducedMotion: "reduce", ...options });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if ([nextURL, apiURL].includes(url.origin)) return route.continue();
    issues.push("External origin: " + url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", () => issues.push("uncaught browser error"));
  page.on("console", message => {
    if (/violates? the following Content Security Policy/i.test(message.text())) issues.push("CSP violation");
  });
  return { context, page };
}

async function visit(page, path) {
  const res = await page.goto(nextURL + path);
  assert.ok(res?.ok(), path);
  assert.match(res.headers()["content-security-policy"], /'nonce-[^']+' 'strict-dynamic'/);
  return res;
}

async function verifyMail(page, recipient, type) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const list = await (await fetch(mailURL + "/api/v1/messages")).json();
    for (const record of list.messages.filter(record => record.To?.some(to => to.Address === recipient))) {
      const result = await fetch(mailURL + "/api/v1/message/" + encodeURIComponent(record.ID));
      assert.ok(result.ok);
      const message = await result.json();
      const urls = ((message.HTML ?? "") + " " + (message.Text ?? "")).match(/http:\/\/[^\s"'<>]+/g) ?? [];
      const verify = urls
        .map(candidate => new URL(candidate.replaceAll("&amp;", "&")))
        .find(url => url.origin === apiURL && url.pathname === "/auth/v1/verify" && url.searchParams.get("type") === type);
      if (verify) {
        try {
          await page.goto(verify.href);
        } catch {
          assert.fail("Local " + type + " link did not complete navigation");
        }
        const expected = type === "signup" ? "/onboarding" : "/redefinir-senha";
        try {
          await page.waitForURL(url => url.origin === nextURL && url.pathname === expected, { timeout: 8000 });
        } catch {
          const landed = new URL(page.url());
          assert.fail("Local " + type + " link landed at " + landed.origin + landed.pathname + " with query keys " + [...landed.searchParams.keys()].join(", "));
        }
        return;
      }
    }
    await pause(180);
  }
  assert.fail("Missing synthetic " + type + " mail");
}

async function verifyAutofill(context, page) {
  const cdp = await context.newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fullName" });
    const { node } = await cdp.send("DOM.describeNode", { nodeId });
    await cdp.send("Autofill.trigger", {
      fieldId: node.backendNodeId,
      address: { fields: [
        { name: "NAME_FULL", value: "Ana Ribeiro" },
        { name: "EMAIL_ADDRESS", value: email },
        { name: "ADDRESS_HOME_COUNTRY", value: "BR" },
      ] },
    });
    assert.equal(await page.locator("#fullName").inputValue(), "Ana Ribeiro");
    assert.equal(await page.locator("#email").inputValue(), email);
  } finally {
    await cdp.detach();
  }
}

async function recovery(recipient, testPending) {
  const { context, page } = await open();
  await visit(page, "/recuperar-senha");
  let release;
  if (testPending) {
    const hold = new Promise(resolve => { release = resolve; });
    await page.route("**/recuperar-senha", async route => {
      if (route.request().method() === "POST") await hold;
      await route.continue();
    });
  }
  const button = page.getByRole("button", { name: "Enviar link de recuperação" });
  await page.getByLabel("E-mail da conta").fill(recipient);
  try {
    await button.click();
    if (testPending) {
      const pending = page.getByRole("button", { name: "Enviando..." });
      await pending.waitFor();
      assert.equal(await pending.isDisabled(), true);
      assert.equal(await page.locator(".account-spinner").evaluate(el => getComputedStyle(el).animationName), "none");
      assert.equal(await page.locator(".account-submit [role=status]").textContent(), "Enviando...");
    }
  } finally {
    release?.();
  }
  const heading = page.getByRole("heading", { name: "Verifique seu e-mail" });
  await heading.waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "account-result-title");
  return { context, page, copy: await page.locator(".account-result").innerText() };
}

async function signIn(page, password) {
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

try {
  await startNext(false);
  const fallback = await open({ javaScriptEnabled: false });
  await visit(fallback.page, "/login");
  await fallback.page.route("**/login", route => route.fulfill({ status: 204 }));
  await fallback.page.getByLabel("E-mail", { exact: true }).fill("noscript@example.test");
  await fallback.page.getByLabel("Senha", { exact: true }).fill("synthetic-only");
  const fallbackRequest = fallback.page.waitForRequest(request => request.isNavigationRequest());
  await fallback.page.getByRole("button", { name: "Entrar", exact: true }).click();
  const request = await fallbackRequest;
  assert.equal(request.method(), "POST");
  assert.equal(new URL(request.url()).search, "");
  await fallback.context.close();
  console.log("PASS native submit without JavaScript keeps credentials out of the URL");

  assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
  const signup = await open({ viewport: { width: 375, height: 844 } });
  const { page } = signup;
  await visit(page, "/cadastro");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await page.locator("#fullName[aria-invalid=true]").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "fullName");
  assert.match(await page.locator("#fullName-feedback").textContent(), /nome completo/);
  assert.equal(await page.locator("#fullName").getAttribute("aria-describedby"), "fullName-feedback");
  assert.equal(await page.locator("#password").getAttribute("autocomplete"), "new-password");
  assert.equal(await page.locator("#confirmPassword").getAttribute("autocomplete"), "new-password");
  await verifyAutofill(signup.context, page);
  console.log("PASS Chromium autofill filled name and email with a synthetic address profile");
  await page.getByLabel("Senha", { exact: true }).fill(originalPassword);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(originalPassword);
  const password = page.locator("#password");
  await password.focus();
  await page.keyboard.press("Tab");
  const reveal = page.getByRole("button", { name: "Mostrar senha", exact: true });
  assert.ok(await reveal.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle === "solid"));
  await page.keyboard.press("Space");
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await reveal.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Enter");
  assert.equal(await password.getAttribute("type"), "password");
  const terms = page.getByRole("checkbox", { name: /li e aceito/i });
  await terms.focus();
  await page.keyboard.press("Space");
  assert.equal(await terms.isChecked(), true);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await page.getByRole("heading", { name: "Confira seu e-mail" }).waitFor();
  assert.equal(sql("select count(*) from auth.users where email='" + email + "' and email_confirmed_at is null"), "1");
  await verifyMail(page, email, "signup");
  console.log("PASS registration, inline validation, keyboard password reveal and confirmation link");

  const code = randomUUID().slice(0, 8);
  const initialSlug = "barbearia-qa-" + code;
  const finalSlug = "nova-barbearia-qa-" + code;
  assert.equal(await page.locator('[aria-current="step"]').innerText().then(v => v.replace(/\s+/g, " ").trim()), "2 Barbearia");
  const shopName = page.getByLabel("Nome da barbearia");
  const slug = page.getByLabel("Identificador");
  await shopName.fill("Barbearia QA " + code);
  await page.waitForFunction(expected => document.querySelector("#slug").value === expected, initialSlug);
  await slug.fill("slug-editado");
  await shopName.fill("Nova Barbearia QA " + code);
  assert.equal(await slug.inputValue(), "slug-editado");
  await page.getByRole("button", { name: "Recriar a partir do nome" }).click();
  assert.equal(await slug.inputValue(), finalSlug);
  const zone = page.getByLabel("Fuso horário", { exact: true });
  await zone.focus();
  await page.keyboard.press("ArrowDown");
  const listbox = page.getByRole("listbox");
  await listbox.waitFor();
  assert.equal(await listbox.evaluate(el => getComputedStyle(el).animationName), "none");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.match(await zone.textContent(), /Noronha/);
  await page.getByRole("button", { name: "Criar barbearia e continuar" }).click();
  await page.waitForURL(nextURL + "/dashboard");
  const shopCheck = sql("select b.timezone, m.role, " +
    "(select count(*) from public.subscriptions s where s.barbershop_id=b.id), " +
    "(select count(*) from public.payments p where p.barbershop_id=b.id) " +
    "from public.barbershops b join public.barbershop_members m on m.barbershop_id=b.id " +
    "join auth.users u on u.id=m.user_id where b.slug='" + finalSlug + "' and u.email='" + email + "'");
  assert.equal(shopCheck, "America/Noronha|owner|0|0");
  assert.equal(sql("select enabled from private.manual_trial_activation"), "f");
  await signup.context.close();
  console.log("PASS onboarding creates owner and barbershop only; timezone keyboard and edited slug preserved");

  const expired = await open();
  await visit(expired.page, "/redefinir-senha");
  await expired.page.getByRole("heading", { name: "Link expirado ou inválido" }).waitFor();
  assert.equal(await expired.page.locator("main form").count(), 0);
  await expired.context.close();

  const existing = await recovery(email, false);
  const absent = await recovery(unknownEmail, true);
  assert.equal(absent.copy, existing.copy);
  assert.match(existing.copy, /Se existir uma conta com este e-mail/);
  await absent.context.close();
  await verifyMail(existing.page, email, "recovery");
  const resetPage = existing.page;
  assert.equal(await resetPage.locator("#password").getAttribute("autocomplete"), "new-password");
  await resetPage.getByLabel("Nova senha", { exact: true }).fill(newPassword);
  await resetPage.getByLabel("Confirmar nova senha", { exact: true }).fill(originalPassword);
  await resetPage.getByRole("button", { name: "Salvar nova senha" }).click();
  await resetPage.locator("#confirmPassword[aria-invalid=true]").waitFor();
  assert.match(await resetPage.locator("#confirmPassword-feedback").textContent(), /não conferem/);
  await resetPage.getByLabel("Confirmar nova senha", { exact: true }).fill(newPassword);
  await resetPage.getByRole("button", { name: "Salvar nova senha" }).click();
  await resetPage.waitForURL(nextURL + "/dashboard");
  await existing.context.close();
  console.log("PASS indistinguishable recovery copy, announced pending status, real reset link and matching-password validation");

  const login = await open();
  await visit(login.page, "/login");
  assert.equal(await login.page.locator("#email").getAttribute("autocomplete"), "username");
  assert.equal(await login.page.locator("#password").getAttribute("autocomplete"), "current-password");
  await signIn(login.page, originalPassword);
  await login.page.locator("main [role=alert]").waitFor();
  await signIn(login.page, newPassword);
  await login.page.waitForURL(nextURL + "/dashboard");
  await login.context.close();
  assert.deepEqual(issues, []);
  console.log("PASS old password rejected, new password accepted, CSP enforced and external requests blocked");
} finally {
  await browser.close();
  await stopNext();
}
