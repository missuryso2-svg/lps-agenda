import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { admin, ids, session, sql } from "./local-next-qa.mjs";
import { bookingFixture } from "./j2d-fixture.mjs";

const project = process.env.B2A2_QA_PROJECT;
const port = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).port;
const container = "supabase_db_" + project;
assert.equal(execFileSync("docker", ["port", "supabase_kong_" + project, "8000/tcp"],
  { encoding: "utf8" }).trim(), "127.0.0.1:" + port);
const destination = "k1c_restore_" + ids().replaceAll("-", "").slice(0, 16);
const bundle = await mkdtemp(join(tmpdir(), "lps-k1c-synthetic-backup-"));
const archive = "/tmp/" + destination + ".dump";
function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args],
    { input, encoding: "utf8", timeout: 90000, windowsHide: true });
  if (result.status !== 0) {
    const errors = result.stderr?.split("\n").filter(line => /ERROR:|error:/.test(line));
    throw new Error("Isolated " + args[0] + " failed. " + (errors?.[0]?.replaceAll(destination, "[target]") ?? ""));
  }
  return result.stdout.trim();
}
const query = (command) => docker(["psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin",
  "-d", destination], command);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const [owner, other] = await Promise.all([session(), session()]);
const fixture = await bookingFixture({ owner });
const customer = sql(`insert into public.customers(barbershop_id,full_name)
  values('${fixture.shop}','Cliente sintético de restauração') returning id`);
const start = new Date(fixture.day + "T09:00:00-03:00");
const appointment = await owner.client.from("appointments").insert({
  barbershop_id: fixture.shop, barber_id: fixture.barber, customer_id: customer,
  service_id: fixture.service, starts_at: start.toISOString(),
  ends_at: new Date(+start + 1800000).toISOString(),
}).select("id,price_cents").single();
assert.ifError(appointment.error);
assert.equal(appointment.data.price_cents, 6500);
const key = fixture.shop + "/" + ids() + ".webp";
const storage = admin.storage.from("barbershop-logos");
assert.ifError((await storage.upload(key, await readFile("public/brand/lps.webp"), { contentType: "image/webp" })).error);
sql(`update public.barbershops set logo_url='${key}' where id='${fixture.shop}'`, "supabase_admin");
const blob = await storage.download(key);
assert.ifError(blob.error);
const media = Buffer.from(await blob.data.arrayBuffer());
const digest = hash(media);
await writeFile(join(bundle, "backup.webp"), media);
const versions = sql("select version from supabase_migrations.schema_migrations order by version");
const ledgerCount = versions.split(/\r?\n/).length;
assert.ok([33, 36].includes(ledgerCount), "unexpected synthetic ledger");
const laterMigrations = "select count(*) from pg_proc where proname in ('guard_appointment_lifecycle','claim_retired_barber_photo','finance_trial_directory')";
assert.equal(sql(laterMigrations), "3");
const atom = performance.now();
docker(["pg_dump", "-U", "supabase_admin", "-d", "postgres", "--format=custom", "--file=" + archive]);
const backupMs = Math.round(performance.now() - atom);
docker(["createdb", "-U", "supabase_admin", "--template=template0", destination]);
const targetMs = performance.now();
docker(["pg_restore", "-U", "supabase_admin", "-d", destination, "--exit-on-error", "--single-transaction", archive]);
const restoreMs = Math.round(performance.now() - targetMs);
console.log(JSON.stringify({ database_backup_ms: backupMs, database_restore_ms: restoreMs, media_bytes: media.length }));
assert.equal(query("select version from supabase_migrations.schema_migrations order by version").replaceAll("\r", ""),
  versions.replaceAll("\r", ""));
assert.equal(query(`select count(*) from public.appointments a
join public.barbers b on b.id=a.barber_id and b.barbershop_id=a.barbershop_id
join public.customers c on c.id=a.customer_id and c.barbershop_id=a.barbershop_id
join public.services s on s.id=a.service_id and s.barbershop_id=a.barbershop_id
where a.barbershop_id='${fixture.shop}'`), "1");
assert.equal(query(`select price_cents from public.appointments where id='${appointment.data.id}'`), "6500");
assert.equal(query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity"), "0");
assert.equal(query("select count(*) from pg_trigger where tgrelid='public.appointments'::regclass and tgname='appointments_00_guard_lifecycle'"), "1");
assert.equal(query(laterMigrations), "3");
for (const actor of [owner, other]) {
  assert.equal(query(`begin; set local role authenticated; set local request.jwt.claim.sub='${actor.id}';
    select count(*) from public.appointments where barbershop_id='${fixture.shop}'; rollback;`),
    actor === owner ? "1" : "0");
}
assert.equal(query(`select count(*) from auth.users where id='${owner.id}'`), "1");
assert.equal(query(`select count(*) from public.barbershops b join storage.objects o on o.name=b.logo_url
  where o.bucket_id='barbershop-logos' and b.id='${fixture.shop}'`), "1");
const recovered = await readFile(join(bundle, "backup.webp"));
await writeFile(join(bundle, "restored.webp"), recovered);
assert.equal(hash(await readFile(join(bundle, "restored.webp"))), digest);
console.log("PASS restored SQL schema and data, exact source ledger (" + ledgerCount + " versions), Auth row, ownership scoping, RLS, price and three K1-B routines");
console.log("PASS restored Storage metadata and separate byte copy verified against the original API download");
if (process.argv.includes("--verify-storage")) {
  const sourceName = "supabase_storage_" + project;
  const [sourceStorage] = JSON.parse(execFileSync("docker", ["inspect", sourceName], { encoding: "utf8" }));
  const [network] = Object.keys(sourceStorage.NetworkSettings.Networks);
  assert.equal(network, "j2e-loopback-qa");
  assert.match(sourceStorage.Config.Image, /^public\.ecr\.aws\/supabase\/storage-api:/);
  const allowed = new Set(["ANON_KEY", "AUTH_JWT_SECRET", "DATABASE_URL", "DB_MIGRATIONS_FREEZE_AT",
    "FILE_SIZE_LIMIT", "FILE_STORAGE_BACKEND_PATH", "GLOBAL_S3_BUCKET", "JWT_JWKS", "SERVICE_KEY",
    "STORAGE_BACKEND", "STORAGE_S3_REGION", "UPLOAD_FILE_SIZE_LIMIT", "UPLOAD_FILE_SIZE_LIMIT_STANDARD"]);
  const vars = sourceStorage.Config.Env.filter(line => allowed.has(line.split("=", 1)[0]));
  const connection = new URL(vars.find(line => line.startsWith("DATABASE_URL=")).slice("DATABASE_URL=".length));
  assert.ok(["db", container, "supabase-db"].includes(connection.hostname));
  assert.equal(connection.pathname, "/postgres");
  connection.pathname = "/" + destination;
  assert.ok(vars.includes("STORAGE_BACKEND=file"));
  const config = join(bundle, "storage-qa.env");
  await writeFile(config, vars.map(line => line.startsWith("DATABASE_URL=") ? "DATABASE_URL=" + connection.href : line)
    .concat(["TENANT_ID=k1c-restore", "VECTOR_ENABLED=false", "S3_PROTOCOL_ENABLED=false"]).join("\n") + "\n", { mode: 0o600 });
  const name = "lps-" + destination.replaceAll("_", "-");
  let started = false;
  try {
    const boot = spawnSync("docker", ["run", "--rm", "-d", "--name", name, "--network", network,
      "--publish", "127.0.0.1:59728:5000", "--env-file", config, sourceStorage.Config.Image],
    { stdio: "ignore", timeout: 20000, windowsHide: true });
    assert.equal(boot.status, 0, "destination Storage startup");
    started = true;
    const root = "http://127.0.0.1:59728";
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      const response = await fetch(root + "/status", { signal: AbortSignal.timeout(1000) }).catch(() => null);
      ready = response?.ok ?? false;
      if (response) await response.arrayBuffer();
      if (!ready) await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.ok(ready, "destination Storage health check");
    const bearer = "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = root + "/object/barbershop-logos/" + key;
    const put = await fetch(url, { method: "POST", headers: { authorization: bearer, "content-type": "image/webp",
      "x-upsert": "true" }, body: recovered, signal: AbortSignal.timeout(10000) });
    assert.ok(put.ok, "destination Storage re-import HTTP " + put.status);
    const get = await fetch(url, { headers: { authorization: bearer }, signal: AbortSignal.timeout(10000) });
    assert.ok(get.ok, "destination Storage redownload HTTP " + get.status);
    assert.equal(hash(Buffer.from(await get.arrayBuffer())), digest);
    assert.equal(query(`select count(*) from public.barbershops b join storage.objects o on o.name=b.logo_url
      where o.bucket_id='barbershop-logos' and b.id='${fixture.shop}'`), "1");
    console.log("PASS destination Storage API re-import and byte-for-byte redownload in the restored database");
  } finally {
    try {
      if (started) spawnSync("docker", ["stop", name], { stdio: "ignore", timeout: 15000, windowsHide: true });
    } finally {
      await unlink(config);
    }
  }
}
console.log("Scope: separate local database in a QA cluster with shared roles. Hosted Auth settings and managed backup recovery remain unverified.");
