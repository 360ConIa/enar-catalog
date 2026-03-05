# ENAR B2B - Catálogo de Productos

## Contexto del Proyecto

**Objetivo:** Sistema B2B para ENAR (pinturas y recubrimientos) con catálogo inteligente, órdenes de compra y asistente IA.

**Estado actual:** Proyecto funcional en producción con **14,749 productos**, agente IA funcionando con Gemini 2.5 Flash.

---

## URLs de Producción

| Página | URL |
|--------|-----|
| **Portal Suite** | https://enar-b2b.web.app/portal.html |
| Catálogo | https://enar-b2b.web.app |
| Login | https://enar-b2b.web.app/login.html |
| Admin | https://enar-b2b.web.app/admin.html |
| Panel Vendedor | https://enar-b2b.web.app/vendedor.html |
| Mis Órdenes | https://enar-b2b.web.app/mis-ordenes.html |
| Mi Perfil | https://enar-b2b.web.app/perfil.html |

---

## Stack Tecnológico

```
FRONTEND          →  Firebase Hosting (HTML/CSS/JS)
BASE DE DATOS     →  Cloud Firestore
AUTENTICACIÓN     →  Firebase Auth
IA COMERCIAL      →  Firebase Functions + Gemini 2.5 Flash (Google AI Studio)
```

---

## Credenciales

| Recurso | Valor |
|---------|-------|
| **Firebase Project ID** | `enar-b2b` |
| **Cuenta Admin** | `sebastianbumq@enarapp.com` |
| **Cuenta Gestora** | `ventas@enar.com.co` (solo gestión de sus clientes) |
| **API Key Gemini** | Secreto en Firebase (`GEMINI_API_KEY`) |

---

## CAMBIOS REALIZADOS (5 Mar 2026)

### Panel Vendedor — Órdenes en nombre de clientes ✅
- [x] Nuevo archivo `public/vendedor.html` — Panel profesional con header sticky gradiente, grid de stats (4 tarjetas), tabla de órdenes con filtros, 3 modales (buscar cliente, agregar productos, detalle orden), toast notifications
- [x] Nuevo archivo `public/js/vendedor.js` — Lógica completa del vendedor:
  - Auth: verifica `perfil.rol === 'vendedor'` en Firestore, redirige a login si no
  - Buscar cliente: carga usuarios aprobados (limit 200), filtra client-side por nombre/nit/razon_social/email
  - Buscar producto: búsqueda por cod_interno exacto o titulo prefix
  - Precios por tipo: `precio_mayorista`, `precio_negocio`, `precio_persona_natural`
  - Crear orden: documento con `user_id` (cliente), `creadaPor` (vendedor), `tipo: 'orden-vendedor'`
  - Número de orden: formato `OC-YYMMDD-XXXX`
  - Cargar órdenes: filtro `creadaPor == vendedorUser.uid`, ordenado por `created_at desc`
- [x] Login actualizado: nueva función `obtenerDestinoLogin()` detecta rol vendedor y redirige a `/vendedor.html`
- [x] Admin actualizado: columna "Origen" en tabla de órdenes (vendedor vs cliente directo)
- [x] Firestore rules: nueva función `isVendedor()`, permisos de lectura usuarios aprobados, crear/leer órdenes propias
- [x] Índice compuesto: `creadaPor` (ASC) + `created_at` (DESC) en colección `ordenes`

### Menú unificado y responsive ✅
- [x] Navegación unificada en TODAS las páginas con clases BEM: `header-nav__user`, `header-nav__link`, `header-nav__link--logout`
- [x] Solo el nombre de usuario tiene fondo rojo (`#D9232D`), demás links tienen borde sutil y fondo transparente
- [x] Labels abreviados: "Perfil", "Órdenes", "Ventas"; "Salir" reemplazado por ícono Bootstrap Icons
- [x] Nombre de usuario abreviado al primer nombre (`nombre.split(' ')[0]`)
- [x] Breakpoints responsive: 991px (wrap, 12px font), 767px (stack columna, 11px), 480px (ajustes adicionales en vendedor)
- [x] Bootstrap Icons CSS agregado a perfil.html y mis-ordenes.html
- [x] Estilos inline conflictivos eliminados de todas las páginas

### Archivos creados:
- `public/vendedor.html` — Panel vendedor completo
- `public/js/vendedor.js` — Lógica vendedor (módulo ES6)

### Archivos modificados:
- `public/login.html` — Redirección vendedor con `obtenerDestinoLogin()`
- `public/admin.html` — Columna "Origen" + nav unificado + responsive
- `public/index.html` — Link "Ventas" condicional + nav unificado
- `public/perfil.html` — Nav unificado + Bootstrap Icons + responsive
- `public/mis-ordenes.html` — Nav unificado + Bootstrap Icons + responsive
- `public/css/styles.css` — Estilos nav BEM unificados con breakpoints responsive
- `firestore.rules` — Función `isVendedor()` + permisos vendedor
- `firestore.indexes.json` — Índice compuesto creadaPor + created_at

---

## CAMBIOS REALIZADOS (3 Mar 2026)

### Formulario "Crear Nuevo Usuario" en Admin — EN PROGRESO 🔄
- [x] Nuevo archivo `public/js/colombia-data.js` — diccionario departamentos → ciudades de Colombia (ES6 export)
- [x] Campos Ciudad y Departamento cambiados de `<input text>` a `<select>` desplegables
- [x] Orden invertido: primero Departamento, luego Ciudad (dependiente)
- [x] Al seleccionar departamento se cargan automáticamente sus ciudades
- [x] Nuevo campo **Rol** (`<select>`) con opciones: Cliente, Vendedor, Gestor de Usuarios, Administrador
- [x] Campo `rol` se guarda en Firestore al crear usuario
- [x] App secundaria de Firebase para crear usuarios sin deslogear al admin
- [ ] **BUG PENDIENTE:** `createUserWithEmailAndPassword` en app secundaria arroja error genérico — falta diagnosticar (mensaje de error detallado ya agregado para debug)

### Archivos modificados:
- `public/admin.html` — HTML del formulario + JS de creación con app secundaria
- `public/js/colombia-data.js` — NUEVO, datos departamentos/ciudades

---

## CAMBIOS REALIZADOS (12 Feb 2026)

### Widget ENAR IA - Solo activación por botón ✅
- [x] Eliminado atajo `Ctrl+E` / `Cmd+E` para abrir/cerrar widget
- [x] Eliminado long press (500ms) en móvil
- [x] ENAR IA ahora solo se activa con click en el botón "ENAR IA"

---

## CAMBIOS REALIZADOS (11 Feb 2026)

### Editar Órdenes de Compra (Mis Órdenes) ✅
- [x] Botón "Editar Orden" (azul) en listado de órdenes con estado Pendiente
- [x] Botón "Ver Detalles" (rojo) para todas las órdenes
- [x] Modal de edición: modificar cantidades (+/-), eliminar productos, buscar y agregar nuevos productos
- [x] Campo de observaciones editable en modo edición
- [x] Totales actualizados en tiempo real (subtotal, IVA 19%, total)
- [x] Función `editarOrden()` abre modal directo en modo edición (sin pasar por detalles)
- [x] Backend `actualizarItemsOrden` acepta observaciones como parámetro opcional
- [x] Registro en historial: "Orden modificada por el cliente"
- [x] Toast notifications (verde/rojo) en vez de alert() nativo
- [x] Seguridad: solo el dueño puede editar, solo si estado == 'pendiente'
- [x] Aplica a TODOS los usuarios de la app

### Vendedores con acceso a Órdenes en Admin ✅
- [x] Pestaña "Órdenes" visible para `ventas@enar.com.co` en admin.html
- [x] Firestore rules: vendedores (isUserManager) pueden leer y actualizar órdenes
- [x] Filtro: vendedor solo ve órdenes de **sus propios clientes** (creado_por)
- [x] Contadores/estadísticas reflejan solo las órdenes de sus clientes
- [x] Puede ver detalles y cambiar estados de órdenes
- [x] NO puede eliminar órdenes (solo admin)

### Permisos de ventas@enar.com.co:
| Acción | Permitido |
|--------|-----------|
| Ver/crear/aprobar/editar sus clientes | ✅ Sí |
| Ver clientes de otros | ❌ No |
| Ver órdenes de sus clientes | ✅ Sí |
| Cambiar estado de órdenes | ✅ Sí |
| Eliminar órdenes | ❌ No (solo admin) |
| Gestionar productos | ❌ No |
| Eliminar usuarios | ❌ No |

### Rol Gestor de Usuarios - ventas@enar.com.co ✅
- [x] Nuevo rol `User Manager` creado para `ventas@enar.com.co`
- [x] Campo `creado_por` agregado al crear usuarios desde admin
- [x] Gestor solo ve los clientes que ella misma creó (filtro por `creado_por`)
- [x] Firestore rules actualizadas: gestores solo leen/editan sus propios clientes
- [x] Índice compuesto `creado_por` + `created_at` desplegado
- [x] Enlace "Admin" visible en header del catálogo para gestores
- [x] Login con Google redirige a admin.html para gestores
- [x] Título del panel cambia a "Mis Clientes" para gestores

---

## CAMBIOS REALIZADOS (6 Feb 2026)

### Widget ENAR IA ✅
- Título del modal = mismo estilo que el botón
- ~~Atajo `Ctrl+E` para abrir/cerrar~~ (eliminado 12 Feb)
- ~~Long press (500ms) en móvil~~ (eliminado 12 Feb)
- Vibración de feedback

### Agente IA ✅
- 3 herramientas: `consultar_catalogo`, `agregar_carrito`, `consultar_ficha_tecnica`
- System prompt simplificado
- Soporte órdenes masivas ("AG200 x2, VB100 x3")
- API Key como secreto de Firebase

### Carrito ✅
- Agente agrega productos al carrito (localStorage)
- Actualización en tiempo real del badge
- Evento `carritoActualizado` para sincronización

### Voz ⏸️ PENDIENTE
- Web Speech API no funciona (Google no devuelve transcripciones)
- Solución: Implementar Whisper de OpenAI

---

## Estado de Funcionalidades

| Funcionalidad | Estado |
|---------------|--------|
| Chat escrito | ✅ Funciona |
| Agregar al carrito | ✅ Funciona (tiempo real) |
| Órdenes masivas | ✅ Implementado |
| Atajo Ctrl+E | ❌ Eliminado (solo botón) |
| Long press móvil | ❌ Eliminado (solo botón) |
| Voz | ⏸️ Pendiente (Whisper) |
| Editar orden (pendiente) | ✅ Funciona (todos los usuarios) |
| Vendedor ve órdenes admin | ✅ Funciona (solo sus clientes) |
| Panel vendedor | ✅ Órdenes en nombre de clientes |
| Buscar cliente (vendedor) | ✅ Por nombre/nit/razon_social/email |
| Crear orden (vendedor) | ✅ Con precios por tipo cliente |
| Origen en admin | ✅ Columna vendedor vs cliente directo |
| Menú unificado | ✅ BEM classes, responsive, todas las páginas |
| Crear usuario (admin) | 🔄 Bug pendiente — app secundaria Firebase |
| Depto → Ciudad (admin) | ✅ Selects dinámicos |
| Campo Rol (admin) | ✅ 4 roles: cliente, vendedor, gestor, admin |
| Consistencia respuestas | 🔄 Siguiente tarea |

---

## Archivos Clave

```
public/js/ia/chatWidget.js          # Widget IA
public/js/carrito.js                # Carrito con listener IA
public/js/user-manager.js           # Gestión usuarios + rol gestor
public/js/auth.js                   # Auth + USER_MANAGER_EMAILS
public/js/ordenes.js                # Órdenes de compra + edición
public/js/vendedor.js               # Lógica panel vendedor (módulo ES6)
public/js/colombia-data.js          # Departamentos → ciudades Colombia
public/vendedor.html                # Panel vendedor (órdenes en nombre de clientes)
public/mis-ordenes.html             # Mis Órdenes (editar orden pendiente)
public/perfil.html                  # Mi Perfil
public/admin.html                   # Panel admin (filtrado por rol)
public/css/styles.css               # Estilos globales + nav unificado BEM

functions-sync/agent/
├── agentConfig.js                  # Gemini config
├── systemPrompt.js                 # Prompt v3.1
└── tools/
    ├── index.js                    # 3 herramientas
    ├── agregarCarrito.js           # NUEVO
    ├── consultarCatalogo.js
    └── consultarFichaTecnica.js
```

---

## Próximas Tareas

1. **Arreglar bug crear usuario en admin** - Diagnosticar error de `createUserWithEmailAndPassword` con app secundaria (mensaje detallado ya visible en UI)
2. **Probar panel vendedor en producción** - Crear usuario con rol vendedor, verificar flujo completo: buscar cliente → agregar productos → confirmar orden → ver en admin con "Origen"
3. **Mejorar consistencia del agente** - Identificar problemas específicos y ajustar prompt
4. **Probar órdenes masivas** - Formato "SKU x cantidad"
5. **Voz con Whisper** (opcional) - Requiere API key OpenAI

---

## Comandos

```bash
cd ~/Proyectos_ENAR/enar-catalog
firebase deploy --only hosting      # Frontend
firebase deploy --only functions    # Backend
firebase functions:log --only chatAgent -n 30
```

---

*Última actualización: 5 Marzo 2026 (Panel vendedor con órdenes en nombre de clientes + menú unificado responsive)*
