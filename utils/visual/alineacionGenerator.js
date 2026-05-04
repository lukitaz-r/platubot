import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Coordenadas hardcodeadas (trasladadas desde s.json)
const POSITIONS = {
    dt_local:           { x: 1226, y: 459, width: 160, height: 242 },
    jugador_local1:     { x: 376,  y: 292, width: 146, height: 222 },
    jugador_local2:     { x: 619,  y: 443, width: 146, height: 222 },
    jugador_local3:     { x: 868,  y: 291, width: 146, height: 222 },
    dt_visitante:       { x: 145,  y: 0,   width: 132, height: 200 },
    jugador_visitante1: { x: 383,  y: 64,  width: 132, height: 200 },
    jugador_visitante2: { x: 634,  y: 0,   width: 132, height: 200 },
    jugador_visitante3: { x: 876,  y: 64,  width: 132, height: 200 },
    escudo_local:       { x: 51,   y: 487, width: 180, height: 180 },
    escudo_visitante:   { x: 1110, y: 11,  width: 135, height: 135 },
};

const CANVAS = { width: 1400, height: 714 };
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let fontData = null;
const getFont = async () => {
    if (fontData) return fontData;
    try { fontData = readFileSync(join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf')); }
    catch {
        try {
            const res = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf');
            if (res.ok) fontData = Buffer.from(await res.arrayBuffer());
        } catch {}
    }
    return fontData;
};

function toBase64(src) {
    if (!src) return TRANSPARENT_PNG;
    if (src.startsWith('data:')) return src;
    if (src.startsWith('http')) return src; // Satori handles URLs
    try {
        const fullPath = src.startsWith('/') || src.includes(':') ? src : join(process.cwd(), src);
        if (existsSync(fullPath)) {
            const buf = readFileSync(fullPath);
            const ext = fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg') ? 'jpeg' : 'png';
            return `data:image/${ext};base64,${buf.toString('base64')}`;
        }
    } catch {}
    return TRANSPARENT_PNG;
}

/**
 * Genera la imagen de alineación para un partido.
 * 
 * @param {Object} params
 * @param {string} params.bgPath - Path al fondo (assets/bg/sl_bg.png)
 * @param {string} params.escudoLocal - Path/URL escudo local
 * @param {string} params.escudoVisitante - Path/URL escudo visitante
 * @param {string} params.dtLocalCard - Base64 de la carta del DT local
 * @param {string} params.dtVisitanteCard - Base64 de la carta del DT visitante
 * @param {Array<string|null>} params.jugadoresLocalCards - Array de 3 base64 de cartas (o nulls)
 * @param {Array<string>} params.jugadoresVisitanteCards - Array de 3 base64 de cartas
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generarAlineacion({
    bgPath = 'assets/bg/sl_bg.png',
    escudoLocal,
    escudoVisitante,
    dtLocalCard,
    dtVisitanteCard,
    jugadoresLocalCards = [null, null, null],
    jugadoresVisitanteCards = [],
}) {
    const font = await getFont();
    const bgB64 = toBase64(bgPath);

    // Build positioned elements
    const positionedElements = [];

    // Background
    positionedElements.push({
        type: 'img',
        props: {
            src: bgB64,
            style: { position: 'absolute', top: 0, left: 0, width: `${CANVAS.width}px`, height: `${CANVAS.height}px`, objectFit: 'cover' }
        }
    });

    // Helper: place a card image at a specific position
    const placeCard = (posKey, cardB64) => {
        const pos = POSITIONS[posKey];
        if (!pos || !cardB64) return;
        
        positionedElements.push({
            type: 'img',
            props: {
                src: cardB64,
                style: {
                    position: 'absolute',
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: `${pos.width}px`,
                    height: `${pos.height}px`,
                    objectFit: 'contain',
                }
            }
        });
    };

    // Place shields
    const placeShield = (posKey, src) => {
        const pos = POSITIONS[posKey];
        if (!pos || !src) return;
        positionedElements.push({
            type: 'img',
            props: {
                src: toBase64(src),
                style: {
                    position: 'absolute',
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: `${pos.width}px`,
                    height: `${pos.height}px`,
                    objectFit: 'contain',
                }
            }
        });
    };

    placeShield('escudo_local', escudoLocal);
    placeShield('escudo_visitante', escudoVisitante);

    // DTs
    placeCard('dt_local', dtLocalCard);
    placeCard('dt_visitante', dtVisitanteCard);

    // Visitantes (siempre los 3)
    for (let i = 0; i < 3; i++) {
        if (jugadoresVisitanteCards[i]) {
            placeCard(`jugador_visitante${i + 1}`, jugadoresVisitanteCards[i]);
        }
    }

    // Locales (progresivo, puede ser null)
    for (let i = 0; i < 3; i++) {
        if (jugadoresLocalCards[i]) {
            placeCard(`jugador_local${i + 1}`, jugadoresLocalCards[i]);
        }
    }

    const element = {
        type: 'div',
        props: {
            style: {
                position: 'relative',
                width: `${CANVAS.width}px`,
                height: `${CANVAS.height}px`,
                display: 'flex',
                fontFamily: 'Inter',
            },
            children: positionedElements
        }
    };

    const svg = await satori(element, {
        width: CANVAS.width,
        height: CANVAS.height,
        fonts: font ? [{ name: 'Inter', data: font, weight: 700, style: 'normal' }] : [],
    });

    return new Resvg(svg, { fitTo: { mode: 'width', value: CANVAS.width * 2 } }).render().asPng();
}
