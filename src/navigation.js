import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, -1);
const HORIZONTAL_DIRECTION_EPSILON = 0.000001;
const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

function horizontalDirection(direction, previousForward) {
  const forward = new THREE.Vector3();
  if (Number.isFinite(direction?.x) && Number.isFinite(direction?.z)) {
    forward.set(direction.x, 0, direction.z);
  }
  // Near a vertical view, tiny camera-orientation changes must not flip travel.
  if (forward.lengthSq() < HORIZONTAL_DIRECTION_EPSILON) {
    if (Number.isFinite(previousForward?.x) && Number.isFinite(previousForward?.z)) {
      forward.set(previousForward.x, 0, previousForward.z);
    }
    if (forward.lengthSq() < HORIZONTAL_DIRECTION_EPSILON) forward.copy(DEFAULT_FORWARD);
  }
  return forward.normalize();
}

/** Pure movement calculation. Directions and offsets use world coordinates. */
export function computeNavigationStep({
  cameraDirection,
  previousForward,
  forwardInput = 0,
  rightInput = 0,
  speed = 1.5,
  deltaSeconds = 0,
}) {
  const forward = horizontalDirection(cameraDirection, previousForward);
  const offset = new THREE.Vector3();
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !Number.isFinite(speed) || speed <= 0) {
    return { offset, forward };
  }
  const longitudinal = Number.isFinite(forwardInput) ? THREE.MathUtils.clamp(forwardInput, -1, 1) : 0;
  const lateral = Number.isFinite(rightInput) ? THREE.MathUtils.clamp(rightInput, -1, 1) : 0;
  const inputLength = Math.hypot(longitudinal, lateral);
  if (!inputLength) return { offset, forward };
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP);
  offset.addScaledVector(forward, longitudinal).addScaledVector(right, lateral);
  offset.multiplyScalar(speed * deltaSeconds / Math.max(1, inputLength));
  return { offset, forward };
}

function movementCode(event) {
  if (MOVEMENT_CODES.has(event.code)) return event.code;
  const key = typeof event.key === 'string' ? event.key : '';
  if (MOVEMENT_CODES.has(key)) return key;
  const letterCode = `Key${key.toUpperCase()}`;
  return MOVEMENT_CODES.has(letterCode) ? letterCode : null;
}

function hasOpenDialog(document) {
  if (document.querySelector('dialog[open]')) return true;
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some((dialog) => !dialog.hidden && dialog.getAttribute('aria-hidden') !== 'true'
      && dialog.getClientRects().length > 0);
}

/**
 * Install movement on a focusable canvas. The caller owns canvas focus and
 * calls update(deltaSeconds) once per frame, before its controls.update().
 * speed is metres per second. onMove cancels a pending view animation.
 */
export function createKeyboardNavigation({ camera, controls, element, speed = 1.5, onMove }) {
  if (!camera?.getWorldDirection || !camera.position?.isVector3 || !controls?.target?.isVector3) {
    throw new TypeError('Keyboard navigation requires a Three.js camera and OrbitControls target.');
  }
  if (!element?.ownerDocument || !element.addEventListener) {
    throw new TypeError('Keyboard navigation requires the focusable model canvas.');
  }
  if (!Number.isFinite(speed) || speed < 0) throw new RangeError('Navigation speed must be non-negative and finite.');
  const document = element.ownerDocument;
  const window = document.defaultView;
  const pressed = new Set();
  const cameraDirection = new THREE.Vector3();
  let previousForward = horizontalDirection(camera.getWorldDirection(cameraDirection));
  let disposed = false;

  function clear() { pressed.clear(); }

  function hasCanvasFocus() {
    return !disposed && document.activeElement === element
      && document.visibilityState !== 'hidden' && controls.enabled !== false
      && !hasOpenDialog(document);
  }

  function keydown(event) {
    if (!hasCanvasFocus() || event.target !== element || event.defaultPrevented
      || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      clear();
      return;
    }
    const code = movementCode(event);
    if (!code) return;
    pressed.add(code);
    event.preventDefault();
  }

  function keyup(event) {
    const code = movementCode(event);
    if (code) pressed.delete(code);
  }

  function focusChanged() {
    if (document.activeElement !== element) clear();
  }

  element.addEventListener('keydown', keydown);
  element.addEventListener('blur', clear);
  document.addEventListener('keyup', keyup);
  document.addEventListener('focusin', focusChanged);
  document.addEventListener('visibilitychange', clear);
  window?.addEventListener('blur', clear);

  return {
    clear,
    update(deltaSeconds) {
      if (!hasCanvasFocus()) {
        clear();
        return false;
      }
      const held = (...codes) => codes.some((code) => pressed.has(code)) ? 1 : 0;
      const step = computeNavigationStep({
        cameraDirection: camera.getWorldDirection(cameraDirection),
        previousForward,
        forwardInput: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown'),
        rightInput: held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'),
        speed,
        deltaSeconds,
      });
      previousForward = step.forward;
      if (!step.offset.lengthSq()) return false;
      onMove?.();
      camera.position.add(step.offset);
      controls.target.add(step.offset);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      element.removeEventListener('keydown', keydown);
      element.removeEventListener('blur', clear);
      document.removeEventListener('keyup', keyup);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('visibilitychange', clear);
      window?.removeEventListener('blur', clear);
    },
  };
}
