import submission from "../../utils/submission.js";
import Torneo from "../../models/copas/Torneo.js";

export default {
  name: 'messageCreate',
  /**
   * @param client Instancia del cliente de Discord
   * @param message Mensaje que se lee
   */
  run: async (client, message) => {
    if (!message.guild || !message.channel || message.author.bot) return;
    
    await submission(client, message);

    const prefix = process.env.PREFIX || '>'
    const botID = client.user.id
    const mentionRegex = new RegExp(`^<@!?${botID}>`)

    let args
    const content = message.content.trim()
    if (content.startsWith(prefix) || content.startsWith(prefix.toUpperCase()) || content.startsWith(prefix.toLowerCase()) || content.startsWith("!")) {
      // Usamos el primer caracter como prefijo si es ! o el configurado
      const usedPrefix = content.startsWith("!") ? "!" : prefix;
      args = content.slice(usedPrefix.length).trim().split(/ +/);
    } else if (mentionRegex.test(content)) {
      const match = content.match(mentionRegex);
      args = content.slice(match[0].length).trim().split(/ +/);
    } else {
      return;
    }

    const invoked = args.shift()?.toLowerCase()
    if (!invoked) return

    let command = client.commands.get(invoked) || client.commands.get(client.aliases.get(invoked));

    // --- Lógica de Torneos Dinámicos ---
    if (!command && invoked.includes('-')) {
        const [tPrefix, ...subArgs] = invoked.split('-');
        const subComando = subArgs.join('-'); // ej: 'tabla'
        
        const torneo = await Torneo.findOne({ prefix: tPrefix }).catch(() => null);
        if (torneo) {
            const genericCmd = client.commands.get('torneo-generic');
            if (genericCmd) {
                return genericCmd.runGeneric(client, message, args, torneo, subComando);
            }
        }
    }
    // ----------------------------------

    if (!command) return

    const { permisos_bot: permissionsBot, permisos: userPerms } = command;
    const botMember = message.guild.members.me;

    if (permissionsBot && botMember && !botMember.permissions.has(permissionsBot)) {
      const missing = permissionsBot.map(p => `\`${p}\``).join(', ');
      return message.reply(
        '❌ **No tengo suficientes permisos para ejecutar este comando!**\n' +
        `Necesito: ${missing}`,
      );
    }

    if (userPerms && message.member && !message.member.permissions.has(userPerms)) {
      const missing = userPerms.map(p => `\`${p}\``).join(', ');
      return message.reply(
        '❌ **No tienes suficientes permisos para ejecutar este comando!**\n' +
        `Necesitas: ${missing}`,
      );
    }

    try {
      await command.run(client, message, args, prefix)
    } catch (error) {
      console.error(error)
      return message.reply('💔 **¡Hubo un error al ejecutar el comando!**')
    }
  }
}