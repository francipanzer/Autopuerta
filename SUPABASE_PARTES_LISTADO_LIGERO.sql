-- Listado ligero de partes de trabajo: sin firmas ni fotos en base64.
-- Devuelve las mismas filas que get_app_work_parts() (respetando sus restricciones por rol),
-- pero quitando firmas y fotos y añadiendo:
--   fotosurls  -> solo las fotos que son URL (Storage)
--   fotoscount -> nº total de fotos del parte
--   _light     -> marca de fila reducida
-- El detalle completo sigue disponible con get_app_work_parts(p_id).

create or replace function public.get_app_work_parts_list()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    (r.value - array[
      'firmatecnico', 'firmacliente', 'firmaTecnico', 'firmaCliente',
      'firma_tecnico', 'firma_cliente', 'fotos', 'Fotos', 'FOTOS', 'photos'
    ])
    || jsonb_build_object(
         'fotosurls', coalesce(u.urls, '[]'::jsonb),
         'fotoscount', coalesce(u.total, 0),
         '_light', true
       )
    order by r.ord
  ), '[]'::jsonb)
  from jsonb_array_elements(public.get_app_work_parts(null)) with ordinality as r(value, ord)
  left join lateral (
    select jsonb_agg(f) filter (where (f #>> '{}') ~ '^https?:') as urls,
           count(*)::int as total
    from jsonb_array_elements(
      case when jsonb_typeof(r.value -> 'fotos') = 'array' then r.value -> 'fotos' else '[]'::jsonb end
    ) f
  ) u on true;
$$;

revoke all on function public.get_app_work_parts_list() from public, anon;
grant execute on function public.get_app_work_parts_list() to authenticated;

notify pgrst, 'reload schema';
