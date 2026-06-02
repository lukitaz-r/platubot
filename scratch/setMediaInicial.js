import fs from 'fs';
import path from 'path';

// Rutas de archivos
const filePath = path.resolve('data/EquipoSuperliga.json');
const backupPath = path.resolve('data/EquipoSuperliga.backup.json');

console.log('=== SCRIPT PARA ACTUALIZAR MEDIA INICIAL ===\n');

try {
  // 1. Verificar existencia del archivo
  if (!fs.existsSync(filePath)) {
    console.error(`Error: No se encontró el archivo en la ruta: ${filePath}`);
    process.exit(1);
  }

  // 2. Leer el archivo JSON
  console.log(`Leyendo datos de: ${filePath}...`);
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const teams = JSON.parse(rawData);

  // 3. Crear copia de seguridad antes de modificar
  fs.writeFileSync(backupPath, rawData, 'utf-8');
  console.log(`Copia de seguridad creada correctamente en: ${backupPath}`);

  // 4. Modificar los datos
  let totalEquipos = 0;
  let totalJugadoresModificados = 0;

  for (const team of teams) {
    if (team && Array.isArray(team.jugadores)) {
      totalEquipos++;
      for (const player of team.jugadores) {
        // Validamos que tenga la propiedad media
        if (player && player.media !== undefined && player.media !== null) {
          const originalMediaInicial = player.mediaInicial;
          const mediaVal = typeof player.media === 'string' ? parseFloat(player.media) : player.media;
          
          if (!isNaN(mediaVal)) {
            // Truncamos el valor (sin decimales)
            const nuevaMediaInicial = Math.trunc(mediaVal);
            
            if (originalMediaInicial !== nuevaMediaInicial) {
              player.mediaInicial = nuevaMediaInicial;
              totalJugadoresModificados++;
              console.log(`  [Actualizado] ${player.nombre} (ID: ${player.id || 'N/A'}): media = ${player.media} -> mediaInicial seteado a ${nuevaMediaInicial} (antes: ${originalMediaInicial})`);
            }
          }
        }
      }
    }
  }

  // 5. Guardar los cambios si hubo modificaciones
  if (totalJugadoresModificados > 0) {
    fs.writeFileSync(filePath, JSON.stringify(teams, null, 2), 'utf-8');
    console.log(`\n¡Cambios guardados con éxito en ${filePath}!`);
  } else {
    console.log('\nNo se requirieron cambios (todos los jugadores ya tenían mediaInicial sincronizada y truncada).');
  }

  console.log(`\nResumen del proceso:`);
  console.log(`- Equipos analizados: ${totalEquipos}`);
  console.log(`- Jugadores actualizados: ${totalJugadoresModificados}`);

} catch (error) {
  console.error('\nOcurrió un error inesperado durante el procesamiento:', error);
}
