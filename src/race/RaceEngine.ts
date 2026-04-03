import { v4 as uuid } from 'uuid';
import {
  CarState,
  SessionState,
  SessionType,
  WeatherCondition,
  RaceEvent,
  LiveFeed,
  LiveCarData,
  Telemetry,
  TyreCompound,
  Strategy,
  WEATHER_GRIP,
  DriverInput,
} from '../types';
import { Track } from '../track/Track';
import CarPhysics from '../physics/CarPhysics';
import BotManager from '../bot/BotManager';
import DriverSandbox from '../bot/DriverSandbox';

const TICK_RATE = 30; // fps
const TICK_MS = 1000 / TICK_RATE;
const BROADCAST_RATE = 10; // broadcast live feed 10 times per second
const BROADCAST_INTERVAL = 1000 / BROADCAST_RATE;
const PIT_STOP_DURATION = 2500; // ms
const SAFETY_CAR_SPEED = 80; // pixels/sec
const MAX_EVENTS_KEPT = 200;
const WEATHER_CHANGE_INTERVAL = 120_000; // 2 min between possible weather changes
const WEATHER_CHANGE_CHANCE = 0.15;

// Cars on the same segment within this lateral distance count as a collision
const COLLISION_LATERAL_THRESHOLD = 25; // pixels

export class RaceEngine {
  public spectatorCount: number = 0;
  public onLiveFeed: ((feed: LiveFeed) => void) | null = null;

  private track: Track;
  private botManager: BotManager;

  private session: SessionState;
  private carPhysics: Map<string, CarPhysics> = new Map();
  private sandboxes: Map<string, DriverSandbox> = new Map();
  private pitStopTimers: Map<string, { startTime: number; compound: TyreCompound; fuel: number }> = new Map();

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private lastWeatherCheck: number = 0;
  private debugTickCounter: number = 0;

  constructor(track: Track, botManager: BotManager) {
    this.track = track;
    this.botManager = botManager;

    // Initialize a free practice session
    this.session = {
      id: uuid(),
      type: 'practice',
      trackName: track.data.name,
      status: 'active',
      startTime: Date.now(),
      elapsedTime: 0,
      totalLaps: 0,
      weather: 'dry',
      safetyCar: false,
      safetyCarLapsRemaining: 0,
      cars: new Map(),
      standings: [],
      events: [],
    };
  }

  start(): void {
    if (this.tickInterval) return;

    const tickDt = 1 / TICK_RATE;
    this.tickInterval = setInterval(() => {
      this.tick(tickDt);
    }, TICK_MS);

    this.broadcastInterval = setInterval(() => {
      if (this.onLiveFeed) {
        this.onLiveFeed(this.getLiveFeed());
      }
    }, BROADCAST_INTERVAL);

    this.addEvent('join', {}, 'Free practice session is live!');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  // ----- Car management -----

  addCar(botId: string): void {
    const bot = this.botManager.getBot(botId);
    if (!bot) throw new Error('Bot not found.');
    if (this.session.cars.has(botId)) throw new Error('Bot is already on track.');

    // Place car staggered along the track from start/finish
    const segs = this.track.data.segments;
    const sfIdx = this.track.data.startFinishIndex;
    const carsOnTrack = this.session.cars.size;
    // Spread cars 5 segments apart along the track
    const placementIdx = (sfIdx + carsOnTrack * 5) % segs.length;
    const placeSeg = segs[placementIdx];
    const nextSeg = segs[(placementIdx + 1) % segs.length];

    // Calculate facing angle toward the next segment
    const angle = Math.atan2(
      nextSeg.center.y - placeSeg.center.y,
      nextSeg.center.x - placeSeg.center.x
    );

    const carState: CarState = {
      id: botId,
      botId,
      x: placeSeg.center.x,
      y: placeSeg.center.y,
      angle,
      speed: 0,
      steeringAngle: 0,
      throttle: 0,
      brake: 0,
      tyreCompound: 'medium',
      tyreWear: 0,
      fuel: 1.0,
      fuelMode: 'standard',
      drsActive: false,
      lap: 0,
      currentSegmentIndex: placementIdx,
      lastLapTime: 0,
      bestLapTime: 0,
      sectorTimes: [],
      currentSectorStart: Date.now(),
      lapStartTime: Date.now(),
      totalDistance: 0,
      pitStops: 0,
      retired: false,
      teamColor: bot.teamColor,
    };

    const physics = new CarPhysics(carState, this.track);
    this.carPhysics.set(botId, physics);
    this.session.cars.set(botId, carState);

    // Create sandbox for driver code
    if (bot.driverCode) {
      this.sandboxes.set(botId, new DriverSandbox(bot.driverCode));
    }

    this.addEvent('join', { botId, name: bot.name }, `${bot.name} joined the track`);
  }

  removeCar(botId: string): void {
    const physics = this.carPhysics.get(botId);
    if (!physics) throw new Error('Bot is not on track.');

    this.carPhysics.delete(botId);
    this.session.cars.delete(botId);

    const sandbox = this.sandboxes.get(botId);
    if (sandbox) {
      sandbox.dispose();
      this.sandboxes.delete(botId);
    }

    this.pitStopTimers.delete(botId);

    const bot = this.botManager.getBot(botId);
    const name = bot?.name || botId;
    this.addEvent('leave', { botId }, `${name} left the track`);
  }

  // ----- Main tick -----

  private tick(dt: number): void {
    this.session.elapsedTime = Date.now() - this.session.startTime;

    // Weather changes
    this.checkWeather();

    // Process each car
    for (const [botId, physics] of this.carPhysics) {
      const state = physics.getState();
      if (state.retired) continue;

      // Check pit stop in progress
      if (this.pitStopTimers.has(botId)) {
        const pit = this.pitStopTimers.get(botId)!;
        if (Date.now() - pit.startTime >= PIT_STOP_DURATION) {
          physics.pitStop(pit.compound, pit.fuel);
          this.pitStopTimers.delete(botId);
          const bot = this.botManager.getBot(botId);
          this.addEvent('pit_stop', { botId, compound: pit.compound },
            `${bot?.name || botId} completed pit stop → ${pit.compound} tyres`);
        }
        continue; // Car is stationary during pit stop
      }

      // Refresh sandbox if driver code changed
      const bot = this.botManager.getBot(botId);
      if (bot && bot.driverCode) {
        if (!this.sandboxes.has(botId)) {
          this.sandboxes.set(botId, new DriverSandbox(bot.driverCode));
        }
      }

      // Get driver input from sandbox
      const sandbox = this.sandboxes.get(botId);
      const strategy = this.botManager.getStrategy(botId);
      const telemetry = this.buildTelemetry(botId, state);

      let input = { steering: 0, throttle: 0, brake: 0 };
      if (sandbox && telemetry) {
        input = sandbox.execute(telemetry, strategy);
      }

      this.debugTickCounter++;

      // Safety car speed limit
      if (this.session.safetyCar && state.speed > SAFETY_CAR_SPEED) {
        input.throttle = 0;
        input.brake = 0.3;
      }

      // Get surface and update physics
      const surface = this.track.getSurfaceAt({ x: state.x, y: state.y });
      physics.update(input, surface, this.session.weather, dt);

      // DRS
      const updatedState = physics.getState();
      const segIdx = updatedState.currentSegmentIndex;
      physics.setDRS(this.track.isInDRSZone(segIdx) && !this.session.safetyCar);

      // Lap counting — checkLapCompletion may modify updatedState (lap, lapStartTime, etc.)
      const prevLap = updatedState.lap;
      this.checkLapCompletion(botId, updatedState, state.currentSegmentIndex, segIdx);
      // Sync lap/timing changes back into physics so they persist across ticks
      if (updatedState.lap !== prevLap) {
        physics.syncState({
          lap: updatedState.lap,
          lapStartTime: updatedState.lapStartTime,
          lastLapTime: updatedState.lastLapTime,
          bestLapTime: updatedState.bestLapTime,
          currentSectorStart: updatedState.currentSectorStart,
          sectorTimes: updatedState.sectorTimes,
        });
      }
      // Write updated state to session.cars
      this.session.cars.set(botId, updatedState);

      // Check pit request
      if (strategy.boxThisLap && this.track.isInPitLane(segIdx)) {
        if (!this.pitStopTimers.has(botId)) {
          this.pitStopTimers.set(botId, {
            startTime: Date.now(),
            compound: strategy.compound,
            fuel: 1.0,
          });
          // Stop the car
          physics.stop();
          // Reset box flag
          this.botManager.updateStrategy(botId, { boxThisLap: false });
        }
      }

      // Fuel retirement
      if (updatedState.fuel <= 0 && updatedState.speed < 1) {
        physics.retire('Ran out of fuel');
        this.addEvent('retirement', { botId },
          `${bot?.name || botId} retired - out of fuel`);
      }


    }

    // Check for car-car collisions (same segment proximity)
    this.checkCarCollisions();

    // Update standings
    this.updateStandings();

    // Check race finish
    this.checkFinishConditions();

    // Safety car lap countdown (decrement when leader completes a lap)
    if (this.session.safetyCar && this.session.safetyCarLapsRemaining <= 0) {
      this.session.safetyCar = false;
      this.addEvent('safety_car_end', {}, 'Safety car has returned to the pits');
    }
  }

  /**
   * Simple proximity-based collision detection between cars.
   * Cars on the same or adjacent segments within lateral threshold collide.
   */
  private checkCarCollisions(): void {
    const entries = Array.from(this.session.cars.entries()).filter(([, s]) => !s.retired);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, stateA] = entries[i];
        const [idB, stateB] = entries[j];

        const segDiff = Math.abs(stateA.currentSegmentIndex - stateB.currentSegmentIndex);
        const totalSegs = this.track.data.segments.length;
        const wrappedDiff = Math.min(segDiff, totalSegs - segDiff);

        if (wrappedDiff <= 1) {
          const dx = stateA.x - stateB.x;
          const dy = stateA.y - stateB.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < COLLISION_LATERAL_THRESHOLD) {
            this.carPhysics.get(idA)?.applyCollisionDamage();
            this.carPhysics.get(idB)?.applyCollisionDamage();

            const botA = this.botManager.getBot(idA);
            const botB = this.botManager.getBot(idB);
            this.addEvent('incident', { cars: [idA, idB] },
              `Contact between ${botA?.name || idA} and ${botB?.name || idB}`);
          }
        }
      }
    }
  }

  private checkLapCompletion(botId: string, state: CarState, prevSegIdx: number, curSegIdx: number): void {
    const sfIdx = this.track.data.startFinishIndex;
    const totalSegs = this.track.data.segments.length;
    const [s1End, s2End] = this.track.data.sectorIndices;

    // Detect crossing start/finish line (segment index wraps around)
    const prevDist = ((prevSegIdx - sfIdx) + totalSegs) % totalSegs;
    const curDist = ((curSegIdx - sfIdx) + totalSegs) % totalSegs;

    // Crossed start/finish if we went from high segment index to low
    if (prevDist > totalSegs * 0.8 && curDist < totalSegs * 0.2 && state.lap >= 0) {
      const now = Date.now();

      if (state.lap > 0) {
        state.lastLapTime = now - state.lapStartTime;
        if (state.bestLapTime === 0 || state.lastLapTime < state.bestLapTime) {
          state.bestLapTime = state.lastLapTime;
          const bot = this.botManager.getBot(botId);
          this.addEvent('lap_record', { botId, time: state.bestLapTime },
            `${bot?.name || botId} set best lap: ${(state.bestLapTime / 1000).toFixed(3)}s`);
        }
      }

      state.lap++;
      state.lapStartTime = now;
      state.currentSectorStart = now;
      state.sectorTimes = [];

    }

    // Sector timing
    if (state.sectorTimes.length === 0 && curSegIdx >= s1End && prevSegIdx < s1End) {
      state.sectorTimes.push(Date.now() - state.currentSectorStart);
      state.currentSectorStart = Date.now();
    }
    if (state.sectorTimes.length === 1 && curSegIdx >= s2End && prevSegIdx < s2End) {
      state.sectorTimes.push(Date.now() - state.currentSectorStart);
      state.currentSectorStart = Date.now();
    }
  }

  private checkWeather(): void {
    const now = Date.now();
    if (now - this.lastWeatherCheck < WEATHER_CHANGE_INTERVAL) return;
    this.lastWeatherCheck = now;

    if (Math.random() < WEATHER_CHANGE_CHANCE) {
      const conditions: WeatherCondition[] = ['dry', 'light_rain', 'heavy_rain'];
      const current = conditions.indexOf(this.session.weather);
      // Move to adjacent weather (no jump from dry to heavy rain)
      const direction = Math.random() < 0.5 ? -1 : 1;
      const newIdx = Math.max(0, Math.min(2, current + direction));
      const newWeather = conditions[newIdx];

      if (newWeather !== this.session.weather) {
        this.session.weather = newWeather;
        this.addEvent('weather_change', { weather: newWeather },
          `Weather changed to ${newWeather.replace('_', ' ')}`);
      }
    }
  }

  private updateStandings(): void {
    const cars = Array.from(this.session.cars.values())
      .filter(c => !c.retired);

    // Sort by lap (descending), then by segment index progress (descending)
    cars.sort((a, b) => {
      if (b.lap !== a.lap) return b.lap - a.lap;
      return b.currentSegmentIndex - a.currentSegmentIndex;
    });

    this.session.standings = cars.map(c => c.botId);
  }

  // ----- Telemetry -----

  buildTelemetry(botId: string, state: CarState): Telemetry | null {
    const edges = this.track.getTrackEdges(state.currentSegmentIndex, state.x, state.y);
    const surface = this.track.getSurfaceAt({ x: state.x, y: state.y });
    const position = this.session.standings.indexOf(botId) + 1;

    // Distance to car ahead
    let distAhead = 9999;
    let distBehind = 9999;
    const posIdx = this.session.standings.indexOf(botId);
    if (posIdx > 0) {
      const aheadId = this.session.standings[posIdx - 1];
      const aheadCar = this.session.cars.get(aheadId);
      if (aheadCar) {
        const dx = aheadCar.x - state.x;
        const dy = aheadCar.y - state.y;
        distAhead = Math.sqrt(dx * dx + dy * dy);
      }
    }
    if (posIdx < this.session.standings.length - 1) {
      const behindId = this.session.standings[posIdx + 1];
      const behindCar = this.session.cars.get(behindId);
      if (behindCar) {
        const dx = behindCar.x - state.x;
        const dy = behindCar.y - state.y;
        distBehind = Math.sqrt(dx * dx + dy * dy);
      }
    }

    return {
      speed: state.speed,
      position: { x: state.x, y: state.y },
      heading: state.angle,
      trackEdges: edges,
      distToCarAhead: distAhead,
      distToCarBehind: distBehind,
      tyreWear: state.tyreWear,
      tyreCompound: state.tyreCompound,
      fuel: state.fuel,
      lap: state.lap,
      totalLaps: this.session.totalLaps,
      weather: this.session.weather,
      drsAvailable: this.track.isInDRSZone(state.currentSegmentIndex) && !this.session.safetyCar,
      currentSurface: surface,
      sectorTimes: state.sectorTimes,
      lastLapTime: state.lastLapTime,
      bestLapTime: state.bestLapTime,
      racePosition: position,
      trackSegmentIndex: state.currentSegmentIndex,
      trackLength: this.track.totalLength,
    };
  }

  getTelemetry(botId: string): Telemetry | null {
    const state = this.session.cars.get(botId);
    if (!state) return null;
    return this.buildTelemetry(botId, state);
  }

  // ----- Live feed -----

  getLiveFeed(): LiveFeed {
    const cars: LiveCarData[] = [];
    const standings = this.session.standings;

    for (const [botId, state] of this.session.cars) {
      const bot = this.botManager.getBot(botId);
      const position = standings.indexOf(botId) + 1;

      // Calculate gap to leader
      let gap = 'LEADER';
      if (position > 1 && standings.length > 0) {
        const leader = this.session.cars.get(standings[0]);
        if (leader) {
          if (state.lap < leader.lap) {
            gap = `+${leader.lap - state.lap} lap(s)`;
          } else {
            // Approximate time gap from segment difference
            const segDiff = leader.currentSegmentIndex - state.currentSegmentIndex;
            const approxGap = Math.abs(segDiff) * 0.1;
            gap = `+${approxGap.toFixed(1)}s`;
          }
        }
      }

      cars.push({
        id: botId,
        botName: bot?.name || botId,
        team: bot?.team || 'Unknown',
        teamColor: state.teamColor,
        x: state.x,
        y: state.y,
        angle: state.angle,
        speed: state.speed,
        lap: state.lap,
        position,
        lastLapTime: state.lastLapTime,
        bestLapTime: state.bestLapTime,
        tyreCompound: state.tyreCompound,
        tyreWear: state.tyreWear,
        fuel: state.fuel,
        pitStops: state.pitStops,
        drsActive: state.drsActive,
        retired: state.retired,
        gap,
      });
    }

    // Sort by position
    cars.sort((a, b) => a.position - b.position);

    return {
      session: {
        id: this.session.id,
        type: this.session.type,
        status: this.session.status,
        weather: this.session.weather,
        safetyCar: this.session.safetyCar,
        elapsedTime: this.session.elapsedTime,
        totalLaps: this.session.totalLaps,
      },
      cars,
      recentEvents: this.session.events.slice(-20),
      spectatorCount: this.spectatorCount,
    };
  }

  // ----- Session management -----

  startSession(type: SessionType, totalLaps?: number): void {
    this.stop();

    let laps: number;
    switch (type) {
      case 'practice':
        laps = 0;
        break;
      case 'qualifying':
        laps = totalLaps ?? 3;
        break;
      case 'race':
        laps = totalLaps ?? 20;
        break;
      case 'endurance':
        laps = totalLaps ?? 50;
        break;
      default:
        laps = totalLaps ?? 0;
    }

    // Preserve cars on track
    const existingBotIds = Array.from(this.session.cars.keys());

    this.session = {
      id: uuid(),
      type,
      trackName: this.track.data.name,
      status: 'waiting',
      startTime: Date.now(),
      elapsedTime: 0,
      totalLaps: laps,
      weather: this.session.weather,
      safetyCar: false,
      safetyCarLapsRemaining: 0,
      cars: new Map(),
      standings: [],
      events: [],
    };

    // Re-add existing cars with fresh state
    for (const botId of existingBotIds) {
      if (this.botManager.getBot(botId)) {
        // Remove old physics and sandbox
        this.carPhysics.delete(botId);
        const oldSandbox = this.sandboxes.get(botId);
        if (oldSandbox) {
          oldSandbox.dispose();
          this.sandboxes.delete(botId);
        }
        this.pitStopTimers.delete(botId);

        try {
          this.addCar(botId);
        } catch {
          // Bot may have been removed
        }
      }
    }
  }

  pitStop(botId: string): void {
    const car = this.session.cars.get(botId);
    if (!car || car.retired) return;
    if (this.pitStopTimers.has(botId)) return;

    const strategy = this.botManager.getStrategy(botId);

    this.pitStopTimers.set(botId, {
      startTime: Date.now(),
      compound: strategy.compound,
      fuel: Math.min(1, car.fuel + 0.5),
    });

    // Stop the car
    const physics = this.carPhysics.get(botId);
    if (physics) {
      physics.stop();
    }

    car.pitStops++;

    this.addEvent('pit_stop', { botId, lap: car.lap, compound: strategy.compound },
      `${this.botManager.getBot(botId)?.name || botId} pitting on lap ${car.lap}`);
  }

  changeWeather(weather: WeatherCondition): void {
    const old = this.session.weather;
    this.session.weather = weather;
    this.addEvent('weather_change', { from: old, to: weather },
      `Weather changed from ${old.replace('_', ' ')} to ${weather.replace('_', ' ')}`);
  }

  deploySafetyCar(laps: number): void {
    this.session.safetyCar = true;
    this.session.safetyCarLapsRemaining = laps;
    this.addEvent('safety_car', { laps },
      `Safety car deployed for ${laps} lap${laps !== 1 ? 's' : ''}`);
  }

  getStandings(): string[] {
    return [...this.session.standings];
  }

  // ----- Race finish detection -----

  private checkFinishConditions(): void {
    if (this.session.status !== 'active') return;
    if (this.session.type === 'practice') return;
    if (this.session.totalLaps <= 0) return;

    const activeCars = Array.from(this.session.cars.values()).filter(c => !c.retired);

    // All cars retired
    if (activeCars.length === 0 && this.session.cars.size > 0) {
      this.finishSession();
      return;
    }

    // Leader completed all laps
    for (const car of activeCars) {
      if (car.lap > this.session.totalLaps) {
        this.finishSession();
        return;
      }
    }
  }

  private finishSession(): void {
    this.session.status = 'finished';
    this.addEvent('finish', { standings: [...this.session.standings] }, 'Session finished');
    this.stop();
  }

  // ----- Helpers -----

  private addEvent(type: RaceEvent['type'], data: Record<string, any>, message: string): void {
    this.session.events.push({
      time: Date.now(),
      type,
      data,
      message,
    });

    // Trim old events
    if (this.session.events.length > MAX_EVENTS_KEPT) {
      this.session.events = this.session.events.slice(-MAX_EVENTS_KEPT);
    }
  }

  getSession(): SessionState {
    return this.session;
  }

  getTrack(): Track {
    return this.track;
  }
}

export default RaceEngine;
