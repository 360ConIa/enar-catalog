---
name: verificar-precios
description: Verifica en Firestore que los precios por lista de los productos cuadran con la fórmula de configuracion/listas_precios (incremento, IVA y skus_excepcion). Solo lectura. Úsala tras cambios de precios, IVA o carga masiva.
argument-hint: "[activos | todos] [cod_interno …]"
---

# Verificar precios

Argumentos: $ARGUMENTS. Por defecto, solo productos con `activo == true`; `todos` revisa la colección completa. Si se dan `cod_interno`, muestra su desglose.

**Solo lectura.** Únicamente `get()` y consultas. Prohibido `set`, `update`, `add`, `delete`, `batch`, `runTransaction` y ejecutar scripts de `migration/` (varios escriben). No crees archivos dentro del repo.

## Fórmula

Para cada lista de `configuracion/listas_precios` con `activa !== false` y `campo_firestore` definido:

    incremento = cod_interno termina en algún sufijo de skus_excepcion
                   ? (incremento_excepcion || incremento || 0)
                   : (incremento || 0)
    esperado   = round(precio_lista × (1 + incremento/100) × (1 + iva/100))

Es la misma fórmula del panel admin y de `migration/recalcular-precios-listas.js`. Los productos sin `precio_lista` (o con `precio_lista <= 0`) se cuentan aparte, no como error.

## Pasos

1. Crea una carpeta temporal fuera del repo (`mktemp -d`, o el scratchpad de la sesión) y escribe allí `verificar.js`:

   ```js
   const admin = require(process.env.REPO + '/migration/node_modules/firebase-admin');
   admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
   const db = admin.firestore();
   const args = process.argv.slice(2);
   const TODOS = args.includes('todos');
   const DETALLE = args.filter(a => a !== 'todos' && a !== 'activos');
   (async () => {
     const cfg = await db.collection('configuracion').doc('listas_precios').get();
     const listas = (cfg.data().listas || []).filter(l => l.activa !== false && l.campo_firestore);
     console.log('Listas:', listas.map(l => `${l.campo_firestore} +${l.incremento}% iva ${l.iva}% exc ${JSON.stringify(l.skus_excepcion || [])}→${l.incremento_excepcion}`).join(' | '));
     const q = TODOS ? db.collection('productos') : db.collection('productos').where('activo', '==', true);
     const snap = await q.get();
     let ok = 0, sinBase = 0; const malos = [];
     snap.forEach(d => {
       const p = d.data(); const cod = String(p.cod_interno || d.id);
       if (!p.precio_lista || p.precio_lista <= 0) { sinBase++; return; }
       let bien = true; const fila = [];
       for (const l of listas) {
         const exc = (l.skus_excepcion || []).some(s => cod.endsWith(s));
         const inc = exc ? (l.incremento_excepcion || l.incremento || 0) : (l.incremento || 0);
         const esp = Math.round(p.precio_lista * (1 + inc / 100) * (1 + (l.iva || 0) / 100));
         fila.push(`${l.campo_firestore}=${p[l.campo_firestore]} (esperado ${esp})`);
         if (p[l.campo_firestore] !== esp) { bien = false; malos.push(`${cod} ${l.campo_firestore}: ${p[l.campo_firestore]} ≠ ${esp}`); }
       }
       if (DETALLE.includes(cod)) console.log(`${cod} precio_lista=${p.precio_lista} activo=${p.activo}\n  ${fila.join('\n  ')}`);
       if (bien) ok++;
     });
     console.log(`${TODOS ? 'Productos' : 'Activos'}: ${snap.size} · cuadran: ${ok} · sin precio_lista: ${sinBase} · discrepancias: ${malos.length}`);
     malos.slice(0, 30).forEach(m => console.log('  ' + m));
     process.exit(0);
   })().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
   ```

2. Ejecuta desde la carpeta temporal: `REPO=<raíz del repo> node verificar.js <argumentos>`.
   Si falla la autenticación, indica `gcloud auth application-default login` y detente.

## Resultado

Máximo 5 líneas: valores de las listas (incremento e IVA), total revisado, cuántos cuadran, cuántos sin `precio_lista` y discrepancias (las primeras, si hay). Si se pidieron SKU, su desglose.
