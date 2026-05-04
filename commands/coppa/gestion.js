import { ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, EmbedBuilder, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import Coppa from '../../models/copas/Coppa.js';
import { avanzarFase, determinarGanadorLlave } from '../../utils/generarBracket.js';

export default {
  name: 'coppa-gestion',
  aliases: ['gestioncoppa', 'coppaadmin'],
  desc: 'Panel de gestión de la Coppa (admin)',
  permisos: ['Administrator'],

  run: async (client, message) => {
    const coppa = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
    if (!coppa) {
      return message.reply('❌ No hay una **Coppa** en curso. Creá una con `!coppa-crear`.');
    }

    const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
    const llavesActuales = coppa.llaves[faseActual] ?? [];
    const pendientes = llavesActuales.filter(l => !l.ganador).length;
    const total = llavesActuales.length;

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Gestión — Coppa')
      .setDescription(
        `**Fase actual:** ${faseActual}\n` +
        `**Llaves:** ${total - pendientes}/${total} finalizadas\n` +
        `**Participantes:** ${coppa.equipos.length}/16`
      )
      .setColor('#059669')
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_coppa_resultado')
        .setLabel('📥 Cargar Resultado')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pendientes === 0),
      new ButtonBuilder()
        .setCustomId('btn_coppa_avanzar')
        .setLabel('⏭️ Avanzar Fase')
        .setStyle(ButtonStyle.Success)
        .setDisabled(pendientes > 0),
      new ButtonBuilder()
        .setCustomId('btn_coppa_part')
        .setLabel('👥 Participantes')
        .setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_coppa_canal')
        .setLabel('📺 Canal')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_coppa_borrar')
        .setLabel('🗑️ Borrar')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_coppa_refresh')
        .setLabel('🔃 Refresh')
        .setStyle(ButtonStyle.Secondary),
    );

    const panelMsg = await message.reply({ embeds: [embed], components: [row1, row2] });

    const collector = panelMsg.createMessageComponentCollector({
      filter: i => i.member.permissions.has('Administrator'),
      time: 1800000,
    });

    collector.on('collect', async i => {
      const coppaFresh = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
      if (!coppaFresh) return i.reply({ content: '❌ La Coppa ya no existe.', flags: 64 });

      switch (i.customId) {
        case 'btn_coppa_part':
          await handleGestionParticipantesCoppa(i, coppaFresh);
          break;
        case 'btn_coppa_canal':
          await handleCambiarCanalCoppa(i, coppaFresh);
          break;
        case 'btn_coppa_resultado':
          await handleResultadoCoppa(i, coppaFresh);
          break;
        case 'btn_coppa_avanzar':
          await handleAvanzarCoppa(i, coppaFresh, panelMsg);
          break;
        case 'btn_coppa_borrar':
          await handleBorrarCoppa(i, coppaFresh, panelMsg);
          break;
        case 'btn_coppa_refresh':
          await i.deferUpdate();
          const fase = coppaFresh.fasesEliminatoria[coppaFresh.faseActual];
          const llaves = coppaFresh.llaves[fase] ?? [];
          const p = llaves.filter(l => !l.ganador).length;
          const t = llaves.length;
          const newEmbed = EmbedBuilder.from(embed).setDescription(`**Fase actual:** ${fase}\n**Llaves:** ${t - p}/${t} finalizadas\n**Participantes:** ${coppaFresh.equipos.length}/16`);
          await panelMsg.edit({ embeds: [newEmbed] });
          break;
      }
    });
  },
};

async function handleCambiarCanalCoppa(interaction, coppa) {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId('coppa_sel_channel_internal')
        .setPlaceholder('Selecciona el nuevo canal...')
        .addChannelTypes(ChannelType.GuildText);

    const resp = await interaction.reply({ 
        content: '📺 **Cambiar Canal de la Coppa**', 
        components: [new ActionRowBuilder().addComponents(select)], 
        flags: 64,
        fetchReply: true
    });

    const sel = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
    if (!sel) return;

    coppa.canalResultados = sel.values[0];
    await coppa.save();
    await sel.update({ content: `✅ Canal de la Coppa actualizado a <#${sel.values[0]}>.`, components: [] });
}

async function handleGestionParticipantesCoppa(interaction, coppa) {
    if (coppa.equipos.length === 0) return interaction.reply({ content: '❌ No hay participantes.', flags: 64 });

    const select = new StringSelectMenuBuilder()
        .setCustomId('sel_part_coppa_internal')
        .setPlaceholder('Selecciona un usuario...')
        .addOptions(coppa.equipos.map((e, idx) => ({
            label: e.nombre,
            description: `ID: ${e.discordId}`,
            value: `${idx}`
        })));

    const resp = await interaction.reply({ 
        content: '👥 **Participantes Inscritos**', 
        components: [new ActionRowBuilder().addComponents(select)], 
        flags: 64,
        fetchReply: true
    });

    const sel = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
    if (!sel) return;

    const idx = parseInt(sel.values[0]);
    const equipo = coppa.equipos[idx];

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('del_p_coppa_si').setLabel('Confirmar Eliminación').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('del_p_coppa_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );

    await sel.update({ content: `⚠️ ¿Estás seguro de que quieres eliminar a **${equipo.nombre}**?`, components: [confirmRow] });

    const confirm = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 }).catch(() => null);
    if (confirm?.customId === 'del_p_coppa_si') {
        coppa.equipos.splice(idx, 1);
        await coppa.save();
        await confirm.update({ content: `✅ **${equipo.nombre}** eliminado.`, components: [] });
    } else {
        await confirm?.update({ content: 'Acción cancelada.', components: [] });
    }
}

async function handleResultadoCoppa(interaction, coppa) {
  const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
  const llaves = coppa.llaves[faseActual].filter(l => !l.ganador && l.equipo2.discordId !== 'BYE');
  if (!llaves.length) return interaction.reply({ content: '✅ No hay llaves pendientes.', flags: 64 });

  const opciones = llaves.map(l => ({ label: `${l.equipo1.nombre} vs ${l.equipo2.nombre}`, value: l.id }));
  const select = new StringSelectMenuBuilder().setCustomId('sel_l_res_internal').setPlaceholder('Selecciona la llave...').addOptions(opciones);
  const resp = await interaction.reply({ content: '📥 Selecciona la llave:', components: [new ActionRowBuilder().addComponents(select)], flags: 64, fetchReply: true });

  const sel = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
  if (!sel) return;

  const llaveId = sel.values[0];
  const llave = coppa.llaves[faseActual].find(l => l.id === llaveId);

  const subSelect = new StringSelectMenuBuilder().setCustomId('sel_t_res_internal').setPlaceholder('¿Qué partido?').addOptions([
    { label: 'IDA', value: 'ida' }, { label: 'VUELTA', value: 'vuelta' }, { label: 'DESEMPATE', value: 'desempate' }
  ]);

  await sel.update({ content: `📊 Partido para: **${llave.equipo1.nombre} vs ${llave.equipo2.nombre}**`, components: [new ActionRowBuilder().addComponents(subSelect)] });

  const selTipo = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
  if (!selTipo) return;

  const tipo = selTipo.values[0];
  const modal = new ModalBuilder().setCustomId(`mod_res_internal`).setTitle(`${tipo.toUpperCase()}: ${llave.equipo1.nombre.slice(0, 15)} vs ${llave.equipo2.nombre.slice(0, 15)}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel('Goles Local').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel('Goles Visitante').setStyle(TextInputStyle.Short).setRequired(true))
  );

  await selTipo.showModal(modal);
  const submit = await interaction.awaitModalSubmit({ time: 60000 }).catch(() => null);
  if (!submit) return;

  const gl = parseInt(submit.fields.getTextInputValue('gl'));
  const gv = parseInt(submit.fields.getTextInputValue('gv'));

  const fresh = await Coppa.findOne({ estado: 'EnCurso' });
  const freshL = fresh.llaves[faseActual].find(l => l.id === llaveId);

  if (tipo === 'ida') { freshL.ida.golesLocal = gl; freshL.ida.golesVisitante = gv; freshL.ida.finalizado = true; }
  else if (tipo === 'vuelta') { freshL.vuelta.golesLocal = gl; freshL.vuelta.golesVisitante = gv; freshL.vuelta.finalizado = true; }
  else { freshL.desempate.golesLocal = gl; freshL.desempate.golesVisitante = gv; freshL.desempate.finalizado = true; }

  const ganador = determinarGanadorLlave(freshL);
  if (ganador) freshL.ganador = ganador;
  await fresh.save();

  await submit.reply({ content: `✅ Resultado guardado.`, flags: 64 });
}

async function handleAvanzarCoppa(interaction, coppa, panelMsg) {
  const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
  const pendientes = coppa.llaves[faseActual].filter(l => !l.ganador).length;
  if (pendientes > 0) return interaction.reply({ content: `❌ Hay llaves pendientes.`, flags: 64 });

  if (coppa.faseActual >= coppa.fasesEliminatoria.length - 1) {
    coppa.estado = 'Finalizado'; await coppa.save();
    return interaction.reply({ content: '🏆🎉 ¡La Coppa ha finalizado!' });
  }
  const nuevaFase = avanzarFase(coppa);
  await coppa.save();
  await interaction.reply({ content: `⏭️ Fase avanzada a ${nuevaFase}!` });
}

async function handleBorrarCoppa(interaction, coppa, panelMsg) {
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bc_si').setLabel('Borrar').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('bc_no').setLabel('No').setStyle(ButtonStyle.Secondary));
  await interaction.reply({ content: '⚠️ ¿Borrar Coppa?', components: [row], flags: 64 });
  const resp = await interaction.channel.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 }).catch(() => null);
  if (resp?.customId === 'bc_si') { await Coppa.deleteOne({ _id: coppa._id }); await panelMsg.delete(); resp.update({ content: '🗑️ Borrada.', components: [] }); }
  else { resp?.update({ content: 'Cancelado.', components: [] }); }
}
