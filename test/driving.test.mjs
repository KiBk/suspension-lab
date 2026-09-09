import test from 'node:test';
import assert from 'node:assert/strict';
import {Suspension,TYPES,STEP} from '../src/physics.js';
import {brushLateral,gripLimit,tyreStep,SURFACES} from '../src/tyres.js';
import {DrivingInput} from '../src/driving-input.js';
const advance=(s,time)=>{for(let k=0;k<Math.round(time/STEP);k++)s.step();};

test('brush grip opposes slip, saturates and is load-sensitive',()=>{
  for(const load of [300,1800,3600,8000])for(const slip of [.001,.04,.15,.6]){
    const f=brushLateral(slip,load);assert.ok(f<0);assert.ok(Math.abs(f)<=gripLimit(load)+1e-8);assert.ok(Math.abs(f+brushLateral(-slip,load))<1e-8);
  }
  assert.equal(brushLateral(.2,0),0);assert.ok(gripLimit(7200)<2*gripLimit(3600));assert.ok(gripLimit(7200)>gripLimit(3600));
});
test('combined longitudinal and lateral demand stays inside the grip circle',()=>{
  for(const speed of [-15,0,15])for(const lateral of [-8,0,8])for(const torque of [-2500,0,2500]){
    const state={omega:speed/.35,slip:0};let f;
    for(let k=0;k<240;k++)f=tyreStep(state,{load:3600,longitudinal:speed,lateral,torque,radius:.35,dt:STEP});
    assert.ok(Number.isFinite(state.omega));assert.ok(Math.hypot(f.longitudinal,f.lateral)<=f.limit*1.00001);assert.ok(f.lateral*lateral<=0);
  }
  const state={omega:10,slip:.2},f=tyreStep(state,{load:0,longitudinal:5,lateral:2,torque:500,radius:.35,dt:STEP});assert.equal(f.longitudinal,0);assert.equal(f.lateral,0);assert.ok(state.omega>10);
});
test('arrow state supports simultaneous steering and acceleration without stuck keys',()=>{
  const keys=new DrivingInput();keys.set('ArrowUp',true);keys.set('ArrowLeft',true);assert.deepEqual(keys.axes,{throttle:1,steer:1});keys.set('ArrowDown',true);assert.equal(keys.axes.throttle,0);keys.set('ArrowUp',false);assert.equal(keys.axes.throttle,-1);keys.clear();assert.deepEqual(keys.axes,{throttle:0,steer:0});assert.equal(keys.set('a',true),false);
});
test('all designs accelerate, lose speed while coasting, brake and reverse',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();s.setType(type);s.setDriving(true);s.setInput(1,0);advance(s,4);assert.ok(s.roadSpeed>9&&s.roadSpeed<12,`${type} acceleration`);
    assert.ok(s.tyres[2].load+s.tyres[3].load>s.tyres[0].load+s.tyres[1].load);
    s.setInput(0,0);advance(s,2);const coast=s.roadSpeed;advance(s,5);assert.ok(coast-s.roadSpeed>.45&&coast-s.roadSpeed<1.1,`${type} rolling loss: ${coast} -> ${s.roadSpeed}`);
    s.setInput(-1,0);advance(s,2);assert.ok(s.roadSpeed<coast-4);assert.ok(s.tyres[0].load+s.tyres[1].load>s.tyres[2].load+s.tyres[3].load);
    advance(s,4);assert.ok(s.roadSpeed<-3,`${type} reverse`);assert.ok(s.constraintError()<.004);s.free();
  }
});
test('left and right turns load and compress the outside suspension',()=>{
  for(const type of Object.keys(TYPES))for(const steer of [-.5,.5]){
    const s=new Suspension();s.setType(type);s.setDriving(true);s.setInput(1,0);advance(s,4);s.setInput(0,steer);advance(s,1.5);
    const outside=steer>0?[1,3]:[0,2],inside=steer>0?[0,2]:[1,3];
    assert.ok(s.lateralG*steer>.1);assert.ok(s.roll*steer>.006,`${type} wrong body lean`);
    assert.ok(outside.reduce((a,i)=>a+s.tyres[i].load,0)>inside.reduce((a,i)=>a+s.tyres[i].load,0)+1000);
    assert.ok(outside.reduce((a,i)=>a+s.wheels[i].compression,0)>inside.reduce((a,i)=>a+s.wheels[i].compression,0)+.02);
    assert.ok(s.tyres.every(t=>t.usage<=1.0001));assert.ok(s.constraintError()<.006);s.free();
  }
});
test('airborne tyres have no road force and cannot accelerate the vehicle centre of mass',()=>{
  const s=new Suspension();s.setDriving(true);s.drop(2);s.setInput(1,1);advance(s,.15);
  assert.ok(s.tyres.every(t=>t.load===0&&t.force.length()===0));const momentum=s.dynamic.reduce((p,b)=>{const v=b.linvel();return{x:p.x+v.x*b.mass(),z:p.z+v.z*b.mass()};},{x:0,z:0});assert.ok(Math.hypot(momentum.x,momentum.z)/s.totalMass<.005);s.free();
});
test('continuous driving rebases the empty world without breaking contact or suspension',()=>{
  for(const type of ['macpherson','baja']){
    const s=new Suspension();s.setType(type);s.setDriving(true);s.setInput(1,0);let shifts=0,prev=s.z;
    for(let k=0;k<3600;k++){
      const groundZ=s.z+s.worldOrigin.z;s.step();
      const travel=s.z+s.worldOrigin.z-groundZ;
      assert.ok(travel>-.002&&travel<.3,'ground coordinates must stay continuous through rebasing');
      if(Math.abs(s.z-prev)>50)shifts++;prev=s.z;assert.ok(s.constraintError()<.02);
    }
    assert.ok(shifts>=3);assert.ok(s.roadSpeed>30);assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.roll)<.02);s.free();
  }
});
test('grabbing preserves driving input and wheel motion; reset returns to rest',()=>{
  const s=new Suspension();s.setDriving(true);s.setInput(1,.5);advance(s,2);
  const velocity=s.chassis.linvel(),omega=s.tyres.map(t=>t.omega);
  s.beginDrag(4,s.pullPoint(4).y+.6);
  assert.deepEqual(s.chassis.linvel(),velocity);assert.deepEqual(s.tyres.map(t=>t.omega),omega);
  advance(s,1);assert.equal(s.driving,true);assert.deepEqual(s.input,{throttle:1,steer:.5});
  assert.ok(s.tyres.some(t=>Math.abs(t.steer)>.01));assert.ok(s.tyres.every(t=>Number.isFinite(t.omega)));assert.ok(s.drag);
  s.release();s.reset();assert.equal(s.roadSpeed,0);assert.equal(s.driving,false);s.free();
});
test('high-speed throttle release stays stable on flat ground across every suspension',()=>{
  const cases=[...Object.keys(TYPES).map(type=>[type,100]),['solid',130]];
  for(const [type,kph] of cases){
    const s=new Suspension();
    try{
      s.setType(type);s.setDriving(true);s.setInput(1,0);
      for(let k=0;k<12000&&s.roadSpeed<kph/3.6;k++)s.step();
      assert.ok(s.roadSpeed>=kph/3.6,`${type} failed to reach ${kph} km/h`);
      s.setInput(0,0);
      // Regression for uncommanded weaving and launches after throttle release.
      for(let k=0;k<7200;k++){
        s.step();
        assert.ok(s.wheels.every(w=>w.contact),`${type} ${kph}: wheel lost flat-road contact`);
        assert.ok(Math.abs(s.roll)<.02,`${type} ${kph}: uncommanded roll ${s.roll}`);
        assert.ok(Math.abs(s.vy)<.15,`${type} ${kph}: vertical kick ${s.vy}`);
        assert.ok(s.y<s.restHeight+.10,`${type} ${kph}: chassis lifted off flat road`);
      }
      assert.ok(s.roadSpeed<kph/3.6-2.5&&s.roadSpeed>kph/3.6-6,`${type}: unexpected coasting loss`);assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});
test('surface grip resists suspension scrub during parked drops',()=>{
  for(const type of Object.keys(TYPES)){
    const results={};
    for(const surface of ['dry','ice']){
      const s=new Suspension();s.setSurface(surface);s.setType(type);
      assert.equal(s.surface,surface);assert.equal(s.driving,false);
      const rest=s.y;s.drop(.75);let trough=Infinity,peakLateral=0;
      for(let k=0;k<1440;k++){
        s.step();trough=Math.min(trough,s.y);peakLateral=Math.max(peakLateral,...s.tyres.map(t=>Math.abs(t.force.x)));
        assert.ok(s.tyres.every(t=>t.usage<=1.0001));
      }
      assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.y-rest)<.06);assert.ok(s.constraintError()<.004);
      results[surface]={trough,peakLateral};s.free();
    }
    if(type==='solid')assert.ok(Math.abs(results.dry.trough-results.ice.trough)<.025,'fixed track limits lateral scrub');
    else {assert.ok(results.ice.trough<results.dry.trough-.04,`${type}: grip must affect compression`);assert.ok(results.dry.peakLateral>results.ice.peakLateral*1.5,`${type}: dry tyres resist scrub`);}
  }
  const limits=Object.values(SURFACES).map(s=>gripLimit(3600,s.grip));assert.ok(limits[0]>limits[1]&&limits[1]>limits[2]);
});
