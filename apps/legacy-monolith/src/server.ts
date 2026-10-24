import { createLegacyApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { seedLegacyDatabase } from './db/seed.js';

const PORT = parseInt(process.env.PORT_LEGACY || '3001', 10);
const db = getDatabase();
seedLegacyDatabase(db);

const app = createLegacyApp(db);

const server = app.listen(PORT, () => {
  console.info(`[Legacy Monolith] Running on port ${PORT}`);
  console.info(`[Legacy Monolith] Database initialized with seed records.`);
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.info(`[Legacy Monolith] Received ${signal}, closing gracefully...`);
  server.close(() => {
    db.close();
    console.info('[Legacy Monolith] Server and DB closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
