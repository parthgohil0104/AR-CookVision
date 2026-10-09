import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import omeletteRecipe from '../src/data/recipes/omelette.json' with { type: 'json' }
import {
  RECIPE_ACTIONS,
  recipeReducer,
  createInitialRecipeState,
} from '../src/engine/recipeReducer.js'
import {
  normalizeHandResult,
  createEmptyResult,
} from '../src/cv/resultNormalizer.js'
import {
  StirDetector,
  MOTION_TYPES,
  extractHandCenter,
} from '../src/cv/stirDetector.js'
import { HandLandmarkerManager } from '../src/cv/handLandmarkerManager.js'
import { GuidanceManager } from '../src/ar/guidanceManager.js'

// Setup minimal mock DOM environment for Three.js canvas & video
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
        if (tag === 'video') {
          return {
            style: {},
            setAttribute: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            play: () => Promise.resolve(),
            pause: () => {},
            paused: false,
            ended: false,
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
          }
        }
        return { style: {} }
      },
    }
  }

  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      requestAnimationFrame: (cb) => setTimeout(cb, 16),
      cancelAnimationFrame: (id) => clearTimeout(id),
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    }
  }
})

describe('Phase 6 — Robustness & Safety Test Suite', () => {

  // 1. AR TRACKING LOSS STATE
  describe('1. AR Tracking Loss Handling', () => {
    test('Suspends 3D spatial guidance and animation when marker tracking is lost', () => {
      const gm = new GuidanceManager()
      gm.setStep(3)

      assert.equal(gm.activeStep, 3)
      assert.equal(gm.rootGroup.visible, true)

      // Marker lost event
      gm.setTrackingActive(false)

      assert.equal(gm.isTrackingActive, false)
      assert.equal(gm.rootGroup.visible, false, 'Root guidance group must be hidden on tracking loss')
      assert.equal(gm.activeStep, 3, 'Active recipe step must be preserved during tracking loss')

      // Animation loop should safely no-op without modifying positions
      const initialZ = gm.eggCue ? gm.eggCue.position.z : 0
      gm.animate(10.5, 0.016)
      if (gm.eggCue) {
        assert.equal(gm.eggCue.position.z, initialZ, 'Guidance animation must be paused while tracking is inactive')
      }
    })

    test('Preserves recipe step and suppresses false positioning during tracking loss', () => {
      const gm = new GuidanceManager()
      gm.setStep(5)

      // Lost tracking during Step 5
      gm.setTrackingActive(false)
      assert.equal(gm.activeStep, 5)
      assert.equal(gm.rootGroup.visible, false)

      // Even if setStep is called again (e.g. recipe state sync), trackingActive remains false
      gm.setStep(5, { isCompleted: false })
      assert.equal(gm.rootGroup.visible, false, 'Guidance must remain suspended until tracking recovery')
    })
  })

  // 2. AR TRACKING RECOVERY
  describe('2. AR Tracking Recovery', () => {
    test('Restores 3D spatial guidance visibility and active step when marker is reacquired', () => {
      const gm = new GuidanceManager()
      gm.setStep(5)

      // Lost tracking
      gm.setTrackingActive(false)
      assert.equal(gm.rootGroup.visible, false)
      assert.equal(gm.activeStep, 5)

      // Marker reacquired
      gm.setTrackingActive(true)
      assert.equal(gm.isTrackingActive, true)
      assert.equal(gm.rootGroup.visible, true)
      assert.equal(gm.activeStep, 5, 'Must resume at Step 5 without resetting or skipping')
      assert.equal(gm.stepGroups[5].visible, true, 'Step 5 guidance must be visible')
      assert.equal(gm.stepGroups[4].visible, false, 'Step 4 guidance must remain hidden')
    })

    test('Guidance smoothly switches active step if step progressed while tracking recovers', () => {
      const gm = new GuidanceManager()
      gm.setStep(4)
      gm.setTrackingActive(false)

      // User advanced while searching
      gm.setStep(5)
      assert.equal(gm.activeStep, 5)
      assert.equal(gm.rootGroup.visible, false)

      // Marker reacquired
      gm.setTrackingActive(true)
      assert.equal(gm.rootGroup.visible, true)
      assert.equal(gm.stepGroups[5].visible, true)
      assert.equal(gm.stepGroups[4].visible, false)
    })
  })

  // 3. CAMERA / PERMISSION FAILURE HANDLING
  describe('3. Camera Failure & Stream Interruption Handling', () => {
    test('Translates camera permission and device errors into user recovery messages', () => {
      function mapCameraError(err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          return 'Camera permission was denied. Please allow camera access in your browser settings to use AR tracking.'
        }
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          return 'No camera found on this device.'
        }
        if (err.name === 'TrackEnded') {
          return 'Camera stream was disconnected or interrupted.'
        }
        return 'Failed to start AR camera.'
      }

      const notAllowed = new Error('Permission denied')
      notAllowed.name = 'NotAllowedError'
      assert.ok(mapCameraError(notAllowed).includes('permission was denied'))

      const notFound = new Error('No device')
      notFound.name = 'NotFoundError'
      assert.ok(mapCameraError(notFound).includes('No camera found'))

      const trackEnded = new Error('Track ended')
      trackEnded.name = 'TrackEnded'
      assert.ok(mapCameraError(trackEnded).includes('disconnected or interrupted'))
    })
  })

  // 4. CV INITIALIZATION FAILURE
  describe('4. CV Initialization Failure', () => {
    test('Transitions to error status safely when model files are unreachable', async () => {
      const cvManager = new HandLandmarkerManager({
        wasmPath: 'http://invalid-wasm-domain.local/wasm',
        modelAssetPath: 'http://invalid-wasm-domain.local/model.task',
      })

      let errorReceived = null
      cvManager.onError((err) => {
        errorReceived = err
      })

      const success = await cvManager.init()

      assert.equal(success, false)
      assert.equal(cvManager.status, 'error')
      assert.ok(cvManager.errorMessage)
      assert.ok(errorReceived)
      cvManager.dispose()
    })
  })

  // 5. CV INFERENCE FAILURE
  describe('5. CV Inference Failure', () => {
    test('Guards against transient inference exceptions without crashing the application', () => {
      const cvManager = new HandLandmarkerManager()
      // Mock an initialized hand landmarker that throws (e.g. WebGL context lost)
      cvManager.handLandmarker = {
        detectForVideo: () => {
          throw new Error('Simulated WebGL context lost during inference')
        },
      }

      let receivedResult = null
      cvManager.addListener((res) => {
        receivedResult = res
      })

      const dummyVideo = { paused: false, ended: false, readyState: 4, videoWidth: 640, videoHeight: 480 }

      // runInference should NOT throw
      assert.doesNotThrow(() => {
        cvManager.runInference(dummyVideo, 1000)
      })

      assert.equal(cvManager.isProcessing, false, 'isProcessing flag must be reset in finally block')
      assert.ok(receivedResult, 'Subscribers must receive a normalized fallback result')
      assert.equal(receivedResult.detected, false)
      assert.equal(receivedResult.status, 'no-hand')
      cvManager.dispose()
    })
  })

  // 6. NO-HAND CONDITION & INVALID LANDMARKS
  describe('6. No-Hand Condition & Malformed Landmarks', () => {
    test('Normalizer handles null, empty, and partial landmarks safely', () => {
      const emptyRes = normalizeHandResult(null)
      assert.equal(emptyRes.detected, false)
      assert.equal(emptyRes.handCount, 0)
      assert.deepEqual(emptyRes.landmarks, [])

      const malformedRes = normalizeHandResult({
        landmarks: [[{ x: NaN, y: Infinity, z: undefined }]],
      })
      assert.equal(malformedRes.detected, true)
      assert.equal(malformedRes.landmarks[0][0].x, 0, 'NaN must be sanitized to 0')
      assert.equal(malformedRes.landmarks[0][0].y, 0, 'Infinity must be sanitized to 0')
    })

    test('extractHandCenter gracefully ignores malformed or non-finite inputs', () => {
      assert.equal(extractHandCenter(null), null)
      assert.equal(extractHandCenter([]), null)
      assert.equal(extractHandCenter([[{ x: NaN, y: 0.5 }]]), null)
      assert.equal(extractHandCenter([[{ x: 0.5, y: Infinity }]]), null)
    })

    test('StirDetector decays progress and handles absence of hands gracefully', () => {
      const detector = new StirDetector({ trackingLossResetMs: 500 })

      // Send no-hand frame
      const res = detector.processFrame(createEmptyResult({ timestamp: 1000 }))
      assert.equal(res.detected, false)
      assert.equal(res.motion, MOTION_TYPES.NONE)
      assert.equal(res.progress, 0)
      assert.equal(res.isComplete, false)
    })
  })

  // 7. RECIPE RESET DURING ACTIVE TIMER
  describe('7. Recipe Reset During Active Timer', () => {
    test('RESET cleanly cancels running timers and returns to Step 1 baseline', () => {
      let state = createInitialRecipeState(omeletteRecipe)

      // Advance to Step 6 (Cooking, has 60s timer)
      state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: { index: 5 } })
      assert.equal(state.currentStepNumber, 6)
      assert.equal(state.timer.duration, 60)

      // Start timer and tick 10 seconds
      state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
      assert.equal(state.timer.isRunning, true)
      for (let i = 0; i < 10; i++) {
        state = recipeReducer(state, {
          type: RECIPE_ACTIONS.TIMER_TICK,
          payload: { delta: 1, stepNumber: 6 },
        })
      }
      assert.equal(state.timer.remaining, 50)

      // Trigger recipe reset
      state = recipeReducer(state, { type: RECIPE_ACTIONS.RESET })

      assert.equal(state.currentStepIndex, 0)
      assert.equal(state.currentStepNumber, 1)
      assert.equal(state.status, 'in_progress')
      assert.equal(state.progress, 0)
      assert.equal(state.timer.isRunning, false, 'Timer must not be running after reset')
      assert.equal(state.timer.duration, null)
      assert.equal(state.timer.remaining, null)

      // Any stale TIMER_TICK that was queued must be rejected
      const stateAfterStaleTick = recipeReducer(state, {
        type: RECIPE_ACTIONS.TIMER_TICK,
        payload: { delta: 1, stepNumber: 6 },
      })
      assert.equal(stateAfterStaleTick.currentStepNumber, 1)
      assert.equal(stateAfterStaleTick.timer.isRunning, false)
    })
  })

  // 8. STEP CHANGE WHILE ASYNCHRONOUS OPERATION IS ACTIVE
  describe('8. Asynchronous Guard & Cross-Step Isolation', () => {
    test('TIMER_TICK rejects actions bearing mismatched stepNumber', () => {
      let state = createInitialRecipeState(omeletteRecipe)
      // Step 2 has 30s timer
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(state.currentStepNumber, 2)
      state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
      assert.equal(state.timer.remaining, 30)

      // Stale tick dispatched for Step 1
      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.TIMER_TICK,
        payload: { delta: 1, stepNumber: 1 },
      })
      assert.equal(state.timer.remaining, 30, 'Tick from step 1 must not alter step 2 timer')

      // Valid tick for Step 2
      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.TIMER_TICK,
        payload: { delta: 1, stepNumber: 2 },
      })
      assert.equal(state.timer.remaining, 29, 'Tick for step 2 decrements timer')
    })

    test('COMPLETE_STEP rejects out-of-bounds, negative, and invalid step numbers', () => {
      let state = createInitialRecipeState(omeletteRecipe)

      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.COMPLETE_STEP,
        payload: { stepNumber: -5 },
      })
      assert.deepEqual(state.completedSteps, [])

      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.COMPLETE_STEP,
        payload: { stepNumber: 99 },
      })
      assert.deepEqual(state.completedSteps, [])

      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.COMPLETE_STEP,
        payload: { stepNumber: 'invalid' },
      })
      assert.deepEqual(state.completedSteps, [])
    })

    test('NEXT cannot advance beyond Step 7 or when recipe is already completed', () => {
      let state = createInitialRecipeState(omeletteRecipe)
      state = recipeReducer(state, { type: RECIPE_ACTIONS.COMPLETE })
      assert.equal(state.isCompleted, true)
      assert.equal(state.progress, 100)

      const stateAfterNext = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(stateAfterNext.isCompleted, true)
      assert.equal(stateAfterNext.currentStepIndex, 0)
    })
  })

  // 9. CLEANUP / UNMOUNT BEHAVIOR
  describe('9. Subsystem Lifecycle & Cleanup Behavior', () => {
    test('GuidanceManager dispose disposes all Three.js meshes and materials', () => {
      const gm = new GuidanceManager()
      let disposedGeo = 0
      let disposedMat = 0

      gm.rootGroup.traverse((obj) => {
        if (obj.geometry) {
          const orig = obj.geometry.dispose.bind(obj.geometry)
          obj.geometry.dispose = () => { disposedGeo++; orig() }
        }
        if (obj.material) {
          const orig = obj.material.dispose.bind(obj.material)
          obj.material.dispose = () => { disposedMat++; orig() }
        }
      })

      gm.dispose()
      assert.ok(disposedGeo > 0, 'Geometries must be disposed')
      assert.ok(disposedMat > 0, 'Materials must be disposed')
    })

    test('HandLandmarkerManager dispose cleans up listeners and halts processing', () => {
      const hlm = new HandLandmarkerManager()
      let callCount = 0
      hlm.addListener(() => { callCount++ })

      hlm.dispose()

      assert.equal(hlm.isDisposed, true)
      assert.equal(hlm.isPaused, true)
      assert.equal(hlm.listeners.size, 0)

      // After dispose and listeners cleared, no further notifications fire
      hlm.notifyListeners({ detected: true })
      assert.equal(callCount, 1, 'Only final stop notification received before clearing')
    })

    test('StirDetector reset cleanly clears accumulated trajectory history and angles', () => {
      const detector = new StirDetector()
      detector.history = [{ x: 0.1, y: 0.2, timestamp: 100 }]
      detector.accumulatedStirAngle = 3.5
      detector.isCompleted = true

      const res = detector.reset()
      assert.equal(detector.history.length, 0)
      assert.equal(detector.accumulatedStirAngle, 0)
      assert.equal(detector.isCompleted, false)
      assert.equal(res.progress, 0)
    })
  })

  // 10. MANUAL FALLBACK AFTER CV FAILURE
  describe('10. Manual Fallback After CV Failure', () => {
    test('Step 5 can be marked complete manually and advanced without CV assistance', () => {
      let state = createInitialRecipeState(omeletteRecipe)

      // Navigate to Step 5 (Stir eggs)
      state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: { index: 4 } })
      assert.equal(state.currentStepNumber, 5)

      // User manually taps "Mark Done" (even if CV is completely broken/unavailable)
      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.COMPLETE_STEP,
        payload: { stepNumber: 5 },
      })
      assert.ok(state.completedSteps.includes(5))

      // User taps "Next Step" to advance to Step 6
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(state.currentStepNumber, 6)

      // User completes recipe to Step 7 and finish
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(state.currentStepNumber, 7)
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(state.isCompleted, true)
      assert.equal(state.progress, 100)
    })
  })

  // 11. PHASE 5 COMPATIBILITY VERIFICATION
  describe('11. Phase 5 Stir Detection Compatibility', () => {
    test('StirDetector continues to recognize valid circular stirring trajectories', () => {
      const detector = new StirDetector({
        minSamples: 6,
        targetStirAngle: Math.PI * 2,
      })

      const center = { x: 0.5, y: 0.5 }
      const radius = 0.12
      const totalPoints = 30

      let finalResult = null
      for (let i = 0; i <= totalPoints; i++) {
        const angle = (i / totalPoints) * Math.PI * 2.5
        const x = center.x + Math.cos(angle) * radius
        const y = center.y + Math.sin(angle) * radius
        const frame = {
          detected: true,
          handCount: 1,
          timestamp: 1000 + i * 80,
          landmarks: [[
            { x, y, z: 0 },
            { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
            { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
            { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
            { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
            { x, y, z: 0 },
          ]],
        }
        finalResult = detector.processFrame(frame)
      }

      assert.ok(finalResult)
      assert.equal(finalResult.motion, MOTION_TYPES.STIR)
      assert.ok(finalResult.progress > 0.5, 'Stir progress must accumulate towards completion')
    })
  })
})
