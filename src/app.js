import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Suspension, CORNERS, PULL_POINTS, TYPES, STEP } from './physics.js';
import { makeCar } from './model.js';
import { followHorizontal } from './view.js';
import { DrivingInput } from './driving-input.js';
import { VehicleAudio } from './sound.js';

const SPAWN_HEIGHT=.35;
const $=id=>document.getElementById(id), sim=new Suspension(), drivingInput=new DrivingInput();
const sound=new VehicleAudio(),cameraRight=new THREE.Vector3();
const viewport=$('viewport');
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
catch(error){$('loading').innerHTML='Your browser could not start 3D rendering.<br>Enable hardware acceleration or try another browser.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
viewport.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D car with simulated spring and damper suspension');
const scene=new THREE.Scene();scene.fog=new THREE.Fog('#f0f0e8',17,35);
const camera=new THREE.PerspectiveCamera(35,1,.1,60);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;
controls.minDistance=5.8;controls.maxDistance=16;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.22;controls.autoRotateSpeed=.65;
controls.target.set(0,.85,0);
function resetCamera(){camera.position.set(sim.x+6.5,4.6,sim.z+7.7);controls.target.set(sim.x,.85,sim.z);controls.update();}
resetCamera();
scene.add(new THREE.HemisphereLight('#fffef0','#809477',3));
const key=new THREE.DirectionalLight('#fff4e3',4.8);key.position.set(4,9,5);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:20});key.shadow.normalBias=.025;key.shadow.bias=-.0002;scene.add(key,key.target);
const fill=new THREE.DirectionalLight('#e8f1ff',2);fill.position.set(-5,4,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:'#edeee5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.035;floor.receiveShadow=true;scene.add(floor);
// The circle follows the car; its grid samples fixed ground coordinates.
const turntable=new THREE.Group();scene.add(turntable);
const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.28,3.28,.04,100),new THREE.MeshStandardMaterial({color:'#e6e9dd',roughness:.95}));platform.position.y=-.024;platform.receiveShadow=true;turntable.add(platform);
const ring=new THREE.Mesh(new THREE.RingGeometry(3.28,3.292,120),new THREE.MeshBasicMaterial({color:'#c8cfc0',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;turntable.add(ring);
const gridCanvas=document.createElement('canvas');gridCanvas.width=gridCanvas.height=256;
const gridContext=gridCanvas.getContext('2d');
// One texture tile is one metre, divided into four small squares. Mipmaps
// soften distant lines, while metre lines remain readable at higher speeds.
for(let i=0;i<=4;i++){
  gridContext.strokeStyle=i%4===0?'rgba(142,157,133,.68)':'rgba(158,172,148,.42)';
  gridContext.lineWidth=i%4===0?2:1.25;gridContext.beginPath();
  gridContext.moveTo(i*64,0);gridContext.lineTo(i*64,256);
  gridContext.moveTo(0,i*64);gridContext.lineTo(256,i*64);gridContext.stroke();
}
const gridTexture=new THREE.CanvasTexture(gridCanvas);gridTexture.colorSpace=THREE.SRGBColorSpace;
gridTexture.wrapS=gridTexture.wrapT=THREE.RepeatWrapping;gridTexture.repeat.set(6.56,6.56);
gridTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const grid=new THREE.Mesh(new THREE.CircleGeometry(3.28,100),new THREE.MeshBasicMaterial({map:gridTexture,transparent:true,depthWrite:false}));
grid.rotation.x=-Math.PI/2;grid.position.y=.002;turntable.add(grid);
// Measurement ticks around the turntable.
const ticks=[];for(let i=0;i<72;i++){const a=i*Math.PI*2/72,r=i%6===0?3.05:3.15;ticks.push(new THREE.Vector3(Math.cos(a)*r,.003,Math.sin(a)*r),new THREE.Vector3(Math.cos(a)*3.22,.003,Math.sin(a)*3.22));}
turntable.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks),new THREE.LineBasicMaterial({color:'#bdc6b4',transparent:true,opacity:.65})));
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
  $('readout-kind').textContent=sim.driving?'TYRE LOAD · kN':'SPRING TRAVEL';
}
function driveKey(key,down){
  if(down&&!sim.driving){sim.setDriving(true);updateDriveUI();setCutaway(true);}
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
function selectDesign(type){
  endDrag();clearDrivingInput();sim.setType(type);sound.reset();updateDriveUI();accumulator=0;const design=TYPES[type];
  document.querySelectorAll('[data-design]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.design===type)));
  $('design-kind').textContent=design.tag;$('design-name').textContent=design.name;$('design-description').textContent=design.description;
  $('vehicle-mass').textContent=`${Math.round(sim.totalMass).toLocaleString('en-US')} kg`;
  setCutaway(true);setPaused(false);car.update(sim);telemetry();
}
document.querySelectorAll('[data-design]').forEach(b=>b.addEventListener('click',()=>selectDesign(b.dataset.design)));
document.querySelectorAll('[data-surface]').forEach(b=>b.addEventListener('click',()=>{sim.setSurface(b.dataset.surface);document.querySelectorAll('[data-surface]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));}));
$('vehicle-mass').textContent=`${Math.round(sim.totalMass).toLocaleString('en-US')} kg`;
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
    const amount=sim.driving?tyre.load/(sim.totalMass*9.81/2):w.compression/.44;
    travelNodes[i].bar.style.width=`${THREE.MathUtils.clamp(amount,0,1)*100}%`;travelNodes[i].bar.classList.toggle('air',!w.contact);travelNodes[i].bar.classList.toggle('sliding',sim.driving&&tyre.usage>.97);
  });
  $('speed-value').textContent=`${Math.round(sim.roadSpeed*3.6)} km/h`;
  $('cornering-value').textContent=`${Math.abs(sim.lateralG).toFixed(2)} g`;
  const slipping=state.tyres.some(t=>t.usage>.97);$('grip-state').textContent=slipping?'SLIDING':'GRIP';$('grip-state').classList.toggle('sliding',slipping);
  $('motion-label').textContent=sim.driving?`${Math.round(sim.roadSpeed*3.6)} km/h · ${Math.abs(sim.lateralG).toFixed(2)} g`:'ARROW KEYS TO DRIVE';
  $('pitch-value').textContent=`${THREE.MathUtils.radToDeg(sim.pitch).toFixed(1)}°`;$('roll-value').textContent=`${THREE.MathUtils.radToDeg(sim.roll).toFixed(1)}°`;
}

let fault=false;
function frame(now){
  const dt=Math.min((now-last)/1000,.06);last=now;
  if(!paused&&!document.hidden&&!fault){accumulator+=dt*(slow?.25:1);while(accumulator>=STEP){sim.step();sound.sample(sim,STEP);accumulator-=STEP;}
    if(!Number.isFinite(sim.y)||Math.abs(sim.y)>20){fault=true;sim.reset();setPaused(true);$('gesture-message').textContent='Simulation paused. Press Reset to restart.';}
  }
  followHorizontal(camera,controls.target,sim);
  turntable.position.set(sim.x,0,sim.z);
  // Opposite ground flow reflects actual travel (including reverse and slides).
  // Preserve its phase when physics rebases; pause and quarter speed follow
  // automatically because the grid advances only with physical displacement.
  gridTexture.offset.set((sim.x+sim.worldOrigin.x-3.28)%1,(-sim.z-sim.worldOrigin.z-3.28)%1);
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
