// Reproducible conversion of Comrade1280's CC BY 4.0 Sketchfab GLB.
// Usage: node scripts/process-car-pack.mjs /path/to/generic_passenger_car_pack.glb
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Matrix4, Matrix3, Vector3, Box3 } from 'three';
const input=process.argv[2];if(!input)throw Error('Supply the original downloaded GLB path');
const bytes=fs.readFileSync(input),jsonLength=bytes.readUInt32LE(12),source=JSON.parse(bytes.subarray(20,20+jsonLength));
if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected glTF 2 GLB');
const bin=bytes.subarray(28+jsonLength);const worlds=[];
function walk(id,parent=new Matrix4()){const n=source.nodes[id],m=parent.clone().multiply(new Matrix4().fromArray(n.matrix??new Matrix4().elements));worlds[id]=m;for(const c of n.children??[])walk(c,m);}walk(0);
const cars={compact:[11,[3,5,7,9]],coupe:[15,[19,21,23,25]],hatchback:[27,[31,33,35,37]],minivan:[41,[39,45,47,49]],offroad:[53,[51,57,59,61]],pickup:[65,[63,69,71,73]],sedan:[75,[79,81,83,85]],sports:[95,[87,89,91,93]],suv:[102,[99,106,109,112]],wagon:[115,[119,121,123,125]]};
const sizeOf={5121:1,5123:2,5125:4,5126:4},dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function readAccessor(id){const a=source.accessors[id],v=source.bufferViews[a.bufferView],size=sizeOf[a.componentType],d=dimensions[a.type],stride=v.byteStride??size*d,result=[];if(!size||!d||a.sparse)throw Error('Unsupported accessor');for(let i=0;i<a.count;i++)for(let j=0;j<d;j++){const o=(v.byteOffset??0)+(a.byteOffset??0)+i*stride+j*size;result.push(a.componentType===5126?bin.readFloatLE(o):a.componentType===5125?bin.readUInt32LE(o):a.componentType===5123?bin.readUInt16LE(o):bin.readUInt8(o));}return result;}
function parts(root,matrix){return source.nodes[root].children.map(id=>({name:source.nodes[id].name,matrix:matrix.clone().multiply(worlds[id]),primitives:source.meshes[source.nodes[id].mesh].primitives}));}
function vertices(parts){const points=[];for(const p of parts)for(const prim of p.primitives){const a=readAccessor(prim.attributes.POSITION);for(let i=0;i<a.length;i+=3)points.push(new Vector3().fromArray(a,i).applyMatrix4(p.matrix));}return points;}
const out=path.resolve('assets/cars');fs.mkdirSync(out,{recursive:true});const manifest={source:source.asset.extras,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),cars:{}};
for(const [id,[bodyId,wheelIds]] of Object.entries(cars)){
 const inverse=worlds[bodyId].clone().invert(),basis=inverse.clone().multiply(worlds[wheelIds[0]]),u=new Vector3().setFromMatrixColumn(basis,0).normalize();
 // Body coordinates are millimetres, Z up. Wheels reveal the coupe's hidden yaw.
 const normalize=new Matrix4().set(u.x*.001,u.y*.001,0,0,0,0,.001,0,u.y*.001,-u.x*.001,0,0,0,0,0,1).multiply(inverse);
 let bodyParts=parts(bodyId,normalize),wheelParts=wheelIds.map(i=>parts(i,normalize));
 let wheelBoxes=wheelParts.map(p=>new Box3().setFromPoints(vertices(p))),centres=wheelBoxes.map(b=>b.getCenter(new Vector3()));
 const centre=new Vector3(centres.reduce((s,p)=>s+p.x,0)/4,0,centres.reduce((s,p)=>s+p.z,0)/4);
 const radius=wheelBoxes.map(b=>(b.max.y-b.min.y)/2),ground=centres.reduce((s,c,i)=>s+c.y-radius[i],0)/4;centre.y=ground;
 const shift=new Matrix4().makeTranslation(-centre.x,-centre.y,-centre.z);for(const p of [...bodyParts,...wheelParts.flat()])p.matrix.premultiply(shift);
 centres=centres.map(c=>c.sub(centre));wheelBoxes=wheelParts.map(p=>new Box3().setFromPoints(vertices(p)));
 // Centre of the tyre, not the artist's transform origin. FL, FR, RL, RR.
 const order=[0,1,2,3].sort((a,b)=>Math.abs(centres[b].z-centres[a].z)>.1?centres[b].z-centres[a].z:centres[b].x-centres[a].x);
 wheelParts=order.map(i=>wheelParts[i]);centres=order.map(i=>centres[i]);wheelBoxes=order.map(i=>wheelBoxes[i]);
 const bodyBox=new Box3().setFromPoints(vertices(bodyParts)),bodySize=bodyBox.getSize(new Vector3());
 const model={asset:{version:'2.0',generator:'Suspension Lab car pack processor',extras:source.asset.extras},scene:0,scenes:[{nodes:[0]}],nodes:[{name:id,children:[]}],meshes:[],materials:[],textures:[],images:[],samplers:source.samplers??[],accessors:[],bufferViews:[],buffers:[{}]};
 let chunks=[],offset=0;const materialMap=new Map(),textureMap=new Map(),imageMap=new Map();
 function buffer(data,target){const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}const index=model.bufferViews.length;model.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,...target?{target}:{}});chunks.push(data);offset+=data.length;return index;}
 function accessor(data,original,minMax=false){const a={...source.accessors[original]};delete a.byteOffset;delete a.min;delete a.max;const typed=a.componentType===5126?new Float32Array(data):a.componentType===5125?new Uint32Array(data):a.componentType===5123?new Uint16Array(data):new Uint8Array(data);a.bufferView=buffer(Buffer.from(typed.buffer),a.type==='SCALAR'?34963:34962);if(minMax){const b=new Box3().setFromPoints(Array.from({length:data.length/3},(_,i)=>new Vector3().fromArray(data,i*3)));a.min=b.min.toArray();a.max=b.max.toArray();}model.accessors.push(a);return model.accessors.length-1;}
 function texture(t){if(textureMap.has(t))return textureMap.get(t);const old=source.textures[t],imageId=old.source;if(!imageMap.has(imageId)){const image=source.images[imageId],v=source.bufferViews[image.bufferView];imageMap.set(imageId,model.images.length);model.images.push({mimeType:image.mimeType,bufferView:buffer(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength))});}const index=model.textures.length;textureMap.set(t,index);model.textures.push({...old,source:imageMap.get(imageId)});return index;}
 function material(i){if(materialMap.has(i))return materialMap.get(i);const m=structuredClone(source.materials[i]);function visit(o){for(const [k,v] of Object.entries(o))if(v&&typeof v==='object'){if(k.endsWith('Texture'))v.index=texture(v.index);else visit(v);}}visit(m);const index=model.materials.length;materialMap.set(i,index);model.materials.push(m);return index;}
 function group(name,ps,origin=new Vector3()){
  const nodeId=model.nodes.length;model.nodes.push({name,children:[],translation:origin.toArray()});model.nodes[0].children.push(nodeId);
  for(const p of ps){const normal=new Matrix3().getNormalMatrix(p.matrix),primitives=[];
   for(const prim of p.primitives){const attributes={};for(const [key,aid] of Object.entries(prim.attributes)){const data=readAccessor(aid);if(key==='POSITION'||key==='NORMAL')for(let k=0;k<data.length;k+=3){let v=new Vector3().fromArray(data,k);if(key==='POSITION')v.applyMatrix4(p.matrix).sub(origin);else v.applyMatrix3(normal).normalize();v.toArray(data,k);}attributes[key]=accessor(data,aid,key==='POSITION');}primitives.push({attributes,indices:accessor(readAccessor(prim.indices),prim.indices),material:material(prim.material),mode:4});}
   model.nodes[nodeId].children.push(model.nodes.length);model.nodes.push({name:p.name,mesh:model.meshes.length});model.meshes.push({name:p.name,primitives});
  }
 }
 group('body',bodyParts);wheelParts.forEach((p,i)=>group(['wheel_fl','wheel_fr','wheel_rl','wheel_rr'][i],p,centres[i]));
 model.buffers[0].byteLength=offset;let jb=Buffer.from(JSON.stringify(model)),bb=Buffer.concat(chunks);jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);bb=Buffer.concat([bb,Buffer.alloc((4-bb.length%4)%4)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bb.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bb.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(path.join(out,id+'.glb'),Buffer.concat([header,jb,bh,bb]));
 const points=vertices(bodyParts);const frontZ=(centres[0].z+centres[1].z)/2,rearZ=(centres[2].z+centres[3].z)/2;
 // Ray sample each arch's upper edge from the actual shell near the wheel plane.
 const arches=centres.map((c,i)=>{const r=(wheelBoxes[i].max.y-wheelBoxes[i].min.y)/2;const near=points.filter(p=>Math.abs(p.z-c.z)<.075&&Math.abs(p.x)>Math.abs(c.x)*.90&&p.y>c.y+r*.5);return near.length?Math.min(...near.map(p=>p.y))-c.y-r:.05;});
 const f=n=>+n.toFixed(5);manifest.cars[id]={length:f(bodySize.z),width:f(bodySize.x),height:f(bodyBox.max.y),clearance:f(bodyBox.min.y),bounds:{min:bodyBox.min.toArray().map(f),max:bodyBox.max.toArray().map(f)},wheelbase:f(frontZ-rearZ),track:f((centres[0].x-centres[1].x+centres[2].x-centres[3].x)/4),radius:f(wheelBoxes.reduce((s,b)=>s+(b.max.y-b.min.y)/2,0)/4),wheelWidth:f(wheelBoxes.reduce((s,b)=>s+b.max.x-b.min.x,0)/4),wheels:centres.map((c,i)=>({position:c.toArray().map(f),radius:f((wheelBoxes[i].max.y-wheelBoxes[i].min.y)/2),width:f(wheelBoxes[i].max.x-wheelBoxes[i].min.x),archGap:f(arches[i])})),triangles:model.meshes.reduce((s,m)=>s+m.primitives.reduce((a,p)=>a+model.accessors[p.indices].count/3,0),0)};
 console.log(id,manifest.cars[id]);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');

fs.writeFileSync('src/car-dimensions.js','// Measured from the processed CC BY 4.0 car pack; regenerate with scripts/process-car-pack.mjs.\nexport const CAR_DIMENSIONS='+JSON.stringify(manifest.cars)+';\n');
