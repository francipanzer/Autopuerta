-- Aprobación online de presupuestos (opcional, desactivada por defecto).
-- Ejecutar después de SUPABASE_AUTH_ROLES.sql, SUPABASE_PUSH.sql y SUPABASE_ALBARANES.sql.
-- Para activarla: Configuración > Aprobación online de presupuestos (solo administradores).
-- Mientras esté desactivada el programa se comporta exactamente igual que antes.

create table if not exists public.app_features (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_features add column if not exists config jsonb not null default '{}'::jsonb;

insert into public.app_features (key, enabled)
values ('aprobacion_online', false)
on conflict (key) do nothing;

-- Valores por defecto (todo configurable desde la app). Recordatorios apagados: reminder_days = 0.
update public.app_features
set config = '{"expiry_days":30,"reminder_days":0,"max_reminders":3,"firma_obligatoria":true}'::jsonb
where key = 'aprobacion_online' and config = '{}'::jsonb;

alter table public.app_features enable row level security;
revoke all on public.app_features from anon;
grant select, insert, update on public.app_features to authenticated;

drop policy if exists "Active users read features" on public.app_features;
create policy "Active users read features"
  on public.app_features for select to authenticated
  using (public.app_is_active_user());

drop policy if exists "Admins manage features" on public.app_features;
create policy "Admins manage features"
  on public.app_features for all to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

create or replace function public.app_feature_enabled(p_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.app_features f where f.key = p_key), false);
$$;
revoke all on function public.app_feature_enabled(text) from public;
grant execute on function public.app_feature_enabled(text) to anon, authenticated;

create or replace function public.app_feature_config(p_key text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select f.config from public.app_features f where f.key = p_key), '{}'::jsonb);
$$;
revoke all on function public.app_feature_config(text) from public, anon, authenticated;

create table if not exists public.presupuesto_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  presupuestoid text not null,
  createdby uuid not null references auth.users(id),
  createdat timestamptz not null default now(),
  expiresat timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado', 'anulado')),
  respondedat timestamptz,
  nombrefirmante text,
  firma text,
  comentario text
);
alter table public.presupuesto_aprobaciones add column if not exists canal text;
alter table public.presupuesto_aprobaciones add column if not exists email text;
alter table public.presupuesto_aprobaciones add column if not exists telefono text;
alter table public.presupuesto_aprobaciones add column if not exists baseurl text;
alter table public.presupuesto_aprobaciones add column if not exists recordatorios_activos boolean not null default false;
alter table public.presupuesto_aprobaciones add column if not exists recordatorios_enviados int not null default 0;
alter table public.presupuesto_aprobaciones add column if not exists ultimorecordatorio timestamptz;

create index if not exists idx_presupuesto_aprobaciones_presupuesto
  on public.presupuesto_aprobaciones(presupuestoid);

alter table public.presupuesto_aprobaciones enable row level security;
revoke all on public.presupuesto_aprobaciones from anon;
revoke all on public.presupuesto_aprobaciones from authenticated;
grant select on public.presupuesto_aprobaciones to authenticated;

drop policy if exists "Admins read aprobaciones" on public.presupuesto_aprobaciones;
create policy "Admins read aprobaciones"
  on public.presupuesto_aprobaciones for select to authenticated
  using (public.app_is_admin());

-- Administración genera el enlace único para un presupuesto.
drop function if exists public.crear_enlace_aprobacion(text);
create or replace function public.crear_enlace_aprobacion(
  p_presupuesto text,
  p_base_url text default null,
  p_email text default null,
  p_telefono text default null,
  p_canal text default null,
  p_recordatorios boolean default false
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  new_token text;
  cfg jsonb := public.app_feature_config('aprobacion_online');
  expiry_days int := least(365, greatest(1, coalesce((cfg->>'expiry_days')::int, 30)));
begin
  if not public.app_is_admin() then
    raise exception 'Solo administración puede generar enlaces de aprobación';
  end if;
  if not public.app_feature_enabled('aprobacion_online') then
    raise exception 'La aprobación online no está activada';
  end if;
  if not exists (
    select 1 from public.presupuestos p
    where p.id::text = p_presupuesto
      and lower(coalesce(p.estado::text, 'borrador')) in ('borrador', 'enviado')
  ) then
    raise exception 'El presupuesto no existe o ya fue aprobado o rechazado';
  end if;

  update public.presupuesto_aprobaciones
  set estado = 'anulado'
  where presupuestoid = p_presupuesto and estado = 'pendiente';

  new_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.presupuesto_aprobaciones (
    token, presupuestoid, createdby, expiresat, canal, email, telefono, baseurl, recordatorios_activos
  )
  values (
    new_token, p_presupuesto, auth.uid(), now() + make_interval(days => expiry_days),
    left(p_canal, 20), left(nullif(btrim(p_email), ''), 160), left(nullif(btrim(p_telefono), ''), 40),
    left(nullif(btrim(p_base_url), ''), 300), coalesce(p_recordatorios, false)
  );

  update public.presupuestos
  set estado = 'enviado', updatedat = now()
  where id::text = p_presupuesto and lower(coalesce(estado::text, 'borrador')) = 'borrador';

  return new_token;
end;
$$;
revoke all on function public.crear_enlace_aprobacion(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.crear_enlace_aprobacion(text, text, text, text, text, boolean) to authenticated;

-- Página pública: devuelve solo lo necesario para que el cliente revise el presupuesto.
create or replace function public.get_presupuesto_aprobacion(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  a public.presupuesto_aprobaciones;
  p public.presupuestos;
  company jsonb := '{}'::jsonb;
begin
  if coalesce(p_token, '') = '' or length(p_token) > 128 then
    return jsonb_build_object('status', 'no_valido');
  end if;
  if not public.app_feature_enabled('aprobacion_online') then
    return jsonb_build_object('status', 'desactivado');
  end if;
  select * into a from public.presupuesto_aprobaciones where token = p_token;
  if not found or a.estado = 'anulado' then
    return jsonb_build_object('status', 'no_valido');
  end if;
  if a.estado <> 'pendiente' then
    return jsonb_build_object('status', 'respondido', 'decision', a.estado, 'respondedat', a.respondedat);
  end if;
  if a.expiresat < now() then
    return jsonb_build_object('status', 'caducado');
  end if;
  select * into p from public.presupuestos where id::text = a.presupuestoid;
  if not found then
    return jsonb_build_object('status', 'no_valido');
  end if;
  if to_regclass('public.company_settings') is not null then
    select jsonb_build_object('nombre', coalesce(nullif(c.trade_name, ''), 'Valgom'), 'telefono', c.phone, 'email', c.email)
    into company
    from public.company_settings c limit 1;
  end if;
  return jsonb_build_object(
    'status', 'pendiente',
    'firma_obligatoria', coalesce((public.app_feature_config('aprobacion_online')->>'firma_obligatoria')::boolean, true),
    'id', p.id,
    'cliente', p.clientenombre,
    'fecha', p.fecha,
    'validohasta', p.validohasta,
    'notas', p.notas,
    'subtotal', p.subtotal,
    'iva', p.iva,
    'total', p.total,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'descripcion', it->>'descripcion',
        'cantidad', it->'cantidad',
        'precio', it->'precio'
      ))
      from jsonb_array_elements(coalesce(p.lineitems, '[]'::jsonb)) it
    ), '[]'::jsonb),
    'empresa', coalesce(company, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_presupuesto_aprobacion(text) from public;
grant execute on function public.get_presupuesto_aprobacion(text) to anon, authenticated;

-- El cliente acepta o rechaza. Al aceptar se crea el albarán (sin asignar técnico).
create or replace function public.responder_presupuesto(
  p_token text,
  p_decision text,
  p_nombre text,
  p_firma text default null,
  p_comentario text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.presupuesto_aprobaciones;
  p public.presupuestos;
  secret text;
  nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not public.app_feature_enabled('aprobacion_online') then
    return jsonb_build_object('ok', false, 'error', 'desactivado');
  end if;
  if p_decision not in ('aprobado', 'rechazado') then
    return jsonb_build_object('ok', false, 'error', 'decision_no_valida');
  end if;
  if length(nombre) < 2 or length(nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;
  if p_firma is not null and (p_firma not like 'data:image/png;base64,%' or length(p_firma) > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'firma_no_valida');
  end if;
  if p_decision = 'aprobado' and p_firma is null
    and coalesce((public.app_feature_config('aprobacion_online')->>'firma_obligatoria')::boolean, true) then
    return jsonb_build_object('ok', false, 'error', 'firma_requerida');
  end if;

  select * into a from public.presupuesto_aprobaciones where token = coalesce(p_token, '') for update;
  if not found or a.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'no_valido');
  end if;
  if a.expiresat < now() then
    return jsonb_build_object('ok', false, 'error', 'caducado');
  end if;

  select * into p from public.presupuestos where id::text = a.presupuestoid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_valido');
  end if;

  update public.presupuesto_aprobaciones
  set estado = p_decision,
      respondedat = now(),
      nombrefirmante = nombre,
      firma = p_firma,
      comentario = left(p_comentario, 1000)
  where id = a.id;

  update public.presupuestos
  set estado = p_decision, updatedat = now()
  where id::text = a.presupuestoid;

  if p_decision = 'aprobado' then
    insert into public.albaranes (
      fecha, clienteid, clientenombre, clientedireccion, clientedocumento, clientetelefono,
      descripcion, lineas, presupuestoid, createdby
    )
    select
      current_date,
      p.clienteid,
      coalesce(nullif(p.clientenombre, ''), 'Cliente'),
      coalesce(c.j->>'direccion', c.j->>'direccionfiscal', ''),
      coalesce(c.j->>'dni', c.j->>'cif', ''),
      coalesce(c.j->>'telefono', ''),
      'Trabajos según presupuesto ' || p.id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'codigo', coalesce(it->>'codigo', it->>'referencia', it->>'tipoId', ''),
          'descripcion', coalesce(it->>'descripcion', ''),
          'cantidad', case when it->>'cantidad' ~ '^[0-9]+(\.[0-9]+)?$' then (it->>'cantidad')::numeric else 1 end,
          'unidad', coalesce(nullif(it->>'unidad', ''), 'ud')
        ))
        from jsonb_array_elements(coalesce(p.lineitems, '[]'::jsonb)) it
        where coalesce(it->>'descripcion', '') <> ''
      ), '[]'::jsonb),
      p.id::text,
      a.createdby
    from (select 1) one
    left join lateral (
      select to_jsonb(cl) as j from public.clientes cl where cl.id::text = p.clienteid limit 1
    ) c on true
    on conflict (presupuestoid) where presupuestoid is not null do nothing;
  end if;

  begin
    if to_regclass('public.push_config') is not null then
      execute 'select value from public.push_config where key = $1' into secret using 'webhook_secret';
    end if;
    if coalesce(secret, '') <> '' then
      perform net.http_post(
        url := 'https://ziimllianelsocrdeeut.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
        body := jsonb_build_object(
          'kind', 'presupuesto_respondido',
          'presupuesto', p.id,
          'cliente', coalesce(p.clientenombre, ''),
          'decision', p_decision
        )
      );
    end if;
  exception when others then
    raise warning 'No se pudo enviar el aviso push del presupuesto %: %', p.id, sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'estado', p_decision);
end;
$$;
revoke all on function public.responder_presupuesto(text, text, text, text, text) from public;
grant execute on function public.responder_presupuesto(text, text, text, text, text) to anon, authenticated;

-- Recordatorios automáticos: una ejecución diaria que llama a la Edge Function
-- `recordatorios-presupuestos`. La función no hace nada si la aprobación online está
-- desactivada o si el intervalo de recordatorios es 0 (configurable en la app).
create or replace function public.lanzar_recordatorios_aprobacion()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  secret text;
begin
  if not public.app_feature_enabled('aprobacion_online')
    or coalesce((public.app_feature_config('aprobacion_online')->>'reminder_days')::int, 0) <= 0 then
    return;
  end if;
  if to_regclass('public.push_config') is not null then
    execute 'select value from public.push_config where key = $1' into secret using 'webhook_secret';
  end if;
  if coalesce(secret, '') = '' then
    raise warning 'No se lanzaron recordatorios: falta push_config.webhook_secret';
    return;
  end if;
  perform net.http_post(
    url := 'https://ziimllianelsocrdeeut.supabase.co/functions/v1/recordatorios-presupuestos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.lanzar_recordatorios_aprobacion() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('recordatorios-aprobacion')
    from cron.job where jobname = 'recordatorios-aprobacion';
  perform cron.schedule('recordatorios-aprobacion', '0 8 * * *', 'select public.lanzar_recordatorios_aprobacion()');
exception when others then
  raise warning 'No se pudo programar pg_cron (actívalo en Database > Extensions): %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
