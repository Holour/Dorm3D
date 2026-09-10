import * as THREE from 'three';

/**
 * One bed / desk / wardrobe assembly, in metres.
 * x: entrance → balcony; y: up; z: wall → aisle. The wall is z = 0.
 * Measured clear dimensions are kept separate from the estimated cabinet skins.
 */
export function createFurniture({
  number,
  wardrobeEnd = 'entrance',
  omitStartRail = false,
  omitEndRail = false,
  slotLength = 2,
  materials,
}) {
  const group = new THREE.Group();
  group.name = `bed-unit-${number}`;
  group.userData = { target: 'unit', bedNumber: number };
  const doors = [];
  const parts = {};
  const cabinetAssembly = new THREE.Group();
  cabinetAssembly.name = 'cabinet-assembly';
  cabinetAssembly.scale.x = wardrobeEnd === 'balcony' ? -1 : 1;
  group.add(cabinetAssembly);

  const mat = materials;
  const metal = mat.metal;
  const wood = mat.wood;
  const woodDark = mat.woodDark || wood;
  const black = mat.black || metal;
  const mirrorMaterial = new THREE.MeshStandardMaterial({
    color: 0x859599,
    metalness: 0.88,
    roughness: 0.13,
  });

  function part(key, parent = cabinetAssembly) {
    const result = new THREE.Group();
    result.name = `${key}-${number}`;
    result.userData = { target: key, bedNumber: number };
    parent.add(result);
    parts[key] = result;
    return result;
  }

  function box(parent, name, sx, sy, sz, x, y, z, material = wood) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function bar(parent, name, a, b, radius = 0.0125, material = metal) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 10),
      material,
    );
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function curvedBar(parent, name, points, radius = 0.009, material = metal) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 8, false), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function verticalHandle(parent, name, x, y, z) {
    curvedBar(parent, name, [
      [x, y - 0.075, z],
      [x + 0.009, y - 0.054, z + 0.024],
      [x + 0.012, y, z + 0.035],
      [x + 0.009, y + 0.054, z + 0.024],
      [x, y + 0.075, z],
    ], 0.0045);
  }

  function horizontalHandle(parent, name, x, y, z) {
    curvedBar(parent, name, [
      [x - 0.055, y, z],
      [x - 0.035, y - 0.008, z + 0.025],
      [x + 0.035, y - 0.008, z + 0.025],
      [x + 0.055, y, z],
    ], 0.004);
  }

  // Metal frame and measured 1.90 × 0.90 × 0.05 m bed board.
  const bed = part('bed', group);
  const tube = 0.025;
  const halfFrame = Math.max(slotLength / 2 - tube / 2, 0.9625);
  const backPostZ = tube / 2;
  const frontPostZ = 0.95 - tube / 2;
  box(bed, 'bed-board', 1.9, 0.05, 0.9, 0, 1.625, 0.475, woodDark);
  for (const x of [-halfFrame, halfFrame]) {
    for (const z of [backPostZ, frontPostZ]) {
      box(bed, 'upright', tube, 1.97, tube, x, 0.985, z, metal);
      box(bed, 'foot-cap', tube, 0.028, tube, x, 0.014, z, black);
    }
    box(bed, 'end-bed-support', tube, 0.055, 0.925, x, 1.6225, 0.475, metal);
    box(bed, 'lower-end-tie', tube, 0.025, 0.925, x, 0.17, 0.475, metal);
  }
  for (const z of [backPostZ, frontPostZ]) {
    box(bed, 'long-bed-support', 2 * halfFrame, 0.05, tube, 0, 1.625, z, metal);
  }
  for (const x of [-0.58, 0, 0.58]) {
    box(bed, 'board-crossmember', 0.025, 0.03, 0.9, x, 1.585, 0.475, metal);
  }

  function endRail(x) {
    box(bed, 'end-guard-top', tube, tube, 0.925, x, 1.9575, 0.475, metal);
    for (const z of [0.245, 0.475, 0.705]) {
      box(bed, 'end-guard-spindle', tube, 0.295, tube, x, 1.7975, z, metal);
    }
  }
  if (!omitStartRail) endRail(-halfFrame);
  if (!omitEndRail) endRail(halfFrame);

  // Photographic ladder positions determine the opening in the aisle guard.
  // Ladder geometry itself belongs to the room assembler, so shared ladders
  // are never duplicated inside neighbouring furniture units.
  const ladderAtBalcony = [1, 5, 6].includes(Number(number));
  const guardCenter = (ladderAtBalcony ? -1 : 1) * (0.95 - 0.625);
  const guardLeft = guardCenter - 0.6125;
  const guardRight = guardCenter + 0.6125;
  const guardZ = frontPostZ;
  const guardPath = new THREE.CurvePath();
  const guardPoint = (x, y) => new THREE.Vector3(x, y, guardZ);
  guardPath.add(new THREE.LineCurve3(guardPoint(guardLeft, 1.65), guardPoint(guardLeft, 1.9005)));
  guardPath.add(new THREE.QuadraticBezierCurve3(
    guardPoint(guardLeft, 1.9005), guardPoint(guardLeft, 1.9375), guardPoint(guardLeft + 0.037, 1.9375),
  ));
  guardPath.add(new THREE.LineCurve3(
    guardPoint(guardLeft + 0.037, 1.9375), guardPoint(guardRight - 0.037, 1.9375),
  ));
  guardPath.add(new THREE.QuadraticBezierCurve3(
    guardPoint(guardRight - 0.037, 1.9375), guardPoint(guardRight, 1.9375), guardPoint(guardRight, 1.9005),
  ));
  guardPath.add(new THREE.LineCurve3(guardPoint(guardRight, 1.9005), guardPoint(guardRight, 1.65)));
  const aisleGuard = new THREE.Mesh(new THREE.TubeGeometry(guardPath, 48, 0.0125, 8, false), metal);
  aisleGuard.name = 'aisle-guard';
  aisleGuard.castShadow = true;
  aisleGuard.receiveShadow = true;
  bed.add(aisleGuard);
  for (const fraction of [1 / 3, 2 / 3]) {
    box(bed, 'aisle-guard-spindle', 0.025, 0.2875, 0.025,
      guardLeft + (guardRight - guardLeft) * fraction, 1.79375, guardZ, metal);
  }

  // Canonical casework runs wardrobe → clear desk → side bookcase.
  // Mirroring this assembly moves the wardrobe to the requested room end.
  const skin = 0.015;
  const wardrobeWidth = 0.71 + 2 * skin;
  const clearDeskWidth = 0.91;
  const sideBookcaseWidth = 0.26;
  const totalWidth = wardrobeWidth + clearDeskWidth + sideBookcaseWidth;
  const startX = -totalWidth / 2;
  const wardrobeX = startX + wardrobeWidth / 2;
  const deskStartX = startX + wardrobeWidth;
  const deskX = deskStartX + clearDeskWidth / 2;
  const sideX = deskStartX + clearDeskWidth + sideBookcaseWidth / 2;

  // Wardrobe: clear 71 × 56 × 150 cm; 28 + 2 + 41 cm partition.
  const wardrobe = part('wardrobe');
  // The wardrobe need not sit against the wall. This installation allowance
  // reconciles its measured inner depth and the measured ladder-to-door gap.
  wardrobe.position.z = 0.08;
  const wardrobeBottom = 0.05;
  const wardrobeHeight = 1.5 + 2 * skin;
  const wardrobeBack = 0.035;
  // The front door adds the second skin; the carcass ends at its inside face.
  const wardrobeDepth = 0.56 + skin;
  const wardrobeZ = wardrobeBack + wardrobeDepth / 2;
  const insideBottom = wardrobeBottom + skin;
  const insideLeft = wardrobeX - 0.355;
  box(wardrobe, 'wardrobe-plinth', wardrobeWidth - 0.025, 0.05, 0.565,
    wardrobeX, 0.025, wardrobeZ, woodDark);
  for (const x of [wardrobeX - wardrobeWidth / 2 + skin / 2, wardrobeX + wardrobeWidth / 2 - skin / 2]) {
    box(wardrobe, 'wardrobe-side', skin, wardrobeHeight, wardrobeDepth,
      x, wardrobeBottom + wardrobeHeight / 2, wardrobeZ);
  }
  for (const y of [wardrobeBottom + skin / 2, wardrobeBottom + wardrobeHeight - skin / 2]) {
    box(wardrobe, 'wardrobe-horizontal', 0.71, skin, wardrobeDepth, wardrobeX, y, wardrobeZ);
  }
  box(wardrobe, 'wardrobe-back', 0.71, 1.5, skin,
    wardrobeX, insideBottom + 0.75, wardrobeBack + skin / 2, woodDark);
  box(wardrobe, 'wardrobe-divider', 0.02, 1.5, 0.56,
    insideLeft + 0.28 + 0.01, insideBottom + 0.75, 0.33);
  const shelfThickness = 0.08 / 3;
  let compartmentFloor = insideBottom;
  for (const clearHeight of [0.36, 0.40, 0.30]) {
    const shelfBottom = compartmentFloor + clearHeight;
    box(wardrobe, 'wardrobe-internal-shelf', 0.28, shelfThickness, 0.52,
      insideLeft + 0.14, shelfBottom + shelfThickness / 2, 0.31);
    compartmentFloor = shelfBottom + shelfThickness;
  }
  const hangingStart = insideLeft + 0.30;
  bar(wardrobe, 'hanging-rail',
    [hangingStart + 0.007, 1.47, 0.32],
    [hangingStart + 0.403, 1.47, 0.32], 0.0095);
  for (const x of [hangingStart + 0.008, hangingStart + 0.402]) {
    bar(wardrobe, 'hanging-rail-bracket', [x, 1.47, 0.32], [x, 1.505, 0.32], 0.005);
  }

  const doorGap = 0.003;
  const doorWidth = (wardrobeWidth - doorGap) / 2;
  const doorHeight = wardrobeHeight - 0.006;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'wardrobe-left-door-pivot' : 'wardrobe-right-door-pivot';
    pivot.position.set(wardrobeX + side * wardrobeWidth / 2, wardrobeBottom + 0.003, 0.61);
    wardrobe.add(pivot);
    const center = -side * doorWidth / 2;
    box(pivot, 'wardrobe-door', doorWidth, doorHeight, skin,
      center, doorHeight / 2, skin / 2);
    const handleX = -side * (doorWidth - 0.035);
    verticalHandle(pivot, 'wardrobe-door-handle', handleX, 0.82, skin + 0.002);
    for (const y of [0.18, 1.32]) {
      box(pivot, 'door-hinge', 0.019, 0.046, 0.012,
        -side * 0.012, y, -0.008, metal);
    }
    if (side < 0) {
      box(pivot, 'mirror-frame', 0.225, 1.075, 0.008, center, 0.825, -0.007, metal);
      box(pivot, 'mirror', 0.207, 1.055, 0.002, center, 0.825, -0.012, mirrorMaterial);
      bar(pivot, 'lock-face', [handleX, 0.925, skin], [handleX, 0.925, skin + 0.008], 0.01);
      box(pivot, 'lock-slot', 0.002, 0.008, 0.001, handleX, 0.925, skin + 0.0086, black);
    }
    doors.push({ pivot, closedAngle: 0, openAngle: side * 1.75 });
  }

  const desk = part('desk');
  const desktopThickness = 0.02;
  box(desk, 'desktop', clearDeskWidth, desktopThickness, 0.58,
    deskX,
    0.75 - desktopThickness / 2, 0.05 + 0.58 / 2);
  box(desk, 'desk-left-support', skin, 0.715, 0.55,
    deskStartX + skin / 2, 0.3575, 0.325);
  box(desk, 'desktop-rear-upstand', clearDeskWidth, 0.07, 0.02,
    deskX, 0.785, 0.06);
  box(desk, 'desk-rear-brace', clearDeskWidth, 0.08, skin,
    deskX, 0.64, 0.0625, woodDark);
  bar(desk, 'cable-grommet', [deskX + 0.30, 0.75, 0.15],
    [deskX + 0.30, 0.751, 0.15], 0.019, black);

  const keyboard = part('keyboard');
  const keyboardCarriage = new THREE.Group();
  keyboardCarriage.name = 'keyboard-moving-carriage';
  keyboard.add(keyboardCarriage);
  box(keyboardCarriage, 'keyboard-tray', 0.85, 0.018, 0.38,
    deskX, 0.61 + 0.009, 0.42);
  box(keyboardCarriage, 'keyboard-front-edge', 0.85, 0.034, skin,
    deskX, 0.627, 0.6175);
  for (const x of [deskX - 0.437, deskX + 0.437]) {
    // The outer channels remain attached beneath the desk.
    box(keyboard, 'keyboard-slide', 0.012, 0.022, 0.37,
      x, 0.63, 0.4175, metal);
  }
  for (const x of [deskX - 0.428, deskX + 0.428]) {
    box(keyboardCarriage, 'keyboard-inner-slide', 0.006, 0.014, 0.34,
      x, 0.63, 0.42, metal);
  }
  // Travel is an appearance/interaction allowance, not a measured dimension.
  // A local +z translation always opens towards the aisle on either row.
  const keyboardSlide = {
    object: keyboardCarriage,
    closedPosition: new THREE.Vector3(0, 0, 0),
    openPosition: new THREE.Vector3(0, 0, 0.24),
  };

  // Drawer and computer cabinet intentionally have different external widths.
  // Their measured interiors are 23 × 38 × 12 and 30 × 56 × 51 cm.
  const drawer = part('drawer');
  const drawerCarriage = new THREE.Group();
  drawerCarriage.name = 'drawer-moving-carriage';
  drawer.add(drawerCarriage);
  const drawerBottom = 0.58;
  const drawerOuterWidth = 0.23 + 2 * skin;
  const drawerOuterDepth = 0.38 + 2 * skin;
  const drawerOuterHeight = 0.12 + 2 * skin;
  const drawerFrontZ = 0.633;
  const drawerZ = drawerFrontZ - drawerOuterDepth / 2;
  // The stationary cover completes the closed outer silhouette. The moving
  // box rim stops at its underside, leaving a true 12 cm open interior when
  // pulled out; its taller front fascia retains the original closed face.
  const drawerBoxHeight = drawerOuterHeight - skin;
  const drawerBoxDepth = drawerOuterDepth - skin;
  const drawerBoxZ = drawerZ - skin / 2;
  for (const x of [sideX - drawerOuterWidth / 2 + skin / 2, sideX + drawerOuterWidth / 2 - skin / 2]) {
    box(drawerCarriage, 'drawer-side', skin, drawerBoxHeight, drawerBoxDepth,
      x, drawerBottom + drawerBoxHeight / 2, drawerBoxZ);
  }
  box(drawerCarriage, 'drawer-bottom', 0.23, skin, 0.38,
    sideX, drawerBottom + skin / 2, drawerZ, woodDark);
  box(drawer, 'drawer-top', drawerOuterWidth, skin, drawerBoxDepth,
    sideX, drawerBottom + drawerOuterHeight - skin / 2, drawerBoxZ);
  box(drawerCarriage, 'drawer-front-or-back', 0.23, drawerBoxHeight, skin,
    sideX, drawerBottom + drawerBoxHeight / 2, drawerFrontZ - drawerOuterDepth + skin / 2);
  box(drawerCarriage, 'drawer-front-or-back', drawerOuterWidth, drawerOuterHeight, skin,
    sideX, drawerBottom + drawerOuterHeight / 2, drawerFrontZ - skin / 2);
  horizontalHandle(drawerCarriage, 'drawer-handle', sideX,
    drawerBottom + drawerOuterHeight / 2 + 0.006, drawerFrontZ + 0.002);
  const drawerSlide = {
    object: drawerCarriage,
    closedPosition: new THREE.Vector3(0, 0, 0),
    openPosition: new THREE.Vector3(0, 0, 0.24),
  };

  const computerCabinet = part('computerCabinet');
  const computerWidth = 0.30 + 2 * skin;
  // The computer compartment is open at the front: only its back skin adds
  // to the measured clear depth, unlike the enclosed drawer above it.
  const computerDepth = 0.56 + skin;
  const computerHeight = 0.51 + 2 * skin;
  const computerBottom = 0.035;
  const computerZ = 0.035 + computerDepth / 2;
  box(computerCabinet, 'computer-cabinet-plinth', computerWidth, computerBottom, computerDepth,
    sideX, computerBottom / 2, computerZ, woodDark);
  for (const x of [sideX - computerWidth / 2 + skin / 2, sideX + computerWidth / 2 - skin / 2]) {
    box(computerCabinet, 'computer-cabinet-side', skin, computerHeight, computerDepth,
      x, computerBottom + computerHeight / 2, computerZ);
  }
  for (const y of [computerBottom + skin / 2, computerBottom + computerHeight - skin / 2]) {
    box(computerCabinet, 'computer-cabinet-horizontal', 0.30, skin, computerDepth,
      sideX, y, computerZ);
  }
  box(computerCabinet, 'computer-cabinet-back', 0.30, 0.51, skin,
    sideX, computerBottom + skin + 0.255, 0.0425, woodDark);

  const bookshelf = part('bookshelf');
  box(bookshelf, 'long-bookshelf', 0.91, 0.02, 0.25, deskX, 1.32, 0.175);
  box(bookshelf, 'long-bookshelf-back', 0.91, 0.25, skin,
    deskX, 1.455, 0.0575, woodDark);

  // The narrow side bookcase opens sideways into the desk recess, as in the
  // front photographs; its broad aisle-facing panel is not an invented door.
  const bookcase = part('bookcase');
  box(bookcase, 'bookcase-desktop-extension', sideBookcaseWidth, desktopThickness, 0.58,
    sideX, 0.75 - desktopThickness / 2, 0.05 + 0.58 / 2);
  const bookcaseBottom = 0.75;
  const bookcaseTop = 1.594;
  const bookcaseHeight = bookcaseTop - bookcaseBottom;
  box(bookcase, 'side-bookcase-outer-side', skin, bookcaseHeight, 0.55,
    sideX + sideBookcaseWidth / 2 - skin / 2,
    bookcaseBottom + bookcaseHeight / 2, 0.325);
  box(bookcase, 'side-bookcase-front-panel', sideBookcaseWidth, bookcaseHeight, skin,
    sideX, bookcaseBottom + bookcaseHeight / 2, 0.5925);
  box(bookcase, 'side-bookcase-back', sideBookcaseWidth, bookcaseHeight, skin,
    sideX, bookcaseBottom + bookcaseHeight / 2, 0.0575, woodDark);
  for (const y of [0.758, 1.014, 1.33, 1.586]) {
    box(bookcase, 'side-bookcase-shelf', sideBookcaseWidth, 0.016, 0.55,
      sideX, y, 0.325);
  }

  // One ordinary steel-and-wood chair in front of each clear desk space.
  const chair = part('chair');
  const chairX = deskX;
  const chairZ = 1.02;
  const chairSeat = box(chair, 'chair-seat', 0.38, 0.019, 0.38, chairX, 0.46, chairZ);
  // An invisible camera anchor follows the actual seat through every parent
  // transform. Its eye offset is an estimated viewing pose, never query data.
  const seatedEye = new THREE.Object3D();
  seatedEye.name = 'seated-eye';
  seatedEye.position.set(0, chairSeat.geometry.parameters.height / 2 + 0.74, 0);
  chairSeat.add(seatedEye);
  box(chair, 'chair-back', 0.36, 0.265, 0.018, chairX, 0.735, chairZ + 0.178);
  for (const side of [-1, 1]) {
    const x = chairX + side * 0.155;
    bar(chair, 'chair-front-leg', [x, 0.018, chairZ - 0.185], [x, 0.45, chairZ - 0.142], 0.012);
    curvedBar(chair, 'chair-rear-leg-and-back', [
      [x + side * 0.018, 0.018, chairZ + 0.21],
      [x, 0.43, chairZ + 0.142],
      [x, 0.61, chairZ + 0.193],
      [x, 0.85, chairZ + 0.205],
    ], 0.012);
    bar(chair, 'chair-side-stretcher', [x, 0.16, chairZ - 0.169], [x, 0.16, chairZ + 0.185], 0.010);
    for (const z of [chairZ - 0.185, chairZ + 0.21]) {
      box(chair, 'chair-foot-cap', 0.027, 0.027, 0.03,
        x + (z > chairZ ? side * 0.018 : 0), 0.0135, z, black);
    }
  }
  bar(chair, 'chair-front-stretcher', [chairX - 0.155, 0.175, chairZ - 0.167],
    [chairX + 0.155, 0.175, chairZ - 0.167], 0.01);
  curvedBar(chair, 'chair-back-top', [
    [chairX - 0.155, 0.815, chairZ + 0.205],
    [chairX - 0.13, 0.88, chairZ + 0.205],
    [chairX + 0.13, 0.88, chairZ + 0.205],
    [chairX + 0.155, 0.815, chairZ + 0.205],
  ], 0.012);
  for (const x of [chairX - 0.125, chairX + 0.125]) {
    for (const y of [0.66, 0.81]) {
      bar(chair, 'chair-back-fixing', [x, y, chairZ + 0.166],
        [x, y, chairZ + 0.168], 0.0045, metal);
    }
  }

  return { group, doors, parts, keyboardSlide, drawerSlide };
}
