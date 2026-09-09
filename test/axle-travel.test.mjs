import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Suspension} from '../src/physics.js';

function inspect(s){
  const inverse=new Quaternion().copy(s.chassis.rotation()).invert();
  for(const beam of s.frame().beams)for(const end of [beam.a,beam.b]){
    const relative=new Vector3().copy(end).sub(s.chassis.translation()).applyQuaternion(inverse);
    assert.ok(relative.y<0,`${s.type}: axle crossed above the chassis (${relative.y} m)`);
  }
  // Inspect the live axle's locating links. Baja's independent front arms are
  // exercised separately by the wheel/camber and fast-grab regression tests.
  const rods=new Set(s.links.filter(l=>l.kind==='trailing').map(l=>l.body));
  const at=(body,p)=>new Vector3().copy(p).applyQuaternion(new Quaternion().copy(body.rotation())).add(body.translation());
  for(const j of s.jointChecks)if(rods.has(j.a)||rods.has(j.b)){
    assert.ok(at(j.a,j.p).distanceTo(at(j.b,j.q))<.02,`${s.type}: disconnected axle locating links`);
  }
}
function advance(s,steps){for(let k=0;k<steps;k++){s.step();inspect(s);}}

test('solid axles stay below the chassis through high drops and settle with intact links',()=>{
  for(const type of ['solid','baja']){
    const s=new Suspension();
    try{
      s.setType(type);
      for(const height of [.7,1.5,3,5]){
        s.reset();s.drop(height);advance(s,1440);
        assert.ok(s.wheels.every(w=>w.contact));assert.ok(s.constraintError()<.003);
      }
    }finally{s.free();}
  }
});

test('repeated fast lifts, downward presses and releases cannot invert a live axle',()=>{
  for(const type of ['solid','baja']){
    const s=new Suspension();
    try{
      s.setType(type);
      for(let n=0;n<14;n++){
        const i=[0,1,4,6,2,3,5][n%7];
        s.beginDrag(i,s.pullPoint(i).y+2.4);advance(s,240);
        s.setDragHeight(s.drag.minHeight);advance(s,100);
        s.release();advance(s,480);
      }
      assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});
