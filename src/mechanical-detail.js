import * as T from 'three';
const v=p=>new T.Vector3(p.x,p.y,p.z),up=new T.Vector3(0,1,0);
// All links, spring seats and leaf endpoints are drawn from simulation anchors.
export function mechanicalDetail(scene,body){
 const group=new T.Group();scene.add(group);const chassis=new T.Group();body.add(chassis);
 const steel=new T.MeshStandardMaterial({color:'#657c6d',metalness:.2,roughness:.58,envMapIntensity:.45}),aluminium=new T.MeshStandardMaterial({color:'#c5cdc7',metalness:.65,roughness:.36,envMapIntensity:.65}),rubber=new T.MeshStandardMaterial({color:'#303a33',roughness:.91}),accent=new T.MeshStandardMaterial({color:'#68988f',metalness:.3,roughness:.4,envMapIntensity:.5});
 const cylinder=new T.CylinderGeometry(1,1,1,12),sphere=new T.SphereGeometry(1,10,8),box=new T.BoxGeometry(1,1,1);let pool=[],cursor=0,current=null;
 function item(geo,mat,parent=group){let m;if(parent===group){m=pool[cursor++];if(!m){m=new T.Mesh();pool.push(m);group.add(m);}m.visible=true;m.geometry=geo;m.material=mat;}else{m=new T.Mesh(geo,mat);parent.add(m);}m.castShadow=m.receiveShadow=true;return m;}
 function rod(a,b,r=.018,mat=aluminium,parent=group){const m=item(cylinder,mat,parent),d=v(b).sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,d.clone().normalize());m.scale.set(r,Math.max(.001,d.length()),r);return m;}
 function ball(p,r=.033,mat=rubber){const m=item(sphere,mat);m.position.copy(p);m.quaternion.identity();m.scale.setScalar(r);}
 function block(size,p,mat=steel,parent=chassis){const m=item(box,mat,parent);m.position.copy(p);m.scale.copy(size);return m;}
 const vec=(x,y,z)=>new T.Vector3(x,y,z);
 function rebuild(sim){chassis.traverse(m=>{if(m.userData.ownGeometry)m.geometry?.dispose();});chassis.clear();const c=sim.setup;if(!c)return;const utility=['pickup','offroad'].includes(c.id),floor=(utility?c.radius+.10:c.clearance+.075)-sim.restHeight,rail=c.track*.66;
  // Compact stamped subframes on road cars; longitudinal rails on utility cars.
  for(const side of [-1,1])block(vec(.065,.075,c.wheelbase+.45),vec(side*rail,floor,0));
  for(let axle=0;axle<2;axle++){const i=axle*2,z=sim.corners[i].z,r=c.wheels[i].radius,low=r-sim.restHeight-Math.min(.14,r*.42)+.015;
   block(vec(c.track*1.10,.065,.12),vec(0,low,z-.19));block(vec(c.track*1.10,.065,.10),vec(0,low,z+.19));
   for(const side of [-1,1])rod(vec(side*c.track*.55,low,z),vec(side*rail,floor,z),.032,steel,chassis);
   if(c.drive.includes(i)&&![c.front,c.rear][axle].match(/solid|leaf/)){const d=new T.Mesh(new T.SphereGeometry(.12,16,10),steel);d.userData.ownGeometry=true;d.position.set(0,r-sim.restHeight,z);d.scale.set(1.25,.8,1.2);chassis.add(d);}
  }
  // Floor tunnel and a compact gearbox make the driveline legible in cutaway.
  block(vec(.22,.11,c.wheelbase*.60),vec(0,floor+.045,0),steel);
  for(const s of sim.springs){
   const sign=s.index%2===0?1:-1,layout=s.index<2?c.front:c.rear;
   const top=v(s.damper?.anchorA??s.anchorA),separate=!!s.damper;
   // Bolted top plates with a short open tower cup. The gussets lead inboard
   // into the subframe/rail, leaving the tyre and moving strut unobstructed.
   const radius=separate?.065:.115;
   const ring=new T.Mesh(new T.TorusGeometry(radius,.014,8,24),aluminium);ring.userData.ownGeometry=true;ring.rotation.x=Math.PI/2;ring.position.copy(top);chassis.add(ring);
   const cup=new T.Mesh(new T.CylinderGeometry(radius+.018,radius+.035,.105,20,1,true),steel);cup.userData.ownGeometry=true;cup.position.copy(top).add(vec(0,-.055,0));chassis.add(cup);
   for(const dz of [-.10,.10]){
    const a=top.clone().add(vec(-sign*(radius+.01),-.055,dz)),b=vec(sign*rail,floor,top.z+dz*1.6);
    rod(a,b,utility?.028:.018,steel,chassis);
   }
   for(let n=0;n<3;n++){const angle=n*Math.PI*2/3,bolt=item(cylinder,aluminium,chassis);bolt.position.copy(top).add(vec(Math.cos(angle)*radius,.018,Math.sin(angle)*radius));bolt.scale.set(.011,.026,.011);}
   if(separate&&!s.leaf){const seat=v(s.anchorA),brace=vec(sign*rail,floor,seat.z);rod(seat,brace,.027,steel,chassis);}
   // Frame-mounted bump rubber for leaf axles; no fictitious coil top mount.
   if(layout==='leaf')block(vec(.08,.085,.10),vec(s.anchorA.x,floor-.07,s.anchorA.z),rubber);
  }
 }
 function update(sim,frame){cursor=0;if(current!==sim.world){current=sim.world;rebuild(sim);}if(!sim.setup){chassis.visible=group.visible=false;return;}chassis.visible=group.visible=true;const c=sim.setup,toWorld=p=>sim.point(p);
  for(const link of frame.links){if(link.kind==='mount'||link.kind==='leaf-guide')continue;ball(link.a,.027);ball(link.b,.031);}
  for(let i=0;i<4;i++){
   const w=frame.wheels[i],sign=i%2===0?1:-1,r=w.radius,pos=v(w.position),q=new T.Quaternion().copy(w.rotation),axle=vec(1,0,0).applyQuaternion(q),forward=vec(0,0,1).applyQuaternion(q),inside=pos.clone().addScaledVector(axle,-sign*c.wheels[i].width*.35);
   // Stationary calipers, rotating discs, hub bearings and CV boots.
   const disc=item(cylinder,aluminium);disc.position.copy(inside);disc.quaternion.setFromUnitVectors(up,axle);disc.scale.set(r*.54,.018,r*.54);
   const caliper=item(box,accent);caliper.position.copy(inside).addScaledVector(forward,r*.43);caliper.quaternion.copy(q);caliper.scale.set(.05,r*.32,.065);ball(inside,.055,steel);
   if(c.drive.includes(i)){const inner=toWorld(vec(sign*.17,c.wheels[i].radius-sim.restHeight,sim.corners[i].z));rod(inner,inside,.025,steel);for(let k=0;k<4;k++)ball(inside.clone().lerp(inner,.08+k*.026),.043-k*.003,rubber);}
   const spring=frame.springs[i];
   ball(spring.damperTop,.039);ball(spring.damperBottom,.033);
   const bump=v(spring.damperTop).lerp(spring.damperBottom,.16);rod(spring.damperTop,bump,.043,rubber);
   if(!spring.leaf){
    ball(spring.top,.04);ball(spring.bottom,.035);
    // A lower spring pan follows its actual control/trailing arm attachment.
    if(spring.separate){const pan=item(cylinder,steel);pan.position.copy(spring.bottom);pan.quaternion.setFromUnitVectors(up,v(spring.top).sub(spring.bottom).normalize());pan.scale.set(.10,.022,.10);}
   }
   if(i<2){const knuckle=pos.clone().addScaledVector(forward,-.12).addScaledVector(axle,-sign*.065),rack=toWorld(vec(sign*c.track*.30+sim.steering*.08,c.wheels[i].radius-sim.restHeight,sim.corners[i].z-.15));rod(rack,knuckle,.015,aluminium);ball(knuckle,.023);}
  }
  for(let axle=0;axle<2;axle++){
   const z=sim.corners[axle*2].z,level=c.wheels[axle*2].radius-sim.restHeight-.09;
   if(c.bar[axle]&&[c.front,c.rear][axle]!=='torsion'){
    const a=toWorld(vec(-c.track*.63,level,z-.27)),b=toWorld(vec(c.track*.63,level,z-.27));rod(a,b,.019,accent);
    for(const side of [0,1]){const sign=side===0?1:-1,mount=toWorld(vec(sign*c.track*.63,level,z)),wheel=v(frame.wheels[axle*2+side].position).add(vec(0,-.07,0).applyQuaternion(body.quaternion));rod(sign===1?b:a,mount,.019,accent);rod(mount,wheel,.013,aluminium);ball(mount,.025);}
   }
  }
  for(const leaf of frame.leaves){
   // Layered leaf strips curve through the actual front eye, axle saddle and rear eye.
   const a=v(leaf.front),b=v(leaf.seat),d=v(leaf.rear);rod(leaf.hanger,d,.028,steel);ball(a,.043);ball(d,.04);
   for(let layer=0;layer<4;layer++){const start=.035*layer,end=1-start;let prev=null;for(let j=0;j<=20;j++){const t=start+(end-start)*j/20,p=t<.5?a.clone().lerp(b,t*2):b.clone().lerp(d,(t-.5)*2);p.addScaledVector(up.clone().applyQuaternion(body.quaternion),-(Math.sin(Math.PI*t)*(.055-layer*.009)+layer*.008));if(prev){const m=rod(prev,p,.015,steel);m.scale.x=.034;m.scale.z=.005;}prev=p;}}
   for(const dz of [-.055,.055]){const seat=b.clone().add(vec(0,0,dz).applyQuaternion(body.quaternion));rod(seat.clone().add(vec(-.055,-.09,0).applyQuaternion(body.quaternion)),seat.clone().add(vec(-.055,.025,0).applyQuaternion(body.quaternion)),.007,aluminium);rod(seat.clone().add(vec(.055,-.09,0).applyQuaternion(body.quaternion)),seat.clone().add(vec(.055,.025,0).applyQuaternion(body.quaternion)),.007,aluminium);}
  }
  for(let i=cursor;i<pool.length;i++)pool[i].visible=false;
 }
 return{update};
}
