import { useEffect, useReducer, useCallback, useRef } from 'react'
import defaultRecipe from '../data/recipes/omelette.json'
import {
  RECIPE_ACTIONS,
  recipeReducer,
  createInitialRecipeState,
} from '../engine/recipeReducer'

/**
 * Formats seconds into MM:SS string.
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (typeof seconds !== 'number' || seconds < 0) {
    return '--:--'
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const mm = mins.toString().padStart(2, '0')
  const ss = secs.toString().padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * useRecipe Hook
 *
 * Encapsulates recipe state, timer tick loop, action dispatchers,
 * and navigation controls. Completely decoupled from AR/CV tracking.
 */
export function useRecipe(initialRecipe = defaultRecipe) {
  const [state, dispatch] = useReducer(
    recipeReducer,
    initialRecipe,
    createInitialRecipeState
  )

  const wasFinishedRef = useRef(false)

  // Timer Tick Interval
  useEffect(() => {
    let intervalId = null

    if (state.timer.isRunning && state.timer.remaining > 0) {
      intervalId = setInterval(() => {
        dispatch({
          type: RECIPE_ACTIONS.TIMER_TICK,
          payload: { delta: 1, stepNumber: state.currentStepNumber },
        })
      }, 1000)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [state.timer.isRunning, state.timer.remaining, state.currentStepNumber])

  // Timer Completion Haptic / Audio Signal
  useEffect(() => {
    if (state.timer.isFinished && !wasFinishedRef.current) {
      wasFinishedRef.current = true
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([200, 100, 200, 100, 300])
        } catch {
          // Ignore vibration policy issues
        }
      }
    } else if (!state.timer.isFinished) {
      wasFinishedRef.current = false
    }
  }, [state.timer.isFinished])

  // Action Dispatchers
  const nextStep = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.NEXT })
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(40)
      } catch {
        // Ignore
      }
    }
  }, [])

  const prevStep = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.BACK })
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(20)
      } catch {
        // Ignore
      }
    }
  }, [])

  const completeStep = useCallback((stepNumber) => {
    dispatch({
      type: RECIPE_ACTIONS.COMPLETE_STEP,
      payload: { stepNumber },
    })
  }, [])

  const startTimer = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.TIMER_START })
  }, [])

  const pauseTimer = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.TIMER_PAUSE })
  }, [])

  const resetTimer = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.TIMER_RESET })
  }, [])

  const resetRecipe = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.RESET })
  }, [])

  const completeRecipe = useCallback(() => {
    dispatch({ type: RECIPE_ACTIONS.COMPLETE })
  }, [])

  const goToStep = useCallback((index) => {
    dispatch({
      type: RECIPE_ACTIONS.GO_TO_STEP,
      payload: { index },
    })
  }, [])

  const isFirstStep = state.currentStepIndex === 0
  const isLastStep = state.currentStepIndex === state.totalSteps - 1
  const hasTimer = Boolean(state.currentStep?.timerSeconds)

  return {
    // State
    recipe: state.recipe,
    steps: state.steps,
    totalSteps: state.totalSteps,
    currentStepIndex: state.currentStepIndex,
    currentStepNumber: state.currentStepNumber,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    status: state.status,
    progress: state.progress,
    timer: state.timer,
    isCompleted: state.isCompleted,
    isFirstStep,
    isLastStep,
    hasTimer,

    // Timer formatted string
    formattedTime: formatTime(state.timer.remaining),

    // Actions
    nextStep,
    prevStep,
    completeStep,
    startTimer,
    pauseTimer,
    resetTimer,
    resetRecipe,
    completeRecipe,
    goToStep,
    dispatch,
  }
}
