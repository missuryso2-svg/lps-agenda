import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { admin, ids, session, sql as query } from "./local-next-qa.mjs";

const sql = command => query(command, "supabase_admin");

const bucket = "barber-photos";
const [owner, outside] = await Promise.all([session(), session()]);
const shop = ids(), other = ids(), barber = ids(), departing = ids(), unrelated = ids();
sql([
  "insert into public.barbershops(id,name,slug) values('" + shop + "','Fotos QA','qa-photo-" + shop +
    "'),('" + other + "','Outro tenant QA','qa-photo-" + other + "');",
  "insert into public.barbershop_members(barbershop_id,user_id,role) values('" + shop + "','" + owner.id +
    "','owner'),('" + other + "','" + outside.id + "','owner');",
  "insert into public.barbers(id,barbershop_id,name) values('" + barber + "','" + shop +
    "','QA'),('" + departing + "','" + shop + "','QA saída'),('" + unrelated + "','" + other + "','QA externo');",
].join("\n"));
const image = await readFile("public/brand/lps.webp");
const storage = admin.storage.from(bucket);
async function upload(tenant, professional, aged = true) {
  const key = tenant + "/" + professional + "/" + ids() + ".webp";
  assert.ifError((await storage.upload(key,image,{contentType:"image/webp",upsert:false})).error);
  if (aged) sql("update storage.objects set created_at=now()-interval '20 minutes' where bucket_id='" + bucket + "' and name='" + key + "'");
  return key;
}
const claim = (key, tenant = shop, professional = barber) =>
  sql("select private.claim_retired_barber_photo('" + [tenant,professional,key].join("','") + "')");
const finish = (key, tenant = shop) => sql("select private.finish_retired_barber_photo('" + [tenant,key].join("','") + "')");
const inspect = tenant => sql("select object_key from private.inspect_retired_barber_photos('" + tenant + "')");
const replace = (previous, replacement, professional = barber) => admin.rpc("replace_barber_photo", {
  actor:owner.id, shop, professional, previous, replacement,
});

const kept = await upload(shop,barber), candidate = await upload(shop,barber);
const fresh = await upload(shop,barber,false), otherKey = await upload(other,unrelated);
assert.ifError((await replace(null,kept)).error);
assert.ifError((await owner.client.storage.from(bucket).download(kept)).error);
assert.ok((await outside.client.storage.from(bucket).download(kept)).error);
assert.equal(inspect(shop), candidate);
assert.equal(inspect(other), otherKey);
assert.equal(sql("select count(*) from private.barber_photo_reconciliation where tenant='"+shop+"'"),"0");
assert.equal(claim(kept),"f");
assert.equal(claim(fresh),"f");
assert.throws(()=>claim(otherKey), /Chave de foto incompat/);
assert.equal(finish(candidate),"f");
console.log("PASS real private bucket, tenant isolation, read-only inspection, retained reference and fresh upload");

const peer = "k1b_photo_attach";
const attempt = [
  "select extensions.dblink_connect('claimer','dbname=postgres user=supabase_admin application_name=k1b_photo_claim');",
  "select extensions.dblink_connect('attacher','dbname=postgres user=supabase_admin application_name=" + peer + "');",
  "select extensions.dblink_exec('attacher','set role service_role');",
  "select extensions.dblink_exec('claimer','begin');",
  "select * from extensions.dblink('claimer',format('select private.claim_retired_barber_photo(%L,%L,%L)','" +
    [shop,barber,candidate].join("','") +"')) as claimed(result boolean);",
  "select extensions.dblink_send_query('attacher',format('select public.replace_barber_photo(%L,%L,%L,%L,%L)','" +
    [owner.id,shop,barber,kept,candidate].join("','")+"'));",
  "do $$declare deadline timestamptz:=clock_timestamp()+interval '8 seconds'; begin loop " +
    "perform pg_stat_clear_snapshot();exit when exists(select from pg_stat_activity w join pg_stat_activity h " +
    "on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='k1b_photo_attach' and h.application_name='k1b_photo_claim');" +
    "if clock_timestamp()>deadline then raise exception 'expected runtime contention';end if;perform pg_sleep(0.025);end loop;end $$;",
  "select extensions.dblink_exec('claimer','commit');",
  "do $$begin perform * from extensions.dblink_get_result('attacher') as results(ok boolean);" +
    "raise exception 'claimed photo became referenced';exception when invalid_parameter_value then null;end $$;",
  "select * from extensions.dblink_get_result('attacher') as drained(ok boolean);",
  "select extensions.dblink_disconnect('claimer'),extensions.dblink_disconnect('attacher');",
];
sql(attempt.join("\n"));
assert.equal(sql("select avatar_url from public.barbers where id='"+barber+"'"),kept);
assert.equal(claim(candidate),"t");
assert.equal(finish(candidate),"f");
assert.ifError((await storage.remove([candidate])).error);
assert.equal(claim(candidate),"t");
assert.equal(finish(candidate),"t");
const removed = sql("select removed_at from private.barber_photo_reconciliation where object_key='"+candidate+"'");
assert.equal(finish(candidate),"t");
assert.equal(sql("select removed_at from private.barber_photo_reconciliation where object_key='"+candidate+"'"),removed);
assert.equal(claim(candidate),"f");
assert.ok((await storage.download(candidate)).error);
assert.ifError((await storage.download(otherKey)).error);
assert.ifError((await storage.download(kept)).error);
console.log("PASS committed claim waits against actual service-role replacement, no reattachment, resumable external delete, one audit record");

const orphan = await upload(shop,departing);
assert.ifError((await replace(null,orphan,departing)).error);
sql("delete from public.barbers where id='"+departing+"'");
assert.ok(inspect(shop).includes(orphan));
sql("delete from public.barbershops where id='"+shop+"'");
assert.ok(inspect(shop).includes(orphan));
assert.ok(inspect(shop).includes(kept));
for (const [key,professional] of [[orphan,departing],[kept,barber]]) {
  assert.equal(claim(key,shop,professional),"t");
  assert.ifError((await storage.remove([key])).error);
  assert.equal(finish(key),"t");
}
assert.equal(sql("select count(*) from private.barber_photo_reconciliation where tenant='"+shop+"' and removed_at is not null"),"3");
assert.ifError((await storage.download(otherKey)).error);
console.log("PASS professional/tenant deletion does not erase work or audit, Storage removes exact keys, other tenant preserved");
