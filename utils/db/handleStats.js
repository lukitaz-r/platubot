import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import { calcularTabla } from '../visual/tablaGenerator.js';

export default async function handleStats(interaction, liga, div) {
  if (!liga.jugadores.length) {
    return interaction.reply({ content: '❌ No hay jugadores.', flags: 64 });
  }

  const opts = liga.jugadores.slice(0, 25).map(j => ({ label: j.nombre, value: j.id }));
  const selStats = new StringSelectMenuBuilder()
    .setCustomId('sel_stats_jugador')
    .setPlaceholder('Selecciona jugador para editar Stats Generales...')
    .addOptions(opts);

  const selPts = new StringSelectMenuBuilder()
    .setCustomId('sel_pts_jugador')
    .setPlaceholder('Selecciona jugador para editar Puntos (PT)...')
    .addOptions(opts);

  await interaction.reply({
    content: '**¿Qué deseas editar?**',
    components: [
      new ActionRowBuilder().addComponents(selStats),
      new ActionRowBuilder().addComponents(selPts)
    ],
    flags: 64,
  });

  const selFilter = i => (i.customId === 'sel_stats_jugador' || i.customId === 'sel_pts_jugador') && i.user.id === interaction.user.id;
  const selResp = await interaction.channel.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
  if (!selResp) return;

  const jugId = selResp.values[0];
  const isPts = selResp.customId === 'sel_pts_jugador';

  // Calcular stats actuales desde los partidos de la liga
  const tabla = calcularTabla(liga);
  const statsActuales = tabla.find(j => j.id === jugId) ?? { pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };

  // También chequear si hay stats en el modelo
  const jugEntry = liga.jugadores.find(j => j.id === jugId);

  if (isPts) {
    const pts = String(jugEntry?.puntos ?? statsActuales.pts);

    const modal = new ModalBuilder()
      .setCustomId(`modal_pts_${div}_${jugId}`)
      .setTitle(`Puntos — ${jugEntry?.nombre ?? jugId}`.slice(0, 45));

    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel('Puntos (PT)')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('pts').setStyle(TextInputStyle.Short).setValue(pts).setRequired(true).setMaxLength(4)
        )
    );

    await selResp.showModal(modal);

    const modalFilter = i => i.customId === `modal_pts_${div}_${jugId}` && i.user.id === interaction.user.id;
    const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
    if (!modalResp) return;

    if (jugEntry) {
      if (jugEntry.pg === undefined) jugEntry.pg = statsActuales.pg;
      if (jugEntry.pe === undefined) jugEntry.pe = statsActuales.pe;
      if (jugEntry.pp === undefined) jugEntry.pp = statsActuales.pp;
      if (jugEntry.gf === undefined) jugEntry.gf = statsActuales.gf;
      if (jugEntry.gc === undefined) jugEntry.gc = statsActuales.gc;
      if (jugEntry.pj === undefined) jugEntry.pj = statsActuales.pj;
      jugEntry.puntos = parseInt(modalResp.fields.getTextInputValue('pts')) || 0;
      await liga.save();
    }

    await modalResp.reply({
      content: `✅ Puntos actualizados para **${jugEntry?.nombre ?? jugId}**.`,
      flags: 64,
    });

  } else {
    // Prefill: valores del modelo > calculado
    const pg = String(jugEntry?.pg ?? statsActuales.pg);
    const pe = String(jugEntry?.pe ?? statsActuales.pe);
    const pp = String(jugEntry?.pp ?? statsActuales.pp);
    const gf = String(jugEntry?.gf ?? statsActuales.gf);
    const gc = String(jugEntry?.gc ?? statsActuales.gc);

    const modal = new ModalBuilder()
      .setCustomId(`modal_stats_${div}_${jugId}`)
      .setTitle(`Stats Temporada — ${jugEntry?.nombre ?? jugId}`.slice(0, 45));

    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel('Partidos Ganados')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('pg').setStyle(TextInputStyle.Short).setValue(pg).setRequired(true).setMaxLength(3)
        ),
      new LabelBuilder()
        .setLabel('WO')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('pe').setStyle(TextInputStyle.Short).setValue(pe).setRequired(true).setMaxLength(3)
        ),
      new LabelBuilder()
        .setLabel('Partidos Perdidos')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('pp').setStyle(TextInputStyle.Short).setValue(pp).setRequired(true).setMaxLength(3)
        ),
      new LabelBuilder()
        .setLabel('Goles a Favor')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('gf').setStyle(TextInputStyle.Short).setValue(gf).setRequired(true).setMaxLength(3)
        ),
      new LabelBuilder()
        .setLabel('Goles en Contra')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('gc').setStyle(TextInputStyle.Short).setValue(gc).setRequired(true).setMaxLength(3)
        ),
    );

    await selResp.showModal(modal);

    const modalFilter = i => i.customId === `modal_stats_${div}_${jugId}` && i.user.id === interaction.user.id;
    const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
    if (!modalResp) return;

    const get = key => parseInt(modalResp.fields.getTextInputValue(key)) || 0;

    // Guardar stats en liga.jugadores
    if (jugEntry) {
      jugEntry.pg = get('pg');
      jugEntry.pe = get('pe');
      jugEntry.pp = get('pp');
      jugEntry.gf = get('gf');
      jugEntry.gc = get('gc');
      jugEntry.pj = jugEntry.pg + jugEntry.pe + jugEntry.pp;
      if (jugEntry.puntos === undefined) {
        jugEntry.puntos = (jugEntry.pg * 3) - (jugEntry.pe * 2);
      }
      await liga.save();
    }

    await modalResp.reply({
      content: `✅ Estadísticas de temporada actualizadas para **${jugEntry?.nombre ?? jugId}**.`,
      flags: 64,
    });
  }
}