import Segunda from '../models/Segunda.js';

async function run() {
  const userId = '1495584399725432883';
  const ligas = await Segunda.find({});
  console.log(`Encontradas ${ligas.length} ligas.`);
  
  for (const liga of ligas) {
    let matchesDeleted = 0;
    if (!liga.partidos) continue;

    for (const fecha of liga.partidos) {
      const matchKey = fecha.partidos ? 'partidos' : (fecha.encuentros ? 'encuentros' : null);
      if (!matchKey) continue;

      const initialCount = fecha[matchKey].length;
      fecha[matchKey] = fecha[matchKey].filter(p => 
        p.localId !== userId && p.visitanteId !== userId
      );
      matchesDeleted += (initialCount - fecha[matchKey].length);
    }
    
    if (matchesDeleted > 0) {
      await liga.save();
      console.log(`Liga "${liga.nombreLiga}": Se eliminaron ${matchesDeleted} partidos.`);
    } else {
      console.log(`Liga "${liga.nombreLiga}": No se encontraron partidos para el usuario ${userId}.`);
    }
  }
}

run().catch(console.error);
