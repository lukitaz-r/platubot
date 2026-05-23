import { renderToBuffer } from './renderPool.js';
import fs from 'fs';
import path from 'path';
import { AttachmentBuilder } from 'discord.js';

export const generarImagenHistorialEquipo = async (equipo, logosMap = {}, page = 1) => {
    try {
        const primaryColor = '#11806a'; 

        const getLogoAsync = async (src) => {
            if (!src) return null;
            if (src.startsWith('data:')) return src;
            if (src.startsWith('http')) {
                try {
                    const res = await fetch(src);
                    if (!res.ok) return null;
                    const buffer = Buffer.from(await res.arrayBuffer());
                    return `data:image/png;base64,${buffer.toString('base64')}`;
                } catch { return null; }
            }
            try {
                const buffer = fs.readFileSync(path.join(process.cwd(), src));
                return `data:image/png;base64,${buffer.toString('base64')}`;
            } catch { return null; }
        };

        const tabla = equipo.tablaHistorica || { puntosAcumulados: 0, partidosGanados: 0, partidosPerdidos: 0, diferenciaGoles: 0, titulosTotales: 0 };
        
        let totalGF = 0;
        let totalGC = 0;
        for (const h of equipo.historial) {
            totalGF += h.golesAFavor;
            totalGC += h.golesEnContra;
        }

        const logoPrincipal = await getLogoAsync(equipo.escudo);

        const historiales = [...equipo.historial].sort((a,b) => b.victorias - a.victorias);
        const startIdx = (page - 1) * 8;
        const pageItems = historiales.slice(startIdx, startIdx + 8);
        
        const loadedLogos = {};
        for (const h of pageItems) {
            loadedLogos[h.rival] = await getLogoAsync(logosMap[h.rival]);
        }

        const totalPages = Math.ceil(historiales.length / 8) || 1;

        let historialesHtml = [];
        if (pageItems.length === 0) {
            historialesHtml = [{
                type: 'div',
                props: {
                    style: { color: '#6b7280', fontStyle: 'italic', marginTop: '20px', width: '100%', textAlign: 'center', display: 'flex', justifyContent: 'center' },
                    children: 'Sin historial registrado contra otros clubes.'
                }
            }];
        } else {
            historialesHtml = pageItems.map(h => {
                let badgeColor = '#4b5563'; // gray-600
                let indicatorStr = 'EQUITATIVO';
                if (h.victorias > h.derrotas) {
                    badgeColor = '#16a34a'; // green-600
                    indicatorStr = 'POSITIVO';
                } else if (h.derrotas > h.victorias) {
                    badgeColor = '#dc2626'; // red-600
                    indicatorStr = 'NEGATIVO';
                }

                const rivalLogo = loadedLogos[h.rival];

                return {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex', backgroundColor: 'rgba(31, 41, 55, 0.8)', borderRadius: '12px', padding: '16px',
                            border: '1px solid #374151', alignItems: 'center', justifyContent: 'space-between', width: '48%', marginBottom: '16px'
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', alignItems: 'center', gap: '16px' },
                                    children: [
                                        rivalLogo ? { type: 'img', props: { src: rivalLogo, style: { width: '48px', height: '48px', objectFit: 'contain', borderRadius: '50%', border: '1px solid #6b7280' } } } : { type: 'div', props: { style: { width: '48px', height: '48px' } } },
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', flexDirection: 'column', maxWidth: '220px', alignItems: 'flex-start' },
                                                children: [
                                                    { type: 'span', props: { style: { color: '#f3f4f6', fontWeight: 700, fontSize: '18px' }, children: h.rival } },
                                                    { type: 'span', props: { style: { fontSize: '12px', padding: '2px 8px', marginTop: '4px', borderRadius: '4px', backgroundColor: badgeColor, color: '#fff', fontWeight: 700, letterSpacing: '1px' }, children: indicatorStr } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', alignItems: 'center', gap: '24px' },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                children: [
                                                    { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'V - D' } },
                                                    { type: 'span', props: { style: { color: '#fff', fontWeight: 900, fontSize: '20px' }, children: `${h.victorias} - ${h.derrotas}` } }
                                                ]
                                            }
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                children: [
                                                    { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'Goles' } },
                                                    { type: 'span', props: { style: { color: primaryColor, fontWeight: 900, fontSize: '20px' }, children: `${h.golesAFavor} - ${h.golesEnContra}` } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                };
            });
        }

        const numRows = Math.ceil(pageItems.length / 2) || 1;
        const totalHeight = 450 + (numRows * 130) + 120;

        const element = {
            type: 'div',
            props: {
                style: {
                    display: 'flex', width: '1000px', height: `${totalHeight}px`, padding: '40px', backgroundColor: '#0d1117', fontFamily: '"Inter", sans-serif'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#111822', borderRadius: '24px', padding: '32px',
                                border: `2px solid rgba(17, 128, 106, 0.5)`,
                                backgroundImage: 'linear-gradient(to bottom right, #111827, #111822, #111827)'
                            },
                            children: [
                                // Header
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid rgba(17, 128, 106, 0.4)`, paddingBottom: '24px', marginBottom: '24px' },
                                        children: [
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', alignItems: 'center', gap: '24px' },
                                                    children: [
                                                        logoPrincipal ? { type: 'img', props: { src: logoPrincipal, style: { width: '96px', height: '96px', objectFit: 'contain', borderRadius: '50%', border: `4px solid ${primaryColor}` } } } : null,
                                                        {
                                                            type: 'div',
                                                            props: {
                                                                style: { display: 'flex', flexDirection: 'column', maxWidth: '500px' },
                                                                children: [
                                                                    { type: 'span', props: { style: { fontSize: '36px', fontWeight: 900, color: primaryColor, textTransform: 'uppercase', letterSpacing: '-1px' }, children: equipo.nombre } },
                                                                    { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', marginTop: '4px' }, children: 'Reporte Histórico' } }
                                                                ]
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }, children: 'Títulos Totales' } },
                                                        { type: 'span', props: { style: { fontSize: '48px', fontWeight: 900, color: '#eab308' }, children: `🏆 ${tabla.titulosTotales}` } }
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                },
                                // Stats Principales
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', gap: '16px', marginBottom: '32px' },
                                        children: [
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { flex: 1, backgroundColor: 'rgba(31, 41, 55, 0.8)', borderRadius: '12px', padding: '16px', border: '1px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }, children: 'Puntos Acum.' } },
                                                        { type: 'span', props: { style: { fontSize: '30px', fontWeight: 900, color: primaryColor }, children: `${tabla.puntosAcumulados}` } }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { flex: 1, backgroundColor: 'rgba(31, 41, 55, 0.8)', borderRadius: '12px', padding: '16px', border: '1px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }, children: 'Supra-Ganados' } },
                                                        { type: 'span', props: { style: { fontSize: '30px', fontWeight: 900, color: '#22c55e' }, children: `${tabla.partidosGanados}` } }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { flex: 1, backgroundColor: 'rgba(31, 41, 55, 0.8)', borderRadius: '12px', padding: '16px', border: '1px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }, children: 'Supra-Perdidos' } },
                                                        { type: 'span', props: { style: { fontSize: '30px', fontWeight: 900, color: '#ef4444' }, children: `${tabla.partidosPerdidos}` } }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { flex: 1, backgroundColor: 'rgba(31, 41, 55, 0.8)', borderRadius: '12px', padding: '16px', border: '1px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }, children: 'Dif. Duelos' } },
                                                        { type: 'span', props: { style: { fontSize: '30px', fontWeight: 900, color: '#60a5fa' }, children: `${tabla.diferenciaGoles > 0 ? '+' : ''}${tabla.diferenciaGoles}` } }
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                },
                                // Goles Totales
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', justifyContent: 'center', gap: '48px', border: `1px solid rgba(17, 128, 106, 0.3)`, padding: '16px', borderRadius: '12px', backgroundColor: '#1f2937', marginBottom: '32px' },
                                        children: [
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }, children: 'Goles A Favor (Totales)' } },
                                                        { type: 'span', props: { style: { fontSize: '36px', fontWeight: 900, color: '#34d399' }, children: `⚽ ${totalGF}` } }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { width: '1px', backgroundColor: '#4b5563' }
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                                                    children: [
                                                        { type: 'span', props: { style: { color: '#9ca3af', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }, children: 'Goles En Contra (Totales)' } },
                                                        { type: 'span', props: { style: { fontSize: '36px', fontWeight: 900, color: '#f43f5e' }, children: `🥅 ${totalGC}` } }
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                },
                                // Resumen Rivales
                                {
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', flexDirection: 'column' },
                                        children: [
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #374151', paddingBottom: '8px', marginBottom: '16px' },
                                                    children: [
                                                        { type: 'span', props: { style: { fontSize: '24px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }, children: 'Rendimiento Histórico vs Clubes' } },
                                                        { type: 'span', props: { style: { fontSize: '14px', color: '#9ca3af', fontWeight: 700 }, children: `Página ${page} de ${totalPages}` } }
                                                    ]
                                                }
                                            },
                                            {
                                                type: 'div',
                                                props: {
                                                    style: { display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between' },
                                                    children: historialesHtml
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

        const imageBuffer = await renderToBuffer(element, 1000, totalHeight, { scale: 1 });

        return new AttachmentBuilder(imageBuffer, { name: 'superliga_historial.png' });

    } catch (error) {
        console.error('Error generando panel visual historial equipo:', error);
        return null;
    }
};
