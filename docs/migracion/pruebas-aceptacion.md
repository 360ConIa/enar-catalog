# Migración a Next.js — Iteración 0: Pruebas de aceptación

Lo que la versión Next.js debe cumplir para reemplazar a la actual. Cada prueba remite a una
regla de [reglas-negocio.md](reglas-negocio.md). Se ejecutan contra **`enar-staging`** con datos
de prueba, nunca contra producción.

Tipos de verificación:
- **R** — reglas de Firestore con la API de prueba de reglas (`firebaserules.googleapis.com …:test`)
  o el emulador. Las baterías actuales están en `tests/reglas/probar_reglas.py` y pasan contra
  producción: 127 casos (visibilidad 9, despacho 11, vendedor externo 22, chat 13,
  cotizaciones 18, mensajería 33, estados 21). Ejecutar: `python3 tests/reglas/probar_reglas.py`.
- **E** — extremo a extremo en navegador (Playwright), con usuarios de prueba por rol.
- **U** — prueba unitaria de una función pura (precio, totales, estados).

Usuarios de prueba en staging: `admin`, `gestor`, `vendedor-interno`, `vendedor-externo`,
`despachos`, `cliente-a` (asignado a vendedor-interno), `cliente-b`, `pendiente` (sin aprobar).

## PA-1 Acceso y usuarios

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-1.1 | Un usuario `pendiente` inicia sesión → no puede crear órdenes; ve aviso de aprobación pendiente | 04 | E, R |
| PA-1.2 | Admin aprueba a `pendiente` con lista `negocio` → queda `aprobado`, `tipo_cliente: negocio`, y ve precios de negocio | 04, 10 | E |
| PA-1.3 | Un cliente intenta cambiar su `rol`, `tipo_cliente` o `estado` → denegado | 05 | R |
| PA-1.4 | Un vendedor intenta cambiar `rol`, `comercial_lider` o `vendedor_externo` de alguien → denegado; editar teléfono de un cliente → permitido | 05, 06 | R |
| PA-1.5 | Admin cambia la contraseña de otro usuario (8+ caracteres) → el usuario entra con la nueva, su sesión anterior se cierra y queda registro en `auditoria_usuarios` | 07 | E |
| PA-1.6 | Un no-admin llama a `cambiarPasswordUsuario` → `permission-denied` | 07 | U/E |
| PA-1.7 | Cada pantalla rechaza al rol que no le corresponde (p. ej. cliente en panel vendedor, vendedor en despachos) | 01 | E |

## PA-2 Precios y totales

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-2.1 | Producto con `precio_lista` 100.000, lista con incremento 10 % e IVA 19 % → precio de lista = 130.900 | 11 | U |
| PA-2.2 | Producto cuyo `cod_interno` termina en un sufijo de `skus_excepcion` → usa `incremento_excepcion` | 11 | U |
| PA-2.3 | Cliente de cada lista (mayorista, negocio, persona_natural, nuevos, personalizada) ve y paga su `precio_<lista>` en catálogo, panel vendedor, CRM y agente IA: **el mismo valor en los cuatro** | 10, 13 | U, E |
| PA-2.4 | Orden de 2 × 119.000 → total 238.000, subtotal 200.000, IVA 38.000 (extraídos, no sumados) | 12 | U |
| PA-2.5 | `precio_lista` nunca aparece en la interfaz ni en respuestas del agente | 11, 50 | E |
| PA-2.6 | Producto sin precio en la lista del cliente → comportamiento único según la decisión RN-13 | 13 | U, E |

## PA-3 Órdenes: crear, ver, modificar

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-3.1 | `cliente-a` crea una orden desde el carrito → `user_id` = su uid, estado `pendiente`, totales según PA-2.4 | 20, 12 | E |
| PA-3.2 | `vendedor-interno` crea una orden para `cliente-b` → `creadaPor` = su uid | 20 | E, R |
| PA-3.3 | `vendedor-interno` ve todas las órdenes; con "Mis órdenes" solo las suyas y las de `cliente-a` | 21, 23 | E, R |
| PA-3.4 | `vendedor-externo` ve solo las que creó; no ve la de su cliente asignado creada por otro; no aparece el filtro "Todas / Mis órdenes"; sus pantallas (órdenes, reportes, ficha de cliente) cargan sin error | 21 | E, R |
| PA-3.5 | `cliente-a` no ve órdenes de `cliente-b` | 21 | R |
| PA-3.6 | `vendedor-interno` abre una orden ajena → solo lectura (sin cambiar estado, editar ni papelera), y la regla lo deniega aunque se llame directo | 22 | E, R |
| PA-3.7 | Vendedor cambia el estado de una orden de su cliente asignado → permitido | 22 | R |
| PA-3.8 | `cliente-a` edita su orden `pendiente` (cantidades, agrega y quita productos) → totales recalculados, entrada en `historial`; en otro estado no puede editar | 26 | E, R |
| PA-3.9 | Enviar a papelera → `eliminado: true`, desaparece de las listas, el documento sigue existiendo; borrar definitivo solo admin | 24 | E, R |
| PA-3.10 | Dos órdenes creadas el mismo día nunca comparten `numero_orden` | 25 | U |

## PA-4 Estados y despacho

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-4.1 | Desde cada estado solo se ofrecen las transiciones de RN-30; una transición no permitida se rechaza; un estado o subestado fuera de la tabla (p. ej. `en_proceso`, `terminada`) lo rechaza firestore.rules | 30 | U, E, R |
| PA-4.1b | Cerrar una orden con un ítem sin stock → `cerrada` + `parcial`; todo completo → `completa`; regresarla a alistamiento quita el subestado | 30, 31 | U, E |
| PA-4.2 | Gestor regresa una orden `alistamiento → aprobada` sin motivo → rechazado; con motivo → hecho y queda en `historial`; un vendedor no ve la opción | 31 | E |
| PA-4.3 | Mismo estado se ve idéntico (texto, ícono, colores) en etiquetas, menús, filtros y desplegables de admin, vendedor, mis-ordenes, crm-ordenes, despachos, dashboard, reportes y clientes; una cerrada muestra Completa o Parcial al lado | 32 | E (captura) |
| PA-4.4 | Despachos marca en el alistamiento, con ítems en orden de cargue distinto al guardado: cada `cantidad_real` queda en el producto correcto | 33 | E |
| PA-4.5 | Orden con un ítem 12 → 10 y otro 3 → 0 (sin stock): el detalle muestra pedida/despachada resaltadas y total recalculado (caso real: ORD-261024-88956, total pedido 1.003.194 → despachado 785.782) | 34 | U, E |
| PA-4.6 | El cliente ve las cantidades despachadas pero **no** los mensajes internos ni las notas del historial | 34, 35, 36 | E, R |
| PA-4.7 | `vendedor-externo` lee y escribe mensajes solo de sus órdenes; personal interno, de todas; cliente, de ninguna. Nadie escribe a nombre de otro ni edita mensajes | 35 | R |
| PA-4.8 | CSV de despacho: precio sin IVA por línea y totales coherentes con RN-12 | 37 | U |
| PA-4.9 | Despachos escribe en una orden: a `vendedor-interno` y `gestor` les aparece el contador (cabecera, orden y filtro) sin recargar; el autor no lo ve; al abrir el chat se limpia solo para quien lo abrió | 38 | E, U |
| PA-4.10 | `vendedor-interno` responde desde el detalle de orden del B2B; el mensaje aparece en el CRM en vivo | 35 | E |
| PA-4.11 | Un usuario no puede cambiar el `chat_lecturas` de otro | 38 | R |

## PA-5 Catálogo, imágenes y agente

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-5.1 | Todos los productos activos con imagen muestran WebP de Storage (URL permanente, responde 200 `image/webp`); sin imagen → placeholder | 40, 41 | E |
| PA-5.2 | Ningún producto usa una imagen de `imagenes-prohibidas.json` | 40 | U |
| PA-5.3 | Productos inactivos no aparecen ni se pueden pedir | 42 | E |
| PA-5.4 | El agente cotiza a un cliente `nuevos` con `precio_nuevos` y el total coincide con PA-2.3 | 50 | E |

## PA-6 Seguridad e interfaz

| ID | Dado / Cuando / Entonces | RN | Tipo |
|---|---|---|---|
| PA-6.1 | Un usuario no admin no puede escribir productos ni configuración | 60, 61 | R |
| PA-6.2 | Un usuario no puede leer ni escribir el carrito de otro | 62 | R |
| PA-6.3 | Cliente no lee `metricas_clientes` | 63 | R |
| PA-6.4 | Texto con `<script>` o HTML en nombres, observaciones o mensajes se muestra como texto | — | E |
| PA-6.5 | Modales: título visible bajo la cabecera en 1366×768 y 390×844; cierre con fondo/Esc; confirmación si hay cambios sin guardar | 70, 71 | E |
| PA-6.6 | El endpoint de sincronización de productos rechaza llamadas sin credencial | 14 | E |
| PA-6.7 | Un cliente solo lee y crea sus cotizaciones; no puede sobrescribir una ajena | 65 | R |

## Criterio de salida de cada iteración
Pasan todas las pruebas R y U de las reglas tocadas, y las E de las pantallas migradas, en
staging; ninguna regla marcada ⚠ se implementa sin la decisión del dueño.
