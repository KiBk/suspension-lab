import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {followHorizontal} from '../src/view.js';

test('camera follows ground-plane displacement while retaining height, zoom and orbit offset',()=>{
  const camera={position:new Vector3(6.5,4.6,7.7)},target=new Vector3(0,.85,0);
  const offset=camera.position.clone().sub(target);
  for(const car of [{x:2,y:8,z:-3},{x:-4,y:.8,z:5},{x:-4,y:3,z:5},{x:0,y:1,z:0}]){
    followHorizontal(camera,target,car);
    assert.equal(target.x,car.x);assert.equal(target.z,car.z);assert.equal(target.y,.85);assert.equal(camera.position.y,4.6);
    assert.ok(camera.position.clone().sub(target).distanceTo(offset)<1e-10);
  }
});
