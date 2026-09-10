import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSeatedView } from '../src/seated-view.js';
import { createKeyboardNavigation } from '../src/navigation.js';

function vectorNear(actual, expected, label) {
  const value = expected.isVector3 ? expected : new THREE.Vector3(...expected);
  assert.ok(actual.distanceTo(value) < 0.00000001,
    `${label}: expected ${value.toArray()}, received ${actual.toArray()}`);
}

function angles(camera) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return { yaw: Math.atan2(direction.x, -direction.z), pitch: Math.asin(direction.y) };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.00000001, `${label}: expected ${expected}, received ${actual}`);
}

function setup(t) {
  const document = new EventTarget();
  const window = new EventTarget();
  const element = new EventTarget();
  const captures = new Set();
  document.defaultView = window;
  document.activeElement = null;
  document.visibilityState = 'visible';
  document.modalOpen = false;
  document.querySelector = () => document.modalOpen ? {} : null;
  document.querySelectorAll = () => [];
  element.ownerDocument = document;
  element.style = { touchAction: 'pan-y' };
  element.focus = () => { document.activeElement = element; document.dispatchEvent(new Event('focusin')); };
  element.setPointerCapture = (id) => captures.add(id);
  element.hasPointerCapture = (id) => captures.has(id);
  element.releasePointerCapture = (id) => captures.delete(id);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 1, 0);
  const controls = {
    target: new THREE.Vector3(0, 1, 0), enabled: true,
    enableRotate: true, enablePan: true, enableZoom: false,
    enableDamping: true, autoRotate: false,
  };
  const changes = [];
  const seated = createSeatedView({ camera, controls, element, onChange: (active) => changes.push(active) });
  t.after(() => seated.dispose());
  const event = (type, properties = {}, target = element) => {
    const result = new Event(type, { cancelable: true });
    Object.assign(result, properties);
    target.dispatchEvent(result);
    return result;
  };
  const key = (type, code, extra = {}) => event(type, { code, ...extra }, type === 'keyup' ? document : element);
  const pointer = (type, x, y, id = 1, pointerType = 'mouse') =>
    event(type, { clientX: x, clientY: y, pointerId: id, pointerType, button: 0 });
  const enter = () => seated.enter({ position: new THREE.Vector3(0, 1.15, 2), target: new THREE.Vector3(0, 1.15, 0) });
  return { document, window, element, camera, controls, changes, captures, seated, event, key, pointer, enter };
}

test('进入固定眼点并禁用OrbitControls，退出精确恢复进入前视角及控制状态', (t) => {
  const state = setup(t);
  const position = state.camera.position.clone();
  const target = state.controls.target.clone();
  const quaternion = state.camera.quaternion.clone();
  const settings = { ...state.controls };
  assert.equal(state.seated.active, false);
  assert.equal(state.enter(), true);
  assert.equal(state.seated.active, true);
  assert.equal(state.document.activeElement, state.element);
  vectorNear(state.camera.position, [0, 1.15, 2], 'Seated eye');
  vectorNear(state.controls.target, [0, 1.15, 0], 'Initial seated target');
  for (const key of ['enabled', 'enableRotate', 'enablePan', 'enableZoom', 'enableDamping', 'autoRotate']) {
    assert.equal(state.controls[key], false, key);
  }
  state.key('keydown', 'KeyD');
  state.seated.update(0.25);
  state.seated.exit();
  assert.equal(state.seated.active, false);
  vectorNear(state.camera.position, position, 'Standing position');
  vectorNear(state.controls.target, target, 'Standing target');
  assert.ok(state.camera.quaternion.equals(quaternion));
  for (const key of ['enabled', 'enableRotate', 'enablePan', 'enableZoom', 'enableDamping', 'autoRotate']) {
    assert.equal(state.controls[key], settings[key], key);
  }
  assert.equal(state.element.style.touchAction, 'pan-y');
  assert.deepEqual(state.changes, [true, false]);
});

test('W抬头S低头A左D右，按住只改变方向而不移动位置', (t) => {
  const state = setup(t);
  state.enter();
  assert.equal(state.key('keydown', 'KeyW').defaultPrevented, true);
  state.seated.update(0.25);
  near(angles(state.camera).pitch, Math.PI / 8, 'W raises pitch');
  state.key('keyup', 'KeyW');
  state.key('keydown', 'ArrowDown');
  state.seated.update(0.25);
  near(angles(state.camera).pitch, 0, 'Down reverses pitch');
  state.key('keyup', 'ArrowDown');
  state.key('keydown', 'KeyA');
  state.seated.update(0.25);
  near(angles(state.camera).yaw, -Math.PI / 8, 'A turns left');
  state.key('keyup', 'KeyA');
  state.key('keydown', 'ArrowRight');
  state.seated.update(0.25);
  near(angles(state.camera).yaw, 0, 'Right reverses yaw');
  vectorNear(state.camera.position, [0, 1.15, 2], 'All turns retain the seat position');
});

test('斜向转头归一化且帧率独立，俯仰限制在正负80度', (t) => {
  const state = setup(t);
  const turn = (frames) => {
    state.enter();
    state.key('keydown', 'KeyW');
    state.key('keydown', 'KeyD');
    for (let index = 0; index < frames; index++) state.seated.update(0.5 / frames);
    return angles(state.camera);
  };
  const thirty = turn(30), oneTwenty = turn(120);
  near(thirty.yaw, oneTwenty.yaw, 'Frame-independent yaw');
  near(thirty.pitch, oneTwenty.pitch, 'Frame-independent pitch');
  near(Math.hypot(thirty.yaw, thirty.pitch), Math.PI / 4, 'Diagonal angular input is normalized');
  state.enter();
  state.key('keydown', 'KeyW');
  state.seated.update(5);
  near(angles(state.camera).pitch, THREE.MathUtils.degToRad(80), 'Upper pitch limit');
  state.key('keyup', 'KeyW');
  state.key('keydown', 'KeyS');
  state.seated.update(5);
  near(angles(state.camera).pitch, THREE.MathUtils.degToRad(-80), 'Lower pitch limit');
});

test('鼠标和单指拖动可以环顾，拖动标志留给点击过滤且下一手势重置', (t) => {
  const state = setup(t);
  state.enter();
  state.pointer('pointerdown', 100, 100);
  state.pointer('pointermove', 102, 101);
  assert.equal(state.seated.didDrag, false);
  near(angles(state.camera).yaw, 0, 'Tiny pointer noise is not a turn');
  state.pointer('pointermove', 150, 75);
  near(angles(state.camera).yaw, 0.2, 'Mouse horizontal turn');
  near(angles(state.camera).pitch, 0.1, 'Mouse upward turn');
  state.pointer('pointerup', 150, 75);
  assert.equal(state.seated.didDrag, true, 'Pointerup preserves the drag flag for click filtering');
  assert.equal(state.captures.size, 0);
  state.pointer('pointerdown', 50, 50, 2, 'touch');
  assert.equal(state.seated.didDrag, false);
  state.pointer('pointermove', 25, 75, 2, 'touch');
  near(angles(state.camera).yaw, 0.1, 'Touch horizontal turn');
  near(angles(state.camera).pitch, 0, 'Touch vertical turn');
  state.pointer('pointerup', 25, 75, 2, 'touch');
  vectorNear(state.camera.position, [0, 1.15, 2], 'Dragging never translates the eye');
});

test('双指、滚轮与右键不缩放或平移，双指结束前也不误作单指拖动', (t) => {
  const state = setup(t);
  state.enter();
  const target = state.controls.target.clone();
  const zoom = state.camera.zoom;
  state.pointer('pointerdown', 100, 100, 1, 'touch');
  state.pointer('pointerdown', 200, 100, 2, 'touch');
  state.pointer('pointermove', 50, 50, 1, 'touch');
  state.pointer('pointermove', 250, 150, 2, 'touch');
  state.pointer('pointerup', 250, 150, 2, 'touch');
  state.pointer('pointermove', 30, 20, 1, 'touch');
  state.pointer('pointerup', 30, 20, 1, 'touch');
  assert.equal(state.seated.didDrag, true, 'Multitouch must not become a selection click');
  assert.equal(state.event('wheel', { deltaY: -120 }).defaultPrevented, true);
  assert.equal(state.event('contextmenu').defaultPrevented, true);
  assert.equal(state.camera.zoom, zoom);
  vectorNear(state.camera.position, [0, 1.15, 2], 'Pinch keeps the eye fixed');
  vectorNear(state.controls.target, target, 'Pinch also leaves the view direction unchanged');
});

test('手机方向按钮输入可持续转头、支持归一化，并在失焦或退出时清空', (t) => {
  const state = setup(t);
  state.enter();
  state.seated.setLookInput({ horizontal: 1, vertical: 1 });
  state.seated.update(0.5);
  const look = angles(state.camera);
  near(Math.hypot(look.yaw, look.pitch), Math.PI / 4, 'Mobile diagonal input is normalized');
  state.seated.setLookInput({ horizontal: 0, vertical: 0 });
  assert.equal(state.seated.update(0.5), false);
  state.seated.setLookInput({ horizontal: -1 });
  state.element.dispatchEvent(new Event('blur'));
  assert.equal(state.seated.update(0.5), false, 'Blur releases long-press input');
  state.seated.setLookInput({ vertical: -1 });
  state.seated.exit();
  state.enter();
  assert.equal(state.seated.update(0.5), false, 'Reentry cannot resume an old mobile press');
});

test('输入框、按钮、弹窗和快捷键不被接管，失焦或切换标签清除按键', (t) => {
  const state = setup(t);
  state.enter();
  for (const tagName of ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA']) {
    state.document.activeElement = { tagName };
    state.document.dispatchEvent(new Event('focusin'));
    assert.equal(state.key('keydown', 'KeyW').defaultPrevented, false, tagName);
    assert.equal(state.seated.update(0.5), false);
  }
  state.element.focus();
  state.document.modalOpen = true;
  assert.equal(state.key('keydown', 'ArrowUp').defaultPrevented, false);
  assert.equal(state.seated.update(0.5), false);
  state.document.modalOpen = false;
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) {
    assert.equal(state.key('keydown', 'KeyW', { [modifier]: true }).defaultPrevented, false, modifier);
  }
  for (const [target, type] of [[state.element, 'blur'], [state.window, 'blur'], [state.document, 'visibilitychange']]) {
    state.key('keydown', 'KeyW');
    target.dispatchEvent(new Event(type));
    assert.equal(state.seated.update(0.5), false, type);
  }
});

test('坐姿禁用已有键盘平移，外部位置修改也会被固定眼点覆盖', (t) => {
  const state = setup(t);
  const navigation = createKeyboardNavigation({ camera: state.camera, controls: state.controls, element: state.element });
  t.after(() => navigation.dispose());
  state.enter();
  state.key('keydown', 'KeyW');
  assert.equal(navigation.update(0.5), false);
  assert.equal(state.seated.update(0.5), true);
  vectorNear(state.camera.position, [0, 1.15, 2], 'W turns without translating');
  state.key('keyup', 'KeyW');
  state.camera.position.set(9, 9, 9);
  state.controls.target.set(8, 8, 8);
  state.seated.update(0);
  vectorNear(state.camera.position, [0, 1.15, 2], 'Fixed eye is enforced even on an idle frame');
});

test('切换座位不覆盖原站立视角，销毁后恢复且不再接管事件', (t) => {
  const state = setup(t);
  const originalPosition = state.camera.position.clone();
  const originalTarget = state.controls.target.clone();
  state.enter();
  state.seated.enter({ position: [1, 1.2, 3], target: [1, 1.2, 1] });
  vectorNear(state.camera.position, [1, 1.2, 3], 'Second seat');
  state.seated.dispose();
  state.seated.dispose();
  vectorNear(state.camera.position, originalPosition, 'Original standing view survives seat changes');
  vectorNear(state.controls.target, originalTarget, 'Original target survives seat changes');
  assert.equal(state.seated.active, false);
  assert.equal(state.key('keydown', 'ArrowLeft').defaultPrevented, false);
  assert.equal(state.seated.update(0.5), false);
});
