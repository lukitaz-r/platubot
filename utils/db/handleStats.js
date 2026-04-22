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
  const sel = new StringSelectMenuBuilder()
    .setCustomId('sel_stats_jugador')
    .setPlaceholder('Selecciona el jugador a editar...')
    .addOptions(opts);

  await interaction.reply({
    content: '**Selecciona el jugador a editar:**',
    components: [new ActionRowBuilder().addComponents(sel)],
    flags: 64,
  });

  const selFilter = i => i.customId === 'sel_stats_jugador' && i.user.id === interaction.user.id;
  const selResp = await interaction.channel.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
  if (!selResp) return;

  const jugId = selResp.values[0];

  // Calcular stats actuales desde los partidos de la liga
  const tabla = calcularTabla(liga);
  const statsActuales = tabla.find(j => j.id === jugId) ?? { pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };

  // También chequear si hay un override previo
  const jugEntry = liga.jugadores.find(j => j.id === jugId);
  const override = jugEntry?.statsOverride ?? null;

  // Prefill: override > calculado
  const pg = String(override?.pg ?? statsActuales.pg);
  const pe = String(override?.pe ?? statsActuales.pe);
  const pp = String(override?.pp ?? statsActuales.pp);
  const gf = String(override?.gf ?? statsActuales.gf);
  const gc = String(override?.gc ?? statsActuales.gc);

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
      .setLabel('Partidos Empatados')
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

  // Guardar override en liga.jugadores
  if (jugEntry) {
    jugEntry.statsOverride = {
      pg: get('pg'),
      pe: get('pe'),
      pp: get('pp'),
      gf: get('gf'),
      gc: get('gc'),
    };
    await liga.save();
  }

  await modalResp.reply({
    content: `✅ Estadísticas de temporada actualizadas para **${jugEntry?.nombre ?? jugId}**.`,
    flags: 64,
  });
}