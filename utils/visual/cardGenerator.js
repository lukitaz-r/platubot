import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { getFlagUrl } from './countryHelper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '../../assets/cartas/generadas');

// Asegurar que existe el directorio de caché
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const sData = {
  canvas: { width: 1080, height: 1640 },
  images: [
    { id: "equipo", x: 162, y: 670, width: 200, height: 200 },
    { id: "pais", x: 162, y: 508, width: 199, height: 124 },
    { id: "media", x: 188, y: 150, width: 173, height: 244 },
    { id: "ACT", x: 155, y: 1060, width: 127, height: 116 },
    { id: "TIR", x: 155, y: 1175, width: 127, height: 116 },
    { id: "PAS", x: 155, y: 1290, width: 127, height: 116 },
    { id: "IQ", x: 605, y: 1060, width: 127, height: 116 },
    { id: "AURA", x: 605, y: 1175, width: 127, height: 116 },
    { id: "ESQ", x: 605, y: 1290, width: 127, height: 116 },
    { id: "nombre", x: 418, y: 870, width: 300, height: 200 },
    { id: "posicion", x: 190, y: 395, width: 150, height: 95 }
  ]
};

const positions = {};
sData.images.forEach(img => {
    positions[img.id] = img;
});

// ── Cargar fuentes ──────────────────────────────────────────────────────────
let openSansFontData = null;
let dinProFontData = null;

async function getFonts() {
  if (!openSansFontData) {
      try {
          const res = await fetch('https://fonts.gstatic.com/s/opensans/v34/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.ttf');
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          openSansFontData = Buffer.from(await res.arrayBuffer());
      } catch(e) {
          try { openSansFontData = fs.readFileSync(path.join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf')); } catch(err) { }
      }
  }
  if (!dinProFontData) {
      try {
          dinProFontData = fs.readFileSync(path.join(process.cwd(), 'assets', 'fonts', 'DinProCondensedMedium.otf'));
      } catch(e) {
          console.error("No se pudo cargar DinProCondensedMedium.otf", e);
      }
  }
  return { openSans: openSansFontData, dinPro: dinProFontData };
}

async function imageToBase64(src) {
    if (!src) return null;
    try {
        if (src.startsWith('http')) {
            const res = await fetch(src);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const type = res.headers.get('content-type') || 'image/png';
            if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(type.split(';')[0])) return null;
            return `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
        } else {
            const fullPath = src.startsWith('data:') ? src : path.join(process.cwd(), src);
            if (src.startsWith('data:')) {
                const mime = src.split(';')[0].split(':')[1];
                if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(mime)) return null;
                return src;
            }
            if (fs.existsSync(fullPath)) {
                const ext = path.extname(fullPath).toLowerCase();
                if (ext === '.webp' || ext === '.gif') return null;
                const mimeType = ext === '.svg' ? 'image/svg+xml' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
                const buffer = fs.readFileSync(fullPath);
                return `data:${mimeType};base64,${buffer.toString('base64')}`;
            }
        }
    } catch (e) {
        console.error("Error convirtiendo imagen a b64:", e);
    }
}

export function generarStatsAleatorias(media) {
    let m = Math.floor(media);
    let stats = Array(6).fill(m);
    
    let maxValGlobal = Math.min(99, m + 10);
    let minValGlobal = Math.max(1, m - 20);
    
    // Generar variabilidad intercambiando puntos entre stats
    // Menos iteraciones y transferencias más pequeñas para evitar que se disparen a los extremos siempre
    for (let k = 0; k < 15; k++) {
        let i = Math.floor(Math.random() * 6);
        let j = Math.floor(Math.random() * 6);
        if (i !== j) {
            let amount = Math.floor(Math.random() * 3) + 1; // 1 a 3 puntos
            
            let limitI = maxValGlobal - stats[i];
            let limitJ = stats[j] - minValGlobal;
            
            let transfer = Math.min(amount, limitI, limitJ);
            
            if (transfer > 0) {
                stats[i] += transfer;
                stats[j] -= transfer;
            }
        }
    }
    
    // Mezclar por si acaso
    stats.sort(() => Math.random() - 0.5);
    
    return {
        actividad: stats[0],
        tiro: stats[1],
        pase: stats[2],
        iq: stats[3],
        aura: stats[4],
        esquinazo: stats[5]
    };
}

async function guardarStatsEnBD(id, nuevasStats, esCoach) {
    try {
        const eq = await EquipoSuperliga.findOne(esCoach ? { "coach.id": id } : { "jugadores.id": id });
        if (eq) {
            if (esCoach) {
                eq.coach.stats = nuevasStats;
            } else {
                const idx = eq.jugadores.findIndex(j => j.id === id);
                if (idx !== -1) {
                    eq.jugadores[idx].stats = nuevasStats;
                }
            }
            // Marcamos el documento como modificado (JsonModel no requiere markModified)
            await eq.save();
        }
    } catch (e) {
        console.error("Error guardando stats en BD:", e);
    }
}

async function actualizarCartaEnBD(id, imagePath, esCoach) {
    try {
        const relativePath = path.posix.join('assets', 'cartas', 'generadas', path.basename(imagePath));
        const eq = await EquipoSuperliga.findOne(esCoach ? { "coach.id": id } : { "jugadores.id": id });
        if (eq) {
            if (esCoach) {
                if (eq.coach.carta !== relativePath) {
                    eq.coach.carta = relativePath;
                    await eq.save();
                }
            } else {
                const idx = eq.jugadores.findIndex(j => j.id === id);
                if (idx !== -1 && eq.jugadores[idx].carta !== relativePath) {
                    eq.jugadores[idx].carta = relativePath;
                    await eq.save();
                }
            }
        }
    } catch (e) {
        console.error("Error actualizando carta en BD:", e);
    }
}

export async function generarCarta(data) {
    const { nombre, id, avatar, media, mediaInicial, pais, escudo, esCoach, stats: dataStats } = data;

    // Usar stats de la data, o generar de fallback (aunque la lógica en carta.js ya los asegura)
    let stats = dataStats;
    if (!stats || !stats.actividad) {
        stats = generarStatsAleatorias(mediaInicial || media || 80);
        await guardarStatsEnBD(id, stats, esCoach);
    }

    const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify({ nombre, id, avatar, mediaInicial, pais, escudo, esCoach, stats }))
        .digest('hex').slice(0, 16);

    const cachePath = path.join(CACHE_DIR, `${id}_${dataHash}.png`);

    if (fs.existsSync(cachePath)) {
        try {
            const cachedBuffer = fs.readFileSync(cachePath);
            if (cachedBuffer.length > 0) {
                await actualizarCartaEnBD(id, cachePath, esCoach);
                return cachedBuffer;
            }
        } catch (err) {}
    }

    // Limpiar caché antigua
    try {
        const files = fs.readdirSync(CACHE_DIR);
        files.forEach(f => {
            if (f.startsWith(`${id}_`)) fs.unlinkSync(path.join(CACHE_DIR, f));
        });
    } catch (err) {}

    // Lógica de background
    let bgPath = 'assets/cartas/bronze_bg.png';
    if (mediaInicial >= 82) {
        bgPath = 'assets/cartas/oro_bg.png'
    } else if (mediaInicial >= 75) {
        bgPath = 'assets/cartas/oro.png';
    } else if (mediaInicial >= 72) {
        bgPath = 'assets/cartas/plata_bg.png';
    } else if (mediaInicial >= 65) {
        bgPath = 'assets/cartas/plata.png';
    } else if (mediaInicial >= 60) {
        bgPath = 'assets/cartas/bronze_bg.png';
    } else {
        bgPath = 'assets/cartas/bronze.png';
    }

    const [bgB64, avatarB64, flagB64, escudoB64, fonts] = await Promise.all([
        imageToBase64(bgPath),
        imageToBase64(avatar),
        imageToBase64(getFlagUrl(pais)?.replace('/w160/', '/w320/')), // Reemplazamos w160 por w320 según request
        imageToBase64(escudo),
        getFonts()
    ]);

    // Función auxiliar para renderizar textos con s.json
    const renderTextFromSJson = (idItem, textStr, sizeOverride = null) => {
        const s = positions[idItem];
        if (!s) return null;
        return {
            type: 'div',
            props: {
                style: {
                    position: 'absolute',
                    top: `${s.y}px`,
                    left: `${s.x}px`,
                    width: `${s.width}px`,
                    height: `${s.height}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: sizeOverride || `${s.height}px`,
                    color: '#000', // o '#fff' dependiendo del diseño oro_bg, usualmente el texto es oscuro
                    fontWeight: 700,
                },
                children: textStr,
            },
        };
    };

    const renderImgFromSJson = (idItem, srcB64) => {
        const s = positions[idItem];
        if (!s || !srcB64) return null;
        return {
            type: 'img',
            props: {
                src: srcB64,
                style: {
                    position: 'absolute',
                    top: `${s.y}px`,
                    left: `${s.x}px`,
                    width: `${s.width}px`,
                    height: `${s.height}px`,
                    objectFit: 'contain',
                },
            },
        };
    };

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                width: `${sData.canvas.width}px`,
                height: `${sData.canvas.height}px`,
                position: 'relative',
                fontFamily: '"DinProCondensedMedium", "Open Sans", sans-serif',
                color: '#3d300d', // Un color dorado/oscuro para contrastar con oro_bg si es necesario
            },
            children: [
                // Fondo de la Carta (PNG opaco)
                bgB64 && {
                    type: 'img',
                    props: {
                        src: bgB64,
                        style: {
                            position: 'absolute',
                            top: '0px',
                            left: '0px',
                            width: `${sData.canvas.width}px`,
                            height: `${sData.canvas.height}px`,
                            objectFit: 'fill'
                        }
                    }
                },
                
                // Avatar (encima del fondo, pero detrás de textos/escudos)
                avatarB64 && {
                    type: 'img',
                    props: {
                        src: avatarB64,
                        style: {
                            position: 'absolute',
                            top: `${sData.canvas.height * 0.15}px`, // Aproximado basado en el archivo viejo
                            left: '50%',
                            marginLeft: `-${sData.canvas.width * 0.20}px`,
                            width: `${sData.canvas.width * 0.60}px`,
                            height: `${sData.canvas.width * 0.60}px`,
                            borderRadius: '40%',
                            objectFit: 'cover'
                        },
                    },
                },

                // Textos principales
                renderTextFromSJson('media', Math.round(mediaInicial || media || 80).toString()),
                renderTextFromSJson('posicion', esCoach ? 'DT' : 'JUG'),
                renderTextFromSJson('nombre', nombre.replace(/[^\p{L}\p{N}\s\-_\.]/gu, '').trim().toUpperCase(), `${positions['nombre']?.height * 0.7}px`),
                
                // Stats
                renderTextFromSJson('ACT', stats.actividad.toString()),
                renderTextFromSJson('TIR', stats.tiro.toString()),
                renderTextFromSJson('PAS', stats.pase.toString()),
                renderTextFromSJson('IQ', stats.iq.toString()),
                renderTextFromSJson('AURA', stats.aura.toString()),
                renderTextFromSJson('ESQ', stats.esquinazo.toString()),

                // Imágenes
                renderImgFromSJson('pais', flagB64),
                renderImgFromSJson('equipo', escudoB64)
            ].filter(Boolean),
        },
    };

    const satoriFonts = [];
    if (fonts.dinPro) {
        satoriFonts.push({ name: 'DinProCondensedMedium', data: fonts.dinPro, weight: 700, style: 'normal' });
        satoriFonts.push({ name: 'DinProCondensedMedium', data: fonts.dinPro, weight: 700, style: 'normal' });
    }
    if (fonts.openSans) {
        satoriFonts.push({ name: 'Open Sans', data: fonts.openSans, weight: 700, style: 'normal' });
    }

    const svg = await satori(element, {
        width: sData.canvas.width,
        height: sData.canvas.height,
        fonts: satoriFonts.length > 0 ? satoriFonts : [{ name: 'sans-serif', data: Buffer.from([]), weight: 700, style: 'normal' }], // Fallback vacio por si todo falla
        loadAdditionalAsset: async (code, segment) => {
            if (code === 'emoji') {
                const codepoints = [...segment].map(c => c.codePointAt(0).toString(16)).join('-');
                const url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${codepoints}.svg`;
                try {
                    const res = await fetch(url);
                    if (res.ok) return `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString('base64')}`;
                } catch { return undefined; }
            }
            return undefined;
        }
    });

    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: sData.canvas.width }, // no escalar al doble para no sobrecargar si no hace falta, o dejamos * 2
    });

    const imageBuffer = resvg.render().asPng();

    fs.writeFileSync(cachePath, imageBuffer);
    await actualizarCartaEnBD(id, cachePath, esCoach);

    return imageBuffer;
}
