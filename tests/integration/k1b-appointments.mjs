import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { admin, ids, session, sql } from "./local-next-qa.mjs";
import { bookingFixture } from "./j2d-fixture.mjs";

const owner = await session(), staff = await session(), outsider = await session();
const fixture = await bookingFixture({ owner });
const other = await bookingFixture({ owner: outsider });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const shop = fixture.shop, date = fixture.day;
sql("insert into public.barbershop_members(barbershop_id,user_id,role) values('" + shop + "','" + staff.id + "','staff')");
const customer = sql("insert into public.customers(barbershop_id,full_name) values('" + shop + "','Cliente sintético K1B') returning id");
const substitute = sql("insert into public.customers(barbershop_id,full_name) values('" + shop + "','Outro cliente sintético') returning id");
function payload(hour = "09:00") {
  return {
    barbershop_id: shop, barber_id: fixture.barber, customer_id: customer, service_id: fixture.service,
    starts_at: date + "T" + hour + ":00-03:00",
    ends_at: new Date(Date.parse(date + "T" + hour + ":00-03:00") + 1_800_000).toISOString(),
    price_cents: 1, created_by: outsider.id,
  };
}
const denial = (response, code = "23514") => assert.equal(response.error?.code, code);
async function create(actor, hour) {
  const response = await actor.client.from("appointments").insert(payload(hour)).select("id,price_cents,created_by,status").single();
  assert.ifError(response.error);
  assert.equal(response.data.price_cents, 6500);
  assert.equal(response.data.created_by, actor.id);
  assert.equal(response.data.status, "scheduled");
  return response.data.id;
}
const update = (actor, id, values) => actor.client.from("appointments").update(values).eq("id", id).select("id,status");
const complete = (actor, id, score = 9) => actor.client.rpc("complete_rated_appointment", {
  shop, booking: id, barber_score: score, shop_score: null,
});
for (const actor of [staff, owner]) {
  for (const status of ["confirmed", "in_progress", "completed", "cancelled", "no_show"]) {
    denial(await actor.client.from("appointments").insert({ ...payload(), status }));
  }

}
denial(await anon.from("appointments").select("id"), "42501");
const suppliedToken = ids();
const inserted = await staff.client.from("appointments").insert({
  ...payload("09:00"), public_token: suppliedToken,
}).select("id,price_cents,created_by,status,public_token").single();
assert.ifError(inserted.error);
assert.notEqual(inserted.data.public_token, suppliedToken);
assert.equal(inserted.data.price_cents, 6500);
assert.equal(inserted.data.created_by, staff.id);
assert.equal(inserted.data.status, "scheduled");
const appointment = inserted.data.id;
const inaccessible = await update(outsider, appointment, { status: "cancelled" });
assert.ifError(inaccessible.error);
assert.deepEqual(inaccessible.data, []);
denial(await outsider.client.from("appointments").insert(payload("09:30")), "42501");
denial(await complete(outsider, appointment), "42501");
console.log("PASS authorized initial state and attribution, all terminal/advanced inserts rejected, outsider and anon denied");

assert.ifError((await update(owner, appointment, { status: "confirmed" })).error);
denial(await update(staff, appointment, { status: "scheduled" }));
denial(await update(staff, appointment, { status: "completed" }));
denial(await update(staff, appointment, { starts_at: date + "T09:08:00-03:00", ends_at: date + "T09:38:00-03:00" }));
denial(await update(staff, appointment, { status: "cancelled", starts_at: date + "T10:00:00-03:00" }));
denial(await update(staff, appointment, { customer_id: substitute }));
denial(await update(staff, appointment, { public_token: ids() }));
assert.ifError((await update(staff, appointment, {
  starts_at: date + "T10:00:00-03:00", ends_at: date + "T10:30:00-03:00",
})).error);
assert.ifError((await update(staff, appointment, { status: "in_progress" })).error);
denial(await update(owner, appointment, { status: "cancelled" }));
denial(await update(owner, appointment, { status: "no_show" }));
denial(await update(owner, appointment, { starts_at: date + "T10:30:00-03:00", ends_at: date + "T11:00:00-03:00" }));
assert.ifError((await complete(owner, appointment)).error);
assert.ifError((await complete(staff, appointment)).error);
denial(await complete(staff, appointment, 1));
denial(await update(owner, appointment, { status: "scheduled" }));
denial(await update(owner, appointment, { price_cents: 1 }));
denial(await owner.client.from("appointments").delete().eq("id", appointment));
assert.equal(sql("select status||'|'||price_cents from public.appointments where id='" + appointment + "'"), "completed|6500");
const vote = await owner.client.from("appointment_ratings").select("recorded_by,barber_score").eq("appointment_id", appointment).single();
assert.ifError(vote.error);
assert.deepEqual(vote.data, { recorded_by: owner.id, barber_score: 9 });
console.log("PASS transition graph, future grid reschedule, immutable identity and price, ratings completion and exact replay");

const missing = await create(owner, "11:00");
assert.ifError((await update(staff, missing, { status: "no_show" })).error);
denial(await update(owner, missing, { status: "confirmed" }));
const absent = await create(owner, "11:30");
assert.ifError((await update(staff, absent, { status: "confirmed" })).error);
assert.ifError((await update(staff, absent, { status: "no_show" })).error);

const booked = await create(owner, "14:00");
const commands = await Promise.all([
  update(staff, booked, { status: "in_progress" }),
  update(owner, booked, { status: "cancelled", cancel_reason: "Solicitado pelo cliente" }),
]);
assert.equal(commands.filter(r => !r.error && r.data.length === 1).length, 1);
denial(commands.find(r => r.error));
const status = sql("select status from public.appointments where id='" + booked + "'");
assert.ok(["in_progress", "cancelled"].includes(status));
const actorRows = await owner.client.from("appointments").select("id").eq("barbershop_id", other.shop);
assert.ifError(actorRows.error);
assert.deepEqual(actorRows.data, []);
console.log("PASS mutually exclusive concurrent updates, no-show via both legal origins and tenant isolation");

const publicId = ids(), token = ids();
assert.ifError((await admin.from("appointments").insert({
  ...payload("15:00"), id: publicId, price_cents: 6500, created_by: null, public_token: token,
})).error);
denial(await admin.from("appointments").update({ status: "confirmed" }).eq("id", publicId));
const cancel = await admin.from("appointments").update({
  status: "cancelled", cancel_reason: "Cancelada pelo cliente na página pública",
}).eq("id", publicId).eq("public_token", token);
assert.ifError(cancel.error);
denial(await admin.from("appointments").update({ status: "confirmed" }).eq("id", publicId));
denial(await update(owner, publicId, { cancel_reason: "Reescrita indevida" }));
const past = ids();
sql("insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,status,price_cents,public_token) " +
  "values('" + [past, shop, fixture.barber, fixture.service, customer].join("','") +
  "',now()-interval '2 hours',now()-interval '90 minutes','cancelled',6500,'" + ids() + "')");
denial(await admin.from("appointments").update({ status: "scheduled" }).eq("id", past));
console.log("PASS future bearer booking cancels through service path and reactivation or reason rewrite denied");
