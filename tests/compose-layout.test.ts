import { describe, it, expect } from 'vitest';
const { gridDimensions, slotPosition } = require('../lib/compose-layout');

describe('gridDimensions', () => {
  it('computes a square 2x2 grid', () => {
    const { cols, rows, gridWidth, gridHeight } = gridDimensions(4, 2, 100, 10);
    expect(cols).toBe(2);
    expect(rows).toBe(2);
    expect(gridWidth).toBe(210); // 2*100 + 1*10
    expect(gridHeight).toBe(210);
  });

  it('computes a 1-column vertical strip (1x4 layout)', () => {
    const { cols, rows, gridWidth, gridHeight } = gridDimensions(4, 1, 100, 10);
    expect(cols).toBe(1);
    expect(rows).toBe(4);
    expect(gridWidth).toBe(100);
    expect(gridHeight).toBe(430); // 4*100 + 3*10
  });

  it('handles a non-multiple slot count (e.g. 6 slots, 2 columns -> 3 rows)', () => {
    const { rows } = gridDimensions(6, 2, 100, 10);
    expect(rows).toBe(3);
  });

  it('clamps columns to at least 1', () => {
    const { cols } = gridDimensions(4, 0, 100, 10);
    expect(cols).toBe(1);
  });
});

describe('slotPosition', () => {
  it('places slot 0 at the padded origin', () => {
    expect(slotPosition(0, 2, 100, 10, 24)).toEqual({ left: 24, top: 24 });
  });

  it('places slot 1 in the second column, same row', () => {
    expect(slotPosition(1, 2, 100, 10, 24)).toEqual({ left: 134, top: 24 });
  });

  it('wraps to the second row after filling columns', () => {
    expect(slotPosition(2, 2, 100, 10, 24)).toEqual({ left: 24, top: 134 });
  });
});
