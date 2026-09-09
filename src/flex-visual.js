import {Vector3,Quaternion,Matrix4,Matrix3} from 'three';
const unit=new Vector3(1,1,1),q=new Quaternion(),p=new Vector3();
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// A small deformation field follows the three physical reference frames. CPU
// vertex deformation keeps picking, shadows and visible geometry in agreement.
// Original cached GLBs remain untouched; instances own their deformed geometry.
export class FlexVisual {
 constructor(root,reference,sim,{structure=false}={}){
  this.entries=[];this.relative=[new Matrix4(),new Matrix4(),new Matrix4()];this.world=[new Matrix4(),new Matrix4(),new Matrix4()];this.inverse=new Matrix4();
  reference.updateMatrixWorld(true);const inverse=reference.matrixWorld.clone().invert();
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
   const source=mesh.geometry,geo=source.clone();
   const owned=structure?mesh.userData.ownGeometry:!mesh.userData.assetGeometry;
   if(owned)source.dispose();mesh.geometry=geo;mesh.userData.assetGeometry=false;mesh.userData.ownGeometry=true;
   const position=geo.attributes.position,normal=geo.attributes.normal,toBody=inverse.clone().multiply(mesh.matrixWorld),fromBody=toBody.clone().invert();
   const rest=new Float32Array(position.array),normals=normal?new Float32Array(normal.array):null,weights=new Float32Array(position.count*3);
   geo.computeBoundingBox();geo.computeBoundingSphere();const centre=geo.boundingBox.getCenter(new Vector3()).applyMatrix4(toBody);
   const size=geo.boundingBox.getSize(new Vector3()),smallPart=structure&&Math.max(size.x*mesh.scale.x,size.y*mesh.scale.y,size.z*mesh.scale.z)<.45;
   for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i).applyMatrix4(toBody);let front=0,rear=0;
    if(smallPart){front=centre.z>sim.structure.boundary?1:0;rear=centre.z<-sim.structure.boundary?1:0;}
    else if(sim.setup.id==='pickup'&&!structure){
     // The pickup cab/bonnet and bed are relatively rigid assemblies carried
     // by the elastic frame. Blend only across the narrow cab-to-bed division.
     rear=1-smooth(-sim.setup.wheelbase*.18,-sim.setup.wheelbase*.12,p.z);
    }else{front=smooth(sim.setup.wheelbase*.10,sim.setup.wheelbase*.42,p.z);rear=smooth(sim.setup.wheelbase*.10,sim.setup.wheelbase*.42,-p.z);}
    weights[i*3]=rear;weights[i*3+1]=1-front-rear;weights[i*3+2]=front;
   }
   // Broad-phase bounds encompass the permitted elastic motion. Exact triangle
   // picking uses the current positions; no stale undeformed picking surface.
   geo.boundingBox.expandByScalar(.65);geo.boundingSphere.radius+=.65;
   this.entries.push({mesh,rest,normals,weights,toBody,fromBody,matrices:[new Matrix4(),new Matrix4(),new Matrix4()],normalMatrices:[new Matrix3(),new Matrix3(),new Matrix3()]});
  });
 }
 update(frame){
  if(!frame.structure)return;
  this.inverse.compose(frame.position,q.copy(frame.rotation),unit).invert();
  for(let j=0;j<3;j++){
   const f=frame.structure[j];this.world[j].compose(f.position,q.copy(f.rotation),unit);this.relative[j].multiplyMatrices(this.inverse,this.world[j]);
  }
  for(const e of this.entries){
   for(let j=0;j<3;j++){e.matrices[j].copy(e.fromBody).multiply(this.relative[j]).multiply(e.toBody);e.normalMatrices[j].getNormalMatrix(e.matrices[j]);}
   const pos=e.mesh.geometry.attributes.position,norm=e.mesh.geometry.attributes.normal;
   for(let i=0;i<pos.count;i++){
    const k=i*3,x=e.rest[k],y=e.rest[k+1],z=e.rest[k+2];let px=0,py=0,pz=0,nx=0,ny=0,nz=0;
    for(let j=0;j<3;j++){
     const w=e.weights[k+j];if(!w)continue;const m=e.matrices[j].elements;
     px+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);py+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);pz+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);
     if(e.normals){const n=e.normalMatrices[j].elements,a=e.normals[k],b=e.normals[k+1],c=e.normals[k+2];nx+=w*(n[0]*a+n[3]*b+n[6]*c);ny+=w*(n[1]*a+n[4]*b+n[7]*c);nz+=w*(n[2]*a+n[5]*b+n[8]*c);}
    }
    pos.setXYZ(i,px,py,pz);if(norm){const d=Math.hypot(nx,ny,nz)||1;norm.setXYZ(i,nx/d,ny/d,nz/d);}
   }
   pos.needsUpdate=true;if(norm)norm.needsUpdate=true;
  }
 }
}
