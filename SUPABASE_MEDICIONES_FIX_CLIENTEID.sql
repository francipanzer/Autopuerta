-- ═════════════
-- FIX: mediciones_medidas.clienteid debe ser TEXT, no UUID.
--
-- La tabla se creó originalmente con clienteId uuid (SUPABASE_MEDIDAS_ALBARAN.sql),
-- pero la app guarda IDs de cliente tipo 'CLI-MVSOUYTHRQV' (texto).
-- Esto provoca: invalid input syntax for type uuid: "CLI-XXXX" (22P02)
--
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
-- ═══════════════════════

-- 1) clienteid: uuid → text
alter table public.mediciones_medidas
  alter column clienteid drop not null;
alter table public.mediciones_medidas
  alter column clienteid type text using clienteid::text;

comment on column public.mediciones_medidas.clienteid is
  'id del cliente (CLIxxx, texto) o null';

-- 2) tecnicoId: también puede recibir IDs tipo EMP-xxx → text por seguridad
alter table public.mediciones_medidas
  alter column tecnicoid type text using tecnicoid::text;

-- 3) Normalizar nombres de columna a minúsculas si existe la versión camelCase
--    (plantillaId/clienteId etc. se guardan como minúsculas en Postgres,
--     así que normalmente no hace falta nada aquí).

-- 4) Verificación
-- select column_name, data_type from information_schema.columns
--  where table_name = 'mediciones_medidas';
