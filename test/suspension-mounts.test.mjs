import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Raycaster,DoubleSide} from 'three';
import {Suspension} from '../src/physics.js';
import {SETUP_ORDER} from '../src/setups.js';
import {getVehicleAsset} from '../src/car-assets.js';
import {registerTestAssets} from './car-assets-helper.mjs';

test('all forty shock tops fit inside the imported body, with front towers under the bonnet',async()=>{
 await registerTestAssets(SETUP_ORDER);
 for(const id of SETUP_ORDER){
  const s=new Suspension(id),body=getVehicleAsset(id).getObjectByName('body'),meshes=[];
  body.updateMatrixWorld(true);
  body.traverse(m=>{if(m.isMesh&&!m.material.name.startsWith('Glass')){m.material.side=DoubleSide;meshes.push(m);}});
  try{for(const [i,shock] of s.frame().springs.entries()){
   // Convert the actual settled physics mount back into the source GLB frame.
   const p=new Vector3().copy(shock.damperTop).sub(s.chassis.translation()).applyQuaternion(new Quaternion().copy(s.chassis.rotation()).invert());
   p.y+=s.restHeight-s.setup.lift;
   const ray=new Raycaster(new Vector3(p.x,4,p.z),new Vector3(0,-1,0));
   const above=ray.intersectObjects(meshes,false).map(h=>h.point.y-p.y).filter(gap=>gap>0);
   assert.ok(above.length,`${id}/${i}: top mount protrudes through body`);
   const gap=Math.min(...above);
   assert.ok(gap>.035,`${id}/${i}: no space for mounting plate (${gap})`);
   if(i<2)assert.ok(gap<.20,`${id}/${i}: front tower ends far below bonnet (${gap})`);
   assert.ok(p.y>s.setup.wheels[i].radius*1.9,`${id}/${i}: shock still ends beside the hub`);
  }}finally{s.free();}
 }
});

test('shock bodies clear the tyres at rest, full compression and droop on every car',()=>{
 for(const id of SETUP_ORDER){const s=new Suspension(id);
  try{for(const pose of ['rest','compression','droop']){
   if(pose!=='rest'){
    if(!s.drag)s.beginDrag(5);
    s.setDragHeight(pose==='compression'?-5:2.5);
    for(let j=0;j<360;j++)s.step();
   }
   const frame=s.frame();
   for(let i=0;i<4;i++){
    const w=frame.wheels[i],q=new Quaternion().copy(w.rotation).invert(),shock=frame.springs[i];
    for(let j=0;j<=32;j++){
     const p=new Vector3().copy(shock.damperBottom).lerp(shock.damperTop,j/32).sub(w.position).applyQuaternion(q);
     // Conservative cylinder envelope: also includes the thinner piston.
     if(Math.hypot(p.y,p.z)<w.radius+.039){
      const clearance=Math.abs(p.x)-s.setup.wheels[i].width/2-.039;
      assert.ok(clearance>.002,`${id}/${i}/${pose}: shock intersects tyre (${clearance})`);
     }
    }
   }
  }}finally{s.free();}
 }
});
