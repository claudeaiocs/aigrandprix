import express from 'express';
import http from 'http';
import path from 'path';
import { Track } from './track/Track';
import { silverstoneTrack } from './track/silverstone';
import BotManager from './bot/BotManager';
import RaceEngine from './race/RaceEngine';
import createRouter from './api/routes';
import { LiveSocket } from './ws/LiveSocket';
import { exampleBots } from './bot/exampleBots';

// ---------------------------------------------------------------------------
// 1. Express app & HTTP server
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// 2. Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// 3. Core instances
// ---------------------------------------------------------------------------
const track = new Track(silverstoneTrack);
const botManager = new BotManager();
const raceEngine = new RaceEngine(track, botManager);

// ---------------------------------------------------------------------------
// 4. API routes
// ---------------------------------------------------------------------------
const apiRouter = createRouter(botManager, raceEngine);
app.use(apiRouter);

// ---------------------------------------------------------------------------
// 5. WebSocket live feed
// ---------------------------------------------------------------------------
const _liveSocket = new LiveSocket(server, raceEngine);

// ---------------------------------------------------------------------------
// 6. Docs route
// ---------------------------------------------------------------------------
app.get('/docs', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'docs.html'));
});

// ---------------------------------------------------------------------------
// 7. Register example bots so the track is alive on first visit
// ---------------------------------------------------------------------------
for (const example of exampleBots) {
  const { bot } = botManager.register(example.name, example.team, example.teamColor);
  botManager.updateDriverCode(bot.id, example.code);

  try {
    raceEngine.addCar(bot.id);
    console.log(`  Registered example bot: ${example.name} (${example.team})`);
  } catch (err: any) {
    console.error(`  Failed to add example bot "${example.name}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Start the race engine
// ---------------------------------------------------------------------------
raceEngine.start();

// ---------------------------------------------------------------------------
// 9. Listen
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`\n  AI Grand Prix is live!`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  ${exampleBots.length} bots on track\n`);
});

// ---------------------------------------------------------------------------
// 10. Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown() {
  console.log('\nShutting down...');
  raceEngine.stop();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
