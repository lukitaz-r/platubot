import { AttachmentBuilder } from 'discord.js';
import Coppa from '../../models/copas/Coppa.js';
import { generarBracketImagen } from '../../utils/visual/bracketCoppaGenerator.js';

export default {
  name: 'coppa-bracket',
  aliases: ['coppa', 'bracket', 'bracketcoppa'],
  desc: 'Muestra el bracket de eliminación directa de la Coppa',
  permisos: [],

  run: async (client, message) => {
    const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null)
      ?? await Coppa.findOne({ estado: 'Finalizado' }).catch(() => null);

    if (!coppa) {
      return message.reply('❌ No hay una **Coppa** activa o finalizada. Creá una con `!coppa-crear`.');
    }

    const loading = await message.reply('<a:loading:1461897825439711468> **Generando bracket de la Copa...**');

    try {
      const pngBuffer = await generarBracketImagen(coppa, client);
      const attachment = new AttachmentBuilder(pngBuffer, { name: 'coppa_bracket.png' });
      await loading.edit({ content: '', files: [attachment] });
    } catch (error) {
      console.error('Error generando bracket:', error);
      await loading.edit('❌ Error al generar el bracket de la Coppa.');
    }
  },
};
