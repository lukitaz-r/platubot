import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function buildSuperligaEmbed(liga) {
  if (!liga) {
    return new EmbedBuilder()
      .setTitle('⚙️ Gestión — Superliga')
      .setDescription('⚠️ No hay ninguna temporada de Superliga activa.')
      .setColor('#e67e22')
      .setTimestamp();
  }

  const totalPartidos = liga.fechas.flatMap(f => f.partidos ?? f.encuentros).length;
  const pendientes = liga.fechas.flatMap(f => f.partidos ?? f.encuentros).filter(p => !p.finalizado).length;
  
  const desc = 
    `**Temporada:** ${liga.temporada}\n` +
    `**Equipos participando:** ${liga.equipos.length}\n` +
    `**Fixture:** ✅ Generado (${pendientes}/${totalPartidos} pendientes)\n` +
    `**Inicio:** ${liga.fechaInicio ? new Date(liga.fechaInicio).toLocaleDateString('es-AR') : '—'}`;

  return new EmbedBuilder()
    .setTitle(`⚙️ Gestión — Superliga`)
    .setDescription(desc)
    .setColor('#f1c40f')
    .setFooter({ text: 'Panel de control administrativo' })
    .setTimestamp();
}

export function buildSuperligaRows(liga) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sl_resultado')
      .setLabel('📥 Cargar Resultado')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId('btn_sl_equipos')
      .setLabel('👥 Equipos')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sl_editar_equipos')
      .setLabel('📝 Editar Equipos')
      .setStyle(ButtonStyle.Success)
  );
  const hasFixture = liga?.fechas?.length > 0;
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(liga ? 'btn_sl_terminar' : 'btn_sl_nueva')
      .setLabel(liga ? '🏁 Terminar Temporada' : '🆕 Nueva Temporada')
      .setStyle(liga ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('btn_sl_borrar')
      .setLabel('🗑️ Borrar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId('btn_sl_gen_fixture')
      .setLabel('📅 Fixture')
      .setStyle(ButtonStyle.Success)
      .setDisabled(hasFixture),
    new ButtonBuilder()
      .setCustomId('btn_sl_refresh')
      .setLabel('🔃 Actualizar')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}
