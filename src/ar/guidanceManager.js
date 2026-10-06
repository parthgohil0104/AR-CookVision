import * as THREE from 'three'

/**
 * Pan offset coordinates relative to MindAR marker origin (0, 0, 0).
 * Placed safely forward on the counter/stove plane (+Y axis).
 */
export const PAN_OFFSET = {
  x: 0,
  y: 0.45,
  z: 0.01,
}
export const PAN_RADIUS = 0.28

/**
 * GuidanceManager
 *
 * Implements recipe-step-synchronized 3D AR spatial visual guidance
 * for all 7 steps of the French omelette recipe + completion state.
 *
 * Independent of MediaPipe and CV object recognition.
 * Strictly visual cues anchored to MindAR target coordinate system.
 */
export class GuidanceManager {
  constructor() {
    this.rootGroup = new THREE.Group()
    this.rootGroup.name = 'GuidanceManagerRoot'

    this.activeStep = 1
    this.isCompleted = false
    this.timerSeconds = null

    // Sub-groups for each step
    this.stepGroups = {}
    this.completionGroup = null

    // Dynamic animated references
    this.stirArrow = null
    this.step1Arrow = null
    this.oilDrop = null
    this.oilRipple = null
    this.eggCue = null
    this.saltCue = null
    this.saltArcs = []
    this.flameRings = []
    this.serveArrow = null
    this.step6TimerSprite = null
    this.step6TimerCanvas = null
    this.step6TimerCtx = null
    this.step6TimerTexture = null
    this.completionStar = null

    this.initVisuals()
  }

  /**
   * Initializes all step-specific 3D guidance objects.
   */
  initVisuals() {
    // 1. Shared Marker Reticle (at 0,0,0) indicating tracking anchor
    const markerFrame = this.createMarkerBoundary()
    this.rootGroup.add(markerFrame)

    // 2. Build guidance for each recipe step (1 to 7)
    this.stepGroups[1] = this.createStep1PanGuidance()
    this.stepGroups[2] = this.createStep2OilGuidance()
    this.stepGroups[3] = this.createStep3EggGuidance()
    this.stepGroups[4] = this.createStep4SaltGuidance()
    this.stepGroups[5] = this.createStep5StirGuidance()
    this.stepGroups[6] = this.createStep6CookGuidance()
    this.stepGroups[7] = this.createStep7ServeGuidance()

    // 3. Build completion state guidance
    this.completionGroup = this.createCompletionGuidance()

    // Attach all groups to root
    for (let s = 1; s <= 7; s++) {
      this.rootGroup.add(this.stepGroups[s])
    }
    this.rootGroup.add(this.completionGroup)

    // Set initial visibility to Step 1
    this.setStep(1, { isCompleted: false })
  }

  /**
   * Creates a marker boundary bracket indicating the anchor origin.
   */
  createMarkerBoundary() {
    const group = new THREE.Group()
    group.name = 'MarkerOriginBracket'
    const size = 0.5
    const corner = 0.12

    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
    })

    const corners = [
      { x: -size, y: -size, dx: corner, dy: corner },
      { x: size, y: -size, dx: -corner, dy: corner },
      { x: size, y: size, dx: -corner, dy: -corner },
      { x: -size, y: size, dx: corner, dy: -corner },
    ]

    corners.forEach((c) => {
      const pts = [
        new THREE.Vector3(c.x, c.y + c.dy, 0.005),
        new THREE.Vector3(c.x, c.y, 0.005),
        new THREE.Vector3(c.x + c.dx, c.y, 0.005),
      ]
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      group.add(new THREE.Line(geo, mat))
    })

    // Small label near marker
    const originLabel = this.createCanvasSprite('AR ANCHOR', {
      textColor: '#38bdf8',
      bgColor: 'rgba(10, 15, 26, 0.75)',
      width: 256,
      height: 70,
      fontSize: 22,
    })
    originLabel.position.set(0, -0.42, 0.04)
    originLabel.scale.set(0.35, 0.10, 1)
    group.add(originLabel)

    return group
  }

  /**
   * Helper to create a base pan outline ring at PAN_OFFSET.
   */
  createPanOutline(color = 0xffffff, opacity = 0.5) {
    const group = new THREE.Group()

    // Outer pan rim
    const rimGeo = new THREE.RingGeometry(PAN_RADIUS - 0.015, PAN_RADIUS, 48)
    const rimMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
    })
    const rim = new THREE.Mesh(rimGeo, rimMat)
    rim.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z)
    group.add(rim)

    // Inner subtle cooking floor disc
    const floorGeo = new THREE.CircleGeometry(PAN_RADIUS - 0.015, 32)
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x111827,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z - 0.001)
    group.add(floor)

    // Pan handle outline (pointing toward marker)
    const handlePts = [
      new THREE.Vector3(PAN_OFFSET.x - 0.03, PAN_OFFSET.y - PAN_RADIUS, PAN_OFFSET.z),
      new THREE.Vector3(PAN_OFFSET.x - 0.02, PAN_OFFSET.y - PAN_RADIUS - 0.15, PAN_OFFSET.z),
      new THREE.Vector3(PAN_OFFSET.x + 0.02, PAN_OFFSET.y - PAN_RADIUS - 0.15, PAN_OFFSET.z),
      new THREE.Vector3(PAN_OFFSET.x + 0.03, PAN_OFFSET.y - PAN_RADIUS, PAN_OFFSET.z),
    ]
    const handleGeo = new THREE.BufferGeometry().setFromPoints(handlePts)
    const handleMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: opacity * 0.8,
    })
    group.add(new THREE.Line(handleGeo, handleMat))

    return group
  }

  /**
   * STEP 1 — Position Pan
   * Targets pan placement area with ring, crosshair, and directional guide arrow.
   */
  createStep1PanGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep1_PositionPan'

    // 1. Pan target ring with cyan/teal glow
    const panTarget = this.createPanOutline(0x00f5d4, 0.85)
    group.add(panTarget)

    // Inner targeting crosshair
    const crosshairPts = [
      new THREE.Vector3(PAN_OFFSET.x - 0.08, PAN_OFFSET.y, PAN_OFFSET.z + 0.002),
      new THREE.Vector3(PAN_OFFSET.x + 0.08, PAN_OFFSET.y, PAN_OFFSET.z + 0.002),
      new THREE.Vector3(PAN_OFFSET.x, PAN_OFFSET.y - 0.08, PAN_OFFSET.z + 0.002),
      new THREE.Vector3(PAN_OFFSET.x, PAN_OFFSET.y + 0.08, PAN_OFFSET.z + 0.002),
    ]
    const crossGeo = new THREE.BufferGeometry().setFromPoints(crosshairPts)
    const crossMat = new THREE.LineBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.9 })
    const crosshair = new THREE.LineSegments(crossGeo, crossMat)
    group.add(crosshair)

    // 2. Directional guide arrow from marker toward pan
    const arrowGroup = new THREE.Group()
    const arrowShaftPts = [
      new THREE.Vector3(0, 0.12, 0.02),
      new THREE.Vector3(0, 0.32, 0.02),
    ]
    const shaftGeo = new THREE.BufferGeometry().setFromPoints(arrowShaftPts)
    const shaftMat = new THREE.LineBasicMaterial({ color: 0x00f5d4, linewidth: 3 })
    arrowGroup.add(new THREE.Line(shaftGeo, shaftMat))

    // Arrowhead cone pointing +Y
    const headGeo = new THREE.ConeGeometry(0.04, 0.08, 16)
    headGeo.rotateZ(-Math.PI / 2) // Point along +Y
    const headMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 })
    const arrowHead = new THREE.Mesh(headGeo, headMat)
    arrowHead.position.set(0, 0.34, 0.02)
    arrowHead.rotation.z = Math.PI / 2 // Point along +Y
    arrowGroup.add(arrowHead)

    this.step1Arrow = arrowGroup
    group.add(arrowGroup)

    // 3. Floating Instruction Billboard
    const label = this.createCanvasSprite('POSITION PAN HERE 🍳', {
      textColor: '#ffffff',
      borderColor: '#00f5d4',
      bgColor: 'rgba(10, 20, 30, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.22)
    label.scale.set(0.55, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * STEP 2 — Add Oil
   * Oil/ingredient visual cue with downward directional arrow and coating ripple.
   */
  createStep2OilGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep2_AddOil'

    // Pan outline
    group.add(this.createPanOutline(0xffb703, 0.6))

    // Golden oil droplet 3D cue floating over pan
    const dropGroup = new THREE.Group()
    const sphereGeo = new THREE.SphereGeometry(0.045, 16, 16)
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0xffa000,
      emissiveIntensity: 0.3,
    })
    const dropSphere = new THREE.Mesh(sphereGeo, dropMat)
    dropSphere.position.set(0, 0, 0)
    dropGroup.add(dropSphere)

    const coneGeo = new THREE.ConeGeometry(0.045, 0.08, 16)
    coneGeo.rotateX(Math.PI / 2)
    const dropCone = new THREE.Mesh(coneGeo, dropMat)
    dropCone.position.set(0, 0, 0.04)
    dropGroup.add(dropCone)

    dropGroup.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.16)
    this.oilDrop = dropGroup
    group.add(dropGroup)

    // Downward directional arrow pointing into pan
    const downArrow = this.createDownwardArrow(0xffb703)
    downArrow.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.07)
    group.add(downArrow)

    // Oil surface coating ripple ring in pan
    const rippleGeo = new THREE.RingGeometry(0.08, 0.14, 32)
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    })
    const ripple = new THREE.Mesh(rippleGeo, rippleMat)
    ripple.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.002)
    this.oilRipple = ripple
    group.add(ripple)

    // Floating Billboard
    const label = this.createCanvasSprite('ADD 1 TBSP OIL 🧈', {
      textColor: '#ffffff',
      borderColor: '#ffb703',
      bgColor: 'rgba(25, 20, 10, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    label.scale.set(0.55, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * STEP 3 — Add Eggs
   * Egg ingredient 3D visual cue and pour guide toward cooking area.
   */
  createStep3EggGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep3_AddEggs'

    group.add(this.createPanOutline(0xffe066, 0.6))

    // 3D Egg cue: Yolk sphere + egg white disc
    const eggGroup = new THREE.Group()

    const yolkGeo = new THREE.SphereGeometry(0.04, 16, 16)
    const yolkMat = new THREE.MeshStandardMaterial({
      color: 0xff9f1c,
      roughness: 0.3,
      emissive: 0xff8c00,
      emissiveIntensity: 0.3,
    })
    const yolk = new THREE.Mesh(yolkGeo, yolkMat)
    yolk.position.set(0, 0, 0.02)
    eggGroup.add(yolk)

    const whiteGeo = new THREE.RingGeometry(0.035, 0.09, 24)
    const whiteMat = new THREE.MeshBasicMaterial({
      color: 0xfef9c3,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
    const eggWhite = new THREE.Mesh(whiteGeo, whiteMat)
    eggGroup.add(eggWhite)

    eggGroup.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.16)
    this.eggCue = eggGroup
    group.add(eggGroup)

    // Downward pour arrow
    const downArrow = this.createDownwardArrow(0xff9f1c)
    downArrow.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.07)
    group.add(downArrow)

    // Translucent egg layer settling on pan
    const layerGeo = new THREE.CircleGeometry(0.20, 32)
    const layerMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const eggLayer = new THREE.Mesh(layerGeo, layerMat)
    eggLayer.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.002)
    group.add(eggLayer)

    // Floating Billboard
    const label = this.createCanvasSprite('POUR WHISKED EGGS 🥚', {
      textColor: '#ffffff',
      borderColor: '#ff9f1c',
      bgColor: 'rgba(25, 20, 10, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    label.scale.set(0.60, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * STEP 4 — Add Salt
   * Salt seasoning cue and radial sprinkle arc indicators.
   */
  createStep4SaltGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep4_AddSalt'

    group.add(this.createPanOutline(0xffffff, 0.6))

    // Crystalline salt shaker cue
    const shakerGroup = new THREE.Group()
    const bodyGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.08, 12)
    bodyGeo.rotateX(Math.PI / 4) // Angled shaker
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    shakerGroup.add(body)

    shakerGroup.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.18)
    this.saltCue = shakerGroup
    group.add(shakerGroup)

    // 4 radial sprinkle arcs across pan surface
    const arcRadius = 0.15
    this.saltArcs = []
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2
      const arcGeo = new THREE.RingGeometry(arcRadius - 0.01, arcRadius + 0.01, 16, 1, angle - 0.3, 0.6)
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      })
      const arc = new THREE.Mesh(arcGeo, arcMat)
      arc.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.003)
      this.saltArcs.push(arc)
      group.add(arc)
    }

    // Floating Billboard
    const label = this.createCanvasSprite('SEASON WITH SALT & PEPPER 🧂', {
      textColor: '#ffffff',
      borderColor: '#e2e8f0',
      bgColor: 'rgba(20, 24, 32, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    label.scale.set(0.65, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * STEP 5 — Stir
   * Animated circular stirring arrow indicating continuous circular spatula movement.
   */
  createStep5StirGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep5_Stir'

    group.add(this.createPanOutline(0x38bdf8, 0.6))

    // Animated rotating circular stirring arrow
    const stirGroup = new THREE.Group()
    stirGroup.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.02)

    // 270-degree curved tube arc
    const arcGeo = new THREE.RingGeometry(0.13, 0.16, 32, 1, 0, Math.PI * 1.5)
    const arcMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
    const arcMesh = new THREE.Mesh(arcGeo, arcMat)
    stirGroup.add(arcMesh)

    // Arrowhead at the tip of the curved arc (at angle Math.PI * 1.5)
    const headGeo = new THREE.ConeGeometry(0.035, 0.06, 12)
    const headMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    const headMesh = new THREE.Mesh(headGeo, headMat)
    headMesh.position.set(0, -0.145, 0)
    headMesh.rotation.z = Math.PI // Pointing tangentially
    stirGroup.add(headMesh)

    this.stirArrow = stirGroup
    group.add(stirGroup)

    // Floating Billboard
    const label = this.createCanvasSprite('STIR GENTLY IN CIRCLES 🥄', {
      textColor: '#ffffff',
      borderColor: '#38bdf8',
      bgColor: 'rgba(10, 25, 35, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    label.scale.set(0.60, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * STEP 6 — Cook
   * Simmering thermal warmth rings and floating integrated timer readout.
   */
  createStep6CookGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep6_Cook'

    group.add(this.createPanOutline(0xff6b35, 0.65))

    // Thermal warmth rings around pan base
    this.flameRings = []
    const innerFlameGeo = new THREE.RingGeometry(PAN_RADIUS * 0.7, PAN_RADIUS * 0.85, 32)
    const innerFlameMat = new THREE.MeshBasicMaterial({
      color: 0xff6b35,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    })
    const innerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat)
    innerFlame.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.003)
    this.flameRings.push(innerFlame)
    group.add(innerFlame)

    const outerFlameGeo = new THREE.RingGeometry(PAN_RADIUS * 0.95, PAN_RADIUS * 1.15, 32)
    const outerFlameMat = new THREE.MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const outerFlame = new THREE.Mesh(outerFlameGeo, outerFlameMat)
    outerFlame.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.002)
    this.flameRings.push(outerFlame)
    group.add(outerFlame)

    // Dynamic Live Timer Billboard
    const { sprite, canvas, ctx, texture } = this.createDynamicTimerSprite()
    sprite.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    sprite.scale.set(0.60, 0.16, 1)
    this.step6TimerSprite = sprite
    this.step6TimerCanvas = canvas
    this.step6TimerCtx = ctx
    this.step6TimerTexture = texture
    group.add(sprite)

    return group
  }

  /**
   * STEP 7 — Serve
   * Plate target, slide/tilt arrow from pan to plate.
   */
  createStep7ServeGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceStep7_Serve'

    group.add(this.createPanOutline(0x2ecc71, 0.6))

    // Serving Plate Outline Target (positioned to the right of the pan)
    const plateOffset = {
      x: PAN_OFFSET.x + 0.42,
      y: PAN_OFFSET.y,
      z: PAN_OFFSET.z,
    }
    const plateRimGeo = new THREE.RingGeometry(0.18, 0.20, 36)
    const plateMat = new THREE.MeshBasicMaterial({
      color: 0x2ecc71,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
    const plateRim = new THREE.Mesh(plateRimGeo, plateMat)
    plateRim.position.set(plateOffset.x, plateOffset.y, plateOffset.z)
    group.add(plateRim)

    const plateInnerGeo = new THREE.CircleGeometry(0.18, 24)
    const plateInnerMat = new THREE.MeshBasicMaterial({
      color: 0x14532d,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    })
    const plateInner = new THREE.Mesh(plateInnerGeo, plateInnerMat)
    plateInner.position.set(plateOffset.x, plateOffset.y, plateOffset.z - 0.001)
    group.add(plateInner)

    // Slide arrow from pan center toward plate
    const arrowGroup = new THREE.Group()
    const arrowPts = [
      new THREE.Vector3(PAN_OFFSET.x + 0.08, PAN_OFFSET.y, 0.03),
      new THREE.Vector3(plateOffset.x - 0.08, plateOffset.y, 0.03),
    ]
    const arrowGeo = new THREE.BufferGeometry().setFromPoints(arrowPts)
    const arrowMat = new THREE.LineBasicMaterial({ color: 0x2ecc71, linewidth: 3 })
    arrowGroup.add(new THREE.Line(arrowGeo, arrowMat))

    const coneGeo = new THREE.ConeGeometry(0.035, 0.07, 16)
    coneGeo.rotateZ(-Math.PI / 2) // Point +X
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.set(plateOffset.x - 0.06, plateOffset.y, 0.03)
    arrowGroup.add(cone)

    this.serveArrow = arrowGroup
    group.add(arrowGroup)

    // Floating Billboard
    const label = this.createCanvasSprite('ROLL & SLIDE ONTO PLATE 🍽️', {
      textColor: '#ffffff',
      borderColor: '#2ecc71',
      bgColor: 'rgba(10, 30, 20, 0.85)',
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.28)
    label.scale.set(0.65, 0.16, 1)
    group.add(label)

    return group
  }

  /**
   * RECIPE COMPLETION CELEBRATION GUIDANCE
   */
  createCompletionGuidance() {
    const group = new THREE.Group()
    group.name = 'GuidanceCompletion_Celebration'

    // Dual golden victory rings
    const ring1Geo = new THREE.RingGeometry(PAN_RADIUS * 0.9, PAN_RADIUS * 0.95, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
    const ring1 = new THREE.Mesh(ring1Geo, ringMat)
    ring1.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.005)
    group.add(ring1)

    const ring2Geo = new THREE.RingGeometry(PAN_RADIUS * 1.05, PAN_RADIUS * 1.08, 48)
    const ring2 = new THREE.Mesh(ring2Geo, ringMat)
    ring2.position.set(PAN_OFFSET.x, PAN_OFFSET.y, PAN_OFFSET.z + 0.005)
    group.add(ring2)

    // Rotating 3D gold core star
    const starGeo = new THREE.OctahedronGeometry(0.08, 0)
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xffaa00,
      emissiveIntensity: 0.4,
    })
    const star = new THREE.Mesh(starGeo, starMat)
    star.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.15)
    this.completionStar = star
    group.add(star)

    // Celebratory Billboard
    const label = this.createCanvasSprite('BON APPÉTIT! 🎉 OMELETTE READY', {
      textColor: '#ffd700',
      borderColor: '#ffd700',
      bgColor: 'rgba(25, 20, 5, 0.9)',
      fontSize: 26,
    })
    label.position.set(PAN_OFFSET.x, PAN_OFFSET.y, 0.30)
    label.scale.set(0.70, 0.18, 1)
    group.add(label)

    return group
  }

  /**
   * Helper to create a downward pointing 3D arrow.
   */
  createDownwardArrow(color) {
    const group = new THREE.Group()
    const shaftPts = [
      new THREE.Vector3(0, 0, 0.08),
      new THREE.Vector3(0, 0, 0.02),
    ]
    const shaftGeo = new THREE.BufferGeometry().setFromPoints(shaftPts)
    const shaftMat = new THREE.LineBasicMaterial({ color, linewidth: 2 })
    group.add(new THREE.Line(shaftGeo, shaftMat))

    const coneGeo = new THREE.ConeGeometry(0.03, 0.05, 12)
    coneGeo.rotateX(-Math.PI / 2) // Point along -Z
    const coneMat = new THREE.MeshBasicMaterial({ color })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.set(0, 0, 0.01)
    group.add(cone)

    return group
  }

  /**
   * Creates a static 2D Canvas Billboard Sprite.
   */
  createCanvasSprite(text, {
    textColor = '#ffffff',
    borderColor = '#00f5d4',
    bgColor = 'rgba(10, 15, 26, 0.85)',
    width = 512,
    height = 130,
    fontSize = 28,
  } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // Rounded rectangle background
    ctx.fillStyle = bgColor
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 5
    this.drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 24)
    ctx.fill()
    ctx.stroke()

    // Text
    ctx.fillStyle = textColor
    ctx.font = `bold ${fontSize}px "Inter", -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    return new THREE.Sprite(mat)
  }

  /**
   * Creates a dynamic canvas sprite for Step 6 live countdown timer.
   */
  createDynamicTimerSprite() {
    const width = 512
    const height = 130
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    this.renderTimerSpriteContent(ctx, width, height, 'LOW HEAT SETTING 🔥 01:00')

    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    const sprite = new THREE.Sprite(mat)
    return { sprite, canvas, ctx, texture }
  }

  renderTimerSpriteContent(ctx, width, height, text) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(25, 12, 5, 0.88)'
    ctx.strokeStyle = '#ff6b35'
    ctx.lineWidth = 5
    this.drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 24)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ff9f43'
    ctx.font = 'bold 26px "Inter", -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)
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
   * Sets the active recipe step and updates visibility.
   * Guarantees strictly ONE step (or completion) is visible at any given moment.
   *
   * @param {number} stepNumber - 1 to 7
   * @param {object} options
   * @param {boolean} options.isCompleted - true when recipe is completed
   * @param {number|null} options.timerSeconds - remaining timer seconds
   */
  setStep(stepNumber, { isCompleted = false, timerSeconds = null } = {}) {
    this.activeStep = stepNumber
    this.isCompleted = isCompleted
    this.timerSeconds = timerSeconds

    if (isCompleted) {
      // Hide all step groups, show only completion group
      for (let s = 1; s <= 7; s++) {
        if (this.stepGroups[s]) {
          this.stepGroups[s].visible = false
        }
      }
      if (this.completionGroup) {
        this.completionGroup.visible = true
      }
      return
    }

    // Normal recipe step mode: show matching step, hide completion and other steps
    if (this.completionGroup) {
      this.completionGroup.visible = false
    }

    for (let s = 1; s <= 7; s++) {
      if (this.stepGroups[s]) {
        this.stepGroups[s].visible = s === stepNumber
      }
    }

    // Update timer texture if on step 6
    if (stepNumber === 6) {
      this.updateStep6Timer(timerSeconds)
    }
  }

  /**
   * Updates Step 6 timer billboard text.
   */
  updateStep6Timer(seconds) {
    if (!this.step6TimerCtx || !this.step6TimerTexture) return

    let timeStr = '01:00'
    if (typeof seconds === 'number') {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0')
      const s = (seconds % 60).toString().padStart(2, '0')
      timeStr = `${m}:${s}`
    }

    this.renderTimerSpriteContent(
      this.step6TimerCtx,
      this.step6TimerCanvas.width,
      this.step6TimerCanvas.height,
      `LOW HEAT SETTING 🔥 ${timeStr}`
    )
    this.step6TimerTexture.needsUpdate = true
  }

  /**
   * Animates active 3D guidance visuals per frame.
   *
   * @param {number} elapsedTime - total time in seconds
   * @param {number} delta - delta time in seconds
   */
  animate(elapsedTime, delta = 0.016) {
    if (this.isCompleted) {
      if (this.completionStar) {
        this.completionStar.rotation.z += 0.02
        this.completionStar.rotation.y += 0.015
      }
      return
    }

    switch (this.activeStep) {
      case 1:
        // Oscillate directional arrow along Y
        if (this.step1Arrow) {
          this.step1Arrow.position.y = Math.sin(elapsedTime * 3) * 0.015
        }
        break

      case 2:
        // Gentle oil drop bobbing & ripple pulsing
        if (this.oilDrop) {
          this.oilDrop.position.z = 0.16 + Math.sin(elapsedTime * 2.5) * 0.015
        }
        if (this.oilRipple) {
          const s = 1.0 + Math.sin(elapsedTime * 2) * 0.15
          this.oilRipple.scale.set(s, s, 1)
        }
        break

      case 3:
        // Gentle egg floating
        if (this.eggCue) {
          this.eggCue.position.z = 0.16 + Math.sin(elapsedTime * 2.2) * 0.012
        }
        break

      case 4:
        // Gentle tilt oscillation of salt shaker
        if (this.saltCue) {
          this.saltCue.rotation.z = Math.sin(elapsedTime * 4) * 0.1
        }
        break

      case 5:
        // Continuous circular stirring arrow rotation around Z
        if (this.stirArrow) {
          this.stirArrow.rotation.z -= delta * 3.2
        }
        break

      case 6:
        // Simmering warmth pulses
        this.flameRings.forEach((ring, idx) => {
          const factor = Math.sin(elapsedTime * 3 + idx * 1.5) * 0.08
          ring.scale.set(1 + factor, 1 + factor, 1)
        })
        break

      case 7:
        // Directional slide arrow oscillation toward plate (+X)
        if (this.serveArrow) {
          this.serveArrow.position.x = Math.sin(elapsedTime * 2.5) * 0.02
        }
        break
    }
  }

  /**
   * Cleanly disposes Three.js geometries, materials, and textures.
   */
  dispose() {
    this.rootGroup.traverse((obj) => {
      if (obj.geometry) {
        obj.geometry.dispose()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose()
            m.dispose()
          })
        } else {
          if (obj.material.map) obj.material.map.dispose()
          obj.material.dispose()
        }
      }
    })
  }
}
