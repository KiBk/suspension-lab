// Shared by the AudioWorklet and offline listening/regression renders.
import {EngineDSP} from './engine-dsp.js';
import {RecordingLoop} from './recordings.js';
// Four independent, noise-excited voices: rubber, tread, oil flow and mounts.
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const gainKeys=['roll','flow','creak','scrub','squeal'];
class Noise {
  constructor(seed){this.seed=seed;}
  next(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return (x>>>0)/2147483648-1;}
}
class Band {
  constructor(){this.z1=0;this.z2=0;}
  tune(hz,q,sr){const w=TAU*clamp(hz,15,sr*.42)/sr,alpha=Math.sin(w)/(2*q),a=1+alpha;
    this.b0=alpha/a;this.b2=-this.b0;this.a1=-2*Math.cos(w)/a;this.a2=(1-alpha)/a;
  }
  tick(x){const y=this.b0*x+this.z1;this.z1=-this.a1*y+this.z2;this.z2=this.b2*x-this.a2*y;return y;}
}
const quiet=()=>({roll:0,speed:0,omega:0,blocks:67,roughness:1,wet:0,flow:0,compression:0,creak:0,scrub:0,squeal:0,pan:0,gain:1});
export class VehicleDSP {
  constructor(sampleRate=48000){
    this.sampleRate=sampleRate;this.rate=1;this.active=false;this.age=0;this.clock=0;
    this.voices=Array.from({length:4},(_,i)=>({
      target:quiet(),value:quiet(),noise:new Noise(73421+i*19237),pink:0,air:0,grain:0,
      suspensionLow:0,suspensionSoft:0,mountNoise:0,rollingLow:0,
      tread:0,pitch:1,treadStrength:0,flow:new Band(),rubber:new Band(),creak:new Band(),
      skid:null,events:[],
    }));
    this.dc=[0,0];this.last=[0,0];
    this.engine=new EngineDSP(sampleRate);this.engineFrame=null;
  }
  setRecordings(bank){
    this.engine.setRecordings(bank);
    this.voices.forEach((v,i)=>{v.skid=new RecordingLoop(bank['tyre-skid'],this.sampleRate,i*.237);});
  }
  setFrame({voices=[],events=[],engine=null,rate=1,active=true,reset=false}){
    this.age=0;this.rate=clamp(rate,.25,1);this.active=active;
    if(engine)this.engineFrame=engine;
    else if(active)this.engineFrame=null;
    for(let i=0;i<4;i++){
      const v=this.voices[i];v.target={...quiet(),...voices[i]};
      if(reset||!active)v.events=[];
    }
    if(active)for(const e of events){
      if(!Number.isInteger(e.wheel)||e.wheel<0||e.wheel>3||!Number.isFinite(e.strength))continue;
      const v=this.voices[e.wheel];if(v.events.length<8)v.events.push({...e,strength:clamp(e.strength,0,1),time:0,variation:1+v.noise.next()*.09});
    }
  }
  process(left,right){
    const sr=this.sampleRate,rate=this.rate,step=rate/sr,smooth=1-Math.exp(-1/(sr*.025));
    const suspensionSmooth=1-Math.exp(-step/.055),suspensionA=1-Math.exp(-TAU*420*step),mountA=1-Math.exp(-TAU*160*step);
    const rollingA=1-Math.exp(-TAU*550*step);
    const active=this.active&&this.age<sr*.3;
    const pinkA=1-Math.exp(-TAU*450*rate/sr),airA=1-Math.exp(-TAU*3000*rate/sr),treadDecay=Math.exp(-step/.0018);
    const skidSmooth=1-Math.exp(-1/(sr*.11));
    const skidMix=1/Math.sqrt(Math.max(1,this.voices.reduce((sum,v)=>sum+clamp(v.target.squeal/.15,0,1),0)));
    const dcA=Math.exp(-TAU*24/sr);
    this.engine.prepare(this.engineFrame,active,rate);
    for(let i=0;i<4;i++){
      const v=this.voices[i],t=v.target;
      // Muted oil movement inside the damper, without a bright exposed hiss.
      v.flow.tune((t.compression?340:260)*rate,.6,sr);
      v.rubber.tune((220+Math.min(t.speed,60)*5)*rate,.85,sr);
      v.creak.tune((115+i*9)*rate,.65,sr);
      // Retain the established random sequence for rolling, suspension and
      // impact textures when replacing the former generated squeal bands.
      v.noise.next();
    }
    for(let n=0;n<left.length;n++){
      let l=0,r=0;
      for(const v of this.voices){
        const a=v.value,t=v.target;
        for(const key of gainKeys)a[key]+=((active?t[key]:0)-a[key])*(key==='flow'||key==='creak'?suspensionSmooth:key==='squeal'&&active?skidSmooth:smooth);
        a.pan+=(t.pan-a.pan)*smooth;a.gain+=(t.gain-a.gain)*smooth;
        const noise=v.noise.next();v.pink+=(noise-v.pink)*pinkA;
        v.air+=(noise-v.air)*airA;
        // Unequal tread pitches prevent a coherent engine-like harmonic drone.
        v.tread+=t.omega/TAU*t.blocks*step;
        if(v.tread>=v.pitch){v.tread%=v.pitch;v.pitch=.82+(v.noise.next()+1)*.18;v.treadStrength=.45+v.noise.next()*.35;}
        v.grain+=(v.treadStrength-v.grain)*.07;v.treadStrength*=treadDecay;
        const rubber=v.rubber.tick(noise),flow=v.flow.tick(noise),creak=v.creak.tick(noise);
        // Rolling is a restrained background texture. Reduce the bright
        // air-pumping hiss separately, then soften and lower the whole layer.
        const rolling=a.roll*.25*(2.1*v.pink+.025*v.air*(1+t.wet)+rubber*v.grain*2.8*t.roughness);
        v.rollingLow+=(rolling-v.rollingLow)*rollingA;
        let out=v.rollingLow;
        // Quiet, low-passed mechanical texture beneath the tyre mix.
        // Two gentle poles remove the papery/crinkling high-frequency component.
        const suspension=a.flow*flow*.8+a.creak*creak*.45;
        v.suspensionLow+=(suspension-v.suspensionLow)*suspensionA;
        v.suspensionSoft+=(v.suspensionLow-v.suspensionSoft)*suspensionA;
        v.mountNoise+=(noise-v.mountNoise)*mountA;
        out+=v.suspensionSoft;
        out+=a.scrub*(rubber*2.8+v.pink*.6);
        out+=a.squeal*(v.skid?.tick(rate*(.94+v.target.pan*.035))??0)*.30*skidMix;
        for(let j=v.events.length-1;j>=0;j--){
          const e=v.events[j],land=e.kind==='land',bump=e.kind==='bump',time=e.time;
          const decay=land?.085:bump?.024:.016,attack=1-Math.exp(-time/(land?.002:.004));
          const env=attack*Math.exp(-time/decay),f=(land?68:bump?75:115)*e.variation;
          if(land){
            const body=Math.sin(TAU*f*time)+.42*Math.sin(TAU*f*1.71*time)+.18*Math.sin(TAU*f*3.19*time);
            out+=e.strength*env*(.095*body+.17*rubber);
          }else{
            // Rubber travel stops: a short soft tap, with no metallic overtones.
            out+=e.strength*env*(.024*Math.sin(TAU*f*time)+.06*v.mountNoise);
          }
          e.time+=step;if(e.time>decay*8)v.events.splice(j,1);
        }
        const pan=clamp(a.pan,-1,1),gain=a.gain;
        l+=out*Math.sqrt((1-pan)*.5)*gain;r+=out*Math.sqrt((1+pan)*.5)*gain;
      }
      const engine=this.engine.tick(),enginePan=clamp(this.engine.pan,-1,1);
      l+=engine*Math.sqrt((1-enginePan)*.5);r+=engine*Math.sqrt((1+enginePan)*.5);
      // Remove DC/subsonics and leave generous headroom for simultaneous landings.
      for(let c=0;c<2;c++){
        const x=c?r:l,y=x-this.last[c]+dcA*this.dc[c];this.last[c]=x;this.dc[c]=y;
        const output=.65*Math.tanh(y/.65);if(c)right[n]=output;else left[n]=output;
      }
      this.clock+=step;
    }
    this.age+=left.length;
  }
}
