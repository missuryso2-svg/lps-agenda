\set ON_ERROR_STOP on
select version();
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') order by 1,2;
select n.nspname,p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,
 has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,
 has_function_privilege('service_role',p.oid,'execute') service,p.proconfig
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','private') order by 1,2,3;
select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname in ('postgres','authenticated','anon','service_role') or rolname like 'lps_%' order by 1;
select name,setting from pg_settings where name in ('max_connections','statement_timeout','idle_in_transaction_session_timeout','server_version_num');
