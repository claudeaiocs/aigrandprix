import {
  TrackData,
  TrackPoint,
  TrackSegment,
  SurfaceType,
  SURFACE_GRIP,
} from '../types';

export class Track {
  public data: TrackData;
  public totalLength: number;

  /** Cached distance between consecutive segment centers */
  private segmentLengths: number[];

  constructor(trackData: TrackData) {
    this.data = trackData;
    this.segmentLengths = this.buildSegmentLengths();
    this.totalLength = this.segmentLengths.reduce((sum, l) => sum + l, 0);
  }

  // ------------------------------------------------------------------
  // Segment geometry helpers
  // ------------------------------------------------------------------

  private buildSegmentLengths(): number[] {
    const segs = this.data.segments;
    const lengths: number[] = [];
    for (let i = 0; i < segs.length; i++) {
      const cur = segs[i];
      const next = segs[(i + 1) % segs.length];
      const dx = next.center.x - cur.center.x;
      const dy = next.center.y - cur.center.y;
      lengths.push(Math.sqrt(dx * dx + dy * dy));
    }
    return lengths;
  }

  /**
   * Distance between segment[index] center and segment[index+1] center.
   */
  getSegmentLength(index: number): number {
    const len = this.segmentLengths.length;
    const wrapped = ((index % len) + len) % len;
    return this.segmentLengths[wrapped];
  }

  /**
   * Build the direction (tangent) vector for a given segment index.
   * Points from this segment toward the next.
   */
  segmentDirection(index: number): { dx: number; dy: number } {
    const segs = this.data.segments;
    const len = segs.length;
    const cur = segs[((index % len) + len) % len];
    const next = segs[((index + 1) % len + len) % len];
    const dx = next.center.x - cur.center.x;
    const dy = next.center.y - cur.center.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / mag, dy: dy / mag };
  }

  /**
   * Convert track-relative coordinates to world (x, y, angle).
   *
   * @param segIndex      which segment the car is on
   * @param progress      0-1 fraction through that segment
   * @param lateralOffset pixels from center (positive = left of track direction)
   */
  getWorldPosition(
    segIndex: number,
    progress: number,
    lateralOffset: number,
  ): { x: number; y: number; angle: number } {
    const segs = this.data.segments;
    const len = segs.length;
    const idx = ((segIndex % len) + len) % len;
    const nextIdx = (idx + 1) % len;

    const cur = segs[idx];
    const next = segs[nextIdx];

    // Interpolate position along segment centerline
    const cx = cur.center.x + (next.center.x - cur.center.x) * progress;
    const cy = cur.center.y + (next.center.y - cur.center.y) * progress;

    // Direction and normal
    const dx = next.center.x - cur.center.x;
    const dy = next.center.y - cur.center.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);

    // Normal pointing "left" of the track direction
    const normX = -dy / mag;
    const normY = dx / mag;

    return {
      x: cx + normX * lateralOffset,
      y: cy + normY * lateralOffset,
      angle,
    };
  }

  /**
   * Get the half-width of the track at a given segment, interpolated with
   * progress toward the next segment.
   */
  getHalfWidth(segIndex: number, progress: number): number {
    const segs = this.data.segments;
    const len = segs.length;
    const idx = ((segIndex % len) + len) % len;
    const nextIdx = (idx + 1) % len;
    return segs[idx].width / 2 + (segs[nextIdx].width / 2 - segs[idx].width / 2) * progress;
  }

  // ------------------------------------------------------------------
  // Existing public API (preserved)
  // ------------------------------------------------------------------

  /**
   * Get the segment at a given index (wraps around).
   */
  getSegmentAt(index: number): TrackSegment {
    const len = this.data.segments.length;
    const wrapped = ((index % len) + len) % len;
    return this.data.segments[wrapped];
  }

  /**
   * Get the surface type at a given (x, y) position.
   * Finds the nearest segment, then checks how far the point is from
   * the track center relative to the segment width.
   */
  getSurfaceAt(point: TrackPoint): SurfaceType {
    const segIdx = this.getNearestSegmentIndex(point.x, point.y);
    const seg = this.data.segments[segIdx];

    const dx = point.x - seg.center.x;
    const dy = point.y - seg.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const halfWidth = seg.width / 2;

    if (dist <= halfWidth * 0.85) {
      return seg.surface;
    } else if (dist <= halfWidth) {
      return 'kerb';
    } else if (dist <= halfWidth * 1.3) {
      return 'grass';
    } else {
      return 'gravel';
    }
  }

  /**
   * Check whether a segment index falls within any DRS zone.
   */
  isInDRSZone(segmentIndex: number): boolean {
    const len = this.data.segments.length;
    const idx = ((segmentIndex % len) + len) % len;
    return this.data.drsZones.some((zone) => {
      if (zone.startIndex <= zone.endIndex) {
        return idx >= zone.startIndex && idx <= zone.endIndex;
      }
      // Zone wraps around the lap boundary
      return idx >= zone.startIndex || idx <= zone.endIndex;
    });
  }

  /**
   * Check whether a segment index falls within the pit lane region.
   */
  isInPitLane(segmentIndex: number): boolean {
    const len = this.data.segments.length;
    const idx = ((segmentIndex % len) + len) % len;
    const pit = this.data.pitLane;
    if (pit.entry <= pit.exit) {
      return idx >= pit.entry && idx <= pit.exit;
    }
    // Pit lane wraps around
    return idx >= pit.entry || idx <= pit.exit;
  }

  /**
   * Get the distance from a point to the left and right track edges
   * at a given segment.
   */
  getTrackEdges(
    segmentIndex: number,
    x: number,
    y: number
  ): { left: number; right: number } {
    const seg = this.getSegmentAt(segmentIndex);
    const dir = this.segmentDirection(segmentIndex);
    // Normal pointing left (from the perspective of the track direction)
    const normX = -dir.dy;
    const normY = dir.dx;

    // Project the offset from the segment center onto the normal
    const dx = x - seg.center.x;
    const dy = y - seg.center.y;
    const lateral = dx * normX + dy * normY;

    const halfWidth = seg.width / 2;

    return {
      left: halfWidth - lateral,
      right: halfWidth + lateral,
    };
  }

  /**
   * Find the index of the nearest segment to the given (x, y) position.
   * Uses a simple linear scan (fast enough for ~80 segments).
   */
  getNearestSegmentIndex(x: number, y: number): number {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < this.data.segments.length; i++) {
      const seg = this.data.segments[i];
      const dx = x - seg.center.x;
      const dy = y - seg.center.y;
      const dist = dx * dx + dy * dy; // skip sqrt for comparison
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx;
  }
}
