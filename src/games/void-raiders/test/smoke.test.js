/**
 * Smoke test — verifies test infrastructure works.
 */

import { describe, it, expect } from 'vitest';
import { createDrone, createSwarm, createMothership, createDeposit, createEnemy } from './helpers.js';

describe('test infrastructure', () => {
  it('creates drone with defaults', () => {
    const drone = createDrone();
    expect(drone.type).toBe('worker-mining');
    expect(drone.stats.hull).toBe(50);
    expect(drone.state).toBe('idle');
  });

  it('creates drone with overrides', () => {
    const drone = createDrone({ type: 'offensive', stats: { hull: 200 } });
    expect(drone.type).toBe('offensive');
    expect(drone.stats.hull).toBe(200);
    expect(drone.stats.speed).toBe(15); // default preserved
  });

  it('creates swarm with routine', () => {
    const swarm = createSwarm({ routine: { action: 'attack', retreat: 'health-low' } });
    expect(swarm.routine.action).toBe('attack');
    expect(swarm.routine.retreat).toBe('health-low');
    expect(swarm.routine.anchor).toBe('follow-mothership'); // default
  });

  it('creates mothership with systems', () => {
    const ship = createMothership();
    expect(ship.systems.hull).toBe(1000);
    expect(ship.systems.shields).toBe(500);
    expect(ship.tesseract.capacity).toBe(10000);
  });

  it('creates deposit and enemy', () => {
    const deposit = createDeposit({ resourceType: 'plasma-core', amount: 50 });
    expect(deposit.resourceType).toBe('plasma-core');

    const enemy = createEnemy({ type: 'heavy-cruiser', stats: { hull: 500 } });
    expect(enemy.type).toBe('heavy-cruiser');
    expect(enemy.stats.hull).toBe(500);
  });

  it('each factory produces unique IDs', () => {
    const a = createDrone();
    const b = createDrone();
    expect(a.id).not.toBe(b.id);
  });
});
