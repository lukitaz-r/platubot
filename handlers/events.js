import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'colors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const allevents = [];

export default async (client) => {
  console.log('🔄 Cargando los eventos...'.yellow);
  let count = 0;

  const loadDir = async (folder) => {
    const dirPath = join(__dirname, '..', 'events', folder);
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      try {
        const filePath = `file://${join(dirPath, file)}`;
        const eventModuleImport = await import(filePath);
        const eventModule = eventModuleImport.default || eventModuleImport;
        const eventName = eventModule.name || file.split('.')[0];

        allevents.push(eventName);
        if (eventModule.once) {
          client.once(eventName, (...args) => {
            eventModule.run(client, ...args);
          });
        } else {
          client.on(eventName, (...args) => {
            eventModule.run(client, ...args);
          });
        }

        count++;
      } catch (error) {
        console.error(`Error cargando evento ${file}:`.red, error);
      }
    }
  };

  for (const folder of ['client', 'server']) {
    await loadDir(folder);
  }

  console.log(`✅ ${count} eventos cargados:`.green, allevents.join(', ').blue);
  console.log('🔄 Iniciando Sesión el Bot...'.yellow);
};