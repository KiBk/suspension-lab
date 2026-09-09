import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3,Quaternion,Scene,Raycaster,Matrix4} from 'three';
import {Suspension,STEP} from '../src/physics.js';
import {ElasticChassis,CHASSIS_FLEX} from '../src/chassis-flex.js';
import {SETUPS,SETUP_ORDER} from '../src/setups.js';
import {makeCar} from '../src/model.js';
import {getVehicleAsset} from '../src/car-assets.js';
import {registerTestAssets} from './car-assets-helper.mjs';
const DEG=180/Math.PI;
function rig(id){
 const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=STEP;world.numSolverIterations=32;
 const sim={world,setup:SETUPS[id],bodyMass:SETUPS[id].mass,rideHeight:SETUPS[id].ride,dynamic:[],jointChecks:[],body(p){const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setCanSleep(false));this.dynamic.push(b);return b;}};
 sim.chassis=sim.body(new Vector3(0,sim.rideHeight,0));const structure=new ElasticChassis(sim);return {world,structure,sim};
}
function load(r,axis,torque,steps=720,rotation=new Quaternion()){
 const v=new Vector3();v[axis]=torque;v.applyQuaternion(rotation);
 for(let k=0;k<steps;k++){
  for(const b of r.structure.bodies)b.resetTorques();
  r.structure.bodies[2].addTorque(v,true);r.structure.bodies[0].addTorque(v.clone().negate(),true);r.world.step();
 }
}
test('section subdivision preserves total mass, centre of mass and rotational inertia',()=>{
 for(const id of SETUP_ORDER){const r=rig(id);try{
  r.world.step();const cfg=SETUPS[id];let mass=0,com=0,ix=0,iy=0,iz=0;
  for(const section of r.structure.sections){const b=section.body,m=b.mass(),c=b.localCom(),j=b.principalInertia(),q=new Quaternion().copy(b.principalInertiaLocalFrame()),a=new Matrix4().makeRotationFromQuaternion(q).elements;
   mass+=m;com+=c.z*m;ix+=j.x*a[0]**2+j.y*a[4]**2+j.z*a[8]**2+m*c.z*c.z;iy+=j.x*a[1]**2+j.y*a[5]**2+j.z*a[9]**2+m*c.z*c.z;iz+=j.x*a[2]**2+j.y*a[6]**2+j.z*a[10]**2;}
  assert.ok(Math.abs(mass-cfg.mass)<.001);assert.ok(Math.abs(com)<.001);
  const expected=[cfg.mass*(cfg.length**2+cfg.roof**2)/12,cfg.mass*(cfg.length**2+cfg.width**2)/12,cfg.mass*(cfg.width**2+cfg.roof**2)/12];
  [ix,iy,iz].forEach((v,i)=>assert.ok(Math.abs(v/expected[i]-1)<.00001,`${id}: inertia ${i}`));
 }finally{r.world.free();}}
});
test('known torque produces the specified twist and bending, and unloads without permanent deformation',()=>{
 for(const id of ['pickup','sports'])for(const axis of ['x','z']){
  const r=rig(id);try{
   load(r,axis,3000);const angle=r.structure.state()[axis==='z'?'twist':'bend']*DEG,expected=3000/CHASSIS_FLEX[id][axis==='z'?'torsion':'bending'];
   assert.ok(Math.abs(angle/expected-1)<.02,`${id}/${axis}: ${angle}, expected ${expected}`);
   load(r,axis,0);assert.ok(Math.abs(r.structure.state()[axis==='z'?'twist':'bend'])<.00001);
  }finally{r.world.free();}
 }
});
test('chassis twist follows the car local axis at an arbitrary heading and tilt',()=>{
 const r=rig('pickup'),rotation=new Quaternion().setFromAxisAngle(new Vector3(.3,.8,.4).normalize(),1.1);
 try{
  for(const b of r.structure.bodies){b.setTranslation(new Vector3().copy(b.translation()).applyQuaternion(rotation),true);b.setRotation(rotation,true);}
  load(r,'z',3000,720,rotation);
  assert.ok(Math.abs(r.structure.state().twist*DEG-3000/5500)<.01);assert.ok(Math.abs(r.structure.state().bend)<.0001);
 }finally{r.world.free();}
});
test('diagonal wheel lifts twist the pickup more than the sports car, move the mounts and recover',()=>{
 const twists={};
 for(const id of ['pickup','sports']){const s=new Suspension(id);try{
  const initial=s.structure.state();s.beginWheelDrag(0);s.setDragHeight(s.drag.target+.6);
  for(let k=0;k<360;k++)s.step();twists[id]=Math.abs(s.structure.state().twist-initial.twist);
  assert.ok(s.constraintError()<.001);assert.ok(s.tyres.filter(t=>t.contact).length>=2);
  for(const spring of s.springs){assert.equal(spring.a,s.wheelParts[spring.index].chassis);if(spring.damper)assert.equal(spring.damper.a,s.wheelParts[spring.index].chassis);}
  const frame=s.frame(),rigidTop=new Vector3().copy(s.springs[0].damper?.anchorA??s.springs[0].anchorA).applyQuaternion(new Quaternion().copy(s.chassis.rotation())).add(s.chassis.translation());
  assert.ok(rigidTop.distanceTo(frame.springs[0].damperTop)>.0003,'front mount must physically move with the frame');
  s.release();for(let k=0;k<960;k++)s.step();
  assert.ok(Math.abs(s.structure.state().twist-initial.twist)<.0002);assert.ok(Math.abs(s.y-s.restHeight)<.01);assert.ok(s.wheels.every(w=>w.contact));
 }finally{s.free();}}
 assert.ok(twists.pickup>twists.sports*4,JSON.stringify(twists));
});
test('equal and opposite internal elastic forces do not accelerate the free vehicle',()=>{
 const r=rig('pickup');try{
  load(r,'z',3500,240);load(r,'z',0,240);
  const momentum=new Vector3();for(const b of r.structure.bodies)momentum.addScaledVector(b.linvel(),b.mass());
  assert.ok(momentum.length()<.01,`internal forces injected net momentum: ${momentum.length()}`);
 }finally{r.world.free();}
});
test('deformed body geometry stays finite, follows its physical sections, and leaves source assets intact',async()=>{
 await registerTestAssets(['pickup','sports']);
 for(const id of ['pickup','sports']){
  const source=getVehicleAsset(id),original=[];source.getObjectByName('body').traverse(m=>{if(m.isMesh)original.push([...m.geometry.attributes.position.array]);});
  const s=new Suspension(id),scene=new Scene(),car=makeCar(scene);try{
   car.update(s);s.beginWheelDrag(0);s.setDragHeight(s.drag.target+.6);for(let k=0;k<300;k++)s.step();car.update(s);scene.updateMatrixWorld(true);
   car.body.traverse(m=>{if(m.isMesh){assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));if(m.geometry.attributes.normal)assert.ok([...m.geometry.attributes.normal.array].every(Number.isFinite));}});
   let i=0;source.getObjectByName('body').traverse(m=>{if(m.isMesh)assert.deepEqual([...m.geometry.attributes.position.array],original[i++]);});
   const world=s.point(new Vector3(0,3,s.wheelbase*.6)),hit=car.pick(new Raycaster(world,new Vector3(0,-1,0).applyQuaternion(new Quaternion().copy(s.structure.sections[2].body.rotation()))));assert.equal(hit?.kind,'body');assert.equal(hit.index,4);
   s.beginBodyDrag(hit.anchor,false);assert.ok(s.point(hit.anchor).distanceTo(s.drag.hand.translation())<.00001,'grab must start on the deformed surface');
   const old=scene.children.length;s.reset();car.update(s);assert.equal(scene.children.length,old,'reset must not accumulate scene objects');
  }finally{s.free();scene.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});}
 }
});
