---
name: consulta-firestore
description: Responde preguntas sobre los datos de Firestore del proyecto enar-b2b (productos, usuarios, órdenes, configuración, métricas) con consultas de solo lectura. Úsala para "¿cuántos…?", "muéstrame…", "¿qué valor tiene…?".
argument-hint: "<pregunta en lenguaje natural>"
---

# Consulta a Firestore

Pregunta: $ARGUMENTS

**Solo lectura.** Únicamente `get()`, `where`, `orderBy`, `limit`, `count()` y `listCollections()`. Prohibido `set`, `update`, `add`, `delete`, `batch`, `runTransaction`, `recursiveDelete` y ejecutar scripts de `migration/` o `functions-sync/`. No crees archivos dentro del repo. Si la pregunta implica modificar datos, responde qué se cambiaría y detente.

## Referencia de datos

Usa los campos documentados en `CLAUDE.md` (sección "Campos clave Firestore"). Recuerda:
- `usuarios`: la lista de precios del cliente es **`tipo_cliente`** (`mayorista`, `negocio`, `persona_natural`, `nuevos`), que corresponde al campo `precio_<tipo_cliente>` del producto. `lista_precios` es histórico y no se usa: no lo uses para responder qué precio aplica a un cliente
- `usuarios`: `ubicacion` (no `ciudad`), `rol`, `estado`
- `productos`: los precios vigentes son `precio_mayorista`, `precio_negocio`, `precio_persona_natural` y `precio_nuevos`, calculados desde `precio_lista` con `configuracion/listas_precios`. `Precio_L1` … `Precio_L10` son históricos y no se usan
- `ordenes`: las del CRM usan `clienteNombre`/`clienteNit`; las del B2B, `cliente.razon_social`/`cliente.nit`

Si un campo no está documentado, lee primero 1-2 documentos de ejemplo para confirmar su nombre en lugar de suponerlo.

## Pasos

1. Traduce la pregunta a una consulta. Prefiere `count()` para conteos y `limit` en listados (máx. 50 filas salvo que se pida más).
2. Escribe el script en una carpeta temporal fuera del repo (`mktemp -d` o el scratchpad):
   ```js
   const admin = require(process.env.REPO + '/migration/node_modules/firebase-admin');
   admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
   const db = admin.firestore();
   // consulta de solo lectura aquí
   ```
   y ejecútalo con `REPO=<raíz del repo> node consulta.js`.
3. Si una consulta exige un índice compuesto que no existe, no lo crees: filtra en memoria sobre un `where` simple.

## Privacidad

En `usuarios` y `ordenes` muestra solo los campos necesarios para responder. No vuelques documentos completos de clientes (correos, teléfonos, NIT) salvo que se pidan explícitamente.

## Resultado

La respuesta directa primero (número, lista o valor), luego en una línea la consulta usada (colección, filtros, cuántos documentos se leyeron).
