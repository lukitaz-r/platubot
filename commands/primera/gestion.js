import { ComponentType, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import Primera from '../../models/Primera.js';
import handleReglas from '../../utils/db/handleReglas.js';
import buildPanelEmbed from '../../utils/ui/buildPanelEmbed.js';
import buildPanelRows from '../../utils/ui/buildPanelRows.js';
import handleFixture from '../../utils/db/handleFixture.js';
import handleResultados from '../../utils/db/handleResultados.js';
import handleJugadores from '../../utils/db/handleJugadores.js';
import handleStats from '../../utils/db/handleStats.js';
import handleBorrar from '../../utils/db/handleBorrar.js';
import handleNombre from '../../utils/db/handleNombre.js';

export default {
  name: 'primera-gestion',
  aliases: ['1gestion', 'gestion1'],
  desc: 'Panel de gestión de la Primera División',
  permisos: ['Administrator'],

  run: async (client, message) => {
    const div = 'primera';

    const ligas = await Primera.find({}).catch(() => []);
    ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio));

    if (!ligas.length) {
      return message.reply('❌ No hay temporadas registradas para Primera División.');
    }

    let liga;

    if (ligas.length === 1) {
      liga = ligas[0];
    } else {
      // Selección de temporada
      const select = new StringSelectMenuBuilder()
        .setCustomId('sel_temporada_primera')
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

      const selFilter = i => i.customId === 'sel_temporada_primera' && i.user.id === message.author.id;
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
        'btn_fixture_primera', 'btn_resultados_primera', 'btn_jugadores_primera',
        'btn_stats_primera', 'btn_reglas_primera', 'btn_borrar_primera',
        'btn_refresh_primera', 'btn_nombre_primera',
      ].includes(i.customId) && i.member.permissions.has('Administrator');

    const collector = panelMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: compFilter,
      time: 1800000,
    });

    collector.on('collect', async i => {
      // Recargar la temporada específica por _id
      const todas = await Primera.find({}).catch(() => []);
      const ligaFresh = todas.find(l => String(l._id?.$oid ?? l._id) === ligaId) ?? null;

      switch (i.customId) {
        case 'btn_fixture_primera':
          await handleFixture(i, ligaFresh, panelMsg, div);
          break;

        case 'btn_resultados_primera':
          await handleResultados(i, ligaFresh, div);
          break;

        case 'btn_jugadores_primera':
          await handleJugadores(i, ligaFresh, panelMsg, div);
          break;

        case 'btn_stats_primera':
          await handleStats(i, ligaFresh, div);
          break;

        case 'btn_reglas_primera':
          await handleReglas(i, ligaFresh, panelMsg, div);
          break;

        case 'btn_borrar_primera':
          await handleBorrar(i, panelMsg, div);
          break;

        case 'btn_nombre_primera':
          await handleNombre(i, ligaFresh, panelMsg, div);
          break;

        case 'btn_refresh_primera': {
          const todas2 = await Primera.find({}).catch(() => []);
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
