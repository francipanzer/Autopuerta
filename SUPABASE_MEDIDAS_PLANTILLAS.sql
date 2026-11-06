# File: SUPABASE_MEDIDAS_PLANTILLAS.sql
-- ═══════════════════════════
-- SUPABASE_MEDIDAS_PLANTILLAS.sql
-- Tablas para el sistema unificado de MEDICIONES (mediciones-v3.js):
--   · plantillas_medidas : plantillas de medición que el admin/usuario
--     crea (imagen + campos posicionados x/y/w/h). Incluye de serie la
--     plantilla "Puerta Rápida de Lona" (estilo BMP) para pedir precio
--     de lonas a proveedor.
--   · mediciones_medidas : cada medición guardada (cliente, plantilla,
--     valores de los campos, notas, fotos).
--
-- Se puede ejecutar varias veces (IF NOT EXISTS / DROP IF EXISTS).
-- ═══════════════════════════

-- ─────────── 1) PLANTILLAS DE MEDIDAS ───────────
create table if not exists public.plantillas_medidas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipopuerta  text,                       -- opcional: tipo de puerta asociado
  imagenurl   text,                       -- URL en storage 'medidas-fotos' (bucket público)
  campos      jsonb default '[]'::jsonb,  -- [{id,etiqueta,x,y,w,h}] posiciones en % sobre la imagen
  createdat   timestamptz not null default now(),
  createdby   uuid references auth.users(id) on delete set null
);

alter table public.plantillas_medidas enable row level security;

drop policy if exists "Active users read plantillas_medidas" on public.plantillas_medidas;
create policy "Active users read plantillas_medidas"
  on public.plantillas_medidas for select to authenticated
  using (public.app_is_active_user());

drop policy if exists "Active users write plantillas_medidas" on public.plantillas_medidas;
create policy "Active users write plantillas_medidas"
  on public.plantillas_medidas for insert to authenticated
  with check (public.app_is_active_user());

drop policy if exists "Active users update plantillas_medidas" on public.plantillas_medidas;
create policy "Active users update plantillas_medidas"
  on public.plantillas_medidas for update to authenticated
  using (public.app_is_active_user())
  with check (public.app_is_active_user());

drop policy if exists "Admins delete plantillas_medidas" on public.plantillas_medidas;
create policy "Admins delete plantillas_medidas"
  on public.plantillas_medidas for delete to authenticated
  using (public.app_is_admin());

-- ─────────── 2) MEDICIONES ───────────
create table if not exists public.mediciones_medidas (
  id          uuid primary key default gen_random_uuid(),
  clienteid   text,                       -- id del cliente (CLIxxx) o null
  plantillaid uuid references public.plantillas_medidas(id) on delete set null,
  plantillanombre text,
  imagenurl   text,                       -- copia de la imagen de la plantilla
  valores     jsonb default '{}'::jsonb,  -- {campoId: valor}
  notas       text,
  fotos       jsonb default '[]'::jsonb,  -- [{url,fecha}]
  createdat   timestamptz not null default now(),
  createdby   uuid references auth.users(id) on delete set null
);

alter table public.mediciones_medidas enable row level security;

drop policy if exists "Active users read mediciones_medidas" on public.mediciones_medidas;
create policy "Active users read mediciones_medidas"
  on public.mediciones_medidas for select to authenticated
  using (public.app_is_active_user());

drop policy if exists "Active users write mediciones_medidas" on public.mediciones_medidas;
create policy "Active users write mediciones_medidas"
  on public.mediciones_medidas for insert to authenticated
  with check (public.app_is_active_user());

drop policy if exists "Active users update mediciones_medidas" on public.mediciones_medidas;
create policy "Active users update mediciones_medidas"
  on public.mediciones_medidas for update to authenticated
  using (public.app_is_active_user())
  with check (public.app_is_active_user());

drop policy if exists "Admins delete mediciones_medidas" on public.mediciones_medidas;
create policy "Admins delete mediciones_medidas"
  on public.mediciones_medidas for delete to authenticated
  using (public.app_is_admin());

-- ─────────── 3) BUCKET DE IMÁGENES ───────────
insert into storage.buckets (id, name, public)
values ('medidas-fotos', 'medidas-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Public read medidas-fotos" on storage.objects;
create policy "Public read medidas-fotos"
  on storage.objects for select to public
  using (bucket_id = 'medidas-fotos');

drop policy if exists "Authenticated upload medidas-fotos" on storage.objects;
create policy "Authenticated upload medidas-fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'medidas-fotos');

drop policy if exists "Authenticated update medidas-fotos" on storage.objects;
create policy "Authenticated update medidas-fotos"
  on storage.objects for update to authenticated
  using (bucket_id = 'medidas-fotos');

-- ─────────── 4) PLANTILLA DE SERIE: LONA PUERTA RÁPIDA (estilo BMP) ───────────
-- Campos posicionados en % (x,y,w,h) sobre la imagen plantillarapidas.png
insert into public.plantillas_medidas (nombre, tipopuerta, campos)
select 'Lona Puerta Rápida (BMP)', 'Puerta Rápida de Lona',
  '[{"id":"ref","etiqueta":"Ref. / Nº puerta","x":4,"y":4,"w":22,"h":7},
    {"id":"ancho","etiqueta":"Ancho (mm)","x":30,"y":4,"w":18,"h":7},
    {"id":"alto","etiqueta":"Alto (mm)","x":52,"y":4,"w":18,"h":7},
    {"id":"marco","etiqueta":"Tipo de guía / marco","x":74,"y":4,"w":22,"h":7},
    {"id":"tela","etiqueta":"Tela (tipo/color)","x":4,"y":88,"w":22,"h":8},
    {"id":"refuerzo","etiqueta":"Refuerzo (tela/tirantes)","x":30,"y":88,"w":22,"h":8},
    {"id":"ventana","etiqueta":"Ventana (sí/no, medidas)","x":56,"y":88,"w":20,"h":8},
    {"id":"observaciones","etiqueta":"Observaciones","x":80,"y":88,"w":16,"h":8}]'::jsonb
where not exists (
  select 1 from public.plantillas_medidas where nombre = 'Lona Puerta Rápida (BMP)'
);

-- ─────────── Verificación ───────────
-- select * from plantillas_medidas;
-- select * from mediciones_medidas limit 5;
