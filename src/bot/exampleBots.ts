// ============================================================
// AI Grand Prix - Example Bots
// ============================================================

export const exampleBots: Array<{name: string, team: string, teamColor: string, code: string}> = [
  // ---------------------------------------------------------
  // Bot 1: Steady Eddie - Conservative, consistent driver
  // ---------------------------------------------------------
  {
    name: 'Steady Eddie',
    team: 'Consistent Racing',
    teamColor: '#3498db',
    code: `
  // Steady Eddie: Conservative driver that stays on the racing line
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;

  // Steer toward center with gentle corrections
  var offset = (right - left) / total;
  var steering = offset * 1.6;

  // Clamp steering for smooth inputs
  if (steering > 0.6) steering = 0.6;
  if (steering < -0.6) steering = -0.6;

  // Conservative base throttle
  var throttle = 0.6;
  var brake = 0;

  // Early braking when track narrows (approaching corner)
  if (total < 40) {
    throttle = 0.3;
    brake = 0.15;
  }
  if (total < 28) {
    throttle = 0.2;
    brake = 0.35;
  }

  // Slight speed-based braking - slow down if going fast in tight sections
  if (telemetry.speed > 180 && total < 50) {
    throttle = 0.25;
    brake = 0.25;
  }

  // Keep safe distance from car ahead
  if (telemetry.distToCarAhead < 80) {
    throttle *= 0.7;
  }
  if (telemetry.distToCarAhead < 40) {
    throttle = 0.2;
    brake = 0.2;
  }

  // On wide open straights, open up a bit
  if (total > 60 && telemetry.speed < 200) {
    throttle = 0.75;
    brake = 0;
  }

  // Use DRS conservatively
  if (telemetry.drsAvailable && total > 50) {
    throttle = 0.85;
  }

  // Back off on worn tyres
  if (telemetry.tyreWear > 0.5) {
    throttle *= 0.9;
  }
  if (telemetry.tyreWear > 0.75) {
    throttle *= 0.85;
  }

  // Reduce aggression on low-grip surfaces
  if (telemetry.currentSurface === 'kerb') {
    throttle *= 0.85;
    steering *= 0.7;
  }
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.15;
    brake = 0.3;
    steering *= 0.5;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },

  // ---------------------------------------------------------
  // Bot 2: Speed Demon - Aggressive, push-the-limits driver
  // ---------------------------------------------------------
  {
    name: 'Speed Demon',
    team: 'Maximum Attack',
    teamColor: '#e74c3c',
    code: `
  // Speed Demon: Aggressive driver that pushes hard
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;

  // Aggressive steering with sharper corrections
  var offset = (right - left) / total;
  var steering = offset * 2.8;

  // High base throttle - always attacking
  var throttle = 0.9;
  var brake = 0;

  // Late braking - only brake in very tight sections
  if (total < 25) {
    throttle = 0.35;
    brake = 0.4;
  } else if (total < 35) {
    throttle = 0.55;
    brake = 0.1;
  }

  // Full send on straights
  if (total > 55) {
    throttle = 1.0;
    brake = 0;
  }

  // Slam DRS open whenever possible
  if (telemetry.drsAvailable) {
    throttle = 1.0;
    brake = 0;
  }

  // Only back off from car ahead at very close range
  if (telemetry.distToCarAhead < 30) {
    throttle = 0.5;
    // Try to find a gap - steer slightly to the side with more room
    if (left > right) {
      steering -= 0.15;
    } else {
      steering += 0.15;
    }
  }

  // Barely notices tyre wear - only reacts when critical
  if (telemetry.tyreWear > 0.8) {
    throttle *= 0.9;
  }

  // Attack mode from strategy pushes even harder
  if (strategy.mode === 'attack') {
    throttle = Math.min(throttle * 1.1, 1.0);
  }

  // Rich fuel mode when available - more power
  if (strategy.fuelMode === 'rich' && total > 40) {
    throttle = Math.min(throttle + 0.05, 1.0);
  }

  // Even on bad surfaces, still push (slightly reckless)
  if (telemetry.currentSurface === 'kerb') {
    throttle *= 0.9;
  }
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.3;
    brake = 0.2;
    steering *= 0.6;
  }

  // Wet weather? Still pushing, just a touch less
  if (telemetry.weather === 'light_rain') {
    throttle *= 0.9;
  }
  if (telemetry.weather === 'heavy_rain') {
    throttle *= 0.8;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },

  // ---------------------------------------------------------
  // Bot 3: Smooth Operator - Balanced, tyre-saving driver
  // ---------------------------------------------------------
  {
    name: 'Smooth Operator',
    team: 'Silk Racing',
    teamColor: '#2ecc71',
    code: `
  // Smooth Operator: Balanced driver optimizing for smoothness
  var left = telemetry.trackEdges.left;
  var right = telemetry.trackEdges.right;
  var total = left + right;

  // Smooth steering with gradual corrections
  var offset = (right - left) / total;
  var steering = offset * 2.0;

  // Smooth the steering output to avoid jerky inputs
  if (steering > 0.5) steering = 0.5 + (steering - 0.5) * 0.5;
  if (steering < -0.5) steering = -0.5 + (steering + 0.5) * 0.5;

  // Moderate base throttle
  var throttle = 0.7;
  var brake = 0;

  // Progressive braking for corners
  if (total < 50 && telemetry.speed > 150) {
    throttle = 0.4;
    brake = 0.15;
  }
  if (total < 35) {
    throttle = 0.3;
    brake = 0.25;
  }
  if (total < 25) {
    throttle = 0.15;
    brake = 0.35;
  }

  // Smooth acceleration out of corners - ramp up on wider sections
  if (total > 50 && total < 70) {
    throttle = 0.75;
  }
  if (total > 70) {
    throttle = 0.85;
  }

  // Intelligent tyre management - the key strength
  var tyreMultiplier = 1.0;
  if (telemetry.tyreWear > 0.3) {
    tyreMultiplier = 1.0 - (telemetry.tyreWear - 0.3) * 0.4;
  }
  throttle *= tyreMultiplier;
  // Also reduce steering aggressiveness on worn tyres to prevent slides
  if (telemetry.tyreWear > 0.5) {
    steering *= 0.85;
  }

  // Fuel management - ease off when fuel is low
  if (telemetry.fuel < 0.2) {
    throttle *= 0.9;
  }

  // Smart DRS usage - only on proper straights
  if (telemetry.drsAvailable && total > 60 && telemetry.speed > 100) {
    throttle = 0.95;
    brake = 0;
  }

  // Safe following distance with draft benefit
  if (telemetry.distToCarAhead < 60) {
    throttle *= 0.8;
  }
  if (telemetry.distToCarAhead < 30) {
    throttle = 0.25;
    brake = 0.15;
  }

  // Surface awareness
  if (telemetry.currentSurface === 'kerb') {
    throttle *= 0.8;
    steering *= 0.75;
  }
  if (telemetry.currentSurface === 'grass' || telemetry.currentSurface === 'gravel') {
    throttle = 0.1;
    brake = 0.3;
    steering *= 0.4;
  }

  // Weather adaptation
  if (telemetry.weather === 'light_rain') {
    throttle *= 0.85;
    steering *= 0.8;
  }
  if (telemetry.weather === 'heavy_rain') {
    throttle *= 0.7;
    steering *= 0.65;
    brake *= 0.8;
  }

  // Conserve mode from strategy - save tyres and fuel
  if (strategy.mode === 'conserve') {
    throttle *= 0.9;
  }

  return { steering: steering, throttle: throttle, brake: brake };
`,
  },
];

export default exampleBots;
