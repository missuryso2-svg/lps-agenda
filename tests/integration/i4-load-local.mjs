import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const owner = await session();
const shop = ids();
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','I4 Load','qa-${shop}');
 insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner');`);
const targets = [
  { path: "/login" },
  { path: "/agendar/qa-" + shop },
  { path: "/dashboard/agenda", headers: { cookie: owner.cookies() } },
];
const percentile = (values, p) => Math.round(values[Math.ceil(values.length * p) - 1]);
async function request(target) {
  const start = performance.now();
  const response = await fetch(nextURL + target.path, {
    headers: target.headers, redirect: "manual", signal: AbortSignal.timeout(20_000),
  });
  await response.arrayBuffer();
  return { status: response.status, ms: performance.now() - start };
}
try {
  await startNext(false);
  for (const target of targets) assert.equal((await request(target)).status, 200);
  for (const concurrency of [10, 25, 50, 100]) {
    const start = performance.now();
    const results = await Promise.allSettled(Array.from(
      { length: concurrency }, (_, i) => request(targets[i % targets.length]),
    ));
    const time = performance.now() - start;
    const durations = results.flatMap(result => result.status === "fulfilled" ? [result.value.ms] : []);
    durations.sort((a, b) => a - b);
    const errors = results.filter(result => result.status === "rejected" || result.value.status !== 200).length;
    console.log(JSON.stringify({ concurrency, responses: durations.length, errors, p50_ms: percentile(durations, .5),
      p95_ms: percentile(durations, .95), p99_ms: percentile(durations, .99),
      duration_ms: Math.round(time), completed_per_s: +(durations.length * 1000 / time).toFixed(1) }));
    const db = sql("select json_build_object('client_backends',count(*),'waiting_lock',count(*) filter(where wait_event_type='Lock')) from pg_stat_activity where backend_type='client backend' and pid <> pg_backend_pid()");
    console.log(JSON.stringify({ concurrency, database_after_burst: JSON.parse(db) }));
    assert.equal(errors, 0, "stop load escalation after an HTTP error or timeout");
  }
} finally {
  await stopNext();
}
