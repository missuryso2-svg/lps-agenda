\set ON_ERROR_STOP on
begin;
do $$begin
 if not exists(select from storage.buckets where id='barber-photos' and not public and allowed_mime_types=array['image/webp']) then raise exception 'Bucket must be private'; end if;
 if has_function_privilege('authenticated','public.replace_barber_photo(uuid,uuid,uuid,text,text)','execute')
 or has_function_privilege('anon','public.replace_barber_photo(uuid,uuid,uuid,text,text)','execute')
 or not has_function_privilege('service_role','public.replace_barber_photo(uuid,uuid,uuid,text,text)','execute') then raise exception 'Invalid photo grants';end if;
end $$;
rollback;
