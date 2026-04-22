import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import buildPanelEmbed from '../ui/buildPanelEmbed.js';
import buildPanelRows from '../ui/buildPanelRows.js';

export default async function handleBorrar(interaction, panelMsg, div) {
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_borrar_confirmar').setLabel('✅ Sí, borrar temporada').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_borrar_cancelar').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: '⚠️ **¿Estás seguro?** Esta acción eliminará la temporada actual de ' + div.charAt(0).toUpperCase() + div.slice(1) + ' permanentemente.',
    components: [confirmRow],
    flags: 64,
  });

  const filter = i => ['btn_borrar_confirmar', 'btn_borrar_cancelar'].includes(i.customId) && i.user.id === interaction.user.id;
  const resp = await interaction.channel.awaitMessageComponent({ filter, time: 30000 }).catch(() => null);
  if (!resp || resp.customId === 'btn_borrar_cancelar') {
    return resp?.update({ content: 'Cancelado.', components: [] }).catch(() => {});
  }

  const liga = await Primera.findOne({});
  if (liga) await Primera.deleteOne({ _id: liga._id });

  const embed = buildPanelEmbed(null, div);
  await panelMsg.edit({ embeds: [embed], components: buildPanelRows(null, div) });
  resp.update({ content: '🗑️ Temporada eliminada correctamente.', components: [] });
}
