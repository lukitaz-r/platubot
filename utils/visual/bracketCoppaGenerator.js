import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Font ───────────────────────────────────────────────────────────────────
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

// ── Background Image ────────────────────────────────────────────────────────
function getBgImageB64() {
  try {
    const bgPath = join(process.cwd(), 'assets', 'bg', 'coppa_bg.png');
    const buffer = readFileSync(bgPath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

// ── Layout Constants (Adjusted to fit 1280px) ────────────────────────────────
const CANVAS_W = 1280;
const CANVAS_H = 640;
const CARD_W = 150;
const CARD_H = 70;
const ROW_H = 34;
const GAP_X = 40;
const PAD_X = 25;

const THEME = {
  winGreen: '#22c55e',
  loseRed: '#ef4444',
  winGreenText: '#4ade80',
  loseRedText: '#fca5a5',
  winGreenBg: 'rgba(34,197,94,0.14)',
  loseRedBg: 'rgba(239,68,68,0.12)',
  scoreBgWin: '#166534',
  scoreBgLose: '#7f1d1d',
  scoreBgNormal: '#1e293b',
  scoreColorWin: '#86efac',
  scoreColorLose: '#fca5a5',
  scoreColorNormal: '#94a3b8',
  connectorColor: 'rgba(74, 222, 128, 0.4)',
};

// ── Fetch avatars ──────────────────────────────────────────────────────────
async function fetchAvatars(equipos, client) {
  const avatars = new Map();
  if (!client) return avatars;
  const promises = equipos.map(async (e) => {
    if (!e.discordId || !/^\d{17,20}$/.test(e.discordId) || e.discordId === 'BYE') return;
    try {
      const user = await client.users.fetch(e.discordId);
      avatars.set(e.discordId, user.displayAvatarURL({ extension: 'png', size: 256 }));
    } catch {
      avatars.set(e.discordId, null);
    }
  });
  await Promise.all(promises);
  return avatars;
}

// ── Card Component ──────────────────────────────────────────────────────────
function buildTeamRow(equipo, isWinner, isLoser, isBye, gIda, gVue, avatars, reversed = false) {
  const avatarUrl = avatars.get(equipo.discordId);
  const borderColor = isWinner ? THEME.winGreen : isLoser ? THEME.loseRed : 'transparent';
  const bg = isWinner ? THEME.winGreenBg : isLoser ? THEME.loseRedBg : 'transparent';
  const nameColor = isWinner ? THEME.winGreenText : isLoser ? THEME.loseRedText : '#e2e8f0';
  const scoreBg = isWinner ? THEME.scoreBgWin : isLoser ? THEME.scoreBgLose : THEME.scoreBgNormal;
  const scoreColor = isWinner ? THEME.scoreColorWin : isLoser ? THEME.scoreColorLose : THEME.scoreColorNormal;
  const avFilter = isLoser ? 'grayscale(100%)' : 'none';

  const scoreText = isBye ? 'B' : (gIda !== null ? `${gIda}` : '-');
  const scoreTextVuelta = gVue !== null ? `${gVue}` : null;

  const imgSz = ROW_H - 8;
  const avatarEl = {
    type: 'div',
    props: {
      style: {
        width: `${imgSz}px`, height: `${imgSz}px`, borderRadius: '4px',
        background: '#111', flexShrink: 0, overflow: 'hidden', display: 'flex',
        filter: avFilter,
      },
      children: avatarUrl ? {
        type: 'img',
        props: { src: avatarUrl, width: imgSz, height: imgSz }
      } : {
        type: 'div',
        props: {
          style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: `${Math.round(imgSz * 0.4)}px` },
          children: isBye ? 'B' : (equipo.nombre ? equipo.nombre[0].toUpperCase() : '?')
        }
      }
    }
  };

  const nameEl = {
    type: 'div',
    props: {
      style: {
        flex: 1, fontSize: '10.5px', fontWeight: isWinner ? 800 : 500, color: nameColor,
        textAlign: reversed ? 'right' : 'left',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
      children: isBye ? 'BYE' : equipo.nombre || 'TBD'
    }
  };

  const scoreSz = Math.round(ROW_H * 0.65);
  const scoreContainer = {
    type: 'div',
    props: {
        style: { display: 'flex', flexDirection: 'row', gap: '2px' },
        children: [
            {
                type: 'div',
                props: {
                    style: {
                        minWidth: `${scoreSz}px`, height: `${scoreSz}px`, borderRadius: '4px',
                        background: scoreBg, color: scoreColor, fontWeight: 900,
                        fontSize: `${Math.round(scoreSz * 0.55)}px`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    },
                    children: scoreText
                }
            },
            scoreTextVuelta !== null ? {
                type: 'div',
                props: {
                    style: {
                        minWidth: `${scoreSz}px`, height: `${scoreSz}px`, borderRadius: '4px',
                        background: scoreBg, color: scoreColor, fontWeight: 900, opacity: 0.8,
                        fontSize: `${Math.round(scoreSz * 0.55)}px`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    },
                    children: scoreTextVuelta
                }
            } : null
        ]
    }
  };

  const children = reversed ? [scoreContainer, nameEl, avatarEl] : [avatarEl, nameEl, scoreContainer];

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
        padding: '0 8px', height: `${ROW_H}px`, background: bg,
        borderLeft: !reversed ? `3px solid ${borderColor}` : 'none',
        borderRight: reversed ? `3px solid ${borderColor}` : 'none',
      },
      children
    }
  };
}

function buildMatchCard(llave, avatars, reversed = false) {
  const { equipo1, equipo2, ida, vuelta, desempate, ganador } = llave;
  const done = !!ganador;
  const isTBD = !equipo1.discordId && !equipo2.discordId;

  return {
    type: 'div',
    props: {
      style: {
        width: `${CARD_W}px`, background: 'rgba(2,44,22,0.82)', border: '1px solid rgba(5, 150, 105, 0.2)',
        borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)', opacity: isTBD ? 0.35 : 1
      },
      children: [
        buildTeamRow(equipo1, ganador === equipo1.discordId, done && ganador !== equipo1.discordId, equipo1.discordId === 'BYE', ida.golesLocal, vuelta.golesVisitante, avatars, reversed),
        { type: 'div', props: { style: { height: '1px', background: 'rgba(5, 150, 105, 0.1)', width: '100%' } } },
        buildTeamRow(equipo2, ganador === equipo2.discordId, done && ganador !== equipo2.discordId, equipo2.discordId === 'BYE', ida.golesVisitante, vuelta.golesLocal, avatars, reversed),
      ]
    }
  };
}

// ── Connectors ──────────────────────────────────────────────────────────────
function buildConnectors(fromTops, toTops, xStart, width, direction = 'right') {
    const lines = [];
    const xMid = xStart + width / 2;
    const xEnd = xStart + width;

    for (let i = 0; i < toTops.length; i++) {
        const yA = fromTops[i * 2] + CARD_H / 2;
        const yB = fromTops[i * 2 + 1] !== undefined ? fromTops[i * 2 + 1] + CARD_H / 2 : yA;
        const yT = toTops[i] + CARD_H / 2;
        const yMid = (yA + yB) / 2;

        // Common style
        const lineStyle = { position: 'absolute', background: THEME.connectorColor };

        if (direction === 'right') {
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yA}px`, width: `${width/2}px`, height: '1.5px' } } });
            if (fromTops[i * 2 + 1] !== undefined) {
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yB}px`, width: `${width/2}px`, height: '1.5px' } } });
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yA, yB)}px`, width: '1.5px', height: `${Math.abs(yB - yA)}px` } } });
            }
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yMid, yT)}px`, width: '1.5px', height: `${Math.abs(yT - yMid) + 1.5}px` } } });
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yT}px`, width: `${width/2}px`, height: '1.5px' } } });
        } else {
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yA}px`, width: `${width/2}px`, height: '1.5px' } } });
            if (fromTops[i * 2 + 1] !== undefined) {
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${yB}px`, width: `${width/2}px`, height: '1.5px' } } });
                lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yA, yB)}px`, width: '1.5px', height: `${Math.abs(yB - yA)}px` } } });
            }
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xMid}px`, top: `${Math.min(yMid, yT)}px`, width: '1.5px', height: `${Math.abs(yT - yMid) + 1.5}px` } } });
            lines.push({ type: 'div', props: { style: { ...lineStyle, left: `${xStart}px`, top: `${yT}px`, width: `${width/2}px`, height: '1.5px' } } });
        }
    }
    return lines;
}

// ── Main Generator ──────────────────────────────────────────────────────────
export async function generarBracketImagen(coppa, client) {
  const font = await getFontData();
  const avatars = await fetchAvatars(coppa.equipos, client);
  const bgB64 = getBgImageB64();

  const phases = coppa.fasesEliminatoria;
  const nPhases = phases.length;
  const areaH = 460;
  const yOffset = 110;

  const wingData = phases.map((phaseName, idx) => {
    const matches = coppa.llaves[phaseName];
    if (idx === nPhases - 1) return { label: '⚽ FINAL', center: matches[0] };
    const mid = Math.ceil(matches.length / 2);
    return {
      label: phaseName.toUpperCase(),
      left: matches.slice(0, mid),
      right: matches.slice(mid).reverse(),
    };
  });

  function getTops(n, areaH) {
    const sp = areaH / n;
    return Array.from({ length: n }, (_, i) => Math.round(i * sp + sp / 2) - CARD_H / 2);
  }

  const elements = [];

  // Round Positions
  const x_L = [PAD_X, PAD_X + CARD_W + GAP_X, PAD_X + 2 * (CARD_W + GAP_X)];
  const x_R = [CANVAS_W - PAD_X - CARD_W, CANVAS_W - PAD_X - 2 * CARD_W - GAP_X, CANVAS_W - PAD_X - 3 * CARD_W - 2 * GAP_X];
  const x_Final = (CANVAS_W - CARD_W) / 2;

  // Left Wing
  for (let i = 0; i < nPhases - 1; i++) {
    const matches = wingData[i].left;
    if (!matches) continue;
    const x = x_L[i];
    const tops = getTops(matches.length, areaH);

    // Header
    elements.push({
      type: 'div',
      props: {
        style: { position: 'absolute', top: '75px', left: `${x}px`, width: `${CARD_W}px`, display: 'flex', justifyContent: 'center' },
        children: {
            type: 'div',
            props: {
                style: { fontSize: '10px', fontWeight: 800, color: '#4ade80', padding: '3px 10px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '15px' },
                children: wingData[i].label
            }
        }
      }
    });

    matches.forEach((m, idx) => {
      elements.push({
        type: 'div',
        props: {
          style: { position: 'absolute', left: `${x}px`, top: `${yOffset + tops[idx]}px`, display: 'flex' },
          children: [buildMatchCard(m, avatars, false)]
        }
      });
    });

    if (i < nPhases - 1) {
        const nextX = i === nPhases - 2 ? x_Final : x_L[i+1];
        const nextTops = i === nPhases - 2 ? [areaH/2 - CARD_H/2] : getTops(wingData[i+1].left.length, areaH);
        const connW = i === nPhases - 2 ? x_Final - (x + CARD_W) : GAP_X;
        elements.push(...buildConnectors(tops, nextTops, x + CARD_W, connW, 'right').map(l => ({ ...l, props: { ...l.props, style: { ...l.props.style, top: `${parseFloat(l.props.style.top) + yOffset}px` } } })));
    }
  }

  // Right Wing
  for (let i = 0; i < nPhases - 1; i++) {
    const matches = wingData[i].right;
    if (!matches) continue;
    const x = x_R[i];
    const tops = getTops(matches.length, areaH);

    // Header
    elements.push({
      type: 'div',
      props: {
        style: { position: 'absolute', top: '75px', left: `${x}px`, width: `${CARD_W}px`, display: 'flex', justifyContent: 'center' },
        children: {
            type: 'div',
            props: {
                style: { fontSize: '10px', fontWeight: 800, color: '#4ade80', padding: '3px 10px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '15px' },
                children: wingData[i].label
            }
        }
      }
    });

    matches.forEach((m, idx) => {
      elements.push({
        type: 'div',
        props: {
          style: { position: 'absolute', left: `${x}px`, top: `${yOffset + tops[idx]}px`, display: 'flex' },
          children: [buildMatchCard(m, avatars, true)]
        }
      });
    });

    if (i < nPhases - 1) {
        const nextX = i === nPhases - 2 ? x_Final : x_R[i+1];
        const nextTops = i === nPhases - 2 ? [areaH/2 - CARD_H/2] : getTops(wingData[i+1].right.length, areaH);
        const connW = i === nPhases - 2 ? (x) - (x_Final + CARD_W) : GAP_X;
        const connX = i === nPhases - 2 ? x_Final + CARD_W : x - GAP_X;
        elements.push(...buildConnectors(tops, nextTops, connX, connW, 'left').map(l => ({ ...l, props: { ...l.props, style: { ...l.props.style, top: `${parseFloat(l.props.style.top) + yOffset}px` } } })));
    }
  }

  // Final
  const finalMatch = wingData[nPhases - 1].center;
  const topFinal = yOffset + areaH / 2 - CARD_H / 2;
  elements.push({
    type: 'div',
    props: {
      style: { position: 'absolute', top: '70px', left: `${x_Final}px`, width: `${CARD_W}px`, display: 'flex', justifyContent: 'center' },
      children: {
          type: 'div',
          props: {
              style: { fontSize: '11px', fontWeight: 900, letterSpacing: '2px', color: '#fbbf24', padding: '4px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '15px' },
              children: '⚽ FINAL'
          }
      }
    }
  });
  elements.push({
    type: 'div',
    props: {
      style: { position: 'absolute', left: `${x_Final}px`, top: `${topFinal}px`, display: 'flex' },
      children: [buildMatchCard(finalMatch, avatars, false)]
    }
  });

  const root = {
    type: 'div',
    props: {
      style: { display: 'flex', width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, background: '#011c0e', color: '#fff', fontFamily: 'Inter', position: 'relative', overflow: 'hidden' },
      children: [
        bgB64 ? { type: 'img', props: { src: bgB64, width: CANVAS_W, height: CANVAS_H, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } } } : null,
        { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,10,5,0.4)' } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '15px', position: 'relative' },
            children: [
              { type: 'div', props: { style: { fontSize: '28px', fontWeight: 900, color: '#4ade80', letterSpacing: '5px', textShadow: '0 0 15px rgba(74,222,128,0.4)' }, children: '⚽ COPA PLATUBI' } },
              { type: 'div', props: { style: { fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '2px' }, children: `COPPA - ${coppa.nombre || 'ELIMINACIÓN DIRECTA'}` } }
            ]
          }
        },
        ...elements
      ]
    }
  };

  const svg = await satori(root, {
    width: CANVAS_W, height: CANVAS_H,
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
    },
  });

  return new Resvg(svg, { fitTo: { mode: 'width', value: CANVAS_W * 2 } }).render().asPng();
}
