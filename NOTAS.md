# NOTAS / PENDIENTES DEL PROYECTO (autopuerta-pro)

## Pendiente: Integración con aplicación externa de CONTABILIDAD
(queda aparcado; el usuario lo retomará más adelante)

Objetivo: enviar datos (partes, presupuestos, facturas) a un programa de contabilidad externo.

Opciones evaluadas (de menor a mayor esfuerzo):
- **Opción A — Exportación CSV/Excel manual o programada** (~1 día):
  botón "Exportar contabilidad" que genera CSV con: fecha, cliente, concepto,
  base, IVA, total, nº factura. Importable en FacturaOne/Holded/Sage/A3.
- **Opción B — Facturación electrónica Facturae/UBL** (~2-3 días):
  generar facturas en formato Facturae desde un Edge Function de Supabase,
  dejarlas en bucket o enviarlas por email.
- **Opción C — Integración por API REST directa** (~3-5 días):
  Edge Function que al cerrar un parte/factura haga POST a la API del
  programa (Holded, Anfix, Sage...) mapeando conceptos a su plan de cuentas.

Recomendación: empezar por A (CSV) y evolucionar a C si se elige Holded.
Infraestructura disponible: Supabase + Edge Functions ya configuradas en `supabase/functions/`.
