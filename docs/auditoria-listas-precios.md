# Auditoría de listas de precios — ENAR Catalog

**Fecha:** 2026-10-09 · **Alcance:** `public/`, `public-crm/`, `public-portal/`, `migration/`, `functions-sync/`, `firestore.rules`, scripts `.gs` en la raíz · **Tipo:** solo lectura, sin cambios en código

---

## 1. Resumen ejecutivo

En el proyecto coexisten **dos sistemas de listas de precios desconectados entre sí**. El sistema vigente guarda las listas en el documento `configuracion/listas_precios` (4 listas de sistema: `mayorista`, `negocio`, `persona_natural`, `nuevos`, más las personalizadas que cree el admin); cada lista define un `campo_firestore` que se materializa en cada producto recalculándolo desde `precio_lista`. El sistema legacy, heredado de la migración de Google Sheets, usa el campo `usuarios.lista_precios` con valores `L1…L10` contra los campos `Precio_L1…Precio_L10` del producto.

**Qué campo manda en cada app:** en el catálogo B2B (`public/`) manda **exclusivamente `usuarios.tipo_cliente`** — `lista_precios` no se lee en ningún punto. En el CRM (`public-crm/`) y en el panel de vendedor manda también `tipo_cliente`, con `lista_precios` solo como *fallback* cuando no hay precio por tipo. En las Cloud Functions del agente IA manda `tipo_cliente` sobre un mapa cerrado de 3 valores. El portal no usa precios.

**Los 3 riesgos más graves:** (1) el *fallback* legacy está roto en producción — Firestore almacena `9`/`10` y el código solo reconoce `L9`/`L10`, por lo que los 1.898 clientes migrados nunca aciertan la lista; (2) al menos 431 clientes tienen `tipo_cliente` con valores de régimen tributario (`Regimen Común`, `Regimen Simplificado`, `Sin Clasificar`) que no resuelven a ningún campo de precio y cobran tarifa de persona natural; (3) `migration/actualizar-precios-08-2026.js --update-config` sobrescribe el documento de configuración y borra cualquier lista personalizada.

---

## 2. Tabla 1 — Listas de precios

| Lista (valor/ID) | Sistema | Nombre o etiqueta en la UI | Campo de precio en productos | Incremento sobre `precio_lista` | Dónde se define | Clientes en los CSV de migración |
|---|---|---|---|---|---|---|
| `mayorista` | Nuevo | "Mayorista" (`public/admin.html:2204`, `public/perfil.html:586`) | `precio_mayorista` | +30% (`--KQ`: +30%) | Seed `public/admin.html:4031-4041` → doc `configuracion/listas_precios` (`public/admin.html:4026`) | No encontrado (los CSV no usan estos IDs) |
| `negocio` | Nuevo | "Negocio" (`public/admin.html:2205`) | `precio_negocio` | +35% (`--KQ`: +30%) | Seed `public/admin.html:4042-4052` | No encontrado |
| `persona_natural` | Nuevo | "Persona Natural" (`public/admin.html:2206`) | `precio_persona_natural` | +40% (`--KQ`: +30%) | Seed `public/admin.html:4053-4063` | No encontrado |
| `nuevos` | Nuevo | "Nuevos" (`public/admin.html:4066`) | `precio_nuevos` | +45% (`--KQ`: +30%) | Seed `public/admin.html:4064-4074` | No encontrado |
| `L1` | Legacy | "L1" (`public-crm/crm-clientes.html:177`) | `Precio_L1` (`public-crm/js/crm-ordenes.js:967`) | No aplica (precio absoluto migrado) | Hardcode en select y mapa de precios | **10** (valor almacenado: `1`) |
| `L4` | Legacy | "L4" (`public-crm/crm-clientes.html:178`) | `Precio_L4` (`public-crm/js/crm-ordenes.js:968`) | No aplica | Hardcode | **6** (valor: `4`) |
| `L7` | Legacy | "L7" (`public-crm/crm-clientes.html:179`) | `Precio_L7` (`public-crm/js/crm-ordenes.js:969`) | No aplica | Hardcode | **6** (valor: `7`) |
| `L8` | Legacy | "L8" (`public-crm/crm-clientes.html:180`) | `Precio_L8` (`public-crm/js/crm-ordenes.js:970`) | No aplica | Hardcode | **1** (valor: `8`) |
| `L9` | Legacy | "L9" (`public-crm/crm-clientes.html:181`) | `Precio_L9` (`public-crm/js/crm-ordenes.js:971`) | No aplica | Hardcode | **1.203** (valor: `9`) |
| `L10` | Legacy | "L10" (`public-crm/crm-clientes.html:182`) | `Precio_L10` (`public-crm/js/crm-ordenes.js:972`) | No aplica | Hardcode | **672** (valor: `10`) |
| *(personalizadas)* | Nuevo | Nombre libre del admin (`public/admin.html:1089`, `1101`) | `precio_<slug>` dinámico (`public/js/usuario.js:48-49`, `public/js/vendedor.js:600-602`) | Definido por el admin | Creadas en runtime `public/admin.html:4298-4307` | No encontrado |

Conteos sobre **1.898 clientes únicos por email** en `migration/100-clientes-migrados.csv` + `migration/batch-{200,400,700,800}-2026-03-15.csv` (los `batch-*` son instantáneas acumulativas; la suma bruta de filas es 2.152). **Ningún cliente tiene la lista vacía y ningún valor almacenado lleva el prefijo `L`.** No existen `Precio_L2`, `Precio_L3`, `Precio_L5` ni `Precio_L6` en ninguna parte del código.

---

## 3. Tabla 2 — Referencias por archivo (agrupada)

Una fila por archivo. El detalle sin agrupar está en `docs/auditoria-listas-precios.csv` (91 referencias).

| App | Archivo | Líneas | Campos o variables | Tipos de uso | Qué hace |
|---|---|---|---|---|---|
| b2b | `public/admin.html` | 1085-1145, 1470, 1519, 1925, 2203-2207, 2341, 2384, 2402, 2506, 2545, 2570, 2609, 2630, 2703, 3735-3736, 3749-3762, 3805-3807, 3986-3989, 4025-4026, 4029-4074, 4076-4105, 4107-4116, 4119-4131, 4136-4141, 4143-4176, 4225-4245, 4247-4320, 4329-4357, 4361-4455, 4411 | `listasPrecios`, `LISTAS_SISTEMA_SEED`, `configuracion/listas_precios`, `campo_firestore`, `incremento`, `iva`, `skus_excepcion`, `precio_lista`, `p_real`, `p_corriente`, `tipo_cliente`, `aprobarTipo`, `editarTipoCliente`, `nuevoTipoCliente`, `TIPO_TEXTOS` | lectura, escritura, UI, validación | Panel maestro del sistema nuevo: CRUD completo de listas en `configuracion/listas_precios`, seed autoreparador de las 4 listas de sistema, recálculo masivo de `campo_firestore` en todos los productos activos desde `precio_lista` en lotes de 500, y asignación de `tipo_cliente` al aprobar, crear y editar usuarios |
| b2b | `public/js/usuario.js` | 25, 36-53, 63-65, 94, 102, 114, 137, 216 | `usuarioState.tipoCliente`, `obtenerPrecioCliente()`, `getEtiquetaTipoCliente()`, `tipo_cliente`, `TIPOS_CLIENTE` | lectura, escritura, UI, validación | Resolución de precio del catálogo B2B: switch sobre `tipo_cliente` con búsqueda dinámica de `producto['precio_'+tipo]` y caída final a `precio_persona_natural`; default `persona_natural` al registrarse; la etiqueta visible está fija en `'P.Final'` |
| b2b | `public/js/user-manager.js` | 63-67, 185-198, 283-295, 403-405 | `TIPOS_CLIENTE`, `aprobarUsuario()`, `actualizarTipoCliente()`, `tipo_cliente` | escritura, validación, lectura | Escribe `tipo_cliente` al aprobar (default `PERSONA_NATURAL`) y al actualizar el tipo sin validar contra las listas configuradas; estadísticas por los 3 tipos |
| b2b | `public/js/auth.js` | 73-77, 308 | `TIPOS_CLIENTE`, `tipo_cliente` | validación, escritura | Segunda copia de las constantes de tipo + default `persona_natural` en el registro |
| b2b | `public/js/firebase-config.js` | 59-63 | `TIPOS_CLIENTE` | validación | Tercera copia de las mismas 3 constantes |
| b2b | `public/js/productos.js` | 304-309, 325, 674-676, 831-834 | `obtenerPrecioCliente`, `precio_lista` | lectura, UI | Ordena el catálogo por precio del cliente y muestra `precio_lista` como precio regular tachado para calcular el descuento |
| b2b | `public/js/ordenes.js` | 147, 425 | `precio_lista` | escritura | Persiste `precio_lista` en cada ítem de la orden |
| b2b | `public/js/vendedor.js` | 514, 586-619, 1270 | `lista_precios`, `lista_precio`, `tipo_cliente`, `Precio_L1…Precio_L10`, `precio_nuevos`, `p_real`, `p_corriente` | lectura, escritura, UI | Cascada completa de precio (tipo → campo dinámico → `Precio_Lx` → fallbacks) y creación de cliente B2B con `persona_natural` fijo |
| b2b | `public/js/ia/chatWidget.js` | 1151-1157 | `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_lista` | lectura | Determina precio solo para mayorista y negocio; cualquier otra lista cae a persona natural o `precio_lista` |
| b2b | `public/perfil.html` | 585-589, 626-627, 638, 666 | `TIPO_TEXTOS`, `tipo_cliente` | UI, validación | Badge del tipo de cliente y campos condicionados a mayorista/negocio |
| b2b | `public/admin-import-users.html` | 412, 416, 546, 614, 719, 728 | `lista_precios`, `tipo_cliente`, `VALID_TIPOS` | UI, validación, escritura | Import masivo de usuarios con lista blanca hardcodeada (sin `nuevos` ni personalizadas) y defaults `'Persona Natural'` / `lista_precios: ''` |
| b2b | `public/admin-update-tipocliente.html` | 603, 652, 667-681, 821-823, 926 | `validTipos`, `tipo_cliente`, `lista_precios`, `configuracion/listas_precios` | validación, lectura, escritura | Actualización masiva de `tipo_cliente` por NIT, validando contra los IDs de las listas activas leídas de la configuración |
| crm | `public-crm/crm-clientes.html` | 174-183, 186-198 | `inputListaPrecio`, `inputTipo` | UI | Select "Lista de Precios" con `L1,L4,L7,L8,L9,L10` hardcodeados y select "Tipo" que mezcla IDs de lista con categorías de negocio libres |
| crm | `public-crm/js/crm-clientes.js` | 92-114, 290-292, 380-381, 393-394, 426, 431-438 | `configuracion/listas_precios`, `lista_precios`, `lista_precio`, `tipo_cliente`, `inputTipo`, `inputListaPrecio` | lectura, escritura, UI | Inyecta las listas activas en `inputTipo`; guarda `lista_precios` sin control de rol y `tipo_cliente` solo si es admin (vendedor → `persona_natural`) |
| crm | `public-crm/js/crm-ordenes.js` | 877, 946-979 | `lista_precios`, `lista_precio`, `tipo_cliente`, `Precio_L1…Precio_L10`, `precio_nuevos` | lectura, UI | Resolución de precio en órdenes CRM, duplicado byte a byte de `public/js/vendedor.js:586-619` |
| crm | `public-crm/js/crm-reportes.js` | 153, 720 | `tipo_cliente` | lectura | Agrupa ventas por tipo de cliente |
| portal | `public-portal/index.html` | No encontrado | No encontrado | No encontrado | Landing estática sin referencias a listas de precios |
| migration | `migration/migrate.js` | 149, 187, 191, 280-281, 302-307 | `Lista_Precio`, `lista_precios`, `tipo_cliente`, `Precio_L1…Precio_L10` | escritura | Migración GAS → Firebase: escribe `lista_precios` con default `'L1'`, `tipo_cliente` con default `'Sin Clasificar'`, y carga los 6 precios por lista en cada producto |
| migration | `migration/sync-precios-tipo.js` | 27-34, 98-147 | `FACTOR_MAYORISTA`, `FACTOR_NEGOCIO`, `FACTOR_PERSONA_NATURAL`, `FACTOR_NUEVOS`, `FACTOR_EXCEPCION`, `SUFIJOS_EXCEPCION`, `precio_lista` | validación, escritura | Recalcula los 4 campos derivados desde `precio_lista` con factores 1.30/1.35/1.40/1.45 hardcodeados |
| migration | `migration/actualizar-precios-08-2026.js` | 34-40, 248-272, 312-328, 372-432 | `FACTOR_*`, `SUFIJOS_EXCEPCION`, `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_nuevos`, `precio_lista_firestore`, `configuracion/listas_precios` | validación, escritura, lectura | Actualización de precios ago-2026 desde archivo base; con `--update-config` sobrescribe el documento de configuración con su propio seed |
| migration | `migration/recrear-clientes-batch.js` | 57, 70, 143, 151 | `lista_precios`, `tipo_cliente`, `Lista_Precios` | lectura, escritura | Exporta y recrea clientes preservando `lista_precios` (default `''`) y `tipo_cliente` (default `'Persona Natural'`) |
| migration | `migration/recuperar-limbo.js` | 82, 90 | `tipo_cliente`, `lista_precios` | escritura | Recrea usuarios huérfanos con tipo `'Persona Natural'` y `lista_precios` vacía |
| migration | `migration/limpiar-100-migrados.js` | 33, 46 | `Lista_Precios`, `lista_precios` | lectura | Exporta la columna al CSV de respaldo |
| migration | `migration/fix-missing-productos.js` | 50, 101, 122 | `precio_lista` | escritura | `parseInt` del precio base al reponer productos faltantes |
| migration | `migration/sync-presentacion.js` | 103, 143-144 | `precio_lista` | escritura | Sincroniza `precio_lista` desde Sheets |
| migration | `migration/debug-precios.js` | 12, 25-37 | `precio_lista` | lectura | Audita productos activos sin `precio_lista` |
| migration | `migration/debug-precios2.js` | 13, 19-20 | `precio_lista`, `Precio_L1`, `Precio_L4` | lectura | Volcado de diagnóstico de precios |
| otro (reglas) | `firestore.rules` | 68-70, 74-77, 108, 111 | `productos/**`, `configuracion/**`, `tipo_cliente` | regla | Lectura pública de todos los precios de producto; config solo escribible por admin; `tipo_cliente` protegido frente al propio usuario y a vendedores — `lista_precios` no figura en la lista protegida |
| otro (GAS) | `SheetReader.gs` | 20, 128 | `PRECIO_LISTA` (columna G), `precio_lista` | lectura | Lee el precio base desde la hoja de cálculo |
| otro (GAS) | `Sincronizacion.gs` | 785, 852 | `precio_lista` | escritura | Sincroniza `precio_lista` hacia Firestore |
| otro (GAS) | `FirestoreAPI.gs` | 98 | `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_lista` | escritura | Campos incluidos en el payload de sincronización |
| otro (functions) | `functions-sync/agent/tools/crearOrden.js` | 33-39, 81 | `camposPrecio[tipoCliente]`, `precio_lista` | lectura | Mapa cerrado de 3 tipos con default `precio_persona_natural` y fallback `precio_lista` |
| otro (functions) | `functions-sync/agent/tools/consultarCatalogo.js` | 104-107, 178 | `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_lista` | lectura | Expone los 3 precios y `precio_lista` al agente IA |
| otro (functions) | `functions-sync/agent/tools/agregarCarrito.js` | 46-49 | `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_lista` | lectura | Guarda los 3 precios en el ítem del carrito |
| otro (functions) | `functions-sync/agent/tools/verificarStock.js` | 54-56 | `precio_mayorista`, `precio_negocio`, `precio_persona_natural` | lectura | Devuelve los 3 precios al consultar stock |
| otro (functions) | `functions-sync/agent/tools/consultarFichaTecnica.js` | 139 | `precio_negocio`, `precio_lista` | lectura | Muestra un precio único hardcodeado a la lista Negocio |

---

## 4. Tabla 3 — Asignación a clientes

| Mecanismo | Archivo:línea | Colección y campo en Firestore | Rol que puede hacerlo | Valor por defecto | Observaciones |
|---|---|---|---|---|---|
| Migración GAS → Firebase (lista) | `migration/migrate.js:191` | `usuarios.lista_precios` | Script con service account (sin reglas) | `'L1'` | Toma `Lista_Precio` de la hoja; los datos reales quedaron como `9`/`10`, no `L9`/`L10` |
| Migración GAS → Firebase (tipo) | `migration/migrate.js:187` | `usuarios.tipo_cliente` | Script con service account | `'Sin Clasificar'` | Valor que ninguna cascada de precios reconoce |
| Auto-registro B2B | `public/js/usuario.js:114`; `public/js/auth.js:308` | `usuarios.tipo_cliente` | Cualquier autenticado (reglas `firestore.rules:83-88`) | `persona_natural` | No escribe `lista_precios` |
| Aprobación de usuario | `public/admin.html:2402` → `public/js/user-manager.js:191` | `usuarios.tipo_cliente` | admin, gestor | `persona_natural` | El select se puebla con las listas activas (`public/admin.html:4119-4131`) |
| Creación de usuario (admin) | `public/admin.html:2630, 2703` | `usuarios.tipo_cliente` | admin, gestor | `persona_natural` (`public/admin.html:2609`) | No escribe `lista_precios` |
| Edición de usuario (admin) | `public/admin.html:2545, 2570` | `usuarios.tipo_cliente` | admin, gestor | Tipo actual del usuario | Permitido por `firestore.rules:109-110` |
| Formulario cliente CRM (lista) | `public-crm/js/crm-clientes.js:426` | `usuarios.lista_precios` | admin, gestor **y vendedor** | `''` (`public-crm/crm-clientes.html:176`) | No está en `camposSensibles` (`public-crm/js/crm-clientes.js:400`) ni protegido por reglas |
| Formulario cliente CRM (tipo) | `public-crm/js/crm-clientes.js:433` | `usuarios.tipo_cliente` | Solo admin (`public-crm/js/crm-clientes.js:432`) | `persona_natural` si lo crea un vendedor (`:437`) | Bloqueado en UI y en `firestore.rules:111` |
| Creación de cliente desde panel vendedor B2B | `public/js/vendedor.js:1270` | `usuarios.tipo_cliente` | vendedor | `persona_natural` fijo | No ofrece elegir lista |
| Import masivo de usuarios | `public/admin-import-users.html:719, 728` | `usuarios.tipo_cliente`, `usuarios.lista_precios` | admin, gestor | `'Persona Natural'` / `''` | El default con mayúsculas y espacio no coincide con ningún ID de lista |
| Actualización masiva por NIT | `public/admin-update-tipocliente.html:926` | `usuarios.tipo_cliente` | admin, gestor | Sin default (columna obligatoria) | Valida contra las listas activas (`public/admin-update-tipocliente.html:667-681`) |
| Re-creación de clientes (scripts) | `migration/recrear-clientes-batch.js:143, 151`; `migration/recuperar-limbo.js:82, 90` | `usuarios.tipo_cliente`, `usuarios.lista_precios` | Script con service account | `'Persona Natural'` / `''` | Preservan lo que ya había, incluidos valores inválidos |

### Flujo completo

El admin define las listas en `configuracion/listas_precios` (ID + `campo_firestore` + `incremento` + IVA + SKUs de excepción) y pulsa "Aplicar", que recalcula ese campo en todos los productos activos como `round(precio_lista × (1+inc/100) × (1+iva/100))`. A cada cliente se le asigna una lista escribiendo su **ID** en `usuarios.tipo_cliente` (aprobación, creación o edición en `admin.html`, o carga masiva por NIT). En el catálogo B2B, `obtenerPrecioCliente()` (`public/js/usuario.js:36-53`) lee `tipo_cliente` y devuelve `producto['precio_'+tipo]`, con `precio_persona_natural` como último recurso. En CRM y panel de vendedor la misma función (`public-crm/js/crm-ordenes.js:946-979`) añade un *fallback* al sistema legacy: si no hay precio por tipo, usa `usuarios.lista_precios` (`L1…L10`) contra `Precio_L1…Precio_L10`, y finalmente `p_real` / `Precio_L1` / `p_corriente`.

---

## 5. Inconsistencias por severidad

### Crítica

| # | Inconsistencia | Impacto en el negocio | Archivos afectados | Arreglo propuesto |
|---|---|---|---|---|
| C-1 | El *fallback* legacy nunca acierta: Firestore almacena `9`, `10`, `1`, `4`, `7`, `8` mientras el código solo reconoce las claves `'L1'…'L10'` | Los 1.898 clientes migrados cotizan siempre con el precio de persona natural (+40%), el más alto de las listas regulares, en CRM y panel de vendedor | `public/js/vendedor.js:604-615`, `public-crm/js/crm-ordenes.js:964-975`, `public-crm/crm-clientes.html:177-182`, `migration/migrate.js:191` | Normalizar el valor al leer (`String(v).replace(/^L/i,'')` → clave `'L'+n`) y lanzar un script de migración que unifique el formato en `usuarios.lista_precios` |
| C-2 | `tipo_cliente` contiene valores de régimen tributario que no mapean a ningún campo de precio: `Regimen Común` (345), `Regimen Simplificado` (82), `Persona Natural` con mayúsculas (368), `Gran Contribuyente` (3), `Profesional Independiente` (1), `Especial` (1), `Sin Clasificar` | Más de 430 clientes caen al `default` de la cascada y reciben tarifa de persona natural en lugar de la lista que les corresponde comercialmente | `migration/migrate.js:187`, `public/admin-import-users.html:719`, `migration/recrear-clientes-batch.js:143`, `migration/recuperar-limbo.js:82`, `public/js/usuario.js:44-49` | Separar el régimen tributario a un campo propio (`regimen_tributario`) y normalizar `tipo_cliente` a los IDs de `configuracion/listas_precios` con un script de reasignación |
| C-3 | `--update-config` reescribe `configuracion/listas_precios` con un seed propio en lugar de hacer *merge* | Borra silenciosamente todas las listas personalizadas creadas por el admin; los clientes asignados a ellas quedan sin campo de precio gestionado | `migration/actualizar-precios-08-2026.js:372-432`, `public/admin.html:4029-4074` | Cambiar el `set()` por un *merge* que preserve las listas con `sistema !== true`, o extraer el seed a un módulo compartido |

### Alta

| # | Inconsistencia | Impacto en el negocio | Archivos afectados | Arreglo propuesto |
|---|---|---|---|---|
| A-1 | `lista_precios` no figura en los `affectedKeys()` protegidos de las reglas | Un cliente puede cambiar su propia lista de precios y un vendedor la de cualquier cliente; hoy el impacto está contenido por C-1, pero el agujero se abre en el momento en que se corrija | `firestore.rules:108, 111`, `public-crm/js/crm-clientes.js:400, 426` | Añadir `'lista_precios'` a las dos listas `hasAny([...])` y al array `camposSensibles` del CRM |
| A-2 | `TIPOS_CLIENTE` está triplicado con solo 3 valores, pero el seed define 4 (`nuevos`) y permite personalizadas | La lista `nuevos` es rechazada como tipo inválido al editar perfil y al importar usuarios, y aparece sin etiqueta legible en los badges | `public/js/firebase-config.js:59-63`, `public/js/user-manager.js:63-67`, `public/js/auth.js:73-77`, `public/js/usuario.js:137`, `public/admin-import-users.html:546`, `public/admin.html:2203-2207`, `public/perfil.html:585-589` | Eliminar las 3 copias y derivar tipos y etiquetas en runtime desde `configuracion/listas_precios` |
| A-3 | El agente IA y el chat widget tienen un mapa cerrado de 3 tipos y no consultan la configuración de listas | Las órdenes creadas por el agente y los productos añadidos al carrito desde el chat cobran precio de persona natural a clientes `nuevos` o con lista personalizada | `functions-sync/agent/tools/crearOrden.js:35-39`, `functions-sync/agent/tools/consultarFichaTecnica.js:139`, `public/js/ia/chatWidget.js:1151-1157` | Resolver `campo_firestore` leyendo `configuracion/listas_precios` por el ID de `tipo_cliente`, con `precio_persona_natural` solo como último recurso |
| A-4 | `productos` permite `read: if true`, exponiendo todos los campos de precio sin autenticación | Cualquier visitante o competidor puede descargar la estructura completa de precios mayorista, negocio y legacy `Precio_Lx` | `firestore.rules:68-70` | Restringir la lectura a `isAuthenticated()` o servir el catálogo público a través de una Cloud Function que filtre campos de precio |
| A-5 | Borrar una lista la quita del array de configuración pero deja el `campo_firestore` escrito en todos los productos, sin validar si hay clientes asignados | Clientes siguen cotizando contra un campo huérfano que ningún proceso vuelve a recalcular: los precios se congelan en el último valor aplicado | `public/admin.html:4329-4357` | Bloquear el borrado si existen usuarios con ese `tipo_cliente` y ofrecer reasignación previa + limpieza del campo en productos |

### Media

| # | Inconsistencia | Impacto en el negocio | Archivos afectados | Arreglo propuesto |
|---|---|---|---|---|
| M-1 | Tres nombres para el mismo concepto: `lista_precios` (canónico según `CLAUDE.md:81`), `lista_precio` (leído defensivamente en 6 puntos) y `tipo_cliente` como ID de lista real; en los CSV `Lista_Precios` y en la hoja GAS `Lista_Precio` | Cada lectura necesita un `||` encadenado; cualquier escritura nueva puede caer en el alias equivocado y quedar invisible | `public/js/vendedor.js:514, 604`, `public-crm/js/crm-ordenes.js:877, 964`, `public-crm/js/crm-clientes.js:292, 380`, `migration/migrate.js:149` | Migrar `lista_precio` → `lista_precios` con un script único y eliminar los alias del código |
| M-2 | Los factores 1.30 / 1.35 / 1.40 / 1.45 y la excepción `--KQ` están hardcodeados en tres lugares independientes | Un cambio de política de precios aplicado en un solo sitio produce precios divergentes según el camino que se ejecute | `public/admin.html:4034, 4045, 4056, 4067`, `migration/sync-precios-tipo.js:27-34`, `migration/actualizar-precios-08-2026.js:34-40` | Que los scripts lean los factores de `configuracion/listas_precios` en vez de declararlos, dejando el doc como única fuente de verdad |
| M-3 | El select de `lista_precios` del CRM es estático: las listas personalizadas que crea el admin no aparecen nunca, y la lista blanca del import tampoco las contempla | El gestor no puede asignar por UI las listas que el propio sistema le permite crear | `public-crm/crm-clientes.html:174-183`, `public/admin-import-users.html:546` | Poblar el select desde `configuracion/listas_precios` igual que ya se hace con `inputTipo` (`public-crm/js/crm-clientes.js:92-114`) |
| M-4 | El select `inputTipo` del CRM mezcla IDs de lista (`mayorista`, `negocio`, `persona_natural`) con categorías de negocio sin lista asociada (`Ferretería`, `Constructora`, `Distribuidor`, `Otro`) | Elegir "Ferretería" escribe un `tipo_cliente` que no resuelve a ningún precio: el cliente queda cotizando a persona natural sin aviso | `public-crm/crm-clientes.html:186-198`, `public-crm/js/crm-clientes.js:433` | Separar "categoría de negocio" en un campo distinto y dejar `inputTipo` solo con los IDs de listas activas |

### Baja

| # | Inconsistencia | Impacto en el negocio | Archivos afectados | Arreglo propuesto |
|---|---|---|---|---|
| B-1 | Huecos en la numeración legacy: existen `L1`, `L4`, `L7`, `L8`, `L9`, `L10` pero no `L2`, `L3`, `L5` ni `L6` | Confusión al interpretar los datos migrados y riesgo de asumir una numeración continua en futuros scripts | `migration/migrate.js:302-307`, `public-crm/crm-clientes.html:177-182`, `public-crm/js/crm-ordenes.js:967-972` | Documentar la correspondencia de cada `Lx` con su lista comercial, o retirar el sistema legacy tras resolver C-1 |
| B-2 | `getEtiquetaTipoCliente()` devuelve `'P.Final'` fijo, sin importar la lista real del cliente | Un cliente mayorista ve la etiqueta de consumidor final en el catálogo, aunque el precio sea el correcto | `public/js/usuario.js:63-65` | Devolver el `nombre` de la lista correspondiente leído de `configuracion/listas_precios` |
