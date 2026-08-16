import { describe, it, expect } from 'vitest';
import { getGhostNodePosition, GHOST_NODE_HEIGHT, GHOST_NODE_WIDTH } from './GhostNode';
import { Node2D } from '../types/graph';

describe('getGhostNodePosition', () => {
  const anchor: Node2D = {
    id: 'node-1',
    firstName: 'Fahd',
    x: 200,
    y: 300,
    width: 140,
    height: 50,
    level: 0,
  };

  it('positions child ghost node directly below anchor node', () => {
    const pos = getGhostNodePosition(anchor, 'child');
    expect(pos.x).toBe(200);
    expect(pos.y).toBe(300 + 50 + 35);
  });

  it('positions parent ghost node directly above anchor node', () => {
    const pos = getGhostNodePosition(anchor, 'parent');
    expect(pos.x).toBe(200);
    expect(pos.y).toBe(300 - GHOST_NODE_HEIGHT - 35);
  });

  it('positions spouse ghost node to the side of anchor node', () => {
    const pos = getGhostNodePosition(anchor, 'spouse');
    expect(pos.x).toBe(200 + 70 + GHOST_NODE_WIDTH / 2 + 30);
    expect(pos.y).toBe(300);
  });
});
