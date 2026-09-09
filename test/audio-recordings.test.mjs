import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VehicleDSP} from '../src/sound-dsp.js';
import {SoundModel} from '../src/sound-model.js';
import {RecordingLoop,decodeLoop,loadRecordings} from '../src/recordings.js';
import {audioBank} from '../scripts/audio-bank.mjs';
const baseline=JSON.parse(await readFile(new URL('./audio-baseline.json',import.meta.url)));
function frame(kind){
 const contact=true,load=3800,longitudinal=kind==='locked'?25:kind==='turn'?18:kind==='rolling'?20:0,lateral=kind==='turn'?3:kind==='scrub'?.2:0;
 const omega=kind==='locked'?0:longitudinal/.35,velocity=kind==='damper'?-1:0;
 return {world:{},surface:'dry',type:'macpherson',radius:.35,tyres:Array.from({length:4},()=>({contact,load,longitudinal,lateral,omega,usage:kind==='locked'||kind==='turn'?1:.3})),springs:Array.from({length:4},(_,index)=>({index,length:.55,rest:.67,min:.3,max:.8,velocity}))};
}
function render(kind,rate=1){
 const d=new VehicleDSP(24000);d.setRecordings?.(audioBank);const m=new SoundModel(),sim=frame(kind);m.sample(sim,1/240);
 const left=new Float32Array(48000),right=new Float32Array(48000);
 for(let n=0;n<left.length;n+=128){const events=n===0&&['land','bump','droop'].includes(kind)?Array.from({length:4},(_,wheel)=>({wheel,kind,strength:.8})):[];d.setFrame({voices:m.voices,events,rate,active:true});d.process(left.subarray(n,n+128),right.subarray(n,n+128));}
 let sum=0,peak=0;for(const a of [left,right])for(const x of a){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
 return {sha256:createHash('sha256').update(Buffer.from(left.buffer)).update(Buffer.from(right.buffer)).digest('hex'),rms:Math.sqrt(sum/(left.length*2)),peak};
}

test('approved suspension, landing, rolling and stationary scrub audio remain sample-identical',()=>{
 // Golden hashes captured from aa35290 before replacing engine/skid synthesis.
 for(const row of baseline.filter(r=>!['locked','turn'].includes(r.kind))){
  const result=render(row.kind,row.rate);assert.equal(result.sha256,row.sha256,`${row.kind} at ${row.rate}x changed`);
 }
});
test('locked brakes and hard cornering are at least 15 dB quieter, with audible recorded friction',()=>{
 for(const row of baseline.filter(r=>['locked','turn'].includes(r.kind))){
  const result=render(row.kind,row.rate);
  assert.ok(result.rms>0.003,`${row.kind}: friction disappeared`);
  assert.ok(result.rms<row.rms*Math.pow(10,-15/20),`${row.kind}: skid too loud`);
  assert.ok(result.peak<.065,`${row.kind}: excessive transient`);
 }
});
test('every processed recording and retained source matches its provenance hash',async()=>{
 for(const [file,key] of [['../assets/audio/manifest.json','loops'],['../assets/source/audio/sources.json',null]]){
  const data=JSON.parse(await readFile(new URL(file,import.meta.url)));
  for(const row of key?data[key]:data){
   const path=key?`../assets/audio/${row.file}`:`../assets/source/audio/${row.id}.${row.id==='tyre-skid-original'?'wav':'mp3'}`;
   assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),row.sha256,row.id);
  }
 }
});
test('recorded loops have no exceptional seam jump at 24/48 kHz and quarter speed',()=>{
 for(const [id,recording] of Object.entries(audioBank))for(const sr of [24000,48000])for(const rate of [.25,1,1.8]){
  const loop=new RecordingLoop(recording,sr,.9995),values=[],positions=[];
  for(let i=0;i<500;i++){positions.push(loop.position);values.push(loop.tick(rate));}
  assert.ok(values.every(Number.isFinite));
  const diffs=Array.from(recording.samples.slice(1),(v,i)=>Math.abs(v-recording.samples[i])).sort((a,b)=>a-b);
  const allowance=diffs[Math.floor(diffs.length*.99)]*Math.max(1,recording.sampleRate/sr*rate)*2+.002;
  const wrap=positions.findIndex((p,i)=>i>0&&p<positions[i-1]);assert.ok(wrap>0,'must cross the boundary');
  // Inspect the actual wrap. A natural transient later in the recording is not
  // a loop seam; higher playback rates also traverse more source samples.
  assert.ok(Math.abs(values[wrap]-values[wrap-1])<allowance,`${id} ${sr} ${rate}: click at wrap`);
 }
});
test('missing or malformed recordings fail explicitly; no synthetic combustion fallback',async()=>{
 await assert.rejects(loadRecordings(async()=>{throw Error('offline');}),/offline/);
 assert.throws(()=>decodeLoop(new ArrayBuffer(44)),/Invalid/);
 const d=new VehicleDSP(24000),l=new Float32Array(128),r=new Float32Array(128);
 d.setFrame({engine:{id:'pickup',rpm:3500,load:1}});d.process(l,r);assert.ok(l.every(x=>x===0));
});
