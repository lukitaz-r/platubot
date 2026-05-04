import { ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonStyle, ButtonBuilder } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import Superliga from '../../models/superliga/Superliga.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import generarRoundRobinSuperliga from '../../utils/generarRoundRobinSuperliga.js';
import { buildSupercopaEmbed, buildSupercopaRows } from '../../utils/ui/superliga/buildSupercopaPanel.js';
import { aplicarCambioMediaDuelo } from '../../utils/db/mediaCalculator.js';

function calcTablaGrupo(grupo) {
  const stats = {};
  grupo.equipos.forEach(id => { stats[id] = { id, pts: 0, pj: 0, pg: 0, pp: 0, gf: 0, gc: 0, dg: 0 }; });
  grupo.fechas.forEach(f => (f.partidos ?? f.encuentros).forEach(p => {
    if (!p.finalizado) return;
    const l = stats[p.localId] || stats[Object.keys(stats).find(k => stats[k].nombre === p.localNombre)];
    const v = stats[p.visitanteId] || stats[Object.keys(stats).find(k => stats[k].nombre === p.visitanteNombre)];
    if (!l || !v) return;
    l.pj++; v.pj++;
    const sl = p.puntosMiniLocal ?? 0, sv = p.puntosMiniVisitante ?? 0;
    l.gf += sl; l.gc += sv; v.gf += sv; v.gc += sl;
    if (sl > sv) { l.pg++; l.pts += 3; v.pp++; }
    else if (sv > sl) { v.pg++; v.pts += 3; l.pp++; }
  }));
  return Object.values(stats).map(e => { e.dg = e.gf - e.gc; return e; }).sort((a,b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
}

function crearPartido(local, visitante) {
  return {
    _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    localId: local._id?.$oid ?? local._id, localNombre: local.nombre,
    visitanteId: visitante._id?.$oid ?? visitante._id, visitanteNombre: visitante.nombre,
    duelosIndividuales: [
      { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false },
      { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false },
      { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false },
    ],
    puntosMiniLocal: 0, puntosMiniVisitante: 0, golesTotalLocal: 0, golesTotalVisitante: 0, finalizado: false
  };
}

export default {
  name: 'supersupercopa-gestion',
  aliases: ['ssc-gestion', 'sscg'],
  desc: 'Gestión de la Supersupercopa',
  permisos: ['Administrator'],

  run: async (client, message, args) => {
    let copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' }) || await Supersupercopa.findOne({});
    const panelMsg = await message.reply({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });

    const collector = panelMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

    collector.on('collect', async i => {
      if (!i.member.permissions.has('Administrator')) return i.reply({ content: '❌ No tienes permisos.', flags: 64 });
      copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' }) || copa;

      switch (i.customId) {
        case 'btn_ssc_refresh':
          await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
          await i.deferUpdate();
          break;

        case 'btn_ssc_borrar':
          if (copa) { await Supersupercopa.deleteOne({ estadoGlobal: 'Activa' }); copa = null; }
          await panelMsg.edit({ embeds: [buildSupercopaEmbed(null)], components: buildSupercopaRows(null) });
          await i.reply({ content: '✅ Supersupercopa borrada.', flags: 64 });
          break;

        case 'btn_ssc_sortear': {
          const todasLigas = await Superliga.find({});
          const ligaFin = todasLigas.filter(l => !l.actual).pop();
          if (!ligaFin) return i.reply({ content: '❌ No hay temporada de Superliga finalizada.', flags: 64 });
          const slActiva = await Superliga.findOne({ actual: true });
          if (slActiva) return i.reply({ content: '❌ Hay una temporada de Superliga activa. Finalizala primero.', flags: 64 });

          const equiposDB = await EquipoSuperliga.find({});
          // Calcular tabla de la última liga finalizada
          const stats = {};
          ligaFin.fechas?.forEach(f => {
            const enc = f.partidos ?? f.encuentros;
            if (!enc) return;
            enc.forEach(p => {
              if (!p.finalizado) return;
              const localNombre = p.local?.nombre ?? p.localNombre;
              const visitanteNombre = p.visitante?.nombre ?? p.visitanteNombre;
              if (!localNombre || !visitanteNombre) return;

              if (!stats[localNombre]) stats[localNombre] = { nombre: localNombre, pts: 0, pg: 0, pp: 0, pe: 0, dg: 0, gf: 0 };
              if (!stats[visitanteNombre]) stats[visitanteNombre] = { nombre: visitanteNombre, pts: 0, pg: 0, pp: 0, pe: 0, dg: 0, gf: 0 };

              // Superliga vieja usa `resultado.golesLocal/Visitante`, SSC usa `puntosMiniLocal/Visitante`
              const sl = p.resultado?.golesLocal ?? p.puntosMiniLocal ?? 0;
              const sv = p.resultado?.golesVisitante ?? p.puntosMiniVisitante ?? 0;

              stats[localNombre].gf += sl;
              stats[visitanteNombre].gf += sv;
              stats[localNombre].dg += sl - sv;
              stats[visitanteNombre].dg += sv - sl;

              if (sl > sv) {
                stats[localNombre].pts += 3;
                stats[localNombre].pg++;
                stats[visitanteNombre].pp++;
              } else if (sv > sl) {
                stats[visitanteNombre].pts += 3;
                stats[visitanteNombre].pg++;
                stats[localNombre].pp++;
              } else {
                stats[localNombre].pts += 1;
                stats[visitanteNombre].pts += 1;
                stats[localNombre].pe++;
                stats[visitanteNombre].pe++;
              }
            });
          });
          const sorted = Object.values(stats).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);

          const grupoA = [], grupoB = [];
          sorted.forEach((s, idx) => {
            const eq = equiposDB.find(e => e.nombre === s.nombre);
            if (!eq) return;
            const eId = eq._id?.$oid ?? eq._id;
            
            // Puestos impares (1°, 3°, 5°...) -> Grupo A | Puestos pares (2°, 4°, 6°...) -> Grupo B
            if (idx % 2 === 0) grupoA.push({ ...eq, _id: eId });
            else grupoB.push({ ...eq, _id: eId });
          });

          if (grupoA.length < 2 || grupoB.length < 2) return i.reply({ content: '❌ No hay suficientes equipos.', flags: 64 });

          const fechasA = generarRoundRobinSuperliga(grupoA, 1);
          const fechasB = generarRoundRobinSuperliga(grupoB, 1);

          copa = await Supersupercopa.create({
            temporada: ligaFin.temporada,
            fase: 'grupos',
            estadoGlobal: 'Activa',
            tema: { primario: '#0a0e14', secundario: '#161d26', acento: '#f1c40f', texto: '#ffffff', borde: '#374151' },
            grupos: [
              { nombre: 'A', equipos: grupoA.map(e => e._id), fechas: fechasA },
              { nombre: 'B', equipos: grupoB.map(e => e._id), fechas: fechasB },
            ],
            semifinales: [], final: null,
          });

          await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
          await i.reply({ content: `✅ Supersupercopa sorteada. Grupo A: ${grupoA.length} equipos, Grupo B: ${grupoB.length} equipos.`, flags: 64 });
          break;
        }

        case 'btn_ssc_resultado': {
          if (!copa || copa.estadoGlobal !== 'Activa') return i.reply({ content: '❌ No hay SSC activa.', flags: 64 });

          const allPartidos = [];
          if (copa.fase === 'grupos') {
            copa.grupos.forEach(
              (g, gi) => g.fechas.forEach(
                (f, fi) => f.partidos.forEach(
                  (p, pi) => {
                    allPartidos
                      .push({ 
                        label: `G${g.nombre} F${f.numero}: ${p.localNombre} vs ${p.visitanteNombre}`, 
                        desc: p.finalizado ? '✅' : '⏳', 
                        value: `g_${gi}_${fi}_${pi}` 
                      });
            })));
          } else {
            const arr = copa.fase === 'semifinales' ? copa.semifinales : (copa.final ? [copa.final] : []);
            arr
            .forEach(
              (p, pi) => { 
                allPartidos
                .push({ 
                  label: `${copa.fase}: ${p.localNombre} vs ${p.visitanteNombre}`,
                  desc: p.finalizado ? '✅' : '⏳',
                  value: `e_${pi}` 
                }); });
          }
          if (!allPartidos.length) return i.reply({ content: '❌ No hay partidos.', flags: 64 });

          const menu = new StringSelectMenuBuilder().setCustomId('sel_ssc_match').setPlaceholder('Selecciona partido').addOptions(allPartidos.slice(0, 25));
          const m1 = await i.reply({ content: 'Selecciona el partido para cargar resultados:', components: [new ActionRowBuilder().addComponents(menu)], flags: 64, fetchReply: true });

          const col = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
          col.on('collect', async iM => {
            const val = iM.values[0];
            let pObj;
            if (val.startsWith('g_')) {
              const [, gi, fi, pi] = val.split('_').map(Number);
              pObj = copa.grupos[gi].fechas[fi].partidos[pi];
            } else {
              const [, pi] = val.split('_').map(Number);
              pObj = copa.fase === 'semifinales' ? copa.semifinales[pi] : copa.final;
            }
            if (!pObj) return iM.reply({ content: '❌ Partido no encontrado.', flags: 64 });

            const rowMinis = new ActionRowBuilder();
            for (let i = 0; i < 3; i++) {
              const d = pObj.duelosIndividuales[i];
              rowMinis.addComponents(
                new ButtonBuilder()
                  .setCustomId(`btn_ssc_mini_${i}`)
                  .setLabel(d.finalizado ? `✅ ${d.localJugadorNombre} vs ${d.visitanteJugadorNombre}` : `🥅 ${d.localJugadorNombre} vs ${d.visitanteJugadorNombre}`)
                  .setStyle(d.finalizado ? ButtonStyle.Success : ButtonStyle.Primary)
                  .setDisabled(d.finalizado)
              );
            }

            const m2 = await iM.reply({
              content: `🔍 **Validando Partido SSC:** ${pObj.localNombre} vs ${pObj.visitanteNombre}`,
              components: [rowMinis],
              flags: 64,
              fetchReply: true
            });

            const colMini = m2.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
            colMini.on('collect', async iB => {
              const miniIdx = parseInt(iB.customId.split('_').pop());
              const duel = pObj.duelosIndividuales[miniIdx];
              const labelL = duel.localJugadorNombre || 'Local';
              const labelV = duel.visitanteJugadorNombre || 'Visitante';
              const idL = duel.localJugadorId || 'desconocido';
              const idV = duel.visitanteJugadorId || 'desconocido';

              const modal = new ModalBuilder().setCustomId(`m_ssc_mini_${miniIdx}`).setTitle(`Partido ${pObj.localNombre} vs ${pObj.visitanteNombre}`);
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel(`Goles ${labelL}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 5').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel(`Goles ${labelV}`).setStyle(TextInputStyle.Short).setPlaceholder('Ej: 3').setRequired(true))
              );
              await iB.showModal(modal);

              const sub = await iB.awaitModalSubmit({ time: 60000 }).catch(() => null);
              if (!sub) return;

              try {
                const gl = parseInt(sub.fields.getTextInputValue('gl'));
                const gv = parseInt(sub.fields.getTextInputValue('gv'));
                if (isNaN(gl) || isNaN(gv)) throw new Error();

                duel.golesLocal = gl;
                duel.golesVisitante = gv;
                duel.finalizado = true;

                // Media individual tras cada minipartido
                if (gl !== gv && duel.localJugadorId && duel.visitanteJugadorId) {
                  try {
                    const resultadoMedia = await aplicarCambioMediaDuelo(
                      gl > gv ? duel.localJugadorId : duel.visitanteJugadorId,
                      gl > gv ? duel.visitanteJugadorId : duel.localJugadorId,
                      Math.max(gl, gv), Math.min(gl, gv)
                    );
                    if (resultadoMedia) {
                      const { ganadorNombre, perdedorNombre, delta, nuevaMediaGanador, nuevaMediaPerdedor } = resultadoMedia;
                      await i.channel.send(`🧮 Media de **${ganadorNombre}** subió a **${nuevaMediaGanador.toFixed(2)}** (+${delta.toFixed(2)}) \nMedia de **${perdedorNombre}** bajó a **${nuevaMediaPerdedor.toFixed(2)}** (-${delta.toFixed(2)})`);
                      await (await client.channels.fetch(process.env.CANAL_RESULTADOS_SUPERLIGA)).send(`⚽ Partido <@${idL}> (${pObj.localNombre}) vs <@${idV}> (${pObj.visitanteNombre})\n✅ Resultado: ${labelL} **${gl} - ${gv}** ${labelV}\n📊 Cambios en las medias tras el duelo de **SuperSuperCopa**:\n🧮 Media de **${ganadorNombre}** subió a **${nuevaMediaGanador.toFixed(2)}** (+${delta.toFixed(2)})\n🧮 Media de **${perdedorNombre}** bajó a **${nuevaMediaPerdedor.toFixed(2)}** (-${delta.toFixed(2)})`);
                    }
                  } catch (error) {
                    console.log(error)
                  }
                }

                // Recalcular estado global
                let pml = 0, pmv = 0, gtl = 0, gtv = 0;
                for (const d of pObj.duelosIndividuales) {
                  if (d.finalizado) {
                    gtl += d.golesLocal; gtv += d.golesVisitante;
                    if (d.golesLocal > d.golesVisitante) pml++;
                    else if (d.golesVisitante > d.golesLocal) pmv++;
                  }
                }
                
                pObj.puntosMiniLocal = pml;
                pObj.puntosMiniVisitante = pmv;
                pObj.golesTotalLocal = gtl;
                pObj.golesTotalVisitante = gtv;

                const allFinished = pObj.duelosIndividuales.every(d => d.finalizado);
                if ((pml >= 2 || pmv >= 2 || allFinished)) {
                  pObj.finalizado = true;
                }

                if (pObj.finalizado) {
                  const eqL = await EquipoSuperliga.findOne({ _id: pObj.localId });
                  const eqV = await EquipoSuperliga.findOne({ _id: pObj.visitanteId });
                  
                  let dineroL = 0, dineroV = 0;
                  if (pml > pmv) {
                    dineroL = 200_000;
                  } else if (pmv > pml) {
                    dineroV = 200_000;
                  }

                  if (copa.fase === 'semifinales') {
                    if (pml > pmv) dineroL += 1_000_000; else if (pmv > pml) dineroV += 1_000_000;
                  } else if (copa.fase === 'final') {
                    if (pml > pmv) dineroL += 2_000_000; else if (pmv > pml) dineroV += 2_000_000;
                  }

                  if (eqL) {
                    eqL.dinero = (eqL.dinero || 0) + dineroL;
                    if (pml > pmv) {
                        if (eqL.coach?.media != null) eqL.coach.media = Math.round((eqL.coach.media + 0.5) * 100) / 100;
                        eqL.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                    } else if (pml < pmv) eqL.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                    await eqL.save();
                    if (dineroL > 0) {
                      await i.channel.send({
                        content: `**${eqL.nombre}** ha ganado $**${dineroL}** por la victoria en la Supercopa.`
                      })
                      await client.channels.fetch(process.env.CANAL_RESULTADOS_SUPERLIGA)
                        .then(c => c.send({
                          content: `**${eqL.nombre}** ha ganado $**${dineroL}** por la victoria en la Supercopa.`
                        }))
                    }
                  }
                  if (eqV) {
                    eqV.dinero = (eqV.dinero || 0) + dineroV;
                    if (pmv > pml) {
                        if (eqV.coach?.media != null) eqV.coach.media = Math.round((eqV.coach.media + 0.5) * 100) / 100;
                        eqV.jugadores.forEach(j => { j.media = Math.round((j.media + 0.2) * 100) / 100; });
                    } else if (pmv < pml) eqV.jugadores.forEach(j => { j.media = Math.round((j.media - 0.1) * 100) / 100; });
                    await eqV.save();
                    if (dineroV > 0) {
                      await i.channel.send({
                        content: `**${eqV.nombre}** ha ganado $**${dineroV}** por la victoria en la Supercopa.`
                      })
                      await client.channels.fetch(process.env.CANAL_RESULTADOS_SUPERLIGA)
                        .then(c => c.send({
                          content: `**${eqV.nombre}** ha ganado $**${dineroV}** por la victoria en la Supercopa.`
                        }))
                    }
                  }
                }

                await copa.save();
                await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
                await sub.reply({ content: `✅ Duelo **${labelL}** vs **${labelV}** guardado (**${gl}-${gv}**).` + (pObj.finalizado ? ' ¡Serie finalizada!' : '')});
              } catch { await sub.reply({ content: '❌ Error al guardar.', flags: 64 }); }
            });
          });
          break;
        }

        case 'btn_ssc_avanzar': {
          if (!copa) return i.reply({ content: '❌ No hay SSC activa.', flags: 64 });
          const equiposDB = await EquipoSuperliga.find({});

          if (copa.fase === 'grupos') {
            const pendA = copa.grupos[0].fechas.flatMap(f => f.partidos).some(p => !p.finalizado);
            const pendB = copa.grupos[1].fechas.flatMap(f => f.partidos).some(p => !p.finalizado);
            if (pendA || pendB) return i.reply({ content: '❌ Faltan partidos por terminar en los grupos.', flags: 64 });

            const tablaA = calcTablaGrupo(copa.grupos[0]);
            const tablaB = calcTablaGrupo(copa.grupos[1]);
            const eqA1 = equiposDB.find(e => (e._id?.$oid ?? e._id) === tablaA[0]?.id);
            const eqA2 = equiposDB.find(e => (e._id?.$oid ?? e._id) === tablaA[1]?.id);
            const eqB1 = equiposDB.find(e => (e._id?.$oid ?? e._id) === tablaB[0]?.id);
            const eqB2 = equiposDB.find(e => (e._id?.$oid ?? e._id) === tablaB[1]?.id);
            if (!eqA1 || !eqA2 || !eqB1 || !eqB2) return i.reply({ content: '❌ Error obteniendo clasificados.', flags: 64 });

            copa.semifinales = [crearPartido(eqA1, eqB2), crearPartido(eqB1, eqA2)];
            copa.fase = 'semifinales';
            await copa.save();
            await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
            await i.reply({ content: `✅ Semis: **${eqA1.nombre}** vs **${eqB2.nombre}** | **${eqB1.nombre}** vs **${eqA2.nombre}**`, flags: 64 });
          } else if (copa.fase === 'semifinales') {
            if (copa.semifinales.some(p => !p.finalizado)) return i.reply({ content: '❌ Faltan semis por jugar.', flags: 64 });
            const g1 = copa.semifinales[0].puntosMiniLocal > copa.semifinales[0].puntosMiniVisitante ? { id: copa.semifinales[0].localId, nombre: copa.semifinales[0].localNombre } : { id: copa.semifinales[0].visitanteId, nombre: copa.semifinales[0].visitanteNombre };
            const g2 = copa.semifinales[1].puntosMiniLocal > copa.semifinales[1].puntosMiniVisitante ? { id: copa.semifinales[1].localId, nombre: copa.semifinales[1].localNombre } : { id: copa.semifinales[1].visitanteId, nombre: copa.semifinales[1].visitanteNombre };
            const eq1 = equiposDB.find(e => (e._id?.$oid ?? e._id) === g1.id || e.nombre === g1.nombre) || { _id: g1.id, nombre: g1.nombre };
            const eq2 = equiposDB.find(e => (e._id?.$oid ?? e._id) === g2.id || e.nombre === g2.nombre) || { _id: g2.id, nombre: g2.nombre };
            copa.final = crearPartido(eq1, eq2);
            copa.fase = 'final';
            await copa.save();
            await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
            await i.reply({ content: `✅ Final: **${eq1.nombre}** vs **${eq2.nombre}**`, flags: 64 });
          } else if (copa.fase === 'final') {
            if (!copa.final?.finalizado) return i.reply({ content: '❌ La final no se jugó.', flags: 64 });
            copa.fase = 'finalizado';
            copa.estadoGlobal = 'Finalizada';
            await copa.save();
            await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
            await i.reply({ content: '🏆 Supersupercopa finalizada.', flags: 64 });
          }
          break;
        }

        case 'btn_ssc_editar_duelos': {
          if (!copa || !['semifinales', 'final'].includes(copa.fase)) return i.reply({ content: '❌ Solo disponible en fase eliminatoria.', flags: 64 });
          const partidos = copa.fase === 'semifinales' ? copa.semifinales : [copa.final];
          const opts = partidos.map((p, idx) => ({ label: `${p.localNombre} vs ${p.visitanteNombre}`, value: `${idx}` }));
          const menu = new StringSelectMenuBuilder().setCustomId('sel_ssc_duelo').setPlaceholder('Selecciona duelo').addOptions(opts);
          const m1 = await i.reply({ content: 'Selecciona el duelo a editar:', components: [new ActionRowBuilder().addComponents(menu)], flags: 64, fetchReply: true });
          const col = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
          col.on('collect', async iD => {
            const idx = parseInt(iD.values[0]);
            const p = partidos[idx];
            const equiposDB = await EquipoSuperliga.find({});
            const eqOpts = equiposDB.slice(0, 25).map(e => ({ label: e.nombre, value: e._id?.$oid ?? e._id }));
            const selL = new StringSelectMenuBuilder().setCustomId('sel_duelo_l').setPlaceholder('Local').addOptions(eqOpts);
            const selV = new StringSelectMenuBuilder().setCustomId('sel_duelo_v').setPlaceholder('Visitante').addOptions(eqOpts);
            await iD.reply({ content: 'Selecciona local y visitante:', components: [new ActionRowBuilder().addComponents(selL), new ActionRowBuilder().addComponents(selV)], flags: 64, fetchReply: true });
            const state = { l: null, v: null };
            const col2 = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
            col2.on('collect', async iS => {
              const eq = equiposDB.find(e => (e._id?.$oid ?? e._id) === iS.values[0]);
              if (iS.customId === 'sel_duelo_l') { state.l = eq; } else { state.v = eq; }
              await iS.deferUpdate();
              if (state.l && state.v) {
                p.localId = state.l._id?.$oid ?? state.l._id; p.localNombre = state.l.nombre;
                p.visitanteId = state.v._id?.$oid ?? state.v._id; p.visitanteNombre = state.v.nombre;
                await copa.save();
                col2.stop();
                await iD.followUp({ content: `✅ Duelo actualizado: ${state.l.nombre} vs ${state.v.nombre}`, flags: 64 });
              }
            });
          });
          break;
        }

        case 'btn_ssc_tema': {
          const modal = new ModalBuilder().setCustomId('m_ssc_tema').setTitle('Editar Tema de Color');
          const current = copa?.tema || { primario: '#0a0e14', secundario: '#161d26', acento: '#f1c40f', texto: '#ffffff', borde: '#374151' };
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('primario').setLabel('Color Primario (fondo)').setStyle(TextInputStyle.Short).setValue(current.primario).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('secundario').setLabel('Color Secundario (cards)').setStyle(TextInputStyle.Short).setValue(current.secundario).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('acento').setLabel('Color Acento').setStyle(TextInputStyle.Short).setValue(current.acento).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texto').setLabel('Color Texto').setStyle(TextInputStyle.Short).setValue(current.texto).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('borde').setLabel('Color Borde').setStyle(TextInputStyle.Short).setValue(current.borde).setRequired(true)),
          );
          await i.showModal(modal);
          const sub = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
          if (!sub) return;
          if (!copa) { copa = await Supersupercopa.create({ estadoGlobal: 'Inactiva' }); }
          copa.tema = {
            primario: sub.fields.getTextInputValue('primario'),
            secundario: sub.fields.getTextInputValue('secundario'),
            acento: sub.fields.getTextInputValue('acento'),
            texto: sub.fields.getTextInputValue('texto'),
            borde: sub.fields.getTextInputValue('borde'),
          };
          await copa.save();
          await panelMsg.edit({ embeds: [buildSupercopaEmbed(copa)], components: buildSupercopaRows(copa) });
          await sub.reply({ content: '✅ Tema actualizado.', flags: 64 });
          break;
        }

        case 'btn_ssc_editar_equipos': {
          const equiposEdit = await EquipoSuperliga.find({});
          if (!equiposEdit.length) return i.reply({ content: '❌ No hay equipos.', flags: 64 });
          const opts = equiposEdit.slice(0, 25).map(e => ({ label: e.nombre, value: e._id?.$oid ?? e._id }));
          const menu = new StringSelectMenuBuilder().setCustomId('sel_ssc_eq').setPlaceholder('Equipo').addOptions(opts);
          const m1 = await i.reply({ content: 'Selecciona equipo:', components: [new ActionRowBuilder().addComponents(menu)], flags: 64, fetchReply: true });
          const col = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
          col.on('collect', async iE => {
            if (iE.customId !== 'sel_ssc_eq') return;
            await iE.deferUpdate();
            const eq = equiposEdit.find(e => (e._id?.$oid ?? e._id) === iE.values[0]);
            const memOpts = [{ label: `👤 Coach: ${eq.coach.nombre}`, value: `coach_${eq.coach.id}` }];
            eq.jugadores.forEach(j => memOpts.push({ label: `🏃 ${j.nombre}`, value: `jug_${j.id}` }));
            const memMenu = new StringSelectMenuBuilder().setCustomId('sel_ssc_mem').setPlaceholder('Miembro').addOptions(memOpts);
            await iE.editReply({ content: `Editando **${eq.nombre}**:`, components: [new ActionRowBuilder().addComponents(memMenu)] });
            const col2 = m1.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
            col2.on('collect', async iM => {
              if (iM.customId !== 'sel_ssc_mem') return;
              const val = iM.values[0];
              const esCoach = val.startsWith('coach');
              const mem = esCoach ? eq.coach : eq.jugadores.find(j => j.id === val.split('_')[1]);
              const modal = new ModalBuilder().setCustomId('m_ssc_mem').setTitle('Editar');
              modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('media').setLabel('Media').setStyle(TextInputStyle.Short).setValue(mem.media.toString()).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pais').setLabel('País').setStyle(TextInputStyle.Short).setValue(mem.pais || 'Argentina').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats').setLabel('Stats ACT-TIR-PAS-IQ-AUR-ESQ').setStyle(TextInputStyle.Short).setValue(`${mem.stats?.actividad||80}-${mem.stats?.tiro||80}-${mem.stats?.pase||80}-${mem.stats?.iq||80}-${mem.stats?.aura||80}-${mem.stats?.esquinazo||80}`).setRequired(true)),
              );
              await iM.showModal(modal);
              const sub = await iM.awaitModalSubmit({ time: 60000 }).catch(() => null);
              if (!sub) return;
              try {
                mem.media = parseInt(sub.fields.getTextInputValue('media'));
                mem.pais = sub.fields.getTextInputValue('pais');
                const [a,t,p,q,u,e] = sub.fields.getTextInputValue('stats').split('-').map(Number);
                mem.stats = { actividad: a, tiro: t, pase: p, iq: q, aura: u, esquinazo: e };
                mem.carta = '';
                await eq.save();
                await sub.reply({ content: `✅ ${mem.nombre} actualizado.`, flags: 64 });
              } catch { await sub.reply({ content: '❌ Formato inválido.', flags: 64 }); }
            });
          });
          break;
        }
      }
    });
  }
};
