/**
 * Recipe State Machine & Reducer
 *
 * Implements predictable state management for cooking recipes:
 * - START
 * - NEXT
 * - BACK
 * - COMPLETE_STEP
 * - TIMER_START / TIMER_PAUSE / TIMER_RESET / TIMER_TICK
 * - RESET
 * - COMPLETE
 * - GO_TO_STEP
 *
 * Independent of Three.js / MindAR / MediaPipe.
 */

export const RECIPE_ACTIONS = {
  START: 'START',
  NEXT: 'NEXT',
  BACK: 'BACK',
  COMPLETE_STEP: 'COMPLETE_STEP',
  TIMER_START: 'TIMER_START',
  TIMER_PAUSE: 'TIMER_PAUSE',
  TIMER_RESET: 'TIMER_RESET',
  TIMER_TICK: 'TIMER_TICK',
  RESET: 'RESET',
  COMPLETE: 'COMPLETE',
  GO_TO_STEP: 'GO_TO_STEP',
}

/**
 * Creates initial timer state for a given step.
 * @param {object|null} step
 * @returns {object}
 */
export function createTimerState(step) {
  const duration = step?.timerSeconds ?? null
  return {
    duration,
    remaining: duration,
    isRunning: false,
    isFinished: false,
  }
}

/**
 * Calculates recipe completion percentage (0 - 100).
 * @param {Array} steps
 * @param {Array<number>} completedSteps - list of completed step numbers (1-indexed)
 * @param {string} status - 'idle' | 'in_progress' | 'completed'
 * @returns {number}
 */
export function calculateProgress(steps, completedSteps, status) {
  if (status === 'completed') return 100
  if (!steps || steps.length === 0) return 0

  const total = steps.length
  const completedCount = completedSteps.length
  const pct = Math.round((completedCount / total) * 100)
  return Math.min(100, Math.max(0, pct))
}

/**
 * Creates initial recipe engine state.
 * @param {object} recipe
 * @returns {object}
 */
export function createInitialRecipeState(recipe) {
  const steps = recipe?.steps || []
  const initialIndex = 0
  const currentStep = steps[initialIndex] || null

  return {
    recipe,
    steps,
    totalSteps: steps.length,
    currentStepIndex: initialIndex,
    currentStepNumber: initialIndex + 1,
    currentStep,
    completedSteps: [], // Array of step numbers (1-indexed)
    status: 'in_progress', // 'idle' | 'in_progress' | 'completed'
    progress: 0,
    timer: createTimerState(currentStep),
    isCompleted: false,
  }
}

/**
 * Reducer function for recipe state.
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
export function recipeReducer(state, action) {
  const { type, payload } = action

  switch (type) {
    case RECIPE_ACTIONS.START: {
      const recipe = payload?.recipe || state.recipe
      return createInitialRecipeState(recipe)
    }

    case RECIPE_ACTIONS.NEXT: {
      if (state.status === 'completed') {
        return state
      }

      const total = state.steps.length
      const currentNumber = state.currentStepNumber

      // Mark current step completed if not already marked
      const newCompleted = state.completedSteps.includes(currentNumber)
        ? state.completedSteps
        : [...state.completedSteps, currentNumber]

      // If already at the last step, transition to COMPLETE
      if (state.currentStepIndex >= total - 1) {
        return {
          ...state,
          completedSteps: newCompleted,
          status: 'completed',
          progress: 100,
          isCompleted: true,
          timer: {
            ...state.timer,
            isRunning: false,
          },
        }
      }

      const nextIndex = state.currentStepIndex + 1
      const nextStep = state.steps[nextIndex]
      const newProgress = calculateProgress(state.steps, newCompleted, 'in_progress')

      return {
        ...state,
        currentStepIndex: nextIndex,
        currentStepNumber: nextIndex + 1,
        currentStep: nextStep,
        completedSteps: newCompleted,
        progress: newProgress,
        timer: createTimerState(nextStep),
      }
    }

    case RECIPE_ACTIONS.BACK: {
      // Cannot navigate before Step 1
      if (state.currentStepIndex <= 0) {
        return state
      }

      const prevIndex = state.currentStepIndex - 1
      const prevStep = state.steps[prevIndex]

      return {
        ...state,
        currentStepIndex: prevIndex,
        currentStepNumber: prevIndex + 1,
        currentStep: prevStep,
        status: 'in_progress',
        isCompleted: false,
        progress: calculateProgress(state.steps, state.completedSteps, 'in_progress'),
        timer: createTimerState(prevStep),
      }
    }

    case RECIPE_ACTIONS.COMPLETE_STEP: {
      const stepNumberToComplete = payload?.stepNumber ?? state.currentStepNumber

      if (state.completedSteps.includes(stepNumberToComplete)) {
        return state
      }

      const newCompleted = [...state.completedSteps, stepNumberToComplete]
      const isAllDone = newCompleted.length === state.totalSteps
      const newStatus = isAllDone ? 'completed' : state.status

      return {
        ...state,
        completedSteps: newCompleted,
        status: newStatus,
        isCompleted: isAllDone,
        progress: calculateProgress(state.steps, newCompleted, newStatus),
      }
    }

    case RECIPE_ACTIONS.TIMER_START: {
      if (!state.timer.duration || state.timer.remaining <= 0) {
        return state
      }
      return {
        ...state,
        timer: {
          ...state.timer,
          isRunning: true,
          isFinished: false,
        },
      }
    }

    case RECIPE_ACTIONS.TIMER_PAUSE: {
      return {
        ...state,
        timer: {
          ...state.timer,
          isRunning: false,
        },
      }
    }

    case RECIPE_ACTIONS.TIMER_RESET: {
      return {
        ...state,
        timer: {
          duration: state.timer.duration,
          remaining: state.timer.duration,
          isRunning: false,
          isFinished: false,
        },
      }
    }

    case RECIPE_ACTIONS.TIMER_TICK: {
      if (!state.timer.isRunning || state.timer.remaining === null) {
        return state
      }

      const decrement = payload?.delta ?? 1
      const newRemaining = Math.max(0, state.timer.remaining - decrement)
      const finished = newRemaining === 0

      return {
        ...state,
        timer: {
          ...state.timer,
          remaining: newRemaining,
          isRunning: !finished,
          isFinished: finished,
        },
      }
    }

    case RECIPE_ACTIONS.RESET: {
      return createInitialRecipeState(state.recipe)
    }

    case RECIPE_ACTIONS.COMPLETE: {
      const allStepNumbers = state.steps.map((s) => s.stepNumber)
      return {
        ...state,
        completedSteps: allStepNumbers,
        status: 'completed',
        progress: 100,
        isCompleted: true,
        timer: {
          ...state.timer,
          isRunning: false,
        },
      }
    }

    case RECIPE_ACTIONS.GO_TO_STEP: {
      const targetIndex = payload?.index
      if (
        typeof targetIndex !== 'number' ||
        targetIndex < 0 ||
        targetIndex >= state.steps.length
      ) {
        return state
      }

      const targetStep = state.steps[targetIndex]
      return {
        ...state,
        currentStepIndex: targetIndex,
        currentStepNumber: targetIndex + 1,
        currentStep: targetStep,
        status: 'in_progress',
        isCompleted: false,
        timer: createTimerState(targetStep),
      }
    }

    default:
      return state
  }
}
