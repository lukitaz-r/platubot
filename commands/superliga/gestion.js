import { 
  EmbedBuilder, 
  ComponentType, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ButtonBuilder,
  FileUploadBuilder,
  LabelBuilder
} from 'discord.js';
import Superliga from '../../models/superliga/Superliga.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import generarRoundRobinSuperliga from '../../utils/generarRoundRobinSuperliga.js';
import { buildSuperligaEmbed, buildSuperligaRows } from '../../utils/ui/superliga/buildSuperligaPanel.js';
import path from 'path';
import fs from 'fs';


async function descargarImagen(url, nombreArchivo) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo descargar la imagen.');
    const buffer = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(process.cwd(), 'assets', 'equipos', nombreArchivo);
    fs.writeFileSync(filePath, buffer);
    return `assets/equipos/${nombreArchivo}`;
}

export default {
  name: 'superliga-gestion',
  aliases: ['sl-gestion', 'slg'],
  desc: 'Gestión de la Superliga (Panel Interactivo)',
  permisos: ['Administrator'],

  run: async (client, message, args) => {
    if (args.length > 0) {
      return handleLegacyCommands(client, message, args);
    }

    const liga = await Superliga.findOne({ actual: true });
    const panelMsg = await message.reply({ 
        embeds: [buildSuperligaEmbed(liga)], 
        components: buildSuperligaRows(liga) 
    });

    const collector = panelMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 600000,
    });

    collector.on('collect', async i => {
      if (!i.member.permissions.has('Administrator')) {
        return i.reply({ content: '❌ No tienes permisos.', flags: 64 });
      }

      const freshLiga = await Superliga.findOne({ actual: true });

      switch (i.customId) {
        case 'btn_sl_refresh':
          await panelMsg.edit({ 
            embeds: [buildSuperligaEmbed(freshLiga)], 
            components: buildSuperligaRows(freshLiga) 
          });
          await i.reply({ content: '🔃 Panel actualizado.', flags: 64 });
          break;

        case 'btn_sl_equipos':
          const equiposAll = await EquipoSuperliga.find({});
          await i.reply({ 
            embeds: [new EmbedBuilder().setTitle('👥 Equipos').setDescription(equiposAll.map(e => `• **${e.nombre}**`).join('\n') || 'Vacío').setColor('#3498db')], 
            flags: 64 
          });
          break;

        case 'btn_sl_borrar': {
          if (!freshLiga) return i.reply({ content: '❌ No hay temporada.', flags: 64 });
          
          const confirmBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_sl_borrar_confirm').setLabel('⚠️ Estoy seguro, borrar').setStyle(ButtonStyle.Danger)
          );

          const mConfirm = await i.reply({ 
            content: `❗ **¿Estás absolutamente seguro?** Esta acción borrará permanentemente la temporada **${freshLiga.temporada}** y todo su progreso.`, 
            components: [confirmBtn], 
            flags: 64,
            fetchReply: true 
          });

          const colConfirm = mConfirm.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
          colConfirm.on('collect', async iC => {
            if (iC.customId === 'btn_sl_borrar_confirm') {
              const modalName = new ModalBuilder().setCustomId('m_sl_borrar_final').setTitle('Confirmación Final');
              modalName.addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('confirm_name')
                    .setLabel(`Escribe "${freshLiga.temporada}" para borrar`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(freshLiga.temporada)
                    .setRequired(true)
                )
              );
              await iC.showModal(modalName);
              
              const subF = await iC.awaitModalSubmit({ time: 60000 }).catch(() => null);
              if (!subF) return;

              if (subF.fields.getTextInputValue('confirm_name') === freshLiga.temporada) {
                await Superliga.deleteOne({ _id: freshLiga._id });
                await panelMsg.edit({ embeds: [buildSuperligaEmbed(null)], components: buildSuperligaRows(null) });
                await subF.reply({ content: `✅ Temporada **${freshLiga.temporada}** borrada permanentemente.`, flags: 64 });
              } else {
                await subF.reply({ content: '❌ El nombre no coincide. Operación cancelada.', flags: 64 });
              }
            }
          });
          break;
        }

        case 'btn_sl_resultado': {
          if (!freshLiga) return i.reply({ content: '❌ No hay temporada activa.', flags: 64 });
          
          const allEq = await EquipoSuperliga.find({});
          const equiposList = allEq.filter(e => freshLiga.equipos.includes(e._id?.$oid ?? e._id));
          if (equiposList.length === 0) return i.reply({ content: '❌ No hay equipos en esta liga.', flags: 64 });
          
          const eqOptions = equiposList.slice(0, 25).map(e => ({ label: e.nombre, value: e._id?.$oid ?? e._id }));
          const eqMenu = new StringSelectMenuBuilder().setCustomId('sel_eq_res').setPlaceholder('1. Selecciona un Equipo').addOptions(eqOptions);
          
          const m1 = await i.reply({ content: 'Selecciona el equipo para cargar el resultado:', components: [new ActionRowBuilder().addComponents(eqMenu)], flags: 64, fetchReply: true });
          const colEq = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

          const flowResultado = async (ctx, partido) => {
            const rows = [];
            const rowForm = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_res_edit_form').setLabel('✏️ Editar Formación').setStyle(ButtonStyle.Secondary)
            );
            rows.push(rowForm);

            const rowMinis = new ActionRowBuilder();
            for (let i = 0; i < 3; i++) {
                const d = partido.duelosIndividuales[i];
                const label = d.finalizado ? `✅ Mini ${i+1}` : `🥅 Mini ${i+1}`;
                rowMinis.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_res_mini_${i}`)
                        .setLabel(label)
                        .setStyle(d.finalizado ? ButtonStyle.Success : ButtonStyle.Primary)
                        .setDisabled(d.finalizado)
                );
            }
            rows.push(rowMinis);

            const m = await ctx.reply({
                content: `🔍 **Validando Partido:** ${partido.localNombre} vs ${partido.visitanteNombre}\n` +
                         `Mini 1: ${partido.duelosIndividuales[0].localJugadorNombre || '?'} vs ${partido.duelosIndividuales[0].visitanteJugadorNombre || '?'}\n` +
                         `Mini 2: ${partido.duelosIndividuales[1].localJugadorNombre || '?'} vs ${partido.duelosIndividuales[1].visitanteJugadorNombre || '?'}\n` +
                         `Mini 3: ${partido.duelosIndividuales[2].localJugadorNombre || '?'} vs ${partido.duelosIndividuales[2].visitanteJugadorNombre || '?'}`,
                components: rows,
                flags: 64,
                fetchReply: true
            });

            const colRes = m.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
            colRes.on('collect', async (btnInt) => {
                if (btnInt.customId === 'btn_res_edit_form') {
                    // Lógica para que el admin edite formación
                    const eqL = await EquipoSuperliga.findOne({ _id: partido.localId });
                    const eqV = await EquipoSuperliga.findOne({ _id: partido.visitanteId });
                    
                    const pedir = async (targetEq, side) => {
                        const opts = targetEq.jugadores.map(j => ({ label: j.nombre, value: j.id }));
                        const s1 = new StringSelectMenuBuilder().setCustomId('s1').setPlaceholder(`Mini 1 - ${side}`).addOptions(opts);
                        const s2 = new StringSelectMenuBuilder().setCustomId('s2').setPlaceholder(`Mini 2 - ${side}`).addOptions(opts);
                        const s3 = new StringSelectMenuBuilder().setCustomId('s3').setPlaceholder(`Mini 3 - ${side}`).addOptions(opts);
                        
                        const msgForm = await btnInt.followUp({ content: `Editando formación para ${targetEq.nombre}`, components: [new ActionRowBuilder().addComponents(s1), new ActionRowBuilder().addComponents(s2), new ActionRowBuilder().addComponents(s3)], flags: 64, fetchReply: true });
                        const res = { j1: null, j2: null, j3: null };
                        const col = msgForm.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
                        
                        return new Promise(resolve => {
                            col.on('collect', async si => {
                                await si.deferUpdate();
                                if (si.customId === 's1') res.j1 = si.values[0];
                                if (si.customId === 's2') res.j2 = si.values[0];
                                if (si.customId === 's3') res.j3 = si.values[0];
                                if (res.j1 && res.j2 && res.j3) { col.stop(); resolve(res); }
                            });
                            col.on('end', () => resolve(res.j1 ? res : null));
                        });
                    };

                    const fL = await pedir(eqL, 'Local');
                    const fV = await pedir(eqV, 'Visitante');

                    if (fL && fV) {
                        const asignar = (idx, lid, vid) => {
                            const jl = eqL.jugadores.find(j => j.id === lid);
                            const jv = eqV.jugadores.find(j => j.id === vid);
                            partido.duelosIndividuales[idx].localJugadorId = jl.id;
                            partido.duelosIndividuales[idx].localJugadorNombre = jl.nombre;
                            partido.duelosIndividuales[idx].visitanteJugadorId = jv.id;
                            partido.duelosIndividuales[idx].visitanteJugadorNombre = jv.nombre;
                        };
                        asignar(0, fL.j1, fV.j1); asignar(1, fL.j2, fV.j2); asignar(2, fL.j3, fV.j3);
                        await freshLiga.save();
                        await btnInt.followUp({ content: '✅ Formación actualizada.', flags: 64 });
                    }
                }

                if (btnInt.customId.startsWith('btn_res_mini_')) {
                    const miniIdx = parseInt(btnInt.customId.split('_').pop());
                    const duelo = partido.duelosIndividuales[miniIdx];
                    if (duelo.finalizado) return btnInt.reply({ content: 'Ese mini partido ya está finalizado.', flags: 64 });
                    
                    const localName = duelo.localJugadorNombre || partido.localNombre;
                    const visitanteName = duelo.visitanteJugadorNombre || partido.visitanteNombre;
                    const modalGoles = new ModalBuilder().setCustomId(`m_g_mini_${miniIdx}`).setTitle(`Goles Mini ${miniIdx + 1}`);
                    modalGoles.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel(`Goles ${localName}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 5').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel(`Goles ${visitanteName}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 3').setRequired(true))
                    );
                    await btnInt.showModal(modalGoles);
                    const subG = await btnInt.awaitModalSubmit({ time: 60000 }).catch(() => null);
                    if (!subG) return;
                    try {
                        const gl = parseInt(subG.fields.getTextInputValue('gl'));
                        const gv = parseInt(subG.fields.getTextInputValue('gv'));

                        if (isNaN(gl) || isNaN(gv)) throw new Error('Invalid numbers');

                        duelo.golesLocal = gl;
                        duelo.golesVisitante = gv;
                        duelo.finalizado = true;

                        // Media individual tras cada minipartido
                        if (gl !== gv && duelo.localJugadorId && duelo.visitanteJugadorId) {
                            const { aplicarCambioMediaDuelo } = await import('../../utils/db/mediaCalculator.js');
                            aplicarCambioMediaDuelo(
                                gl > gv ? duelo.localJugadorId : duelo.visitanteJugadorId,
                                gl > gv ? duelo.visitanteJugadorId : duelo.localJugadorId,
                                Math.max(gl, gv), Math.min(gl, gv)
                            );
                        }

                        // Recalcular estado global
                        let pml = 0, pmv = 0, gtl = 0, gtv = 0;
                        for (const d of partido.duelosIndividuales) {
                            if (d.finalizado) {
                                gtl += d.golesLocal; gtv += d.golesVisitante;
                                if (d.golesLocal > d.golesVisitante) pml++;
                                else if (d.golesVisitante > d.golesLocal) pmv++;
                            }
                        }
                        partido.puntosMiniLocal = pml;
                        partido.puntosMiniVisitante = pmv;
                        partido.golesTotalLocal = gtl;
                        partido.golesTotalVisitante = gtv;
                        if (!partido.resultado) partido.resultado = {};
                        partido.resultado.golesLocal = pml;
                        partido.resultado.golesVisitante = pmv;

                        const allFinished = partido.duelosIndividuales.every(d => d.finalizado);
                        let finalizadoAhora = false;
                        if ((pml >= 2 || pmv >= 2 || allFinished) && !partido.premiosEntregados) {
                            partido.finalizado = true;
                            partido.premiosEntregados = true;
                            finalizadoAhora = true;
                        }

                        // Premios y Media (Solo para el ganador del suprapartido)
                        if (finalizadoAhora) {
                            const eqL = await EquipoSuperliga.findOne({ _id: partido.localId });
                            const eqV = await EquipoSuperliga.findOne({ _id: partido.visitanteId });
                            const { registrarMovimiento } = await import('../../utils/db/balance.js');
                            
                            let dineroL = 0, dineroV = 0;
                            if (pml > pmv) {
                                dineroL = (pml * 50_000) + 100_000;
                            } else if (pmv > pml) {
                                dineroV = (pmv * 50_000) + 100_000;
                            }

                            if (eqL) {
                                eqL.dinero = (eqL.dinero || 0) + dineroL;
                                if (pml > pmv) {
                                    if (eqL.coach?.media != null) eqL.coach.media = Math.round((eqL.coach.media + 0.5) * 100) / 100;
                                    eqL.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                                } else if (pml < pmv) eqL.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                                await eqL.save();
                                if (dineroL > 0) await registrarMovimiento(eqL._id, { tipo: 'Premio', monto: dineroL, detalle: 'Premios de Partido (Admin)' });
                            }
                            if (eqV) {
                                eqV.dinero = (eqV.dinero || 0) + dineroV;
                                if (pmv > pml) {
                                    if (eqV.coach?.media != null) eqV.coach.media = Math.round((eqV.coach.media + 0.5) * 100) / 100;
                                    eqV.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                                } else if (pmv < pml) eqV.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                                await eqV.save();
                                if (dineroV > 0) await registrarMovimiento(eqV._id, { tipo: 'Premio', monto: dineroV, detalle: 'Premios de Partido (Admin)' });
                            }
                        }

                        await freshLiga.save();
                        await subG.reply({ content: `✅ Duelo ${miniIdx + 1} guardado (**${gl}-${gv}**).` + (partido.finalizado ? ' ¡Serie finalizada!' : ''), flags: 64 });
                        await panelMsg.edit({ embeds: [buildSuperligaEmbed(freshLiga)], components: buildSuperligaRows(freshLiga) });
                    } catch (e) { await subG.reply({ content: '❌ Formato inválido o error al guardar.', flags: 64 }); }
                }
            });
          };

          colEq.on('collect', async iEq => {
              if (iEq.customId !== 'sel_eq_res') return;
              await iEq.deferUpdate();
              const selEqId = iEq.values[0];
              const selEq = equiposList.find(e => (e._id?.$oid ?? e._id) === selEqId);
              
              const matchOptions = [];
              for (const f of freshLiga.fechas) {
                  for (const [idx, p] of f.encuentros.entries()) {
                      if (p.localId === selEqId || p.visitanteId === selEqId) {
                          matchOptions.push({
                              label: `F${f.numero}: ${p.localNombre} vs ${p.visitanteNombre}`,
                              description: p.finalizado ? '✅ Finalizado' : '<a:loading:1461897825439711468> Pendiente',
                              value: `${f.numero}_${idx + 1}`
                          });
                      }
                  }
              }
              
              if (matchOptions.length === 0) {
                  return iEq.followUp({ content: '❌ Este equipo no tiene partidos.', flags: 64 });
              }
              
              const matchMenu = new StringSelectMenuBuilder().setCustomId('sel_match_res').setPlaceholder('2. Selecciona el Partido').addOptions(matchOptions.slice(0, 25));
              await iEq.editReply({ content: `Partidos de **${selEq.nombre}**. Selecciona uno:`, components: [new ActionRowBuilder().addComponents(matchMenu)] });
              
              const colMatch = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
              colMatch.on('collect', async iMatch => {
                  if (iMatch.customId !== 'sel_match_res') return;
                  
                  const [nFR, nPR] = iMatch.values[0].split('_').map(Number);
                  const fObj = freshLiga.fechas.find(f => f.numero === nFR);
                  const pObj = fObj?.encuentros[nPR - 1];
                  
                  if (!pObj) return iMatch.reply({ content: '❌ Partido no encontrado.', flags: 64 });
                  
                  await flowResultado(iMatch, pObj);
              });
          });
          break;
        }

        case 'btn_sl_editar_equipos': {
          const equiposEdit = await EquipoSuperliga.find({});
          if (equiposEdit.length === 0) return i.reply({ content: '❌ No hay equipos registrados.', flags: 64 });
          
          const eqOptionsEdit = equiposEdit.slice(0, 25).map(e => ({ label: e.nombre, value: e._id?.$oid ?? e._id }));
          const eqMenuEdit = new StringSelectMenuBuilder().setCustomId('sel_eq_edit').setPlaceholder('1. Selecciona un Equipo').addOptions(eqOptionsEdit);
          
          const mEdit = await i.reply({ content: 'Selecciona el equipo a editar:', components: [new ActionRowBuilder().addComponents(eqMenuEdit)], flags: 64, fetchReply: true });
          const colEqEdit = mEdit.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

          colEqEdit.on('collect', async iEqEdit => {
              if (iEqEdit.customId !== 'sel_eq_edit') return;
              await iEqEdit.deferUpdate();
              const selEqId = iEqEdit.values[0];
              const selEq = equiposEdit.find(e => (e._id?.$oid ?? e._id) === selEqId);
              
              const options = [
                  { label: '📝 Editar Nombre/Escudo', value: 'edit_club' },
                  { label: `👤 Coach: ${selEq.coach.nombre}`, value: `edit_coach_${selEq.coach.id}` }
              ];
              selEq.jugadores.forEach(j => {
                  options.push({ label: `🏃 Jugador: ${j.nombre}`, value: `edit_jug_${j.id}` });
              });
              
              const actionMenu = new StringSelectMenuBuilder().setCustomId('sel_eq_action').setPlaceholder('2. Selecciona qué editar').addOptions(options);
              await iEqEdit.editReply({ content: `Opciones de **${selEq.nombre}**. Selecciona qué deseas editar:`, components: [new ActionRowBuilder().addComponents(actionMenu)] });
              
              const colAct = mEdit.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
              colAct.on('collect', async iAct => {
                  if (iAct.customId !== 'sel_eq_action') return;
                  const action = iAct.values[0];
                  
                  if (action === 'edit_club') {
                      const modalClub = new ModalBuilder().setCustomId(`m_club_${selEqId}`).setTitle('Editar Club');
                      const fileInput = new FileUploadBuilder()
                          .setCustomId('e')
                          .setRequired(true);

                      const inputLabel = new LabelBuilder()
                          .setLabel("Escudo del Equipo")
                          .setFileUploadComponent(fileInput)

                      modalClub.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nombre del Equipo').setStyle(TextInputStyle.Short).setValue(selEq.nombre).setRequired(true)));
                      modalClub.addLabelComponents(inputLabel);
                      await iAct.showModal(modalClub);
                      
                      const subClub = await iAct.awaitModalSubmit({ time: 60000 }).catch(() => null);
                      if (!subClub) return;

                      const nombre = subClub.fields.getTextInputValue('n');
                      const escudo = subClub.fields.getField('e');

                      const url = escudo?.attachments.first()?.url;
                      if (!url) return interaction.editReply('❌ No se ha subido ninguna imagen para el escudo.');

                      const ext = url.split('.').pop().split('?')[0] || 'png';
                      const fileName = `${nombre.toLowerCase().replace(/ /g, '_')}_${Date.now()}.${ext}`;
                      const localPath = await descargarImagen(url, fileName);

                      selEq.nombre = nombre;
                      selEq.escudo = localPath;

                      await selEq.save();
                      await subClub.reply({ content: `✅ Equipo **${selEq.nombre}** actualizado.`, flags: 64 });
                  } else {
                      const idJug = action.split('_')[2];
                      const esCoach = action.startsWith('edit_coach');
                      const mem = esCoach ? selEq.coach : selEq.jugadores.find(j => j.id === idJug);
                      
                      const modalMem = new ModalBuilder().setCustomId(`m_mem_${idJug}`).setTitle('Editar Stats y Contrato');
                      modalMem.addComponents(
                          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('media').setLabel('Media').setStyle(TextInputStyle.Short).setValue(mem.media.toString()).setRequired(true)),
                          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pais').setLabel('País').setStyle(TextInputStyle.Short).setValue(mem.pais || 'Argentina').setRequired(true)),
                          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats').setLabel('Stats (ACT-TIR-PAS-IQ-AUR-ESQ)').setStyle(TextInputStyle.Short).setValue(`${mem.stats.actividad}-${mem.stats.tiro}-${mem.stats.pase}-${mem.stats.iq}-${mem.stats.aura}-${mem.stats.esquinazo}`).setRequired(true)),
                          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contrato').setLabel('Contrato (Temporadas)').setStyle(TextInputStyle.Short).setValue((mem.contrato || 1).toString()).setRequired(true)),
                          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('clausula').setLabel('Cláusula (ej: dinero 1000, ninguna)').setStyle(TextInputStyle.Short).setValue(mem.clausula ? `${mem.clausula.tipo} ${mem.clausula.valor}`.trim() : 'ninguna').setRequired(true))
                      );
                      await iAct.showModal(modalMem);
                      
                      const subMem = await iAct.awaitModalSubmit({ time: 60000 }).catch(() => null);
                      if (!subMem) return;
                      try {
                          mem.media = parseInt(subMem.fields.getTextInputValue('media'));
                          mem.pais = subMem.fields.getTextInputValue('pais');
                          const [act, tir, pas, iq, aur, esq] = subMem.fields.getTextInputValue('stats').split('-').map(Number);
                          mem.stats = { actividad: act, tiro: tir, pase: pas, iq: iq, aura: aur, esquinazo: esq };
                          
                          mem.contrato = Math.max(1, parseInt(subMem.fields.getTextInputValue('contrato')) || 1);
                          const clausulaStr = subMem.fields.getTextInputValue('clausula').trim().split(' ');
                          const tipoC = clausulaStr[0].toLowerCase();
                          let valorC = clausulaStr.slice(1).join(' ').trim();
                          
                          if (['dinero', 'partidos', 'objetivo', 'ninguna'].includes(tipoC)) {
                              if (tipoC === 'dinero') {
                                  const upperVal = valorC.toUpperCase();
                                  let multiplier = 1;
                                  let numStr = upperVal;
                                  if (upperVal.endsWith('M')) { multiplier = 1000000; numStr = upperVal.slice(0, -1); }
                                  else if (upperVal.endsWith('K')) { multiplier = 1000; numStr = upperVal.slice(0, -1); }
                                  const val = parseFloat(numStr.replace(',', '.'));
                                  if (!isNaN(val)) valorC = (val * multiplier).toString();
                              } else if (tipoC === 'partidos') {
                                  if (!isNaN(parseInt(valorC))) valorC = parseInt(valorC).toString();
                              }
                              mem.clausula = { tipo: tipoC, valor: valorC };
                          } else {
                              mem.clausula = { tipo: 'ninguna', valor: '' };
                          }

                          mem.carta = ''; // Force refresh visual
                          await selEq.save();
                          await subMem.reply({ content: `✅ Jugador **${mem.nombre}** actualizado.`, flags: 64 });
                      } catch (e) { await subMem.reply({ content: '❌ Formato inválido. Stats ej: 80-80-80-80-80-80', flags: 64 }); }
                  }
              });
          });
          break;
        }

        case 'btn_sl_gen_fixture': {
          if (!freshLiga) return i.reply({ content: '❌ No hay temporada activa.', flags: 64 });
          if (freshLiga.fechas && freshLiga.fechas.length > 0) return i.reply({ content: '❌ El fixture ya existe.', flags: 64 });
          
          const equiposAll = await EquipoSuperliga.find({});
          if (equiposAll.length < 2) return i.reply({ content: '❌ Se necesitan al menos 2 equipos.', flags: 64 });
          
          freshLiga.fechas = generarRoundRobinSuperliga(equiposAll, freshLiga.reglas?.vueltas || 1);
          freshLiga.equipos = equiposAll.map(e => e._id?.$oid ?? e._id);
          await freshLiga.save();
          
          await panelMsg.edit({ embeds: [buildSuperligaEmbed(freshLiga)], components: buildSuperligaRows(freshLiga) });
          await i.reply({ content: '✅ Fixture generado correctamente.', flags: 64 });
          break;
        }

        case 'btn_sl_nueva': {
          const modalNueva = new ModalBuilder().setCustomId('m_sl_nueva').setTitle('Nueva Temporada');
          modalNueva.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nombre').setLabel('Nombre de la Temporada').setStyle(TextInputStyle.Short).setPlaceholder('Ej: Temporada 1').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vueltas').setLabel('Cantidad de Vueltas').setStyle(TextInputStyle.Short).setValue('1').setRequired(true))
          );
          await i.showModal(modalNueva);
          const subN = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
          if (!subN) return;

          const nom = subN.fields.getTextInputValue('nombre');
          const v = parseInt(subN.fields.getTextInputValue('vueltas')) || 1;

          const equipos = await EquipoSuperliga.find({});
          if (equipos.length < 2) return subN.reply({ content: '❌ Se necesitan al menos 2 equipos para iniciar.', flags: 64 });

          const fechas = generarRoundRobinSuperliga(equipos, v);
          const nLiga = await Superliga.create({
            nombre: 'Superliga',
            temporada: nom,
            actual: true,
            equipos: equipos.map(e => e._id?.$oid ?? e._id),
            fechas,
            reglas: { vueltas: v },
            fechaInicio: Date.now()
          });

          await panelMsg.edit({ embeds: [buildSuperligaEmbed(nLiga)], components: buildSuperligaRows(nLiga) });
          await subN.reply({ content: `✅ Temporada **${nom}** iniciada con fixture generado.`, flags: 64 });
          break;
        }

        case 'btn_sl_terminar': {
          if (!freshLiga) return i.reply({ content: '❌ No hay temporada activa.', flags: 64 });
          await i.reply({ 
            content: '⚠️ Para finalizar la temporada con **reparto de premios, progresión de medias y vencimiento de contratos**, usa el comando:\n`!sl-finalizar`\n\nSi solo quieres desactivarla sin procesar nada, confirma aquí abajo.', 
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_sl_terminar_force').setLabel('Terminar sin procesar').setStyle(ButtonStyle.Danger)
                )
            ],
            flags: 64 
          });
          break;
        }

        case 'btn_sl_terminar_force': {
          const liga = await Superliga.findOne({ actual: true });
          if (liga) {
              liga.actual = false;
              await liga.save();
              await i.update({ content: `✅ Temporada **${liga.temporada}** terminada (sin procesar premios/progresión).`, components: [] });
          }
          break;
        }
      }
    });

    collector.on('end', () => panelMsg.edit({ components: [] }).catch(() => {}));
  }
};

async function handleLegacyCommands(client, message, args) {
    const subcomando = args[0]?.toLowerCase();
    if (subcomando === 'iniciar') {
      const temporada = args[1];
      const vueltas = parseInt(args[2]) || 1;
      if (!temporada) return message.reply('❌ Uso: `!superliga-gestion iniciar <nombre_temporada> [vueltas]`');
      const actual = await Superliga.findOne({ actual: true });
      if (actual) return message.reply('❌ Ya hay una temporada activa.');
      const equipos = await EquipoSuperliga.find({});
      if (equipos.length < 2) return message.reply('❌ Se necesitan al menos 2 equipos.');
      const fechas = generarRoundRobinSuperliga(equipos, vueltas);
      await Superliga.create({
        nombre: 'Superliga',
        temporada,
        actual: true,
        equipos: equipos.map(e => e._id?.$oid ?? e._id),
        fechas,
        reglas: { vueltas },
        fechaInicio: Date.now()
      });
      return message.reply(`✅ Superliga **${temporada}** iniciada.`);
    }
    
    if (subcomando === 'sync_stats') {
      const infoMsg = await message.reply('<a:loading:1461897825439711468> Calculando estadísticas históricas para todos los equipos... esto puede tomar un momento.');
      const allLigas = await Superliga.find({});
      const equipos = await EquipoSuperliga.find({});
      
      const statsMap = {};
      const nameMap = {};
      for (const eq of equipos) {
          const eqId = eq._id?.$oid ?? eq._id;
          statsMap[eqId] = {
              puntosAcumulados: 0,
              partidosGanados: 0,
              partidosPerdidos: 0,
              diferenciaGoles: 0,
              titulosTotales: 0
          };
          nameMap[eq.nombre] = eqId;
      }

      for (const liga of allLigas) {
          if (!liga.fechas) continue;
          const currentLigaStats = {};

          for (const f of liga.fechas) {
              const encuentros = f.partidos ?? f.encuentros;
              if (!encuentros) continue;

              for (const p of encuentros) {
                  if (!p.finalizado) continue;
                  
                  const lId = nameMap[p.localNombre || p.local?.nombre] || p.localId;
                  const vId = nameMap[p.visitanteNombre || p.visitante?.nombre] || p.visitanteId;
                  
                  if (!currentLigaStats[lId]) currentLigaStats[lId] = { pts: 0, dg: 0, gf: 0 };
                  if (!currentLigaStats[vId]) currentLigaStats[vId] = { pts: 0, dg: 0, gf: 0 };
                  
                  let pml = p.puntosMiniLocal ?? p.resultado?.golesLocal ?? 0;
                  let pmv = p.puntosMiniVisitante ?? p.resultado?.golesVisitante ?? 0;
                  
                  const duelos = p.duelosIndividuales || p.miniPartidos;
                  if (pml === 0 && pmv === 0 && duelos) {
                      duelos.forEach(mp => {
                          if (mp.finalizado) {
                              if (mp.golesLocal > mp.golesVisitante) pml++;
                              else if (mp.golesVisitante > mp.golesLocal) pmv++;
                          }
                      });
                  }
                  
                  let gl = p.golesTotalLocal || 0;
                  if (!gl && p.duelosIndividuales) { p.duelosIndividuales.forEach(mp => { gl += mp.golesLocal || 0; }); }
                  let gv = p.golesTotalVisitante || 0;
                  if (!gv && p.duelosIndividuales) { p.duelosIndividuales.forEach(mp => { gv += mp.golesVisitante || 0; }); }
                  
                  if (statsMap[lId]) {
                      statsMap[lId].diferenciaGoles += (gl - gv);
                      if (pml > pmv) { statsMap[lId].partidosGanados++; statsMap[lId].puntosAcumulados += 3; }
                      else if (pmv > pml) { statsMap[lId].partidosPerdidos++; }
                      else { statsMap[lId].puntosAcumulados += 1; }
                  }
                  if (statsMap[vId]) {
                      statsMap[vId].diferenciaGoles += (gv - gl);
                      if (pmv > pml) { statsMap[vId].partidosGanados++; statsMap[vId].puntosAcumulados += 3; }
                      else if (pml > pmv) { statsMap[vId].partidosPerdidos++; }
                      else { statsMap[vId].puntosAcumulados += 1; }
                  }

                  currentLigaStats[lId].pts += (pml > pmv ? 3 : (pml === pmv ? 1 : 0));
                  currentLigaStats[vId].pts += (pmv > pml ? 3 : (pmv === pml ? 1 : 0));
                  currentLigaStats[lId].dg += (pml - pmv);
                  currentLigaStats[vId].dg += (pmv - pml);
                  currentLigaStats[lId].gf += pml;
                  currentLigaStats[vId].gf += pmv;
              }
          }

          const entries = Object.entries(currentLigaStats);
          if (entries.length > 0) {
              const winnerEntry = entries.sort((a, b) => {
                  return b[1].pts - a[1].pts || b[1].dg - a[1].dg || b[1].gf - a[1].gf;
              })[0];
              const winnerId = winnerEntry[0];
              if (statsMap[winnerId]) {
                  statsMap[winnerId].titulosTotales++;
              }
          }
      }

      for (const eq of equipos) {
          const eqId = eq._id?.$oid ?? eq._id;
          if (statsMap[eqId]) {
              eq.tablaHistorica = statsMap[eqId];
              await eq.save();
          }
      }
      return infoMsg.edit(`✅ Estadísticas históricas sincronizadas correctamente para **${equipos.length}** equipos en **${allLigas.length}** temporadas.`);
    }

    return message.reply('💡 Tip: Usa `!superliga-gestion` sin argumentos para abrir el panel.\nSubcomandos: `iniciar`, `sync_stats`');
}
