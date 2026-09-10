import * as THREE from 'three';
import { config } from './config.js';

// This module locates measured edges. Display values remain in the catalog.
// Every furniture endpoint is transformed from its actual part coordinate
// system, including mirrored casework, mirrored rows and the reflected room.
function geometryBounds(mesh) {
  const p = mesh?.geometry?.parameters;
  if (p && [p.width, p.height, p.depth].every(Number.isFinite)) {
    return new THREE.Box3(
      new THREE.Vector3(-p.width / 2, -p.height / 2, -p.depth / 2),
      new THREE.Vector3(p.width / 2, p.height / 2, p.depth / 2),
    );
  }
  if (!mesh?.geometry) return null;
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.clone() || null;
}

function namedAll(part, name) {
  const meshes = [];
  part?.traverse((child) => {
    if (child.isMesh && child.name === name) meshes.push(child);
  });
  return meshes;
}

function boundsIn(part, mesh) {
  const bounds = geometryBounds(mesh);
  if (!part || !bounds) return null;
  part.updateWorldMatrix(true, false);
  mesh.updateWorldMatrix(true, false);
  const relative = new THREE.Matrix4().copy(part.matrixWorld).invert().multiply(mesh.matrixWorld);
  return bounds.applyMatrix4(relative);
}

function boxesNamed(part, name, sortAxis) {
  const boxes = namedAll(part, name).map((mesh) => boundsIn(part, mesh)).filter(Boolean);
  if (sortAxis) boxes.sort((a, b) => a.min[sortAxis] - b.min[sortAxis]);
  return boxes;
}

function worldLine(part, a, b) {
  part.updateWorldMatrix(true, false);
  return { a: part.localToWorld(a.clone()), b: part.localToWorld(b.clone()) };
}

function span(part, bounds, axis, position) {
  if (!bounds) return null;
  const a = position?.clone() || bounds.getCenter(new THREE.Vector3());
  const b = a.clone();
  a[axis] = bounds.min[axis];
  b[axis] = bounds.max[axis];
  return worldLine(part, a, b);
}

function meshSpan(mesh, axis) {
  const bounds = geometryBounds(mesh);
  if (!bounds) return null;
  const position = bounds.getCenter(new THREE.Vector3());
  if (axis !== 'y') position.y = bounds.max.y;
  if (axis !== 'z') position.z = bounds.max.z;
  if (axis === 'y') position.x = bounds.max.x;
  return span(mesh, bounds, axis, position);
}

function anchorFor(object) {
  if (!object) return { anchor: new THREE.Vector3() };
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  return {
    anchor: bounds.isEmpty()
      ? object.getWorldPosition(new THREE.Vector3())
      : bounds.getCenter(new THREE.Vector3()),
  };
}

function interiorBox(part, kind) {
  const wardrobe = kind === 'wardrobe';
  const drawer = kind === 'drawer';
  const sides = boxesNamed(part,
    wardrobe ? 'wardrobe-side' : drawer ? 'drawer-side' : 'computer-cabinet-side', 'x');
  const horizontals = drawer
    ? [...boxesNamed(part, 'drawer-bottom'), ...boxesNamed(part, 'drawer-top')]
      .sort((a, b) => a.min.y - b.min.y)
    : boxesNamed(part, wardrobe ? 'wardrobe-horizontal' : 'computer-cabinet-horizontal', 'y');
  const back = boxesNamed(part,
    wardrobe ? 'wardrobe-back' : drawer ? 'drawer-front-or-back' : 'computer-cabinet-back', 'z');
  if (sides.length < 2 || horizontals.length < 2 || !back.length || (drawer && back.length < 2)) return null;
  // Wardrobe carcass ends at the inside face of the closed overlay doors.
  // The computer cabinet is open; the drawer has a second end panel.
  const frontInner = drawer ? back.at(-1).min.z : Math.min(...sides.map((side) => side.max.z));
  return new THREE.Box3(
    new THREE.Vector3(sides[0].max.x, horizontals[0].max.y, back[0].max.z),
    new THREE.Vector3(sides.at(-1).min.x, horizontals.at(-1).min.y, frontInner),
  );
}

/**
 * Return {a, b} world-space points on known measurement edges, or {anchor}
 * when only the object's location is established. Never create a line by
 * expanding an arbitrary group centre by the catalog's numeric value.
 */
export function dimensionFor(record, object, unit) {
  const id = record?.id || '';
  const part = unit?.parts?.[record?.target] || object;
  unit?.group?.updateWorldMatrix(true, true);
  part?.updateWorldMatrix(true, true);
  const fallback = () => anchorFor(part || object || unit?.group);
  const first = (name) => namedAll(part, name)[0];
  const useMesh = (name, axis) => meshSpan(first(name), axis) || fallback();

  const { width, length, height, balconyDepth } = config.room;
  const point = (x, y, z) => new THREE.Vector3(x, y, z);
  if (id === 'room.length') return { a: point(-width / 2, 0, 0), b: point(-width / 2, 0, length) };
  if (id === 'room.width') return { a: point(-width / 2, 0, 0), b: point(width / 2, 0, 0) };
  if (id === 'balcony.length') return {
    a: point(-width / 2, 0, length), b: point(width / 2, 0, length),
  };
  if (id === 'balcony.depth') return {
    a: point(width / 2, 0, length), b: point(width / 2, 0, length + balconyDepth),
  };
  if (id.startsWith('aisle.') || id.startsWith('ladder.')) return anchorFor(object || part);
  if (!part) return fallback();

  const spans = {
    'bed.length': ['bed-board', 'x'],
    'bed.width': ['bed-board', 'z'],
    'bed.boardThickness': ['bed-board', 'y'],
    'bed.sideGuardLength': ['aisle-guard', 'x'],
    'bed.sideGuardHeight': ['aisle-guard', 'y'],
    'desk.length': ['desktop', 'x'],
    'desk.depth': ['desktop', 'z'],
    'keyboard.length': ['keyboard-tray', 'x'],
    'keyboard.depth': ['keyboard-tray', 'z'],
    'bookshelf.length': ['long-bookshelf', 'x'],
    'bookshelf.depth': ['long-bookshelf', 'z'],
    'bookcase.length': ['side-bookcase-shelf', 'z'],
    'bookcase.depth': ['side-bookcase-shelf', 'x'],
  };
  if (spans[id]) return useMesh(...spans[id]);

  if (id === 'bed.headGuardHeight') {
    const board = boundsIn(part, first('bed-board'));
    const rail = boxesNamed(part, 'end-guard-top', 'x')[0];
    if (!board || !rail) return fallback();
    const base = rail.getCenter(new THREE.Vector3());
    base.y = board.max.y;
    base.z = rail.max.z;
    const top = base.clone();
    top.y = rail.max.y;
    return worldLine(part, base, top);
  }

  if (id === 'bed.surfaceFloorHeight' || id === 'bed.surfaceCeilingClearance') {
    const board = boundsIn(part, first('bed-board'));
    if (!board) return fallback();
    const surface = board.getCenter(new THREE.Vector3());
    surface.y = board.max.y;
    const other = surface.clone();
    other.y = id === 'bed.surfaceFloorHeight' ? 0 : height;
    return id === 'bed.surfaceFloorHeight'
      ? worldLine(part, other, surface)
      : worldLine(part, surface, other);
  }

  if (id === 'desk.surfaceHeight' || id === 'keyboard.bottomHeight') {
    const bounds = boundsIn(part, first(id === 'desk.surfaceHeight' ? 'desktop' : 'keyboard-tray'));
    if (!bounds) return fallback();
    const end = bounds.getCenter(new THREE.Vector3());
    end.y = id === 'desk.surfaceHeight' ? bounds.max.y : bounds.min.y;
    end.z = bounds.max.z;
    const start = end.clone();
    start.y = 0;
    return worldLine(part, start, end);
  }

  if (id === 'bookshelf.bottomAboveDesk') {
    const shelf = boundsIn(part, first('long-bookshelf'));
    const desktop = boundsIn(part, namedAll(unit?.parts?.desk, 'desktop')[0]);
    if (!shelf || !desktop) return fallback();
    const a = shelf.getCenter(new THREE.Vector3());
    a.y = desktop.max.y;
    a.z = shelf.max.z;
    const b = a.clone();
    b.y = shelf.min.y;
    return worldLine(part, a, b);
  }

  if (id.startsWith('wardrobe.')) {
    const inside = interiorBox(part, 'wardrobe');
    if (!inside) return fallback();
    const interiorAxes = {
      'wardrobe.innerWidth': 'x', 'wardrobe.innerHeight': 'y', 'wardrobe.innerDepth': 'z',
    };
    if (interiorAxes[id]) return span(part, inside, interiorAxes[id]);
    const shelves = boxesNamed(part, 'wardrobe-internal-shelf', 'y');
    if (id === 'wardrobe.shelfWidth' || id === 'wardrobe.shelfDepth') {
      const shelf = shelves.at(-1);
      if (!shelf) return fallback();
      const position = shelf.getCenter(new THREE.Vector3());
      position.y = shelf.max.y;
      return span(part, shelf, id === 'wardrobe.shelfWidth' ? 'x' : 'z', position);
    }
    if (id === 'wardrobe.hangingWidth') {
      const divider = boxesNamed(part, 'wardrobe-divider')[0];
      if (!divider) return fallback();
      const hanging = inside.clone();
      hanging.min.x = divider.max.x;
      return span(part, hanging, 'x');
    }
    const zone = /^wardrobe\.zone([1-4])Height$/.exec(id);
    if (zone && shelves.length === 3) {
      // Catalog wardrobe zone numbers explicitly run from top to bottom.
      const ascendingIndex = 4 - Number(zone[1]);
      const low = ascendingIndex === 0 ? inside.min.y : shelves[ascendingIndex - 1].max.y;
      const high = ascendingIndex === 3 ? inside.max.y : shelves[ascendingIndex].min.y;
      const center = shelves[0].getCenter(new THREE.Vector3());
      center.z = shelves[0].max.z;
      return worldLine(part, point(center.x, low, center.z), point(center.x, high, center.z));
    }
    return fallback();
  }

  if (id.startsWith('drawer.') || id.startsWith('computerCabinet.')) {
    const kind = id.startsWith('drawer.') ? 'drawer' : 'computerCabinet';
    const inside = interiorBox(part, kind);
    const axes = { innerWidth: 'x', innerHeight: 'y', innerDepth: 'z', innerLength: 'z' };
    const axis = axes[id.split('.')[1]];
    return inside && axis ? span(part, inside, axis) : fallback();
  }

  const level = /^bookcase\.level([1-3])Height$/.exec(id);
  if (level) {
    const shelves = boxesNamed(part, 'side-bookcase-shelf', 'y');
    if (shelves.length !== 4) return fallback();
    // The catalog retains its unspecified original layer-number direction.
    // For locating the current model, levels run from bottom to top; the two
    // outer openings are both 24 cm, with the 30 cm opening between them.
    const index = Number(level[1]) - 1;
    const center = shelves[index].getCenter(new THREE.Vector3());
    return worldLine(part,
      point(center.x, shelves[index].max.y, center.z),
      point(center.x, shelves[index + 1].min.y, center.z));
  }

  return fallback();
}
