import {Vector3,Triangle,Float32BufferAttribute} from 'three';

// Inward-facing wheelhouse faces, as opposed to the exterior wing and arch lip.
function wellIndex(tri,cfg){
 const n=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize();
 if(n.y>.25)return -1;
 const triangle=new Triangle(...tri);
 return cfg.wheels.findIndex(w=>{
  const centre=triangle.closestPointToPoint(new Vector3(...w.position),new Vector3());
  const d=centre.clone().sub(new Vector3(...w.position));
  const innerWall=Math.abs(n.y)<.25&&Math.abs(centre.x)<Math.abs(w.position[0])-w.width*.25;
  return Math.abs(d.x)<w.width/2+.16&&Math.abs(d.z)<w.radius*1.5&&d.y>-.3*w.radius&&d.y<w.radius*1.4&&(innerWall||n.dot(d.normalize())<-.30);
 });
}
const key=v=>[v.x,v.y,v.z].map(n=>n.toFixed(5)).join(','),edge=(a,b)=>[key(a),key(b)].sort().join('|');

// Recess the pack's shallow inner wheelhouses. Subdivide only those faces so
// their interior can rise without moving a single exterior vertex or arch lip.
// UVs and original exterior normals are retained; no source asset is mutated.
export function deepenWheelWells(geometry,cfg){
 const source=geometry.toNonIndexed(),p=source.attributes.position,faces=[],edges=new Map(),boundary=new Set();
 for(let j=0;j<p.count;j+=3){
  const tri=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,j+k)),wheel=wellIndex(tri,cfg);
  faces.push({start:j,tri,wheel});
  for(let k=0;k<3;k++){const e=edge(tri[k],tri[(k+1)%3]);if(!edges.has(e))edges.set(e,new Set());edges.get(e).add(wheel<0?'outer':'inner');}
 }
 for(const {tri,wheel} of faces)if(wheel>=0)for(let k=0;k<3;k++)if(edges.get(edge(tri[k],tri[(k+1)%3])).has('outer')){
  const a=tri[k],b=tri[(k+1)%3];for(let n=0;n<=32;n++)boundary.add(key(a.clone().lerp(b,n/32)));
 }
 const arrays=Object.fromEntries(Object.keys(source.attributes).map(k=>[k,[]]));let changed=0;
 const vertex=i=>Object.fromEntries(Object.entries(source.attributes).map(([name,a])=>[name,Array.from({length:a.itemSize},(_,n)=>a.array[i*a.itemSize+n])]));
 const midpoint=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k].map((v,i)=>(v+b[k][i])/2)]));
 function emit(tri,wheel){
  const values=tri.map(v=>({...v,position:[...v.position]}));
  if(wheel>=0){
   for(const v of values){const point=new Vector3(...v.position);if(boundary.has(key(point)))continue;
    // A long inner wall can border both wheelhouses; deform only the local arch.
    const i=cfg.wheels.reduce((best,w,index)=>Math.sign(w.position[0])===Math.sign(point.x)&&Math.abs(w.position[2]-point.z)<Math.abs(cfg.wheels[best].position[2]-point.z)?index:best,wheel);
    const w=cfg.wheels[i],bump=cfg.travel.bump[i<2?0:1],margin=['sports','coupe'].includes(cfg.id)?.050:cfg.id==='offroad'?.110:.075;
    const extra=Math.max(0,bump-(w.archGap+cfg.lift)+margin);
    const longitudinal=Math.max(0,Math.min(1,(w.radius*1.5-Math.abs(point.z-w.position[2]))/(w.radius*.35)));
    const h=Math.max(0,Math.min(1,(point.y-w.position[1]+w.radius*.35)/(w.radius*.5)));
    const inward=Math.max(0,Math.min(1,(Math.abs(w.position[0])+w.width/2+.025-Math.abs(point.x))/.075));
    const dy=extra*h*h*(3-2*h)*inward*longitudinal;
    // Allow the upper tyre to move inward as the control arms gain camber.
    const side=Math.max(0,Math.min(1,(Math.abs(w.position[0])-Math.abs(point.x))/(w.width*.6)));
    const lateralRoom=cfg.id==='offroad'?.22:Math.min(.13,bump*.55+.015);
    const dx=lateralRoom*side*(.45+.55*h)*longitudinal;
    const dz=Math.sign(point.z-w.position[2])*extra*.35*Math.min(1,Math.abs(point.z-w.position[2])/w.radius)*inward*longitudinal*h;
    v.position[0]-=Math.sign(point.x)*dx;v.position[1]+=dy;v.position[2]+=dz;if(dy>0||dx>0||dz>0)changed++;
   }
   const points=values.map(v=>new Vector3(...v.position)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize().toArray();
   for(const v of values)v.normal=normal;
  }
  for(const v of values)for(const name of Object.keys(arrays))arrays[name].push(...v[name]);
 }
 function subdivide(a,b,c,depth,wheel){
  if(!depth){emit([a,b,c],wheel);return;}
  const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
  subdivide(a,ab,ca,depth-1,wheel);subdivide(ab,b,bc,depth-1,wheel);subdivide(ca,bc,c,depth-1,wheel);subdivide(ab,bc,ca,depth-1,wheel);
 }
 for(const f of faces){
  const longest=Math.max(...f.tri.map((p,i)=>p.distanceTo(f.tri[(i+1)%3])));
  const depth=f.wheel<0?0:Math.min(5,Math.max(2,Math.ceil(Math.log2(longest/.13))));
  subdivide(vertex(f.start),vertex(f.start+1),vertex(f.start+2),depth,f.wheel);
 }
 const result=source.clone();for(const [name,array] of Object.entries(arrays))result.setAttribute(name,new Float32BufferAttribute(array,source.attributes[name].itemSize));
 result.computeBoundingBox();result.computeBoundingSphere();result.userData.wheelWellVertices=changed;source.dispose();return result;
}
