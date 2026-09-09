import test from 'node:test';
import assert from 'node:assert/strict';
import {Suspension,TYPES,STEP} from '../src/physics.js';
import {rollingResistance} from '../src/tyres.js';
const advance=(s,seconds)=>{for(let k=0;k<Math.round(seconds/STEP);k++)s.step();};
function setSpeed(s,speed){s.setDriving(true);for(const b of s.dynamic)b.setLinvel({x:0,y:0,z:speed},true);for(const t of s.tyres)t.omega=speed/s.radius;}

test('rolling resistance opposes motion, scales with load and is smooth at zero',()=>{
  for(const speed of [-40,-1,-.001,0,.001,1,40])for(const load of [0,1000,4000]){
    const force=rollingResistance(speed,load);
    assert.ok(force*speed<=0);assert.ok(Math.abs(force)<=.012*load);
    assert.ok(Math.abs(force+rollingResistance(-speed,load))<1e-10);
    assert.ok(Math.abs(rollingResistance(speed,load*2)-force*2)<1e-10);
  }
  assert.equal(rollingResistance(30,0),0);assert.ok(Math.abs(rollingResistance(.00001,4000))<.003);
});

test('coasting settles near rest in both directions without reversing or jittering',()=>{
  for(const type of Object.keys(TYPES))for(const sign of [-1,1]){
    const s=new Suspension();
    try{
      s.setType(type);setSpeed(s,sign);let previous=1;
      for(let n=0;n<20;n++){
        advance(s,1);const speed=s.roadSpeed*sign;
        assert.ok(speed<previous+.006&&speed>-.002,`${type}: rolling resistance accelerated or reversed the car`);previous=speed;
      }
      assert.ok(Math.abs(s.roadSpeed)<.005,`${type}: failed to settle`);assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});

test('airborne wheels have no rolling resistance and retain horizontal travel',()=>{
  const s=new Suspension();
  try{
    s.setType('baja');s.drop(3);setSpeed(s,30);advance(s,.25);
    assert.ok(s.tyres.every(t=>t.rollingResistance===0&&t.load===0&&t.force.length()===0));
    const velocity=s.dynamic.reduce((v,b)=>v+b.linvel().z*b.mass()/s.totalMass,0);
    assert.ok(Math.abs(velocity-30)<.003);
  }finally{s.free();}
});
