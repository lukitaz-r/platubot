import { ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, EmbedBuilder } from 'discord.js';
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
        `**Formato:** Ida y vuelta (desempate si empate global)\n` +
        `**Participantes:** ${coppa.equipos.length}`
      )
      .setColor('#059669')
      .setFooter({ text: 'Solo admins pueden interactuar con este panel.' })
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
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_coppa_borrar')
        .setLabel('🗑️ Borrar Coppa')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_coppa_refresh')
        .setLabel('🔃 Actualizar Panel')
        .setStyle(ButtonStyle.Secondary),
    );

    const panelMsg = await message.reply({ embeds: [embed], components: [row1, row2] });

    const compFilter = i =>
      ['btn_coppa_resultado', 'btn_coppa_avanzar', 'btn_coppa_borrar', 'btn_coppa_refresh']
        .includes(i.customId) && i.member.permissions.has('Administrator');

    const collector = panelMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: compFilter,
      time: 1800000,
    });

    collector.on('collect', async i => {
      // Recargar coppa fresca
      const coppaFresh = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
      if (!coppaFresh) {
        return i.reply({ content: '❌ La Coppa ya no existe.', flags: 64 });
      }

      switch (i.customId) {
        case 'btn_coppa_resultado':
          await handleResultadoCoppa(i, coppaFresh);
          break;

        case 'btn_coppa_avanzar':
          await handleAvanzarCoppa(i, coppaFresh, panelMsg);
          break;

        case 'btn_coppa_borrar':
          await handleBorrarCoppa(i, coppaFresh, panelMsg);
          break;

        case 'btn_coppa_refresh': {
          const fase = coppaFresh.fasesEliminatoria[coppaFresh.faseActual];
          const llaves = coppaFresh.llaves[fase] ?? [];
          const pend = llaves.filter(l => !l.ganador).length;
          const tot = llaves.length;

          const newEmbed = new EmbedBuilder()
            .setTitle('⚙️ Gestión — Coppa')
            .setDescription(
              `**Fase actual:** ${fase}\n` +
              `**Llaves:** ${tot - pend}/${tot} finalizadas\n` +
              `**Formato:** Ida y vuelta (desempate si empate global)\n` +
              `**Participantes:** ${coppaFresh.equipos.length}`
            )
            .setColor('#059669')
            .setFooter({ text: 'Solo admins pueden interactuar con este panel.' })
            .setTimestamp();

          const newRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_coppa_resultado')
              .setLabel('📥 Cargar Resultado')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(pend === 0),
            new ButtonBuilder()
              .setCustomId('btn_coppa_avanzar')
              .setLabel('⏭️ Avanzar Fase')
              .setStyle(ButtonStyle.Success)
              .setDisabled(pend > 0),
          );

          const newRow2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_coppa_borrar')
              .setLabel('🗑️ Borrar Coppa')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('btn_coppa_refresh')
              .setLabel('🔃 Actualizar Panel')
              .setStyle(ButtonStyle.Secondary),
          );

          await panelMsg.edit({ embeds: [newEmbed], components: [newRow1, newRow2] });
          await i.reply({ content: '🔃 Panel actualizado.', flags: 64 });
          break;
        }
      }
    });

    collector.on('end', () => {
      panelMsg.edit({ components: [] }).catch(() => {});
    });
  },
};

// ── Cargar resultado de una llave ────────────────────────────────────────────

async function handleResultadoCoppa(interaction, coppa) {
  const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
  const llaves = coppa.llaves[faseActual].filter(l => !l.ganador && l.equipo2.discordId !== 'BYE');

  if (!llaves.length) {
    return interaction.reply({ content: '✅ No hay llaves pendientes en esta fase.', flags: 64 });
  }

  // Determinar qué partidos están pendientes (ida, vuelta o desempate)
  const opciones = [];
  for (const llave of llaves) {
    if (!llave.ida.finalizado) {
      opciones.push({
        label: `IDA: ${llave.equipo1.nombre} vs ${llave.equipo2.nombre}`.slice(0, 100),
        description: `${faseActual} — Partido de ida`,
        value: `${llave.id}|ida`,
      });
    } else if (!llave.vuelta.finalizado) {
      opciones.push({
        label: `VUELTA: ${llave.equipo2.nombre} vs ${llave.equipo1.nombre}`.slice(0, 100),
        description: `${faseActual} — Partido de vuelta`,
        value: `${llave.id}|vuelta`,
      });
    } else if (!llave.desempate.finalizado) {
      // Verificar si realmente necesita desempate (empate global)
      const globalEq1 = llave.ida.golesLocal + llave.vuelta.golesVisitante;
      const globalEq2 = llave.ida.golesVisitante + llave.vuelta.golesLocal;
      if (globalEq1 === globalEq2) {
        opciones.push({
          label: `DESEMPATE: ${llave.equipo1.nombre} vs ${llave.equipo2.nombre}`.slice(0, 100),
          description: `${faseActual} — Tercer partido (desempate)`,
          value: `${llave.id}|desempate`,
        });
      }
    }
  }

  if (!opciones.length) {
    return interaction.reply({ content: '✅ No hay partidos pendientes en esta fase.', flags: 64 });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('sel_coppa_resultado')
    .setPlaceholder('Selecciona el partido a cargar...')
    .addOptions(opciones.slice(0, 25));

  await interaction.reply({
    content: '**Selecciona el partido a cargar:**',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: 64,
  });

  const selFilter = i2 => i2.customId === 'sel_coppa_resultado' && i2.user.id === interaction.user.id;
  const selResp = await interaction.channel.awaitMessageComponent({ filter: selFilter, time: 60000 }).catch(() => null);
  if (!selResp) return;

  const [llaveId, tipo] = selResp.values[0].split('|');
  const llave = coppa.llaves[faseActual].find(l => l.id === llaveId);

  if (!llave) return selResp.update({ content: '❌ Llave no encontrada.', components: [] });

  // En la vuelta, el "local" es equipo2 y "visitante" es equipo1
  const esVuelta = tipo === 'vuelta';
  const localNombre = esVuelta ? llave.equipo2.nombre : llave.equipo1.nombre;
  const visitanteNombre = esVuelta ? llave.equipo1.nombre : llave.equipo2.nombre;

  const modal = new ModalBuilder()
    .setCustomId(`modal_coppa_res_${llaveId}_${tipo}`)
    .setTitle(`${tipo.toUpperCase()}: ${localNombre} vs ${visitanteNombre}`.slice(0, 45));

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel(`Goles de ${localNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gl')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 2')
          .setRequired(true)
          .setMaxLength(2)
      ),
    new LabelBuilder()
      .setLabel(`Goles de ${visitanteNombre}`.slice(0, 45))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('gv')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ej: 1')
          .setRequired(true)
          .setMaxLength(2)
      ),
  );

  await selResp.showModal(modal);

  const modalFilter = i2 => i2.customId === `modal_coppa_res_${llaveId}_${tipo}` && i2.user.id === interaction.user.id;
  const modalResp = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 }).catch(() => null);
  if (!modalResp) return;

  const gl = parseInt(modalResp.fields.getTextInputValue('gl'));
  const gv = parseInt(modalResp.fields.getTextInputValue('gv'));

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    return modalResp.reply({ content: '❌ Valores inválidos.', flags: 64 });
  }

  // Recargar coppa para guardar
  const coppaFresh = await Coppa.findOne({ estado: 'EnCurso' }).catch(() => null);
  if (!coppaFresh) return modalResp.reply({ content: '❌ La Coppa ya no existe.', flags: 64 });

  const faseFresh = coppaFresh.fasesEliminatoria[coppaFresh.faseActual];
  const llaveFresh = coppaFresh.llaves[faseFresh].find(l => l.id === llaveId);
  if (!llaveFresh) return modalResp.reply({ content: '❌ Llave no encontrada.', flags: 64 });

  // En la vuelta, los goles se guardan invertidos para mantener la perspectiva de equipo2 como local
  if (tipo === 'ida') {
    llaveFresh.ida.golesLocal = gl;
    llaveFresh.ida.golesVisitante = gv;
    llaveFresh.ida.finalizado = true;
  } else if (tipo === 'vuelta') {
    llaveFresh.vuelta.golesLocal = gl;
    llaveFresh.vuelta.golesVisitante = gv;
    llaveFresh.vuelta.finalizado = true;
  } else if (tipo === 'desempate') {
    llaveFresh.desempate.golesLocal = gl;
    llaveFresh.desempate.golesVisitante = gv;
    llaveFresh.desempate.finalizado = true;
  }

  // Determinar ganador
  const ganador = determinarGanadorLlave(llaveFresh);
  if (ganador) {
    llaveFresh.ganador = ganador;
  }

  await coppaFresh.save();

  // Feedback
  let feedback = `✅ **${tipo.toUpperCase()}:** ${localNombre} ${gl} - ${gv} ${visitanteNombre}`;
  if (ganador) {
    const ganadorNombre = llaveFresh.equipo1.discordId === ganador
      ? llaveFresh.equipo1.nombre
      : llaveFresh.equipo2.nombre;
    feedback += `\n🏆 **Ganador de la llave:** ${ganadorNombre}`;
  } else if (tipo === 'vuelta') {
    // Check if it needs a tiebreaker
    const globalEq1 = llaveFresh.ida.golesLocal + llaveFresh.vuelta.golesVisitante;
    const globalEq2 = llaveFresh.ida.golesVisitante + llaveFresh.vuelta.golesLocal;
    if (globalEq1 === globalEq2) {
      feedback += `\n⚖️ **Empate global ${globalEq1}-${globalEq2}** — Se necesita **partido de desempate**.`;
    }
  }

  await modalResp.reply({ content: feedback, flags: 64 });
}

// ── Avanzar fase ─────────────────────────────────────────────────────────────

async function handleAvanzarCoppa(interaction, coppa, panelMsg) {
  const faseActual = coppa.fasesEliminatoria[coppa.faseActual];
  const pendientes = coppa.llaves[faseActual].filter(l => !l.ganador).length;

  if (pendientes > 0) {
    return interaction.reply({ content: `❌ Aún hay **${pendientes}** llave(s) pendiente(s) en **${faseActual}**.`, flags: 64 });
  }

  // Si estamos en la final y ya hay ganador, la coppa terminó
  if (coppa.faseActual >= coppa.fasesEliminatoria.length - 1) {
    const finalLlave = coppa.llaves[faseActual][0];
    const campeón = finalLlave.equipo1.discordId === finalLlave.ganador
      ? finalLlave.equipo1.nombre
      : finalLlave.equipo2.nombre;

    coppa.estado = 'Finalizado';
    await coppa.save();

    await interaction.reply({ content: `🏆🎉 **¡La Coppa ha finalizado!**\n\n👑 **Campeón: ${campeón}**` });

    const finEmbed = new EmbedBuilder()
      .setTitle('🏆 Coppa — Finalizada')
      .setDescription(`👑 **Campeón: ${campeón}**`)
      .setColor('#ffd700')
      .setTimestamp();

    await panelMsg.edit({ embeds: [finEmbed], components: [] }).catch(() => {});
    return;
  }

  const nuevaFase = avanzarFase(coppa);
  await coppa.save();

  await interaction.reply({ content: `⏭️ **Fase avanzada a ${nuevaFase}!**\nUsá \`!coppa-bracket\` para ver el bracket actualizado.` });
}

// ── Borrar coppa ─────────────────────────────────────────────────────────────

async function handleBorrarCoppa(interaction, coppa, panelMsg) {
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_coppa_borrar_si').setLabel('✅ Sí, borrar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_coppa_borrar_no').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: '⚠️ **¿Estás seguro?** Se eliminará la Coppa actual permanentemente.',
    components: [confirmRow],
    flags: 64,
  });

  const filter = i2 => ['btn_coppa_borrar_si', 'btn_coppa_borrar_no'].includes(i2.customId) && i2.user.id === interaction.user.id;
  const resp = await interaction.channel.awaitMessageComponent({ filter, time: 30000 }).catch(() => null);
  if (!resp || resp.customId === 'btn_coppa_borrar_no') {
    return resp?.update({ content: 'Cancelado.', components: [] }).catch(() => {});
  }

  await Coppa.deleteOne({ _id: coppa._id });

  const delEmbed = new EmbedBuilder()
    .setTitle('🗑️ Coppa — Eliminada')
    .setDescription('La Coppa ha sido eliminada.')
    .setColor('#e74c3c')
    .setTimestamp();

  await panelMsg.edit({ embeds: [delEmbed], components: [] }).catch(() => {});
  resp.update({ content: '🗑️ Coppa eliminada correctamente.', components: [] });
}
