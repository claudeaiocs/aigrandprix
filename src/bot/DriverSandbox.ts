import { DriverInput, Telemetry, Strategy } from '../types';

const SAFE_OUTPUT: DriverInput = { steering: 0, throttle: 0, brake: 0 };

function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function clampDriverInput(raw: any): DriverInput {
  if (!raw || typeof raw !== 'object') return { ...SAFE_OUTPUT };
  return {
    steering: clamp(raw.steering, -1, 1),
    throttle: clamp(raw.throttle, 0, 1),
    brake: clamp(raw.brake, 0, 1),
  };
}

export default class DriverSandbox {
  private driveFn: ((telemetry: Telemetry, strategy: Strategy) => any) | null = null;

  constructor(code: string) {
    try {
      // Wrap user code so it can define a drive() function or just return an object.
      // The code string is treated as a function body that receives (telemetry, strategy)
      // and should return { steering, throttle, brake }.
      //
      // We use the Function constructor as a lightweight sandbox.
      // This is NOT fully secure — it runs in the same V8 context — but it
      // provides isolation from direct variable access and catches crashes.
      this.driveFn = new Function(
        'telemetry',
        'strategy',
        code
      ) as (telemetry: Telemetry, strategy: Strategy) => any;
    } catch (err) {
      // Compilation failed — driveFn stays null, execute() will return safe defaults.
      this.driveFn = null;
    }
  }

  execute(telemetry: Telemetry, strategy: Strategy): DriverInput {
    if (!this.driveFn) {
      return { ...SAFE_OUTPUT };
    }

    try {
      // Pass copies of the inputs so user code cannot mutate originals.
      const telemetryCopy = JSON.parse(JSON.stringify(telemetry));
      const strategyCopy = JSON.parse(JSON.stringify(strategy));

      const result = this.driveFn(telemetryCopy, strategyCopy);
      return clampDriverInput(result);
    } catch (err) {
      return { ...SAFE_OUTPUT };
    }
  }

  dispose(): void {
    this.driveFn = null;
  }
}
