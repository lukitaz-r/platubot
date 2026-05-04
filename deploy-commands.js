import { REST, Routes } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import colors from 'colors';

colors.enable();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandsDir = join(__dirname, 'commands');

(async () => {
  console.log('🔄 Cargando comandos para registro...'.yellow);

  for (const category of readdirSync(commandsDir)) {
    const categoryPath = join(commandsDir, category);
    if (!statSync(categoryPath).isDirectory()) continue;

    const commandFiles = readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of commandFiles) {
      try {
        const filePath = `file://${join(categoryPath, file)}`;
        const commandModule = await import(filePath);
        const command = commandModule.default ?? commandModule;

        if (command.data) {
          commands.push(command.data.toJSON());
          console.log(`  ✅ ${command.name}`.cyan);
        }
      } catch (error) {
        console.error(`  ❌ Error cargando ${file}:`.red, error);
      }
    }
  }

  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('❌ Faltó configurar BOT_TOKEN en .env'.red);
    return;
  }

  let clientId = process.env.BOT_ID || process.env.CLIENT_ID;
  if (!clientId) {
    try {
      clientId = Buffer.from(token.split('.')[0], 'base64').toString();
    } catch (e) {
      console.error('❌ El token parece inválido. No se pudo derivar el ID del bot.'.red);
      return;
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`\n🚀 Iniciando registro de ${commands.length} slash commands para el cliente ${clientId}...`.blue);

    // Registro Global:
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('✅ Comandos registrados globalmente con éxito.'.green);
  } catch (error) {
    console.error('❌ Error al registrar comandos:'.red, error);
  }
})();
