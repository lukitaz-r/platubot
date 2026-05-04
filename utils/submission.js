import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

import Primera from "../models/Primera.js";
import Segunda from "../models/Segunda.js";
import Torneo from "../models/copas/Torneo.js";
import Coppa from "../models/copas/Coppa.js";
import { determinarGanadorLlave } from "./generarBracket.js";

export default async function submission(client, message) {

  // ── Detectar canal y tipo de torneo ───────────────────────────────────
  const ligaChannels = {
    [process.env.CANAL_RESULTADOS_PRIMERA]: 'platubi',
    [process.env.CANAL_RESULTADOS_SEGUNDA]: 'palubi',
    [process.env.CANAL_RESULTADOS_SUPERLIGA]: 'superliga',
    [process.env.CANAL_RESULTADOS_COPPA]: 'coppa',
  };

  let tournamentType = ligaChannels[message.channel.id] || null;

  if (!tournamentType) {
    const torneo = await Torneo.findOne({
      canalResultados: message.channel.id,
      estado: { $ne: 'Finalizado' },
    });
    if (torneo) tournamentType = `COPA_${torneo.prefix.toUpperCase()}`;
  }

  if (!tournamentType || message.author.bot) return;

  // ════════════════════════════════════════════════════════════════════════
  // COPPA — Flujo de eliminación directa
  // ════════════════════════════════════════════════════════════════════════

  if (tournamentType === 'coppa') {
    const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);

    const warn = async (text) => {
      try {
        await message.delete();
        const w = await message.channel.send(`<@${message.author.id}>, ${text}`);
        setTimeout(() => w.delete().catch(() => {}), 10000);
      } catch {}
    };

    if (!coppa) {
      return warn('❌ No hay una Coppa en curso.');
    }

    if (!coppa.equipos.some(e => e.discordId === message.author.id)) {
      return warn('❌ No estás inscrito en la Coppa.');
    }

    if (message.attachments.size === 0) {
      return warn('❌ Debes adjuntar la **foto del marcador** para reportar un resultado.');
    }

    // Find pending matches for this user in the current phase
    const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
    const llaves = coppa.llaves[faseActual] ?? [];
    const pendingOptions = [];

    for (const llave of llaves) {
      if (llave.ganador) continue;
      const isEq1 = llave.equipo1.discordId === message.author.id;
      const isEq2 = llave.equipo2.discordId === message.author.id;
      if (!isEq1 && !isEq2) continue;

      if (!llave.ida.finalizado) {
        pendingOptions.push({
          label: `IDA: ${llave.equipo1.nombre} vs ${llave.equipo2.nombre}`.slice(0, 100),
          value: `${llave.id}|ida`,
        });
      } else if (!llave.vuelta.finalizado) {
        pendingOptions.push({
          label: `VUELTA: ${llave.equipo2.nombre} vs ${llave.equipo1.nombre}`.slice(0, 100),
          value: `${llave.id}|vuelta`,
        });
      } else {
        const g1 = llave.ida.golesLocal + llave.vuelta.golesVisitante;
        const g2 = llave.ida.golesVisitante + llave.vuelta.golesLocal;
        if (g1 === g2 && !llave.desempate.finalizado) {
          pendingOptions.push({
            label: `DESEMPATE: ${llave.equipo1.nombre} vs ${llave.equipo2.nombre}`.slice(0, 100),
            value: `${llave.id}|desempate`,
          });
        }
      }
    }

    if (!pendingOptions.length) {
      return warn('❌ No tienes partidos pendientes en la Coppa.');
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('sel_coppa_submit')
      .setPlaceholder('¿A qué partido de la Coppa corresponde?')
      .addOptions(pendingOptions.slice(0, 25));

    const selMsg = await message.channel.send({
      content: `<@${message.author.id}>, ¿A qué partido de la Coppa corresponde este resultado?`,
      components: [new ActionRowBuilder().addComponents(select)],
    });

    const selFilter = i => i.customId === 'sel_coppa_submit' && i.user.id === message.author.id;
    const selResp = await selMsg.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
    await selMsg.delete().catch(() => {});

    if (!selResp) {
      await message.delete().catch(() => {});
      return;
    }
    await selResp.deferUpdate().catch(() => {});

    const [llaveId, tipo] = selResp.values[0].split('|');
    const llave = llaves.find(l => l.id === llaveId);
    if (!llave) return;

    const esVuelta = tipo === 'vuelta';
    const localNombre = esVuelta ? llave.equipo2.nombre : llave.equipo1.nombre;
    const visitanteNombre = esVuelta ? llave.equipo1.nombre : llave.equipo2.nombre;

    try {
      const approvalChannel = await client.channels.fetch(process.env.CANAL_APROBACION).catch(() => null);
      if (!approvalChannel) return console.error("Canal de aprobación no encontrado.");

      const allAttachments = [...message.attachments.values()];
      const userNote = message.content?.trim() ? `\n📝 **Nota:** ${message.content}` : '';

      const embed = new EmbedBuilder()
        .setTitle(`📋 Resultado Pendiente — Coppa (${tipo.toUpperCase()})`)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(
          `**Partido:** ${localNombre} vs ${visitanteNombre}\n` +
          `**Fase:** ${faseActual} | **Tipo:** ${tipo.toUpperCase()}\n` +
          `Reportado por <@${message.author.id}>${userNote}`
        )
        .setColor('#059669')
        .setTimestamp()
        .setFooter({ text: `Coppa | ${allAttachments.length} imagen(es)` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprv|coppa|${llaveId}|${tipo}|${message.author.id}`)
          .setLabel('✅ Validar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny|coppa|${llaveId}|${tipo}|${message.author.id}`)
          .setLabel('❌ Denegar')
          .setStyle(ButtonStyle.Danger),
      );

      const files = allAttachments.map(a => a.url);
      await approvalChannel.send({ embeds: [embed], components: [row], files });

      const confirm = await message.channel.send(
        `✅ <@${message.author.id}> Resultado de la Coppa (**${localNombre} vs ${visitanteNombre}** — ${tipo}) enviado a revisión.`
      );
      setTimeout(() => confirm.delete().catch(() => {}), 8000);
    } catch (error) {
      console.error("Error processing coppa submission:", error);
    }

    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // platubi / palubi — Flujo con selección de partido + aprobación
  // ════════════════════════════════════════════════════════════════════════

  if (tournamentType === 'platubi' || tournamentType === 'palubi') {
    const ModeloLiga = tournamentType === 'platubi' ? Primera : Segunda;
    const ligas = await ModeloLiga.find({}).catch(() => []);
    const liga = ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio))[0] ?? null;

    const warn = async (text) => {
      try {
        await message.delete();
        const w = await message.channel.send(`<@${message.author.id}>, ${text}`);
        setTimeout(() => w.delete().catch(() => {}), 10000);
      } catch {}
    };

    if (!liga || !liga.partidos?.length) {
      return warn('❌ El fixture aún no está generado para este torneo.');
    }

    if (!liga.jugadores.some(j => j.id === message.author.id)) {
      return warn('❌ No estás inscrito en este torneo.');
    }

    if (message.attachments.size === 0) {
      return warn('❌ Debes adjuntar la **foto del marcador** para reportar un resultado.');
    }

    const pendingMatches = liga.fechas.flatMap(f =>
      (f.partidos ?? f.encuentros)
        .filter(p => !p.finalizado && (p.localId === message.author.id || p.visitanteId === message.author.id))
        .map(p => ({ ...p, fechaNum: f.numero }))
    ).slice(0, 25);

    if (!pendingMatches.length) {
      return warn('❌ No tienes partidos pendientes en el fixture.');
    }

    // Selección del partido
    const select = new StringSelectMenuBuilder()
      .setCustomId('sel_match_submit')
      .setPlaceholder('¿A qué partido corresponde este resultado?')
      .addOptions(pendingMatches.map(p => ({
        label: `F${p.fechaNum}: ${p.localNombre} vs ${p.visitanteNombre}`.slice(0, 100),
        value: p._id,
      })));

    const selMsg = await message.channel.send({
      content: `<@${message.author.id}>, ¿A qué partido corresponde este resultado?`,
      components: [new ActionRowBuilder().addComponents(select)],
    });

    const selFilter = i => i.customId === 'sel_match_submit' && i.user.id === message.author.id;
    const selResp = await selMsg.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
    await selMsg.delete().catch(() => {});

    if (!selResp) {
      await message.delete().catch(() => {});
      return;
    }

    await selResp.deferUpdate().catch(() => {});

    const matchId = selResp.values[0];
    const partido = pendingMatches.find(p => p._id === matchId);

    try {
      const approvalChannel = await client.channels.fetch(process.env.CANAL_APROBACION).catch(() => null);
      if (!approvalChannel) return console.error("Canal de aprobación no encontrado.");

      const allAttachments = [...message.attachments.values()];
      const userNote = message.content?.trim() ? `\n📝 **Nota:** ${message.content}` : '';

      const embed = new EmbedBuilder()
        .setTitle(`📋 Resultado Pendiente — ${tournamentType.charAt(0).toUpperCase() + tournamentType.slice(1)}`)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(
          `**Partido:** ${partido.localNombre} vs ${partido.visitanteNombre}\n` +
          `**Fecha ${partido.fechaNum}** | Reportado por <@${message.author.id}>${userNote}`
        )
        .setColor('Gold')
        .setTimestamp()
        .setFooter({ text: `Liga: ${tournamentType} | ${allAttachments.length} imagen(es)` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprv|${tournamentType}|${matchId}|${message.author.id}`)
          .setLabel('✅ Validar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny|${tournamentType}|${matchId}|${message.author.id}`)
          .setLabel('❌ Denegar')
          .setStyle(ButtonStyle.Danger),
      );

      const files = allAttachments.map(a => a.url);
      await approvalChannel.send({ embeds: [embed], components: [row], files });

      const confirm = await message.channel.send(
        `✅ <@${message.author.id}> Resultado de **${partido.localNombre} vs ${partido.visitanteNombre}** enviado a revisión.`
      );
      setTimeout(() => confirm.delete().catch(() => {}), 8000);
    } catch (error) {
      console.error("Error processing submission:", error);
    }

    return; // ← Fin del flujo de liga
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUPERLIGA / COPAS — Flujo original sin modificar
  // ════════════════════════════════════════════════════════════════════════

  if (tournamentType.startsWith('COPA_')) {
    const prefix = tournamentType.replace('COPA_', '').toLowerCase();
    const torneo = await Torneo.findOne({ prefix, estado: { $ne: 'Finalizado' } });

    const warn = async (text) => {
        try {
          await message.delete();
          const w = await message.channel.send(`<@${message.author.id}>, ${text}`);
          setTimeout(() => w.delete().catch(() => {}), 10000);
        } catch {}
    };

    if (!torneo) return warn('❌ El torneo no está en curso.');
    if (!torneo.equipos.some(e => e.discordId === message.author.id)) return warn('❌ No estás inscrito en este torneo.');
    if (message.attachments.size === 0) return warn('❌ Debes adjuntar la **foto del marcador** para reportar un resultado.');

    const pendingOptions = [];

    // Buscar en grupos
    if (torneo.gruposHabilitados) {
        const matches = (torneo.enfrentamientosGrupos || []).filter(e => 
            !e.completado && 
            (torneo.equipos.find(eq => eq.nombre === e.local)?.discordId === message.author.id ||
             torneo.equipos.find(eq => eq.nombre === e.visitante)?.discordId === message.author.id)
        );
        matches.forEach(m => {
            pendingOptions.push({
                label: `GRUPO: ${m.local} vs ${m.visitante}`.slice(0, 100),
                value: `grupo|${m.local}|${m.visitante}`
            });
        });
    }

    // Buscar en eliminatorias
    if (torneo.fasesEliminatoria?.length > 0) {
        const faseActual = torneo.fasesEliminatoria[torneo.faseActual];
        const llaves = torneo.llaves[faseActual] || [];
        llaves.forEach(ll => {
            if (ll.ganador) return;
            const isEq1 = ll.equipo1?.discordId === message.author.id;
            const isEq2 = ll.equipo2?.discordId === message.author.id;
            if (isEq1 || isEq2) {
                pendingOptions.push({
                    label: `${faseActual.toUpperCase()}: ${ll.equipo1.nombre} vs ${ll.equipo2.nombre}`.slice(0, 100),
                    value: `bracket|${faseActual}|${ll.id}`
                });
            }
        });
    }

    if (!pendingOptions.length) return warn('❌ No tienes partidos pendientes en este torneo.');

    const select = new StringSelectMenuBuilder()
        .setCustomId('sel_generic_submit')
        .setPlaceholder('¿A qué partido corresponde?')
        .addOptions(pendingOptions.slice(0, 25));

    const selMsg = await message.channel.send({
        content: `<@${message.author.id}>, ¿A qué partido corresponde este resultado?`,
        components: [new ActionRowBuilder().addComponents(select)],
    });

    const selFilter = i => i.customId === 'sel_generic_submit' && i.user.id === message.author.id;
    const selResp = await selMsg.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
    await selMsg.delete().catch(() => {});

    if (!selResp) {
        await message.delete().catch(() => {});
        return;
    }
    await selResp.deferUpdate().catch(() => {});

    const [tipo, val1, val2] = selResp.values[0].split('|');
    let displayMatch = '';
    let customId = '';

    if (tipo === 'grupo') {
        displayMatch = `${val1} vs ${val2}`;
        customId = `aprv|torneo|${torneo.prefix}|grupo|${val1}|${val2}|${message.author.id}`;
    } else {
        const fase = val1;
        const llId = val2;
        const ll = torneo.llaves[fase].find(l => l.id === llId);
        displayMatch = `${ll.equipo1.nombre} vs ${ll.equipo2.nombre}`;
        customId = `aprv|torneo|${torneo.prefix}|bracket|${fase}|${llId}|${message.author.id}`;
    }

    try {
        const approvalChannel = await client.channels.fetch(process.env.CANAL_APROBACION).catch(() => null);
        if (!approvalChannel) return console.error("Canal de aprobación no encontrado.");

        const allAttachments = [...message.attachments.values()];
        const userNote = message.content?.trim() ? `\n📝 **Nota:** ${message.content}` : '';

        const embed = new EmbedBuilder()
            .setTitle(`📋 Resultado Pendiente — ${torneo.nombre}`)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(
                `**Partido:** ${displayMatch}\n` +
                `**Fase:** ${tipo === 'grupo' ? 'Grupos' : val1}\n` +
                `Reportado por <@${message.author.id}>${userNote}`
            )
            .setColor('Blue')
            .setTimestamp()
            .setFooter({ text: `Torneo: ${torneo.prefix} | ${allAttachments.length} imagen(es)` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(customId).setLabel('✅ Validar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`deny|torneo|${torneo.prefix}|${message.author.id}`).setLabel('❌ Denegar').setStyle(ButtonStyle.Danger),
        );

        await approvalChannel.send({ embeds: [embed], components: [row], files: allAttachments.map(a => a.url) });

        const confirm = await message.channel.send(`✅ <@${message.author.id}> Resultado de **${displayMatch}** enviado a revisión.`);
        setTimeout(() => confirm.delete().catch(() => {}), 8000);
    } catch (error) {
        console.error("Error in generic tournament submission:", error);
    }

    return;
  }

  if (tournamentType === 'superliga') {
    const { default: Superliga } = await import('../models/superliga/Superliga.js');
    const { default: Supersupercopa } = await import('../models/superliga/Supersupercopa.js');
    const { default: EquipoSuperliga } = await import('../models/superliga/Equipos.js');

    const warn = async (text) => {
      try {
        await message.delete();
        const w = await message.channel.send(`<@${message.author.id}>, ${text}`);
        setTimeout(() => w.delete().catch(() => {}), 10000);
      } catch {}
    };

    // Buscar equipo del jugador (como coach o jugador)
    const equipos = await EquipoSuperliga.find({});
    const miEquipo = equipos.find(e =>
      e.coach.id === message.author.id ||
      e.jugadores.some(j => j.id === message.author.id)
    );
    if (!miEquipo) return warn('❌ No perteneces a ningún equipo de la Superliga.');
    if (message.attachments.size === 0) return warn('❌ Debes adjuntar la **foto del marcador** para reportar un resultado.');

    const eqId = miEquipo._id?.$oid ?? miEquipo._id;
    const eqNombre = miEquipo.nombre;
    const pendingOptions = [];
    let competicion = '';

    // Buscar en Superliga activa
    const superliga = await Superliga.findOne({ actual: true });
    if (superliga && superliga.fechas) {
      superliga.fechas.forEach((f, fi) => f.encuentros.forEach((p, pi) => {
        if (p.finalizado) return;
        if (p.localId === eqId || p.visitanteId === eqId || p.localNombre === eqNombre || p.visitanteNombre === eqNombre) {
          pendingOptions.push({
            label: `SL F${f.numero}: ${p.localNombre} vs ${p.visitanteNombre}`.slice(0, 100),
            description: '⏳ Pendiente',
            value: `sl_${fi}_${pi}`
          });
          competicion = 'Superliga';
        }
      }));
    }

    // Buscar en Supersupercopa activa
    const ssc = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });
    if (ssc) {
      if (ssc.fase === 'grupos') {
        ssc.grupos.forEach((g, gi) => g.fechas.forEach((f, fi) => f.partidos.forEach((p, pi) => {
          if (p.finalizado) return;
          if (p.localId === eqId || p.visitanteId === eqId || p.localNombre === eqNombre || p.visitanteNombre === eqNombre) {
            pendingOptions.push({
              label: `SSC G${g.nombre} F${f.numero}: ${p.localNombre} vs ${p.visitanteNombre}`.slice(0, 100),
              description: '⏳ Pendiente',
              value: `ssc_g_${gi}_${fi}_${pi}`
            });
            competicion = 'Supersupercopa';
          }
        })));
      } else {
        const arr = ssc.fase === 'semifinales' ? ssc.semifinales : (ssc.final ? [ssc.final] : []);
        arr.forEach((p, pi) => {
          if (p.finalizado) return;
          if (p.localId === eqId || p.visitanteId === eqId || p.localNombre === eqNombre || p.visitanteNombre === eqNombre) {
            pendingOptions.push({
              label: `SSC ${ssc.fase}: ${p.localNombre} vs ${p.visitanteNombre}`.slice(0, 100),
              description: '⏳ Pendiente',
              value: `ssc_e_${pi}`
            });
            competicion = 'Supersupercopa';
          }
        });
      }
    }

    if (!pendingOptions.length) return warn('❌ No tienes partidos pendientes.');

    // ... (logic to find miEquipo, competicion, and pendingOptions remains same)

    const select = new StringSelectMenuBuilder()
      .setCustomId('sel_sl_match')
      .setPlaceholder('¿A qué partido corresponde este resultado?')
      .addOptions(pendingOptions.slice(0, 25));

    const selMsg = await message.channel.send({
      content: `<@${message.author.id}>, ¿A qué partido corresponde este resultado?`,
      components: [new ActionRowBuilder().addComponents(select)],
    });

    const selFilter = i => i.customId === 'sel_sl_match' && i.user.id === message.author.id;
    const selResp = await selMsg.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
    if (!selResp) { await selMsg.delete().catch(() => {}); await message.delete().catch(() => {}); return; }
    
    const val = selResp.values[0];
    let partido;
    if (val.startsWith('sl_')) {
      const [, fi, pi] = val.split('_').map(Number);
      partido = superliga.fechas[fi].partidos[pi];
    } else if (val.startsWith('ssc_g_')) {
      const [,, gi, fi, pi] = val.split('_').map(Number);
      partido = ssc.grupos[gi].fechas[fi].partidos[pi];
    } else {
      const [,, pi] = val.split('_').map(Number);
      partido = ssc.fase === 'semifinales' ? ssc.semifinales[pi] : ssc.final;
    }

    // Segundo paso: Seleccionar Duelo
    const duelOptions = partido.duelosIndividuales
      .map((d, di) => ({
        label: `Duelo ${di + 1}: ${d.localJugadorNombre || 'TBD'} vs ${d.visitanteJugadorNombre || 'TBD'}`,
        description: d.finalizado ? '✅ Ya registrado' : '⏳ Pendiente',
        value: `${di}`,
        emoji: d.finalizado ? '✅' : '⏳'
      }))
      .filter(o => o.emoji === '⏳'); // Solo mostrar pendientes

    if (!duelOptions.length) {
      await selMsg.edit({ content: '❌ Todos los duelos de este partido ya han sido reportados.', components: [] });
      setTimeout(() => selMsg.delete().catch(() => {}), 5000);
      return;
    }

    const selectDuel = new StringSelectMenuBuilder()
      .setCustomId('sel_sl_duel')
      .setPlaceholder('¿Qué duelo quieres reportar?')
      .addOptions(duelOptions);

    await selResp.update({
      content: `Has seleccionado **${partido.localNombre} vs ${partido.visitanteNombre}**.\nAhora selecciona el duelo específico:`,
      components: [new ActionRowBuilder().addComponents(selectDuel)],
    });

    const duelFilter = i => i.customId === 'sel_sl_duel' && i.user.id === message.author.id;
    const duelResp = await selMsg.awaitMessageComponent({ filter: duelFilter, time: 60000 }).catch(() => null);
    await selMsg.delete().catch(() => {});

    if (!duelResp) { await message.delete().catch(() => {}); return; }
    await duelResp.deferUpdate().catch(() => {});

    const duelIdx = parseInt(duelResp.values[0]);
    const duelo = partido.duelosIndividuales[duelIdx];
    const displayMatch = `${duelo.localJugadorNombre} vs ${duelo.visitanteJugadorNombre}`;

    try {
      const approvalChannel = await client.channels.fetch(process.env.CANAL_APROBACION).catch(() => null);
      if (!approvalChannel) return console.error("Canal de aprobación no encontrado.");

      const allAttachments = [...message.attachments.values()];
      const userNote = message.content?.trim() ? `\n📝 **Nota:** ${message.content}` : '';

      const embed = new EmbedBuilder()
        .setTitle(`📋 Duelo Pendiente — ${competicion}`)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(
          `**Encuentro:** ${partido.localNombre} vs ${partido.visitanteNombre}\n` +
          `**Duelo:** ${displayMatch} (Duelo ${duelIdx + 1})\n` +
          `Reportado por <@${message.author.id}>${userNote}`
        )
        .setColor('#f1c40f')
        .setTimestamp()
        .setFooter({ text: `${competicion} | Duel ID: ${val}|${duelIdx}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprv|superliga|${val}|${duelIdx}|${message.author.id}`)
          .setLabel('✅ Validar Duelo')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny|superliga|${val}|${duelIdx}|${message.author.id}`)
          .setLabel('❌ Denegar')
          .setStyle(ButtonStyle.Danger),
      );

      await approvalChannel.send({ embeds: [embed], components: [row], files: allAttachments.map(a => a.url) });

      const confirm = await message.channel.send(`✅ <@${message.author.id}> Resultado del duelo **${displayMatch}** enviado a revisión.`);
      setTimeout(() => confirm.delete().catch(() => {}), 8000);
    } catch (error) {
      console.error("Error processing superliga duel submission:", error);
    }
    return;
  }
}