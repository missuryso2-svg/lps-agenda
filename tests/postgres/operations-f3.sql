\set ON_ERROR_STOP on
begin;
-- Simulate a storage constraint failing after the status update. The subtransaction must roll back both writes.
create function pg_temp.reject_fixture_score() returns trigger language plpgsql as $$
begin if new.shop_score=7 then raise check_violation; end if; return new; end $$;
create trigger f3_fixture_fault before insert on public.appointment_ratings for each row execute function pg_temp.reject_fixture_score();
do $$
declare shop uuid:=gen_random_uuid(); prof uuid:=gen_random_uuid(); service uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
 actor uuid:=gen_random_uuid(); a uuid; start_day date:=current_date+14; w int:=extract(dow from start_day);
 start_at timestamptz:=(start_day+time '11:45') at time zone 'America/Manaus';
begin
 if has_function_privilege('anon','public.complete_rated_appointment(uuid,uuid,integer,integer)','execute')
   or has_table_privilege('authenticated','public.appointment_ratings','insert') then raise exception 'Invalid grants';end if;
 insert into auth.users(id,email) values(actor,actor::text||'@example.test');
 insert into public.barbershops(id,name,slug,timezone) values(shop,'Agenda QA','qa-'||shop,'America/Manaus');
 insert into public.barbershop_members(barbershop_id,user_id,role) values(shop,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.barbers(id,barbershop_id,name) values(prof,shop,'Equipe QA');
 insert into public.services(id,barbershop_id,name,duration_minutes,price_cents) values(service,shop,'Corte QA',30,3100);
 insert into public.barber_services(barbershop_id,barber_id,service_id) values(shop,prof,service);
 insert into public.customers(id,barbershop_id,full_name) values(customer,shop,'Cliente QA');
 insert into public.business_hours(barbershop_id,weekday,opens_at,closes_at) values(shop,w,'08:00','18:00');
 insert into public.barber_working_hours(barbershop_id,barber_id,weekday,starts_at,ends_at) values(shop,prof,w,'09:00','17:00');
 begin insert into public.barber_breaks values(shop,prof,w,'08:00','09:30',true);raise exception 'Unexpected break outside workday';exception when check_violation then null;end;
 insert into public.barber_breaks values(shop,prof,w,'12:00','13:00',true);
 begin perform public.book_new_walk_in(shop,prof,service,'Fora da grade',start_at-interval '8 minutes','');raise exception 'Off-grid booking accepted';exception when check_violation then null;end;
 insert into public.blocked_slots(barbershop_id,barber_id,starts_at,ends_at) values(shop,prof,start_at-interval '90 minutes',start_at-interval '60 minutes');
 begin perform public.book_new_walk_in(shop,prof,service,'Bloqueio',start_at-interval '105 minutes','');raise exception 'Blocked slot accepted';exception when check_violation then null;end;
 update public.barber_breaks set is_active=false where barbershop_id=shop;
 a:=public.book_new_walk_in(shop,prof,service,'Sem pausa',start_at,'');
 update public.appointments set status='cancelled' where id=a;
 update public.barber_breaks set is_active=true where barbershop_id=shop;
 if (select status from public.appointments where id=a)<>'cancelled' then raise exception 'Historical status changed';end if;
 begin perform public.book_new_walk_in(shop,prof,service,'Conflito QA',start_at,'');raise exception 'Break crossing accepted';exception when check_violation then null;end;
 if exists(select from public.customers where barbershop_id=shop and full_name='Conflito QA') then raise exception 'Orphan customer';end if;
 a:=public.book_new_walk_in(shop,prof,service,'Presencial QA',start_at+interval '75 minutes','');
 begin update public.barber_breaks set ends_at='13:30' where barbershop_id=shop;raise exception 'Conflicting change accepted';exception when exclusion_violation then null;end;
 begin perform public.complete_rated_appointment(shop,a,1,7);raise exception 'Expected fixture fault';exception when check_violation then null;end;
 if (select status from public.appointments where id=a)<>'scheduled' or exists(select from public.appointment_ratings where appointment_id=a) then raise exception 'Partial status or score after failure';end if;
 begin perform public.complete_rated_appointment(shop,a,11,0);raise exception 'Invalid rating';exception when invalid_parameter_value then null;end;
 if (select status from public.appointments where id=a)<>'scheduled' then raise exception 'Partial completion';end if;
 perform public.complete_rated_appointment(shop,a,0,10);
 perform public.complete_rated_appointment(shop,a,0,10);
 begin update public.appointments set status='scheduled' where id=a;raise exception 'Completed appointment reopened';exception when check_violation then null;end;
 if not exists(select from public.appointment_ratings where appointment_id=a and recorded_by=actor and barber_score=0 and shop_score=10) then raise exception 'Rating missing';end if;
 if (select count(*) from public.notifications where appointment_id=a and user_id=actor)<>1 then raise exception 'Notification mismatch';end if;
 begin perform public.complete_rated_appointment(shop,a,1,10);raise exception 'Conflicting repeat accepted';exception when check_violation then null;end;
 a:=public.book_new_walk_in(shop,prof,service,'Sem avaliação QA',start_at+interval '75 minutes','');
 perform public.complete_rated_appointment(shop,a,null,null);
 if exists(select from public.appointment_ratings where appointment_id=a) then raise exception 'Invented rating';end if;
 if (select count(*) from public.appointments where barbershop_id=shop and price_cents=3100 and status='completed')<>2 then raise exception 'Historical booking changed';end if;
end $$;
rollback;
