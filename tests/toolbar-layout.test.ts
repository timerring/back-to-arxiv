import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dockBounds } from '../src/toolbar-layout';

test('a saved corner fits after both viewport and toolbar size change', () => {
  for (const [width, height, dockWidth, dockHeight] of [[1024, 900, 348, 56], [320, 320, 74, 40]] as const) {
    // A pinched or panned viewport need not start at the layout viewport's origin.
    const view = { left: 48, top: 90, width, height };
    const area = dockBounds(view, { width: dockWidth, height: dockHeight });
    assert.equal(area.left + area.travelX + dockWidth, view.left + width - 8);
    assert.equal(area.top + area.travelY + dockHeight, view.top + height - 8);
  }
});

test('a viewport smaller than the dock anchors the overflowing axis at its near edge', () => {
  const view = { left: 32, top: 48, width: 120, height: 240 };
  const area = dockBounds(view, { width: 180, height: 56 });
  assert.deepEqual(area, { left: 40, top: 56, travelX: 0, travelY: 168 });
});
