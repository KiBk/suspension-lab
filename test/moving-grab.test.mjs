import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {Suspension,TYPES,STEP} from '../src/physics.js';
const advance=(s,seconds)=>{for(let k=0;k<Math.round(seconds/STEP);k++)s.step();};
const momentum=s=>s.dynamic.reduce((v,b)=>v.addScaledVector(b.linvel(),b.mass()/s.totalMass),new Vector3());
const setSpeed=(s,z)=>{s.setDriving(true);for(const b of s.dynamic)b.setLinvel({x:0,y:0,z},true);for(const t of s.tyres)t.omega=z/s.radius;};
function grab(s,kind){if(kind==='wheel')s.beginWheelDrag(2);else if(kind==='corner')s.beginBodyDrag(new Vector3(.7,.3,1.5));else s.beginBodyDrag(new Vector3(0,.8,0),true);}

test('body, corner and wheel grabs retain forward and reverse travel on every layout',()=>{
  for(const type of Object.keys(TYPES))for(const speed of [100/3.6,-30/3.6])for(const kind of ['centre','corner','wheel']){
    const s=new Suspension();
    try{
      s.setType(type);setSpeed(s,speed);advance(s,.3);const start=s.z+s.worldOrigin.z;
      grab(s,kind);const height=s.drag.target;s.setDragHeight(height+.45);advance(s,.65);
      assert.equal(s.driving,true);assert.ok(s.constraintError()<.008,`${type} ${kind}: suspension disconnected`);
      assert.ok(Math.abs(s.drag.hand.translation().y-height-.45)<.006);
      const distance=s.z+s.worldOrigin.z-start;
      assert.ok(distance/speed>.5,`${type} ${kind}: grab braked travel (${distance} m)`);
      assert.ok(momentum(s).z/speed>.8,`${type} ${kind}: lost horizontal momentum`);
      s.release();advance(s,.1);assert.ok(momentum(s).z/speed>.7);
    }finally{s.free();}
  }
});

test('airborne grabs apply no horizontal force, even with a tilted car and world rebases',()=>{
  for(const type of Object.keys(TYPES))for(const kind of ['centre','wheel']){
    const s=new Suspension();
    try{
      s.setType(type);s.setDriving(true);s.drop(4);
      const origin=new Vector3().copy(s.chassis.translation());
      const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.63).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.16));
      for(const b of s.dynamic){b.setTranslation(new Vector3().copy(b.translation()).sub(origin).applyQuaternion(q).add(origin),true);b.setRotation(q.clone().multiply(new Quaternion().copy(b.rotation())),true);b.setLinvel({x:40,y:0,z:80},true);}
      s.refresh();grab(s,kind);s.setDragHeight(s.drag.target+.6);advance(s,1);
      const axis=new Vector3(1,0,0).applyQuaternion(s.drag.joint.frameX1()).applyQuaternion(s.drag.hand.rotation());
      assert.ok(Math.hypot(axis.x,axis.z)<1e-6&&Math.abs(axis.y-1)<1e-6,'lift axis must remain world vertical');
      assert.ok(Math.hypot(s.worldOrigin.x,s.worldOrigin.z)>60,'must cross a rebase while held');
      assert.ok(s.wheels.every(w=>!w.contact));assert.ok(s.constraintError()<.008);
      // Allow <0.06% float32 solver drift at 322 km/h; a horizontal grab
      // constraint would instead arrest the car or inject a large impulse.
      const v=momentum(s);assert.ok(Math.abs(v.x-40)<.05&&Math.abs(v.z-80)<.05,`${type} ${kind}: horizontal force from lift ${v.toArray()}`);
      s.release();advance(s,.15);const released=momentum(s);
      assert.ok(Math.abs(released.x-v.x)<.01&&Math.abs(released.z-v.z)<.01,'release changes horizontal velocity');
    }finally{s.free();}
  }
});

test('driving can start during a grab, and centre grabs leave yaw free for steering',()=>{
  const s=new Suspension();
  try{
    grab(s,'centre');const grip=s.drag;s.setDriving(true);s.setInput(1,.5);advance(s,2);
    assert.equal(s.drag,grip);assert.ok(s.roadSpeed>4);assert.ok(Math.abs(s.chassis.rotation().y)>.02,'centre grip blocked turning');
    assert.ok(Math.abs(s.pitch)<.01&&Math.abs(s.roll)<.01,'centre grip lost its tilt hold');assert.ok(s.constraintError()<.005);
  }finally{s.free();}
});
