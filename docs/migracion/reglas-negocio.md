# Migración a Next.js — Iteración 0: Reglas de negocio

Reglas que la app actual aplica y que la versión Next.js **debe conservar** (o cambiar solo
por decisión explícita). Cada regla tiene un identificador (`RN-xx`) que usan
[pruebas-aceptacion.md](pruebas-aceptacion.md). Donde hoy hay comportamientos distintos
entre B2B, CRM y agente IA se marca **⚠ Decidir**: la migración no debe elegir sola.

Fuente: código al commit `2656905` (2026-10-25) y decisiones del dueño registradas en el
historial del proyecto.

## 1. Usuarios, roles y acceso

- **RN-01 Roles.** `admin`, `gestor`, `vendedor`, `despachos`, `cliente`. Se guardan en
  `usuarios.rol`. Además hay dos marcas: `comercial_lider` (vendedor con visibilidad y edición
  total de órdenes) y `vendedor_externo` (vendedor restringido, RN-21).
- **RN-02 Admin.** Es admin quien tiene `rol: admin`, o el correo `sebastianbumq@enarapp.com`
  (fijo en reglas). El panel B2B además reconoce `arnulfobuitragoenar@gmail.com`, que desde
  2026-10-24 también tiene `rol: admin`. ⚠ Decidir: dejar solo el rol como fuente de verdad.
- **RN-03 Gestor.** `rol: gestor` o el correo `ventas@enar.com.co` (Henry, cuyo rol es
  `vendedor`). El gestor administra usuarios, productos y órdenes. ⚠ Decidir si el correo sigue
  dando permisos de gestor.
- **RN-04 Registro.** El auto-registro crea el usuario con `estado: pendiente`. Solo admin o
  gestor lo aprueban (`estado: aprobado` y `tipo_cliente`, por defecto `persona_natural`) o lo
  rechazan. Un usuario no aprobado no puede crear órdenes.
- **RN-05 Campos protegidos.** Ni el propio usuario ni un vendedor pueden cambiar `estado`,
  `tipo_cliente`, `limite_credito`, `plazo_pago`, `descuento_adicional`, `rol`,
  `comercial_lider` ni `vendedor_externo`. Admin y gestor sí.
- **RN-06 Clientes creados por vendedores.** El vendedor puede crear clientes (`rol: cliente`,
  `estado: pendiente`, `tipo_cliente: persona_natural`, `creado_por` = su correo) y editar sus
  datos no protegidos.
- **RN-07 Contraseñas.** Solo un admin cambia la contraseña de otro usuario (mín. 8, máx. 128
  caracteres), vía la función `cambiarPasswordUsuario`: cierra sus sesiones y deja registro en
  `auditoria_usuarios` (sin la contraseña). Alternativa: enlace de restablecimiento por correo.
  Si el documento no coincide con la cuenta de Auth se busca por correo, salvo que ese correo
  pertenezca a otro usuario con documento propio.

## 2. Precios

- **RN-10 Lista del cliente.** La lista de precios es `usuarios.tipo_cliente`: `mayorista`,
  `negocio`, `persona_natural`, `nuevos` o una lista personalizada (`precio_<id>`). Los campos
  `lista_precios` y `Precio_Lx` son históricos y no se usan.
- **RN-11 Fórmula.** Para cada lista activa de `configuracion/listas_precios`:
  `incremento = (cod_interno termina en un sufijo de skus_excepcion) ? incremento_excepcion : incremento`
  y `precio_<lista> = round(precio_lista × (1 + incremento/100) × (1 + iva/100))`. Las 4 listas
  usan IVA 19 %. `precio_lista` es costo base: **nunca se muestra ni se cobra**.
- **RN-12 Precios con IVA incluido.** El total de la orden es Σ `precio_unitario × cantidad`; el
  subtotal y el IVA **se extraen** del total: `subtotal = total / 1,19`, `iva = total − subtotal`.
- **RN-13 Precio faltante.** ⚠ Decidir. Hoy hay tres comportamientos:
  - Catálogo B2B (`usuario.js`): mayorista o negocio sin precio → **0**; otras listas → `precio_persona_natural`.
  - Panel vendedor / CRM: → `precio_persona_natural` → `p_real` → `p_corriente`.
  - Agente IA: lista desconocida → `persona_natural`; si el producto no tiene precio en esa lista → **no se vende** (nunca cae a otro campo).
  Propuesta para la migración: una sola función (la del agente).
- **RN-14 Sincronización.** La sincronización desde Sheets (GAS / `syncProductos`) no escribe
  precios por lista; los precios por lista los recalcula solo el admin.
- **RN-15 1.477 clientes con `tipo_cliente` que no es una lista.** Hoy caen a `persona_natural`.
  ⚠ Decisión de negocio pendiente (tabla de equivalencias).

## 3. Órdenes: creación y edición

- **RN-20 Quién crea.** Cliente aprobado: orden propia (`user_id` = su uid). Vendedor o gestor:
  orden para un cliente (`creadaPor` = su uid, `tipo: orden-vendedor`). Admin: cualquiera.
  Agente IA: en nombre del cliente que chatea.
- **RN-21 Visibilidad.**
  - Cliente: solo sus órdenes (`user_id`).
  - Admin, gestor, despachos, `comercial_lider` y **vendedor interno**: todas.
  - **Vendedor externo** (`vendedor_externo: true`): solo las que él creó (`creadaPor`), ni las de
    sus clientes asignados creadas por otros; su pantalla no muestra el filtro "Todas / Mis órdenes".
- **RN-22 Quién modifica.** Admin, gestor, despachos y `comercial_lider`: cualquiera. Vendedor:
  las que creó o las de sus clientes asignados (`usuarios.vendedor_asignado`). Cliente: solo las
  suyas en estado `pendiente`. Borrar definitivamente: solo admin. Las órdenes ajenas se ven en
  solo lectura (candado).
- **RN-23 Filtro "Mis órdenes".** Para vendedores internos: las que puede modificar (creadas por
  él o de sus clientes asignados). Por defecto se muestran todas.
- **RN-24 Papelera.** "Eliminar" desde los paneles marca `eliminado: true` (+ quién y cuándo); la
  orden desaparece de las listas pero no se borra.
- **RN-25 Número de orden.** ⚠ Decidir un formato único. Hoy: `OC-AAMMDD-xxxx` (cliente B2B),
  `ORD-AAMMDD-xxxxx` (vendedor/CRM, aleatorio: puede repetirse) y `ORD-AAAA-nnnnn` (agente IA,
  consecutivo en `configuracion`).
- **RN-26 Edición por el cliente.** En `pendiente` puede cambiar cantidades, quitar o agregar
  productos y observaciones; se recalculan totales (RN-12) y se registra en `historial`.

## 4. Órdenes: estados y despacho

- **RN-30 Estados y transiciones (CRM, la que usa Despachos).**
  `pendiente → en_proceso | cancelada`, `en_proceso → alistamiento | cancelada`,
  `alistamiento → terminada | cancelada`, `completada → terminada`,
  `parcial → terminada | alistamiento`; `terminada` y `cancelada` son finales.
  ⚠ La copia del B2B además permite `aprobada` y `en_espera`; ningún dato actual las usa.
- **RN-31 Reversión.** Un paso atrás (`en_proceso → pendiente`, `alistamiento → en_proceso`,
  `terminada|completada|parcial → alistamiento`), solo admin o gestor, con motivo obligatorio que
  queda en `historial`.
- **RN-32 Etiquetas de estado.** Una sola tabla (texto, ícono y colores) para todas las vistas y
  gráficos: `js/estados-orden.js` (aprobada el 2026-10-24).
- **RN-33 Alistamiento por ítem.** Despachos marca cada ítem como `comp`, `parcial` o `sinstock` y
  registra `cantidad_real` (despachada). Se guarda al instante y se identifica el ítem por código
  de producto (no por posición en pantalla). Al finalizar: `terminada` con
  `resultado_alistamiento` `completada` o `parcial`.
- **RN-34 Lo despachado manda.** El detalle de orden (admin, vendedor y cliente) muestra por ítem
  cantidad pedida y despachada, resalta diferencias y recalcula el total con lo despachado
  (ítems sin registrar cuentan con lo pedido).
- **RN-35 Mensajes internos de despacho** (`chat_ordenes`): solo personal (admin, gestor,
  vendedor, despachos) y solo de órdenes que ese usuario puede leer. **El cliente nunca los ve.**
- **RN-36 Historial para el cliente.** El cliente ve solo los cambios de estado con su fecha, sin
  notas internas (quién, alistamiento, reversiones, motivos).
- **RN-37 CSV de despacho.** Por orden, con precio sin IVA por línea (para el ERP).

## 5. Catálogo e imágenes

- **RN-40 Un solo envase.** Cada producto muestra la foto de **un solo envase del mismo producto
  y tamaño**; nunca fotos de varios envases ni etiquetas planas (lista en
  `migration/imagenes-prohibidas.json`). Variantes de color del mismo tamaño comparten foto. Si no
  hay foto válida → placeholder.
- **RN-41 Formato.** WebP 1200 px (`imagen_principal`) + miniatura 300 px (`imagen_miniatura`) en
  Storage con URL permanente; sin Drive.
- **RN-42 Productos activos.** Solo `activo: true` se muestra y se vende.

## 6. Agente IA (catálogo)

- **RN-50** Cotiza y crea órdenes con la lista real del cliente (RN-10), extrayendo el IVA
  (RN-12); nunca usa `precio_lista`. El servidor fija el `user_id`, no el modelo.

## 7. Seguridad (Firestore / Storage)

- **RN-60** Productos: lectura pública, escritura admin o gestor.
- **RN-61** Configuración: lectura autenticada, escritura admin.
- **RN-62** Carrito: solo su dueño (y admin).
- **RN-63** Métricas de clientes: lectura personal, escritura admin (y Functions).
- **RN-64** Storage: `productos/` y `fichas/` de lectura pública; escritura solo con Admin SDK.
- **RN-65** Cotizaciones: hoy cualquier autenticado lee y escribe todas. ⚠ Decidir restricción.

## 8. Interfaz (comportamientos acordados)

- **RN-70** Los modales se abren bajo la cabecera, con título visible y scroll propio.
- **RN-71** Cualquier modal se cierra con clic en el fondo o Esc; si tiene cambios sin guardar,
  pide confirmación (los botones de cerrar/cancelar no preguntan).
- **RN-72** El detalle de orden se relee de Firestore al abrirse (no del listado en memoria).
