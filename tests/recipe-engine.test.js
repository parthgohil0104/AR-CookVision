import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import omeletteRecipe from '../src/data/recipes/omelette.json' with { type: 'json' }
import {
  RECIPE_ACTIONS,
  recipeReducer,
  createInitialRecipeState,
  calculateProgress,
} from '../src/engine/recipeReducer.js'

describe('Recipe Engine — State Machine & Reducer', () => {
  test('Initial state starts at Step 1 with 0% progress', () => {
    const state = createInitialRecipeState(omeletteRecipe)

    assert.equal(state.totalSteps, 7)
    assert.equal(state.currentStepIndex, 0)
    assert.equal(state.currentStepNumber, 1)
    assert.equal(state.currentStep.id, 'position-pan')
    assert.equal(state.currentStep.title, 'Position pan')
    assert.deepEqual(state.completedSteps, [])
    assert.equal(state.status, 'in_progress')
    assert.equal(state.progress, 0)
    assert.equal(state.isCompleted, false)
    assert.equal(state.timer.duration, null)
    assert.equal(state.timer.remaining, null)
    assert.equal(state.timer.isRunning, false)
  })

  test('NEXT advances from Step 1 to Step 2 and marks Step 1 completed', () => {
    let state = createInitialRecipeState(omeletteRecipe)

    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })

    assert.equal(state.currentStepIndex, 1)
    assert.equal(state.currentStepNumber, 2)
    assert.equal(state.currentStep.id, 'add-oil')
    assert.equal(state.currentStep.title, 'Add oil')
    assert.deepEqual(state.completedSteps, [1])
    assert.equal(state.progress, 14) // 1 / 7 = 14%
    // Step 2 has a 30s timer
    assert.equal(state.timer.duration, 30)
    assert.equal(state.timer.remaining, 30)
    assert.equal(state.timer.isRunning, false)
    assert.equal(state.timer.isFinished, false)
  })

  test('BACK returns to previous step without exceeding Step 1 bounds', () => {
    let state = createInitialRecipeState(omeletteRecipe)

    // Attempting BACK on Step 1 does nothing
    const unchanged = recipeReducer(state, { type: RECIPE_ACTIONS.BACK })
    assert.equal(unchanged.currentStepIndex, 0)
    assert.equal(unchanged.currentStepNumber, 1)

    // Advance to Step 2 then go back
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    assert.equal(state.currentStepNumber, 2)

    state = recipeReducer(state, { type: RECIPE_ACTIONS.BACK })
    assert.equal(state.currentStepIndex, 0)
    assert.equal(state.currentStepNumber, 1)
    assert.equal(state.currentStep.id, 'position-pan')
  })

  test('COMPLETE_STEP explicitly marks a step as completed and updates progress', () => {
    let state = createInitialRecipeState(omeletteRecipe)

    state = recipeReducer(state, {
      type: RECIPE_ACTIONS.COMPLETE_STEP,
      payload: { stepNumber: 1 },
    })

    assert.deepEqual(state.completedSteps, [1])
    assert.equal(state.progress, 14)

    // Idempotent completion check
    const sameState = recipeReducer(state, {
      type: RECIPE_ACTIONS.COMPLETE_STEP,
      payload: { stepNumber: 1 },
    })
    assert.deepEqual(sameState.completedSteps, [1])
  })

  test('Progress calculation correctly computes percentages across all steps', () => {
    const steps = omeletteRecipe.steps
    assert.equal(calculateProgress(steps, [], 'in_progress'), 0)
    assert.equal(calculateProgress(steps, [1], 'in_progress'), 14)
    assert.equal(calculateProgress(steps, [1, 2, 3], 'in_progress'), 43)
    assert.equal(calculateProgress(steps, [1, 2, 3, 4, 5, 6, 7], 'in_progress'), 100)
    assert.equal(calculateProgress(steps, [], 'completed'), 100)
  })

  test('Timer behavior: TIMER_START, TIMER_TICK, TIMER_PAUSE, TIMER_RESET, and finish', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    // Go to Step 2 (30s timer)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })

    assert.equal(state.timer.duration, 30)
    assert.equal(state.timer.remaining, 30)
    assert.equal(state.timer.isRunning, false)

    // Start timer
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
    assert.equal(state.timer.isRunning, true)
    assert.equal(state.timer.isFinished, false)

    // Tick 5 seconds
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_TICK, payload: { delta: 5 } })
    assert.equal(state.timer.remaining, 25)
    assert.equal(state.timer.isRunning, true)

    // Pause timer
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_PAUSE })
    assert.equal(state.timer.isRunning, false)
    assert.equal(state.timer.remaining, 25)

    // Tick while paused should not decrement
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_TICK, payload: { delta: 1 } })
    assert.equal(state.timer.remaining, 25)

    // Reset timer
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_RESET })
    assert.equal(state.timer.remaining, 30)
    assert.equal(state.timer.isRunning, false)

    // Start and tick to 0 (finish)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_START })
    state = recipeReducer(state, { type: RECIPE_ACTIONS.TIMER_TICK, payload: { delta: 30 } })
    assert.equal(state.timer.remaining, 0)
    assert.equal(state.timer.isRunning, false)
    assert.equal(state.timer.isFinished, true)
  })

  test('RESET returns state to Step 1 with empty completed steps and zero progress', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    // Advance several steps
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    assert.equal(state.currentStepNumber, 4)

    // Reset
    state = recipeReducer(state, { type: RECIPE_ACTIONS.RESET })
    assert.equal(state.currentStepIndex, 0)
    assert.equal(state.currentStepNumber, 1)
    assert.deepEqual(state.completedSteps, [])
    assert.equal(state.progress, 0)
    assert.equal(state.status, 'in_progress')
    assert.equal(state.isCompleted, false)
  })

  test('Final step (Step 7) advances to recipe completion and locks at 100%', () => {
    let state = createInitialRecipeState(omeletteRecipe)

    // Walk through all 7 steps
    for (let i = 1; i <= 6; i++) {
      state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    }

    assert.equal(state.currentStepNumber, 7)
    assert.equal(state.currentStep.id, 'serve')
    assert.equal(state.status, 'in_progress')

    // Calling NEXT on Step 7 completes the recipe
    state = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    assert.equal(state.status, 'completed')
    assert.equal(state.isCompleted, true)
    assert.equal(state.progress, 100)
    assert.equal(state.completedSteps.length, 7)

    // Further NEXT calls remain completed and do not error or overflow
    const overflowState = recipeReducer(state, { type: RECIPE_ACTIONS.NEXT })
    assert.equal(overflowState.currentStepIndex, 6)
    assert.equal(overflowState.status, 'completed')
  })

  test('COMPLETE action directly completes all steps', () => {
    let state = createInitialRecipeState(omeletteRecipe)
    state = recipeReducer(state, { type: RECIPE_ACTIONS.COMPLETE })

    assert.equal(state.status, 'completed')
    assert.equal(state.isCompleted, true)
    assert.equal(state.progress, 100)
    assert.deepEqual(state.completedSteps, [1, 2, 3, 4, 5, 6, 7])
  })

  test('GO_TO_STEP enables direct jump navigation while respecting bounds', () => {
    let state = createInitialRecipeState(omeletteRecipe)

    // Jump to Step 5 (index 4)
    state = recipeReducer(state, {
      type: RECIPE_ACTIONS.GO_TO_STEP,
      payload: { index: 4 },
    })
    assert.equal(state.currentStepNumber, 5)
    assert.equal(state.currentStep.title, 'Stir')

    // Invalid negative index is ignored
    state = recipeReducer(state, {
      type: RECIPE_ACTIONS.GO_TO_STEP,
      payload: { index: -1 },
    })
    assert.equal(state.currentStepNumber, 5)

    // Invalid out-of-range index is ignored
    state = recipeReducer(state, {
      type: RECIPE_ACTIONS.GO_TO_STEP,
      payload: { index: 99 },
    })
    assert.equal(state.currentStepNumber, 5)
  })
})
