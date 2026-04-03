import { TrackData, TrackSegment, SurfaceType } from '../types';

/**
 * Silverstone Circuit - a proper loop with straights, hairpins, chicanes,
 * and sweeping curves.  ~70 segments, roughly 800x600 scale.
 *
 * Layout (approximate shape, clockwise):
 *   Start/finish straight along the bottom, then a sweeping right into
 *   Maggots-Becketts esses, a long back straight (DRS zone 1), a hairpin
 *   at the top-left, a run down the left side through Stowe, another
 *   DRS zone on the Wellington straight, a chicane (Club), and back to
 *   the start/finish line.
 */

function seg(
  x: number,
  y: number,
  width: number,
  surface: SurfaceType = 'tarmac'
): TrackSegment {
  return { center: { x, y }, width, surface };
}

/**
 * Helper: generate an arc of segments.
 * @param cx       arc center x
 * @param cy       arc center y
 * @param radius   arc radius
 * @param startAng start angle in radians
 * @param endAng   end angle in radians
 * @param steps    number of segments in the arc
 * @param width    track width
 * @param surface  surface type
 */
function arc(
  cx: number,
  cy: number,
  radius: number,
  startAng: number,
  endAng: number,
  steps: number,
  width: number,
  surface: SurfaceType = 'tarmac'
): TrackSegment[] {
  const segs: TrackSegment[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAng + (endAng - startAng) * t;
    segs.push(
      seg(
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
        width,
        surface
      )
    );
  }
  return segs;
}

/**
 * Helper: generate a straight line of segments.
 */
function straight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps: number,
  width: number,
  surface: SurfaceType = 'tarmac'
): TrackSegment[] {
  const segs: TrackSegment[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    segs.push(
      seg(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width, surface)
    );
  }
  return segs;
}

function buildSegments(): TrackSegment[] {
  const segments: TrackSegment[] = [];

  const push = (segs: TrackSegment[], skipFirst = true) => {
    const start = skipFirst && segments.length > 0 ? 1 : 0;
    for (let i = start; i < segs.length; i++) {
      segments.push(segs[i]);
    }
  };

  // ===== Section 1: Start/finish straight (bottom, left-to-right) =====
  // Indices ~0-5
  push(straight(200, 520, 550, 520, 5, 40), false);

  // ===== Section 2: Copse - sweeping right curve (bottom-right) =====
  // Indices ~6-11
  push(arc(550, 450, 70, Math.PI / 2, 0, 5, 38));

  // ===== Section 3: Short straight up-right =====
  // Indices ~12-14
  push(straight(620, 450, 660, 370, 2, 36));

  // ===== Section 4: Maggots-Becketts esses (right side) =====
  // A fast left-right-left chicane complex
  // Indices ~15-19 : left kink
  push(arc(610, 340, 50, 0, -Math.PI / 3, 4, 34, 'tarmac'));
  // Indices ~20-24 : right kink
  push(arc(640, 270, 50, Math.PI + Math.PI / 3, Math.PI + Math.PI / 1.5, 3, 34, 'kerb'));
  // Indices ~25-27 : another left kink
  push(arc(590, 220, 40, -Math.PI / 6, -Math.PI / 2.5, 2, 34));

  // ===== Section 5: Hangar straight (long back straight - DRS Zone 1) =====
  // Indices ~28-36
  push(straight(575, 195, 350, 120, 8, 42));

  // ===== Section 6: Stowe hairpin (top-left) =====
  // Indices ~37-44
  push(
    arc(310, 120, 40, 0, -Math.PI, 7, 30, 'kerb')
  );

  // ===== Section 7: Down the left side - Vale straight =====
  // Indices ~45-50
  push(straight(270, 120, 170, 220, 5, 38));

  // ===== Section 8: Club chicane (left side, mid-height) =====
  // Indices ~51-54 : sharp right
  push(arc(170, 260, 40, -Math.PI / 2, 0, 3, 32, 'kerb'));
  // Indices ~55-58 : sharp left back
  push(arc(170, 320, 40, 0, Math.PI / 2, 3, 32, 'kerb'));

  // ===== Section 9: Wellington straight (DRS Zone 2) =====
  // Indices ~59-65
  push(straight(170, 360, 140, 480, 6, 40));

  // ===== Section 10: Brooklands sweeping left (bottom-left) =====
  // Indices ~66-71
  push(arc(180, 510, 40, Math.PI, Math.PI / 2, 5, 36));

  // ===== Section 11: Short link back to start/finish =====
  // Close the loop back to segment 0 (200, 520)
  const lastSeg = segments[segments.length - 1];
  push(
    straight(
      lastSeg.center.x,
      lastSeg.center.y,
      200,
      520,
      2,
      38
    )
  );

  return segments;
}

const segments = buildSegments();

export const silverstoneTrack: TrackData = {
  name: 'Silverstone Grand Prix Circuit',
  segments,
  pitLane: {
    entry: 62,   // entering during Wellington straight
    exit: 3,     // rejoin on start/finish straight
    path: [
      // Pit lane runs parallel to the bottom, slightly inward (higher y)
      { x: 150, y: 550 },
      { x: 200, y: 560 },
      { x: 280, y: 560 },
      { x: 360, y: 560 },
      { x: 440, y: 560 },
      { x: 500, y: 555 },
      { x: 340, y: 530 },
    ],
  },
  drsZones: [
    // DRS Zone 1: Hangar straight (segments ~28-36)
    { startIndex: 28, endIndex: 36 },
    // DRS Zone 2: Wellington straight (segments ~59-65)
    { startIndex: 59, endIndex: 65 },
  ],
  startFinishIndex: 0,
  sectorIndices: [24, 50], // Sector 1 ends after Becketts, Sector 2 ends after Vale
};
