import { AttachmentBuilder, SlashCommandBuilder, ActionRowBuilder } from 'discord.js';
import Coppa from '../../models/copas/Coppa.js';
import { generarFixtureImagen } from '../../utils/visual/fixtureGenerator.js';
import { buildFixtureNavigation } from '../../utils/ui/fixtureNavigation.js';

export default {
  name: 'coppa-fixture',
  aliases: ['fixturecoppa'],
  desc: 'Muestra los enfrentamientos de la fase actual de la Coppa',
  permisos: [],

  data: new SlashCommandBuilder()
    .setName('coppa-fixture')
    .setDescription('Muestra los enfrentamientos de la fase actual de la Coppa'),

  execute: async (client, interaction) => {
    await interaction.deferReply();
    const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
    if (!coppa) return interaction.editReply('❌ No hay una **Coppa** en curso.');
    await sendFixture(client, interaction, coppa);
  },

  run: async (client, message) => {
    const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
    if (!coppa) return message.reply('❌ No hay una **Coppa** en curso.');
    await sendFixture(client, message, coppa);
  },
};

async function sendFixture(client, context, coppa) {
    const labels = coppa.fasesEliminatoria;
    const currentIdx = coppa.faseActual;

    await renderAndSendFixtureCoppa(client, context, coppa, currentIdx, labels);
}

async function renderAndSendFixtureCoppa(client, context, coppa, phaseIdx, labels, existingMsg = null) {
    const faseActual = labels[phaseIdx];
    const llaves = coppa.llaves[faseActual] || [];

    if (!llaves.length) {
        const msg = `❌ No hay llaves registradas para la fase **${faseActual}**.`;
        return existingMsg ? existingMsg.edit({ content: msg, components: [] }) : (context.editReply ? context.editReply(msg) : context.reply(msg));
    }

    const partidosRender = await Promise.all(llaves.map(async l => {
        const user1 = await client.users.fetch(l.equipo1.discordId).catch(() => null);
        const user2 = await client.users.fetch(l.equipo2.discordId).catch(() => null);
        
        let resText = 'Pendiente';
        if (l.ganador) {
            const idaStr = l.ida.finalizado ? `${l.ida.golesLocal}-${l.ida.golesVisitante}` : '?-?';
            const vueltaStr = l.vuelta.finalizado ? `${l.vuelta.golesLocal}-${l.vuelta.golesVisitante}` : '?-?';
            resText = `${idaStr} / ${vueltaStr}`;
            if (l.desempate?.finalizado) resText += ` (D: ${l.desempate.golesLocal}-${l.desempate.golesVisitante})`;
        } else if (l.ida.finalizado) {
            resText = `${l.ida.golesLocal}-${l.ida.golesVisitante} (Ida)`;
        }

        const ganadorNombre = l.ganador 
            ? (l.ganador === l.equipo1.discordId ? l.equipo1.nombre : l.equipo2.nombre)
            : null;

        return {
            local: l.equipo1.nombre,
            visitante: l.equipo2.nombre,
            resultado: resText,
            ganador: ganadorNombre,
            avatarL: user1?.displayAvatarURL({ extension: 'png' }),
            avatarV: user2?.displayAvatarURL({ extension: 'png' }),
            ida: l.ida,
            vuelta: l.vuelta,
            desempate: l.desempate
        };
    }));

    const buffer = await generarFixtureImagen({
        titulo: `Coppa — ${faseActual}`,
        subtitulo: 'Fase Eliminatoria',
        partidos: partidosRender,
        tema: coppa.tema
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'fixture_coppa.png' });
    const content = `📅 **Fixture: Coppa — ${faseActual}**`;
    const components = buildFixtureNavigation('coppa', phaseIdx, labels.length, labels);

    let msg;
    if (existingMsg) {
        msg = await existingMsg.edit({ content, files: [attachment], components });
    } else if (context.editReply) {
        msg = await context.editReply({ content, files: [attachment], components });
    } else {
        msg = await context.reply({ content, files: [attachment], components });
    }

    const userId = context.author?.id || context.user?.id;
    const filter = i => i.user.id === userId;
    const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

    collector.on('collect', async i => {
        await i.deferUpdate();
        let nextIdx = phaseIdx;

        if (i.customId.endsWith('_fix_prev')) nextIdx--;
        else if (i.customId.endsWith('_fix_next')) nextIdx++;
        else if (i.customId.endsWith('_fix_select')) nextIdx = parseInt(i.values[0]);

        collector.stop();
        const freshCoppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
        if (!freshCoppa) return;
        await renderAndSendFixtureCoppa(client, context, freshCoppa, nextIdx, labels, msg);
    });
}
