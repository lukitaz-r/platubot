import nodeHtmlToImage from 'node-html-to-image';
import { AttachmentBuilder } from 'discord.js';
import { sortEquipos, generarLetrasGrupo } from './copaManager.js';
import { getFlagUrl } from './flagUtils.js';

// ─── CSS con variables inyectables ────────────────────────────────────────────

function buildCSS(tema = {}) {
    const t = {
        primario: tema.primario || '#1a1a2e',
        secundario: tema.secundario || '#16213e',
        acento: tema.acento || '#e94560',
        texto: tema.texto || '#ffffff',
        borde: tema.borde || '#0f3460',
    };

    return `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, ${t.primario}, ${t.secundario});
            color: ${t.texto};
            padding: 32px;
            width: 820px;
        }
        .header {
            text-align: center;
            margin-bottom: 28px;
            padding-bottom: 16px;
        }
        .header h1 { font-size: 24px; font-weight: 800; letter-spacing: 1px; }
        .header .sub {
            font-size: 12px;
            opacity: 0.5;
            margin-top: 6px;
            letter-spacing: 3px;
            text-transform: uppercase;
        }

        /* ─── Phase tabs (visual only, for image) ─── */
        .phase-tabs {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-bottom: 24px;
        }
        .phase-tab {
            padding: 6px 18px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            border: 1px solid ${t.borde}66;
            color: ${t.texto}88;
        }
        .phase-tab.active {
            background: ${t.acento};
            color: ${t.texto};
            border-color: ${t.acento};
        }

        /* ─── Tabla de Grupo (card-row design) ─── */
        .group-table {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 0;
        }

        .group-table-header {
            display: flex;
            align-items: center;
            padding: 10px 20px;
            border-bottom: 2px solid ${t.borde}44;
            margin-bottom: 4px;
        }
        .group-table-header .th-pos { width: 36px; }
        .group-table-header .th-name { flex: 1; min-width: 0; }
        .group-table-header .th-stat { width: 46px; text-align: center; }
        .group-table-header span {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: ${t.acento};
        }

        .group-row {
            display: flex;
            align-items: center;
            padding: 12px 20px;
            border-radius: 12px;
            margin-bottom: 4px;
            position: relative;
            transition: all 0.15s;
        }
        .group-row:nth-child(odd)  { background: ${t.secundario}aa; }
        .group-row:nth-child(even) { background: ${t.primario}55; }

        .group-row.zona-clasif {
            border-left: 4px solid #4caf50;
        }
        .group-row.zona-elim {
            border-left: 4px solid ${t.acento};
        }
        .group-row.zona-none {
            border-left: 4px solid transparent;
        }

        .gr-pos {
            width: 36px;
            font-size: 16px;
            font-weight: 800;
            color: ${t.texto}88;
            text-align: center;
            flex-shrink: 0;
        }

        .gr-player {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
        }
        .gr-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid ${t.borde}88;
            flex-shrink: 0;
            background: ${t.primario};
        }
        .gr-avatar-placeholder {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: ${t.primario};
            border: 2px solid ${t.borde}88;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${t.borde};
            font-size: 14px;
        }
        .gr-name {
            font-weight: 600;
            font-size: 14px;
            color: ${t.texto};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .gr-stat {
            width: 46px;
            text-align: center;
            font-size: 13px;
            color: ${t.texto}cc;
            flex-shrink: 0;
        }
        .gr-stat.pts {
            font-weight: 900;
            font-size: 16px;
            color: ${t.acento};
        }
        .gr-stat.dif-pos {
            color: #4caf50;
            font-weight: 700;
        }
        .gr-stat.dif-neg {
            color: #ef5350;
            font-weight: 700;
        }
        .gr-stat.dif-zero {
            color: ${t.texto}66;
            font-weight: 600;
        }

        .group-legend {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-top: 16px;
            padding: 0 20px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: ${t.texto}88;
        }
        .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }
        .legend-dot.clasif { background: #4caf50; }
        .legend-dot.tercero { background: ${t.acento}; }

        /* ─── Match card (nuevo diseño horizontal con avatares) ─── */
        .match-card {
            background: ${t.secundario}cc;
            border: 1px solid ${t.borde}55;
            border-radius: 14px;
            padding: 16px 24px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            transition: all 0.2s;
        }
        .match-card.completed {
            border-left: 4px solid ${t.acento};
        }
        .match-card.pending-card {
            border-left: 4px solid ${t.borde}88;
        }

        .match-side {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
        }
        .match-side.away {
            flex-direction: row-reverse;
            text-align: right;
        }

        .match-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid ${t.borde}88;
            flex-shrink: 0;
            background: ${t.primario};
        }
        .match-avatar-placeholder {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: ${t.primario};
            border: 2px solid ${t.borde}88;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${t.borde};
            font-size: 16px;
        }

        .match-name {
            font-weight: 600;
            font-size: 14px;
            color: ${t.texto};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .match-name.winner-name {
            font-weight: 800;
            color: ${t.acento};
        }

        /* Centro del match con patas y agregado */
        .match-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            min-width: 210px;
            flex-shrink: 0;
        }

        .match-patas {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .match-pata {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }
        .pata-label {
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: ${t.texto}66;
        }
        .pata-score {
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: 700;
            font-size: 14px;
            color: ${t.texto};
        }
        .pata-score .ball {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${t.borde};
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
        }
        .pata-score.pending {
            color: ${t.texto}44;
        }
        .pata-divider {
            width: 1px;
            height: 32px;
            background: ${t.borde}66;
        }

        .match-aggregate {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            margin-top: 2px;
        }
        .aggregate-label {
            font-weight: 700;
            color: ${t.acento};
        }
        .aggregate-score {
            font-weight: 800;
            color: ${t.texto};
        }
        .aggregate-pending {
            font-weight: 600;
            color: ${t.texto}44;
            font-style: italic;
        }
        .winner-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 800;
            color: ${t.acento};
        }
        .winner-star {
            color: #f59e0b;
        }

        /* ─── Bracket ─── */
        .bracket { display: flex; gap: 24px; align-items: flex-start; }
        .bracket-round { display: flex; flex-direction: column; gap: 16px; min-width: 180px; }
        .bracket-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: ${t.acento}; margin-bottom: 8px; text-align: center; }
        .bracket-match {
            background: ${t.secundario};
            border: 1px solid ${t.borde}66;
            border-radius: 6px;
            overflow: hidden;
        }
        .bracket-team {
            padding: 8px 12px;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid ${t.borde}44;
        }
        .bracket-team:last-child { border-bottom: none; }
        .bracket-team.winner { background: ${t.acento}22; font-weight: 700; }
        .bracket-team .score { font-weight: 700; }
    `;
}

// ─── Helpers para match cards ─────────────────────────────────────────────────

function getAvatarFromTorneo(torneo, nombre) {
    return torneo.equipos?.find(e => e.nombre === nombre)?.avatar || '';
}

function buildAvatarHTML(avatarUrl) {
    if (avatarUrl) {
        return `<img class="match-avatar" src="${avatarUrl}" />`;
    }
    return `<div class="match-avatar-placeholder">?</div>`;
}

/**
 * Genera una match card visual con avatares, IDA/VUELTA, agregado y ganador.
 * Soporta: partido_unico, ida_vuelta, y mejor_de_3.
 */
function buildMatchCardHTML(enf, torneo, opciones = {}) {
    const { esGrupo = false, grupoLabel = '' } = opciones;
    const t = torneo.tema || {};
    const fmt = torneo.formatoEliminatoria;
    const esPartidoUnico = fmt === 'partido_unico';

    const avLocal = getAvatarFromTorneo(torneo, enf.local);
    const avVisitante = getAvatarFromTorneo(torneo, enf.visitante);

    // Determinar scores
    const idaJugado = enf.ida?.jugado;
    const vueltaJugado = enf.vuelta?.jugado;

    const idaScoreL = idaJugado ? enf.ida.golesLocal : '-';
    const idaScoreV = idaJugado ? enf.ida.golesVisitante : '-';
    const vueltaScoreL = vueltaJugado ? enf.vuelta.golesLocal : '-';
    const vueltaScoreV = vueltaJugado ? enf.vuelta.golesVisitante : '-';

    const done = !!enf.completado || !!enf.ganador;
    const ganador = enf.ganador;
    const isLocalWinner = ganador === enf.local;
    const isVisitanteWinner = ganador === enf.visitante;
    const isEmpate = ganador === 'Empate';

    // Build pata scores
    let patasHTML = '';

    if (esPartidoUnico) {
        // Partido único: solo una columna de score
        let resultado = '';
        if (enf.resultado && !['Pendiente', 'BYE'].includes(enf.resultado)) {
            resultado = enf.resultado;
        } else if (idaJugado) {
            resultado = `${idaScoreL} - ${idaScoreV}`;
        }

        patasHTML = `
            <div class="match-pata">
                <div class="pata-label">RESULTADO</div>
                <div class="pata-score ${resultado ? '' : 'pending'}">
                    <span class="ball">⚽</span> ${resultado || '- vs -'} <span class="ball">⚽</span>
                </div>
            </div>
        `;
    } else {
        // Ida y vuelta
        patasHTML = `
            <div class="match-pata">
                <div class="pata-label">IDA</div>
                <div class="pata-score ${idaJugado ? '' : 'pending'}">
                    <span class="ball">⚽</span> ${idaScoreL} - ${idaScoreV} <span class="ball">⚽</span>
                </div>
            </div>
            <div class="pata-divider"></div>
            <div class="match-pata">
                <div class="pata-label">VUELTA</div>
                <div class="pata-score ${vueltaJugado ? '' : 'pending'}">
                    <span class="ball">⚽</span> ${vueltaScoreL} - ${vueltaScoreV} <span class="ball">⚽</span>
                </div>
            </div>
        `;
    }

    // Aggregate / resultado final
    let aggregateHTML = '';
    if (done && !esPartidoUnico) {
        const agrL = enf.golesAgregLocal ?? 0;
        const agrV = enf.golesAgregVisitante ?? 0;
        const winnerName = isEmpate ? 'EMPATE' : ganador;
        aggregateHTML = `
            <div class="match-aggregate">
                <span class="aggregate-label">AGR</span>
                <span class="aggregate-score">${agrL} - ${agrV}</span>
                <span class="winner-indicator"><span class="winner-star">★</span> ${winnerName?.toUpperCase()}</span>
            </div>
        `;
    } else if (done && esPartidoUnico) {
        const winnerName = ganador;
        aggregateHTML = `
            <div class="match-aggregate">
                <span class="winner-indicator"><span class="winner-star">★</span> ${winnerName?.toUpperCase()}</span>
            </div>
        `;
    } else {
        aggregateHTML = `
            <div class="match-aggregate">
                <span class="aggregate-label">AGR</span>
                <span class="aggregate-pending">? - ? EN DISPUTA</span>
            </div>
        `;
    }

    const cardClass = done ? 'match-card completed' : 'match-card pending-card';

    return `
        <div class="${cardClass}">
            <div class="match-side">
                ${buildAvatarHTML(avLocal)}
                <span class="match-name ${isLocalWinner ? 'winner-name' : ''}">${enf.local}</span>
            </div>
            <div class="match-center">
                <div class="match-patas">
                    ${patasHTML}
                </div>
                ${aggregateHTML}
            </div>
            <div class="match-side away">
                ${buildAvatarHTML(avVisitante)}
                <span class="match-name ${isVisitanteWinner ? 'winner-name' : ''}">${enf.visitante}</span>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLA DE GRUPO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen de tabla de posiciones de un grupo (diseño card-row con avatares).
 */
export async function generarTablaGrupoCopa(torneo, grupo) {
    const equiposGrupo = sortEquipos(
        torneo.equipos.filter(e => e.grupo === grupo),
        torneo.criteriosClasificacion || ['puntos', 'dif', 'gf']
    );

    if (!equiposGrupo.length) return null;

    const filas = equiposGrupo.map((e, i) => {
        const zonaClass = i < torneo.clasificadosPorGrupo
            ? 'zona-clasif'
            : (torneo.mejorTercero && i === torneo.clasificadosPorGrupo ? 'zona-elim' : 'zona-none');

        const dif = e.gf - e.gc;
        const difClass = dif > 0 ? 'dif-pos' : dif < 0 ? 'dif-neg' : 'dif-zero';
        const difText = dif > 0 ? `+${dif}` : `${dif}`;

        const avatarUrl = e.avatar || '';
        const avatarHTML = avatarUrl
            ? `<img class="gr-avatar" src="${avatarUrl}" />`
            : `<div class="gr-avatar-placeholder">?</div>`;

        return `
            <div class="group-row ${zonaClass}">
                <div class="gr-pos">${i + 1}</div>
                <div class="gr-player">
                    ${avatarHTML}
                    <span class="gr-name">${e.nombre}</span>
                </div>
                <div class="gr-stat pts">${e.puntos}</div>
                <div class="gr-stat">${e.pj}</div>
                <div class="gr-stat">${e.pg}</div>
                <div class="gr-stat">${e.pe}</div>
                <div class="gr-stat">${e.pp}</div>
                <div class="gr-stat">${e.gf}</div>
                <div class="gr-stat">${e.gc}</div>
                <div class="gr-stat ${difClass}">${difText}</div>
            </div>
        `;
    }).join('');

    // Build legend
    let legendItems = `<div class="legend-item"><div class="legend-dot clasif"></div> Clasificado directo (${torneo.clasificadosPorGrupo} por grupo)</div>`;
    if (torneo.mejorTercero) {
        legendItems += `<div class="legend-item"><div class="legend-dot tercero"></div> Mejor tercero (${torneo.cantMejoresTerceros} clasifican)</div>`;
    }

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body>
            <div class="header">
                <h1>🏆 ${torneo.nombre} — GRUPO ${grupo}</h1>
                <div class="sub">Fase de Grupos · Clasificación</div>
            </div>

            <div class="group-table">
                <div class="group-table-header">
                    <span class="th-pos">#</span>
                    <span class="th-name">JUGADOR</span>
                    <span class="th-stat">PTS</span>
                    <span class="th-stat">PJ</span>
                    <span class="th-stat">PG</span>
                    <span class="th-stat">PE</span>
                    <span class="th-stat">PP</span>
                    <span class="th-stat">GF</span>
                    <span class="th-stat">GC</span>
                    <span class="th-stat">DIF</span>
                </div>
                ${filas}
            </div>

            <div class="group-legend">
                ${legendItems}
            </div>
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: `tabla_${torneo.prefix}_grupo_${grupo}.png` });
    } catch (err) {
        console.error('Error generando tabla de grupo:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLA UNIFICADA CHAMPIONS (ranking global, una sola tabla)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen de tabla de posiciones UNIFICADA (todos los participantes en una tabla).
 * Usada para formato Champions: muestra zonas de clasificado directo, playoff y eliminados.
 */
export async function generarTablaUnificadaCopa(torneo) {
    const todosEquipos = sortEquipos(
        [...torneo.equipos],
        torneo.criteriosClasificacion || ['puntos', 'dif', 'gf']
    );

    if (!todosEquipos.length) return null;

    const cc = torneo.championsConfig || {};
    const directos = cc.directos || 0;
    const playoff = cc.playoff || 0;
    // eliminados = total - directos - playoff

    const filas = todosEquipos.map((e, i) => {
        let zonaClass, zonaBorder;
        if (i < directos) {
            zonaClass = 'zona-directo';
            zonaBorder = '#4caf50'; // verde
        } else if (i < directos + playoff) {
            zonaClass = 'zona-playoff';
            zonaBorder = '#ff9800'; // naranja
        } else {
            zonaClass = 'zona-elim';
            zonaBorder = '#ef5350'; // rojo
        }

        const dif = e.gf - e.gc;
        const difClass = dif > 0 ? 'dif-pos' : dif < 0 ? 'dif-neg' : 'dif-zero';
        const difText = dif > 0 ? `+${dif}` : `${dif}`;

        const avatarUrl = e.avatar || '';
        const avatarHTML = avatarUrl
            ? `<img class="gr-avatar" src="${avatarUrl}" />`
            : `<div class="gr-avatar-placeholder">?</div>`;

        return `
            <div class="group-row" style="border-left: 4px solid ${zonaBorder};">
                <div class="gr-pos">${i + 1}</div>
                <div class="gr-player">
                    ${avatarHTML}
                    <span class="gr-name">${e.nombre}</span>
                </div>
                <div class="gr-stat pts">${e.puntos}</div>
                <div class="gr-stat">${e.pj}</div>
                <div class="gr-stat">${e.pg}</div>
                <div class="gr-stat">${e.pe}</div>
                <div class="gr-stat">${e.pp}</div>
                <div class="gr-stat">${e.gf}</div>
                <div class="gr-stat">${e.gc}</div>
                <div class="gr-stat ${difClass}">${difText}</div>
            </div>
        `;
    }).join('');

    const legendItems = `
        <div class="legend-item"><div class="legend-dot" style="background:#4caf50;"></div> Clasificado directo (${directos})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ff9800;"></div> Fase previa / Playoff (${playoff})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ef5350;"></div> Eliminado</div>
    `;

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body style="width: 860px;">
            <div class="header">
                <h1>🏆 ${torneo.nombre} — LIGUILLA</h1>
                <div class="sub">Ranking Global · ${todosEquipos.length} participantes</div>
            </div>

            <div class="group-table">
                <div class="group-table-header">
                    <span class="th-pos">#</span>
                    <span class="th-name">JUGADOR</span>
                    <span class="th-stat">PTS</span>
                    <span class="th-stat">PJ</span>
                    <span class="th-stat">PG</span>
                    <span class="th-stat">PE</span>
                    <span class="th-stat">PP</span>
                    <span class="th-stat">GF</span>
                    <span class="th-stat">GC</span>
                    <span class="th-stat">DIF</span>
                </div>
                ${filas}
            </div>

            <div class="group-legend">
                ${legendItems}
            </div>
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: `tabla_${torneo.prefix}_liguilla.png` });
    } catch (err) {
        console.error('Error generando tabla unificada:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE UNIFICADO CHAMPIONS (todos los enfrentamientos en una imagen)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen de TODOS los enfrentamientos de la liguilla (sin separar por grupo).
 */
export async function generarFixtureUnificadoCopa(torneo) {
    const enfs = torneo.enfrentamientosGrupos || [];
    if (!enfs.length) return null;

    const matchCards = enfs.map(enf => buildMatchCardHTML(enf, torneo, { esGrupo: true })).join('');

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body style="width: 860px;">
            <div class="header">
                <h1>🏆 ${torneo.nombre} — LIGUILLA</h1>
                <div class="sub">Todos los enfrentamientos · ${enfs.length} partidos</div>
            </div>
            ${matchCards}
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: `fixture_${torneo.prefix}_liguilla.png` });
    } catch (err) {
        console.error('Error generando fixture unificado:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE POR EQUIPO (Champions — muestra solo los partidos de un equipo)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen con todos los enfrentamientos de un equipo específico.
 * @param {Object} torneo - Documento del torneo
 * @param {string} nombreEquipo - Nombre del equipo a buscar
 */
export async function generarFixtureEquipoCopa(torneo, nombreEquipo) {
    const enfs = (torneo.enfrentamientosGrupos || []).filter(
        e => e.local === nombreEquipo || e.visitante === nombreEquipo
    );
    if (!enfs.length) return null;

    const equipo = torneo.equipos.find(e => e.nombre === nombreEquipo);
    const avatarUrl = equipo?.avatar || '';
    const avatarHTML = avatarUrl
        ? `<img style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${torneo.tema?.borde || '#0f3460'}88;" src="${avatarUrl}" />`
        : '';

    const matchCards = enfs.map(enf => buildMatchCardHTML(enf, torneo, { esGrupo: true })).join('');

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body style="width: 860px;">
            <div class="header" style="display:flex;align-items:center;justify-content:center;gap:16px;">
                ${avatarHTML}
                <div>
                    <h1>🏆 ${torneo.nombre}</h1>
                    <div class="sub">Fixture de ${nombreEquipo} · ${enfs.length} partidos</div>
                </div>
            </div>
            ${matchCards}
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        const safeName = nombreEquipo.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        return new AttachmentBuilder(buffer, { name: `fixture_${torneo.prefix}_${safeName}.png` });
    } catch (err) {
        console.error('Error generando fixture de equipo:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE DE GRUPO (enfrentamientos)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen de enfrentamientos de un grupo.
 */
export async function generarFixtureGrupoCopa(torneo, grupo) {
    const enfs = torneo.enfrentamientosGrupos.filter(e => e.grupo === grupo);
    if (!enfs.length) return null;

    const matchCards = enfs.map(enf => buildMatchCardHTML(enf, torneo, { esGrupo: true })).join('');

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body>
            <div class="header">
                <h1>🏆 ${torneo.nombre} — Grupo ${grupo}</h1>
                <div class="sub">Fase de Grupos · Enfrentamientos</div>
            </div>
            ${matchCards}
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: `fixture_${torneo.prefix}_grupo_${grupo}.png` });
    } catch (err) {
        console.error('Error generando fixture de grupo:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE ELIMINATORIO (enfrentamientos por fase)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera imagen de enfrentamientos de una fase eliminatoria.
 * @param {Object} torneo - Documento del torneo
 * @param {string} faseKey - Key de la fase (ej: 'cuartos', 'semis', 'final')
 * @param {string} faseLabel - Label legible (ej: 'Cuartos de Final')
 */
export async function generarFixtureEliminatoriaCopa(torneo, faseKey, faseLabel) {
    const partidos = torneo.llaves.get(faseKey) || [];
    if (!partidos.length) return null;

    // Construir tabs de fase
    const fases = torneo.fasesEliminatoria || [];
    const tabsHTML = fases.map(f => {
        const isActive = f.toLowerCase() === faseKey;
        return `<span class="phase-tab ${isActive ? 'active' : ''}">${f}</span>`;
    }).join('');

    const matchCards = partidos.map(m => {
        // Adaptar del formato de duelo eliminatorio al formato de match card
        const enf = {
            local: m.local || 'TBD',
            visitante: m.visitante || 'TBD',
            ida: m.ida || { jugado: false },
            vuelta: m.vuelta || { jugado: false },
            completado: m.completado,
            ganador: m.ganador,
            resultado: m.resultado,
            golesAgregLocal: m.golesAgregLocal,
            golesAgregVisitante: m.golesAgregVisitante,
        };
        return buildMatchCardHTML(enf, torneo);
    }).join('');

    const html = `
        <html><head><style>${buildCSS(torneo.tema)}</style></head>
        <body>
            <div class="header">
                <h1>🏆 ${torneo.nombre} — ${faseLabel}</h1>
                <div class="sub">Fase Eliminatoria · Enfrentamientos</div>
            </div>
            ${fases.length > 1 ? `<div class="phase-tabs">${tabsHTML}</div>` : ''}
            ${matchCards}
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: `fixture_${torneo.prefix}_${faseKey}.png` });
    } catch (err) {
        console.error('Error generando fixture eliminatorio:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRACKET ELIMINATORIO — Nuevo diseño split izq/der con avatares y SVG connectors
// ═══════════════════════════════════════════════════════════════════════════════

/** Layout mutable para el bracket visual, reseteado por render */
const bcfg = {
    CARD_W: 240, ROW_H: 44, CARD_H: 89, CARD_GAP: 28,
    GAP_X: 50, PAD_X: 52, HDR_H: 88, FTR_H: 44,
};

// Canvas mínimo para torneos sin imagen de fondo
const BRACKET_W_MIN = 1280;
const BRACKET_H_MIN = 620;

function computeBracketLayout(totalDisplayCols, firstHalfN) {
    const BASE_CW = 240, BASE_RH = 44, BASE_GX = 50, BASE_CG = 28, BASE_PAD = 52;

    const baseNeededW = totalDisplayCols * BASE_CW + (totalDisplayCols - 1) * BASE_GX + BASE_PAD * 2;
    const sfW = Math.max(1.0, Math.min(1.8, BRACKET_W_MIN / baseNeededW));

    const baseSlotH   = BASE_RH * 2 + 1 + BASE_CG;
    const baseNeededH = firstHalfN * baseSlotH + 88 + 52 + BASE_PAD;
    const sfH = Math.max(1.0, Math.min(2.2, BRACKET_H_MIN / baseNeededH));

    const sf = Math.min(sfW, sfH);

    bcfg.CARD_W   = Math.round(BASE_CW  * sfW);
    bcfg.ROW_H    = Math.min(80, Math.round(BASE_RH  * sfH));
    bcfg.CARD_H   = bcfg.ROW_H * 2 + 1;
    bcfg.CARD_GAP = Math.min(80, Math.round(BASE_CG  * sfH));
    bcfg.GAP_X    = Math.round(BASE_GX  * sf);
    bcfg.PAD_X    = Math.round(BASE_PAD * sfW);
    bcfg.HDR_H    = Math.round(88 * sfH);
    bcfg.FTR_H    = 44;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function bCenters(n, areaH) {
    const sp = areaH / n;
    return Array.from({ length: n }, (_, i) => Math.round(i * sp + sp / 2));
}
function bTops(n, areaH) {
    return bCenters(n, areaH).map(c => c - Math.round(bcfg.CARD_H / 2));
}
function getAvatarCopa(torneo, nombre) {
    return torneo.equipos?.find(e => e.nombre === nombre)?.avatar || '';
}

// ── Team row ─────────────────────────────────────────────────────────────────
function bTeamRow(name, score, isWinner, isLoser, avatarUrl, reversed, t) {
    const acento   = t.acento || '#e94560';
    const borderColor = isWinner ? acento : isLoser ? '#ef4444' : 'transparent';
    const bg       = isWinner ? `${acento}22` : isLoser ? 'rgba(239,68,68,0.10)' : 'transparent';
    const nameClr  = isWinner ? acento : isLoser ? '#fca5a5' : '#e2e8f0';
    const scoreBg  = isWinner ? acento : isLoser ? '#7f1d1d' : (t.borde || '#0f3460');
    const scoreClr = isWinner ? '#fff' : isLoser ? '#fca5a5' : '#94a3b8';
    const avFilter = isLoser  ? 'grayscale(100%) brightness(0.7)' : 'none';

    const imgSz = bcfg.ROW_H - 10;
    const img = avatarUrl
        ? `<img src="${avatarUrl}" style="width:${imgSz}px;height:${imgSz}px;border-radius:6px;object-fit:cover;flex-shrink:0;filter:${avFilter};">`
        : `<div style="width:${imgSz}px;height:${imgSz}px;border-radius:6px;background:${t.secundario || '#16213e'};flex-shrink:0;filter:${avFilter};display:flex;align-items:center;justify-content:center;color:#475569;font-size:${Math.round(imgSz*0.4)}px;">?</div>`;

    const fs  = Math.max(10, Math.round(bcfg.CARD_W * 0.05));
    const ssz = Math.round(bcfg.ROW_H * 0.62);
    const scoreEl = (score !== '' && score !== null && score !== undefined)
        ? `<div style="min-width:${ssz}px;height:${ssz}px;border-radius:6px;background:${scoreBg};color:${scoreClr};font-weight:900;font-size:${Math.round(ssz*0.55)}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0 4px;">${score}</div>`
        : `<div style="min-width:${ssz}px;height:${ssz}px;flex-shrink:0;"></div>`;

    const nameEl = `<span style="flex:1;font-size:${fs}px;font-weight:${isWinner?'800':'500'};color:${nameClr};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${reversed?'text-align:right;':''}">${name}</span>`;
    const inner  = reversed ? `${scoreEl}${nameEl}${img}` : `${img}${nameEl}${scoreEl}`;
    const border = reversed ? `border-right:3px solid ${borderColor};` : `border-left:3px solid ${borderColor};`;

    return `<div style="${border}background:${bg};display:flex;align-items:center;gap:8px;padding:0 10px;height:${bcfg.ROW_H}px;">${inner}</div>`;
}

// ── Match card ────────────────────────────────────────────────────────────────
function bMatchCard(m, torneo, fmt, reversed = false) {
    const t   = torneo.tema || {};
    const loc = m.local    || 'TBD';
    const vis = m.visitante || 'TBD';
    const isBye = vis === 'BYE';

    let sL = '', sV = '';
    if (fmt === 'partido_unico') {
        if (m.resultado && !['Pendiente','BYE'].includes(m.resultado)) {
            const p = m.resultado.split('-');
            sL = p[0]?.trim() ?? ''; sV = p[1]?.trim() ?? '';
        }
    } else if (m.ida?.jugado) {
        sL = m.golesAgregLocal ?? ''; sV = m.golesAgregVisitante ?? '';
    }

    const done = !!m.ganador;
    const wL   = done && m.ganador === loc;
    const wV   = done && m.ganador === vis;
    const isTBD = loc === 'TBD' && vis === 'TBD';

    const avL = getAvatarCopa(torneo, loc);
    const avV = isBye ? '' : getAvatarCopa(torneo, vis);

    const rowL = isBye ? bTeamRow(loc, 'BYE', true, false, avL, reversed, t) : bTeamRow(loc, sL, wL, done && !wL, avL, reversed, t);
    const rowV = isBye
        ? `<div style="display:flex;align-items:center;gap:8px;padding:0 10px;height:${bcfg.ROW_H}px;"><span style="font-size:11px;color:#475569;font-style:italic;${reversed?'text-align:right;width:100%;':''}">BYE</span></div>`
        : bTeamRow(vis, sV, wV, done && !wV, avV, reversed, t);

    return `<div style="width:${bcfg.CARD_W}px;background:${t.secundario || '#16213e'}cc;border:1px solid ${t.borde || '#0f3460'}66;border-radius:10px;overflow:hidden;box-shadow:0 4px 22px rgba(0,0,0,0.5);opacity:${isTBD?'0.35':'1'};">${rowL}<div style="height:1px;background:${t.borde || '#0f3460'}44;"></div>${rowV}</div>`;
}

// ── Round column ──────────────────────────────────────────────────────────────
function bRoundCol(matches, torneo, fmt, reversed, areaH, label) {
    const t    = torneo.tema || {};
    const tops = bTops(matches.length, areaH);
    const cards = matches.map((m, i) =>
        `<div style="position:absolute;top:${tops[i]}px;left:0;right:0;">${bMatchCard(m, torneo, fmt, reversed)}</div>`
    ).join('');

    const badge = `<div style="position:absolute;top:${-Math.round(bcfg.HDR_H*0.4)}px;left:0;right:0;text-align:center;">
        <span style="font-size:${Math.max(9,Math.round(bcfg.CARD_W*0.042))}px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${t.acento||'#e94560'};padding:3px 12px;background:${t.acento||'#e94560'}12;border:1px solid ${t.acento||'#e94560'}40;border-radius:20px;white-space:nowrap;">${label}</span>
    </div>`;

    return `<div style="position:relative;width:${bcfg.CARD_W}px;height:${areaH}px;flex-shrink:0;">${badge}${cards}</div>`;
}

// ── SVG connectors ────────────────────────────────────────────────────────────
function bWrapSVG(lines, areaH, color) {
    return `<svg width="${bcfg.GAP_X}" height="${areaH}" style="flex-shrink:0;overflow:visible;" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
}
function bConnConverge(fromC, toC, areaH, color) {
    const xM = bcfg.GAP_X / 2; let lines = '';
    for (let i = 0; i < toC.length; i++) {
        const yA = fromC[i*2], yB = fromC[i*2+1], yT = toC[i];
        const mid = yB !== undefined ? (yA+yB)/2 : yA;
        lines += `<line x1="0" y1="${yA}" x2="${xM}" y2="${yA}" stroke="${color}" stroke-width="1.5"/>`;
        if (yB !== undefined) {
            lines += `<line x1="0" y1="${yB}" x2="${xM}" y2="${yB}" stroke="${color}" stroke-width="1.5"/>`;
            lines += `<line x1="${xM}" y1="${yA}" x2="${xM}" y2="${yB}" stroke="${color}" stroke-width="1.5"/>`;
        }
        lines += `<line x1="${xM}" y1="${mid}" x2="${bcfg.GAP_X}" y2="${yT}" stroke="${color}" stroke-width="1.5"/>`;
    }
    return bWrapSVG(lines, areaH, color);
}
function bConnDiverge(fromC, toC, areaH, color) {
    const xM = bcfg.GAP_X / 2; let lines = '';
    for (let i = 0; i < fromC.length; i++) {
        const yF = fromC[i], yA = toC[i*2], yB = toC[i*2+1];
        const mid = yB !== undefined ? (yA+yB)/2 : yA;
        lines += `<line x1="0" y1="${yF}" x2="${xM}" y2="${mid}" stroke="${color}" stroke-width="1.5"/>`;
        if (yB !== undefined) {
            lines += `<line x1="${xM}" y1="${yA}" x2="${xM}" y2="${yB}" stroke="${color}" stroke-width="1.5"/>`;
            lines += `<line x1="${xM}" y1="${yA}" x2="${bcfg.GAP_X}" y2="${yA}" stroke="${color}" stroke-width="1.5"/>`;
            lines += `<line x1="${xM}" y1="${yB}" x2="${bcfg.GAP_X}" y2="${yB}" stroke="${color}" stroke-width="1.5"/>`;
        } else {
            lines += `<line x1="${xM}" y1="${yA}" x2="${bcfg.GAP_X}" y2="${yA}" stroke="${color}" stroke-width="1.5"/>`;
        }
    }
    return bWrapSVG(lines, areaH, color);
}
function bConnLine(yF, yT, areaH, color) {
    return bWrapSVG(`<line x1="0" y1="${yF}" x2="${bcfg.GAP_X}" y2="${yT}" stroke="${color}" stroke-width="1.5"/>`, areaH, color);
}

// ── Placeholders ──────────────────────────────────────────────────────────────
function bMakePlaceholders(count, faseLabel) {
    return Array.from({ length: count }, () => ({
        local: 'TBD', visitante: 'TBD', fase: faseLabel,
        completado: false, ganador: null, resultado: 'Pendiente',
        ida: { jugado: false }, golesAgregLocal: '', golesAgregVisitante: '',
    }));
}
function bExpected(firstN, idx) { return Math.max(1, Math.ceil(firstN / Math.pow(2, idx))); }

// ── Build bracket ─────────────────────────────────────────────────────────────
function buildBracketCopaHTML(torneo) {
    const fases = torneo.fasesEliminatoria || [];
    if (!fases.length) return '<p style="color:white;">Sin fases.</p>';

    const fmt     = torneo.formatoEliminatoria;
    const t       = torneo.tema || {};
    const lineClr = `${t.acento || '#e94560'}55`;
    const nPhases = fases.length;
    const phaseMs = fases.map(f => torneo.llaves.get(f.toLowerCase()) || []);

    const firstTotal = phaseMs[0].length;
    const firstHalfN = Math.max(1, Math.ceil(firstTotal / 2));
    const areaH    = Math.max(firstHalfN * (bcfg.CARD_H + bcfg.CARD_GAP), bcfg.CARD_H * 2);

    const preFase = fases.slice(0, -1);
    const finalLabel = fases[nPhases - 1];

    const leftCols = preFase.map((f, i) => {
        const ms = phaseMs[i], half = Math.ceil(ms.length / 2);
        const actual = ms.slice(0, half);
        return { label: f, matches: actual.length > 0 ? actual : bMakePlaceholders(bExpected(firstHalfN, i), f) };
    });
    const rightCols = preFase.map((f, i) => {
        const ms = phaseMs[i], half = Math.ceil(ms.length / 2);
        const actual = ms.slice(half);
        return { label: f, matches: actual.length > 0 ? actual : bMakePlaceholders(bExpected(firstHalfN, i), f) };
    }).reverse();

    const finalMs = phaseMs[nPhases - 1];
    const finalMatches = finalMs.length > 0 ? finalMs : bMakePlaceholders(1, finalLabel);

    const totalCols = preFase.length * 2 + 1;
    const bracketW  = totalCols * bcfg.CARD_W + (totalCols - 1) * bcfg.GAP_X;
    const canvasW   = Math.max(bracketW + bcfg.PAD_X * 2, BRACKET_W_MIN);
    const hPad      = Math.round((canvasW - bracketW) / 2);

    let html = `<div style="display:flex;align-items:center;gap:0;padding-left:${hPad - bcfg.PAD_X}px;">`;

    // LEFT
    for (let i = 0; i < leftCols.length; i++) {
        const { label, matches } = leftCols[i];
        html += bRoundCol(matches, torneo, fmt, false, areaH, label);
        const fromC  = bCenters(matches.length, areaH);
        const nextMs = i === leftCols.length - 1 ? finalMatches : leftCols[i+1].matches;
        const toC    = bCenters(nextMs.length, areaH);
        html += fromC.length === toC.length ? bConnLine(fromC[0], toC[0], areaH, lineClr) : bConnConverge(fromC, toC, areaH, lineClr);
    }
    // CENTER: Final
    html += bRoundCol(finalMatches, torneo, fmt, false, areaH, '🏆 FINAL');
    // RIGHT
    for (let i = 0; i < rightCols.length; i++) {
        const { label, matches } = rightCols[i];
        const prevMs = i === 0 ? finalMatches : rightCols[i-1].matches;
        const fromC  = bCenters(prevMs.length, areaH);
        const toC    = bCenters(matches.length, areaH);
        html += fromC.length === toC.length ? bConnLine(fromC[0], toC[0], areaH, lineClr) : bConnDiverge(fromC, toC, areaH, lineClr);
        html += bRoundCol(matches, torneo, fmt, true, areaH, label);
    }

    html += '</div>';

    // Tercer puesto
    if (torneo.hayTercerPuesto) {
        const tp = torneo.llaves.get('tercerpuesto') || [];
        if (tp.length) {
            html += `<div style="display:flex;flex-direction:column;align-items:center;margin-top:36px;gap:10px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;">🥉 TERCER PUESTO</span>
                ${bMatchCard(tp[0], torneo, fmt, false)}
            </div>`;
        }
    }

    return html;
}

/**
 * Genera bracket visual del torneo (diseño split izquierda/derecha con avatares).
 */
export async function generarBracketCopa(torneo) {
    const fases = torneo.fasesEliminatoria || [];
    if (!fases.length) return null;

    const t            = torneo.tema || {};
    const primario     = t.primario   || '#1a1a2e';
    const secundario   = t.secundario || '#16213e';
    const acento       = t.acento     || '#e94560';

    const nPreFinal  = fases.length - 1;
    const totalCols  = nPreFinal * 2 + 1;
    const firstMs    = torneo.llaves.get(fases[0]?.toLowerCase()) || [];
    const firstHalfN = Math.max(1, Math.ceil(firstMs.length / 2));

    computeBracketLayout(totalCols, firstHalfN);

    const areaH   = Math.max(firstHalfN * (bcfg.CARD_H + bcfg.CARD_GAP), bcfg.CARD_H * 2);
    const bracketW = totalCols * bcfg.CARD_W + (totalCols - 1) * bcfg.GAP_X;
    const canvasW  = Math.max(bracketW + bcfg.PAD_X * 2, BRACKET_W_MIN);
    const canvasH  = Math.max(bcfg.HDR_H + 60 + areaH + bcfg.FTR_H * 2, BRACKET_H_MIN);

    const fmtLabel = torneo.formatoEliminatoria === 'ida_vuelta' ? 'Ida y Vuelta' : 'Partido Único';
    const bracket  = buildBracketCopaHTML(torneo);

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { width:${canvasW}px; min-height:${canvasH}px; }
        body {
            font-family:'Inter',sans-serif;
            background: linear-gradient(160deg, ${primario} 0%, ${secundario} 55%, ${acento}22 100%);
            display:block; position:relative;
        }
        .overlay {
            position:absolute; top:0; left:0;
            width:${canvasW}px; min-height:${canvasH}px;
            background:rgba(0,0,0,0.50); z-index:0;
        }
        .page { position:relative; z-index:1; padding:0 ${bcfg.PAD_X}px ${bcfg.FTR_H}px; min-height:${canvasH}px; }
        .header { height:${bcfg.HDR_H}px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
        .title {
            font-size:${Math.round(bcfg.CARD_W*0.12)}px; font-weight:900;
            letter-spacing:5px; text-transform:uppercase;
            color:${acento};
            text-shadow:0 0 28px ${acento}88, 0 2px 10px rgba(0,0,0,0.9);
        }
        .subtitle { font-size:${Math.round(bcfg.CARD_W*0.045)}px; letter-spacing:3px; text-transform:uppercase; color:#64748b; }
    `;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
    <div class="overlay"></div>
    <div class="page">
        <div class="header">
            <div class="title">🏆 ${torneo.nombre}</div>
            <div class="subtitle">Bracket · ${fmtLabel}</div>
        </div>
        <div style="margin-top:${Math.round(bcfg.HDR_H*0.5)}px;">${bracket}</div>
    </div>
</body></html>`;

    try {
        const buffer = await nodeHtmlToImage({
            html, transparent: false, type: 'png', waitUntil: 'networkidle0',
            puppeteerArgs: { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox','--disable-setuid-sandbox'] },
            beforeScreenshot: async (page) => { await page.setViewport({ width: canvasW, height: canvasH }); },
        });
        return new AttachmentBuilder(buffer, { name: `bracket_${torneo.prefix}.png` });
    } catch (err) {
        console.error('Error generando bracket copa:', err);
        return null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW DE TEMA (WIZARD CREACIÓN)
// ═══════════════════════════════════════════════════════════════════════════════


/**
 * Genera una preview de prueba mostrando los colores configurados por el administrador
 */
export async function generarPreviewTema(nombre, tema) {
    const t = {
        primario: tema.primario || '#1a1a2e',
        secundario: tema.secundario || '#16213e',
        acento: tema.acento || '#e94560',
        texto: tema.texto || '#ffffff',
        borde: tema.borde || '#0f3460',
    };

    const html = `
        <html><head><style>${buildCSS(tema)}</style></head>
        <body>
            <div class="header">
                <h1>🏆 ${nombre} — Preview Visual</h1>
                <div class="sub">Así es como se verán las tablas y fixtures</div>
            </div>
            
            <!-- Tabla de grupo preview -->
            <div class="group-table" style="margin-bottom: 24px;">
                <div class="group-table-header">
                    <span class="th-pos">#</span>
                    <span class="th-name">JUGADOR</span>
                    <span class="th-stat">PTS</span>
                    <span class="th-stat">PJ</span>
                    <span class="th-stat">GF</span>
                    <span class="th-stat">GC</span>
                    <span class="th-stat">DIF</span>
                </div>
                <div class="group-row zona-clasif">
                    <div class="gr-pos">1</div>
                    <div class="gr-player">
                        <div class="gr-avatar-placeholder">?</div>
                        <span class="gr-name">Ejemplo Local</span>
                    </div>
                    <div class="gr-stat pts">9</div>
                    <div class="gr-stat">3</div>
                    <div class="gr-stat">12</div>
                    <div class="gr-stat">8</div>
                    <div class="gr-stat dif-pos">+4</div>
                </div>
                <div class="group-row zona-elim">
                    <div class="gr-pos">2</div>
                    <div class="gr-player">
                        <div class="gr-avatar-placeholder">?</div>
                        <span class="gr-name">Ejemplo Visitante</span>
                    </div>
                    <div class="gr-stat pts">6</div>
                    <div class="gr-stat">3</div>
                    <div class="gr-stat">9</div>
                    <div class="gr-stat">8</div>
                    <div class="gr-stat dif-pos">+1</div>
                </div>
                <div class="group-row zona-none">
                    <div class="gr-pos">3</div>
                    <div class="gr-player">
                        <div class="gr-avatar-placeholder">?</div>
                        <span class="gr-name">Equipo Eliminado</span>
                    </div>
                    <div class="gr-stat pts">0</div>
                    <div class="gr-stat">3</div>
                    <div class="gr-stat">3</div>
                    <div class="gr-stat">8</div>
                    <div class="gr-stat dif-neg">-5</div>
                </div>
            </div>
            <div class="group-legend" style="margin-bottom: 24px;">
                <div class="legend-item"><div class="legend-dot clasif"></div> Clasificado directo</div>
                <div class="legend-item"><div class="legend-dot tercero"></div> Mejor tercero</div>
            </div>

            <!-- Match card completed -->
            <div class="match-card completed">
                <div class="match-side">
                    <div class="match-avatar-placeholder">?</div>
                    <span class="match-name winner-name">Ejemplo Local</span>
                </div>
                <div class="match-center">
                    <div class="match-patas">
                        <div class="match-pata">
                            <div class="pata-label">IDA</div>
                            <div class="pata-score">
                                <span class="ball">⚽</span> 3 - 1 <span class="ball">⚽</span>
                            </div>
                        </div>
                        <div class="pata-divider"></div>
                        <div class="match-pata">
                            <div class="pata-label">VUELTA</div>
                            <div class="pata-score">
                                <span class="ball">⚽</span> 2 - 2 <span class="ball">⚽</span>
                            </div>
                        </div>
                    </div>
                    <div class="match-aggregate">
                        <span class="aggregate-label">AGR</span>
                        <span class="aggregate-score">5 - 3</span>
                        <span class="winner-indicator"><span class="winner-star">★</span> EJEMPLO LOCAL</span>
                    </div>
                </div>
                <div class="match-side away">
                    <div class="match-avatar-placeholder">?</div>
                    <span class="match-name">Visitante</span>
                </div>
            </div>

            <!-- Match card pending -->
            <div class="match-card pending-card">
                <div class="match-side">
                    <div class="match-avatar-placeholder">?</div>
                    <span class="match-name">Equipo A</span>
                </div>
                <div class="match-center">
                    <div class="match-patas">
                        <div class="match-pata">
                            <div class="pata-label">IDA</div>
                            <div class="pata-score pending">
                                <span class="ball">⚽</span> - vs - <span class="ball">⚽</span>
                            </div>
                        </div>
                        <div class="pata-divider"></div>
                        <div class="match-pata">
                            <div class="pata-label">VUELTA</div>
                            <div class="pata-score pending">
                                <span class="ball">⚽</span> - vs - <span class="ball">⚽</span>
                            </div>
                        </div>
                    </div>
                    <div class="match-aggregate">
                        <span class="aggregate-label">AGR</span>
                        <span class="aggregate-pending">? - ? EN DISPUTA</span>
                    </div>
                </div>
                <div class="match-side away">
                    <div class="match-avatar-placeholder">?</div>
                    <span class="match-name">Equipo B</span>
                </div>
            </div>
        </body></html>
    `;

    try {
        const buffer = await nodeHtmlToImage({ 
            html, 
            transparent: false, 
            type: 'png',
            puppeteerArgs: { 
                executablePath: '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });
        return new AttachmentBuilder(buffer, { name: 'preview_tema.png' });
    } catch (err) {
        console.error('Error generando preview de tema:', err);
        return null;
    }
}
