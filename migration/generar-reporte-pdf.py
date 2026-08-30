#!/usr/bin/env python3
"""
Genera PDF: Manual de Actualizacion de Precios ENAR - Agosto 2026
"""

from fpdf import FPDF
from datetime import datetime

class ReportePDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(255, 255, 255)
        self.set_fill_color(30, 58, 138)
        self.cell(0, 7, 'ENAR - Manual de Actualizacion de Precios | Agosto 2026', border=0, align='C', fill=True)
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Pagina {self.page_no()}/{self.pages_count}', align='C')


def generar_reporte():
    pdf = ReportePDF('P', 'mm', 'Letter')
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margin(10)
    pdf.set_top_margin(10)

    # ====== HELPERS ======
    def titulo(num, text):
        pdf.ln(6)
        pdf.set_font('Helvetica', 'B', 14)
        pdf.set_text_color(30, 58, 138)
        pdf.cell(0, 9, f'{num}. {text}')
        pdf.ln()
        pdf.set_draw_color(217, 35, 45)
        pdf.set_line_width(0.8)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)

    def sub(text):
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(51, 65, 85)
        pdf.cell(0, 7, text)
        pdf.ln(8)

    def p(text):
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(0, 5.5, text)
        pdf.ln(3)

    def b(text):
        pdf.set_x(15)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(0, 5.5, f'- {text}')

    def paso(num, text):
        pdf.set_x(15)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(217, 35, 45)
        pdf.cell(8, 6, f'{num}.')
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(0, 6, text)
        pdf.ln(1)

    def code(text):
        pdf.set_font('Courier', '', 9)
        pdf.set_fill_color(241, 245, 249)
        pdf.set_text_color(30, 41, 59)
        pdf.multi_cell(0, 5.5, text, fill=True)
        pdf.ln(3)

    def nota(text):
        pdf.set_fill_color(255, 251, 235)
        pdf.set_draw_color(253, 230, 138)
        x = pdf.get_x()
        y = pdf.get_y()
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(120, 53, 15)
        pdf.cell(0, 6, '  IMPORTANTE:', fill=True)
        pdf.ln()
        pdf.set_font('Helvetica', '', 9)
        pdf.set_x(x)
        pdf.multi_cell(0, 5, f'  {text}', fill=True)
        pdf.ln(4)

    def tabla(headers, rows, widths=None):
        if widths is None:
            widths = [190 // len(headers)] * len(headers)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_fill_color(241, 245, 249)
        pdf.set_text_color(30, 41, 59)
        pdf.set_draw_color(200, 200, 200)
        for i, h in enumerate(headers):
            pdf.cell(widths[i], 7, h, border=1, align='C', fill=True)
        pdf.ln()
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(30, 30, 30)
        alt = False
        for row in rows:
            if alt:
                pdf.set_fill_color(249, 250, 251)
            else:
                pdf.set_fill_color(255, 255, 255)
            for i, val in enumerate(row):
                a = 'R' if i > 0 and any(c.isdigit() for c in str(val)) else 'L'
                pdf.cell(widths[i], 6.5, str(val), border=1, align=a, fill=True)
            pdf.ln()
            alt = not alt
        pdf.ln(3)

    # ====== PORTADA ======
    pdf.add_page()
    pdf.ln(35)
    pdf.set_font('Helvetica', 'B', 32)
    pdf.set_text_color(30, 58, 138)
    pdf.cell(0, 15, 'ENAR', align='C')
    pdf.ln(18)

    pdf.set_font('Helvetica', 'B', 20)
    pdf.set_text_color(217, 35, 45)
    pdf.cell(0, 12, 'Manual de Actualizacion de Precios', align='C')
    pdf.ln(14)

    pdf.set_font('Helvetica', '', 16)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 10, 'Agosto 2026', align='C')
    pdf.ln(15)

    pdf.set_draw_color(217, 35, 45)
    pdf.set_line_width(1.2)
    pdf.line(65, pdf.get_y(), 150, pdf.get_y())
    pdf.ln(15)

    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(71, 85, 105)
    for line in [
        f'Fecha: {datetime.now().strftime("%d de agosto de %Y")}',
        'Plataforma: enar-b2b.web.app/admin.html',
        'Productos actualizados: 1,727',
    ]:
        pdf.cell(0, 8, line, align='C')
        pdf.ln()

    # ══════════════════════════════════════════════
    # SECCION 1: RESUMEN EJECUTIVO
    # ══════════════════════════════════════════════
    pdf.add_page()
    titulo('1', 'Resumen Ejecutivo')

    p('Se actualizo el sistema de listas de precios de ENAR, cambiando de un modelo '
      'basado en descuentos a uno basado en incrementos sobre el precio base. '
      'Se agrego una cuarta lista de precios "Nuevos" y se simplifico el manejo de excepciones.')

    sub('Que cambio')
    b('Nuevo modelo de calculo: precio_base x (1 + incremento/100)')
    b('El IVA ya viene incluido en el precio base del archivo fuente')
    b('4 listas de precios (antes 3): Mayorista, Negocio, Persona Natural, Nuevos')
    b('Excepcion simplificada: solo SKUs terminados en --KQ usan 30% fijo')
    b('Se eliminaron 43 codigos de excepcion antiguos')
    b('1,727 productos actualizados y verificados contra el ERP')
    pdf.ln(2)

    # ══════════════════════════════════════════════
    # SECCION 2: MODELO DE PRECIOS
    # ══════════════════════════════════════════════
    titulo('2', 'Nuevo Modelo de Precios')

    sub('Formula de calculo')
    code('  Precio final = precio_base x (1 + incremento / 100)')

    nota('El precio base del archivo fuente ya incluye el IVA. '
         'No se suma IVA adicional en el calculo.')

    pdf.ln(2)
    sub('Listas de precios')

    tabla(
        ['Lista', 'Incremento', 'Formula', 'Campo en sistema'],
        [
            ['Mayorista', '30%', 'precio_base x 1.30', 'precio_mayorista'],
            ['Negocio', '35%', 'precio_base x 1.35', 'precio_negocio'],
            ['Persona Natural', '40%', 'precio_base x 1.40', 'precio_persona_natural'],
            ['Nuevos', '45%', 'precio_base x 1.45', 'precio_nuevos'],
        ],
        [40, 30, 60, 60]
    )

    sub('Excepcion: productos --KQ')
    p('Los productos cuyo codigo termina en "--KQ" reciben un incremento fijo '
      'de 30% en las 4 listas, sin importar el porcentaje normal de cada una.')

    tabla(
        ['Lista', 'Incr. normal', 'Incr. aplicado (--KQ)', 'Resultado'],
        [
            ['Mayorista', '30%', '30% (fijo)', 'Igual'],
            ['Negocio', '35%', '30% (fijo)', 'Menor'],
            ['P. Natural', '40%', '30% (fijo)', 'Menor'],
            ['Nuevos', '45%', '30% (fijo)', 'Menor'],
        ],
        [40, 38, 55, 57]
    )

    # ══════════════════════════════════════════════
    # SECCION 3: EJEMPLOS COMPARATIVOS
    # ══════════════════════════════════════════════
    titulo('3', 'Ejemplos Comparativos')

    p('Los precios calculados fueron verificados contra el ERP de ENAR para '
      'garantizar que coincidan exactamente.')

    sub('Producto XZ (precio base: $2,461.60)')
    tabla(
        ['Lista', 'Calculo', 'Precio', 'ERP'],
        [
            ['Mayorista', '2,461.60 x 1.30', '$3,200', 'Coincide'],
            ['Negocio', '2,461.60 x 1.35', '$3,323', 'Coincide'],
            ['P. Natural', '2,461.60 x 1.40', '$3,446', 'Coincide'],
            ['Nuevos', '2,461.60 x 1.45', '$3,569', 'Nueva'],
        ],
        [40, 55, 40, 55]
    )

    sub('Producto XA (precio base: $23,658.40)')
    tabla(
        ['Lista', 'Calculo', 'Precio', 'ERP'],
        [
            ['Mayorista', '23,658.40 x 1.30', '$30,756', 'Coincide'],
            ['Negocio', '23,658.40 x 1.35', '$31,939', 'Coincide'],
            ['P. Natural', '23,658.40 x 1.40', '$33,122', 'Coincide'],
            ['Nuevos', '23,658.40 x 1.45', '$34,305', 'Nueva'],
        ],
        [40, 55, 40, 55]
    )

    sub('Producto --KQ (precio base: $2,387 - excepcion)')
    tabla(
        ['Lista', 'Calculo', 'Precio', 'Nota'],
        [
            ['Mayorista', '2,387 x 1.30', '$3,103', '30% fijo'],
            ['Negocio', '2,387 x 1.30', '$3,103', '30% fijo'],
            ['P. Natural', '2,387 x 1.30', '$3,103', '30% fijo'],
            ['Nuevos', '2,387 x 1.30', '$3,103', '30% fijo'],
        ],
        [40, 55, 40, 55]
    )

    nota('El precio base se mantiene con decimales. El redondeo se aplica solo al '
         'resultado final para coincidir con el ERP.')

    # ══════════════════════════════════════════════
    # SECCION 4: COMO ACTUALIZAR PRECIOS
    # ══════════════════════════════════════════════
    pdf.add_page()
    titulo('4', 'Como Actualizar Precios')

    sub('4.1 Desde la interfaz web (Actualizacion Masiva)')

    p('La actualizacion masiva permite subir un archivo Excel o CSV con los nuevos '
      'precios base y el sistema recalcula automaticamente los precios de las 4 listas.')

    nota('Solo los usuarios con rol Administrador o Gestor pueden realizar '
         'la actualizacion masiva de precios. Los vendedores no tienen acceso '
         'a esta funcionalidad.')

    pdf.ln(1)
    paso('1', 'Ir a enar-b2b.web.app/admin.html e iniciar sesion como administrador o gestor.')
    paso('2', 'En la seccion Productos, hacer clic en el boton "Actualizacion Masiva".')
    paso('3', 'Descargar la plantilla (XLSX o CSV) con el boton "Descargar Plantilla".')
    paso('4', 'Abrir la plantilla en Excel/Sheets y editar la columna precio_base con los nuevos precios.')
    paso('5', 'Guardar el archivo y subirlo en la zona "Subir archivo actualizado".')
    paso('6', 'Revisar la vista previa: verificar los precios calculados para Mayorista, Negocio, P. Natural y Nuevos.')
    paso('7', 'Hacer clic en "Aplicar cambios" para actualizar todos los productos.')
    pdf.ln(2)

    sub('Formato del archivo')
    p('El archivo debe tener las siguientes columnas:')

    tabla(
        ['Columna', 'Obligatoria', 'Descripcion'],
        [
            ['cod_interno', 'Si', 'Codigo del producto (debe existir en el sistema)'],
            ['precio_base', 'Si', 'Precio base con IVA incluido (admite decimales)'],
            ['cantidad', 'No', 'Stock disponible (si se desea actualizar)'],
        ],
        [45, 30, 115]
    )

    p('Tambien se aceptan nombres alternativos de columna: "Referencia" o "sku" '
      'para el codigo, y "precio_lista" o "Precio base" para el precio.')

    nota('Los precios derivados (mayorista, negocio, persona natural, nuevos) se calculan '
         'automaticamente. No es necesario incluirlos en el archivo.')

    sub('4.2 Desde linea de comandos (Script de migracion)')

    p('Para actualizaciones con archivos .numbers o .xlsx directamente desde terminal, '
      'se puede usar el script de migracion ubicado en la carpeta migration/.')

    pdf.ln(1)
    sub('Requisitos')
    b('Node.js instalado')
    b('Acceso a Firebase (gcloud auth application-default login)')
    b('Archivo de precios en la raiz del proyecto')
    pdf.ln(2)

    sub('Comandos disponibles')

    tabla(
        ['Comando', 'Que hace'],
        [
            ['node actualizar-precios-08-2026.js --test', 'Muestra los cambios sin aplicar (dry-run)'],
            ['node actualizar-precios-08-2026.js --test --csv', 'Dry-run + genera reporte CSV de auditoria'],
            ['node actualizar-precios-08-2026.js --ejecutar', 'Aplica los cambios a los productos'],
            ['node actualizar-precios-08-2026.js --ejecutar --csv', 'Aplica + genera reporte CSV'],
            ['  agregar --update-config', 'Tambien actualiza la configuracion de listas'],
        ],
        [100, 90]
    )

    sub('Flujo recomendado')
    paso('1', 'Ejecutar con --test --csv para revisar el reporte de auditoria.')
    paso('2', 'Verificar el archivo auditoria-precios-08-2026.csv generado.')
    paso('3', 'Ejecutar con --ejecutar --csv --update-config para aplicar.')
    paso('4', 'Verificar algunos productos en admin.html contra el ERP.')
    pdf.ln(2)

    nota('Siempre ejecutar primero con --test para verificar antes de aplicar cambios.')

    # ====== GUARDAR ======
    output_path = '/Users/jota2002/Proyectos_ENAR/enar-catalog/ENAR-Actualizacion-Precios-Agosto-2026.pdf'
    pdf.output(output_path)
    print(f'PDF generado: {output_path}')


if __name__ == '__main__':
    generar_reporte()
