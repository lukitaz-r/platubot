import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import Superliga from '../../models/superliga/Superliga.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarFixtureSuperligaImagen } from '../../utils/visual/fixtureSuperligaGenerator.js';

export default {
  name: 'superliga-fixture',
  aliases: ['sl-fixture', 'slf'],
  desc: 'Muestra el fixture gráfico de la Superliga (Soporta múltiples imágenes)',

  run: async (client, message, args) => {
    const liga = await Superliga.findOne({ actual: true });
    if (!liga) return message.reply('❌ No hay una temporada de Superliga activa.');

    const equiposDB = await EquipoSuperliga.find({});
    
    let currentIdx = 0;
    const nFechaArg = args[0] ? parseInt(args[0]) : null;
    
    if (nFechaArg) {
        currentIdx = liga.fechas.findIndex(f => f.numero === nFechaArg);
        if (currentIdx === -1) currentIdx = 0;
    } else {
        currentIdx = liga.fechas.findIndex(f => (f.partidos ?? f.encuentros).some(p => !p.finalizado));
        if (currentIdx === -1) currentIdx = liga.fechas.length - 1;
    }

    const totalFechas = liga.fechas.length;

    const renderFixtureImages = async (idx) => {
        const fechaObj = liga.fechas[idx];
        const partidos = fechaObj.partidos;
        const attachments = [];

        if (partidos.length <= 2) {
            // Solo 1 imagen
            const buffer = await generarFixtureSuperligaImagen(partidos, fechaObj.numero, liga.temporada, equiposDB, client);
            attachments.push(new AttachmentBuilder(buffer, { name: `fixture-f${fechaObj.numero}.png` }));
        } else {
            // Dividir en 2 imágenes (mitad y mitad)
            const mitad = Math.ceil(partidos.length / 2);
            const p1 = partidos.slice(0, mitad);
            const p2 = partidos.slice(mitad);

            const b1 = await generarFixtureSuperligaImagen(p1, fechaObj.numero, liga.temporada, equiposDB, client, 1, 2);
            const b2 = await generarFixtureSuperligaImagen(p2, fechaObj.numero, liga.temporada, equiposDB, client, 2, 2);

            attachments.push(new AttachmentBuilder(b1, { name: `fixture-f${fechaObj.numero}-p1.png` }));
            attachments.push(new AttachmentBuilder(b2, { name: `fixture-f${fechaObj.numero}-p2.png` }));
        }
        return attachments;
    };

    const getNavRow = (idx) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_f').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
            new ButtonBuilder().setCustomId('info_f').setLabel(`Fecha ${liga.fechas[idx].numero} / ${totalFechas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('next_f').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(idx === totalFechas - 1)
        );
    };

    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando fixture de alta calidad...');

    try {
        const initialAttachments = await renderFixtureImages(currentIdx);
        const mainMsg = await typingMsg.edit({ 
            content: null, 
            files: initialAttachments, 
            components: totalFechas > 1 ? [getNavRow(currentIdx)] : [] 
        });

        if (totalFechas <= 1) return;

        const collector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: '❌ No puedes navegar.', flags: 64 });
            
            await i.deferUpdate();
            if (i.customId === 'prev_f') currentIdx--;
            if (i.customId === 'next_f') currentIdx++;

            const newAttachments = await renderFixtureImages(currentIdx);
            await mainMsg.edit({ files: newAttachments, components: [getNavRow(currentIdx)] });
        });

        collector.on('end', () => mainMsg.edit({ components: [] }).catch(() => {}));

    } catch (error) {
        console.error('Error fixture:', error);
        await typingMsg.edit('❌ Error al generar las imágenes.');
    }
  }
};
