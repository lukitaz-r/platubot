import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarFixtureSuperligaImagen } from '../../utils/visual/fixtureSuperligaGenerator.js';

export default {
  name: 'supersupercopa-fixture',
  aliases: ['ssc-fixture', 'sscf'],
  desc: 'Fixture de la Supersupercopa (Grupos y Eliminatorias)',

  run: async (client, message, args) => {
    const copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });
    if (!copa) return message.reply('❌ No hay Supersupercopa activa.');

    const equiposDB = await EquipoSuperliga.find({});
    
    // Preparar las páginas (fechas de grupos + eliminatorias)
    const pages = [];
    
    // 1. Agregar fechas de grupos
    if (copa.grupos && copa.grupos.length >= 2) {
      const grupoA = copa.grupos[0];
      const grupoB = copa.grupos[1];
      const numFechas = grupoA.fechas.length;
      
      for (let i = 0; i < numFechas; i++) {
        pages.push({
          type: 'grupos',
          label: `Fecha ${i + 1}`,
          title: `Supersupercopa — Grupos`,
          fechas: [grupoA.fechas[i], grupoB.fechas[i]]
        });
      }
    }

    // 2. Agregar Semifinales
    if (copa.semifinales && copa.semifinales.length > 0) {
      pages.push({
        type: 'eliminatoria',
        label: 'Semifinales',
        title: `Supersupercopa — Semifinales (Ida y Vuelta)`,
        llaves: copa.semifinales
      });
    }

    // 3. Agregar Final
    if (copa.final) {
      pages.push({
        type: 'eliminatoria',
        label: 'Final',
        title: `Supersupercopa — Gran Final (Ida y Vuelta)`,
        llaves: [copa.final]
      });
    }

    if (pages.length === 0) return message.reply('❌ No hay enfrentamientos cargados en la Supersupercopa.');

    // Determinar la página inicial basada en la fase actual
    let currentIdx = 0;
    if (copa.fase === 'grupos') {
      const grupoA = copa.grupos[0];
      const idx = grupoA.fechas.findIndex(f => (f.partidos || f.encuentros).some(p => !p.finalizado));
      currentIdx = idx !== -1 ? idx : 0;
    } else if (copa.fase === 'semifinales') {
      currentIdx = pages.findIndex(p => p.label === 'Semifinales');
    } else if (copa.fase === 'final' || copa.fase === 'finalizado') {
      currentIdx = pages.findIndex(p => p.label === 'Final');
    }
    if (currentIdx === -1) currentIdx = 0;

    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando fixtures...');

    const getAttachments = async (idx) => {
      const page = pages[idx];
      if (page.type === 'grupos') {
        const imgA = await generarFixtureSuperligaImagen(page.fechas[0].partidos, page.fechas[0].numero, `SSC Grupo A`, equiposDB, client);
        const imgB = await generarFixtureSuperligaImagen(page.fechas[1].partidos, page.fechas[1].numero, `SSC Grupo B`, equiposDB, client);
        return [
          new AttachmentBuilder(imgA, { name: 'fixtureA.png' }),
          new AttachmentBuilder(imgB, { name: 'fixtureB.png' })
        ];
      } else if (page.label === 'Semifinales') {
        // En semis, generamos una imagen por cada llave (como en grupos)
        const attachments = [];
        for (let i = 0; i < page.llaves.length; i++) {
          const ll = page.llaves[i];
          const matches = [ll.ida, ll.vuelta];
          if (ll.desempate) matches.push(ll.desempate);
          
          const img = await generarFixtureSuperligaImagen(matches, `Semi ${i + 1}`, `SSC Semifinal: ${ll.localNombre} vs ${ll.visitanteNombre}`, equiposDB, client);
          attachments.push(new AttachmentBuilder(img, { name: `semi${i + 1}.png` }));
        }
        return attachments;
      } else {
        // Para la final o llaves individuales
        const flattened = [];
        page.llaves.forEach(ll => {
          flattened.push(ll.ida);
          flattened.push(ll.vuelta);
          if (ll.desempate) flattened.push(ll.desempate);
        });
        const img = await generarFixtureSuperligaImagen(flattened, page.label, page.title, equiposDB, client);
        return [new AttachmentBuilder(img, { name: 'fixture.png' })];
      }
    };

    const getRow = (idx) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev_f').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
      new ButtonBuilder().setCustomId('info_f').setLabel(pages[idx].label).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('next_f').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(idx >= pages.length - 1),
    );

    const mainMsg = await typingMsg.edit({
      content: `🏆 **${pages[currentIdx].title} — ${pages[currentIdx].label}**`,
      files: await getAttachments(currentIdx),
      components: [getRow(currentIdx)]
    });

    const collector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    
    collector.on('collect', async i => {
      if (i.user.id !== message.author.id) return i.reply({ content: '❌ Solo quien usó el comando puede navegar.', flags: 64 });
      await i.deferUpdate();

      if (i.customId === 'prev_f') { currentIdx--; }
      else if (i.customId === 'next_f') { currentIdx++; }

      await mainMsg.edit({ 
        content: `🏆 **${pages[currentIdx].title} — ${pages[currentIdx].label}**`,
        files: await getAttachments(currentIdx), 
        components: [getRow(currentIdx)] 
      });
    });

    collector.on('end', () => mainMsg.edit({ components: [] }).catch(() => {}));
  }
};
