-- Partes creados por el administrador: el tecnico asignado recibe aviso push y puede ver las fotos.
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUES de SUPABASE_AUTH_ROLES.sql y SUPABASE_PUSH.sql.
-- Despues hay que volver a desplegar la funcion send-push (supabase/functions/send-push/index.ts).
-- Es seguro repetirlo.

-- 1) Fotos de partes: las ve el administrador, el tecnico que lo creo y el tecnico asignado.
--    DNI y firmas siguen ocultos para el resto de tecnicos.
create or replace function public.get_app_work_parts(p_id text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
  result jsonb;
begin
  if not public.app_is_active_user() then
    raise exception 'Authentication required';
  end if;
  execute format(
    'select coalesce(jsonb_agg(
       case
         when public.app_is_admin() or row_data->>''createdby'' = auth.uid()::text
           then row_data
         when row_data->>''empleadoid'' is not null and row_data->>''empleadoid'' = public.app_employee_id()
           then row_data - array[
             ''clientedni'', ''empleadodni'', ''dnicliente'', ''dnitecnico'',
             ''dniCliente'', ''dniTecnico'', ''clienteDni'', ''empleadoDni'',
             ''firmatecnico'', ''firmacliente'', ''firmaTecnico'', ''firmaCliente'',
             ''cliente_dni'', ''empleado_dni'', ''dni_cliente'', ''dni_tecnico'',
             ''firma_tecnico'', ''firma_cliente'', ''dni'', ''DNI''
           ]
         else row_data - array[
           ''clientedni'', ''empleadodni'', ''dnicliente'', ''dnitecnico'',
           ''dniCliente'', ''dniTecnico'', ''clienteDni'', ''empleadoDni'',
           ''firmatecnico'', ''firmacliente'', ''firmaTecnico'', ''firmaCliente'',
           ''cliente_dni'', ''empleado_dni'', ''dni_cliente'', ''dni_tecnico'',
           ''firma_tecnico'', ''firma_cliente'', ''fotos'', ''Fotos'', ''FOTOS'', ''photos'',
           ''dni'', ''DNI''
         ]
       end order by row_data->>''fecha'' desc
     ), ''[]''::jsonb)
     from (select to_jsonb(p) as row_data from %s p where ($1 is null or p.id::text = $1)) rows',
    parts_table
  ) into result using p_id;
  return result;
end;
$$;
revoke all on function public.get_app_work_parts(text) from public, anon;
grant execute on function public.get_app_work_parts(text) to authenticated;

-- 2) Aviso push al tecnico cuando el administrador le asigna un parte.
create or replace function public.notify_parte_asignado()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  secret text;
  j jsonb := to_jsonb(new);
begin
  if coalesce(j->>'empleadoid', '') = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(old)->>'empleadoid') is not distinct from (j->>'empleadoid') then
    return new;
  end if;
  -- Si lo crea el propio tecnico no se avisa a si mismo.
  if j->>'createdby' is not null and not exists (
    select 1 from public.user_profiles where id::text = j->>'createdby' and role = 'admin'
  ) then
    return new;
  end if;
  select value into secret from public.push_config where key = 'webhook_secret';
  perform net.http_post(
    url := 'https://ziimllianelsocrdeeut.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object(
      'kind', 'parte_asignado',
      'id', j->>'id',
      'empleadoid', j->>'empleadoid',
      'cliente', coalesce(j->>'clientenombre', ''),
      'descripcion', left(coalesce(j->>'descripcion', ''), 90)
    )
  );
  return new;
exception when others then
  return new;
end $$;

do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
begin
  execute format('drop trigger if exists push_parte_asignado on %s', parts_table);
  execute format('create trigger push_parte_asignado after insert or update on %s for each row execute function public.notify_parte_asignado()', parts_table);
end $$;

notify pgrst, 'reload schema';
