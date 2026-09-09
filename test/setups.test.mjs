import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Scene,Raycaster} from 'three';
import {Suspension} from '../src/physics.js';
import {SETUPS,SETUP_ORDER,cycleSetup} from '../src/setups.js';
import {makeCar} from '../src/model.js';
const relative=(s,w)=>new Vector3().copy(s.frame().wheels[w].position).sub(s.chassis.translation()).applyQuaternion(new Quaternion().copy(s.chassis.rotation()).invert());

test('six complete setups have their specified mass, wheelbase and mechanisms',()=>{
  assert.equal(SETUP_ORDER.length,6);assert.equal(cycleSetup('baja',-1),'economy');assert.equal(cycleSetup('economy',1),'baja');
  for(const id of SETUP_ORDER){const s=new Suspension(id),cfg=SETUPS[id];try{
    assert.ok(Math.abs(s.totalMass-cfg.mass)<.01);assert.ok(s.wheels.every(w=>w.contact));assert.ok(s.constraintError()<.001);
    assert.equal(s.beams.length,id==='pickup'?2:id==='baja'?1:0);assert.equal(s.torsionArms.length,id==='economy'?2:0);
    assert.ok(Math.abs(s.frame().wheels[0].position.z-s.frame().wheels[2].position.z-cfg.wheelbase)<.04);
  }finally{s.free();}}
});

test('vehicle travel stops retain the mechanism through drops, fast lifts and compression',()=>{
  for(const id of SETUP_ORDER){const s=new Suspension(id),cfg=SETUPS[id];let maxError=0,minTravel=0,maxTravel=0;
    const step=()=>{s.step();maxError=Math.max(maxError,s.constraintError());for(let i=0;i<4;i++){const travel=relative(s,i).y-s.springs.find(p=>p.index===i).travelCentre.y;minTravel=Math.min(minTravel,travel);maxTravel=Math.max(maxTravel,travel);}};
    try{
      s.drop(2.4);for(let i=0;i<720;i++)step();
      s.beginDrag(5);s.setDragHeight(s.drag.target+1.8);for(let i=0;i<120;i++)step();s.setDragHeight(-5);for(let i=0;i<240;i++)step();s.release();for(let i=0;i<720;i++)step();
      assert.ok(minTravel>=-cfg.droop-.02,`${id}: droop ${minTravel}`);assert.ok(maxTravel<=cfg.bump+.025,`${id}: bump ${maxTravel}`);
      assert.ok(maxError<.015,`${id}: separated joint ${maxError}`);assert.ok(s.wheels.every(w=>w.contact),`${id}: did not settle`);assert.ok(Math.abs(s.y-s.restHeight)<.025);
    }finally{s.free();}
  }
});

test('body and wheel picking follows every rebuilt vehicle, including the short hatchback',()=>{
  const scene=new Scene(),car=makeCar(scene);const s=new Suspension('baja');
  try{for(const id of SETUP_ORDER){s.setSetup(id);car.update(s);for(const faded of [false,true]){car.cutaway(faded);scene.updateMatrixWorld(true);
    for(let i=0;i<4;i++){const p=new Vector3().copy(s.frame().wheels[i].position),out=new Vector3(i%2===0?1:-1,0,0);const hit=car.pick(new Raycaster(p.clone().addScaledVector(out,2),out.negate()));assert.deepEqual(hit,{kind:'wheel',index:i},`${id}: wheel ${i}`);}
    for(const [x,z,index] of [[0,0,5],[0,.6,4],[0,-.6,6]]){const top=s.point(new Vector3(x,3,z*SETUPS[id].wheelbase));const picked=car.pick(new Raycaster(top,new Vector3(0,-1,0)));assert.equal(picked?.kind,'body');assert.equal(picked.index,index,`${id}: body area`);}
  }}}finally{s.free();scene.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});}
});

test('all six setups coast stably on the exact flat road at diagonal high speed',()=>{
  for(const id of SETUP_ORDER){const s=new Suspension(id);try{
    s.setDriving(true);const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.73),velocity=new Vector3(0,0,94).applyQuaternion(q);
    for(const b of s.dynamic){b.setTranslation(new Vector3().copy(b.translation()).applyQuaternion(q),true);b.setRotation(q.clone().multiply(new Quaternion().copy(b.rotation())),true);b.setLinvel(velocity,true);}
    for(const t of s.tyres)t.omega=94/s.radius;
    let error=0,vertical=0;for(let k=0;k<960;k++){s.step();error=Math.max(error,s.constraintError());vertical=Math.max(vertical,Math.abs(s.vy));}
    assert.ok(vertical<.03,`${id}: invisible flat-road bump ${vertical}`);assert.ok(error<.001,`${id}: linkage drift`);assert.ok(s.wheels.every(w=>w.contact));
  }finally{s.free();}}
});
