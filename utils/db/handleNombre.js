import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import buildPanelEmbed from '../ui/buildPanelEmbed.js';
import buildPanelRows from '../ui/buildPanelRows.js';

export default async function handleNombre(interaction, liga, panelMsg, div) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_nombre_${div}`)
    .setTitle('Cambiar nombre de la liga');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Nombre de la liga')
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('nombre_liga')
          .setStyle(TextInputStyle.Short)
          .setValue(liga.nombreLiga ?? '')
          .setPlaceholder('Ej: Primera División Platubi')
          .setRequired(true)
          .setMaxLength(60)
      )
  );

  await interaction.showModal(modal);

  const modalFilter = i => i.customId === `modal_nombre_${div}` && i.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 60000 }).catch(() => null);
  if (!modalResp) return;

  liga.nombreLiga = modalResp.fields.getTextInputValue('nombre_liga').trim();
  await liga.save();

  await panelMsg.edit({ embeds: [buildPanelEmbed(liga, div)], components: buildPanelRows(liga, div) });
  await modalResp.reply({ content: `✅ Nombre actualizado a **${liga.nombreLiga}**.`, flags: 64 });
}
