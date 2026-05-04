import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import Superliga from '../../models/superliga/Superliga.js';
import { generarImagenHistorialEquipo } from '../../utils/visual/teamHistoryGenerator.js';

export default {
    name: 'superliga-historial',
    aliases: ['sl-historial', 'slh'],
    desc: 'Muestra el historial de un equipo o actualiza los historiales.',

    run: async (client, message, args) => {
        if (!args.length) {
            return message.reply('❌ Debes especificar el nombre de un equipo o usar `!sl-historial actualizar`.');
        }

        const param = args[0].toLowerCase();

        if (param === 'actualizar') {
            if (!message.member.permissions.has('ManageChannels') && !message.member.permissions.has('Administrator')) {
                return message.reply('❌ No tienes permisos para actualizar el historial global.');
            }

            const typingMsg = await message.reply('<a:loading:1461897825439711468> Procesando todas las temporadas para actualizar los historiales...');
            
            try {
                const todasLasTemporadas = await Superliga.find({});
                const todosLosEquipos = await EquipoSuperliga.find({});

                // Map to accumulate global stats
                const statsMap = {};
                todosLosEquipos.forEach(eq => {
                    statsMap[eq.nombre] = {
                        puntosAcumulados: 0,
                        partidosGanados: 0,
                        partidosPerdidos: 0,
                        diferenciaGoles: 0,
                        titulosTotales: eq.tablaHistorica?.titulosTotales || 0, // Keep existing titles
                        historialRival: {} // key: rivalName -> { victorias, derrotas, golesAFavor, golesEnContra }
                    };
                });

                // Helper to initialize a missing team in the map
                const initTeam = (nombre) => {
                    if (!statsMap[nombre]) {
                        statsMap[nombre] = { puntosAcumulados: 0, partidosGanados: 0, partidosPerdidos: 0, diferenciaGoles: 0, titulosTotales: 0, historialRival: {} };
                    }
                };

                // Helper to initialize rival in history
                const initRival = (teamA, teamB) => {
                    if (!statsMap[teamA].historialRival[teamB]) {
                        statsMap[teamA].historialRival[teamB] = { rival: teamB, victorias: 0, derrotas: 0, golesAFavor: 0, golesEnContra: 0 };
                    }
                };

                for (const temp of todasLasTemporadas) {
                    if (!temp.fechas) continue;
                    for (const fecha of temp.fechas) {
                        if (!fecha.partidos) continue;
                        for (const partido of fecha.partidos) {
                            if (!partido.finalizado || !partido.localNombre || !partido.visitanteNombre || !partido.resultado) continue;
                            
                            const tLocal = partido.localNombre;
                            const tVisit = partido.visitanteNombre;
                            const gfLocal = partido.resultado.golesLocal || 0;
                            const gfVisit = partido.resultado.golesVisitante || 0;
                            const ptsLocal = partido.puntosMiniLocal || 0;
                            const ptsVisit = partido.puntosMiniVisitante || 0;

                            initTeam(tLocal);
                            initTeam(tVisit);
                            initRival(tLocal, tVisit);
                            initRival(tVisit, tLocal);

                            // Update general table for local
                            statsMap[tLocal].puntosAcumulados += ptsLocal;
                            statsMap[tLocal].diferenciaGoles += (gfLocal - gfVisit);
                            if (gfLocal > gfVisit) statsMap[tLocal].partidosGanados += 1;
                            else if (gfLocal < gfVisit) statsMap[tLocal].partidosPerdidos += 1;

                            // Update general table for visitor
                            statsMap[tVisit].puntosAcumulados += ptsVisit;
                            statsMap[tVisit].diferenciaGoles += (gfVisit - gfLocal);
                            if (gfVisit > gfLocal) statsMap[tVisit].partidosGanados += 1;
                            else if (gfVisit < gfLocal) statsMap[tVisit].partidosPerdidos += 1;

                            // Update head-to-head for local
                            statsMap[tLocal].historialRival[tVisit].golesAFavor += gfLocal;
                            statsMap[tLocal].historialRival[tVisit].golesEnContra += gfVisit;
                            if (gfLocal > gfVisit) statsMap[tLocal].historialRival[tVisit].victorias += 1;
                            else if (gfLocal < gfVisit) statsMap[tLocal].historialRival[tVisit].derrotas += 1;

                            // Update head-to-head for visitor
                            statsMap[tVisit].historialRival[tLocal].golesAFavor += gfVisit;
                            statsMap[tVisit].historialRival[tLocal].golesEnContra += gfLocal;
                            if (gfVisit > gfLocal) statsMap[tVisit].historialRival[tLocal].victorias += 1;
                            else if (gfVisit < gfLocal) statsMap[tVisit].historialRival[tLocal].derrotas += 1;
                        }
                    }
                }

                // Save back to DB
                let actualizados = 0;
                for (const eq of todosLosEquipos) {
                    const stats = statsMap[eq.nombre];
                    if (stats) {
                        eq.tablaHistorica = {
                            puntosAcumulados: stats.puntosAcumulados,
                            partidosGanados: stats.partidosGanados,
                            partidosPerdidos: stats.partidosPerdidos,
                            diferenciaGoles: stats.diferenciaGoles,
                            titulosTotales: stats.titulosTotales
                        };
                        eq.historial = Object.values(stats.historialRival);
                        await eq.save();
                        actualizados++;
                    }
                }

                return typingMsg.edit(`✅ Historiales actualizados correctamente para **${actualizados}** equipos.`);
            } catch (err) {
                console.error("Error al actualizar historiales:", err);
                return typingMsg.edit("❌ Hubo un error procesando el historial. Verifica los logs.");
            }
        }

        // --- Visualizar Historial ---
        const query = args.join(' ').toLowerCase();
        const equipos = await EquipoSuperliga.find({});
        
        let equipoEncontrado = null;
        let mejorPuntaje = 0;

        for (const eq of equipos) {
            const nombreNorm = eq.nombre.toLowerCase();
            if (nombreNorm === query) {
                equipoEncontrado = eq;
                break;
            }
            if (nombreNorm.includes(query)) {
                const score = query.length / nombreNorm.length;
                if (score > mejorPuntaje) {
                    mejorPuntaje = score;
                    equipoEncontrado = eq;
                }
            }
        }

        if (!equipoEncontrado) {
            return message.reply('❌ No se encontró ningún equipo con ese nombre.');
        }

        const msg = await message.reply(`<a:loading:1461897825439711468> Generando historial para **${equipoEncontrado.nombre}**...`);

        try {
            const logosMap = {};
            equipos.forEach(e => logosMap[e.nombre] = e.escudo);

            const totalRivals = equipoEncontrado.historial ? equipoEncontrado.historial.length : 0;
            const totalPages = Math.max(1, Math.ceil(totalRivals / 8));
            let currentPage = 1;

            const sendPage = async (page, interaction = null) => {
                const attachment = await generarImagenHistorialEquipo(equipoEncontrado, logosMap, page);
                
                if (!attachment) {
                    if (interaction) await interaction.reply({ content: '❌ Error generando la página.', ephemeral: true });
                    else await msg.edit('❌ Error al generar la imagen del historial.');
                    return;
                }

                const components = [];
                if (totalPages > 1) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_hist')
                            .setLabel('⬅️ Anterior')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('next_hist')
                            .setLabel('Siguiente ➡️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === totalPages)
                    );
                    components.push(row);
                }

                const payload = { content: `📊 **Historial de ${equipoEncontrado.nombre}** (Página ${page}/${totalPages})`, files: [attachment], components };
                
                if (interaction) {
                    await interaction.update(payload);
                } else {
                    await msg.edit(payload);
                }
            };

            await sendPage(currentPage);

            if (totalPages > 1) {
                const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
                
                collector.on('collect', async (i) => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: '❌ No puedes usar estos botones.', ephemeral: true });
                    }
                    if (i.customId === 'prev_hist') currentPage--;
                    if (i.customId === 'next_hist') currentPage++;
                    await sendPage(currentPage, i);
                    collector.resetTimer();
                });

                collector.on('end', () => {
                    msg.edit({ components: [] }).catch(() => {});
                });
            }

        } catch (err) {
            console.error("Error generando imagen de historial:", err);
            msg.edit('❌ Ocurrió un error inesperado al intentar generar el historial.');
        }
    }
};
