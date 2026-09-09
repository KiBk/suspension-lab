import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Suspension,TYPES,STEP,PULL_POINTS} from '../src/physics.js';
const advance=(s,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)s.step();};
const v=p=>new Vector3(p.x,p.y,p.z);
const com=s=>s.dynamic.reduce((sum,b)=>sum.add(v(b.translation()).multiplyScalar(b.mass())),new Vector3()).divideScalar(s.totalMass);
const angleBetween=(a,b)=>new Quaternion(a.x,a.y,a.z,a.w).angleTo(new Quaternion(b.x,b.y,b.z,b.w));

test('all designs start supported by ground with closed physical joints',()=>{
  for(const type of Object.keys(TYPES)){const s=new Suspension();s.setType(type);assert.ok(s.y>.65&&s.y<1.5);assert.ok(s.wheels.every(w=>w.contact));assert.ok(s.constraintError()<.001);assert.ok(s.totalMass>1300&&s.totalMass<1700);s.free();}
});
test('roof grip translates the whole vehicle and retains its orientation',()=>{
  for(const type of Object.keys(TYPES))for(const i of [5]){
    const s=new Suspension();s.setType(type);const position=s.chassis.translation(),rotation=s.chassis.rotation();
    s.beginDrag(i,s.pullPoint(i).y+1.25);advance(s,1.5);
    assert.ok(Math.abs(s.y-position.y-1.25)<.015,`${type} top ${i} did not lift`);
    assert.ok(angleBetween(rotation,s.chassis.rotation())<.01);
    assert.ok(s.wheels.every(w=>!w.contact));assert.ok(s.constraintError()<.002);s.free();
  }
});
test('corner grip permits horizontal body translation instead of a fixed-centre pivot',()=>{
  const s=new Suspension(),start=s.chassis.translation(),rotation=s.chassis.rotation();s.beginDrag(0,s.pullPoint(0).y+.85);advance(s,1.4);
  assert.ok(Math.hypot(s.x-start.x,s.z-start.z)>.04);assert.ok(angleBetween(rotation,s.chassis.rotation())>.05);
  assert.ok(s.constraintError()<.003);const held=s.drag.hand.translation();assert.ok(s.pullPoint(0).distanceTo(v(held))<.004);s.free();
});
test('release removes the gripper and lets the connected assembly fall and settle',()=>{
  for(const type of Object.keys(TYPES)){const s=new Suspension();s.setType(type);s.beginDrag(5,s.pullPoint(5).y+1.1);advance(s,1.4);const y=s.y;s.release();assert.equal(s.drag,null);advance(s,.15);assert.ok(s.y<y-.06);advance(s,7);assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.vy)<.025);assert.ok(s.constraintError()<.002);s.free();}
});
test('airborne centre of mass follows gravity with no fixed horizontal world anchor',()=>{
  const s=new Suspension();s.drop(1.2);const p=com(s);advance(s,.1);const q=com(s);
  assert.ok(Math.abs((q.y-p.y)+.04905)<.004);assert.ok(Math.hypot(q.x-p.x,q.z-p.z)<.0001);assert.ok(s.wheels.every(w=>!w.contact));s.free();
});
test('four-link axle location holds during combined lift, lateral motion and pitch',()=>{
  for(const type of ['solid','baja']){
    const s=new Suspension();s.setType(type);s.beginDrag(0,s.pullPoint(0).y+1.1);advance(s,2);
    for(const beam of s.beams){const q=s.chassis.rotation(),p=v(beam.body.translation()).sub(s.chassis.translation()).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w).invert());assert.ok(Math.abs(p.x)<.4);assert.ok(Math.abs(Math.abs(p.z)-1.36)<.5);}
    assert.ok(s.constraintError()<.003);
    for(const beam of s.frame().beams)assert.ok(Math.abs(v(beam.a).distanceTo(v(beam.b))-(type==='baja'?2.4:2))<1e-6);
    s.release();advance(s,4);assert.ok(s.constraintError()<.003);s.free();
  }
});
test('suspension arms stay rigid and hinge anchors coincide after drop',()=>{
  for(const type of Object.keys(TYPES)){const s=new Suspension();s.setType(type);s.drop(.9);advance(s,1);
    const frame=s.frame();frame.links.forEach((link,i)=>assert.ok(Math.abs(v(link.a).distanceTo(v(link.b))-s.links[i].length)<1e-6));assert.ok(s.constraintError()<.003);s.free();}
});
test('Baja combines long front wishbones, live rear axle and longer droop with bypass damping',()=>{
  const road=new Suspension();road.setType('wishbone');const baja=new Suspension();baja.setType('baja');
  assert.ok(baja.restHeight>road.restHeight+.2);assert.equal(baja.beams.length,1);assert.equal(baja.wheelParts[0].kind,'independent');assert.equal(baja.wheelParts[2].kind,'solid');assert.ok(baja.springs.every(s=>s.bypass));
  assert.ok(baja.springs[0].max-baja.springs[0].min>road.springs[0].max-road.springs[0].min+.25);assert.ok(baja.radius>road.radius);road.free();baja.free();
});
test('wheel rotation follows physical rolling with no idle animation',()=>{
  const s=new Suspension();advance(s,.2);assert.ok(s.frame().wheels.every(w=>Math.abs(w.spin)<.02));s.setDriving(true);s.setInput(1,0);advance(s,1);
  assert.ok(s.frame().wheels.every(w=>Math.abs(w.spin)>.01));s.setDriving(false);assert.ok(s.tyres.every(t=>t.omega===0));advance(s,4);const b=s.frame().wheels.map(w=>w.spin);advance(s,.2);assert.ok(s.frame().wheels.every((w,i)=>Math.abs(w.spin-b[i])<.02));s.free();
});
test('all seven grips stay finite at lift limits and design switching removes a held grip',()=>{
  for(const type of Object.keys(TYPES))for(let i=0;i<PULL_POINTS.length;i++){
    const s=new Suspension();s.setType(type);s.beginDrag(i,s.pullPoint(i).y+2);advance(s,1.5);s.release();advance(s,3);
    assert.ok([s.x,s.y,s.z,s.pitch,s.roll].every(Number.isFinite));assert.ok(s.y>-.2&&s.y<5);assert.ok(s.constraintError()<.006,`${type} ${i}: ${s.constraintError()}`);s.free();
  }
  const s=new Suspension();s.beginDrag(4,3);advance(s,.2);s.setType('baja');assert.equal(s.drag,null);assert.equal(s.type,'baja');assert.throws(()=>s.setType('bad'),RangeError);s.free();
});


test('front and rear grips lift that end while the opposite axle remains on the floor',()=>{
  for(const type of Object.keys(TYPES))for(const i of [4,6]){
    const s=new Suspension();s.setType(type);s.beginDrag(i,s.pullPoint(i).y+.65);advance(s,1.5);
    const lifted=i===4?[0,1]:[2,3],grounded=i===4?[2,3]:[0,1];
    assert.ok(s.pitch*(i===4?-1:1)>.14,`${type} end ${i} did not pitch`);
    assert.ok(lifted.every(w=>!s.wheels[w].contact));assert.ok(grounded.every(w=>s.wheels[w].contact));
    assert.ok(s.wheels[lifted[0]].y-s.wheels[grounded[0]].y>.25);assert.equal(s.drag.level,false);s.free();
  }
});

test('repeated Baja lifts cannot fold the wishbones into the collapsed-wheel branch',()=>{
  const s=new Suspension();s.setType('baja');let maxCamber=0,maxError=0;
  const inspect=()=>{
    const bodyInverse=new Quaternion().copy(s.chassis.rotation()).invert();
    for(const w of s.wheelParts.filter(w=>w.kind==='independent')){
      const axle=new Vector3(1,0,0).applyQuaternion(bodyInverse.clone().multiply(new Quaternion().copy(w.body.rotation())));
      maxCamber=Math.max(maxCamber,Math.abs(Math.atan2(axle.y,axle.x)));
    }
    maxError=Math.max(maxError,s.constraintError());
  };
  for(let n=0;n<14;n++){
    const i=[0,1,4,6,2,3,5][n%7];s.beginDrag(i,s.pullPoint(i).y+1.8);
    for(let k=0;k<360;k++){s.step();inspect();}s.release();
    for(let k=0;k<720;k++){s.step();inspect();}
  }
  assert.ok(maxCamber<.30,`folded wheel: ${maxCamber*180/Math.PI} degrees`);
  assert.ok(maxError<.02,`disconnected linkage: ${maxError} m`);s.free();
});

test('every suspension visibly rebounds after compression and then settles',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();s.setType(type);s.drop(.70);const heights=[];
    for(let k=0;k<1440;k++){s.step();heights.push(s.y);}
    let trough=70;for(let k=70;k<200;k++)if(heights[k]<heights[trough])trough=k;
    const rebound=Math.max(...heights.slice(trough,trough+170))-heights[trough];
    assert.ok(rebound>.05,`${type} rebound was only ${rebound} m`);
    assert.ok(Math.abs(s.vy)<.025);assert.ok(s.wheels.every(w=>w.contact));s.free();
  }
});
