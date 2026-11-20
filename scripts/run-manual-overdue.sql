-- psql reads credentials from the scheduler's pg_service.conf and passfile.
\set ON_ERROR_STOP on
begin;
set local role lps_overdue_runner;
set local statement_timeout='25s';
set local lock_timeout='1s';
select private.run_overdue(50) as outcome \gset
commit;
\echo overdue_worker :outcome
select :'outcome' in ('ok','busy') as healthy \gset
\if :healthy
\else
  -- Alert the scheduler after committing partial progress and its audit.
  do $$ begin raise exception 'Overdue worker requires attention'; end $$;
\endif
