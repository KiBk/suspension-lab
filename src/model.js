import * as THREE from 'three';
import { CORNERS } from './physics.js';
import { buildBodywork } from './bodywork.js';
import {instantiateVehicle,activateVehicleAsset} from './car-assets.js';
import {mechanicalDetail} from './mechanical-detail.js';

// Body-local zones stay attached to the car at any heading or camera angle.
export function bodyZone(p){
  if(p.z<.75&&p.z>-.8)return 5;
  const front=p.z>=.75;
  if(Math.abs(p.x)<.4)return front?4:6;
  return (front?0:2)+(p.x<0?1:0);
}

export function makeCar(scene) {
  const body = new THREE.Group(); scene.add(body);
  let shells = [], windows = [], bodywork=new THREE.Group(), currentWorld=null, currentSetup=null, faded=false; body.add(bodywork);
  const material = (color, metalness = 0, roughness = .45) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const paint = material('#a9bbb0', .45, .27), dark = material('#43574c', .12, .58);
  const glass = material('#283e3c', .55, .14), rubber = material('#242925', .0, .92);
  const metal = material('#bbc3b5', .82, .24), orange = material('#e06b35', .32, .3);
  dark.envMapIntensity=.45;metal.envMapIntensity=.65;orange.envMapIntensity=.4;
  const black = material('#333a34', .4, .45), light = new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: '#f0deb0', emissiveIntensity: .65 });
  const red = new THREE.MeshStandardMaterial({ color:'#bb4634', emissive:'#e43c20', emissiveIntensity:.5 });
  function mesh(geo, mat, parent = bodywork, p = [0,0,0]) {
    const m = new THREE.Mesh(geo,mat); m.position.set(...p); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (size, mat, parent = bodywork, p = [0,0,0]) => mesh(new THREE.BoxGeometry(...size),mat,parent,p);
  function profile(points, width, mat) {
    const s = new THREE.Shape(); points.forEach(([z,y],i) => i ? s.lineTo(z,y) : s.moveTo(z,y)); s.closePath();
    const g = new THREE.ExtrudeGeometry(s,{depth:width,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025});
    const pos = g.attributes.position;
    for(let i=0;i<pos.count;i++){const z=pos.getX(i),y=pos.getY(i),x=pos.getZ(i)-width/2;pos.setXYZ(i,x,y,-z);}
    g.computeVertexNormals(); return mesh(g,mat);
  }
  function buildLegacy(){
  // Sculpted side silhouette with actual wheel-arch cutouts.
  const side = new THREE.Shape();
  side.moveTo(-2.13,-.32);side.lineTo(-1.83,-.32);
  side.absarc(-1.36,-.51,.51,Math.PI-.38,.38,true);
  side.lineTo(.887,-.32);side.absarc(1.36,-.51,.51,Math.PI-.38,.38,true);
  side.lineTo(2.14,-.32);side.lineTo(2.16,.10);side.lineTo(2.02,.25);side.lineTo(1.13,.35);side.lineTo(-1.05,.36);side.lineTo(-2.10,.22);side.closePath();
  const bodyGeo=new THREE.ExtrudeGeometry(side,{depth:1.78,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:3,steps:1});
  const bp=bodyGeo.attributes.position;
  for(let i=0;i<bp.count;i++){const z=bp.getX(i),y=bp.getY(i),x=bp.getZ(i)-.89;bp.setXYZ(i,-x,y,z);}bodyGeo.computeVertexNormals();
  const shell=mesh(bodyGeo,paint);shells.push(shell);
  // Glazed coupe cabin and floating roof.
  windows.push(profile([[-1.10,.36],[-.68,.91],[.34,.96],[1.12,.35]],1.49,glass));
  shells.push(profile([[-.72,.92],[-.60,1.00],[.30,1.025],[.40,.96]],1.53,paint));
  // Cabin profiles above are mirrored along Z: the long sloped windscreen faces +Z.
  for(const w of windows) w.scale.z=-1;
  shells[shells.length-1].scale.z=-1;
  for(const x of [-.765,.765]) {
    const pillar=box([.045,.58,.06],paint,bodywork,[x,.64,-.2]);pillar.rotation.x=.07;shells.push(pillar);
    const sill=box([.07,.045,2.02],dark,bodywork,[x,.36,0]);shells.push(sill);
    shells.push(box([.035,.033,.22],metal,bodywork,[Math.sign(x)*.923,.18,-.35]));
    const mirror=box([.22,.1,.17],dark,bodywork,[Math.sign(x)*1.0,.37,.67]);shells.push(mirror);
  }
  // Bonnet stripe and badge, narrow lamps, bumpers, grille and rear spoiler.
  shells.push(box([.12,.012,.82],orange,bodywork,[.49,.316,1.50]));
  shells.push(box([.30,.018,.06],metal,bodywork,[0,.273,1.99]));
  for(const x of [-.6,.6]) {
    shells.push(box([.44,.075,.05],light,bodywork,[x,.11,2.151]));
    shells.push(box([.45,.065,.04],red,bodywork,[x,.09,-2.135]));
  }
  shells.push(box([1.78,.095,.11],dark,bodywork,[0,-.26,2.13]));
  shells.push(box([1.77,.10,.10],dark,bodywork,[0,-.25,-2.13]));
  shells.push(box([.81,.16,.04],black,bodywork,[0,-.10,2.166]));
  for(let x=-.35;x<=.36;x+=.1)shells.push(box([.014,.13,.012],metal,bodywork,[x,-.10,2.19]));
  shells.push(box([1.64,.047,.24],dark,bodywork,[0,.31,-2.02]));
  // Structural rails remain visible in cutaway view.
  shells.push(box([1.40,.075,3.9],black,bodywork,[0,-.18,0]));
  for(const x of [-.57,.57]) box([.11,.10,3.75],metal,bodywork,[x,-.12,0]);
  for(const z of [-1.36,1.36]) box([1.66,.08,.12],metal,bodywork,[0,-.04,z]);
  shells.push(box([.6,.22,.6],dark,bodywork,[0,-.04,1.12]));
  }
  buildLegacy();
  const wheels=[],rotors=[],springs=[];
  const cylinder = new THREE.CylinderGeometry(1,1,1,16);
  function rod(parent,mat,radius){const m=mesh(cylinder,mat,parent);m.userData.radius=radius;return m;}
  function between(m,a,b){m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().subVectors(b,a).normalize());m.scale.set(m.userData.radius,a.distanceTo(b),m.userData.radius);}
  // Helix geometry built once; stretching the group follows the actual spring length.
  class Helix extends THREE.Curve {getPoint(t,target=new THREE.Vector3()){const a=t*Math.PI*2*7;return target.set(.092*Math.cos(a),t,.092*Math.sin(a));}}
  const coilGeo=new THREE.TubeGeometry(new Helix(),112,.016,6,false);
  for(const c of CORNERS){
    const carrier=new THREE.Group();scene.add(carrier);wheels.push(carrier);
    const wheel=new THREE.Group();carrier.add(wheel);rotors.push(wheel);
    const tire=mesh(new THREE.TorusGeometry(.262,.088,14,48),rubber,wheel);tire.rotation.y=Math.PI/2;tire.scale.z=1.55;
    const rim=mesh(new THREE.CylinderGeometry(.228,.228,.205,40),black,wheel);rim.rotation.z=Math.PI/2;
    for(const sign of [-1,1]){
      const ring=mesh(new THREE.TorusGeometry(.213,.016,8,40),metal,wheel,[sign*.116,0,0]);ring.rotation.y=Math.PI/2;
      const hub=mesh(new THREE.CylinderGeometry(.064,.064,.022,20),metal,wheel,[sign*.132,0,0]);hub.rotation.z=Math.PI/2;
      for(let j=0;j<5;j++){
        const a=j*Math.PI*2/5+.15;
        const spoke=box([.018,.04,.173],metal,wheel,[sign*.126,Math.sin(a)*.125,Math.cos(a)*.125]);spoke.rotation.x=-a;
      }
      const brake=mesh(new THREE.CylinderGeometry(.179,.179,.012,32),metal,wheel,[sign*.095,0,0]);brake.rotation.z=Math.PI/2;
      box([.045,.12,.06],orange,carrier,[sign*.11,.08,.13]);
    }
    // Small tread cuts around both shoulders.
    for(let j=0;j<36;j++){
      const a=j*Math.PI*2/36;
      for(const sx of [-.086,.086]){
        const tread=box([.057,.005,.033],black,wheel,[sx,Math.cos(a)*.341,Math.sin(a)*.341]);tread.rotation.x=a;
      }
    }
    const coil=mesh(coilGeo,orange,scene);
    const damper=rod(scene,dark,.039), piston=rod(scene,metal,.019);
    const bypassDamper=rod(scene,material('#508e9d',.6,.25),.055),bypassPiston=rod(scene,metal,.021);
    const reservoir=mesh(new THREE.CylinderGeometry(.053,.053,.20,14),metal,scene);
    const mounts=[mesh(new THREE.CylinderGeometry(.12,.12,.025,24),dark,scene),mesh(new THREE.CylinderGeometry(.12,.12,.025,24),dark,scene)];
    springs.push({coil,damper,piston,mounts,bypassDamper,bypassPiston,reservoir});
  }
  const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
  const from=p=>vec(p.x,p.y,p.z);
  const physicalLinks=Array.from({length:28},()=>rod(scene,metal,.028));
  const bracketGeometry=new THREE.BoxGeometry(1,1,1);
  const highlightMaterial=new THREE.LineBasicMaterial({color:'#df6945',transparent:true,opacity:.65,depthTest:true});
  const highlightBox=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),highlightMaterial);
  body.add(highlightBox);highlightBox.visible=false;highlightBox.raycast=()=>{};
  const wheelHighlights=wheels.map(w=>{
    const outline=new THREE.Mesh(new THREE.TorusGeometry(.36,.013,6,48),new THREE.MeshBasicMaterial({color:'#df6945',transparent:true,opacity:.85}));
    outline.rotation.y=Math.PI/2;outline.position.x=wheels.indexOf(w)%2===0?.15:-.15;
    w.add(outline);outline.visible=false;outline.raycast=()=>{};return outline;
  });
  const detail=mechanicalDetail(scene,body);
  const torsionBeam=rod(scene,black,.042);
  const beams=[0,1].map(()=>({beam:rod(scene,black,.068),diff:mesh(new THREE.SphereGeometry(.17,20,14),dark,scene)}));
  function springPosition(s,bottom,top,damperBottom,damperTop,seatOffset=0){
    const delta=new THREE.Vector3().subVectors(top,bottom),length=delta.length();
    const axis=delta.clone().normalize(),coilBottom=bottom.clone().addScaledVector(axis,seatOffset),coilTop=top.clone().addScaledVector(axis,seatOffset?-.055:0);
    s.coil.position.copy(coilBottom);s.coil.quaternion.setFromUnitVectors(vec(0,1,0),axis);s.coil.scale.y=Math.max(.03,coilBottom.distanceTo(coilTop));
    const db=damperBottom,dt=damperTop,distance=db.distanceTo(dt);
    s.barrelLength??=distance*.57;
    const shoulder=db.clone().lerp(dt,Math.min(.85,s.barrelLength/distance));
    between(s.damper,db,shoulder);between(s.piston,shoulder,dt);
    s.mounts[0].position.copy(coilBottom);s.mounts[1].position.copy(coilTop);
    s.mounts.forEach(m=>m.quaternion.copy(s.coil.quaternion));
  }
  function update(sim){
    if(currentWorld!==sim.world){
      currentWorld=sim.world;currentSetup=sim.setup;
      springs.forEach(s=>{s.barrelLength=null;});
      bodywork.traverse(m=>{if(!m.userData.assetGeometry)m.geometry?.dispose();if(m.userData.ownMaterial)m.material.dispose();});
      bodywork.userData.paint?.dispose();body.remove(bodywork);shells=[];windows=[];
      if(sim.setup){const built=sim.setup.model?instantiateVehicle(sim.setupId,sim.restHeight,sim.setup):buildBodywork(sim.setup,sim.restHeight,{dark,glass,metal,orange,black,light,red});
        if(built.wheels){rotors.forEach((rotor,i)=>{rotor.traverse(m=>{if(!m.userData.assetGeometry)m.geometry?.dispose();if(m.userData.ownMaterial)m.material?.dispose();});rotor.clear();rotor.add(built.wheels[i]);for(const m of wheels[i].children)if(m!==rotor&&m!==wheelHighlights[i])m.visible=false;wheelHighlights[i].scale.setScalar(sim.wheelParts[i].radius/.35);});activateVehicleAsset(sim.setupId);} bodywork=built.group;shells=built.shells;windows=built.windows;bodywork.userData.paint=built.paint;body.add(bodywork);}
      else{bodywork=new THREE.Group();body.add(bodywork);buildLegacy();}
      cutaway(faded);
    }
    const frame=sim.frame();body.position.copy(frame.position);body.quaternion.copy(frame.rotation);body.updateMatrixWorld(true);
    wheels.forEach((wheel,i)=>{wheel.position.copy(frame.wheels[i].position);wheel.quaternion.copy(frame.wheels[i].rotation);wheel.scale.setScalar(sim.setup?.model?1:frame.wheels[i].radius/.35);rotors[i].rotation.x=frame.wheels[i].spin;});
    physicalLinks.forEach((m,i)=>{
      const link=frame.links[i];m.visible=!!link&&link.kind!=='leaf-guide';if(!m.visible)return;
      const bracket=link.kind==='mount';m.geometry=bracket?bracketGeometry:cylinder;m.material=bracket?dark:metal;
      m.userData.radius=link.kind==='upright'?.043:link.kind==='trailing'?.036:.028;
      between(m,from(link.a),from(link.b));
      if(bracket){m.scale.x=.075;m.scale.z=.20;}
    });
    beams.forEach(({beam,diff},i)=>{const p=frame.beams[i];beam.visible=diff.visible=!!p;if(p){between(beam,from(p.a),from(p.b));diff.position.copy(p.a).add(p.b).multiplyScalar(.5);diff.quaternion.copy(p.rotation);}});
    torsionBeam.visible=frame.torsion?.length===2;if(torsionBeam.visible)between(torsionBeam,from(frame.torsion[0]),from(frame.torsion[1]));
    frame.springs.forEach((spring,i)=>{
      const s=springs[i],bottom=from(spring.bottom),top=from(spring.top);
      const layout=sim.setup?(i<2?sim.setup.front:sim.setup.rear):sim.type;
      const seats=sim.setup&&!spring.separate?(layout==='macpherson'?sim.wheelParts[i].radius*.85:.09):0;
      springPosition(s,bottom,top,from(spring.damperBottom),from(spring.damperTop),seats);
      s.coil.visible=!spring.leaf;s.mounts.forEach(m=>m.visible=!spring.leaf);
      if(sim.setup){s.coil.scale.x=s.coil.scale.z=sim.radius/.35*.80;}
      s.bypassDamper.visible=s.bypassPiston.visible=s.reservoir.visible=spring.bypass;
      if(spring.bypass){
        const offset=vec(0,0,.24).applyQuaternion(body.quaternion),b=bottom.clone().add(offset),t=top.clone().add(offset);
        between(s.bypassDamper,b,b.clone().lerp(t,.60));between(s.bypassPiston,b.clone().lerp(t,.45),t);
        s.reservoir.position.copy(t).add(vec(.10,0,0).applyQuaternion(body.quaternion));s.reservoir.quaternion.copy(s.coil.quaternion);
      }
    });
    detail.update(sim,frame);
    return frame;
  }
  function cutaway(enabled){
    faded=enabled;
    // Fade bodywork while keeping structural parts, coils and dampers opaque.
    for(const m of [...shells,...windows]) {
      if(!m.userData.ownMaterial){m.material=m.material.clone();m.userData.ownMaterial=true;}
      m.material.transparent=enabled||windows.includes(m);m.material.opacity=enabled?(windows.includes(m)?.07:.12):windows.includes(m)?.78:1;
      m.material.depthWrite=!enabled;m.castShadow=!enabled;m.material.needsUpdate=true;
    }
  }
  function pick(raycaster){
    body.updateMatrixWorld(true);wheels.forEach(w=>w.updateMatrixWorld(true));
    const hits=raycaster.intersectObjects([body,...wheels],true);
    const wheelIndex=object=>{
      while(object&&object!==body){const i=wheels.indexOf(object);if(i!==-1)return i;object=object.parent;}
      return -1;
    };
    // Reach a visible wheel through faded bodywork. Otherwise use the actual
    // body surface under the pointer, rather than a frame rail farther behind.
    const opaque=hits.find(h=>h.object.material.opacity>=.5);
    const hit=opaque&&wheelIndex(opaque.object)!==-1?opaque:hits[0];
    if(!hit)return null;
    const index=wheelIndex(hit.object);if(index!==-1)return{kind:'wheel',index};
    const anchor=body.worldToLocal(hit.point.clone());
    return{kind:'body',index:bodyZone(currentSetup?new THREE.Vector3(anchor.x*1.78/currentSetup.width,anchor.y,anchor.z*2.72/currentSetup.wheelbase):anchor),anchor};
  }
  function highlight(target){
    highlightBox.visible=target?.kind==='body';
    wheelHighlights.forEach((m,i)=>m.visible=target?.kind==='wheel'&&target.index===i);
    if(!highlightBox.visible)return;
    const i=target.index,front=i===0||i===1||i===4,centre=i===5,end=i===4||i===6;
    highlightBox.position.set(centre||end?0:(i%2===0?.66:-.66),centre?.39:.04,centre?-.025:front?1.47:-1.5);
    highlightBox.scale.set(centre?1.85:end?.8:1.05,centre?1.36:.67,centre?1.55:1.46);
    if(currentSetup){highlightBox.position.x*=currentSetup.width/1.78;highlightBox.position.z*=currentSetup.wheelbase/2.72;highlightBox.scale.x*=currentSetup.width/1.78;highlightBox.scale.z*=currentSetup.wheelbase/2.72;}
  }
  return {body,update,cutaway,pick,highlight};
}
