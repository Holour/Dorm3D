import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildDormitory } from './model/scene.js';
import { dimensionFor } from './model/dimensions.js';
import { targetLabels, config } from './model/config.js';
import { measurements, recordsFor, formatMeasurement } from './measurements.js';
import { createKeyboardNavigation } from './navigation.js';
import { searchMeasurements } from './measurement-search.js';
import { createSeatedView } from './seated-view.js';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const theme=getComputedStyle(document.documentElement);
const viewColors={background:theme.getPropertyValue('--canvas').trim()||'#eef4fb',selection:theme.getPropertyValue('--focus').trim()||'#276bdf',dimension:theme.getPropertyValue('--brand').trim()||'#003399'};
const scene = new THREE.Scene(); scene.background = new THREE.Color(viewColors.background);
const camera = new THREE.PerspectiveCamera(40, 1, .03, 70);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
} catch(error) {
  $('loading').textContent = '当前浏览器未能启用 3D 显示，请启用硬件加速或使用 Chrome / Edge。';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.26;
renderer.localClippingEnabled = true;
renderer.domElement.setAttribute('aria-label','宿舍三维模型，拖动旋转，滚轮缩放，点击部件查询尺寸，方向键或 WASD 移动位置');
renderer.domElement.tabIndex = 0;
viewport.prepend(renderer.domElement);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .085;
controls.minDistance = .25; controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI*.485;
controls.screenSpacePanning = true;
scene.add(new THREE.HemisphereLight('#ffffff','#7d8b74',2.35));
const sunlight = new THREE.DirectionalLight('#fff6df',3.1);
sunlight.position.set(-3,8,7); sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048,2048);
Object.assign(sunlight.shadow.camera,{left:-6,right:6,top:7,bottom:-7,near:.1,far:25});
sunlight.shadow.normalBias = .022; sunlight.shadow.bias = -.0003;
sunlight.target.position.set(0,0,3.4); scene.add(sunlight,sunlight.target);
const fill = new THREE.DirectionalLight('#dcebf5',1.1); fill.position.set(5,4,-3); scene.add(fill);
for(const z of [1.7,4.9]) {const light = new THREE.PointLight('#fff5df',3.5,5,2);light.position.set(0,2.5,z);scene.add(light);}

const dorm = buildDormitory(); scene.add(dorm.model);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:viewColors.background,roughness:1}));
ground.rotation.x = -Math.PI/2;ground.position.y=-.125;ground.receiveShadow=true;scene.add(ground);
const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), viewColors.selection);
selectionBox.material.depthTest = false; selectionBox.material.transparent = true;selectionBox.material.opacity=.65;
selectionBox.renderOrder=12;selectionBox.visible=false;scene.add(selectionBox);
const dimensionGroup = new THREE.Group();scene.add(dimensionGroup);
const clipPlane = new THREE.Plane(new THREE.Vector3(0,-1,0),2.65);
const allMaterials = new Set();dorm.model.traverse(o=>{if(o.isMesh) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>allMaterials.add(m));});
let selection = {target:'room',bedNumber:null,object:dorm.room.parts.room};
let activeMeasurement = null;
let viewName='overall';
let cameraAnimation=null;
let focusedBed=null;
let seatedBed=null;
const wardrobeOpen=new Map([...dorm.units.keys()].map(number=>[number,false]));
const keyboardExtended=new Map([...dorm.units.keys()].map(number=>[number,false]));
const drawerExtended=new Map([...dorm.units.keys()].map(number=>[number,false]));
const navigation=createKeyboardNavigation({camera,controls,element:renderer.domElement,onMove:()=>{cameraAnimation=null;}});
const seated=createSeatedView({camera,controls,element:renderer.domElement,onChange:active=>{
  document.body.dataset.seated=String(active);$('seated-controls').hidden=!active;
  $('enter-seated').disabled=active;
  if(!active){seatedBed=null;camera.fov=40;camera.updateProjectionMatrix();dimensionGroup.visible=true;}
}});
let previousFrameTime=null;
let toastTimeout;
const labelNodes=[];
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const dimensionLabel=document.createElement('div');dimensionLabel.className='dimension-label';dimensionLabel.hidden=true;
$('model-labels').append(dimensionLabel);

function toast(message) { $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),3500); }
function visible(object) { for(let o=object;o;o=o.parent) if(!o.visible)return false;return true; }
function resolveObject(target,bedNumber) {
  if(['room','aisle','balcony'].includes(target))return dorm.room.parts[target];
  if(target==='ladder')return dorm.ladders.find(l=>l.userData.bedNumbers.includes(Number(bedNumber)))||dorm.ladders[0];
  const unit=dorm.units.get(Number(bedNumber))||dorm.units.get(1);
  return target==='unit'?unit.group:unit.parts[target];
}
function select(target,bedNumber=null,object=null) {
  leaveFocus();
  const resolved=object||resolveObject(target,bedNumber);
  if(!resolved)return;
  selection={target,bedNumber:bedNumber?Number(bedNumber):null,object:resolved};
  activeMeasurement=null;
  $('selection-title').textContent=(selection.bedNumber?`${selection.bedNumber}号床 · `:'')+(targetLabels[target]||'室内设施');
  $('selection-subtitle').textContent=target==='unit'?'床、桌与收纳的手工尺寸':target==='fixture'||target==='chair'?'依据照片还原的部件':'已显示实测标注，点选记录可靠近对应位置';
  $('component-select').value=target==='fixture'||target==='chair'?'unit':target;
  if(selection.bedNumber)$('bed-select').value=String(selection.bedNumber);
  else $('bed-select').value='all';
  document.querySelectorAll('[data-bed]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.bed)===selection.bedNumber));
  const rows=recordsFor(target);
  $('selection-count').textContent=`${rows.length} 项实测记录`;
  $('measurement-list').replaceChildren();
  rows.forEach(record=>{
    const button=document.createElement('button');button.type='button';button.className='measurement-row';button.dataset.measurement=record.id;
    const label=document.createElement('span');label.className='measure-name';label.textContent=record.label;
    const value=document.createElement('strong');value.textContent=formatMeasurement(record);
    const note=document.createElement('small');note.textContent=record.qualifier;
    button.append(label,value,note);
    button.addEventListener('click',()=>selectMeasurement(record.id,true));
    $('measurement-list').append(button);
  });
  if(!rows.length){const empty=document.createElement('p');empty.className='empty-measurements';empty.textContent='这个部件没有实测尺寸记录。';$('measurement-list').append(empty);}
  $('selection-note').textContent=target==='aisle'||target==='ladder'?'此处显示原始手工记录。手工测量与安装存在误差，模型保留已确认的整体布局。':target==='unit'?'尺寸来自你的手工测量。柜内尺寸按内腔记录，外壳与安装余量不列为测量值。':'尺寸来自你的手工测量；估计参数不展示。';
  if(target==='ladder')$('selection-subtitle').textContent=`${resolved.userData.bedNumbers.join('、')}号床使用 · 梯子垂直地面`;
  document.querySelector('.detail-panel').scrollTop=0;
  refreshSelection();
  if(rows.length&&target!=='unit')selectMeasurement(rows[0].id);
  if($('measurement-search').value)renderSearchResults();
  setMobilePanel('details');
}
function selectMeasurement(id,focus=false) {
  const record=measurements.find(x=>x.id===id);if(!record)return;
  activeMeasurement=record;
  $('toggle-measures').checked=true;
  document.querySelectorAll('[data-measurement]').forEach(row=>row.classList.toggle('active',row.dataset.measurement===id));
  refreshSelection();
  if(focus){focusSelection();if(!seated.active&&window.matchMedia('(max-width:760px)').matches)document.querySelector('.model-panel').scrollIntoView({block:'start',behavior:'smooth'});}
}
function refreshSelection() {
  if(seated.active){selectionBox.visible=false;dimensionGroup.visible=false;dimensionLabel.hidden=true;return;}
  dimensionGroup.visible=true;
  const object=activeMeasurement?resolveObject(activeMeasurement.target,selection.bedNumber):selection.object;
  const canShow=object&&visible(object);
  selectionBox.visible=Boolean(canShow&&selection.target!=='room'&&selection.target!=='aisle');
  if(canShow)selectionBox.setFromObject(object);
  dimensionGroup.children.forEach(child=>{child.geometry?.dispose();child.material?.dispose();});
  dimensionGroup.clear();dimensionLabel.hidden=true;
  if(!activeMeasurement||!canShow||!$('toggle-measures').checked)return;
  drawDimension(activeMeasurement,object);
}

// Displayed numbers always come from the original measurement catalog.
// Internal dimensions use part centres as anchors; the label keeps their measurement scope.
function drawDimension(record,object) {
  const unit=dorm.units.get(selection.bedNumber||1);
  const {a,b,anchor}=dimensionFor(record,object,unit);
  if(a&&b) {
    const material=new THREE.LineBasicMaterial({color:viewColors.dimension,depthTest:false,transparent:true,opacity:.9});
    const direction=b.clone().sub(a).normalize();
    const tick=Math.abs(direction.y)>.8?new THREE.Vector3(.035,0,0):new THREE.Vector3(0,.035,0);
    const points=[a,b,a.clone().sub(tick),a.clone().add(tick),b.clone().sub(tick),b.clone().add(tick)];
    const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),material);
    line.renderOrder=15;dimensionGroup.add(line);
  }
  dimensionLabel.textContent=`${record.label}  ${formatMeasurement(record)}`;
  dimensionLabel.hidden=false;
  dimensionLabel._position=(anchor||a.clone().lerp(b,.5)).clone().add(new THREE.Vector3(0,.08,0));
}
function focusSelection() {
  if(seated.active){toast('坐姿位置已固定，离开座位后可聚焦查看尺寸。');return;}
  let object=activeMeasurement?resolveObject(activeMeasurement.target,selection.bedNumber):selection.object;
  if(!object)return;
  const target=activeMeasurement?.target||selection.target;
  if(selection.bedNumber) {
    focusedBed=selection.bedNumber;
    dorm.units.forEach((unit,number)=>{unit.group.visible=number===focusedBed;});
    dorm.ladders.forEach(ladder=>{ladder.visible=target==='ladder'&&ladder===object;});
    $('leave-focus').hidden=false;
    $('toggle-walls').checked=false;
    $('toggle-beds').checked=target==='bed'||target==='unit';
    if(target==='wardrobe')setWardrobeOpen(selection.bedNumber,true);
    $('clip-enable').checked=false;
    updateVisibility();
  }
  const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  if(activeMeasurement&&/\.(zone\d|level\d)/.test(activeMeasurement.id)) {
    const dimension=dimensionFor(activeMeasurement,object,dorm.units.get(selection.bedNumber||1));
    if(dimension.a&&dimension.b)center.copy(dimension.a).lerp(dimension.b,.5);
  }
  camera.fov=40;camera.updateProjectionMatrix();
  const dist=Math.max(size.length()*.85,Math.max(size.y,size.x/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.35,1.6);
  let pos=center.clone().add(new THREE.Vector3(2,1.4,-2).normalize().multiplyScalar(dist));
  if(selection.bedNumber) {
    const side=dorm.units.get(selection.bedNumber).layout.side==='left'?-1:1;
    pos=center.clone().add(new THREE.Vector3(side*Math.min(dist,2.1),target==='bed'?dist*.65:dist*.12,0));
  }
  moveCamera(pos,center);document.querySelectorAll('.view-button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
}

function leaveFocus() {
  focusedBed=null;
  dorm.units.forEach(unit=>{unit.group.visible=true;});
  dorm.ladders.forEach(ladder=>{ladder.visible=true;});
  $('leave-focus').hidden=true;
}
$('leave-focus').addEventListener('click',()=>setView('overall'));

function renderSearchResults() {
  const query=$('measurement-search').value.trim();
  const result=searchMeasurements(query);
  const bedNumber=result.bedNumber||selection.bedNumber||1;
  const container=$('measurement-search-results');container.replaceChildren();container.hidden=!query;
  $('clear-search').hidden=!query;
  $('measurement-search-status').textContent=query?`找到 ${result.records.length} 项实测记录 · 家具定位到 ${bedNumber} 号床`:'';
  for(const record of result.records) {
    const button=document.createElement('button');button.type='button';
    const label=document.createElement('span');label.textContent=record.label;
    const value=document.createElement('strong');value.textContent=formatMeasurement(record);
    button.append(label,value);
    button.addEventListener('click',()=>{
      const roomTarget=['room','aisle','balcony'].includes(record.target);
      $('measurement-search').value='';container.hidden=true;$('clear-search').hidden=true;
      select(record.target,roomTarget?null:bedNumber);
      selectMeasurement(record.id,true);
      $('measurement-search-status').textContent=`已定位：${roomTarget?'':`${bedNumber}号床 · `}${record.label}`;
    });
    container.append(button);
  }
  if(query&&!result.records.length){const empty=document.createElement('p');empty.className='empty-measurements';empty.textContent='没有匹配的实测记录，可试试“衣柜”“第二格”或“床板厚度”。';container.append(empty);}
}
$('measurement-search').addEventListener('input',renderSearchResults);
$('measurement-search').addEventListener('keydown',event=>{if(event.key==='Enter'){$('measurement-search-results').querySelector('button')?.click();event.preventDefault();}});
$('clear-search').addEventListener('click',()=>{$('measurement-search').value='';renderSearchResults();$('measurement-search').focus();});
function moveCamera(position,target) {cameraAnimation={start:performance.now(),fromP:camera.position.clone(),toP:position,fromT:controls.target.clone(),toT:target};}
function setView(view,animate=true) {
  if(seated.active)seated.exit();
  $('status').textContent='模型就绪 · 6 个床位 · 45 项实测记录';
  leaveFocus();
  viewName=view;
  document.body.dataset.view=view;
  const positions={overall:[7.7,7.6,-6.6],plan:[0,12.6,3.62],entrance:[0,1.42,.09],balcony:[0,1.45,6.41]};
  const targets={overall:[0,.55,3.35],plan:[0,0,3.6],entrance:[0,1.3,5.7],balcony:[0,1.3,.55]};
  camera.fov=view==='entrance'||view==='balcony'?70:40;camera.updateProjectionMatrix();
  if(view==='plan')positions.plan[2]=3.599;
  if(animate)moveCamera(new THREE.Vector3(...positions[view]),new THREE.Vector3(...targets[view]));
  else {camera.position.set(...positions[view]);controls.target.set(...targets[view]);controls.update();}
  $('toggle-walls').checked=view==='entrance'||view==='balcony';
  if(view==='plan')$('toggle-beds').checked=false;
  else $('toggle-beds').checked=true;
  document.querySelectorAll('.view-button').forEach(button=>{const active=button.id===`view-${view}`;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  updateVisibility();
}
function updateVisibility() {
  dorm.room.walls.visible=$('toggle-walls').checked;
  dorm.room.backdrop.visible=viewName!=='plan'||$('toggle-walls').checked;
  dorm.room.ceiling.visible=$('toggle-walls').checked&&viewName!=='plan';
  dorm.room.fixtures.children.filter(o=>o.name==='Wall outlet').forEach(o=>{o.visible=$('toggle-walls').checked;});
  dorm.units.forEach(unit=>{unit.parts.bed.visible=$('toggle-beds').checked;});
  dorm.units.forEach((unit,number)=>unit.doors.forEach(door=>{door.pivot.rotation.y=wardrobeOpen.get(number)?door.openAngle:door.closedAngle;}));
  const enabled=$('clip-enable').checked;
  clipPlane.constant=.15+Number($('clip-height').value)/100*2.5;
  allMaterials.forEach(material=>{material.clippingPlanes=enabled?[clipPlane]:null;material.clipShadows=true;material.needsUpdate=true;});
  $('clip-height').disabled=!enabled;
  dorm.model.updateMatrixWorld(true);refreshSelection();
}

function setWardrobeOpen(number,open) {
  if(number===null)dorm.units.forEach((_,key)=>wardrobeOpen.set(key,open));
  else wardrobeOpen.set(number,open);
  const count=[...wardrobeOpen.values()].filter(Boolean).length;
  $('toggle-doors').checked=count===dorm.units.size;
  $('toggle-doors').indeterminate=count>0&&count<dorm.units.size;
}
function enterSeated() {
  const number=selection.bedNumber||1;
  const unit=dorm.units.get(number);
  if(!unit)return;
  leaveFocus();cameraAnimation=null;navigation.clear();
  $('toggle-walls').checked=true;$('toggle-beds').checked=true;$('clip-enable').checked=false;
  viewName='seated';document.body.dataset.view='seated';
  updateVisibility();
  const eye=unit.parts.chair.getObjectByName('seated-eye').getWorldPosition(new THREE.Vector3());
  const desktopBounds=new THREE.Box3().setFromObject(unit.parts.desk.getObjectByName('desktop'));
  const target=desktopBounds.getCenter(new THREE.Vector3());target.y=desktopBounds.max.y;
  camera.fov=75;camera.updateProjectionMatrix();
  seatedBed=number;seated.enter({position:eye,target});
  $('seated-status').textContent=`${number}号床 · 坐姿环顾 · 位置固定`;
  $('status').textContent='坐姿模式 · 方向键 / WASD 转头 · 点击键盘架、抽屉或衣柜互动';
  document.querySelectorAll('.view-button').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});
  selectionBox.visible=false;dimensionGroup.visible=false;dimensionLabel.hidden=true;
  if(window.matchMedia('(max-width:760px)').matches)document.querySelector('.model-panel').scrollIntoView({block:'start',behavior:'smooth'});
}
function exitSeated() {
  seated.exit();dimensionGroup.visible=true;
  setView('overall');refreshSelection();
  $('status').textContent='模型就绪 · 6 个床位 · 45 项实测记录';
}
$('enter-seated').addEventListener('click',enterSeated);
$('exit-seated').addEventListener('click',exitSeated);
document.querySelectorAll('[data-look]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();button.setPointerCapture(event.pointerId);renderer.domElement.focus({preventScroll:true});
    const vectors={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]};const [horizontal,vertical]=vectors[button.dataset.look];
    seated.setLookInput({horizontal,vertical});
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>seated.setLookInput({horizontal:0,vertical:0}));
});
function setMobilePanel(panel) {
  document.body.dataset.mobilePanel=panel;
  document.querySelectorAll('button[data-mobile-panel]').forEach(button=>{const active=button.dataset.mobilePanel===panel;button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);});
}
document.querySelectorAll('button[data-mobile-panel]').forEach(button=>button.addEventListener('click',()=>setMobilePanel(button.dataset.mobilePanel)));
function addLabels() {
  for(const [number,unit] of dorm.units) {
    const button=document.createElement('button');button.type='button';button.className='bed-label';button.textContent=`${number}号床`;
    button.setAttribute('aria-label',`查询${number}号床尺寸`);button.addEventListener('click',()=>select('unit',number));
    $('model-labels').append(button);
    const position=new THREE.Vector3(unit.layout.side==='left'?.82:-.82,2.02,unit.layout.center);
    labelNodes.push({node:button,position,number});
  }
}
function projectNode(node,position) {
  const p=position.clone().project(camera);
  const inView=p.z>-1&&p.z<1&&p.x>-1.08&&p.x<1.08&&p.y>-1.08&&p.y<1.08;
  node.style.display=inView?'':'none';
  if(inView){node.style.left=`${(p.x*.5+.5)*viewport.clientWidth}px`;node.style.top=`${(-p.y*.5+.5)*viewport.clientHeight}px`;}
}
function resize() {const width=viewport.clientWidth,height=viewport.clientHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);
let down=null;
renderer.domElement.addEventListener('pointerdown',event=>{renderer.domElement.focus({preventScroll:true});down={x:event.clientX,y:event.clientY};cameraAnimation=null;});
renderer.domElement.addEventListener('pointerup',event=>{
  if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6||(seated.active&&seated.didDrag))return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObject(dorm.model,true).filter(hit=>visible(hit.object)&&(!$('clip-enable').checked||hit.point.y<=clipPlane.constant));
  for(const hit of hits){let node=hit.object;while(node&&!node.userData.target)node=node.parent;if(node?.userData.target){let owner=node;while(owner&&!owner.userData.bedNumber)owner=owner.parent;
    const number=owner?.userData.bedNumber,target=node.userData.target;
    if(seated.active&&number===seatedBed) {
      if(target==='keyboard'){const open=!keyboardExtended.get(number);keyboardExtended.set(number,open);toast(open?'键盘架已拉出':'键盘架已收回');}
      if(target==='drawer'){const open=!drawerExtended.get(number);drawerExtended.set(number,open);toast(open?'抽屉已拉出':'抽屉已收回');}
      if(target==='wardrobe'){const open=!wardrobeOpen.get(number);setWardrobeOpen(number,open);updateVisibility();toast(open?'衣柜已打开':'衣柜已关闭');}
    }
    select(target,number,node);break;
  }}
});
renderer.domElement.addEventListener('keydown',e=>{if(e.key==='Escape'){if(seated.active)exitSeated();else{setView('overall');select('room');}}if(e.key.toLowerCase()==='f')focusSelection();});
for(const view of ['overall','plan','entrance','balcony'])$(`view-${view}`).addEventListener('click',()=>setView(view));
for(const id of ['toggle-walls','toggle-beds','toggle-doors','toggle-measures','clip-enable'])$(id).addEventListener('change',()=>{if(id==='toggle-doors')setWardrobeOpen(null,$('toggle-doors').checked);updateVisibility();});
$('clip-height').addEventListener('input',updateVisibility);
$('bed-select').addEventListener('change',event=>{const num=event.target.value;select(num==='all'?'room':'unit',num==='all'?null:num);});
$('component-select').addEventListener('change',event=>{const t=event.target.value;select(t,['room','aisle','balcony'].includes(t)?null:selection.bedNumber||1);});
document.querySelectorAll('[data-bed]').forEach(button=>button.addEventListener('click',()=>select('unit',Number(button.dataset.bed))));
$('focus-selection').addEventListener('click',focusSelection);
$('reset-view').addEventListener('click',()=>{$('clip-enable').checked=false;setWardrobeOpen(null,false);$('toggle-measures').checked=true;setView('overall');select('room');});

async function exportGLB(download=true) {
  const clone=dorm.model.clone(true);
  clone.traverse(object=>{object.visible=true;});
  // Restore every part for export regardless of the current inspection filters.
  clone.updateMatrixWorld(true);
  const buffer=await new GLTFExporter().parseAsync(clone,{binary:true,onlyVisible:false,maxTextureSize:1024});
  if(download)saveBlob(new Blob([buffer],{type:'model/gltf-binary'}),'Dorm3D-十公寓.glb');
  return buffer;
}
function saveBlob(blob,name) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export-glb').addEventListener('click',async()=>{const button=$('export-glb');button.disabled=true;try{await exportGLB();toast('完整模型已导出，包含实测记录。');}catch(error){console.error(error);toast('导出失败，请重试。');}finally{button.disabled=false;}});
$('export-image').addEventListener('click',()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob){saveBlob(blob,'Dorm3D-当前视角.png');toast('已保存当前模型视角。');}});});

const photos=import.meta.glob('../pictures/*.jpg',{eager:true,query:'?url',import:'default'});
const photoEntries=Object.entries(photos).sort();
const photoLabels=['朝向阳台的全景','朝向入口的全景','上铺墙面插座','床与桌柜正面','床板底面结构','衣柜内部','桌柜与正常座椅','墙边留空','入口侧留空'];
$('reference-count').textContent=String(photoEntries.length);
$('reference-open').setAttribute('aria-label',`参考照片，共 ${photoEntries.length} 张`);
if(!photoEntries.length)$('reference-description').textContent='三维模型和实测尺寸查询可正常使用。';
let referencesCreated=false;
$('reference-open').addEventListener('click',()=>{
  if(!referencesCreated){
    if(!photoEntries.length){
      const empty=document.createElement('p');empty.className='empty-measurements';empty.textContent='参考照片仅在本地保留，公开仓库不包含原始照片。';$('reference-grid').append(empty);
    }else photoEntries.forEach(([,url],index)=>{
      const label=photoLabels[index]||`参考照片 ${index+1}`;
      const figure=document.createElement('figure');const image=document.createElement('img');image.src=url;image.alt=label;image.loading='lazy';
      const caption=document.createElement('figcaption');caption.textContent=label;figure.append(image,caption);$('reference-grid').append(figure);
    });
    referencesCreated=true;
  }
  $('reference-dialog').showModal();
});
$('reference-close').addEventListener('click',()=>$('reference-dialog').close());
$('reference-dialog').addEventListener('click',event=>{if(event.target===$('reference-dialog'))$('reference-dialog').close();});

function render(time) {
  const delta=previousFrameTime===null?0:Math.min((time-previousFrameTime)/1000,.05);previousFrameTime=time;
  if(seated.active)seated.update(delta);else navigation.update(delta);
  if(cameraAnimation){const t=Math.min((time-cameraAnimation.start)/650,1),e=1-(1-t)**3;camera.position.lerpVectors(cameraAnimation.fromP,cameraAnimation.toP,e);controls.target.lerpVectors(cameraAnimation.fromT,cameraAnimation.toT,e);if(t===1)cameraAnimation=null;}
  if(!seated.active)controls.update();
  let furnitureMoving=false;
  dorm.units.forEach((unit,number)=>{
    for(const [slide,extended] of [[unit.keyboardSlide,keyboardExtended],[unit.drawerSlide,drawerExtended]]) {
      const target=extended.get(number)?slide.openPosition:slide.closedPosition;
      if(slide.object.position.distanceToSquared(target)>1e-8){slide.object.position.lerp(target,1-Math.exp(-14*delta));furnitureMoving=true;}
      else slide.object.position.copy(target);
    }
  });
  if(furnitureMoving){dorm.model.updateMatrixWorld(true);refreshSelection();}
  labelNodes.forEach(({node,position,number})=>{const p=position.clone();if(!$('toggle-beds').checked)p.y=.83;projectNode(node,p);node.hidden=seated.active||!$('toggle-measures').checked||(focusedBed!==null&&focusedBed!==number);node.classList.toggle('active',selection.bedNumber===number);});
  if(activeMeasurement&&!dimensionLabel.hidden)projectNode(dimensionLabel,dimensionLabel._position);
  renderer.render(scene,camera);
}
addLabels();resize();setView('overall',false);select('room');
$('loading').hidden=true;$('status').textContent='模型就绪 · 6 个床位 · 45 项实测记录';
renderer.setAnimationLoop(render);

// A small diagnostic interface supports repeatable geometry and interaction verification.
window.__dorm3d={
  ready:true,select,selectMeasurement,setView,exportGLB,
  getSelection:()=>({target:selection.target,bedNumber:selection.bedNumber,measurement:activeMeasurement?.id}),
  getMetrics:()=>({units:dorm.units.size,ladders:dorm.ladders.length,measurements:measurements.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}),
  getCameraState:()=>({position:camera.position.toArray(),target:controls.target.toArray()}),
  getInteractionState:()=>({seated:seated.active,seatedBed,focusedBed,wardrobes:Object.fromEntries(wardrobeOpen),keyboards:Object.fromEntries(keyboardExtended),drawers:Object.fromEntries(drawerExtended)}),
  getPartScreenPoint:(target,number,meshName)=>{const part=resolveObject(target,number);const object=meshName?part.getObjectByName(meshName):part;const p=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);const r=renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height};},
  getVisibility:()=>({walls:dorm.room.walls.visible,beds:[...dorm.units.values()].every(u=>u.parts.bed.visible),doorsOpen:$('toggle-doors').checked,clipped:$('clip-enable').checked}),
};

