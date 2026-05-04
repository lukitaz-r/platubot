import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

async function fetchAvatars(jugadores, client) {
  const avatars = new Map();
  if (!client) return avatars;

  const promises = jugadores.map(async (j) => {
    if (!j.id || !/^\d{17,20}$/.test(j.id)) return;
    try {
      const user = await client.users.fetch(j.id);
      const url = user.displayAvatarURL({ extension: 'png', size: 256 });
      avatars.set(j.id, url);
    } catch {
      avatars.set(j.id, null);
    }
  });

  await Promise.all(promises);
  return avatars;
}

export async function generarStatsSuperligaImagen(jugadores, temporada, rankingOffset = 0, client = null) {
  const font = await getFontData();
  const avatars = await fetchAvatars(jugadores, client);

  const THEME = {
    bg: '#0a0e14',
    oceanic: '#2ecc71',
    text: '#ffffff',
    textMuted: '#94a3b8',
    rowEven: '#0f141c',
    rowOdd: '#0a0e14',
  };

  // #, Jugador, Equipo, PJ, GF, GC, DG, PROM
  const colWidths = [60, 320, 200, 60, 60, 60, 70, 80]; 
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 80;
  const rowHeight = 60;
  const headerHeight = 160;
  const totalHeight = headerHeight + (jugadores.length * rowHeight) + 60;
  const titulo = temporada.split(' ')[0] + ' ' + temporada.split(' ')[1];
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
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' },
            
            children: [
                { type: 'span', props: { style: { fontSize: '50px', fontWeight: 900, color: THEME.oceanic, textTransform: 'uppercase' }, children: `Goleadores: ${titulo}` } },
                { type: 'div', props: { style: { width: '300px', height: '4px', backgroundColor: THEME.oceanic, marginTop: '5px' } } },
            ]
          }
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', backgroundColor: '#161d26', borderRadius: '10px 10px 0 0', padding: '15px 0', fontWeight: 800, fontSize: '16px', color: THEME.textMuted, borderBottom: `2px solid ${THEME.oceanic}` },
            children: ['', 'JUGADOR', 'EQUIPO', 'PJ', 'GF', 'GC', 'DG', 'PROM'].map((h, i) => ({
                type: 'div',
                props: { style: { width: `${colWidths[i]}px`, textAlign: i === 1 || i === 2 ? 'left' : 'center', paddingLeft: i === 1 ? '10px' : '0' }, children: h }
            }))
          }
        },
        ...jugadores.map((j, idx) => {
            const posReal = idx + 1 + rankingOffset;
            const avatarUrl = avatars.get(j.id);

            return {
                type: 'div',
                props: {
                    style: { display: 'flex', alignItems: 'center', height: `${rowHeight}px`, backgroundColor: idx % 2 === 0 ? THEME.rowEven : THEME.rowOdd, borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '18px' },
                    children: [
                        { type: 'div', props: { style: { width: `${colWidths[0]}px`, textAlign: 'center', paddingLeft: '16px', fontWeight: 800, color: posReal <= 3 ? '#f1c40f' : THEME.text }, children: `${posReal}` } },
                        
                        { 
                          type: 'div', 
                          props: { 
                            style: { width: `${colWidths[1]}px`, display: 'flex', alignItems: 'center', paddingLeft: '10px' }, 
                            children: [
                              avatarUrl ? {
                                type: 'img',
                                props: {
                                  src: avatarUrl,
                                  style: { width: '36px', height: '36px', borderRadius: '50%', marginRight: '10px', objectFit: 'cover' }
                                }
                              } : {
                                type: 'div',
                                props: {
                                  style: { width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#334155', marginRight: '10px' }
                                }
                              },
                              { type: 'span', props: { style: { fontWeight: 600 }, children: j.nombre } }
                            ]
                          } 
                        },

                        { type: 'div', props: { style: { width: `${colWidths[2]}px`, textAlign: 'left', fontSize: '14px', color: THEME.textMuted }, children: j.equipo } },
                        { type: 'div', props: { style: { width: `${colWidths[3]}px`, textAlign: 'center' }, children: `${j.pj}` } },
                        { type: 'div', props: { style: { width: `${colWidths[4]}px`, textAlign: 'center', fontWeight: 700, color: THEME.oceanic }, children: `${j.gf}` } },
                        { type: 'div', props: { style: { width: `${colWidths[5]}px`, textAlign: 'center' }, children: `${j.gc}` } },
                        { type: 'div', props: { style: { width: `${colWidths[6]}px`, textAlign: 'center', color: j.dg >= 0 ? '#2ecc71' : '#e74c3c' }, children: `${j.dg > 0 ? '+' : ''}${j.dg}` } },
                        { type: 'div', props: { style: { width: `${colWidths[7]}px`, textAlign: 'center', fontWeight: 700, color: '#f1c40f' }, children: `${j.promedio}` } },
                    ]
                }
            };
        })
      ],
    },
  };

  const svg = await satori(element, {
    width: totalWidth,
    height: totalHeight,
    fonts: [{ name: 'Inter', data: font, weight: 700, style: 'normal' }],
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') {
        const codepoints = [...segment].map(c => c.codePointAt(0).toString(16)).join('-');
        return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${codepoints}.svg`;
      }
    }
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: totalWidth * 2 } });
  return resvg.render().asPng();
}
