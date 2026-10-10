# Plan: aplicar IVA 19% a las listas de precios

**Proyecto:** ENAR Catalog (`enar-b2b`) · **Fecha:** 2026-10-10 · **Estado:** plan aprobado, en ejecución por pasos

## Decisión

**Convención (a): el precio almacenado incluye IVA.** Los campos `precio_mayorista`, `precio_negocio`, `precio_persona_natural` y `precio_nuevos` pasan a incluir el 19%. El **panel admin es la única fuente** de esos cuatro campos; la hoja de cálculo solo aporta `precio_lista` (la base sin IVA).

Fórmula objetivo:

```
precio_<lista> = round( precio_lista × (1 + incremento/100) × 1.19 )
```

Se eligió (a) porque **no cambia ni una línea** de `carrito.js`, `ordenes.js`, `vendedor.js` ni `crm-ordenes.js`: esos módulos ya asumen que el precio incluye IVA y lo extraen dividiendo por 1.19. La alternativa (b) —precio sin IVA y el frontend suma— habría exigido tocar las cinco rutas de cálculo.

**Contexto:** la app está en modo pruebas. Todas las órdenes existentes son de prueba y no hay clientes reales operando, así que no hace falta plan de comunicación ni cuidar la continuidad de los reportes.

## Orden de ejecución

```
1 (Apps Script) → 3 (bases de los 9) → 4 (obsoletar scripts) → 5 (aplicar) → 2 (agente IA) → 7 (limpieza)
```

El paso 6 (reversa) está disponible en cualquier momento. El 4 es independiente y puede correr en paralelo. Hay un punto de control del usuario entre cada paso.

---

## Fuente vigente del precio base (`precio_lista`)

Verificado por lectura de producción el 2026-10-10, tras cumplirse el punto de control 1.

### Veredicto

**La fuente vigente es el archivo de precios de agosto 2026, aplicado con `migration/actualizar-precios-08-2026.js --ejecutar`.** No es la hoja de cálculo.

Pruebas:

| Comprobación | Resultado |
|---|---|
| `precio_lista` de hoy vs `precio_base_archivo` del CSV de auditoría | **1.727 de 1.727 coinciden, 0 difieren** (109 filas del CSV corresponden a productos que no están en Firestore) |
| ¿El script llegó a correr con `--ejecutar`? | **Sí.** En las 243 filas donde `precio_mayorista_old != _new`, el valor de hoy en Firestore es **`_new` en 243 de 243**, y `_old` en ninguna |
| Última escritura comprobable de la hoja (`sync_at`) | **2026-03-12T20:45:32**, idéntico en los 1.733 productos — hace siete meses |

**Por qué `updated_at` sigue en marzo aunque el script corrió en agosto:** `actualizar-precios-08-2026.js` **no sella `updated_at`** (cero ocurrencias en el archivo). Escribe `precio_lista` y los cuatro precios por lista sin dejar rastro temporal. Lo mismo ocurre con la carga masiva del panel y con `sync-presentacion.js`. Por eso los sellos de tiempo no sirven para fechar estas escrituras y hubo que recurrir a la comparación de valores.

### Todas las vías que pueden escribir `precio_lista`

| Vía | Archivo y líneas | ¿Escribe `precio_lista`? | Estado | Última escritura comprobable |
|---|---|---|---|---|
| Sync de la hoja (Apps Script) | `Sincronizacion.gs:785, 852` · `FirestoreAPI.gs:98` · `SheetReader.gs:20, 128` (columna G) | **Sí** — se conservó a propósito en el paso 1 | **Inactiva.** El trigger de 5 min no está corriendo: los 1.733 productos comparten el mismo `sync_at` | 2026-03-12T20:45:32 |
| Script de precios de agosto | `migration/actualizar-precios-08-2026.js:263` (`updates.precio_lista = pl`) | **Sí** | **Obsoletado en el paso 4a** — aborta con `exit 1` | Agosto 2026 (sin sello; probado por comparación de valores) |
| Carga masiva de productos del panel | `public/admin.html:3986-3989` (`precio_lista`, `p_real`, `p_corriente`) y `:3735-3736` (acepta columnas `precio_base` / `precio` / `precio_lista`) | **Sí** | **Activa.** Es la vía recomendada de aquí en adelante | **Sin huella.** Su firma sería `p_real == precio_lista`, y eso no ocurre en ningún activo: 361 de 367 no tienen `p_real` y los 6 que lo tienen difieren. Probablemente nunca se usó con columna de precio |
| `sync-presentacion.js` | `migration/sync-presentacion.js:144` | **Sí**, cuando difiere de la hoja | Manual, sin obsoletar | Sin sello. Corrió en algún momento: 363 de 367 activos tienen el campo `presentacion` que escribe |
| `fix-missing-productos.js` | `migration/fix-missing-productos.js:50, 101, 122` | **Sí**, al reponer productos faltantes | Manual, sin obsoletar | Sin sello. 10 productos tienen `created_at` (más reciente 2026-03-13) |
| `sync-precios-tipo.js` | `migration/sync-precios-tipo.js` | **No** — solo los 4 precios por lista | **Obsoletado en el paso 4a** | — |
| Cloud Function `syncProductos` | `functions-sync/index.js:52-74` | **No** — escribe `p_real`, `p_corriente`, `impuesto`, stock y metadatos | Desplegada y activa (la invoca `TriggerFunction.gs`) | Sella `sync_at` con `serverTimestamp()` |

### Consecuencia del paso 4a que hay que resolver

El paso 4a obsoletó `actualizar-precios-08-2026.js`, que **era precisamente la vía por la que se estaban actualizando los precios**. Eso fue correcto —tenía factores cableados sin IVA—, pero deja un hueco: hoy no queda ninguna vía activa y probada para cargar un archivo de precios nuevo.

**La sustituta correcta es la carga masiva de productos del panel admin.** Acepta un archivo con columna `precio_base` (o `precio` / `precio_lista`), escribe `precio_lista` y recalcula los derivados con `calcularDerivadosProducto()` (`admin.html:3757-3771`), que **lee `configuracion/listas_precios`** y por tanto respetará el `iva: 19`. Es la única vía que combina carga de base y recálculo consistente con la configuración.

Pendiente antes de usarla en serio: **nunca se ha probado con una columna de precio** (no hay huella `p_real == precio_lista` en ningún producto). Conviene ensayarla con un archivo de 2-3 productos antes de confiarle el catálogo completo.

### Riesgo latente: la hoja puede retroceder `precio_lista` siete meses

Tras el paso 1 la hoja **sigue escribiendo `precio_lista`** (columna G), por diseño. Pero su última sincronización es de marzo 2026, mientras que los valores vigentes en Firestore son de agosto 2026. **No se sabe si la columna G de la hoja fue actualizada con los precios de agosto.** Si no lo fue, reactivar el trigger o lanzar un sync completo **revertiría el precio base de los 1.733 productos a los valores de marzo**, y el recálculo del paso 5 propagaría ese retroceso a los cuatro precios por lista.

Mitigación antes de reactivar cualquier sincronización de la hoja:

1. Comparar la columna G de la hoja contra el `precio_lista` actual de Firestore en una muestra. Si difieren, actualizar la hoja primero.
2. Probar con `sincronizarProductoIndividual(cod)` (`Sincronizacion.gs:150`), nunca con `sincronizarTodosLosProductos()`.
3. Alternativa más limpia: quitar también `precio_lista` de `CAMPOS_DESDE_SHEET` y dejar la carga masiva del panel como única vía de la base. Eso haría del panel la fuente única de los cinco campos de precio, no solo de los cuatro derivados.

El archivo `Datos Lista precios-08-2026.numbers` que usó el script **no está en el repositorio ni en el directorio padre** (`migration/actualizar-precios-08-2026.js:32` lo espera en `../`), así que el insumo original tampoco está disponible aquí para contrastarlo.

---

## Paso 1 — Apps Script: dejar de escribir los precios por lista

**Lo despliega el usuario.** Dos archivos, cuatro bloques.

### `Sincronizacion.gs`

**a) `CAMPOS_DESDE_SHEET`, líneas 778-795.** Borrar tres entradas (781-783), conservar `precio_lista`:

```js
const CAMPOS_DESDE_SHEET = [
  'cod_interno',
  'titulo',
  'cantidad',
  'precio_mayorista',          // ← BORRAR (línea 781)
  'precio_negocio',            // ← BORRAR (línea 782)
  'precio_persona_natural',    // ← BORRAR (línea 783)
  'precio_lista',              // ← CONSERVAR
  'embalaje',
  ...
```

**b) `convertirProductoAFields()`, líneas 842-860.** Borrar tres líneas (849-851), conservar 852:

```js
    precio_mayorista:       { doubleValue: producto.precio_mayorista || 0 },        // ← BORRAR (849)
    precio_negocio:         { doubleValue: producto.precio_negocio || 0 },          // ← BORRAR (850)
    precio_persona_natural: { doubleValue: producto.precio_persona_natural || 0 },  // ← BORRAR (851)
    precio_lista:           { doubleValue: producto.precio_lista || 0 },            // ← CONSERVAR (852)
```

### `FirestoreAPI.gs`

**c) `CAMPOS_PRODUCTO_SHEET`, líneas 96-99.** En la línea 98, quitar los tres primeros y dejar `precio_lista`:

```js
  'precio_mayorista', 'precio_negocio', 'precio_persona_natural', 'precio_lista',
//  ↑ borrar            ↑ borrar          ↑ borrar                   ↑ conservar
```

Esta constante alimenta el `updateMask` de la línea 113, así que al quitarlos la API de Firestore deja de tocarlos. No hace falta añadirlos a `CAMPOS_PROTEGIDOS` (línea 214): sacarlos del `updateMask` ya los blinda.

**d) Opcional, recomendado.** `SheetReader.gs:17-19, 125-127` seguirá *leyendo* las columnas D/E/F aunque nadie las use. Se puede dejar (inocuo) o limpiar. **No tocar** `PRECIO_LISTA: 6` (columna G) ni `IMPUESTO: 9` (columna J).

| | |
|---|---|
| **Archivos** | `Sincronizacion.gs`, `FirestoreAPI.gs` (opcionalmente `SheetReader.gs`) |
| **Riesgo** | **Bajo.** Es un cambio que *resta* escrituras. Único efecto colateral: quien ajustara precios desde la hoja deberá hacerlo en el panel — que es justo la decisión tomada |
| **Verificación** | Correr `previsualizarSincronizacion()` (`Sincronizacion.gs:229`) y confirmar que el payload ya no lista los tres campos. Luego: anotar el `precio_mayorista` de un producto, cambiar su columna D en la hoja, dejar pasar un ciclo del trigger (5 min) y confirmar en Firestore que **no cambió**, mientras `precio_lista` sí refleja la columna G |

**Por qué va primero:** `configurarTriggerAutomatico()` (`Sincronizacion.gs:550-571`) instala un trigger **cada 5 minutos** sobre `sincronizarTodosLosProductos`. Si se aplica el IVA antes de cerrar esta puerta, la hoja pisa el recálculo en minutos y queda un catálogo mixto.

---

## Paso 2 — Agente IA: pasar de sumar IVA a extraerlo

Puede ir **después** de aplicar el IVA, pero es **requisito bloqueante para salir en vivo**.

Son **tres** archivos. El tercero (`crearCotizacion.js`) se detectó en el diagnóstico y no estaba en el alcance original.

| Archivo | Líneas | Hoy | Debe quedar |
|---|---|---|---|
| `functions-sync/agent/tools/crearOrden.js` | 82-98, 129 | `item_iva = item_subtotal × impuesto`; `total = subtotal + total_iva` | `total = Σ precio × cantidad`; `subtotal = total / 1.19`; `iva = total − subtotal` |
| `functions-sync/agent/tools/crearCotizacion.js` | 50-70 | Idéntico patrón de suma | Igual que arriba |
| `functions-sync/agent/tools/consultarFichaTecnica.js` | 139 | `precio_negocio \|\| precio_lista` — precio único cableado a Negocio, y cae al costo base | Resolver por `tipo_cliente` del usuario; nunca caer a `precio_lista` |

Conviene además extraer `IVA_PORCENTAJE = 0.19` a un módulo compartido del agente, en vez de `prod.impuesto || 0.19` por ítem, para que coincida con la constante del frontend (`crm-utils.js:69`, `carrito.js:21`, `ordenes.js:254`).

### Cómo se despliega `functions-sync`

```
firebase deploy --only functions:enar-sync
```

El `codebase` es `enar-sync` (`firebase.json`), con seis entrypoints: `syncProductos`, `chatAgent`, `recalcularMetricas`, `generarCSV`, `enviarNotificacion`, `recalcularMetricasDiario`. Node 22.

### Qué falla hoy en ese deploy

`CLAUDE.md` registra que el deploy de functions falla por `rolldown_runtime.js`, y de ahí viene la regla de usar siempre `--only hosting,firestore:rules`. **Esa causa no es verificable con el estado actual del repo:** no hay rastro de `rolldown` en `functions-sync/`, ni en `package.json`, ni en `package-lock.json`, ni en los `firebase-debug*.log`. `rolldown` no es dependencia del proyecto; suele entrar por el bundler del CLI de Firebase al empaquetar.

Por tanto:

- Puede haberse resuelto al actualizar el CLI, o seguir latente.
- **Hay que reproducirlo** para diagnosticar; no se intentó porque escribe en producción.
- Camino cuando se llegue aquí: lanzar el deploy y capturar el error completo. Si reaparece, las salidas habituales son actualizar `firebase-tools` o desplegar una sola función (`--only functions:enar-sync:chatAgent`) para aislar cuál rompe el empaquetado.

| | |
|---|---|
| **Archivos** | Los 3 de la tabla, más un módulo compartido para la constante |
| **Riesgo** | **Medio-alto por el deploy, bajo por el código.** El cambio de fórmula es mecánico; lo incierto es si el deploy de functions funciona. Mientras no se despliegue, el agente cobra de más |
| **Verificación** | Crear una orden por el chat para un cliente `negocio` y una equivalente en B2B con los mismos ítems: `subtotal`, `iva` y `total` deben coincidir al peso. Hoy la del agente sale 19% más alta; tras aplicar el IVA sin corregir, 41,6% más alta |

---

## Paso 3 — Los 9 productos descuadrados: **resuelto, esquema identificado**

### El esquema

Los 9 productos no tienen errores de captura: siguen un **esquema de precios distinto y coherente**, basado en un precio de lista del proveedor (PVP) con descuentos en cadena.

```
precio_mayorista = precio_lista × 0,97 × 0,40 × 1,19 × 1,30
                                  └─3%─┘ └─60%─┘ └IVA┘ └margen┘
```

Verificado en los 9 con desviación máxima de **0,45 pesos** (≤ 0,0004%), atribuible al redondeo a entero:

| cod_interno | `precio_lista` | mayorista actual | esperado por la fórmula | dif. | dif. % |
|---|---|---|---|---|---|
| `--DC01` | 516.463 | 310.000 | 309.999,69 | +0,31 | +0,000102% |
| `--DG503` | 132.801 | 79.712 | 79.711,94 | +0,06 | +0,000074% |
| `-O-G06` | 223.941 | 134.417 | 134.417,45 | −0,45 | −0,000335% |
| `-Ñ-G910` | 116.622 | 70.001 | 70.000,72 | +0,28 | +0,000396% |
| `ET` | 1.959.679 | 1.176.270 | 1.176.269,88 | +0,12 | +0,000010% |
| `JT300` | 4.560.000 | 2.737.076 | 2.737.076,16 | −0,16 | −0,000006% |
| `QT` | 969.306 | 581.812 | 581.812,36 | −0,36 | −0,000061% |
| `UT` | 2.061.856 | 1.237.600 | 1.237.600,20 | −0,20 | −0,000016% |
| `ZG5` | 159.660 | 95.834 | 95.833,68 | +0,32 | +0,000334% |

La razón `may/lista` es **0,6002360** en los nueve (factor combinado `0,97 × 0,40 × 1,19 × 1,30`).

### Las tres listas usan cadenas distintas

| Campo | Cadena exacta | Factor | Nota |
|---|---|---|---|
| `precio_mayorista` | `× 0,97 × 0,40 × 1,19 × 1,30` | 0,6002360 | 9 de 9 |
| `precio_negocio` | igual que mayorista | 0,6002360 | 8 de 9 — **`-O-G06` es la excepción**: `× 0,40 × 1,19 × 1,30` (sin el 3%), factor 0,6188 |
| `precio_persona_natural` | `× 0,40 × 1,19 × 1,35` | 0,6426000 | 9 de 9 — **sin el 3%** y con margen **1,35**, no 1,40 |
| `precio_nuevos` | — | — | **ausente en los 9** |

Esto explica la razón `p. natural / mayorista = 1,0706`: no es un margen aplicado sobre el mayorista, sino el cociente de dos cadenas distintas — `(0,40 × 1,35) / (0,97 × 0,40 × 1,30) = 1,35 / 1,261 = 1,070579`. Es decir, persona natural **no lleva el descuento del 3%** y usa un margen del 35% donde mayorista usa 30%. Constante en los 9 con 6 decimales.

### Tres hechos que cierran el caso

1. **Estos precios YA INCLUYEN IVA 19%.** La cadena lleva `× 1,19` dentro. Son los únicos productos del catálogo que hoy cumplen la convención (a) que se quiere adoptar. Los 358 "correctos" son los que **no** llevan IVA.
2. **Los 9 son exactamente los activos sin campo `impuesto`.** Hay 10 activos sin ese campo: los 9 descuadrados más `-Ñ-H910` ("Tintilla Madera 1000Cc Nogal"), que sigue el esquema directo (`may/lista = 1,30`) y por tanto es solo un producto al que le falta el campo, sin relación con el esquema PVP.
3. **No están en el archivo de precios de agosto 2026.** El CSV `migration/auditoria-precios-08-2026.csv` tiene 1.835 filas y ninguna corresponde a estos 9. Por eso `actualizar-precios-08-2026.js` nunca los recalculó y conservaron el esquema antiguo. Coherente con que sean los únicos **sin `updated_at` ni `sync_at`** (los 358 están sellados `2026-03-12T20:45:32`): la sincronización de la hoja nunca los tocó.

### Alcance en toda la colección

Sobre los 1.743 documentos de `productos`:

| Esquema | Productos |
|---|---|
| PVP (`× 0,97 × 0,40 × 1,19 × 1,30` = 0,60024) | **16** — los 9 activos + 7 inactivos (`-YX01`, `-YX901`, `P1`, `P80`, `ST-R`, `ÑC907`, `ÑG619`) |
| Directo (`× 1,30`, sin IVA) | 1.718 |
| Otros | 7 |

### Rastro en el repo

**Ninguno.** No hay `0.97`, `0.388`, ni factor `0.40` en el código propio (`migration/*.js`, `*.gs`, `public/`, `public-crm/`). Lo único relacionado es `descuento_base`, un modelo **anterior** de listas que `admin.html:4101-4107` migra a `incremento`, y `descuento_adicional`, un campo por usuario que siempre se escribe en `0` y nadie consume en el cálculo de precios. El esquema 60%+3% vive en la hoja de cálculo (columnas D/E/F, llenadas a mano o por el ERP), no en este repositorio.

### Decisión pendiente

`precio_lista` en estos 9 **no es el costo base**: es el PVP del proveedor. Dos salidas:

- **Opción A — normalizar `precio_lista` al costo base.** **Multiplicar** por `0,97 × 0,40 = 0,388`, que es el tramo de descuentos de la cadena. Deja los 16 en el mismo esquema que los otros 1.718 y el recálculo del paso 5 les da precios coherentes.
- **Opción B — excluirlos del recálculo** y tratarlos como catálogo especial. Requiere marcar los 16 productos y que el "Aplicar" del panel los salte, lo que hoy no soporta.

**Recomendación: Opción A**, y la comprobación es contundente: tras normalizar, la fórmula estándar con `iva: 19` **reproduce el `precio_mayorista` de hoy al peso**. No es coincidencia — es la misma cadena reagrupada:

```
hoy:        PVP × 0,97 × 0,40 × 1,19 × 1,30
normalizado: (PVP × 0,388) × 1,30 × 1,19     ← idéntico
```

Ejemplo: `UT` tiene PVP 2.061.856; `2.061.856 × 0,388 = 800.000`; `round(800.000 × 1,30 × 1,19) = 1.237.600`, que es exactamente su `precio_mayorista` actual.

Las otras listas sí se mueven, pero poco, porque la cadena antigua usaba márgenes distintos a los de la configuración:

| Lista | Variación tras normalizar | Por qué |
|---|---|---|
| `precio_mayorista` | **0,00%** (±0,003% por redondeo) | misma cadena reagrupada |
| `precio_negocio` | **+3,85%** | hoy usa margen 1,30; la configuración usa 1,35 |
| `precio_persona_natural` | **+0,59%** en los 9 activos | hoy `× 0,40 × 1,35` (sin el 3%); la configuración `× 0,388 × 1,40` |
| `precio_nuevos` | **nuevo** | ausente en los 16 |

**Dos casos particulares:**

- **`-O-G06`** — su `precio_negocio` sube solo **+0,73%** en vez de +3,85%, porque es el único cuya cadena de negocio no llevaba el descuento del 3%. Queda alineado con el resto sin tratamiento especial.
- **Los 7 inactivos** usan margen **1,375** para persona natural en vez de 1,35, así que ese campo les **baja** ~1,24% en lugar de subir. Verificado exacto: `-YX01` PVP 61.948,93 × 0,40 × 1,19 × 1,375 = 40.545,57, su valor actual. Además tienen `precio_lista` y precios con decimales (`37.183,97999…`), que la normalización deja en enteros. `P1` es el caso extremo por magnitud: PVP 145,44 → base 56, donde el redondeo mueve los porcentajes hasta ±2,3%.

| | |
|---|---|
| **Archivos** | Ninguno. Es corrección de datos |
| **Riesgo** | **Alto si se omite.** Con `precio_lista` tal como está, el recálculo del paso 5 les sube el precio ~2,17× sin IVA y ~2,58× con IVA. `JT300` pasaría de 2.737.076 a 7.054.320 |
| **Verificación** | Contrastar los 16 contra la hoja. Si se toma la Opción A, correr `migration/normalizar-pvp-proveedor.js --ejecutar` **antes** del paso 5, y comprobar que tras el paso 5 el `precio_mayorista` de los 9 activos no cambió respecto al de hoy |

---

## Paso 4 — Scripts de `migration/` con factores fijos → **4a aplicado**

Tres scripts podían pisar los cuatro campos con factores cableados y **sin IVA**, ignorando la configuración:

| Script | Líneas | Qué hacía |
|---|---|---|
| `migration/sync-precios-tipo.js` | 27-31, 108-111, 200 | `1.30/1.35/1.40/1.45`, excepción `1.30` para `--KQ`. Comentario: "sin IVA" |
| `migration/actualizar-precios-08-2026.js` | 34-38, 248-251, 369 | Mismos factores. Además con `--update-config` sobrescribía `configuracion/listas_precios` (372-432), que es cómo se pueden perder listas personalizadas |
| `migration/debug-precios2.js` | 19-20 | Solo lectura, sin riesgo |

**Opción elegida: 4a — marcarlos obsoletos.** Se insertó una guarda al inicio de los dos primeros que imprime el motivo y aborta con `process.exit(1)`, antes de inicializar Firebase. Cinco líneas efectivas, cero ambigüedad.

Se descartó **4b** (hacerlos leer `configuracion/listas_precios`) porque mantiene dos implementaciones de la misma fórmula — exactamente la duplicación que originó este diagnóstico. Si más adelante hace falta recálculo masivo desde terminal, lo correcto es un script nuevo que lea la configuración, sin factores propios.

| | |
|---|---|
| **Archivos** | `migration/sync-precios-tipo.js`, `migration/actualizar-precios-08-2026.js` |
| **Riesgo** | **Bajo.** Son scripts manuales. El riesgo era el de no hacerlo: que alguien los corra en seis meses y borre el IVA de todo el catálogo |
| **Verificación** | ✅ Ambos abortan con `exit 1` tanto con `--test` como con `--ejecutar`, y pasan `node --check` |

---

## Paso 5 — Aplicar `iva: 19` y recalcular

**Orden de operaciones:**

1. **Respaldo** de `configuracion/listas_precios` y de los cuatro campos de los 367 productos activos, a un JSON en disco. Es la red del paso 6.
2. **`iva: 19` en las 4 listas.** Mediante **script transaccional** que ponga `iva: 19` en las cuatro de una vez preservando los demás campos — una sola escritura atómica en vez de cuatro ediciones por el modal, menos ventana para quedar a medias.
3. **Recalcular** con el botón "Aplicar" de cada lista en la pestaña Listas (`admin.html:4361-4455`). Procesa solo productos activos con `precio_lista > 0`, en lotes de 500, y escribe únicamente el `campo_firestore` de esa lista. Son 4 ejecuciones, una por lista.
4. **Verificar los 367** contra la fórmula con script de solo lectura.

**Sobre el redondeo:** la fórmula hace `round(base × inc × 1.19)` en un solo paso. No es lo mismo que redondear sin IVA y luego aplicar el 19% — hay diferencias de hasta 1 peso por producto. Tenerlo presente al cruzar con el ERP.

**Sobre `impuesto` por producto:** los 10 activos sin el campo y los 357 con `0.19` quedan igual, porque B2B y CRM usan la constante `IVA_PORCENTAJE = 0.19` y **no** leen `impuesto`. Solo el agente IA lo lee. Si algún día entra un producto exento, la constante lo cobraría igual — fuera de alcance, pero queda anotado.

| | |
|---|---|
| **Archivos** | Ninguno de código. Datos: `configuracion/listas_precios` + 4 campos × 367 productos |
| **Riesgo** | **Alto.** Es el momento en que los precios suben 19%. Mitigado por: la app está en pruebas, el paso 1 ya cerró la sobrescritura, el paso 3 ya saneó las bases, y hay respaldo |
| **Verificación** | Script de solo lectura que recorra los 367 y compare cada campo contra `round(precio_lista × (1+inc/100) × 1.19)`. Objetivo: **367/367 coinciden**. Más una orden de prueba en B2B y otra en CRM confirmando que el desglose cuadra y el total subió 19% exacto |

---

## Paso 6 — Reversa

Tres niveles, del más barato al más completo:

**6a — Volver `iva: 0` y recalcular.** El inverso exacto del paso 5: script transaccional que pone `iva: 0` en las cuatro listas, y "Aplicar" en cada una. Como la fórmula es determinista y parte de `precio_lista` —que no se modifica en ningún momento—, el resultado reproduce exactamente los precios previos. **Esta es la reversa normal.**

**6b — Restaurar desde el respaldo del paso 5.1.** Si el recálculo quedó a medias (una lista aplicada y tres no), o si los 9 productos se tocaron por error. Script que reescribe los cuatro campos desde el JSON. Cubre lo que 6a no: estados inconsistentes.

**6c — Revertir el Apps Script.** Independiente. Si hay que volver a que la hoja controle los precios, se restauran las líneas del paso 1. Hacerlo **solo** después de 6a o 6b: si la hoja vuelve a escribir mientras los precios tienen IVA, queda catálogo mixto.

No hace falta reversa en el código de las apps: la convención (a) no cambia ni una línea de `carrito.js`, `ordenes.js`, `vendedor.js` ni `crm-ordenes.js`.

| | |
|---|---|
| **Riesgo de la reversa** | **Bajo**, siempre que `precio_lista` esté intacto. Por eso el paso 1 va antes: protege la base |
| **Verificación** | El mismo script del paso 5, esperando `iva: 0` |

---

## Paso 7 — Limpiar las órdenes de prueba antes de salir en vivo

**Solo método propuesto. No se borra nada.**

### Estado actual de `ordenes`

| | |
|---|---|
| Documentos | **384** |
| Rango de fechas | 2026-03-16 a 2026-10-10 |
| Suma de totales | 1.556.053.225 |
| Por tipo | `orden-vendedor` 370 · sin tipo 14 |
| Por estado | terminada 320 · en_proceso 42 · pendiente 15 · cancelada 7 |
| Origen | las 384 tienen `user_id` · 370 tienen `creadaPor` |
| Marca de prueba | **ninguna** — no existe campo `es_prueba`, `test`, `demo` ni `archivada` |
| Colecciones ligadas | `chat_ordenes` 42 · `despachos` 0 · `carrito` 0 |

Top creadores: `ventas@enar.com.co` 339 · `martha.enar@gmail.com` 21 · `sebastianbumq@enarapp.com` 10 · y 9 correos de clientes con 1-3 cada uno.

**Advertencia:** 339 órdenes de `ventas@enar.com.co` repartidas en siete meses, con 320 en estado `terminada`, no *parecen* datos de prueba. Conviene confirmarlo con Henrry antes de ejecutar nada, porque el borrado es irreversible.

### Método propuesto, en tres fases

**7a — Marcar, no borrar.** Añadir `es_prueba: true` y `archivada_en: <fecha>` a las órdenes seleccionadas, con script transaccional por lotes de 500. Es reversible, no rompe referencias y los reportes pueden filtrarlas de inmediato. Criterios de selección posibles:

- **Fecha de corte** (el más limpio): "todo lo anterior al día X es prueba".
- **Por creador**: las 339 de `ventas@enar.com.co` más las 21 de Martha.
- **Todas las 384.**

**7b — Filtrar en los reportes.** `public-crm/js/crm-reportes.js` agrupa sobre `orden.total` sin filtrar nada. Hay que excluir `es_prueba == true` ahí y en el dashboard. Si se filtra por query en vez de en memoria, requiere un índice en `firestore.indexes.json`. Con 7a+7b los reportes arrancan limpios **sin borrar un solo documento**.

**7c — Borrado definitivo, opcional y posterior.** Solo si se quiere la colección vacía. Antes: exportar las 384 a JSON (o `gcloud firestore export`), y borrar en cascada los 42 `chat_ordenes` asociados, que quedarían huérfanos. Las reglas permiten `delete` solo a admin (`firestore.rules:175`).

**Recomendación: quedarse en 7a+7b.** El costo de conservar 384 documentos es nulo y el historial puede servir.

**Efecto lateral a cubrir:** `metricas_clientes/{uid}` tiene `dias_sin_compra`, `clasificacion_abc` y `riesgo_abandono` calculados sobre estas órdenes. Al archivarlas o borrarlas hay que correr `recalcularMetricas` (`functions-sync/index.js:176`), o las métricas quedarán describiendo compras que ya no existen.

| | |
|---|---|
| **Archivos** | `public-crm/js/crm-reportes.js` y el dashboard para 7b; posible `firestore.indexes.json` |
| **Riesgo** | **Bajo en 7a/7b** (reversible). **Irreversible en 7c** |
| **Verificación** | Contar órdenes con `es_prueba != true` (debe ser 0 antes de la salida en vivo) y confirmar que los reportes muestran cero en todos los períodos |

---

## Requisitos para salir en vivo

1. **Paso 2 — agente IA.** Hoy cobra 19% de más; tras aplicar el IVA, 41,6%. Incluye `crearOrden.js`, `crearCotizacion.js` y `consultarFichaTecnica.js`.
2. **Paso 7 — órdenes de prueba** archivadas y reportes filtrados.
3. **Recálculo tras cambios en la hoja** — ver el apartado siguiente.
4. **`consultarFichaTecnica.js:139`** — muestra `precio_negocio` a todo cliente y cae a `precio_lista`, que es el costo. El catálogo ya no lo expone (`c8e3cf9`), pero el chat sí.
5. **Lectura pública de `productos`** (`firestore.rules:68-70`): cualquiera sin autenticar puede descargar `precio_lista`, es decir el costo de ENAR. Es la inconsistencia A-4 del informe de auditoría y no se arregla ocultándolo en la interfaz.
6. **Los 7 productos inactivos con esquema PVP** (`-YX01`, `-YX901`, `P1`, `P80`, `ST-R`, `ÑC907`, `ÑG619`): si se reactivan sin normalizar su `precio_lista`, entran al catálogo con precios inconsistentes.

---

## Requisito nuevo: los precios no se recalculan solos

Tras el paso 1, **un cambio de `precio_lista` en la hoja ya no recalcula los precios por lista**. La hoja seguirá actualizando la base cada 5 minutos, pero los cuatro campos derivados quedan congelados hasta que alguien entre al panel admin, vaya a la pestaña Listas y pulse "Aplicar" en cada una de las 4 listas.

Es una regresión funcional respecto a hoy: antes la hoja escribía los precios finales directamente. El riesgo concreto es vender con precios viejos sin que nadie lo note — silencioso, porque nada en la interfaz indica que haya desfase.

Tres opciones, de menor a mayor esfuerzo:

### Opción 1 — Aviso de desfase en el panel (recomendada para salir en vivo)

En la pestaña Listas, un contador del tipo *"N productos con precios desactualizados"* con un botón "Recalcular todo" que aplique las 4 listas de una pasada.

- **Cómo detectarlo:** comparar `producto[campo_firestore]` contra `round(precio_lista × (1+inc/100) × 1.19)` sobre los productos activos ya precargados en memoria (`cargarProductos()` ya los tiene). Cero lecturas extra de Firestore.
- **Dónde:** `public/admin.html`, junto a los KPIs de la pestaña Listas (`:4107-4116`). El cálculo ya existe en `calcularDerivadosProducto()` (`:3757-3771`), se puede reutilizar.
- **Ventajas:** barato, sin infraestructura nueva, visible, y deja la decisión de recalcular en manos de una persona.
- **Desventaja:** depende de que alguien abra el panel.

### Opción 2 — Recálculo automático en la Cloud Function de sync

En `functions-sync/index.js`, dentro de `syncProductos` (`:18-74`): tras escribir `precio_lista`, leer `configuracion/listas_precios` y recalcular los cuatro campos en el mismo batch.

- **Ventajas:** elimina el desfase por completo; la hoja vuelve a ser suficiente para cambiar precios.
- **Desventajas:** el sync pasa a escribir los cuatro campos, lo que **contradice** la decisión de que el panel sea la única fuente — aunque la fórmula sí saldría de la configuración, así que el IVA se respetaría. Requiere desplegar functions, que es el paso con el deploy incierto. Y el sync corre cada 5 minutos: si alguien está editando listas en el panel, pueden pisarse.
- **Mitigación:** recalcular solo cuando `precio_lista` efectivamente cambió, comparando contra el valor previo.

### Opción 3 — Trigger `onDocumentUpdated` sobre `productos`

Una función que reaccione a cambios de `precio_lista` y recalcule ese producto.

- **Ventajas:** granular y desacoplado del sync; sirve para cualquier origen del cambio, no solo la hoja.
- **Desventajas:** la más costosa — una invocación por producto modificado (1.743 documentos en un sync completo). Riesgo de bucle si el trigger escribe en la misma colección sin guarda. Requiere desplegar functions.

**Recomendación:** **Opción 1** para salir en vivo, porque es barata y no toca `functions-sync`. Si el desfase resulta molesto en la operación, **Opción 2** con la mitigación de comparar el valor previo. La Opción 3 solo si aparecen más orígenes de cambio de `precio_lista`.

**No implementado.** Queda como requisito pendiente.

---

## Registro de cambios ya aplicados

| Commit | Qué |
|---|---|
| `c8e3cf9` | `fix:` el catálogo B2B deja de mostrar `precio_lista` al cliente (era el costo de ENAR expuesto como "P. Lista") y se elimina la lógica de descuento tachado, que era código muerto. Desplegado en `hosting:b2b` |
| *(este commit)* | Paso 4a: `migration/sync-precios-tipo.js` y `migration/actualizar-precios-08-2026.js` marcados obsoletos, abortan con `exit 1` |
