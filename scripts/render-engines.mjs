// Offline listening previews use the real vehicle simulation and browser DSP.
import {mkdir,writeFile} from 'node:fs/promises';
import {Suspension,STEP} from '../src/physics.js';
import {POWERTRAINS} from '../src/powertrains.js';
import {SoundModel} from '../src/sound-model.js';
import {VehicleDSP} from '../src/sound-dsp.js';
const dir=process.argv[2]??'evidence/engines';await mkdir(dir,{recursive:true});
const sr=24000,block=100,seconds=10,frames=sr*seconds,metrics=[];
for(const id of Object.keys(POWERTRAINS)){
 const sim=new Suspension(id),model=new SoundModel(),dsp=new VehicleDSP(sr),left=new Float32Array(frames),right=new Float32Array(frames),timeline=[];
 let peak=0,sum=0;
 try{
  for(let n=0;n<frames;n+=block){
   const t=n/sr;if(n===sr){sim.setDriving(true);sim.setInput(1,0);}if(n===sr*8)sim.setInput(0,0);
   sim.step();model.sample(sim,STEP);
   const engine={...model.engine,gain:1};dsp.setFrame({engine,voices:model.voices,events:model.drain(),active:true});dsp.process(left.subarray(n,n+block),right.subarray(n,n+block));
   if(n%sr===0)timeline.push({time:t,speed:sim.groundSpeed*3.6,...engine});
  }
  const wav=Buffer.alloc(44+frames*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++)for(let c=0;c<2;c++){const v=c?right[i]:left[i];if(!Number.isFinite(v))throw Error(id+' non-finite audio');peak=Math.max(peak,Math.abs(v));sum+=v*v;wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*4+c*2);}
  await writeFile(`${dir}/${id}.wav`,wav);metrics.push({id,seconds,peak,rms:Math.sqrt(sum/(frames*2)),timeline});console.log(id,metrics.at(-1).rms.toFixed(4),peak.toFixed(4));
 }finally{sim.free();}
}
await writeFile(`${dir}/metrics.json`,JSON.stringify(metrics,null,2)+'\n');
