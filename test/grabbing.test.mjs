import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3,Quaternion,Raycaster} from 'three';
import {Suspension,TYPES} from '../src/physics.js';
import {makeCar,bodyZone} from '../src/model.js';

test('body zones distinguish corners, ends and the middle',()=>{
  for(const [point,index] of [[[-.7,.2,1.4],1],[[.7,.2,1.4],0],[[-.7,.2,-1.4],3],[[.7,.2,-1.4],2],[[0,.2,1.4],4],[[0,.2,-1.4],6],[[.7,.8,0],5]]){
    assert.equal(bodyZone(new Vector3(...point)),index);
  }
});

test('surface picking follows rotated cars, visible wheels and empty ground',()=>{
  const s=new Suspension();const scene=new Scene(),car=makeCar(scene);
  try{
    for(const type of Object.keys(TYPES)){
      s.setType(type);
      const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.9);
      for(const b of s.dynamic){b.setTranslation(new Vector3().copy(b.translation()).applyQuaternion(q),true);b.setRotation(q.clone().multiply(new Quaternion().copy(b.rotation())),true);}
      car.update(s);scene.updateMatrixWorld(true);
      for(const cutaway of [false,true]){
        car.cutaway(cutaway);
        for(let i=0;i<4;i++){
          const wheel=s.frame().wheels[i],hub=new Vector3().copy(wheel.position);
          const outward=new Vector3(i%2===0?1:-1,0,0).applyQuaternion(wheel.rotation);
          const picked=car.pick(new Raycaster(hub.clone().addScaledVector(outward,3),outward.clone().negate()));
          assert.deepEqual(picked,{kind:'wheel',index:i},`${type}, cutaway ${cutaway}, wheel ${i}`);
        }
        for(const [x,z,index] of [[.7,1.5,0],[-.7,1.5,1],[0,1.5,4],[0,-1.5,6],[0,0,5]]){
          const top=s.point(new Vector3(x,3,z)),down=new Vector3(0,-1,0);
          const picked=car.pick(new Raycaster(top,down));
          assert.equal(picked?.kind,'body');assert.equal(picked.index,index);
        }
      }
      assert.equal(car.pick(new Raycaster(new Vector3(5,3,5),new Vector3(0,-1,0))),null);
    }
  }finally{
    s.free();scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});
  }
});

test('each wheel can be lifted through its suspension, released and settled',()=>{
  for(const type of Object.keys(TYPES))for(let i=0;i<4;i++){
    const s=new Suspension();
    try{
      s.setType(type);const start=s.frame().wheels[i].position.y,restCompression=s.wheels[i].compression;
      s.setDriving(true);s.setInput(0,0);s.beginWheelDrag(i);s.setDragHeight(start+.7);
      assert.equal(s.driving,true);assert.equal(s.drag.body,s.wheelParts[i].body);assert.equal(s.drag.level,false);
      for(let k=0;k<480;k++){s.step();assert.ok(s.constraintError()<.006,`${type} wheel ${i}: disconnected suspension`);}
      assert.ok(Math.abs(s.frame().wheels[i].position.y-start-.7)<.006);
      assert.ok(s.wheels[i].compression>restCompression+.03,`${type} wheel ${i}: suspension must compress`);
      assert.equal(s.wheels[i].contact,false);
      s.release();for(let k=0;k<1440;k++)s.step();
      assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.y-s.restHeight)<.02);assert.ok(Math.abs(s.vy)<.03);
      assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});

test('grabbing an actual middle surface holds the whole body level',()=>{
  const s=new Suspension();
  try{
    const rotation=new Quaternion().copy(s.chassis.rotation()),height=s.y;
    s.beginBodyDrag(new Vector3(.55,.8,.3),true);s.drag.target+=1;
    for(let k=0;k<360;k++)s.step();
    assert.ok(new Quaternion().copy(s.chassis.rotation()).angleTo(rotation)<.01);
    assert.ok(Math.abs(s.y-height-1)<.01);assert.ok(s.wheels.every(w=>!w.contact));
    s.setType('baja');assert.equal(s.drag,null);
  }finally{s.free();}
});

test('downward body dragging compresses the suspension and rebounds on release',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();
    try{
      s.setType(type);const rest=s.y,compression=s.wheels.map(w=>w.compression);
      s.beginBodyDrag(new Vector3(0,.8,0),true);const start=s.drag.target;
      s.setDragHeight(start-.25);
      assert.ok(s.drag.target<start-.24,'downward targets must pass below pickup height');
      for(let k=0;k<240;k++)s.step();
      assert.ok(rest-s.y>.23,`${type}: body did not compress`);
      assert.ok(s.wheels.every((w,i)=>w.compression>compression[i]+.1));
      const low=s.y;s.release();let peak=low;
      for(let k=0;k<1440;k++){s.step();peak=Math.max(peak,s.y);}
      assert.ok(peak-low>.2,`${type}: missing rebound`);
      assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.y-rest)<.02);assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});

test('fast body pulls follow a one-metre target promptly without breaking joints',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();
    try{
      s.setType(type);const start=s.y;s.beginBodyDrag(new Vector3(0,.8,0),true);
      s.setDragHeight(s.drag.target+1);let maxSpeed=0;
      for(let k=0;k<60;k++){
        const before=s.drag.hand.translation().y;s.step();
        maxSpeed=Math.max(maxSpeed,Math.abs(s.drag.hand.translation().y-before)*240);
        assert.ok(s.constraintError()<.006,`${type}: fast pull separated a joint`);
      }
      assert.ok(s.y-start>.97,`${type}: one-metre pull should complete within 0.25 seconds`);
      assert.ok(maxSpeed>5&&maxSpeed<9.61,`${type}: incorrect grip speed ${maxSpeed}`);
    }finally{s.free();}
  }
});

test('a fast upward pull can reverse into compression without losing the mechanism',()=>{
  for(const type of Object.keys(TYPES)){
    const s=new Suspension();
    try{
      s.setType(type);const rest=s.y;s.beginBodyDrag(new Vector3(0,.8,0),true);const start=s.drag.target;
      s.setDragHeight(start+2);
      for(let k=0;k<30;k++)s.step();
      assert.ok(s.drag.speed>5);s.setDragHeight(start-.25);
      for(let k=0;k<240;k++){s.step();assert.ok(s.constraintError()<.012,`${type}: reversal opened a joint`);}
      assert.ok(s.y<rest-.23);s.release();
      for(let k=0;k<1440;k++)s.step();
      assert.ok(s.wheels.every(w=>w.contact));assert.ok(Math.abs(s.y-rest)<.02);assert.ok(s.constraintError()<.003);
    }finally{s.free();}
  }
});
