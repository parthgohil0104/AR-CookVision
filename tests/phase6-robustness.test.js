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
import React from 'react'
import { useStirDetection } from '../src/hooks/useStirDetection.js'
import { useHandTracking } from '../src/hooks/useHandTracking.js'

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

    test('Repeated rapid marker loss and reacquisition cycles maintain stable state and preserve active step', () => {
      const gm = new GuidanceManager()
      gm.setStep(5)

      // Simulate 50 rapid lost/found cycles without memory/resource leaks
      for (let i = 0; i < 50; i++) {
        gm.setTrackingActive(false)
        assert.equal(gm.isTrackingActive, false)
        assert.equal(gm.rootGroup.visible, false)

        gm.setTrackingActive(true)
        assert.equal(gm.isTrackingActive, true)
        assert.equal(gm.rootGroup.visible, true)
        assert.equal(gm.activeStep, 5)
        assert.equal(gm.stepGroups[5].visible, true)
      }

      // Root group should maintain strictly 9 children (1 boundary + 7 steps + 1 completion)
      assert.equal(gm.rootGroup.children.length, 9, 'Child groups must not duplicate across cycles')
      gm.dispose()
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

    test('Inference recovers seamlessly after transient exception once subsequent frames succeed', () => {
      const cvManager = new HandLandmarkerManager()
      let shouldThrow = true
      cvManager.handLandmarker = {
        detectForVideo: () => {
          if (shouldThrow) {
            throw new Error('Transient WebGL glitch')
          }
          return {
            landmarks: [[
              { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
              { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
              { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
              { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
              { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
              { x: 0.5, y: 0.5, z: 0 },
            ]],
            handedness: [[{ displayName: 'Right', score: 0.95 }]],
          }
        },
      }

      let lastResult = null
      cvManager.addListener((res) => {
        lastResult = res
      })

      const dummyVideo = { paused: false, ended: false, readyState: 4, videoWidth: 640, videoHeight: 480 }

      // Frame 1: throws
      cvManager.runInference(dummyVideo, 1000)
      assert.equal(lastResult.detected, false)
      assert.equal(cvManager.status, 'no-hand')

      // Frame 2: succeeds and seamlessly transitions back to tracking
      shouldThrow = false
      cvManager.runInference(dummyVideo, 1100)
      assert.equal(lastResult.detected, true)
      assert.equal(cvManager.status, 'tracking')
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

  // 12. STEP 5 STIR DETECTION & HAND CV SAFETY REGRESSION TESTS
  describe('12. Step 5 Stir Detection & Hand CV Safety', () => {
    function createHookRunner(hookFn, initialProps) {
      const stateSlots = []
      let stateIndex = 0
      const effectSlots = []
      let effectIndex = 0
      const refSlots = []
      let refIndex = 0
      let currentProps = initialProps
      let latestResult = null
      let isRendering = false

      const dispatcher = {
        useState(initial) {
          const idx = stateIndex++
          if (stateSlots.length <= idx) {
            stateSlots[idx] = typeof initial === 'function' ? initial() : initial
          }
          const setState = (updater) => {
            stateSlots[idx] = typeof updater === 'function' ? updater(stateSlots[idx]) : updater
            if (!isRendering) {
              render(currentProps)
            }
          }
          return [stateSlots[idx], setState]
        },
        useRef(initial) {
          const idx = refIndex++
          if (refSlots.length <= idx) {
            refSlots[idx] = { current: initial }
          }
          return refSlots[idx]
        },
        useEffect(effect, deps) {
          const idx = effectIndex++
          const prev = effectSlots[idx]
          let hasChanged = true
          if (prev && prev.deps && deps) {
            hasChanged = deps.some((d, i) => d !== prev.deps[i])
          }
          if (hasChanged) {
            if (prev && typeof prev.cleanup === 'function') {
              prev.cleanup()
            }
            const cleanup = effect()
            effectSlots[idx] = { deps, cleanup }
          }
        },
        useCallback(fn) {
          return fn
        },
      }

      function render(nextProps = currentProps) {
        currentProps = nextProps
        stateIndex = 0
        effectIndex = 0
        refIndex = 0
        isRendering = true
        const prevH = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = dispatcher
        try {
          latestResult = hookFn(currentProps)
        } finally {
          React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = prevH
          isRendering = false
        }
        return latestResult
      }

      function unmount() {
        for (const slot of effectSlots) {
          if (slot && typeof slot.cleanup === 'function') slot.cleanup()
        }
      }

      render(initialProps)
      return {
        render,
        get result() {
          return latestResult
        },
        unmount,
      }
    }

    const makeCircularFrame = (i, total = 40, radius = 0.12, center = { x: 0.5, y: 0.5 }) => {
      const angle = (i / total) * Math.PI * 3.0
      const x = center.x + Math.cos(angle) * radius
      const y = center.y + Math.sin(angle) * radius
      return {
        detected: true,
        handCount: 1,
        timestamp: 1000 + i * 60,
        landmarks: [[
          { x, y, z: 0 },
          { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
          { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
          { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
          { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 }, { x, y, z: 0 },
          { x, y, z: 0 },
        ]],
      }
    }

    test('Hand CV disabled cannot auto-advance Step 5 even with incoming frames', () => {
      let listener = null
      let completeCount = 0
      const harness = createHookRunner(useStirDetection, {
        isActive: true,
        enabled: false,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 50,
      })

      assert.equal(harness.result.stirState.isActive, false)
      assert.equal(harness.result.stirState.statusText, 'Hand CV disabled — use manual Next')

      // Feed 60 frames of apparent motion
      for (let i = 0; i <= 60; i++) {
        listener(makeCircularFrame(i))
      }

      assert.equal(completeCount, 0, 'Completion callback must never fire when Hand CV is disabled')
      assert.equal(harness.result.stirState.progress, 0)
      assert.equal(harness.result.stirState.isComplete, false)
      harness.unmount()
    })

    test('No valid stirring detection (stationary hand, empty frame, micro-sway tremor) cannot auto-advance Step 5', () => {
      const detector = new StirDetector({
        minSamples: 8,
        targetStirAngle: Math.PI * 3.5,
      })

      // A: 60 empty frames (no hands detected)
      for (let i = 0; i < 60; i++) {
        const emptyFrame = { detected: false, handCount: 0, landmarks: [], timestamp: 1000 + i * 60 }
        const res = detector.processFrame(emptyFrame)
        assert.equal(res.motion, MOTION_TYPES.NONE)
        assert.equal(res.progress, 0)
        assert.equal(res.isComplete, false)
      }

      // B: 60 stationary frames (still hand at center)
      for (let i = 0; i < 60; i++) {
        const stillFrame = {
          detected: true,
          handCount: 1,
          timestamp: 1000 + i * 60,
          landmarks: [[
            { x: 0.5, y: 0.5, z: 0 },
            { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
            { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
            { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
            { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
            { x: 0.5, y: 0.5, z: 0 },
          ]],
        }
        const res = detector.processFrame(stillFrame)
        assert.equal(res.progress, 0)
        assert.equal(res.isComplete, false)
      }

      // C: 150 frames of handheld iPhone camera micro-sway / tremor (radius 0.025, ~10 seconds)
      for (let i = 0; i < 150; i++) {
        const swayFrame = makeCircularFrame(i, 30, 0.025)
        const res = detector.processFrame(swayFrame)
        assert.notEqual(res.motion, MOTION_TYPES.STIR, 'Micro-sway must not be classified as STIR')
        assert.equal(res.progress, 0, 'Micro-sway must not accumulate progress')
        assert.equal(res.isComplete, false)
      }
    })

    test('Pending completion callback is cancelled immediately when Hand CV is disabled', async () => {
      let listener = null
      let completeCount = 0
      const harness = createHookRunner(useStirDetection, {
        isActive: true,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
        detectorOptions: { targetStirAngle: Math.PI * 2 },
      })

      // Complete stirring to trigger pending auto-advance timer
      for (let i = 0; i <= 40; i++) {
        listener(makeCircularFrame(i))
      }

      // Turn Hand CV off before autoAdvanceDelayMs expires
      harness.render({
        isActive: true,
        enabled: false,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completeCount, 0, 'Pending timer must be cancelled when Hand CV is disabled')
      harness.unmount()
    })

    test('Pending completion callback is cancelled immediately when Restart is pressed', async () => {
      let listener = null
      let completeCount = 0
      let currentStep = 5

      const harness = createHookRunner(useStirDetection, {
        isActive: currentStep === 5,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
        detectorOptions: { targetStirAngle: Math.PI * 2 },
      })

      // Complete stirring to trigger pending timer
      for (let i = 0; i <= 40; i++) {
        listener(makeCircularFrame(i))
      }

      // User presses Restart -> recipe resets to Step 1 -> Step 5 is no longer active
      currentStep = 1
      harness.render({
        isActive: currentStep === 5,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completeCount, 0, 'Pending timer must be cancelled when Restart resets recipe step')
      harness.unmount()
    })

    test('Pending completion callback is cancelled immediately when recipe step changes', async () => {
      let listener = null
      let completeCount = 0
      let currentStep = 5

      const harness = createHookRunner(useStirDetection, {
        isActive: currentStep === 5,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
        detectorOptions: { targetStirAngle: Math.PI * 2 },
      })

      // Complete stirring to trigger pending timer
      for (let i = 0; i <= 40; i++) {
        listener(makeCircularFrame(i))
      }

      // User manually navigates or back navigates to Step 4
      currentStep = 4
      harness.render({
        isActive: currentStep === 5,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completeCount, 0, 'Pending timer must be cancelled when step changes')
      harness.unmount()
    })

    test('Preserves intended automatic advance when Hand CV is enabled and valid stirring is detected', async () => {
      let listener = null
      let completeCount = 0

      const harness = createHookRunner(useStirDetection, {
        isActive: true,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 50,
        detectorOptions: { targetStirAngle: Math.PI * 2 },
      })

      // Feed circular motion frames with real stirring radius (0.12)
      for (let i = 0; i <= 40; i++) {
        listener(makeCircularFrame(i))
      }

      assert.equal(harness.result.stirState.isComplete, true)
      assert.equal(completeCount, 0, 'Should not advance before autoAdvanceDelayMs')

      // Wait for autoAdvanceDelayMs to elapse
      await new Promise((resolve) => setTimeout(resolve, 80))
      assert.equal(completeCount, 1, 'Auto-advance must fire exactly once after valid stirring')
      harness.unmount()
    })

    test('Preserves manual Next fallback at Step 5 when Hand CV is disabled', () => {
      let state = createInitialRecipeState(omeletteRecipe)
      // Navigate to Step 5
      for (let i = 1; i < 5; i++) {
        state = recipeReducer(state, { type: RECIPE_ACTIONS.COMPLETE_STEP, payload: { stepNumber: i } })
        state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      }
      assert.equal(state.currentStepNumber, 5)

      // Hand CV disabled -> user clicks "Mark Done" manually
      state = recipeReducer(state, {
        type: RECIPE_ACTIONS.COMPLETE_STEP,
        payload: { stepNumber: 5 },
      })
      assert.ok(state.completedSteps.includes(5))

      // User clicks "Next Step" to advance to Step 6
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
      assert.equal(state.currentStepNumber, 6)
      assert.equal(state.isCompleted, false)
    })

    test('Hand CV manager pause bypasses inference and does not execute detectForVideo', () => {
      const cvManager = new HandLandmarkerManager()
      let detectCalled = 0
      cvManager.handLandmarker = {
        detectForVideo: () => {
          detectCalled++
          return { landmarks: [] }
        },
      }

      const dummyVideo = { paused: false, ended: false, readyState: 4, videoWidth: 640, videoHeight: 480 }

      // Active
      cvManager.runInference(dummyVideo, 1000)
      assert.equal(detectCalled, 1)

      // Paused: inference loop and direct runInference must both be bypassed
      cvManager.pause()
      assert.equal(cvManager.isPaused, true)
      assert.equal(cvManager.getDiagnostics().isPaused, true)

      cvManager.runInference(dummyVideo, 1100)
      assert.equal(detectCalled, 1, 'detectForVideo must not be invoked when manager is paused')

      // Resumed: inference executes again
      cvManager.resume()
      assert.equal(cvManager.isPaused, false)
      cvManager.runInference(dummyVideo, 1200)
      assert.equal(detectCalled, 2, 'Inference resumes after resume()')
      cvManager.dispose()
    })

    test('useHandTracking hook returns disabled status and diagnostics when enabled is false', () => {
      const harness = createHookRunner(useHandTracking, {
        enabled: false,
        getVideoElement: () => null,
      })

      assert.equal(harness.result.cvStatus.status, 'disabled')
      assert.equal(harness.result.cvStatus.detected, false)
      assert.equal(harness.result.cvStatus.fps, 0)
      assert.equal(harness.result.cvStatus.inferenceTimeMs, 0)

      const diag = harness.result.getDiagnostics()
      assert.equal(diag.status, 'disabled')
      assert.equal(diag.detected, false)
      assert.equal(diag.fps, 0)
      harness.unmount()
    })

    test('Pending completion callback is cancelled immediately when hook unmounts', async () => {
      let listener = null
      let completeCount = 0

      const harness = createHookRunner(useStirDetection, {
        isActive: true,
        enabled: true,
        addHandResultListener: (fn) => {
          listener = fn
          return () => {}
        },
        onStirComplete: () => {
          completeCount++
        },
        autoAdvanceDelayMs: 100,
        detectorOptions: { targetStirAngle: Math.PI * 2 },
      })

      // Complete stirring to trigger pending timer
      for (let i = 0; i <= 40; i++) {
        listener(makeCircularFrame(i))
      }

      // Unmount hook before autoAdvanceDelayMs expires
      harness.unmount()

      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completeCount, 0, 'Pending timer must be cancelled when hook unmounts')
    })
  })
})
