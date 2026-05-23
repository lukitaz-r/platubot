import { ComponentType, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import Segunda from '../../models/Segunda.js';
import handleReglas from '../../utils/db/handleReglas.js';
import buildPanelEmbed from '../../utils/ui/buildPanelEmbed.js';
import buildPanelRows from '../../utils/ui/buildPanelRows.js';
import handleFixture from '../../utils/db/handleFixture.js';
import handleResultados from '../../utils/db/handleResultados.js';
import handleJugadores from '../../utils/db/handleJugadores.js';
import handleStats from '../../utils/db/handleStats.js';
import handleBorrar from '../../utils/db/handleBorrar.js';
import handleNombre from '../../utils/db/handleNombre.js';
import handleCanal from '../../utils/db/handleCanal.js';

export default {
  name: 'palubi-gestion',
  aliases: ['palubig', 'gestionpalubi'],
  desc: 'Panel de gestión de la Palubi',
  permisos: ['Administrator'],

  run: async (client, message) => {
    const div = 'segunda';

    const ligas = await Segunda.find({}).catch(() => []);
    ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio));

    if (!ligas.length) {
      return message.reply('❌ No hay temporadas registradas para Palubi.');
    }

    let liga;

    if (ligas.length === 1) {
      liga = ligas[0];
    } else {
      const select = new StringSelectMenuBuilder()
        .setCustomId('sel_temporada_segunda')
        .setPlaceholder('Selecciona la temporada a gestionar...')
        .addOptions(ligas.slice(0, 25).map((l, i) => ({
          label: (l.nombreLiga ?? `Temporada ${i + 1}`).slice(0, 100),
          description: new Date(l.fechaDeInicio).toLocaleDateString('es-AR'),
          value: String(l._id?.$oid ?? l._id),
        })));

      const selMsg = await message.reply({
        content: '**¿Qué temporada querés gestionar?**',
        components: [new ActionRowBuilder().addComponents(select)],
      });

      const selFilter = i => i.customId === 'sel_temporada_segunda' && i.user.id === message.author.id;
      const selResp = await selMsg.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
      await selMsg.delete().catch(() => {});

      if (!selResp) return;
      await selResp.deferUpdate().catch(() => {});

      const ligaId = selResp.values[0];
      liga = ligas.find(l => String(l._id?.$oid ?? l._id) === ligaId);
    }

    const ligaId = String(liga._id?.$oid ?? liga._id);

    const embed = buildPanelEmbed(liga, div);
    const rows = buildPanelRows(liga, div);
    const panelMsg = await message.reply({ embeds: [embed], components: rows });

    const compFilter = i =>
      [
        'btn_fixture_segunda', 'btn_resultados_segunda', 'btn_jugadores_segunda',
        'btn_stats_segunda', 'btn_reglas_segunda', 'btn_borrar_segunda',
        'btn_refresh_segunda', 'btn_nombre_segunda', 'btn_canal_segunda',
      ].includes(i.customId) && i.member.permissions.has('Administrator');

    const collector = panelMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: compFilter,
      time: 1800000,
    });

    collector.on('collect', async i => {
      const todas = await Segunda.find({}).catch(() => []);
      const ligaFresh = todas.find(l => String(l._id?.$oid ?? l._id) === ligaId) ?? null;

      switch (i.customId) {
        case 'btn_fixture_segunda': await handleFixture(i, ligaFresh, panelMsg, div); break;
        case 'btn_resultados_segunda': await handleResultados(i, ligaFresh, div); break;
        case 'btn_jugadores_segunda': await handleJugadores(i, ligaFresh, panelMsg, div); break;
        case 'btn_stats_segunda': await handleStats(i, ligaFresh, div); break;
        case 'btn_reglas_segunda': await handleReglas(i, ligaFresh, panelMsg, div); break;
        case 'btn_borrar_segunda': await handleBorrar(i, panelMsg, div); break;
        case 'btn_nombre_segunda': await handleNombre(i, ligaFresh, panelMsg, div); break;
        case 'btn_canal_segunda': await handleCanal(i, ligaFresh, div); break;
        case 'btn_refresh_segunda': {
          const todas2 = await Segunda.find({}).catch(() => []);
          const ligaR = todas2.find(l => String(l._id?.$oid ?? l._id) === ligaId) ?? null;
          await panelMsg.edit({ embeds: [buildPanelEmbed(ligaR, div)], components: buildPanelRows(ligaR, div) });
          await i.reply({ content: '🔃 Panel actualizado.', flags: 64 });
          break;
        }
      }
    });

    collector.on('end', () => {
      panelMsg.edit({ components: [] }).catch(() => {});
    });
  },
};
