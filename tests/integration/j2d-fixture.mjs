// Synthetic local Supabase only. This fixture never changes existing shops.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { admin, ids, session, sql } from "./local-next-qa.mjs";

export async function bookingFixture({ trial = false, brand = false, owner: suppliedOwner } = {}) {
  const owner = suppliedOwner ?? await session();
  const suffix = ids().slice(0, 8);
  const slug = "aurora-j2d-" + suffix;
  let shop;
  if (trial) {
    assert.equal(sql("select enabled from private.automatic_premium_trial_activation"), "f");
    try {
      sql("update private.automatic_premium_trial_activation set enabled=true");
      const { data, error } = await owner.client.rpc("create_barbershop", { p_name: "Barbearia Aurora QA", p_slug: slug });
      assert.ifError(error);
      shop = data;
    } finally {
      sql("update private.automatic_premium_trial_activation set enabled=false");
    }
  } else {
    shop = ids();
    sql("insert into public.barbershops(id,name,slug) values('" + shop + "','Barbearia Aurora QA','" + slug + "');");
    sql("insert into public.barbershop_members(barbershop_id,user_id,role) values('" + shop + "','" + owner.id + "','owner');");
  }
  const [barber, alternate, hiddenBarber, service, beard, hiddenService, unassigned] = Array.from({ length: 7 }, ids);
  sql([
    "update public.barbershops set description='Cortes clássicos e cuidado com a barba, com hora marcada.',phone='11999990000',address_street='Rua Aurora',address_number='120',address_city='São Paulo',address_state='SP' where id='" + shop + "';",
    "insert into public.barbers(id,barbershop_id,name,bio,is_active,display_order) values ('" + barber + "','" + shop + "','Rafael QA','Especialista em cortes clássicos.',true,0),('" + alternate + "','" + shop + "','Marina QA',null,true,1),('" + hiddenBarber + "','" + shop + "','Profissional inativo QA',null,true,2);",
    "insert into public.services(id,barbershop_id,name,description,duration_minutes,price_cents,is_active) values ('" + service + "','" + shop + "','Corte clássico','Corte na tesoura ou na máquina, com acabamento.',30,6500,true),('" + beard + "','" + shop + "','Barba tradicional','Toalha quente e acabamento de barba.',30,4500,true),('" + hiddenService + "','" + shop + "','Serviço inativo QA',null,30,999,true),('" + unassigned + "','" + shop + "','Serviço sem equipe QA',null,30,999,true);",
    "insert into public.barber_services(barbershop_id,barber_id,service_id) values ('" + [shop, barber, service].join("','") + "'),('" + [shop, alternate, service].join("','") + "'),('" + [shop, barber, beard].join("','") + "'),('" + [shop, hiddenBarber, service].join("','") + "'),('" + [shop, barber, hiddenService].join("','") + "');",
    "update public.services set is_active=false where id='" + hiddenService + "';",
    "update public.barbers set is_active=false where id='" + hiddenBarber + "';",
    "insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) select '" + shop + "',d,'09:00','18:00' from generate_series(1,6)d;",
    "insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) select '" + shop + "',b,d,'09:00','18:00' from unnest(array['" + barber + "'::uuid,'" + alternate + "'::uuid]) b cross join generate_series(1,6)d;",
  ].join("\n"));
  if (brand) {
    const logoKey = shop + "/" + ids() + ".webp";
    const image = await readFile("public/brand/lps.webp");
    assert.ifError((await admin.storage.from("barbershop-logos").upload(logoKey, image, { contentType: "image/webp" })).error);
    const logo = await owner.client.rpc("replace_barbershop_logo", {
      p_barbershop_id: shop, p_expected_object: null, p_replacement_object: logoKey,
    });
    assert.ifError(logo.error);
    assert.equal(logo.data?.current, logoKey);
    const key = shop + "/" + alternate + "/" + ids() + ".webp";
    assert.ifError((await admin.storage.from("barber-photos").upload(key, image, { contentType: "image/webp" })).error);
    const photo = await admin.rpc("replace_barber_photo", { actor: owner.id, shop, professional: alternate, previous: null, replacement: key });
    assert.ifError(photo.error);
    assert.equal(photo.data, true);
  }
  const [day, closed] = sql("select (select d::date from generate_series(current_date+2,current_date+8,interval '1 day') d where extract(dow from d) between 1 and 6 limit 1),(select d::date from generate_series(current_date+2,current_date+8,interval '1 day') d where extract(dow from d)=0 limit 1)").split("|");
  return { shop, slug, barber, alternate, service, beard, day, closed };
}

export async function visualFixture(file, stage) {
  assert.match(file, /[\\/]Temp[\\/]lps-j2d-fixture\.json$/i);
  if (stage === "before") {
    const fixture = await bookingFixture({ brand: true });
    await writeFile(file, JSON.stringify(fixture));
    return fixture;
  }
  return JSON.parse(await readFile(file, "utf8"));
}
