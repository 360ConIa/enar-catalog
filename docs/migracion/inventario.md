# Migración a Next.js — Iteración 0: Inventario

Estado de la app actual al 2026-10-25 (commit de referencia: `2656905`). Este documento
describe **lo que existe**; las reglas que la migración debe conservar están en
[reglas-negocio.md](reglas-negocio.md), las pruebas que la nueva app debe pasar en
[pruebas-aceptacion.md](pruebas-aceptacion.md) y el código repetido que conviene
unificar en [duplicaciones.md](duplicaciones.md).

## 1. Proyectos Firebase

| Proyecto | Uso | Alias en `.firebaserc` |
|---|---|---|
| `enar-b2b` | Producción: las 3 apps, Firestore, Auth, Storage, Functions | `default` |
| `enar-staging` | Pruebas de la migración (Firestore, Auth email/contraseña, Storage, Blaze) | `staging` |

`staging` no tiene targets de hosting a propósito: un `firebase deploy --only hosting:… -P staging`
falla en vez de publicar. Todavía no se ha desplegado nada a staging.

## 2. Apps (Firebase Hosting, proyecto `enar-b2b`)

| App | URL | Directorio | Target |
|---|---|---|---|
| Pedidos B2B | https://enar-b2b.web.app | `public/` | `hosting:b2b` |
| Gestión Comercial (CRM) | https://enar-comercial.web.app | `public-crm/` | `hosting:crm` |
| Portal ENAR Digital | https://enar-digital.web.app | `public-portal/` | `hosting:portal` |

Stack actual: HTML + JS sin framework, módulos ES con Firebase JS SDK 10.7.1 desde CDN,
Bootstrap 5.3.2 y Bootstrap Icons 1.11.1 desde CDN, Chart.js en el CRM. Sin build ni tests
automatizados. Caché de hosting: `max-age=3600` para `.js` y `.css`.

### 2.1 Pedidos B2B (`public/`, ~13.500 líneas HTML + ~8.800 JS)

| Página | Líneas | Quién entra | Qué hace |
|---|---|---|---|
| `index.html` | 937 | Público / cliente | Catálogo, carrito, cotización, encargo de color, ficha técnica, chat IA |
| `login.html` | 497 | Público | Inicio de sesión y recuperar contraseña |
| `registro.html` | 670 | Público | Auto-registro (queda `pendiente`) |
| `perfil.html` | 784 | Usuario | Datos propios, sedes |
| `orden.html` | 724 | Cliente | Confirmar pedido desde el carrito |
| `orden-confirmacion.html` | 532 | Cliente | Resumen del pedido creado |
| `mis-ordenes.html` | 1.245 | Cliente | Sus órdenes, detalle con lo despachado, edición si está `pendiente` |
| `vendedor.html` | 487 | Vendedor, admin | Panel de órdenes, crear/editar orden para un cliente, clientes B2B |
| `admin.html` | 4.711 | Admin, gestor, vendedor | Monolito: usuarios, aprobaciones, sedes, órdenes, productos, listas de precios, contraseñas |
| `portal.html` | 505 | Personal | "Portal de Aplicaciones": accesos a B2B y CRM |
| `404.html` | 33 | Público | Error |
| `admin-import-users.html` | 891 | Admin | **Utilidad**: importación masiva de usuarios |
| `admin-update-tipocliente.html` | 1.063 | Admin | **Utilidad**: cambio masivo de `tipo_cliente` |
| `create-test-users.html` | 215 | — | **Utilidad de prueba** publicada en producción |
| `fix-user.html` | 196 | — | **Utilidad de reparación** publicada en producción |

Módulos JS principales (`public/js/`): `productos.js` (1.737, catálogo), `vendedor.js` (1.319),
`ia/chatWidget.js` (1.218), `ordenes.js` (887), `auth.js` (546), `carrito.js` (483),
`user-manager.js` (469), `crm-utils.js` (403), `cotizacion.js` (371), `usuario.js` (228, precio
por cliente), `firebase-config.js` (169, listas de precios), `despacho.js` (120), y los
compartidos recientes `modal-cierre.js`, `estados-orden.js`, `cabecera-fija.js`.
`admin.js` (315) **no lo carga ninguna página** (código muerto).

### 2.2 CRM (`public-crm/`, ~7.000 líneas)

| Módulo | HTML / JS | Quién entra | Qué hace |
|---|---|---|---|
| Portal / login | `index.html` (546) | Personal | Auth gate y menú |
| Dashboard | `crm-dashboard` (150 / 294) | Admin, gestor, vendedor | KPIs, ventas, distribución de estados, clientes en riesgo |
| Clientes | `crm-clientes` (230 / 481) | Admin, gestor, vendedor | Ficha, métricas, últimas órdenes |
| Órdenes | `crm-ordenes` (273 / 1.565) | Admin, gestor, vendedor | Igual que el panel vendedor del B2B + chat por orden |
| Despachos | `crm-despachos` (126 / 1.452) | Admin, gestor, despachos | Alistamiento por ítem, cantidades despachadas, chat, CSV |
| Reportes | `crm-reportes` (225 / 856) | Admin, gestor, vendedor | Ventas, productos, vendedores, comisiones |

### 2.3 Portal ENAR Digital (`public-portal/`)
Landing estática (`index.html`, 206 líneas), sin auth ni datos.

## 3. Firestore (`enar-b2b`)

| Colección | Contenido | Lo usan |
|---|---|---|
| `usuarios/{uid}` | Perfil, `rol`, `estado`, `tipo_cliente` (lista de precios), `vendedor_asignado`, `vendedor_externo`, `comercial_lider`, `chat_lecturas` | Todo |
| `usuarios/{uid}/sedes` | Sedes de entrega del cliente | Perfil, admin, órdenes |
| `productos` | Catálogo: `cod_interno`, `precio_lista`, `precio_<lista>`, `p_real`, `p_corriente`, `imagen_principal`, `imagen_miniatura`, `Orden_Cargue`, `activo` | Todo, sync, agente IA |
| `configuracion/listas_precios` | Listas: `id`, `campo_firestore`, `incremento`, `iva`, `skus_excepcion`, `incremento_excepcion`, `activa` | Precios |
| `configuracion/comisiones` | Comisiones de vendedores | Reportes |
| `ordenes` | Pedido: `items[]` (+ copia `productos[]`), `estado`, `historial[]`, `user_id`, `creadaPor`, totales, `cantidad_real` por ítem | B2B, CRM, agente |
| `chat_ordenes` | Mensajes internos por orden (`orden_id`) | CRM, detalle B2B (solo personal) |
| `carrito/{uid}` | Carrito B2B | Catálogo |
| `cotizaciones` | Cotizaciones (legacy + agente IA) | Catálogo, agente |
| `metricas_clientes/{uid}` | Salud, ABC, riesgo, tendencia | CRM (Functions la recalcula) |
| `auditoria_usuarios` | Cambios de contraseña y de rol | Solo Admin SDK |
| `notificaciones`, `fichas_tecnicas` | Usadas por Functions | Functions |
| `despachos` | Regla definida; sin uso en el front actual | — |

Volumen aprox.: ~2.000 usuarios, ~400 órdenes (5 estados en uso: terminada 366, pendiente 15,
cancelada 9, en_proceso 8, alistamiento 2), 367 productos activos (316 con imagen).

Índices compuestos (`firestore.indexes.json`): `ordenes` (user_id, created_at↓),
(creadaPor, created_at↓), (estado, created_at↓); `usuarios` (creado_por, created_at↓),
(estado, nombre); `chat_ordenes` (orden_id, created_at↑); `metricas_clientes`
(estado_salud, dias_sin_compra↓), (clasificacion_abc, total_compras_anio↓).

## 4. Storage (`enar-b2b.firebasestorage.app`)
`productos/<slug>.webp` (1200 px) y `productos/miniaturas/<slug>.webp` (300 px), lectura
pública y URLs permanentes; `fichas/` (fichas técnicas). Fuente local: `imagenes-originales/`
(fuera de git), manifiesto en `imagenes-web/manifest.json`.

## 5. Cloud Functions (`functions-sync/`, codebase `enar-sync`, Node 22)

| Función | Tipo | Qué hace |
|---|---|---|
| `syncProductos` | HTTP público, CORS abierto | Recibe productos de GAS (`TriggerFunction.gs`) y hace `merge` de `titulo`, `cantidad`, `p_real`, `p_corriente`, `impuesto`, `ean`, `marca`, `imagen_principal`… **Sin autenticación** (ver §8) |
| `chatAgent` | Callable | Agente IA del catálogo (Gemini `gemini-2.5-flash`, `@google/generative-ai`); herramientas en `agent/tools/` (catálogo, ficha técnica, stock, carrito, cotización, orden) con precios de `agent/precios.js` |
| `recalcularMetricas` | Callable (CRM) | Métricas de clientes |
| `recalcularMetricasDiario` | Programada 04:00 Bogotá | Igual, diaria |
| `generarCSV` | Callable (CRM) | CSV de una orden |
| `enviarNotificacion` | Callable (CRM) | Notificaciones |
| `cambiarPasswordUsuario` | Callable (admin) | Contraseña de otro usuario; cuenta de servicio `enar-auth-admin` |

## 6. Otras piezas
- **Google Apps Script** (`*.gs` en la raíz: Config, FirestoreAPI, ImageSync, SheetReader,
  Sincronizacion, TriggerFunction, Utils): sincronización Sheets → Firestore. No se ejecuta clasp
  desde aquí.
- **Scripts de migración/mantenimiento** (`migration/`): asignación de imágenes, precios por lista,
  limpiezas y diagnósticos (Admin SDK con ADC).
- **Reglas**: `firestore.rules` y `storage.rules` (ver resumen en reglas-negocio.md §7).
- **Skills del proyecto** (`.claude/skills/`): retomar, cierre, deploy, verificar-precios,
  consulta-firestore.

## 7. Integraciones externas
Google Sheets (catálogo fuente vía GAS), Google Drive (ya no: imágenes migradas a Storage),
Gemini (agente `chatAgent`), Chart.js y CDNs (jsDelivr, gstatic).

## 8. Riesgos detectados durante el inventario (no corregidos)

| Riesgo | Detalle | Qué hacer en la migración |
|---|---|---|
| `syncProductos` sin autenticación | Endpoint HTTP público (`https://syncproductos-3ylre3k6ka-uc.a.run.app`, escrito en `TriggerFunction.gs`). Cualquiera puede sobrescribir títulos, existencias, `p_real`/`p_corriente` e `imagen_principal` de cualquier producto | Exigir un secreto compartido (header) o cambiar a Callable/cuenta de servicio. Corregirlo también en producción, no esperar a la migración |
| `cotizaciones` abierta | Regla `read, write: if isAuthenticated()`: cualquier usuario lee y modifica cotizaciones de otros | Restringir a dueño + personal |
| `ventas@enar.com.co` es gestor por correo | `isUserManager()` acepta ese correo aunque su `rol` es `vendedor`: puede editar cualquier usuario, incluido `rol` | Decidir si se mantiene; pasar a rol explícito |
| Utilidades en producción | `create-test-users.html`, `fix-user.html`, `admin-import-users.html`, `admin-update-tipocliente.html` se publican en el hosting B2B | Moverlas a scripts o a una ruta solo-admin |
| HTML sin escapar | Muchas vistas arman `innerHTML` con datos de Firestore sin escapar (p. ej. mensajes del chat en el CRM) | React escapa por defecto; no usar `dangerouslySetInnerHTML` con datos |
| Campos heredados | `laboratorio`, `indicacion`, `principio_activo` en productos (plantilla de farmacia); `Precio_Lx`, `lista_precios` en usuarios | No migrarlos a los tipos nuevos |
