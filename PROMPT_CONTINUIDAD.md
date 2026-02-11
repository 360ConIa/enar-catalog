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
| Mis Órdenes | https://enar-b2b.web.app/mis-ordenes.html |

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
- Atajo `Ctrl+E` para abrir/cerrar
- Long press (500ms) en móvil
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
| Atajo Ctrl+E | ✅ Funciona |
| Long press móvil | ✅ Funciona |
| Voz | ⏸️ Pendiente (Whisper) |
| Editar orden (pendiente) | ✅ Funciona (todos los usuarios) |
| Vendedor ve órdenes admin | ✅ Funciona (solo sus clientes) |
| Consistencia respuestas | 🔄 Siguiente tarea |

---

## Archivos Clave

```
public/js/ia/chatWidget.js          # Widget IA
public/js/carrito.js                # Carrito con listener IA
public/js/user-manager.js           # Gestión usuarios + rol gestor
public/js/auth.js                   # Auth + USER_MANAGER_EMAILS
public/js/ordenes.js                # Órdenes de compra + edición
public/mis-ordenes.html             # Mis Órdenes (editar orden pendiente)
public/admin.html                   # Panel admin (filtrado por rol)

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

1. **Mejorar consistencia del agente** - Identificar problemas específicos y ajustar prompt
2. **Probar órdenes masivas** - Formato "SKU x cantidad"
3. **Voz con Whisper** (opcional) - Requiere API key OpenAI

---

## Comandos

```bash
cd ~/Proyectos_ENAR/enar-catalog
firebase deploy --only hosting      # Frontend
firebase deploy --only functions    # Backend
firebase functions:log --only chatAgent -n 30
```

---

*Última actualización: 11 Febrero 2026 (Editar Órdenes + Vendedor ve Órdenes en Admin)*
