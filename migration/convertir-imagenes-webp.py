"""
ENAR - Convierte las imágenes originales de producto a WebP para Firebase Storage

Lee los PNG de imagenes-originales/ (ignora EDITABLES/ e IMAGENES POR CORREGIR/)
y de imagenes-recortes/ (un envase recortado de una foto de varios; en el CSV
y el manifiesto su ruta empieza por RECORTES/) y genera en imagenes-web/:
  productos/<slug>.webp             hasta 1200 px  -> imagen_principal
  productos/miniaturas/<slug>.webp  hasta 300 px   -> imagen_miniatura
  manifest.json                     ruta original -> rutas en Storage

El slug sale de la ruta original (carpeta + nombre), en minúsculas, sin tildes y
con guiones, así que es estable entre ejecuciones. Salta las que ya están
convertidas y son más nuevas que el original. Solo escribe en imagenes-web/;
no sube nada. Ver docs/revision-imagenes.csv.

Uso (desde la raíz del repo):
  python3 migration/convertir-imagenes-webp.py
"""
import json
import os
import re
import sys
import unicodedata

from PIL import Image

ORIGENES = [('imagenes-originales', ''), ('imagenes-recortes', 'RECORTES/')]
DESTINO = 'imagenes-web'
EXCLUIR = ('EDITABLES', 'IMAGENES POR CORREGIR')
GRANDE, MINI = 1200, 300
CALIDAD = 82


def slug(ruta_relativa):
    sin_ext = os.path.splitext(ruta_relativa)[0]
    s = unicodedata.normalize('NFKD', sin_ext).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9/]+', '-', s)
    s = re.sub(r'-*/-*', '/', s).strip('-/')
    return s.replace('/', '--')


def guardar(img, tam, ruta):
    copia = img.copy()
    copia.thumbnail((tam, tam), Image.LANCZOS)  # no amplía las pequeñas
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    copia.save(ruta, 'WEBP', quality=CALIDAD, method=6)
    return copia.size


def main():
    if not os.path.isdir(ORIGENES[0][0]):
        sys.exit(f'No existe {ORIGENES[0][0]}/ (ejecuta desde la raíz del repo)')
    manifest, vistos, nuevas = {}, {}, 0
    fuentes = []
    for origen, prefijo in ORIGENES:
        if not os.path.isdir(origen):
            continue
        for raiz, dirs, archivos in os.walk(origen):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUIR)
            for nombre in sorted(archivos):
                if nombre.lower().endswith('.png'):
                    fuente = os.path.join(raiz, nombre)
                    fuentes.append((fuente, prefijo + os.path.relpath(fuente, origen)))
    for fuente, rel in fuentes:
        s = slug(rel)
        if s in vistos:
            sys.exit(f'Slug duplicado "{s}": {vistos[s]} y {rel}')
        vistos[s] = rel
        ruta_g = os.path.join(DESTINO, 'productos', s + '.webp')
        ruta_m = os.path.join(DESTINO, 'productos', 'miniaturas', s + '.webp')
        if all(os.path.isfile(r) and os.path.getmtime(r) >= os.path.getmtime(fuente) for r in (ruta_g, ruta_m)):
            with Image.open(ruta_g) as a, Image.open(ruta_m) as b:
                g, m = a.size, b.size
        else:
            with Image.open(fuente) as img:
                img = img.convert('RGBA') if img.mode in ('P', 'LA', 'RGBA') else img.convert('RGB')
                g = guardar(img, GRANDE, ruta_g)
                m = guardar(img, MINI, ruta_m)
            nuevas += 1
        manifest[rel] = {
            'imagen': f'productos/{s}.webp',
            'miniatura': f'productos/miniaturas/{s}.webp',
            'tam_imagen': g,
            'tam_miniatura': m,
        }
    with open(os.path.join(DESTINO, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f'{len(manifest)} imágenes en {DESTINO}/manifest.json ({nuevas} convertidas ahora)')


if __name__ == '__main__':
    main()
