import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import buildPanelEmbed from '../ui/buildPanelEmbed.js';
import buildPanelRows from '../ui/buildPanelRows.js';
import registrarJugadorGlobal from './registrarJugadorGlobal.js';

export default async function handleJugadores(interaction, liga, panelMsg, div) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_jugadores_agregar').setLabel('➕ Agregar Jugador').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_jugadores_eliminar').setLabel('❌ Eliminar Jugador').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_jugadores_back').setLabel('↩️ Volver').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ content: '**¿Qué deseas hacer con los jugadores?**', components: [row], flags: 64 });

  const filter = i => ['btn_jugadores_agregar', 'btn_jugadores_eliminar', 'btn_jugadores_back'].includes(i.customId) && i.user.id === interaction.user.id;
  const resp = await interaction.channel.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
  if (!resp || resp.customId === 'btn_jugadores_back') return resp?.update({ content: 'Cancelado.', components: [] }).catch(() => {});

  if (resp.customId === 'btn_jugadores_agregar') {
    await resp.update({ content: '**Envía el jugador a agregar con el formato:**\n```\nNombre DiscordID\n```\nTienes 60 segundos.', components: [] });
    const msgFilter = m => m.author.id === interaction.user.id && !m.author.bot;
    const [msgResp] = await new Promise(resolve => {
      const c = interaction.channel.createMessageCollector({ filter: msgFilter, time: 60000, max: 1 });
      c.on('end', collected => resolve([...collected.values()]));
    });
    if (!msgResp) return;

    const parts = msgResp.content.trim().split(/\s+/);
    if (parts.length < 2 || !/^\d{17,20}$/.test(parts[parts.length - 1])) {
      return msgResp.reply({ content: '❌ Formato inválido.' });
    }

    const id = parts[parts.length - 1];
    const nombre = parts.slice(0, -1).join(' ');
    msgResp.delete().catch(() => {});

    if (liga.jugadores.some(j => j.id === id)) {
      return interaction.followUp({ content: '⚠️ El jugador ya está inscrito.', flags: 64 });
    }

    liga.jugadores.push({ nombre, id });
    await liga.save();
    await registrarJugadorGlobal(nombre, id);

    await panelMsg.edit({ embeds: [buildPanelEmbed(liga, div)], components: buildPanelRows(liga, div) });
    interaction.followUp({ content: `✅ **${nombre}** agregado a la ${div.charAt(0).toUpperCase() + div.slice(1)}.`, flags: 64 });

  } else if (resp.customId === 'btn_jugadores_eliminar') {
    if (!liga.jugadores.length) {
      return resp.update({ content: '❌ No hay jugadores para eliminar.', components: [] });
    }

    const opts = liga.jugadores.slice(0, 25).map(j => ({ label: j.nombre, value: j.id }));
    const sel = new StringSelectMenuBuilder()
      .setCustomId('sel_eliminar_jugador')
      .setPlaceholder('Selecciona el jugador a eliminar...')
      .addOptions(opts);

    await resp.update({ content: '**Selecciona el jugador a eliminar:**', components: [new ActionRowBuilder().addComponents(sel)] });

    const selFilter = i => i.customId === 'sel_eliminar_jugador' && i.user.id === interaction.user.id;
    const selResp = await interaction.channel.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
    if (!selResp) return;

    const eliminadoId = selResp.values[0];
    const eliminado = liga.jugadores.find(j => j.id === eliminadoId);
    liga.jugadores = liga.jugadores.filter(j => j.id !== eliminadoId);

    // WO a rivales si hay fixture generado
    let wosOtorgados = 0;
    if (liga.partidos?.length) {
      for (const fecha of liga.partidos) {
        for (const p of fecha.partidos) {
          if (!p.finalizado && (p.localId === eliminadoId || p.visitanteId === eliminadoId)) {
            p.finalizado = true;
            if (p.localId === eliminadoId) {
              p.golesLocal = 0; p.golesVisitante = 3; // W.O. para visitante
            } else {
              p.golesLocal = 3; p.golesVisitante = 0; // W.O. para local
            }
            wosOtorgados++;
          }
        }
      }
    }

    await liga.save();
    await panelMsg.edit({ embeds: [buildPanelEmbed(liga, div)], components: buildPanelRows(liga, div) });

    const woMsg = wosOtorgados ? ` Se otorgaron **${wosOtorgados}** W.O. a los rivales.` : '';
    selResp.update({ content: `✅ **${eliminado.nombre}** eliminado.${woMsg}`, components: [] });
  }
}