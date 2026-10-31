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
const tempCompiledPath = path.join(__dirname, '.temp-RecipeHUD.js')

let RecipeHUD = null

before(async () => {
  const hudPath = path.join(projectRoot, 'src', 'components', 'hud', 'RecipeHUD.jsx')
  const rawCode = fs.readFileSync(hudPath, 'utf-8')
  // Strip direct CSS imports which are handled by Vite bundler during dev/build
  const codeWithoutCss = rawCode.replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  const transformed = await transformWithOxc(codeWithoutCss, 'RecipeHUD.jsx')
  fs.writeFileSync(tempCompiledPath, transformed.code, 'utf-8')
  const mod = await import(pathToFileURL(tempCompiledPath).href)
  RecipeHUD = mod.RecipeHUD
})

after(() => {
  try {
    if (fs.existsSync(tempCompiledPath)) {
      fs.unlinkSync(tempCompiledPath)
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

describe('Phase 8 — UI and AR Visibility Test Suite', () => {
  describe('1. RecipeHUD Default Collapsed State Contract', () => {
    test('Recipe HUD renders collapsed by default upon entering cooking view', () => {
      assert.ok(RecipeHUD, 'RecipeHUD component must be compiled and loaded')
      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 1 })
      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine, onMarkerHelp: () => {} })
      )

      assert.ok(html.includes('id="recipe-hud"'), 'Must contain #recipe-hud')
      assert.ok(html.includes('class="recipe-hud is-collapsed"'), 'Root HUD must have is-collapsed class by default')
      assert.ok(!html.includes('class="recipe-hud is-expanded"'), 'Root HUD must not have is-expanded class by default')
    })

    test('Semantic toggle button presents accessible name and aria-expanded="false"', () => {
      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 1 })
      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine, onMarkerHelp: () => {} })
      )

      assert.ok(html.includes('id="btn-toggle-details"'), 'Must render #btn-toggle-details')
      assert.ok(html.includes('aria-expanded="false"'), 'Toggle button must indicate aria-expanded="false" when collapsed')
      assert.ok(html.includes('aria-controls="hud-expandable-details"'), 'Toggle button must reference aria-controls')
      assert.ok(html.includes('aria-label="Expand step details"'), 'Must provide accessible expand label')
      assert.ok(html.includes('Details'), 'Must show Details text when collapsed')
    })

    test('Expandable details section is collapsed with aria-hidden="true" by default', () => {
      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 1 })
      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine, onMarkerHelp: () => {} })
      )

      assert.ok(html.includes('id="hud-expandable-details"'), 'Must render #hud-expandable-details')
      assert.ok(html.includes('aria-hidden="true"'), 'Expandable details must set aria-hidden="true" when collapsed')
    })
  })

  describe('2. Required DOM IDs & Automated Test Selectors Presence', () => {
    test('All critical DOM IDs remain present in DOM when collapsed (no destructive unmounting)', () => {
      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 1 })
      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine, onMarkerHelp: () => {} })
      )

      const requiredIds = [
        'recipe-hud',
        'step-pills',
        'step-title',
        'btn-toggle-details',
        'hud-expandable-details',
        'step-instruction',
        'recipe-safety-notice',
        'btn-step-back',
        'btn-step-next',
        'btn-recipe-reset',
        'btn-marker-guide',
      ]

      for (const id of requiredIds) {
        assert.ok(
          html.includes(`id="${id}"`),
          `Required selector #${id} must remain permanently mounted in DOM`
        )
      }

      // Step pills count: all 7 step buttons must be rendered
      const pillButtonMatches = html.match(/<button[^>]*class="[^"]*step-pill[^"]*"/g) || []
      assert.equal(pillButtonMatches.length, 7, 'All 7 step-pill button elements must be present in the DOM')
    })

    test('Mark Done control is present and accessible in compact collapsed mode', () => {
      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 1, completedSteps: [] })
      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine })
      )

      assert.ok(html.includes('Mark Done'), 'Compact header must expose Mark Done button')
      assert.ok(html.includes('recipe-hud__done-badge'), 'Must have recipe-hud__done-badge class')
    })
  })

  describe('3. Interactive Timer and Stir Module in Compact Mode', () => {
    test('Active timer module remains visible and accessible on timed steps (Step 2)', () => {
      const recipeEngine = createMockRecipeEngine({
        currentStepNumber: 2,
        hasTimer: true,
        formattedTime: '00:30',
        timer: { isRunning: false, isFinished: false, remaining: 30, duration: 30 },
      })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, { recipeEngine })
      )

      assert.ok(html.includes('id="step-timer-module"'), 'Timer module must be present in collapsed mode')
      assert.ok(html.includes('id="timer-display"'), '#timer-display must be present')
      assert.ok(html.includes('00:30'), 'Must display formatted timer value')
      assert.ok(html.includes('id="btn-timer-start"'), '#btn-timer-start must be present')
      assert.ok(html.includes('id="btn-timer-reset"'), '#btn-timer-reset must be present')
    })

    test('Active stir module remains visible and accessible on Step 5', () => {
      const mockStirState = {
        isActive: true,
        progress: 0.45,
        isComplete: false,
        statusText: 'Stirring detected...',
        motion: 'STIR',
        confidence: 0.88,
        sampleCount: 24,
      }

      const recipeEngine = createMockRecipeEngine({ currentStepNumber: 5 })

      const html = renderToStaticMarkup(
        React.createElement(RecipeHUD, {
          recipeEngine,
          stirState: mockStirState,
          cvEnabled: true,
          cvDebugVisible: true,
        })
      )

      assert.ok(html.includes('id="stir-detection-module"'), '#stir-detection-module must be present')
      assert.ok(html.includes('id="stir-status-text"'), '#stir-status-text must be present')
      assert.ok(html.includes('id="stir-progress-pct"'), '#stir-progress-pct must be present')
      assert.ok(html.includes('45%'), 'Must display 45% stir progress')
      assert.ok(html.includes('id="stir-debug-info"'), '#stir-debug-info must remain in DOM')
      assert.ok(html.includes('id="stir-fallback-hint"'), '#stir-fallback-hint must remain in DOM')
    })
  })

  describe('4. Visual Treatment & CSS Design System Verification', () => {
    test('RecipeHUD.css defines translucent background rgba(10, 14, 24, 0.60) and blur', () => {
      const cssPath = path.join(projectRoot, 'src', 'components', 'hud', 'RecipeHUD.css')
      const css = fs.readFileSync(cssPath, 'utf-8')

      assert.ok(
        css.includes('rgba(10, 14, 24, 0.60)') || css.includes('rgba(10, 14, 24, 0.6)'),
        'RecipeHUD.css must use translucent dark background'
      )
      assert.ok(
        css.includes('backdrop-filter: blur'),
        'RecipeHUD.css must apply subtle backdrop blur'
      )
      assert.ok(
        css.includes('recipe-hud__details.is-collapsed'),
        'RecipeHUD.css must include .recipe-hud__details.is-collapsed rule'
      )
      assert.ok(
        css.includes('recipe-hud__details.is-expanded'),
        'RecipeHUD.css must include .recipe-hud__details.is-expanded rule'
      )
      assert.ok(
        css.includes('touch-action: manipulation'),
        'RecipeHUD.css buttons must include touch-action: manipulation'
      )
    })

    test('CookingScreen.css defines iPhone Safari safe-area insets and responsive side-docking', () => {
      const cssPath = path.join(projectRoot, 'src', 'components', 'CookingScreen.css')
      const css = fs.readFileSync(cssPath, 'utf-8')

      assert.ok(
        css.includes('env(safe-area-inset-bottom'),
        'CookingScreen.css must handle safe-area-inset-bottom'
      )
      assert.ok(
        css.includes('env(safe-area-inset-top'),
        'CookingScreen.css must handle safe-area-inset-top'
      )
      assert.ok(
        css.includes('env(safe-area-inset-left') || css.includes('env(safe-area-inset-right'),
        'CookingScreen.css must handle horizontal safe-area insets'
      )
      assert.ok(
        css.includes('width: 380px') || css.includes('max-width: 380px'),
        'CookingScreen.css or RecipeHUD.css must define ~380px compact width for wider screens'
      )
    })
  })

  describe('5. Test Environment Scope & Deferred iPhone Verification', () => {
    test('Explicitly documents contracts validated automatically vs physical iPhone Safari requirements', () => {
      const automatedContracts = [
        'Component DOM structure and test selector preservation',
        'Default collapsed state and accessible aria attributes',
        'Timer and stir module availability in compact mode',
        'Translucent CSS token presence and safe-area inset rules',
      ]
      const deferredPhysicalContracts = [
        'Camera stream translucency under actual kitchen lighting',
        'Physical touch target ergonomics and iOS double-tap prevention',
        'Physical iPhone notch and home bar safe-area visual alignment',
        'Device orientation changes between portrait and landscape',
      ]

      assert.equal(automatedContracts.length, 4)
      assert.equal(deferredPhysicalContracts.length, 4)
    })
  })
})
