import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarFixtureSuperligaImagen } from '../../utils/visual/fixtureSuperligaGenerator.js';

export default {
  name: 'supersupercopa-fixture',
  aliases: ['ssc-fixture', 'sscf'],
  desc: 'Fixture de la Supersupercopa separado por grupos',

  run: async (client, message, args) => {
    const copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });
    if (!copa) return message.reply('❌ No hay Supersupercopa activa.');
    if (copa.fase !== 'grupos') return message.reply('❌ La SSC no está en fase de grupos.');

    const equiposDB = await EquipoSuperliga.find({});
    
    // Encontrar la fecha actual (basada en el Grupo A como referencia)
    const grupoA = copa.grupos[0];
    const grupoB = copa.grupos[1];
    let currentFechaIdx = grupoA.fechas.findIndex(f => (f.partidos ?? f.encuentros).some(p => !p.finalizado));
    if (currentFechaIdx === -1) currentFechaIdx = grupoA.fechas.length - 1;

    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando fixtures...');

    const getAttachments = async (fIdx) => {
      const fechaA = grupoA.fechas[fIdx];
      const fechaB = grupoB.fechas[fIdx];
      
      const imgA = await generarFixtureSuperligaImagen(fechaA.partidos, fechaA.numero, `SSC Grupo A`, equiposDB, client);
      const imgB = await generarFixtureSuperligaImagen(fechaB.partidos, fechaB.numero, `SSC Grupo B`, equiposDB, client);
      
      return [
        new AttachmentBuilder(imgA, { name: 'fixtureA.png' }),
        new AttachmentBuilder(imgB, { name: 'fixtureB.png' })
      ];
    };

    const getRow = (fIdx) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev_f').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(fIdx === 0),
      new ButtonBuilder().setCustomId('info_f').setLabel(`Fecha ${fIdx + 1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('next_f').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(fIdx >= grupoA.fechas.length - 1),
    );

    const mainMsg = await typingMsg.edit({
      content: `🏆 **Supersupercopa — Fixture Fecha ${currentFechaIdx + 1}**`,
      files: await getAttachments(currentFechaIdx),
      components: [getRow(currentFechaIdx)]
    });

    const collector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    
    collector.on('collect', async i => {
      if (i.user.id !== message.author.id) return i.reply({ content: '❌', flags: 64 });
      await i.deferUpdate();

      if (i.customId === 'prev_f') { currentFechaIdx--; }
      else if (i.customId === 'next_f') { currentFechaIdx++; }

      await mainMsg.edit({ 
        content: `🏆 **Supersupercopa — Fixture Fecha ${currentFechaIdx + 1}**`,
        files: await getAttachments(currentFechaIdx), 
        components: [getRow(currentFechaIdx)] 
      });
    });

    collector.on('end', () => mainMsg.edit({ components: [] }).catch(() => {}));
  }
};
