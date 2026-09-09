import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import {Vector3,Raycaster,Mesh,MeshBasicMaterial} from 'three';
import {Suspension} from '../src/physics.js';
import {SETUP_ORDER} from '../src/setups.js';
import {Road,roadHeight,tileHeights,TILE_CELLS} from '../src/terrain.js';
import {roadGeometry} from '../src/road-view.js';

test('terrain tiles and visible triangles match physical road height across seams',()=>{
  const w=new R.World({x:0,y:-9.81,z:0}),road=new Road(w,'rough');
  try{for(const [x,z] of [[.07,.13],[7.2,8.7],[11.99,.13],[12.01,.13],[-12.01,-.13],[-11.99,-.13]]){
    road.ensure(x,z);w.step();const hit=w.castRay(new R.Ray({x,y:2,z},{x:0,y:-1,z:0}),4,true);
    assert.ok(Math.abs(2-hit.timeOfImpact-roadHeight('rough',x,z))<.00002);
    const mesh=new Mesh(roadGeometry('rough',Math.floor(x/.25)-2,Math.floor(z/.25)-2,{x:0,z:0},4),new MeshBasicMaterial());
    const visual=new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0)).intersectObject(mesh)[0];assert.ok(Math.abs(visual.point.y-roadHeight('rough',x,z))<.000001);mesh.geometry.dispose();mesh.material.dispose();
  }
  const a=tileHeights('rough',0,0),b=tileHeights('rough',1,0),n=TILE_CELLS+1;for(let z=0;z<n;z++)assert.equal(a[TILE_CELLS*n+z],b[z]);
  }finally{road.events.free();w.free();}
});

test('all vehicle setups drive over gravel and rough ground with real tyre loads',()=>{
  for(const id of SETUP_ORDER)for(const terrain of ['gravel','rough']){const s=new Suspension(id);s.setTerrain(terrain);s.drop(.7);
    try{for(let k=0;k<720;k++)s.step();assert.ok(s.tyres.reduce((n,t)=>n+t.load,0)>s.totalMass*5,`${id}/${terrain}: missing tyre loads`);
      s.setDriving(true);s.setInput(1,0);let speed=0,travel=0,error=0,load=0;
      for(let k=0;k<1920;k++){s.step();speed=Math.max(speed,s.groundSpeed);travel=Math.max(travel,...s.springs.map(p=>Math.abs(p.length-p.staticLength)/p.ratio));error=Math.max(error,s.constraintError());load=Math.max(load,...s.tyres.map(t=>t.load));assert.ok(Number.isFinite(s.y)&&Math.abs(s.y)<5);}
      assert.ok(speed>2,`${id}/${terrain}: cannot get moving (${speed})`);assert.ok(travel>.008,`${id}/${terrain}: no suspension response`);assert.ok(load>500,`${id}/${terrain}: no contact load`);assert.ok(error<.018,`${id}/${terrain}: joint separation ${error}`);
    }finally{s.free();}
  }
});

test('rough-road forces vanish while airborne, and terrain phase survives rebasing',()=>{
  const s=new Suspension('baja');s.setTerrain('rough');
  try{s.drop(2);s.setDriving(true);for(const b of s.dynamic)b.setLinvel({x:200,y:0,z:200},true);for(const t of s.tyres)t.omega=200/s.radius;
    let rebased=false;for(let i=0;i<130;i++){s.step();if(s.worldOrigin.x!==0)rebased=true;if(i<120)for(const t of s.tyres){assert.equal(t.load,0);assert.equal(t.force.length(),0);}}
    assert.ok(rebased,'fast airborne travel must cross the rebase threshold');
    // Also test an arbitrary shift that does not align with the terrain grid.
    const x=s.x,z=s.z,before=s.road.height(x,z),offset={x:13.17,z:-4.39};s.worldOrigin.x+=offset.x;s.worldOrigin.z+=offset.z;s.road.rebase(offset);
    assert.ok(Math.abs(s.road.height(x-offset.x,z-offset.z)-before)<1e-9);
  }finally{s.free();}
});
