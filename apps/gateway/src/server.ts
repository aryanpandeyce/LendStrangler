import { createGatewayApp } from './app.js';

const PORT = parseInt(process.env.PORT_GATEWAY || '3000', 10);
const { app, routeTable } = createGatewayApp();

const server = app.listen(PORT, () => {
  console.info(`[Strangler Gateway] Running on port ${PORT}`);
  console.info('[Strangler Gateway] Initial route table loaded:');
  for (const r of routeTable.getAllRoutes()) {
    console.info(`  ${r.pathPattern.padEnd(20)} => [${r.mode}] (${r.activeService})`);
  }
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.info(`[Strangler Gateway] Received ${signal}, closing server...`);
  server.close(() => {
    console.info('[Strangler Gateway] Closed gracefully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
