# ENAR B2B - Catálogo de Productos

## Contexto del Proyecto

**Objetivo:** Sistema B2B para ENAR (pinturas y recubrimientos) con catálogo inteligente, órdenes de compra y asistente IA.

**Estado actual:** Proyecto funcional en producción con **14,749 productos**, **1,042 productos con fichas técnicas procesadas** y **Agente IA desplegado** (pendiente resolver permisos de Vertex AI).

---

## URLs de Producción

| Página | URL |
|--------|-----|
| **Portal Suite** | https://enar-b2b.web.app/portal.html |
| Catálogo | https://enar-b2b.web.app |
| Login | https://enar-b2b.web.app/login.html |
| Registro | https://enar-b2b.web.app/registro.html |
| Admin | https://enar-b2b.web.app/admin.html |
| Mis Órdenes | https://enar-b2b.web.app/mis-ordenes.html |
| Perfil | https://enar-b2b.web.app/perfil.html |

---

## Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                      ARQUITECTURA                           │
├─────────────────────────────────────────────────────────────┤
│  FRONTEND          │  Firebase Hosting (HTML/CSS/JS)       │
│  BASE DE DATOS     │  Cloud Firestore                      │
│  AUTENTICACIÓN     │  Firebase Auth                        │
│  SINCRONIZACIÓN    │  Google Apps Script + Sheets          │
│  IMÁGENES          │  Google Drive (carpeta compartida)    │
│  FICHAS TÉCNICAS   │  Google Drive (PDFs) + Firestore      │
│  IA COMERCIAL      │  Firebase Functions + Vertex AI       │
│                    │  (Gemini - PENDIENTE PERMISOS)        │
└─────────────────────────────────────────────────────────────┘
```

---

## Credenciales y IDs Importantes

| Recurso | Valor |
|---------|-------|
| **Firebase Project ID** | `enar-b2b` |
| **Google Sheet ID** | `1CgHOL7scCsqRQJVj8kxrAR8cyKIs3Jj6Q9tj8RoPmzM` |
| **Apps Script ID** | `1Wdp1bWctRX4w22QO01NxDrxlBs9EWfuz7hon0gFS_HL1YRVVQj-GYCdj` |
| **Carpeta Fichas Técnicas** | `1Z_-ofehBnsSVtRw9_RydMSxRn99ykEBz` |
| **Carpeta Imágenes** | `1tHPYawvonYZswNoPdz11uaT9xZJQHaES` |
| **Cuenta Admin** | `sebastianbumq@enarapp.com` |
| **Total Productos** | 14,749 SKUs |
| **Fichas Técnicas Procesadas** | 30 fichas con OCR, 1,042 productos vinculados |

---

## PROBLEMA PENDIENTE - VERTEX AI / GEMINI

### Estado: La función chatAgent NO funciona - Error de permisos

### Error actual:
```
Publisher Model `projects/enar-b2b/locations/us-central1/publishers/google/models/gemini-1.0-pro`
was not found or your project does not have access to it.
```

### Lo que ya se intentó:
1. ✅ Habilitar Vertex AI API
2. ✅ Agregar rol "Vertex AI User" a la cuenta de servicio `903832444518-compute@developer.gserviceaccount.com`
3. ✅ Configurar Cloud Run para acceso público (chatAgent)
4. ✅ Probar modelos: `gemini-1.5-pro`, `gemini-1.5-flash-001`, `gemini-1.0-pro`
5. ❌ PENDIENTE: Habilitar **Generative Language API** (el usuario no sabe cómo)

### Solución pendiente para mañana:

**Opción 1: Habilitar Generative Language API**
1. Ir a: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=enar-b2b
2. Hacer clic en "Habilitar"
3. Probar de nuevo

**Opción 2: Verificar en Vertex AI Model Garden**
1. Ir a: https://console.cloud.google.com/vertex-ai/model-garden?project=enar-b2b
2. Buscar "Gemini"
3. Verificar si está habilitado y tiene acceso

**Opción 3: Usar Google AI Studio en lugar de Vertex AI**
- Cambiar de `@google-cloud/vertexai` a `@google/generative-ai`
- Usar API key en lugar de autenticación de servicio
- Más simple pero menos integrado con GCP

### Archivo a modificar si se cambia de proveedor:
`/functions-sync/agent/agentConfig.js` - línea 13: `const MODEL = 'gemini-1.0-pro';`

---

## Cambios Realizados Hoy (2 Feb 2026 - Sesión Nocturna)

### Widget ENAR IA - Correcciones de Fuentes ✅
- [x] URL de Google Fonts actualizada para cargar Poppins peso 400 y 700
- [x] Título del modal "Enar" ahora usa Great Vibes igual que el botón
- [x] Input y placeholder con font-weight: 400 (no bold)
- [x] Chips de sugerencias con font-weight: 400
- [x] Modal reposicionado 120px más arriba (bottom: 220px)

### Tabla de Productos - Reorganización ✅
- [x] Columnas CÓDIGO y STOCK eliminadas de la tabla (se mantienen en modal detalles)
- [x] Columna IMG movida después de CANT y antes de PRODUCTO
- [x] Imagen miniatura agrandada a 60px x 60px sin borde
- [x] Columnas IMG y tres puntos centradas correctamente
- [x] Texto header cambiado: "Asesor comercial con IA integrado al catálogo"
- [x] Precio siempre muestra "P.Final" (en lugar de P.Mayorista/P.Negocios/P.Personas)

### Fichas Técnicas - Procesamiento Completado ✅
- [x] Drive API v3 habilitada en Apps Script
- [x] Función `extraerTextoPDF()` actualizada para usar `Drive.Files.create()` (v3)
- [x] Scopes agregados: `drive` y `documents`
- [x] 30 fichas técnicas procesadas con OCR (0 errores)
- [x] 1,042 productos actualizados con contenido de fichas
- [x] Menú "ENAR Sync → Fichas Técnicas" ya existe con todas las opciones

### Flujo de Fichas Técnicas desde Google Sheets:
```
ENAR Sync → Fichas Técnicas → Listar fichas técnicas
ENAR Sync → Fichas Técnicas → Sincronizar fichas técnicas (URLs)
ENAR Sync → Fichas Técnicas → Procesar contenido PDFs (IA) ← OCR
ENAR Sync → Fichas Técnicas → Vincular fichas con productos
```

### Firebase Functions - Configuración ✅
- [x] chatAgent configurado con `invoker: 'public'` para permitir llamadas
- [x] Cloud Run configurado para "Permite el acceso público"
- [x] Autenticación de Firebase Auth funciona (logs muestran usuario válido)

---

## Estructura de Precios (3 niveles)

```
┌────────────────────┬─────────────────────────────────────┐
│ Tipo Cliente       │ Campo en Firestore                  │
├────────────────────┼─────────────────────────────────────┤
│ Mayorista          │ precio_mayorista                    │
│ Negocio            │ precio_negocio                      │
│ Persona Natural    │ precio_persona_natural              │
└────────────────────┴─────────────────────────────────────┘

NOTA: La cabecera de la tabla ahora muestra "P.Final" para todos los tipos.
La función getEtiquetaTipoCliente() en usuario.js fue simplificada.
```

---

## Branding ENAR

```css
/* Colores corporativos */
--color-primario: #D9232D;        /* Rojo ENAR */
--color-primario-hover: #b91c25;  /* Rojo oscuro */
--color-azul-oscuro: #1e3a8a;     /* Azul header */
--color-azul-claro: #3b82f6;      /* Azul gradiente */

/* Gradiente header */
background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);

/* Tipografías */
font-family: 'Poppins', sans-serif;        /* General */
font-family: 'Great Vibes', cursive;       /* Logo "Enar" script */
```

---

## Estructura del Proyecto

```
~/Library/Mobile Documents/com~apple~CloudDocs/Proyectos_ENAR/enar-catalog/
│
├── public/                    # FRONTEND (Firebase Hosting)
│   ├── index.html            # Catálogo principal + Widget IA
│   ├── portal.html           # Portal Suite ENAR
│   ├── login.html            # Inicio de sesión
│   ├── registro.html         # Registro de usuarios
│   ├── admin.html            # Panel de administración
│   ├── mis-ordenes.html      # Órdenes del usuario
│   ├── orden.html            # Detalle de orden
│   ├── perfil.html           # Perfil de usuario
│   │
│   ├── css/
│   │   └── styles.css        # Estilos principales
│   │
│   ├── js/
│   │   ├── firebase-config.js  # Config Firebase SDK v9
│   │   ├── productos.js        # Lógica del catálogo
│   │   ├── auth.js             # Autenticación
│   │   ├── carrito.js          # Carrito de compras
│   │   ├── ordenes.js          # Gestión de órdenes
│   │   ├── admin.js            # Panel admin
│   │   ├── user-manager.js     # Gestión de usuarios
│   │   ├── usuario.js          # Tipo de cliente y precios
│   │   └── utils.js            # Utilidades
│   │
│   └── js/ia/
│       └── chatWidget.js     # Widget ENAR IA estilo Canva (v3.0)
│
├── functions-sync/            # FIREBASE FUNCTIONS
│   ├── index.js              # chatAgent + syncProductos
│   ├── package.json          # @google-cloud/vertexai
│   └── agent/                # Agente IA Comercial
│       ├── agentConfig.js    # Vertex AI + Gemini (MODELO: gemini-1.0-pro)
│       ├── systemPrompt.js   # Personalidad (pinturas/recubrimientos)
│       └── tools/
│           ├── index.js
│           ├── consultarCatalogo.js
│           ├── verificarStock.js
│           ├── crearOrden.js
│           └── consultarFichaTecnica.js
│
├── *.gs                       # APPS SCRIPT (Sincronización)
│   ├── Config.gs             # Configuración general
│   ├── SheetReader.gs        # Lectura de Google Sheets
│   ├── FirestoreAPI.gs       # API REST de Firestore
│   ├── Sincronizacion.gs     # Lógica de sync
│   ├── ImageSync.gs          # Sync imágenes + fichas + extracción PDFs
│   ├── TriggerFunction.gs    # Triggers automáticos
│   └── Utils.gs              # Utilidades + Menú
│
├── firebase.json             # Config Firebase
├── firestore.rules           # Reglas de seguridad Firestore
├── .firebaserc               # Proyecto Firebase vinculado
└── .clasp.json               # Proyecto Apps Script vinculado
```

---

## Widget ENAR IA

### Estado: Desplegado - Pendiente resolver error de Vertex AI

### Archivo: `/public/js/ia/chatWidget.js` (v3.0)

### Diseño del Botón "✨ Enar IA":
```
┌─────────────────────────────────────────┐
│  Ubicación: Barra de filtros            │
│  (junto al botón rojo "Limpiar")        │
├─────────────────────────────────────────┤
│  ✨  Enar  IA                           │
│      ↑      ↑                           │
│   Great    Poppins                      │
│   Vibes    Bold                         │
│  (script)  (sans)                       │
├─────────────────────────────────────────┤
│  Fondo: Gradiente azul header           │
│  linear-gradient(135deg,                │
│    #1e3a8a 0%, #3b82f6 100%)           │
│  Border-radius: 8px                     │
└─────────────────────────────────────────┘
```

### Diseño del Modal:
```
┌─────────────────────────────────────────────────────────────────┐
│  ✨ Enar IA                                                [X]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Área de mensajes - scroll]                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [+]   Cuéntame, ¿qué puedo hacer a tu favor?    [🎤]  [➡️]   │
├─────────────────────────────────────────────────────────────────┤
│  🎨 Pinturas exteriores │ 🛡️ Anticorrosivos │ 🏠 Vinilos │ 📋 │
└─────────────────────────────────────────────────────────────────┘

Modal position: bottom: 220px; right: 24px;
```

---

## Agente IA Comercial

### Estado: Código completo, pendiente resolver permisos de Vertex AI

### Herramientas del Agente:

| Herramienta | Descripción |
|-------------|-------------|
| `consultar_catalogo` | Busca productos por nombre, categoría, marca, código |
| `verificar_stock` | Verifica disponibilidad y precios según tipo cliente |
| `crear_orden` | Crea orden de compra directamente desde la conversación |
| `consultar_ficha_tecnica` | Obtiene información técnica detallada del producto |
| `buscar_complementarios` | Sugiere productos para venta cruzada |

### Configuración actual en agentConfig.js:
```javascript
const PROJECT_ID = 'enar-b2b';
const LOCATION = 'us-central1';
const MODEL = 'gemini-1.0-pro';  // Probados también: gemini-1.5-pro, gemini-1.5-flash-001
```

---

## Comandos Útiles

### Firebase CLI
```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/Proyectos_ENAR/enar-catalog

firebase deploy --only hosting    # Deploy frontend
firebase deploy --only functions  # Deploy functions
firebase deploy                   # Deploy todo
firebase functions:log --only chatAgent -n 20  # Ver logs
```

### Clasp (Apps Script)
```bash
clasp push    # Subir cambios a Apps Script
clasp pull    # Descargar cambios desde Apps Script
```

---

## Para Continuar Mañana

### PRIORIDAD 1: Resolver error de Vertex AI / Gemini

1. **Habilitar Generative Language API:**
   - URL: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=enar-b2b
   - Hacer clic en "Habilitar"

2. **Si no funciona, verificar Model Garden:**
   - URL: https://console.cloud.google.com/vertex-ai/model-garden?project=enar-b2b
   - Buscar "Gemini" y verificar acceso

3. **Alternativa: Usar Google AI Studio (API Key)**
   - Cambiar de `@google-cloud/vertexai` a `@google/generative-ai`
   - Obtener API Key de: https://makersuite.google.com/app/apikey
   - Modificar `/functions-sync/agent/agentConfig.js`

### PRIORIDAD 2: Probar agente IA completo
- Una vez resuelto el error, probar flujo completo
- Verificar consultas de fichas técnicas
- Probar creación de órdenes desde chat

### PRIORIDAD 3: Completar fichas técnicas pendientes
- Faltan ~30% de fichas técnicas por subir a Drive
- Una vez subidas, ejecutar desde Google Sheets:
  - ENAR Sync → Fichas Técnicas → Sincronizar fichas técnicas
  - ENAR Sync → Fichas Técnicas → Procesar contenido PDFs (IA)
  - ENAR Sync → Fichas Técnicas → Vincular fichas con productos

---

## Contacto / Recursos

- **Portal Suite:** https://enar-b2b.web.app/portal.html
- **Google Sheet:** https://docs.google.com/spreadsheets/d/1CgHOL7scCsqRQJVj8kxrAR8cyKIs3Jj6Q9tj8RoPmzM
- **Firebase Console:** https://console.firebase.google.com/project/enar-b2b
- **Cloud Run (chatAgent):** https://console.cloud.google.com/run/detail/us-central1/chatagent?project=enar-b2b
- **Apps Script:** https://script.google.com/d/1Wdp1bWctRX4w22QO01NxDrxlBs9EWfuz7hon0gFS_HL1YRVVQj-GYCdj
- **Carpeta Fichas Técnicas:** https://drive.google.com/drive/folders/1Z_-ofehBnsSVtRw9_RydMSxRn99ykEBz
- **Vertex AI APIs:** https://console.cloud.google.com/apis/library?project=enar-b2b&q=vertex

---

*Última actualización: 2 Febrero 2026, 21:50 hrs (Sesión nocturna)*
