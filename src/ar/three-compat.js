import * as THREE from 'three/src/Three.js'

// MindAR 1.2.5 compatibility: polyfill sRGBEncoding removed in Three.js r152+
export const sRGBEncoding = 3001

// Re-export all symbols from Three.js
export * from 'three/src/Three.js'

// Default export
export default THREE
