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
    AttachmentBuilder
} from 'discord.js';
import Torneo from '../../models/copas/Torneo.js';
import { generarPreviewTema, generarBracketCopa } from '../../utils/visual/copaVisualGenerator.js';

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
            } else if (i.customId === 'select_format') {
                config.formatoPreset = i.values[0];
                step = 5;
                await handleStep(i);
            } else if (i.customId === 'select_match_type') {
                config.tipoEncuentro = i.values[0];
                step = 6;
                await handleStep(i);
            } else if (i.customId === 'select_type') {
                config.tipoJugadores = i.values[0];
                step = 7;
                await handleStep(i);
            } else if (i.customId === 'third_place_yes') {
                config.hayTercerPuesto = true;
                step = 8;
                await handleStep(i);
            } else if (i.customId === 'third_place_no') {
                config.hayTercerPuesto = false;
                step = 8;
                await handleStep(i);
            } else if (i.customId === 'edit_design') {
                step = 8;
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
            const modal = new ModalBuilder()
                .setCustomId('modal_step3')
                .setTitle('3. Participantes');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cant').setLabel('Cantidad de participantes').setPlaceholder('Ej: 16').setRequired(true).setStyle(TextInputStyle.Short))
            );

            await i.showModal(modal);
            const submit = await i.awaitModalSubmit({ time: 60000 }).catch(() => null);
            if (!submit) return;

            const cant = parseInt(submit.fields.getTextInputValue('cant'));
            if (isNaN(cant) || cant < 2) return submit.reply({ content: 'Cantidad inválida.', flags: 64 });

            config.cantidadParticipantes = cant;
            step = 4;

            await submit.update({
                embeds: [buildEmbed(`Paso 4: Formato del Torneo`, `Selecciona el formato de competición:`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_format').setPlaceholder('Seleccionar formato...').addOptions([
                        { label: 'Champions League', value: 'champions', description: 'Liguilla -> Playoff -> Eliminatoria' },
                        { label: 'Eurocopa', value: 'euro', description: 'Grupos con mejores terceros' },
                        { label: 'Eliminación Directa', value: 'directa', description: 'Todos a brackets' },
                        { label: 'Personalizado', value: 'personalizado', description: 'Configuración manual de grupos y fases' }
                    ])
                )]
            });
        } else if (step === 5) {
            await i.update({
                embeds: [buildEmbed(`Paso 5: Tipo de Encuentro`, `Selecciona cómo se jugarán los partidos:`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_match_type').setPlaceholder('Seleccionar tipo de encuentro...').addOptions([
                        { label: 'Partido Único', value: 'unico', description: 'Un solo enfrentamiento por ronda' },
                        { label: 'Ida y Vuelta', value: 'ida_vuelta', description: 'Dos partidos (con desempate si aplica)' },
                        { label: 'Grupos (1) y Eliminatoria (2)', value: 'hibrido', description: 'Grupos a partido único y brackets a ida y vuelta' }
                    ])
                )]
            });
        } else if (step === 6) {
            await i.update({
                embeds: [buildEmbed(`Paso 6: Tipo de Participantes`, `¿Qué representarán los participantes?`)],
                components: [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_type').setPlaceholder('Seleccionar tipo...').addOptions([
                        { label: 'Equipos', value: 'teams', description: 'Equipos con escudos' },
                        { label: 'Usuarios', value: 'users', description: 'Avatares de Discord' },
                        { label: 'Países', value: 'countries', description: 'Banderas' }
                    ])
                )]
            });
        } else if (step === 7) {
            await i.update({
                embeds: [buildEmbed(`Paso 7: Tercer Puesto`, `¿Habrá partido por el tercer puesto?`)],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('third_place_yes').setLabel('Sí').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('third_place_no').setLabel('No').setStyle(ButtonStyle.Danger)
                )]
            });
        } else if (step === 8) {
            const modal = new ModalBuilder()
                .setCustomId('modal_step8')
                .setTitle('8. Personalización Visual');
            
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
            step = 9;

            await submit.deferUpdate();

            const [previewTabla, previewBrackets] = await Promise.all([
                generarPreviewTema(config.nombre, config.tema),
                generarBracketCopa({ nombre: config.nombre, tema: config.tema })
            ]);

            const fileTabla = new AttachmentBuilder(previewTabla, { name: 'tabla.png' });
            const fileBrackets = new AttachmentBuilder(previewBrackets, { name: 'brackets.png' });

            const resumen = `**Nombre:** ${config.nombre}\n**Prefijo:** ${config.prefix}\n**Participantes:** ${config.cantidadParticipantes}\n**Formato:** ${config.formatoPreset}\n**Encuentros:** ${config.tipoEncuentro}\n**Tipo:** ${config.tipoJugadores}\n**Canal:** <#${config.canalResultados}>\n**3er Puesto:** ${config.hayTercerPuesto ? 'Sí' : 'No'}`;

            const embedResumen = new EmbedBuilder()
                .setTitle('🏁 Resumen del Torneo')
                .setDescription(`Revisa los datos y el diseño antes de crear el torneo:\n\n${resumen}`)
                .setColor('Gold')
                .setImage('attachment://tabla.png');
            
            const embedBrackets = new EmbedBuilder()
                .setTitle('📊 Preview de Brackets')
                .setImage('attachment://brackets.png')
                .setColor('Gold');

            await submit.message.edit({
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
        return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('Blue').setFooter({ text: `Paso ${step} de 9` });
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

        await Torneo.create(config);

        await i.editReply({
            embeds: [new EmbedBuilder().setTitle('✅ Torneo Creado').setDescription(`El torneo **${config.nombre}** ha sido creado exitosamente.\n\nAhora puedes usar los comandos:\n> \`!${config.prefix}-tabla\`\n> \`!${config.prefix}-fixture\`\n> \`!${config.prefix}-inscripcion\``).setColor('Green')],
            components: [],
            files: []
        });
    }
}
