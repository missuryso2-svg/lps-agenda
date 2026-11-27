import assert from "node:assert/strict";
import { ids, session, sql } from "./local-next-qa.mjs";

const [manager, operator, user] = await Promise.all([session(),session(),session()]);
sql("insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values('" +
  manager.id + "','manager',session_user,'Fixture synthétique K1B')", "supabase_admin");
assert.ifError((await manager.client.rpc("finance_operator", {
  target:operator.id, permission:"operator", reason:"Permissão sintética de QA",
})).error);
const prefix = "Carteira K1B " + ids().slice(0,8);
const root = ids().slice(0,24);
const shopIds = Array.from({length:25},(_,i)=>root+(i+1).toString(16).padStart(12,"0"));
const hours = [...Array(21).fill(120),48,20,-1,-2];
const shopValues = shopIds.map((id,i)=>"('"+id+"','"+prefix+" "+i+"','trial-filter-"+id+"')");
const hoursValues = shopIds.map((id,i)=>"('"+id+"'::uuid,"+hours[i]+","+(i===24?"true":"false")+")");
sql("insert into public.barbershops(id,name,slug) values"+shopValues.join(",")+";\n" +
  "insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,trial_started_at,trial_ends_at) " +
  "select fixture.shop,p.id,'manual_pix','inactive',case when fixture.canceled then 'canceled'::public.subscription_status else 'trialing'::public.subscription_status end," +
  "'uncontracted',now()+make_interval(hours=>fixture.hours-168),now()+make_interval(hours=>fixture.hours) " +
  "from (values"+hoursValues.join(",")+") fixture(shop,hours,canceled) cross join public.plans p where p.code='basico';", "supabase_admin");

const args = { name_prefix:prefix, page_size:2 };
const { data: firstPage, error } = await manager.client.rpc("finance_directory", { name_prefix:prefix, page_size:20 });
assert.ifError(error);
assert.equal(firstPage.length, 20);
assert.ok(firstPage.every(row=>!shopIds.slice(21).includes(row.shop)));

for (const actor of [manager,operator]) {
  const fetch = async (filter, cursor = undefined) => {
    const { data, error } = await actor.client.rpc("finance_trial_directory", {
      ...args, trial_filter:filter, after_id:cursor,
    });
    assert.ifError(error);
    return data.map(row=>row.shop);
  };
  assert.deepEqual(await fetch("active"),shopIds.slice(0,2));
  assert.deepEqual(await fetch("active",shopIds[20]),shopIds.slice(21,23));
  assert.deepEqual(await fetch("ending_soon"),shopIds.slice(21,23));
  assert.deepEqual(await fetch("ending_soon",shopIds[21]),[shopIds[22]]);
  assert.deepEqual(await fetch("last_day"),[shopIds[22]]);
  assert.deepEqual(await fetch("expired"),[shopIds[23]]);
}
const denied = await user.client.rpc("finance_trial_directory", {...args,trial_filter:"active"});
assert.equal(denied.error?.code,"42501");
const invalid = await operator.client.rpc("finance_trial_directory", {...args,trial_filter:"invalid"});
assert.equal(invalid.error?.code,"22023");
assert.equal(sql("select count(*) from public.payments p join public.barbershops b on b.id=p.barbershop_id where b.name like '"+prefix+"%'"),"0");
console.log("PASS global active/expired/72h/24h filter before pagination, manager/operator only, canceled excluded, no trial payments");
