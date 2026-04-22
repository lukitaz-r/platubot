import { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export default async function handleResultados(interaction, liga, div) {
  const partidos = liga.partidos.flatMap(f =>
    Array.isArray(f?.partidos) ? f.partidos.filter(p => p && !p.finalizado).map(p => ({ ...p, fechaNum: f.numero })) : []
  ).slice(0, 25);

  if (!partidos.length) {
    return interaction.reply({ content: '✅ No hay partidos pendientes.', flags: 64 });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`sel_resultado_${div}`)
    .setPlaceholder('Selecciona el partido a cargar...')
    .addOptions(partidos.map(p => ({
      label: `F${p.fechaNum}: ${p.localNombre} vs ${p.visitanteNombre}`.slice(0, 100),
      description: p.imagenResultado ? '📷 Tiene imagen adjunta' : '📷 Sin imagen aún',
      value: p._id,
    })));

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: '**Selecciona el partido a cargar:**', components: [row], flags: 64 });

  const selFilter = i => i.customId === `sel_resultado_${div}` && i.user.id === interaction.user.id;
  const selResp = await interaction.channel.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
  if (!selResp) return;

  const partidoId = selResp.values[0];
  const partido = partidos.find(p => p._id === partidoId);

  // Modal para ingresar el resultado
  const modal = new ModalBuilder()
    .setCustomId(`modal_resultado_${div}_${partidoId}`)
    .setTitle(`${partido.localNombre} vs ${partido.visitanteNombre}`);

  const inputLocal = new TextInputBuilder()
    .setCustomId('input_goles_local')
    .setLabel(`Goles de ${partido.localNombre}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ej: 2')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  const inputVisitante = new TextInputBuilder()
    .setCustomId('input_goles_visitante')
    .setLabel(`Goles de ${partido.visitanteNombre}`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ej: 1')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputLocal),
    new ActionRowBuilder().addComponents(inputVisitante),
  );

  await selResp.showModal(modal);

  const modalFilter = i => i.customId === `modal_resultado_${div}_${partidoId}` && i.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
  if (!modalResp) return;

  const gl = parseInt(modalResp.fields.getTextInputValue('input_goles_local'));
  const gv = parseInt(modalResp.fields.getTextInputValue('input_goles_visitante'));

  if (isNaN(gl) || isNaN(gv)) {
    return modalResp.reply({ content: '❌ Valores inválidos. Ingresa solo números.', flags: 64 });
  }

  // Guardar resultado en el JSON
  const fechaIdx = liga.partidos.findIndex(f => f.partidos.some(p => p._id === partidoId));
  const partIdx = liga.partidos[fechaIdx].partidos.findIndex(p => p._id === partidoId);
  liga.partidos[fechaIdx].partidos[partIdx].golesLocal = gl;
  liga.partidos[fechaIdx].partidos[partIdx].golesVisitante = gv;
  liga.partidos[fechaIdx].partidos[partIdx].finalizado = true;
  await liga.save();

  const p = liga.partidos[fechaIdx].partidos[partIdx];
  const imgLine = p.imagenResultado ? `\n📷 [Ver imagen del resultado](${p.imagenResultado})` : '';

  await modalResp.reply({
    content: `✅ Resultado cargado: **${p.localNombre} ${gl} - ${gv} ${p.visitanteNombre}**${imgLine}`,
    flags: 64,
  });
}