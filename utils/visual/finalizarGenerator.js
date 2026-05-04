import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── Fuente ──────────────────────────────────────────────────────────────────
let fontData;
try {
  fontData = readFileSync(join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf'));
} catch { fontData = null; }

async function getFontData() {
  if (fontData) return fontData;
  const res = await fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf');
  fontData = Buffer.from(await res.arrayBuffer());
  return fontData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

const formatCurrency = (num) => {
  if (Math.abs(num) >= 1_000_000) return '$' + (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(num) >= 1_000) return '$' + (num / 1_000).toFixed(0) + 'k';
  return '$' + num.toFixed(0);
};

const THEME = {
  bg: '#0a0e14',
  bgCard: '#0f141c',
  bgCardAlt: '#131a24',
  text: '#ffffff',
  textMuted: '#94a3b8',
  accent: '#2ecc71',
  accentGlow: 'rgba(46, 204, 113, 0.25)',
  gold: '#f1c40f',
  goldGlow: 'rgba(241, 196, 15, 0.3)',
  red: '#e74c3c',
  blue: '#3b82f6',
  headerBg: '#161d26',
  divider: 'rgba(255,255,255,0.08)',
};

async function renderToImage(element, width, height) {
  const font = await getFontData();
  const svg = await satori(element, {
    width, height,
    fonts: [{ name: 'Inter', data: font, weight: 700, style: 'normal' }],
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') {
        const codepoints = [...segment].map(c => c.codePointAt(0).toString(16)).join('-');
        // Normalizar: Twemoji no usa fe0f en los nombres de archivo
        const cleanCode = codepoints.replace(/-fe0f/g, "");
        try {
          const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${cleanCode}.svg`);
          if (res.ok) return `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString('base64')}`;
        } catch {}
      }
      return undefined;
    }
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } }).render().asPng();
}

// ─── Componentes reutilizables ──────────────────────────────────────────────

function pageTitle(title, subtitle) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px', width: '100%' },
      children: [
        { type: 'span', props: { style: { fontSize: '52px', fontWeight: 900, color: THEME.accent, textTransform: 'uppercase', letterSpacing: '3px' }, children: title } },
        subtitle ? { type: 'span', props: { style: { fontSize: '22px', color: THEME.textMuted, marginTop: '6px', letterSpacing: '1px' }, children: subtitle } } : null,
        { type: 'div', props: { style: { width: '500px', height: '4px', backgroundColor: THEME.accent, marginTop: '14px', borderRadius: '2px', boxShadow: `0 0 20px ${THEME.accentGlow}` } } },
      ].filter(Boolean),
    }
  };
}

function clubHeader(escudoB64, nombre, extraChildren) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', padding: '16px 20px', backgroundColor: THEME.headerBg, borderRadius: '10px', marginBottom: '10px', marginTop: '20px', borderLeft: `4px solid ${THEME.accent}` },
      children: [
        escudoB64 ? { type: 'img', props: { src: escudoB64, style: { width: '40px', height: '40px', objectFit: 'contain', marginRight: '14px', borderRadius: '50%' } } } : null,
        { type: 'span', props: { style: { fontSize: '24px', fontWeight: 800, color: THEME.text, flex: 1 }, children: nombre } },
        ...(extraChildren || []),
      ].filter(Boolean),
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA 1: Campeón + Tabla Final
// ═════════════════════════════════════════════════════════════════════════════

export async function generarPaginaCampeonYTabla({ campeon, tabla, temporada }) {
  const colWidths = [55, 55, 280, 75, 50, 50, 50, 55, 55, 60];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 100;
  const rowHeight = 62;
  const championHeight = 200;
  const headerHeight = 180;
  const tableHeaderHeight = 55;
  const totalHeight = championHeight + headerHeight + tableHeaderHeight + (tabla.length * rowHeight) + 80;

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: `${totalWidth}px`, height: `${totalHeight}px`,
        backgroundColor: THEME.bg, fontFamily: 'Inter', color: THEME.text, padding: '40px 50px',
      },
      children: [
        // Título
        pageTitle('FIN DE TEMPORADA', temporada),

        // Banner Campeón
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '30px 40px', borderRadius: '16px', marginBottom: '40px',
              backgroundColor: 'rgba(241, 196, 15, 0.08)', border: `2px solid ${THEME.gold}`,
              boxShadow: `0 0 40px ${THEME.goldGlow}`,
            },
            children: [
              campeon.escudoB64 ? { type: 'img', props: { src: campeon.escudoB64, style: { width: '100px', height: '100px', objectFit: 'contain', marginRight: '30px' } } } : null,
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '18px', color: THEME.gold, letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 700 }, children: 'CAMPEON' } },
                    { type: 'span', props: { style: { fontSize: '44px', fontWeight: 900, color: THEME.gold, textShadow: `0 0 20px ${THEME.goldGlow}` }, children: campeon.nombre } },
                    { type: 'span', props: { style: { fontSize: '18px', color: THEME.textMuted, marginTop: '4px' }, children: `${campeon.pts} PTS  ·  ${campeon.v} Victorias` } },
                  ]
                }
              }
            ].filter(Boolean),
          }
        },

        // Header Tabla
        {
          type: 'div',
          props: {
            style: { display: 'flex', backgroundColor: THEME.headerBg, borderRadius: '10px 10px 0 0', padding: '16px 0', fontWeight: 800, fontSize: '15px', color: THEME.textMuted, borderBottom: `2px solid ${THEME.accent}` },
            children: ['#', '', 'EQUIPO', 'PTS', 'PJ', 'PG', 'PP', 'GF', 'GC', 'DG'].map((h, i) => ({
              type: 'div',
              props: { style: { width: `${colWidths[i]}px`, textAlign: i === 2 ? 'left' : 'center', color: i === 3 ? THEME.accent : THEME.textMuted }, children: h }
            }))
          }
        },

        // Filas
        ...tabla.map((e, idx) => ({
          type: 'div',
          props: {
            style: {
              display: 'flex', alignItems: 'center', height: `${rowHeight}px`,
              backgroundColor: idx % 2 === 0 ? THEME.bgCard : THEME.bg,
              borderBottom: `1px solid ${THEME.divider}`, fontSize: '20px',
            },
            children: [
              { type: 'div', props: { style: { width: `${colWidths[0]}px`, textAlign: 'center', fontWeight: 900, color: idx === 0 ? THEME.gold : THEME.text }, children: `${idx + 1}` } },
              { type: 'div', props: { style: { width: `${colWidths[1]}px`, display: 'flex', justifyContent: 'center' }, children: e.escudoB64 ? { type: 'img', props: { src: e.escudoB64, style: { width: '42px', height: '42px', objectFit: 'contain', borderRadius: '50%' } } } : null } },
              { type: 'div', props: { style: { width: `${colWidths[2]}px`, textAlign: 'left', fontWeight: 700, paddingLeft: '8px' }, children: e.nombre } },
              { type: 'div', props: { style: { width: `${colWidths[3]}px`, textAlign: 'center', fontWeight: 900, fontSize: '24px', color: THEME.accent, textShadow: `0 0 10px ${THEME.accentGlow}` }, children: `${e.pts}` } },
              { type: 'div', props: { style: { width: `${colWidths[4]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pj}` } },
              { type: 'div', props: { style: { width: `${colWidths[5]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pg}` } },
              { type: 'div', props: { style: { width: `${colWidths[6]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.pp}` } },
              { type: 'div', props: { style: { width: `${colWidths[7]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.gf}` } },
              { type: 'div', props: { style: { width: `${colWidths[8]}px`, textAlign: 'center', color: THEME.textMuted }, children: `${e.gc}` } },
              { type: 'div', props: { style: { width: `${colWidths[9]}px`, textAlign: 'center', fontWeight: 600, color: e.dg >= 0 ? THEME.accent : THEME.red }, children: `${e.dg > 0 ? '+' : ''}${e.dg}` } },
            ]
          }
        }))
      ]
    }
  };

  return renderToImage(element, totalWidth, totalHeight);
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA 2: Movimientos de Mercado
// ═════════════════════════════════════════════════════════════════════════════

export async function generarPaginaMovimientos({ movimientos, temporada }) {
  // movimientos: [ { equipo, escudoB64, items: [ { tipo: 'Alta'|'Baja', jugador, detalle } ] } ]
  const contentWidth = 900;
  const padding = 50;
  const totalWidth = contentWidth + padding * 2;

  // Calcular altura
  let bodyHeight = 0;
  for (const club of movimientos) {
    bodyHeight += 80; // header del club
    bodyHeight += club.items.length * 60; // cada movimiento
    if (club.items.length === 0) bodyHeight += 60; // "Sin movimientos"
  }
  const totalHeight = 200 + bodyHeight + 60; // título + body + padding

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: `${totalWidth}px`, height: `${totalHeight}px`,
        backgroundColor: THEME.bg, fontFamily: 'Inter', color: THEME.text, padding: `40px ${padding}px`,
      },
      children: [
        pageTitle('MOVIMIENTOS DE MERCADO', temporada),

        ...movimientos.flatMap(club => [
          clubHeader(club.escudoB64, club.equipo),
          ...(club.items.length === 0 ? [{
            type: 'div',
            props: {
              style: { display: 'flex', padding: '12px 20px', color: THEME.textMuted, fontSize: '16px', fontStyle: 'italic' },
              children: 'Sin movimientos esta temporada',
            }
          }] : club.items.map((mov, idx) => ({
            type: 'div',
            props: {
              style: {
                display: 'flex', alignItems: 'center', padding: '10px 20px',
                backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: `1px solid ${THEME.divider}`,
              },
              children: [
                // Icono Alta/Baja
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '70px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 800, letterSpacing: '0.5px', marginRight: '16px',
                      backgroundColor: mov.tipo === 'Alta' ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
                      color: mov.tipo === 'Alta' ? THEME.accent : THEME.red,
                      border: `1px solid ${mov.tipo === 'Alta' ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
                    },
                    children: mov.tipo === 'Alta' ? '▲ ALTA' : '▼ BAJA',
                  }
                },
                // Nombre jugador
                { type: 'span', props: { style: { fontSize: '18px', fontWeight: 700, color: THEME.text, marginRight: '12px', minWidth: '160px' }, children: mov.jugador || '—' } },
                // Detalle
                { type: 'span', props: { style: { fontSize: '14px', color: THEME.textMuted, flex: 1 }, children: mov.detalle || '' } },
              ]
            }
          })))
        ])
      ]
    }
  };

  return renderToImage(element, totalWidth, totalHeight);
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA 3: Premios Económicos
// ═════════════════════════════════════════════════════════════════════════════

export async function generarPaginaPremios({ premios, temporada }) {
  // premios: [ { equipo, escudoB64, puesto, premioPuesto, premioVictorias, victorias, total, dineroFinal } ]
  const contentWidth = 950;
  const padding = 50;
  const totalWidth = contentWidth + padding * 2;
  const rowHeight = 85;
  const totalHeight = 200 + 55 + (premios.length * rowHeight) + 60;

  const maxTotal = Math.max(...premios.map(p => p.total));

  const colWidths = [55, 55, 250, 140, 140, 150, 160];

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: `${totalWidth}px`, height: `${totalHeight}px`,
        backgroundColor: THEME.bg, fontFamily: 'Inter', color: THEME.text, padding: `40px ${padding}px`,
      },
      children: [
        pageTitle('PREMIOS ECONOMICOS', temporada),

        // Header
        {
          type: 'div',
          props: {
            style: { display: 'flex', backgroundColor: THEME.headerBg, borderRadius: '10px 10px 0 0', padding: '14px 0', fontWeight: 800, fontSize: '13px', color: THEME.textMuted, borderBottom: `2px solid ${THEME.accent}` },
            children: ['#', '', 'EQUIPO', 'PUESTO', 'VICTORIAS', 'TOTAL', 'SALDO FINAL'].map((h, i) => ({
              type: 'div',
              props: { style: { width: `${colWidths[i]}px`, textAlign: i === 2 ? 'left' : 'center' }, children: h }
            }))
          }
        },

        // Filas
        ...premios.map((p, idx) => ({
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column',
              backgroundColor: idx % 2 === 0 ? THEME.bgCard : THEME.bg,
              borderBottom: `1px solid ${THEME.divider}`,
            },
            children: [
              // Fila principal
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', height: '55px', fontSize: '18px' },
                  children: [
                    { type: 'div', props: { style: { width: `${colWidths[0]}px`, textAlign: 'center', fontWeight: 900, color: idx === 0 ? THEME.gold : THEME.text }, children: `${p.puesto}` } },
                    { type: 'div', props: { style: { width: `${colWidths[1]}px`, display: 'flex', justifyContent: 'center' }, children: p.escudoB64 ? { type: 'img', props: { src: p.escudoB64, style: { width: '38px', height: '38px', objectFit: 'contain', borderRadius: '50%' } } } : null } },
                    { type: 'div', props: { style: { width: `${colWidths[2]}px`, fontWeight: 700, paddingLeft: '8px' }, children: p.equipo } },
                    { type: 'div', props: { style: { width: `${colWidths[3]}px`, textAlign: 'center', color: THEME.accent, fontWeight: 700 }, children: formatCurrency(p.premioPuesto) } },
                    { type: 'div', props: { style: { width: `${colWidths[4]}px`, textAlign: 'center', color: THEME.accent, fontWeight: 700 }, children: `${p.victorias}V × ${formatCurrency(p.premioVictorias)}` } },
                    { type: 'div', props: { style: { width: `${colWidths[5]}px`, textAlign: 'center', fontWeight: 900, fontSize: '22px', color: THEME.gold }, children: formatCurrency(p.total) } },
                    { type: 'div', props: { style: { width: `${colWidths[6]}px`, textAlign: 'center', fontWeight: 600, color: THEME.textMuted }, children: formatCurrency(p.dineroFinal) } },
                  ]
                }
              },
              // Barra de progreso
              {
                type: 'div',
                props: {
                  style: { display: 'flex', padding: '0 60px 10px 60px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', display: 'flex' },
                        children: [
                          { type: 'div', props: { style: { width: `${(p.total / maxTotal) * 100}%`, height: '100%', backgroundColor: THEME.accent, borderRadius: '3px', boxShadow: `0 0 8px ${THEME.accentGlow}` } } }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        }))
      ]
    }
  };

  return renderToImage(element, totalWidth, totalHeight);
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA 4: Progresión de Medias
// ═════════════════════════════════════════════════════════════════════════════

export async function generarPaginaProgresion({ progresion, temporada }) {
  // progresion: [ { equipo, escudoB64, personas: [ { nombre, rol, mediaAntes, mediaDespues, delta, clasifico } ] } ]
  const contentWidth = 900;
  const padding = 50;
  const totalWidth = contentWidth + padding * 2;

  // Calcular altura
  let bodyHeight = 0;
  for (const club of progresion) {
    bodyHeight += 80; // header
    bodyHeight += Math.max(1, club.personas.length) * 60; // personas
  }
  const totalHeight = 200 + bodyHeight + 60;

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', width: `${totalWidth}px`, height: `${totalHeight}px`,
        backgroundColor: THEME.bg, fontFamily: 'Inter', color: THEME.text, padding: `40px ${padding}px`,
      },
      children: [
        pageTitle('PROGRESION DE MEDIAS', temporada),

        ...progresion.flatMap(club => [
          clubHeader(club.escudoB64, club.equipo),
          ...(club.personas.length === 0 ? [{
            type: 'div',
            props: {
              style: { display: 'flex', padding: '14px 20px', color: THEME.textMuted, fontSize: '16px', fontStyle: 'italic' },
              children: 'Sin jugadores/DTs en plantel',
            }
          }] : club.personas.map((p, idx) => ({
            type: 'div',
            props: {
              style: {
                display: 'flex', alignItems: 'center', padding: '12px 20px',
                backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: `1px solid ${THEME.divider}`,
              },
              children: [
                // Badge rol
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '42px', height: '24px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 800, marginRight: '14px',
                      backgroundColor: p.rol === 'DT' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.06)',
                      color: p.rol === 'DT' ? THEME.blue : THEME.textMuted,
                      border: `1px solid ${p.rol === 'DT' ? 'rgba(59, 130, 246, 0.3)' : THEME.divider}`,
                    },
                    children: p.rol,
                  }
                },
                // Nombre
                { type: 'span', props: { style: { fontSize: '18px', fontWeight: 700, color: THEME.text, minWidth: '200px', flex: 1 }, children: p.nombre } },
                // Clasificó o no
                !p.clasifico ? {
                  type: 'span',
                  props: {
                    style: { fontSize: '12px', color: THEME.textMuted, marginRight: '16px', padding: '4px 10px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '4px' },
                    children: 'No clasificó',
                  }
                } : null,
                // Media antes
                { type: 'span', props: { style: { fontSize: '20px', fontWeight: 600, color: THEME.textMuted, marginRight: '8px', minWidth: '50px', textAlign: 'right' }, children: p.mediaAntes.toFixed(1) } },
                // Flecha
                { type: 'span', props: { style: { fontSize: '18px', color: THEME.textMuted, marginRight: '8px' }, children: '→' } },
                // Media después
                { type: 'span', props: { style: { fontSize: '22px', fontWeight: 800, color: THEME.text, marginRight: '14px', minWidth: '50px', textAlign: 'right' }, children: p.mediaDespues.toFixed(1) } },
                // Delta
                {
                  type: 'div',
                  props: {
                    style: {
                      padding: '4px 12px', borderRadius: '6px', fontSize: '16px', fontWeight: 800, minWidth: '70px', textAlign: 'center',
                      backgroundColor: p.delta > 0 ? 'rgba(46, 204, 113, 0.12)' : p.delta < 0 ? 'rgba(231, 76, 60, 0.12)' : 'rgba(255,255,255,0.04)',
                      color: p.delta > 0 ? THEME.accent : p.delta < 0 ? THEME.red : THEME.textMuted,
                      border: `1px solid ${p.delta > 0 ? 'rgba(46, 204, 113, 0.25)' : p.delta < 0 ? 'rgba(231, 76, 60, 0.25)' : THEME.divider}`,
                    },
                    children: `${p.delta > 0 ? '+' : ''}${p.delta.toFixed(2)}`,
                  }
                },
              ].filter(Boolean),
            }
          })))
        ])
      ]
    }
  };

  return renderToImage(element, totalWidth, totalHeight);
}
