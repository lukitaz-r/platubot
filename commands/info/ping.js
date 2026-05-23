import { SlashCommandBuilder } from 'discord.js';

export default {
  name: 'ping',
  aliases: [],
  desc: 'Sirve para ver el ping del Bot',
  permisos: [],

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Sirve para ver el ping del Bot'),

  execute: async (client, interaction) => {
    const latency = Math.round(client.ws.ping);
    await interaction.reply(`Pong! El ping del Bot es de \`${latency}ms\``);
  },

  run: async (client, message) => {
    const latency = Math.round(client.ws.ping);
    await message.reply(`Pong! El ping del Bot es de \`${latency}ms\``);
  }
}