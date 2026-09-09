import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Suspension,TYPES,STEP} from '../src/physics.js';
const v=p=>new Vector3().copy(p);
function orient(s,angle){
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle);
  for(const b of s.dynamic){b.setTranslation(v(b.translation()).applyQuaternion(q),true);b.setRotation(q.clone().multiply(new Quaternion().copy(b.rotation())),true);}
  for(let k=0;k<480;k++)s.step();
  return q;
}
function velocity(s,direction){
  for(const b of s.dynamic){b.setLinvel(direction,true);b.setAngvel({x:0,y:0,z:0},true);}
  s.setDriving(true);
}
const worldCom=s=>s.dynamic.reduce((p,b)=>p.addScaledVector(b.translation(),b.mass()),new Vector3()).divideScalar(s.totalMass).add(new Vector3(s.worldOrigin.x,0,s.worldOrigin.z));

test('tyre forces remain at the wheels immediately after world recentring',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();
    try{
      s.setType(type);const q=orient(s,.8);
      velocity(s,new Vector3(0,0,100/3.6).applyQuaternion(q));
      for(let k=0;k<1200&&!s.worldOrigin.x;k++)s.step();
      assert.ok(Math.abs(s.worldOrigin.x)>60,'must exercise an actual rebase');
      const hubs=s.frame().wheels.map(w=>v(w.position)),applied=[];
      for(const b of new Set(s.wheelParts.map(w=>w.body))){
        const original=b.addForceAtPoint;
        b.addForceAtPoint=function(force,point,wake){
          applied.push({body:b,point:v(point)});return original.call(this,force,point,wake);
        };
      }
      s.tyreForces(STEP);
      assert.equal(applied.length,8,'each grounded tyre applies its two force components');
      for(const {body,point} of applied){
        const distance=Math.min(...s.wheelParts.map((w,i)=>w.body===body?point.distanceTo(hubs[i]):Infinity));
        assert.ok(distance<s.radius+.2,`${type}: tyre force applied ${distance} m from its wheel`);
      }
    }finally{s.free();}
  }
});

test('diagonal travel has flat contact normals and no invisible bumps from 30 to 340 km/h',()=>{
  for(const type of Object.keys(TYPES))for(const kph of [30,100,340]){
    const s=new Suspension();
    try{
      s.setType(type);const q=orient(s,.8),rest=s.y;
      velocity(s,new Vector3(0,0,kph/3.6).applyQuaternion(q));
      // The live rear axle used to develop a growing weave after several
      // recentrings; a short coast missed the later launch.
      const steps=kph===340?7200:1440;
      for(let k=0;k<steps;k++){
        s.step();
        if(k<30)continue;
        assert.ok(s.wheels.every(w=>w.contact),`${type} ${kph}: lost contact on flat road`);
        assert.ok(Math.abs(s.y-rest)<.01,`${type} ${kph}: phantom bump`);
        assert.ok(Math.abs(s.vy)<.015,`${type} ${kph}: vertical jolt ${s.vy}`);
        for(const w of s.wheelParts)s.world.contactPair(w.collider,s.ground,m=>{
          if(!m.numSolverContacts())return;
          const n=m.normal();
          assert.ok(Math.hypot(n.x,n.z)<1e-6,`${type} ${kph}: tilted normal on flat ground`);
        });
      }
      assert.ok(s.constraintError()<.004);
    }finally{s.free();}
  }
});

test('fast airborne travel stays ballistic across world rebasing',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();
    try{
      s.setType(type);const q=orient(s,.8);s.drop(2);
      for(const b of s.dynamic)b.setTranslation(v(b.translation()).add(new Vector3(55,0,55)),true);
      const direction=new Vector3(0,0,340/3.6).applyQuaternion(q);velocity(s,direction);
      const start=worldCom(s),duration=.2;
      for(let k=0;k<duration/STEP;k++){
        s.step();assert.ok(s.tyres.every(t=>t.load===0&&t.force.length()===0));
      }
      const travel=worldCom(s).sub(start);
      assert.ok(Math.abs(travel.x-direction.x*duration)<.003);
      assert.ok(Math.abs(travel.z-direction.z*duration)<.003);
      assert.ok(Math.abs(travel.y+.5*9.81*duration*duration)<.006);
      assert.ok(Math.hypot(s.worldOrigin.x,s.worldOrigin.z)>60);
      assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});
