import { AttachmentBuilder } from 'discord.js';
import Segunda from '../../models/Segunda.js';
import { generarTablaImagen } from '../../utils/visual/tablaGenerator.js';

export default {
  name: 'palubi-tabla',
  aliases: ['patabla', 'tablapalubi', 'tablapa'],
  desc: 'Muestra la tabla de posiciones de la Palubi. Uso: !palubi-tabla [temporada]',
  permisos: [],

  run: async (client, message, args) => {
    const ligas = await Segunda.find({}).catch(() => []);
    ligas.sort((a, b) => new Date(b.fechaDeInicio) - new Date(a.fechaDeInicio));

    if (!ligas.length) {
      return message.reply('❌ No hay ninguna temporada registrada en Palubi.');
    }

    let liga = null;

    if (args && args.length > 0) {
      const query = args.join(' ').toLowerCase().trim();
      const num = parseInt(query);

      if (!isNaN(num) && num >= 1 && num <= ligas.length) {
        liga = ligas[ligas.length - num];
      } else {
        liga = ligas.find(l => (l.nombreLiga ?? '').toLowerCase().includes(query));
      }

      if (!liga) {
        return message.reply(`❌ No se encontró ninguna temporada que coincida con **"${args.join(' ')}"**.`);
      }
    } else {
      liga = ligas[0];
    }

    if (!liga.jugadores?.length) {
      return message.reply(`❌ La temporada **${liga.nombreLiga}** no tiene jugadores inscritos.`);
    }

    const loading = await message.reply(`<a:loading:1461897825439711468> Generando tabla de **${liga.nombreLiga}**...`);

    try {
      const pngBuffer = await generarTablaImagen(liga, client, 'segunda');
      const attachment = new AttachmentBuilder(pngBuffer, { name: 'tabla_segunda.png' });
      await loading.edit({ content: '', files: [attachment] });
    } catch (error) {
      console.error('Error generando tabla:', error);
      await loading.edit('❌ Error al generar la tabla de posiciones.');
    }
  },
};
