-- Ejecutar en Supabase > SQL Editor.
-- Permite que el técnico obtenga su propio DNI y firma (de su ficha de Empleados)
-- para rellenar automáticamente el parte de trabajo. No da acceso a otros empleados.
create or replace function public.get_my_employee()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', e.id, 'nombre', e.nombre, 'dni', e.dni, 'firma', e.firma)
  from public.empleados e
  where public.app_is_technician()
    and e.id::text = public.app_employee_id()
  limit 1;
$$;
revoke all on function public.get_my_employee() from public, anon;
grant execute on function public.get_my_employee() to authenticated;
