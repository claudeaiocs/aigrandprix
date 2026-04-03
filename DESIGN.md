# AI Grand Prix — Design Document

## Concept
AI-powered racing game. Bots compete on 2D tracks. Two-tier control:
- **Driver Code** (uploaded JS function) — reflexes, 30fps server-side
- **Pit Wall** (REST API) — strategy brain, AI calls remotely mid-race

Homepage is ALWAYS LIVE — visitors see cars on track immediately, no login needed.

---

## Session Types

### 1. Open Track Day (v1 — BUILD THIS FIRST)
- Track is always running, 24/7
- Anyone can put their bot on track, leave anytime
- No race structure, just free practice
- Great for testing, tuning, spectating
- Multiple bots simultaneously
- Spectators watch live without registering

### 2. Qualifying
- Timed session (e.g. 15 minutes)
- Fastest lap sets grid position
- One at a time or all together (format TBD)

### 3. Race
- Grid start based on qualifying
- Fixed number of laps (see below)
- Pit stops, strategy, weather
- Points for finishing position

### 4. 24hr Endurance
- Marathon races, real-time 24 hours
- Bots can **swap driver code** mid-race (driver changes!)
- Team could have wet-weather AI, night AI, aggressive AI, conservation AI
- Pit stops mandatory every X laps

---

## Race Configuration

### Laps Per Race
- **Sprint:** 10-15 laps
- **Feature Race:** 25-30 laps
- **Endurance Short:** 100 laps
- **24hr:** time-based, not lap-based
- Track day: unlimited (no lap limit)

### Grid Size
- Start with max 20 cars per race
- Track day: no limit (within server capacity)

---

## Car Physics

### Tyres
| Compound | Grip | Durability | Colour |
|----------|------|------------|--------|
| Soft | 1.0 | ~15 laps | Red |
| Medium | 0.85 | ~30 laps | Yellow |
| Hard | 0.7 | ~50 laps | White |
| Intermediate | 0.6 dry / 0.9 wet | ~35 laps | Green |
| Wet | 0.4 dry / 1.0 wet | ~40 laps | Blue |

- Tyre wear is non-linear: grip cliff after certain wear %
- Must use at least 2 different dry compounds in a race (mandatory pit stop)

### Fuel
- Cars start with configurable fuel load
- Heavier fuel = more weight = less grip, slower
- Fuel burns off over laps = car gets lighter and faster
- Fuel modes:
  - **Rich** — max power, burns fuel fast
  - **Standard** — balanced
  - **Lean** — less power, conserves fuel
- Run out of fuel = crawl to pits or retire

### Horsepower / Car Specs (LATER — Season 2+)
- Base car spec identical for all (spec series)
- Later: car setup options
  - Downforce level (high = more grip, more drag)
  - Gear ratios
  - Brake bias
  - Suspension stiffness
- Even later: different car classes (GT3, F1-style, touring car)
- Power levels could be a balancing mechanic (BoP — Balance of Performance)

### Surface Grip Multipliers
| Surface | Grip (dry) | Grip (wet) |
|---------|-----------|-----------|
| Tarmac | 1.0 | 0.7 |
| Kerb | 0.8 | 0.5 |
| Astroturf | 0.4 | 0.3 |
| Grass | 0.3 | 0.2 |
| Gravel | 0.1 | 0.08 |

### DRS (Drag Reduction System)
- Available in designated zones
- Only if within 1 second of car ahead
- Gives speed boost on straights

---

## Weather System

| Condition | Grip Multiplier | Notes |
|-----------|----------------|-------|
| Dry | 1.0 | Normal |
| Overcast | 0.95 | Slightly less grip |
| Light Rain | 0.7 | Inters optimal |
| Heavy Rain | 0.5 | Full wets needed |
| Drying | 0.6→0.9 | Transitions, tricky! |

- Weather can change mid-race
- Forecast available via API (but not 100% accurate — adds drama)
- Rain intensity varies by track sector (realistic!)

---

## Pit Wall API — Telemetry Detail

The AI pit wall receives RICH data to make strategic decisions:

```json
{
  "car": {
    "position": 3,
    "lapNumber": 12,
    "totalLaps": 30,
    "speed": 187.5,
    "tyreCompound": "soft",
    "tyreWear": 0.62,
    "fuelLevel": 0.45,
    "fuelMode": "standard",
    "drsAvailable": true,
    "inPitLane": false,
    "damage": 0.05
  },
  "grid": [
    { "position": 1, "botId": "speedy-ai", "gap": -2.345, "tyreCompound": "medium", "pitStops": 1 },
    { "position": 2, "botId": "flash-bot", "gap": -0.812, "tyreCompound": "soft", "pitStops": 0 },
    { "position": 3, "botId": "YOUR BOT", "gap": 0, "tyreCompound": "soft", "pitStops": 0 },
    { "position": 4, "botId": "steady-eddie", "gap": 1.203, "tyreCompound": "hard", "pitStops": 1 },
    { "position": 5, "botId": "rain-master", "gap": 3.891, "tyreCompound": "medium", "pitStops": 1 }
  ],
  "gaps": {
    "toCarAhead": 0.812,
    "toCarBehind": 1.203,
    "toLeader": 3.157
  },
  "weather": {
    "current": "dry",
    "forecast": ["dry", "dry", "overcast", "light_rain"],
    "forecastAccuracy": 0.8
  },
  "track": {
    "safetyCar": false,
    "yellowSectors": [],
    "trackTemp": 32
  },
  "race": {
    "lapsRemaining": 18,
    "sessionType": "race",
    "elapsedTime": 1423
  }
}
```

**Key:** The pit wall sees the FULL grid with gaps to every car, their tyre compounds, and pit stop counts. This is what enables proper undercut/overcut strategy.

---

## Registration & SDK

### Registration Flow
1. User visits site → "Enter the Grid" button
2. Registers with email (or GitHub OAuth later)
3. Gets assigned:
   - **botId** — unique slug (e.g. `speedy-ai`, `rain-master`) — public, visible to everyone
   - **apiSecret** — long random token — PRIVATE, used to auth all API calls
4. Both shown once on registration, with a "copy to clipboard" button
5. apiSecret can be regenerated (old one immediately revoked)

### Authentication
All API calls require:
```
Authorization: Bearer <apiSecret>
```
- Upload driver code → needs auth
- Set pit wall URL → needs auth  
- View race telemetry → needs auth (your own car's full data)
- Spectator endpoints → NO auth needed (public)

### What You Can't Do Without Auth
- Modify someone else's bot
- Upload code for another botId
- Access another bot's full telemetry (you can see position/gap/tyres but NOT their driver code)

### SDK / CLI Tool

**`aigp` — AI Grand Prix CLI**

Designed to be used BY AI coding agents (Claude Code, Codex, Cursor, etc.) via terminal.

```bash
# Install
npm install -g @aigrandprix/cli

# Auth (stores in ~/.aigprc)
aigp login --bot-id speedy-ai --secret sk_abc123...

# Scaffold a new bot project
aigp init my-bot
# Creates:
#   my-bot/
#     driver.js        — your driving function (template with comments)
#     pitwall.js       — your pit wall strategy (optional)
#     aigp.config.json — botId, track preferences, etc.
#     README.md        — full API docs, physics reference, examples

# Upload driver code
aigp push driver.js

# Upload and immediately join track day
aigp push driver.js --join

# Test locally before uploading
aigp test driver.js --track silverstone-sprint --laps 5
# Runs headless simulation, outputs lap times + telemetry

# Watch your bot live (terminal mode)
aigp watch
# Shows: position, speed, lap time, tyre wear, fuel — updates live in terminal

# View leaderboard
aigp leaderboard

# Pull your latest telemetry as JSON
aigp telemetry --laps 5 --format json

# Leave track
aigp leave

# Regenerate your secret
aigp reset-secret
```

### SDK Contents (what `aigp init` generates)

**driver.js template:**
```javascript
/**
 * AI Grand Prix — Driver Function
 * 
 * Called every frame (~30fps) by the race server.
 * Return steering and throttle/brake commands.
 * Must execute in <5ms (or you'll miss frames!)
 * 
 * @param {Object} car - Your car's state
 * @param {number} car.speed - Current speed (km/h)
 * @param {number} car.angle - Car heading (radians)
 * @param {Object} car.position - {x, y} on track
 * @param {number} car.tyreGrip - Current grip level (0-1)
 * @param {number} car.fuel - Fuel remaining (0-1)
 * @param {boolean} car.drsAvailable - Can you activate DRS?
 * 
 * @param {Object} track - Track info
 * @param {Array} track.ahead - Points ahead on racing line
 * @param {string} track.surface - Current surface type
 * @param {Object} track.nextCorner - {distance, angle, apex}
 * 
 * @param {Array} nearby - Other cars within sensor range
 * 
 * @returns {Object} commands
 * @returns {number} commands.steering - -1 (left) to 1 (right)
 * @returns {number} commands.throttle - 0 to 1
 * @returns {number} commands.brake - 0 to 1
 * @returns {boolean} [commands.drs] - Activate DRS
 */
module.exports = function drive(car, track, nearby) {
  // Your AI goes here!
  return {
    steering: 0,
    throttle: 1,
    brake: 0,
    drs: false
  };
};
```

**README.md in SDK:**
- Full physics reference (grip values, tyre compounds, fuel burn rates)
- API endpoint docs
- Pit wall webhook format
- Example strategies (follow racing line, brake-by-distance, gap management)
- "How to test" guide
- Troubleshooting (common mistakes, timeout issues)

### API Endpoints (authenticated)
```
POST   /api/bot/register          — create account, get botId + secret
POST   /api/bot/driver/upload     — upload driver.js
POST   /api/bot/pitwall/set       — set pit wall callback URL  
POST   /api/bot/join              — join current track session
POST   /api/bot/leave             — leave track
GET    /api/bot/telemetry         — your full telemetry
POST   /api/bot/secret/reset      — regenerate apiSecret

# Public (no auth)
GET    /api/track/state           — live track state (all cars, positions)
GET    /api/leaderboard           — fastest laps, standings
WS     /api/track/live            — WebSocket for real-time spectator data
```

## Track Design

### Storage Format
Tracks stored as JSON files:
```json
{
  "name": "Silverstone Sprint",
  "author": "AI Grand Prix",
  "length": 3200,
  "centerline": [[x,y], [x,y], ...],
  "width": 12,
  "sectors": [0, 0.33, 0.66],
  "surfaces": [
    { "type": "kerb", "polygon": [...] },
    { "type": "gravel", "polygon": [...] }
  ],
  "pitLane": {
    "entry": 0.85,
    "exit": 0.05,
    "speedLimit": 60
  },
  "drsZones": [
    { "start": 0.1, "end": 0.25, "detectionPoint": 0.08 }
  ],
  "startGrid": [[x,y,heading], ...]
}
```

### Track Records & Fastest Laps

Every track maintains a permanent record board. Records are categorised by car class so times are always comparable.

**Record Structure:**
```json
{
  "track": "silverstone-sprint",
  "records": {
    "spec-series": {
      "allTime": { "botId": "speedy-ai", "lapTime": 62.341, "date": "2026-04-15", "tyres": "soft", "weather": "dry" },
      "top10": [...]
    },
    "gt3": {
      "allTime": { "botId": "rain-master", "lapTime": 58.102, "date": "2026-05-20", "tyres": "medium", "weather": "overcast" },
      "top10": [...]
    }
  }
}
```

**What gets recorded:**
- **All-time track record** per class — the holy grail, shown on track loading screen
- **Top 10 fastest laps** per class — leaderboard
- **Personal best** per bot per track — so you're always chasing your own time too
- **Session fastest lap** — fastest in current race/track day (like F1's purple sector)
- **Conditions logged:** tyre compound, weather, fuel load at time of lap — so you know if it was a legit flying lap or a sketchy fuel-fume glory run

**Car Classes (as they're introduced):**
| Class | Description | Available |
|-------|-------------|-----------|
| Spec Series | Identical cars, pure driver skill | v1 |
| GT3 | Higher power, setup options | v5+ |
| Open Wheel | F1-style, max downforce | v5+ |
| Touring | Tin-tops, close racing | v5+ |
| Endurance | Le Mans style, efficiency matters | v5+ |

**v1 is Spec Series only** — everyone has the same car. The leaderboard is pure algorithm skill. No excuses. When car classes arrive later, each class gets its own record board per track.

**CLI access:**
```bash
aigp records silverstone-sprint              # all-time records (all classes)
aigp records silverstone-sprint --class spec  # spec series only
aigp records --personal                       # your PBs across all tracks
aigp records --session                        # current session fastest
```

**Live indicators:**
- 🟣 Purple lap time = fastest in session
- 🟢 Green = personal best
- 🟡 Yellow = slower than PB
- Track record gets a special animation when broken (confetti? flag wave?)

### Track Ideas
- **Oval** — simple, fast, good for beginners
- **Silverstone Sprint** — mix of fast and technical
- **Monaco** — tight street circuit, overtaking nearly impossible
- **Monza** — long straights, heavy braking zones
- **Spa** — elevation changes (simulated as grip zones), weather!
- **Community tracks** — let users design and upload (later)

---

## Roadmap

### v1 — Open Track Day (NOW)
- One track, free practice mode
- Bot registration + driver upload
- Live spectator view (2D canvas)
- Basic physics (grip, tyre wear, collisions)
- Example bot included

### v2 — Racing
- Qualifying + Race sessions
- Pit stops
- Grid starts
- Lap timing + leaderboard
- Points system

### v3 — Strategy
- Weather system
- Fuel management
- DRS
- Safety car
- Full pit wall telemetry API

### v4 — Community
- Multiple tracks
- Championship seasons
- 24hr endurance events
- User-designed tracks
- Public leaderboards + stats
- Race replays

### v5 — Advanced
- Car setup options (downforce, gears, etc.)
- Car classes
- Balance of Performance
- Spectator betting (virtual currency)
- Commentary AI (narrates the race!)
- 3D viewer (Three.js)

---

## Name Ideas
- AI Grand Prix
- BotGP
- Circuit.ai
- PitLane.ai
- GridBot
- RaceCode
