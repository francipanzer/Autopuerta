-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE_REVISIONES_TECNICO_NOMBRE.sql
-- La app guarda el nombre del técnico en revisiones.tecniconombre
-- (antes solo estaba el id). Ejecutar UNA vez en Supabase → SQL Editor.
-- Idempotente (se puede repetir).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.revisiones add column if not exists tecniconombre text;
notify pgrst, 'reload schema';
