import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';

let commandsCache = null;

const loadCommands = async () => {
  if (commandsCache) return commandsCache;
  
  const cache = {};
  const commandsPath = path.resolve('commands');
  
  if (fs.existsSync(commandsPath)) {
    const categories = fs.readdirSync(commandsPath).filter(file => {
      return fs.statSync(path.join(commandsPath, file)).isDirectory();
    });

    for (const category of categories) {
      const categoryPath = path.join(commandsPath, category);
      const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
      
      const categoryCommands = [];
      
      for (const file of commandFiles) {
        try {
          const filePath = path.join(categoryPath, file);
          const fileUrl = pathToFileURL(filePath).href;
          const { default: commandObj } = await import(fileUrl);
          
          if (commandObj && commandObj.name) {
            categoryCommands.push({
              name: commandObj.name,
              desc: commandObj.desc || commandObj.description || 'Sin descripción',
              aliases: commandObj.aliases || [],
              permisos: commandObj.permisos || []
            });
          }
        } catch (e) {
          console.error(`Error loading command ${file} from ${category}:`, e);
        }
      }
      
      if (categoryCommands.length > 0) {
         // Capitalizar el nombre de la categoría
         const catName = category.charAt(0).toUpperCase() + category.slice(1);
         cache[catName] = categoryCommands;
      }
    }
  }
  
  commandsCache = cache;
  return cache;
};

export default {
  name: 'help',
  desc: 'Muestra una lista de comandos disponibles organizados por categoría',
  aliases: ['ayuda', 'comandos', 'cmds'],
  permisos: [],
  run: async (client, message, args) => {
    try {
      const commandsData = await loadCommands();
      const categories = Object.keys(commandsData);
      
      if (categories.length === 0) {
        return message.reply('❌ No se encontraron comandos.');
      }
      
      // Crear las opciones para el select menu
      const options = categories.map(cat => ({
        label: cat,
        description: `Ver comandos de la categoría ${cat}`,
        value: cat,
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Selecciona una categoría de comandos')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const totalCommands = Object.values(commandsData).flat().length;

      const embed = new EmbedBuilder()
        .setTitle('📚 Menú de Ayuda')
        .setDescription('Por favor, selecciona una categoría en el menú desplegable para ver los comandos correspondientes.\n\nPor ejemplo: Seleccionar `Superliga` cargará todos los comandos de esa liga.')
        .setColor('#2b2d31')
        .setFooter({ text: `${client.user.username} | Comandos totales: ${totalCommands}`, iconURL: client.user.displayAvatarURL() });

      const sentMessage = await message.reply({ embeds: [embed], components: [row] });
      
      const collector = sentMessage.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120000 
      });

      collector.on('collect', async (interaction) => {
        // Asegurarse de que solo el autor del mensaje original interactúe
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: '❌ Solo el usuario que invocó el comando puede usar el menú.', ephemeral: true });
        }
        
        const selectedCategory = interaction.values[0];
        const categoryCommands = commandsData[selectedCategory];
        
        const categoryEmbed = new EmbedBuilder()
          .setTitle(`📂 Comandos: ${selectedCategory}`)
          .setColor('#2b2d31')
          .setFooter({ text: `${client.user.username}`, iconURL: client.user.displayAvatarURL() });
          
        let commandsText = '';
        const prefix = process.env.PREFIX || '>';
        
        categoryCommands.forEach(cmd => {
          commandsText += `**${prefix}${cmd.name}**\n`;
          commandsText += `╰ *${cmd.desc}*\n`;
          if (cmd.aliases && cmd.aliases.length > 0) {
             commandsText += `╰ **Alias:** ${cmd.aliases.join(', ')}\n`;
          }
          if (cmd.permisos && cmd.permisos.length > 0) {
             commandsText += `╰ **Permisos:** ${cmd.permisos.join(', ')}\n`;
          }
          commandsText += '\n';
        });
        
        // Si hay muchos comandos (podrían pasarse del límite de caracteres de descripción del embed: 4096)
        if (commandsText.length > 4090) {
            commandsText = commandsText.slice(0, 4090) + '...';
        }

        categoryEmbed.setDescription(commandsText || 'No hay comandos visibles.');

        await interaction.update({ embeds: [categoryEmbed], components: [row] });
      });

      collector.on('end', () => {
        const disabledRow = new ActionRowBuilder().addComponents(
          StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
        );
        sentMessage.edit({ components: [disabledRow] }).catch(() => {});
      });

    } catch (error) {
      console.error('Error en comando help:', error);
      message.reply('❌ Ocurrió un error al cargar el comando de ayuda.');
    }
  }
}
