import {audioBank} from '../scripts/audio-bank.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundModel} from '../src/sound-model.js';
import {VehicleDSP} from '../src/sound-dsp.js';
import {Suspension,STEP,TYPES} from '../src/physics.js';

function fixture(){return {world:{},surface:'dry',type:'macpherson',radius:.35,
  tyres:Array.from({length:4},()=>({contact:true,load:3800,longitudinal:0,lateral:0,verticalSpeed:0,omega:0,usage:0})),
  springs:Array.from({length:4},(_,index)=>({index,length:.55,rest:.67,min:.3,max:.8,velocity:0}))};}
const levels=v=>['roll','flow','creak','scrub','squeal'].map(k=>v[k]);
function render(dsp,seconds,frame){
  const left=new Float32Array(128),right=new Float32Array(128);let energy=0,peak=0,l=0,r=0;
  for(let i=0;i<seconds*dsp.sampleRate;i+=128){if(frame&&i%512===0)dsp.setFrame(frame);dsp.process(left,right);
    for(let j=0;j<128;j++){assert.ok(Number.isFinite(left[j])&&Number.isFinite(right[j]));peak=Math.max(peak,Math.abs(left[j]),Math.abs(right[j]));l+=left[j]**2;r+=right[j]**2;}}
  energy=l+r;return {energy,peak,l,r};
}

test('sound is silent at rest; airborne tyres are quiet even when spinning',()=>{
  const sim=fixture(),model=new SoundModel();model.sample(sim,STEP);
  assert.ok(model.voices.every(v=>levels(v).every(x=>x===0)));assert.equal(model.drain().length,0);
  for(const t of sim.tyres)Object.assign(t,{omega:100,longitudinal:22,lateral:8,usage:1,contact:false,load:0});
  model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.roll===0&&v.scrub===0&&v.squeal===0));
  sim.springs[0].velocity=-1;model.sample(sim,STEP);assert.ok(model.voices[0].flow>0);
});

test('loaded rolling, slip and surface changes produce distinct layers',()=>{
  const sim=fixture(),model=new SoundModel();
  for(const t of sim.tyres)Object.assign(t,{omega:20/.35,longitudinal:20});
  model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.roll>0&&v.squeal===0&&v.scrub===0));
  for(const t of sim.tyres)Object.assign(t,{lateral:4,usage:1});
  model.sample(sim,STEP);const dry=model.voices[0];assert.ok(dry.squeal>0&&dry.scrub>0);
  sim.surface='wet';model.sample(sim,STEP);assert.ok(model.voices[0].squeal<dry.squeal/2);
  sim.surface='ice';model.sample(sim,STEP);assert.ok(model.voices[0].squeal<dry.squeal/10);
});

test('ordinary motorway traction is quiet; wheelspin, locking and lateral scrub remain audible',()=>{
  const sim=fixture(),model=new SoundModel(),speed=122/3.6;
  for(const sign of [-1,1]){
    for(const t of sim.tyres)Object.assign(t,{longitudinal:speed,omega:speed*(1+sign*.02)/sim.radius,lateral:0,usage:.35});
    model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.scrub===0&&v.squeal===0),'ordinary traction slip should not sound like sliding');
  }
  for(const t of sim.tyres)Object.assign(t,{omega:0,usage:1});
  model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.scrub>0&&v.squeal>0),'locked tyre remains audible');
  for(const t of sim.tyres)Object.assign(t,{longitudinal:0,omega:30,usage:1});
  model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.squeal>0),'wheelspin remains audible');
  for(const t of sim.tyres)Object.assign(t,{longitudinal:0,omega:0,lateral:.2,usage:.3});
  model.sample(sim,STEP);assert.ok(model.voices.every(v=>v.scrub>0),'stationary suspension scrub remains audible');
});

test('real straight-line acceleration and braking at 122 km/h do not trigger continuous scrub',()=>{
  for(const type of Object.keys(TYPES))for(const throttle of [-1,1]){
    const sim=new Suspension(),model=new SoundModel();
    try{
      sim.setType(type);sim.setDriving(true);
      for(const b of sim.dynamic)b.setLinvel({x:0,y:0,z:122/3.6},true);
      for(const t of sim.tyres)t.omega=122/3.6/sim.radius;
      for(let k=0;k<240;k++)sim.step();sim.setInput(throttle,0);
      for(let k=0;k<240;k++)sim.step();model.sample(sim,STEP);
      assert.ok(model.voices.every(v=>v.scrub<.001&&v.squeal===0),`${type} ${throttle}: ordinary drive input produces a skid sound`);
      assert.ok(model.voices.every(v=>v.roll>0));
    }finally{sim.free();}
  }
});

test('landing and travel stops are edge-triggered, with no impact on reset',()=>{
  const sim=fixture(),model=new SoundModel();model.sample(sim,STEP);
  sim.tyres[0].contact=false;sim.tyres[0].load=0;sim.tyres[0].verticalSpeed=-3;
  for(let k=0;k<40;k++)model.sample(sim,STEP);
  sim.tyres[0].contact=true;sim.tyres[0].load=5000;model.sample(sim,STEP);
  assert.deepEqual(model.drain().map(e=>e.kind),['land']);
  for(let k=0;k<40;k++)model.sample(sim,STEP);assert.equal(model.drain().length,0);
  sim.springs[0].length=.3;sim.springs[0].velocity=-1;model.sample(sim,STEP);
  assert.deepEqual(model.drain().map(e=>e.kind),['bump']);
  model.reset();model.sample(sim,STEP);assert.equal(model.drain().length,0);
  sim.world={};model.sample(sim,STEP);assert.equal(model.drain().length,0);
});

test('actual drops on every layout produce landing, flow and stationary wheel scrub',()=>{
  const results=[];
  for(const type of Object.keys(TYPES)){
    const sim=new Suspension(),model=new SoundModel();
    try{
      sim.setType(type);model.sample(sim,STEP);sim.drop(.75);
      let land=0,flow=0,scrub=0;
      for(let k=0;k<960;k++){sim.step();model.sample(sim,STEP);land+=model.drain().filter(e=>e.kind==='land').length;
        flow=Math.max(flow,...model.voices.map(v=>v.flow));scrub=Math.max(scrub,...model.voices.map(v=>v.scrub));}
      assert.ok(land>=4,`${type}: missed wheel landings`);assert.ok(flow>.02,`${type}: no damper sound`);
      if(type!=='solid')assert.ok(scrub>.005,`${type}: missing suspension scrub`);
      results.push({type,land,flow,scrub});
    }finally{sim.free();}
  }
});

test('steady flat-road coasting has no artificial suspension impacts',()=>{
  const sim=new Suspension(),model=new SoundModel();
  try{
    sim.setType('solid');sim.setDriving(true);sim.setInput(1,0);
    for(let k=0;k<2400;k++)sim.step();sim.setInput(0,0);
    for(let k=0;k<480;k++)sim.step();model.sample(sim,STEP);
    let peakFlow=0;
    for(let k=0;k<1200;k++){sim.step();model.sample(sim,STEP);assert.equal(model.drain().length,0);peakFlow=Math.max(peakFlow,...model.voices.map(v=>v.flow));}
    assert.ok(model.voices.every(v=>v.roll>.02));assert.ok(peakFlow<.005,`flat road damper noise ${peakFlow}`);
  }finally{sim.free();}
});

test('DSP silence, bounded mixed output, panning, stale-input fade and reset',()=>{
  const dsp=recordedDSP(24000);assert.equal(render(dsp,.1).energy,0);
  const voice={roll:.2,flow:.12,scrub:.08,squeal:.3,creak:.02,omega:250,speed:80,pan:-.85};
  const frame={voices:[voice],active:true};const result=render(dsp,.5,frame);
  assert.ok(result.energy>1);assert.ok(result.peak<.65);assert.ok(result.l>result.r*8);
  render(dsp,1);assert.ok(render(dsp,.1).peak<.00001,'stalled browser must fade to silence');
  dsp.setFrame({voices:[voice],events:[{wheel:0,kind:'land',strength:1}],active:true});
  dsp.setFrame({active:false,reset:true});render(dsp,.5);assert.ok(render(dsp,.1).peak<.00001);
});

test('quarter speed stretches impact decay and simultaneous hard landings stay bounded',()=>{
  const events=Array.from({length:4},(_,wheel)=>({wheel,kind:'land',strength:1}));
  const normal=recordedDSP(24000),slow=recordedDSP(24000);
  normal.setFrame({events,active:true});slow.setFrame({events,rate:.25,active:true});
  assert.ok(render(normal,.4).peak<.65);assert.ok(render(slow,.4).peak<.65);
  assert.ok(render(slow,.15).energy>render(normal,.15).energy*10);
});

function recordedDSP(sr){const dsp=new VehicleDSP(sr);dsp.setRecordings(audioBank);return dsp;}
