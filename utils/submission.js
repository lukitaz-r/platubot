import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";

import Primera from "../models/Primera.js";
import Segunda from "../models/Segunda.js";
import Torneo from "../models/copas/Torneo.js";
import Coppa from "../models/copas/Coppa.js";
import { determinarGanadorLlave } from "./generarBracket.js";

export default async function submission(client, message) {

  // ── Detectar canal y tipo de torneo ───────────────────────────────────
  const ligaChannels = {
    [process.env.CANAL_RESULTADOS_PRIMERA]: 'primera',
    [process.env.CANAL_RESULTADOS_SEGUNDA]: 'segunda',
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
  // PRIMERA / SEGUNDA — Flujo con selección de partido + aprobación
  // ════════════════════════════════════════════════════════════════════════

  if (tournamentType === 'primera' || tournamentType === 'segunda') {
    const ModeloLiga = tournamentType === 'primera' ? Primera : Segunda;
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

    const pendingMatches = liga.partidos.flatMap(f =>
      f.partidos
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

  let fixturesLoaded = false;
  let isParticipant = false;

  try {
    if (tournamentType.startsWith('COPA_')) {
      const prefix = tournamentType.replace('COPA_', '').toLowerCase();
      const torneo = await Torneo.findOne({ prefix, estado: { $ne: 'Finalizado' } });
      if (torneo) {
        const hasFixture = (torneo.enfrentamientosGrupos?.length > 0) || (torneo.llaves && torneo.llaves.size > 0);
        if (hasFixture) fixturesLoaded = true;
        if (torneo.equipos.some(e => e.discordId === message.author.id)) {
          isParticipant = true;
        }
      }
    } else if (tournamentType === 'superliga') {
      const { default: Superliga } = await import('../models/superliga/Superliga.js');
      const { default: Supersupercopa } = await import('../models/superliga/Supersupercopa.js');

      const superliga = await Superliga.findOne({ actual: true });
      if (superliga && superliga.fechas) {
        const fechaActual = superliga.fechas.find(f => f.encuentros.some(e => !e.finalizado));
        if (fechaActual) {
          fixturesLoaded = true;
          const tieneDueloSL = fechaActual.encuentros.some(enc =>
            !enc.finalizado && enc.localAlineado && enc.visitanteAlineado &&
            enc.duelosIndividuales.some(d => !d.ganadorId && (d.jugadorLocalId === message.author.id || d.jugadorVisitanteId === message.author.id))
          );
          if (tieneDueloSL) isParticipant = true;
        }
      }

      if (!isParticipant) {
        const copa = await Supersupercopa.findOne({ estadoGlobal: { $in: ['Cuartos', 'Semifinales', 'Final'] } });
        if (copa) {
          fixturesLoaded = true;
          const llaves = copa.estadoGlobal === 'Cuartos' ? copa.cuartos : (copa.estadoGlobal === 'Semifinales' ? copa.semifinales : [copa.final]);
          const tieneDueloCopa = llaves.some(llave => {
            if (llave.estado === 'Finalizada') return false;
            const enc = llave.estado === 'Ida' ? llave.ida : (llave.estado === 'Vuelta' ? llave.vuelta : llave.desempate);
            if (!enc || enc.finalizado || !enc.localAlineado || !enc.visitanteAlineado) return false;
            return enc.duelosIndividuales.some(d => !d.ganadorId && (d.jugadorLocalId === message.author.id || d.jugadorVisitanteId === message.author.id));
          });
          if (tieneDueloCopa) isParticipant = true;
        }
      }
    }
  } catch (err) {
    console.error("Error checking fixtures:", err);
  }

  if (!fixturesLoaded) {
    try {
      await message.delete();
      const warning = await message.channel.send(`<@${message.author.id}>, ❌ No se pueden reportar resultados porque los fixtures aún no han sido generados para este torneo.`);
      setTimeout(() => warning.delete().catch(() => {}), 10000);
    } catch (e) {}
    return;
  }

  if (!isParticipant) {
    try {
      await message.delete();
      const warning = await message.channel.send(`<@${message.author.id}>, ❌ No estás inscrito en este torneo.`);
      setTimeout(() => warning.delete().catch(() => {}), 10000);
    } catch (e) {}
    return;
  }

  if (message.attachments.size === 0) {
    try {
      await message.delete();
      const warning = await message.channel.send(`<@${message.author.id}>, ❌ Para reportar un resultado debes adjuntar la FOTO del marcador.`);
      setTimeout(() => warning.delete().catch(() => {}), 10000);
    } catch (e) {
      console.error("Error managing invalid submission:", e);
    }
    return;
  }

  try {
    const APPROVAL_CHANNEL_ID = process.env.CANAL_APROBACION;
    const approvalChannel = await client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
    if (!approvalChannel) return console.error("Approval channel not found.");

    const allAttachments = [...message.attachments.values()];
    const userNote = message.content ? `\n**Nota:** ${message.content}` : '';

    const embed = new EmbedBuilder()
      .setTitle(`Reporte de Resultado: ${tournamentType}`)
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(`El usuario <@${message.author.id}> ha enviado un resultado.${userNote}`)
      .setColor('Gold')
      .setTimestamp()
      .setFooter({ text: `ID Usuario: ${message.author.id} | ${allAttachments.length} imagen(es)` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_approve_res_${tournamentType}_${message.author.id}`)
        .setLabel('✅ Validar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`btn_deny_res_${tournamentType}_${message.author.id}`)
        .setLabel('❌ Denegar')
        .setStyle(ButtonStyle.Danger)
    );

    const files = allAttachments.map(a => a.url);
    await approvalChannel.send({ embeds: [embed], components: [row], files });

    const confirm = await message.channel.send(`✅ <@${message.author.id}> Resultado enviado a revisión (${allAttachments.length} imagen(es)).`);
    setTimeout(() => confirm.delete().catch(() => {}), 5000);

  } catch (error) {
    console.error("Error processing submission:", error);
  }
}