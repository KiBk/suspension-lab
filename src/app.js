import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Suspension, CORNERS, PULL_POINTS, STEP } from './physics.js';
import { makeCar } from './model.js';
import {loadVehicleAsset} from './car-assets.js';
import { SETUPS, SETUP_ORDER, cycleSetup } from './setups.js';
import { TERRAINS } from './terrain.js';
import { makeRoadView } from './road-view.js';
import { followHorizontal } from './view.js';
import { DrivingInput } from './driving-input.js';
import { VehicleAudio } from './sound.js';

const SPAWN_HEIGHT=.70;
const $=id=>document.getElementById(id), sim=new Suspension(SETUP_ORDER[0]), drivingInput=new DrivingInput();
const sound=new VehicleAudio(),cameraRight=new THREE.Vector3();
const viewport=$('viewport');
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
catch(error){$('loading').innerHTML='Your browser could not start 3D rendering.<br>Enable hardware acceleration or try another browser.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
viewport.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D car with simulated spring and damper suspension');
const scene=new THREE.Scene();scene.fog=new THREE.Fog('#f0f0e8',17,35);
// Broad studio reflections reveal paint contours and machined wheel details
// at every orbit angle, including the side facing away from the key light.
const studio=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
const studioMap=pmrem.fromScene(studio,.06);scene.environment=studioMap.texture;
studio.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(35,1,.1,60);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;
controls.minDistance=4.2;controls.maxDistance=16;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.22;controls.autoRotateSpeed=.65;
controls.target.set(0,.85,0);
let cameraSetup=null;
function resetCamera(){
  const target=new THREE.Vector3(sim.x,sim.setup.height*.28,sim.z),direction=cameraSetup?camera.position.clone().sub(controls.target).normalize():new THREE.Vector3(6.5,3.8,7.7).normalize();
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,sim.setup.length*1.75+1.2);cameraSetup=sim.setupId;controls.update();
}
resetCamera();
scene.add(new THREE.HemisphereLight('#fffef6','#b2b9b5',2.3));
const key=new THREE.DirectionalLight('#fff8ef',3.0);key.position.set(4,9,5);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:20});key.shadow.normalBias=.025;key.shadow.bias=-.0002;scene.add(key,key.target);
const fill=new THREE.DirectionalLight('#edf3ff',2.2);fill.position.set(-5,4,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:'#edeee5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.035;floor.receiveShadow=true;scene.add(floor);
const roadView=makeRoadView(scene,renderer),turntable=roadView.group;
try{await loadVehicleAsset(sim.setupId);}catch(error){$('loading').textContent='The car model could not load. Reload to try again.';throw error;}
const car=makeCar(scene);
let paused=false,slow=false,accumulator=0,last=performance.now(),dragPointer=null,dragStartY=0,dragHeight=0,dragScale=.008;
let uiTimer=0,hoverPointer=null,activeTarget=null;
const canvas=renderer.domElement,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
canvas.tabIndex=-1;
function pickAt(clientX,clientY){
  const rect=canvas.getBoundingClientRect();
  pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);return car.pick(raycaster);
}
const targetName=t=>t.kind==='wheel'?`${CORNERS[t.index].name.toLowerCase()} wheel`:PULL_POINTS[t.index].name.toLowerCase();
function beginSelection(target){
  activeTarget=target;
  if(target.kind==='wheel')sim.beginWheelDrag(target.index);
  else sim.beginBodyDrag(target.anchor,target.index===5);
  dragHeight=sim.drag.hand.translation().y;
  dragScale=2*camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/viewport.clientHeight;
  controls.enabled=false;updateDriveUI();setPaused(false);car.highlight(target);canvas.style.cursor='grabbing';
  $('gesture-message').textContent=`Lifting ${targetName(target)} · release to drop`;
}
function moveGrip(height){
  sim.setDragHeight(height);if(!sim.drag||!activeTarget)return;
  const pressing=sim.drag.target<dragHeight-.015;
  const message=`${pressing?'Pressing':'Lifting'} ${targetName(activeTarget)} · release to ${pressing?'bounce':'drop'}`;
  if($('gesture-message').textContent!==message)$('gesture-message').textContent=message;
}
// Capture first so grabbing geometry never also starts the orbit controller.
canvas.addEventListener('pointerdown',e=>{
  if(dragPointer!==null){e.preventDefault();e.stopImmediatePropagation();return;}
  if(e.button!==0||!e.isPrimary)return;
  const target=pickAt(e.clientX,e.clientY);if(!target)return;
  e.preventDefault();e.stopImmediatePropagation();canvas.focus({preventScroll:true});
  dragPointer=e.pointerId;dragStartY=e.clientY;hoverPointer=null;beginSelection(target);canvas.setPointerCapture(e.pointerId);
},true);
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId===dragPointer){e.preventDefault();e.stopImmediatePropagation();moveGrip(dragHeight+(dragStartY-e.clientY)*dragScale);return;}
  hoverPointer=e.pointerType==='mouse'&&!e.buttons?{x:e.clientX,y:e.clientY}:null;
},true);
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
  if(e.pointerId!==dragPointer)return;e.stopImmediatePropagation();endDrag();
},true);
canvas.addEventListener('pointerleave',()=>{hoverPointer=null;if(!sim.drag)car.highlight(null);});
// Keyboard equivalents are revealed only when focused; pointer users grab the
// model directly, with no overlay buttons or permanent markers.
const keyboardTargets=[...PULL_POINTS.map((p,index)=>({kind:'body',index,anchor:new THREE.Vector3(p.x,p.y,p.z)})),...CORNERS.map((p,index)=>({kind:'wheel',index}))];
const gripNodes=keyboardTargets.map(target=>{
  const b=document.createElement('button');b.className='keyboard-grip';b.textContent=`Lift ${targetName(target)} · Shift + ↑ / ↓`;
  b.setAttribute('aria-label',`Lift ${targetName(target)}`);b.setAttribute('aria-describedby','lift-help');$('lift-controls').appendChild(b);
  b.addEventListener('focus',()=>{car.highlight(target);});
  b.addEventListener('keydown',e=>{
    if(!e.shiftKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();if(!sim.drag){beginSelection(target);}
    moveGrip(sim.drag.target+(e.key==='ArrowUp'?.10:-.10));
  });
  b.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown','Shift'].includes(e.key)&&sim.drag)endDrag();});
  b.addEventListener('blur',()=>{if(sim.drag&&dragPointer===null)endDrag();car.highlight(null);});
  return b;
});
function endDrag(){
  const pointerId=dragPointer;dragPointer=null;sim.release();activeTarget=null;controls.enabled=true;
  if(pointerId!==null&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
  car.highlight(null);canvas.style.cursor='grab';$('gesture-message').textContent='';
}
window.addEventListener('blur',()=>{endDrag();clearDrivingInput();});document.addEventListener('visibilitychange',()=>{endDrag();clearDrivingInput();last=performance.now();accumulator=0;sound.setBlocked(paused||document.hidden);});
const travelNodes=CORNERS.map(c=>{const d=document.createElement('div');d.innerHTML=`<div class="travel-label"><span>${c.short}</span><output>0 mm</output></div><div class="travel-track"><div class="travel-fill"></div></div>`;$('travel-grid').appendChild(d);return{value:d.querySelector('output'),bar:d.querySelector('.travel-fill')};});
function setPaused(value){paused=value;if(value)clearDrivingInput();sound.setBlocked(paused||document.hidden);$('pause').setAttribute('aria-pressed',String(value));$('pause').textContent=value?'▶':'Ⅱ';$('pause').setAttribute('aria-label',value?'Resume simulation':'Pause simulation');}
$('pause').addEventListener('click',()=>{endDrag();setPaused(!paused);});
$('slow').addEventListener('click',()=>{slow=!slow;$('slow').setAttribute('aria-pressed',String(slow));});
$('sound').addEventListener('click',async()=>{
  const button=$('sound');button.disabled=true;
  try{
    sound.setBlocked(paused||document.hidden);const enabled=await sound.toggle();
    button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Mute sounds':'Enable suspension and tyre sounds');
  }catch(error){
    await sound.dispose();button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Retry enabling sounds');
    $('gesture-message').textContent='Sound could not start in this browser. You can keep exploring or try Sound again.';
    console.warn('Vehicle audio could not start:',error.message);
  }finally{button.disabled=false;}
});
function clearDrivingInput(){drivingInput.clear();sim.setInput(0,0);document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('held'));}
function updateDriveUI(){
  $('readout-kind').textContent=sim.driving?'TYRE LOAD · kN':'WHEEL TRAVEL';
}
function driveKey(key,down){
  if(down&&!sim.driving){sim.setDriving(true);updateDriveUI();}
  if(drivingInput.set(key,down)){if(down)setPaused(false);const a=drivingInput.axes;sim.setInput(a.throttle,a.steer);document.querySelectorAll('[data-key]').forEach(b=>b.classList.toggle('held',drivingInput.keys.has(b.dataset.key)));}
}
window.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.shiftKey||e.altKey||e.ctrlKey||e.metaKey||$('about').open||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();driveKey(e.key,true);}
});
window.addEventListener('keyup',e=>{if(drivingInput.set(e.key,false)){e.preventDefault();driveKey(e.key,false);}});
for(const b of document.querySelectorAll('[data-key]')){
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);driveKey(b.dataset.key,true);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>driveKey(b.dataset.key,false));
  b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();driveKey(b.dataset.key,true);}});
  b.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();driveKey(b.dataset.key,false);}});
}
$('reset').addEventListener('click',()=>{endDrag();clearDrivingInput();sim.reset();sim.drop(SPAWN_HEIGHT);sound.reset();updateDriveUI();accumulator=0;last=performance.now();setPaused(false);});
function setCutaway(enabled){$('cutaway').setAttribute('aria-pressed',String(enabled));car.cutaway(enabled);}
$('cutaway').addEventListener('click',()=>setCutaway($('cutaway').getAttribute('aria-pressed')!=='true'));
function setupUI(){
  const cfg=SETUPS[sim.setupId];if(cameraSetup!==sim.setupId)resetCamera();
  $('design-kind').textContent=cfg.tag;$('design-name').textContent=cfg.name;$('design-description').textContent=cfg.description;
  $('setup-name').textContent=cfg.name;$('setup-index').textContent=`${SETUP_ORDER.indexOf(sim.setupId)+1} / ${SETUP_ORDER.length}`;
  const travel=cfg.travel.bump.map((b,i)=>Math.round((b+cfg.travel.droop[i])*1000));
  $('setup-specs').textContent=`${Math.round(sim.totalMass).toLocaleString('en-US')} kg · ${travel.join(' / ')} mm F/R travel · ${cfg.drive.length===4?'AWD':cfg.drive[0]===0?'FWD':'RWD'}`;
  $('vehicle-mass').textContent=`${Math.round(sim.totalMass).toLocaleString('en-US')} kg`;
  $('terrain-description').textContent=TERRAINS[sim.terrainType].description;
  document.querySelectorAll('[data-terrain]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.terrain===sim.terrainType)));
  keyboardTargets.forEach(t=>{if(t.kind==='body')t.anchor.copy(sim.pullAnchor(t.index));});
  car.update(sim);roadView.update(sim);floor.position.y=sim.terrainType==='flat'?-.035:-.35;
}
let changing=false;
async function changeSetup(id,terrain){
  if(changing)return;changing=true;endDrag();clearDrivingInput();
  if(id){$('setup-prev').disabled=$('setup-next').disabled=true;try{await loadVehicleAsset(id);}catch(error){$('gesture-message').textContent='This model could not load. Try selecting it again.';changing=false;$('setup-prev').disabled=$('setup-next').disabled=false;return;}}
  if(terrain)sim.setTerrain(terrain);else sim.setSetup(id);
  sim.drop(SPAWN_HEIGHT);sound.reset();updateDriveUI();accumulator=0;last=performance.now();fault=false;
  setupUI();setPaused(false);telemetry();changing=false;$('setup-prev').disabled=$('setup-next').disabled=false;
}
$('setup-prev').addEventListener('click',()=>changeSetup(cycleSetup(sim.setupId,-1)));
$('setup-next').addEventListener('click',()=>changeSetup(cycleSetup(sim.setupId,1)));
document.querySelectorAll('[data-terrain]').forEach(b=>b.addEventListener('click',()=>changeSetup(null,b.dataset.terrain)));
setupUI();
$('orbit').addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;$('orbit').setAttribute('aria-pressed',String(controls.autoRotate));});
$('about-open').addEventListener('click',()=>{clearDrivingInput();$('about').showModal();});$('about-close').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<550?53:40;camera.updateProjectionMatrix();
  // Keep the car below the heading and above the controls, on wide and narrow screens.
  camera.setViewOffset(w,h,0,h*(w<760?-.005:.04),w,h);
}
new ResizeObserver(resize).observe(viewport);window.addEventListener('resize',resize);resize();
function updateSelection(){
  if(sim.drag){car.highlight(activeTarget);return;}
  const focused=gripNodes.indexOf(document.activeElement);
  const target=focused!==-1?keyboardTargets[focused]:hoverPointer?pickAt(hoverPointer.x,hoverPointer.y):null;
  car.highlight(target);canvas.style.cursor=target?'grab':'default';
}
function telemetry(){
  const state=sim.snapshot();state.wheels.forEach((w,i)=>{
    const tyre=state.tyres[i];travelNodes[i].value.textContent=!w.contact?'AIR':sim.driving?`${(tyre.load/1000).toFixed(1)} kN`:`${Math.round(w.compression*1000)} mm`;
    const axle=i<2?0:1,amount=sim.driving?tyre.load/(sim.totalMass*9.81/2):w.compression/(sim.setup.travel.bump[axle]+sim.setup.travel.droop[axle]);
    travelNodes[i].bar.style.width=`${THREE.MathUtils.clamp(amount,0,1)*100}%`;travelNodes[i].bar.classList.toggle('air',!w.contact);travelNodes[i].bar.classList.toggle('sliding',sim.driving&&tyre.usage>.97);
  });
  $('speed-value').textContent=`${Math.round(sim.groundSpeed*3.6)} km/h`;
  $('cornering-value').textContent=`${Math.abs(sim.lateralG).toFixed(2)} g`;
  const slipping=state.tyres.some(t=>t.usage>.97);$('grip-state').textContent=slipping?'SLIDING':'GRIP';$('grip-state').classList.toggle('sliding',slipping);
  $('motion-label').textContent=sim.driving?`${Math.round(sim.groundSpeed*3.6)} km/h · ${Math.abs(sim.lateralG).toFixed(2)} g`:'ARROW KEYS TO DRIVE';
  $('pitch-value').textContent=`${THREE.MathUtils.radToDeg(sim.pitch).toFixed(1)}°`;$('roll-value').textContent=`${THREE.MathUtils.radToDeg(sim.roll).toFixed(1)}°`;
}

let fault=false;
function frame(now){
  const dt=Math.min((now-last)/1000,.06);last=now;
  if(!paused&&!document.hidden&&!fault){accumulator+=dt*(slow?.25:1);while(accumulator>=STEP){sim.step();sound.sample(sim,STEP);accumulator-=STEP;}
    if(!Number.isFinite(sim.y)||Math.abs(sim.y)>20){fault=true;sim.reset();setPaused(true);$('gesture-message').textContent='Simulation paused. Press Reset to restart.';}
  }
  followHorizontal(camera,controls.target,sim);
  roadView.update(sim);
  key.position.set(sim.x+4,9,sim.z+5);key.target.position.set(sim.x,0,sim.z);
  const autoRotate=controls.autoRotate;controls.autoRotate=autoRotate&&!sim.drag;controls.update(dt);controls.autoRotate=autoRotate;
  const carFrame=car.update(sim);cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);
  sound.render(carFrame,camera.position,cameraRight,slow?.25:1);
  updateSelection();renderer.render(scene,camera);uiTimer+=dt;if(uiTimer>.05){telemetry();uiTimer=0;}
  requestAnimationFrame(frame);
}
$('reset').addEventListener('click',()=>fault=false);
// Start the short drop only once the scene is ready to show it.
sim.drop(SPAWN_HEIGHT);last=performance.now();
$('loading').remove();updateDriveUI();telemetry();requestAnimationFrame(frame);
// Read-only diagnostics for browser verification; no remote data or analytics.
window.suspensionLab={snapshot:()=>({...sim.snapshot(),paused,slow,cutaway:$('cutaway').getAttribute('aria-pressed')==='true',camera:camera.position.toArray(),cameraTarget:controls.target.toArray(),turntable:turntable.position.toArray(),renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
