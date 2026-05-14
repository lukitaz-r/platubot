import { renderToBuffer } from './renderPool.js';
import fs from 'fs';
import path from 'path';

// ── Helpers de imagen (se ejecutan en el hilo principal para preparar datos) ──
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
    if (src.startsWith('data:')) {
        const mime = src.split(';')[0].split(':')[1];
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(mime)) return TRANSPARENT_PNG;
        return src;
    }
    if (src.startsWith('http')) {
        try {
            const res = await fetch(src);
            if (!res.ok) return TRANSPARENT_PNG;
            const type = res.headers.get('content-type') || 'image/png';
            if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(type.split(';')[0])) return TRANSPARENT_PNG;
            const buffer = Buffer.from(await res.arrayBuffer());
            return `data:${type};base64,${buffer.toString('base64')}`;
        } catch { return TRANSPARENT_PNG; }
    }
    const local = getAssetAsBase64(src);
    if (!local) return TRANSPARENT_PNG;
    const mime = local.split(';')[0].split(':')[1];
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(mime)) return TRANSPARENT_PNG;
    return local;
};

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// 1. Plantilla (Cards side by side)
export const generarImagenPlantilla = async (equipoNombre, escudoSrc, buffersCartas) => {
    const width = Math.max(1000, buffersCartas.length * 360 + 100);
    const height = 650;
    
    const cartasBase64 = buffersCartas.map(b => `data:image/png;base64,${b.toString('base64')}`);
    const logoBase64 = await getLogoAsync(escudoSrc);

    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`,
                backgroundColor: '#0d1117', padding: '40px', fontFamily: 'Inter'
            },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '40px', borderBottom: '2px solid #11806a', paddingBottom: '20px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '80px', height: '80px', objectFit: 'contain', marginRight: '20px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#11806a', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase' }, children: equipoNombre } },
                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '18px', fontWeight: 700, letterSpacing: '2px' }, children: 'PLANTILLA OFICIAL' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', justifyContent: 'center', gap: '40px', width: '100%', alignItems: 'center' },
                        children: cartasBase64.map(src => ({
                            type: 'img',
                            props: { src, style: { width: '300px', height: '455px', objectFit: 'contain' } }
                        }))
                    }
                }
            ]
        }
    };

    return renderToBuffer(element, width, height, { scale: 1 });
};

// 2. Temporada Actual
export const generarImagenStatsTemporada = async (equipoNombre, escudoSrc, stats) => {
    const width = 1000;
    const height = 450;
    const logoBase64 = await getLogoAsync(escudoSrc);

    const element = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`, backgroundColor: '#0d1117', padding: '40px', fontFamily: 'Inter' },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '40px', borderBottom: '2px solid #f1c40f', paddingBottom: '20px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '80px', height: '80px', objectFit: 'contain', marginRight: '20px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#f1c40f', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase' }, children: equipoNombre } },
                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '18px', fontWeight: 700, letterSpacing: '2px' }, children: 'RENDIMIENTO TEMPORADA ACTUAL' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' },
                        children: [
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #374151' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'PARTIDOS' } }, { type: 'span', props: { style: { color: '#fff', fontSize: '40px', fontWeight: 900 }, children: stats.pj }}] } },
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #16a34a' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'GANADOS' } }, { type: 'span', props: { style: { color: '#4ade80', fontSize: '40px', fontWeight: 900 }, children: stats.pg }}] } },
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #dc2626' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'PERDIDOS' } }, { type: 'span', props: { style: { color: '#f87171', fontSize: '40px', fontWeight: 900 }, children: stats.pp }}] } },
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', gap: '20px', justifyContent: 'center' },
                        children: [
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #3b82f6' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'GOLES A FAVOR' } }, { type: 'span', props: { style: { color: '#60a5fa', fontSize: '40px', fontWeight: 900 }, children: stats.gf }}] } },
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #f97316' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'GOLES EN CONTRA' } }, { type: 'span', props: { style: { color: '#fb923c', fontSize: '40px', fontWeight: 900 }, children: stats.gc }}] } },
                            { type: 'div', props: { style: { backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #a855f7' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', marginBottom: '5px' }, children: 'PUNTOS' } }, { type: 'span', props: { style: { color: '#c084fc', fontSize: '40px', fontWeight: 900 }, children: stats.pts }}] } }
                        ]
                    }
                }
            ]
        }
    };

    return renderToBuffer(element, width, height, { scale: 1 });
};

// 3. Economía
export const generarImagenEconomia = async (equipoNombre, escudoSrc, ecoData) => {
    const width = 1280;
    const height = Math.max(650, 350 + (ecoData.players.length * 150));
    const logoBase64 = await getLogoAsync(escudoSrc);

    const element = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`, backgroundColor: '#0d1117', padding: '40px', fontFamily: 'Inter' },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #2ecc71', paddingBottom: '20px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '80px', height: '80px', objectFit: 'contain', marginRight: '20px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#2ecc71', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase' }, children: equipoNombre } },
                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '18px', fontWeight: 700, letterSpacing: '2px' }, children: 'REPORTE FINANCIERO' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', gap: '30px' },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', flex: 1, gap: '15px', justifyContent: 'flex-start' },
                                    children: [
                                        { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#1f2937', padding: '15px 20px', borderRadius: '10px' }, children: [{ type: 'span', props: { style: { color: '#9ca3af' }, children: 'Dinero Actual' } }, { type: 'span', props: { style: { color: '#fff', fontSize: '20px' }, children: ecoData.dineroStr } }] } },
                                        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', backgroundColor: '#1f2937', padding: '15px 20px', borderRadius: '10px' }, children: [
                                            { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between' }, children: [{ type: 'span', props: { style: { color: '#9ca3af' }, children: 'Ingresos Totales' } }, { type: 'span', props: { style: { color: '#4ade80', fontSize: '20px', fontWeight: 900 }, children: ecoData.ingresosStr } }] } },
                                            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', marginTop: '10px', marginLeft: '15px', paddingLeft: '15px', borderLeft: '2px solid #374151' }, children: [
                                                { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px' }, children: '💰 Bonos Victoria' } }, { type: 'span', props: { style: { color: '#4ade80', fontSize: '14px', fontWeight: 700 }, children: ecoData.proyeccionVictoriasStr } }] } },
                                                { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between' }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px' }, children: `🏆 Premio Liga (#${ecoData.posicionActual})` } }, { type: 'span', props: { style: { color: '#fbbf24', fontSize: '14px', fontWeight: 700 }, children: ecoData.proyeccionPremioLigaStr } }] } }
                                            ] } }
                                        ] } },
                                        { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#1f2937', padding: '15px 20px', borderRadius: '10px' }, children: [{ type: 'span', props: { style: { color: '#9ca3af' }, children: 'Total Salarios' } }, { type: 'span', props: { style: { color: '#f87171', fontSize: '20px' }, children: ecoData.salariosStr } }] } },
                                        { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#1f2937', padding: '15px 20px', borderRadius: '10px', border: `1px solid ${ecoData.balance >= 0 ? '#16a34a' : '#dc2626'}` }, children: [{ type: 'span', props: { style: { color: '#9ca3af', fontWeight: 900 }, children: 'BALANCE' } }, { type: 'span', props: { style: { color: ecoData.balance >= 0 ? '#4ade80' : '#f87171', fontSize: '24px', fontWeight: 900 }, children: ecoData.balanceStr } }] } },
                                        { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#111827', padding: '15px 20px', borderRadius: '10px', border: '2px dashed #6366f1', marginTop: '10px' }, children: [{ type: 'span', props: { style: { color: '#818cf8', fontWeight: 900 }, children: 'PROYECCIÓN' } }, { type: 'span', props: { style: { color: ecoData.proyeccion >= 0 ? '#60a5fa' : '#f87171', fontSize: '24px', fontWeight: 900 }, children: ecoData.proyeccionStr } }] } },
                                    ]
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column', flex: 1.5, backgroundColor: '#1f2937', padding: '20px', borderRadius: '12px', border: '1px solid #374151' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#fff', fontSize: '20px', fontWeight: 900, marginBottom: '20px' }, children: 'Evolución de Plantilla' } },
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', flexDirection: 'column', gap: '20px' },
                                                children: ecoData.players.map(p => {
                                                    const isUp = p.media > p.mediaIni;
                                                    const isFlat = p.media === p.mediaIni;
                                                    const color = isFlat ? '#9ca3af' : (isUp ? '#4ade80' : '#f87171');
                                                    const y1 = isFlat ? 20 : (isUp ? 35 : 5);
                                                    const y2 = isFlat ? 20 : (isUp ? 5 : 35);
                                                    const numPoints = isFlat ? 5 : Math.max(3, Math.min(25, Math.floor(Math.abs(p.media - p.mediaIni) / 0.25) + 1));
                                                    let pointsArray = [];
                                                    for (let i = 0; i < numPoints; i++) {
                                                        let x = 5 + (i * 190) / (numPoints - 1);
                                                        let perfectY = y1 + (i * (y2 - y1)) / (numPoints - 1);
                                                        if (i > 0 && i < numPoints - 1) perfectY += (Math.random() * 10 - 5);
                                                        perfectY = Math.max(2, Math.min(38, perfectY));
                                                        pointsArray.push(`${x},${perfectY}`);
                                                    }
                                                    const svgGraph = {
                                                        type: 'svg',
                                                        props: {
                                                            viewBox: "0 0 200 40",
                                                            width: "200",
                                                            height: "40",
                                                            style: { marginLeft: '20px', marginRight: '20px' },
                                                            children: [
                                                                { type: 'polyline', props: { points: pointsArray.join(' '), fill: 'none', stroke: color, strokeWidth: '3', strokeLinecap: 'round', strokeLinejoin: 'round' } },
                                                                { type: 'circle', props: { cx: "5", cy: `${y1}`, r: "4", fill: color } },
                                                                { type: 'circle', props: { cx: "195", cy: `${y2}`, r: "4", fill: color } }
                                                            ]
                                                        }
                                                    };
                                                    return {
                                                        type: 'div',
                                                        props: {
                                                            style: { display: 'flex', flexDirection: 'column', backgroundColor: '#111827', padding: '15px', borderRadius: '8px' },
                                                            children: [
                                                                 { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', justifyContent: 'space-between' }, children: [
                                                                    { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [
                                                                        p.avatarUrl ? { type: 'img', props: { src: p.avatarUrl, style: { width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}` } } } : { type: 'div', props: { style: { width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#374151', border: `2px solid ${color}` } } },
                                                                        { type: 'span', props: { style: { color: '#f3f4f6', fontSize: '20px', fontWeight: 900 }, children: p.nombre } }
                                                                    ] } },
                                                                    { type: 'span', props: { style: { color: color, fontSize: '16px', fontWeight: 700 }, children: isFlat ? '= Mantiene' : `${isUp ? '+' : '-'}${Math.abs(p.media - p.mediaIni).toFixed(2)} pts` } }
                                                                ] } },
                                                                { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
                                                                    { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', width: '130px' }, children: [
                                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase' }, children: 'Valor Inicial' } },
                                                                        { type: 'span', props: { style: { color: '#d1d5db', fontSize: '18px', fontWeight: 700 }, children: p.valIStr } },
                                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginTop: '6px' }, children: 'Salario Inicial' } },
                                                                        { type: 'span', props: { style: { color: '#d1d5db', fontSize: '18px', fontWeight: 700 }, children: p.salIStr } }
                                                                    ] } },
                                                                    svgGraph,
                                                                    { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', width: '130px', alignItems: 'flex-end' }, children: [
                                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase' }, children: 'Valor Actual' } },
                                                                        { type: 'span', props: { style: { color: color, fontSize: '18px', fontWeight: 900 }, children: p.valAStr } },
                                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', marginTop: '6px' }, children: 'Salario Actual' } },
                                                                        { type: 'span', props: { style: { color: color, fontSize: '18px', fontWeight: 900 }, children: p.salAStr } }
                                                                    ] } }
                                                                ] } }
                                                            ]
                                                        }
                                                    };
                                                })
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    };

    return renderToBuffer(element, width, height, { scale: 1 });
};

// 4. Historial Plantillas
export const generarImagenHistorial = async (equipoNombre, escudoSrc, buffersCartas, labels) => {
    const columns = 4;
    const rows = Math.ceil(buffersCartas.length / columns);
    const width = 1250;
    const height = 250 + (rows * 500);
    const cartasBase64 = buffersCartas.map(b => `data:image/png;base64,${b.toString('base64')}`);
    const logoBase64 = await getLogoAsync(escudoSrc);

    const element = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`, backgroundColor: '#0d1117', padding: '40px', fontFamily: 'Inter' },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '40px', borderBottom: '2px solid #9b59b6', paddingBottom: '20px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '80px', height: '80px', objectFit: 'contain', marginRight: '20px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#9b59b6', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase' }, children: equipoNombre } },
                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '18px', fontWeight: 700, letterSpacing: '2px' }, children: 'JUGADORES HISTÓRICOS' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexWrap: 'wrap', gap: '30px', justifyContent: 'center' },
                        children: cartasBase64.map((src, i) => ({
                            type: 'div',
                            props: {
                                style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' },
                                children: [
                                    { type: 'img', props: { src, style: { width: '270px', height: '410px', objectFit: 'contain', filter: 'grayscale(100%)' } } },
                                    { type: 'span', props: { style: { color: '#e5e7eb', fontSize: '18px', fontWeight: 900, backgroundColor: '#1f2937', padding: '5px 15px', borderRadius: '20px' }, children: labels[i] } }
                                ]
                            }
                        }))
                    }
                }
            ]
        }
    };
    return renderToBuffer(element, width, height, { scale: 1 });
};

// 5. Traspasos (FIFA Style)
export const generarImagenTraspasos = async (equipoNombre, escudoSrc, traspasosData) => {
    const width = 1000;
    const height = 300 + (traspasosData.length * 120);
    const logoBase64 = await getLogoAsync(escudoSrc);

    const element = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`, backgroundColor: '#0d1117', padding: '40px', fontFamily: 'Inter' },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '40px', borderBottom: '2px solid #e67e22', paddingBottom: '20px' },
                        children: [
                            { type: 'img', props: { src: logoBase64, style: { width: '80px', height: '80px', objectFit: 'contain', marginRight: '20px' } } },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', flexDirection: 'column' },
                                    children: [
                                        { type: 'span', props: { style: { color: '#e67e22', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase' }, children: equipoNombre } },
                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '18px', fontWeight: 700, letterSpacing: '2px' }, children: 'LIBRO DE TRASPASOS' } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', gap: '20px' },
                        children: await Promise.all(traspasosData.map(async t => {
                            let color = '#9ca3af';
                            let isAlta = t.tipo === 'Alta';
                            let isBaja = t.tipo === 'Baja';
                            let isMod = t.tipo?.includes('Mod') || t.tipo === 'Intercambio' || t.tipo === 'Modificación';
                            if (isAlta) color = '#22c55e';
                            else if (isBaja) color = '#ef4444';
                            else if (isMod) color = '#fbbf24';
                            const avatarSrc = await getLogoAsync(t.avatarJugador);
                            const escudoRelSrc = await getLogoAsync(t.equipoRelacionado === 'Agente Libre' ? 'assets/equipos/vacio.png' : t.escudoRelacionado);
                            const arrowSvg = {
                                type: 'svg',
                                props: {
                                    viewBox: "0 0 160 40", width: "160", height: "40",
                                    children: [
                                        { type: 'line', props: { x1: "10", y1: "20", x2: "150", y2: "20", stroke: color, strokeWidth: "4", strokeLinecap: "round" } },
                                        isAlta ? { type: 'polyline', props: { points: "30,10 10,20 30,30", fill: "none", stroke: color, strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" } } : (isBaja ? { type: 'polyline', props: { points: "130,10 150,20 130,30", fill: "none", stroke: color, strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" } } : null),
                                        isMod ? { type: 'polyline', props: { points: "30,10 10,20 30,30", fill: "none", stroke: color, strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" } } : null,
                                        isMod ? { type: 'polyline', props: { points: "130,10 150,20 130,30", fill: "none", stroke: color, strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" } } : null,
                                    ].filter(Boolean)
                                }
                            };
                            return {
                                type: 'div',
                                props: {
                                    style: { 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                        backgroundColor: '#111827', padding: '15px 30px', borderRadius: '15px', 
                                        border: `2px solid ${color}`, boxShadow: `0 4px 15px ${color}22`
                                    },
                                    children: [
                                        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '20px', width: '320px' }, children: [ { type: 'img', props: { src: avatarSrc, style: { width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover', border: `3px solid ${color}` } } }, { type: 'div', props: { style: { display: 'flex', flexDirection: 'column' }, children: [ { type: 'span', props: { style: { color: '#fff', fontSize: '22px', fontWeight: 900 }, children: t.jugadorNombre } }, { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', fontWeight: 700 }, children: t.fechaStr } } ] } } ] } },
                                        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '200px' }, children: [ arrowSvg, { type: 'span', props: { style: { color: color, fontSize: '20px', fontWeight: 900, marginTop: '8px' }, children: t.montoStr !== '0' ? `$${t.montoStr}` : t.tipo } } ] } },
                                        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '20px', width: '320px' }, children: [ { type: 'span', props: { style: { color: '#fff', fontSize: '20px', fontWeight: 900, textAlign: 'right' }, children: t.equipoRelacionado } }, { type: 'img', props: { src: escudoRelSrc, style: { width: '70px', height: '70px', objectFit: 'contain' } } } ] } }
                                    ]
                                }
                            };
                        }))
                    }
                }
            ]
        }
    };
    return renderToBuffer(element, width, height, { scale: 1 });
};
