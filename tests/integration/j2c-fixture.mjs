import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { admin, ids, nextURL, session, sql } from "./local-next-qa.mjs";

export function browserCookies(actor) {
  return actor.cookies().split("; ").map(pair => {
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1), url: nextURL };
  });
}

export async function dashboardFixture(actors) {
  const [owner, staff, other] = actors ?? await Promise.all([session(), session(), session()]);
  const date = sql("select (now() at time zone 'America/Sao_Paulo')::date");
  const timeZone = "America/Sao_Paulo";
  const shop = ids(), second = ids(), foreign = ids();
  const barber = ids(), anotherBarber = ids(), service = ids(), anotherService = ids();
  const customers = Array.from({ length: 5 }, ids);
  const appointments = Array.from({ length: 5 }, ids);
  const slug = "qa-c1-" + shop.slice(0, 10);
  const key = shop + "/" + ids() + ".webp";
  const logo = await sharp(await readFile("public/brand/lps.webp"))
    .webp().toBuffer();
  assert.ifError((await admin.storage.from("barbershop-logos").upload(key, logo, { contentType: "image/webp" })).error);

  sql(`
    insert into public.barbershops(id,name,slug,timezone,logo_url) values
      ('${shop}','Barbearia Central QA','${slug}','${timeZone}','${key}');
    insert into public.barbershops(id,name,slug,timezone) values
      ('${second}','Barbearia Estação QA','qa-c1-${second}','${timeZone}'),
      ('${foreign}','Outra Barbearia QA','qa-c1-${foreign}','${timeZone}');
    insert into public.barbershop_members(barbershop_id,user_id,role) values
      ('${shop}','${owner.id}','owner'),('${shop}','${staff.id}','staff'),
      ('${second}','${owner.id}','owner'),('${foreign}','${other.id}','owner');
    update public.barbershop_members set created_at=now()-interval '2 seconds'
      where user_id='${owner.id}' and barbershop_id='${shop}';
    insert into public.barbers(id,barbershop_id,name) values
      ('${barber}','${shop}','Rafael Lima'),('${anotherBarber}','${shop}','Marina Costa');
    insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values
      ('${service}','${shop}','Corte clássico',30,6500),('${anotherService}','${shop}','Barba',30,5000);
    insert into public.barber_services(barbershop_id,barber_id,service_id) values
      ('${shop}','${barber}','${service}'),('${shop}','${anotherBarber}','${anotherService}');
    insert into public.customers(id,barbershop_id,full_name) values
      ('${customers[0]}','${shop}','Caio Martins'),('${customers[1]}','${shop}','Bruno Ferreira'),
      ('${customers[2]}','${shop}','Diego Ribeiro'),('${customers[3]}','${shop}','Elisa Prado'),
      ('${customers[4]}','${shop}','Felipe Souza');
    insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at)
      select '${shop}',d,'09:00','19:00' from generate_series(0,6)d;
    insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at)
      select '${shop}',b,d,'09:00','19:00' from generate_series(0,6)d
      cross join unnest(array['${barber}'::uuid,'${anotherBarber}'::uuid]) b;
    insert into public.appointments(id,barbershop_id,customer_id,barber_id,service_id,starts_at,ends_at,status,price_cents,created_by) values
      ('${appointments[0]}','${shop}','${customers[0]}','${barber}','${service}','${date} 09:30-03','${date} 10:00-03','completed',6500,'${owner.id}'),
      ('${appointments[1]}','${shop}','${customers[1]}','${barber}','${service}','${date} 11:00-03','${date} 11:30-03','confirmed',6500,'${owner.id}'),
      ('${appointments[2]}','${shop}','${customers[2]}','${anotherBarber}','${anotherService}','${date} 14:00-03','${date} 14:30-03','scheduled',5000,'${owner.id}'),
      ('${appointments[3]}','${shop}','${customers[3]}','${anotherBarber}','${anotherService}','${date} 15:00-03','${date} 15:30-03','cancelled',5000,'${owner.id}'),
      ('${appointments[4]}','${shop}','${customers[4]}','${barber}','${service}',('${date} 10:00-03'::timestamptz + interval '1 day'),('${date} 10:30-03'::timestamptz + interval '1 day'),'scheduled',6500,'${owner.id}');
    insert into public.blocked_slots(barbershop_id,barber_id,starts_at,ends_at,reason,created_by)
      values ('${shop}','${barber}','${date} 12:00-03','${date} 13:00-03','Intervalo reservado','${owner.id}');
    insert into public.payments(barbershop_id,appointment_id,scope,amount_cents,status,method,paid_at)
      values ('${shop}','${appointments[0]}','shop_service',6500,'paid','pix',now());
  `);
  return { owner, staff, other, date, shop, second, foreign, slug, barber, appointments, key };
}
