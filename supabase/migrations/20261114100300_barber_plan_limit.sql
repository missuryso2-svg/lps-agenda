-- LPS Agenda — limite de profissionais ativo por plano.
-- Defesa em profundidade: além da validação nas Server Actions, o banco
-- impede que inserções/reativações diretas pela Data API ultrapassem o
-- max_barbers do plano vigente da barbearia.
--
-- Barbearias sem assinatura vigente continuam sem bloqueio nesta fase, pois
-- ainda não existe plano gratuito nem trial operacional. Planos com
-- max_barbers nulo são ilimitados.

create or replace function private.enforce_barber_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_barbers integer;
begin
  if new.is_active is not true then
    return new;
  end if;

  -- Uma atualização que mantém o profissional já ativo não consome nova vaga.
  if tg_op = 'UPDATE' and old.is_active is true then
    return new;
  end if;

  select p.max_barbers
    into v_max_barbers
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.barbershop_id = new.barbershop_id
    and s.status in ('pending', 'trialing', 'active', 'past_due')
  order by s.created_at desc
  limit 1;

  if v_max_barbers is null then
    return new;
  end if;

  if (
    select count(*)
    from public.barbers b
    where b.barbershop_id = new.barbershop_id
      and b.is_active
      and b.id <> new.id
  ) >= v_max_barbers then
    raise exception
      'O plano permite até % profissional(is) ativo(s) nesta barbearia.',
      v_max_barbers
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.enforce_barber_plan_limit() is
  'Bloqueia inserção ou reativação de profissional acima do max_barbers do plano vigente.';

drop trigger if exists barbers_enforce_plan_limit on public.barbers;

create trigger barbers_enforce_plan_limit
  before insert or update of is_active on public.barbers
  for each row execute function private.enforce_barber_plan_limit();
