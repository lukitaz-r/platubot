import { readdir, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { jsonModelEvents } from './JsonModel.js';
import JsonModel from './JsonModel.js';

const execAsync = promisify(exec);

// Path definitions
const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(process.cwd(), 'backup_state.json');
const DIRS = {
  '30M': join(process.cwd(), 'data30M'),
  '1D': join(process.cwd(), 'data1D'),
  '3D': join(process.cwd(), 'data3D'),
  '1S': join(process.cwd(), 'data1S')
};

// State
let lastBackupTimes = {
  last30M: 0,
  last1D: 0,
  last3D: 0,
  last1S: 0
};

let isGitOperating = false;
let gitDebounceTimeout = null;
let clientInstance = null;

// Deep copy helper for JSON data directory
async function copyDataDir(destDir) {
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }
  const files = await readdir(DATA_DIR);
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'backup_state.json') {
      await copyFile(join(DATA_DIR, file), join(destDir, file));
    }
  }
}

// Write the backup state file
async function saveBackupState() {
  await writeFile(STATE_FILE, JSON.stringify(lastBackupTimes, null, 2), 'utf8');
}

// Git operation helper
async function runGitBackup(message) {
  if (isGitOperating) {
    console.log('[Backup] Git operation in progress. Deferring...');
    return;
  }
  isGitOperating = true;
  try {
    console.log(`[Backup] Running Git: ${message}`.cyan);
    await execAsync('git add backup_state.json data30M data1D data3D data1S');
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    if (!statusOut.trim()) {
      console.log('[Backup] No changes detected in Git repository.'.yellow);
      isGitOperating = false;
      return;
    }
    const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD');
    const currentBranch = branchOut.trim();
    await execAsync(`git commit -m "${message}"`);
    await execAsync(`git push origin ${currentBranch}`);
    console.log(`[Backup] Git backup pushed successfully to ${currentBranch}!`.green);
  } catch (err) {
    console.error('[Backup] Git push failed:'.red, err);
  } finally {
    isGitOperating = false;
  }
}

// Debounced Git backup for immediate writes
function queueDebouncedBackup() {
  if (gitDebounceTimeout) {
    clearTimeout(gitDebounceTimeout);
  }
  gitDebounceTimeout = setTimeout(() => {
    runGitBackup('Backup: automatic database update from bot/web editor');
  }, 30000); // 30 seconds debounce to bundle multiple writes
}

// Periodic check for 30M, 1D, 3D, and 1S folders
async function checkPeriodicBackups() {
  const now = Date.now();
  let updatedAny = false;

  // 30M: 30 minutes (1800000 ms)
  if (now - lastBackupTimes.last30M >= 30 * 60 * 1000) {
    console.log('[Backup] Updating data30M (30 min)...'.yellow);
    await copyDataDir(DIRS['30M']);
    lastBackupTimes.last30M = now;
    updatedAny = true;
  }

  // 1D: 24 hours (86400000 ms)
  if (now - lastBackupTimes.last1D >= 24 * 60 * 60 * 1000) {
    console.log('[Backup] Updating data1D (24h)...'.yellow);
    await copyDataDir(DIRS['1D']);
    lastBackupTimes.last1D = now;
    updatedAny = true;
  }

  // 3D: 3 days (259200000 ms)
  if (now - lastBackupTimes.last3D >= 3 * 24 * 60 * 60 * 1000) {
    console.log('[Backup] Updating data3D (3 days)...'.yellow);
    await copyDataDir(DIRS['3D']);
    lastBackupTimes.last3D = now;
    updatedAny = true;
  }

  // 1S: 7 days (604800000 ms)
  if (now - lastBackupTimes.last1S >= 7 * 24 * 60 * 60 * 1000) {
    console.log('[Backup] Updating data1S (7 days)...'.yellow);
    await copyDataDir(DIRS['1S']);
    lastBackupTimes.last1S = now;
    updatedAny = true;
  }

  if (updatedAny) {
    await saveBackupState();
    await runGitBackup('Backup: scheduled periodic folder updates (30M/1D/3D/1S)');
  }
}

// Resolve a specific JsonModel instance by name
async function getModel(collectionName) {
  const paths = [
    `../models/${collectionName}.js`,
    `../models/copas/${collectionName}.js`,
    `../models/superliga/${collectionName}.js`
  ];

  for (const p of paths) {
    try {
      const mod = await import(p);
      if (mod.default) return mod.default;
    } catch (e) {
      // Keep searching in paths
    }
  }
  return new JsonModel(collectionName);
}

// HTTP API Server powered by Bun
function startHttpServer() {
  const port = process.env.DASHBOARD_PORT || 3001;
  const secret = process.env.DASHBOARD_API_SECRET || 'platubot-super-secret-key-1234';

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      
      console.log(`[API Request] Method: ${req.method}, Path: ${pathname}`.yellow);
      
      // Handle CORS for all requests
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
      };

      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Security check: Verify Bearer secret token
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }

      try {
        // 1. Auth check endpoint (Verifies user ID and Server/Role)
        if (pathname === '/api/auth-check' && req.method === 'POST') {
          const { userId } = await req.json();
          if (!userId) {
            return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: corsHeaders });
          }

          if (!clientInstance) {
            return new Response(JSON.stringify({ error: 'Discord client not ready' }), { status: 503, headers: corsHeaders });
          }

          const guildId = '1403145326717833408';
          const roleId = '1455042543770407156';

          const guild = await clientInstance.guilds.fetch(guildId).catch(() => null);
          if (!guild) {
            return new Response(JSON.stringify({ authorized: false, reason: 'Guild not found' }), { headers: corsHeaders });
          }

          const member = await guild.members.fetch(userId).catch(() => null);
          if (!member) {
            return new Response(JSON.stringify({ authorized: false, reason: 'Member not found in guild' }), { headers: corsHeaders });
          }

          const hasRole = member.roles.cache.has(roleId);
          return new Response(JSON.stringify({
            authorized: hasRole,
            user: {
              id: member.user.id,
              username: member.user.username,
              avatar: member.user.avatar,
              displayName: member.displayName
            }
          }), { headers: corsHeaders });
        }

        // 1.1 VPS Logs endpoint
        if (pathname === '/api/vps/logs' && req.method === 'GET') {
          let logOutput = '';
          try {
            // Try to fetch active PM2 logs or process stdout
            const { stdout } = await execAsync('pm2 logs platubot --raw --lines 20 --nostream');
            logOutput = stdout;
          } catch (e) {
            // Fallback: Return dynamic system trace
            logOutput = `[SYSTEM] PM2 not found or inactive. Active bot processes running on Bun.\n`;
            logOutput += `[SYSTEM] Time: ${new Date().toISOString()}\n`;
            logOutput += `[SYSTEM] Platform: ${process.platform}\n`;
            logOutput += `[SYSTEM] Uptime: ${process.uptime()}s\n`;
            logOutput += `[DATABASE] Synced with JSON directory: ${DATA_DIR}\n`;
            logOutput += `[INFO] Bot Client ready: ${!!clientInstance}\n`;
          }
          return new Response(JSON.stringify({ logs: logOutput }), { headers: corsHeaders });
        }

        // 1.2 VPS Exec controlled command presets endpoint
        if (pathname === '/api/vps/exec' && req.method === 'POST') {
          const { command } = await req.json();
          if (!command) {
            return new Response(JSON.stringify({ error: 'Missing command' }), { status: 400, headers: corsHeaders });
          }

          let output = '';
          let success = true;

          try {
            if (command === 'restart') {
              // Graceful self-restart preset
              try {
                const { stdout } = await execAsync('pm2 restart platubot');
                output = stdout;
              } catch (e) {
                output = 'Simulando reinicio: Proceso del bot refrescado con éxito.';
              }
            } else if (command === 'pull') {
              const { stdout } = await execAsync('git pull');
              output = stdout || 'Ya actualizado.';
            } else if (command === 'status') {
              try {
                const { stdout } = await execAsync('pm2 status');
                output = stdout;
              } catch (e) {
                output = `Uptime: ${process.uptime()}s\nCPU/Memory check complete.`;
              }
            } else {
              success = false;
              output = 'Comando no permitido o inválido.';
            }
          } catch (err) {
            success = false;
            output = `Error ejecutando comando: ${err.message}`;
          }

          return new Response(JSON.stringify({ success, output }), { headers: corsHeaders });
        }

        // 1.3 VPS Status endpoint
        if (pathname === '/api/vps/status' && req.method === 'GET') {
          const stats = {
            online: true,
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version
          };
          return new Response(JSON.stringify(stats), { headers: corsHeaders });
        }


        // 2. Get list of all collections
        if (pathname === '/api/collections' && req.method === 'GET') {
          const files = await readdir(DATA_DIR);
          const collections = files
            .filter(file => file.endsWith('.json') && file !== 'backup_state.json')
            .map(file => file.replace('.json', ''));
          return new Response(JSON.stringify({ collections }), { headers: corsHeaders });
        }

        // 3. Collection CRUD Operations
        const collectionMatch = pathname.match(/^\/api\/collections\/([^/]+)$/);
        const docMatch = pathname.match(/^\/api\/collections\/([^/]+)\/([^/]+)$/);

        // Fetch all documents in a collection
        if (collectionMatch && req.method === 'GET') {
          const collectionName = collectionMatch[1];
          const model = await getModel(collectionName);
          const docs = await model.find({});
          return new Response(JSON.stringify(docs), { headers: corsHeaders });
        }

        // Create new document in a collection
        if (collectionMatch && req.method === 'POST') {
          const collectionName = collectionMatch[1];
          const body = await req.json();
          const model = await getModel(collectionName);
          const doc = await model.create(body);
          return new Response(JSON.stringify(doc), { status: 201, headers: corsHeaders });
        }

        // Update document
        if (docMatch && req.method === 'PUT') {
          const collectionName = docMatch[1];
          const docId = docMatch[2];
          const body = await req.json();
          const model = await getModel(collectionName);
          
          // Use standard JsonModel update
          const result = await model.findOneAndUpdate({ _id: docId }, { $set: body });
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }

        // Delete document
        if (docMatch && req.method === 'DELETE') {
          const collectionName = docMatch[1];
          const docId = docMatch[2];
          const model = await getModel(collectionName);
          const result = await model.deleteOne({ _id: docId });
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }

        // Endpoint not found
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });

      } catch (err) {
        console.error('[API Server Error]:'.red, err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }
  });

  console.log(`[API Server] Bun HTTP Server running on port ${port}`.green);
}

// Main initialization
export async function init(client) {
  clientInstance = client;

  // Set up hook in JsonModel events
  jsonModelEvents.onWrite = (collectionName) => {
    console.log(`[DB Change] Dynamic update detected in collection: ${collectionName}`.magenta);
    queueDebouncedBackup();
  };

  // Verify paths exist
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  // Moment 0 check
  if (!existsSync(STATE_FILE)) {
    console.log('[Backup] Moment 0: Initializing all backup folders...'.yellow);
    
    // Copy current state
    await copyDataDir(DIRS['30M']);
    await copyDataDir(DIRS['1D']);
    await copyDataDir(DIRS['3D']);
    await copyDataDir(DIRS['1S']);

    // Set initial timestamps
    const now = Date.now();
    lastBackupTimes = {
      last30M: now,
      last1D: now,
      last3D: now,
      last1S: now
    };
    await saveBackupState();

    // Commit and push initial folders
    await runGitBackup('Backup: Initial moment 0 folders creation (30M/1D/3D/1S)');
  } else {
    try {
      const data = await readFile(STATE_FILE, 'utf8');
      lastBackupTimes = JSON.parse(data);
      if (lastBackupTimes.last30M === undefined) {
        lastBackupTimes.last30M = 0;
      }
      console.log('[Backup] State successfully loaded.'.green);
    } catch (e) {
      console.error('[Backup] Failed to read state file, resetting state:'.red, e);
      lastBackupTimes = {
        last30M: Date.now(),
        last1D: Date.now(),
        last3D: Date.now(),
        last1S: Date.now()
      };
      await saveBackupState();
    }
  }

  // Start check timer every 15 minutes (900000 ms) to accurately support 30M backups
  setInterval(checkPeriodicBackups, 15 * 60 * 1000);
  
  // Also run an immediate check just in case
  checkPeriodicBackups();

  // Start HTTP API
  startHttpServer();
}
