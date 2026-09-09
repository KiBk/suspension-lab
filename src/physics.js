import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';
import { tyreStep, rollingResistance, SURFACES } from './tyres.js';
import { SETUPS } from './setups.js';
import { Road, TERRAINS } from './terrain.js';
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
  constructor(setupId=null){this.setupId=setupId;this.type=setupId==='baja'?'baja':setupId==='pickup'?'solid':SETUPS[setupId]?.front??'macpherson';this.terrainType='flat';this.surface='dry';this.spin=0;this.driving=false;this.input={throttle:0,steer:0};this.reset();}
  reset(){
    this.driving=false;this.input={throttle:0,steer:0};this.steering=0;this.roadSpeed=0;this.lateralG=0;this.rebasedPatches=null;this.worldOrigin={x:0,z:0};
    this.road?.events?.free();this.world?.free();this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=STEP;
    this.world.numSolverIterations=16;this.world.numInternalPgsIterations=2;
    this.dynamic=[];this.links=[];this.leaves=[];this.jointChecks=[];this.springs=[];this.wheelParts=[];this.beams=[];this.drag=null;this.time=0;this.spin=0;this.solverBoostUntil=0;
    const cfg=this.setup=SETUPS[this.setupId]??null,baja=this.type==='baja';
    this.radius=cfg?.radius??(baja?.39:.35);this.rideHeight=cfg?.ride??(baja?1.18:.91);this.wheelbase=cfg?.wheelbase??2.72;
    this.corners=CORNERS.map((c,i)=>({...c,x:cfg?.wheels[i].position[0]??c.x,z:cfg?.wheels[i].position[2]??c.z*this.wheelbase/2.72}));this.torsionArms=[];
    const unsprung={macpherson:120,wishbone:108,multilink:132,solid:148,leaf:158,torsion:116};
    this.bodyMass=cfg?cfg.mass-unsprung[cfg.front]-unsprung[cfg.rear]:1180;
    // An exact plane keeps every road contact normal vertical. A large, thin
    // box produced spurious sloped contacts at diagonal headings, kicking the
    // wheels and injecting energy even though its top looked perfectly flat.
    this.road=new Road(this.world,'flat',this.worldOrigin);this.ground=this.road.plane;
    this.chassis=this.body(V(0,this.rideHeight,0),0,V(.8,.2,2));
    this.floorCollider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(cfg?cfg.width*.44:.80,.18,cfg?cfg.length*.47:2.03).setTranslation(0,cfg?cfg.clearance-cfg.ride+.18:-.08,0).setMass(0).setCollisionGroups(VEHICLE_GROUP),this.chassis);
    this.roofCollider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(cfg?cfg.width*.35:.65,cfg?cfg.roof*.32:.34,cfg?cfg.wheelbase*.27:.72).setTranslation(0,cfg?cfg.geometry.height+cfg.lift-cfg.ride-cfg.roof*.32:.56,-.15).setMass(0).setCollisionGroups(VEHICLE_GROUP),this.chassis);
    const inertia=cfg?{x:this.bodyMass*(cfg.length**2+cfg.roof**2)/12,y:this.bodyMass*(cfg.length**2+cfg.width**2)/12,z:this.bodyMass*(cfg.width**2+cfg.roof**2)/12}:{x:1850,y:2000,z:680};
    this.chassis.setAdditionalMassProperties(this.bodyMass,ZERO,inertia,{x:0,y:0,z:0,w:1},true);
    for(let axle=0;axle<2;axle++){
      const layout=cfg?(axle===0?cfg.front:cfg.rear):this.type==='solid'||(baja&&axle===1)?'solid':this.type==='macpherson'?'macpherson':'wishbone';
      if(cfg)this.makeModelAxle(axle,layout);
      else if(layout==='solid')this.makeAxle(axle,baja);
      else for(let side=0;side<2;side++)layout==='torsion'?this.makeTrailingWheel(axle*2+side):this.makeIndependent(axle*2+side,baja,layout);
    }
    if(cfg){
      const previous=this.bodyMass;this.bodyMass=cfg.mass-this.dynamic.filter(b=>b!==this.chassis).reduce((n,b)=>n+b.mass(),0);
      for(const key of ['x','y','z'])inertia[key]*=this.bodyMass/previous;
      this.chassis.setAdditionalMassProperties(this.bodyMass,ZERO,inertia,{x:0,y:0,z:0,w:1},true);
      for(const spring of this.springs)spring.rest+=(this.bodyMass-previous)*9.81/4/spring.ratio/spring.k;
    }
    this.tyres=this.wheelParts.map(()=>({omega:0,slip:0,spin:0,load:0,force:V(),usage:0,steer:0}));
    // Begin at rest under actual gravity and spring forces, then keep that rest pose.
    for(let i=0;i<720;i++)this.step(STEP,false);
    this.time=0;this.spin=0;this.roadSpeed=0;this.lateralG=0;this.dynamic.forEach(b=>{b.setLinvel(ZERO,true);b.setAngvel(ZERO,true);});
    for(const t of this.tyres){t.omega=0;t.spin=0;t.slip=0;t.force.set(0,0,0);t.usage=0;}
    this.refresh();this.restHeight=this.y;this.totalMass=this.dynamic.reduce((s,b)=>s+b.mass(),0);
    if(cfg){this.configureTravel();for(const collider of [this.floorCollider,this.roofCollider]){const p=collider.translationWrtParent();collider.setTranslationWrtParent({x:p.x,y:p.y+cfg.ride-this.restHeight,z:p.z});}}
    if(this.terrainType!=='flat'){this.road.free();this.road=new Road(this.world,this.terrainType,this.worldOrigin);this.ground=null;}
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
    const wa=at(a,anchorA),wb=at(b,anchorB),centre=midpoint(wa,wb),rod=this.body(centre,this.setup?4:12);
    const pa=wa.clone().sub(centre),pb=wb.clone().sub(centre);
    const create=(p,q)=>hinged?RAPIER.JointData.revolute(p,q,Z):RAPIER.JointData.spherical(p,q);
    const innerJoint=this.joint(create(anchorA,pa),a,rod),outerJoint=this.joint(create(pb,anchorB),rod,b);
    if(limits){innerJoint.setLimits(...limits);outerJoint.setLimits(-.75,.75);}
    for(const dz of width?[-width,width]:[0])this.links.push({body:rod,a:pa.clone().add(V(0,0,dz)),b:pb,kind,length:pa.clone().add(V(0,0,dz)).distanceTo(pb)});
    return rod;
  }
  spring(a,anchorA,b,anchorB,index,preload,minLength,droop,bypass=false){
    const length=at(a,anchorA).distanceTo(at(b,anchorB)),tune=TYPES[this.type];
    const cfg=this.setup,axle=index<2?0:1,layout=cfg?(axle===0?cfg.front:cfg.rear):null,ratio=layout==='wishbone'?.78:1;
    const k=cfg?cfg.spring[axle]/ratio**2:tune.spring,c=cfg?cfg.damping[axle]/ratio**2:tune.damping;
    if(cfg)preload=this.bodyMass*9.81/4/ratio;
    const s={a,b,anchorA,anchorB,index,k,c,ratio,rest:length+preload/k,min:cfg?.08:minLength,max:length+(cfg?.6:droop),force:0,bypass};
    this.springs.push(s);
    s.rope=this.joint(RAPIER.JointData.rope(s.max,anchorA,anchorB),a,b,false);
    return s;
  }
  wheelCollider(body,position,radius=this.radius,width=.27){
    // The solver supplies normal contact only; the brush model supplies all
    // tangential friction, including tyre scrub during stationary drop tests.
    return this.world.createCollider(RAPIER.ColliderDesc.cylinder(width/2,radius).setRotation({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}).setTranslation(position.x,position.y,position.z).setMass(0).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.015).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setCollisionGroups(VEHICLE_GROUP),body);
  }
  makeModelAxle(axle,layout){
    if(layout==='solid'||layout==='leaf')return this.makeModelLiveAxle(axle,layout);
    for(let side=0;side<2;side++){
      const i=axle*2+side,c=this.corners[i],cfg=this.setup,shape=cfg.wheels[i],sign=Math.sign(c.x),r=shape.radius;
      const hubLocal=V(c.x,r-this.rideHeight+.008,c.z),hub=this.body(at(this.chassis,hubLocal),46,V(shape.width/2,r*.65,r*.65));
      this.wheelParts[i]={body:hub,local:V(),collider:this.wheelCollider(hub,V(),r,shape.width),kind:layout==='torsion'?'torsion':'independent',radius:r,width:shape.width};
      const height=Math.min(.14,r*.42),reach=Math.min(.43,Math.abs(c.x)*.53),low=V(0,-height,0),up=V(0,height,0);
      const inner=V(c.x-sign*reach,hubLocal.y-height+.01,c.z),top=V(c.x-sign*.055,hubLocal.y+(layout==='macpherson'?.44:r*.98),c.z);
      this.links.push({body:hub,a:low,b:up,kind:'upright',length:height*2});
      if(layout==='torsion'){
        const pivot=V(c.x,hubLocal.y+.05,c.z+.55),a=at(this.chassis,pivot),b=V().copy(hub.translation()),centre=midpoint(a,b),arm=this.body(centre,12),pa=a.clone().sub(centre),pb=b.clone().sub(centre);
        this.joint(RAPIER.JointData.revolute(pivot,pa,V(1,0,0)),this.chassis,arm).setLimits(-.45,.45);
        this.joint(RAPIER.JointData.fixed(pb,{x:0,y:0,z:0,w:1},ZERO,{x:0,y:0,z:0,w:1}),arm,hub);
        this.links.push({body:arm,a:pa,b:pb,kind:'trailing',length:pa.distanceTo(pb)});this.torsionArms.push({body:arm,point:pa.clone().lerp(pb,.42)});
        const springX=-sign*.11;this.spring(this.chassis,top.clone().add(V(springX,0,-.06)),hub,V(springX,0,-.06),i,0,.10,.2);
      }else if(layout==='multilink'){
        const anchors=[[-height,.11,reach,.22,.012],[-height,-.11,reach,.24,.012],[height,.09,reach*.76,.20,-.015],[height,-.09,reach*.78,.19,-.015],[0,-.13,reach*.90,.13,0]];
        for(const [y,z,length,spread,dy] of anchors)this.arm(this.chassis,V(c.x-sign*length,hubLocal.y+y+dy,c.z+Math.sign(z)*spread),hub,V(0,y,z),'multilink');
        this.spring(this.chassis,top,hub,V(-sign*.06,-height*.3,0),i,0,.12,.2);
      }else{
        const lower=this.arm(this.chassis,inner,hub,low,'lower',true,.17,sign>0?[-.40,.55]:[-.55,.40]);
        if(layout==='macpherson'){
          // A real telescoping strut, inclined inwards at its upper bearing.
          const axis=top.clone().sub(hubLocal).normalize(),tube=this.body(at(this.chassis,top),10,V(.045,.20,.045));
          this.joint(RAPIER.JointData.revolute(top,ZERO,Z),this.chassis,tube).setLimits(-.40,.40);
          const prism=RAPIER.JointData.prismatic(ZERO,ZERO,axis);prism.limitsEnabled=true;prism.limits=[-.85,-.12];this.joint(prism,tube,hub,false);
          this.spring(this.chassis,top,hub,V(),i,0,.12,.2);
        }else{
          this.arm(this.chassis,V(c.x-sign*reach*.76,hubLocal.y+height-.018,c.z),hub,up,'upper',true,.13,sign>0?[-.5,.7]:[-.7,.5]);
          const bottom=at(this.chassis,inner).lerp(at(hub,low),.78);
          this.spring(this.chassis,top,lower,local(lower,bottom),i,0,.12,.2);
        }
      }
    }
  }
  makeModelLiveAxle(axle,layout){
    const cfg=this.setup,z=(this.corners[axle*2].z+this.corners[axle*2+1].z)/2,r=cfg.wheels[axle*2].radius,half=cfg.track,beam=this.body(V(0,r+.008,z),132,V(half,.12,.12));this.beams.push({body:beam,half});
    for(let side=0;side<2;side++){
      const sign=side===0?1:-1,i=axle*2+side,x=this.corners[i].x,shape=cfg.wheels[i],p=V(x,0,0),springX=sign*half*.70;
      this.wheelParts[i]={body:beam,local:p,collider:this.wheelCollider(beam,p,r,shape.width),kind:'solid',radius:r,width:shape.width};
      if(layout==='leaf'){
        // Two effective half-leaves and a swinging rear shackle locate the axle.
        // Their distributed bending is represented by the effective wheel-rate
        // spring law below; this is a lumped flexible-leaf approximation.
        const front=V(springX,r-this.rideHeight+.18,z+.68),seat=V(springX,.09,0),hanger=V(springX,r-this.rideHeight+.27,z-.68),rearWorld=at(this.chassis,hanger).add(V(0,-.13,.025));
        this.arm(this.chassis,front,beam,seat,'leaf-guide');
        const shackle=this.body(midpoint(at(this.chassis,hanger),rearWorld),5,V(.045,.08,.04)),ha=local(shackle,at(this.chassis,hanger)),end=local(shackle,rearWorld);
        this.joint(RAPIER.JointData.revolute(hanger,ha,V(1,0,0)),this.chassis,shackle).setLimits(-.9,.9);
        this.arm(shackle,end,beam,seat,'leaf-guide');
        this.leaves.push({front,seat,body:beam,shackle,rear:end,hanger});
      }else{
        const dir=axle===0?-1:1,run=.67;
        for(const upper of [false,true]){
          const outerX=upper?sign*half*.22:sign*half*.76,y=upper?.13:-.055;
          const mount=V(sign*half*(upper?.58:.76),r-this.rideHeight+y,z+dir*run);
          this.arm(this.chassis,mount,beam,V(outerX,y,0),'trailing');
        }
      }
      const spring=this.spring(this.chassis,V(springX,r-this.rideHeight+.37,z),beam,V(springX,0,0),i,0,.1,.25);spring.leaf=layout==='leaf';
    }
    if(layout==='leaf'){
      // Leaf packs resist lateral shear, yaw and axle wind-up. Keep vertical
      // movement, fore/aft growth and axle roll free; the half-leaves and
      // shackles supply their geometric location.
      const joint=this.joint(RAPIER.JointData.generic(V(0,r-this.rideHeight,z),ZERO,V(1,0,0),RAPIER.JointAxesMask.LinX|RAPIER.JointAxesMask.AngX|RAPIER.JointAxesMask.AngY),this.chassis,beam,false);
    }
  }
  makeIndependent(i,baja,layout=this.type){
    const c=this.corners[i],side=Math.sign(c.x),track=this.setup?.track??(baja?1.20:.95),hubLocal=V(side*track,this.radius-this.rideHeight+.008,c.z);
    const hub=this.body(at(this.chassis,hubLocal),46,V(.13,.30,.30));
    const collider=this.wheelCollider(hub,V());
    this.wheelParts[i]={body:hub,local:V(),collider,kind:'independent',radius:this.radius};
    const low=V(0,-.18,0),up=V(0,.18,0),inner=V(side*.12,-.28,c.z);
    // Stop the four-bar before its folded branch; angles are relative to the build pose.
    const bounds=side>0?[-.28,.55]:[-.55,.28];
    const lower=this.arm(this.chassis,inner,hub,low,'lower',true,.25,bounds);
    this.links.push({body:hub,a:low,b:up,kind:'upright',length:.36});
    if(layout==='macpherson'){
      const top=V(side*track,.14,c.z),tube=this.body(at(this.chassis,top),10,V(.05,.25,.05));
      this.joint(RAPIER.JointData.revolute(top,ZERO,Z),this.chassis,tube).setLimits(-.28,.28);
      const prism=RAPIER.JointData.prismatic(ZERO,ZERO,{x:0,y:1,z:0});prism.limitsEnabled=true;prism.limits=this.setup?[-1.2,-.14]:[-1.05,-.32];this.joint(prism,tube,hub,false);
      this.spring(this.chassis,top,hub,V(),i,3400,.35,.24);
    }else{
      const upperInner=V(side*(baja?.32:.24),baja?.02:-.015,c.z);
      this.arm(this.chassis,upperInner,hub,up,'upper',true,.20,side>0?[-.4,.7]:[-.7,.4]);
      const bottom=at(this.chassis,inner).lerp(at(hub,low),.78);
      this.spring(this.chassis,V(side*(baja?.87:.77),baja?.23:.14,c.z),lower,local(lower,bottom),i,baja?4600:4300,baja?.36:.35,baja?.39:.24,baja);
    }
  }
  makeAxle(j,baja){
    const z=(j===0?1:-1)*this.wheelbase/2,half=this.setup?.track??(baja?1.2:1),body=this.body(V(0,this.radius+.008,z),132,V(half,.14,.15));
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
      const x=side*(this.setup?half*.8:baja?.92:.8);
      const top=V(x,.12,z),bottom=V(x,0,0);
      const spring=this.spring(this.chassis,top,body,bottom,i,baja?3600:3400,baja?.38:.33,baja?.42:.26,baja);
      // Firm bump/droop limits follow chassis vertical at each spring seat.
      // Leave the other translations and all rotations free for articulation;
      // a radial spring force alone can let the four-link fold above the body.
      if(this.setup)continue;
      const stop=this.joint(RAPIER.JointData.generic(top,bottom,V(0,1,0),0),this.chassis,body,false);
      // Rapier 0.20 exposes generic per-axis limits through its raw joint set.
      this.world.impulseJoints.raw.jointSetLimits(stop.handle,RAPIER.JointAxis.LinX,-spring.max,-spring.min);
    }
  }
  makeTrailingWheel(i){
    const c=this.corners[i],x=Math.sign(c.x)*this.setup.track,hub=this.body(V(x,this.radius+.008,c.z),46,V(.13,.25,.25));
    this.wheelParts[i]={body:hub,local:V(),collider:this.wheelCollider(hub,V()),kind:'torsion',radius:this.radius};
    const pivot=V(x,-.22,c.z+.62),a=at(this.chassis,pivot),b=hub.translation(),centre=midpoint(a,V(b.x,b.y,b.z)),arm=this.body(centre,12);
    const pa=a.clone().sub(centre),pb=V(b.x,b.y,b.z).sub(centre);
    this.joint(RAPIER.JointData.revolute(pivot,pa,V(1,0,0)),this.chassis,arm).setLimits(-.5,.5);
    this.joint(RAPIER.JointData.fixed(pb,{x:0,y:0,z:0,w:1},ZERO,{x:0,y:0,z:0,w:1}),arm,hub);
    this.links.push({body:arm,a:pa,b:pb,kind:'lower',length:pa.distanceTo(pb)});
    this.torsionArms.push({body:arm,point:pa.clone().lerp(pb,.6)});
    this.spring(this.chassis,V(x,.12,c.z),hub,V(),i,0,.15,.2);
  }
  configureTravel(){
    for(const s of this.springs){
      const w=this.wheelParts[s.index],hub=at(w.body,w.local),centre=local(this.chassis,hub),length=at(s.a,s.anchorA).distanceTo(at(s.b,s.anchorB));
      s.staticLength=length;s.min=Math.max(.08,length-this.setup.bump*s.ratio);s.max=length+this.setup.droop*s.ratio;
      this.world.removeImpulseJoint(s.rope,true);s.rope=this.joint(RAPIER.JointData.rope(s.max,s.anchorA,s.anchorB),s.a,s.b,false);
      const stop=this.joint(RAPIER.JointData.generic(centre,w.local,V(0,1,0),0),this.chassis,w.body,false);
      this.world.impulseJoints.raw.jointSetLimits(stop.handle,RAPIER.JointAxis.LinX,-this.setup.droop,this.setup.bump);
      s.travelCentre=centre;
    }
  }
  antiRoll(){
    if(!this.setup||this.springs.some(s=>s.staticLength===undefined))return;
    const up=V(0,1,0).applyQuaternion(Q(this.chassis.rotation()));
    for(let axle=0;axle<2;axle++){
      const pair=[axle*2,axle*2+1].map(i=>this.springs.find(s=>s.index===i));
      const difference=(pair[0].staticLength-pair[0].length)/pair[0].ratio-(pair[1].staticLength-pair[1].length)/pair[1].ratio;
      const force=clamp(difference*this.setup.bar[axle],-12000,12000);
      pair.forEach((s,j)=>{const w=this.wheelParts[s.index],p=at(w.body,w.local),f=up.clone().multiplyScalar((j===0?-1:1)*force);w.body.addForceAtPoint(f,p,true);this.chassis.addForceAtPoint(f.clone().negate(),p,true);});
    }
  }
  setSetup(id){if(!SETUPS[id])throw new RangeError('Unknown vehicle setup');this.setupId=id;this.type=id==='baja'?'baja':id==='pickup'?'solid':SETUPS[id].front;this.reset();}
  setTerrain(type){if(!TERRAINS[type])throw new RangeError('Unknown terrain');this.terrainType=type;this.reset();}
  setSurface(surface){if(!SURFACES[surface])throw new RangeError('Unknown grip surface');this.surface=surface;}
  setDriving(enabled){
    if(this.driving===enabled)return;
    this.driving=enabled;this.input={throttle:0,steer:0};
    for(const b of this.dynamic)b.setLinearDamping(enabled?0:.04);
    for(let i=0;i<4;i++){

      const w=this.wheelParts[i],forward=V(0,0,1).applyQuaternion(Q(w.body.rotation())),velocity=w.body.velocityAtPoint(at(w.body,w.local));
      this.tyres[i].omega=V(velocity.x,velocity.y,velocity.z).dot(forward)/w.radius;this.tyres[i].slip=0;
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
    if(this.road.events)return this.road.states.get(w.collider.handle)?.point?.clone()??null;
    const sum=V();let count=0;
    this.road.contacts(w.collider,m=>{
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
      const w=this.wheelParts[i],t=this.tyres[i],hub=at(w.body,w.local);let load=0,contact=false;const normal=V();
      const patch=this.rebasedPatches?.[i]??this.groundPatch(w)??V(hub.x,0,hub.z);
      if(this.road.events){const state=this.road.states.get(w.collider.handle);if(state){load=state.load;normal.copy(state.normal);contact=load>0;}}
      else this.road.contacts(w.collider,m=>{
        if(m.numSolverContacts()){contact=true;const n=m.normal();normal.add(V(n.x,n.y,n.z).multiplyScalar(n.y<0?-1:1));}
        for(let k=0;k<m.numContacts();k++)load+=m.contactImpulse(k)/dt;
      });
      const axle=V(1,0,0).applyQuaternion(Q(w.body.rotation()));
      const extent=w.radius*Math.sqrt(Math.max(0,1-axle.y*axle.y))+(w.width??.27)/2*Math.abs(axle.y);
      const roadHeight=this.road.height(hub.x,hub.z),clearance=this.terrainType==='flat'?.03:.22;
      if(hub.y-extent>roadHeight+clearance){contact=false;load=0;}
      if(normal.lengthSq()<.1)normal.set(0,1,0);else normal.normalize();
      t.load=contact?t.load+(load-t.load)*(1-Math.exp(-dt/.025)):0;
      // A virtual steering knuckle rotates each front tyre about its hub.
      t.steer=i<2?Math.atan2(this.wheelbase*Math.tan(this.steering),this.wheelbase-local(this.chassis,hub).x*Math.tan(this.steering)):0;
      const steerQ=new Quaternion().setFromAxisAngle(V(0,1,0),t.steer),wheelQ=Q(w.body.rotation()).multiply(steerQ);
      w.collider.setRotationWrtParent(steerQ.clone().multiply(new Quaternion(0,0,Math.SQRT1_2,Math.SQRT1_2)));
      const forward=V(0,0,1).applyQuaternion(wheelQ);forward.addScaledVector(normal,-forward.dot(normal)).normalize();const side=normal.clone().cross(forward);
      const pv=w.body.velocityAtPoint(patch),v=V(pv.x,pv.y,pv.z),hubVelocity=w.body.velocityAtPoint(hub);
      // Read-only acoustic telemetry at the same contact used by the tyre model.
      t.contact=contact;t.longitudinal=v.dot(forward);t.lateral=v.dot(side);t.verticalSpeed=hubVelocity.y;
      const cfg=this.setup,braking=cfg&&this.input.throttle*this.roadSpeed<0&&Math.abs(this.roadSpeed)>1,driven=cfg&&!braking?cfg.drive:[0,1,2,3];
      const torque=this.driving&&driven.includes(i)?this.input.throttle*(this.totalMass||1500)*(cfg?.acceleration??2.8)/driven.length*w.radius:0;
      const result=tyreStep(t,{load:t.load,longitudinal:v.dot(forward),lateral:v.dot(side),torque,radius:w.radius,dt,grip:SURFACES[this.surface].grip*TERRAINS[this.terrainType].grip*(cfg?.grip??1)});
      t.rollingResistance=rollingResistance(V(hubVelocity.x,hubVelocity.y,hubVelocity.z).dot(forward),t.load,(cfg?.rolling??(this.type==='baja'?.018:.012))*TERRAINS[this.terrainType].rolling);
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
  setType(type){if(!TYPES[type])throw new RangeError('Unknown suspension design');this.setupId=null;this.type=type;this.reset();}
  point(p){return at(this.chassis,{x:p.x,y:p.y??0,z:p.z});}
  pullAnchor(i){const p=PULL_POINTS[i];return this.setup?V(p.x*this.setup.width/1.78,i===5?this.setup.roof:p.y,p.z*this.wheelbase/2.72):V(p.x,p.y,p.z);}
  pullPoint(i){return this.point(this.pullAnchor(i));}
  beginDrag(i,target=this.pullPoint(i).y){
    this.beginGrip(this.chassis,this.pullAnchor(i),PULL_POINTS[i].grip==='level',target,{kind:'body',i});
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
    this.world.numSolverIterations=this.beams.length?64:32;
    // Allow pushing below the settled body height, including after picking up
    // an airborne car. Bounds follow the part, rather than blocking at pickup.
    const minHeight=selection.kind==='wheel'?this.wheelParts[selection.i].radius:Math.max(.05,p.y-body.translation().y+this.restHeight-(this.setup?this.setup.bump+.015:.35));
    this.drag={...selection,target,x:p.x,z:p.z,hand,joint,level:fixed,body,anchor:V(anchor.x,anchor.y,anchor.z),minHeight:Math.min(p.y,minHeight),maxHeight:p.y+2.4,speed:0};
  }
  setDragHeight(height){
    if(!this.drag)return;
    const d=this.drag;
    let min=d.minHeight;
    if(d.kind==='wheel'){
      const axle=V(1,0,0).applyQuaternion(Q(d.body.rotation()));
      const w=this.wheelParts[d.i];min=this.road.height(d.body.translation().x,d.body.translation().z)+w.radius*Math.sqrt(Math.max(0,1-axle.y*axle.y))+(w.width??.27)/2*Math.abs(axle.y);
    }
    d.target=clamp(height,min,d.maxHeight);
  }
  release(){if(this.drag){this.world.removeRigidBody(this.drag.hand);this.drag=null;this.solverBoostUntil=this.time+1.2;}}
  drop(height=.75){this.release();this.dynamic.forEach(b=>{const p=b.translation();b.setTranslation({x:p.x,y:p.y+height,z:p.z},true);b.setLinvel(ZERO,true);b.setAngvel(ZERO,true);});this.refresh();}
  nudge(){this.chassis.applyTorqueImpulse({x:0,y:0,z:550},true);}
  step(dt=STEP,refresh=true){
    // Keep the grip's extra accuracy through the first impact after release.
    this.world.numSolverIterations=this.drag||this.time<this.solverBoostUntil?(this.beams.length?64:32):16;
    this.world.timestep=dt;const position=this.chassis.translation();this.road.ensure(position.x,position.z);
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
    this.antiRoll();this.tyreForces(dt);
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
    this.world.step(this.road.events??undefined);this.road.capture();this.time+=dt;
    // Rebase the empty world to preserve precision during endless coasting.
    this.rebasedPatches=null;const centre=this.chassis.translation();if(Math.max(Math.abs(centre.x),Math.abs(centre.z))>60){
      const offset={x:centre.x,z:centre.z};this.worldOrigin.x+=offset.x;this.worldOrigin.z+=offset.z;
      // Solver points combine anchors on the wheel and stationary road. Read
      // them before moving either body, then translate the complete points.
      // Reading afterward mixes coordinate frames and creates huge tyre-force
      // lever arms. Retain these points until the next completed solver step.
      this.rebasedPatches=this.wheelParts.map(w=>this.groundPatch(w)?.sub(V(offset.x,0,offset.z))??null);
      for(const b of this.dynamic){const p=b.translation();b.setTranslation({x:p.x-offset.x,y:p.y,z:p.z-offset.z},false);}
      this.road.rebase(offset);
      if(this.drag){const d=this.drag,p=d.hand.translation();d.x-=offset.x;d.z-=offset.z;d.hand.setTranslation({x:p.x-offset.x,y:p.y,z:p.z-offset.z},true);}
    }

    if(refresh)this.refresh();
  }
  refresh(){
    const p=this.chassis.translation(),q=Q(this.chassis.rotation()),forward=V(0,0,1).applyQuaternion(q),left=V(1,0,0).applyQuaternion(q);
    const e={x:-Math.atan2(forward.y,Math.hypot(forward.x,forward.z)),z:Math.atan2(left.y,Math.hypot(left.x,left.z))};
    const velocity=this.chassis.linvel();
    this.x=p.x;this.y=p.y;this.z=p.z;this.pitch=e.x;this.roll=e.z;this.vy=velocity.y;
    // The platform follows chassis X/Z, independent of heading or tumbling.
    this.groundSpeed=Math.hypot(velocity.x,velocity.z);
    this.wheels=this.wheelParts.map((w,i)=>{const p=at(w.body,w.local),s=this.springs.find(s=>s.index===i),length=at(s.a,s.anchorA).distanceTo(at(s.b,s.anchorB));let contact=false;
      if(this.road.events)contact=(this.road.states.get(w.collider.handle)?.load??0)>0;
      else this.road.contacts(w.collider,m=>{if(m.numSolverContacts()>0)contact=true;});
      return{y:p.y,v:w.body.linvel().y,contact,force:s.force,compression:this.setup&&s.travelCentre?local(this.chassis,p).y-s.travelCentre.y+this.setup.droop:s.rest-length};});
  }
  frame(){
    return {position:this.chassis.translation(),rotation:this.chassis.rotation(),spin:this.spin,
      wheels:this.wheelParts.map((w,i)=>({position:at(w.body,w.local),rotation:Q(w.body.rotation()).multiply(new Quaternion().setFromAxisAngle(V(0,1,0),this.driving?this.tyres[i].steer:0)),radius:w.radius,spin:this.tyres?.[i]?.spin??0})),
      links:this.links.map(l=>({a:at(l.body,l.a),b:at(l.body,l.b),kind:l.kind})),
      springs:[...this.springs].sort((a,b)=>a.index-b.index).map(s=>({top:at(s.a,s.anchorA),bottom:at(s.b,s.anchorB),bypass:s.bypass,index:s.index,leaf:s.leaf??false})),
      leaves:this.leaves.map(l=>({front:at(this.chassis,l.front),seat:at(l.body,l.seat),rear:at(l.shackle,l.rear),hanger:at(this.chassis,l.hanger)})),
      torsion:this.torsionArms.map(a=>at(a.body,a.point)),
      beams:this.beams.map(b=>({a:at(b.body,V(b.half,0,0)),b:at(b.body,V(-b.half,0,0)),rotation:b.body.rotation()}))};
  }
  constraintError(){let error=0;for(const j of this.jointChecks)error=Math.max(error,at(j.a,j.p).distanceTo(at(j.b,j.q)));return error;}
  snapshot(){return{setup:this.setupId,terrain:this.terrainType,type:this.type,surface:this.surface,x:this.x,y:this.y,z:this.z,pitch:this.pitch,roll:this.roll,velocity:this.vy,dragging:this.drag?.i??(this.drag?'body':null),gripKind:this.drag?.kind??null,driving:this.driving,speed:this.groundSpeed,longitudinalSpeed:this.roadSpeed,steering:this.steering,lateralG:this.lateralG,tyres:this.tyres?.map(t=>({load:t.load,usage:t.usage,slip:t.slip,force:t.force.toArray(),omega:t.omega}))??[],wheels:this.wheels.map(w=>({...w})),constraintError:this.constraintError()};}
  free(){this.road.events?.free();this.world.free();}
}
