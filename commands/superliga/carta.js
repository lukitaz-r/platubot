import { AttachmentBuilder } from 'discord.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarCarta, generarStatsAleatorias } from '../../utils/visual/cardGenerator.js';

export default {
  name: 'superliga-carta',
  aliases: ['sl-carta', 'slc'],
  desc: 'Genera tu carta de jugador o coach de la Superliga',

  run: async (client, message, args) => {
    const query = args.join(' ').toLowerCase();
    const mention = message.mentions.users.first();
    
    // Buscar si es coach o jugador en algún equipo
    const equipos = await EquipoSuperliga.find({});
    let equipoEncontrado = null;
    let datosJugador = null;
    let esCoach = false;
    let targetId = null;

    if (mention) {
        targetId = mention.id;
        for (const eq of equipos) {
            if (eq.coach.id === targetId) { equipoEncontrado = eq; datosJugador = eq.coach; esCoach = true; break; }
            const jug = eq.jugadores.find(j => j.id === targetId);
            if (jug) { equipoEncontrado = eq; datosJugador = jug; esCoach = false; break; }
        }
    } else if (query) {
        let mejorCoincidencia = null;
        let mejorPuntaje = 0;

        for (const eq of equipos) {
            const evaluar = (persona, isC) => {
                if (persona.id === query) return { eq, persona, isC, score: 100 };
                const nombreNorm = persona.nombre.toLowerCase();
                if (nombreNorm === query) return { eq, persona, isC, score: 50 };
                if (nombreNorm.includes(query)) return { eq, persona, isC, score: (query.length / nombreNorm.length) * 40 };
                return null;
            };

            const evalCoach = evaluar(eq.coach, true);
            if (evalCoach && evalCoach.score > mejorPuntaje) { mejorPuntaje = evalCoach.score; mejorCoincidencia = evalCoach; }

            for (const j of eq.jugadores) {
                const evalJug = evaluar(j, false);
                if (evalJug && evalJug.score > mejorPuntaje) { mejorPuntaje = evalJug.score; mejorCoincidencia = evalJug; }
            }
        }

        if (mejorCoincidencia) {
            equipoEncontrado = mejorCoincidencia.eq;
            datosJugador = mejorCoincidencia.persona;
            esCoach = mejorCoincidencia.isC;
            targetId = datosJugador.id;
        }
    } else {
        targetId = message.author.id;
        for (const eq of equipos) {
            if (eq.coach.id === targetId) { equipoEncontrado = eq; datosJugador = eq.coach; esCoach = true; break; }
            const jug = eq.jugadores.find(j => j.id === targetId);
            if (jug) { equipoEncontrado = eq; datosJugador = jug; esCoach = false; break; }
        }
    }

    if (!equipoEncontrado || !targetId) {
        return message.reply(`❌ No se encontró ningún jugador o coach con esa búsqueda.`);
    }

    let targetUser = await client.users.fetch(targetId, { force: true }).catch(() => null);
    const nombreDiscord = targetUser ? targetUser.username : datosJugador.nombre;

    const typingMsg = await message.reply(`<a:loading:1461897825439711468> Generando carta para **${datosJugador.nombre}**...`);

    try {
        const m = datosJugador.mediaInicial || datosJugador.media || 80;
        
        // Si no tiene stats completas, las generamos y guardamos
        if (!datosJugador.stats || Object.keys(datosJugador.stats).length < 6) {
            datosJugador.stats = generarStatsAleatorias(m);
            await equipoEncontrado.save();
        }

        const avatarURL = targetUser ? targetUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 }) : null;
        
        const data = {
            nombre: datosJugador.nombre || nombreDiscord,
            id: targetId,
            avatar: avatarURL,
            media: m, 
            mediaInicial: m,
            pais: datosJugador.pais || 'Argentina',
            escudo: equipoEncontrado.escudo,
            esCoach: esCoach,
            stats: datosJugador.stats
        };

        const imageBuffer = await generarCarta(data);
        const attachment = new AttachmentBuilder(imageBuffer, { name: `carta-${targetId}.png` });

        await typingMsg.edit({ content: `🏆 Aquí tienes la carta de **${nombreDiscord || datosJugador.nombre}**`, files: [attachment] });
    } catch (error) {
        console.error('Error generando carta:', error);
        await typingMsg.edit('❌ Hubo un error al generar la carta gráfica.');
    }
  }
};
