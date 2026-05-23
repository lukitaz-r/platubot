import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  AttachmentBuilder, 
  ComponentType,
  StringSelectMenuBuilder
} from 'discord.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import JugadorLibre from '../../models/superliga/JugadoresLibres.js';
import { generarImagenMercado } from '../../utils/visual/mercadoGenerator.js';
import { getCardB64 } from '../../utils/visual/cardHelper.js';
import { calcularSalario, calcularValorJugador } from '../../utils/db/mediaCalculator.js';

export default {
  name: 'superliga-mercado',
  aliases: ['sl-mercado', 'slm'],
  desc: 'Muestra el mercado de pases de la Superliga',

  run: async (client, message) => {
    const loading = await message.reply('<a:loading:1461897825439711468> Cargando mercado de pases...');

    const equipos = await EquipoSuperliga.find({});
    const libres = await JugadorLibre.find({});

    const pages = [];

    // Páginas de equipos
    for (const eq of equipos) {
      if (eq.jugadores.length === 0) continue;
      pages.push({
        titulo: eq.nombre,
        escudo: eq.escudo,
        jugadores: eq.jugadores,
        equipoRef: eq
      });
    }

    // Páginas de libres (máx 3 por página para mantener consistencia visual)
    const chunkSize = 3;
    for (let i = 0; i < libres.length; i += chunkSize) {
      const chunk = libres.slice(i, i + chunkSize);
      pages.push({
        titulo: 'Agentes Libres',
        escudo: 'assets/equipos/libre.png', // Escudo por defecto para libres
        jugadores: chunk,
        equipoRef: null
      });
    }

    if (pages.length === 0) {
      return loading.edit('❌ No hay jugadores registrados en el mercado.');
    }

    let currentPage = 0;

    const renderPage = async (pageIdx) => {
      const p = pages[pageIdx];
      const jugadoresData = [];

      for (const j of p.jugadores) {
        const cardB64 = await getCardB64(client, j, p.equipoRef);
        // Usar valores guardados o calcular si no existen
        const valor = j.valor || calcularValorJugador(j.media);
        const salario = calcularSalario(j.media);
        
        jugadoresData.push({
          cardB64,
          valor,
          salario,
          nombre: j.nombre
        });
      }

      const buffer = await generarImagenMercado(p.titulo, p.escudo, jugadoresData);
      return new AttachmentBuilder(buffer, { name: `mercado_${pageIdx}.png` });
    };

    const getComponents = (idx) => {
      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setLabel('◀️ Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === 0),
        new ButtonBuilder()
          .setCustomId('page_info')
          .setLabel(`Página ${idx + 1} / ${pages.length}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('▶️ Siguiente')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === pages.length - 1)
      );

      const menuOptions = pages.slice(0, 25).map((p, i) => ({
        label: p.titulo === 'Agentes Libres' ? `Libres (Pág. ${i + 1})` : p.titulo,
        description: `Ir a la página ${i + 1}`,
        value: i.toString(),
        default: i === idx
      }));

      const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('jump_page')
          .setPlaceholder('Ir a una página específica...')
          .addOptions(menuOptions)
      );

      return [btnRow, menuRow];
    };

    const initialAttach = await renderPage(currentPage);
    const m = await loading.edit({
      content: '',
      files: [initialAttach],
      components: getComponents(currentPage)
    });

    const collector = m.createMessageComponentCollector({
      time: 300000 // 5 minutos
    });

    collector.on('collect', async i => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: '❌ No puedes usar este menú.', flags: 64 });
      }

      await i.deferUpdate();

      if (i.isButton()) {
        if (i.customId === 'prev' && currentPage > 0) currentPage--;
        else if (i.customId === 'next' && currentPage < pages.length - 1) currentPage++;
      } else if (i.isStringSelectMenu()) {
        if (i.customId === 'jump_page') {
          currentPage = parseInt(i.values[0]);
        }
      }

      const attach = await renderPage(currentPage);
      await m.edit({
        files: [attach],
        components: getComponents(currentPage)
      });
    });

    collector.on('end', () => {
      m.edit({ components: [] }).catch(() => {});
    });
  }
};
