import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

// Polyfill minimal DOM canvas for Node test runner
before(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return {
            width: 512,
            height: 140,
            getContext: () => ({
              fillStyle: '',
              strokeStyle: '',
              lineWidth: 1,
              font: '',
              textAlign: '',
              textBaseline: '',
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              quadraticCurveTo: () => {},
              closePath: () => {},
              fill: () => {},
              stroke: () => {},
              arc: () => {},
              clearRect: () => {},
              fillText: () => {},
            }),
          }
        }
        return {}
      },
    }
  }
})

describe('AR GuidanceManager — 3D Spatial Recipe Guidance Engine', () => {
  let GuidanceManager
  let PAN_OFFSET

  before(async () => {
    const mod = await import('../src/ar/guidanceManager.js')
    GuidanceManager = mod.GuidanceManager
    PAN_OFFSET = mod.PAN_OFFSET
  })

  test('Initializes with Step 1 active and safe pan offset', () => {
    const gm = new GuidanceManager()

    assert.equal(gm.activeStep, 1)
    assert.equal(gm.isCompleted, false)
    assert.equal(PAN_OFFSET.y, 0.45, 'Pan is offset forward on the cooking surface')

    // Root group contains all 7 steps + completion group + marker origin bracket
    assert.ok(gm.rootGroup)
    assert.ok(gm.stepGroups[1])
    assert.ok(gm.stepGroups[7])
    assert.ok(gm.completionGroup)

    // Step 1 is visible, all others are hidden
    assert.equal(gm.stepGroups[1].visible, true)
    for (let s = 2; s <= 7; s++) {
      assert.equal(gm.stepGroups[s].visible, false)
    }
    assert.equal(gm.completionGroup.visible, false)
  })

  test('Step 1 (Position Pan): contains pan target ring, crosshair, and directional guide arrow', () => {
    const gm = new GuidanceManager()
    gm.setStep(1)

    assert.equal(gm.activeStep, 1)
    assert.equal(gm.stepGroups[1].visible, true)
    assert.equal(gm.stepGroups[1].name, 'GuidanceStep1_PositionPan')
    assert.ok(gm.step1Arrow, 'Step 1 includes directional pan positioning arrow')
  })

  test('Step 2 (Add Oil): contains oil ingredient cue, downward pour arrow, and ripple ring', () => {
    const gm = new GuidanceManager()
    gm.setStep(2)

    assert.equal(gm.activeStep, 2)
    assert.equal(gm.stepGroups[2].visible, true)
    assert.equal(gm.stepGroups[2].name, 'GuidanceStep2_AddOil')
    assert.ok(gm.oilDrop, 'Step 2 includes oil droplet 3D cue')
    assert.ok(gm.oilRipple, 'Step 2 includes oil surface ripple')

    // Other steps must be hidden
    assert.equal(gm.stepGroups[1].visible, false)
    assert.equal(gm.stepGroups[3].visible, false)
  })

  test('Step 3 (Add Eggs): contains egg yolk/white cue and downward pour guidance', () => {
    const gm = new GuidanceManager()
    gm.setStep(3)

    assert.equal(gm.activeStep, 3)
    assert.equal(gm.stepGroups[3].visible, true)
    assert.equal(gm.stepGroups[3].name, 'GuidanceStep3_AddEggs')
    assert.ok(gm.eggCue, 'Step 3 includes egg 3D visual cue')
    assert.equal(gm.stepGroups[2].visible, false)
  })

  test('Step 4 (Add Salt): contains salt seasoning cue and radial sprinkle arc indicators', () => {
    const gm = new GuidanceManager()
    gm.setStep(4)

    assert.equal(gm.activeStep, 4)
    assert.equal(gm.stepGroups[4].visible, true)
    assert.equal(gm.stepGroups[4].name, 'GuidanceStep4_AddSalt')
    assert.ok(gm.saltCue, 'Step 4 includes salt shaker cue')
    assert.equal(gm.saltArcs.length, 4, 'Step 4 includes 4 seasoning sprinkle arcs')
  })

  test('Step 5 (Stir): contains animated circular stirring arrow indicator', () => {
    const gm = new GuidanceManager()
    gm.setStep(5)

    assert.equal(gm.activeStep, 5)
    assert.equal(gm.stepGroups[5].visible, true)
    assert.equal(gm.stepGroups[5].name, 'GuidanceStep5_Stir')
    assert.ok(gm.stirArrow, 'Step 5 includes circular stirring arrow')

    // Animate updates stirring arrow rotation
    const initialRot = gm.stirArrow.rotation.z
    gm.animate(1.0, 0.05)
    assert.notEqual(gm.stirArrow.rotation.z, initialRot, 'Stir arrow rotates during animation loop')
  })

  test('Step 6 (Cook): contains heat thermal wave rings and live timer countdown readout', () => {
    const gm = new GuidanceManager()
    gm.setStep(6, { timerSeconds: 60 })

    assert.equal(gm.activeStep, 6)
    assert.equal(gm.stepGroups[6].visible, true)
    assert.equal(gm.stepGroups[6].name, 'GuidanceStep6_Cook')
    assert.equal(gm.flameRings.length, 2, 'Step 6 includes simmering warmth flame rings')
    assert.ok(gm.step6TimerSprite, 'Step 6 includes integrated timer display billboard')

    // Timer update function works cleanly
    gm.updateStep6Timer(45)
    assert.equal(gm.timerSeconds, 60)
  })

  test('Step 7 (Serve): contains serving plate target and directional slide arrow', () => {
    const gm = new GuidanceManager()
    gm.setStep(7)

    assert.equal(gm.activeStep, 7)
    assert.equal(gm.stepGroups[7].visible, true)
    assert.equal(gm.stepGroups[7].name, 'GuidanceStep7_Serve')
    assert.ok(gm.serveArrow, 'Step 7 includes pan-to-plate slide arrow')
  })

  test('Forward Next & Backward Back sequence synchronizes guidance with 0 wrong-step leakage', () => {
    const gm = new GuidanceManager()

    // Walk forward 1 through 7
    for (let step = 1; step <= 7; step++) {
      gm.setStep(step)
      assert.equal(gm.activeStep, step)
      for (let s = 1; s <= 7; s++) {
        const expected = s === step
        assert.equal(
          gm.stepGroups[s].visible,
          expected,
          `Step ${s} visibility must be ${expected} when activeStep is ${step}`
        )
      }
      assert.equal(gm.completionGroup.visible, false)
    }

    // Walk backward 7 through 1
    for (let step = 7; step >= 1; step--) {
      gm.setStep(step)
      assert.equal(gm.activeStep, step)
      for (let s = 1; s <= 7; s++) {
        const expected = s === step
        assert.equal(
          gm.stepGroups[s].visible,
          expected,
          `Step ${s} visibility must be ${expected} when activeStep is ${step}`
        )
      }
    }
  })

  test('Recipe reset returns AR guidance cleanly to Step 1', () => {
    const gm = new GuidanceManager()
    gm.setStep(5)
    assert.equal(gm.activeStep, 5)

    // Reset to Step 1
    gm.setStep(1, { isCompleted: false })
    assert.equal(gm.activeStep, 1)
    assert.equal(gm.stepGroups[1].visible, true)
    assert.equal(gm.stepGroups[5].visible, false)
    assert.equal(gm.completionGroup.visible, false)
  })

  test('Recipe completion activates celebratory guidance and hides all 7 step groups', () => {
    const gm = new GuidanceManager()
    gm.setStep(7, { isCompleted: true })

    assert.equal(gm.isCompleted, true)
    assert.equal(gm.completionGroup.visible, true)

    for (let s = 1; s <= 7; s++) {
      assert.equal(gm.stepGroups[s].visible, false, `Step group ${s} must be hidden upon completion`)
    }

    // Animate completion star
    gm.animate(1.0, 0.016)
    assert.ok(gm.completionStar)
  })

  test('Dispose cleans up geometries and materials without throwing', () => {
    const gm = new GuidanceManager()
    assert.doesNotThrow(() => {
      gm.dispose()
    })
  })
})
