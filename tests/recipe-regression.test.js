/**
 * Recipe Regression Tests — AR-CookVision Phase 7
 *
 * Validates recipe schema integrity, JSON contract requirements,
 * and state machine edge cases (immutability, bounds, timer clamping, idempotency).
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import omeletteRecipe from '../src/data/recipes/omelette.json' with { type: 'json' }
import {
  RECIPE_ACTIONS,
  recipeReducer,
  createInitialRecipeState,
  calculateProgress,
} from '../src/engine/recipeReducer.js'

describe('Recipe Regression — Schema & Contract Validation', () => {
  test('Omelette recipe metadata contains required fields and valid types', () => {
    assert.equal(typeof omeletteRecipe.id, 'string')
    assert.ok(omeletteRecipe.id.length > 0)
    assert.equal(typeof omeletteRecipe.title, 'string')
    assert.ok(omeletteRecipe.title.length > 0)
    assert.equal(typeof omeletteRecipe.description, 'string')
    assert.equal(typeof omeletteRecipe.servings, 'number')
    assert.ok(omeletteRecipe.servings > 0)
    assert.equal(typeof omeletteRecipe.prepTime, 'string')
    assert.equal(typeof omeletteRecipe.cookTime, 'string')
    assert.equal(typeof omeletteRecipe.totalTime, 'string')
    assert.equal(typeof omeletteRecipe.difficulty, 'string')

    // Nutrition
    assert.ok(omeletteRecipe.nutrition)
    assert.equal(typeof omeletteRecipe.nutrition.calories, 'string')
    assert.equal(typeof omeletteRecipe.nutrition.protein, 'string')
    assert.equal(typeof omeletteRecipe.nutrition.fat, 'string')
    assert.equal(typeof omeletteRecipe.nutrition.carbs, 'string')
  })

  test('Omelette recipe ingredients and equipment meet integrity requirements', () => {
    assert.ok(Array.isArray(omeletteRecipe.ingredients))
    assert.ok(omeletteRecipe.ingredients.length >= 3)
    for (const ing of omeletteRecipe.ingredients) {
      assert.equal(typeof ing.id, 'string')
      assert.equal(typeof ing.name, 'string')
      assert.equal(typeof ing.amount, 'string')
      assert.equal(typeof ing.unit, 'string')
    }

    assert.ok(Array.isArray(omeletteRecipe.equipment))
    assert.ok(omeletteRecipe.equipment.length >= 2)
    for (const eq of omeletteRecipe.equipment) {
      assert.equal(typeof eq, 'string')
      assert.ok(eq.length > 0)
    }
  })

  test('Omelette recipe steps contain exactly 7 sequential steps with valid contracts', () => {
    assert.ok(Array.isArray(omeletteRecipe.steps))
    assert.equal(omeletteRecipe.steps.length, 7)

    const stepIds = new Set()
    omeletteRecipe.steps.forEach((step, idx) => {
      const expectedNumber = idx + 1
      assert.equal(step.stepNumber, expectedNumber, `Step at index ${idx} must have stepNumber ${expectedNumber}`)
      assert.equal(typeof step.id, 'string')
      assert.ok(step.id.length > 0)
      assert.ok(!stepIds.has(step.id), `Step id '${step.id}' must be unique`)
      stepIds.add(step.id)

      assert.equal(typeof step.title, 'string')
      assert.ok(step.title.length > 0)
      assert.equal(typeof step.instruction, 'string')
      assert.ok(step.instruction.length > 0)
      assert.equal(typeof step.requiredAction, 'string')
      assert.equal(typeof step.icon, 'string')

      if (step.timerSeconds !== null) {
        assert.equal(typeof step.timerSeconds, 'number')
        assert.ok(step.timerSeconds > 0)
      }
    })
  })

  test('Step 5 strictly matches CV stir detection contract', () => {
    const step5 = omeletteRecipe.steps[4]
    assert.equal(step5.stepNumber, 5)
    assert.equal(step5.id, 'stir')
    assert.equal(step5.title, 'Stir')
    assert.equal(step5.timerSeconds, 45)
    assert.ok(step5.requiredAction.toLowerCase().includes('stir'))
  })
})

describe('Recipe Regression — State Machine Robustness & Edge Cases', () => {
  test('Reducer returns identical state reference on unknown action type', () => {
    const state = createInitialRecipeState(omeletteRecipe)
    const nextState = recipeReducer(state, { type: 'UNKNOWN_ACTION_XYZ' })
    assert.strictEqual(state, nextState, 'State reference must remain identical when action is unhandled')
  })

  test('Reducer gracefully handles missing or empty action object', () => {
    const state = createInitialRecipeState(omeletteRecipe)
    const nextState = recipeReducer(state, {})
    assert.strictEqual(state, nextState)
  })

  test('State immutability: transitions return new state object without mutating previous state', () => {
    const state0 = createInitialRecipeState(omeletteRecipe)
    const state1 = recipeReducer(state0, { type: RECIPE_ACTIONS.NEXT })

    assert.notStrictEqual(state0, state1)
    assert.equal(state0.currentStepIndex, 0)
    assert.equal(state1.currentStepIndex, 1)
    assert.deepEqual(state0.completedSteps, [])
    assert.deepEqual(state1.completedSteps, [1])
  })

  test('GO_TO_STEP ignores non-numeric strings, negative, or out-of-bounds indices', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: { index: 'invalid' } })
    assert.equal(state.currentStepIndex, 0)

    state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: { index: -1 } })
    assert.equal(state.currentStepIndex, 0)

    state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: { index: 99 } })
    assert.equal(state.currentStepIndex, 0)

    state = recipeReducer(state, { type: RECIPE_ACTIONS.GO_TO_STEP, payload: null })
    assert.equal(state.currentStepIndex, 0)
  })

  test('COMPLETE_STEP records completed step and updates progress idempotently', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.COMPLETE_STEP, payload: { stepNumber: 1 } })
    assert.deepEqual(state.completedSteps, [1])
    assert.equal(state.progress, 14)

    // Repeat same step
    state = recipeReducer(state, { type: RECIPE_ACTIONS.COMPLETE_STEP, payload: { stepNumber: 1 } })
    assert.deepEqual(state.completedSteps, [1])
    assert.equal(state.progress, 14)
  })

  test('Timer TICK clamps remaining seconds cleanly at zero without going negative', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    // Move to Step 2 (30s timer)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })

    // Tick by 100 seconds (far exceeding 30s)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_TICK, payload: { delta: 100 } })
    assert.equal(state.timer.remaining, 0)
    assert.equal(state.timer.isRunning, false)
    assert.equal(state.timer.isFinished, true)
  })

  test('Timer controls on a step without a timer are safe no-ops', () => {
    let state = createInitialRecipeState(omeletteRecipe) // Step 1 has no timer
    assert.equal(state.timer.duration, null)

    const s1 = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
    assert.equal(s1.timer.isRunning, false)

    const s2 = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_PAUSE })
    assert.equal(s2.timer.isRunning, false)

    const s3 = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_TICK, payload: { delta: 5 } })
    assert.equal(s3.timer.remaining, null)

    const s4 = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_RESET })
    assert.equal(s4.timer.remaining, null)
  })

  test('Repeated TIMER_START and TIMER_PAUSE are idempotent', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT }) // Step 2 (30s)

    // Double START
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
    assert.equal(state.timer.isRunning, true)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
    assert.equal(state.timer.isRunning, true)

    // Double PAUSE
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_PAUSE })
    assert.equal(state.timer.isRunning, false)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_PAUSE })
    assert.equal(state.timer.isRunning, false)
  })

  test('calculateProgress returns valid percentage for normal, empty, and completed states', () => {
    assert.equal(calculateProgress([], [], 'in_progress'), 0)
    assert.equal(calculateProgress(null, [], 'in_progress'), 0)
    assert.equal(calculateProgress(omeletteRecipe.steps, [], 'in_progress'), 0)
    assert.equal(calculateProgress(omeletteRecipe.steps, [1, 2], 'in_progress'), 29)
    assert.equal(calculateProgress(omeletteRecipe.steps, [], 'completed'), 100)
  })
})
