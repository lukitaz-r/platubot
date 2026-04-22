export default {
  name: 'ping',
  aliases: [],
  desc: 'Sirve para ver el ping del Bot',
  permisos: [],
  run: async (
    client, 
    message,
  ) => {
    const latency = Math.round(client.ws.ping);
    await message.reply(`Pong! El ping del Bot es de \`${latency}ms\``);
  }
}