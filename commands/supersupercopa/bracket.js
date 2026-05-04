import { AttachmentBuilder } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarFixtureSuperligaImagen } from '../../utils/visual/fixtureSuperligaGenerator.js';

export default {
  name: 'supersupercopa-bracket',
  aliases: ['ssc-bracket', 'sscb'],
  desc: 'Bracket de la Supersupercopa (fase eliminatoria)',

  run: async (client, message) => {
    const copa = await Supersupercopa.findOne({ estadoGlobal: { $ne: 'Inactiva' } });
    if (!copa) return message.reply('❌ No hay Supersupercopa activa.');
    if (copa.fase === 'grupos') return message.reply('❌ La SSC está en fase de grupos. Usa `!ssc-tabla` para ver las tablas.');

    const equiposDB = await EquipoSuperliga.find({});
    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando bracket...');

    const attachments = [];

    if (copa.semifinales.length > 0) {
      const imgSemis = await generarFixtureSuperligaImagen(copa.semifinales, 'Semi', `SSC Semifinales`, equiposDB, client);
      attachments.push(new AttachmentBuilder(imgSemis, { name: 'semis.png' }));
    }

    if (copa.final) {
      const imgFinal = await generarFixtureSuperligaImagen([copa.final], 'Final', `SSC Final`, equiposDB, client);
      attachments.push(new AttachmentBuilder(imgFinal, { name: 'final.png' }));
    }

    if (attachments.length === 0) {
      return typingMsg.edit('❌ No hay enfrentamientos eliminatorios todavía.');
    }

    // Generar texto de estado
    let content = '';
    if (copa.fase === 'finalizado') {
      const winner = copa.final.puntosMiniLocal > copa.final.puntosMiniVisitante ? copa.final.localNombre : copa.final.visitanteNombre;
      content = `🏆 **Campeón: ${winner}**`;
    }

    await typingMsg.edit({ content: content || null, files: attachments });
  }
};
