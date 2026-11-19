import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const project = process.env.B2A2_QA_PROJECT ?? "";
assert.match(project, /^b2a2-app-\d+$/);
const url = "http://127.0.0.1:59121";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, url);
assert.match(execFileSync("docker",["port","supabase_kong_"+project,"8000/tcp"],{encoding:"utf8"}),/:59121\b/);
const client = key => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const anonymous = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const service = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
async function account() {
  const email=randomUUID()+"@example.test", password=randomUUID()+"aB!";
  const user = await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{lps_role:"platform_admin"}});
  assert.ifError(user.error);
  const session = client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.ifError((await session.auth.signInWithPassword({email,password})).error);
  return { session, id:user.data.user.id };
}
function sql(command) {
  return execFileSync("docker",["exec","-i","supabase_db_"+project,"psql","-XqAt","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],
    {input:command,encoding:"utf8"}).trim();
}
const manager=await account(), operator=await account(), ordinary=await account();
for (const actor of [anonymous,service,ordinary.session]) {
  assert.equal((await actor.rpc("finance_shops")).error?.code,"42501");
  assert.equal((await actor.rpc("finance_confirm_pix",{op:randomUUID(),shop:randomUUID(),contract:randomUUID(),invoice:randomUUID(),
    received_cents:1,credited_at:new Date().toISOString(),checked:true})).error?.code,"42501");
}
console.log("PASS anonymous, ordinary legacy administrator and service cannot read or settle via Data API");
assert.equal((await ordinary.session.schema("private").from("financial_operators").select()).error?.code,"PGRST106");
assert.equal((await ordinary.session.rpc("bootstrap_financial_manager",{target:ordinary.id,reason:"QA"})).error?.code,"PGRST202");

// Only the disposable database connection prepares the manager fixture.
// The subsequent grant, journal queries and revocation use authenticated HTTP.
sql(`insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason)
     values('${manager.id}','manager',session_user,'Disposable HTTP fixture')`);
assert.ifError((await manager.session.rpc("finance_operator",{target:operator.id,permission:"operator",reason:"QA grant"})).error);
const shops=await operator.session.rpc("finance_shops",{page_size:1});
assert.ifError(shops.error);
assert.equal(shops.data.length,1);
const shop=shops.data[0].shop;
for (const [name,args] of [
  ["finance_invoices",{shop,bill_month:null,state:null,page_size:1}],
  ["finance_totals",{shop,bill_month:"2024-01-01"}],
  ["finance_history",{shop,page_size:1}],["finance_events",{shop,page_size:1}],
]) assert.ifError((await operator.session.rpc(name,args)).error);
assert.equal((await operator.session.rpc("finance_operator",{target:operator.id,permission:"manager",reason:"QA test"})).error?.code,"42501");
assert.ifError((await manager.session.rpc("finance_operator",{target:operator.id,permission:"revoke",reason:"QA revoke"})).error);
assert.equal((await operator.session.rpc("finance_shops")).error?.code,"42501");
console.log("PASS private bootstrap, bounded authorized queries and revocation on the same Auth session");
