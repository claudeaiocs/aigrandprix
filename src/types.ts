// ============================================================
// AI Grand Prix - Core Types
// ============================================================

// --- Track Types ---

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackSegment {
  center: TrackPoint;
  width: number;
  surface: SurfaceType;
}

export type SurfaceType = 'tarmac' | 'kerb' | 'grass' | 'gravel';

export const SURFACE_GRIP: Record<SurfaceType, number> = {
  tarmac: 1.0,
  kerb: 0.8,
  grass: 0.3,
  gravel: 0.1,
};

export interface DRSZone {
  startIndex: number;
  endIndex: number;
}

export interface PitLane {
  entry: number;   // segment index
  exit: number;    // segment index
  path: TrackPoint[];
}

export interface TrackData {
  name: string;
  segments: TrackSegment[];
  pitLane: PitLane;
  drsZones: DRSZone[];
  startFinishIndex: number;
  sectorIndices: [number, number]; // S1 and S2 end indices
}

// --- Car / Physics Types ---

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'wet';

export const TYRE_GRIP: Record<TyreCompound, number> = {
  soft: 1.1,
  medium: 1.0,
  hard: 0.9,
  wet: 0.7,
};

export const TYRE_WEAR_RATE: Record<TyreCompound, number> = {
  soft: 0,    // DISABLED for testing
  medium: 0,  // DISABLED for testing
  hard: 0,    // DISABLED for testing
  wet: 0,     // DISABLED for testing
};

export const TYRE_DURABILITY: Record<TyreCompound, number> = {
  soft: 0.6,   // degrades fast after 60% wear
  medium: 0.75,
  hard: 0.9,
  wet: 0.7,
};

export interface CarState {
  id: string;
  botId: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  steeringAngle: number;
  throttle: number;
  brake: number;
  tyreCompound: TyreCompound;
  tyreWear: number;       // 0 = fresh, 1 = destroyed
  fuel: number;           // 0..1
  fuelMode: FuelMode;
  drsActive: boolean;
  lap: number;
  currentSegmentIndex: number;
  lastLapTime: number;
  bestLapTime: number;
  sectorTimes: number[];
  currentSectorStart: number;
  lapStartTime: number;
  totalDistance: number;
  pitStops: number;
  retired: boolean;
  retiredReason?: string;
  teamColor: string;
}

export type FuelMode = 'lean' | 'standard' | 'rich';

export const FUEL_CONSUMPTION: Record<FuelMode, number> = {
  lean: 0,      // DISABLED for testing
  standard: 0,  // DISABLED for testing
  rich: 0,      // DISABLED for testing
};

export const FUEL_POWER: Record<FuelMode, number> = {
  lean: 0.85,
  standard: 1.0,
  rich: 1.15,
};

// --- Bot Types ---

export interface BotRegistration {
  id: string;
  name: string;
  team: string;
  teamColor: string;
  driverCode: string;
  apiKey: string;
  createdAt: number;
}

export interface DriverInput {
  steering: number;  // -1 to 1
  throttle: number;  // 0 to 1
  brake: number;     // 0 to 1
}

export interface Telemetry {
  speed: number;
  position: { x: number; y: number };
  heading: number;
  trackEdges: { left: number; right: number };
  distToCarAhead: number;
  distToCarBehind: number;
  tyreWear: number;
  tyreCompound: TyreCompound;
  fuel: number;
  lap: number;
  totalLaps: number;
  weather: WeatherCondition;
  drsAvailable: boolean;
  currentSurface: SurfaceType;
  sectorTimes: number[];
  lastLapTime: number;
  bestLapTime: number;
  racePosition: number;
  trackSegmentIndex: number;
  trackLength: number;
}

export interface Strategy {
  mode: 'attack' | 'defend' | 'conserve' | 'normal';
  compound: TyreCompound;
  fuelMode: FuelMode;
  pitWindow: { start: number; end: number };
  boxThisLap: boolean;
  customData: Record<string, any>;
}

// --- Race / Session Types ---

export type SessionType = 'practice' | 'qualifying' | 'race' | 'endurance';

export type WeatherCondition = 'dry' | 'light_rain' | 'heavy_rain';

export const WEATHER_GRIP: Record<WeatherCondition, number> = {
  dry: 1.0,
  light_rain: 0.7,
  heavy_rain: 0.4,
};

export interface SessionState {
  id: string;
  type: SessionType;
  trackName: string;
  status: 'waiting' | 'active' | 'finished';
  startTime: number;
  elapsedTime: number;
  totalLaps: number;        // 0 for practice (unlimited)
  weather: WeatherCondition;
  safetyCar: boolean;
  safetyCarLapsRemaining: number;
  cars: Map<string, CarState>;
  standings: string[];      // ordered bot IDs by position
  events: RaceEvent[];
}

export interface RaceEvent {
  time: number;
  type: 'overtake' | 'pit_stop' | 'incident' | 'weather_change'
      | 'safety_car' | 'safety_car_end' | 'lap_record' | 'finish'
      | 'join' | 'leave' | 'retirement' | 'drs_enabled';
  data: Record<string, any>;
  message: string;
}

// --- Live Feed Types ---

export interface LiveCarData {
  id: string;
  botName: string;
  team: string;
  teamColor: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  lap: number;
  position: number;
  lastLapTime: number;
  bestLapTime: number;
  tyreCompound: TyreCompound;
  tyreWear: number;
  fuel: number;
  pitStops: number;
  drsActive: boolean;
  retired: boolean;
  gap: string; // "+1.234s" or "LEADER"
}

export interface LiveFeed {
  session: {
    id: string;
    type: SessionType;
    status: string;
    weather: WeatherCondition;
    safetyCar: boolean;
    elapsedTime: number;
    totalLaps: number;
  };
  cars: LiveCarData[];
  recentEvents: RaceEvent[];
  spectatorCount: number;
}
