import assert from 'node:assert/strict';
import test from 'node:test';
import {NoxInput, NOX_DEFAULT_KEYS, noxKeyLabel, readNoxRhythmKeys, rebindNoxLane} from '../js/nox-input-v1.mjs';

test('valid four-lane layouts survive reload and unusable saved data restores D F J K', () => {
  const keys = ['ArrowLeft', 'Digit2', 'Numpad2', 'Space'];
  assert.deepEqual(readNoxRhythmKeys(JSON.stringify(keys)), keys);
  assert.deepEqual(keys.map(noxKeyLabel), ['←', '2', 'Num 2', 'Space']);
  assert.deepEqual(['KeyD', 'ShiftRight', 'Slash', 'F12', 'Lang1'].map(noxKeyLabel), ['D', 'R Shift', '/', 'F12', '한/영']);
  for (const saved of [null, '{', '{}', '[]', '["KeyA","KeyA","KeyB","KeyC"]', '["KeyA","Tab","KeyC","KeyD"]', '["KeyA","Escape","KeyC","KeyD"]']) {
    assert.deepEqual(readNoxRhythmKeys(saved), ['KeyD', 'KeyF', 'KeyJ', 'KeyK']);
  }
});

test('rebinding swaps occupied keys and does not mutate the original layout', () => {
  const keys = rebindNoxLane(NOX_DEFAULT_KEYS, 0, 'KeyJ');
  assert.deepEqual(keys, ['KeyJ', 'KeyF', 'KeyD', 'KeyK']);
  assert.deepEqual(rebindNoxLane(keys, 1, 'BracketLeft'), ['KeyJ', 'BracketLeft', 'KeyD', 'KeyK']);
  assert.deepEqual(NOX_DEFAULT_KEYS, ['KeyD', 'KeyF', 'KeyJ', 'KeyK']);
  assert.deepEqual(rebindNoxLane(keys, 3, 'Escape'), keys);
});

test('the input listener tracks remapped chords, repeats and hold releases by physical key', t => {
  const doc = new EventTarget(), win = new EventTarget(), root = new EventTarget();
  for (const [name, value] of [['document', doc], ['window', win]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {value, configurable: true});
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : Reflect.deleteProperty(globalThis, name));
  }
  const pressed = [], released = [];
  let keys = ['KeyZ', 'ArrowDown', 'Space', 'Numpad1'], active = true;
  const input = new NoxInput(root, lane => pressed.push(lane), {laneKeys: () => keys, active: () => active, onRelease: lane => released.push(lane)});
  t.after(() => input.destroy());
  function send(type, code, extra = {}) {
    const event = Object.assign(new Event(type, {cancelable: true}), {code, ...extra});
    doc.dispatchEvent(event);
    return event.defaultPrevented;
  }
  assert.equal(send('keydown', 'KeyD'), false);
  assert.equal(send('keydown', 'KeyZ', {key: 'ㅋ'}), true);
  send('keydown', 'KeyZ', {repeat: true});
  send('keydown', 'ArrowDown');
  assert.deepEqual(pressed, [0, 1]);
  assert(input.isHeld(0) && input.isHeld(1));
  send('keyup', 'KeyZ');
  assert(!input.isHeld(0) && input.isHeld(1));
  keys = NOX_DEFAULT_KEYS;
  send('keyup', 'ArrowDown');
  assert.deepEqual(released, [0, 1]);
  assert.equal(send('keydown', 'KeyF', {ctrlKey: true}), false);
  send('keydown', 'KeyF');
  win.dispatchEvent(new Event('blur'));
  assert.deepEqual(released, [0, 1, 1]);
  keys = ['ControlLeft', 'KeyR', 'ShiftRight', 'KeyF'];
  send('keydown', 'ControlLeft', {ctrlKey: true});
  send('keydown', 'KeyR', {ctrlKey: true});
  assert.deepEqual(pressed, [0, 1, 1, 0, 1]);
  send('keyup', 'KeyR', {ctrlKey: true});
  send('keyup', 'ControlLeft');
  active = false;
  assert.equal(send('keydown', 'KeyF'), false);
  assert.deepEqual(released, [0, 1, 1, 1, 0]);
});
