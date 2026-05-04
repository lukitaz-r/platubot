import { 
    AttachmentBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    FileUploadBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder
} from 'discord.js';
import Torneo from '../../models/copas/Torneo.js';
import { generarTablaImagenCopa, generarImagenParticipantes, generarBracketCopa } from '../../utils/visual/copaVisualGenerator.js';
import { generarFixtureImagen } from '../../utils/visual/fixtureGenerator.js';
import { buildFixtureNavigation } from '../../utils/ui/fixtureNavigation.js';
import { getFlagUrl } from '../../utils/visual/countryHelper.js';
import generarRoundRobin from '../../utils/generarRoundRobin.js';
import generarBracket from '../../utils/generarBracket.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import fetch from 'node-fetch';
import { existsSync, readFileSync } from 'fs';

export default {
    name: 'torneo-generic',
    desc: 'Comandos genéricos para torneos dinámicos',
    permisos: [],

    async runGeneric(client, message, args, torneo, subComando) {
        const esDirecta = torneo.formatoPreset === 'directa';

        switch (subComando) {
            case 'tabla':
                if (esDirecta) return message.reply('❌ Este torneo es de **Eliminación Directa** y no tiene tabla de posiciones. Usa `participantes`, `fixture` o `bracket`.');
                return handleTabla(client, message, args, torneo);
            case 'fixture':
                return handleFixture(client, message, args, torneo);
            case 'inscripcion':
                return handleInscripcion(client, message, args, torneo);
            case 'participantes':
                return handleParticipantes(client, message, args, torneo);
            case 'bracket':
                return handleBracket(client, message, args, torneo);
            case 'gestion':
                return handleGestion(client, message, args, torneo);
            default:
                return message.reply(`❌ Subcomando \`${subComando}\` no reconocido para el torneo **${torneo.nombre}**.`);
        }
    }
};

async function handleTabla(client, message, args, torneo) {
    if (torneo.estado === 'Configuracion') return message.reply('❌ El torneo aún no ha comenzado.');
    const loading = await message.reply('<a:loading:1461897825439711468> Generando tabla...');
    
    try {
        const tabla = torneo.equipos.map(e => ({
            nombre: e.nombre,
            avatar: getAvatarBase64(e.avatar),
            pj: e.pj || 0, pg: e.pg || 0, pe: e.pe || 0, pp: e.pp || 0,
            gf: e.gf || 0, gc: e.gc || 0, puntos: e.puntos || 0
        })).sort((a,b) => b.puntos - a.puntos || (b.gf-b.gc) - (a.gf-a.gc));

        const png = await generarTablaImagenCopa(torneo, tabla, torneo.nombre);
        const attachment = new AttachmentBuilder(png, { name: 'tabla.png' });
        await loading.edit({ content: '', files: [attachment] });
    } catch (error) {
        console.error(error);
        await loading.edit('❌ Error al generar la tabla.');
    }
}

async function handleParticipantes(client, message, args, torneo) {
    const loading = await message.reply('<a:loading:1461897825439711468> Generando lista de participantes...');
    try {
        const torneoCopy = JSON.parse(JSON.stringify(torneo));
        torneoCopy.equipos = torneoCopy.equipos.map(e => ({
            ...e,
            avatar: getAvatarBase64(e.avatar)
        }));

        const png = await generarImagenParticipantes(torneoCopy);
        const attachment = new AttachmentBuilder(png, { name: 'participantes.png' });
        await loading.edit({ content: `👥 **Participantes — ${torneo.nombre}**`, files: [attachment] });
    } catch (error) {
        console.error(error);
        await loading.edit('❌ Error al generar la imagen de participantes.');
    }
}

async function handleBracket(client, message, args, torneo) {
    if (torneo.estado === 'Configuracion' || !torneo.fasesEliminatoria?.length) return message.reply('❌ El torneo aún no ha generado los brackets.');
    const loading = await message.reply('<a:loading:1461897825439711468> Generando bracket...');
    try {
        const png = await generarBracketCopa(torneo);
        const attachment = new AttachmentBuilder(png, { name: 'bracket.png' });
        await loading.edit({ content: `📊 **Bracket — ${torneo.nombre}**`, files: [attachment] });
    } catch (error) {
        console.error(error);
        await loading.edit('❌ Error al generar el bracket.');
    }
}

async function handleInscripcion(client, message, args, torneo) {
    if (!message.member.permissions.has('Administrator') && message.author.id !== torneo.createdBy) {
        return message.reply('❌ Solo administradores pueden usar este comando.');
    }

    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(`admin_select_user|${torneo.prefix}`)
            .setPlaceholder('Selecciona al usuario para inscribir...')
    );

    const msg = await message.reply({
        content: '⚙️ **Inscripción Administrativa**\nSelecciona un usuario del menú:',
        components: [row]
    });

    const collector = msg.createMessageComponentCollector({ 
        filter: i => i.user.id === message.author.id, 
        componentType: ComponentType.UserSelect,
        time: 60000 
    });

    collector.on('collect', async interaction => {
        const selectedId = interaction.values[0];
        const selectedUser = interaction.users.get(selectedId);
        
        if (torneo.equipos.some(e => e.discordId === selectedId)) {
            return interaction.reply({ content: `❌ **${selectedUser.tag}** ya está en el torneo.`, flags: 64 });
        }

        if (torneo.tipoJugadores === 'users') {
            await interaction.deferUpdate();
            await inscribirFinal(client, interaction, torneo, selectedUser, selectedUser.username, selectedUser.displayAvatarURL({ extension: 'png' }));
            await msg.delete().catch(() => {});
            return;
        }

        const modalId = `modal_admin_ins|${selectedId}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Inscribir a ${selectedUser.username}`);

        const label = torneo.tipoJugadores === 'countries' ? 'Nombre del País' : 'Nombre del Equipo';
        const nameInput = new TextInputBuilder()
            .setCustomId('nombre')
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Argentina / Real Madrid')
            .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

        if (torneo.tipoJugadores === 'teams') {
            const fileInput = new FileUploadBuilder().setCustomId('logo').setMaxValues(1).setRequired(true);
            const labelInput = new LabelBuilder().setLabel("Logo").setDescription("Subi una imagen para usarla como logo del equipo").setFileUploadComponent(fileInput);
            modal.addLabelComponents(labelInput);
        }

        await interaction.showModal(modal);

        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === modalId && i.user.id === interaction.user.id,
            time: 60000
        }).catch(() => null);

        if (modalSubmit) {
            const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
            let finalAvatar = selectedUser.displayAvatarURL({ extension: 'png', size: 128 });

            if (torneo.tipoJugadores === 'teams') {
                const attachmentField = modalSubmit.fields.getField("logo");
                const attachmentUrl = attachmentField?.attachments.first()?.url;
                if (attachmentUrl) {
                    const localPath = await descargarImagen(attachmentUrl, `${torneo.prefix}_${selectedId}`);
                    if (localPath) finalAvatar = localPath;
                }
            }

            await modalSubmit.deferReply({ flags: 64 });
            await inscribirFinal(client, modalSubmit, torneo, selectedUser, nombreIngresado, finalAvatar);
        }
    });
}

async function inscribirFinal(client, context, torneo, user, nombre, avatar) {
    let finalAvatar = avatar;
    
    // Si es un torneo de países, intentar obtener la bandera automáticamente
    if (torneo.tipoJugadores === 'countries') {
        const flagUrl = getFlagUrl(nombre);
        if (flagUrl) finalAvatar = flagUrl;
    }

    const nuevoEquipo = {
        nombre: nombre,
        discordId: user.id,
        avatar: finalAvatar,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
    };

    torneo.equipos.push(nuevoEquipo);
    await torneo.save();
    await context.editReply({ content: `✅ **Inscripción Exitosa:** **${user.tag}** se ha unido como **${nombre}**.` });
}

async function descargarImagen(url, filename) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const buffer = await response.buffer();
        const extension = url.split('.').pop().split('?')[0] || 'png';
        const dir = join(process.cwd(), 'assets', 'logos');
        await mkdir(dir, { recursive: true });
        const filePath = join(dir, `${filename}.${extension}`);
        await writeFile(filePath, buffer);
        return filePath; 
    } catch (e) {
        console.error('Error:', e);
        return null;
    }
}

async function handleFixture(client, message, args, torneo) {
    if (torneo.estado === 'Configuracion') return message.reply('❌ El fixture aún no ha sido generado.');

    // Recopilar todas las fases disponibles
    const labels = [];
    const fasesData = []; // [{ type: 'grupo' | 'bracket', name: string, data: any }]

    if (torneo.gruposHabilitados && torneo.enfrentamientosGrupos?.length > 0) {
        const fechas = [...new Set(torneo.enfrentamientosGrupos.map(e => e.fecha || 1))].sort((a,b) => a-b);
        fechas.forEach(f => {
            labels.push(`Fase de Grupos - Fecha ${f}`);
            fasesData.push({ type: 'grupo', name: `Fase de Grupos - F${f}`, data: torneo.enfrentamientosGrupos.filter(e => (e.fecha || 1) === f) });
        });
    }

    if (torneo.fasesEliminatoria?.length > 0) {
        torneo.fasesEliminatoria.forEach(fase => {
            labels.push(fase);
            fasesData.push({ type: 'bracket', name: fase, data: torneo.llaves?.[fase] || [] });
        });
    }

    if (fasesData.length === 0) return message.reply('❌ No hay enfrentamientos disponibles.');

    // Determinar fase inicial
    let currentIdx = 0;
    if (args.includes('eliminatorias') || args.includes('bracket')) {
        currentIdx = fasesData.findIndex(f => f.type === 'bracket');
        if (currentIdx === -1) currentIdx = 0;
    } else {
        const pendIdx = fasesData.findIndex(f => {
            if (f.type === 'grupo') return f.data.some(m => !m.completado);
            return f.data.some(m => !m.ganador);
        });
        currentIdx = pendIdx !== -1 ? pendIdx : 0;
    }

    await renderAndSendFixture(client, message, torneo, currentIdx, fasesData, labels);
}

async function renderAndSendFixture(client, context, torneo, idx, fasesData, labels, existingMsg = null) {
    const fase = fasesData[idx];
    const enfs = fase.data;

    const partidosRender = enfs.map(e => {
        const localNombre = e.local || e.equipo1?.nombre;
        const visitanteNombre = e.visitante || e.equipo2?.nombre;
        
        const teamL = torneo.equipos.find(eq => eq.nombre === localNombre);
        const teamV = torneo.equipos.find(eq => eq.nombre === visitanteNombre);

        let resText = 'Pendiente';
        if (e.ganador || e.completado) {
            if (e.resultado) resText = e.resultado;
            else if (e.ida?.finalizado && e.vuelta?.finalizado) resText = `${e.ida.golesLocal}-${e.ida.golesVisitante} / ${e.vuelta.golesLocal}-${e.vuelta.golesVisitante}`;
            else if (e.ida?.finalizado) resText = `${e.ida.golesLocal}-${e.ida.golesVisitante}`;
        }

        let ganadorNombre = null;
        if (e.ganador) {
            if (e.ganador === e.equipo1?.discordId || e.ganador === e.local) ganadorNombre = localNombre;
            else if (e.ganador === e.equipo2?.discordId || e.ganador === e.visitante) ganadorNombre = visitanteNombre;
        }

        return {
            local: localNombre,
            visitante: visitanteNombre,
            resultado: resText,
            ganador: ganadorNombre,
            avatarL: getAvatarBase64(teamL?.avatar || e.equipo1?.avatar),
            avatarV: getAvatarBase64(teamV?.avatar || e.equipo2?.avatar),
            ida: e.ida,
            vuelta: e.vuelta,
            desempate: e.desempate
        };
    });

    const buffer = await generarFixtureImagen({
        titulo: torneo.nombre,
        subtitulo: fase.name,
        partidos: partidosRender,
        tema: torneo.tema
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'fixture.png' });
    const content = `📅 **Fixture: ${torneo.nombre} — ${fase.name}**`;
    const components = buildFixtureNavigation(`torneo_${torneo.prefix}`, idx, fasesData.length, labels);

    let msg;
    if (existingMsg) {
        msg = await existingMsg.edit({ content, files: [attachment], components });
    } else {
        msg = await context.reply({ content, files: [attachment], components });
    }

    const userId = context.author?.id || context.user?.id;
    const filter = i => i.user.id === userId;
    const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

    collector.on('collect', async i => {
        await i.deferUpdate();
        let nextIdx = idx;

        if (i.customId.endsWith('_fix_prev')) nextIdx--;
        else if (i.customId.endsWith('_fix_next')) nextIdx++;
        else if (i.customId.endsWith('_fix_select')) nextIdx = parseInt(i.values[0]);

        collector.stop();
        const fresh = await Torneo.findOne({ prefix: torneo.prefix });
        
        const freshLabels = [];
        const freshFasesData = [];
        if (fresh.gruposHabilitados && fresh.enfrentamientosGrupos?.length > 0) {
            const fechas = [...new Set(fresh.enfrentamientosGrupos.map(e => e.fecha || 1))].sort((a,b) => a-b);
            fechas.forEach(f => {
                freshLabels.push(`Fase de Grupos - Fecha ${f}`);
                freshFasesData.push({ type: 'grupo', name: `Fase de Grupos - F${f}`, data: fresh.enfrentamientosGrupos.filter(e => (e.fecha || 1) === f) });
            });
        }
        if (fresh.fasesEliminatoria?.length > 0) {
            fresh.fasesEliminatoria.forEach(f => {
                freshLabels.push(f);
                freshFasesData.push({ type: 'bracket', name: f, data: fresh.llaves?.[f] || [] });
            });
        }

        await renderAndSendFixture(client, context, fresh, nextIdx, freshFasesData, freshLabels, msg);
    });
}

function getAvatarBase64(avatarUrl) {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http')) return avatarUrl;
    try {
        if (existsSync(avatarUrl)) {
            const buffer = readFileSync(avatarUrl);
            const ext = avatarUrl.split('.').pop();
            return `data:image/${ext};base64,${buffer.toString('base64')}`;
        }
    } catch (e) {}
    return avatarUrl;
}

// ── Gestión del Torneo ──────────────────────────────────────────────────────

async function handleGestion(client, message, args, torneo) {
    if (!message.member.permissions.has('Administrator') && message.author.id !== torneo.createdBy) {
        return message.reply('❌ Solo administradores pueden gestionar el torneo.');
    }

    const t = torneo.tema;
    const faseActual = torneo.fasesEliminatoria?.[torneo.faseActual] || (torneo.gruposHabilitados ? 'Fase de Grupos' : 'Configuración');
    
    const embed = new EmbedBuilder()
        .setTitle(`⚙️ Gestión — ${torneo.nombre}`)
        .setDescription(
            `**Estado:** ${torneo.estado}\n` +
            `**Fase Actual:** ${faseActual}\n` +
            `**Participantes:** ${torneo.equipos.length}/${torneo.cantidadParticipantes}\n` +
            `**Prefijo:** \`${torneo.prefix}\``
        )
        .addFields(
            { name: '🎨 Colores del Tema', value: `Primario: \`${t.primario}\`\nSecundario: \`${t.secundario}\`\nAcento: \`${t.acento}\`\nTexto: \`${t.texto}\`\nBorde: \`${t.borde}\``, inline: true }
        )
        .setColor(t.acento)
        .setTimestamp();

    const yaLleno = torneo.equipos.length >= torneo.cantidadParticipantes;
    const sinPartidos = (torneo.enfrentamientosGrupos?.length === 0 && Object.keys(torneo.llaves || {}).length === 0);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gt_sortear|${torneo.prefix}`)
            .setLabel('🎲 Sortear Partidos')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!yaLleno || !sinPartidos),
        new ButtonBuilder()
            .setCustomId(`gt_res|${torneo.prefix}`)
            .setLabel('📥 Cargar Resultado')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(sinPartidos),
        new ButtonBuilder()
            .setCustomId(`gt_fase|${torneo.prefix}`)
            .setLabel('⏭️ Avanzar Fase')
            .setStyle(ButtonStyle.Success)
            .setDisabled(sinPartidos || (torneo.gruposHabilitados && torneo.enfrentamientosGrupos.some(e => !e.ganador && !e.completado))),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gt_part|${torneo.prefix}`).setLabel('👥 Part.').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gt_tema|${torneo.prefix}`).setLabel('🎨 Tema').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gt_canal|${torneo.prefix}`).setLabel('📺 Canal').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gt_borrar|${torneo.prefix}`).setLabel('🗑️ Borrar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`gt_refresh|${torneo.prefix}`).setLabel('🔃 Refresh').setStyle(ButtonStyle.Secondary),
    );

    const panelMsg = await message.reply({ embeds: [embed], components: [row1, row2] });

    const collector = panelMsg.createMessageComponentCollector({ 
        filter: i => i.user.id === message.author.id, 
        time: 3600000 
    });

    collector.on('collect', async i => {
        const freshTorneo = await Torneo.findOne({ prefix: torneo.prefix });
        if (!freshTorneo) return i.reply({ content: '❌ El torneo ya no existe.', flags: 64 });

        const [action] = i.customId.split('|');

        switch (action) {
            case 'gt_part':
                await handleGestionParticipantes(i, freshTorneo, panelMsg);
                break;
            case 'gt_tema':
                await handleEditarTema(i, freshTorneo, panelMsg);
                break;
            case 'gt_canal':
                await handleCambiarCanal(i, freshTorneo, panelMsg);
                break;
            case 'gt_borrar':
                await handleBorrarTorneo(i, freshTorneo, panelMsg);
                break;
            case 'gt_sortear':
                await handleSortearAdmin(i, freshTorneo, panelMsg);
                break;
            case 'gt_res':
                await handleCargarResultadoAdmin(i, freshTorneo, panelMsg);
                break;
            case 'gt_fase':
                await handleAvanzarFaseAdmin(i, freshTorneo, panelMsg);
                break;
            case 'gt_refresh':
                await i.deferUpdate();
                await handleGestion(client, message, args, freshTorneo);
                await panelMsg.delete().catch(() => {});
                break;
        }
    });
}

async function handleCambiarCanal(interaction, torneo, panelMsg) {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId('gt_sel_channel_internal')
        .setPlaceholder('Selecciona el nuevo canal de resultados...')
        .addChannelTypes(ChannelType.GuildText);

    const resp = await interaction.reply({ 
        content: '📺 **Cambiar Canal de Resultados**\nSelecciona el canal donde se enviarán las actualizaciones:', 
        components: [new ActionRowBuilder().addComponents(select)], 
        flags: 64,
        fetchReply: true
    });

    const sel = await resp.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
    if (!sel) return;

    torneo.canalResultados = sel.values[0];
    await torneo.save();
    await sel.update({ content: `✅ Canal actualizado a <#${sel.values[0]}>.`, components: [] });
}

async function handleGestionParticipantes(interaction, torneo, panelMsg) {
    if (torneo.equipos.length === 0) return interaction.reply({ content: '❌ No hay participantes inscritos.', flags: 64 });

    const select = new StringSelectMenuBuilder()
        .setCustomId(`gt_sel_part_internal`)
        .setPlaceholder('Selecciona un participante para gestionar...')
        .addOptions(torneo.equipos.slice(0, 25).map((e, idx) => ({
            label: e.nombre,
            description: `ID: ${e.discordId}`,
            value: `${idx}`
        })));

    const resp = await interaction.reply({ 
        content: '👥 **Gestión de Participantes**\nSelecciona a quién quieres editar o eliminar:', 
        components: [new ActionRowBuilder().addComponents(select)], 
        flags: 64,
        fetchReply: true
    });

    const filter = i => i.user.id === interaction.user.id;
    const sel = await resp.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
    if (!sel) return;

    const idx = parseInt(sel.values[0]);
    const equipo = torneo.equipos[idx];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edit_p').setLabel('📝 Editar Datos').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('del_p').setLabel('🗑️ Eliminar').setStyle(ButtonStyle.Danger)
    );

    await sel.update({ content: `👤 **Participante:** ${equipo.nombre} (<@${equipo.discordId}>)`, components: [row] });

    const actionBtn = await resp.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
    if (!actionBtn) return;

    if (actionBtn.customId === 'del_p') {
        torneo.equipos.splice(idx, 1);
        await torneo.save();
        return actionBtn.update({ content: `✅ **${equipo.nombre}** ha sido eliminado del torneo.`, components: [] });
    }

    // Modal
    const modal = new ModalBuilder().setCustomId(`modal_edit_p_${idx}`).setTitle(`Editar: ${equipo.nombre}`);
    const nameInput = new TextInputBuilder().setCustomId('nombre').setLabel('Nuevo Nombre').setValue(equipo.nombre).setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    if (torneo.tipoJugadores === 'teams') {
        const fileInput = new FileUploadBuilder().setCustomId('logo').setMaxValues(1).setRequired(false);
        const labelInput = new LabelBuilder().setLabel("Nuevo Logo (Opcional)").setFileUploadComponent(fileInput);
        modal.addLabelComponents(labelInput);
    }

    await actionBtn.showModal(modal);
    const submit = await actionBtn.awaitModalSubmit({ time: 60000 }).catch(() => null);
    if (!submit) return;

    const nuevoNombre = submit.fields.getTextInputValue('nombre');
    equipo.nombre = nuevoNombre;

    // Actualizar avatar según el tipo de torneo
    if (torneo.tipoJugadores === 'countries') {
        const flag = getFlagUrl(nuevoNombre);
        if (flag) equipo.avatar = flag;
    } else if (torneo.tipoJugadores === 'teams') {
        const attachment = submit.fields.getField("logo")?.attachments.first();
        if (attachment) {
            const local = await descargarImagen(attachment.url, `${torneo.prefix}_edit_${equipo.discordId}`);
            if (local) equipo.avatar = local;
        }
    }

    await torneo.save();
    await submit.reply({ content: `✅ Datos de **${nuevoNombre}** actualizados correctamente.`, flags: 64 });
}

async function handleCargarResultadoAdmin(interaction, torneo, panelMsg) {
    let enfs = [];
    let esGrupo = false;
    if (torneo.gruposHabilitados && torneo.enfrentamientosGrupos?.length > 0) {
        enfs = torneo.enfrentamientosGrupos.filter(e => !e.ganador && !e.completado);
        esGrupo = true;
    } else if (torneo.fasesEliminatoria?.length > 0) {
        const fase = torneo.fasesEliminatoria[torneo.faseActual];
        enfs = (torneo.llaves[fase] || []).filter(e => !e.ganador);
    }

    if (enfs.length === 0) return interaction.reply({ content: '✅ No hay partidos pendientes.', flags: 64 });

    const select = new StringSelectMenuBuilder()
        .setCustomId(`gt_sel_match_internal`)
        .setPlaceholder('Selecciona el partido...')
        .addOptions(enfs.slice(0, 25).map((e, idx) => {
            const l = e.local || e.equipo1?.nombre || 'TBD';
            const v = e.visitante || e.equipo2?.nombre || 'TBD';
            return { label: `${l} vs ${v}`.slice(0, 100), value: `${idx}` };
        }));

    const resp = await interaction.reply({ 
        content: '📥 **Selecciona el partido para cargar resultado:**', 
        components: [new ActionRowBuilder().addComponents(select)], 
        flags: 64,
        fetchReply: true
    });

    const filter = i => i.user.id === interaction.user.id;
    const sel = await resp.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
    if (!sel) return;

    const idx = parseInt(sel.values[0]);
    const match = enfs[idx];
    const localNombre = match.local || match.equipo1?.nombre;
    const visitanteNombre = match.visitante || match.equipo2?.nombre;

    const modal = new ModalBuilder()
        .setCustomId(`modal_res_admin_internal`)
        .setTitle(`Resultado: ${localNombre} vs ${visitanteNombre}`.slice(0, 45));

    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel(`Goles de ${localNombre}`).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel(`Goles de ${visitanteNombre}`).setStyle(TextInputStyle.Short).setRequired(true))
    );

    await sel.showModal(modal);
    const submit = await sel.awaitModalSubmit({ time: 60000 }).catch(() => null);
    if (!submit) return;

    const gl = parseInt(submit.fields.getTextInputValue('gl'));
    const gv = parseInt(submit.fields.getTextInputValue('gv'));
    if (isNaN(gl) || isNaN(gv)) return submit.reply({ content: '❌ Goles inválidos.', flags: 64 });

    const fresh = await Torneo.findOne({ prefix: torneo.prefix });
    if (esGrupo) {
        const m = fresh.enfrentamientosGrupos.find(e => e.local === localNombre && e.visitante === visitanteNombre && !e.completado);
        if (m) {
            m.resultado = `${gl}-${gv}`; m.completado = true;
            if (gl > gv) m.ganador = localNombre; else if (gv > gl) m.ganador = visitanteNombre; else m.ganador = 'Empate';
            const tL = fresh.equipos.find(eq => eq.nombre === localNombre);
            const tV = fresh.equipos.find(eq => eq.nombre === visitanteNombre);
            if (tL && tV) {
                tL.pj++; tV.pj++; tL.gf += gl; tL.gc += gv; tV.gf += gv; tV.gc += gl;
                if (gl > gv) { tL.pg++; tL.puntos += 3; tV.pp++; }
                else if (gv > gl) { tV.pg++; tV.puntos += 3; tL.pp++; }
                else { tL.pe++; tV.pe++; tL.puntos++; tV.puntos++; }
            }
        }
    } else {
        const fase = fresh.fasesEliminatoria[fresh.faseActual];
        const m = fresh.llaves[fase]?.find(e => e.equipo1.nombre === localNombre && e.equipo2.nombre === visitanteNombre && !e.ganador);
        if (m) {
            m.ida.golesLocal = gl; m.ida.golesVisitante = gv; m.ida.finalizado = true; m.resultado = `${gl}-${gv}`;
            if (gl > gv) m.ganador = m.equipo1.discordId; else if (gv > gl) m.ganador = m.equipo2.discordId; else m.ganador = m.equipo1.discordId;
        }
    }

    await fresh.save();
    await submit.reply({ content: `✅ Resultado guardado: **${localNombre} ${gl} - ${gv} ${visitanteNombre}**`, flags: 64 });
}

async function handleSortearAdmin(interaction, torneo, panelMsg) {
    if (torneo.equipos.length < torneo.cantidadParticipantes) {
        return interaction.reply({ content: `❌ Faltan participantes (${torneo.equipos.length}/${torneo.cantidadParticipantes}).`, flags: 64 });
    }

    await interaction.deferUpdate();

    try {
        if (torneo.formatoPreset === 'directa') {
            const data = generarBracket(torneo.equipos, torneo.tipoEncuentro);
            torneo.llaves = data.llaves;
            torneo.fasesEliminatoria = data.fasesEliminatoria;
            torneo.faseActual = 0;
            torneo.gruposHabilitados = false;
        } else {
            const roundRobin = generarRoundRobin(torneo.equipos);
            const matches = [];
            roundRobin.forEach((fecha, fIdx) => {
                fecha.partidos.forEach(p => {
                    if (p.localId !== 'BYE' && p.visitanteId !== 'BYE') {
                        matches.push({
                            local: p.localNombre,
                            visitante: p.visitanteNombre,
                            resultado: 'Pendiente',
                            ganador: null,
                            completado: false,
                            fecha: fIdx + 1
                        });
                    }
                });
            });
            torneo.enfrentamientosGrupos = matches;
            torneo.gruposHabilitados = true;
        }

        torneo.estado = 'EnCurso';
        await torneo.save();

        await interaction.followUp({ content: `✅ **Sorteo Completado:** Se han generado los partidos para **${torneo.nombre}**. El estado ha cambiado a **EnCurso**.`, flags: 64 });
        
        // Auto-refresh panel
        const fresh = await Torneo.findOne({ prefix: torneo.prefix });
        const embed = EmbedBuilder.from(panelMsg.embeds[0])
            .setDescription(`**Estado:** EnCurso\n**Fase Actual:** ${fresh.gruposHabilitados ? 'Fase de Grupos' : fresh.fasesEliminatoria[0]}\n**Participantes:** ${fresh.equipos.length}/${fresh.cantidadParticipantes}\n**Prefijo:** \`${fresh.prefix}\``);
        
        await panelMsg.edit({ embeds: [embed] });

    } catch (error) {
        console.error('Error en sorteo:', error);
        await interaction.followUp({ content: '❌ Error al realizar el sorteo.', flags: 64 });
    }
}

async function handleEditarTema(interaction, torneo, panelMsg) {
    const t = torneo.tema;
    const modal = new ModalBuilder()
        .setCustomId(`modal_gt_tema|${torneo.prefix}`)
        .setTitle('🎨 Editar Colores del Torneo');

    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pri').setLabel('Color Primario').setValue(t.primario).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sec').setLabel('Color Secundario').setValue(t.secundario).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('acc').setLabel('Color Acento').setValue(t.acento).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('txt').setLabel('Color de Texto').setValue(t.texto).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bor').setLabel('Color de Borde').setValue(t.borde).setStyle(TextInputStyle.Short).setRequired(true))
    );

    await interaction.showModal(modal);

    const submit = await interaction.awaitModalSubmit({ time: 60000 }).catch(() => null);
    if (!submit) return;

    torneo.tema = {
        primario: submit.fields.getTextInputValue('pri'),
        secundario: submit.fields.getTextInputValue('sec'),
        acento: submit.fields.getTextInputValue('acc'),
        texto: submit.fields.getTextInputValue('txt'),
        borde: submit.fields.getTextInputValue('bor')
    };

    await torneo.save();
    await submit.reply({ content: '✅ Tema actualizado correctamente. Pulsa Refresh en el panel para ver los cambios.', flags: 64 });
}

async function handleBorrarTorneo(interaction, torneo, panelMsg) {
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_del_yes').setLabel('Eliminar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('confirm_del_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );

    const ask = await interaction.reply({ content: `⚠️ **¡CUIDADO!** ¿Estás seguro de que quieres eliminar el torneo **${torneo.nombre}**? Esta acción no se puede deshacer.`, components: [confirmRow], flags: 64 });

    const filter = i => i.user.id === interaction.user.id;
    const resp = await interaction.channel.awaitMessageComponent({ filter, time: 30000 }).catch(() => null);

    if (resp?.customId === 'confirm_del_yes') {
        await Torneo.deleteOne({ _id: torneo._id });
        await panelMsg.delete().catch(() => {});
        await resp.update({ content: '🗑️ Torneo eliminado.', components: [] });
    } else {
        await resp?.update({ content: 'Acción cancelada.', components: [] });
    }
}

async function handleAvanzarFaseAdmin(interaction, torneo, panelMsg) {
    if (torneo.gruposHabilitados && torneo.enfrentamientosGrupos.some(e => !e.completado)) {
        return interaction.reply({ content: '❌ No puedes avanzar fase hasta terminar todos los partidos de grupos.', flags: 64 });
    }

    await interaction.reply({ content: '🚧 Lógica de avance de fase en desarrollo.', flags: 64 });
}
