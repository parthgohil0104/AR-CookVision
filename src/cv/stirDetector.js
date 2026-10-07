/**
 * Stir Motion Detector — AR-CookVision Phase 5
 *
 * Dedicated computer vision motion detector that analyzes hand movement
 * trajectories over time to recognize circular stirring motions.
 *
 * Consumes normalized CVHandResult objects produced by Phase 4 MediaPipe HandLandmarker.
 * Completely decoupled from React and camera hardware.
 */

export const MOTION_TYPES = Object.freeze({
  NONE: 'NONE',
  STATIONARY: 'STATIONARY',
  LINEAR: 'LINEAR',
  RANDOM: 'RANDOM',
  STIR: 'STIR',
})

export const DEFAULT_STIR_CONFIG = Object.freeze({
  windowDurationMs: 2800, // History window length in ms
  maxSamples: 60, // Maximum trajectory samples to buffer
  minSamples: 8, // Minimum samples required to classify motion
  stationaryThreshold: 0.045, // Normalized path length below which motion is STATIONARY
  minSpan: 0.03, // Minimum span (max(w, h)) in normalized screen coords
  minCircularity: 0.22, // Minimum circularity (sqrt(lambda2/lambda1)) for STIR
  minDirectionalConsistency: 0.65, // % of angular changes in dominant direction
  minRadius: 0.02, // Minimum average radius in normalized coords
  maxRadius: 0.48, // Maximum average radius in normalized coords
  targetStirAngle: Math.PI * 3.5, // Total radians to complete stirring (~1.75 full loops)
  trackingLossResetMs: 1200, // Time without hand before resetting accumulated progress
  decayRatePerSec: 0.25, // Progress decay rate per second when motion pauses
})

/**
 * Normalizes an angular delta into the [-PI, PI] range.
 *
 * @param {number} delta
 * @returns {number}
 */
export function normalizeAngleDelta(delta) {
  let d = delta
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Extracts a stable 2D reference point from normalized hand landmarks.
 * Computes palm centroid using wrist (0), index MCP (5), middle MCP (9), and pinky MCP (17).
 * Falls back to wrist if only partial landmarks are available.
 *
 * @param {Array<Array<{x: number, y: number, z?: number}>>} landmarks
 * @returns {{x: number, y: number, z: number}|null}
 */
export function extractHandCenter(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return null
  const hand = landmarks[0]
  if (!Array.isArray(hand) || hand.length === 0) return null

  // If full hand landmarks available, compute centroid of 4 palm anchors
  if (hand.length >= 18 && hand[0] && hand[5] && hand[9] && hand[17]) {
    return {
      x: (Number(hand[0].x) + Number(hand[5].x) + Number(hand[9].x) + Number(hand[17].x)) / 4,
      y: (Number(hand[0].y) + Number(hand[5].y) + Number(hand[9].y) + Number(hand[17].y)) / 4,
      z: (Number(hand[0].z || 0) + Number(hand[5].z || 0) + Number(hand[9].z || 0) + Number(hand[17].z || 0)) / 4,
    }
  }

  // Fallback to wrist
  if (hand[0] && typeof hand[0].x === 'number' && typeof hand[0].y === 'number') {
    return {
      x: Number(hand[0].x),
      y: Number(hand[0].y),
      z: Number(hand[0].z || 0),
    }
  }

  return null
}

/**
 * Analyzes a trajectory of 2D points to compute geometric and angular metrics.
 *
 * @param {Array<{x: number, y: number, timestamp: number}>} samples
 * @returns {Object} Motion metrics
 */
export function calculateMotionMetrics(samples) {
  const n = samples.length
  if (n < 2) {
    return {
      sampleCount: n,
      pathLength: 0,
      netDisplacement: 0,
      centroid: { x: 0, y: 0 },
      width: 0,
      height: 0,
      span: 0,
      minSpan: 0,
      circularity: 0,
      meanRadius: 0,
      radiusCV: 0,
      signedAngle: 0,
      absAngle: 0,
      directionalConsistency: 0,
      dominantDirection: 0,
      angleDeltas: [],
    }
  }

  let pathLength = 0
  let sumX = 0
  let sumY = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (let i = 0; i < n; i++) {
    const pt = samples[i]
    sumX += pt.x
    sumY += pt.y
    if (pt.x < minX) minX = pt.x
    if (pt.x > maxX) maxX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.y > maxY) maxY = pt.y

    if (i > 0) {
      const prev = samples[i - 1]
      const dx = pt.x - prev.x
      const dy = pt.y - prev.y
      pathLength += Math.hypot(dx, dy)
    }
  }

  const first = samples[0]
  const last = samples[n - 1]
  const netDisplacement = Math.hypot(last.x - first.x, last.y - first.y)

  const cx = sumX / n
  const cy = sumY / n
  const width = Math.max(0, maxX - minX)
  const height = Math.max(0, maxY - minY)
  const span = Math.max(width, height)
  const minSpan = Math.min(width, height)

  // Covariance matrix for PCA & Circularity
  let varX = 0
  let varY = 0
  let covXY = 0
  let sumRadius = 0
  const radii = []

  for (let i = 0; i < n; i++) {
    const dx = samples[i].x - cx
    const dy = samples[i].y - cy
    varX += dx * dx
    varY += dy * dy
    covXY += dx * dy

    const r = Math.hypot(dx, dy)
    radii.push(r)
    sumRadius += r
  }

  varX /= n
  varY /= n
  covXY /= n
  const meanRadius = sumRadius / n

  // Radius coefficient of variation
  let varRadius = 0
  for (let i = 0; i < n; i++) {
    const diff = radii[i] - meanRadius
    varRadius += diff * diff
  }
  varRadius /= n
  const radiusStdDev = Math.sqrt(varRadius)
  const radiusCV = meanRadius > 1e-6 ? radiusStdDev / meanRadius : 0

  // Eigenvalues of 2x2 covariance matrix
  const trace = varX + varY
  const discriminant = Math.sqrt(Math.max(0, (varX - varY) * (varX - varY) + 4 * covXY * covXY))
  const lambda1 = (trace + discriminant) / 2 // variance along principal axis
  const lambda2 = Math.max(0, (trace - discriminant) / 2) // variance along secondary axis

  // Circularity ratio: 0 for straight line, ~1 for perfect circle/ellipse
  const circularity = lambda1 > 1e-8 ? Math.sqrt(lambda2 / lambda1) : 0

  // Angular progression relative to centroid
  let signedAngle = 0
  let absAngle = 0
  let posSteps = 0
  let negSteps = 0
  const angleDeltas = []
  const EPSILON_ANGLE = 0.035 // ~2 degrees noise deadzone

  let prevAngle = Math.atan2(samples[0].y - cy, samples[0].x - cx)

  for (let i = 1; i < n; i++) {
    const angle = Math.atan2(samples[i].y - cy, samples[i].x - cx)
    const delta = normalizeAngleDelta(angle - prevAngle)
    angleDeltas.push(delta)
    signedAngle += delta
    absAngle += Math.abs(delta)

    if (delta > EPSILON_ANGLE) {
      posSteps++
    } else if (delta < -EPSILON_ANGLE) {
      negSteps++
    }

    prevAngle = angle
  }

  const activeSteps = posSteps + negSteps
  const dominantSteps = Math.max(posSteps, negSteps)
  const directionalConsistency = activeSteps > 0 ? dominantSteps / activeSteps : 0
  const dominantDirection = posSteps >= negSteps ? 1 : -1

  return {
    sampleCount: n,
    pathLength,
    netDisplacement,
    centroid: { x: cx, y: cy },
    width,
    height,
    span,
    minSpan,
    circularity,
    meanRadius,
    radiusCV,
    signedAngle,
    absAngle,
    directionalConsistency,
    dominantDirection,
    angleDeltas,
  }
}

/**
 * StirDetector Class
 *
 * Tracks sliding window of hand positions and evaluates motion classification
 * (NONE, STATIONARY, LINEAR, RANDOM, STIR) along with progressive completion.
 */
export class StirDetector {
  /**
   * @param {Object} [options={}]
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_STIR_CONFIG, ...options }

    // Trajectory history buffer: [{ x, y, timestamp }]
    this.history = []

    // State tracking
    this.lastProcessedTimestamp = 0
    this.lastHandSeenTimestamp = 0
    this.accumulatedStirAngle = 0
    this.isCompleted = false
    this.currentMotion = MOTION_TYPES.NONE
    this.confidence = 0
    this.progress = 0

    // Cached last result contract
    this.lastResult = this.createResult({
      detected: false,
      confidence: 0,
      motion: MOTION_TYPES.NONE,
      progress: 0,
      sampleCount: 0,
      timestamp: 0,
    })
  }

  /**
   * Resets all history, progress, and completed state.
   */
  reset() {
    this.history = []
    this.lastProcessedTimestamp = 0
    this.lastHandSeenTimestamp = 0
    this.accumulatedStirAngle = 0
    this.isCompleted = false
    this.currentMotion = MOTION_TYPES.NONE
    this.confidence = 0
    this.progress = 0

    this.lastResult = this.createResult({
      detected: false,
      confidence: 0,
      motion: MOTION_TYPES.NONE,
      progress: 0,
      sampleCount: 0,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    })

    return this.lastResult
  }

  /**
   * Constructs the standard result contract.
   *
   * @private
   */
  createResult({
    detected = false,
    confidence = 0,
    motion = MOTION_TYPES.NONE,
    progress = 0,
    sampleCount = 0,
    timestamp = 0,
    metrics = null,
  }) {
    return {
      detected,
      confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100,
      motion,
      progress: Math.round(Math.max(0, Math.min(1, progress)) * 100) / 100,
      sampleCount,
      timestamp,
      isComplete: this.isCompleted,
      metrics: metrics || {
        pathLength: 0,
        netDisplacement: 0,
        circularity: 0,
        directionalConsistency: 0,
        accumulatedAngle: this.accumulatedStirAngle,
        targetAngle: this.config.targetStirAngle,
        dominantDirection: 0,
        radius: 0,
      },
    }
  }

  /**
   * Ingests a normalized CVHandResult frame from MediaPipe and updates detector state.
   *
   * @param {Object} cvHandResult - Normalized CVHandResult
   * @returns {Object} Stir detection result
   */
  processFrame(cvHandResult) {
    const now =
      cvHandResult?.timestamp && typeof cvHandResult.timestamp === 'number'
        ? cvHandResult.timestamp
        : typeof performance !== 'undefined'
        ? performance.now()
        : Date.now()

    const dt = this.lastProcessedTimestamp > 0 ? Math.max(0, (now - this.lastProcessedTimestamp) / 1000) : 0
    this.lastProcessedTimestamp = now

    // 1. Check if hand is detected
    const isHandPresent =
      Boolean(cvHandResult?.detected) &&
      Array.isArray(cvHandResult?.landmarks) &&
      cvHandResult.landmarks.length > 0

    if (!isHandPresent) {
      // Hand not detected in this frame
      const timeSinceHandSeen = now - this.lastHandSeenTimestamp
      if (this.lastHandSeenTimestamp > 0 && timeSinceHandSeen > this.config.trackingLossResetMs) {
        // Prolonged tracking loss: clear history and reset progress (if not already completed)
        this.history = []
        if (!this.isCompleted) {
          this.accumulatedStirAngle = 0
          this.progress = 0
        }
      }

      this.currentMotion = MOTION_TYPES.NONE
      this.confidence = 0

      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: 0,
        motion: MOTION_TYPES.NONE,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
      })

      return this.lastResult
    }

    // 2. Hand is present — extract stable palm/wrist coordinate
    const handCenter = extractHandCenter(cvHandResult.landmarks)
    if (!handCenter) {
      this.currentMotion = MOTION_TYPES.NONE
      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: 0,
        motion: MOTION_TYPES.NONE,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
      })
      return this.lastResult
    }

    this.lastHandSeenTimestamp = now

    // 3. Add point to sliding history window
    this.history.push({
      x: handCenter.x,
      y: handCenter.y,
      timestamp: now,
    })

    // Prune stale samples outside time window
    const windowCutoff = now - this.config.windowDurationMs
    while (this.history.length > 0 && this.history[0].timestamp < windowCutoff) {
      this.history.shift()
    }

    // Cap maximum samples
    if (this.history.length > this.config.maxSamples) {
      this.history.splice(0, this.history.length - this.config.maxSamples)
    }

    // 4. Insufficient samples for curvature analysis
    if (this.history.length < this.config.minSamples) {
      // Evaluate if initial stationary
      const initialMetrics = calculateMotionMetrics(this.history)
      const isStillStationary = initialMetrics.pathLength < this.config.stationaryThreshold

      this.currentMotion = isStillStationary ? MOTION_TYPES.STATIONARY : MOTION_TYPES.STATIONARY
      this.confidence = 0.1

      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: this.confidence,
        motion: this.currentMotion,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
        metrics: {
          pathLength: initialMetrics.pathLength,
          netDisplacement: initialMetrics.netDisplacement,
          circularity: initialMetrics.circularity,
          directionalConsistency: initialMetrics.directionalConsistency,
          accumulatedAngle: this.accumulatedStirAngle,
          targetAngle: this.config.targetStirAngle,
          dominantDirection: initialMetrics.dominantDirection,
          radius: initialMetrics.meanRadius,
        },
      })

      return this.lastResult
    }

    // 5. Compute full motion metrics across current history window
    const metrics = calculateMotionMetrics(this.history)

    // 6. Classification Logic
    // A. Check for STATIONARY: minimal movement
    const isStationary =
      metrics.pathLength < this.config.stationaryThreshold ||
      metrics.span < this.config.minSpan

    if (isStationary) {
      this.currentMotion = MOTION_TYPES.STATIONARY
      this.confidence = Math.min(1, Math.max(0, 1 - metrics.pathLength / this.config.stationaryThreshold))

      // Gradually decay accumulated stir progress if motion has stopped
      if (!this.isCompleted && this.accumulatedStirAngle > 0 && dt > 0) {
        this.accumulatedStirAngle = Math.max(
          0,
          this.accumulatedStirAngle - this.config.targetStirAngle * this.config.decayRatePerSec * dt
        )
        this.progress = Math.min(1, this.accumulatedStirAngle / this.config.targetStirAngle)
      }

      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: this.confidence,
        motion: MOTION_TYPES.STATIONARY,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
        metrics: {
          pathLength: metrics.pathLength,
          netDisplacement: metrics.netDisplacement,
          circularity: metrics.circularity,
          directionalConsistency: metrics.directionalConsistency,
          accumulatedAngle: this.accumulatedStirAngle,
          targetAngle: this.config.targetStirAngle,
          dominantDirection: metrics.dominantDirection,
          radius: metrics.meanRadius,
        },
      })

      return this.lastResult
    }

    // B. Check for LINEAR movement: straight line, swipe, or back-and-forth along single axis
    const linearityRatio = metrics.pathLength > 0 ? metrics.netDisplacement / metrics.pathLength : 0
    const isThinAspect = metrics.span > 0 && metrics.minSpan / metrics.span < 0.20
    const hasSmallAngleTraversal = Math.abs(metrics.signedAngle) < 1.85

    const isLinear =
      metrics.circularity < this.config.minCircularity ||
      (linearityRatio > 0.70 && hasSmallAngleTraversal) ||
      (isThinAspect && hasSmallAngleTraversal)

    if (isLinear) {
      this.currentMotion = MOTION_TYPES.LINEAR
      this.confidence = Math.min(1, Math.max(0.3, 1 - metrics.circularity))

      // Decay stir progress during linear motion
      if (!this.isCompleted && this.accumulatedStirAngle > 0 && dt > 0) {
        this.accumulatedStirAngle = Math.max(
          0,
          this.accumulatedStirAngle - this.config.targetStirAngle * this.config.decayRatePerSec * dt
        )
        this.progress = Math.min(1, this.accumulatedStirAngle / this.config.targetStirAngle)
      }

      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: this.confidence,
        motion: MOTION_TYPES.LINEAR,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
        metrics: {
          pathLength: metrics.pathLength,
          netDisplacement: metrics.netDisplacement,
          circularity: metrics.circularity,
          directionalConsistency: metrics.directionalConsistency,
          accumulatedAngle: this.accumulatedStirAngle,
          targetAngle: this.config.targetStirAngle,
          dominantDirection: metrics.dominantDirection,
          radius: metrics.meanRadius,
        },
      })

      return this.lastResult
    }

    // C. Check for STIR (circular stirring pattern)
    // Criteria:
    // 1. Reasonable circularity (2D loop, not a flat line)
    // 2. Minimum span and radius within human cooking range
    // 3. Directional consistency (majority of angular steps in one direction)
    // 4. Significant angular traversal in the window
    // 5. Reasonable radius consistency (not wild zig-zags)
    const hasAdequateRadius =
      metrics.meanRadius >= this.config.minRadius &&
      metrics.meanRadius <= this.config.maxRadius &&
      metrics.minSpan >= this.config.minSpan

    const hasConsistentDirection =
      metrics.directionalConsistency >= this.config.minDirectionalConsistency

    const hasRotationalTraversal = Math.abs(metrics.signedAngle) >= 1.6 // at least ~90-100 deg continuous loop in window

    const hasReasonableRadiusCV = metrics.radiusCV < 0.65

    const isStir =
      metrics.circularity >= this.config.minCircularity &&
      hasAdequateRadius &&
      hasConsistentDirection &&
      hasRotationalTraversal &&
      hasReasonableRadiusCV

    if (isStir) {
      this.currentMotion = MOTION_TYPES.STIR

      // Calculate confidence based on rotational consistency and circularity
      this.confidence = Math.min(
        1,
        Math.max(
          0.5,
          metrics.directionalConsistency * 0.55 +
            Math.min(1, metrics.circularity) * 0.35 +
            (1 - Math.min(1, metrics.radiusCV)) * 0.1
        )
      )

      // Accumulate latest angular rotation toward stir completion
      if (!this.isCompleted) {
        // Extract latest angular increment
        const lastDelta =
          metrics.angleDeltas.length > 0 ? metrics.angleDeltas[metrics.angleDeltas.length - 1] : 0

        // If latest step matches dominant direction, accumulate it
        if (
          (metrics.dominantDirection > 0 && lastDelta > 0) ||
          (metrics.dominantDirection < 0 && lastDelta < 0)
        ) {
          this.accumulatedStirAngle += Math.abs(lastDelta)
        } else {
          // Fallback: accumulate window delta proportionally
          this.accumulatedStirAngle += Math.abs(metrics.signedAngle) * 0.08
        }

        // Clamp & update progress
        this.progress = Math.min(1, this.accumulatedStirAngle / this.config.targetStirAngle)

        if (this.progress >= 1.0) {
          this.isCompleted = true
          this.progress = 1.0
        }
      }

      this.lastResult = this.createResult({
        detected: this.isCompleted,
        confidence: this.confidence,
        motion: MOTION_TYPES.STIR,
        progress: this.progress,
        sampleCount: this.history.length,
        timestamp: now,
        metrics: {
          pathLength: metrics.pathLength,
          netDisplacement: metrics.netDisplacement,
          circularity: metrics.circularity,
          directionalConsistency: metrics.directionalConsistency,
          accumulatedAngle: this.accumulatedStirAngle,
          targetAngle: this.config.targetStirAngle,
          dominantDirection: metrics.dominantDirection,
          radius: metrics.meanRadius,
        },
      })

      return this.lastResult
    }

    // D. Fallback: RANDOM movement (erratic, zig-zag, twitching, changing direction)
    this.currentMotion = MOTION_TYPES.RANDOM
    this.confidence = Math.min(1, Math.max(0.3, 1 - metrics.directionalConsistency))

    // Decay stir progress during random motion
    if (!this.isCompleted && this.accumulatedStirAngle > 0 && dt > 0) {
      this.accumulatedStirAngle = Math.max(
        0,
        this.accumulatedStirAngle - this.config.targetStirAngle * this.config.decayRatePerSec * dt
      )
      this.progress = Math.min(1, this.accumulatedStirAngle / this.config.targetStirAngle)
    }

    this.lastResult = this.createResult({
      detected: this.isCompleted,
      confidence: this.confidence,
      motion: MOTION_TYPES.RANDOM,
      progress: this.progress,
      sampleCount: this.history.length,
      timestamp: now,
      metrics: {
        pathLength: metrics.pathLength,
        netDisplacement: metrics.netDisplacement,
        circularity: metrics.circularity,
        directionalConsistency: metrics.directionalConsistency,
        accumulatedAngle: this.accumulatedStirAngle,
        targetAngle: this.config.targetStirAngle,
        dominantDirection: metrics.dominantDirection,
        radius: metrics.meanRadius,
      },
    })

    return this.lastResult
  }

  /**
   * Returns current status snapshot without processing a new frame.
   *
   * @returns {Object}
   */
  getStatus() {
    return this.lastResult
  }
}
