/**
 * renderPool.js
 * Singleton del pool de workers Piscina para generación de imágenes.
 * Se inicializa una sola vez y se reutiliza en toda la vida del proceso.
 */
import Piscina from 'piscina';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Configuración del pool ────────────────────────────────────────────────────
const WORKER_FILE = pathToFileURL(join(__dirname, 'renderWorker.js')).href;

const pool = new Piscina({
    filename: WORKER_FILE,
    minThreads: 2,
    maxThreads: Math.max(2, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1)),
    idleTimeout: 60_000, // Destruir workers inactivos tras 60s
});

pool.on('error', (err) => {
    console.error('[RenderPool] Error en worker thread:', err);
});

// ── Precalentamiento de Workers ───────────────────────────────────────────────
const dummyElement = { type: 'div', props: { children: 'prewarm' } };
Promise.all([
    pool.run({ element: dummyElement, width: 10, height: 10 }),
    pool.run({ element: dummyElement, width: 10, height: 10 })
]).then(() => {
    console.log('[RenderPool] Workers precalentados y listos.');
}).catch((err) => {
    console.error('[RenderPool] Error al precalentar workers:', err);
});

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Renderiza un árbol Satori a PNG en el pool de workers.
 *
 * @param {object} element   - Árbol de elementos Satori
 * @param {number} width     - Ancho en px
 * @param {number} height    - Alto en px
 * @param {object} [opts]
 * @param {number}   [opts.scale=2]        - Factor de escala Resvg (default 2x)
 * @param {string}   [opts.fontSet]        - 'default' | 'card'
 * @returns {Promise<Buffer>} Buffer PNG
 */
export async function renderToBuffer(element, width, height, opts = {}) {
    const { scale = 2, fontSet = 'default' } = opts;
    const result = await pool.run({ element, width, height, scale, fontSet });
    return Buffer.from(result);
}

export { pool };
