import * as THREE from 'three';
import {TERRAINS,TERRAIN_STEP,terrainHeight,roadHeight} from './terrain.js';

export function roadGeometry(type,cellX,cellZ,origin={x:0,z:0},cells=32){
  const positions=[],uv=[],indices=[],n=cells+1;
  for(let x=0;x<n;x++)for(let z=0;z<n;z++){
    const wx=(cellX+x)*TERRAIN_STEP,wz=(cellZ+z)*TERRAIN_STEP;
    positions.push(wx-origin.x,Math.fround(terrainHeight(type,wx,wz)),wz-origin.z);uv.push(wx,wz);
    if(x<cells&&z<cells){const a=x*n+z,b=(x+1)*n+z,c=a+1,d=b+1;indices.push(a,c,b,b,c,d);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function makeRoadView(scene,renderer){
  const group=new THREE.Group();scene.add(group);
  const centre={value:new THREE.Vector2()},material=new THREE.MeshStandardMaterial({roughness:1});
  material.onBeforeCompile=shader=>{
    shader.uniforms.roadCentre=centre;
    shader.vertexShader='varying vec3 roadPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nroadPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader='varying vec3 roadPosition;\nuniform vec2 roadCentre;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(distance(roadPosition.xz,roadCentre)>3.28)discard;');
  };
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.receiveShadow=true;group.add(mesh);
  const gridMaterial=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});gridMaterial.onBeforeCompile=material.onBeforeCompile;
  const grid=new THREE.Mesh(mesh.geometry,gridMaterial);group.add(grid);
  const rim=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#a6b299',transparent:true,opacity:.65}));group.add(rim);
  const ticks=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#9eac90',transparent:true,opacity:.5}));group.add(ticks);
  let key='',type=null;
  function texture(terrain,gridOnly=false){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
    if(!gridOnly){ctx.fillStyle=TERRAINS[terrain].color;ctx.fillRect(0,0,256,256);}
    if(!gridOnly&&terrain!=='flat')for(let i=0;i<900;i++){
      const x=(i*73.71)%256,y=(i*i*13.31)%256;ctx.fillStyle=i%2?'#78755a25':'#faf3dc60';ctx.fillRect(x,y,i%3+1,i%2+1);
    }
    if(gridOnly)for(let i=0;i<=4;i++){
      ctx.strokeStyle=i%4===0?'rgba(101,120,91,.65)':'rgba(119,139,108,.40)';ctx.lineWidth=i%4===0?2:1.25;ctx.beginPath();ctx.moveTo(i*64,0);ctx.lineTo(i*64,256);ctx.moveTo(0,i*64);ctx.lineTo(256,i*64);ctx.stroke();
    }
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return map;
  }
  function update(sim){
    const wx=sim.x+sim.worldOrigin.x,wz=sim.z+sim.worldOrigin.z,cx=Math.floor(wx/TERRAIN_STEP)-16,cz=Math.floor(wz/TERRAIN_STEP)-16;
    group.position.set(sim.x,0,sim.z);mesh.position.set(-sim.x,0,-sim.z);centre.value.set(sim.x,sim.z);grid.position.copy(mesh.position);
    const next=`${sim.terrainType}:${cx}:${cz}:${sim.worldOrigin.x}:${sim.worldOrigin.z}`;
    if(next!==key){mesh.geometry.dispose();mesh.geometry=roadGeometry(sim.terrainType,cx,cz,sim.worldOrigin);grid.geometry=mesh.geometry;key=next;}
    if(type!==sim.terrainType){material.map?.dispose();material.map=texture(sim.terrainType);material.needsUpdate=true;gridMaterial.map?.dispose();gridMaterial.map=texture(sim.terrainType,true);gridMaterial.needsUpdate=true;type=sim.terrainType;}
    const point=(a,r)=>{const x=Math.cos(a)*r,z=Math.sin(a)*r;return new THREE.Vector3(x,roadHeight(sim.terrainType,wx+x,wz+z)+.008,z);};
    const edge=[],marks=[];for(let i=0;i<144;i++)edge.push(point(i*Math.PI/72,3.28));
    for(let i=0;i<72;i++){const a=i*Math.PI/36;marks.push(point(a,i%6===0?3.05:3.15),point(a,3.22));}
    rim.geometry.setFromPoints(edge);ticks.geometry.setFromPoints(marks);rim.geometry.computeBoundingSphere();ticks.geometry.computeBoundingSphere();
  }
  return{group,update};
}
