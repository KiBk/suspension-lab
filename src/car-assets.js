import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const cache=new Map(),pending=new Map();let active=null;
export function getVehicleAsset(id){return cache.get(id);}
export function registerVehicleAsset(id,scene){cache.set(id,scene);return scene;}
export function activateVehicleAsset(id){active=id;const value=cache.get(id);if(value){cache.delete(id);cache.set(id,value);}for(const [key,scene] of cache){if(cache.size<=3)break;if(key===active)continue;const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(m=>{if(m.isMesh){geometries.add(m.geometry);materials.add(m.material);for(const v of Object.values(m.material))if(v?.isTexture)textures.add(v);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();t.source.data?.close?.();});cache.delete(key);}}
export async function loadVehicleAsset(id){
 if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
 const promise=new GLTFLoader().loadAsync(`/assets/cars/${id}.glb`).then(g=>registerVehicleAsset(id,g.scene));pending.set(id,promise);
 try{return await promise;}finally{pending.delete(id);}
}
export function instantiateVehicle(id,restHeight,cfg){
 const source=cache.get(id);if(!source)throw new Error(`Vehicle asset ${id} has not loaded`);
 const root=source.clone(true),shells=[],windows=[];
 root.traverse(m=>{if(!m.isMesh)return;m.material=m.material.clone();m.userData.assetGeometry=true;m.userData.ownMaterial=true;m.castShadow=m.receiveShadow=true;m.material.envMapIntensity=.5;if(m.material.name.startsWith('Glass')){m.material.color.set('#526668');m.material.opacity=.78;m.material.roughness=.18;}});
 const body=root.getObjectByName('body');body.position.y=cfg.lift-restHeight;
 body.traverse(m=>{if(m.isMesh)(m.material.name.startsWith('Glass')?windows:shells).push(m);});
 const wheels=['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map(name=>{const w=root.getObjectByName(name);w.removeFromParent();w.position.set(0,0,0);return w;});body.removeFromParent();return{group:body,shells,windows,wheels};
}
