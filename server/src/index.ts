import { fileURLToPath } from 'node:url';
import { startGameServer } from './app.ts';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH ?? 'game.db';
const staticDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

const server = await startGameServer({ port, dbPath, staticDir });
console.log(`game server listening on :${server.port} (ws path /ws, db ${dbPath})`);
