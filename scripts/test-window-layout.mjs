import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../apps/desktop/electron/window-layout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { WindowLayout, clampBounds, fitCanvasBounds, fitPetBounds } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

const primary = { id: 1, label: '主屏', isPrimary: true, scaleFactor: 1.5, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const secondary = { id: 2, label: '副屏', isPrimary: false, scaleFactor: 1, bounds: { x: -1280, y: -200, width: 1280, height: 1024 }, workArea: { x: -1240, y: -200, width: 1240, height: 1024 } };
const displays = [primary, secondary];
const within = (bounds, area) => {
  assert.ok(bounds.x >= area.x && bounds.y >= area.y);
  assert.ok(bounds.x + bounds.width <= area.x + area.width);
  assert.ok(bounds.y + bounds.height <= area.y + area.height);
};

test('all three modes fit available work areas and taskbars in DIP', () => {
  for (const display of displays) {
    within(fitPetBounds('idle', display), display.workArea);
    within(fitPetBounds('input', display), display.workArea);
    within(fitCanvasBounds(display), display.workArea);
  }
});

test('selecting output from input leaves the pet and input on their own screen', () => {
  const layout = new WindowLayout(displays);
  const pet = { ...layout.petBounds };
  layout.setMode('input');
  const input = layout.getBounds(displays);
  layout.selectDisplay(secondary.id, displays);
  assert.deepEqual(layout.petBounds, pet);
  assert.deepEqual(layout.getBounds(displays), input);
  layout.setMode('canvas');
  within(layout.getBounds(displays), secondary.workArea);
  layout.setMode('idle');
  assert.deepEqual(layout.getBounds(displays), pet);
});

test('expanding input at an edge never overwrites the logical pet anchor', () => {
  const layout = new WindowLayout(displays);
  layout.petBounds = { x: 1740, y: 852, width: 180, height: 180 };
  const pet = { ...layout.petBounds };
  for (let index = 0; index < 20; index += 1) {
    layout.setMode('input');
    within(layout.getBounds(displays), primary.workArea);
    layout.setMode('idle');
    assert.deepEqual(layout.getBounds(displays), pet);
  }
});

test('canvas movement and fullscreen preserve independent pet and normal bounds', () => {
  const layout = new WindowLayout(displays);
  const pet = { ...layout.petBounds };
  layout.setMode('canvas');
  const normal = { x: -1100, y: 12, width: 800, height: 620 };
  layout.moveCanvas(normal, secondary);
  assert.deepEqual(layout.getBounds(displays), normal);
  layout.fullscreen = true;
  assert.deepEqual(layout.getBounds(displays), secondary.bounds);
  layout.rememberCanvas(secondary.bounds, displays);
  layout.fullscreen = false;
  assert.deepEqual(layout.getBounds(displays), normal);
  layout.setMode('idle');
  assert.deepEqual(layout.getBounds(displays), pet);
});

test('each monitor restores its own canvas placement after switching', () => {
  const layout = new WindowLayout(displays);
  layout.setMode('canvas');
  const first = { x: 100, y: 80, width: 900, height: 700 };
  const second = { x: -1080, y: -100, width: 850, height: 690 };
  layout.moveCanvas(first, primary);
  layout.moveCanvas(second, secondary);
  layout.selectDisplay(primary.id, displays);
  assert.deepEqual(layout.getBounds(displays), first);
  layout.selectDisplay(secondary.id, displays);
  assert.deepEqual(layout.getBounds(displays), second);
});

test('unplugged fullscreen canvas falls back visibly and reconnects to its preferred monitor', () => {
  const layout = new WindowLayout(displays);
  layout.setMode('canvas');
  layout.selectDisplay(secondary.id, displays);
  layout.fullscreen = true;
  layout.reconcile([primary]);
  assert.equal(layout.snapshot([primary]).canvasDisplayId, primary.id);
  assert.deepEqual(layout.getBounds([primary]), primary.bounds);
  layout.reconcile(displays);
  assert.equal(layout.snapshot(displays).canvasDisplayId, secondary.id);
  assert.deepEqual(layout.getBounds(displays), secondary.bounds);
});

test('a pet from a disconnected display is clamped onto a remaining display', () => {
  const layout = new WindowLayout(displays);
  layout.petBounds = { x: -1200, y: 500, width: 180, height: 180 };
  layout.reconcile([primary]);
  within(layout.getBounds([primary]), primary.workArea);
});

test('scaling and taskbar changes clamp saved bounds without applying pixel ratios', () => {
  const layout = new WindowLayout(displays);
  layout.setMode('canvas');
  layout.moveCanvas({ x: 800, y: 300, width: 960, height: 700 }, primary);
  const changed = { ...primary, scaleFactor: 2, bounds: { x: 0, y: 0, width: 1280, height: 720 }, workArea: { x: 0, y: 40, width: 1280, height: 640 } };
  layout.reconcile([changed]);
  const bounds = layout.getBounds([changed]);
  within(bounds, changed.workArea);
  assert.equal(bounds.width, 960);
  assert.ok(bounds.height < 640);
});

test('tiny work areas shrink every mode and oversize dragged windows remain visible', () => {
  const display = { ...primary, workArea: { x: 200, y: -100, width: 160, height: 140 } };
  within(fitPetBounds('idle', display), display.workArea);
  within(fitPetBounds('input', display), display.workArea);
  within(fitCanvasBounds(display), display.workArea);
  within(clampBounds({ x: -10000, y: 10000, width: 960, height: 740 }, display.workArea), display.workArea);
});

test('unavailable and malformed display choices are rejected without moving output', () => {
  const layout = new WindowLayout(displays);
  assert.throws(() => layout.selectDisplay(99, displays), /不可用/);
  assert.throws(() => layout.selectDisplay(NaN, displays), /不可用/);
  assert.throws(() => layout.selectDisplay(1.5, displays), /不可用/);
  assert.equal(layout.snapshot(displays).canvasDisplayId, primary.id);
});

test('collapsing a fullscreen canvas clears fullscreen but keeps its output preference', () => {
  const layout = new WindowLayout(displays);
  layout.selectDisplay(secondary.id, displays);
  layout.setMode('canvas');
  layout.fullscreen = true;
  layout.setMode('idle');
  assert.equal(layout.fullscreen, false);
  assert.equal(layout.snapshot(displays).canvasDisplayId, secondary.id);
  layout.setMode('canvas');
  within(layout.getBounds(displays), secondary.workArea);
});
