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

// ── Helpers de Utilidad ──────────────────────────────────────────────────────

function getTheme(tema = {}) {
    return {
        primario: tema.primario || '#1a1a2e',
        secundario: tema.secundario || '#16213e',
        acento: tema.acento || '#e94560',
        texto: tema.texto || '#ffffff',
        borde: tema.borde || '#0f3460',
    };
}

function getSafeAvatar(avatarUrl) {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http')) return avatarUrl;
    try {
        if (existsSync(avatarUrl)) {
            const buffer = readFileSync(avatarUrl);
            const ext = avatarUrl.split('.').pop();
            return `data:image/${ext};base64,${buffer.toString('base64')}`;
        }
    } catch (e) {}
    return null;
}

function avatarElement(url, nombre, t, size = 28, filter = 'none') {
  const flagUrl = getFlagUrl(nombre);
  const safeUrl = getSafeAvatar(url || flagUrl);
  const imgSz = size;
  
  return {
    type: 'div',
    props: {
      style: {
        width: `${imgSz}px`, height: `${imgSz}px`, borderRadius: '6px',
        background: '#111', flexShrink: 0, overflow: 'hidden', display: 'flex',
        filter: filter, border: `1px solid ${t.borde}44`
      },
      children: safeUrl ? {
        type: 'img',
        props: { src: safeUrl, width: imgSz, height: imgSz, style: { objectFit: 'cover' } }
      } : {
        type: 'div',
        props: {
          style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: `${t.texto}44`, fontSize: `${Math.round(imgSz * 0.45)}px`, fontWeight: 800 },
          children: (nombre && nombre !== 'BYE' && nombre !== 'TBD') ? nombre[0].toUpperCase() : '?'
        }
      }
    }
  };
}

// ── Renderizado ─────────────────────────────────────────────────────────────

async function renderToBuffer(element, width, height) {
    const font = await getFontData();
    const svg = await satori(element, {
        width, height,
        fonts: [{ name: 'Inter', data: font, weight: 700, style: 'normal' }],
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
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } });
    return resvg.render().asPng();
}

// ── Lógica de Bracket Premium ─────────────────────────────────────────────

function buildTeamRowBracket(equipo, isWinner, isLoser, isBye, gIda, gVue, t, size, reversed = false) {
    const { rowH } = size;
    const borderColor = isWinner ? t.acento : isLoser ? '#ef4444' : 'transparent';
    const bg = isWinner ? `${t.acento}1a` : isLoser ? 'rgba(239,68,68,0.12)' : 'transparent';
    const nameColor = isWinner ? t.acento : isLoser ? '#fca5a5' : '#e2e8f0';
    const scoreBg = isWinner ? t.acento : isLoser ? '#7f1d1d' : `${t.borde}66`;
    const scoreColor = isWinner ? t.primario : isLoser ? '#fca5a5' : '#94a3b8';
    const avFilter = isLoser ? 'grayscale(100%)' : 'none';

    const scoreText = isBye ? 'B' : (gIda !== undefined && gIda !== null ? `${gIda}` : '-');
    const scoreTextVuelta = (gVue !== undefined && gVue !== null) ? `${gVue}` : null;

    const scoreSz = Math.round(rowH * 0.7);
    const scoreContainer = {
        type: 'div',
        props: {
            style: { display: 'flex', gap: '4px' },
            children: [
                { type: 'div', props: { style: { minWidth: `${scoreSz}px`, height: `${scoreSz}px`, borderRadius: '6px', background: scoreBg, color: scoreColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.round(scoreSz*0.55)}px`, fontWeight: 900, padding: '0 8px' }, children: scoreText } },
                scoreTextVuelta !== null ? { type: 'div', props: { style: { minWidth: `${scoreSz}px`, height: `${scoreSz}px`, borderRadius: '4px', background: scoreBg, color: scoreColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.round(scoreSz*0.55)}px`, fontWeight: 900, opacity: 0.8, padding: '0 8px' }, children: scoreTextVuelta } } : null
            ]
        }
    };

    const avatar = avatarElement(equipo.avatar, equipo.nombre, t, rowH - 12, avFilter);
    const name = { 
        type: 'div', 
        props: { 
            style: { 
                flex: 1, fontSize: `${Math.round(rowH*0.4)}px`, fontWeight: isWinner ? 900 : 500, color: nameColor, 
                textAlign: reversed ? 'right' : 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' 
            }, 
            children: isBye ? 'BYE' : equipo.nombre || 'TBD' 
        } 
    };

    const children = reversed ? [scoreContainer, name, avatar] : [avatar, name, scoreContainer];

    return {
        type: 'div',
        props: {
            style: { 
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', 
                padding: '0 20px', height: `${rowH}px`, background: bg,
                borderLeft: !reversed ? `4px solid ${borderColor}` : 'none',
                borderRight: reversed ? `4px solid ${borderColor}` : 'none',
            },
            children
        }
    };
}

function buildMatchCardBracket(llave, t, size, reversed = false, isFinal = false) {
    const { cardW } = size;
    const { equipo1, equipo2, ida, vuelta, ganador } = llave;
    const done = !!ganador;
    const isWinner1 = ganador === equipo1?.discordId;
    const isWinner2 = ganador === equipo2?.discordId;
    const isTBD = !equipo1?.discordId && !equipo2?.discordId;

    return {
        type: 'div',
        props: {
            style: { 
                width: `${cardW}px`, background: `${t.secundario}f8`, border: `2px solid ${isFinal ? t.acento : t.borde + '88'}`, 
                borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', 
                boxShadow: isFinal ? `0 0 40px ${t.acento}44` : '0 15px 40px rgba(0,0,0,0.6)', opacity: isTBD ? 0.4 : 1 
            },
            children: [
                buildTeamRowBracket(equipo1 || { nombre: 'TBD' }, isWinner1, done && !isWinner1, equipo1?.discordId === 'BYE', ida?.golesLocal, vuelta?.golesVisitante, t, size, reversed),
                { type: 'div', props: { style: { height: '1.5px', background: `${t.borde}33`, width: '100%' } } },
                buildTeamRowBracket(equipo2 || { nombre: 'TBD' }, isWinner2, done && !isWinner2, equipo2?.discordId === 'BYE', ida?.golesVisitante, vuelta?.golesLocal, t, size, reversed)
            ]
        }
    };
}

function buildConnectors(fromTops, toTops, xStart, width, color, cardH, direction = 'right') {
    const lines = [];
    const xMid = xStart + width / 2;
    for (let i = 0; i < toTops.length; i++) {
        const yA = fromTops[i * 2] + cardH / 2;
        const yB = fromTops[i * 2 + 1] !== undefined ? fromTops[i * 2 + 1] + cardH / 2 : yA;
        const yT = toTops[i] + cardH / 2;
        const yMid = (yA + yB) / 2;
        const lineStyle = { position: 'absolute', background: color, height: '2px' };

        if (direction === 'right') {
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yA}px`, width: `${width/2}px` } } });
            if (fromTops[i * 2 + 1] !== undefined) {
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yB}px`, width: `${width/2}px` } } });
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yA, yB)}px`, width: '2px', height: `${Math.abs(yB - yA)}px` } } });
            }
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yMid, yT)}px`, width: '2px', height: `${Math.abs(yT - yMid) + 2}px` } } });
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yT}px`, width: `${width/2}px` } } });
        } else {
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yA}px`, width: `${width/2}px` } } });
            if (fromTops[i * 2 + 1] !== undefined) {
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yB}px`, width: `${width/2}px` } } });
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yA, yB)}px`, width: '2px', height: `${Math.abs(yB - yA)}px` } } });
            }
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yMid, yT)}px`, width: '2px', height: `${Math.abs(yT - yMid) + 2}px` } } });
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yT}px`, width: `${width/2}px` } } });
        }
    }
    return lines;
}

export async function generarBracketCopa(torneo) {
    const t = getTheme(torneo.tema);
    const phases = torneo.fasesEliminatoria || ['Semifinales', 'Final'];
    const nPhases = phases.length;

    const CANVAS_W = 1920;
    const CANVAS_H = 1080;
    
    const isSmall = nPhases <= 2;
    const sizeNormal = { cardW: 200, cardH: 100, rowH: 48 };
    const sizeLarge = { cardW: 320, cardH: 140, rowH: 68 };
    
    const currentSize = isSmall ? sizeLarge : sizeNormal;
    const finalSize = { cardW: Math.round(currentSize.cardW * 1.15), cardH: Math.round(currentSize.cardH * 1.15), rowH: Math.round(currentSize.rowH * 1.15) };

    const areaH = 440;
    const yOffset = 180; 
    const headerTop = 135; 
    const padX = isSmall ? 80 : 40;

    const x_Final = (CANVAS_W - finalSize.cardW) / 2;
    const availableSideWidth = x_Final - padX - 60;
    const numGaps = nPhases - 1;
    const gapX = numGaps > 0 ? (availableSideWidth - (numGaps * currentSize.cardW)) / numGaps + currentSize.cardW : 200;

    function getTops(n) {
        const sp = areaH / n;
        return Array.from({ length: n }, (_, i) => Math.round(i * sp + sp / 2) - currentSize.cardH / 2);
    }

    const wingData = phases.map((phaseName, idx) => {
        const matches = (torneo.llaves && torneo.llaves[phaseName]) || [];
        if (idx === nPhases - 1) return { label: '🏆 GRAN FINAL', center: matches[0] };
        const mid = Math.ceil(matches.length / 2);
        return { label: phaseName.toUpperCase(), left: matches.slice(0, mid), right: matches.slice(mid).reverse() };
    });

    const elements = [];
    const x_L = Array.from({ length: nPhases - 1 }, (_, i) => padX + i * gapX);
    const x_R = Array.from({ length: nPhases - 1 }, (_, i) => CANVAS_W - padX - currentSize.cardW - i * gapX);

    for (let i = 0; i < nPhases - 1; i++) {
        const leftMatches = wingData[i].left || [];
        const rightMatches = wingData[i].right || [];
        const lTops = getTops(leftMatches.length);
        const rTops = getTops(rightMatches.length);

        // Headers
        [x_L[i], x_R[i]].forEach(x => {
            elements.push({
                type: 'div',
                props: {
                    style: { position: 'absolute', top: `${headerTop}px`, left: `${x}px`, width: `${currentSize.cardW}px`, display: 'flex', justifyContent: 'center' },
                    children: {
                        type: 'div',
                        props: {
                            style: { fontSize: '13px', fontWeight: 900, color: t.acento, padding: '6px 20px', background: `${t.acento}1a`, border: `2px solid ${t.acento}44`, borderRadius: '30px', textTransform: 'uppercase', letterSpacing: '2px' },
                            children: wingData[i].label
                        }
                    }
                }
            });
        });

        leftMatches.forEach((m, idx) => elements.push({ type: 'div', props: { style: { position: 'absolute', left: `${x_L[i]}px`, top: `${yOffset + lTops[idx]}px`, display: 'flex' }, children: [buildMatchCardBracket(m, t, currentSize, false)] } }));
        rightMatches.forEach((m, idx) => elements.push({ type: 'div', props: { style: { position: 'absolute', left: `${x_R[i]}px`, top: `${yOffset + rTops[idx]}px`, display: 'flex' }, children: [buildMatchCardBracket(m, t, currentSize, true)] } }));

        // Conectores (Restaurados y Ajustados)
        if (i < nPhases - 1) {
            const nextLCount = wingData[i+1]?.left?.length || (i === nPhases - 2 ? 1 : 0);
            const nextRCount = wingData[i+1]?.right?.length || (i === nPhases - 2 ? 1 : 0);
            
            const nextLTops = (i === nPhases - 2) ? [areaH/2 - currentSize.cardH/2] : getTops(nextLCount);
            const nextRTops = (i === nPhases - 2) ? [areaH/2 - currentSize.cardH/2] : getTops(nextRCount);
            
            const connX_L = x_L[i] + currentSize.cardW;
            const connW_L = (i === nPhases - 2) ? x_Final - connX_L : gapX - currentSize.cardW;
            const connW_R = (i === nPhases - 2) ? x_R[i] - (x_Final + finalSize.cardW) : gapX - currentSize.cardW;
            const connX_R = (i === nPhases - 2) ? x_Final + finalSize.cardW : x_R[i] - (gapX - currentSize.cardW);

            if (leftMatches.length > 0 && nextLCount > 0) {
                elements.push(...buildConnectors(lTops, nextLTops, connX_L, connW_L, `${t.acento}44`, currentSize.cardH, 'right').map(l => ({ ...l, props: { ...l.props, style: { ...l.props.style, top: `${parseFloat(l.props.style.top) + yOffset}px` } } })));
            }
            if (rightMatches.length > 0 && nextRCount > 0) {
                elements.push(...buildConnectors(rTops, nextRTops, connX_R, connW_R, `${t.acento}44`, currentSize.cardH, 'left').map(l => ({ ...l, props: { ...l.props, style: { ...l.props.style, top: `${parseFloat(l.props.style.top) + yOffset}px` } } })));
            }
        }
    }

    // Final
    const finalMatch = wingData[nPhases - 1].center;
    if (finalMatch) {
        elements.push({
            type: 'div',
            props: {
                style: { position: 'absolute', top: `${headerTop - 10}px`, left: `${x_Final}px`, width: `${finalSize.cardW}px`, display: 'flex', justifyContent: 'center' },
                children: {
                    type: 'div',
                    props: {
                        style: { fontSize: '16px', fontWeight: 900, letterSpacing: '5px', color: '#fbbf24', padding: '8px 32px', background: 'rgba(251,191,36,0.15)', border: '2px solid rgba(251,191,36,0.6)', borderRadius: '40px', boxShadow: '0 0 30px rgba(251,191,36,0.3)' },
                        children: '🏆 GRAN FINAL'
                    }
                }
            }
        });
        elements.push({ type: 'div', props: { style: { position: 'absolute', left: `${x_Final}px`, top: `${yOffset + areaH/2 - finalSize.cardH/2}px`, display: 'flex' }, children: [buildMatchCardBracket(finalMatch, t, finalSize, false, true)] } });
    }

    const root = {
        type: 'div',
        props: {
            style: { display: 'flex', width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, background: t.primario, color: t.texto, fontFamily: 'Inter', position: 'relative', overflow: 'hidden' },
            children: [
                { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: `linear-gradient(180deg, ${t.secundario}bb 0%, ${t.primario} 100%)` } } },
                { type: 'div', props: { style: { position: 'absolute', top: '50%', left: '50%', width: '1000px', height: '1000px', background: `radial-gradient(circle, ${t.acento}11 0%, transparent 70%)`, transform: 'translate(-50%, -50%)' } } },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '30px', position: 'relative' },
                        children: [
                            { type: 'div', props: { style: { fontSize: '42px', fontWeight: 900, color: t.texto, letterSpacing: '10px', textShadow: `0 0 30px ${t.acento}66` }, children: torneo.nombre?.toUpperCase() } },
                            { type: 'div', props: { style: { fontSize: '13px', fontWeight: 600, color: t.acento, textTransform: 'uppercase', letterSpacing: '6px', marginTop: '10px', opacity: 0.8 }, children: 'Brackets de Eliminación Directa' } }
                        ]
                    }
                },
                ...elements
            ]
        }
    };
    return await renderToBuffer(root, CANVAS_W, CANVAS_H);
}

// ── Tablas y Participantes (Sin cambios) ───────────────────────────────────

async function renderTablaBase(torneo, equipos, titulo, subtitulo) {
    const t = getTheme(torneo.tema);
    const cols = ['', 'Jugador', 'PJ', 'PG', 'WO', 'PP', 'GF', 'GC', 'DG', 'PTS'];
    const colWidths = [40, 260, 48, 48, 48, 48, 48, 48, 48, 56];
    const totalWidth = colWidths.reduce((s, w) => s + w, 0) + 40;
    const rowHeight = 40;
    const headerHeight = 80;
    const totalHeight = headerHeight + 48 + equipos.length * rowHeight + 30;

    const rows = equipos.map((e, idx) => {
        const dif = (e.gf || 0) - (e.gc || 0);
        return {
            type: 'div',
            props: {
                style: { display: 'flex', flexDirection: 'row', alignItems: 'center', height: `${rowHeight}px`, background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)', borderBottom: `1px solid ${t.borde}22` },
                children: [
                    { type: 'div', props: { style: { width: `${colWidths[0]}px`, textAlign: 'center', fontSize: '14px', fontWeight: 700, paddingLeft: '10px', color: idx < (torneo.clasificadosPorGrupo || 1) ? '#ffd700' : t.texto }, children: `${idx + 1}` } },
                    { type: 'div', props: { style: { width: `${colWidths[1]}px`, display: 'flex', flexDirection: 'row', alignItems: 'center', paddingLeft: '8px', overflow: 'hidden' }, children: [avatarElement(e.avatar, e.nombre, t), { type: 'div', props: { style: { fontSize: '14px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: e.nombre } }] } },
                    ...[e.pj || 0, e.pg || 0, e.pe || 0, e.pp || 0, e.gf || 0, e.gc || 0, dif, e.puntos || 0].map((val, vi) => ({
                        type: 'div',
                        props: { style: { width: `${colWidths[vi + 2]}px`, textAlign: 'center', fontSize: '13px', fontWeight: vi === 7 ? 700 : 400, color: vi === 7 ? t.acento : vi === 6 ? (val > 0 ? '#2ecc71' : val < 0 ? '#e74c3c' : '#a0a0c0') : '#d0d0d0' }, children: `${val > 0 && vi === 6 ? '+' : ''}${val}` }
                    }))
                ]
            }
        };
    });

    const root = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${totalWidth}px`, height: `${totalHeight}px`, background: `linear-gradient(135deg, ${t.primario} 0%, ${t.secundario} 100%)`, fontFamily: 'Inter', color: '#e0e0e0', padding: '20px' },
            children: [
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }, children: [{ type: 'div', props: { style: { fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '1px' }, children: `🏆 ${titulo}` } }, subtitulo ? { type: 'div', props: { style: { fontSize: '11px', opacity: 0.5, letterSpacing: '2px', textTransform: 'uppercase', marginTop: '4px' }, children: subtitulo } } : null] } },
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'row', background: `${t.acento}1a`, borderRadius: '8px 8px 0 0', padding: '8px 0', borderBottom: `1px solid ${t.acento}44` }, children: cols.map((col, i) => ({ type: 'div', props: { style: { width: `${colWidths[i]}px`, textAlign: i === 1 ? 'left' : 'center', fontSize: '12px', fontWeight: 700, color: t.acento, textTransform: 'uppercase', letterSpacing: '0.5px', paddingLeft: i === 1 ? '8px' : '0' }, children: col } })) } },
                ...rows
            ]
        }
    };
    return await renderToBuffer(root, totalWidth, totalHeight);
}

export async function generarImagenParticipantes(torneo) {
    const t = getTheme(torneo.tema);
    const equipos = [...torneo.equipos].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const colCount = equipos.length > 12 ? 2 : 1;
    const itemsPerCol = Math.ceil(equipos.length / colCount);
    const rowHeight = 46;
    const width = colCount === 2 ? 720 : 400;
    const height = 120 + (itemsPerCol * rowHeight) + 40;

    const renderColumn = (items) => ({
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' },
            children: items.map((e, idx) => ({
                type: 'div',
                props: {
                    style: { display: 'flex', alignItems: 'center', padding: '8px 16px', background: `${t.secundario}88`, borderRadius: '8px', border: `1px solid ${t.borde}44` },
                    children: [
                        { type: 'div', props: { style: { fontSize: '12px', color: t.acento, fontWeight: 800, width: '24px' }, children: `${equipos.indexOf(e) + 1}.` } },
                        avatarElement(e.avatar, e.nombre, t, 30),
                        { type: 'div', props: { style: { fontSize: '14px', fontWeight: 600, color: t.texto, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }, children: e.nombre } }
                    ]
                }
            }))
        }
    });

    const root = {
        type: 'div',
        props: {
            style: { display: 'flex', flexDirection: 'column', width: `${width}px`, height: `${height}px`, background: t.primario, padding: '32px', fontFamily: 'Inter' },
            children: [
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }, children: [{ type: 'div', props: { style: { fontSize: '24px', fontWeight: 900, color: t.texto, letterSpacing: '1px' }, children: `👥 PARTICIPANTES` } }, { type: 'div', props: { style: { fontSize: '11px', color: t.acento, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginTop: '4px' }, children: torneo.nombre } }] } },
                { type: 'div', props: { style: { display: 'flex', gap: '20px' }, children: colCount === 2 ? [renderColumn(equipos.slice(0, itemsPerCol)), renderColumn(equipos.slice(itemsPerCol))] : [renderColumn(equipos)] } }
            ]
        }
    };
    return await renderToBuffer(root, width, height);
}

export async function generarTablaImagenCopa(torneo, tabla, titulo) {
    return await renderTablaBase(torneo, tabla, titulo, 'Tabla de Posiciones');
}

export async function generarPreviewTema(nombre, tema) {
    const mockTabla = [
        { nombre: 'Ejemplo Local', avatar: '', puntos: 9, pj: 3, pg: 3, pe: 0, pp: 0, gf: 10, gc: 2 },
        { nombre: 'Ejemplo Visitante', avatar: '', puntos: 6, pj: 3, pg: 2, pe: 0, pp: 1, gf: 5, gc: 4 }
    ];
    return await renderTablaBase({ tema, clasificadosPorGrupo: 1 }, mockTabla, nombre, 'Vista Previa del Diseño');
}
