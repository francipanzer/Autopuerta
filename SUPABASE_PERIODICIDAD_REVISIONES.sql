-- Ejecutar antes de utilizar el botón «Periodicidad» de las puertas.
-- No modifica los datos existentes. Las puertas sin criterios mantienen
-- temporalmente el cálculo anterior hasta que se configuren.
alter table public.puertas add column if not exists criteriosrevision jsonb;

create or replace function public.update_door_revision_schedule(
  p_id text,
  p_last_revision date,
  p_state text default null
)
returns date
language plpgsql security definer
set search_path = ''
as $$
declare
  criterios jsonb;
  frequency_months integer;
  next_revision date;
  updated_rows integer;
  numero numeric;
begin
  if not public.app_is_active_user() or not (public.app_is_admin() or public.app_is_technician()) then
    raise exception 'Not authorized';
  end if;
  if p_last_revision is null or p_last_revision > current_date then
    raise exception 'Invalid revision date';
  end if;
  if p_state is not null and p_state not in ('operativa', 'averiada', 'fuera_servicio') then
    raise exception 'Invalid door state';
  end if;
  select d.criteriosrevision into criterios from public.puertas d where d.id::text = p_id;
  if not found then raise exception 'Door not found'; end if;
  if criterios is null then
    select coalesce(nullif(r.frecuenciameses, 0), 6) into frequency_months
      from public.puertas d
      left join public.clientes c on c.id::text = d.clienteid::text
      left join public.rutas r on r.id::text = c.rutaid::text
      where d.id::text = p_id;
  elsif criterios->>'uso' = 'garaje_residencial' then
    if jsonb_typeof(criterios->'estacional') is distinct from 'boolean' then
      raise exception 'Falta el criterio de uso estacional';
    end if;
    if (criterios->>'estacional')::boolean then frequency_months := 12;
    else
      if jsonb_typeof(criterios->'vehiculos') is distinct from 'number' then raise exception 'Falta el número de vehículos'; end if;
      numero := (criterios->>'vehiculos')::numeric;
      if numero < 0 or numero <> trunc(numero) then raise exception 'Número de vehículos inválido'; end if;
      frequency_months := case when numero <= 5 then 12 when numero <= 50 then 6 else 4 end;
    end if;
  elsif criterios->>'uso' = 'industrial' then
    if jsonb_typeof(criterios->'rapida') is distinct from 'boolean' then raise exception 'Falta el criterio de puerta rápida'; end if;
    frequency_months := case when (criterios->>'rapida')::boolean then 4 else 6 end;
  elsif criterios->>'uso' = 'comercial' then
    if jsonb_typeof(criterios->'enrollable') is distinct from 'boolean' then raise exception 'Falta el criterio de puerta enrollable'; end if;
    if (criterios->>'enrollable')::boolean then frequency_months := 12;
    else
      if jsonb_typeof(criterios->'ciclosDia') is distinct from 'number' then raise exception 'Falta el número de ciclos'; end if;
      numero := (criterios->>'ciclosDia')::numeric;
      if numero < 0 or numero <> trunc(numero) then raise exception 'Número de ciclos inválido'; end if;
      frequency_months := case when numero <= 10 then 6 else 4 end;
    end if;
  else
    raise exception 'Uso de puerta inválido';
  end if;
  next_revision := (p_last_revision + make_interval(months => frequency_months))::date;
  update public.puertas set ultimorevision = p_last_revision,
    proximarevision = next_revision, estado = coalesce(p_state, estado)
    where id::text = p_id;
  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then raise exception 'Door not found'; end if;
  return next_revision;
end;
$$;
revoke all on function public.update_door_revision_schedule(text, date, text) from public, anon;
grant execute on function public.update_door_revision_schedule(text, date, text) to authenticated;
notify pgrst, 'reload schema';
