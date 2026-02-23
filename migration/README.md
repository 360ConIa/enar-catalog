# 🚀 ENAR CRM - Migración Sheets → Firebase

## GUÍA PASO A PASO

### ✅ PASO 1: Descargar Credenciales

#### 1.1 Firebase Admin SDK

1. Ir a: https://console.firebase.google.com/project/enar-b2b/settings/serviceaccounts/adminsdk
2. Clic en "Generar nueva clave privada"
3. Guardar el archivo descargado como:
   ```bash
   ~/Proyectos_ENAR/enar-catalog/credentials/firebase-admin-key.json
   ```

#### 1.2 Google Sheets API

1. Ir a: https://console.cloud.google.com/apis/credentials?project=enar-b2b
2. Clic en "Crear credenciales" → "Cuenta de servicio"
3. Nombre: `sheets-migration-service`
4. Rol: "Editor"
5. Crear y luego ir a "Claves" → "Agregar clave" → "Crear nueva clave" (JSON)
6. Guardar como:
   ```bash
   ~/Proyectos_ENAR/enar-catalog/credentials/sheets-api-key.json
   ```

#### 1.3 Compartir Spreadsheet con la cuenta de servicio

1. Abrir `sheets-api-key.json`
2. Copiar el valor de `"client_email"` (ej: `sheets-migration-service@enar-b2b.iam.gserviceaccount.com`)
3. Ir a tu Google Sheet: https://docs.google.com/spreadsheets/d/1a-cy3_OSegXeDwEmud7V3SRDlht4S8OAOblg74bPhMw
4. Clic en "Compartir" → Agregar ese email con permisos de **Lector**

---

### ✅ PASO 2: Instalar Dependencias

```bash
cd ~/Proyectos_ENAR/enar-catalog/migration
npm install
```

Esto instalará:
- `firebase-admin` - SDK para Firestore
- `googleapis` - API de Google Sheets
- `cli-progress` - Barra de progreso
- `chalk` - Colores en terminal

---

### ✅ PASO 3: Testing (OBLIGATORIO PRIMERO)

**IMPORTANTE:** Siempre ejecuta primero en modo testing para validar:

```bash
npm run test
```

Esto migrará solo los **primeros 100 registros** de cada hoja.

**Verifica:**
- ¿Se crearon los usuarios en Firebase Auth?
- ¿Los documentos tienen los campos correctos en Firestore?
- ¿Hay errores en la consola?

---

### ✅ PASO 4: Migración por Módulos (Recomendado)

Si el testing fue exitoso, migra por partes:

```bash
# Solo clientes (más seguro)
node migrate.js --clientes

# Verificar en Firebase Console que se crearon correctamente

# Solo productos
node migrate.js --productos

# Solo órdenes
node migrate.js --ordenes
```

---

### ✅ PASO 5: Migración Completa (Opcional)

Si prefieres migrar todo de una vez:

```bash
node migrate.js --full
```

---

## 📊 VERIFICACIÓN POST-MIGRACIÓN

### En Firebase Console

1. **Ir a:** https://console.firebase.google.com/project/enar-b2b/firestore/data

2. **Verificar colecciones:**
   - `usuarios/` → Debería tener ~500-1000 documentos
   - `productos/` → Ya existía (solo actualizados)
   - `ordenes/` → Debería tener ~2000+ documentos

3. **Verificar un documento de usuario:**
   ```javascript
   {
     email: "cliente@empresa.com",
     nombre: "Ferretería El Sol",
     nit: "900123456-7",
     telefono: "3001234567",
     ubicacion: "Bogotá",
     direccion: "Calle 123 #45-67",
     tipo_cliente: "Ferretería",
     estado: "aprobado",
     lista_precios: "L1",
     ruta: "Ruta Norte",
     creado_por: "ventas@enar.com.co",
     created_at: Timestamp,
     migrated_from_sheets: true,
     sheets_id_cliente: "900123456-7"
   }
   ```

4. **Verificar una orden:**
   ```javascript
   {
     numero_orden: "2025-0001",
     user_id: "firebase_uid",
     items: [
       {
         sku: "AG200",
         nombre: "Adhesivo...",
         cantidad: 10,
         precio_unitario: 45000,
         subtotal: 450000
       }
     ],
     subtotal: 450000,
     iva: 85500,
     total: 535500,
     estado: "pendiente",
     created_at: Timestamp,
     migrated_from_sheets: true
   }
   ```

### En Firebase Auth

1. **Ir a:** https://console.firebase.google.com/project/enar-b2b/authentication/users

2. **Verificar que se crearon usuarios:**
   - Debería haber ~500-1000 usuarios nuevos
   - Con emails reales o temporales (`cliente_XXX@enar-temporal.com`)
   - Estado: "Habilitado"

---

## ⚠️ TROUBLESHOOTING

### Error: "Usuario ya existe en Auth"

✅ **Normal** - El script detecta usuarios existentes y solo actualiza Firestore.

### Error: "Cliente XXX no encontrado" al migrar órdenes

⚠️ **Problema:** La orden tiene un `ID_Cliente` que no existe en la hoja Clientes.

**Solución:**
1. Revisar la hoja `Órdenes_Compra` para ver qué cliente falta
2. Agregarlo manualmente a Clientes primero
3. Re-ejecutar migración de órdenes

### Error: "Permission denied" en Sheets API

⚠️ **Problema:** No compartiste el Spreadsheet con la cuenta de servicio.

**Solución:**
1. Abrir `sheets-api-key.json`
2. Copiar el `client_email`
3. Compartir el Sheet con ese email (permisos de Lector)

### Error: "Cannot read property 'values' of undefined"

⚠️ **Problema:** El nombre de la hoja no coincide o no existe.

**Solución:**
1. Verificar que las hojas se llamen exactamente:
   - `Clientes` (no "clientes" ni "CLIENTES")
   - `Productos`
   - `Órdenes_Compra`
   - `Detalle_Órdenes`

---

## 🔄 ROLLBACK (Si algo sale mal)

### Eliminar datos migrados

```bash
# Conectar a Firebase Console
# Ir a Firestore
# Filtrar por: migrated_from_sheets == true
# Seleccionar todos → Eliminar
```

O usar script de rollback:

```javascript
// rollback.js (crear si es necesario)
const admin = require('firebase-admin');
admin.initializeApp(/* ... */);
const db = admin.firestore();

async function rollback() {
  // Eliminar usuarios migrados
  const usuarios = await db.collection('usuarios')
    .where('migrated_from_sheets', '==', true)
    .get();

  const batch = db.batch();
  usuarios.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log('Rollback completado');
}

rollback();
```

---

## 📝 LOGS

El script imprime logs detallados:
- ✅ Verde: Éxito
- ⚠️ Amarillo: Advertencia
- ❌ Rojo: Error

Guardar logs en archivo (opcional):

```bash
node migrate.js --full > migracion.log 2>&1
```

---

## 🎯 SIGUIENTE PASO

Una vez completada la migración, el siguiente paso es:
**Semana 2: Crear Firebase Functions** (recalcular métricas, generar CSV, enviar emails)

Archivo: `../functions-sync/crm-functions.js` (próximo a crear)

---

**Creado por:** Claude (Anthropic)
**Fecha:** 2025-02-23
**Proyecto:** ENAR CRM - Migración a Firebase
