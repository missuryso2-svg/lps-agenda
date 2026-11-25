import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { uploadImages, pngChunk } from "../fixtures/upload-images.mjs";
import { ids, nextURL, session, sql, startNext, stopNext } from "./local-next-qa.mjs";

const runtime = process.argv[2];
assert.ok(runtime === "node" || runtime === "workers");
assert.equal(nextURL, "http://127.0.0.1:" + (runtime === "node" ? 59330 : 59331));
const origin = runtime === "node" ? nextURL : "https://agenda.example.org";
if (runtime === "workers") assert.equal(process.env.NEXT_PUBLIC_APP_URL, origin);

const { png, jpeg, webp, animatedWebp, oversizedPixels, brokenPng } = await uploadImages();
assert.equal((await sharp(animatedWebp, { animated: true }).metadata()).pages, 2);
const acTL = Buffer.alloc(8);
acTL.writeUInt32BE(2);
const apngContainer = Buffer.concat([png.subarray(0, 33), pngChunk("acTL", acTL), png.subarray(33)]);
const badCompressedPng = Buffer.concat([
  png.subarray(0, 33),
  pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0, 0, 0, 0])),
  pngChunk("IEND", Buffer.alloc(0)),
]);
const [owner, staff, outsider] = await Promise.all([session(), session(), session()]);
const shop = ids(), other = ids(), barber = ids();
sql(`insert into public.barbershops(id,name,slug) values ('${shop}','QA image','j11-${shop}'),('${other}','QA foreign','j11-${other}');
insert into public.barbershop_members(barbershop_id,user_id,role) values ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),('${other}','${outsider.id}','owner');
insert into public.barbers(id,barbershop_id,name) values ('${barber}','${shop}','QA Staff');`);

const invalidInputs = [
  ["SVG", Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"), "image/png"],
  ["MIME divergente", jpeg, "image/png"],
  ["PNG truncado", png.subarray(0, 31), "image/png"],
  ["WebP animado", animatedWebp, "image/webp"],
  ["marcador APNG", apngContainer, "image/png"],
  ["16 megapixels", oversizedPixels, "image/png"],
  ["2 MiB", Buffer.alloc(2 * 1024 * 1024 + 1), "image/png"],
];
const times = [];
const version = key => createHash("sha256").update(key).digest("base64url");
const routes = [
  {
    label: "logo", bucket: "barbershop-logos", path: "/api/barbershop/logo",
    current: () => sql(`select logo_url from public.barbershops where id='${shop}'`),
    headers: key => ({ "x-logo-shop": shop, "x-logo-version": version(key) }),
    get: key => fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/barbershop-logos/" + key),
  },
  {
    label: "photo", bucket: "barber-photos", path: "/api/equipe/foto/" + barber,
    current: () => sql(`select avatar_url from public.barbers where id='${barber}'`),
    headers: key => ({ "x-photo-version": encodeURIComponent(key) }),
    get: () => fetch(nextURL + "/api/equipe/foto/" + barber, { headers: { cookie: owner.cookies() } }),
  },
];
function request(route, key, body, mime, actor = owner, requestOrigin = origin) {
  return fetch(nextURL + route.path, {
    method: body ? "POST" : "DELETE",
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: { cookie: actor.cookies(), origin: requestOrigin, "content-type": mime, ...route.headers(key) },
    body,
  });
}
function stored(route) {
  return sql(`select count(*) from storage.objects where bucket_id='${route.bucket}' and name like '${shop}/%'`);
}

try {
  if (runtime === "node") await startNext(false);
  for (const route of routes) {
    assert.equal((await request(route, "", png, "image/png", { cookies: () => "" })).status, route.label === "logo" ? 401 : 403);
    assert.equal((await request(route, "", png, "image/png", staff)).status, 403);
    assert.ok([403, 409].includes((await request(route, "", png, "image/png", outsider)).status));
    assert.equal((await request(route, "", png, "image/png", owner, "https://foreign.example.org")).status, 403);
    for (const [reason, payload, mime] of invalidInputs)
      assert.equal((await request(route, "", payload, mime)).status, 400, route.label + " " + reason);
    assert.ok([400, 503].includes((await request(route, "", badCompressedPng, "image/png")).status),
      "compressed pixel data with valid chunk CRC must be rejected");
    assert.equal(route.current(), "");
    assert.equal(stored(route), "0");
    console.log("PASS " + route.label + " rejects invalid images, unauthenticated, cross-tenant and cross-origin requests");

    for (const [format, bytes, expectedWidth, expectedHeight] of [
      ["png", png, 1200, 600], ["jpeg", jpeg, 600, 1200], ["webp", webp, 1200, 600],
    ]) {
      const start = performance.now();
      const upload = await request(route, route.current(), bytes, "image/" + format);
      times.push(Math.round(performance.now() - start));
      assert.equal(upload.status, 200, route.label + " upload " + format);
      const key = route.current();
      assert.ok(key.startsWith(shop + "/"));
      assert.equal(stored(route), "1");
      const read = await route.get(key);
      assert.equal(read.status, 200);
      assert.match(read.headers.get("content-type") ?? "", /^image\/webp/);
      const output = Buffer.from(await read.arrayBuffer());
      const image = await sharp(output).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.width, route.label === "logo" ? expectedWidth : 480);
      assert.equal(image.height, route.label === "logo" ? expectedHeight : 480);
      assert.equal(image.hasAlpha, format !== "jpeg", "the source contains translucent pixels");
      assert.ok(!image.exif && !image.xmp && !image.icc);
      if (format === "png") {
        const pixel = await sharp(output).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer();
        assert.equal(pixel[3], 102);
        assert.ok(route.label === "logo" ? pixel[0] > 150 && pixel[1] < 80 : pixel[0] < 80 && pixel[1] > 140);
      }
    }
    console.log("PASS " + route.label + " JPG/PNG/WebP, orientation, WebP, transparency, dimensions and replacement");

    const current = route.current();
    assert.equal((await request(route, current, brokenPng, "image/png")).status, 400);
    assert.equal(route.current(), current);
    assert.equal(stored(route), "1");
    const race = await Promise.all([request(route, current, png, "image/png"), request(route, current, webp, "image/webp")]);
    assert.deepEqual(race.map(res => res.status).sort(), [200, 409]);
    assert.notEqual(route.current(), current);
    assert.equal(stored(route), "1");
    assert.equal((await request(route, current, undefined, "image/webp")).status, 409);
    assert.equal((await request(route, route.current(), undefined, "image/webp")).status, 200);
    assert.equal(route.current(), "");
    assert.equal(stored(route), "0");
    console.log("PASS " + route.label + " concurrent CAS, stale delete and cleanup");
  }
  console.log(JSON.stringify({ runtime, valid_upload_ms: times }));
} finally {
  if (runtime === "node") await stopNext();
}
