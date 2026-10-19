"""
ENAR - Convierte las imágenes originales de producto a WebP para Firebase Storage

Lee los PNG de imagenes-originales/ (ignora EDITABLES/ e IMAGENES POR CORREGIR/)
y genera en imagenes-web/:
  productos/<slug>.webp             hasta 1200 px  -> imagen_principal
  productos/miniaturas/<slug>.webp  hasta 300 px   -> imagen_miniatura
  manifest.json                     ruta original -> rutas en Storage

El slug sale de la ruta original (carpeta + nombre), en minúsculas, sin tildes y
con guiones, así que es estable entre ejecuciones. Solo escribe en imagenes-web/;
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

ORIGEN = 'imagenes-originales'
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
    if not os.path.isdir(ORIGEN):
        sys.exit(f'No existe {ORIGEN}/ (ejecuta desde la raíz del repo)')
    manifest, vistos = {}, {}
    for raiz, dirs, archivos in os.walk(ORIGEN):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUIR)
        for nombre in sorted(archivos):
            if not nombre.lower().endswith('.png'):
                continue
            rel = os.path.relpath(os.path.join(raiz, nombre), ORIGEN)
            s = slug(rel)
            if s in vistos:
                sys.exit(f'Slug duplicado "{s}": {vistos[s]} y {rel}')
            vistos[s] = rel
            with Image.open(os.path.join(ORIGEN, rel)) as img:
                img = img.convert('RGBA') if img.mode in ('P', 'LA', 'RGBA') else img.convert('RGB')
                g = guardar(img, GRANDE, os.path.join(DESTINO, 'productos', s + '.webp'))
                m = guardar(img, MINI, os.path.join(DESTINO, 'productos', 'miniaturas', s + '.webp'))
            manifest[rel] = {
                'imagen': f'productos/{s}.webp',
                'miniatura': f'productos/miniaturas/{s}.webp',
                'tam_imagen': g,
                'tam_miniatura': m,
            }
    with open(os.path.join(DESTINO, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f'{len(manifest)} imágenes convertidas en {DESTINO}/')


if __name__ == '__main__':
    main()
