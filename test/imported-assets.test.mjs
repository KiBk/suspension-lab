import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {Box3,Vector3,Quaternion} from 'three';import {SETUPS,SETUP_ORDER} from '../src/setups.js';import {getVehicleAsset} from '../src/car-assets.js';import {registerTestAssets} from './car-assets-helper.mjs';import {Suspension} from '../src/physics.js';

test('all original download formats retain their exact recorded bytes and attribution',()=>{
 const root=new URL('../assets/source/',import.meta.url),sums=fs.readFileSync(new URL('SHA256SUMS',root),'utf8').trim().split('\n');assert.equal(sums.length,3);
 for(const line of sums){const [hash,name]=line.split('  ');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(name,root))).digest('hex'),hash);}
 assert.match(fs.readFileSync(new URL('../assets/cars/LICENSE.txt',import.meta.url),'utf8'),/Comrade1280[\s\S]*CC-BY-4.0/);
});

test('processed geometry retains ten bodies and forty centred wheels in metres',async()=>{
 await registerTestAssets(SETUP_ORDER);
 for(const id of SETUP_ORDER){const scene=getVehicleAsset(id),cfg=SETUPS[id];scene.updateMatrixWorld(true);const body=scene.getObjectByName('body');assert.ok(body&&body.children.length===3);const bounds=new Box3().setFromObject(body),size=bounds.getSize(new Vector3());assert.ok(Math.abs(size.z-cfg.length)<.0001);assert.ok(Math.abs(size.x-cfg.width)<.0001);
  for(const [i,name] of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].entries()){const wheel=scene.getObjectByName(name),box=new Box3().setFromObject(wheel),centre=box.getCenter(new Vector3());assert.ok(centre.distanceTo(wheel.position)<.00002,`${id}/${name}: off-centre pivot`);assert.ok(Math.abs((box.max.y-box.min.y)/2-cfg.wheels[i].radius)<.00001);assert.ok(cfg.travel.bump[i<2?0:1]>0&&cfg.travel.droop[i<2?0:1]>0);}
 }
 assert.ok(SETUPS.sports.wheels[2].radius>SETUPS.sports.wheels[0].radius+.015);
});

test('pickup leaf guides resist lateral shear while allowing wheel lift and return',()=>{
 const s=new Suspension('pickup');try{s.beginWheelDrag(2);s.setDragHeight(s.drag.target+.25);for(let k=0;k<360;k++)s.step();assert.equal(s.leaves.length,2);assert.ok(s.constraintError()<.006);s.release();for(let k=0;k<1200;k++)s.step();assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.y-s.restHeight)<.015);
  const p=new Vector3().copy(s.beams[0].body.translation()).sub(s.chassis.translation()).applyQuaternion(new Quaternion().copy(s.chassis.rotation()).invert());assert.ok(Math.abs(p.x)<.003,'leaf packs must prevent lateral axle displacement');
 }finally{s.free();}
});


test('every imported car steers and keeps moving through a body lift',()=>{
 for(const id of SETUP_ORDER){const s=new Suspension(id);try{s.setDriving(true);s.setInput(1,0);for(let k=0;k<1200;k++)s.step();const speed=s.groundSpeed;assert.ok(speed>7,`${id}: drive did not accelerate`);s.setInput(0,.16);for(let k=0;k<120;k++)s.step();assert.ok(Math.abs(s.steering)>.02);assert.ok(Math.abs(s.roll)<.30,`${id}: excessive roll in moderate turn`);s.beginDrag(5);s.setDragHeight(s.drag.target+.50);for(let k=0;k<150;k++)s.step();assert.ok(s.groundSpeed>speed*.75,`${id}: lifting stopped travel`);assert.ok(s.constraintError()<.015,`${id}: moving lift separated linkage`);s.release();}finally{s.free();}}
});
