import test from 'node:test';
import assert from 'node:assert/strict';
import {POWERTRAINS} from '../src/powertrains.js';
import {VehicleDSP} from '../src/sound-dsp.js';
import {SoundModel} from '../src/sound-model.js';
import {Suspension,STEP} from '../src/physics.js';
function render(dsp,engine,seconds=.5,rate=1){
 const a=new Float32Array(128),b=new Float32Array(128);let peak=0,sum=0,n=0;
 for(let k=0;k<seconds*dsp.sampleRate;k+=128){dsp.setFrame({engine,rate,active:true});dsp.process(a,b);for(const x of a){assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));sum+=x*x;n++;}}
 return {peak,rms:Math.sqrt(sum/n)};
}
test('nine firing voices and an electric motor are distinct, restrained and bounded at every playback rate',()=>{
 const signatures=new Set();
 for(const p of Object.values(POWERTRAINS)){
  for(const rate of [1,.25]){
   const dsp=new VehicleDSP(24000),idle=render(dsp,{id:p.id,rpm:p.idle,load:0},.5,rate);
   if(p.electric)assert.equal(idle.peak,0);else assert.ok(idle.rms>.0005&&idle.rms<.035,`${p.id}: idle mix ${idle.rms}`);
   const full=render(dsp,{id:p.id,rpm:p.redline*.75,load:1},.7,rate);
   assert.ok(full.rms>idle.rms,`${p.id}: load response`);assert.ok(full.peak<.25,`${p.id}: too loud ${full.peak}`);
   if(rate===1)signatures.add(full.rms.toFixed(7));
   dsp.setFrame({active:false,reset:true});const a=new Float32Array(24000),b=new Float32Array(24000);dsp.process(a,b);
   assert.ok(a.slice(-1000).every(x=>Math.abs(x)<.00001),'mute/hidden/pause fade');
  }
 }
 assert.equal(signatures.size,10);
});
test('engine sound follows actual drivetrain telemetry and resets when changing car',()=>{
 const s=new Suspension('compact'),m=new SoundModel();
 try{
  m.sample(s,STEP);assert.equal(m.engine.id,'compact');assert.equal(m.engine.rpm,850);
  s.setDriving(true);s.setInput(1,0);for(let i=0;i<240;i++)s.step();m.sample(s,STEP);
  assert.ok(m.engine.rpm>1500);assert.ok(m.engine.load>.5);
  s.setSetup('sedan');m.sample(s,STEP);assert.equal(m.engine.id,'sedan');assert.equal(m.engine.rpm,0);assert.equal(m.engine.load,0);
 }finally{s.free();}
});
test('stale engine frames fade out even while the engine is running',()=>{
 const dsp=new VehicleDSP(24000);render(dsp,{id:'pickup',rpm:3500,load:1});
 const a=new Float32Array(128),b=new Float32Array(128);for(let k=0;k<24000;k+=128)dsp.process(a,b);
 assert.ok(a.every(x=>Math.abs(x)<.00001));
});
