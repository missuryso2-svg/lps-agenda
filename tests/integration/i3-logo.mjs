import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const { chromium } = await import(pathToFileURL(process.env.C2_QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ executablePath: process.env.C2_QA_CHROME });
try {
  const owner = await session();
  const shop = ids();
  sql(`insert into public.barbershops(id,name,slug) values ('${shop}','QA Logo','qa-${shop}');
    insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner');
    insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,trial_started_at,trial_ends_at)
      select '${shop}',id,'manual_pix','inactive','trialing','uncontracted',now(),now()+interval '168 hours'
      from public.plans where code='basico'`);
  await startNext(false);
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    return new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue() : route.abort();
  });
  await context.addCookies(owner.cookies().split("; ").map((pair) => {
    const split = pair.indexOf("=");
    return { name: pair.slice(0, split), value: pair.slice(split + 1), url: nextURL };
  }));
  const page = await context.newPage();
  await page.goto(nextURL + "/dashboard/configuracoes");
  const card = page.getByRole("region", { name: "Logo da barbearia" });
  let previous;
  for (const width of [64, 128]) {
    const bytes = await sharp({
      create: { width, height: 32, channels: 4, background: "transparent" },
    }).png().toBuffer();
    await card.locator('input[type="file"]').setInputFiles({
      name: "marca.png", mimeType: "image/png", buffer: bytes,
    });
    await card.locator('img[src^="blob:"]').waitFor();
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/barbershop/logo") && r.request().method() === "POST");
    await card.getByRole("button", { name: "Salvar pré-visualização" }).click();
    const saved = await response;
    assert.equal(saved.status(), 200);
    const { logoUrl } = await saved.json();
    assert.equal(new URL(logoUrl).origin, process.env.NEXT_PUBLIC_SUPABASE_URL);
    const img = await fetch(logoUrl);
    assert.equal(img.status, 200);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ["webp", width, 32, true]);
    assert.notEqual(previous, logoUrl);
    const key = sql(`select logo_url from public.barbershops where id='${shop}'`);
    assert.ok(logoUrl.endsWith("/" + key));
    const objects = sql(`select count(*) from storage.objects where bucket_id='barbershop-logos' and name like '${shop}/%'`);
    assert.equal(objects, "1");
    await page.goto(nextURL + "/dashboard");
    await page.locator(`img[src="${logoUrl}"]`).first().waitFor();
    await page.goto(nextURL + "/agendar/qa-" + shop);
    await page.locator(`img[src="${logoUrl}"]`).waitFor();
    await page.goto(nextURL + "/dashboard/configuracoes");
    previous = logoUrl;
  }
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Remover logo" }).click();
  await card.getByText("Logo removida.", { exact: true }).waitFor();
  assert.equal(sql(`select logo_url is null from public.barbershops where id='${shop}'`), "t");
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='barbershop-logos' and name like '${shop}/%'`), "0");
  console.log("PASS logo preview, upload, public WebP, dashboard, booking page, replacement and removal");
} finally {
  await browser.close();
  await stopNext();
}
