import * as THREE from 'three';
import { config, getLayout } from './config.js';

export function createRoom(m) {
  const group = new THREE.Group(); group.name = 'Dormitory';
  const walls = new THREE.Group(); walls.name = 'Walls';
  const ceiling = new THREE.Group(); ceiling.name = 'Ceiling';
  const fixtures = new THREE.Group(); fixtures.name = 'Fixtures';
  const floor = new THREE.Group(); floor.name = 'Room floor'; floor.userData.target = 'room';
  const balcony = new THREE.Group(); balcony.name = 'Balcony'; balcony.userData.target = 'balcony';
  const aisle = new THREE.Group(); aisle.name = 'Aisle'; aisle.userData.target = 'aisle';
  group.add(floor, balcony, aisle, walls, ceiling, fixtures);
  const box = (parent, name, w, h, d, x, y, z, material, target) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    if (target) mesh.userData.target = target;
    parent.add(mesh); return mesh;
  };
  const {width: w, length: l, height: h, balconyDepth: b} = config.room;
  box(floor, 'Floor slab', w + .2, .12, l + .1, 0, -.06, l / 2, m.white);
  box(floor, 'Room tiles', w, .018, l, 0, -.009, l / 2, m.floor);
  // The central strip is selectable as the shared aisle, with identical flooring.
  box(aisle, 'Central aisle', 1.08, .001, l - .08, 0, .0006, l / 2, m.floor);
  for (let x = -1.2; x < w / 2; x += .6) box(floor, 'Tile joint', .003, .001, l, x, .0015, l / 2, m.grout);
  for (let z = .3; z < l; z += .6) box(floor, 'Tile joint', w, .001, .003, 0, .0015, z, m.grout);
  box(balcony, 'Balcony slab', w + .2, .12, b, 0, -.06, l + b / 2, m.white);
  box(balcony, 'Balcony floor', w, .018, b, 0, -.009, l + b / 2, m.floor);
  for (const x of [-w/2-.05, w/2+.05]) {
    box(walls, 'Side wall', .1, h, l + b + .1, x, h/2, (l+b)/2, m.wall, 'room');
    box(floor, 'Dark skirting', .018, .11, l, Math.sign(x)*(w/2-.009), .055, l/2, m.black);
    box(balcony, 'Balcony skirting', .018, .11, b, Math.sign(x)*(w/2-.009), .055, l+b/2, m.black);
  }
  // Door and window details follow the photographs. Unmeasured coordinates are appearance parameters.
  const doorW = .86, doorH = 2.05;
  for (const side of [-1,1]) box(walls, 'Entry wall pier', (w-doorW)/2, h, .1, side*(w+doorW)/4, h/2, -.05, m.wall, 'room');
  box(walls, 'Entry lintel', doorW, h-doorH, .1, 0, (h+doorH)/2, -.05, m.wall, 'room');
  const entry = box(walls, 'Entrance door', doorW-.025, doorH-.02, .045, 0, doorH/2, -.04, m.door, 'fixture');
  for(const x of [-doorW/2,doorW/2]) box(walls, 'Door frame', .045, doorH+.03, .11, x, doorH/2, -.015, m.door, 'fixture');
  box(walls, 'Door top frame', doorW+.09, .045, .11, 0, doorH+.015, -.015, m.door, 'fixture');
  box(walls, 'Entry handle', .12, .02, .025, .3, 1.0, .008, m.metal, 'fixture');
  const opening = 1.7, openingX = .05, top = 2.12;
  const leftEdge = openingX-opening/2, rightEdge = openingX+opening/2;
  box(walls,'Balcony wall left',leftEdge+w/2,h,.11,(-w/2+leftEdge)/2,h/2,l,m.wall,'room');
  box(walls,'Balcony wall right',w/2-rightEdge,h,.11,(rightEdge+w/2)/2,h/2,l,m.wall,'room');
  box(walls,'Balcony lintel',opening,h-top,.11,openingX,(h+top)/2,l,m.wall,'room');
  const windowW=.94, sill=.65, windowX=leftEdge+windowW/2;
  box(walls,'Under window',windowW,sill,.11,windowX,sill/2,l,m.wall,'room');
  for(const x of [leftEdge,leftEdge+windowW/2,leftEdge+windowW,rightEdge]) {
    const isWindow = x < leftEdge+windowW-.001;
    const bottom = isWindow ? sill : 0;
    box(walls,'White glazing mullion',.04,top-bottom,.055,x,(top+bottom)/2,l-.06,m.white,'fixture');
  }
  box(walls,'White top frame',opening,.05,.06,openingX,top,l-.06,m.white,'fixture');
  box(walls,'Window sill frame',windowW,.04,.08,windowX,sill,l-.06,m.white,'fixture');
  box(walls,'Window glass',windowW-.05,top-sill-.04,.007,windowX,(top+sill)/2,l-.06,m.glass,'fixture');
  const doorGroup=new THREE.Group(); doorGroup.name='Open balcony door'; doorGroup.position.set(rightEdge,0,l-.06); doorGroup.rotation.y=-.55;
  doorGroup.userData.target='fixture'; walls.add(doorGroup);
  const dw=opening-windowW;
  for (const x of [0,-dw]) box(doorGroup,'Door stile',.045,top,.055,x,top/2,0,m.white);
  for (const y of [.08,.8,top]) box(doorGroup,'Door rail',dw,.045,.055,-dw/2,y,0,m.white);
  box(doorGroup,'Door glazing',dw-.05,top-.12,.008,-dw/2,top/2,0,m.glass);
  box(fixtures,'Air conditioner',.88,.3,.19,.03,2.38,l-.17,m.white,'fixture');
  box(fixtures,'Air conditioner vent',.72,.03,.014,.03,2.30,l-.271,m.grout,'fixture');
  for (let i=0;i<9;i++) box(fixtures,'Radiator fin',.032,.53,.13,windowX-.25+i*.062,.31,l-.15,m.white,'fixture');
  for(const y of [.08,.56]) box(fixtures,'Radiator pipe',.57,.025,.04,windowX,y,l-.12,m.white,'fixture');
  for (const z of [1.72,4.91]) {
    box(ceiling,'Ceiling luminaire',.10,.045,1.04,0,h-.04,z,m.white,'fixture');
    box(ceiling,'Luminaire diffuser',.075,.005,.98,0,h-.066,z,m.white,'fixture');
  }
  box(ceiling,'Ceiling',w,.08,l,0,h+.04,l/2,m.wall,'room');
  for(const x of [-1.59,1.59]) {
    const curtain=box(fixtures,'Blue curtain',.075,1.62,.31,x,1.32,l-.19,m.blue,'fixture');
    for(let i=0;i<5;i++) box(fixtures,'Curtain fold',.09,1.62,.018,x,1.32,l-.32+i*.06,m.blue,'fixture');
  }
  for(const y of [.18,.43,.68,.93]) box(balcony,'Balcony rail',w,.025,.025,0,y,l+b-.025,m.metal);
  for(const x of [-w/2+.05,0,w/2-.05]) box(balcony,'Balcony post',.025,1.08,.025,x,.54,l+b-.025,m.metal);
  // Outlets are visible in the references; their coordinates are approximate and carry no dimensions.
  for(const unit of getLayout()) {
    const x=unit.side==='left'?-w/2+.015:w/2-.015;
    for(const y of [1.0,1.82]) box(fixtures,'Wall outlet',.022,.083,.083,x,y,unit.center,m.white,'fixture');
  }
  const backdrop=new THREE.Group();backdrop.name='Balcony window wall';group.add(backdrop);
  for(const child of [...walls.children]) {
    if(/^(Balcony|Under window|White|Window|Open balcony)/.test(child.name))backdrop.attach(child);
  }
  return { group, walls, backdrop, ceiling, fixtures, parts: {room:floor, balcony, aisle}, entry };
}

export function createLadder({ side, z, bedNumbers, materials: m }) {
  const group=new THREE.Group(); group.name=`Ladder ${bedNumbers.join('-')}`;
  group.userData={target:'ladder',bedNumber:bedNumbers[0],bedNumbers};
  const sign=side==='left'?-1:1;
  group.position.set(sign*(config.room.width/2-config.approximation.ladderDepthFromWall-.0125),0,z);
  const box=(name,w,h,d,x,y,zz,mat)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,zz);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  // The 110 cm clear width is between the closest tread edges, not upright centres.
  group.position.x=sign*(.55+.055);
  for(const zz of [-.19,.19]) {
    box('Ladder upright',.025,1.72,.025,0,.86,zz,m.metal);
    box('Upper connection',.15,.025,.025,sign*.075,1.61,zz,m.metal);
    box('Foot cap',.033,.025,.033,0,.014,zz,m.black);
  }
  for(const y of [.27,.59,.91,1.23,1.55]) {
    box('Ladder step',.11,.035,.405,0,y,0,m.metal);
    for(const xx of [-.025,.005,.035]) box('Tread groove',.006,.004,.34,xx,y+.019,0,m.white);
  }
  return group;
}
