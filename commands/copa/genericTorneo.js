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
    ChannelSelectMenuBuilder,
    ChannelType
} from 'discord.js';
import Torneo from '../../models/copas/Torneo.js';
import { generarTablaImagenCopa, generarImagenParticipantes, generarBracketCopa } from '../../utils/visual/copaVisualGenerator.js';
import { generarFixtureImagen } from '../../utils/visual/fixtureGenerator.js';
import { buildFixtureNavigation } from '../../utils/ui/fixtureNavigation.js';
import { getFlagUrl } from '../../utils/visual/countryHelper.js';
import generarRoundRobin from '../../utils/generarRoundRobin.js';
import generarBracket from '../../utils/generarBracket.js';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import fetch from 'node-fetch';
import { existsSync, readFileSync } from 'fs';
import { getCachedImage } from '../../utils/visual/imageCache.js';

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
            case 'inscribirme':
                return handleSelfInscripcion(client, message, args, torneo);
            case 'agregar-miembro':
                return handleAgregarMiembro(client, message, args, torneo);
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
        const tabla = await Promise.all(torneo.equipos.map(async e => ({
            nombre: e.nombre,
            avatar: await getAvatarBase64(e.avatar),
            pj: e.pj || 0, pg: e.pg || 0, pe: e.pe || 0, pp: e.pp || 0,
            gf: e.gf || 0, gc: e.gc || 0, puntos: e.puntos || 0
        })));
        tabla.sort((a,b) => b.puntos - a.puntos || (b.gf-b.gc) - (a.gf-a.gc));

        const png = await getCachedImage(
            torneo.prefix,
            'tabla',
            { equipos: torneo.equipos, tema: torneo.tema, nombre: torneo.nombre, logo: torneo.logo },
            () => generarTablaImagenCopa(torneo, tabla, torneo.nombre)
        );
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
        torneoCopy.equipos = await Promise.all(torneoCopy.equipos.map(async e => ({
            ...e,
            avatar: await getAvatarBase64(e.avatar)
        })));

        const png = await getCachedImage(
            torneo.prefix,
            'participantes',
            { equipos: torneo.equipos, tema: torneo.tema, nombre: torneo.nombre, logo: torneo.logo },
            () => generarImagenParticipantes(torneoCopy)
        );
        const attachment = new AttachmentBuilder(png, { name: 'participantes.png' });
        await loading.edit({ content: `👥 **Participantes — ${torneo.nombre}**`, files: [attachment] });
    } catch (error) {
        console.error(error);
        await loading.edit('❌ Error al generar la imagen de participantes.');
    }
}

async function handleBracket(client, message, args, torneo) {
    if (!message.member.permissions.has('Administrator') && message.author.id !== torneo.createdBy) {
        return message.reply('❌ Solo administradores pueden gestionar el torneo.');
    }
    if (torneo.estado === 'Configuracion' || !torneo.fasesEliminatoria?.length) return message.reply('❌ El torneo aún no ha generado los brackets.');
    const loading = await message.reply('<a:loading:1461897825439711468> Generando bracket...');
    try {
        const png = await getCachedImage(
            torneo.prefix,
            'bracket',
            { llaves: torneo.llaves, faseActual: torneo.faseActual, tema: torneo.tema, nombre: torneo.nombre, logo: torneo.logo },
            () => generarBracketCopa(torneo)
        );
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

    if (torneo.tipoCompeticion === 'duo') {
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`admin_select_duo|${torneo.prefix}`)
                .setPlaceholder('Selecciona a los 2 jugadores para el duo...')
                .setMinValues(2)
                .setMaxValues(2)
        );

        const msg = await message.reply({
            content: '👥 **Inscripción Administrativa (Duo)**\nSelecciona a los dos usuarios que jugarán juntos:',
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, 
            componentType: ComponentType.UserSelect,
            time: 60000 
        });

        collector.on('collect', async interaction => {
            const user1Id = interaction.values[0];
            const user2Id = interaction.values[1];
            
            const user1 = interaction.users.get(user1Id);
            const user2 = interaction.users.get(user2Id);

            // Verificar si alguno ya está registrado
            const yaInscrito = torneo.equipos.some(e => 
                e.miembros?.some(m => m.discordId === user1Id || m.discordId === user2Id) ||
                e.discordId === user1Id || e.discordId === user2Id
            );

            if (yaInscrito) {
                return interaction.reply({ content: '❌ Uno o ambos jugadores ya están en el torneo.', flags: 64 });
            }

            const modalId = `modal_admin_duo|${user1Id}|${user2Id}`;
            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Registrar Pareja (Duo)');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('nombre')
                        .setLabel('Nombre del Duo / Pareja')
                        .setValue(`${user1.username} & ${user2.username}`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                filter: i => i.customId === modalId && i.user.id === interaction.user.id,
                time: 60000
            }).catch(() => null);

            if (modalSubmit) {
                const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
                await modalSubmit.deferReply({ flags: 64 });

                const nuevoDuo = {
                    nombre: nombreIngresado,
                    miembros: [
                        { discordId: user1Id, avatar: user1.displayAvatarURL({ extension: 'png', size: 128 }) },
                        { discordId: user2Id, avatar: user2.displayAvatarURL({ extension: 'png', size: 128 }) }
                    ],
                    puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
                };

                torneo.equipos.push(nuevoDuo);
                await torneo.save();

                await modalSubmit.editReply({ content: `✅ **Pareja registrada:** **${nombreIngresado}** se ha unido al torneo.` });
                await msg.delete().catch(() => {});
            }
        });
        return;
    }

    if (torneo.tipoCompeticion === 'equipos') {
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`admin_select_owner|${torneo.prefix}`)
                .setPlaceholder('Selecciona al propietario del equipo...')
        );

        const msg = await message.reply({
            content: '🛡️ **Inscripción Administrativa (Equipos)**\nSelecciona al usuario que será propietario/coach del equipo:',
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, 
            componentType: ComponentType.UserSelect,
            time: 60000 
        });

        collector.on('collect', async interaction => {
            const ownerId = interaction.values[0];
            const ownerUser = interaction.users.get(ownerId);

            const yaInscrito = torneo.equipos.some(e => 
                e.propietario === ownerId || e.discordId === ownerId
            );

            if (yaInscrito) {
                return interaction.reply({ content: `❌ **${ownerUser.tag}** ya tiene un equipo o ya está registrado.`, flags: 64 });
            }

            const modalId = `modal_admin_team|${ownerId}`;
            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Crear Equipo');

            const nLabel = new LabelBuilder()
                .setLabel('Nombre del Equipo')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('nombre')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Ej: Los Galácticos')
                        .setRequired(true)
                );

            const fileInput = new FileUploadBuilder()
                .setCustomId('logo')
                .setMaxValues(1)
                .setRequired(true);

            const labelInput = new LabelBuilder()
                .setLabel("Escudo / Logo")
                .setDescription("Sube una imagen para el escudo de tu equipo")
                .setFileUploadComponent(fileInput);

            modal.addLabelComponents(nLabel, labelInput);

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                filter: i => i.customId === modalId && i.user.id === interaction.user.id,
                time: 60000
            }).catch(() => null);

            if (modalSubmit) {
                const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
                const attachmentField = modalSubmit.fields.getField("logo");
                const attachmentUrl = attachmentField?.attachments.first()?.url;

                if (!attachmentUrl) {
                    return modalSubmit.reply({ content: '❌ Debes subir un logo para el equipo.', flags: 64 });
                }

                await modalSubmit.deferReply({ flags: 64 });
                const localPath = await descargarImagen(attachmentUrl, `${torneo.prefix}_team_${ownerId}`);
                
                const nuevoEquipo = {
                    nombre: nombreIngresado,
                    avatar: localPath || ownerUser.displayAvatarURL({ extension: 'png' }),
                    propietario: ownerId,
                    miembros: [],
                    puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
                };

                torneo.equipos.push(nuevoEquipo);
                await torneo.save();

                await modalSubmit.editReply({ content: `✅ **Equipo registrado:** **${nombreIngresado}** se ha unido al torneo. El propietario es <@${ownerId}>.` });
                await msg.delete().catch(() => {});
            }
        });
        return;
    }

    // Flujo Individual
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
        const nLabel = new LabelBuilder()
            .setLabel(label)
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('nombre')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ej: Argentina / Real Madrid')
                    .setRequired(true)
            );

        if (torneo.tipoJugadores === 'teams') {
            const fileInput = new FileUploadBuilder().setCustomId('logo').setMaxValues(1).setRequired(true);
            const labelInput = new LabelBuilder().setLabel("Logo").setDescription("Subi una imagen para usarla como logo del equipo").setFileUploadComponent(fileInput);
            modal.addLabelComponents(nLabel, labelInput);
        } else {
            modal.addLabelComponents(nLabel);
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
            await msg.delete().catch(() => {});
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

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generarDuelosIndividuales(equipoLocal, equipoVisitante) {
    if (!equipoLocal.miembros || !equipoVisitante.miembros) return [];
    
    const localPlayers = shuffle([...equipoLocal.miembros]);
    const visitantePlayers = shuffle([...equipoVisitante.miembros]);
    const n = Math.min(localPlayers.length, visitantePlayers.length);

    return Array.from({ length: n }, (_, i) => ({
        localJugador: localPlayers[i].discordId,
        localJugadorNombre: localPlayers[i].nombre || localPlayers[i].discordId,
        visitanteJugador: visitantePlayers[i].discordId,
        visitanteJugadorNombre: visitantePlayers[i].nombre || visitantePlayers[i].discordId,
        golesLocal: null,
        golesVisitante: null,
        finalizado: false,
    }));
}

async function handleSelfInscripcion(client, message, args, torneo) {
    if (torneo.estado !== 'Inscripcion') {
        return message.reply('❌ La inscripción para este torneo no está abierta.');
    }
    if (!torneo.inscripcionAbierta) {
        return message.reply('❌ La auto-inscripción está deshabilitada en este torneo.');
    }

    const userId = message.author.id;
    const yaInscrito = torneo.equipos.some(e => {
        if (torneo.tipoCompeticion === 'duo') {
            return e.miembros?.some(m => m.discordId === userId) || e.discordId === userId;
        }
        if (torneo.tipoCompeticion === 'equipos') {
            return e.propietario === userId || e.miembros?.some(m => m.discordId === userId) || e.discordId === userId;
        }
        return e.discordId === userId;
    });

    if (yaInscrito) {
        return message.reply('❌ Ya estás inscrito o formas parte de un equipo en este torneo.');
    }

    if (torneo.equipos.length >= torneo.cantidadParticipantes) {
        return message.reply('❌ El torneo ya ha alcanzado el límite máximo de participantes.');
    }

    if (torneo.tipoCompeticion === 'duo') {
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`self_select_partner|${torneo.prefix}`)
                .setPlaceholder('Selecciona a tu pareja (compañero)...')
        );

        const msg = await message.reply({
            content: '👥 **Inscripción en Duo**\nPor favor, selecciona a tu compañero de juego del menú:',
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 60000
        });

        collector.on('collect', async interaction => {
            const partnerId = interaction.values[0];
            if (partnerId === userId) {
                return interaction.reply({ content: '❌ No puedes elegirte a ti mismo como compañero.', flags: 64 });
            }

            const partnerUser = interaction.users.get(partnerId);

            const partnerInscrito = torneo.equipos.some(e => 
                e.miembros?.some(m => m.discordId === partnerId) ||
                e.discordId === partnerId
            );

            if (partnerInscrito) {
                return interaction.reply({ content: `❌ **${partnerUser.username}** ya está registrado en el torneo.`, flags: 64 });
            }

            const modalId = `modal_self_duo|${partnerId}`;
            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Registrar Pareja (Duo)');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('nombre')
                        .setLabel('Nombre del Duo')
                        .setValue(`${message.author.username} & ${partnerUser.username}`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                filter: i => i.customId === modalId && i.user.id === interaction.user.id,
                time: 60000
            }).catch(() => null);

            if (modalSubmit) {
                const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
                await modalSubmit.deferReply({ flags: 64 });

                const nuevoDuo = {
                    nombre: nombreIngresado,
                    miembros: [
                        { discordId: userId, avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }) },
                        { discordId: partnerId, avatar: partnerUser.displayAvatarURL({ extension: 'png', size: 128 }) }
                    ],
                    puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
                };

                torneo.equipos.push(nuevoDuo);
                await torneo.save();

                await modalSubmit.editReply({ content: `✅ **Inscripción de Duo Exitosa:** Te has inscrito junto a **${partnerUser.tag}** como **${nombreIngresado}**.` });
                await msg.delete().catch(() => {});
            }
        });
        return;
    }

    if (torneo.tipoCompeticion === 'equipos') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`self_create_team_btn|${torneo.prefix}`)
                .setLabel('Registrar Equipo')
                .setStyle(ButtonStyle.Success)
        );

        const msg = await message.reply({
            content: '⚔️ **Inscripción por Equipos**\nPresiona el botón para abrir el formulario y registrar tu equipo:',
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 60000
        });

        collector.on('collect', async interaction => {
            const modalId = `modal_self_team|${torneo.prefix}`;
            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Registrar mi Equipo');

            const nLabel = new LabelBuilder()
                .setLabel('Nombre del Equipo')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('nombre')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Ej: Los Intocables')
                        .setRequired(true)
                );

            const fileInput = new FileUploadBuilder()
                .setCustomId('logo')
                .setMaxValues(1)
                .setRequired(true);

            const labelInput = new LabelBuilder()
                .setLabel("Escudo / Logo")
                .setDescription("Sube la imagen para el logo de tu equipo")
                .setFileUploadComponent(fileInput);

            modal.addLabelComponents(nLabel, labelInput);

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                filter: i => i.customId === modalId && i.user.id === interaction.user.id,
                time: 60000
            }).catch(() => null);

            if (modalSubmit) {
                const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
                const attachmentField = modalSubmit.fields.getField("logo");
                const attachmentUrl = attachmentField?.attachments.first()?.url;

                if (!attachmentUrl) {
                    return modalSubmit.reply({ content: '❌ Debes subir una imagen para el escudo de tu equipo.', flags: 64 });
                }

                await modalSubmit.deferReply({ flags: 64 });
                const localPath = await descargarImagen(attachmentUrl, `${torneo.prefix}_team_${userId}`);

                const nuevoEquipo = {
                    nombre: nombreIngresado,
                    avatar: localPath || message.author.displayAvatarURL({ extension: 'png' }),
                    propietario: userId,
                    miembros: [
                        { discordId: userId, nombre: message.author.username, avatar: message.author.displayAvatarURL({ extension: 'png' }) }
                    ],
                    puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
                };

                torneo.equipos.push(nuevoEquipo);
                await torneo.save();

                await modalSubmit.editReply({ content: `✅ **Inscripción de Equipo Exitosa:** Has creado y registrado el equipo **${nombreIngresado}**.` });
                await msg.delete().catch(() => {});
            }
        });
        return;
    }

    if (torneo.tipoJugadores === 'users') {
        const nuevoEquipo = {
            nombre: message.author.username,
            discordId: userId,
            avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
            puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
        };

        torneo.equipos.push(nuevoEquipo);
        await torneo.save();
        return message.reply(`✅ **Inscripción Exitosa:** Te has inscrito como **${message.author.username}**.`);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`self_register_indiv_btn|${torneo.prefix}`)
            .setLabel('Completar Inscripción')
            .setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({
        content: `👤 **Inscripción Individual (${torneo.tipoJugadores === 'countries' ? 'País' : 'Equipo'})**\nPresiona el botón para ingresar tu nombre y detalles:`,
        components: [row]
    });

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 60000
    });

    collector.on('collect', async interaction => {
        const modalId = `modal_self_indiv|${torneo.prefix}`;
        const modal = new ModalBuilder().setCustomId(modalId).setTitle('Completar Registro');

        const label = torneo.tipoJugadores === 'countries' ? 'Nombre del País' : 'Nombre del Equipo';
        const nLabel = new LabelBuilder()
            .setLabel(label)
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('nombre')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ej: Brasil / Barcelona')
                    .setRequired(true)
            );

        if (torneo.tipoJugadores === 'teams') {
            const fileInput = new FileUploadBuilder().setCustomId('logo').setMaxValues(1).setRequired(true);
            const labelInput = new LabelBuilder().setLabel("Escudo / Logo").setDescription("Sube la imagen para el logo").setFileUploadComponent(fileInput);
            modal.addLabelComponents(nLabel, labelInput);
        } else {
            modal.addLabelComponents(nLabel);
        }

        await interaction.showModal(modal);

        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === modalId && i.user.id === interaction.user.id,
            time: 60000
        }).catch(() => null);

        if (modalSubmit) {
            const nombreIngresado = modalSubmit.fields.getTextInputValue('nombre');
            let finalAvatar = message.author.displayAvatarURL({ extension: 'png', size: 128 });

            if (torneo.tipoJugadores === 'teams') {
                const attachmentField = modalSubmit.fields.getField("logo");
                const attachmentUrl = attachmentField?.attachments.first()?.url;
                if (attachmentUrl) {
                    const localPath = await descargarImagen(attachmentUrl, `${torneo.prefix}_${userId}`);
                    if (localPath) finalAvatar = localPath;
                }
            } else if (torneo.tipoJugadores === 'countries') {
                const flagUrl = getFlagUrl(nombreIngresado);
                if (flagUrl) finalAvatar = flagUrl;
            }

            await modalSubmit.deferReply({ flags: 64 });

            const nuevoEquipo = {
                nombre: nombreIngresado,
                discordId: userId,
                avatar: finalAvatar,
                puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0
            };

            torneo.equipos.push(nuevoEquipo);
            await torneo.save();

            await modalSubmit.editReply({ content: `✅ **Inscripción Exitosa:** Te has inscrito como **${nombreIngresado}**.` });
            await msg.delete().catch(() => {});
        }
    });
}

async function handleAgregarMiembro(client, message, args, torneo) {
    if (torneo.tipoCompeticion !== 'equipos') {
        return message.reply('❌ Este comando solo está disponible en torneos de **Equipos**.');
    }

    const userId = message.author.id;
    const isAdmin = message.member.permissions.has('Administrator');
    const miEquipo = torneo.equipos.find(e => e.propietario === userId);

    if (!miEquipo && !isAdmin) {
        return message.reply('❌ No eres el propietario de ningún equipo registrado en este torneo.');
    }

    let equipoTarget = miEquipo;

    if (isAdmin && torneo.equipos.length > 0) {
        if (!equipoTarget) {
            const rowSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`admin_select_target_team|${torneo.prefix}`)
                    .setPlaceholder('Selecciona el equipo al que agregar el miembro...')
                    .addOptions(torneo.equipos.map(e => ({
                        label: e.nombre,
                        value: e.propietario,
                        description: `Propietario ID: ${e.propietario}`
                    })))
            );

            const msgSelect = await message.reply({
                content: '⚙️ **Selección de Equipo (Administrador)**\nPor favor, selecciona a qué equipo deseas agregar el miembro:',
                components: [rowSelect]
            });

            const iSelect = await msgSelect.awaitMessageComponent({ time: 30000 }).catch(() => null);
            if (!iSelect) return;

            equipoTarget = torneo.equipos.find(e => e.propietario === iSelect.values[0]);
            await iSelect.deferUpdate();
            await msgSelect.delete().catch(() => {});
        }
    }

    if (!equipoTarget) {
        return message.reply('❌ No se ha podido determinar el equipo objetivo.');
    }

    const limitMax = torneo.equipoConfig?.maxJugadores || 5;
    if (equipoTarget.miembros && equipoTarget.miembros.length >= limitMax) {
        return message.reply(`❌ El equipo **${equipoTarget.nombre}** ya alcanzó el límite máximo de **${limitMax}** jugadores.`);
    }

    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(`select_new_member|${torneo.prefix}`)
            .setPlaceholder('Selecciona al usuario para agregar al equipo...')
    );

    const msg = await message.reply({
        content: `👥 **Agregar miembro a ${equipoTarget.nombre}**\nSelecciona al usuario que deseas agregar:`,
        components: [row]
    });

    const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 60000
    });

    collector.on('collect', async interaction => {
        const selectedId = interaction.values[0];
        const selectedUser = interaction.users.get(selectedId);

        const yaRegistrado = torneo.equipos.some(e =>
            e.miembros?.some(m => m.discordId === selectedId) ||
            e.propietario === selectedId ||
            e.discordId === selectedId
        );

        if (yaRegistrado) {
            return interaction.reply({ content: `❌ **${selectedUser.username}** ya está registrado en este torneo o forma parte de un equipo.`, flags: 64 });
        }

        if (!equipoTarget.miembros) equipoTarget.miembros = [];
        equipoTarget.miembros.push({
            discordId: selectedId,
            nombre: selectedUser.username,
            avatar: selectedUser.displayAvatarURL({ extension: 'png', size: 128 })
        });

        await torneo.save();

        await interaction.reply({ content: `✅ **Miembro agregado con éxito:** **${selectedUser.tag}** se ha unido a **${equipoTarget.nombre}**.` });
        await msg.delete().catch(() => {});
    });
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

    const partidosRender = await Promise.all(enfs.map(async e => {
        const localNombre = e.local || e.equipo1?.nombre;
        const visitanteNombre = e.visitante || e.equipo2?.nombre;
        
        const teamL = torneo.equipos.find(eq => eq.nombre === localNombre);
        const teamV = torneo.equipos.find(eq => eq.nombre === visitanteNombre);

        let resText = 'Pendiente';
        if (fase.type === 'bracket' && torneo.tipoEncuentro === 'ida_vuelta') {
            const resParts = [];
            if (e.ida?.finalizado) resParts.push(`${e.ida.golesLocal}-${e.ida.golesVisitante}`);
            if (e.vuelta?.finalizado) resParts.push(`${e.vuelta.golesLocal}-${e.vuelta.golesVisitante}`);
            if (e.desempate?.finalizado) resParts.push(`(${e.desempate.golesLocal}-${e.desempate.golesVisitante})`);
            
            if (resParts.length > 0) {
                resText = resParts.join(' / ');
            } else if (e.resultado && (e.ganador || e.completado)) {
                resText = e.resultado; // Fallback
            }
        } else {
            if (e.ganador || e.completado || e.ida?.finalizado) {
                if (e.resultado) resText = e.resultado;
                else if (e.ida?.finalizado) resText = `${e.ida.golesLocal}-${e.ida.golesVisitante}`;
            }
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
            avatarL: await getAvatarBase64(teamL?.avatar || e.equipo1?.avatar),
            avatarV: await getAvatarBase64(teamV?.avatar || e.equipo2?.avatar),
            ida: e.ida,
            vuelta: e.vuelta,
            desempate: e.desempate,
            duelosIndividuales: e.duelosIndividuales
        };
    }));

    const key = `fixture_${fase.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const buffer = await getCachedImage(
        torneo.prefix,
        key,
        { partidos: partidosRender, tema: torneo.tema, titulo: torneo.nombre, subtitulo: fase.name },
        () => generarFixtureImagen({
            titulo: torneo.nombre,
            subtitulo: fase.name,
            partidos: partidosRender,
            tema: torneo.tema
        })
    );

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

async function getAvatarBase64(avatarUrl) {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http')) return avatarUrl;
    try {
        if (existsSync(avatarUrl)) {
            const buffer = await readFile(avatarUrl);
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
        new ButtonBuilder().setCustomId(`gt_refresh|${torneo.prefix}`).setLabel('🔃').setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gt_publicar|${torneo.prefix}`).setLabel('📢 Publicar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gt_reiniciar_fase|${torneo.prefix}`).setLabel('⏪ Reiniciar Fase').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`gt_historial|${torneo.prefix}`).setLabel('📜 Historial').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gt_inscripcion_embed|${torneo.prefix}`).setLabel('📣 Inscripción').setStyle(ButtonStyle.Success),
    );

    const panelMsg = await message.reply({ embeds: [embed], components: [row1, row2, row3] });

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
            case 'gt_publicar':
                await handlePublicarActualizacion(i, freshTorneo);
                break;
            case 'gt_reiniciar_fase':
                await handleReiniciarFase(i, freshTorneo);
                break;
            case 'gt_historial':
                await handleHistorial(i, freshTorneo);
                break;
            case 'gt_inscripcion_embed':
                await handleInscripcionEmbed(i, freshTorneo);
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
    const nLabel = new LabelBuilder()
        .setLabel('Nuevo Nombre')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('nombre')
                .setStyle(TextInputStyle.Short)
                .setValue(equipo.nombre)
                .setRequired(true)
        );

    if (torneo.tipoJugadores === 'teams') {
        const fileInput = new FileUploadBuilder().setCustomId('logo').setMaxValues(1).setRequired(false);
        const labelInput = new LabelBuilder().setLabel("Nuevo Logo (Opcional)").setFileUploadComponent(fileInput);
        modal.addLabelComponents(nLabel, labelInput);
    } else {
        modal.addLabelComponents(nLabel);
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

    let tipoMatch = 'unico';
    let targetInteraction = sel;

    if (!esGrupo && torneo.tipoEncuentro === 'ida_vuelta') {
        const subSelect = new StringSelectMenuBuilder().setCustomId('gt_sel_t_res_internal').setPlaceholder('¿Qué partido?').addOptions([
            { label: 'IDA', value: 'ida' }, { label: 'VUELTA', value: 'vuelta' }, { label: 'DESEMPATE', value: 'desempate' }
        ]);
        await sel.update({ content: `📊 Partido para: **${localNombre} vs ${visitanteNombre}**`, components: [new ActionRowBuilder().addComponents(subSelect)] });
        const selTipo = await resp.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
        if (!selTipo) return;
        tipoMatch = selTipo.values[0];
        targetInteraction = selTipo;
    }

    const glName = (tipoMatch === 'vuelta') ? visitanteNombre : localNombre;
    const gvName = (tipoMatch === 'vuelta') ? localNombre : visitanteNombre;

    const modal = new ModalBuilder()
        .setCustomId(`modal_res_admin_internal`)
        .setTitle(`${tipoMatch.toUpperCase()}: ${glName} vs ${gvName}`.slice(0, 45));

    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gl').setLabel(`Goles de ${glName}`).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gv').setLabel(`Goles de ${gvName}`).setStyle(TextInputStyle.Short).setRequired(true))
    );

    await targetInteraction.showModal(modal);
    const submit = await interaction.awaitModalSubmit({ time: 60000 }).catch(() => null);
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
            let matchObj = null;
            if (tipoMatch === 'unico' || tipoMatch === 'ida') matchObj = m.ida;
            else if (tipoMatch === 'vuelta') matchObj = m.vuelta;
            else if (tipoMatch === 'desempate') matchObj = m.desempate;

            if (matchObj) {
                matchObj.golesLocal = gl; matchObj.golesVisitante = gv; matchObj.finalizado = true;
                m.resultado = `${gl}-${gv}`; // Legacy fallback for simple views
                
                if (tipoMatch === 'unico') {
                    if (gl > gv) m.ganador = m.equipo1.discordId; else if (gv > gl) m.ganador = m.equipo2.discordId; else m.ganador = m.equipo1.discordId;
                } else {
                    const { determinarGanadorLlave } = await import('../../utils/generarBracket.js');
                    const ganador = determinarGanadorLlave(m);
                    if (ganador) m.ganador = ganador;
                }
            }
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
            
            // Si es torneo de equipos, generar duelos individuales para la primera fase de eliminación directa
            if (torneo.tipoCompeticion === 'equipos') {
                const primeraFase = data.fasesEliminatoria[0];
                const matchesR1 = data.llaves[primeraFase];
                matchesR1.forEach(m => {
                    if (m.equipo1.discordId && m.equipo2.discordId && m.equipo2.discordId !== 'BYE') {
                        const eqL = torneo.equipos.find(e => e.propietario === m.equipo1.discordId || e.discordId === m.equipo1.discordId);
                        const eqV = torneo.equipos.find(e => e.propietario === m.equipo2.discordId || e.discordId === m.equipo2.discordId);
                        if (eqL && eqV) {
                            m.duelosIndividuales = generarDuelosIndividuales(eqL, eqV);
                        }
                    }
                });
            }

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
                        const eqL = torneo.equipos.find(e => e.nombre === p.localNombre);
                        const eqV = torneo.equipos.find(e => e.nombre === p.visitanteNombre);
                        const duelos = (torneo.tipoCompeticion === 'equipos' && eqL && eqV) ? generarDuelosIndividuales(eqL, eqV) : [];

                        matches.push({
                            local: p.localNombre,
                            visitante: p.visitanteNombre,
                            resultado: 'Pendiente',
                            ganador: null,
                            completado: false,
                            fecha: fIdx + 1,
                            duelosIndividuales: duelos
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
    const fresh = await Torneo.findOne({ prefix: torneo.prefix });

    if (fresh.gruposHabilitados && Object.keys(fresh.llaves || {}).length === 0) {
        if (fresh.enfrentamientosGrupos.some(e => !e.completado)) {
            return interaction.reply({ content: '❌ No puedes avanzar fase hasta terminar todos los partidos de grupos.', flags: 64 });
        }

        if (fresh.playoffsHabilitados) {
            const tabla = fresh.equipos.sort((a, b) => b.puntos - a.puntos || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
            
            let n = Math.pow(2, Math.floor(Math.log2(tabla.length)));
            if (n === tabla.length && n > 2) n = n / 2;
            if (n < 2) n = 2;

            const clasificados = tabla.slice(0, n);
            const { default: genBracket } = await import('../../utils/generarBracket.js');
            const data = genBracket(clasificados, fresh.tipoEncuentro);
            
            // Si es torneo de equipos, generar duelos individuales para la primera fase de eliminación directa
            if (fresh.tipoCompeticion === 'equipos') {
                const primeraFase = data.fasesEliminatoria[0];
                const matchesR1 = data.llaves[primeraFase];
                matchesR1.forEach(m => {
                    if (m.equipo1.discordId && m.equipo2.discordId && m.equipo2.discordId !== 'BYE') {
                        const eqL = fresh.equipos.find(e => e.propietario === m.equipo1.discordId || e.discordId === m.equipo1.discordId);
                        const eqV = fresh.equipos.find(e => e.propietario === m.equipo2.discordId || e.discordId === m.equipo2.discordId);
                        if (eqL && eqV) {
                            m.duelosIndividuales = generarDuelosIndividuales(eqL, eqV);
                        }
                    }
                });
            }

            fresh.llaves = data.llaves;
            fresh.fasesEliminatoria = data.fasesEliminatoria;
            fresh.faseActual = 0;

            await fresh.save();
            return interaction.reply({ content: `✅ **Fase de grupos finalizada.** Se generaron los brackets para los **${n}** mejores equipos. Siguiente fase: **${fresh.fasesEliminatoria[0]}**`, flags: 64 });
        } else {
            fresh.estado = 'Finalizado';
            await fresh.save();
            return interaction.reply({ content: '🏆 **¡La fase de grupos (liga) ha finalizado!** El torneo ha terminado.', flags: 64 });
        }
    } else {
        if (!fresh.fasesEliminatoria || fresh.fasesEliminatoria.length === 0) {
            return interaction.reply({ content: '❌ No hay fases eliminatorias configuradas.', flags: 64 });
        }

        const fase = fresh.fasesEliminatoria[fresh.faseActual];
        const matches = fresh.llaves[fase] || [];
        
        if (matches.some(m => !m.ganador && m.equipo2.discordId !== 'BYE')) {
            return interaction.reply({ content: `❌ Todos los partidos de la fase **${fase}** deben tener un ganador para poder avanzar.`, flags: 64 });
        }

        const { avanzarFase } = await import('../../utils/generarBracket.js');
        const sgte = avanzarFase(fresh);

        if (!sgte) {
            fresh.estado = 'Finalizado';
            await fresh.save();
            
            const embed = EmbedBuilder.from(panelMsg.embeds[0]).setDescription(`**Estado:** Finalizado\n**Fase Actual:** Completado\n**Prefijo:** \`${fresh.prefix}\``);
            await panelMsg.edit({ embeds: [embed], components: [] });
            
            return interaction.reply({ content: '🏆 **¡El torneo ha finalizado!** Se ha completado la gran final.', flags: 64 });
        } else {
            // Si es un torneo de equipos, generar duelos individuales para la nueva fase
            if (fresh.tipoCompeticion === 'equipos') {
                const nextMatches = fresh.llaves[sgte] || [];
                nextMatches.forEach(m => {
                    if (m.equipo1.discordId && m.equipo2.discordId && m.equipo2.discordId !== 'BYE') {
                        const eqL = fresh.equipos.find(e => e.propietario === m.equipo1.discordId || e.discordId === m.equipo1.discordId);
                        const eqV = fresh.equipos.find(e => e.propietario === m.equipo2.discordId || e.discordId === m.equipo2.discordId);
                        if (eqL && eqV) {
                            m.duelosIndividuales = generarDuelosIndividuales(eqL, eqV);
                        }
                    }
                });
            }

            await fresh.save();
            return interaction.reply({ content: `✅ Fase avanzada con éxito. Se generaron los cruces de **${sgte}**.`, flags: 64 });
        }
    }
}

async function handlePublicarActualizacion(interaction, torneo) {
    if (!torneo.canalResultados) {
        return interaction.reply({ content: '❌ No hay canal de resultados configurado.', flags: 64 });
    }
    const canal = await interaction.client.channels.fetch(torneo.canalResultados).catch(() => null);
    if (!canal) {
        return interaction.reply({ content: '❌ Canal de resultados no encontrado o inaccesible.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const esDirecta = torneo.formatoPreset === 'directa';
        let files = [];
        let embed = new EmbedBuilder()
            .setTitle(`📢 Actualización — ${torneo.nombre}`)
            .setColor(torneo.tema.acento)
            .setTimestamp();

        if (torneo.logo) {
            embed.setThumbnail(torneo.logo);
        }

        // 1. Tabla de posiciones (si no es directa y hay equipos)
        if (!esDirecta && torneo.equipos?.length > 0) {
            const tabla = await Promise.all(torneo.equipos.map(async e => ({
                nombre: e.nombre,
                avatar: await getAvatarBase64(e.avatar),
                pj: e.pj || 0, pg: e.pg || 0, pe: e.pe || 0, pp: e.pp || 0,
                gf: e.gf || 0, gc: e.gc || 0, puntos: e.puntos || 0
            })));
            tabla.sort((a,b) => b.puntos - a.puntos || (b.gf-b.gc) - (a.gf-a.gc));

            const png = await getCachedImage(
                torneo.prefix,
                'tabla',
                { equipos: torneo.equipos, tema: torneo.tema, nombre: torneo.nombre, logo: torneo.logo },
                () => generarTablaImagenCopa(torneo, tabla, torneo.nombre)
            );
            files.push(new AttachmentBuilder(png, { name: 'tabla.png' }));
            embed.setImage('attachment://tabla.png');
        }

        // 2. Últimos 5 resultados del historial
        const ultimos = torneo.historialResultados?.slice(-5).reverse() || [];
        const resultadosTexto = ultimos.map(r =>
            `**${r.partido}**: ${r.resultado} — por <@${r.cargadoPor}>`
        ).join('\n') || 'Sin resultados recientes.';
        embed.setDescription(`### Últimos Resultados:\n${resultadosTexto}`);

        await canal.send({ embeds: [embed], files });
        await interaction.editReply({ content: '✅ Actualización publicada con éxito en el canal configurado.' });
    } catch (e) {
        console.error('[Gestion] Error en handlePublicarActualizacion:', e);
        await interaction.editReply({ content: '❌ Ocurrió un error al publicar la actualización.' });
    }
}

async function handleReiniciarFase(interaction, torneo) {
    if (torneo.faseActual === 0 && !torneo.gruposHabilitados) {
        return interaction.reply({ content: '❌ No hay fase anterior a la que volver.', flags: 64 });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_reset_yes').setLabel('Confirmar Reinicio').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('confirm_reset_no').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    );

    const faseNombre = torneo.fasesEliminatoria?.[torneo.faseActual] || (torneo.gruposHabilitados ? 'Fase de Grupos' : 'Configuración');

    const resp = await interaction.reply({
        content: `⚠️ **¿Estás seguro de reiniciar la fase actual (${faseNombre})?** Esto regenerará los cruces de esta fase y se perderán los resultados cargados en la misma.`,
        components: [row],
        flags: 64
    });

    const btn = await resp.awaitMessageComponent({ time: 30000 }).catch(() => null);
    if (btn?.customId !== 'confirm_reset_yes') {
        return btn?.update({ content: 'Acción cancelada.', components: [] });
    }

    await btn.deferUpdate();

    if (torneo.faseActual > 0) {
        const faseAnterior = torneo.fasesEliminatoria[torneo.faseActual - 1];
        const faseActual = torneo.fasesEliminatoria[torneo.faseActual];
        
        // Limpiar llaves de la fase actual
        if (torneo.llaves && torneo.llaves[faseActual]) {
            torneo.llaves[faseActual] = torneo.llaves[faseActual].map(m => ({
                ...m,
                equipo1: { nombre: 'TBD', discordId: null },
                equipo2: { nombre: 'TBD', discordId: null },
                ida: { golesLocal: null, golesVisitante: null, finalizado: false },
                vuelta: m.vuelta ? { golesLocal: null, golesVisitante: null, finalizado: false } : null,
                desempate: m.desempate ? { golesLocal: null, golesVisitante: null, finalizado: false } : null,
                ganador: null,
                resultado: null,
                completado: false
            }));
        }
        
        // Reactivar llaves de la fase anterior (volver a poner ganador: null)
        if (torneo.llaves && torneo.llaves[faseAnterior]) {
            torneo.llaves[faseAnterior] = torneo.llaves[faseAnterior].map(m => ({
                ...m,
                ganador: null,
                resultado: null,
                completado: false,
                ida: { ...m.ida, finalizado: false, golesLocal: null, golesVisitante: null },
                vuelta: m.vuelta ? { ...m.vuelta, finalizado: false, golesLocal: null, golesVisitante: null } : null,
                desempate: m.desempate ? { ...m.desempate, finalizado: false, golesLocal: null, golesVisitante: null } : null
            }));
        }
        
        torneo.faseActual--;
    } else if (torneo.gruposHabilitados) {
        // Si estaba en la primera fase de eliminación directa y el torneo habilitó grupos, volvemos a grupos!
        torneo.llaves = {};
        torneo.fasesEliminatoria = [];
        torneo.faseActual = 0;
        
        // Limpiar enfrentamientos de grupo para que vuelvan a estar pendientes
        torneo.enfrentamientosGrupos = torneo.enfrentamientosGrupos.map(m => ({
            ...m,
            golesLocal: null,
            golesVisitante: null,
            ganador: null,
            completado: false
        }));
    }

    await torneo.save();
    
    // Invalidar toda la caché del torneo para que se refresque
    const { invalidateCache } = await import('../../utils/visual/imageCache.js');
    invalidateCache(torneo.prefix);

    const faseNueva = torneo.fasesEliminatoria?.[torneo.faseActual] || (torneo.gruposHabilitados ? 'Fase de Grupos' : 'Configuración');
    await btn.editReply({ content: `✅ **Fase reiniciada.** Ahora estás en: **${faseNueva}**`, components: [] });
}

async function handleHistorial(interaction, torneo) {
    const hist = torneo.historialResultados || [];
    const ultimos = hist.slice(-20).reverse();
    
    if (!ultimos.length) {
        return interaction.reply({ content: '📜 Aún no hay registros de resultados en el historial de este torneo.', flags: 64 });
    }

    const texto = ultimos.map((h, i) =>
        `\`${new Date(h.timestamp).toLocaleDateString()}\` **${h.partido}** (\`${h.tipo || 'único'}\`) ➔ **${h.resultado}** — por <@${h.cargadoPor}>`
    ).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`📜 Historial de Resultados — ${torneo.nombre}`)
        .setDescription(texto)
        .setColor(torneo.tema.acento)
        .setFooter({ text: `Mostrando los últimos ${ultimos.length} registros` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleInscripcionEmbed(interaction, torneo) {
    if (!torneo.canalResultados) {
        return interaction.reply({ content: '❌ No hay canal de resultados configurado. Configure un canal primero.', flags: 64 });
    }
    const canal = await interaction.client.channels.fetch(torneo.canalResultados).catch(() => null);
    if (!canal) {
        return interaction.reply({ content: '❌ Canal de resultados no encontrado.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const plazasLibres = torneo.cantidadParticipantes - torneo.equipos.length;
        
        const embed = new EmbedBuilder()
            .setTitle(`📣 ¡Inscripciones Abiertas! — ${torneo.nombre}`)
            .setDescription(
                `¡Te invitamos a inscribirte en este emocionante torneo!\n\n` +
                `**Información del Torneo:**\n` +
                `> 🏆 **Nombre:** ${torneo.nombre}\n` +
                `> ⚔️ **Modo:** \`${torneo.tipoCompeticion.toUpperCase()}\`\n` +
                `> 👥 **Plazas Disponibles:** **${plazasLibres}** libres de ${torneo.cantidadParticipantes}\n` +
                `> 🔑 **Prefijo:** \`${torneo.prefix}\``
            )
            .setColor(torneo.tema.acento)
            .setTimestamp();

        if (torneo.logo) {
            embed.setThumbnail(torneo.logo);
        }

        const button = new ButtonBuilder()
            .setCustomId(`autojoin_${torneo.prefix}`)
            .setLabel('🎮 Inscribirme')
            .setStyle(ButtonStyle.Success)
            .setDisabled(plazasLibres <= 0 || torneo.estado !== 'Inscripcion');

        const row = new ActionRowBuilder().addComponents(button);

        await canal.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Embed de inscripción publicado correctamente en el canal de resultados.' });
    } catch (e) {
        console.error('[Gestion] Error en handleInscripcionEmbed:', e);
        await interaction.editReply({ content: '❌ Ocurrió un error al publicar el embed de inscripción.' });
    }
}
