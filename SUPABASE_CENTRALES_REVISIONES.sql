-- Ejecutar después de SUPABASE_AUTH_ROLES.sql y antes de publicar la app.
-- No vincula ni cambia clientes, cadenas, rutas, puertas ni históricos existentes.
alter table public.clientes add column if not exists centralcadenaid text;
alter table public.clientes add column if not exists mantenimientocontratado boolean;
create unique index if not exists clientes_centralcadenaid_unico
  on public.clientes (centralcadenaid) where centralcadenaid is not null;
comment on column public.clientes.centralcadenaid is
  'Cadena de rutas vinculada expresamente a la ficha de cliente principal.';
comment on column public.clientes.mantenimientocontratado is
  'Contrato de la central o cliente individual. NULL: pendiente de confirmar.';
notify pgrst, 'reload schema';
