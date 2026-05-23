import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { init as initBackup } from '../../database/backupManager.js';

export default {
  name: 'clientReady',
  once: true,
  run: async (client) => {
    const DATA_DIR = join(process.cwd(), 'data');
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
      console.log(`📁 CARPETA DE DATOS (JSON) CREADA`.green);
    } else {
      console.log(`📁 SISTEMA DE DATOS LOCAL INICIADO`.green);
    }

    console.log(`SESIÓN INICIADA COMO ${client.user.tag}`.green);

    // Initialize backup system and HTTP server
    try {
      await initBackup(client);
    } catch (err) {
      console.error('Failed to initialize backup system and API server:', err);
    }
  }
}
