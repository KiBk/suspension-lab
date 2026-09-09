import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3,Quaternion} from 'three';

export const TERRAINS={
  flat:{name:'Flat',grip:1,rolling:1,color:'#e6e9dd',description:'Smooth, level road.'},
  gravel:{name:'Gravel',grip:.76,rolling:1.65,color:'#cec8b6',description:'Small corrugations, looser grip and more rolling resistance.'},
  rough:{name:'Rough trail',grip:.83,rolling:1.35,color:'#bfc8aa',description:'A smooth start leads into deep bumps and dips. Try the Baja truck at speed.'},
};
export const TERRAIN_STEP=.25,TILE_SIZE=12,TILE_CELLS=TILE_SIZE/TERRAIN_STEP;
const groundGroups=0x00010002;
export function terrainHeight(type,x,z){
  if(type==='gravel')return .019*Math.sin(3.2*z+.65*Math.sin(.7*x))+.010*Math.sin(5.1*x+2.1*z);
  if(type==='rough'){
    const t=Math.max(0,Math.min(1,(Math.hypot(x,z)-2.5)/4)),entry=t*t*(3-2*t);
    return entry*(.14*Math.sin(1.8*z+.6*Math.sin(.9*x))+.09*Math.sin(1.2*x-.9*z)+.035*Math.sin(3.8*z+1.8*x));
  }
  return 0;
}
// Sample the same two triangles as Rapier and the visible mesh. The diagonal
// joins (x+1,z) to (x,z+1), so contact and rendered heights agree at any point.
export function roadHeight(type,x,z){
  if(type==='flat')return 0;
  const ix=Math.floor(x/TERRAIN_STEP),iz=Math.floor(z/TERRAIN_STEP),u=x/TERRAIN_STEP-ix,v=z/TERRAIN_STEP-iz;
  const h=(dx,dz)=>Math.fround(terrainHeight(type,(ix+dx)*TERRAIN_STEP,(iz+dz)*TERRAIN_STEP));
  const a=h(0,0),b=h(1,0),c=h(0,1),d=h(1,1);
  return u+v<1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
// Heightfields use column-major (Z rows, X columns) vertex data.
export function tileHeights(type,tx,tz){
  const n=TILE_CELLS+1,heights=new Float32Array(n*n);
  for(let x=0;x<n;x++)for(let z=0;z<n;z++)heights[x*n+z]=terrainHeight(type,tx*TILE_SIZE+x*TERRAIN_STEP,tz*TILE_SIZE+z*TERRAIN_STEP);
  return heights;
}
export class Road {
  constructor(world,type='flat',origin={x:0,z:0}){
    this.world=world;this.type=type;this.origin=origin;this.tiles=new Map();this.handles=new Set();this.states=new Map();this.events=type==='flat'?null:new RAPIER.EventQueue(true);
    if(type==='flat'){
      this.plane=world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace({x:0,y:1,z:0})).setFriction(.8).setRestitution(.02).setCollisionGroups(groundGroups));
      this.handles.add(this.plane.handle);
    }else this.ensure(0,0);
  }
  height(x,z){return roadHeight(this.type,x+this.origin.x,z+this.origin.z);}
  ensure(x,z){
    if(this.plane)return;
    const tx=Math.floor((x+this.origin.x)/TILE_SIZE),tz=Math.floor((z+this.origin.z)/TILE_SIZE);
    if(tx===this.tx&&tz===this.tz)return;this.tx=tx;this.tz=tz;
    const keep=new Set();
    for(let i=tx-1;i<=tx+1;i++)for(let j=tz-1;j<=tz+1;j++){
      const key=`${i},${j}`;keep.add(key);if(this.tiles.has(key))continue;
      const desc=RAPIER.ColliderDesc.heightfield(TILE_CELLS,TILE_CELLS,tileHeights(this.type,i,j),{x:TILE_SIZE,y:1,z:TILE_SIZE},RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES)
        .setTranslation((i+.5)*TILE_SIZE-this.origin.x,0,(j+.5)*TILE_SIZE-this.origin.z).setFriction(.8).setRestitution(.02).setCollisionGroups(groundGroups);
      const collider=this.world.createCollider(desc);this.tiles.set(key,collider);this.handles.add(collider.handle);
    }
    for(const [key,c] of this.tiles)if(!keep.has(key)){this.handles.delete(c.handle);this.world.removeCollider(c,true);this.tiles.delete(key);}
  }
  contacts(collider,callback){
    if(this.plane){this.world.contactPair(collider,this.plane,callback);return;}
    const neighbours=[];this.world.contactPairsWith(collider,other=>{if(this.handles.has(other.handle))neighbours.push(other);});
    for(const other of neighbours)this.world.contactPair(collider,other,callback);
  }
  capture(){
    if(!this.events)return;this.states.clear();
    // Rapier's heightfield contact manifolds omit solver contacts/impulses.
    // Contact-force events carry the actual solved normal force for the pair.
    this.events.drainContactForceEvents(e=>{
      const a=e.collider1(),b=e.collider2(),handle=this.handles.has(a)?b:this.handles.has(b)?a:null;
      if(handle===null)return;
      const force=new Vector3().copy(e.totalForce());if(force.y<0)force.negate();
      const state=this.states.get(handle)??{load:0,normal:new Vector3(),point:null};state.load+=e.totalForceMagnitude();state.normal.add(force);this.states.set(handle,state);
    });
    for(const [handle,state] of this.states){
      state.normal.normalize();const collider=this.world.getCollider(handle),point=new Vector3(),q=new Quaternion().copy(collider.rotation());let count=0;
      this.contacts(collider,(m,flipped)=>{
        for(let k=0;k<m.numContacts();k++)if(m.contactDist(k)<.015){
          const p=flipped?m.localContactPoint2(k):m.localContactPoint1(k);if(p){point.add(new Vector3().copy(p).applyQuaternion(q).add(collider.translation()));count++;}
        }
      });
      if(count)state.point=point.divideScalar(count);
    }
  }
  rebase(offset){for(const s of this.states.values())if(s.point){s.point.x-=offset.x;s.point.z-=offset.z;}for(const c of this.tiles.values()){const p=c.translation();c.setTranslation({x:p.x-offset.x,y:p.y,z:p.z-offset.z});}}
  free(){this.events?.free();for(const c of this.tiles.values())this.world.removeCollider(c,true);if(this.plane)this.world.removeCollider(this.plane,true);this.tiles.clear();this.handles.clear();}
}
