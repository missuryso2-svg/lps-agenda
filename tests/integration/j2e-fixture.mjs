import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { admin, ids, session, sql } from "./local-next-qa.mjs";

const file = process.env.J2E_QA_FIXTURE;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const root = "/admin/assinaturas";
export const competence = sql("select to_char(transaction_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM')");
export const dateTime = (milliseconds = Date.now()) => new Date(milliseconds).toISOString().slice(0, 16);
export const planId = code => {
  assert.ok(["premium", "basico"].includes(code));
  return sql("select id from public.plans where code='" + code + "'");
};

export async function authenticate(account) {
  const jar = new Map();
  const db = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: items => items.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data, error } = await db.auth.signInWithPassword(account);
  assert.ifError(error);
  return { id: data.user.id, client: db, cookies: () => [...jar].map(pair => pair.join("=")).join("; ") };
}

async function makeAccount(role) {
  const email = "j2e-" + role + "-" + ids().slice(0, 8) + "@example.test";
  const password = ids() + "Aa3!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  return { email, password, id: data.user.id };
}

export async function makeShop(name, { trial = false, elapsedHours = 0, owner = null } = {}) {
  assert.match(name, /^[\p{L}\d -]+$/u);
  const shopOwner = owner ?? await session();
  const slug = "j2e-finance-" + ids().slice(0, 12);
  let id;
  if (trial) {
    assert.equal(sql("select enabled from private.automatic_premium_trial_activation"), "f");
    try {
      sql("update private.automatic_premium_trial_activation set enabled=true");
      const { data, error } = await shopOwner.client.rpc("create_barbershop", { p_name: name, p_slug: slug });
      assert.ifError(error);
      id = data;
    } finally {
      sql("update private.automatic_premium_trial_activation set enabled=false");
    }
    if (elapsedHours) {
      assert.ok(Number.isInteger(elapsedHours) && elapsedHours > 0 && elapsedHours <= 169);
      const start = "now()-interval '" + elapsedHours + " hours'";
      const end = "(" + start + ")+interval '168 hours'";
      sql("begin; update private.automatic_premium_trials set started_at=" + start + ",ends_at=" + end + " where shop_id='" + id +
        "'; update public.subscriptions set trial_started_at=" + start + ",trial_ends_at=" + end + " where barbershop_id='" + id + "'; commit;");
    }
  } else {
    id = ids();
    sql("insert into public.barbershops(id,name,slug) values('" + id + "','" + name + "','" + slug + "');" +
      "insert into public.barbershop_members(barbershop_id,user_id,role) values('" + id + "','" + shopOwner.id + "','owner');");
  }
  return { id, name, slug };
}

export function terms(cents, plan = planId("premium")) {
  const now = Date.now();
  return {
    plan_id: plan, monthly_cents: cents, currency: "BRL", terms: "Condições acordadas para validação local",
    coverage_start: new Date(now - 60_000).toISOString(), first_month: competence + "-01",
    first_due: new Date(now + 7 * 86_400_000).toISOString(), renewal_day: 15,
    due_day: 15, due_month_offset: 1, due_time: "10:00", zone: "UTC", booking_impact_accepted: true,
  };
}
export async function call(actor, name, args) {
  const { data, error } = await actor.client.rpc(name, args);
  assert.ifError(error);
  return data;
}

export async function agreement(actor, shop, commercialTerms) {
  return call(actor, "finance_agreement", {
    op: ids(), shop, reference: "Acordo sintético J2-E", reason: "Conferência administrativa de QA", terms: commercialTerms,
  });
}

export async function fixture(create = false) {
  assert.match(file, /[\\/]Temp[\\/]lps-j2e-accounts(?:-desktop)?\.json$/i);
  if (!create) return JSON.parse(await readFile(file, "utf8"));

  const manager = await makeAccount("manager"), operator = await makeAccount("operator");
  const customer = await makeAccount("owner");
  sql("insert into private.financial_operators(user_id,level,infrastructure_identity,grant_reason) values('" +
    manager.id + "','manager',session_user,'Fixture sintetica J2-E')");
  const managerAuth = await authenticate(manager);
  await call(managerAuth, "finance_operator", { target: operator.id, permission: "operator", reason: "Conta sintética J2-E" });

  const prefix = "Aurora J2E " + ids().slice(0, 4);
  const active = await makeShop(prefix + " - Trial vigente", { trial: true });
  const expired = await makeShop(prefix + " - Trial encerrado", { trial: true, elapsedHours: 169 });
  const paid = await makeShop(prefix + " - Pix conferido", { owner: await authenticate(customer) });
  const pending = await makeShop(prefix + " - Aguardando Pix");
  const newContract = await makeShop(prefix + " - Aplicar acordo");
  for (const [shop, amount, settle] of [[paid, 6190, true], [pending, 4790, false]]) {
    const { contract } = await agreement(managerAuth, shop.id, terms(amount));
    const { invoice } = await call(managerAuth, "finance_invoice", { op: ids(), shop: shop.id, contract, competence: competence + "-01" });
    if (settle) await call(managerAuth, "finance_confirm_pix", {
      op: ids(), shop: shop.id, contract, invoice, received_cents: amount, credited_at: new Date().toISOString(),
      checked: true, reference: "j2e-" + ids(),
    });
  }

  const result = { manager, operator, customer, prefix, active, expired, paid, pending, newContract, competence };
  await writeFile(file, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  return result;
}
