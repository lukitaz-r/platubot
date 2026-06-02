import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder, 
    ChannelSelectMenuBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    AttachmentBuilder,
    FileUploadBuilder,
    LabelBuilder
} from 'discord.js';
import Torneo from '../../models/copas/Torneo.js';
import { generarPreviewTema, generarBracketCopa } from '../../utils/visual/copaVisualGenerator.js';
import { extractPalette } from '../../utils/visual/colorExtractor.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export default {
    name: 'copa-crear',
    aliases: ['crearcopa', 'nuevacopa'],
    desc: 'Asistente paso a paso para crear una nueva copa',
    permisos: ['Administrator'],

    data: new SlashCommandBuilder()
        .setName('copa-crear')
        .setDescription('Asistente paso a paso para crear una nueva copa'),

    execute: async (client, interaction) => {
        await runWizard(client, interaction, true);
    },

    run: async (client, message) => {
        await runWizard(client, message, false);
    }
};

async function runWizard(client, context, isInteraction) {
    const user = isInteraction ? context.user : context.author;
    let step = 1;
    let config = {
        nombre: '',
        prefix: '',
        canalResultados: null,
        cantidadParticipantes: 0,
        formatoPreset: 'personalizado',
        tipoEncuentro: 'unico', // 'unico', 'ida_vuelta', 'hibrido'
        tipoJugadores: 'users',
        tipoCompeticion: 'individual', // 'individual' | 'duo' | 'equipos'
        logo: null,
        inscripcionAbierta: true,
        equipoConfig: {
            minJugadores: 2,
            maxJugadores: 5,
        },
        hayTercerPuesto: false,
        tema: {
            primario: '#1a1a2e',
            secundario: '#16213e',
            acento: '#e94560',
            texto: '#ffffff',
            borde: '#0f3460',
        }
    };

    let msg = await context.reply({ 
        embeds: [new EmbedBuilder().setTitle('🏆 Asistente de Creación de Torneos').setDescription('Bienvenido. Vamos a configurar tu nuevo torneo paso a paso.\n\nPresiona el botón para empezar.').setColor('Blue')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_wizard').setLabel('Empezar').setStyle(ButtonStyle.Primary))]
    });

    const collector = msg.createMessageComponentCollector({ idle: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== user.id) return i.reply({ content: 'No puedes usar este asistente.', flags: 64 });

        try {
            if (i.customId === 'start_wizard' || i.customId === 'next_step') {
                await handleStep(i);
            } else if (i.customId === 'select_channel') {
                config.canalResultados = i.values[0];
                step = 3;
                await handleStep(i);
            } else if (i.customId === 'select_competition_type') {
                config.tipoCompeticion = i.values[0];
                if (config.tipoCompeticion === 'equipos') {
                    // Paso 3b: Modal de Configuración de Equipos
                    const modal = new ModalBuilder()
                        .setCustomId('modal_equipo_config')
                        .setTitle('Configuración de Equipos');

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('min_jugadores')
                                .setLabel('Mínimo de jugadores por equipo')
                                .setPlaceholder('Ej: 2')
                                .setValue('2')
                                .setRequired(true)
                                .setStyle(TextInputStyle.Short)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('max_jugadores')
                                .setLabel('Máximo de jugadores por equipo')
                                .setPlaceholder('Ej: 5')
                                .setValue('5')
                                .setRequired(true)
                                .setStyle(TextInputStyle.Short)
                        ),
                    );

                    await i.showModal(modal);
                    const submit = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
                    if (!submit) return;

                    const minJug = parseInt(submit.fields.getTextInputValue('min_jugadores'));
                    const maxJug = parseInt(submit.fields.getTextInputValue('max_jugadores'));
                    if (isNaN(minJug) || isNaN(maxJug) || minJug < 1 || maxJug < minJug) {
                        return submit.reply({ content: '❌ Valores de configuración inválidos.', flags: 64 });
                    }

                    config.equipoConfig = { minJugadores: minJug, maxJugadores: maxJug };
                    
                    step = 4;
                    await handleStep(submit);
                } else {
                    step = 4;
                    await handleStep(i);
                }
            } else if (i.customId === 'select_format') {
                config.formatoPreset = i.values[0];
                step = 6;
                await handleStep(i);
            } else if (i.customId === 'select_match_type') {
                config.tipoEncuentro = i.values[0];
                if (config.tipoCompeticion === 'equipos') {
                    config.tipoJugadores = 'teams'; // Asumido por defecto para equipos
                    step = 8; // Saltar paso 7 (Representación)
                } else {
                    step = 7;
                }
                await handleStep(i);
            } else if (i.customId === 'select_type') {
                config.tipoJugadores = i.values[0];
                step = 8;
                await handleStep(i);
            } else if (i.customId === 'third_place_yes') {
                config.hayTercerPuesto = true;
                step = 9;
                await handleStep(i);
            } else if (i.customId === 'third_place_no') {
                config.hayTercerPuesto = false;
                step = 9;
                await handleStep(i);
            } else if (i.customId === 'logo_upload_yes') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_logo_upload')
                    .setTitle('Subir Logo del Torneo');

                const fileInput = new FileUploadBuilder()
                    .setCustomId('logo')
                    .setRequired(true);

                const inputLabel = new LabelBuilder()
                    .setLabel("Escudo del Equipo")
                    .setFileUploadComponent(fileInput);

                modal.addLabelComponents(inputLabel);

                await i.showModal(modal);
                const submit = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
                if (!submit) return;

                const attachmentField = submit.fields.getField("logo");
                const attachmentUrl = attachmentField?.attachments.first()?.url;
                if (attachmentUrl && (attachmentUrl.startsWith('http://') || attachmentUrl.startsWith('https://'))) {
                    await submit.deferReply({ flags: 64 });
                    const localPath = await descargarImagen(attachmentUrl, `${config.prefix}_logo`);
                    if (localPath) {
                        config.logo = localPath;
                        
                        try {
                            const paleta = await extractPalette(localPath);
                            config.sugTema = paleta;

                            await submit.editReply({
                                embeds: [
                                    buildEmbed(
                                        `Paso 9c: Paleta de Colores Sugerida`, 
                                        `Hemos extraído la siguiente paleta de colores de tu logo:\n\n` +
                                        `• **Primario (Fondo):** \`${paleta.primario}\`\n` +
                                        `• **Secundario (Cajas):** \`${paleta.secundario}\`\n` +
                                        `• **Acento (Destacados):** \`${paleta.acento}\`\n` +
                                        `• **Borde:** \`${paleta.borde}\`\n` +
                                        `• **Texto:** \`${paleta.texto}\`\n\n` +
                                        `¿Deseas aplicar esta paleta sugerida o mantener la que configuraste anteriormente?`
                                    )
                                ],
                                components: [
                                    new ActionRowBuilder().addComponents(
                                        new ButtonBuilder().setCustomId('palette_apply_suggested').setLabel('Aplicar Sugerida').setStyle(ButtonStyle.Success),
                                        new ButtonBuilder().setCustomId('palette_keep_current').setLabel('Mantener Anterior').setStyle(ButtonStyle.Secondary)
                                    )
                                ]
                            });
                        } catch (err) {
                            console.error('Error al extraer paleta:', err);
                            step = 10;
                            await handleStep(submit);
                        }
                    } else {
                        step = 10;
                        await handleStep(submit);
                    }
                } else {
                    step = 10;
                    await handleStep(submit || i);
                }
            } else if (i.customId === 'logo_upload_no') {
                config.logo = null;
                step = 10;
                await handleStep(i);
            } else if (i.customId === 'palette_apply_suggested') {
                if (config.sugTema) {
                    config.tema = { ...config.tema, ...config.sugTema };
                }
                step = 10;
                await handleStep(i);
            } else if (i.customId === 'palette_keep_current') {
                step = 10;
                await handleStep(i);
            } else if (i.customId === 'edit_design') {
                step = 9;
                await handleStep(i);
            } else if (i.customId === 'confirm_torneo') {
                await saveTorneo(i);
                collector.stop();
            }
        } catch (error) {
            console.error('Error in wizard:', error);
        }
    });

    async function handleStep(i) {
        if (step === 1) {
            const modal = new ModalBuilder()
                .setCustomId('modal_step1')
                .setTitle('1. Nombre y Prefijo');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nombre').setLabel('Nombre del Torneo').setPlaceholder('Ej: Champions Platubi').setRequired(true).setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prefix').setLabel('Prefijo para comandos').setPlaceholder('Ej: cl').setRequired(true).setMaxLength(5).setStyle(TextInputStyle.Short))
            );

            await i.showModal(modal);
            const submit = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
            if (!submit) return;
            
            config.nombre = submit.fields.getTextInputValue('nombre');
            config.prefix = submit.fields.getTextInputValue('prefix').toLowerCase();
            step = 2;
            
            await submit.update({
                embeds: [buildEmbed(`Paso 2: Canal de Resultados`, `Selecciona el canal donde se reportarán los resultados y se verán las tablas.`)],
                components: [new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder().setCustomId('select_channel').setPlaceholder('Seleccionar canal...').addChannelTypes(ChannelType.GuildText)
                )]
            });
        } else if (step === 3) {
            await i.update({
                embeds: [buildEmbed(`Paso 3: Tipo de Competición`, `Selecciona cómo competirán los participantes:\n\n👤 **Individual:** Los jugadores se inscriben y juegan solos.\n👥 **Duo:** Se inscriben en parejas de 2 jugadores que juegan en simultáneo.\n⚔️ **Equipos:** Se inscriben equipos con roster, disputando enfrentamientos individuales al mejor de N.`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_competition_type')
                        .setPlaceholder('Seleccionar tipo de competición...')
                        .addOptions([
                            { label: 'Individual', value: 'individual', description: 'Cada jugador compite individualmente', emoji: '👤' },
                            { label: 'Duo', value: 'duo', description: '2 jugadores por cupo de inscripción', emoji: '👥' },
                            { label: 'Equipos', value: 'equipos', description: 'Equipos con roster (subpartidos al azar)', emoji: '⚔️' }
                        ])
                )]
            });
        } else if (step === 4) {
            const modal = new ModalBuilder()
                .setCustomId('modal_step4')
                .setTitle('4. Participantes');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cant').setLabel('Cantidad de participantes').setPlaceholder('Ej: 16').setRequired(true).setStyle(TextInputStyle.Short))
            );

            await i.showModal(modal);
            const submit = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
            if (!submit) return;

            const cant = parseInt(submit.fields.getTextInputValue('cant'));
            if (isNaN(cant) || cant < 2) return submit.reply({ content: 'Cantidad inválida.', flags: 64 });

            config.cantidadParticipantes = cant;
            step = 5;

            await submit.update({
                embeds: [buildEmbed(`Paso 5: Formato del Torneo`, `Selecciona el formato de competición:`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_format').setPlaceholder('Seleccionar formato...').addOptions([
                        { label: 'Champions League', value: 'champions', description: 'Liguilla -> Playoff -> Eliminatoria' },
                        { label: 'Eurocopa', value: 'euro', description: 'Grupos con mejores terceros' },
                        { label: 'Eliminación Directa', value: 'directa', description: 'Todos a brackets' },
                        { label: 'Personalizado', value: 'personalizado', description: 'Configuración manual de grupos y fases' }
                    ])
                )]
            });
        } else if (step === 6) {
            await i.update({
                embeds: [buildEmbed(`Paso 6: Tipo de Encuentro`, `Selecciona cómo se jugarán los partidos:`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_match_type').setPlaceholder('Seleccionar tipo de encuentro...').addOptions([
                        { label: 'Partido Único', value: 'unico', description: 'Un solo enfrentamiento por ronda' },
                        { label: 'Ida y Vuelta', value: 'ida_vuelta', description: 'Dos partidos (con desempate si aplica)' },
                        { label: 'Grupos (1) y Eliminatoria (2)', value: 'hibrido', description: 'Grupos a partido único y brackets a ida y vuelta' }
                    ])
                )]
            });
        } else if (step === 7) {
            await i.update({
                embeds: [buildEmbed(`Paso 7: Tipo de Participantes`, `¿Qué representarán los participantes?`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_type').setPlaceholder('Seleccionar tipo...').addOptions([
                        { label: 'Equipos', value: 'teams', description: 'Equipos con escudos' },
                        { label: 'Usuarios', value: 'users', description: 'Avatares de Discord' },
                        { label: 'Países', value: 'countries', description: 'Banderas' }
                    ])
                )]
            });
        } else if (step === 8) {
            await i.update({
                embeds: [buildEmbed(`Paso 8: Tercer Puesto`, `¿Habrá partido por el tercer puesto?`)],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('third_place_yes').setLabel('Sí').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('third_place_no').setLabel('No').setStyle(ButtonStyle.Danger)
                )]
            });
        } else if (step === 9) {
            const modal = new ModalBuilder()
                .setCustomId('modal_step9')
                .setTitle('9. Personalización Visual');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pri').setLabel('Color Primario (Fondo)').setValue(config.tema.primario).setPlaceholder('#1a1a2e').setRequired(true).setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sec').setLabel('Color Secundario (Cajas)').setValue(config.tema.secundario).setPlaceholder('#16213e').setRequired(true).setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('acc').setLabel('Color Acento (Destacados)').setValue(config.tema.acento).setPlaceholder('#e94560').setRequired(true).setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('txt').setLabel('Color de Texto').setValue(config.tema.texto).setPlaceholder('#ffffff').setRequired(true).setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bor').setLabel('Color de Borde').setValue(config.tema.borde).setPlaceholder('#0f3460').setRequired(true).setStyle(TextInputStyle.Short))
            );

            await i.showModal(modal);
            const submit = await i.awaitModalSubmit({ time: 120000 }).catch(() => null);
            if (!submit) return;

            config.tema.primario = submit.fields.getTextInputValue('pri');
            config.tema.secundario = submit.fields.getTextInputValue('sec');
            config.tema.acento = submit.fields.getTextInputValue('acc');
            config.tema.texto = submit.fields.getTextInputValue('txt');
            config.tema.borde = submit.fields.getTextInputValue('bor');

            await submit.update({
                embeds: [buildEmbed(`Paso 9b: Logo del Torneo (Opcional)`, `¿Deseas agregar un logo para el torneo?\n\nEste logo se colocará como thumbnail en los embeds y reemplazará al emoji de copa en las imágenes del fixture/bracket.`)],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('logo_upload_yes').setLabel('Subir Logo').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('logo_upload_no').setLabel('Continuar sin Logo').setStyle(ButtonStyle.Secondary)
                )]
            });
        } else if (step === 10) {
            // El usuario ya ingresó colores y logo. Mostrar resumen y generar previsualizaciones
            let updateTarget = i;
            if (i.deferred || i.replied) {
                // Si la interacción ya fue respondida/diferida, usamos editReply
                await i.editReply({
                    embeds: [buildEmbed(`Paso 10: Generando Previsualizaciones`, `Por favor espera mientras generamos las previsualizaciones visuales de tu torneo...`)],
                    components: [],
                    files: []
                });
            } else {
                await i.deferUpdate();
            }

            const [previewTabla, previewBrackets] = await Promise.all([
                generarPreviewTema(config.nombre, config.tema, config.logo),
                generarBracketCopa({ nombre: config.nombre, tema: config.tema, logo: config.logo })
            ]);

            const fileTabla = new AttachmentBuilder(previewTabla, { name: 'tabla.png' });
            const fileBrackets = new AttachmentBuilder(previewBrackets, { name: 'brackets.png' });

            const resumen = `**Nombre:** ${config.nombre}\n**Prefijo:** ${config.prefix}\n**Tipo Competición:** \`${config.tipoCompeticion}\`\n**Participantes:** ${config.cantidadParticipantes}\n**Formato:** ${config.formatoPreset}\n**Encuentros:** ${config.tipoEncuentro}\n**Tipo:** ${config.tipoJugadores}\n**Canal:** <#${config.canalResultados}>\n**3er Puesto:** ${config.hayTercerPuesto ? 'Sí' : 'No'}\n**Logo:** ${config.logo ? '✅ Subido' : '❌ No asignado'}`;

            const embedResumen = new EmbedBuilder()
                .setTitle('🏁 Resumen del Torneo')
                .setDescription(`Revisa los datos y el diseño antes de crear el torneo:\n\n${resumen}`)
                .setColor('Gold')
                .setImage('attachment://tabla.png');
            
            const embedBrackets = new EmbedBuilder()
                .setTitle('📊 Preview de Brackets')
                .setImage('attachment://brackets.png')
                .setColor('Gold');

            await i.editReply({
                embeds: [embedResumen, embedBrackets],
                files: [fileTabla, fileBrackets],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_torneo').setLabel('Crear Torneo').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('edit_design').setLabel('Editar Diseño').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('start_wizard').setLabel('Reiniciar Todo').setStyle(ButtonStyle.Secondary)
                )]
            });
        }
    }

    function buildEmbed(title, desc) {
        return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('Blue').setFooter({ text: `Paso ${step} de 10` });
    }

    async function saveTorneo(i) {
        await i.deferUpdate();
        
        if (config.formatoPreset === 'champions') {
            const total = config.cantidadParticipantes;
            config.championsConfig = {
                directos: Math.floor(total * 0.22) || 1,
                playoff: Math.floor(total * 0.44) || 2,
                eliminados: total - (Math.floor(total * 0.22) || 1) - (Math.floor(total * 0.44) || 2)
            };
            config.gruposHabilitados = false;
            config.tipoEncuentro = 'ida_vuelta';
        } else if (config.formatoPreset === 'euro') {
            config.gruposHabilitados = true;
            config.mejorTercero = true;
            config.cantidadGrupos = Math.ceil(config.cantidadParticipantes / 4);
            config.jugadoresPorGrupo = 4;
        } else if (config.tipoEncuentro === 'hibrido') {
            config.gruposHabilitados = true;
            config.cantidadGrupos = Math.ceil(config.cantidadParticipantes / 4);
            config.jugadoresPorGrupo = 4;
            config.tipoEncuentro = 'ida_vuelta';
        }

        config.estado = 'Inscripcion';
        config.createdBy = user.id;

        // Limpiar el tema sugerido temporal
        delete config.sugTema;

        await Torneo.create(config);

        await i.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ Torneo Creado').setDescription(`El torneo **${config.nombre}** ha sido creado exitosamente.\n\nAhora puedes usar los comandos:\n> \`!${config.prefix}-tabla\`\n> \`!${config.prefix}-fixture\`\n> \`!${config.prefix}-inscripcion\``).setColor('Green')],
            components: [],
            files: []
        });
    }
}

async function descargarImagen(url, filename) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const extension = url.split('.').pop().split('?')[0] || 'png';
        const dir = join(process.cwd(), 'assets', 'logos');
        await mkdir(dir, { recursive: true });
        const filePath = join(dir, `${filename}.${extension}`);
        await writeFile(filePath, buffer);
        return filePath; 
    } catch (e) {
        console.error('Error al descargar imagen:', e);
        return null;
    }
}
