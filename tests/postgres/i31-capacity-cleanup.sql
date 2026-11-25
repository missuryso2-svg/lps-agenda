\set ON_ERROR_STOP on
\ir b2b-fixtures.sql
create extension if not exists dblink with schema extensions;
select gen_random_uuid() as a, gen_random_uuid() as b, gen_random_uuid() as c,
  gen_random_uuid() as actor, gen_random_uuid() as logo_id \gset
insert into public.barbershops(id,name,slug)
select id,'QA I31','qa-'||id from unnest(array[:'a'::uuid,:'b',:'c']) id;
select to_jsonb(pg_temp.terms()) || jsonb_build_object('coverage_start',now()+interval '1 month') as terms \gset
select pg_temp.verify('unenrolled booking is initially allowed',
  (private.booking_access_at(:'a',now())->>'allowed')::boolean);
select private.register_manual_agreement(gen_random_uuid(),:'a',jsonb_populate_record(pg_temp.terms(),:'terms'));
select pg_temp.verify('future pending agreement below cap blocks booking immediately',
  not (private.booking_access_at(:'a',now())->>'allowed')::boolean);
insert into public.barbers(barbershop_id,name,is_active)
select id,n,n='QA ativo' from unnest(array[:'b'::uuid,:'c']) id
cross join unnest(array['QA ativo','QA inativo']) n;
select extensions.dblink_connect('i31','dbname=postgres user=supabase_admin application_name=i31_peer');
create function pg_temp.wait_for_peer() returns void language plpgsql as $$
declare deadline timestamptz:=clock_timestamp()+interval '8 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select from pg_stat_activity where application_name='i31_peer'
      and pg_backend_pid()=any(pg_blocking_pids(pid)));
    if clock_timestamp()>deadline then raise exception 'Expected peer to wait'; end if;
    perform pg_sleep(0.02);
  end loop;
end $$;

-- Activation commits first. The waiting agreement must see both professionals.
begin;
update public.barbers set is_active=true where barbershop_id=:'b' and not is_active;
select extensions.dblink_send_query('i31',format(
 'select private.register_manual_agreement(gen_random_uuid(),%L,jsonb_populate_record(null::private.manual_agreement_terms,%L))',
 :'b',:'terms'));
select pg_temp.wait_for_peer();
commit;
select * from extensions.dblink_get_result('i31',false) as r(id uuid);
select pg_temp.verify('agreement above cap rejected after concurrent activation',
 extensions.dblink_error_message('i31') like '%Active team exceeds%');
select * from extensions.dblink_get_result('i31') as r(id uuid);
select pg_temp.verify('team preserved and agreement rolled back',
 (select count(*)=2 from public.barbers where barbershop_id=:'b' and is_active)
 and not exists(select from public.subscriptions where barbershop_id=:'b'));

-- Agreement commits first at the exact limit. The waiting activation sees the cap.
begin;
select private.register_manual_agreement(gen_random_uuid(),:'c',pg_temp.terms());
select extensions.dblink_send_query('i31',format(
 'update public.barbers set is_active=true where barbershop_id=%L and not is_active returning id',:'c'));
select pg_temp.wait_for_peer();
commit;
select * from extensions.dblink_get_result('i31',false) as r(id uuid);
select pg_temp.verify('activation waits for contract and cannot exceed cap',
 extensions.dblink_error_message('i31') like '%plano permite%');
select * from extensions.dblink_get_result('i31') as r(id uuid);
select pg_temp.verify('agreement at exact cap and one active professional',
 (select count(*)=1 from public.subscriptions where barbershop_id=:'c' and status='pending')
 and (select count(*)=1 from public.barbers where barbershop_id=:'c' and is_active));

select :'b'||'/'||:'logo_id'||'.webp' as obj \gset
insert into auth.users(id) values(:'actor');
insert into public.barbershop_members(barbershop_id,user_id,role) values(:'b',:'actor','owner');
insert into storage.objects(bucket_id,name,created_at)
values('barbershop-logos',:'obj',now()-interval '1 hour');
select pg_temp.rejected('administrative claim rejects another tenant key',
 format('select private.claim_retired_logo(%L,%L)',:'a',:'obj'),'22023');
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor','role','authenticated')::text,false);
begin;
select public.replace_barbershop_logo(:'b',null,:'obj');
select extensions.dblink_send_query('i31',format('select private.claim_retired_logo(%L,%L)',:'b',:'obj'));
select pg_temp.wait_for_peer();
commit;
select pg_temp.verify('claim racing a replacement preserves the referenced logo', not claimed)
from extensions.dblink_get_result('i31') as r(claimed boolean);
select * from extensions.dblink_get_result('i31') as r(claimed boolean);
select public.replace_barbershop_logo(:'b',:'obj',null);
delete from public.barbershops where id=:'b';
select pg_temp.verify('retirement survives tenant deletion',
 exists(select from private.barbershop_logo_cleanup where barbershop_id=:'b' and object_name=:'obj'));
select pg_temp.verify('deleted tenant can be reconciled',private.claim_retired_logo(:'b',:'obj'));
select pg_temp.verify('claim is repeatable',private.claim_retired_logo(:'b',:'obj'));
select pg_temp.verify('single audit entry and no premature acknowledgement',
 (select count(*)=1 from private.logo_reconciliation_log where shop=:'b')
 and not private.finish_retired_logo(:'b',:'obj'));
select extensions.dblink_disconnect('i31');
