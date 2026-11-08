-- Tras hacer copia de seguridad, ejecutar en Supabase SQL Editor.
-- Requiere SUPABASE_CENTRALES_REVISIONES.sql. No crea ni borra fichas.
-- Solo utiliza las relaciones cadena/ruta que ya existen: no deduce tiendas
-- ni rutas a partir de nombres o direcciones. Toda la operación es atómica.
do $$
declare
  id_cadena public.cadenas.id%type;
  id_padre public.clientes.id%type;
  cantidad integer;
  vinculados integer;
begin
  lock table public.clientes, public.cadenas, public.rutas in share row exclusive mode;

  select count(*) into cantidad from public.cadenas
    where upper(trim(nombre)) = 'HIPERBER';
  if cantidad <> 1 then
    raise exception 'Se necesita exactamente una cadena llamada HIPERBER; encontradas: %. No se ha modificado nada.', cantidad;
  end if;
  select id into id_cadena from public.cadenas where upper(trim(nombre)) = 'HIPERBER';

  select count(*) into cantidad from public.clientes
    where upper(trim(nombre)) = 'HIPERBER';
  if cantidad <> 1 then
    raise exception 'Se necesita exactamente una ficha de cliente llamada HIPERBER; encontradas: %. No se ha modificado nada.', cantidad;
  end if;
  select id into id_padre from public.clientes where upper(trim(nombre)) = 'HIPERBER';

  if exists (
    select 1 from public.clientes
    where id::text = id_padre::text
      and (nullif(trim(padreid::text), '') is not null
        or (nullif(trim(centralcadenaid::text), '') is not null and centralcadenaid::text <> id_cadena::text))
  ) then
    raise exception 'La ficha HIPERBER ya pertenece a otra central o cadena. No se ha modificado nada.';
  end if;
  if exists (
    select 1 from public.clientes
    where id::text <> id_padre::text and centralcadenaid::text = id_cadena::text
  ) then
    raise exception 'La cadena HIPERBER ya está vinculada a otro cliente principal. No se ha modificado nada.';
  end if;

  if exists (
    select 1 from public.clientes c
    where c.id::text <> id_padre::text
      and (c.cadenaid::text = id_cadena::text or exists (
        select 1 from public.rutas r where r.id::text = c.rutaid::text and r.cadenaid::text = id_cadena::text
      ))
      and (
        coalesce(c.escadena, false)
        or nullif(trim(c.centralcadenaid::text), '') is not null
        or (nullif(trim(c.padreid::text), '') is not null and c.padreid::text <> id_padre::text)
        or (nullif(trim(c.cadenaid::text), '') is not null and c.cadenaid::text <> id_cadena::text)
        or (nullif(trim(c.rutaid::text), '') is not null and not exists (
          select 1 from public.rutas r where r.id::text = c.rutaid::text and r.cadenaid::text = id_cadena::text
        ))
      )
  ) then
    raise exception 'Hay tiendas con central, cadena o ruta incompatibles. Revísalas antes de vincular; no se ha modificado nada.';
  end if;

  select count(*) into cantidad from public.clientes c
    where c.id::text <> id_padre::text
      and (c.cadenaid::text = id_cadena::text or exists (
        select 1 from public.rutas r where r.id::text = c.rutaid::text and r.cadenaid::text = id_cadena::text
      ));
  if cantidad = 0 then
    raise exception 'No se encontraron tiendas vinculadas a la cadena o sus rutas. No se ha modificado nada.';
  end if;

  update public.clientes set escadena = true, centralcadenaid = id_cadena::text, updatedat = now()
    where id::text = id_padre::text
      and (escadena is distinct from true or centralcadenaid is distinct from id_cadena::text);
  update public.clientes c set padreid = id_padre, cadenaid = id_cadena, updatedat = now()
    where c.id::text <> id_padre::text
      and (c.cadenaid::text = id_cadena::text or exists (
        select 1 from public.rutas r where r.id::text = c.rutaid::text and r.cadenaid::text = id_cadena::text
      ))
      and (c.padreid::text is distinct from id_padre::text or c.cadenaid::text is distinct from id_cadena::text);
  get diagnostics vinculados = row_count;
  raise notice 'HIPERBER: % tiendas identificadas; % fichas actualizadas. Las rutas existentes se conservan.', cantidad, vinculados;
end $$;
