import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createFurniture } from './furniture.js';
import { createRoom, createLadder } from './room.js';
import { config, getLayout } from './config.js';
import { exportRecords } from '../measurements.js';

export function buildDormitory() {
  const materials = createMaterials();
  const room = createRoom(materials);
  const model = room.group;
  // Looking from the entrance toward +Z, screen-left is +X.
  // Reflect the assembly so the confirmed left row is 1, 2, 3.
  model.scale.x = -1;
  const units = new Map();
  const doors = [];
  for (const item of getLayout()) {
    const result = createFurniture({ ...item, materials });
    const unit = result.group;
    unit.position.set(item.side === 'left' ? -config.room.width/2 : config.room.width/2, 0, item.center);
    unit.rotation.y = item.side === 'left' ? Math.PI/2 : -Math.PI/2;
    if(item.side === 'left') unit.scale.x = -1;
    model.add(unit);
    units.set(item.number, {...result, layout:item});
    doors.push(...result.doors);
  }
  const layout = getLayout();
  const at = number => layout.find(x=>x.number === number);
  const ladders = [
    {side:'left',z:at(1).end,bedNumbers:[1,2]},
    {side:'left',z:at(3).start+.12,bedNumbers:[3]},
    {side:'right',z:at(5).end,bedNumbers:[4,5]},
    {side:'right',z:at(6).end-.12,bedNumbers:[6]},
  ].map(item=>createLadder({...item,materials}));
  model.add(...ladders);
  model.traverse(object => {
    if(object.userData.target) object.userData.measurements = exportRecords(object.userData.target);
  });
  model.updateMatrixWorld(true);
  return { model, room, materials, units, doors, ladders };
}
