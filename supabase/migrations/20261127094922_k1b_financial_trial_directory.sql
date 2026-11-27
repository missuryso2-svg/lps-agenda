begin;

-- Same authorization and projection as finance_directory, with the predicate
-- evaluated before the cursor limit. This RPC adds no table privilege.
grant lps_financial_api to postgres with inherit false, set true;
grant create on schema public to lps_financial_api;
set role lps_financial_api;

create function public.finance_trial_directory(
  trial_filter text, name_prefix text default null, after_id uuid default null, page_size integer default 30
)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare observed timestamptz := statement_timestamp();
begin
  perform private.financial_actor();
  if trial_filter is null or trial_filter not in ('active','expired','ending_soon','last_day')
    or length(name_prefix)>80 then
    raise exception 'Filtro de trial inválido.' using errcode='22023';
  end if;

  return query select to_jsonb(d)
  from private.finance_shop_directory d
  where d.origin='trial'
    and (name_prefix is null or starts_with(lower(d.name),lower(name_prefix)))
    and (after_id is null or d.shop>after_id)
    and (
      (trial_filter='expired' and d.status in ('trialing','expired') and d.trial_end<=observed)
      or (
        trial_filter<>'expired' and d.status='trialing' and d.trial_start<=observed and d.trial_end>observed
        and (trial_filter<>'ending_soon' or d.trial_end<=observed+interval '72 hours')
        and (trial_filter<>'last_day' or d.trial_end<=observed+interval '24 hours')
      )
    )
  order by d.shop limit private.finance_page_size(page_size);
end
$$;
revoke all on function public.finance_trial_directory(text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.finance_trial_directory(text,text,uuid,integer) to authenticated;

reset role;
revoke create on schema public from lps_financial_api;
revoke lps_financial_api from postgres;

commit;
