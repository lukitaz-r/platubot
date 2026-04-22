import { EmbedBuilder, ComponentType } from 'discord.js';
import Primera from '../../models/Primera.js';
import registrarJugadorGlobal from '../../utils/db/registrarJugadorGlobal.js';

export default {
  name: 'primera-temporada',
  aliases: ['1temporada', 'temporada1', 'nuevatemporada'],
  desc: 'Crea nueva temporada de Primera División con inscripción y playoffs automáticos',
  permisos: ['Administrator'],
  run: async (client, message, args) => {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Nueva Temporada — Primera División')
      .setDescription(
        'Envía los jugadores en mensajes con el formato:\n' +
        '```\nNombre ID\nNombre2 ID2\n```\n' +
        '**Los primeros 18** entran directo a la liga.\n\n' +
        '⏳ Tienes **10 minutos** para enviar todos los inscritos.\n' +
        'Escribe `listo` cuando termines.'
      )
      .setColor('#9b59b6')
      .setFooter({ text: 'Formato: Nombre DiscordID (uno por línea)' });

    await message.reply({ embeds: [embed] });

    // Recoger jugadores de los mensajes
    const inscritos = [];
    const filter = m => m.author.id === message.author.id && !m.author.bot;
    const collector = message.channel.createMessageCollector({ filter, time: 600000 }); // 10 min

    collector.on('collect', async (msg) => {
      const content = msg.content.trim();

      if (content.toLowerCase() === 'listo') {
        collector.stop('done');
        return;
      }

      // Parsear líneas: "Nombre ID" o "Nombre ID"
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) {
          await msg.react('❌');
          continue;
        }

        const id = parts[parts.length - 1]; // Último token = ID
        const nombre = parts.slice(0, -1).join(' '); // Todo antes = nombre

        // Validar que el ID parece un Discord ID (números)
        if (!/^\d{17,20}$/.test(id)) {
          await msg.react('❌');
          continue;
        }

        // Evitar duplicados
        if (inscritos.some(j => j.id === id)) {
          await msg.react('⚠️');
          continue;
        }

        inscritos.push({ nombre, id });
      }

      await msg.react('✅');
      await msg.reply(`📋 Total inscritos hasta ahora: **${inscritos.length}**`);
    });

    collector.on('end', async (collected, reason) => {
      if (inscritos.length < 2) {
        return message.channel.send('❌ Se necesitan al menos 4 jugadores para crear una temporada.');
      }

      const loading = await message.channel.send('<a:loading:1461897825439711468> **Procesando inscripciones...**');

      try {
        // 1. Registro global de todos
        for (const j of inscritos) {
          await registrarJugadorGlobal(j.nombre, j.id);
        }

        // 2. Crear nueva temporada
        const liga = await Primera.create({ fechaDeInicio: new Date() });

        // 3. Primeros 18 → liga
        const directos = inscritos.slice(0, 18);

        // Inscribir directos en la liga
        for (const j of directos) {
          liga.jugadores.push({ nombre: j.nombre, id: j.id });
        }

        await liga.save();

        // 4. Generar resumen
        let resumen = `✅ **Temporada creada exitosamente**\n\n`;
        resumen += `**Inscritos directos (${directos.length}):**\n`;
        directos.forEach((j, i) => {
          resumen += `${i + 1}. ${j.nombre}\n`;
        });

        resumen += `\n📋 Total jugadores: **${liga.jugadores.length}**\n`;
        resumen += `Liga lista para generar fixture con \`!primera-gestion\`.`;

        await loading.edit(resumen);

      } catch (error) {
        console.error('Error en primera-temporada:', error);
        await loading.edit('❌ Error al crear la temporada.');
      }
    });
  }
}