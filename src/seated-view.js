import * as THREE from 'three';

const PITCH_LIMIT = THREE.MathUtils.degToRad(80);
const TURN_SPEED = Math.PI / 2;
const DRAG_SENSITIVITY = 0.004;
const DRAG_THRESHOLD = 4;
const LOOK_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const ORBIT_SETTINGS = ['enabled', 'enableRotate', 'enablePan', 'enableZoom', 'enableDamping', 'autoRotate'];

function point(value, name) {
  const coordinates = Array.isArray(value) ? value.slice(0, 3) : [value?.x, value?.y, value?.z];
  if (coordinates.length !== 3 || !coordinates.every(Number.isFinite)) {
    throw new TypeError(`Seated ${name} must contain three finite coordinates.`);
  }
  return new THREE.Vector3(...coordinates);
}

function codeFor(event) {
  if (LOOK_CODES.has(event.code)) return event.code;
  const key = typeof event.key === 'string' ? event.key : '';
  if (LOOK_CODES.has(key)) return key;
  const code = `Key${key.toUpperCase()}`;
  return LOOK_CODES.has(code) ? code : null;
}

function dialogOpen(document) {
  if (document.querySelector('dialog[open]')) return true;
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some((dialog) => !dialog.hidden && dialog.getAttribute('aria-hidden') !== 'true'
      && dialog.getClientRects().length > 0);
}

/**
 * Fixed-eye viewing mode. While active, the caller must skip controls.update()
 * and call this controller's update(deltaSeconds) instead. onChange(active)
 * fires on entry/exit; didDrag remains available through the following click.
 */
export function createSeatedView({ camera, controls, element, onChange }) {
  if (!camera?.position?.isVector3 || !camera.getWorldDirection || !controls?.target?.isVector3) {
    throw new TypeError('Seated view requires a Three.js camera and OrbitControls target.');
  }
  if (!element?.ownerDocument || !element.addEventListener) {
    throw new TypeError('Seated view requires the focusable model canvas.');
  }
  const document = element.ownerDocument;
  const window = document.defaultView;
  const pressed = new Set();
  const pointers = new Set();
  const removeListeners = [];
  const fixedEye = new THREE.Vector3();
  const lookDirection = new THREE.Vector3();
  let active = false;
  let disposed = false;
  let saved = null;
  let yaw = 0;
  let pitch = 0;
  let lookDistance = 1;
  let horizontalInput = 0;
  let verticalInput = 0;
  let drag = null;
  let blockGesture = false;
  let didDrag = false;

  function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    removeListeners.push(() => target.removeEventListener(type, handler, options));
  }

  function releasePointer(pointerId) {
    try {
      if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
      // Capture may already have been released by the browser after cancellation.
    }
  }

  function clear() {
    pressed.clear();
    horizontalInput = 0;
    verticalInput = 0;
    const captured = [...pointers];
    pointers.clear();
    drag = null;
    blockGesture = false;
    captured.forEach(releasePointer);
  }

  function canControl() {
    return active && !disposed && document.activeElement === element
      && document.visibilityState !== 'hidden' && !dialogOpen(document);
  }

  function applyLook() {
    const horizontal = Math.cos(pitch);
    lookDirection.set(Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
    camera.position.copy(fixedEye);
    camera.up.set(0, 1, 0);
    controls.target.copy(fixedEye).addScaledVector(lookDirection, lookDistance);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
  }

  function rotate(horizontal, vertical) {
    yaw = THREE.MathUtils.euclideanModulo(yaw + horizontal + Math.PI, 2 * Math.PI) - Math.PI;
    pitch = THREE.MathUtils.clamp(pitch + vertical, -PITCH_LIMIT, PITCH_LIMIT);
    applyLook();
  }

  function keydown(event) {
    if (!canControl() || event.target !== element || event.defaultPrevented
      || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      pressed.clear();
      return;
    }
    const code = codeFor(event);
    if (!code) return;
    pressed.add(code);
    event.preventDefault();
  }

  function keyup(event) {
    const code = codeFor(event);
    if (code) pressed.delete(code);
  }

  function pointerdown(event) {
    if (!active || disposed || event.target !== element || document.visibilityState === 'hidden'
      || dialogOpen(document) || (event.pointerType !== 'touch' && event.button !== 0)) return;
    element.focus?.({ preventScroll: true });
    if (!canControl()) return;
    if (!pointers.size) didDrag = false;
    pointers.add(event.pointerId);
    try { element.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events may not be capturable. */ }
    if (pointers.size > 1) {
      blockGesture = true;
      didDrag = true;
      drag = null;
    } else if (!blockGesture) {
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY,
        lastX: event.clientX, lastY: event.clientY,
      };
    }
    event.preventDefault();
  }

  function pointermove(event) {
    if (!pointers.has(event.pointerId)) return;
    if (!canControl()) { clear(); return; }
    event.preventDefault();
    if (blockGesture || pointers.size !== 1 || !drag || drag.pointerId !== event.pointerId) return;
    if (!didDrag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
    didDrag = true;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    rotate(dx * DRAG_SENSITIVITY, -dy * DRAG_SENSITIVITY);
  }

  function pointerend(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (drag?.pointerId === event.pointerId) drag = null;
    if (!pointers.size) blockGesture = false;
    releasePointer(event.pointerId);
  }

  function focusChanged() {
    if (document.activeElement !== element) clear();
  }

  function suppressNavigation(event) {
    if (canControl() && !event.ctrlKey && !event.metaKey) event.preventDefault();
  }

  listen(element, 'keydown', keydown);
  listen(document, 'keyup', keyup);
  listen(element, 'pointerdown', pointerdown);
  listen(element, 'pointermove', pointermove);
  listen(element, 'pointerup', pointerend);
  listen(element, 'pointercancel', pointerend);
  listen(element, 'lostpointercapture', pointerend);
  listen(element, 'wheel', suppressNavigation, { passive: false });
  listen(element, 'contextmenu', suppressNavigation);
  listen(element, 'blur', clear);
  listen(document, 'focusin', focusChanged);
  listen(document, 'visibilitychange', clear);
  listen(window, 'blur', clear);

  const controller = {
    get active() { return active; },
    get didDrag() { return didDrag; },
    enter({ position, target }) {
      if (disposed) return false;
      const eye = point(position, 'position');
      const destination = point(target, 'target');
      const direction = destination.clone().sub(eye);
      if (direction.lengthSq() < 0.00000001) {
        camera.getWorldDirection(direction);
        if (!direction.lengthSq()) direction.set(0, 0, -1);
      }
      if (!active) {
        saved = {
          position: camera.position.clone(), target: controls.target.clone(),
          up: camera.up.clone(), quaternion: camera.quaternion.clone(),
          orbit: ORBIT_SETTINGS.map((key) => ({ key, exists: key in controls, value: controls[key] })),
          touchAction: element.style?.touchAction,
        };
        for (const key of ORBIT_SETTINGS) controls[key] = false;
        // Flush any remaining standing-view damping before fixing the eye point.
        controls.update?.();
      }
      active = true;
      clear();
      didDrag = false;
      fixedEye.copy(eye);
      lookDistance = direction.length();
      direction.normalize();
      yaw = Math.atan2(direction.x, -direction.z);
      pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)), -PITCH_LIMIT, PITCH_LIMIT);
      if (element.style) element.style.touchAction = 'none';
      applyLook();
      onChange?.(true);
      element.focus?.({ preventScroll: true });
      return true;
    },
    exit() {
      if (!active) return false;
      active = false;
      clear();
      didDrag = false;
      camera.position.copy(saved.position);
      camera.up.copy(saved.up);
      camera.quaternion.copy(saved.quaternion);
      controls.target.copy(saved.target);
      for (const { key, exists, value } of saved.orbit) {
        if (exists) controls[key] = value;
        else delete controls[key];
      }
      if (element.style) element.style.touchAction = saved.touchAction;
      saved = null;
      camera.updateMatrixWorld(true);
      onChange?.(false);
      return true;
    },
    setLookInput({ horizontal = 0, vertical = 0 } = {}) {
      horizontalInput = canControl() && Number.isFinite(horizontal) ? THREE.MathUtils.clamp(horizontal, -1, 1) : 0;
      verticalInput = canControl() && Number.isFinite(vertical) ? THREE.MathUtils.clamp(vertical, -1, 1) : 0;
    },
    update(deltaSeconds) {
      if (!active || disposed) return false;
      if (!canControl()) {
        clear();
        applyLook();
        return false;
      }
      const held = (...codes) => codes.some((code) => pressed.has(code)) ? 1 : 0;
      const horizontal = THREE.MathUtils.clamp(held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft') + horizontalInput, -1, 1);
      const vertical = THREE.MathUtils.clamp(held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') + verticalInput, -1, 1);
      const magnitude = Math.hypot(horizontal, vertical);
      if (!magnitude || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        applyLook();
        return false;
      }
      const amount = TURN_SPEED * deltaSeconds / Math.max(1, magnitude);
      rotate(horizontal * amount, vertical * amount);
      return true;
    },
    clear,
    dispose() {
      if (disposed) return;
      controller.exit();
      disposed = true;
      clear();
      removeListeners.forEach((remove) => remove());
    },
  };
  return controller;
}
