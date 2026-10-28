"""
ENAR - Convierte las imágenes originales de producto a WebP para Firebase Storage

Lee los PNG de imagenes-originales/ (ignora EDITABLES/ e IMAGENES POR CORREGIR/)
y de imagenes-recortes/ (un envase recortado de una foto de varios; en el CSV
y el manifiesto su ruta empieza por RECORTES/) y genera en imagenes-web/:
  productos/<slug>.webp             hasta 1200 px  -> imagen_principal
  productos/miniaturas/<slug>.webp  hasta 300 px   -> imagen_miniatura
  manifest.json                     ruta original -> rutas en Storage

Encuadre (2026-10-27): las imágenes listadas en migration/imagenes-encuadre.json se
recortan al envase (sin el fondo sobrante) y se centran con un margen uniforme para
que el envase ocupe OCUPACION del lado mayor, la mediana del catálogo; así no se ven
más grandes que las demás. Las demás conservan su encuadre original.

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
OCUPACION = 0.82  # lado mayor del envase / lado mayor de la imagen (mediana de las 316 del catálogo)
ENCUADRE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'imagenes-encuadre.json')


def encuadrar(img, ocupacion=OCUPACION):
    """Recorta el fondo (transparente o casi blanco) y centra el envase con margen uniforme."""
    rgba = img.convert('RGBA')
    fondo_blanco = Image.eval(rgba.convert('L'), lambda v: 0 if v > 240 else 255)
    visible = Image.eval(rgba.getchannel('A'), lambda a: 255 if a > 20 else 0)
    mascara = Image.composite(fondo_blanco, Image.new('L', rgba.size, 0), visible)
    caja = mascara.getbbox()
    if not caja:
        return img
    envase = img.crop(caja)
    ew, eh = envase.size
    lado = round(max(ew, eh) / ocupacion)
    margen = (lado - max(ew, eh)) // 2
    w, h = ew + 2 * margen, eh + 2 * margen
    fondo = (0, 0, 0, 0) if img.mode == 'RGBA' else (255, 255, 255)
    lienzo = Image.new(img.mode, (w, h), fondo)
    lienzo.paste(envase, ((w - ew) // 2, (h - eh) // 2))
    return lienzo


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
    a_encuadrar = set(json.load(open(ENCUADRE, encoding='utf-8'))['imagenes']) if os.path.isfile(ENCUADRE) else set()
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
        al_dia = max(os.path.getmtime(fuente), os.path.getmtime(ENCUADRE) if rel in a_encuadrar else 0)
        if all(os.path.isfile(r) and os.path.getmtime(r) >= al_dia for r in (ruta_g, ruta_m)):
            with Image.open(ruta_g) as a, Image.open(ruta_m) as b:
                g, m = a.size, b.size
        else:
            with Image.open(fuente) as img:
                img = img.convert('RGBA') if img.mode in ('P', 'LA', 'RGBA') else img.convert('RGB')
                if rel in a_encuadrar:
                    img = encuadrar(img)
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
