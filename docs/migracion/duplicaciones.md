# Migración a Next.js — Iteración 0: Duplicaciones

Código repetido en la app actual. En Next.js (un solo proyecto, módulos compartidos) cada
fila debería quedar en **un único lugar**. Las duplicaciones con divergencias son las más
importantes: hoy la misma regla da resultados distintos según la pantalla.

Medición de similitud: líneas idénticas entre archivos paralelos (`difflib`), commit `2656905`.

## 1. Archivos copiados entre B2B y CRM

| Archivo B2B | Archivo CRM | Líneas | Iguales | Diferencias que importan |
|---|---|---|---|---|
| `public/js/vendedor.js` | `public-crm/js/crm-ordenes.js` | 1.319 / 1.565 | 72 % | Mismo flujo de órdenes (listar, crear, editar, papelera, estados). El CRM añade chat y avisos |
| `public/js/crm-utils.js` | `public-crm/js/crm-utils.js` | 403 / 466 | 92 % | **Transiciones de estado distintas** (B2B tiene `aprobada`/`en_espera`; CRM tiene reversiones). B2B tiene `formatearPeso` |
| `public/css/crm-styles.css` | `public-crm/css/crm-styles.css` | 1.296 / 1.517 | 81 % | Cabecera: `z-index` 1200 vs 100, borde rojo distinto, sombras; reglas de modales solo en B2B |
| `public/js/firebase-config.js` | `public-crm/js/firebase-config.js` | 169 / 87 | 66 % | Listas de precios solo en el B2B |
| `public/vendedor.html` | `public-crm/crm-ordenes.html` | 487 / 273 | 55 % | Mismos modales de orden con marcado distinto |
| `js/modal-cierre.js`, `js/estados-orden.js` | (misma copia) | — | 100 % | Copias intencionales hasta la migración; mantener idénticas |

## 2. Lógica de negocio repetida (con divergencias ⚠)

| Lógica | Dónde está | Divergencia | Unificar en |
|---|---|---|---|
| Precio por cliente (RN-13) | `usuario.js`, `vendedor.js`, `crm-ordenes.js`, `functions-sync/agent/precios.js` (+ uso en `productos.js`, `carrito.js`, `mis-ordenes.html`) | ⚠ Tres reglas distintas para precio faltante | `lib/precios.ts`, compartido por cliente, servidor y agente |
| Totales e IVA (RN-12) | `ordenes.js` (2 sitios), `vendedor.js`, `crm-ordenes.js`, `mis-ordenes.html`, `despacho.js`, agente (`desglosarTotal`), `generarCSV` | Igual fórmula, repetida 8+ veces | `lib/totales.ts` |
| Número de orden (RN-25) | `ordenes.js` (`OC-…`), `crm-utils.js` ×2 (`ORD-AAMMDD-…`), agente (`ORD-AAAA-nnnnn`) | ⚠ Tres formatos; el aleatorio puede repetirse | Generador único en el servidor (consecutivo) |
| Transiciones de estado (RN-30) | `crm-utils.js` ×2 | ⚠ Tablas distintas | `lib/estados.ts` (junto a la tabla de etiquetas) |
| Ordenar ítems por cargue | `vendedor.js`, `crm-ordenes.js`, `crm-despachos.js` | Igual | `lib/ordenes.ts` |
| Nombre / NIT del cliente de una orden | `vendedor.js`, `crm-ordenes.js` | Igual (órdenes B2B vs CRM tienen forma distinta) | Normalizar el modelo de orden (ver §4) |
| CSV de orden | `vendedor.js`, `crm-ordenes.js`, `crm-despachos.js` (cliente) y `generarCSV` (Function) | Cuatro generadores | Solo el de servidor |
| Puede modificar orden (RN-22) | `vendedor.js`, `crm-ordenes.js` (+ reglas) | Igual, pero el criterio de admin varía (`esAdmin` incluye o no gestor/líder) | `lib/permisos.ts` + reglas |
| Vendedor externo (RN-21) | `vendedor.js`, `crm-ordenes.js`, `crm-clientes.js`, `crm-reportes.js`, `admin.html` | Igual, repetida 5 veces | `lib/permisos.ts` |
| Chat de órdenes | `crm-ordenes.js`, `crm-despachos.js`, `despacho.js` (B2B) | Listeners y render distintos; el del CRM no escapa HTML | Un componente de chat |
| Detección de admin | `auth.js`/`user-manager.js` (`ADMIN_EMAILS`), cada página CRM (`ADMIN_EMAIL` + rol), reglas | ⚠ Listas de correos distintas | Solo `rol` (+ custom claims) |

## 3. Infraestructura repetida

| Qué | Repeticiones | En Next.js |
|---|---|---|
| `initializeApp(...)` con la config en línea | 19 archivos (cada módulo CRM, `vendedor.js`, `ordenes.js`, `auth.js`, utilidades…) | Un único `lib/firebase.ts` |
| Chequeo de sesión y rol al cargar la página | Cada página B2B y cada módulo CRM | Middleware / layout por rol |
| `cerrarModal` y cierre con fondo/Esc | 12 archivos (ya centralizado en `modal-cierre.js`, quedan los `cerrarModal` locales) | Un componente `Modal` |
| `formatearPrecio` | `utils.js`, `ordenes.js`, `crm-utils.js` ×2 | `lib/formato.ts` |
| `formatearFecha` | `crm-utils.js` ×2, `admin.html`, `mis-ordenes.html` | `lib/formato.ts` |
| Escape de HTML | Solo `despacho.js` y una utilidad; el resto no escapa | Innecesario con React (no usar `dangerouslySetInnerHTML`) |
| Estilos de cabecera, tablas, filtros, badges | `styles.css`, dos `crm-styles.css`, `<style>` de cada página (admin ~700 líneas) | Un sistema de diseño |

## 4. Modelo de datos duplicado

| Dato | Formas actuales | Propuesta |
|---|---|---|
| Ítems de la orden | `items[]` y copia `productos[]` (el CRM escribe ambos) | Solo `items[]` |
| Cliente de la orden | B2B: `cliente{…}` + `user_id`; CRM: `clienteNombre`, `clienteNit` + `user_id` | Un objeto `cliente` común |
| Producto del ítem | `cod_interno`/`titulo` (B2B, CRM) o `sku`/`nombre` (migradas) | `cod_interno`/`titulo` (migrar las viejas) |
| Fechas | Texto ISO y `Timestamp` mezclados (`created_at`, `updated_at`, `sync_at`) | Un solo tipo |
| Precios del producto | `precio_<lista>`, `p_real`, `p_corriente`, `precio_lista`, y heredados `Precio_Lx` | Listas + `precio_lista`; decidir qué son `p_real`/`p_corriente` |

## 5. Código muerto o de un solo uso (no migrar)

- `public/js/admin.js`: ninguna página lo carga.
- Páginas utilitarias publicadas: `create-test-users.html`, `fix-user.html`,
  `admin-import-users.html`, `admin-update-tipocliente.html` → scripts de administración.
- Colección `despachos`: regla definida, sin uso.
- Estados `aprobada` y `en_espera`: definidos, sin datos (pendiente de RN-30).
- Scripts `migration/debug-*.js` y `fix-*.js` ya ejecutados: históricos.
