// Claude Racing — Driver v1 (Simple track follower)
// This code runs as a function body with (telemetry, strategy) params

var speed = telemetry.speed;
var heading = telemetry.heading;
var segIdx = telemetry.trackSegmentIndex;
var trackLen = telemetry.trackLength;

// Simple proportional steering toward next segment
// Use track edges to stay centered
var leftDist = telemetry.trackEdges.left;
var rightDist = telemetry.trackEdges.right;
var steerCorrection = (rightDist - leftDist) * 0.05;
var steering = Math.max(-1, Math.min(1, steerCorrection));

// Speed control
var throttle = 0.8;
var brake = 0;

// Brake if turning hard
if (Math.abs(steering) > 0.3) {
  throttle = 0.4;
  if (speed > 150) brake = 0.3;
}

// Use DRS when available and going straight
var drs = telemetry.drsAvailable && Math.abs(steering) < 0.1;

return { steering: steering, throttle: throttle, brake: brake, drs: drs };
