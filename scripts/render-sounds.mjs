// Reproducible stereo previews from real physics and the production DSP.
import {mkdir,writeFile} from 'node:fs/promises';
import {Suspension,STEP} from '../src/physics.js';
import {SoundModel} from '../src/sound-model.js';
import {VehicleDSP} from '../src/sound-dsp.js';
import {Vector3} from 'three';
const out=process.argv[2]??'evidence/audio';await mkdir(out,{recursive:true});
const sr=48000,block=200,report=[];
for(const scenario of ['press-bounce','baja-drop','baja-quarter','dry-turn','wet-turn','ice-turn']){
  const sim=new Suspension(),model=new SoundModel(),dsp=new VehicleDSP(sr),rate=scenario==='baja-quarter'?.25:1;
  sim.setType(scenario.startsWith('baja')?'baja':'wishbone');
  if(scenario.endsWith('turn')){
    sim.setSurface(scenario.split('-')[0]);sim.setDriving(true);sim.setInput(1,0);
    for(let k=0;k<1920;k++)sim.step();sim.setInput(0,0);
  }
  const seconds=scenario==='baja-quarter'?9:6,frames=seconds*sr,left=new Float32Array(frames),right=new Float32Array(frames);
  let peak=0,sum=0,eventCounts={},flow=0,scrub=0,squeal=0;
  model.sample(sim,STEP);
  for(let n=0;n<frames;n+=block){
    const time=n/sr,k=n/block;
    if(k===96){
      if(scenario==='press-bounce'){sim.beginBodyDrag(new Vector3(.5,.8,1.2),false);sim.setDragHeight(sim.drag.target-.3);}
      else if(scenario.startsWith('baja'))sim.drop(.85);
    }
    if(scenario==='press-bounce'&&k===240)sim.release();
    if(scenario.endsWith('turn'))sim.setInput(0,time>1.5&&time<3.2?.7:0);
    if(k%(1/rate)===0){sim.step();model.sample(sim,STEP);}
    if(k%4===0){
      const events=model.drain();for(const e of events)eventCounts[e.kind]=(eventCounts[e.kind]??0)+1;
      const voices=model.voices.map((v,i)=>({...v,pan:i%2===0?-.45:.45}));
      flow=Math.max(flow,...voices.map(v=>v.flow));scrub=Math.max(scrub,...voices.map(v=>v.scrub));squeal=Math.max(squeal,...voices.map(v=>v.squeal));
      dsp.setFrame({voices,events,rate,active:true});
    }
    dsp.process(left.subarray(n,n+block),right.subarray(n,n+block));
  }
  const wav=Buffer.alloc(44+frames*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++)for(let c=0;c<2;c++){
    const v=c?right[i]:left[i];if(!Number.isFinite(v))throw Error('Non-finite sample');
    peak=Math.max(peak,Math.abs(v));sum+=v*v;wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*4+c*2);
  }
  await writeFile(`${out}/${scenario}.wav`,wav);sim.free();
  report.push({scenario,seconds,peak,rms:Math.sqrt(sum/(frames*2)),eventCounts,flow,scrub,squeal});
}
await writeFile(`${out}/metrics.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
