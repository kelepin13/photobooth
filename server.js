// Custom server: Next.js (pages + API routes) and socket.io on one HTTP server.
const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');

const store = require('./lib/rooms');
const logger = require('./lib/logger');
const { registerRoomHandlers, MAX_SOCKET_MESSAGE_BYTES } = require('./lib/room-events');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const CLEANUP_EVERY_MS = 30 * 60 * 1000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/socket.io',
    maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
  });
  registerRoomHandlers(io, store, logger);

  // Drops idle in-memory rooms. A no-op with Redis, where keys expire on their own.
  setInterval(() => {
    store.cleanupExpiredRooms().catch((err) => logger.log('cleanup_error', { error: String(err) }));
  }, CLEANUP_EVERY_MS).unref();

  httpServer.listen(port, hostname, () => {
    logger.log('server_start', { port, roomStore: store.usingRedis ? 'redis' : 'memory' });
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
