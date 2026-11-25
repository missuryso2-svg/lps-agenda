import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

// Run one route at a time. Escalation is an explicit test choice.
const [scenario, count] = process.argv.slice(2);
assert.ok(["login", "public", "agenda"].includes(scenario), "use login, public or agenda");
assert.ok(["1", "10", "25", "50", "100"].includes(count), "specify a single bounded stage");
assert.equal(nextURL, "http://127.0.0.1:59330", "use the local Node runtime from the original I4 probe");
const owner = await session();
const shop = ids();
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','Timeout QA','qa-${shop}');
 insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner');`);
const path = { login: "/login", public: "/agendar/qa-" + shop, agenda: "/dashboard/agenda" }[scenario];
const sampleSql = "select json_build_object('backends',count(*),'active',count(*) filter(where state='active'),'locks',count(*) filter(where wait_event_type='Lock')) from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()";
const lag = monitorEventLoopDelay({ resolution: 20 });
const execFileAsync = promisify(execFile);

async function sampleDatabase() {
  // Importing the QA helper already verifies this project and the loopback port.
  const args = ["exec", "supabase_db_" + process.env.B2A2_QA_PROJECT, "psql", "-XqAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sampleSql];
  const distro = process.env.B2A2_QA_WSL_DISTRO;
  const { stdout } = await execFileAsync(distro ? "wsl.exe" : "docker",
    distro ? ["-d", distro, "--", "docker", ...args] : args, { timeout: 2500, windowsHide: true });
  return JSON.parse(stdout);
}

async function request() {
  const id = randomUUID();
  const started = performance.now();
  const headers = { "x-lps-qa-request": id };
  if (scenario === "agenda") headers.cookie = owner.cookies();
  let headersAt, status;
  const signal = AbortSignal.timeout(20_000);
  try {
    const response = await fetch(nextURL + path, { headers, redirect: "manual", signal });
    headersAt = performance.now();
    status = response.status;
    await response.arrayBuffer();
    return { id, status, headers_ms: Math.round(headersAt - started), total_ms: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      id, status, phase: headersAt === undefined ? "before_headers" : "body",
      headers_ms: headersAt === undefined ? undefined : Math.round(headersAt - started),
      total_ms: Math.round(performance.now() - started),
      reason: signal.aborted ? "deadline" : error.name,
      cause: typeof error.cause?.code === "string" ? error.cause.code : undefined,
    };
  }
}

try {
  await startNext(false);
  assert.equal((await request()).status, 200, "warmup failed");
  const dbBefore = JSON.parse(sql(sampleSql));
  const during = [];
  const waveStarted = performance.now();
  let pending;
  const monitor = setInterval(() => {
    if (pending) return;
    const at_ms = Math.round(performance.now() - waveStarted);
    pending = sampleDatabase().then(
      sample => during.push({ at_ms, ...sample }),
      error => during.push({ at_ms, sample_error: error.code ?? error.name }),
    ).finally(() => { pending = undefined; });
  }, 500);
  lag.enable();
  const batch = await Promise.all(Array.from({ length: Number(count) }, request))
    .finally(() => clearInterval(monitor));
  lag.disable();
  await pending;
  const dbAfter = JSON.parse(sql(sampleSql));
  const errors = batch.filter(item => item.status !== 200 || item.reason).length;
  console.log(JSON.stringify({
    scenario, concurrency: Number(count), deadline_ms: 20_000, errors,
    client_event_loop_p95_ms: Math.round(lag.percentile(95) / 1e6), dbBefore, during, dbAfter, batch,
  }));
  if (errors) process.exitCode = 1;
} finally {
  lag.disable();
  await stopNext();
}
