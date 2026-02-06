# 🚀 Guía de Migración - ENAR B2B Plan de Negocios

## Paso 1: Preparar la nueva iMac

### 1.1 Instalar Node.js (si no lo tienes)
```bash
# Opción A: Descargar desde https://nodejs.org (recomendado)
# Descargar la versión LTS

# Opción B: Con Homebrew
brew install node
```

### 1.2 Verificar instalación
```bash
node --version   # Debe mostrar v18 o superior
npm --version    # Debe mostrar v9 o superior
```

---

## Paso 2: Copiar archivos del proyecto

### 2.1 Crear carpeta del proyecto
```bash
mkdir -p ~/ENAR_B2B_PRESENTACION
cd ~/ENAR_B2B_PRESENTACION
```

### 2.2 Copiar todos los archivos de esta carpeta (ENAR_MIGRACION) a la nueva ubicación

**Archivos incluidos:**
| Archivo | Descripción |
|---------|-------------|
| `create_enar_presentation_v2.js` | Script principal para generar la presentación |
| `create_gradient.js` | Script para generar imágenes de degradado |
| `header_gradient.png` | Imagen degradado para headers |
| `title_gradient.png` | Imagen degradado para fondos |
| `logo-enar.png` | Logo oficial de ENAR |
| `ENAR_B2B_Plan_Representacion_v3.pptx` | Presentación actual |
| `ENAR_B2B_PLAN_NEGOCIOS.md` | Archivo de contexto del proyecto |

---

## Paso 3: Instalar dependencias

```bash
cd ~/ENAR_B2B_PRESENTACION

# Instalar todas las dependencias necesarias
npm install pptxgenjs react react-dom react-icons sharp
```

---

## Paso 4: Ajustar rutas en el script

### ⚠️ IMPORTANTE: Debes modificar las rutas en `create_enar_presentation_v2.js`

Abre el archivo y busca/reemplaza estas rutas:

**Buscar:**
```javascript
const logoPath = "/sessions/gracious-brave-mayer/mnt/enar-catalog/public/img/logo-enar.png";
```
**Reemplazar por:**
```javascript
const logoPath = "./logo-enar.png";
```

---

**Buscar:**
```javascript
const headerGradientPath = "/sessions/gracious-brave-mayer/header_gradient.png";
```
**Reemplazar por:**
```javascript
const headerGradientPath = "./header_gradient.png";
```

---

**Buscar:**
```javascript
const titleGradientPath = "/sessions/gracious-brave-mayer/title_gradient.png";
```
**Reemplazar por:**
```javascript
const titleGradientPath = "./title_gradient.png";
```

---

**Buscar:**
```javascript
await pres.writeFile({ fileName: "/sessions/gracious-brave-mayer/mnt/enar-catalog/ENAR_B2B_Plan_Representacion_v3.pptx" });
```
**Reemplazar por:**
```javascript
await pres.writeFile({ fileName: "./ENAR_B2B_Plan_Representacion_v3.pptx" });
```

---

## Paso 5: Regenerar la presentación

```bash
cd ~/ENAR_B2B_PRESENTACION

# Generar la presentación
node create_enar_presentation_v2.js
```

Si todo está correcto, verás:
```
Presentation v3 with gradient headers created successfully!
```

---

## Paso 6: Abrir con Keynote

```bash
# Abrir la presentación
open ENAR_B2B_Plan_Representacion_v3.pptx
```

---

## 📋 Resumen del estado del proyecto

### ✅ Diapositivas revisadas (1-3):
- **Slide 1**: Slogan actualizado, colores corregidos
- **Slide 2**: Diferenciador con "asistencia técnica remota"
- **Slide 3**: "Catálogo de Autogestión" + nuevos beneficios

### ⏳ Diapositivas pendientes de revisión (4-12):
- Slide 4: Catálogo y Carrito de Compras
- Slide 5: Modelo de Negocio
- Slide 6: Condiciones de Venta (Contado vs Crédito)
- Slide 7: Política de Crédito
- Slide 8: Estructura de Comisiones
- Slide 9: Proceso Operativo
- Slide 10: KPIs
- Slide 11: Herramientas Tecnológicas
- Slide 12: Próximos Pasos

---

## 🎨 Paleta de colores ENAR B2B

| Color | Hex | Uso |
|-------|-----|-----|
| Rojo ENAR | #D9232D | Botones, precios, acentos |
| Azul Oscuro | #1e3a8a | Header inicio degradado |
| Azul Claro | #3b82f6 | Header fin degradado |
| Éxito | #28a745 | Confirmaciones |
| Fondo | #f5f7fa | Background general |

---

## 💬 Cómo continuar con Claude

Cuando inicies una nueva sesión con Claude, simplemente:

1. Selecciona la carpeta `ENAR_B2B_PRESENTACION` como carpeta de trabajo
2. Comparte el archivo `ENAR_B2B_PLAN_NEGOCIOS.md`
3. Di: **"Continuemos con el plan de negocios ENAR B2B, revisa el archivo de contexto"**

Claude tendrá toda la información para continuar donde lo dejamos.

---

## 🆘 Solución de problemas

### Error: Cannot find module 'pptxgenjs'
```bash
npm install pptxgenjs
```

### Error: Cannot find module 'sharp'
```bash
npm install sharp
```

### Error: Cannot find module 'react-icons'
```bash
npm install react react-dom react-icons
```

### El logo se ve distorsionado
El logo tiene proporción 2:1 (300x151 px). Usa siempre dimensiones como:
- Grande: w: 2.4, h: 1.2
- Mediano: w: 2.0, h: 1.0
- Pequeño: w: 1.2, h: 0.6

---

*Documentación generada: 1 de febrero de 2026*
