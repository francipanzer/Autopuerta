-- Orden de visita de cada tienda dentro de su ruta (optimizado desde Ceutí)
alter table public.clientes add column if not exists ordenruta integer;
