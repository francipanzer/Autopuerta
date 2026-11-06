-- Plantillas de formularios de revisión configurables
-- Ejecutar en Supabase > SQL Editor

create table if not exists public.plantillas_revisiones (
  id text primary key,
  nombre text not null,
  descripcion text,
  tipo text not null check (tipo in ('empresa', 'ruta', 'individual')),
  campos_config jsonb not null default '[]'::jsonb,
  frecuencia_default integer default 6,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices para búsquedas
create index if not exists idx_plantillas_tipo on public.plantillas_revisiones(tipo);
create index if not exists idx_plantillas_activo on public.plantillas_revisiones(activo);

-- Políticas de seguridad
alter table public.plantillas_revisiones enable row level security;

drop policy if exists "Todos pueden ver plantillas activas" on public.plantillas_revisiones;
create policy "Todos pueden ver plantillas activas"
on public.plantillas_revisiones for select
to authenticated
using (activo = true);

drop policy if exists "Solo admin puede gestionar plantillas" on public.plantillas_revisiones;
create policy "Solo admin puede gestionar plantillas"
on public.plantillas_revisiones for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

-- Trigger para updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists handle_updated_at on public.plantillas_revisiones;
create trigger handle_updated_at
before update on public.plantillas_revisiones
for each row execute function public.handle_updated_at();

-- Insertar plantillas iniciales (DOTICS, HIPERBER, General)
insert into public.plantillas_revisiones (id, nombre, descripcion, tipo, campos_config, frecuencia_default)
values
  (
    'tpl-dotics',
    'DOTICS',
    'Formulario de mantenimiento DOTICS',
    'empresa',
    $${
      "campos_generales": [
        {"id": "contrato", "tipo": "texto", "label": "Nº contrato mantenimiento", "obligatorio": false},
        {"id": "intervencion", "tipo": "texto", "label": "Nº intervención", "obligatorio": false},
        {"id": "tecnico", "tipo": "texto", "label": "Técnico/s", "obligatorio": true},
        {"id": "fecha", "tipo": "fecha", "label": "Fecha", "obligatorio": true}
      ],
      "lista_equipos": {
        "nombre_campo": "equipos",
        "campos": [
          {"id": "tipoProducto", "tipo": "select", "label": "Tipo producto", "opciones": ["SECCIONAL", "RAPIDA", "BARRERA", "BASCULANTE", "CORREDERA", "CORREDERA CRISTAL"], "obligatorio": false},
          {"id": "denominacionCliente", "tipo": "texto", "label": "Denominación cliente", "obligatorio": false},
          {"id": "numeroSerie", "tipo": "texto", "label": "Nº de serie", "obligatorio": false},
          {"id": "estado", "tipo": "radio", "label": "Estado", "opciones": [{"valor": "bueno", "label": "Bueno"}, {"valor": "operativo", "label": "Operativo"}, {"valor": "no_usar", "label": "No usar"}], "obligatorio": true},
          {"id": "observaciones", "tipo": "textarea", "label": "Observaciones", "obligatorio": false},
          {"id": "fotos", "tipo": "fotos", "label": "Fotos", "max_fotos": 10, "condicion": "estado in ('operativo', 'no_usar')"}
        ]
      },
      "observaciones_generales": {
        "id": "observacionesGenerales",
        "tipo": "textarea",
        "label": "Observaciones generales",
        "obligatorio": false
      }
    }$$::jsonb,
    6
  ),
  (
    'tpl-hiperber',
    'HIPERBER',
    'Formulario de revisión HIPERBER (rutas de tiendas)',
    'ruta',
    $${
      "campos_generales": [
        {"id": "fecha", "tipo": "fecha", "label": "Fecha de revisión", "obligatorio": true}
      ],
      "estructura_tiendas": {
        "tipo": "tiendas_por_ruta",
        "campos_puerta": [
          {"id": "nombre", "tipo": "texto", "label": "Nombre puerta", "obligatorio": true},
          {"id": "tipo", "tipo": "texto", "label": "Tipo", "obligatorio": false},
          {"id": "hallazgo", "tipo": "radio", "label": "Hallazgo", "opciones": [{"valor": "ok", "label": "OK"}, {"valor": "x", "label": "X"}], "obligatorio": true},
          {"id": "hallazgoTexto", "tipo": "textarea", "label": "Descripción hallazgo", "condicion": "hallazgo = 'x'", "obligatorio": true},
          {"id": "hallazgoFotos", "tipo": "fotos", "label": "Fotos del hallazgo", "max_fotos": 10, "condicion": "hallazgo = 'x'"},
          {"id": "correctivo", "tipo": "radio", "label": "Correctivo", "opciones": [{"valor": "ok", "label": "OK"}, {"valor": "hecho", "label": "✔"}, {"valor": "x", "label": "X"}], "obligatorio": true},
          {"id": "correctivoTexto", "tipo": "textarea", "label": "Trabajo realizado", "condicion": "correctivo = 'hecho'", "obligatorio": true},
          {"id": "resultado", "tipo": "radio", "label": "Resultado", "opciones": [{"valor": "ok", "label": "OK"}, {"valor": "x", "label": "X"}], "obligatorio": true}
        ]
      }
    }$$::jsonb,
    6
  ),
  (
    'tpl-general',
    'Mantenimiento General',
    'Formulario genérico para revisiones individuales',
    'individual',
    $${
      "campos_generales": [
        {"id": "fecha", "tipo": "fecha", "label": "Fecha", "obligatorio": true},
        {"id": "tecnico", "tipo": "texto", "label": "Técnico", "obligatorio": true}
      ],
      "campos_puerta": [
        {"id": "estado", "tipo": "radio", "label": "Estado", "opciones": [{"valor": "operativa", "label": "Operativa"}, {"valor": "fuera_servicio", "label": "Fuera de servicio"}], "obligatorio": true},
        {"id": "observaciones", "tipo": "textarea", "label": "Observaciones", "obligatorio": false},
        {"id": "fotos", "tipo": "fotos", "label": "Fotos", "max_fotos": 10}
      ]
    }$$::jsonb,
    6
  )
on conflict (id) do nothing;

-- Recargar esquema
notify pgrst, 'reload schema';
