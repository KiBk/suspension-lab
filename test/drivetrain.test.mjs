import test from 'node:test';
import assert from 'node:assert/strict';
import {POWERTRAINS,HP_WATTS,engineTorque} from '../src/powertrains.js';
import {Drivetrain} from '../src/drivetrain.js';
import {tyreStep} from '../src/tyres.js';
import {Suspension,STEP} from '../src/physics.js';
const advance=(d,seconds,args)=>{for(let t=0;t<seconds;t+=STEP)d.step(STEP,args);};

test('every engine delivers its stated horsepower and the electric motor has a constant-torque launch',()=>{
 for(const p of Object.values(POWERTRAINS)){
  let power=0;for(let rpm=p.idle;rpm<p.redline;rpm++)power=Math.max(power,engineTorque(p,rpm)*rpm*Math.PI/30);
  assert.ok(Math.abs(power/HP_WATTS-p.hp)<.01,`${p.id}: power curve rating`);
  assert.ok(p.gears.every((r,i)=>r>0&&(!i||r<p.gears[i-1])));
 }
 const ev=POWERTRAINS.sedan;assert.ok(ev.electric);assert.equal(ev.gears.length,1);
 assert.equal(engineTorque(ev,0),410);assert.ok(engineTorque(ev,10000)<engineTorque(ev,2000));
});

test('automatic shifts lower RPM, settles without gear hunting, and kicks down under load',()=>{
 for(const p of Object.values(POWERTRAINS).filter(p=>!p.electric)){
  const d=new Drivetrain(p),omega=p.redline*.94/(p.gears[0]*p.finalDrive)*Math.PI/30;
  advance(d,.7,{request:1,wheelOmega:omega,speed:omega*.34});assert.equal(d.gear,2,`${p.id} first upshift`);
  assert.ok(d.rpm<p.redline*.83,`${p.id}: RPM did not fall`);
  const cruise=p.redline*.38/(p.gears[2]*p.finalDrive)*Math.PI/30;
  d.gear=3;d.cooldown=0;d.shiftRemaining=0;advance(d,2,{request:.15,wheelOmega:cruise,speed:cruise*.34});
  assert.equal(d.gear,3,`${p.id}: steady gear hunting`);
  advance(d,.5,{request:1,wheelOmega:cruise,speed:cruise*.34});assert.equal(d.gear,2,`${p.id}: no kickdown`);
 }
});

test('brakes stop a wheel without reversing it, and can lock it without ABS',()=>{
 for(const sign of [-1,1]){
  const t={omega:sign*60,slip:0};
  for(let k=0;k<120;k++){
   const f=tyreStep(t,{load:3500,longitudinal:sign*20,lateral:2,torque:0,brakeTorque:2200,radius:.34,dt:STEP});
   assert.ok(t.omega*sign>=0);assert.ok(f.longitudinal*sign<=0);assert.ok(f.brakeTorque*sign>=0);
  }
  assert.equal(Math.abs(t.omega),0,'locked wheel');
 }
});

test('opposite key brakes first; single-speed EV reverses and regenerates without phantom shifts',()=>{
 for(const p of Object.values(POWERTRAINS)){
  const d=new Drivetrain(p);advance(d,.4,{request:-1,speed:20,wheelOmega:60});
  assert.equal(d.brake,1);assert.equal(d.direction,1);assert.equal(d.throttle,0);
  advance(d,.8,{request:-1,speed:0,wheelOmega:0});assert.equal(d.direction,-1);assert.ok(d.wheelTorque<0);
  advance(d,1,{request:0,speed:-10,wheelOmega:-30});assert.ok(d.wheelTorque>0,'overrun opposes reverse motion');
  d.reset();assert.equal(d.snapshot().gear,'N');assert.equal(d.rpm,p.idle);
 }
 const d=new Drivetrain(POWERTRAINS.sedan);advance(d,2,{request:1,speed:20,wheelOmega:60});
 assert.equal(d.gear,1);assert.equal(d.shiftRemaining,0);assert.ok(d.wheelTorque>0);
 advance(d,1,{request:0,speed:20,wheelOmega:60});assert.ok(d.wheelTorque<0);
});

test('wheel power is bounded by rated power, including launches, shifts and forced high wheel speeds',()=>{
 for(const p of Object.values(POWERTRAINS))for(const speed of [0,.5,10,35,90,250]){
  const d=new Drivetrain(p);
  for(let k=0;k<360;k++){
   const r=d.step(STEP,{request:1,speed,wheelOmega:speed/.34});
   assert.ok(Number.isFinite(r.wheelTorque)&&Number.isFinite(d.rpm));
   assert.ok(r.wheelTorque*speed/.34<=p.hp*HP_WATTS*p.efficiency*1.001,`${p.id}: excessive wheel power`);
  }
 }
});

test('wheelspin raises engine RPM without shifting back and forth or engaging traction control',()=>{
 const p=POWERTRAINS.sports,d=new Drivetrain(p);
 const omega=p.redline*.88/(p.gears[0]*p.finalDrive)*Math.PI/30;
 advance(d,3,{request:1,speed:2,wheelOmega:omega});
 assert.equal(d.gear,1);assert.ok(d.rpm>p.redline*.85);assert.ok(d.load>.99);assert.ok(d.wheelTorque>1000);
});

test('lifting powered cars keeps the drivetrain running without airborne road thrust',()=>{
 for(const id of ['compact','sedan','sports','pickup']){
  const s=new Suspension(id);
  try{
   s.drop(2);s.beginDrag(5);s.setDriving(true);s.setInput(1,0);
   for(let i=0;i<240;i++)s.step();
   assert.ok(s.tyres.every(t=>!t.contact&&t.force.length()===0));
   assert.ok(s.setup.drive.every(i=>s.tyres[i].omega>15));assert.ok(s.drivetrain.rpm>1500);
   const momentum=s.dynamic.reduce((p,b)=>({x:p.x+b.linvel().x*b.mass(),z:p.z+b.linvel().z*b.mass()}),{x:0,z:0});
   assert.ok(Math.hypot(momentum.x,momentum.z)/s.totalMass<.01);assert.ok(s.constraintError()<.005);
  }finally{s.free();}
 }
});

test('all ten cars launch, shift, brake and reverse through their physical tyres',()=>{
 const results=[];
 for(const id of Object.keys(POWERTRAINS)){
  const s=new Suspension(id);let hundred=null,gear=1,maxError=0,locked=false;
  try{
   s.setDriving(true);s.setInput(1,0);
   for(let k=0;k<14/STEP;k++){
    s.step();if(!hundred&&s.roadSpeed>=100/3.6)hundred=(k+1)*STEP;
    assert.ok(s.drivetrain.gear>=gear,`${id}: full-throttle gear hunting`);
    gear=Math.max(gear,s.drivetrain.gear);maxError=Math.max(maxError,s.constraintError());
    assert.ok(Math.abs(s.roll)<.05,`${id}: straight-line instability`);
   }
   const speed=s.roadSpeed;console.log('Launch',JSON.stringify({id,hundred,speed:speed*3.6,gear,maxError}));assert.ok(speed>17,`${id}: weak launch ${speed}`);
   if(id==='sedan')assert.equal(gear,1);else assert.ok(gear>=2,`${id}: no automatic shifts`);
   s.setInput(-1,0);
   for(let k=0;k<11/STEP;k++){s.step();if(s.roadSpeed>5&&s.tyres.some(t=>t.load>100&&Math.abs(t.omega)<.1))locked=true;maxError=Math.max(maxError,s.constraintError());}
   assert.ok(s.roadSpeed< -1,`${id}: did not brake and reverse (${s.roadSpeed})`);
   assert.ok(locked,`${id}: no brake locking at full pressure`);assert.ok(maxError<.01,`${id}: joint error ${maxError}`);
   results.push({id,hundred,topAfter14s:speed*3.6,gear,maxError});
  }finally{s.free();}
 }
 const byId=Object.fromEntries(results.map(r=>[r.id,r]));assert.ok(byId.sports.hundred<byId.compact.hundred||byId.compact.hundred===null);
 console.log('Drivetrain road checks:',JSON.stringify(results));
});
