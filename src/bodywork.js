import * as THREE from 'three';

// Proportions follow the physical wheel centres; each silhouette is a vehicle
// archetype, not a model of a particular manufacturer's car.
export function buildBodywork(cfg,restHeight,materials){
  const group=new THREE.Group(),shells=[],windows=[];
  const {dark,glass,metal,orange,black,light,red}=materials;
  const paint=new THREE.MeshStandardMaterial({color:cfg.color,metalness:.42,roughness:.3});
  function add(geometry,mat,p=[0,0,0],category=shells){
    const m=new THREE.Mesh(geometry,mat);m.position.set(...p);m.castShadow=m.receiveShadow=true;group.add(m);category?.push(m);return m;
  }
  const box=(size,mat,p,category)=>add(new THREE.BoxGeometry(...size),mat,p,category);
  function silhouette(points,width,mat,category=shells){
    const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:2,steps:1});
    const a=geo.attributes.position;for(let i=0;i<a.count;i++){const z=a.getX(i),y=a.getY(i),x=a.getZ(i)-width/2;a.setXYZ(i,-x,y,z);}geo.computeVertexNormals();
    return add(geo,mat,[0,0,0],category);
  }
  const end=cfg.length/2,w=cfg.width,wb=cfg.wheelbase/2,hubY=cfg.radius-restHeight,bottom=cfg.clearance-restHeight;
  const deck=cfg.body==='sports'?.20:cfg.body==='baja'?.28:.23,arch=cfg.radius+(cfg.body==='baja'?.15:.075);
  const shape=new THREE.Shape();shape.moveTo(-end,bottom);
  // Open arches along the lower edge, rather than drawing tyres over bodywork.
  for(const z of [-wb,wb]){
    const angle=Math.asin(THREE.MathUtils.clamp((bottom-hubY)/arch,-.95,.95));
    shape.lineTo(z-Math.cos(angle)*arch,bottom);shape.absarc(z,hubY,arch,Math.PI-angle,angle,true);
  }
  shape.lineTo(end,bottom);shape.lineTo(end,.02);shape.lineTo(end-.16,deck);shape.lineTo(-end+.12,deck);shape.lineTo(-end,.04);shape.closePath();
  const shellGeo=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:true,bevelSize:.018,bevelThickness:.02,bevelSegments:2,steps:1});
  const attr=shellGeo.attributes.position;for(let i=0;i<attr.count;i++){const z=attr.getX(i),y=attr.getY(i),x=attr.getZ(i)-w/2;attr.setXYZ(i,-x,y,z);}shellGeo.computeVertexNormals();add(shellGeo,paint);
  const truck=cfg.body==='pickup'||cfg.body==='baja',roof=cfg.roof;
  let cabin;
  if(truck)cabin=[[-.34,deck],[-.28,roof],[.66,roof],[1.12,deck]];
  else if(cfg.body==='sports')cabin=[[-1.12,deck],[-.53,roof],[.23,roof],[.91,deck]];
  else if(cfg.body==='wagon')cabin=[[-end+.25,deck],[-end+.52,roof-.05],[.37,roof],[1.11,deck]];
  else if(cfg.body==='suv')cabin=[[-end+.27,deck],[-end+.43,roof-.04],[.45,roof],[1.15,deck]];
  else cabin=[[-end+.18,deck],[-end+.49,roof],[.31,roof],[.90,deck]];
  silhouette(cabin,w*.82,glass,windows);
  const back=cabin[1][0],front=cabin[2][0];
  silhouette([[back-.04,roof],[back+.03,roof+.055],[front-.01,roof+.055],[front+.08,roof]],w*.86,paint);
  // Roof pillars, mirrors and flush handles give scale without hiding the links.
  for(const side of [-1,1]){
    box([.05,roof-deck,.065],paint,[side*w*.423,(roof+deck)/2,truck?-.24:-.27]);
    box([.17,.08,.17],dark,[side*(w/2+.075),deck+.1,.86]);
    box([.025,.028,.18],metal,[side*(w/2+.022),deck-.065,.02]);
    box([.045,.055,Math.max(.2,cfg.wheelbase-2*arch-.06)],dark,[side*(w/2+.013),bottom+.07,0]);
  }
  if(truck){
    // A recessed bed and taller bed sides distinguish the two pickups.
    box([w*.86,.055,end-.49],dark,[0,deck+.025,(-end-.36)/2]);
    for(const side of [-1,1])box([.07,.16,end-.42],paint,[side*w*.455,deck+.09,(-end-.34)/2]);
    if(cfg.body==='baja'){
      for(const z of [-1.5,-.55]){
        box([w*.83,.065,.065],dark,[0,deck+.48,z]);
        for(const side of [-1,1])box([.065,.48,.065],dark,[side*w*.40,deck+.24,z]);
      }
      const spare=add(new THREE.TorusGeometry(cfg.radius*.73,cfg.radius*.24,10,28),black,[0,deck+.22,-1.2]);spare.rotation.x=Math.PI/2;
      box([w*.62,.075,.12],dark,[0,roof+.13,.6]);
      for(let i=0;i<6;i++)box([.11,.058,.025],light,[(i-2.5)*.17,roof+.13,.67]);
      box([.13,.01,.66],orange,[w*.24,deck+.027,end-.50]);
    }
  }
  if(cfg.body==='sports')box([w*.8,.038,.19],dark,[0,deck+.16,-end+.2]);
  if(cfg.body==='wagon'||cfg.body==='suv')for(const side of [-1,1])box([.04,.05,front-back],dark,[side*w*.32,roof+.09,(front+back)/2]);
  for(const side of [-1,1]){
    box([w*.22,.067,.037],light,[side*w*.32,.035,end+.01]);
    box([w*.2,.065,.03],red,[side*w*.32,.04,-end-.01]);
  }
  box([w*.94,.08,.09],dark,[0,bottom+.08,end]);box([w*.94,.08,.09],dark,[0,bottom+.08,-end]);
  box([w*.4,.13,.03],black,[0,-.07,end+.02]);
  box([w*.69,.045,cfg.length*.78],black,[0,bottom+.11,0]);
  for(const side of [-1,1])box([.085,.085,cfg.length*.85],metal,[side*cfg.track*.64,-.12,0],null);
  for(const z of [-wb,wb])box([cfg.track*1.72,.075,.10],metal,[0,-.05,z],null);
  return{group,shells,windows,paint};
}
