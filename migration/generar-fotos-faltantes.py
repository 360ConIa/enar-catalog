"""
ENAR - Genera docs/fotos-faltantes.csv a partir de docs/revision-imagenes.csv

Lista las fotos de un solo envase que hay que pedir a ENAR: agrupa los
productos activos con tipo 'sin imagen' por producto y tamaño (sin color),
cuenta cuántos recupera cada foto y ordena de mayor a menor impacto.

Solo lee el CSV de revisión y escribe docs/fotos-faltantes.csv; no toca
Firestore ni Storage.

Uso (desde la raíz del repo):
  python3 migration/generar-fotos-faltantes.py
"""
import collections
import csv
import re
import unicodedata

ENTRADA = 'docs/revision-imagenes.csv'
SALIDA = 'docs/fotos-faltantes.csv'

# (patrón sobre el título normalizado, tamaño); el orden importa
TAMANOS = [
    (r'GALON X 5', 'Galón x 5'), (r'5 GALONES|5 GAL\b', '5 galones'),
    (r'1/2 CUNETE', '1/2 cuñete'), (r'1/2 BOTELLA', '1/2 botella'),
    (r'CUNETE', 'Cuñete'), (r'GALON', 'Galón'), (r'TAMBOR', 'Tambor'), (r'CAJA', 'Caja'),
    (r'BOTELLA', 'Botella'), (r'BOLSA', 'Bolsa'),
    (r'1/128', '1/128'), (r'1/64', '1/64'), (r'1/32', '1/32'), (r'1/16', '1/16'), (r'1/8', '1/8'), (r'1/4', '1/4'),
    (r'(\d+) ?C\.?C\.?', 'CC'), (r'(\d+) ?GR\b', 'gr'), (r'12 ONZAS', '12 onzas'),
]
TILDES = [('Iii', 'III'), ('Proposito', 'Propósito'), ('Desempeno', 'Desempeño'), ('Alquidico', 'Alquídico'),
          ('Epoxico', 'Epóxico'), ('Trafico', 'Tráfico'), ('Plastico', 'Plástico'), ('Acrilico', 'Acrílico'),
          ('Sintetica', 'Sintética'), ('Rapida', 'Rápida'), ('Humedo', 'Húmedo'), ('Carton', 'Cartón'),
          ('Paca Envase De', 'Paca De Envase'), ('P.V.A', 'P.V.A.'), ('Aaa', 'AAA'), ('Cpvc', 'CPVC'), ('Pvc', 'PVC')]
# (producto, tamaño o None para todos) -> nota para quien pida la foto
NOTAS = {
    ('Esmalte Alquídico', None): 'Solo hay foto de 1/16 y una foto de varios envases',
    ('Anticorrosivo', 'Galón'): 'Línea WG (WG200 Rojo Cromato Zinc, WG600): puede ser otro envase que el anticorrosivo AG galón, que ya tiene foto',
    ('Soldadura CPVC', '1/16'): 'Existe una lata 1/16 en la foto de varios envases, pero con el texto de pegado en húmedo (error de diseño)',
    ('Hidrofugante Para Fachadas', None): 'Existe una garrafa sin tamaño indicado: confirmar si es galón o 5 galones antes de pedir la foto',
    ('Tintilla Madera', '200 CC'): 'Las fotos de galón y 1000 CC ya están asignadas',
}


def normalizar(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', s).strip()


def producto_y_tamano(titulo):
    t = normalizar(titulo)
    for patron, tam in TAMANOS:
        m = re.search(patron, t)
        if m:
            if tam in ('CC', 'gr'):
                tam = f'{m.group(1)} {tam}'
            producto = re.sub(r'\s+X\s*\d+\s*UND.*$', '', t[:m.start()].strip(' -'))
            break
    else:
        producto, tam = t, '(sin tamaño en el título)'
    producto = producto.title()
    for a, b in TILDES:
        producto = producto.replace(a, b)
    if producto == 'Esmalte':
        producto = 'Esmalte Alquídico'
    return producto, tam


def situacion(nota):
    n = nota.lower()
    if 'varios envases' in n:
        return 'Solo existe foto de varios envases'
    if 'etiquetas planas' in n:
        return 'Solo había etiquetas planas'
    if 'garrafa' in n:
        return 'Garrafa sin tamaño confirmado'
    if nota.startswith('No hay foto') or 'única foto' in n:
        return 'Hay fotos de otros tamaños, no de este'
    return 'No hay ninguna foto'


def main():
    grupos = collections.defaultdict(lambda: {'codigos': [], 'situaciones': collections.Counter()})
    with open(ENTRADA, encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            if r['tipo'] != 'sin imagen':
                continue
            g = grupos[producto_y_tamano(r['titulo'])]
            g['codigos'].append(r['cod_interno'])
            g['situaciones'][situacion(r['nota'])] += 1
    orden = sorted(grupos.items(), key=lambda kv: (-len(kv[1]['codigos']), kv[0][0], kv[0][1]))
    with open(SALIDA, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(['prioridad', 'producto', 'tamano', 'productos_activos', 'codigos', 'situacion_actual', 'nota'])
        for i, ((producto, tam), g) in enumerate(orden, 1):
            nota = NOTAS.get((producto, tam)) or NOTAS.get((producto, None), '')
            w.writerow([i, producto, tam, len(g['codigos']), ' '.join(g['codigos']),
                        '; '.join(s for s, _ in g['situaciones'].most_common()), nota])
    total = sum(len(g['codigos']) for _, g in orden)
    print(f'{len(orden)} fotos · {total} productos activos -> {SALIDA}')


if __name__ == '__main__':
    main()
