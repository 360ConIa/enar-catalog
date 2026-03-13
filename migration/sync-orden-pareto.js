/**
 * ENAR - Asignar orden Pareto a productos
 * Asigna un campo orden_pareto (1, 2, 3...) a los productos prioritarios.
 * Productos fuera de la lista reciben 9999 para quedar al final.
 *
 * Uso:
 *   node sync-orden-pareto.js --test
 *   node sync-orden-pareto.js --ejecutar
 */

const admin = require('firebase-admin');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

const MODE_TEST = process.argv.includes('--test');
const MODE_EJECUTAR = process.argv.includes('--ejecutar');

if (!MODE_TEST && !MODE_EJECUTAR) {
  console.log(chalk.red('\n❌ Debes especificar: --test o --ejecutar\n'));
  process.exit(1);
}

// Lista de IDs Pareto en orden de prioridad
const IDS_PARETO = [
  'FC300','GC300','SR','XC','KG300','XX','XG','SS','SÑ','SX',
  'EQ','XZ','QG','KX300','FB300','XA','VC300','SD','LR','FG300',
  'KG400','LX','GB300','AG400','KX400','SZ','XB','HC300','GC1','GG300',
  '-C-G','QX','LÑ','-Q-C300','FX300','SG5','LM','AX400','LS','-P-G500',
  'KZ300','IC500','JC300','EG','AG500','HC1','GX300','CW100','AG300','TG01',
  'QC','KG01','CW06','CL100','CW400','AX300','KZ400','AX500','KG200','UG',
  'TG500','BX','CW200','OFXA','BG','CW600','TG100','KD300','AG200','UX',
  'HB300','CL600','KG114','CL06','EC','KG612','MC','VB300','CW01','KX907',
  'PW','HG300','CL400','CL200','KD400','KG907','GC2','KG500','KX200','-Q-G300',
  'ZG','PY','CW800','IC201','-P-G501','-P-G100','VK300','CL01','NR','UZ',
  'VK400','RG5','AG600','AX200','NS','WG600','R-AR'
];

const BATCH_SIZE = 500;

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'enar-b2b' });
const db = admin.firestore();

async function main() {
  console.log(chalk.blue.bold('\n📊 ENAR - Sync Orden Pareto\n'));
  console.log(MODE_TEST ? chalk.yellow('⚠️  MODO TEST\n') : chalk.red.bold('🔴 MODO EJECUTAR\n'));
  console.log(chalk.gray('   ' + IDS_PARETO.length + ' productos en lista Pareto\n'));

  const snap = await db.collection('productos').where('activo', '==', true).get();
  console.log(chalk.green('   ✅ ' + snap.size + ' productos activos\n'));

  // Crear mapa de posición Pareto
  const paretoMap = new Map();
  IDS_PARETO.forEach((id, i) => paretoMap.set(id, i + 1));

  const cambios = [];
  let sinCambio = 0;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const nuevaPos = paretoMap.get(docSnap.id) || 9999;
    const actualPos = data.orden_pareto;

    if (actualPos === nuevaPos) {
      sinCambio++;
      return;
    }

    cambios.push({
      id: docSnap.id,
      titulo: data.titulo || docSnap.id,
      pos: nuevaPos,
      antes: actualPos
    });
  });

  // Verificar IDs Pareto que no existen como activos
  const activosSet = new Set();
  snap.forEach(doc => activosSet.add(doc.id));
  const noEncontrados = IDS_PARETO.filter(id => !activosSet.has(id));

  console.log(chalk.green('   ✅ Con cambios:    ' + cambios.length));
  console.log(chalk.gray('   ⚪ Sin cambio:     ' + sinCambio));
  if (noEncontrados.length > 0) {
    console.log(chalk.yellow('   ⚠️  IDs Pareto no encontrados (' + noEncontrados.length + '): ' + noEncontrados.join(', ')));
  }
  console.log('');

  // Muestra
  const paretoChanges = cambios.filter(c => c.pos < 9999).slice(0, 10);
  if (paretoChanges.length > 0) {
    console.log(chalk.cyan.bold('Primeros Pareto:'));
    paretoChanges.forEach(c => console.log(chalk.cyan('   #' + c.pos + ' ' + c.id + ' — ' + c.titulo)));
    console.log('');
  }

  if (MODE_TEST) {
    console.log(chalk.yellow.bold('═══════════════════════════════════════'));
    console.log(chalk.yellow.bold('   DRY-RUN COMPLETADO'));
    console.log(chalk.yellow.bold('═══════════════════════════════════════\n'));
  } else {
    if (cambios.length === 0) {
      console.log(chalk.green('   No hay cambios.\n'));
    } else {
      const progressBar = new cliProgress.SingleBar({
        format: 'Progreso |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });
      progressBar.start(cambios.length, 0);
      let procesados = 0;

      for (let i = 0; i < cambios.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = cambios.slice(i, i + BATCH_SIZE);
        for (const c of chunk) {
          batch.update(db.collection('productos').doc(c.id), { orden_pareto: c.pos });
        }
        await batch.commit();
        procesados += chunk.length;
        progressBar.update(procesados);
      }
      progressBar.stop();
      console.log(chalk.green('\n   ✅ ' + procesados + ' productos actualizados\n'));
    }
  }
}

main().catch(e => { console.error(chalk.red('❌ ' + e.message)); process.exit(1); });
