/**
 * Vitest setup for Void Raiders tests.
 *
 * Provides Three.js mocks and shared test utilities so game logic
 * can be tested without WebGL.
 */

import { vi } from 'vitest';

// Mock Three.js module for unit tests that don't need real rendering
vi.mock('three', async () => {
  const mocks = await import('./mocks/three.js');
  return mocks;
});
