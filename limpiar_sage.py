# -*- coding: utf-8 -*-
"""
limpiar_sage.py — Limpieza del INFORME.xlsx (clientes de Sage 50) para importar a AutoPuerta Pro.

Genera:
  - clientes_limpio.xlsx  → listo para importar en la app (Clientes → Importar)
      * filas 100% vacías eliminadas (obsoletas)
      * duplicados por CÓDIGO fusionados (se conservan los datos no vacíos de cada copia)
      * duplicados por NIF con código distinto marcados en la columna "Duplicado"
      * columnas: Nombre, Contacto, Telefono, Email, Direccion, C.Postal, Poblacion,
        Provincia, NIF, Codigo, Notas, Duplicado
  - informe_limpieza.txt  → resumen de lo encontrado (para decidir a mano lo dudoso)

Uso:  python limpiar_sage.py
"""
import openpyxl, collections, unicodedata

SRC = 'INFORME.xlsx'
DST = 'clientes_limpio.xlsx'
LOG = 'informe_limpieza.txt'

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h).strip() if h is not None else '' for h in rows[0]]
data = [r for r in rows[1:] if any(c is not None and str(c).strip() for c in r)]

# Índices de columnas por nombre (tolerante a acentos/mayúsculas)
def col(*alias):
    for i, h in enumerate(hdr):
        hn = unicodedata.normalize('NFD', h.lower()).encode('ascii', 'ignore').decode()
        if hn in alias: return i
    return None

iCod = col('codigo')
iNom = col('nombre', 'nombre cliente', 'razon social')
iNif = col('nif', 'cif', 'dni')
iTel = col('telefono')
iDir = col('direccion')
iCP  = col('c postal', 'cpostal', 'codigo postal')
iPob = col('poblacion', 'ciudad')
iProv= col('provincia')
iCon = col('contacto')
iMail= col('email', 'correo electronico')
iNota= col('nota', 'notas', 'observaciones')

def s(v):
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()

limpias, obsoletas = [], []
for r in data:
    fila = {
        'Codigo': s(r[iCod]) if iCod is not None else '',
        'Nombre': s(r[iNom]) if iNom is not None else '',
        'NIF': s(r[iNif]) if iNif is not None else '',
        'Telefono': s(r[iTel]) if iTel is not None else '',
        'Direccion': s(r[iDir]) if iDir is not None else '',
        'C.Postal': s(r[iCP]) if iCP is not None else '',
        'Poblacion': s(r[iPob]) if iPob is not None else '',
        'Provincia': s(r[iProv]) if iProv is not None else '',
        'Contacto': s(r[iCon]) if iCon is not None else '',
        'Email': s(r[iMail]) if iMail is not None else '',
        'Notas': s(r[iNota]) if iNota is not None else '',
        'Duplicado': ''
    }
    camposUtiles = sum(1 for k, v in fila.items() if v and k not in ('Duplicado',))
    # Obsoleta: solo tiene código (o nada) — sin nombre ni ningún otro dato
    if not fila['Nombre'] and camposUtiles <= 1:
        obsoletas.append(fila); continue
    limpias.append(fila)

# Fusionar duplicados por código
porCodigo = {}
sinCodigo = []
for f in limpias:
    if f['Codigo']:
        prev = porCodigo.get(f['Codigo'])
        if prev:
            for k, v in f.items():
                if v and not prev.get(k): prev[k] = v
            prev['Duplicado'] = 'fusionada por código'
        else:
            porCodigo[f['Codigo']] = f
    else:
        sinCodigo.append(f)
fusionadas = len(limpias) - len(porCodigo) - len([f for f in sinCodigo])
final = list(porCodigo.values()) + sinCodigo

# Duplicados por nombre/NIF con códigos distintos (sospechosos, NO se borran: se marcan)
porNombre = collections.defaultdict(list)
for f in final:
    clave = unicodedata.normalize('NFD', f['Nombre'].lower()).encode('ascii', 'ignore').decode().strip()
    if clave: porNombre[clave].append(f)
nombDup = 0
for clave, fs in porNombre.items():
    if len(fs) > 1 and len({f['Codigo'] for f in fs if f['Codigo']}) > 1:
        nombDup += len(fs) - 1
        for f in fs: f['Duplicado'] = (f['Duplicado'] + '; ' if f['Duplicado'] else '') + 'mismo nombre, distinto código'

# Duplicados por NIF con códigos distintos (sospechosos, NO se borran: se marcan)
porNif = collections.defaultdict(list)
for f in final:
    if f['NIF']: porNif[f['NIF'].upper()].append(f)
nifDup = 0
for nif, fs in porNif.items():
    if len(fs) > 1:
        nifDup += len(fs) - 1
        for f in fs: f['Duplicado'] = (f['Duplicado'] + '; ' if f['Duplicado'] else '') + 'mismo NIF, distinto código'

# Calidad de datos
sinDir  = sum(1 for f in final if not f['Direccion'])
sinPob  = sum(1 for f in final if not f['Poblacion'])
sinNif  = sum(1 for f in final if not f['NIF'])
sinTel  = sum(1 for f in final if not f['Telefono'])
sinMail = sum(1 for f in final if not f['Email'])
sinCon  = sum(1 for f in final if not f['Contacto'])
ambas   = sum(1 for f in final if f['Direccion'] and f['Poblacion'])

# Escribir salida
out = openpyxl.Workbook()
sh = out.active
sh.title = 'Clientes'
cols = ['Nombre','Contacto','Telefono','Email','Direccion','C.Postal','Poblacion','Provincia','NIF','Codigo','Notas','Duplicado']
sh.append(cols)
for f in final:
    sh.append([f[c] for c in cols])
# Anchos de columna razonables
for i, c in enumerate(cols, 1):
    sh.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(12, min(40, len(c) + 8))
out.save(DST)

with open(LOG, 'w', encoding='utf-8') as log:
    log.write(f'INFORME DE LIMPIEZA — {SRC}\n')
    log.write(f'{"="*60}\n')
    log.write(f'Clientes leídos:                  {len(data)}\n')
    log.write(f'Filas 100% vacías:                {len(obsoletas)}  → eliminadas\n')
    log.write(f'Duplicadas por código exacto:     {fusionadas}  → fusionadas\n')
    log.write(f'Mismo nombre, distinto código:    {nombDup}  → MARCADAS (revisar a mano)\n')
    log.write(f'Mismo NIF, distinto código:       {nifDup}  → MARCADAS (revisar a mano)\n')
    log.write(f'Clientes finales:                 {len(final)}\n\n')
    log.write('CALIDAD DE DATOS (para rellenar a mano o ampliar desde Sage):\n')
    log.write(f'  Sin dirección:        {sinDir:4}  (no geocodificables)\n')
    log.write(f'  Sin población:        {sinPob:4}\n')
    log.write(f'  Sin NIF:              {sinNif:4}\n')
    log.write(f'  Sin teléfono:         {sinTel:4}\n')
    log.write(f'  Sin email:            {sinMail:4}\n')
    log.write(f'  Sin persona contacto: {sinCon:4}\n')
    log.write(f'  Geocodificables (dirección+población): {ambas} de {len(final)}\n\n')
    log.write('Clientes sin NINGÚN dato de contacto (ni teléfono ni email) — candidatos a obsoletos:\n')
    for f in final:
        if not f['Telefono'] and not f['Email']:
            log.write(f"  {f['Codigo'] or '—':>10}  {f['Nombre']}\n")
    log.write('\nClientes marcados como posible duplicado:\n')
    for f in final:
        if 'mismo nombre' in f['Duplicado'] or 'mismo NIF' in f['Duplicado']:
            log.write(f"  {f['Codigo'] or '—':>10}  {f['Nombre']}  [{f['Duplicado']}]\n")

print(f'OK {DST}: {len(final)} clientes listos para importar')
print(f'OK {LOG}: {len(obsoletas)} obsoletas, {fusionadas} fusionadas, {nombDup+nifDup} dudosas marcadas')

