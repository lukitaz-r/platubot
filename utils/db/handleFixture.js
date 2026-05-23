import { EmbedBuilder } from "discord.js";
import generarRoundRobin from "../generarRoundRobin.js";
import buildPanelEmbed from "../ui/buildPanelEmbed.js";
import buildPanelRows from "../ui/buildPanelRows.js";

export default async function handleFixture(interaction, liga, panelMsg, div) {
  // Pedir cantidad de vueltas
  const askEmbed = new EmbedBuilder()
    .setTitle('📅 Generar Fixture')
    .setDescription('¿A cuántas vueltas se jugará el torneo?\nEscribe un número (ej: `1`, `2`, `3`) en el chat. Tienes **60 segundos**.')
    .setColor('#2ecc71');

  await interaction.reply({ embeds: [askEmbed]});

  const filter = m => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim());
  const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

  collector.on('collect', async msg => {
    const vueltas = Math.max(1, Math.min(10, parseInt(msg.content.trim())));
    msg.delete().catch(() => {});

    if (liga.jugadores.length < 2) {
      return interaction.followUp({ content: '❌ Se necesitan al menos 2 jugadores.', flags: 64 });
    }

    const fechas = generarRoundRobin(liga.jugadores, vueltas);
    liga.partidos = fechas;
    await liga.save();

    const embed = buildPanelEmbed(liga, div);
    const rows = buildPanelRows(liga, div);
    await panelMsg.edit({ embeds: [embed], components: rows });
    interaction.followUp({ content: `✅ Fixture generado a **${vueltas}** vuelta(s) — ${fechas.length} fechas.` });
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      interaction.followUp({ content: '⏰ Tiempo agotado. No se generó el fixture.', flags: 64 }).catch(() => {});
    }
  });
}