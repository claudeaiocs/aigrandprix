// Record a 5-lap race as MP4 video
const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const { Track } = require('./dist/track/Track');
const { silverstoneTrack } = require('./dist/track/silverstone');
const BotManager = require('./dist/bot/BotManager').default;
const RaceEngine = require('./dist/race/RaceEngine').default;
const exBots = require('./dist/bot/exampleBots').exampleBots;

const FFMPEG = process.env.FFMPEG || 'C:\\Users\\claude\\AppData\\Local\\Temp\\ffmpeg\\ffmpeg-master-latest-win64-lgpl\\bin\\ffmpeg.exe';
const WIDTH = 800;
const HEIGHT = 700;
const FPS = 15;
const TOTAL_LAPS = 5;
const OUTPUT = process.argv[2] || 'race.mp4';

// Setup race
const track = new Track(silverstoneTrack);
const bm = new BotManager();
const engine = new RaceEngine(track, bm);
const botColors = {};
for (const ex of exBots) {
  const { bot } = bm.register(ex.name, ex.team, ex.teamColor);
  bm.updateDriverCode(bot.id, ex.code);
  engine.addCar(bot.id);
  botColors[bot.id] = ex.teamColor;
}

// Start ffmpeg — use image2pipe with PNG input
const ff = spawn(FFMPEG, [
  '-y',
  '-f', 'image2pipe',
  '-framerate', String(FPS),
  '-i', 'pipe:0',
  '-c:v', 'libopenh264',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  OUTPUT,
], { stdio: ['pipe', 'pipe', 'pipe'] });

ff.stderr.on('data', d => {
  const s = d.toString();
  if (s.includes('Error') || s.includes('error') || s.includes('Invalid')) console.error('FFMPEG:', s.trim());
});

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// Track bounds for scaling
const segs = silverstoneTrack.segments;
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const s of segs) {
  if (s.center.x < minX) minX = s.center.x;
  if (s.center.x > maxX) maxX = s.center.x;
  if (s.center.y < minY) minY = s.center.y;
  if (s.center.y > maxY) maxY = s.center.y;
}
const padding = 60;
const scaleX = (WIDTH - padding * 2) / (maxX - minX);
const scaleY = (HEIGHT - padding * 2 - 100) / (maxY - minY); // leave room for HUD
const scale = Math.min(scaleX, scaleY);
const offsetX = padding + ((WIDTH - padding * 2) - (maxX - minX) * scale) / 2;
const offsetY = padding + ((HEIGHT - padding * 2 - 100) - (maxY - minY) * scale) / 2;

function tx(x) { return offsetX + (x - minX) * scale; }
function ty(y) { return offsetY + (y - minY) * scale; }

function drawFrame(feed) {
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('AI GRAND PRIX — Silverstone', 20, 30);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText(`T+${Math.round(feed.session.elapsedTime / 1000)}s`, WIDTH - 70, 30);

  // Draw track outline
  ctx.strokeStyle = '#333355';
  ctx.lineWidth = Math.max(2, 40 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < segs.length; i++) {
    const x = tx(segs[i].center.x);
    const y = ty(segs[i].center.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Track surface (lighter)
  ctx.strokeStyle = '#444466';
  ctx.lineWidth = Math.max(1, 35 * scale);
  ctx.beginPath();
  for (let i = 0; i < segs.length; i++) {
    const x = tx(segs[i].center.x);
    const y = ty(segs[i].center.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Start/finish line
  const sfSeg = segs[silverstoneTrack.startFinishIndex || 0];
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const sfx = tx(sfSeg.center.x);
  const sfy = ty(sfSeg.center.y);
  ctx.beginPath();
  ctx.moveTo(sfx - 10, sfy - 10);
  ctx.lineTo(sfx + 10, sfy + 10);
  ctx.stroke();

  // Draw cars
  const sorted = [...feed.cars].sort((a, b) => a.position - b.position);
  for (const car of sorted) {
    const cx = tx(car.x);
    const cy = ty(car.y);

    // Car dot
    ctx.fillStyle = car.teamColor || '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // Glow
    ctx.strokeStyle = car.teamColor || '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Name label
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText(car.botName, cx + 12, cy + 4);
  }

  // HUD at bottom
  const hudY = HEIGHT - 90;
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, hudY - 10, WIDTH, 100);
  ctx.strokeStyle = '#333355';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hudY - 10);
  ctx.lineTo(WIDTH, hudY - 10);
  ctx.stroke();

  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText('POS', 15, hudY + 8);
  ctx.fillText('DRIVER', 60, hudY + 8);
  ctx.fillText('LAP', 250, hudY + 8);
  ctx.fillText('SPEED', 330, hudY + 8);
  ctx.fillText('BEST', 430, hudY + 8);
  ctx.fillText('GAP', 550, hudY + 8);

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const row = hudY + 28 + i * 20;
    ctx.fillStyle = c.teamColor || '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`P${c.position}`, 15, row);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c.botName, 60, row);
    ctx.fillStyle = '#cccccc';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${c.lap}/${TOTAL_LAPS}`, 250, row);
    ctx.fillText(`${Math.round(c.speed)} kph`, 330, row);
    ctx.fillText(c.bestLapTime ? (c.bestLapTime / 1000).toFixed(1) + 's' : '--', 430, row);
    ctx.fillText(c.gap || '', 550, row);
  }
}

// Run race and capture frames
engine.start();
console.log('Recording race...');

let frames = 0;
let done = false;
const frameInterval = setInterval(() => {
  const feed = engine.getLiveFeed();
  drawFrame(feed);

  // Write PNG frame to ffmpeg
  const buf = canvas.toBuffer('image/png');
  ff.stdin.write(buf);

  frames++;
  if (frames % (FPS * 5) === 0) {
    const maxLap = Math.max(...feed.cars.map(c => c.lap));
    console.log(`  T+${Math.round(feed.session.elapsedTime / 1000)}s | ${frames} frames | leader lap ${maxLap}/${TOTAL_LAPS}`);
  }

  const maxLap = Math.max(...feed.cars.map(c => c.lap));
  if (maxLap >= TOTAL_LAPS && !done) {
    done = true;
    // Record a few more seconds after finish
    setTimeout(() => {
      clearInterval(frameInterval);
      engine.stop();
      ff.stdin.end();
      console.log(`Done! ${frames} frames recorded.`);
    }, 3000);
  }
}, 1000 / FPS);

ff.stdin.on('error', (e) => { /* ignore EPIPE after close */ });

ff.on('close', (code) => {
  console.log(`Video saved: ${OUTPUT} (ffmpeg exit ${code})`);
  process.exit(0);
});

// Safety timeout
setTimeout(() => {
  if (!done) {
    clearInterval(frameInterval);
    engine.stop();
    ff.stdin.end();
    console.log('Timeout — saving partial video');
  }
}, 300000);
