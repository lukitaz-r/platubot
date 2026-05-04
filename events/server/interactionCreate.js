import { 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  ActionRowBuilder,
  ButtonStyle,
  ButtonBuilder,
  FileUploadBuilder,
  LabelBuilder
} from 'discord.js';

import Primera from '../../models/Primera.js';
import Segunda from '../../models/Segunda.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { registrarMovimiento } from '../../utils/db/registrarMovimiento.js';
import fs from 'fs';
import path from 'path';

// ── Helpers ────────────────────────────────────────────────────────────────

function getModel(type) {
  if (type === 'primera') return Primera;
  if (type === 'segunda') return Segunda;
  return null;
}

async function getLigaActual(Modelo) {
  const ligas = await Modelo.find({}).catch(() => []);
  return ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio))[0] ?? null;
}

function findPartido(liga, matchId) {
  for (const fecha of liga.partidos) {
    const idx = fecha.partidos.findIndex(p => p._id === matchId);
    if (idx !== -1) return { fecha, idx, partido: fecha.partidos[idx] };
  }
  return null;
}

async function descargarImagen(url, nombreArchivo) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo descargar la imagen.');
    const buffer = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(process.cwd(), 'assets', 'equipos', nombreArchivo);
    fs.writeFileSync(filePath, buffer);
    return `assets/equipos/${nombreArchivo}`;
}

// ── Evento ─────────────────────────────────────────────────────────────────

export default {
  name: Events.InteractionCreate,

  run: async (client, interaction) => {
    // 1. Manejar Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        if (command.execute) await command.execute(client, interaction);
        else await interaction.reply({ content: '❌ Solo message commands.', flags: 64 });
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Error.', flags: 64 });
      }
      return;
    }

    // 2. Manejar Botones
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Botón para abrir modal de creación de equipo
      if (customId === 'btn_crear_equipo_modal') {
          const modal = new ModalBuilder()
            .setCustomId('modal_crear_equipo')
            .setTitle('Crear Equipo');

          const nInput = new TextInputBuilder()
            .setCustomId('n')
            .setLabel('Nombre del Equipo')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Platense')
            .setRequired(true);

          const fileInput = new FileUploadBuilder()
            .setCustomId('e')
            .setRequired(true);
          
          const inputLabel = new LabelBuilder()
            .setLabel("Escudo del Equipo")
            .setFileUploadComponent(fileInput)

          modal.addComponents(new ActionRowBuilder().addComponents(nInput));
          modal.addLabelComponents(inputLabel);

          return interaction.showModal(modal);
      }

      // Handlers de aprobación
      if (customId.startsWith('aprv|superliga|') || customId.startsWith('deny|superliga|')) {
        const parts = customId.split('|');
        const action = parts[0];
        const val = parts[2];
        const duelIdx = parts[3] ? parseInt(parts[3]) : -1;
        const reporterId = parts[parts.length - 1];

        if (action === 'deny') {
          await interaction.update({ content: '❌ Resultado denegado.', embeds: [], components: [] });
          return;
        }

        // Impedir que el mismo que reportó valide el resultado (excepto si es admin)
        const isAdmin = interaction.member.permissions.has('Administrator');
        if (interaction.user.id === reporterId && !isAdmin) {
          return interaction.reply({ content: '❌ No puedes validar tu propio reporte. Debe hacerlo tu rival o un administrador.', flags: 64 });
        }

        const Superliga = (await import('../../models/superliga/Superliga.js')).default;
        const Supersupercopa = (await import('../../models/superliga/Supersupercopa.js')).default;
        
        const liga = await Superliga.findOne({ actual: true });
        const ssc = await Supersupercopa.findOne({ actual: true }) || await Supersupercopa.findOne({ estadoGlobal: 'Activa' });

        let partido = null;
        if (val.startsWith('sl_')) {
          if (!liga) return interaction.reply({ content: '❌ No hay temporada de Superliga activa.', flags: 64 });
          const [, fi, pi] = val.split('_').map(Number);
          partido = liga.fechas[fi].partidos[pi];
        } else if (val.startsWith('ssc_g_')) {
          if (!ssc) return interaction.reply({ content: '❌ No hay Supersupercopa activa.', flags: 64 });
          const [,, gi, fi, pi] = val.split('_').map(Number);
          partido = ssc.grupos[gi]?.fechas[fi]?.partidos[pi];
        } else {
          if (!ssc) return interaction.reply({ content: '❌ No hay Supersupercopa activa.', flags: 64 });
          const [,, pi] = val.split('_').map(Number);
          partido = ssc.fase === 'semifinales' ? ssc.semifinales[pi] : ssc.final;
        }

        if (!partido) return interaction.reply({ content: '❌ Partido no encontrado.', flags: 64 });
        
        const duelo = duelIdx !== -1 ? partido.duelosIndividuales?.[duelIdx] : null;
        if (duelo && duelo.finalizado) return interaction.reply({ content: '⚠️ Este duelo ya fue validado.', flags: 64 });
        if (!duelo && partido.finalizado) return interaction.reply({ content: '⚠️ Este partido ya fue validado.', flags: 64 });

        const modalGoles = new ModalBuilder().setCustomId(`m_aprv_sl|${val}|${duelIdx}`).setTitle(duelo ? `Duelo ${duelIdx + 1}: ${duelo.localJugadorNombre} vs ${duelo.visitanteJugadorNombre}` : 'Validar Resultado');
        
        const labelL = duelo ? (duelo.localJugadorNombre || 'Local') : (partido.localNombre || 'Local');
        const labelV = duelo ? (duelo.visitanteJugadorNombre || 'Visitante') : (partido.visitanteNombre || 'Visitante');

        modalGoles.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel(`Goles ${labelL}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 5').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel(`Goles ${labelV}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 3').setRequired(true))
        );
        await interaction.showModal(modalGoles);
      }
    }

    // 3. Manejar Modales
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_crear_equipo') {
            await interaction.deferReply({ flags: 64 });
            const nombre = interaction.fields.getTextInputValue('n');
            try {
                // 1. Comprobar si ya es coach de un equipo
                const esCoach = await EquipoSuperliga.findOne({ 'coach.id': interaction.user.id });
                if (esCoach) return interaction.editReply(`❌ Ya eres el coach del equipo **${esCoach.nombre}**. No puedes crear otro.`);

                // 2. Comprobar si el nombre del equipo ya existe (insensible a mayúsculas y acentos)
                const todosLosEquipos = await EquipoSuperliga.find({});
                const normalizar = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nombreNuevoNorm = normalizar(nombre);
                
                const existeNombre = todosLosEquipos.some(e => normalizar(e.nombre) === nombreNuevoNorm);
                if (existeNombre) return interaction.editReply('❌ Ya existe un equipo con ese nombre (o uno muy similar).');

                // 3. Si era jugador en otro equipo, eliminarlo de ahí
                const equiposComoJugador = await EquipoSuperliga.find({ 'jugadores.id': interaction.user.id });
                for (const eq of equiposComoJugador) {
                    const nuevosJugadores = eq.jugadores.filter(j => j.id !== interaction.user.id);
                    await EquipoSuperliga.update({ _id: eq._id }, { jugadores: nuevosJugadores });
                }

                // 4. Si estaba en la lista de agentes libres, eliminarlo
                const JugadorLibre = (await import('../../models/superliga/JugadoresLibres.js')).default;
                await JugadorLibre.deleteOne({ id: interaction.user.id });

                // 5. Descargar escudo y crear equipo
                const attachmentField = interaction.fields.getField('e');
                const url = attachmentField?.attachments.first()?.url;
                if (!url) return interaction.editReply('❌ No se ha subido ninguna imagen para el escudo.');

                const ext = url.split('.').pop().split('?')[0] || 'png';
                const fileName = `${nombre.toLowerCase().replace(/ /g, '_')}_${Date.now()}.${ext}`;
                const localPath = await descargarImagen(url, fileName);

                await EquipoSuperliga.create({
                    nombre,
                    escudo: localPath,
                    coach: {
                        nombre: interaction.user.username,
                        id: interaction.user.id,
                        pais: 'Argentina'
                    }
                });

                await interaction.editReply(`✅ Equipo **${nombre}** creado con éxito. Se han actualizado tus registros (eliminado de otros equipos o agentes libres si correspondía).`);
            } catch (e) {
                console.error(e);
                await interaction.editReply('❌ Error al procesar la creación del equipo.');
            }
        }

        if (interaction.customId.startsWith('m_aprv_sl|')) {
            const parts = interaction.customId.split('|');
            const val = parts[1];
            const di = parts[2] ? parseInt(parts[2]) : -1;

            const gl = parseInt(interaction.fields.getTextInputValue('gl'));
            const gv = parseInt(interaction.fields.getTextInputValue('gv'));
            
            if (isNaN(gl) || isNaN(gv)) {
                return interaction.reply({ content: '❌ Por favor ingresa números válidos para los goles.', flags: 64 });
            }

            await interaction.deferUpdate();

            const Superliga = (await import('../../models/superliga/Superliga.js')).default;
            const Supersupercopa = (await import('../../models/superliga/Supersupercopa.js')).default;
            const liga = await Superliga.findOne({ actual: true });
            const ssc = await Supersupercopa.findOne({ actual: true }) || await Supersupercopa.findOne({ estadoGlobal: 'Activa' });

            let partido = null;
            let esSSC = false;

            if (val.startsWith('sl_')) {
              if (!liga) return interaction.editReply({ content: '❌ No hay temporada activa.' });
              const [, fi, pi] = val.split('_').map(Number);
              partido = liga.fechas[fi].partidos[pi];
            } else if (val.startsWith('ssc_g_')) {
              if (!ssc) return interaction.editReply({ content: '❌ No hay Supersupercopa activa.' });
              const [,, gi, fi, pi] = val.split('_').map(Number);
              partido = ssc.grupos[gi]?.fechas[fi]?.partidos[pi];
              esSSC = true;
            } else if (val.startsWith('ssc_e_')) {
              if (!ssc) return interaction.editReply({ content: '❌ No hay Supersupercopa activa.' });
              const [,, pi] = val.split('_').map(Number);
              partido = ssc.fase === 'semifinales' ? ssc.semifinales[pi] : ssc.final;
              esSSC = true;
            }

            if (!partido) return interaction.editReply({ content: '❌ Partido no encontrado.' });
            
            const duelo = di !== -1 && partido.duelosIndividuales ? partido.duelosIndividuales[di] : null;
            if (duelo && duelo.finalizado) return interaction.editReply({ content: '⚠️ Este minipartido ya fue validado.' });
            if (!duelo && partido.finalizado) return interaction.editReply({ content: '⚠️ Este partido ya fue validado.' });

            let esFinalizacionReciente = false;

            if (duelo) {
                // 1. Actualizar el duelo individual
                duelo.golesLocal = gl;
                duelo.golesVisitante = gv;
                duelo.finalizado = true;

                // 2. Media individual tras cada minipartido
                if (gl !== gv && duelo.localJugadorId && duelo.visitanteJugadorId) {
                    const { aplicarCambioMediaDuelo } = await import('../../utils/db/mediaCalculator.js');
                    const resMedia = await aplicarCambioMediaDuelo(
                        gl > gv ? duelo.localJugadorId : duelo.visitanteJugadorId,
                        gl > gv ? duelo.visitanteJugadorId : duelo.localJugadorId,
                        Math.max(gl, gv), Math.min(gl, gv)
                    );
                    if (resMedia) {
                        duelo.logMedia = `📈 **${resMedia.ganadorNombre}**: ${resMedia.nuevaMediaGanador} (+${resMedia.delta})\n📉 **${resMedia.perdedorNombre}**: ${resMedia.nuevaMediaPerdedor} (-${resMedia.delta})`;
                    }
                }

                // 3. Recalcular agregados del partido (goles totales y minipuntos)
                let pml = 0, pmv = 0, gtl = 0, gtv = 0;
                for (const d of partido.duelosIndividuales) {
                    if (d.finalizado) {
                        gtl += d.golesLocal; gtv += d.golesVisitante;
                        if (d.golesLocal > d.golesVisitante) pml++;
                        else if (d.golesVisitante > d.golesLocal) pmv++;
                    }
                }
                
                // Actualizar campos de goles y puntos en el objeto partido
                partido.puntosMiniLocal = pml;
                partido.puntosMiniVisitante = pmv;
                partido.golesTotalLocal = gtl;
                partido.golesTotalVisitante = gtv;
                
                // Sincronizar campos "golesLocal" y "golesVisitante" (como resultado de la serie)
                partido.golesLocal = pml;
                partido.golesVisitante = pmv;

                if (!partido.resultado) partido.resultado = {};
                partido.resultado.golesLocal = pml;
                partido.resultado.golesVisitante = pmv;

                const allFinished = partido.duelosIndividuales.every(d => d.finalizado);
                // El partido se liquida si alguien llega a 2 o si se jugaron los 3
                if ((pml >= 2 || pmv >= 2 || allFinished) && !partido.premiosEntregados) {
                    partido.finalizado = true;
                    partido.premiosEntregados = true;
                    esFinalizacionReciente = true;
                }
            } else {
                // Lógica legacy
                partido.golesLocal = gl;
                partido.golesVisitante = gv;
                partido.puntosMiniLocal = gl > gv ? 1 : 0;
                partido.puntosMiniVisitante = gv > gl ? 1 : 0;
                partido.golesTotalLocal = gl;
                partido.golesTotalVisitante = gv;
                if (!partido.resultado) partido.resultado = {};
                partido.resultado.golesLocal = gl;
                partido.resultado.golesVisitante = gv;
                partido.finalizado = true;
                partido.premiosEntregados = true;
                esFinalizacionReciente = true;
            }

            const allEquipos = await EquipoSuperliga.find({});
            const eqL = allEquipos.find(e => (e._id?.$oid ?? e._id?.toString()) === (partido.localId?.$oid ?? partido.localId?.toString()) || e.nombre === partido.localNombre);
            const eqV = allEquipos.find(e => (e._id?.$oid ?? e._id?.toString()) === (partido.visitanteId?.$oid ?? partido.visitanteId?.toString()) || e.nombre === partido.visitanteNombre);

            // ── Lógica de Premios Económicos (SOLO PARA EL GANADOR DEL SUPRAPARTIDO) ──
            let dineroLocal = 0, dineroVisitante = 0, logPremios = [], logMediaSeries = [];
            if (esFinalizacionReciente) {
                const pml = partido.puntosMiniLocal;
                const pmv = partido.puntosMiniVisitante;
                
                if (pml > pmv) {
                    dineroLocal = (pml * 50_000) + 100_000;
                    logPremios.push(`💰 **${eqL?.nombre}**: +$${(dineroLocal / 1000).toFixed(0)}k (Ganador)`);
                    logMediaSeries.push(`👔 **Coach ${eqL?.coach?.nombre}**: +0.5 media`);
                    logMediaSeries.push(`📈 **Plantilla ${eqL?.nombre}**: +0.2 media`);
                    logMediaSeries.push(`📉 **Plantilla ${eqV?.nombre}**: -0.1 media`);
                } else if (pmv > pml) {
                    dineroVisitante = (pmv * 50_000) + 100_000;
                    logPremios.push(`💰 **${eqV?.nombre}**: +$${(dineroVisitante / 1000).toFixed(0)}k (Ganador)`);
                    logMediaSeries.push(`👔 **Coach ${eqV?.coach?.nombre}**: +0.5 media`);
                    logMediaSeries.push(`📈 **Plantilla ${eqV?.nombre}**: +0.2 media`);
                    logMediaSeries.push(`📉 **Plantilla ${eqL?.nombre}**: -0.1 media`);
                }

                // Premios por avance de fase (SSC) - Solo para el ganador
                if (esSSC && ssc) {
                    if (val.startsWith('ssc_e_')) {
                        if (ssc.fase === 'semifinales') {
                            if (pml > pmv) { dineroLocal += 1_000_000; logPremios.push(`🏆 **${eqL?.nombre}**: +$1M (Final)`); }
                            else if (pmv > pml) { dineroVisitante += 1_000_000; logPremios.push(`🏆 **${eqV?.nombre}**: +$1M (Final)`); }
                        } else if (ssc.fase === 'final') {
                            if (pml > pmv) { dineroLocal += 2_000_000; logPremios.push(`🏆 **${eqL?.nombre}**: +$2M (CAMPEÓN)`); }
                            else if (pmv > pml) { dineroVisitante += 2_000_000; logPremios.push(`🏆 **${eqV?.nombre}**: +$2M (CAMPEÓN)`); }
                        }
                    } else if (val.startsWith('ssc_g_')) {
                        const parts = val.split('_');
                        const gi = Number(parts[2]);
                        const grupo = ssc.grupos[gi];
                        const grupoTerminado = grupo.fechas.every(f => (f.partidos ?? f.encuentros).every(p => p.finalizado));
                        if (grupoTerminado) {
                            const stats = {};
                            grupo.fechas.forEach(f => (f.partidos ?? f.encuentros).forEach(p => {
                                const lId = p.localId?.$oid ?? p.localId?.toString(), vId = p.visitanteId?.$oid ?? p.visitanteId?.toString();
                                if (!stats[lId]) stats[lId] = { id: lId, pts: 0, dg: 0, gf: 0 };
                                if (!stats[vId]) stats[vId] = { id: vId, pts: 0, dg: 0, gf: 0 };
                                stats[lId].gf += p.puntosMiniLocal || 0; stats[vId].gf += p.puntosMiniVisitante || 0;
                                stats[lId].dg += ((p.puntosMiniLocal || 0) - (p.puntosMiniVisitante || 0));
                                stats[vId].dg += ((p.puntosMiniVisitante || 0) - (p.puntosMiniLocal || 0));
                                if ((p.puntosMiniLocal || 0) > (p.puntosMiniVisitante || 0)) stats[lId].pts += 3;
                                else if ((p.puntosMiniLocal || 0) < (p.puntosMiniVisitante || 0)) stats[vId].pts += 3;
                                else { stats[lId].pts += 1; stats[vId].pts += 1; }
                            }));
                            const clasificados = Object.values(stats).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf).slice(0, 2);
                            for (const clasificado of clasificados) {
                                if (clasificado.id === (eqL?._id?.$oid ?? eqL?._id?.toString())) { dineroLocal += 1_000_000; logPremios.push(`🏆 **${eqL?.nombre}**: +$1M (Semis)`); }
                                else if (clasificado.id === (eqV?._id?.$oid ?? eqV?._id?.toString())) { dineroVisitante += 1_000_000; logPremios.push(`🏆 **${eqV?.nombre}**: +$1M (Semis)`); }
                            }
                        }
                    }
                }
            }

            // BD
            if (eqL) {
                eqL.dinero = (eqL.dinero || 0) + dineroLocal;
                if (esFinalizacionReciente) {
                    const pml = partido.puntosMiniLocal, pmv = partido.puntosMiniVisitante;
                    if (pml > pmv) {
                        if (eqL.coach?.media != null) eqL.coach.media = Math.round((eqL.coach.media + 0.5) * 100) / 100;
                        eqL.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                    } else if (pml < pmv) eqL.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                }
                await eqL.save();
                if (dineroLocal > 0) await registrarMovimiento(eqL._id?.$oid ?? eqL._id?.toString(), { tipo: 'Premio', monto: dineroLocal, detalle: 'Premios de Partido' });
            }
            if (eqV) {
                eqV.dinero = (eqV.dinero || 0) + dineroVisitante;
                if (esFinalizacionReciente) {
                    const pml = partido.puntosMiniLocal, pmv = partido.puntosMiniVisitante;
                    if (pmv > pml) {
                        if (eqV.coach?.media != null) eqV.coach.media = Math.round((eqV.coach.media + 0.5) * 100) / 100;
                        eqV.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                    } else if (pmv < pml) eqV.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                }
                await eqV.save();
                if (dineroVisitante > 0) await registrarMovimiento(eqV._id?.$oid ?? eqV._id?.toString(), { tipo: 'Premio', monto: dineroVisitante, detalle: 'Premios de Partido' });
            }

            if (esSSC && ssc) await ssc.save(); else if (liga) await liga.save();

            let titleStr = '';
            let descStr = '';

            if (duelo) {
                titleStr = `✅ Resultado Validado (Mini ${di + 1})`;
                const localN = duelo.localJugadorNombre || partido.localNombre;
                const visitN = duelo.visitanteJugadorNombre || partido.visitanteNombre;
                descStr = `**${localN} ${gl} - ${gv} ${visitN}**\n\n`;
                
                if (duelo.logMedia) {
                    descStr += `📊 **Media del Duelo:**\n${duelo.logMedia}\n\n`;
                }

                if (partido.finalizado) {
                    descStr += `🏁 **Serie Finalizada:**\n**${eqL?.nombre} ${partido.puntosMiniLocal} - ${partido.puntosMiniVisitante} ${eqV?.nombre}**\n\n`;
                    if (logMediaSeries.length) {
                        descStr += `📈 **Progresión de Equipo:**\n${logMediaSeries.join('\n')}\n\n`;
                    }
                }
            } else {
                titleStr = '✅ Resultado Validado';
                descStr = `**${eqL?.nombre} ${gl} - ${gv} ${eqV?.nombre}**\n\n`;
            }

            if (logPremios.length) {
                descStr += `💸 **Premios Económicos:**\n${logPremios.join('\n')}`;
            }

            const embed = new EmbedBuilder()
                .setTitle(titleStr)
                .setDescription(descStr)
                .setColor('#2ecc71')
                .setTimestamp();

            await interaction.editReply({ content: '✅ Resultado procesado.', embeds: [embed] });

            // Enviar notificación al canal de envíos
            const submissionChanId = process.env.CANAL_RESULTADOS_SUPERLIGA;
            if (submissionChanId) {
                const subChan = await interaction.client.channels.fetch(submissionChanId).catch(() => null);
                if (subChan) {
                    await subChan.send({ content: `📢 **Actualización de Torneo:**`, embeds: [embed] });
                }
            }
        }
    }
  }
};
