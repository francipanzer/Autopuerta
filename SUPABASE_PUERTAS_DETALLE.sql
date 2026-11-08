-- Histórico de intervenciones por puerta: observaciones por puerta en el parte.
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es seguro repetirlo.
-- El parte guarda puertasdetalle (jsonb) = { "id_de_puerta": "qué se le hizo" },
-- y con puertaids + puertasdetalle se compone el histórico de cada puerta
-- (no hace falta tabla nueva: el historial se consulta desde los partes).

alter table public.partes_trabajo
  add column if not exists puertasdetalle jsonb;

comment on column public.partes_trabajo.puertasdetalle is
  'Observaciones por puerta intervenida en el parte: {puertaId: "qué se le hizo"}.';
