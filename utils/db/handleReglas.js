import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import buildPanelEmbed from '../ui/buildPanelEmbed.js';
import buildPanelRows from '../ui/buildPanelRows.js';

export default async function handleReglas(interaction, liga, panelMsg, div) {
  const r = liga.reglas ?? {};
  const modal = new ModalBuilder()
    .setCustomId(`modal_reglas_${div}`)
    .setTitle('Cambiar Reglas de la Temporada');

  const fields = [
    { id: 'campeon', label: 'Puestos → Campeón', val: String(r.puestosCampeon ?? 1) },
    { id: 'ascenso', label: 'Puestos → Libertadubi', val: String(r.puestosAscenso ?? 0) },
    { id: 'promoAscenso', label: 'Puestos → Promoción ascenso', val: String(r.puestosPromocionAscenso ?? 0) },
    { id: 'descenso', label: 'Cantidad de Descensos', val: String(r.cantidadDescenso ?? 0) },

  ];

  if (liga.playoff) {
    fields.push({ id: 'playoff', label: 'Playoff habilitado (true/false)', val: String(liga.playoff?.habilitado ?? false) })
  }

  modal.addLabelComponents(
    ...fields.map(f =>
      new LabelBuilder()
        .setLabel(f.label)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setStyle(TextInputStyle.Short)
            .setValue(f.val)
            .setRequired(true)
        )
    )
  );

  await interaction.showModal(modal);

  const modalFilter = i => i.customId === `modal_reglas_${div}` && i.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
  if (!modalResp) return;

  const gi = key => parseInt(modalResp.fields.getTextInputValue(key)) || 0;
  liga.reglas.puestosCampeon = gi('campeon');
  liga.reglas.puestosAscenso = gi('ascenso');
  liga.reglas.puestosPromocionAscenso = gi('promoAscenso');
  liga.reglas.cantidadDescenso = gi('descenso');
  if (liga.playoff) {
    liga.playoff.habilitado = modalResp.fields.getTextInputValue('playoff').trim().toLowerCase() === 'true';
  }
  await liga.save();

  await panelMsg.edit({ embeds: [buildPanelEmbed(liga, div)], components: buildPanelRows(liga, div) });
  await modalResp.reply({ content: '✅ Reglas actualizadas.', flags: 64 });
}