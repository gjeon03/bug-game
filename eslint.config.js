import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Browser globals used by the game runtime. Declared explicitly to avoid a `globals` dependency. */
const BROWSER = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  HTMLCanvasElement: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLButtonElement: 'readonly',
  CanvasRenderingContext2D: 'readonly',
  CanvasPattern: 'readonly',
  DOMMatrix: 'readonly',
  Path2D: 'readonly',
  AudioContext: 'readonly',
  AudioNode: 'readonly',
  AudioBuffer: 'readonly',
  AudioBufferSourceNode: 'readonly',
  GainNode: 'readonly',
  OscillatorNode: 'readonly',
  BiquadFilterType: 'readonly',
  OscillatorType: 'readonly',
  KeyboardEvent: 'readonly',
  PointerEvent: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const NODE = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  setTimeout: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'artifacts/**',
      'playwright-report/**',
      'test-results/**',
      '.playwright-mcp/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/**/*.ts', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: BROWSER },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/unit/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...NODE, ...BROWSER } },
  },
  {
    // `sim/` is the authoritative simulation: it must stay DOM-free and deterministic, which is what
    // lets it run headless in Vitest and reproduce a run from (seed, input log).
    files: ['src/sim/**/*.ts', 'src/core/rng.ts', 'src/core/clock.ts', 'src/core/spatial.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'sim/ must stay DOM-free.' },
        { name: 'document', message: 'sim/ must stay DOM-free.' },
        { name: 'performance', message: 'sim/ must stay deterministic.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use world.rng for determinism.' },
        { object: 'Date', property: 'now', message: 'sim/ must stay deterministic.' },
      ],
    },
  },
);
