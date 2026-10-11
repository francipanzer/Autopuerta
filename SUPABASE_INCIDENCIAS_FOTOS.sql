-- Fotos en las incidencias: el administrador las adjunta y el tecnico las ve al abrir la incidencia.
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUES de SUPABASE_INCIDENCIAS.sql.
-- Es seguro repetirlo. Las fotos se guardan comprimidas (data URL JPEG) en esta columna.

alter table public.incidencias
  add column if not exists fotos jsonb not null default '[]'::jsonb;

-- Recarga el esquema de la API para que la columna nueva se reconozca al instante.
notify pgrst, 'reload schema';
