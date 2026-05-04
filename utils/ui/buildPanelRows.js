import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default function buildPanelRows(liga, div) {
  const hasFixture = liga?.partidos?.length > 0;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_fixture_${div}`)
      .setLabel(hasFixture ? '🔄 Re-generar Fixture' : '📅 Generar Fixture')
      .setStyle(hasFixture ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(!liga || liga.jugadores.length < 2),
    new ButtonBuilder()
      .setCustomId(`btn_resultados_${div}`)
      .setLabel('📥 Carga de Resultados')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasFixture),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_jugadores_${div}`)
      .setLabel('👥 Gestionar Jugadores')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId(`btn_stats_${div}`)
      .setLabel('📊 Modificar Estadísticas')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!liga || !liga.jugadores.length),
    new ButtonBuilder()
      .setCustomId(`btn_reglas_${div}`)
      .setLabel('📋 Cambiar Reglas')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!liga),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_nombre_${div}`)
      .setLabel('✏️ Nombre de Liga')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId(`btn_canal_${div}`)
      .setLabel('📺 Cambiar Canal')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId(`btn_borrar_${div}`)
      .setLabel('🗑️ Borrar Temporada')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!liga),
    new ButtonBuilder()
      .setCustomId(`btn_refresh_${div}`)
      .setLabel('🔃 Actualizar Panel')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, row3];
}