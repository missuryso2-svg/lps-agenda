import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Run only against a newly provisioned QA stack and a build compiled for its URL.
const project = process.env.B2A2_QA_PROJECT ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Alternate dedicated ports avoid interfering with another local Docker stack.
const apiPort = process.env.B2A2_QA_API_PORT ?? "59121";
const nextPort = process.env.B2A2_QA_NEXT_PORT ?? "59130";
for (const port of [apiPort, nextPort]) assert.match(port, /^59[0-9]{3}$/);
assert.notEqual(apiPort, nextPort);
const nextHost = process.env.B2A2_QA_NEXT_HOST ?? "127.0.0.1";
assert.ok(["127.0.0.1", "localhost"].includes(nextHost));
const nextURL = "http://" + nextHost + ":" + nextPort;
assert.match(project, /^b2a2-app-\d+$/);
assert.equal(url, "http://127.0.0.1:" + apiPort);
const container = "supabase_db_" + project;
// Windows can run the disposable daemon in its own WSL distribution.
const distro = process.env.B2A2_QA_WSL_DISTRO;
if (distro) assert.match(distro, /^LPS-I3-\d+$/);
function docker(args, options) {
  return distro
    ? execFileSync("wsl.exe", ["-d", distro, "--", "docker", ...args], options)
    : execFileSync("docker", args, options);
}
assert.match(
  docker(["port", "supabase_kong_" + project, "8000/tcp"], {
    encoding: "utf8",
  }),
  new RegExp(":" + apiPort + "\\b"),
);
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manifests = JSON.parse(
  readFileSync(".next/server/server-reference-manifest.json", "utf8"),
);
const actions = Object.fromEntries(
  Object.entries(manifests.node).map(([id, entry]) => [entry.exportedName, id]),
);
const ids = () => randomUUID();
const slug = () => "qa-" + ids();
function sql(command) {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-XqAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: command, encoding: "utf8" },
  ).trim();
}
async function session(metadata = {}) {
  const email = ids() + "@example.test";
  const password = ids() + "aB!";
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: metadata,
  });
  assert.ifError(result.error);
  const jar = new Map();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (items) =>
        items.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return {
    client,
    id: login.data.user.id,
    cookies: () => Array.from(jar, ([k, v]) => k + "=" + v).join("; "),
  };
}
let server;
async function stopNext() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
}
async function startNext(enabled) {
  await stopNext();
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      nextPort,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: nextURL,
        ASAAS_API_KEY: "",
        ASAAS_WEBHOOK_TOKEN: "",
        MANUAL_TRIAL_ONBOARDING_ENABLED: String(enabled),
      },
    },
  );
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error("QA Next failed to start");
    const r = await fetch(nextURL + "/login").catch(() => null);
    if (r?.ok) return;
    await pause(150);
  }
  throw new Error("QA Next did not become ready");
}
async function action(actor, name, args, path = "/onboarding") {
  assert.ok(actions[name], name);
  const res = await fetch(nextURL + path, {
    method: "POST",
    redirect: "manual",
    headers: {
      "next-action": actions[name],
      origin: nextURL,
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      cookie: actor.cookies(),
    },
    body: JSON.stringify(args),
  });
  return { res, body: await res.text() };
}

export { admin, action, ids, nextURL, session, slug, sql, startNext, stopNext };
