import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3,Quaternion} from 'three';
const V=(x=0,y=0,z=0)=>new Vector3(x,y,z),Q=q=>new Quaternion(q.x,q.y,q.z,q.w);
const IDENTITY={x:0,y:0,z:0,w:1},DEGREES=180/Math.PI;
// Representative whole-structure stiffness, Nm per degree, for fictional cars.
// These describe elastic construction, not a measured production body or failure load.
export const CHASSIS_FLEX={
 compact:{torsion:11000,bending:30000},hatchback:{torsion:15500,bending:40000},
 sedan:{torsion:28000,bending:65000},wagon:{torsion:21000,bending:48000},
 coupe:{torsion:27000,bending:62000},sports:{torsion:32000,bending:75000},
 minivan:{torsion:14000,bending:42000},suv:{torsion:24000,bending:55000},
 pickup:{torsion:5500,bending:21000,frame:true},offroad:{torsion:7500,bending:25000,frame:true},
};
const worldPoint=(body,p)=>V(p.x,p.y,p.z).applyQuaternion(Q(body.rotation())).add(body.translation());
export class ElasticChassis {
 constructor(sim){
  this.sim=sim;this.cfg=sim.setup;this.tune=CHASSIS_FLEX[this.cfg.id];this.boundary=this.cfg.wheelbase*.22;
  const half=this.cfg.length/2,b=this.boundary;
  this.sections=[{name:'rear',min:-half,max:-b},{name:'centre',min:-b,max:b},{name:'front',min:b,max:half}];
  // Section reference frames share the original body coordinates. Their centres
  // of mass are offset: subdivision preserves the original mass and box inertia.
  for(const section of this.sections){section.body=section.name==='centre'?sim.chassis:sim.body(V(0,sim.rideHeight,0),0);section.length=section.max-section.min;section.centre=(section.max+section.min)/2;}
  this.bodies=this.sections.map(s=>s.body);this.setMass(sim.bodyMass);this.joints=[];
  for(const i of [0,2]){
   const section=this.sections[i],anchor=V(0,0,i===0?-b:b),a=sim.chassis,bBody=section.body;
   const joint=sim.world.createImpulseJoint(RAPIER.JointData.spherical(anchor,anchor),a,bBody,true);joint.setContactsEnabled(false);
   sim.jointChecks.push({a,b:bBody,p:anchor,q:anchor});
   const stiffness=[this.tune.bending,this.tune.bending*1.3,this.tune.torsion].map(k=>2*k*DEGREES);
   // Two elastic joints in series yield the specified front-to-rear stiffness.
   // Force-based implicit motors use physical Nm/rad and Nm.s/rad coefficients.
   stiffness.forEach((k,axis)=>{
    const dof=[RAPIER.JointAxis.AngX,RAPIER.JointAxis.AngY,RAPIER.JointAxis.AngZ][axis];
    const effectiveInertia=sim.bodyMass*(axis===2?this.cfg.width**2:this.cfg.length**2)/48;
    sim.world.impulseJoints.raw.jointConfigureMotorModel(joint.handle,dof,RAPIER.MotorModel.ForceBased);
    sim.world.impulseJoints.raw.jointConfigureMotorPosition(joint.handle,dof,0,k,2*.12*Math.sqrt(k*effectiveInertia));
    sim.world.impulseJoints.raw.jointSetLimits(joint.handle,dof,axis===2?-.055:-.025,axis===2?.055:.025);
   });
   this.joints.push({joint,a,b:bBody,anchor,stiffness});
  }
  this.colliders=[];
  for(const section of this.sections){
   const c=sim.world.createCollider(RAPIER.ColliderDesc.cuboid(this.cfg.width*.44,.18,section.length*.47).setTranslation(0,this.cfg.clearance-this.cfg.ride+.18,section.centre).setMass(0).setCollisionGroups(0x00020001),section.body);
   this.colliders.push(c);
  }
  const roof=sim.world.createCollider(RAPIER.ColliderDesc.cuboid(this.cfg.width*.35,this.cfg.roof*.32,this.cfg.wheelbase*.27).setTranslation(0,this.cfg.geometry.height+this.cfg.lift-this.cfg.ride-this.cfg.roof*.32,-.15).setMass(0).setCollisionGroups(0x00020001),sim.chassis);
  this.colliders.push(roof);sim.floorCollider=this.colliders[1];sim.roofCollider=roof;
 }
 setMass(mass){
  const c=this.cfg;
  for(const s of this.sections){const m=mass*s.length/c.length;
   s.body.setAdditionalMassProperties(m,V(0,0,s.centre),{x:m*(s.length**2+c.roof**2)/12,y:m*(s.length**2+c.width**2)/12,z:m*(c.width**2+c.roof**2)/12},IDENTITY,true);
  }
 }
 bodyAt(z){return this.sections[z>this.boundary?2:z<-this.boundary?0:1].body;}
 point(p){return worldPoint(this.bodyAt(p.z),p);}
 anchor(world){
  const centre=this.sim.chassis,p=V().copy(world).sub(centre.translation()).applyQuaternion(Q(centre.rotation()).invert());
  const body=this.bodyAt(p.z);return V().copy(world).sub(body.translation()).applyQuaternion(Q(body.rotation()).invert());
 }
 state(){
  const front=Q(this.sections[2].body.rotation()),rear=Q(this.sections[0].body.rotation()),relative=rear.invert().multiply(front);if(relative.w<0){relative.x*=-1;relative.y*=-1;relative.z*=-1;relative.w*=-1;}
  return {twist:2*Math.atan2(relative.z,relative.w),bend:2*Math.atan2(relative.x,relative.w),torsionStiffness:this.tune.torsion,bendingStiffness:this.tune.bending,construction:this.tune.frame?'frame':'unibody'};
 }
 frame(){return this.sections.map(s=>({name:s.name,position:s.body.translation(),rotation:s.body.rotation()}));}
}
