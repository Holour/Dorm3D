import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeNavigationStep, createKeyboardNavigation } from '../src/navigation.js';

function vectorNear(actual, expected, label) {
  const expectedVector = new THREE.Vector3(...expected);
  assert.ok(actual.distanceTo(expectedVector) < 0.00000001,
    `${label}: expected ${expectedVector.toArray()}, received ${actual.toArray()}`);
}

function step(overrides = {}) {
  return computeNavigationStep({
    cameraDirection: new THREE.Vector3(0, 0, -1),
    forwardInput: 1,
    speed: 2,
    deltaSeconds: 0.5,
    ...overrides,
  });
}

test('水平前进和横移跟随相机朝向，俯仰不产生垂直位移', () => {
  vectorNear(step().offset, [0, 0, -1], 'Default forward');
  vectorNear(step({ forwardInput: 0, rightInput: 1 }).offset, [1, 0, 0], 'Right strafe');
  vectorNear(step({ forwardInput: -1 }).offset, [0, 0, 1], 'Reverse');
  vectorNear(step({ cameraDirection: new THREE.Vector3(1, -2, 0) }).offset,
    [1, 0, 0], 'Pitched camera, heading east');
  vectorNear(step({ cameraDirection: new THREE.Vector3(1, -2, 0), forwardInput: 0, rightInput: 1 }).offset,
    [0, 0, 1], 'Right relative to east-facing camera');
});

test('斜向移动归一化，持续移动距离与帧率无关', () => {
  const diagonal = step({ rightInput: 1 }).offset;
  assert.ok(Math.abs(diagonal.length() - 1) < 0.00000001);
  vectorNear(diagonal, [Math.SQRT1_2, 0, -Math.SQRT1_2], 'Diagonal');
  const travel = (frames) => {
    const sum = new THREE.Vector3();
    for (let index = 0; index < frames; index++) {
      sum.add(step({ rightInput: 1, deltaSeconds: 1 / frames }).offset);
    }
    return sum;
  };
  vectorNear(travel(30), travel(120).toArray(), 'Thirty and 120 frames cover equal distance');
  assert.ok(Math.abs(travel(30).length() - 2) < 0.00000001);
});

test('垂直及近垂直俯视保留最近水平朝向，首次俯视也有稳定兜底', () => {
  const previousForward = new THREE.Vector3(1, 0, 0);
  vectorNear(step({ cameraDirection: new THREE.Vector3(0, -1, 0), previousForward }).offset,
    [1, 0, 0], 'Vertical view keeps previous east heading');
  vectorNear(step({ cameraDirection: new THREE.Vector3(-0.00001, -1, 0.00001), previousForward }).offset,
    [1, 0, 0], 'Near-vertical numerical noise cannot reverse heading');
  vectorNear(step({ cameraDirection: new THREE.Vector3(0, -1, 0) }).offset,
    [0, 0, -1], 'Initial vertical view has a deterministic fallback');
  vectorNear(previousForward, [1, 0, 0], 'Caller heading is not mutated');
});

test('零输入及无效时间步不会移动', () => {
  for (const deltaSeconds of [0, -0.1, Infinity, NaN]) {
    vectorNear(step({ deltaSeconds }).offset, [0, 0, 0], `Invalid delta ${deltaSeconds}`);
  }
  vectorNear(step({ forwardInput: 0 }).offset, [0, 0, 0], 'No keys');
  vectorNear(step({ speed: 0 }).offset, [0, 0, 0], 'Paused speed');
});

// EventTarget fakes exercise keyboard/focus rules without a browser or new dependencies.
function setup(t) {
  const document = new EventTarget();
  const window = new EventTarget();
  const element = new EventTarget();
  document.defaultView = window;
  document.activeElement = null;
  document.visibilityState = 'visible';
  document.modalOpen = false;
  document.querySelector = () => document.modalOpen ? {} : null;
  document.querySelectorAll = () => [];
  element.ownerDocument = document;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.4, 3);
  camera.lookAt(0, 1.4, 0);
  const controls = { target: new THREE.Vector3(0, 1.4, 0), enabled: true };
  let callbacks = 0;
  const navigation = createKeyboardNavigation({ camera, controls, element, speed: 2, onMove: () => callbacks++ });
  t.after(() => navigation.dispose());
  const key = (type, code, extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, ...extra });
    (type === 'keydown' ? element : document).dispatchEvent(event);
    return event;
  };
  const focus = () => { document.activeElement = element; document.dispatchEvent(new Event('focusin')); };
  return { document, window, element, camera, controls, navigation, key, focus, callbacks: () => callbacks };
}

test('只有画布聚焦后才接管移动键，相机与目标同步平移且触发动画取消回调', (t) => {
  const state = setup(t);
  assert.equal(state.key('keydown', 'KeyW').defaultPrevented, false);
  assert.equal(state.navigation.update(0.5), false);
  vectorNear(state.camera.position, [0, 1.4, 3], 'Unfocused camera');
  state.focus();
  assert.equal(state.key('keydown', 'KeyW').defaultPrevented, true);
  assert.equal(state.navigation.update(0.5), true);
  vectorNear(state.camera.position, [0, 1.4, 2], 'Camera moves forward');
  vectorNear(state.controls.target, [0, 1.4, -1], 'Orbit target receives exactly the same shift');
  assert.equal(state.callbacks(), 1);
  state.key('keyup', 'KeyW');
  assert.equal(state.navigation.update(0.5), false);
  assert.equal(state.callbacks(), 1, 'Idle frames do not cancel animations');
});

test('方向键和WASD别名可同时按住，重复事件不加速，对向按键相互抵消', (t) => {
  const state = setup(t);
  state.focus();
  assert.equal(state.key('keydown', 'ArrowUp').defaultPrevented, true);
  state.key('keydown', 'KeyW');
  state.key('keydown', 'KeyW', { repeat: true });
  state.navigation.update(0.5);
  vectorNear(state.camera.position, [0, 1.4, 2], 'Aliases and repeat do not double movement');
  state.key('keyup', 'KeyW');
  assert.equal(state.navigation.update(0.5), true, 'ArrowUp remains held after releasing W');
  state.key('keydown', 'KeyS');
  assert.equal(state.navigation.update(0.5), false, 'Opposite directions cancel');
  state.key('keyup', 'KeyS');
  state.key('keyup', 'ArrowUp');
  assert.equal(state.navigation.update(0.5), false);
});

test('输入框、按钮、选择框、弹窗及系统快捷键不会被导航接管', (t) => {
  const state = setup(t);
  for (const tagName of ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA']) {
    state.document.activeElement = { tagName };
    assert.equal(state.key('keydown', 'ArrowDown').defaultPrevented, false, tagName);
    assert.equal(state.navigation.update(0.5), false, tagName);
  }
  state.focus();
  state.document.modalOpen = true;
  assert.equal(state.key('keydown', 'KeyW').defaultPrevented, false);
  assert.equal(state.navigation.update(0.5), false);
  state.document.modalOpen = false;
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
    assert.equal(state.key('keydown', 'KeyW', { [modifier]: true }).defaultPrevented, false, modifier);
    assert.equal(state.navigation.update(0.5), false, modifier);
  }
});

test('画布失焦、窗口失焦、切换标签或打开弹窗会清除按住状态', (t) => {
  const state = setup(t);
  for (const clearTrigger of [
    () => state.element.dispatchEvent(new Event('blur')),
    () => state.window.dispatchEvent(new Event('blur')),
    () => state.document.dispatchEvent(new Event('visibilitychange')),
    () => {
      state.document.activeElement = { tagName: 'BUTTON' };
      state.document.dispatchEvent(new Event('focusin'));
    },
    () => {
      state.document.modalOpen = true;
      state.navigation.update(0.5);
      state.document.modalOpen = false;
    },
  ]) {
    state.focus();
    state.key('keydown', 'KeyW');
    clearTrigger();
    state.focus();
    assert.equal(state.navigation.update(0.5), false, 'Returning focus cannot resume a stale held key');
  }
});

test('清理控制器后不再监听或移动', (t) => {
  const state = setup(t);
  state.focus();
  state.key('keydown', 'KeyW');
  state.navigation.clear();
  assert.equal(state.navigation.update(0.5), false);
  state.navigation.dispose();
  state.navigation.dispose();
  assert.equal(state.key('keydown', 'ArrowRight').defaultPrevented, false);
  assert.equal(state.navigation.update(0.5), false);
});
