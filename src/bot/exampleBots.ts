// ============================================================
// AI Grand Prix - Example Bots (v2 - track-aware)
//
// Key facts for bot authors:
//   - Track width: 30-42px (halfWidth 15-21px)
//   - trackEdges.left + right = total width at current point
//   - Speed units: pixels/sec, max ~250px/s at full throttle
//   - Lateral offset from steering: proportional to speed
//   - Wall hit = 30% speed loss + tyre damage
//   - Segments have angle changes; tight turns = short segments
//   - The key to fast laps: stay centred, brake for turns, full throttle on straights
// ============================================================

export const exampleBots: Array<{name: string, team: string, teamColor: string, code: string}> = [
  // ---------------------------------------------------------
  // Bot 1: Steady Eddie - Conservative, consistent driver
  // ---------------------------------------------------------
  {
    name: 'Johnny Turbo',
    team: 'Turbo Racing',
    teamColor: '#3498db',
    code: `
  // Johnny Turbo: Fast and consistent — speed-to-width targeting
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;
  var halfWidth = total / 2;
  var speed = telemetry.speed;

  // Centre-tracking steering with speed damping
  var offset = (right - left) / total;
  var steerGain = speed > 100 ? 1.1 : 1.8;
  var steering = offset * steerGain;
  if (steering > 0.65) steering = 0.65;
  if (steering < -0.65) steering = -0.65;

  // Target speed based on track width
  var targetSpeed = 70 + (total - 30) * 10;  // 30px→70, 42px→190
  if (targetSpeed > 230) targetSpeed = 230;
  if (targetSpeed < 55) targetSpeed = 55;

  var throttle = 1.0;
  var brake = 0;

  // Smooth speed management
  if (speed > targetSpeed * 1.15) {
    throttle = 0;
    brake = 0.35;
  } else if (speed > targetSpeed) {
    throttle = 0.3;
  }

  // Wall danger — earlier response than Speed Demon
  var minEdge = left < right ? left : right;
  var danger = 1.0 - (minEdge / halfWidth);
  if (danger < 0) danger = 0;

  if (danger > 0.5 && speed > 50) {
    throttle = 0.15;
    brake = 0.35;
  } else if (danger > 0.35 && speed > 80) {
    throttle = 0.4;
    brake = 0.1;
  }

  // Wide + safe = full send
  if (total >= 38 && danger < 0.25) {
    throttle = 1.0;
    brake = 0;
  }

  // DRS
  if (telemetry.drsAvailable && danger < 0.25) {
    throttle = 1.0;
    brake = 0;
  }

  // Off-track
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.2;
    brake = 0.2;
    steering *= 0.5;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },

  // ---------------------------------------------------------
  // Bot 2: Speed Demon - Aggressive, push-the-limits driver
  // ---------------------------------------------------------
  {
    name: 'Max Throttle',
    team: 'Maximum Attack',
    teamColor: '#e74c3c',
    code: `
  // Max Throttle: Aggressive late braker — lives on the edge
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;
  var halfWidth = total / 2;
  var speed = telemetry.speed;

  // Centre-seeking with speed damping
  var offset = (right - left) / total;
  var steerGain = speed > 100 ? 1.3 : 2.2;
  var steering = offset * steerGain;
  if (steering > 0.8) steering = 0.8;
  if (steering < -0.8) steering = -0.8;

  // Target speed based on width — aggressive mapping
  var targetSpeed = 80 + (total - 30) * 12;  // 30px→80, 42px→224
  if (targetSpeed > 250) targetSpeed = 250;
  if (targetSpeed < 60) targetSpeed = 60;

  var throttle = 1.0;
  var brake = 0;

  // Speed management — brake hard if way over target
  if (speed > targetSpeed * 1.3) {
    throttle = 0;
    brake = 0.5;
  } else if (speed > targetSpeed * 1.1) {
    throttle = 0.2;
    brake = 0.15;
  } else if (speed > targetSpeed) {
    throttle = 0.5;
  }

  // Wall danger override
  var minEdge = left < right ? left : right;
  var danger = 1.0 - (minEdge / halfWidth);
  if (danger < 0) danger = 0;
  if (danger > 0.6 && speed > 60) {
    throttle = 0.1;
    brake = 0.4;
  }

  // DRS
  if (telemetry.drsAvailable && danger < 0.3) {
    throttle = 1.0;
    brake = 0;
  }

  // Off-track
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.15;
    brake = 0.3;
    steering *= 0.4;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },

  // ---------------------------------------------------------
  // Bot 3: Smooth Operator - Balanced, tyre-saving driver
  // ---------------------------------------------------------
  {
    name: 'Gloria Slap',
    team: 'Slap Racing',
    teamColor: '#2ecc71',
    code: `
  // Gloria Slap: Smooth and calculated — zero wall hits is the goal
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;
  var halfWidth = total / 2;
  var speed = telemetry.speed;

  // Smooth centre-tracking
  var offset = (right - left) / total;
  var steerGain = speed > 80 ? 1.0 : 1.8;
  var steering = offset * steerGain;
  // Dampen aggressive corrections
  if (steering > 0.5) steering = 0.5 + (steering - 0.5) * 0.3;
  if (steering < -0.5) steering = -0.5 + (steering + 0.5) * 0.3;

  var throttle = 0.85;
  var brake = 0;

  // Wall danger
  var minEdge = left < right ? left : right;
  var danger = 1.0 - (minEdge / halfWidth);
  if (danger < 0) danger = 0;

  // Speed target based on track width — wider = faster
  var targetSpeed = 60 + (total - 30) * 8;  // 30px→60, 42px→156
  if (targetSpeed > 220) targetSpeed = 220;
  if (targetSpeed < 50) targetSpeed = 50;

  // If above target speed, coast or brake
  if (speed > targetSpeed * 1.2) {
    throttle = 0;
    brake = 0.3;
  } else if (speed > targetSpeed) {
    throttle = 0.3;
  } else {
    throttle = 0.9;
  }

  // Emergency wall avoidance
  if (danger > 0.65 && speed > 50) {
    throttle = 0.15;
    brake = 0.4;
  }

  // Wide + centred = full throttle
  if (total >= 38 && danger < 0.25 && speed < targetSpeed) {
    throttle = 1.0;
    brake = 0;
  }

  // DRS
  if (telemetry.drsAvailable && danger < 0.25) {
    throttle = 1.0;
    brake = 0;
  }

  // Off-track
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.15;
    brake = 0.25;
    steering *= 0.4;
  }

  // Weather
  if (telemetry.weather !== 'dry') {
    throttle *= 0.8;
    steering *= 0.75;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },

  // ---------------------------------------------------------
  // Bot 4: DelBoy - Built by Hermes/DelBoy bot (Mark's AI)
  // ---------------------------------------------------------
  {
    name: 'DelBoy',
    team: 'Peckham Racing',
    teamColor: '#f39c12',
    code: `
  // DelBoy: Track-following, gravel-avoiding, DRS-aware
  // Built by Mark's bot Hermes (aka DelBoy / Captain Pugwash)
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;
  var halfWidth = total / 2;
  var speed = telemetry.speed;

  // Centre-tracking steering with dynamic gain
  var offset = (right - left) / total;
  var steerGain = speed > 120 ? 1.2 : 2.0;
  var steering = offset * steerGain;
  if (steering > 0.7) steering = 0.7;
  if (steering < -0.7) steering = -0.7;

  // Target speed based on track width
  var targetSpeed = 75 + (total - 30) * 10;
  if (targetSpeed > 240) targetSpeed = 240;
  if (targetSpeed < 55) targetSpeed = 55;

  var throttle = 1.0;
  var brake = 0;

  // Speed control
  if (speed > targetSpeed * 1.15) {
    throttle = 0;
    brake = 0.4;
  } else if (speed > targetSpeed * 1.05) {
    throttle = 0.3;
  } else if (speed < targetSpeed * 0.9) {
    throttle = 1.0;
  }

  // Wall danger detection — early warning
  var minEdge = left < right ? left : right;
  var danger = 1.0 - (minEdge / halfWidth);
  if (danger < 0) danger = 0;

  if (danger > 0.55 && speed > 50) {
    throttle = 0.1;
    brake = 0.4;
    steering *= 0.6;
  } else if (danger > 0.35 && speed > 80) {
    throttle = 0.4;
    brake = 0.15;
  }

  // Surface detection
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.2;
    brake = 0.3;
    steering *= 0.5;
  }

  // DRS — safe straights only
  if (telemetry.drsAvailable && danger < 0.25 && steering < 0.2 && steering > -0.2) {
    throttle = 1.0;
    brake = 0;
  }

  // Wide + safe = full send
  if (total >= 38 && danger < 0.25 && speed < targetSpeed) {
    throttle = 1.0;
    brake = 0;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },
];

export default exampleBots;
