import {
  CarState,
  DriverInput,
  TyreCompound,
  FuelMode,
  SurfaceType,
  SURFACE_GRIP,
  TYRE_GRIP,
  TYRE_WEAR_RATE,
  TYRE_DURABILITY,
  FUEL_CONSUMPTION,
  FUEL_POWER,
  WEATHER_GRIP,
  WeatherCondition,
} from '../types';
import { Track } from '../track/Track';

// Physics constants — tuned for track-relative model
// Target: ~200 px/s racing speed, 0→200 in ~5s, meaningful braking zones
const MAX_SPEED = 300;  // hard cap (pixels/sec)
const BASE_GRIP = 1.0;
const DRAG_COEFFICIENT = 0.0006;    // quadratic drag: terminal v ≈ sqrt(accel/coeff) ≈ 250
const DRS_DRAG_REDUCTION = 0.20;
const THROTTLE_FORCE = 55;          // acceleration at full throttle+grip ≈ 55 px/s²
const BRAKE_FORCE = 80;             // deceleration at full brake+grip ≈ 80 px/s²
const STEER_LATERAL_RATE = 0.4;     // lateral movement factor
const HIGH_SPEED_STEER_FACTOR = 0.3; // steering effectiveness at max speed
const FUEL_WEIGHT_PENALTY = 0.05;    // 5% grip loss at full tank
const COLLISION_WEAR_PENALTY = 0.03;
const WORN_TYRE_THRESHOLD = 0.95;
const WORN_TYRE_GRIP_MULTIPLIER = 0.15;

// Effective mass for force→acceleration conversion
const BODY_MASS = 0.8;

// Wall hit speed penalty
const WALL_SPEED_PENALTY = 0.7;

class CarPhysics {
  private state: CarState;
  private track: Track;
  private drsActive: boolean = false;

  // Track-relative position
  private segmentIndex: number;
  private segmentProgress: number;  // 0-1 within current segment
  private lateralOffset: number;    // pixels from center (positive = left)

  constructor(initialState: CarState, track: Track) {
    this.state = { ...initialState };
    this.track = track;
    this.segmentIndex = initialState.currentSegmentIndex;
    this.segmentProgress = 0;
    this.lateralOffset = 0;
  }

  update(
    input: DriverInput,
    surface: SurfaceType,
    weather: WeatherCondition,
    dt: number,
  ): void {
    if (this.state.retired) return;

    const speed = this.state.speed;

    // --- Clamp inputs ---
    const steering = Math.max(-1, Math.min(1, input.steering));
    const throttle = Math.max(0, Math.min(1, input.throttle));
    const brake = Math.max(0, Math.min(1, input.brake));

    // --- Grip calculation (identical to original) ---
    const tyreGrip = TYRE_GRIP[this.state.tyreCompound];
    const surfaceGrip = SURFACE_GRIP[surface];
    const weatherGrip = WEATHER_GRIP[weather];
    const tyreCondition = this.getTyreCondition();
    const fuelWeightEffect = 1 - this.state.fuel * FUEL_WEIGHT_PENALTY;

    let grip =
      BASE_GRIP * tyreGrip * tyreCondition * surfaceGrip * weatherGrip * fuelWeightEffect;

    // Severely reduce grip on destroyed tyres
    if (this.state.tyreWear > WORN_TYRE_THRESHOLD) {
      grip *= WORN_TYRE_GRIP_MULTIPLIER;
    }

    // --- Throttle → acceleration ---
    // acceleration = throttle * THROTTLE_FORCE * fuelPower * grip
    // Terminal speed ≈ sqrt(THROTTLE_FORCE * grip / DRAG_COEFFICIENT) ≈ 245 px/s at full throttle
    if (this.state.fuel > 0 && throttle > 0) {
      const fuelPower = FUEL_POWER[this.state.fuelMode];
      const acceleration = throttle * THROTTLE_FORCE * fuelPower * grip;
      this.state.speed += acceleration * dt;
    }

    // --- Braking → deceleration ---
    if (brake > 0 && this.state.speed > 0.1) {
      const deceleration = brake * BRAKE_FORCE * grip;
      this.state.speed = Math.max(0, this.state.speed - deceleration * dt);
    }

    // --- Drag (quadratic: F_drag = coeff * v²) ---
    if (this.state.speed > 0.1) {
      let dragCoeff = DRAG_COEFFICIENT;
      if (this.drsActive) {
        dragCoeff *= (1 - DRS_DRAG_REDUCTION);
      }
      const dragDecel = dragCoeff * this.state.speed * this.state.speed;
      this.state.speed = Math.max(0, this.state.speed - dragDecel * dt);
    }

    // --- Speed limiting ---
    this.state.speed = Math.min(this.state.speed, MAX_SPEED);
    this.state.speed = Math.max(this.state.speed, 0);

    // --- Steering → lateral offset ---
    // Lateral movement scaled by speed and steering input
    if (this.state.speed > 0.5) {
      const speedRatio = Math.min(this.state.speed / MAX_SPEED, 1);
      const steerEffectiveness =
        HIGH_SPEED_STEER_FACTOR +
        (1 - HIGH_SPEED_STEER_FACTOR) * (1 - speedRatio);

      // Lateral shift: steering * speed_fraction * rate * effectiveness * dt
      const lateralDelta =
        steering * speedRatio * STEER_LATERAL_RATE * steerEffectiveness * this.state.speed * dt;

      this.lateralOffset += lateralDelta;
    }

    // --- Advance along the track ---
    const totalSegs = this.track.data.segments.length;
    let segLen = this.track.getSegmentLength(this.segmentIndex);
    
    // Skip zero-length segments (e.g. closing segment that duplicates start)
    if (segLen <= 0.001) {
      this.segmentIndex = (this.segmentIndex + 1) % totalSegs;
      this.segmentProgress = 0;
      segLen = this.track.getSegmentLength(this.segmentIndex);
    }
    
    if (segLen > 0) {
      this.segmentProgress += (this.state.speed * dt) / segLen;
    }

    // Handle segment transitions
    while (this.segmentProgress >= 1) {
      this.segmentProgress -= 1;
      this.segmentIndex = (this.segmentIndex + 1) % totalSegs;
      // Skip zero-length segments
      const newLen = this.track.getSegmentLength(this.segmentIndex);
      if (newLen <= 0.001) {
        this.segmentIndex = (this.segmentIndex + 1) % totalSegs;
      }
    }
    // Handle reverse (shouldn't happen normally, but be safe)
    while (this.segmentProgress < 0) {
      this.segmentProgress += 1;
      this.segmentIndex = (this.segmentIndex - 1 + totalSegs) % totalSegs;
    }

    // --- Wall collision (clamp lateral offset to track width) ---
    const halfWidth = this.track.getHalfWidth(this.segmentIndex, this.segmentProgress);
    if (this.lateralOffset > halfWidth) {
      this.lateralOffset = halfWidth;
      this.state.speed *= WALL_SPEED_PENALTY;
      this.state.tyreWear = Math.min(1, this.state.tyreWear + COLLISION_WEAR_PENALTY);
    } else if (this.lateralOffset < -halfWidth) {
      this.lateralOffset = -halfWidth;
      this.state.speed *= WALL_SPEED_PENALTY;
      this.state.tyreWear = Math.min(1, this.state.tyreWear + COLLISION_WEAR_PENALTY);
    }

    // --- Tyre wear (identical to original) ---
    const absSteer = Math.abs(steering);
    const wearRate = TYRE_WEAR_RATE[this.state.tyreCompound];
    const surfaceWearMultiplier = surface === 'tarmac' ? 1.0
      : surface === 'kerb' ? 1.5
      : surface === 'grass' ? 2.0
      : 3.0; // gravel

    const speedFactor = Math.min(this.state.speed / MAX_SPEED, 1);
    const wearThisTick = speedFactor > 0.01
      ? wearRate *
        (0.5 * speedFactor + 0.3 * absSteer + 0.2 * throttle) *
        surfaceWearMultiplier *
        dt
      : 0;

    this.state.tyreWear = Math.min(1, this.state.tyreWear + wearThisTick);

    // --- Fuel consumption (identical to original) ---
    if (this.state.fuel > 0) {
      const fuelRate = FUEL_CONSUMPTION[this.state.fuelMode];
      this.state.fuel = Math.max(0, this.state.fuel - fuelRate * dt);
    }

    // --- Sync world position from track-relative coords ---
    const world = this.track.getWorldPosition(
      this.segmentIndex,
      this.segmentProgress,
      this.lateralOffset,
    );

    this.state.x = world.x;
    this.state.y = world.y;
    this.state.angle = world.angle;
    this.state.currentSegmentIndex = this.segmentIndex;
    this.state.steeringAngle = steering;
    this.state.throttle = throttle;
    this.state.brake = brake;
    this.state.drsActive = this.drsActive;
  }

  /** Returns 1.0 for fresh tyres, degrades once wear exceeds compound durability threshold */
  private getTyreCondition(): number {
    const durability = TYRE_DURABILITY[this.state.tyreCompound];
    if (this.state.tyreWear <= durability) {
      return 1.0;
    }
    // Linear falloff from 1.0 at durability threshold to 0.4 at wear=1.0
    const degradeRange = 1 - durability;
    const degradeAmount = (this.state.tyreWear - durability) / degradeRange;
    return 1.0 - 0.6 * degradeAmount;
  }

  getState(): CarState {
    return { ...this.state };
  }

  /** Sync external state changes (lap counting, sector times) back into physics */
  syncState(partial: Partial<CarState>): void {
    Object.assign(this.state, partial);
  }

  /** Stop the car (used during pit stops, retirement, etc.) */
  stop(): void {
    this.state.speed = 0;
  }

  applyCollisionDamage(): void {
    if (this.state.retired) return;
    this.state.tyreWear = Math.min(1, this.state.tyreWear + COLLISION_WEAR_PENALTY);
  }

  pitStop(newCompound: TyreCompound, fuelAmount: number): void {
    this.state.tyreCompound = newCompound;
    this.state.tyreWear = 0;
    this.state.fuel = Math.max(0, Math.min(1, fuelAmount));
    this.state.pitStops += 1;
    this.drsActive = false;
  }

  setDRS(active: boolean): void {
    this.drsActive = active;
    this.state.drsActive = active;
  }

  retire(reason: string): void {
    this.state.retired = true;
    this.state.retiredReason = reason;
    this.state.speed = 0;
  }
}

export default CarPhysics;
