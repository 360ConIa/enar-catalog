# Migración a Next.js — Decisiones

Decisiones del dueño del producto que fijan cómo se construye la versión nueva. Cada una
resuelve un ⚠ de [reglas-negocio.md](reglas-negocio.md). Formato: qué se decidió, cuándo,
y qué implica. Una decisión solo se cambia registrando otra nueva aquí.

| ID | Decisión | Estado | Fecha |
|---|---|---|---|
| D-00 | Arquitectura: **Next.js completo en Firebase App Hosting** | Decidida | 2026-10-25 |
| D-01 | Precio faltante: el producto no se vende | Decidida | 2026-10-25 |
| D-02 | Número de orden único, consecutivo, generado en el servidor | Decidida | 2026-10-25 |
| D-03 | Se eliminan los estados `aprobada` y `en_espera` | Decidida | 2026-10-25 |
| D-04 | Admin solo por `rol: admin` | Decidida | 2026-10-25 |
| D-05 | Rol de `ventas@enar.com.co` (Henry) | **Pendiente** | — |
| D-06 | Cotizaciones: cada cliente las suyas, el personal todas | Decidida y **aplicada en producción** | 2026-10-25 |
| D-07 | Clientes con `tipo_cliente` que no es lista: equivalencia explícita | Decidida; **falta la tabla de equivalencias** | 2026-10-25 |

## D-00 Next.js completo en Firebase App Hosting
Las tres apps actuales (B2B, CRM y portal) se reemplazan por una aplicación **Next.js**
desplegada en **Firebase App Hosting** (renderizado en servidor, sin hosting estático aparte).
- Firestore, Auth, Storage y las Cloud Functions existentes se mantienen; la app nueva usa el
  mismo modelo de datos (ver duplicaciones.md §4 para lo que se normaliza).
- Las pruebas se hacen primero en **`enar-staging`** (alias `staging` en `.firebaserc`, sin
  targets de hosting). Producción (`enar-b2b`) solo cuando pasen las pruebas de
  aceptación de cada iteración.
- La lógica de negocio vive en módulos compartidos (`lib/precios`, `lib/totales`,
  `lib/estados`, `lib/permisos`…) usados por servidor y cliente; firestore.rules sigue siendo
  la barrera de seguridad, no la interfaz.

## D-01 Precio faltante (RN-13)
Si un producto no tiene precio en la lista del cliente, **no se vende** (no se muestra precio
ni se puede agregar), en todas las pantallas, como hoy hace el agente IA. Nunca se cae a
`p_real`, `p_corriente`, otra lista ni `precio_lista`.
Implica: una sola función de precio (`lib/precios`) para catálogo, panel vendedor, CRM y
agente. La app actual queda como está hasta la migración.

## D-02 Número de orden (RN-25)
Formato único **`ORD-AAAA-nnnnn`**, consecutivo, generado en el servidor con una transacción
(como el agente IA hoy). Se abandonan `OC-AAMMDD-xxxx` y `ORD-AAMMDD-xxxxx` (aleatorio, puede
repetirse). Las órdenes existentes conservan su número.

## D-03 Estados `aprobada` y `en_espera` (RN-30)
Se eliminan. Ninguna orden los usa. Estados vigentes: `pendiente`, `en_proceso`,
`alistamiento`, `terminada`, `completada`, `parcial`, `cancelada`, con las transiciones y
reversiones de la tabla del CRM.

## D-04 Admin (RN-02)
Es admin **solo** quien tiene `rol: admin`. Se elimina la lista de correos del front
(`ADMIN_EMAILS`). En firestore.rules se conserva el correo de Sebastián
(`sebastianbumq@enarapp.com`) únicamente como respaldo de acceso. Ambos admins actuales ya
tienen `rol: admin` (Arnulfo desde 2026-10-24).

## D-05 Henry — `ventas@enar.com.co` (RN-03) — PENDIENTE
Hoy su `rol` es `vendedor`, pero las reglas lo tratan como gestor por su correo
(`isUserManager`), lo que le permite editar cualquier usuario, incluido el rol. La respuesta
recibida fue "[vendedor / gestor]" sin elegir: **no se cambió nada**. Opciones:
- *vendedor*: se quita el correo de `isUserManager`; pierde la administración de usuarios.
- *gestor*: se le pone `rol: gestor` explícito y se quita el correo de las reglas.
Recomendación: cualquiera de las dos, pero con el rol explícito y sin correo en las reglas.

## D-06 Cotizaciones (RN-65) — aplicada en producción
- Regla: el cliente crea solo cotizaciones con su `user_id` y lee solo las suyas; el personal
  (admin, gestor, vendedor, despachos) lee todas y actualiza su estado; borrar solo admin. Un
  cliente ya no puede sobrescribir una cotización ajena reutilizando su número.
- El catálogo B2B ahora guarda `user_id` en la cotización (antes no lo hacía). Las cotizaciones
  antiguas sin `user_id` solo las ve el personal. Las del agente IA ya lo tenían.
- Verificado con 18 casos (`tests/reglas/probar_reglas.py cotizaciones`); las otras 4 baterías
  (55 casos) siguen pasando. Regla publicada idéntica a la del repositorio.
- Hallazgo sin corregir: el consecutivo `COT-AAAA-nnnn` se guarda en `configuracion/general`,
  que solo el admin puede escribir; para un cliente falla y se usa un número con la hora.

## D-07 `tipo_cliente` que no es lista (RN-15)
Decidido hacer una equivalencia explícita por valor. Datos al 2026-10-25 (1.987 clientes):

| `tipo_cliente` actual | Clientes | Con órdenes | `lista_precios` histórica | ¿Es lista? |
|---|---|---|---|---|
| Persona Natural | 715 | 2 | 9 (559), 10 (151), 4 (4), 7 (1) | No |
| Regimen Común | 625 | 5 | 10 (309), 9 (305), 1 (9), 7 (1) | No |
| negocio | 304 | 32 | 9 (252), 10 (33)… | Sí |
| Regimen Simplificado | 167 | 1 | 10 (119), 9 (48) | No |
| nuevos | 109 | 75 | 10 (69), 9 (29)… | Sí |
| persona_natural | 39 | 25 | 10 (14), 9 (11)… | Sí |
| mayorista | 20 | 10 | 7 (3), 9 (2)… | Sí |
| Gran Contribuyente | 5 | 0 | 9 (4), 1 (1) | No |
| Especial | 2 | 0 | 9 (2) | No |
| Profesional Independiente | 1 | 0 | 9 (1) | No |

**1.515 clientes** tienen un valor que no es lista: son **regímenes tributarios** que vinieron
de la hoja, no listas de precios. Hoy ven precios de `persona_natural`. Solo 8 de ellos tienen
órdenes. Falta que el dueño defina, para cada fila "No", a qué lista pasa (y si el régimen
tributario se guarda en un campo propio, p. ej. `regimen_tributario`). No se modifica ningún
dato hasta tener esa tabla.

## Otros acuerdos de esta fecha
- La URL de sincronización externa que usa `TriggerFunction.gs`
  (`syncproductos-3ylre3k6ka-uc.a.run.app`) no es de ENAR: **la revisa el dueño**; no se toca
  ese proyecto desde aquí. `TriggerFunction.gs` no se modificó.
- `syncProductos` de enar-b2b exige token (`SYNC_PRODUCTOS_TOKEN` en Secret Manager) desde
  2026-10-25; además sigue cerrada por IAM de Cloud Run y no tiene uso.
