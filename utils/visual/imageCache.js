import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const CACHE_DIR = join(process.cwd(), 'cache', 'torneos');

/**
 * Obtiene una imagen cacheada o ejecuta el generador.
 * 
 * Estrategia Stale-While-Revalidate:
 * 1. Si la caché existe y es válida → retorna inmediatamente.
 * 2. Si la caché existe pero los datos cambiaron → retorna la caché vieja
 *    y regenera en segundo plano.
 * 3. Si no hay caché → genera y cachea.
 * 
 * @param {string} prefix - Prefijo del torneo
 * @param {string} key - Identificador del tipo de imagen (ej: 'bracket', 'tabla', 'fixture_f1')
 * @param {object} data - Datos actuales para computar hash de validez
 * @param {Function} generator - Función async que genera el buffer PNG
 * @returns {Promise<Buffer>} Buffer PNG
 */
export async function getCachedImage(prefix, key, data, generator) {
    const dir = join(CACHE_DIR, prefix);
    mkdirSync(dir, { recursive: true });

    const dataHash = hashData(data);
    const cachePath = join(dir, `${key}.png`);
    const hashPath = join(dir, `${key}.hash`);

    // Check si la caché existe y es válida
    if (existsSync(cachePath) && existsSync(hashPath)) {
        const cachedHash = readFileSync(hashPath, 'utf-8');
        if (cachedHash === dataHash) {
            return readFileSync(cachePath); // Cache HIT, datos no cambiaron
        }

        // Stale: retornar vieja y regenerar en background
        const staleBuffer = readFileSync(cachePath);
        setImmediate(async () => {
            try {
                const fresh = await generator();
                writeFileSync(cachePath, fresh);
                writeFileSync(hashPath, dataHash);
            } catch (e) {
                console.error(`[Cache] Error regenerando ${key}:`, e);
            }
        });
        return staleBuffer;
    }

    // No hay caché → generar
    const buffer = await generator();
    writeFileSync(cachePath, buffer);
    writeFileSync(hashPath, dataHash);
    return buffer;
}

function hashData(data) {
    return crypto.createHash('md5')
        .update(JSON.stringify(data))
        .digest('hex');
}

/**
 * Invalida toda la caché asociada a un torneo (o una clave en específico si se requiere).
 * Por simplicidad borramos el directorio completo del torneo.
 * @param {string} prefix - Prefijo del torneo
 */
export function invalidateCache(prefix) {
    const dir = join(CACHE_DIR, prefix);
    if (existsSync(dir)) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch (e) {
            console.error(`[Cache] Error al invalidar la caché para ${prefix}:`, e);
        }
    }
}
