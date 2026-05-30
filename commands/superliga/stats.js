import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import Superliga from '../../models/superliga/Superliga.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarStatsSuperligaImagen } from '../../utils/visual/statsSuperligaGenerator.js';

export default {
  name: 'superliga-stats',
  aliases: ['sl-stats', 'sls', 'sl-goleadores'],
  desc: 'Muestra las estadísticas individuales (Soporta sort: goles, dg, promedio)',

  run: async (client, message, args) => {
    const liga = await Superliga.findOne({ actual: true });
    if (!liga) return message.reply('❌ No hay una temporada de Superliga activa.');

    const criterio = args[0]?.toLowerCase() || 'goles';
    if (!['goles', 'dg', 'promedio', 'prom'].includes(criterio)) {
        return message.reply('❌ Criterios válidos: `goles`, `dg` o `promedio`.');
    }

    const equiposDB = await EquipoSuperliga.find({});
    const jugadoresStats = {};

    // 1. Recopilar estadísticas con FILTRO DE ACTIVIDAD REAL
    liga.fechas.forEach(fecha => {
        const enc = fecha.partidos ?? fecha.encuentros;
        enc.forEach(partido => {
        if (!partido.finalizado || !Array.isArray(partido.duelosIndividuales)) return;

        partido.duelosIndividuales.forEach(duelo => {
            const gl = duelo.golesLocal;
            const gv = duelo.golesVisitante;

            const fueJugadoRealmente = (gl || gv);
            if (!fueJugadoRealmente) return; 

            const participantes = [
            { id: duelo.jugadorLocalId, gf: gl, gc: gv },
            { id: duelo.jugadorVisitanteId, gf: gv, gc: gl }
            ];

            participantes.forEach(p => {
            if (!p.id || p.id === 'BYE' || p.id === '') return;

            if (!jugadoresStats[p.id]) {
                const eq = equiposDB.find(e => e.jugadores.some(j => j.id === p.id) || e.coach.id === p.id);
                const jugObj = eq?.jugadores.find(j => j.id === p.id);
                const jugNombre = jugObj?.nombre || eq?.coach.nombre || 'Desconocido';
                
                jugadoresStats[p.id] = { 
                    nombre: jugNombre, 
                    equipo: eq?.nombre || '?', 
                    pj: 0, gf: 0, gc: 0, dg: 0, id: p.id 
                };

                console.log(jugadoresStats)
            }

            jugadoresStats[p.id].pj++;
            jugadoresStats[p.id].gf += (p.gf || 0);
            jugadoresStats[p.id].gc += (p.gc || 0);
          });
        });
      });
    });

    const listaJugadores = Object.values(jugadoresStats).map(j => {
        j.dg = j.gf - j.gc;
        j.promedioNum = j.pj > 0 ? (j.gf / j.pj) : 0;
        j.promedio = j.promedioNum.toFixed(2);
        return j;
    });

    // 2. Sort dinámico
    if (criterio === 'dg') {
        listaJugadores.sort((a, b) => b.dg - a.dg || b.gf - a.gf || a.pj - b.pj);
    } else if (criterio === 'promedio' || criterio === 'prom') {
        listaJugadores.sort((a, b) => b.promedioNum - a.promedioNum || b.gf - a.gf || b.dg - a.dg);
    } else {
        listaJugadores.sort((a, b) => b.gf - a.gf || b.dg - a.dg || a.pj - b.pj);
    }

    if (listaJugadores.length === 0) {
        return message.reply('❌ No se encontraron jugadores con partidos disputados.');
    }

    const itemsPerPage = 14;
    const totalPages = Math.ceil(listaJugadores.length / itemsPerPage);
    let currentPage = 0;

    const renderPage = async (pIdx) => {
        const start = pIdx * itemsPerPage;
        const pagePlayers = listaJugadores.slice(start, start + itemsPerPage);
        const imageBuffer = await generarStatsSuperligaImagen(pagePlayers, liga.temporada, start, client);
        return new AttachmentBuilder(imageBuffer, { name: `stats-${criterio}-p${pIdx + 1}.png` });
    };

    const getLabelCriterio = (c) => (c === 'prom' || c === 'promedio') ? 'PROMEDIO' : c.toUpperCase();

    const getRow = (p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('p_i').setLabel(`${getLabelCriterio(criterio)} | Pág ${p + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('next').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(p === totalPages - 1)
    );

    const initialAttachment = await renderPage(currentPage);
    const mainMsg = await message.reply({ 
        content: `📊 Estadísticas de **Partidos Disputados**\nOrdenado por: **${getLabelCriterio(criterio)}**`,
        files: [initialAttachment], 
        components: totalPages > 1 ? [getRow(currentPage)] : [] 
    });

    if (totalPages <= 1) return;
    const col = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    col.on('collect', async i => {
        if (i.user.id !== message.author.id) return i.reply({ content: '❌ No puedes navegar.', flags: 64 });
        await i.deferUpdate();
        if (i.customId === 'prev') currentPage--;
        if (i.customId === 'next') currentPage++;
        await mainMsg.edit({ files: [await renderPage(currentPage)], components: [getRow(currentPage)] });
    });
    col.on('end', () => mainMsg.edit({ components: [] }).catch(() => {}));
  }
};
