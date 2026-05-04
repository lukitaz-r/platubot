import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getFlagUrl } from './countryHelper.js';

// ── Cargar fuente ──────────────────────────────────────────────────────────
let fontData;
try {
  fontData = readFileSync(join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf'));
} catch {
  fontData = null;
}

async function getFontData() {
  if (fontData) return fontData;
  const res = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf');
  fontData = Buffer.from(await res.arrayBuffer());
  return fontData;
}

// ── Helpers Visuales ────────────────────────────────────────────────────────

function avatarElement(url, nombre, t, size = 32) {
    const flagUrl = getFlagUrl(nombre);
    const finalUrl = url || flagUrl;

    if (finalUrl) {
        return {
            type: 'img',
            props: {
                src: finalUrl,
                width: size,
                height: size,
                style: { borderRadius: '50%', objectFit: 'cover', border: `1px solid ${t.borde}44`, background: t.secundario }
            }
        };
    }
    const initial = (nombre || '?')[0].toUpperCase();
    return {
        type: 'div',
        props: {
            style: { width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: t.secundario, border: `1px solid ${t.borde}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `${t.texto}44`, fontSize: `${size * 0.4}px`, fontWeight: 700 },      
            children: initial
        }
    };
}

// ── Generador Base ─────────────────────────────────────────────────────────

async function renderToBuffer(element, width, height) {
    const font = await getFontData();
    const svg = await satori(element, {
        width, height,
        fonts: [{ name: 'Inter', data: font, weight: 700, style: 'normal' }],
        loadAdditionalAsset: async (code, segment) => {
            if (code === 'emoji') {
                const codepoints = [...segment].map(c => c.codePointAt(0).toString(16)).join('-');
                const localPath = join(process.cwd(), 'assets', 'emojis', `${codepoints}.svg`);
                try {
                    if (existsSync(localPath)) {
                        const svgText = readFileSync(localPath, 'utf8');
                        return `data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`;
                    }
                } catch { return undefined; }
            }
            return undefined;
        }
    });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } });
    return resvg.render().asPng();
}

/**
 * Genera una imagen del fixture con un diseño moderno.
 * @param {Object} options 
 * @param {string} options.titulo 
 * @param {string} options.subtitulo 
 * @param {Array} options.partidos [{ local, visitante, resultado, ganador, avatarL, avatarV, ida, vuelta, desempate }]
 * @param {Object} options.tema { primario, secundario, acento, texto, borde }
 */
export async function generarFixtureImagen(options) {
    const { titulo, subtitulo, partidos, tema } = options;
    
    const t = {
        primario: tema?.primario || '#1a1a2e',
        secundario: tema?.secundario || '#16213e',
        acento: tema?.acento || '#e94560',
        texto: tema?.texto || '#ffffff',
        borde: tema?.borde || '#0f3460',
    };

    const width = 800;
    const rowHeight = 70;
    const headerHeight = 150;
    const totalHeight = headerHeight + (partidos.length * rowHeight) + 40;

    const bgProps = { 
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
        background: `linear-gradient(180deg, ${t.secundario} 0%, ${t.primario} 100%)` 
    };

    const rows = partidos.map((p, i) => {
        const isIdaVuelta = p.ida || p.vuelta;
        const done = p.resultado && p.resultado !== 'Pendiente';
        
        let marcadorElement;

        if (isIdaVuelta) {
            // Diseño para Ida y Vuelta (Múltiples cajitas)
            const scores = [];
            if (p.ida) scores.push({ label: 'IDA', val: p.ida.finalizado ? `${p.ida.golesLocal}-${p.ida.golesVisitante}` : 'VS' });
            if (p.vuelta) scores.push({ label: 'VUE', val: p.vuelta.finalizado ? `${p.vuelta.golesVisitante}-${p.vuelta.golesLocal}` : 'VS' }); // Invertido porque equipo 2 es local en vuelta
            if (p.desempate?.finalizado) scores.push({ label: 'DES', val: `${p.desempate.golesLocal}-${p.desempate.golesVisitante}` });

            marcadorElement = {
                type: 'div',
                props: {
                    style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', width: '200px' },
                    children: scores.map(s => ({
                        type: 'div',
                        props: {
                            style: { 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                width: '60px', height: '48px', background: 'rgba(0,0,0,0.5)', 
                                border: `1px solid ${s.val !== 'VS' ? t.acento : t.borde}`, borderRadius: '6px'
                            },
                            children: [
                                { type: 'div', props: { style: { fontSize: '9px', fontWeight: 800, color: s.val !== 'VS' ? t.acento : `${t.texto}44`, marginBottom: '2px' }, children: s.label } },
                                { type: 'div', props: { style: { fontSize: '14px', fontWeight: 900, color: s.val !== 'VS' ? t.texto : `${t.texto}22` }, children: s.val } }
                            ]
                        }
                    }))
                }
            };
        } else {
            // Diseño Original para Partido Único
            marcadorElement = {
                type: 'div',
                props: {
                    style: { 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        width: '140px', height: '44px', background: `${t.secundario}cc`, 
                        border: `1px solid ${t.borde}`, borderRadius: '4px',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                    },
                    children: [
                        { 
                            type: 'div', 
                            props: { 
                                style: { fontSize: '22px', fontWeight: 900, color: done ? t.acento : t.texto, letterSpacing: '2px' },
                                children: done ? p.resultado : 'VS'
                            } 
                        }
                    ]
                }
            };
        }
        
        return {
            type: 'div',
            props: {
                style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: `${rowHeight}px`, position: 'relative' },
                children: [
                    // Local
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', alignItems: 'center', gap: '15px', flex: 1, justifyContent: 'flex-end', paddingRight: '20px' },
                            children: [
                                { type: 'div', props: { style: { fontSize: '18px', fontWeight: 800, color: p.ganador === p.local ? t.acento : t.texto, textAlign: 'right' }, children: p.local } },
                                avatarElement(p.avatarL, p.local, t, 42)
                            ]
                        }
                    },
                    // Marcador Central (Dinámico)
                    marcadorElement,
                    // Visitante
                    {
                        type: 'div',
                        props: {
                            style: { display: 'flex', alignItems: 'center', gap: '15px', flex: 1, justifyContent: 'flex-start', paddingLeft: '20px' },
                            children: [
                                avatarElement(p.avatarV, p.visitante, t, 42),
                                { type: 'div', props: { style: { fontSize: '18px', fontWeight: 800, color: p.ganador === p.visitante ? t.acento : t.texto }, children: p.visitante } }
                            ]
                        }
                    }
                ]
            }
        };
    });

    const root = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${totalHeight}px`, background: t.primario, color: t.texto, fontFamily: 'Inter', position: 'relative' },
            children: [
                { type: 'div', props: { style: bgProps } },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '40px', paddingBottom: '30px', position: 'relative' },
                        children: [
                            { type: 'div', props: { style: { fontSize: '32px', fontWeight: 900, color: t.texto, letterSpacing: '4px', textTransform: 'uppercase' }, children: titulo } },
                            subtitulo ? { type: 'div', props: { style: { fontSize: '14px', fontWeight: 700, color: t.primario, background: t.acento, padding: '4px 20px', borderRadius: '20px', letterSpacing: '3px', textTransform: 'uppercase', marginTop: '10px' }, children: subtitulo } } : null
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', padding: '10px 0', position: 'relative' },
                        children: rows
                    }
                }
            ]
        }
    };

    return await renderToBuffer(root, width, totalHeight);
}
