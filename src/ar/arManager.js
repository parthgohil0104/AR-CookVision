import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'

/**
 * ARManager
 *
 * Manages MindAR image tracking, Three.js 3D scene, lighting,
 * and holographic AR anchor visuals (test cube, target rings, axes).
 */
export class ARManager {
  constructor() {
    this.mindarThree = null
    this.anchor = null
    this.container = null
    this.isStarted = false
    this.isCancelled = false
    this.trackingState = 'idle' // 'idle' | 'initializing' | 'searching' | 'tracking' | 'error'
    this.visualMode = 'cube' // 'cube' | 'stove-ring' | 'wireframe'
    this.isRotating = true
    this.colorTheme = 'kitchen-orange'

    // Callbacks
    this.onStateChange = null
    this.onError = null
    this.onFpsUpdate = null

    // 3D Objects
    this.scene = null
    this.camera = null
    this.renderer = null
    this.cubeGroup = null
    this.cubeMesh = null
    this.cubeEdges = null
    this.innerCore = null
    this.groundRing = null
    this.groundTicks = null
    this.axesHelper = null
    this.billboardSprite = null
    this.pointLight = null

    // Performance / stats
    this.frameCount = 0
    this.lastFpsCheck = performance.now()
    this.currentFps = 0
    this.clock = new THREE.Clock()
    this.animationId = null
    this.handleResize = this.onWindowResize.bind(this)
  }

  /**
   * Initializes and starts MindAR & Three.js tracking
   */
  async start({
    container,
    imageTargetSrc = '/targets/targets.mind',
    onStateChange,
    onError,
    onFpsUpdate,
  }) {
    if (this.isStarted) {
      console.warn('[ARManager] Already started')
      return
    }

    this.container = container
    this.onStateChange = onStateChange
    this.onError = onError
    this.onFpsUpdate = onFpsUpdate
    this.isCancelled = false

    this.setState('initializing')

    // 1. Verify camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'Camera API is not supported in this browser. Please use HTTPS in Chrome or Safari.'
      this.handleError(err)
      return
    }

    try {
      // 2. Instantiate MindARThree
      this.mindarThree = new MindARThree({
        container: this.container,
        imageTargetSrc,
        filterMinCF: 0.0005,
        filterBeta: 0.005,
        missTolerance: 5,
        warmupTolerance: 3,
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      })

      const { renderer, scene, camera } = this.mindarThree
      this.renderer = renderer
      this.scene = scene
      this.camera = camera

      // Configure renderer
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

      // 3. Setup Scene Lighting
      this.setupLighting()

      // 4. Setup AR Anchor & 3D Visuals
      this.anchor = this.mindarThree.addAnchor(0)
      this.setupAnchorVisuals(this.anchor.group)

      // 5. Attach Anchor Callbacks
      this.anchor.onTargetFound = () => {
        if (this.isCancelled) return
        this.setState('tracking')
        if (navigator.vibrate) {
          navigator.vibrate([25, 40, 30])
        }
      }

      this.anchor.onTargetLost = () => {
        if (this.isCancelled) return
        this.setState('searching')
      }

      window.addEventListener('resize', this.handleResize)

      // 6. Start MindAR tracking engine
      await this.mindarThree.start()

      if (this.isCancelled) {
        this.stop()
        return
      }

      this.isStarted = true
      this.setState('searching')

      // 7. Start Animation Loop
      this.clock.start()
      this.renderer.setAnimationLoop(() => {
        this.renderFrame()
      })
    } catch (err) {
      if (this.isCancelled) return
      console.error('[ARManager] Start failed:', err)

      let friendlyMsg = 'Failed to start AR camera.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMsg = 'Camera permission was denied. Please allow camera access in your browser settings to use AR tracking.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMsg = 'No camera found on this device.'
      } else if (err.message && err.message.includes('target')) {
        friendlyMsg = 'Could not load AR marker file (targets.mind).'
      }

      this.handleError(friendlyMsg)
      this.stop()
    }
  }

  /**
   * Set up lighting in the Three.js scene
   */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4)
    this.scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.8)
    dirLight.position.set(1.5, 2.5, 3.0)
    dirLight.castShadow = true
    this.scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8)
    fillLight.position.set(-2, -1, 1.5)
    this.scene.add(fillLight)
  }

  /**
   * Set up 3D Anchor Visuals (Ground Ring, Test Cube, Inner Core, Axes, Labels)
   */
  setupAnchorVisuals(parentGroup) {
    this.cubeGroup = new THREE.Group()
    parentGroup.add(this.cubeGroup)

    // Palette
    const colors = this.getColorPalette()

    // 1. Ground Targeting Disc & Ring (XY plane at z = 0.005)
    const ringGeo = new THREE.RingGeometry(0.35, 0.42, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: colors.primary,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
    this.groundRing = new THREE.Mesh(ringGeo, ringMat)
    this.groundRing.position.z = 0.005
    this.cubeGroup.add(this.groundRing)

    // Ground Inner Reticle
    const innerRingGeo = new THREE.RingGeometry(0.18, 0.20, 32)
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: colors.accent,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    })
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat)
    innerRing.position.z = 0.006
    this.cubeGroup.add(innerRing)

    // Marker boundary locator brackets (1.0 x 1.0 marker frame)
    const bracketGroup = this.createMarkerBrackets(colors.primary)
    this.cubeGroup.add(bracketGroup)

    // 2. 3D Floating Test Cube
    const cubeSize = 0.30
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)

    // Semi-translucent glowing standard material
    const cubeMat = new THREE.MeshStandardMaterial({
      color: colors.primary,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.75,
      emissive: colors.primary,
      emissiveIntensity: 0.25,
    })
    this.cubeMesh = new THREE.Mesh(cubeGeo, cubeMat)
    this.cubeMesh.position.set(0, 0, 0.32)

    // Sharp glowing wireframe edges
    const edgesGeo = new THREE.EdgesGeometry(cubeGeo)
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    })
    this.cubeEdges = new THREE.LineSegments(edgesGeo, edgesMat)
    this.cubeMesh.add(this.cubeEdges)

    // 3. Inner Glowing Pulsing Core (Octahedron)
    const coreGeo = new THREE.OctahedronGeometry(0.10, 0)
    const coreMat = new THREE.MeshBasicMaterial({
      color: colors.accent,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    })
    this.innerCore = new THREE.Mesh(coreGeo, coreMat)
    this.cubeMesh.add(this.innerCore)

    // Inner point light for local glow
    this.pointLight = new THREE.PointLight(colors.accent, 2.0, 1.2)
    this.pointLight.position.set(0, 0, 0)
    this.cubeMesh.add(this.pointLight)

    this.cubeGroup.add(this.cubeMesh)

    // 4. XYZ Coordinate Axes Helper (toggleable)
    this.axesHelper = new THREE.AxesHelper(0.25)
    this.axesHelper.position.set(0, 0, 0.01)
    this.axesHelper.visible = false
    this.cubeGroup.add(this.axesHelper)

    // 5. Billboard Text Label (Canvas Sprite)
    this.billboardSprite = this.createStatusSprite('AR ANCHOR ACTIVE')
    this.billboardSprite.position.set(0, 0, 0.62)
    this.billboardSprite.scale.set(0.6, 0.18, 1)
    this.cubeGroup.add(this.billboardSprite)
  }

  /**
   * Creates 4 corner brackets indicating the 1.0 x 1.0 marker bounds
   */
  createMarkerBrackets(color) {
    const group = new THREE.Group()
    const bracketSize = 0.15
    const half = 0.5
    const mat = new THREE.LineBasicMaterial({
      color,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
    })

    const corners = [
      { x: -half, y: -half, dx: bracketSize, dy: bracketSize },
      { x: half, y: -half, dx: -bracketSize, dy: bracketSize },
      { x: half, y: half, dx: -bracketSize, dy: -bracketSize },
      { x: -half, y: half, dx: bracketSize, dy: -bracketSize },
    ]

    corners.forEach((c) => {
      const points = [
        new THREE.Vector3(c.x, c.y + c.dy, 0.008),
        new THREE.Vector3(c.x, c.y, 0.008),
        new THREE.Vector3(c.x + c.dx, c.y, 0.008),
      ]
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const line = new THREE.Line(geo, mat)
      group.add(line)
    })

    return group
  }

  /**
   * Generates a 2D canvas sprite with futuristic status text
   */
  createStatusSprite(text) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 140
    const ctx = canvas.getContext('2d')

    // Background pill
    ctx.fillStyle = 'rgba(10, 15, 26, 0.85)'
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth = 6
    this.drawRoundedRect(ctx, 10, 10, 492, 120, 28)
    ctx.fill()
    ctx.stroke()

    // Status dot
    ctx.fillStyle = '#10b981'
    ctx.beginPath()
    ctx.arc(55, 70, 12, 0, Math.PI * 2)
    ctx.fill()

    // Text
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 36px "Inter", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 85, 70)

    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    return new THREE.Sprite(mat)
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  /**
   * Main per-frame animation and rendering step
   */
  renderFrame() {
    if (!this.renderer || !this.scene || !this.camera) return

    const elapsedTime = this.clock.getElapsedTime()

    // 1. Animate 3D Test Cube & Visuals
    if (this.cubeMesh && this.isRotating) {
      // Turntable spin around Z (normal to marker)
      this.cubeMesh.rotation.z += 0.015
      this.cubeMesh.rotation.x = Math.sin(elapsedTime * 1.2) * 0.15
      this.cubeMesh.rotation.y = Math.cos(elapsedTime * 1.5) * 0.15

      // Floating oscillation
      this.cubeMesh.position.z = 0.32 + Math.sin(elapsedTime * 2.2) * 0.04

      // Counter-rotate inner core & pulse scale
      if (this.innerCore) {
        this.innerCore.rotation.z -= 0.03
        this.innerCore.rotation.x += 0.02
        const coreScale = 1.0 + Math.sin(elapsedTime * 3.5) * 0.2
        this.innerCore.scale.set(coreScale, coreScale, coreScale)
      }

      // Rotate ground targeting ring
      if (this.groundRing) {
        this.groundRing.rotation.z -= 0.008
      }
    }

    // 2. Render Scene
    this.renderer.render(this.scene, this.camera)

    // 3. Calculate FPS
    this.frameCount++
    const now = performance.now()
    if (now - this.lastFpsCheck >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCheck))
      this.frameCount = 0
      this.lastFpsCheck = now
      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.currentFps)
      }
    }
  }

  /**
   * Switch visualization modes
   */
  setVisualMode(mode) {
    this.visualMode = mode
    if (!this.cubeMesh || !this.axesHelper) return

    if (mode === 'cube') {
      this.cubeMesh.visible = true
      this.axesHelper.visible = false
      if (this.groundRing) this.groundRing.visible = true
    } else if (mode === 'stove-ring') {
      // In stove-ring mode, hide the cube and amplify ground target ring
      this.cubeMesh.visible = false
      this.axesHelper.visible = false
      if (this.groundRing) {
        this.groundRing.visible = true
        this.groundRing.scale.set(1.4, 1.4, 1.4)
      }
    } else if (mode === 'wireframe') {
      this.cubeMesh.visible = true
      this.axesHelper.visible = true
      if (this.groundRing) {
        this.groundRing.scale.set(1.0, 1.0, 1.0)
      }
    }
  }

  /**
   * Toggle cube rotation
   */
  toggleRotation() {
    this.isRotating = !this.isRotating
    return this.isRotating
  }

  /**
   * Set theme palette
   */
  setColorTheme(theme) {
    this.colorTheme = theme
    const colors = this.getColorPalette()

    if (this.cubeMesh) {
      this.cubeMesh.material.color.set(colors.primary)
      this.cubeMesh.material.emissive.set(colors.primary)
    }
    if (this.innerCore) {
      this.innerCore.material.color.set(colors.accent)
    }
    if (this.pointLight) {
      this.pointLight.color.set(colors.accent)
    }
    if (this.groundRing) {
      this.groundRing.material.color.set(colors.primary)
    }
  }

  getColorPalette() {
    switch (this.colorTheme) {
      case 'kitchen-orange':
        return { primary: 0xff6b35, accent: 0xfbbf24 } // AR-CookVision flame orange & amber
      case 'cyber-cyan':
        return { primary: 0x00f5d4, accent: 0x7b2cbf } // Neon cyan & purple
      case 'emerald-fresh':
      default:
        return { primary: 0x10b981, accent: 0x06b6d4 } // Emerald & cyan
    }
  }

  onWindowResize() {
    if (this.mindarThree && typeof this.mindarThree.resize === 'function') {
      this.mindarThree.resize()
    }
  }

  setState(state) {
    this.trackingState = state
    if (this.onStateChange) {
      this.onStateChange(state)
    }
  }

  handleError(msg) {
    this.setState('error')
    if (this.onError) {
      this.onError(msg)
    }
  }

  /**
   * Cleanly stop MindAR, release camera hardware, and dispose Three.js resources
   */
  stop() {
    this.isCancelled = true

    window.removeEventListener('resize', this.handleResize)

    // Stop animation loop
    if (this.renderer) {
      this.renderer.setAnimationLoop(null)
    }

    // Stop MindAR engine and camera hardware
    if (this.mindarThree) {
      try {
        if (typeof this.mindarThree.stop === 'function') {
          this.mindarThree.stop()
        }
      } catch (e) {
        console.warn('[ARManager] Error stopping mindarThree:', e)
      }
    }

    // Ensure any leftover video tracks in container are completely stopped
    if (this.container) {
      const videos = this.container.querySelectorAll('video')
      videos.forEach((video) => {
        if (video.srcObject && typeof video.srcObject.getTracks === 'function') {
          video.srcObject.getTracks().forEach((track) => track.stop())
        }
        video.remove()
      })

      // Remove renderer canvases from container
      const canvases = this.container.querySelectorAll('canvas')
      canvases.forEach((canvas) => canvas.remove())
    }

    // Dispose Three.js objects to avoid memory leaks
    if (this.cubeMesh) {
      this.cubeMesh.geometry?.dispose()
      this.cubeMesh.material?.dispose()
    }
    if (this.cubeEdges) {
      this.cubeEdges.geometry?.dispose()
      this.cubeEdges.material?.dispose()
    }
    if (this.innerCore) {
      this.innerCore.geometry?.dispose()
      this.innerCore.material?.dispose()
    }
    if (this.groundRing) {
      this.groundRing.geometry?.dispose()
      this.groundRing.material?.dispose()
    }
    if (this.renderer) {
      this.renderer.dispose()
    }

    this.mindarThree = null
    this.renderer = null
    this.scene = null
    this.camera = null
    this.anchor = null
    this.isStarted = false
    this.setState('idle')
  }
}
