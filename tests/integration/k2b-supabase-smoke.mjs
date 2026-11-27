import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = "https://kffhoimijhsddodqxezs.supabase.co";
const { K2B_QA_URL: target, K2B_QA_PUBLIC_KEY: publicKey, K2B_QA_SERVER_KEY: serverKey } = process.env;
if (target !== url || !publicKey || !serverKey || publicKey === serverKey) {
  throw new Error("Explicit K2-B staging URL and separate staging keys are required.");
}

const client = (key) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
});
const admin = client(serverKey);
const visitor = client(publicKey);
const ownerClient = client(publicKey);
const outsiderClient = client(publicKey);
const accountIds = [];
const shop = randomUUID();
const barber = randomUUID();
const key = [shop, barber, randomUUID()].join("/") + ".webp";
const bucket = "barber-photos";
let stage = "preflight";
let shopCreated = false;
let uploaded = false;
const notes = [];

function check(condition) {
  if (!condition) throw new Error("unexpected result");
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function syntheticLogin(browser) {
  const credentials = { email: "k2b-" + randomUUID() + "@example.test", password: randomUUID() + "Qa!7" };
  const account = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
  check(!account.error && account.data.user?.id);
  accountIds.push(account.data.user.id);
  const login = await browser.auth.signInWithPassword(credentials);
  check(!login.error && login.data.session && login.data.user?.id === account.data.user.id);
  return login.data.user.id;
}

try {
  const status = await fetch(url + "/auth/v1/settings", {
    headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000),
  });
  check(status.ok && (await status.json()).disable_signup === true);
  stage = "auth_login";
  const owner = await syntheticLogin(ownerClient);
  await syntheticLogin(outsiderClient);
  notes.push("PASS hosted staging signup disabled and two synthetic password sessions created without mail");

  stage = "tenant_fixture";
  check(!(await admin.from("barbershops").insert({ id: shop, name: "Barbearia K2 QA", slug: "k2b-" + shop })).error);
  shopCreated = true;
  check(!(await admin.from("barbershop_members").insert({ barbershop_id: shop, user_id: owner, role: "owner" })).error);
  check(!(await admin.from("barbers").insert({ id: barber, barbershop_id: shop, name: "Profissional QA" })).error);

  stage = "data_api";
  const allowed = await ownerClient.from("barbershops").select("id").eq("id", shop);
  const denied = await outsiderClient.from("barbershops").select("id").eq("id", shop);
  const anonymous = await visitor.from("appointments").select("id").limit(1);
  const privateSchema = await outsiderClient.schema("private").from("automatic_premium_trials").select("shop_id").limit(1);
  const gate = await visitor.rpc("automatic_premium_trial_available");
  check(!allowed.error && allowed.data.length === 1 && !denied.error && denied.data.length === 0);
  check(anonymous.error?.code === "42501" && privateSchema.error?.code === "PGRST106" && !gate.error && gate.data === false);
  notes.push("PASS hosted Data API allows owner, isolates unrelated session, denies anonymous appointments and private schema");

  stage = "storage";
  const webp = await readFile("public/brand/lps.webp");
  check(webp.subarray(0, 4).toString() === "RIFF" && webp.subarray(8, 12).toString() === "WEBP");
  const upload = await admin.storage.from(bucket).upload(key, webp, { contentType: "image/webp", upsert: false });
  check(!upload.error);
  uploaded = true;
  const attached = await admin.rpc("replace_barber_photo", { actor: owner, shop, professional: barber,
    previous: null, replacement: key });
  check(!attached.error && attached.data === true);
  const read = await ownerClient.storage.from(bucket).download(key);
  check(!read.error && digest(Buffer.from(await read.data.arrayBuffer())) === digest(webp));
  for (const actor of [visitor, outsiderClient]) {
    check((await actor.storage.from(bucket).download(key)).error);
  }
  notes.push("PASS hosted private bucket returned exact WebP to the owner; unrelated and anonymous reads denied");
} catch {
  process.exitCode = 1;
  notes.push("FAIL sanitized stage " + stage);
} finally {
  const results = [];
  try {
    if (uploaded) results.push((await admin.storage.from(bucket).remove([key])).error);
    if (shopCreated) results.push((await admin.from("barbershops").delete().eq("id", shop)).error);
    for (const id of accountIds) results.push((await admin.auth.admin.deleteUser(id)).error);
  } catch {
    results.push(true);
  }
  if (results.some(Boolean)) {
    process.exitCode = 1;
    notes.push("FAIL cleanup of synthetic staging objects");
  } else if (results.length) {
    notes.push("PASS synthetic sessions, shop and object removed through staging APIs");
  }
  notes.forEach(line => console.log(line));
}
