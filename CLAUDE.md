# ENAR Catalog - Contexto del Proyecto

## Proyecto
- App B2B de catálogo ENAR con Firebase (Hosting + Firestore + Auth)
- Repo: https://github.com/360ConIa/enar-catalog.git
- Proyecto Firebase: `enar-b2b` (compartido por todas las apps)
- Firebase CLI: `firebase login` requerido antes de deploy

## URLs y Deploy
| App | URL | Deploy | Directorio |
|-----|-----|--------|------------|
| Pedidos B2B | https://enar-b2b.web.app | `firebase deploy --only hosting:b2b` | `public/` |
| Gestión Comercial | https://enar-comercial.web.app | `firebase deploy --only hosting:crm` | `public-crm/` |
| Portal ENAR Digital | https://enar-digital.web.app | `firebase deploy --only hosting:portal` | `public-portal/` |
| Firestore Rules | — | `firebase deploy --only firestore:rules` | `firestore.rules` |

**IMPORTANTE:** Deploy de functions falla por `rolldown_runtime.js` → usar siempre `--only hosting,firestore:rules` (nunca `firebase deploy` sin filtro).

## Arquitectura
- Frontend puro (HTML/JS), sin framework
- Firebase Auth + Firestore (mismo proyecto `enar-b2b` para las 3 apps)
- Firebase CDN v10.7.1 (imports ESM inline en cada módulo)
- Roles: admin, gestor, vendedor, despachos, cliente
- Estados usuario: pendiente, aprobado, rechazado
- Admin email hardcoded: `sebastianbumq@enarapp.com`

## Estructura de archivos
```
enar-catalog/
├── public/                  # App B2B (Pedidos)
│   ├── js/                  # ordenes.js, productos.js, vendedor.js, usuario.js, etc.
│   ├── admin.html           # Panel admin monolítico (~1700 líneas)
│   ├── index.html           # Catálogo B2B
│   └── vendedor.html        # Panel vendedor
├── public-crm/              # App CRM (Gestión Comercial)
│   ├── js/                  # crm-ordenes.js, crm-clientes.js, crm-utils.js, etc.
│   ├── css/crm-styles.css   # Estilos compartidos CRM
│   ├── index.html           # Portal CRM con auth gate
│   └── crm-*.html           # Módulos: dashboard, clientes, ordenes, despachos, reportes
├── public-portal/           # Portal ENAR Digital (landing estática, sin auth)
│   └── index.html
├── functions-sync/          # Cloud Functions (sync productos)
├── migration/               # Scripts migración GAS → Firebase
│   └── migrate.js           # --clientes, --productos, --ordenes, --metricas, --full, --test
├── firestore.rules
├── firebase.json            # 3 hosting targets: b2b, crm, portal
└── .firebaserc              # Target mapping
```

## CRM Gestión Comercial (`public-crm/`)

### Módulos
| Módulo | JS | HTML |
|--------|-----|------|
| Dashboard | crm-dashboard.js | crm-dashboard.html |
| Clientes | crm-clientes.js | crm-clientes.html |
| Órdenes | crm-ordenes.js | crm-ordenes.html |
| Despachos | crm-despachos.js | crm-despachos.html |
| Reportes | crm-reportes.js | crm-reportes.html |

### Patrones CRM
- Cada módulo JS inicializa Firebase inline (sin shared config)
- Auth redirect: `index.html` (portal CRM con login), NO `login.html`
- Utils compartido: `js/crm-utils.js` exporta `$`, `debounce`, `Paginador`, `formatearPrecio`, `badgeEstado`, etc.
- Menú activo: color rojo `#D9232D` (inline style en cada HTML)
- `$()` = `document.getElementById()`

### Órdenes CRM — Lógica clave
- **Precarga**: clientes y productos se cargan al iniciar la página en arrays en memoria
- **Búsqueda**: filtrado en memoria (NO queries Firestore por cada tecleo)
- **Precios** (`obtenerPrecioCliente(producto, cliente)`):
  1. Por `tipo_cliente`: `mayorista` → `precio_mayorista`, `negocio` → `precio_negocio`, `persona_natural` → `precio_persona_natural`
  2. Fallback `lista_precios`: `Precio_L1`, `Precio_L4`, `Precio_L7`, `Precio_L8`, `Precio_L9`, `Precio_L10`
  3. Fallback final: `p_real` → `p_corriente`
- **Cliente en tabla**: `nombreCliente(o)` / `nitCliente(o)` resuelven desde `o.clienteNombre` (CRM) o `o.cliente.razon_social` (B2B)

## Campos clave Firestore

### Colección `usuarios`
- `email`, `nombre`, `nit`, `razon_social`, `tipo_cliente`, `estado`, `rol`
- `ubicacion` (no `ciudad`), `lista_precios` (no `lista_precio`), `sheets_id_cliente`
- Usuarios auto-registrados: NO tienen `creado_por`
- Usuarios creados por gestor: SÍ tienen `creado_por`

### Colección `productos`
- `cod_interno`, `titulo`, `marca`, `ean`, `cantidad`, `imagen_principal`, `activo`
- Precios B2B: `precio_mayorista`, `precio_negocio`, `precio_persona_natural`, `precio_lista`
- Precios sync: `p_real`, `p_corriente`, `impuesto`
- Precios migrados: `Precio_L1`, `Precio_L4`, `Precio_L7`, `Precio_L8`, `Precio_L9`, `Precio_L10`

### Colección `ordenes`
- Órdenes CRM: `clienteNombre`, `clienteNit`, `creadaPor`, `creadaPorEmail`, `tipo: 'orden-vendedor'`
- Órdenes B2B: `cliente: { nombre, razon_social, nit, email, ... }`, `user_id`
- Items: `cod_interno`/`titulo` (CRM/B2B) o `sku`/`nombre` (migrados)
- Estados: pendiente → aprobada → en_proceso → completada/parcial/cancelada

### Otras colecciones
- `metricas_clientes/{uid}` — salud, ABC, riesgo, tendencia, dias_sin_compra
- `chat_ordenes/` — mensajes real-time por orden
- `carrito/{userId}` — carrito B2B

## Firestore Rules — Resumen
- `isAdmin()`: email == `sebastianbumq@enarapp.com`
- `isCRM()`: admin || vendedor || despachos || gestor
- Órdenes create: admin (cualquiera) || vendedor (creadaPor==uid) || cliente aprobado (user_id==uid)
- Productos: read público, write solo admin
- Usuarios: vendedores/despachos pueden leer usuarios aprobados

## Migración GAS → Firebase
- Script: `migration/migrate.js`
- Requiere: `credentials/firebase-admin-key.json` + `credentials/sheets-api-key.json`
- Spreadsheet: `1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw`
- Repo GAS antiguo (no relacionado): ruta local `/Users/jota2002/Proyectos_ENAR/ENAR-CRM`

## Convenciones
- Siempre hacer deploy después de cambios (no dejar a medias)
- Color institucional rojo: `#D9232D`
- Gradiente header: `#1e3a8a → #3b82f6`
- Commit style: `feat:`, `fix:`, `docs:` + descripción en español
