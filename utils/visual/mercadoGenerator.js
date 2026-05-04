import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

// Helper for local images/fonts
const getAssetAsBase64 = (relativePath) => {
    try {
        const buffer = fs.readFileSync(path.join(process.cwd(), relativePath));
        const ext = path.extname(relativePath).replace('.', '') || 'png';
        return `data:image/${ext};base64,${buffer.toString('base64')}`;
    } catch { return null; }
};

const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const getLogoAsync = async (src) => {
    if (!src) return TRANSPARENT_PNG;
    if (src.startsWith('data:')) return src;
    if (src.startsWith('http')) {
        try {
            const res = await fetch(src);
            if (!res.ok) return TRANSPARENT_PNG;
            const type = res.headers.get('content-type') || 'image/png';
            const buffer = Buffer.from(await res.arrayBuffer());
            return `data:${type};base64,${buffer.toString('base64')}`;
        } catch { return TRANSPARENT_PNG; }
    }
    const local = getAssetAsBase64(src);
    return local || TRANSPARENT_PNG;
};

let fontBold = null;
const getFont = async () => {
    if (fontBold) return fontBold;
    try { fontBold = fs.readFileSync(path.join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf')); } 
    catch(e) {
        try {
            const res = await fetch('https://fonts.gstatic.com/s/opensans/v34/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.ttf');
            if (res.ok) fontBold = Buffer.from(await res.arrayBuffer());
        } catch(e2) {}
    }
    return fontBold;
};

const formatCurrency = (num) => {
    if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return num.toString();
};

/**
 * Genera una imagen del mercado para un equipo o agentes libres.
 * @param {string} titulo - Nombre del equipo o "Agentes Libres"
 * @param {string} escudoSrc - Ruta o URL del escudo
 * @param {Array} jugadores - [{ cardB64, valor, salario, nombre }]
 */
export const generarImagenMercado = async (titulo, escudoSrc, jugadores) => {
    const cardWidth = 300;
    const cardHeight = 455;
    const gap = 40;
    const padding = 60;
    const headerHeight = 150;
    
    // Calculamos el ancho dinámico según cantidad de jugadores (máx 4 por fila usualmente, pero aquí lo haremos lineal)
    const width = Math.max(1000, jugadores.length * (cardWidth + gap) + padding * 2);
    const height = headerHeight + cardHeight + 250; // Espacio extra para stats debajo
    
    const logoBase64 = await getLogoAsync(escudoSrc);
    const font = await getFont();

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`,
                backgroundColor: '#0a0a0c', padding: `${padding}px`, fontFamily: 'sans-serif',
                backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0c 70%)'
            },
            children: [
                // Header
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '60px', borderBottom: '2px solid #22c55e', paddingBottom: '30px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '100px', height: '100px', objectFit: 'contain', marginRight: '30px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#ffffff', fontSize: '50px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px' }, children: titulo } },
                                        { type: 'span', props: { style: { color: '#22c55e', fontSize: '20px', fontWeight: 700, letterSpacing: '4px' }, children: 'MERCADO DE PASES' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                // Grid de jugadores
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', justifyContent: 'center', gap: `${gap}px`, width: '100%' },
                        children: jugadores.map(j => ({
                            type: 'div',
                            props: {
                                style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${cardWidth}px` },
                                children: [
                                    { type: 'img', props: { src: j.cardB64, style: { width: `${cardWidth}px`, height: `${cardHeight}px`, objectFit: 'contain', marginBottom: '20px' } } },
                                    // Info debajo
                                    {
                                        type: 'div',
                                        props: {
                                            style: { 
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', 
                                                backgroundColor: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px',
                                                width: '90%', border: '1px solid rgba(255,255,255,0.1)'
                                            },
                                            children: [
                                                { 
                                                    type: 'div', 
                                                    props: { 
                                                        style: { display: 'flex', alignItems: 'center', marginBottom: '5px' },
                                                        children: [
                                                            { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginRight: '10px' }, children: 'VALOR:' } },
                                                            { type: 'span', props: { style: { color: '#fbbf24', fontSize: '20px', fontWeight: 800 }, children: `$${formatCurrency(j.valor)}` } }
                                                        ]
                                                    }
                                                },
                                                { 
                                                    type: 'div', 
                                                    props: { 
                                                        style: { display: 'flex', alignItems: 'center' },
                                                        children: [
                                                            { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginRight: '10px' }, children: 'SUELDO:' } },
                                                            { type: 'span', props: { style: { color: '#60a5fa', fontSize: '18px', fontWeight: 700 }, children: `$${formatCurrency(j.salario)}` } }
                                                        ]
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        }))
                    }
                }
            ]
        }
    };

    const svg = await satori(element, { width, height, fonts: font ? [{ name: 'sans-serif', data: font, weight: 700 }] : [] });
    return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
};
