import { renderToBuffer } from './renderPool.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Convierte un escudo local a Base64 para Satori
 */
function getShieldB64(escudoPath) {
    if (!escudoPath) return null;
    try {
        const fullPath = join(process.cwd(), escudoPath);
        if (existsSync(fullPath)) {
            const buffer = readFileSync(fullPath);
            return `data:image/png;base64,${buffer.toString('base64')}`;
        }
    } catch (e) {}
    return null;
}

export async function generarTablaSuperligaImagen(tabla, temporada) {
  const THEME = {
    bg: '#0a0e14',
    oceanic: '#2ecc71',
    text: '#ffffff',
    textMuted: '#94a3b8',
    cardBg: '#161d26',
    border: 'rgba(46, 204, 113, 0.25)',
    winnerColor: '#f1c40f',
    rowEven: 'rgba(255,255,255,0.02)',
    rowOdd: 'rgba(255,255,255,0.05)',
    podiumGold: '#ffd700',
    oceanicGlow: 'rgba(46,204,113,0.6)',
  };

  // Pos, Escudo, Equipo, PTS, PJ, PG, PP, GF, GC, DG
  const colWidths = [60, 60, 300, 80, 50, 50, 50, 60, 60, 60]; 
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 80;
  const rowHeight = 70;
  const headerSectionHeight = 220; // Título + Header de tabla
  const totalHeight = headerSectionHeight + (tabla.length * rowHeight) + 40;

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        backgroundColor: THEME.bg,
        fontFamily: 'Inter',
        color: THEME.text,
        padding: '40px',
      },
      children: [
        // TÍTULO
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' },
            children: [
                { type: 'span', props: { style: { fontSize: '56px', fontWeight: 900, color: THEME.oceanic, textTransform: 'uppercase', letterSpacing: '2px' }, children: temporada.toUpperCase() } },
                { type: 'div', props: { style: { width: '400px', height: '6px', backgroundColor: THEME.oceanic, marginTop: '10px', boxShadow: `0 0 15px ${THEME.oceanic}` } } },
            ]
          }
        },
        // HEADER TABLA
        {
          type: 'div',
          props: {
            style: { display: 'flex', backgroundColor: '#161d26', borderRadius: '12px 12px 0 0', padding: '20px 0', fontWeight: 800, fontSize: '18px', color: THEME.textMuted, borderBottom: `2px solid ${THEME.oceanic}` },
            children: ['', '', 'EQUIPO', 'PTS', 'PJ', 'PG', 'PP', 'GF', 'GC', 'DG'].map((h, i) => ({
                type: 'div',
                props: { style: { width: `${colWidths[i]}px`, textAlign: i === 2 ? 'left' : 'center', color: i === 3 ? THEME.oceanic : THEME.textMuted }, children: h }
            }))
          }
        },
        // FILAS
        ...tabla.map((e, idx) => ({
            type: 'div',
            props: {
                style: { display: 'flex', alignItems: 'center', height: `${rowHeight}px`, backgroundColor: idx % 2 === 0 ? THEME.rowEven : THEME.rowOdd, borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '22px' },
                children: [
                    { type: 'div', props: { style: { width: `${colWidths[0]}px`, textAlign: 'center', paddingLeft: '10px', fontWeight: 900, color: idx < 1 ? THEME.podiumGold : THEME.text }, children: `${idx + 1}` } },
                    { type: 'div', props: { style: { width: `${colWidths[1]}px`, display: 'flex', justifyContent: 'center' }, children: e.escudoB64 ? { type: 'img', props: { src: e.escudoB64, style: { width: '58px', height: '58px', objectFit: 'contain', borderRadius: '50%' } } } : null } },
                    { type: 'div', props: { style: { width: `${colWidths[2]}px`, textAlign: 'left', fontWeight: 700, paddingLeft: '10px' }, children: e.nombre } },
                    { type: 'div', props: { style: { width: `${colWidths[3]}px`, textAlign: 'center', fontWeight: 900, fontSize: '28px', color: THEME.oceanic, textShadow: `0 0 10px ${THEME.oceanicGlow}` }, children: `${e.pts}` } },
                    { type: 'div', props: { style: { width: `${colWidths[4]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pj}` } },
                    { type: 'div', props: { style: { width: `${colWidths[5]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pg}` } },
                    { type: 'div', props: { style: { width: `${colWidths[6]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pp}` } },
                    { type: 'div', props: { style: { width: `${colWidths[7]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.gf}` } },
                    { type: 'div', props: { style: { width: `${colWidths[8]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.gc}` } },
                    { type: 'div', props: { style: { width: `${colWidths[9]}px`, textAlign: 'center', fontWeight: 600, color: e.dg >= 0 ? THEME.oceanic : '#e74c3c' }, children: `${e.dg > 0 ? '+' : ''}${e.dg}` } }
                ]
            }
        }))
      ]
    }
  };

  return renderToBuffer(element, totalWidth, totalHeight);
}

export function prepararDatosTabla(listaTabla, equipos) {
    return listaTabla.map(entry => {
        const equipo = equipos.find(eq => eq.nombre === entry.nombre);
        return {
            ...entry,
            escudoB64: equipo ? getShieldB64(equipo.escudo) : null
        };
    });
}
