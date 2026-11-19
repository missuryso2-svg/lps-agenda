-- Run only in the fresh B1 QA database, after the 19 pre-B1 migrations.
\set ON_ERROR_STOP on
begin;
create schema b1_fixture;
insert into public.barbershops(slug, name) values ('b1-legacy','B1 Legacy');
insert into public.subscriptions(barbershop_id, plan_id, status, gateway_subscription_id)
select s.id, p.id, 'active', 'fixture-legacy-sub' from public.barbershops s, public.plans p
where s.slug = 'b1-legacy' and p.code = 'basico';
insert into public.payments(barbershop_id, subscription_id, scope, amount_cents,
  status, method, paid_at, gateway_payment_id)
select barbershop_id, id, 'platform_subscription', 4990, 'paid', 'pix', now(),
  'fixture-legacy-payment' from public.subscriptions where gateway_subscription_id = 'fixture-legacy-sub';
insert into public.payments(barbershop_id, amount_cents, scope, method)
select id, 2200, 'shop_service', 'cash' from public.barbershops where slug = 'b1-legacy';

create table b1_fixture.legacy_rows as
select 'subscriptions' as relation, id, to_jsonb(s) as snapshot from public.subscriptions s
union all
select 'payments', id, to_jsonb(p) from public.payments p;
commit;
