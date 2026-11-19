import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { monthlyAnchorDate } from "../../src/features/billing/manual-calendar.ts";

// Environment supplied by the isolated QA project only, never loaded from .env.local.
const project = process.env.B2B_QA_PROJECT ?? "";
assert.match(project, /^b2b-clean-\d+$/);
const url = "http://127.0.0.1:59521";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, url);
assert.match(execFileSync("docker", ["port","supabase_kong_" + project,"8000/tcp"], { encoding:"utf8" }), /:59521\b/);
const client = key => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const anonymous = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const signedIn = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = randomUUID() + "@example.test";
const password = randomUUID() + "aB!";
assert.ifError((await service.auth.admin.createUser({email,password,email_confirm:true,
  app_metadata:{lps_role:"platform_admin"}})).error);
assert.ifError((await signedIn.auth.signInWithPassword({email,password})).error);
const uuid = randomUUID();
for (const actor of [anonymous,signedIn,service]) {
  for (const [name,args] of [
    ["register_manual_agreement",{op:uuid,shop:uuid,agreement:null}],
    ["issue_manual_invoice",{op:uuid,shop:uuid,contract:uuid,bill_month:"2024-01-01"}],
    ["process_manual_overdue",{batch_size:1}],
  ]) {
    assert.equal((await actor.rpc(name,args)).error?.code,"PGRST202");
    assert.equal((await actor.schema("private").rpc(name,args)).error?.code,"PGRST106");
  }
}
console.log("PASS 18 HTTP checks across anon, legacy platform_admin and service_role");

const calendar = execFileSync("docker",["exec","supabase_db_"+project,"psql","-XAt","-U","postgres","-d","postgres","-c",
  "select to_char(m,'YYYY-MM'),a,private.manual_anchor(m::date,a) from generate_series(date '2023-01-01',date '2024-12-01',interval '1 month') m cross join generate_series(1,31) a"],
  { encoding:"utf8" }).trim().split(/\r?\n/);
assert.equal(calendar.length,744);
for (const row of calendar) {
  const [month,day,actual] = row.split("|");
  assert.equal(monthlyAnchorDate(month,Number(day)),actual);
}
console.log("PASS 744 comparisons of TypeScript and PostgreSQL monthly anchors");
