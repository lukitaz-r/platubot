import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} from 'discord.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import JugadorLibre from '../../models/superliga/JugadoresLibres.js';
import Superliga from '../../models/superliga/Superliga.js';
import { registrarMovimiento } from '../../utils/db/registrarMovimiento.js';
import { calcularSalario } from '../../utils/db/mediaCalculator.js';

export default {
  name: 'superliga-rescindir',
  aliases: ['sl-rescindir', 'slr'],
  desc: 'Rescinde el contrato de un jugador (Coach) o el propio (Jugador)',

  run: async (client, message, args) => {
    const allEquipos = await EquipoSuperliga.find({});
    const userId = message.author.id;

    // 1. Determinar rol y equipo del que ejecuta
    const miEquipoComoCoach = allEquipos.find(e => e.coach.id === userId);
    const miEquipoComoJugador = allEquipos.find(e => e.jugadores.some(j => j.id === userId));

    // --- ESCENARIO A: Ejecuta el Coach ---
    if (miEquipoComoCoach) {
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('❌ Debes mencionar al jugador al que le quieres rescindir el contrato.');
      
      const targetId = targetUser.id;
      const indexJugador = miEquipoComoCoach.jugadores.findIndex(j => j.id === targetId);

      if (indexJugador === -1) {
        return message.reply(`❌ **${targetUser.username}** no pertenece a tu equipo.`);
      }

      const jugador = miEquipoComoCoach.jugadores[indexJugador];
      const forzar = args.some(arg => arg.toLowerCase() === 'forzar');

      // Caso A1: Forzar rescisión (con costo 3x salario)
      if (forzar) {
        const salario = calcularSalario(jugador.media);
        const costo = salario * 3;

        if (miEquipoComoCoach.dinero < costo) {
          return message.reply(`❌ No tienes suficiente dinero para forzar la rescisión ($${costo.toLocaleString()} necesarios, tienes $${miEquipoComoCoach.dinero.toLocaleString()}).`);
        }

        // Ejecutar inmediatamente
        miEquipoComoCoach.dinero -= costo;
        const [jugData] = miEquipoComoCoach.jugadores.splice(indexJugador, 1);
        await miEquipoComoCoach.save();

        // Enviar a libres
        await JugadorLibre.create({ ...jugData, exEquipo: miEquipoComoCoach.nombre });

        await registrarMovimiento(miEquipoComoCoach._id?.$oid ?? miEquipoComoCoach._id, {
          tipo: 'Baja',
          jugador: jugData.nombre,
          jugadorId: jugData.id,
          monto: 0,
          equipoRelacionado: 'Agente Libre',
          detalle: `Rescisión FORZOSA por DT (Costo: $${costo.toLocaleString()})`
        });

        return message.reply(`✅ Has forzado la rescisión de **${jugData.nombre}**. Se han descontado **$${costo.toLocaleString()}** (3x salario) de las arcas del club.`);
      }

      // Caso A2: Rescisión por mutuo acuerdo (requiere confirmación del jugador)
      const embedConfirm = new EmbedBuilder()
        .setTitle('⚠️ Propuesta de Rescisión de Contrato')
        .setDescription(
          `El coach de **${miEquipoComoCoach.nombre}** te ha propuesto rescindir tu contrato por mutuo acuerdo.\n\n` +
          `Si aceptas, quedarás como **Agente Libre** inmediatamente.\n` +
          `¿Aceptas la rescisión?`
        )
        .setColor('#f1c40f')
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('acc_rescindir').setLabel('✅ Aceptar y salir').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rej_rescindir').setLabel('❌ Rechazar y quedarme').setStyle(ButtonStyle.Secondary)
      );

      const msgJugador = await targetUser.send({ embeds: [embedConfirm], components: [row] }).catch(() => null);
      if (!msgJugador) return message.reply('❌ El jugador tiene los DMs cerrados. No se pudo enviar la propuesta de rescisión.');

      message.reply(`⏳ Propuesta de rescisión enviada a **${jugador.nombre}**. Esperando su respuesta...`);

      const collector = msgJugador.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });

      collector.on('collect', async i => {
        await i.deferUpdate();
        if (i.customId === 'rej_rescindir') {
          await i.editReply({ content: '❌ Has rechazado la rescisión de contrato.', embeds: [], components: [] });
          return message.author.send(`❌ **${jugador.nombre}** ha rechazado la propuesta de rescisión.`).catch(() => {});
        }

        // Ejecutar rescisión por acuerdo
        const freshEq = await EquipoSuperliga.findOne({ _id: miEquipoComoCoach._id });
        const idx = freshEq.jugadores.findIndex(j => j.id === targetId);
        if (idx === -1) return i.editReply({ content: '❌ Ya no perteneces a este equipo.', components: [] });

        const [jData] = freshEq.jugadores.splice(idx, 1);
        await freshEq.save();

        await JugadorLibre.create({ ...jData, exEquipo: freshEq.nombre });

        await registrarMovimiento(freshEq._id?.$oid ?? freshEq._id, {
          tipo: 'Baja',
          jugador: jData.nombre,
          jugadorId: jData.id,
          monto: 0,
          equipoRelacionado: 'Agente Libre',
          detalle: 'Rescisión por mutuo acuerdo'
        });

        await i.editReply({ content: `✅ Has rescindido tu contrato con **${freshEq.nombre}**. Ahora eres Agente Libre.`, embeds: [], components: [] });
        await message.author.send(`✅ **${jData.nombre}** ha aceptado la rescisión y ahora es Agente Libre.`).catch(() => {});
        collector.stop();
      });

      return;
    }

    // --- ESCENARIO B: Ejecuta el Jugador (sobre sí mismo) ---
    if (miEquipoComoJugador) {
      const jugador = miEquipoComoJugador.jugadores.find(j => j.id === userId);
      const forzar = args.some(arg => arg.toLowerCase() === 'forzar');

      if (forzar) {
        // Caso B1: Forzar rescisión (con suspensión)
        const liga = await Superliga.findOne({ actual: true });
        const suspension = liga ? Math.ceil(liga.fechas.length / 2) : 5;

        // Ejecutar inmediatamente
        const [jData] = miEquipoComoJugador.jugadores.splice(miEquipoComoJugador.jugadores.findIndex(j => j.id === userId), 1);
        await miEquipoComoJugador.save();

        // Enviar a libres con suspensión
        await JugadorLibre.create({ 
          ...jData, 
          exEquipo: miEquipoComoJugador.nombre,
          suspendido: suspension 
        });

        await registrarMovimiento(miEquipoComoJugador._id?.$oid ?? miEquipoComoJugador._id, {
          tipo: 'Baja',
          jugador: jData.nombre,
          jugadorId: jData.id,
          monto: 0,
          equipoRelacionado: 'Agente Libre',
          detalle: `Rescisión FORZOSA por Jugador (Suspensión: ${suspension} fechas)`
        });

        return message.reply(`✅ Has forzado tu rescisión con **${miEquipoComoJugador.nombre}**. Serás Agente Libre pero quedarás **suspendido por ${suspension} fechas**.`);
      }

      // Caso B2: Pedir rescisión al DT
      const coachUser = await client.users.fetch(miEquipoComoJugador.coach.id).catch(() => null);
      if (!coachUser) return message.reply('❌ No se pudo contactar con el DT de tu equipo.');

      const embedCoach = new EmbedBuilder()
        .setTitle('⚠️ Solicitud de Rescisión de Contrato')
        .setDescription(
          `El jugador **${jugador.nombre}** (<@${userId}>) solicita rescindir su contrato con **${miEquipoComoJugador.nombre}** por mutuo acuerdo.\n\n` +
          `¿Aceptas dejarlo ir libre?`
        )
        .setColor('#3498db')
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('acc_rescindir_p').setLabel('✅ Aceptar rescisión').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rej_rescindir_p').setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger)
      );

      const msgCoach = await coachUser.send({ embeds: [embedCoach], components: [row] }).catch(() => null);
      if (!msgCoach) return message.reply('❌ El DT tiene los DMs cerrados. No se pudo enviar la solicitud.');

      message.reply(`⏳ Solicitud enviada a tu DT (**${miEquipoComoJugador.coach.nombre}**). Esperando su aprobación...`);

      const collector = msgCoach.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });

      collector.on('collect', async i => {
        await i.deferUpdate();
        if (i.customId === 'rej_rescindir_p') {
          await i.editReply({ content: '❌ Has rechazado la solicitud de rescisión.', embeds: [], components: [] });
          const u = await client.users.fetch(userId).catch(() => null);
          return u?.send(`❌ Tu DT ha rechazado tu solicitud de rescisión en **${miEquipoComoJugador.nombre}**.`).catch(() => {});
        }

        // Ejecutar rescisión por acuerdo
        const freshEq = await EquipoSuperliga.findOne({ _id: miEquipoComoJugador._id });
        const idx = freshEq.jugadores.findIndex(j => j.id === userId);
        if (idx === -1) return i.editReply({ content: '❌ El jugador ya no pertenece al equipo.', components: [] });

        const [jData] = freshEq.jugadores.splice(idx, 1);
        await freshEq.save();

        await JugadorLibre.create({ ...jData, exEquipo: freshEq.nombre });

        await registrarMovimiento(freshEq._id?.$oid ?? freshEq._id, {
          tipo: 'Baja',
          jugador: jData.nombre,
          jugadorId: jData.id,
          monto: 0,
          equipoRelacionado: 'Agente Libre',
          detalle: 'Rescisión por mutuo acuerdo (Pedido por jugador)'
        });

        await i.editReply({ content: `✅ Has aceptado la rescisión de **${jData.nombre}**. Ahora es Agente Libre.`, embeds: [], components: [] });
        const u = await client.users.fetch(userId).catch(() => null);
        await u?.send(`✅ Tu DT ha aceptado la rescisión. Ahora eres Agente Libre.`).catch(() => {});
        collector.stop();
      });

      return;
    }

    return message.reply('❌ No eres coach ni jugador de ningún equipo de la Superliga.');
  }
};
