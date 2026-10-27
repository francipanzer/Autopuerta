-- ═══════════════════════════
-- SUPABASE_MEDIDAS_ALBARAN.sql
-- Ejecutar UNA vez en Supabase → SQL Editor. Es idempotente.
--
-- Añade:
--   1) fotosalbaran  → fotos del albarán en desplazamientos internos
--   2) plantillas_medidas → catálogo de plantillas (editor visual)
--   3) mediciones_medidas → cada medición tomada por un técnico
--   4) bucket 'medidas-fotos' → fotos de plantillas y mediciones
-- ═══════════════════════════════════════════

-- ── 1. Fotos de albarán en partes internos ──────────────────
alter table public.partes_trabajo
  add column if not exists fotosalbaran jsonb not null default '[]'::jsonb;

-- ── 2. Catálogo de plantillas de medidas ───────────────────
create table if not exists public.plantillas_medidas (
  id            uuid primary key default gen_random_uuid(),
  createdat     timestamptz not null default now(),
  updatedat     timestamptz not null default now(),
  createdby     uuid references auth.users(id) on delete set null,
  nombre        text not null,
  tipoPuerta    text,
  descripcion   text,
  campos        jsonb not null default '[]'::jsonb,
  svg           text,
  imagenUrl     text,
  esPublica     boolean not null default true
);

-- ── 3. Mediciones tomadas con una plantilla ─────────────────
create table if not exists public.mediciones_medidas (
  id              uuid primary key default gen_random_uuid(),
  createdat       timestamptz not null default now(),
  updatedat       timestamptz not null default now(),
  createdby       uuid references auth.users(id) on delete set null,
  plantillaId     uuid references public.plantillas_medidas(id) on delete set null,
  plantillaNombre text,
  clienteId       uuid,
  clienteNombre   text,
  tecnicoId       uuid,
  tecnicoNombre   text,
  fecha           date not null default current_date,
  valores         jsonb not null default '{}'::jsonb,
  notas           text,
  fotos           jsonb not null default '[]'::jsonb,
  estado          text not null default 'pendiente'   -- pendiente|presupuestado|cancelado
);

create index if not exists idx_mediciones_estado   on public.mediciones_medidas(estado);
create index if not exists idx_mediciones_cliente  on public.mediciones_medidas(clienteid);
create index if not exists idx_mediciones_fecha    on public.mediciones_medidas(fecha);

-- ── 4. Bucket para fotos de plantillas/mediciones ──────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medidas-fotos', 'medidas-fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 5. RLS ─────────────────────────────────────────────────
alter table public.plantillas_medidas enable row level security;
alter table public.mediciones_medidas enable row level security;

drop policy if exists "plantillas_medidas_leer" on public.plantillas_medidas;
create policy "plantillas_medidas_leer" on public.plantillas_medidas
  for select using (true);

drop policy if exists "plantillas_medidas_escribir" on public.plantillas_medidas;
create policy "plantillas_medidas_escribir" on public.plantillas_medidas
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "mediciones_medidas_leer" on public.mediciones_medidas;
create policy "mediciones_medidas_leer" on public.mediciones_medidas
  for select using (true);

drop policy if exists "mediciones_medidas_escribir" on public.mediciones_medidas;
create policy "mediciones_medidas_escribir" on public.mediciones_medidas
  for all to authenticated
  using (true)
  with check (true);

-- ── 6. Refresca caché de esquema ───────────────────────────
notify pgrst, 'reload schema';
