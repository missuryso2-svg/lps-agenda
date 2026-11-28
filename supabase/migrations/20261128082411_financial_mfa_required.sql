-- Financial reads and writes share an authorization entry point. Revalidate the
-- live TOTP session because a signed access token can outlive a revoked session.
create function private.has_live_financial_totp(actor uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  session_id uuid;
begin
  if actor is null or claims->>'aal' is distinct from 'aal2' then return false; end if;
  begin
    session_id := nullif(claims->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select from auth.sessions s
    join auth.mfa_factors f on f.id = s.factor_id and f.user_id = s.user_id
    where s.id = session_id and s.user_id = actor
      and s.aal = 'aal2' and f.factor_type = 'totp' and f.status = 'verified'
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
end $$;

revoke all on function private.has_live_financial_totp(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.has_live_financial_totp(uuid) to lps_financial_api;

create or replace function private.financial_actor(manager_only boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := private.trial_onboarding_actor();
begin
  perform 1 from private.financial_operators where user_id = actor and revoked_at is null
    and (not manager_only or level = 'manager') for share;
  if not found then raise exception 'Financial authorization required' using errcode = '42501'; end if;
  if not private.has_live_financial_totp(actor) then
    raise exception 'A verified TOTP session is required' using errcode = 'LP037';
  end if;
  return actor;
end $$;
