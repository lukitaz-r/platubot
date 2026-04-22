import Primera from '../../models/Primera.js';
import Coppa from '../../models/copas/Coppa.js';
import generarBracket from '../../utils/generarBracket.js';

export default {
  name: 'coppa-crear',
  aliases: ['crearcoppa', 'nuevacoppa'],
  desc: 'Crea una nueva Coppa con los jugadores de la temporada activa de Primera División',
  permisos: ['Administrator'],

  run: async (client, message) => {
    // 1. Verificar que no exista una Coppa activa
    const coppaActiva = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
    if (coppaActiva) {
      return message.reply('❌ Ya existe una **Coppa** en curso. Finalizala o eliminala antes de crear otra.');
    }

    // 2. Verificar que exista una temporada activa de Primera División
    const ligas = await Primera.find({}).catch(() => []);
    ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio));
    const ligaActiva = ligas[0] ?? null;

    if (!ligaActiva || !ligaActiva.jugadores?.length) {
      return message.reply('❌ No hay una temporada activa de **Primera División** con jugadores. Creá una primero con `!primera-temporada`.');
    }

    if (ligaActiva.jugadores.length < 2) {
      return message.reply('❌ Se necesitan al menos **2 jugadores** en Primera División para crear una Coppa.');
    }

    const loading = await message.reply('<a:loading:1461897825439711468> **Generando bracket de la Coppa...**');

    try {
      // 3. Armar equipos desde la Primera
      const equipos = ligaActiva.jugadores.map(j => ({
        nombre: j.nombre,
        discordId: j.id,
      }));

      // 4. Generar bracket
      const bracket = generarBracket(equipos);

      // 5. Crear la Coppa
      const coppa = await Coppa.create({
        nombre: 'Coppa',
        estado: 'EnCurso',
        fasesEliminatoria: bracket.fasesEliminatoria,
        equipos: bracket.equipos,
        llaves: bracket.llaves,
        faseActual: 0,
        createdBy: message.author.id,
      });

      // 6. Resumen
      const faseInicial = bracket.fasesEliminatoria[0];
      const totalMatches = bracket.llaves[faseInicial].length;
      const byeMatches = bracket.llaves[faseInicial].filter(l => l.ganador).length;
      const realMatches = totalMatches - byeMatches;

      let resumen = `🏆 **COPPA creada exitosamente!**\n\n`;
      resumen += `📋 **Participantes:** ${bracket.equipos.length}\n`;
      resumen += `📊 **Fases:** ${bracket.fasesEliminatoria.join(' → ')}\n`;
      resumen += `⚽ **Primera ronda (${faseInicial}):** ${realMatches} partidos reales`;
      if (byeMatches > 0) resumen += ` (${byeMatches} BYE)`;
      resumen += `\n🔄 **Formato:** Ida y vuelta (desempate si empate global)\n\n`;

      // Mostrar llaves de la primera ronda
      resumen += `**📌 Llaves ${faseInicial}:**\n`;
      for (const llave of bracket.llaves[faseInicial]) {
        if (llave.equipo2.discordId === 'BYE') {
          resumen += `> 🟢 **${llave.equipo1.nombre}** — _Pase directo_\n`;
        } else {
          resumen += `> ⚔️ **${llave.equipo1.nombre}** vs **${llave.equipo2.nombre}**\n`;
        }
      }

      resumen += `\n🎮 Usá \`!coppa-bracket\` para ver el bracket visual.`;
      resumen += `\n⚙️ Usá \`!coppa-gestion\` para gestionar resultados.`;

      await loading.edit(resumen);

    } catch (error) {
      console.error('Error creando Coppa:', error);
      await loading.edit('❌ Error al crear la Coppa.');
    }
  },
};
