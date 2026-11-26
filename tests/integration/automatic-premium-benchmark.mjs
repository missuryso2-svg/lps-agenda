// Compare compiled QA previews with the same loopback URL and fixture stack.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export async function measureTrialPages(base) {
  assert.match(base, /^http:\/\/(?:localhost|127\.0\.0\.1):59\d{3}$/);
  const results = [];
  for (const path of ["/", "/cadastro", "/barbearia/barbearia-aurora"]) {
    const timings = [];
    let bytes;
    for (let attempt = 0; attempt < 15; attempt++) {
      const start = performance.now();
      const response = await fetch(base + path, { redirect: "manual" });
      assert.ok(response.ok, path);
      const body = await response.arrayBuffer();
      if (attempt >= 3) {
        timings.push(performance.now() - start);
        bytes ??= body.byteLength;
      }
    }
    timings.sort((left, right) => left - right);
    results.push({
      path, n: timings.length, medianMs: +timings[6].toFixed(1),
      p95Ms: +timings[11].toFixed(1), bytes,
    });
  }
  return results;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const base = process.argv[2] ?? "http://localhost:59330";
  for (const result of await measureTrialPages(base)) console.log(JSON.stringify(result));
}
