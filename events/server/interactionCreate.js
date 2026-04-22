import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from 'discord.js';

import Primera from '../../models/Primera.js';
import Segunda from '../../models/Segunda.js';
import Coppa from '../../models/copas/Coppa.js';
import { determinarGanadorLlave } from '../../utils/generarBracket.js';

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

// ── Handler: Aprobar ───────────────────────────────────────────────────────

async function handleAprv(interaction, type, matchId, userId) {
  const Modelo = getModel(type);
  if (!Modelo) return interaction.reply({ content: '❌ Tipo de liga no reconocido.', flags: 64 });

  // Cargar liga para mostrar info en el modal title
  const liga = await getLigaActual(Modelo);
  if (!liga) return interaction.reply({ content: '❌ No se encontró la temporada activa.', flags: 64 });

  const found = findPartido(liga, matchId);
  if (!found) return interaction.reply({ content: '❌ Partido no encontrado en el fixture.', flags: 64 });

  const { partido } = found;

  // Modal para ingresar el marcador
  const modal = new ModalBuilder()
    .setCustomId(`modal_aprv|${type}|${matchId}|${userId}`)
    .setTitle(`Validar: ${partido.localNombre} vs ${partido.visitanteNombre}`.slice(0, 45));

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(`Goles de ${partido.localNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gl')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 2')
          .setRequired(true)
          .setMaxLength(2)
      ),
    new LabelBuilder()
      .setLabel(`Goles de ${partido.visitanteNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gv')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 1')
          .setRequired(true)
          .setMaxLength(2)
      ),
  );

  await interaction.showModal(modal);

  const modalFilter = i =>
    i.customId === `modal_aprv|${type}|${matchId}|${userId}` && i.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
  if (!modalResp) return;

  const gl = parseInt(modalResp.fields.getTextInputValue('gl'));
  const gv = parseInt(modalResp.fields.getTextInputValue('gv'));

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    return modalResp.reply({ content: '❌ Valores inválidos. Ingresa números enteros positivos.', flags: 64 });
  }

  // Recargar la liga (puede haber cambiado)
  const ligaFresh = await getLigaActual(Modelo);
  const target = findPartido(ligaFresh, matchId);
  if (!target) return modalResp.reply({ content: '❌ El partido ya no existe.', flags: 64 });

  target.fecha.partidos[target.idx].golesLocal = gl;
  target.fecha.partidos[target.idx].golesVisitante = gv;
  target.fecha.partidos[target.idx].finalizado = true;
  await ligaFresh.save();

  // Actualizar mensaje de aprobación — deshabilitar botones, cambiar color del embed
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Green')
    .setTitle(`✅ Resultado Validado — ${type.charAt(0).toUpperCase() + type.slice(1)}`)
    .setFooter({ text: `Validado por ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  await modalResp.reply({ content: `✅ Resultado guardado: **${target.partido.localNombre} ${gl} - ${gv} ${target.partido.visitanteNombre}**`, flags: 64 });

  // Notificar en el canal de resultados sin taggear
  const rChId = type === 'primera' ? process.env.CANAL_RESULTADOS_PRIMERA : process.env.CANAL_RESULTADOS_SEGUNDA;
  const rCh = await interaction.client.channels.fetch(rChId).catch(() => null);
  if (rCh) await rCh.send(`✅ Resultado aprobado — **${target.partido.localNombre} ${gl} - ${gv} ${target.partido.visitanteNombre}** (Fecha ${target.fecha.numero})`).catch(() => {});
}

// ── Handler: Denegar ───────────────────────────────────────────────────────

async function handleDeny(interaction, type, matchId, userId) {
  // Actualizar mensaje — deshabilitar botones, marcar rojo
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Red')
    .setTitle(`❌ Resultado Rechazado — ${type.charAt(0).toUpperCase() + type.slice(1)}`)
    .setFooter({ text: `Rechazado por ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  await interaction.reply({ content: `❌ Resultado rechazado.`, flags: 64 });

  // Notificar en el canal de resultados sin taggear
  const rChId = type === 'primera' ? process.env.CANAL_RESULTADOS_PRIMERA : process.env.CANAL_RESULTADOS_SEGUNDA;
  const rCh = await interaction.client.channels.fetch(rChId).catch(() => null);
  if (rCh) await rCh.send(`❌ El resultado enviado fue rechazado por <@${interaction.user.id}>.`).catch(() => {});
}

// ── Evento ─────────────────────────────────────────────────────────────────

export default {
  name: 'interactionCreate',

  run: async (client, interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    if (customId.startsWith('aprv|')) {
      // formato: aprv|tipo|matchId|userId  OR  aprv|coppa|llaveId|tipo|userId
      const parts = customId.split('|');
      const type = parts[1];

      if (type === 'coppa') {
        // formato: aprv|coppa|llaveId|tipo|userId
        const llaveId = parts[2];
        const matchTipo = parts[3];
        const userId = parts[4];
        await handleCoppaAprv(interaction, llaveId, matchTipo, userId);
      } else {
        const userId  = parts[parts.length - 1];
        const matchId = parts.slice(2, -1).join('|');
        await handleAprv(interaction, type, matchId, userId);
      }
      return;
    }

    if (customId.startsWith('deny|')) {
      const parts = customId.split('|');
      const type = parts[1];

      if (type === 'coppa') {
        await handleCoppaDeny(interaction);
      } else {
        const userId  = parts[parts.length - 1];
        const matchId = parts.slice(2, -1).join('|');
        await handleDeny(interaction, type, matchId, userId);
      }
      return;
    }
  },
};

// ── Handler: Coppa Aprobar ─────────────────────────────────────────────────

async function handleCoppaAprv(interaction, llaveId, matchTipo, userId) {
  const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
  if (!coppa) return interaction.reply({ content: '❌ No se encontró la Coppa activa.', flags: 64 });

  const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
  const llave = coppa.llaves[faseActual]?.find(l => l.id === llaveId);
  if (!llave) return interaction.reply({ content: '❌ Llave no encontrada.', flags: 64 });

  // Determine local/visitante names for modal
  const esVuelta = matchTipo === 'vuelta';
  const localNombre = esVuelta ? llave.equipo2.nombre : llave.equipo1.nombre;
  const visitanteNombre = esVuelta ? llave.equipo1.nombre : llave.equipo2.nombre;

  const modal = new ModalBuilder()
    .setCustomId(`modal_coppa_aprv|${llaveId}|${matchTipo}|${userId}`)
    .setTitle(`Validar: ${localNombre} vs ${visitanteNombre}`.slice(0, 45));

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(`Goles de ${localNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gl')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 2')
          .setRequired(true)
          .setMaxLength(2)
      ),
    new LabelBuilder()
      .setLabel(`Goles de ${visitanteNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gv')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 1')
          .setRequired(true)
          .setMaxLength(2)
      ),
  );

  await interaction.showModal(modal);

  const modalFilter = i =>
    i.customId === `modal_coppa_aprv|${llaveId}|${matchTipo}|${userId}` && i.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
  if (!modalResp) return;

  const gl = parseInt(modalResp.fields.getTextInputValue('gl'));
  const gv = parseInt(modalResp.fields.getTextInputValue('gv'));

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    return modalResp.reply({ content: '❌ Valores inválidos.', flags: 64 });
  }

  // Reload coppa
  const coppaFresh = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
  if (!coppaFresh) return modalResp.reply({ content: '❌ La Coppa ya no existe.', flags: 64 });

  const faseFresh = coppaFresh.fasesEliminatoria[coppaFresh.faseActual];
  const llaveFresh = coppaFresh.llaves[faseFresh]?.find(l => l.id === llaveId);
  if (!llaveFresh) return modalResp.reply({ content: '❌ Llave no encontrada.', flags: 64 });

  // Save result
  if (matchTipo === 'ida') {
    llaveFresh.ida.golesLocal = gl;
    llaveFresh.ida.golesVisitante = gv;
    llaveFresh.ida.finalizado = true;
  } else if (matchTipo === 'vuelta') {
    llaveFresh.vuelta.golesLocal = gl;
    llaveFresh.vuelta.golesVisitante = gv;
    llaveFresh.vuelta.finalizado = true;
  } else if (matchTipo === 'desempate') {
    llaveFresh.desempate.golesLocal = gl;
    llaveFresh.desempate.golesVisitante = gv;
    llaveFresh.desempate.finalizado = true;
  }

  // Determine winner
  const ganador = determinarGanadorLlave(llaveFresh);
  if (ganador) llaveFresh.ganador = ganador;

  await coppaFresh.save();

  // Update approval message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Green')
    .setTitle(`✅ Resultado Validado — Coppa (${matchTipo.toUpperCase()})`)
    .setFooter({ text: `Validado por ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  let feedback = `✅ Resultado guardado: **${localNombre} ${gl} - ${gv} ${visitanteNombre}** (${matchTipo})`;
  if (ganador) {
    const ganadorNombre = llaveFresh.equipo1.discordId === ganador
      ? llaveFresh.equipo1.nombre : llaveFresh.equipo2.nombre;
    feedback += `\n🏆 **Ganador de la llave:** ${ganadorNombre}`;
  }

  await modalResp.reply({ content: feedback, flags: 64 });

  // Notify in coppa results channel
  const rChId = process.env.CANAL_RESULTADOS_COPPA;
  const rCh = rChId ? await interaction.client.channels.fetch(rChId).catch(() => null) : null;
  if (rCh) {
    let notif = `✅ Coppa — **${localNombre} ${gl} - ${gv} ${visitanteNombre}** (${matchTipo} — ${faseFresh})`;
    if (ganador) {
      const ganadorNombre = llaveFresh.equipo1.discordId === ganador
        ? llaveFresh.equipo1.nombre : llaveFresh.equipo2.nombre;
      notif += ` | 🏆 ${ganadorNombre} avanza`;
    }
    await rCh.send(notif).catch(() => {});
  }
}

// ── Handler: Coppa Denegar ─────────────────────────────────────────────────

async function handleCoppaDeny(interaction) {
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Red')
    .setTitle(`❌ Resultado Rechazado — Coppa`)
    .setFooter({ text: `Rechazado por ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.reply({ content: '❌ Resultado rechazado.', flags: 64 });

  const rChId = process.env.CANAL_RESULTADOS_COPPA;
  const rCh = rChId ? await interaction.client.channels.fetch(rChId).catch(() => null) : null;
  if (rCh) await rCh.send(`❌ Un resultado de la Coppa fue rechazado por <@${interaction.user.id}>.`).catch(() => {});
}
