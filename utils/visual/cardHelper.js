import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { generarCarta } from './cardGenerator.js';

/**
 * Obtiene el buffer base64 de la carta de un jugador o coach.
 * Busca en caché local antes de generar una nueva.
 */
export const getCardB64 = async (client, miembro, eqRef) => {
  // 1. Si ya tiene la ruta guardada en el objeto
  if (miembro.carta) {
    try {
      const fullPath = join(process.cwd(), miembro.carta);
      if (existsSync(fullPath)) {
        const buf = readFileSync(fullPath);
        if (buf.length > 0) return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {}
  }

  // 2. Buscar en la carpeta de generadas (ID_hash.png) por si existe aunque no esté en el objeto
  const cacheDir = join(process.cwd(), 'assets', 'cartas', 'generadas');
  if (existsSync(cacheDir)) {
    try {
      const files = readdirSync(cacheDir);
      const existing = files.find(f => f.startsWith(`${miembro.id}_`) && f.endsWith('.png'));
      if (existing) {
        const fullPath = join(cacheDir, existing);
        const buf = readFileSync(fullPath);
        if (buf.length > 0) return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {}
  }

  // 3. Generar si nada de lo anterior funcionó
  const user = await client.users.fetch(miembro.id, { force: true }).catch(() => null);
  const avatar = user?.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 }) || null;
  const esCoach = eqRef && eqRef.coach?.id === miembro.id;
  
  const buf = await generarCarta({
    nombre: miembro.nombre,
    id: miembro.id,
    avatar,
    media: miembro.media || 80,
    mediaInicial: miembro.mediaInicial || miembro.media || 80,
    pais: miembro.pais || 'Argentina',
    escudo: eqRef?.escudo || '',
    esCoach,
    stats: miembro.stats,
  });
  
  return `data:image/png;base64,${buf.toString('base64')}`;
};
