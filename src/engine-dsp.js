import {POWERTRAINS} from './powertrains.js';
const TAU=2*Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
class Resonator {
 constructor(){this.a=0;this.b=0;}
 tune(hz,q,sr){const w=TAU*clamp(hz,20,sr*.4)/sr,r=Math.sin(w)/(2*q),a=1+r;this.b0=r/a;this.a1=-2*Math.cos(w)/a;this.a2=(1-r)/a;}
 tick(x){const out=this.b0*x+this.a;this.a=-this.a1*out+this.b;this.b=-this.b0*x-this.a2*out;return out;}
}

// Combustion excites a muffled exhaust and intake, once per cylinder per two
// crank revolutions. Each bank has its own pulse strength; tiny cycle variation
// avoids a static synthesizer drone. No broadband wind/engine noise bed.
export class EngineDSP {
 constructor(sampleRate){
  this.sr=sampleRate;this.id=null;this.phase=0;this.clock=0;this.rpm=0;this.load=0;this.level=0;this.pan=0;this.gain=1;
  this.exhaust=new Resonator();this.intake=new Resonator();this.block=new Resonator();
  this.low=0;this.soft=0;this.pulse=0;this.attack=0;this.cylinder=0;this.seed=287431;this.variation=1;this.motorPhase=0;
 }
 noise(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return (x>>>0)/2147483648-1;}
 prepare(frame,active,rate){
  this.target=frame;this.profile=POWERTRAINS[frame?.id];this.rate=rate;
  if(this.profile&&this.id!==frame.id){this.id=frame.id;this.rpm=frame.rpm;this.pulse=this.attack=this.low=this.soft=this.level=0;this.exhaust=new Resonator();this.intake=new Resonator();this.block=new Resonator();}
  this.active=active&&!!this.profile;
  const p=this.profile;if(!p)return;
  const tone=p.tone,rpm=clamp(this.rpm,0,p.redline*1.15);
  if(!p.electric){
   this.exhaust.tune((tone.body+rpm*.011)*rate,.8,this.sr);
   this.intake.tune((tone.intake+rpm*.025)*rate,1.1,this.sr);
   this.block.tune((tone.diesel?820:620)*rate,1.3,this.sr);
  }
  this.smooth=1-Math.exp(-1/(this.sr*.025));this.step=rate/this.sr;
  this.lowA=1-Math.exp(-TAU*(p.electric?3500:750+tone.bright*1000+this.load*500)*this.step);
  this.decay=Math.exp(-this.step/.0035);this.attackA=1-Math.exp(-this.step/.0007);
 }
 tick(){
  const p=this.profile;if(!p)return 0;
  const t=this.target,s=this.smooth;
  this.rpm+=(clamp(t.rpm,0,p.redline*1.15)-this.rpm)*s;this.load+=(clamp(t.load??0,0,1)-this.load)*s;
  this.level+=((this.active?1:0)-this.level)*s;this.pan+=((t.pan??0)-this.pan)*s;this.gain+=((t.gain??1)-this.gain)*s;
  let out;
  if(p.electric){
   // A quiet loaded motor/gear whine. No idle loop and no simulated exhaust.
   this.motorPhase=(this.motorPhase+Math.min(2200,this.rpm/60*4)*this.step)%1;
   const moving=clamp(this.rpm/650,0,1),effort=.16+.84*this.load;
   out=(Math.sin(TAU*this.motorPhase)+.16*Math.sin(TAU*this.motorPhase*2))*moving*effort*p.tone.gain;
  }else{
   const tone=p.tone,flutter=1+.0025*Math.sin(this.clock*TAU*7.3)+.0015*Math.sin(this.clock*TAU*11.9);
   this.phase+=this.rpm/120*p.cylinders*this.step*flutter;
   if(this.phase>=1){
    this.phase%=1;this.cylinder=(this.cylinder+1)%p.cylinders;
    // Unequal bank spacing at a cross-plane V8 collector gives a low burble;
    // other layouts retain even firing with much smaller cylinder variation.
    const bank=tone.v8?[1,.72,.86,1.14,.72,1.1,1,.83][this.cylinder]:1+tone.uneven*Math.cos(TAU*this.cylinder/p.cylinders);
    this.variation=.97+.03*this.noise();this.pulse+=bank*this.variation;
   }
   this.pulse*=this.decay;this.attack+=(this.pulse-this.attack)*this.attackA;
   const source=this.attack,exhaust=this.exhaust.tick(source),intake=this.intake.tick(source),block=this.block.tick(source*(1+.055*this.noise()));
   const fullness=.28+.72*Math.pow(this.load,.65),rev=.85+.15*clamp(this.rpm/p.redline,0,1);
   out=(exhaust*3.8+intake*(.45+tone.bright*this.load)*1.4+block*(tone.diesel?.30:.035))*tone.gain*fullness*rev;
  }
  this.low+=(out-this.low)*this.lowA;this.soft+=(this.low-this.soft)*this.lowA;this.clock+=this.step;
  return this.soft*this.level*this.gain;
 }
}
