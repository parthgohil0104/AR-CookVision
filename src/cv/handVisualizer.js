/**
 * HandVisualizer — 2D Canvas Overlay Visualizer for AR-CookVision
 *
 * Renders real-time hand skeleton, joint points, and tracking metrics.
 * Designed with a high-contrast cyber-mint & neon-cyan theme that is
 * visually distinct from the flame-orange AR 3D guidance layer.
 */

import { FINGERTIPS, HAND_CONNECTIONS, HAND_LANDMARKS } from './cvTypes.js'

export class HandVisualizer {
  /**
   * @param {HTMLCanvasElement} [canvas]
   */
  constructor(canvas = null) {
    this.canvas = canvas
    this.ctx = canvas ? canvas.getContext('2d') : null
    this.isEnabled = true
  }

  /**
   * Attaches or updates the target canvas element.
   *
   * @param {HTMLCanvasElement|null} canvas
   */
  setCanvas(canvas) {
    this.canvas = canvas
    this.ctx = canvas ? canvas.getContext('2d') : null
  }

  /**
   * Clears the entire canvas.
   */
  clear() {
    if (!this.ctx || !this.canvas) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * Resizes canvas to match parent viewport or video aspect.
   *
   * @param {number} width - CSS width
   * @param {number} height - CSS height
   * @param {number} [dpr=1] - Device pixel ratio
   */
  resize(width, height, dpr = window.devicePixelRatio || 1) {
    if (!this.canvas) return
    const actualWidth = Math.floor(width * dpr)
    const actualHeight = Math.floor(height * dpr)

    if (this.canvas.width !== actualWidth || this.canvas.height !== actualHeight) {
      this.canvas.width = actualWidth
      this.canvas.height = actualHeight
    }
  }

  /**
   * Renders the normalized hand result onto the canvas.
   *
   * @param {import('./resultNormalizer').CVHandResult} cvResult
   * @param {Object} [options={}]
   * @param {boolean} [options.showSkeleton=true]
   * @param {boolean} [options.showJoints=true]
   * @param {boolean} [options.showFingertips=true]
   */
  render(cvResult, options = {}) {
    if (!this.isEnabled || !this.ctx || !this.canvas) return

    const {
      showSkeleton = true,
      showJoints = true,
      showFingertips = true,
    } = options

    const ctx = this.ctx
    const width = this.canvas.width
    const height = this.canvas.height

    // 1. Clear frame
    ctx.clearRect(0, 0, width, height)

    if (!cvResult || !cvResult.detected || !Array.isArray(cvResult.landmarks)) {
      return
    }

    // 2. Render each detected hand
    cvResult.landmarks.forEach((hand, handIndex) => {
      if (!Array.isArray(hand) || hand.length === 0) return

      // Pre-scale coordinates to canvas pixels
      const points = hand.map((pt) => ({
        x: pt.x * width,
        y: pt.y * height,
        z: pt.z,
      }))

      // A. Draw skeletal connection lines
      if (showSkeleton) {
        ctx.save()
        ctx.lineWidth = Math.max(3, Math.floor(width * 0.006))
        ctx.strokeStyle = 'rgba(0, 245, 160, 0.85)' // Neon cyber-mint
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.shadowColor = '#00f5a0'
        ctx.shadowBlur = 8

        for (const conn of HAND_CONNECTIONS) {
          const p1 = points[conn.start]
          const p2 = points[conn.end]
          if (p1 && p2) {
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      // B. Draw intermediate joint dots
      if (showJoints) {
        ctx.save()
        const jointRadius = Math.max(4, Math.floor(width * 0.007))

        points.forEach((p, idx) => {
          // Fingertips and wrist are handled specially
          if (FINGERTIPS.includes(idx) || idx === HAND_LANDMARKS.WRIST) return

          ctx.beginPath()
          ctx.arc(p.x, p.y, jointRadius, 0, Math.PI * 2)
          ctx.fillStyle = '#06b6d4' // Cyan joint core
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
        })
        ctx.restore()
      }

      // C. Draw fingertips with glowing accent circles
      if (showFingertips) {
        ctx.save()
        const tipRadius = Math.max(6, Math.floor(width * 0.011))

        FINGERTIPS.forEach((tipIndex) => {
          const tip = points[tipIndex]
          if (!tip) return

          ctx.beginPath()
          ctx.arc(tip.x, tip.y, tipRadius, 0, Math.PI * 2)
          ctx.fillStyle = '#fbbf24' // Amber/gold fingertip accent
          ctx.shadowColor = '#fbbf24'
          ctx.shadowBlur = 12
          ctx.fill()

          ctx.lineWidth = 2
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
        })
        ctx.restore()
      }

      // D. Draw wrist anchor node
      const wrist = points[HAND_LANDMARKS.WRIST]
      if (wrist) {
        ctx.save()
        const wristRadius = Math.max(7, Math.floor(width * 0.013))
        ctx.beginPath()
        ctx.arc(wrist.x, wrist.y, wristRadius, 0, Math.PI * 2)
        ctx.fillStyle = '#ec4899' // Pink/magenta wrist base
        ctx.shadowColor = '#ec4899'
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
        ctx.restore()
      }

      // E. Render subtle hand index / handedness pill above wrist if space permits
      const handedness = cvResult.handedness[handIndex]
      if (handedness && wrist) {
        ctx.save()
        ctx.font = 'bold 12px Inter, sans-serif'
        const label = `${handedness.label} (${Math.round(handedness.score * 100)}%)`
        const textWidth = ctx.measureText(label).width
        const badgeX = Math.max(10, Math.min(width - textWidth - 20, wrist.x - textWidth / 2))
        const badgeY = Math.max(24, wrist.y + 24)

        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
        ctx.beginPath()
        ctx.roundRect(badgeX - 6, badgeY - 14, textWidth + 12, 20, 6)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0, 245, 160, 0.5)'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = '#00f5a0'
        ctx.fillText(label, badgeX, badgeY)
        ctx.restore()
      }
    })
  }
}
