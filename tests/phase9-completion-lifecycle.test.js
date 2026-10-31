import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'
import omeletteRecipe from '../src/data/recipes/omelette.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const tempCompiledPath = path.join(__dirname, '.temp-Phase9-RecipeHUD.js')
const tempARPath = path.join(__dirname, '.temp-Phase9-ARManager.js')

let RecipeHUD = null
let ARManager = null

before(async () => {
  // Transpile RecipeHUD
  const hudPath = path.join(projectRoot, 'src', 'components', 'hud', 'RecipeHUD.jsx')
  const rawCode = fs.readFileSync(hudPath, 'utf-8')
  const codeWithoutCss = rawCode.replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  const transformedHud = await transformWithOxc(codeWithoutCss, 'RecipeHUD.jsx')
  fs.writeFileSync(tempCompiledPath, transformedHud.code, 'utf-8')
  const mod = await import(pathToFileURL(tempCompiledPath).href)
  RecipeHUD = mod.RecipeHUD

  // Transpile ARManager with stubbed MindARThree for headless Node test environment
  const arManagerPath = path.join(projectRoot, 'src', 'ar', 'arManager.js')
  let arCode = fs.readFileSync(arManagerPath, 'utf-8')
  arCode = arCode.replace(
    /import\s+\{\s*MindARThree\s*\}\s+from\s+['"][^'"]+['"];?/,
    'const MindARThree = class {};'
  )
  arCode = arCode.replace(
    /import\s+\*\s+as\s+THREE\s+from\s+['"]three['"];?/,
    "import * as THREE from '../src/ar/three-compat.js';"
  )
  arCode = arCode.replace(
    "from './guidanceManager.js'",
    "from '../src/ar/guidanceManager.js'"
  )
  const transformedAR = await transformWithOxc(arCode, 'arManager.js')
  fs.writeFileSync(tempARPath, transformedAR.code, 'utf-8')
  const arMod = await import(pathToFileURL(tempARPath).href)
  ARManager = arMod.ARManager
})

after(() => {
  try {
    if (fs.existsSync(tempCompiledPath)) {
      fs.unlinkSync(tempCompiledPath)
    }
  } catch {}
  try {
    if (fs.existsSync(tempARPath)) {
      fs.unlinkSync(tempARPath)
    }
  } catch {}
})

function createMockRecipeEngine(overrides = {}) {
  const currentStepNumber = overrides.currentStepNumber || 1
  const currentStepIndex = currentStepNumber - 1
  const steps = omeletteRecipe.steps
  const currentStep = steps[currentStepIndex] || steps[0]

  return {
    steps,
    totalSteps: steps.length,
    currentStepIndex,
    currentStepNumber,
    currentStep,
    completedSteps: overrides.completedSteps || [],
    progress: overrides.progress ?? Math.round((currentStepIndex / steps.length) * 100),
    timer: overrides.timer || {
      isRunning: false,
      isFinished: false,
      remaining: currentStep.timerSeconds || 0,
      duration: currentStep.timerSeconds || 0,
    },
    formattedTime: overrides.formattedTime || (currentStep.timerSeconds ? '00:30' : '00:00'),
    isCompleted: overrides.isCompleted || false,
    isFirstStep: currentStepNumber === 1,
    isLastStep: currentStepNumber === steps.length,
    hasTimer: overrides.hasTimer !== undefined ? overrides.hasTimer : !!currentStep.timerSeconds,
    nextStep: () => {},
    prevStep: () => {},
    completeStep: () => {},
    startTimer: () => {},
    pauseTimer: () => {},
    resetTimer: () => {},
    resetRecipe: () => {},
    goToStep: () => {},
    ...overrides,
  }
}

describe('Phase 9 — Recipe Completion Screen & Resource Lifecycle', () => {
  describe('Objective A: Recipe Completion Screen', () => {
    test('1. Completion overlay renders when recipeEngine.isCompleted is true', () => {
      assert.ok(RecipeHUD, 'RecipeHUD component must be compiled')
      const recipeEngine = createMockRecipeEngine({
        currentStepNumber: 7,
        isCompleted: true,
        progress: 100,
        completedSteps: [1, 2, 3, 4, 5, 6, 7],
      })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, {
          recipeEngine,
          onMarkerHelp: () => {},
          onHome: () => {},
        })
      )

      assert.ok(html.includes('id="recipe-completed-modal"'), 'Must render #recipe-completed-modal')
      assert.ok(html.includes('recipe-completion-overlay'), 'Must include overlay container')
      assert.ok(html.includes('Recipe Complete!'), 'Must display "Recipe Complete!" success title')
      assert.ok(html.includes('id="btn-go-home"'), 'Must provide prominent #btn-go-home button')
      assert.ok(html.includes('Go Home'), 'Go Home button text must be present')
      assert.ok(html.includes('id="btn-cook-again"'), 'Must preserve #btn-cook-again')
      assert.ok(html.includes('id="btn-review-steps"'), 'Must preserve #btn-review-steps')
    })

    test('2. Completion overlay DOES NOT render prematurely when earlier steps are done', () => {
      // Step 3 is completed, but total recipe is not finished
      const recipeEngine = createMockRecipeEngine({
        currentStepNumber: 4,
        isCompleted: false,
        progress: 57,
        completedSteps: [1, 2, 3],
      })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, {
          recipeEngine,
          onMarkerHelp: () => {},
          onHome: () => {},
        })
      )

      assert.ok(!html.includes('id="recipe-completed-modal"'), 'Must NOT render completion modal during step 4')
      assert.ok(!html.includes('Recipe Complete!'), 'Must NOT display completion title prematurely')
      assert.ok(!html.includes('id="btn-go-home"'), 'Must NOT display Go Home button prematurely')
    })

    test('3. Completion overlay DOES NOT render on final step before step completion', () => {
      // Final step (Step 7) is active, but user has not finished it yet
      const recipeEngine = createMockRecipeEngine({
        currentStepNumber: 7,
        isCompleted: false,
        progress: 86,
        completedSteps: [1, 2, 3, 4, 5, 6],
      })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, {
          recipeEngine,
          onMarkerHelp: () => {},
          onHome: () => {},
        })
      )

      assert.ok(!html.includes('id="recipe-completed-modal"'), 'Must NOT render modal on Step 7 before completion')
      assert.ok(html.includes('Finish Omelette'), 'Action button must display finish CTA instead of completed modal')
    })

    test('4. Root recipe-hud container receives is-completed class when completed', () => {
      const completedEngine = createMockRecipeEngine({
        currentStepNumber: 7,
        isCompleted: true,
      })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, {
          recipeEngine: completedEngine,
          onMarkerHelp: () => {},
        })
      )

      assert.ok(html.includes('class="recipe-hud is-collapsed is-completed"'), 'Root element must have is-completed class')
    })

    test('5. CSS contract: overlay has z-index: 1000 and pointer-events: auto', () => {
      const hudCss = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'hud', 'RecipeHUD.css'), 'utf-8')
      assert.ok(
        hudCss.includes('z-index: 1000;'),
        'RecipeHUD.css must set z-index: 1000 for full completion overlay'
      )
      assert.ok(
        hudCss.includes('pointer-events: auto;'),
        'RecipeHUD.css must set pointer-events: auto on overlay'
      )
    })

    test('6. CSS contract: CookingScreen untraps bottom HUD when is-completed', () => {
      const cookingCss = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'CookingScreen.css'), 'utf-8')
      assert.ok(
        cookingCss.includes('.cooking-screen__hud-bottom.is-completed'),
        'CookingScreen.css must define .cooking-screen__hud-bottom.is-completed'
      )
      assert.ok(
        cookingCss.includes('transform: none !important;'),
        'CookingScreen.css must clear transform so fixed completion overlay is not trapped'
      )
      assert.ok(
        cookingCss.includes('inset: 0 !important;'),
        'CookingScreen.css must expand container across full viewport'
      )
    })
  })

  describe('Objective B: Safe Exit to Home & Resource Lifecycle', () => {
    test('7. ARManager.stop() explicitly stops all MediaStream video tracks and clears srcObject', () => {
      const manager = new ARManager()
      let trackStopped = false
      let videoPaused = false

      const mockTrack = {
        stop: () => {
          trackStopped = true
        },
      }

      const mockStream = {
        getTracks: () => [mockTrack],
      }

      const mockVideo = {
        srcObject: mockStream,
        pause: () => {
          videoPaused = true
        },
        remove: () => {},
      }

      // Populate manager mock video
      manager.video = mockVideo
      manager.isStarted = true

      manager.stop()

      assert.equal(trackStopped, true, 'All MediaStream tracks must have stop() invoked')
      assert.equal(manager.video.srcObject, null, 'video.srcObject must be cleared to null')
      assert.equal(videoPaused, true, 'video.pause() must be called')
      assert.equal(manager.isStarted, false, 'isStarted must be reset to false')
    })

    test('8. ARManager.stop() is idempotent and handles multiple calls safely', () => {
      const manager = new ARManager()
      let trackStopCount = 0

      const mockTrack = {
        stop: () => {
          trackStopCount++
        },
      }

      manager.video = {
        srcObject: {
          getTracks: () => [mockTrack],
        },
        pause: () => {},
        remove: () => {},
      }
      manager.isStarted = true

      // Call stop multiple times consecutively
      manager.stop()
      manager.stop()
      manager.stop()

      assert.equal(trackStopCount, 1, 'Track.stop() should only be called once across repeated stop() invocations')
      assert.equal(manager.isStarted, false, 'isStarted must remain false')
    })

    test('9. ARManager.stop() cleans up Three.js scene, renderer, and guidance manager', () => {
      const manager = new ARManager()

      let guidanceDisposed = false
      let rendererDisposed = false
      let contextLost = false
      let geometryDisposed = false
      let materialDisposed = false

      manager.guidanceManager = {
        dispose: () => {
          guidanceDisposed = true
        },
      }

      const mockMesh = {
        isMesh: true,
        geometry: {
          dispose: () => {
            geometryDisposed = true
          },
        },
        material: {
          dispose: () => {
            materialDisposed = true
          },
        },
      }

      manager.scene = {
        traverse: (callback) => {
          callback(mockMesh)
        },
        remove: () => {},
      }

      let animationLoopStopped = false
      manager.renderer = {
        setAnimationLoop: (val) => {
          if (val === null) animationLoopStopped = true
        },
        dispose: () => {
          rendererDisposed = true
        },
        forceContextLoss: () => {
          contextLost = true
        },
      }

      manager.isStarted = true
      manager.stop()

      assert.equal(animationLoopStopped, true, 'Animation loop must be stopped with null')
      assert.equal(guidanceDisposed, true, 'GuidanceManager must be disposed')
      assert.equal(geometryDisposed, true, 'Three.js geometries must be disposed')
      assert.equal(materialDisposed, true, 'Three.js materials must be disposed')
      assert.equal(rendererDisposed, true, 'WebGLRenderer must be disposed')
      assert.equal(contextLost, true, 'forceContextLoss() should be called to free GPU memory')
      assert.equal(manager.renderer, null, 'renderer reference must be nulled')
      assert.equal(manager.scene, null, 'scene reference must be nulled')
    })

    test('10. CookingScreen handleBack is protected by isCleaningUpRef against duplicate triggers', () => {
      const cookingScreenCode = fs.readFileSync(
        path.join(projectRoot, 'src', 'components', 'CookingScreen.jsx'),
        'utf-8'
      )

      assert.ok(
        cookingScreenCode.includes('isCleaningUpRef'),
        'CookingScreen must have isCleaningUpRef to guard cleanup'
      )
      assert.ok(
        cookingScreenCode.includes('if (isCleaningUpRef.current) return'),
        'handleBack must guard against duplicate cleanup calls'
      )
      assert.ok(
        cookingScreenCode.includes('onHome={handleBack}'),
        'RecipeHUD must receive handleBack as onHome prop'
      )
    })
  })
})
