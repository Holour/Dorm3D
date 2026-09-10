import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { config, getLayout } from '../src/model/config.js';
import { createFurniture } from '../src/model/furniture.js';
import { createMaterials } from '../src/model/materials.js';
import { buildDormitory } from '../src/model/scene.js';
import { dimensionFor } from '../src/model/dimensions.js';

const catalogue = JSON.parse(readFileSync(new URL('../data/measurements.json', import.meta.url), 'utf8'));
const original = readFileSync(new URL('../docs/寝室空间尺寸.md', import.meta.url), 'utf8');
const byId = new Map(catalogue.measurements.map((item) => [item.id, item]));
const layout = getLayout();
const materials = createMaterials();
const units = layout.map((placement) => ({
  placement,
  ...createFurniture({ ...placement, materials }),
}));

// BufferGeometry stores Float32 positions; allow rounding, not centimetre drift.
function near(actual, expected, label, tolerance = 0.000002) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} m, received ${actual} m`);
}

function bounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function meshesNamed(parent, name) {
  const result = [];
  parent.traverse((object) => {
    if (object.isMesh && object.name === name) result.push(object);
  });
  return result;
}

function onlyMesh(parent, name) {
  const matches = meshesNamed(parent, name);
  assert.equal(matches.length, 1, `Expected one ${name}`);
  return matches[0];
}

function orderedBounds(parent, name, axis) {
  return meshesNamed(parent, name).map(bounds).sort((a, b) => a.min[axis] - b.min[axis]);
}

function interiorBetween(parent, name, axis) {
  const pair = orderedBounds(parent, name, axis);
  assert.equal(pair.length, 2, `Expected two boundary panels: ${name}`);
  return pair[1].min[axis] - pair[0].max[axis];
}

function valueKey(value) {
  return typeof value === 'number' ? String(value) : `${value.min}-${value.max}`;
}

test('查询目录保留原始45条测量，包括范围，且不混入估计或计算尺寸', () => {
  assert.equal(catalogue.schemaVersion, 1);
  assert.equal(catalogue.unit, 'cm');
  assert.equal(catalogue.measurements.length, 45);
  assert.equal(byId.size, 45, 'Measurement IDs must be unique');

  const originalValues = [...original.matchAll(/(\d+)(?:\s*-\s*(\d+))?cm/g)]
    .map((match) => match[2] ? `${match[1]}-${match[2]}` : match[1]);
  assert.equal(originalValues.length, 45, 'Reconcile catalogue coverage when the source changes');
  assert.deepEqual(catalogue.measurements.map((item) => valueKey(item.value)).sort(),
    originalValues.sort(), 'Every source dimension must be retained without numeric replacement');

  const allowedTargets = new Set([
    'room', 'aisle', 'bed', 'ladder', 'wardrobe', 'desk', 'keyboard',
    'drawer', 'computerCabinet', 'bookshelf', 'bookcase', 'balcony',
  ]);
  for (const item of catalogue.measurements) {
    assert.ok(allowedTargets.has(item.target), `Unknown query target ${item.target}`);
    assert.equal(item.display, true);
    assert.equal(item.source, 'docs/寝室空间尺寸.md');
    assert.ok(item.label && typeof item.qualifier === 'string');
    assert.doesNotMatch(item.label, /估计|估算|计算|推导/);
  }
  assert.deepEqual(new Set(catalogue.measurements.map((item) => item.target)), allowedTargets);
  for (const derivedOrEstimated of [2.5, 7, 131, 160, 195, 197, 265]) {
    assert.ok(!catalogue.measurements.some((item) => item.value === derivedOrEstimated),
      `Do not display ${derivedOrEstimated} cm as a supplied measurement`);
  }
});

test('关键测量绑定到正确部件，保持内尺寸及测量边的含义', () => {
  assert.equal(byId.get('bed.length').value, 190);
  assert.match(byId.get('bed.length').qualifier, /内长/);
  assert.equal(byId.get('bed.boardThickness').value, 5);
  assert.equal(byId.get('room.length').value, 660);
  assert.match(byId.get('room.length').qualifier, /不含阳台/);
  assert.deepEqual(byId.get('ladder.wardrobeDoorDistance').value, { min: 38, max: 40 });
  assert.equal(byId.get('aisle.ladderClearWidth').value, 110);
  assert.equal(byId.get('aisle.deskClearWidth').value, 200);
  assert.equal(byId.get('keyboard.bottomHeight').value, 61);
  assert.match(byId.get('keyboard.bottomHeight').qualifier, /底部/);
  assert.equal(byId.get('bookcase.length').value, 55);
  assert.equal(byId.get('bookcase.depth').value, 26);
  for (const target of ['wardrobe', 'drawer', 'computerCabinet']) {
    const interior = catalogue.measurements.filter((item) => item.target === target && /\.inner/.test(item.id));
    assert.equal(interior.length, 3);
    assert.ok(interior.every((item) => /内尺寸/.test(item.qualifier)));
  }
});

test('六床编号、两端30cm、共梯连接及独立床缝符合已确认布局', () => {
  assert.equal(layout.length, 6);
  assert.equal(new Set(layout.map((item) => item.number)).size, 6);
  const sides = Object.fromEntries(['left', 'right'].map((side) => [
    side, layout.filter((item) => item.side === side).sort((a, b) => a.start - b.start),
  ]));
  assert.deepEqual(sides.left.map((item) => item.number), [1, 2, 3]);
  assert.deepEqual(sides.right.map((item) => item.number), [6, 5, 4]);
  for (const row of Object.values(sides)) {
    near(row[0].start, 0.3, 'Entrance clearance');
    near(config.room.length - row[2].end, 0.3, 'Balcony-side clearance');
    for (const item of row) {
      assert.ok(item.end - item.start >= 1.9, 'A slot must contain the measured 190 cm bed interior');
      near(item.center, (item.start + item.end) / 2, 'Placement centre');
    }
  }
  near(sides.left[1].start - sides.left[0].end, 0, 'Beds 1 and 2 share an edge');
  near(sides.right[2].start - sides.right[1].end, 0, 'Beds 5 and 4 share an edge');
  for (const gap of [sides.left[2].start - sides.left[1].end,
    sides.right[1].start - sides.right[0].end]) {
    assert.ok(gap > 0 && gap < 0.05, 'Independent frames need a small positive installation gap');
  }
});

test('每个床位的实测家具对象都存在，可从命中网格回溯到查询目标', () => {
  const environmentTargets = new Set(['room', 'aisle', 'ladder', 'balcony']);
  const furnitureTargets = [...new Set(catalogue.measurements.map((item) => item.target))]
    .filter((target) => !environmentTargets.has(target));
  for (const unit of units) {
    for (const target of [...furnitureTargets, 'chair']) {
      const part = unit.parts[target];
      assert.ok(part, `Bed ${unit.placement.number}: missing ${target}`);
      assert.equal(part.userData.target, target);
      assert.equal(part.userData.bedNumber, unit.placement.number);
      let meshCount = 0;
      part.traverse((mesh) => {
        if (!mesh.isMesh) return;
        meshCount++;
        let queryObject = mesh;
        while (queryObject && !queryObject.userData.target) queryObject = queryObject.parent;
        assert.equal(queryObject?.userData.target, target, `Unqueryable ${mesh.name}`);
        const meshBounds = bounds(mesh);
        assert.ok([...meshBounds.min.toArray(), ...meshBounds.max.toArray()].every(Number.isFinite));
      });
      assert.ok(meshCount > 0, `${target} needs visible selectable geometry`);
    }
    assert.equal(unit.doors.length, 2);
    assert.ok(unit.doors.every((door) => door.pivot?.isObject3D
      && Number.isFinite(door.closedAngle) && Number.isFinite(door.openAngle)));
  }
});

test('床板、桌面、键盘与上方书架保持实测尺寸和高度，镜像床位也一致', () => {
  for (const unit of units) {
    const bed = bounds(onlyMesh(unit.parts.bed, 'bed-board'));
    const bedSize = bed.getSize(new THREE.Vector3());
    near(bedSize.x, 1.9, 'Bed board length');
    near(bedSize.z, 0.9, 'Bed board width');
    near(bedSize.y, 0.05, 'Bed board thickness');
    near(bed.max.y, 1.65, 'Bed surface height');

    const desk = bounds(onlyMesh(unit.parts.desk, 'desktop'));
    const deskSize = desk.getSize(new THREE.Vector3());
    near(deskSize.x, 0.91, 'Clear desktop length, excluding side bookcase');
    near(deskSize.z, 0.58, 'Desktop depth');
    near(desk.max.y, 0.75, 'Desktop surface height');

    const keyboard = bounds(onlyMesh(unit.parts.keyboard, 'keyboard-tray'));
    const keyboardSize = keyboard.getSize(new THREE.Vector3());
    near(keyboardSize.x, 0.85, 'Keyboard tray length');
    near(keyboardSize.z, 0.38, 'Keyboard tray depth');
    near(keyboard.min.y, 0.61, 'Keyboard tray bottom height');

    const shelf = bounds(onlyMesh(unit.parts.bookshelf, 'long-bookshelf'));
    const shelfSize = shelf.getSize(new THREE.Vector3());
    near(shelfSize.x, 0.91, 'Overhead bookshelf length');
    near(shelfSize.z, 0.25, 'Overhead bookshelf depth');
    near(shelf.min.y - desk.max.y, 0.56, 'Desktop to overhead bookshelf bottom');
  }
});

test('衣柜内腔及自上而下四格保持测量值，板厚只用于填补剩余空间', () => {
  for (const unit of units) {
    const wardrobe = unit.parts.wardrobe;
    near(interiorBetween(wardrobe, 'wardrobe-side', 'x'), 0.71, 'Wardrobe internal width');
    const wardrobeBack = bounds(onlyMesh(wardrobe, 'wardrobe-back'));
    const wardrobeDoors = meshesNamed(wardrobe, 'wardrobe-door').map(bounds);
    assert.equal(wardrobeDoors.length, 2);
    wardrobeDoors.forEach((door) =>
      near(door.min.z - wardrobeBack.max.z, 0.56, 'Wardrobe internal depth to closed door'));
    const horizontal = orderedBounds(wardrobe, 'wardrobe-horizontal', 'y');
    assert.equal(horizontal.length, 2);
    near(horizontal[1].min.y - horizontal[0].max.y, 1.5, 'Wardrobe internal height');

    const shelves = orderedBounds(wardrobe, 'wardrobe-internal-shelf', 'y');
    assert.equal(shelves.length, 3);
    for (const shelf of shelves) {
      const size = shelf.getSize(new THREE.Vector3());
      near(size.x, 0.28, 'Wardrobe shelf width');
      near(size.z, 0.52, 'Wardrobe shelf depth');
      assert.ok(size.y > 0, 'Shelf panels must have positive thickness');
    }
    const boundaries = [horizontal[0], ...shelves, horizontal[1]];
    const clearHeights = boundaries.slice(0, -1)
      .map((panel, index) => boundaries[index + 1].min.y - panel.max.y).reverse();
    [0.36, 0.30, 0.40, 0.36].forEach((height, index) =>
      near(clearHeights[index], height, `Wardrobe compartment ${index + 1}, from top`));
    const panelThickness = shelves.reduce((sum, shelf) => sum + shelf.max.y - shelf.min.y, 0);
    near(clearHeights.reduce((sum, height) => sum + height, 0) + panelThickness,
      1.5, 'Compartment openings plus separating shelves close the measured interior');
  }
});

test('抽屉、机柜和侧书柜分别保持自己的内尺寸与层高', () => {
  for (const unit of units) {
    const drawer = unit.parts.drawer;
    near(interiorBetween(drawer, 'drawer-side', 'x'), 0.23, 'Drawer internal width');
    near(interiorBetween(drawer, 'drawer-front-or-back', 'z'), 0.38, 'Drawer internal depth');
    const drawerBottom = bounds(onlyMesh(drawer, 'drawer-bottom'));
    const drawerTop = bounds(onlyMesh(drawer, 'drawer-top'));
    near(drawerTop.min.y - drawerBottom.max.y, 0.12, 'Drawer internal height');

    const computer = unit.parts.computerCabinet;
    near(interiorBetween(computer, 'computer-cabinet-side', 'x'), 0.30, 'Computer cabinet internal width');
    near(interiorBetween(computer, 'computer-cabinet-horizontal', 'y'), 0.51, 'Computer cabinet internal height');
    const computerBack = bounds(onlyMesh(computer, 'computer-cabinet-back'));
    for (const side of meshesNamed(computer, 'computer-cabinet-side').map(bounds)) {
      near(side.max.z - computerBack.max.z, 0.56, 'Open-front computer cabinet internal depth');
    }

    const bookcaseShelves = orderedBounds(unit.parts.bookcase, 'side-bookcase-shelf', 'y');
    assert.equal(bookcaseShelves.length, 4);
    for (const shelf of bookcaseShelves) {
      const size = shelf.getSize(new THREE.Vector3());
      near(size.x, 0.26, 'Side bookcase dimension along the bed length');
      near(size.z, 0.55, 'Side bookcase dimension along furniture depth');
    }
    [0.24, 0.30, 0.24].forEach((height, index) =>
      near(bookcaseShelves[index + 1].min.y - bookcaseShelves[index].max.y,
        height, `Side bookcase compartment ${index + 1}`));
  }
});

test('椅子接地且位于桌前，与床板保持高度分离', () => {
  for (const unit of units) {
    const chair = bounds(unit.parts.chair);
    const seat = bounds(onlyMesh(unit.parts.chair, 'chair-seat'));
    const desk = bounds(onlyMesh(unit.parts.desk, 'desktop'));
    const bed = bounds(onlyMesh(unit.parts.bed, 'bed-board'));
    near(chair.min.y, 0, 'Chair feet contact the floor');
    assert.ok(chair.max.y < bed.min.y, 'Chair must not be placed on the upper bed');
    assert.ok(seat.max.y < desk.max.y, 'Chair seat must remain below the desktop');
    assert.ok(seat.getCenter(new THREE.Vector3()).z > desk.max.z,
      'Chair seat must be in front of its own desk, towards the aisle');
    assert.ok(seat.min.x < desk.max.x && seat.max.x > desk.min.x,
      'Chair must align with its own desk along the room length');
  }
});

test('完整组装从入口看床号左右正确，四架梯子归属唯一且实测目录均可查询', () => {
  const dormitory = buildDormitory();
  dormitory.model.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.02, 100);
  camera.position.set(0, 1.42, 0.09);
  camera.lookAt(0, 1.3, 5.7);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  assert.equal(dormitory.units.size, 6);
  for (const [numbers, screenSide] of [[[1, 2, 3], -1], [[6, 5, 4], 1]]) {
    let previousDepth = -Infinity;
    for (const number of numbers) {
      const unit = dormitory.units.get(number);
      assert.ok(unit, `Missing assembled bed ${number}`);
      const centre = bounds(onlyMesh(unit.parts.bed, 'bed-board')).getCenter(new THREE.Vector3());
      const projected = centre.clone().project(camera);
      assert.ok(projected.x * screenSide > 0,
        `Bed ${number} must appear on the confirmed ${screenSide < 0 ? 'left' : 'right'} from the entrance`);
      assert.ok(projected.z > -1 && projected.z < 1, `Bed ${number} must be in front of the entrance camera`);
      assert.ok(centre.z > previousDepth, 'Bed order must progress from entrance towards balcony');
      previousDepth = centre.z;
    }
  }

  assert.equal(dormitory.ladders.length, 4, 'Shared beds must not create duplicate ladders');
  const ladderAssignments = dormitory.ladders
    .map((ladder) => [...ladder.userData.bedNumbers].sort((a, b) => a - b).join('-')).sort();
  assert.deepEqual(ladderAssignments, ['1-2', '3', '4-5', '6']);
  assert.deepEqual(dormitory.ladders.flatMap((ladder) => ladder.userData.bedNumbers)
    .sort((a, b) => a - b), [1, 2, 3, 4, 5, 6], 'Each bed has exactly one ladder assignment');
  for (const ladder of dormitory.ladders) {
    assert.equal(ladder.parent, dormitory.model);
    assert.equal(ladder.userData.target, 'ladder');
    assert.ok(ladder.userData.measurements.some((item) => item.id === 'ladder.wardrobeDoorDistance'));
    const projected = bounds(ladder).getCenter(new THREE.Vector3()).project(camera);
    const expectedSide = ladder.userData.bedNumbers[0] <= 3 ? -1 : 1;
    assert.ok(projected.x * expectedSide > 0, 'A ladder must stay on the same visible side as its beds');
  }

  const leftLadder = dormitory.ladders.find((ladder) => ladder.userData.bedNumbers.includes(1));
  const rightLadder = dormitory.ladders.find((ladder) => ladder.userData.bedNumbers.includes(4));
  const leftLadderBounds = bounds(leftLadder);
  const rightLadderBounds = bounds(rightLadder);
  near(leftLadderBounds.min.x - rightLadderBounds.max.x, 1.1,
    'Actual narrowest ladder clearance includes protruding steps, not just uprights');
  const leftStepInnerEdge = Math.min(...meshesNamed(leftLadder, 'Ladder step').map((step) => bounds(step).min.x));
  const leftWardrobeDoors = meshesNamed(dormitory.units.get(1).parts.wardrobe, 'wardrobe-door');
  assert.equal(leftWardrobeDoors.length, 2);
  for (const door of leftWardrobeDoors) {
    const clearance = bounds(door).min.x - leftStepInnerEdge;
    assert.ok(clearance >= 0.38 && clearance <= 0.40,
      `Closed cabinet face to ladder inner step edge must be within the measured 38–40 cm range; received ${clearance} m`);
  }

  const roomFloor = bounds(onlyMesh(dormitory.room.parts.room, 'Room tiles'));
  const roomFloorSize = roomFloor.getSize(new THREE.Vector3());
  near(roomFloorSize.x, 3.3, 'Assembled indoor floor width');
  near(roomFloorSize.z, 6.6, 'Assembled indoor floor length, excluding balcony');
  near(roomFloor.min.z, 0, 'Indoor floor starts at the entrance');
  near(roomFloor.max.y, 0, 'Indoor finished floor elevation');
  const balconyFloor = bounds(onlyMesh(dormitory.room.parts.balcony, 'Balcony floor'));
  const balconySize = balconyFloor.getSize(new THREE.Vector3());
  near(balconySize.x, 3.3, 'Assembled balcony width');
  near(balconySize.z, 0.9, 'Assembled balcony depth');
  near(balconyFloor.min.z, roomFloor.max.z, 'Balcony begins after the indoor floor');

  const targetsWithRecords = new Set();
  const attachedIds = new Set();
  dormitory.model.traverse((object) => {
    const records = object.userData.measurements;
    if (!records?.length) return;
    targetsWithRecords.add(object.userData.target);
    for (const record of records) {
      assert.ok(byId.has(record.id), `Unmeasured geometry must not add display data: ${record.id}`);
      assert.equal(record.unit, 'cm');
      assert.deepEqual(record.value, byId.get(record.id).value);
      attachedIds.add(record.id);
    }
  });
  for (const target of new Set(catalogue.measurements.map((item) => item.target))) {
    assert.ok(targetsWithRecords.has(target), `Assembled scene is missing the ${target} query target`);
  }
  assert.deepEqual(attachedIds, new Set(byId.keys()), 'All 45 records must be attached to the assembled scene');
});

test('床板、护栏和衣柜各格的尺寸标线落在各自真实测量边界', () => {
  const dormitory = buildDormitory();
  const unit = dormitory.units.get(1);
  dormitory.model.updateMatrixWorld(true);

  function measuredVertical(id) {
    const record = byId.get(id);
    assert.ok(record, `Missing measurement ${id}`);
    const line = dimensionFor(record, unit.parts[record.target], unit);
    assert.ok(line.a?.isVector3 && line.b?.isVector3, `${id} needs actual world-space endpoints`);
    assert.ok([...line.a.toArray(), ...line.b.toArray()].every(Number.isFinite));
    near(line.a.x, line.b.x, `${id} remains vertical on world X`);
    near(line.a.z, line.b.z, `${id} remains vertical on world Z`);
    near(line.a.distanceTo(line.b), record.value / 100, `${id} line matches its measured length`);
    return { min: Math.min(line.a.y, line.b.y), max: Math.max(line.a.y, line.b.y) };
  }

  for (const [id, low, high] of [
    ['bed.boardThickness', 1.60, 1.65],
    ['bed.sideGuardHeight', 1.65, 1.95],
    ['bed.headGuardHeight', 1.65, 1.97],
  ]) {
    const line = measuredVertical(id);
    near(line.min, low, `${id} lower measurement edge`);
    near(line.max, high, `${id} upper measurement edge`);
  }

  const zones = [1, 2, 3, 4].map((index) => measuredVertical(`wardrobe.zone${index}Height`));
  [0.36, 0.30, 0.40, 0.36].forEach((height, index) =>
    near(zones[index].max - zones[index].min, height, `Wardrobe zone ${index + 1} clear height`));
  for (let index = 0; index < zones.length - 1; index++) {
    assert.ok(zones[index].min > zones[index + 1].max,
      `Wardrobe zone ${index + 1} must be strictly above zone ${index + 2}, separated by a shelf`);
  }
});

test('六床从过道正面看均为左衣柜右书柜，柜内左分层右挂衣且抽屉在桌右', () => {
  const dormitory = buildDormitory();
  dormitory.model.updateMatrixWorld(true);
  assert.equal(dormitory.units.size, 6);

  for (const [number, unit] of dormitory.units) {
    // Derive the viewer's horizontal axis from the assembled world transform,
    // including the row rotation and both furniture/room reflections. Local
    // +z points into the aisle, so the viewer looks in the opposite direction.
    const origin = unit.group.localToWorld(new THREE.Vector3());
    const towardAisle = unit.group.localToWorld(new THREE.Vector3(0, 0, 1))
      .sub(origin).normalize();
    const screenRight = towardAisle.negate().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const screenX = (object) => bounds(object).getCenter(new THREE.Vector3())
      .sub(origin).dot(screenRight);

    const desktopX = screenX(onlyMesh(unit.parts.desk, 'desktop'));
    assert.ok(screenX(unit.parts.wardrobe) < desktopX,
      `Bed ${number}: wardrobe must be left of the desktop when facing it from the aisle`);
    assert.ok(screenX(unit.parts.bookcase) > desktopX,
      `Bed ${number}: side bookcase must be right of the desktop when facing it from the aisle`);
    assert.ok(screenX(unit.parts.drawer) > desktopX,
      `Bed ${number}: drawer must be on the viewer's right beneath the desk`);

    const hangingX = screenX(onlyMesh(unit.parts.wardrobe, 'hanging-rail'));
    const shelves = meshesNamed(unit.parts.wardrobe, 'wardrobe-internal-shelf');
    assert.equal(shelves.length, 3, `Bed ${number}: expected three internal shelves`);
    for (const shelf of shelves) {
      assert.ok(screenX(shelf) < hangingX,
        `Bed ${number}: every wardrobe shelf must be left of the hanging compartment`);
    }
  }
});

test('六床键盘架向过道拉出且外滑轨固定，活动标线与各自椅子的坐姿眼点正确', () => {
  const dormitory = buildDormitory();
  dormitory.model.updateMatrixWorld(true);
  const eyePositions = [];

  for (const [number, unit] of dormitory.units) {
    const slide = unit.keyboardSlide;
    assert.ok(slide?.object?.isObject3D, `Bed ${number}: missing keyboard carriage`);
    assert.ok(slide.closedPosition?.isVector3 && slide.openPosition?.isVector3,
      `Bed ${number}: keyboard motion needs local endpoint positions`);
    const tray = onlyMesh(unit.parts.keyboard, 'keyboard-tray');
    const fixedRails = meshesNamed(unit.parts.keyboard, 'keyboard-slide');
    assert.equal(fixedRails.length, 2, `Bed ${number}: two fixed outer slide channels`);
    slide.object.position.copy(slide.closedPosition);
    dormitory.model.updateMatrixWorld(true);
    const trayClosed = tray.getWorldPosition(new THREE.Vector3());
    const fixedPositions = fixedRails.map((rail) => rail.getWorldPosition(new THREE.Vector3()));
    const origin = unit.group.localToWorld(new THREE.Vector3());
    const towardAisle = unit.group.localToWorld(new THREE.Vector3(0, 0, 1))
      .sub(origin).normalize();
    const record = byId.get('keyboard.length');
    const closedLine = dimensionFor(record, unit.parts.keyboard, unit);

    slide.object.position.copy(slide.openPosition);
    dormitory.model.updateMatrixWorld(true);
    const displacement = tray.getWorldPosition(new THREE.Vector3()).sub(trayClosed);
    assert.ok(displacement.dot(towardAisle) > 0,
      `Bed ${number}: keyboard must extend towards its own aisle side`);
    near(displacement.distanceTo(towardAisle.clone().multiplyScalar(displacement.length())), 0,
      `Bed ${number}: keyboard motion stays along the aisle-facing depth axis`);
    fixedRails.forEach((rail, index) =>
      near(rail.getWorldPosition(new THREE.Vector3()).distanceTo(fixedPositions[index]), 0,
        `Bed ${number}: fixed outer rail ${index + 1} remains attached to the desk`));
    const openLine = dimensionFor(record, unit.parts.keyboard, unit);
    assert.ok(openLine.a?.isVector3 && openLine.b?.isVector3);
    near(openLine.a.distanceTo(openLine.b), 0.85,
      `Bed ${number}: extended tray retains the 85 cm measurement line`);
    for (const endpoint of ['a', 'b']) {
      near(openLine[endpoint].clone().sub(closedLine[endpoint]).distanceTo(displacement), 0,
        `Bed ${number}: measurement endpoint ${endpoint} follows the moving tray`);
    }
    slide.object.position.copy(slide.closedPosition);
    dormitory.model.updateMatrixWorld(true);
    near(tray.getWorldPosition(new THREE.Vector3()).distanceTo(trayClosed), 0,
      `Bed ${number}: keyboard returns to its original closed position`);

    const seat = onlyMesh(unit.parts.chair, 'chair-seat');
    const anchors = [];
    unit.parts.chair.traverse((object) => {
      if (object.name === 'seated-eye') anchors.push(object);
    });
    assert.equal(anchors.length, 1, `Bed ${number}: exactly one seated eye anchor`);
    const eye = anchors[0];
    assert.equal(eye.parent, seat, `Bed ${number}: eye anchor belongs to this chair's seat`);
    const eyeBefore = eye.getWorldPosition(new THREE.Vector3());
    const seatBefore = seat.getWorldPosition(new THREE.Vector3());
    assert.ok(eyeBefore.toArray().every(Number.isFinite), `Bed ${number}: finite world eye position`);
    near(eyeBefore.x, seatBefore.x, `Bed ${number}: eye aligned with its seat on world X`);
    near(eyeBefore.z, seatBefore.z, `Bed ${number}: eye aligned with its seat on world Z`);
    assert.ok(eyeBefore.y > bounds(seat).max.y, `Bed ${number}: eye is above its own seat`);
    eyePositions.push(eyeBefore.clone());

    const chairPosition = unit.parts.chair.position.clone();
    unit.parts.chair.position.add(new THREE.Vector3(0.13, 0.07, 0.09));
    dormitory.model.updateMatrixWorld(true);
    const seatMovement = seat.getWorldPosition(new THREE.Vector3()).sub(seatBefore);
    const eyeMovement = eye.getWorldPosition(new THREE.Vector3()).sub(eyeBefore);
    assert.ok(seatMovement.length() > 0, 'The follow check must actually move the chair');
    near(eyeMovement.distanceTo(seatMovement), 0,
      `Bed ${number}: eye follows the correct chair through all mirrored parent transforms`);
    unit.parts.chair.position.copy(chairPosition);
    dormitory.model.updateMatrixWorld(true);
  }
  assert.equal(eyePositions.length, 6);
  for (let index = 0; index < eyePositions.length; index++) {
    for (const other of eyePositions.slice(index + 1)) {
      assert.ok(eyePositions[index].distanceTo(other) > 0.1,
        'Different chairs must not resolve to a shared or stale world eye position');
    }
  }
});
