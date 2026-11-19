-- Disposable QA. Per-session fixture builders, never installed by migrations.
create function pg_temp.enrolled_shop() returns uuid language plpgsql as $$
declare shop uuid;
begin
  insert into public.barbershops(name,slug) values('QA manual','qa-'||gen_random_uuid()) returning id into shop;
  insert into public.subscriptions(barbershop_id,plan_id,gateway,gateway_status,status,invoice_link_key,trial_started_at,trial_ends_at)
  select shop,id,'manual_pix','inactive','trialing','uncontracted','2019-01-01Z','2019-01-08Z' from public.plans where code='basico';
  return shop;
end $$;
create function pg_temp.terms() returns private.manual_agreement_terms language sql as $$
  select id,4321,'BRL'::text,'Termos QA'::text,'2023-01-31 15:00Z'::timestamptz,
    '2023-01-01'::date,'2023-01-20 18:30Z'::timestamptz,31,31,0,'10:30'::time,'America/New_York'::text
  from public.plans where code='basico'
$$;
create function pg_temp.verify(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL %',label; end if;
  raise notice 'PASS %',label;
end $$;
create function pg_temp.rejected(label text, command text, expected text) returns void language plpgsql as $$
declare code text;
begin
  begin execute command; exception when others then code:=sqlstate; end;
  perform pg_temp.verify(label,code is not distinct from expected);
end $$;
