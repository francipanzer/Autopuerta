-- ═══════════════════════════════════
-- SUPABASE_PUERTAS_COLUMNAS.sql
-- Añade a la tabla 'puertas' las columnas que envía la app
-- pero que faltan en el esquema (error PGRST204: "Could not
-- find the 'marca' column of 'puertas' in the schema cache").
--
-- Ejecutar en Supabase → SQL Editor. Es idempotente:
-- se puede ejecutar varias veces sin duplicar columnas.
-- ═══════════════════════════════════════════════════════════

-- Marca comercial de la puerta (ej. "JDO", "Hiperber"...)
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS marca text;

-- Número de serie / referencia de fabricante
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS numeroserie text;

-- Notas libres sobre la puerta
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS notas text;

-- Estado operativo (por si la tabla antigua no lo tiene)
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS estado text DEFAULT 'operativa';

-- Última revisión y próxima revisión programada (fecha YYYY-MM-DD)
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS ultimorevision date;
ALTER TABLE public.puertas ADD COLUMN IF NOT EXISTS proximarevision date;

-- Si la columna se creó con otro nombre (p.ej. "nombre_marca"), puedes
-- renombrarla así (descomenta y ajusta si aplica):
-- ALTER TABLE public.puertas RENAME COLUMN nombre_marca TO marca;

-- Refresca el caché de esquema de PostgREST para que el cambio
-- sea visible inmediatamente (requiere rol admin o service_role):
NOTIFY pgrst, 'reload schema';
