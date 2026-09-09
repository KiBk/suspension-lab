import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';
import { tyreStep, rollingResistance, SURFACES } from './tyres.js';
await RAPIER.init();

export const STEP=1/240;
const GRIP_SPEED=9.6,GRIP_ACCELERATION=80;
export const CORNERS=[
  {name:'Front left',short:'FL',x:.84,z:1.36},{name:'Front right',short:'FR',x:-.84,z:1.36},
  {name:'Rear left',short:'RL',x:.84,z:-1.36},{name:'Rear right',short:'RR',x:-.84,z:-1.36},
];
export const PULL_POINTS=[...CORNERS.map(c=>({...c,y:.24,label:`${c.name} corner`,kind:'corner'})),
  {name:'Front',label:'Front top',short:'FRONT',x:0,y:.46,z:1.38,kind:'top',grip:'end'},
  {name:'Centre',label:'Centre roof',short:'ROOF',x:0,y:1.12,z:0,kind:'top',grip:'level'},
  {name:'Rear',label:'Rear top',short:'REAR',x:0,y:.44,z:-1.48,kind:'top',grip:'end'}];
export const TYPES={
  macpherson:{name:'MacPherson',tag:'STRUT + LOWER ARM',description:'A telescoping strut and a hinged lower arm guide each wheel.',spring:28000,damping:1700},
  wishbone:{name:'Double wishbone',tag:'UPPER + LOWER ARMS',description:'Two hinged arms guide each upright. The wheels follow the linkage as it moves.',spring:38000,damping:2300},
  solid:{name:'Solid axle',tag:'RIGID BEAMS · FOUR-LINK LOCATION',description:'Four physical links locate each axle forwards, backwards and sideways while allowing it to articulate.',spring:28000,damping:1750},
  baja:{name:'Baja truck',tag:'LONG TRAVEL · WISHBONE FRONT / LIVE REAR',description:'Wider front wishbones, a four-link rear axle and long coilovers with extra bypass dampers.',spring:25000,damping:1900},
};
const V=(x=0,y=0,z=0)=>new Vector3(x,y,z),Q=q=>new Quaternion(q.x,q.y,q.z,q.w),Z={x:0,y:0,z:1},ZERO={x:0,y:0,z:0};
const at=(body,p)=>V(p.x,p.y,p.z).applyQuaternion(Q(body.rotation())).add(body.translation());
const local=(body,p)=>V(p.x,p.y,p.z).sub(body.translation()).applyQuaternion(Q(body.rotation()).invert());
const midpoint=(a,b)=>a.clone().add(b).multiplyScalar(.5);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const VEHICLE_GROUP=0x00020001,GROUND_GROUP=0x00010002;

// Every rendered mechanism comes from these rigid bodies and joint anchors.
// There are no prescribed wheel heights, artificial pitch pivots or drawn-only locating arms.
export class Suspension {
  constructor(){this.type='macpherson';this.surface='dry';this.spin=0;this.driving=false;this.input={throttle:0,steer:0};this.reset();}
  reset(){
    this.driving=false;this.input={throttle:0,steer:0};this.steering=0;this.roadSpeed=0;this.lateralG=0;this.rebasedPatches=null;this.worldOrigin={x:0,z:0};
    this.world?.free();this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=STEP;
    this.world.numSolverIterations=16;this.world.numInternalPgsIterations=2;
    this.dynamic=[];this.links=[];this.jointChecks=[];this.springs=[];this.wheelParts=[];this.beams=[];this.drag=null;this.time=0;this.spin=0;
    const baja=this.type==='baja';this.radius=baja?.39:.35;this.rideHeight=baja?1.18:.91;
    // An exact plane keeps every road contact normal vertical. A large, thin
    // box produced spurious sloped contacts at diagonal headings, kicking the
    // wheels and injecting energy even though its top looked perfectly flat.
    this.ground=this.world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace({x:0,y:1,z:0})).setFriction(.8).setRestitution(.02).setCollisionGroups(GROUND_GROUP));
    this.chassis=this.body(V(0,this.rideHeight,0),0,V(.8,.2,2));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(.80,.18,2.03).setTranslation(0,-.08,0).setMass(0).setCollisionGroups(VEHICLE_GROUP),this.chassis);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(.65,.34,.72).setTranslation(0,.56,-.15).setMass(0).setCollisionGroups(VEHICLE_GROUP),this.chassis);
    this.chassis.setAdditionalMassProperties(1180,ZERO,{x:1850,y:2000,z:680},{x:0,y:0,z:0,w:1},true);
    for(let axle=0;axle<2;axle++){
      if(this.type==='solid'||(baja&&axle===1))this.makeAxle(axle,baja);
      else for(let side=0;side<2;side++)this.makeIndependent(axle*2+side,baja);
    }
    this.tyres=this.wheelParts.map(()=>({omega:0,slip:0,spin:0,load:0,force:V(),usage:0,steer:0}));
    // Begin at rest under actual gravity and spring forces, then keep that rest pose.
    for(let i=0;i<720;i++)this.step(STEP,false);
    this.time=0;this.spin=0;this.roadSpeed=0;this.lateralG=0;this.dynamic.forEach(b=>{b.setLinvel(ZERO,true);b.setAngvel(ZERO,true);});
    for(const t of this.tyres){t.omega=0;t.spin=0;t.slip=0;t.force.set(0,0,0);t.usage=0;}
    this.refresh();this.restHeight=this.y;this.totalMass=this.dynamic.reduce((s,b)=>s+b.mass(),0);
  }
  body(position,mass,halfSize=V(.12,.12,.12)){
    const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x,position.y,position.z).setCanSleep(false).setLinearDamping(.04).setAngularDamping(.12).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfSize.x,halfSize.y,halfSize.z).setMass(mass).setCollisionGroups(0),b);
    this.dynamic.push(b);return b;
  }
  joint(data,a,b,check=true){
    const j=this.world.createImpulseJoint(data,a,b,true);j.setContactsEnabled(false);
    if(check)this.jointChecks.push({a,b,p:data.anchor1,q:data.anchor2});return j;
  }
  arm(a,anchorA,b,anchorB,kind,hinged=false,width=0,limits=null){
    const wa=at(a,anchorA),wb=at(b,anchorB),centre=midpoint(wa,wb),rod=this.body(centre,12);
    const pa=wa.clone().sub(centre),pb=wb.clone().sub(centre);
    const create=(p,q)=>hinged?RAPIER.JointData.revolute(p,q,Z):RAPIER.JointData.spherical(p,q);
    const innerJoint=this.joint(create(anchorA,pa),a,rod),outerJoint=this.joint(create(pb,anchorB),rod,b);
    if(limits){innerJoint.setLimits(...limits);outerJoint.setLimits(-.75,.75);}
    for(const dz of width?[-width,width]:[0])this.links.push({body:rod,a:pa.clone().add(V(0,0,dz)),b:pb,kind,length:pa.clone().add(V(0,0,dz)).distanceTo(pb)});
    return rod;
  }
  spring(a,anchorA,b,anchorB,index,preload,minLength,droop,bypass=false){
    const length=at(a,anchorA).distanceTo(at(b,anchorB)),tune=TYPES[this.type];
    const s={a,b,anchorA,anchorB,index,k:tune.spring,c:tune.damping,rest:length+preload/tune.spring,min:minLength,max:length+droop,force:0,bypass};
    this.springs.push(s);
    this.joint(RAPIER.JointData.rope(s.max,anchorA,anchorB),a,b,false);
    return s;
  }
  wheelCollider(body,position){
    // The solver supplies normal contact only; the brush model supplies all
    // tangential friction, including tyre scrub during stationary drop tests.
    return this.world.createCollider(RAPIER.ColliderDesc.cylinder(.135,this.radius).setRotation({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}).setTranslation(position.x,position.y,position.z).setMass(0).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.015).setCollisionGroups(VEHICLE_GROUP),body);
  }
  makeIndependent(i,baja){
    const c=CORNERS[i],side=Math.sign(c.x),track=baja?1.20:.95,hubLocal=V(side*track,this.radius-this.rideHeight+.008,c.z);
    const hub=this.body(at(this.chassis,hubLocal),46,V(.13,.30,.30));
    const collider=this.wheelCollider(hub,V());
    this.wheelParts[i]={body:hub,local:V(),collider,kind:'independent',radius:this.radius};
    const low=V(0,-.18,0),up=V(0,.18,0),inner=V(side*.12,-.28,c.z);
    // Stop the four-bar before its folded branch; angles are relative to the build pose.
    const bounds=side>0?[-.28,.55]:[-.55,.28];
    const lower=this.arm(this.chassis,inner,hub,low,'lower',true,.25,bounds);
    this.links.push({body:hub,a:low,b:up,kind:'upright',length:.36});
    if(this.type==='macpherson'){
      const top=V(side*track,.14,c.z),tube=this.body(at(this.chassis,top),10,V(.05,.25,.05));
      this.joint(RAPIER.JointData.revolute(top,ZERO,Z),this.chassis,tube).setLimits(-.28,.28);
      const prism=RAPIER.JointData.prismatic(ZERO,ZERO,{x:0,y:1,z:0});prism.limitsEnabled=true;prism.limits=[-1.05,-.32];this.joint(prism,tube,hub,false);
      this.spring(this.chassis,top,hub,V(),i,3400,.35,.24);
    }else{
      const upperInner=V(side*(baja?.32:.24),baja?.02:-.015,c.z);
      this.arm(this.chassis,upperInner,hub,up,'upper',true,.20,side>0?[-.4,.7]:[-.7,.4]);
      const bottom=at(this.chassis,inner).lerp(at(hub,low),.78);
      this.spring(this.chassis,V(side*(baja?.87:.77),baja?.23:.14,c.z),lower,local(lower,bottom),i,baja?4600:4300,baja?.36:.35,baja?.39:.24,baja);
    }
  }
  makeAxle(j,baja){
    const z=j===0?1.36:-1.36,half=baja?1.2:1,body=this.body(V(0,this.radius+.008,z),132,V(half,.14,.15));
    this.beams.push({body,half});
    for(let k=0;k<2;k++){
      const side=k===0?1:-1,i=j*2+k,p=V(side*half,0,0);
      this.wheelParts[i]={body,local:p,collider:this.wheelCollider(body,p),kind:'solid',radius:this.radius};
      const direction=j===0?-1:1,run=baja?1.22:.95;
      // Baja retains its direct chassis mounts and original rear-axle travel.
      // With two solid axles, level links prevent opposing front/rear roll steer
      // from feeding a high-speed weave, so that layout uses chassis brackets.
      const lowerMount=V(side*.72,baja?-.17:this.radius-this.rideHeight-.06,z+direction*run);
      const upperMount=V(side*.58,baja?.13:this.radius-this.rideHeight+.16,z+direction*run);
      this.arm(this.chassis,lowerMount,body,V(side*.72,-.06,0),'trailing');
      this.arm(this.chassis,upperMount,body,V(side*.16,.16,0),'trailing');
      // Rigid chassis brackets visibly support the lowered attachment points.
      for(const mount of baja?[]:[lowerMount,upperMount]){
        const rail=V(side*.57,-.12,mount.z);
        this.links.push({body:this.chassis,a:rail,b:mount,kind:'mount',length:rail.distanceTo(mount)});
      }
      const x=side*(baja?.92:.8);
      this.spring(this.chassis,V(x,.12,z),body,V(x,0,0),i,baja?3600:3400,baja?.38:.33,baja?.42:.26,baja);
    }
  }
  setSurface(surface){if(!SURFACES[surface])throw new RangeError('Unknown grip surface');this.surface=surface;}
  setDriving(enabled){
    if(this.driving===enabled)return;
    this.driving=enabled;this.input={throttle:0,steer:0};
    for(const b of this.dynamic)b.setLinearDamping(enabled?0:.04);
    for(let i=0;i<4;i++){

      const w=this.wheelParts[i],forward=V(0,0,1).applyQuaternion(Q(w.body.rotation())),velocity=w.body.velocityAtPoint(at(w.body,w.local));
      this.tyres[i].omega=V(velocity.x,velocity.y,velocity.z).dot(forward)/this.radius;this.tyres[i].slip=0;
    }
    if(!enabled){
      this.steering=0;this.roadSpeed=0;this.lateralG=0;
      for(const b of this.dynamic){const v=b.linvel(),a=b.angvel();b.setLinvel({x:0,y:v.y,z:0},true);b.setAngvel({x:a.x,y:0,z:a.z},true);}
      for(const w of this.wheelParts)w.collider.setRotationWrtParent(new Quaternion(0,0,Math.SQRT1_2,Math.SQRT1_2));
      for(const t of this.tyres){t.force.set(0,0,0);t.usage=0;t.steer=0;t.omega=0;}
    }
  }
  setInput(throttle,steer){this.input={throttle:clamp(throttle,-1,1),steer:clamp(steer,-1,1)};}
  groundPatch(w){
    const sum=V();let count=0;
    this.world.contactPair(w.collider,this.ground,m=>{
      for(let k=0;k<m.numSolverContacts();k++){const p=m.solverContactPoint(k);if(p){sum.add(p);count++;}}
    });
    return count?sum.divideScalar(count):null;
  }
  tyreForces(dt){
    const chassisForward=V(0,0,1).applyQuaternion(Q(this.chassis.rotation()));chassisForward.y=0;chassisForward.normalize();
    const chassisSide=V(chassisForward.z,0,-chassisForward.x),velocity=this.chassis.linvel();
    this.roadSpeed=V(velocity.x,0,velocity.z).dot(chassisForward);
    const target=this.driving?this.input.steer*.38:0;this.steering+=clamp(target-this.steering,-1.2*dt,1.2*dt);
    let lateralForce=0;
    for(let i=0;i<4;i++){
      const w=this.wheelParts[i],t=this.tyres[i],hub=at(w.body,w.local);let load=0,contact=false;
      const patch=this.rebasedPatches?.[i]??this.groundPatch(w)??V(hub.x,0,hub.z);
      this.world.contactPair(w.collider,this.ground,m=>{
        if(m.numSolverContacts())contact=true;
        for(let k=0;k<m.numContacts();k++)load+=m.contactImpulse(k)/dt;
      });
      const axle=V(1,0,0).applyQuaternion(Q(w.body.rotation()));
      const extent=this.radius*Math.sqrt(Math.max(0,1-axle.y*axle.y))+.135*Math.abs(axle.y);
      if(hub.y-extent>.03){contact=false;load=0;}
      t.load=contact?t.load+(load-t.load)*(1-Math.exp(-dt/.025)):0;
      // A virtual steering knuckle rotates each front tyre about its hub.
      t.steer=i<2?Math.atan2(2.72*Math.tan(this.steering),2.72-local(this.chassis,hub).x*Math.tan(this.steering)):0;
      const steerQ=new Quaternion().setFromAxisAngle(V(0,1,0),t.steer),wheelQ=Q(w.body.rotation()).multiply(steerQ);
      w.collider.setRotationWrtParent(steerQ.clone().multiply(new Quaternion(0,0,Math.SQRT1_2,Math.SQRT1_2)));
      const forward=V(0,0,1).applyQuaternion(wheelQ);forward.y=0;forward.normalize();const side=V(forward.z,0,-forward.x);
      const pv=w.body.velocityAtPoint(patch),v=V(pv.x,0,pv.z),hubVelocity=w.body.velocityAtPoint(hub);
      // Read-only acoustic telemetry at the same contact used by the tyre model.
      t.contact=contact;t.longitudinal=v.dot(forward);t.lateral=v.dot(side);t.verticalSpeed=hubVelocity.y;
      const torque=this.driving?this.input.throttle*(this.totalMass||1500)*2.8/4*this.radius:0;
      const result=tyreStep(t,{load:t.load,longitudinal:v.dot(forward),lateral:v.dot(side),torque,radius:this.radius,dt,grip:SURFACES[this.surface].grip});
      t.rollingResistance=rollingResistance(V(hubVelocity.x,0,hubVelocity.z).dot(forward),t.load,this.type==='baja'?.018:.012);
      t.force.copy(forward).multiplyScalar(result.longitudinal+t.rollingResistance).addScaledVector(side,result.lateral);t.usage=result.usage;
      if(contact){
        w.body.addForceAtPoint(side.clone().multiplyScalar(result.lateral),patch,true);
        // Longitudinal contact torque spins the free rotor; only drive reaction
        // is transmitted through its bearing to the suspension upright.
        w.body.addForceAtPoint(forward.clone().multiplyScalar(result.longitudinal+t.rollingResistance),hub,true);
      }else t.force.set(0,0,0);
      w.body.addTorque(V(1,0,0).applyQuaternion(wheelQ).multiplyScalar(-torque),true);
      lateralForce+=t.force.dot(chassisSide);t.spin=(t.spin+t.omega*dt)%(Math.PI*2);
    }
    this.lateralG=lateralForce/((this.totalMass||1500)*9.81);
  }
  setType(type){if(!TYPES[type])throw new RangeError('Unknown suspension design');this.type=type;this.reset();}
  point(p){return at(this.chassis,{x:p.x,y:p.y??0,z:p.z});}
  pullPoint(i){return this.point(PULL_POINTS[i]);}
  beginDrag(i,target=this.pullPoint(i).y){
    this.beginGrip(this.chassis,PULL_POINTS[i],PULL_POINTS[i].grip==='level',target,{kind:'body',i});
  }
  beginBodyDrag(anchor,level=false){
    this.beginGrip(this.chassis,anchor,level,this.point(anchor).y,{kind:'body'});
  }
  beginWheelDrag(i,target=at(this.wheelParts[i].body,this.wheelParts[i].local).y){
    const w=this.wheelParts[i];
    this.beginGrip(w.body,w.local,false,target,{kind:'wheel',i});
  }
  beginGrip(body,anchor,fixed,target,selection){
    this.release();const p=at(body,anchor),rotation=body.rotation();
    const hand=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z).setRotation(rotation));
    // Put the hand first so its fixed frame defines world vertical. Lock only
    // height; horizontal travel stays free. The centre also holds pitch/roll,
    // but leaves yaw free so steering can continue while lifting.
    const axis=V(0,1,0).applyQuaternion(Q(rotation).invert());
    const mask=RAPIER.JointAxesMask.LinX|(fixed?RAPIER.JointAxesMask.AngY|RAPIER.JointAxesMask.AngZ:0);
    const data=RAPIER.JointData.generic(ZERO,anchor,axis,mask);
    const joint=this.joint(data,hand,body,false);
    // Extra iterations keep fast grip impulses from opening the small links.
    this.world.numSolverIterations=32;
    // Allow pushing below the settled body height, including after picking up
    // an airborne car. Bounds follow the part, rather than blocking at pickup.
    const minHeight=selection.kind==='wheel'?this.radius:Math.max(.05,p.y-body.translation().y+this.restHeight-.35);
    this.drag={...selection,target,x:p.x,z:p.z,hand,joint,level:fixed,body,anchor:V(anchor.x,anchor.y,anchor.z),minHeight:Math.min(p.y,minHeight),maxHeight:p.y+2.4,speed:0};
  }
  setDragHeight(height){
    if(!this.drag)return;
    const d=this.drag;
    let min=d.minHeight;
    if(d.kind==='wheel'){
      const axle=V(1,0,0).applyQuaternion(Q(d.body.rotation()));
      min=this.radius*Math.sqrt(Math.max(0,1-axle.y*axle.y))+.135*Math.abs(axle.y);
    }
    d.target=clamp(height,min,d.maxHeight);
  }
  release(){if(this.drag){this.world.removeRigidBody(this.drag.hand);this.drag=null;this.world.numSolverIterations=16;}}
  drop(height=.75){this.release();this.dynamic.forEach(b=>{const p=b.translation();b.setTranslation({x:p.x,y:p.y+height,z:p.z},true);b.setLinvel(ZERO,true);b.setAngvel(ZERO,true);});this.refresh();}
  nudge(){this.chassis.applyTorqueImpulse({x:0,y:0,z:550},true);}
  step(dt=STEP,refresh=true){
    this.world.timestep=dt;
    for(const b of this.dynamic){b.resetForces(false);b.resetTorques(false);}
    for(const s of this.springs){
      const pa=at(s.a,s.anchorA),pb=at(s.b,s.anchorB),axis=pa.clone().sub(pb),length=axis.length();axis.divideScalar(Math.max(length,1e-5));
      const va=s.a.velocityAtPoint(pa),vb=s.b.velocityAtPoint(pb),v=V(va.x-vb.x,va.y-vb.y,va.z-vb.z).dot(axis);
      s.velocity=v;s.length=length;
      // Progressive bump stops and a stiffer end zone in Baja's bypass damper.
      const damping=s.c*(s.bypass&&length<s.min+.18?2.0:1);
      let force=s.k*(s.rest-length)-damping*v;
      if(length<s.min)force+=140000*(s.min-length)-1800*Math.min(v,0);
      if(length>s.max-.025)force-=70000*Math.max(0,length-s.max+.025);
      s.force=clamp(force,-40000,60000);const f=axis.multiplyScalar(s.force);
      s.a.addForceAtPoint(f,pa,true);s.b.addForceAtPoint(f.clone().negate(),pb,true);
    }
    this.tyreForces(dt);
    if(this.drag){
      const d=this.drag,p=d.hand.translation(),distance=d.target-p.y;
      // Accelerate briskly, then brake over the remaining distance. This lets
      // quick pointer motions through without shocking the small wheel links.
      const desired=Math.sign(distance)*Math.min(GRIP_SPEED,Math.sqrt(2*GRIP_ACCELERATION*Math.abs(distance)));
      d.speed+=clamp(desired-d.speed,-GRIP_ACCELERATION*dt,GRIP_ACCELERATION*dt);
      let dy=d.speed*dt;
      if(dy*distance>=0&&Math.abs(dy)>Math.abs(distance)){dy=distance;d.speed=dy/dt;}
      // Follow the selected part to keep joint coordinates small. These axes
      // are unconstrained: following cannot brake or propel the car.
      const anchor=at(d.body,d.anchor),velocity=d.body.velocityAtPoint(anchor);
      d.x=anchor.x+velocity.x*dt;d.z=anchor.z+velocity.z*dt;
      d.hand.setNextKinematicTranslation({x:d.x,y:p.y+dy,z:d.z});
    }
    this.world.step();this.time+=dt;
    // Rebase the empty world to preserve precision during endless coasting.
    this.rebasedPatches=null;const centre=this.chassis.translation();if(Math.max(Math.abs(centre.x),Math.abs(centre.z))>60){
      const offset={x:centre.x,z:centre.z};this.worldOrigin.x+=offset.x;this.worldOrigin.z+=offset.z;
      // Solver points combine anchors on the wheel and stationary road. Read
      // them before moving either body, then translate the complete points.
      // Reading afterward mixes coordinate frames and creates huge tyre-force
      // lever arms. Retain these points until the next completed solver step.
      this.rebasedPatches=this.wheelParts.map(w=>this.groundPatch(w)?.sub(V(offset.x,0,offset.z))??null);
      for(const b of this.dynamic){const p=b.translation();b.setTranslation({x:p.x-offset.x,y:p.y,z:p.z-offset.z},false);}
      if(this.drag){const d=this.drag,p=d.hand.translation();d.x-=offset.x;d.z-=offset.z;d.hand.setTranslation({x:p.x-offset.x,y:p.y,z:p.z-offset.z},true);}
    }

    if(refresh)this.refresh();
  }
  refresh(){
    const p=this.chassis.translation(),q=Q(this.chassis.rotation()),forward=V(0,0,1).applyQuaternion(q),left=V(1,0,0).applyQuaternion(q);
    const e={x:-Math.atan2(forward.y,Math.hypot(forward.x,forward.z)),z:Math.atan2(left.y,Math.hypot(left.x,left.z))};
    this.x=p.x;this.y=p.y;this.z=p.z;this.pitch=e.x;this.roll=e.z;this.vy=this.chassis.linvel().y;
    this.wheels=this.wheelParts.map((w,i)=>{const p=at(w.body,w.local),s=this.springs.find(s=>s.index===i),length=at(s.a,s.anchorA).distanceTo(at(s.b,s.anchorB));let contact=false;
      this.world.contactPair(w.collider,this.ground,m=>{if(m.numSolverContacts()>0)contact=true;});
      return{y:p.y,v:w.body.linvel().y,contact,force:s.force,compression:s.rest-length};});
  }
  frame(){
    return {position:this.chassis.translation(),rotation:this.chassis.rotation(),spin:this.spin,
      wheels:this.wheelParts.map((w,i)=>({position:at(w.body,w.local),rotation:Q(w.body.rotation()).multiply(new Quaternion().setFromAxisAngle(V(0,1,0),this.driving?this.tyres[i].steer:0)),radius:w.radius,spin:this.tyres?.[i]?.spin??0})),
      links:this.links.map(l=>({a:at(l.body,l.a),b:at(l.body,l.b),kind:l.kind})),
      springs:[...this.springs].sort((a,b)=>a.index-b.index).map(s=>({top:at(s.a,s.anchorA),bottom:at(s.b,s.anchorB),bypass:s.bypass})),
      beams:this.beams.map(b=>({a:at(b.body,V(b.half,0,0)),b:at(b.body,V(-b.half,0,0)),rotation:b.body.rotation()}))};
  }
  constraintError(){let error=0;for(const j of this.jointChecks)error=Math.max(error,at(j.a,j.p).distanceTo(at(j.b,j.q)));return error;}
  snapshot(){return{type:this.type,surface:this.surface,x:this.x,y:this.y,z:this.z,pitch:this.pitch,roll:this.roll,velocity:this.vy,dragging:this.drag?.i??(this.drag?'body':null),gripKind:this.drag?.kind??null,driving:this.driving,speed:this.roadSpeed,steering:this.steering,lateralG:this.lateralG,tyres:this.tyres?.map(t=>({load:t.load,usage:t.usage,slip:t.slip,force:t.force.toArray(),omega:t.omega}))??[],wheels:this.wheels.map(w=>({...w})),constraintError:this.constraintError()};}
  free(){this.world.free();}
}
