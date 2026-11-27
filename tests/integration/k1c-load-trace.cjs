/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload is loaded by Node --require. */
const { AsyncLocalStorage } = require("node:async_hooks");
const { channel } = require("node:diagnostics_channel");
const { Server } = require("node:http");
const { monitorEventLoopDelay, performance } = require("node:perf_hooks");

const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || !/^59\d{3}$/.test(api.port)) {
  throw new Error("The QA tracer requires a disposable loopback API.");
}
const traces = new AsyncLocalStorage();
const requests = new WeakMap();
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
const output = (event) => process.stdout.write("K1C " + JSON.stringify(event) + "\n");
let active = 0;
let peak = 0;
let cpu = process.cpuUsage();
let sampled = performance.now();
setInterval(() => {
  const usage = process.cpuUsage(cpu);
  const now = performance.now();
  output({ kind: "runtime", at: Date.now(), rss_mib: Math.round(process.memoryUsage().rss / 1048576),
    cpu_pct_one_core: Math.round((usage.user + usage.system) / (now - sampled) / 10),
    active, peak, loop_p95_ms: Math.round(lag.percentile(.95) / 1e6) });
  peak = active;
  sampled = now;
  lag.reset();
  cpu = process.cpuUsage();
}, 500).unref();

const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event !== "request") return emit.call(this, event, ...args);
  const [req, res] = args;
  const id = req.headers["x-lps-qa-request"];
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) return emit.call(this, event, ...args);
  const start = performance.now();
  const trace = { id, calls: [] };
  active++;
  peak = Math.max(peak, active);
  output({ kind: "accepted", id, at: Date.now() });
  res.once("close", () => {
    active--;
    output({ kind: "server", ...trace, finished: res.writableFinished, status: res.statusCode,
      ms: Math.round(performance.now() - start) });
  });
  return traces.run(trace, () => emit.call(this, event, ...args));
};

channel("undici:request:create").subscribe(({ request }) => {
  const trace = traces.getStore();
  if (!trace || request.origin !== api.origin) return;
  const path = request.path;
  const kind = path.startsWith("/auth/") ? "auth"
    : path.startsWith("/rest/v1/rpc/") ? "rpc"
    : path.startsWith("/rest/") ? "rest"
    : path.startsWith("/storage/") ? "storage" : "other";
  const span = { kind, started: Math.round(performance.now()), headers_ms: null, total_ms: null };
  trace.calls.push(span);
  requests.set(request, span);
});
channel("undici:request:headers").subscribe(({ request, response }) => {
  const span = requests.get(request);
  if (!span) return;
  span.headers_ms = Math.round(performance.now() - span.started);
  span.status = response.statusCode;
});
function finish({ request }) {
  const span = requests.get(request);
  if (span) span.total_ms = Math.round(performance.now() - span.started);
}
channel("undici:request:trailers").subscribe(finish);
channel("undici:request:error").subscribe((event) => {
  const span = requests.get(event.request);
  if (span) span.error = true;
  finish(event);
});
