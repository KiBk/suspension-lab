import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Raycaster,DoubleSide,Scene,Matrix4} from 'three';
import {makeCar} from '../src/model.js';
import {Suspension} from '../src/physics.js';
import {SETUPS,SETUP_ORDER} from '../src/setups.js';
import {deepenWheelWells} from '../src/wheel-wells.js';
import {getVehicleAsset} from '../src/car-assets.js';
import {readTestAsset,registerTestAssets} from './car-assets-helper.mjs';

test('deepening wheelhouses preserves the original upper exterior panels',async()=>{
 for(const id of SETUP_ORDER){
  const cfg=SETUPS[id],raw=await readTestAsset(id);let checked=0;
  raw.getObjectByName('body').traverse(m=>{
   if(!m.isMesh||!m.material.name.startsWith('Body'))return;
   const adapted=deepenWheelWells(m.geometry,cfg),p=adapted.attributes.position,triangles=new Set();
   const key=vs=>vs.flatMap(v=>v.toArray().map(n=>n.toFixed(5))).join(',');
   for(let i=0;i<p.count;i+=3)triangles.add(key([0,1,2].map(j=>new Vector3().fromBufferAttribute(p,i+j))));
   const original=m.geometry.attributes.position,ix=m.geometry.index;
   for(let i=0;i<ix.count;i+=3){
    const vs=[0,1,2].map(j=>new Vector3().fromBufferAttribute(original,ix.getX(i+j)));
    const normal=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();
    if(normal.y>.4&&Math.min(...vs.map(v=>v.y))>Math.max(...cfg.wheels.map(w=>w.radius))*1.75){
     assert.ok(triangles.has(key(vs)),`${id}: exterior panel was changed by wheelhouse adaptation`);checked++;
    }
   }
   adapted.dispose();
  });
  assert.ok(checked>20,`${id}: insufficient upper-body coverage`);
 }
});

test('front and rear tyres tuck into the body through their full configured compression',async()=>{
 await registerTestAssets(SETUP_ORDER);
 for(const id of SETUP_ORDER){await registerTestAssets([id]);const s=new Suspension(id),root=getVehicleAsset(id),surfaces=[],scene=new Scene(),car=makeCar(scene);
  try{
   root.updateMatrixWorld(true);
   car.update(s);car.body.getObjectByName('body').traverse(m=>{if(m.isMesh&&!m.material.name.startsWith('Glass')){m.material.side=DoubleSide;surfaces.push(m);}});
   const points=['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map((name,i)=>{
    const wheel=root.getObjectByName(name),out=[];wheel.traverse(m=>{if(!m.isMesh)return;
     const p=m.geometry.attributes.position;for(let j=0;j<p.count;j++){
      const v=new Vector3().fromBufferAttribute(p,j).applyMatrix4(m.matrixWorld).sub(wheel.position);
      if(v.y>s.setup.wheels[i].radius*.2)out.push(v);
     }
    });return out;
   });
   const rest=s.frame();s.beginDrag(5);s.setDragHeight(-5);for(let k=0;k<400;k++)s.step();const compressed=car.update(s);scene.updateMatrixWorld(true);
   const worldVertex=(p,i,f)=>p.clone().applyQuaternion(new Quaternion().copy(f.wheels[i].rotation)).add(f.wheels[i].position);
   const reference=(f,i)=>f.structure[id==='pickup'&&i<2?1:i<2?2:0];
   const pose=f=>new Matrix4().compose(f.position,new Quaternion().copy(f.rotation),new Vector3(1,1,1));
   for(let i=0;i<4;i++){
    const travel=new Vector3().copy(compressed.wheels[i].position).sub(compressed.structure[i<2?2:0].position).applyQuaternion(new Quaternion().copy(compressed.structure[i<2?2:0].rotation).invert()).sub(s.springs[i].travelCentre).y;
    assert.ok(travel>s.setup.travel.bump[i<2?0:1]-.006,`${id}/${i}: cannot use the configured bump stroke`);
    // Compare against the actual deformed panels. Advect the rest tyre with
    // its body section before sweeping suspension travel; whole-body bending
    // must not be mistaken for the wheel crossing an undeformed, frozen shell.
    const bodyMotion=pose(reference(compressed,i)).multiply(pose(reference(rest,i)).invert());
    for(const p of points[i]){
     const start=worldVertex(p,i,rest).applyMatrix4(bodyMotion),end=worldVertex(p,i,compressed),direction=end.clone().sub(start),distance=direction.length();
     const hits=new Raycaster(start,direction.normalize(),.003,Math.max(.003,distance-.003)).intersectObjects(surfaces,false);
     assert.equal(hits.length,0,`${id}/${i}: tyre vertex crosses the body on its compression path`);
    }
   }
  }finally{s.free();}
 }
});
