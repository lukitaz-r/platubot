import { EmbedBuilder } from 'discord.js';

export default function buildPanelEmbed(liga, div) {
  const hasFixture = liga?.partidos?.length > 0;
  const jugadores = liga?.jugadores ?? [];
  const reglas = liga?.reglas ?? {};

  let desc = '';
  if (!liga) {
    desc = `⚠️ No hay ninguna temporada activa. Crea una primero con !${div}-temporada.`;
  } else {
    const pendientes = hasFixture
      ? liga.partidos.flatMap(f => Array.isArray(f?.partidos) ? f.partidos : []).filter(p => p && !p.finalizado).length
      : 0;
    desc =
      `**Jugadores inscritos:** ${jugadores.length}\n` +
      `**Fixture:** ${hasFixture ? `✅ Generado (${pendientes} partidos pendientes)` : '❌ No generado'}\n` +
      `**Inicio:** ${liga.fechaDeInicio ? new Date(liga.fechaDeInicio).toLocaleDateString('es-AR') : '—'}\n\n` +
      `**Reglas:**\n` +
      `> 🏆 Campeón: top ${reglas.puestosCampeon ?? 1}\n` +
      `> ⬆️ Ascenso: ${reglas.puestosAscenso ?? 0} | ⬇️ Descenso: ${reglas.cantidadDescenso ?? 0}`;
  }

  return new EmbedBuilder()
    .setTitle(`⚙️ Gestión — ${div.charAt(0).toUpperCase() + div.slice(1)}`)
    .setDescription(desc)
    .setColor('#9b59b6')
    .setFooter({ text: 'Solo admins pueden interactuar con este panel.' })
    .setTimestamp();
}
