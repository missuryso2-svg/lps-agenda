import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { ids, nextURL, session, sql } from "./local-next-qa.mjs";

const project = process.env.B2A2_QA_PROJECT;
const apiPort = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).port;
const published = execFileSync("docker", ["port", "supabase_kong_" + project, "8000/tcp"], { encoding: "utf8" });
assert.equal(published.trim(), "127.0.0.1:" + apiPort);
assert.ok(!process.env.B2A2_QA_WSL_DISTRO, "use Docker Desktop for this sampler");
const db = "supabase_db_" + project;
const run = promisify(execFile);
const owner = await session();
const shop = ids();
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','K1C Load','qa-${shop}');
 insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner');`);
const targets = [
  { name: "login_page", path: "/login" },
  { name: "public_page", path: "/agendar/qa-" + shop },
  { name: "agenda", path: "/dashboard/agenda", cookie: owner.cookies() },
];
const activity = `select json_build_object('connections', count(*),
 'active', count(*) filter(where state='active'),
 'locks', count(*) filter(where wait_event_type='Lock'),
 'waiting_io', count(*) filter(where wait_event_type='IO'),
 'max_connections', current_setting('max_connections')::int)
 from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid()`;
const statementTotals = `select coalesce(jsonb_object_agg(kind, jsonb_build_object('calls', calls, 'exec_ms', exec_ms, 'rows', rows)), '{}'::jsonb)
from (select case when query ilike '%pgrst_call%' then 'postgrest_rpc'
  when query ilike '%pgrst_source%' then 'postgrest_query'
  when query ilike '%auth.sessions%' or query ilike '%auth.users%' then 'auth_sql' else 'other' end as kind,
  sum(calls) as calls, round(sum(total_exec_time)::numeric, 2) as exec_ms, sum(rows) as rows
from extensions.pg_stat_statements where query not ilike '%pg_stat_statements%'
and query not ilike '%pg_stat_activity%' group by 1) as buckets`;
const fixtureCount = () => sql(`select count(*) from public.appointments where barbershop_id='${shop}'`);
const dbRead = async (query) => JSON.parse((await run("docker", ["exec", db, "psql", "-XqAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-c", query], { timeout: 2500, windowsHide: true })).stdout);
const next = spawn(process.execPath, ["--require", "./tests/integration/k1c-load-trace.cjs",
  "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", new URL(nextURL).port],
  { windowsHide: true, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env,
    NEXT_PUBLIC_APP_URL: nextURL, ASAAS_API_KEY: "", ASAAS_WEBHOOK_TOKEN: "" } });
const out = (value) => console.log(JSON.stringify(value));
const traces = new Map();
const resources = [];
const lines = createInterface({ input: next.stdout });
lines.on("line", (line) => {
  if (!line.startsWith("K1C ")) return;
  const event = JSON.parse(line.slice(4));
  if (event.kind === "runtime") resources.push(event);
  else traces.set(event.id, { ...traces.get(event.id), [event.kind]: event });
});

async function request(target, stopSignal) {
  const id = randomUUID();
  const start = performance.now();
  const sent = Date.now();
  const headers = { "x-lps-qa-request": id };
  if (target.cookie) headers.cookie = target.cookie;
  const deadline = AbortSignal.timeout(20000);
  let headerMs;
  let status;
  try {
    const res = await fetch(nextURL + target.path, { headers, redirect: "manual",
      signal: stopSignal ? AbortSignal.any([deadline, stopSignal]) : deadline });
    headerMs = Math.round(performance.now() - start);
    status = res.status;
    await res.arrayBuffer();
    return { id, sent, route: target.name, status, header_ms: headerMs, ms: Math.round(performance.now() - start) };
  } catch (error) {
    const code = error.cause?.code;
    return { id, sent, route: target.name, status, header_ms: headerMs, ms: Math.round(performance.now() - start),
      error: deadline.aborted ? "deadline" : stopSignal?.aborted ? "stopped" : "transport",
      code: typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : undefined };
  }
}
const percentile = (values, p) => values.length ? values[Math.ceil(values.length * p) - 1] : null;
const lag = monitorEventLoopDelay({ resolution: 20 });
async function wave(mode, users) {
  const before = await dbRead(statementTotals);
  const clock = performance.now();
  const start = Date.now();
  const end = clock + 8000;
  const rows = [];
  const samples = [];
  const stop = new AbortController();
  let sampling;
  let stats;
  const monitor = setInterval(() => {
    if (!sampling) sampling = dbRead(activity).then((sample) => {
      samples.push(sample);
      if (sample.connections >= sample.max_connections * .9 || sample.locks >= 20) stop.abort();
    }).catch(() => samples.push({ sample_error: true })).finally(() => { sampling = undefined; });
    if (!stats) stats = run("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}} {{.MemUsage}} {{.PIDs}}",
      db, "supabase_kong_" + project, "supabase_rest_" + project, "supabase_auth_" + project],
    { timeout: 4500, windowsHide: true }).then(({ stdout }) => {
      out({ kind: "docker", mode, users, container_order: ["db", "kong", "rest", "auth"],
        samples: stdout.trim().split(/\r?\n/) });
    }).catch(() => out({ kind: "docker_sample_error", mode, users })).finally(() => { stats = undefined; });
  }, 350);
  lag.reset();
  lag.enable();
  await Promise.all(Array.from({ length: users }, async (_, i) => {
    let iteration = 0;
    do {
      const item = await request(targets[(i + iteration++) % targets.length], stop.signal);
      rows.push(item);
      if (mode === "sustained" && (item.error || item.status !== 200)) stop.abort();
    } while (mode === "sustained" && performance.now() < end && !stop.signal.aborted);
  }));
  const elapsed = performance.now() - clock;
  const eventLoop = Math.round(lag.percentile(.95) / 1e6);
  lag.disable();
  clearInterval(monitor);
  await Promise.all([sampling, stats]);
  const after = await dbRead(statementTotals);
  const durations = rows.filter((r) => !r.error).map((r) => r.ms).sort((a, b) => a - b);
  for (const row of rows) out({ kind: "request", mode, users, ...row, ...traces.get(row.id) });
  const errors = rows.filter((r) => r.error || r.status !== 200);
  out({ kind: "summary", mode, users, deadline_ms: 20000, responses: durations.length, attempts: rows.length,
    success: rows.length - errors.length, timeouts: rows.filter((r) => r.error === "deadline").length,
    http_errors: rows.filter((r) => !r.error && r.status !== 200).length,
    aborted: stop.signal.aborted, p50: percentile(durations, .5), p95: percentile(durations, .95),
    p99: percentile(durations, .99), responses_per_s: +(1000 * durations.length / elapsed).toFixed(1),
    client_loop_p95_ms: eventLoop, resources: resources.filter((s) => s.at >= start && s.at <= start + elapsed),
    samples, statements_before: before, statements_after: after });
  assert.equal(fixtureCount(), "0", "read load changed appointments");
  return errors.length === 0 && !stop.signal.aborted;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !ready; attempt++) {
    const res = await fetch(nextURL + "/login").catch(() => null);
    ready = res?.ok ?? false;
    if (res) await res.arrayBuffer();
    if (!ready) await pause(150);
  }
  assert.ok(ready);
  assert.ok(await wave("calibration", 3));
  assert.ok([...traces.values()].some(({ server }) => server?.calls.length), "Supabase trace instrumentation unavailable");
  const mode = process.argv[2];
  assert.ok(["burst", "sustained"].includes(mode));
  for (const users of [10, 25, 50, 100]) {
    if (!await wave(mode, users)) {
      process.exitCode = 2;
      break;
    }
    await pause(700);
  }
} finally {
  next.kill();
  lines.close();
}
