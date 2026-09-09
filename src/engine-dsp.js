import {POWERTRAINS} from './powertrains.js';
import {RecordingLoop} from './recordings.js';
const TAU=2*Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Representative recorded families; the bodies are fictional, so these are
// sound-design mappings, not claims of exact production-engine acoustics.
export const ENGINE_RECORDINGS={
 compact:{family:'petrol',pitch:.92,gain:.105,cutoff:1500},
 hatchback:{family:'petrol',pitch:1,gain:.11,cutoff:1750},
 wagon:{family:'petrol',pitch:.95,gain:.12,cutoff:1600},
 coupe:{family:'sports',pitch:.97,gain:.12,cutoff:1900},
 sports:{family:'sports',pitch:1,gain:.135,cutoff:2300},
 minivan:{family:'diesel',pitch:1,gain:.12,cutoff:1500},
 suv:{family:'petrol',pitch:.85,gain:.125,cutoff:1400},
 pickup:{family:'v8',pitch:.93,gain:.135,cutoff:1400},
 offroad:{family:'diesel',pitch:.94,gain:.13,cutoff:1400},
};
export class EngineDSP {
 constructor(sampleRate){
  this.sr=sampleRate;this.bank={};this.id=null;this.rpm=0;this.load=0;this.level=0;this.pan=0;this.gain=1;
  this.low=0;this.soft=0;this.motorPhase=0;this.players=[];
 }
 setRecordings(bank){this.bank=bank;this.id=null;}
 prepare(frame,active,rate){
  this.target=frame;this.profile=POWERTRAINS[frame?.id];this.rate=rate;
  const p=this.profile;if(!p)return;
  if(this.id!==frame.id){
   this.id=frame.id;this.rpm=frame.rpm;this.load=frame.load??0;this.low=this.soft=this.level=0;
   this.voice=ENGINE_RECORDINGS[frame.id];
   this.players=Object.entries(this.bank).filter(([id])=>id.startsWith(`${this.voice?.family}-`))
    .map(([,recording])=>({rpm:recording.rpm,loop:new RecordingLoop(recording,this.sr)})).sort((a,b)=>a.rpm-b.rpm);
  }
  this.active=active&&(p.electric||this.players.length>0);
  this.smooth=1-Math.exp(-1/(this.sr*.035));this.step=rate/this.sr;
  const cutoff=p.electric?3500:this.voice.cutoff*(.7+.3*this.load);
  this.lowA=1-Math.exp(-TAU*cutoff*this.step);
 }
 tick(){
  const p=this.profile;if(!p)return 0;
  const t=this.target,s=this.smooth;
  this.rpm+=(clamp(t.rpm,0,p.redline*1.15)-this.rpm)*s;this.load+=(clamp(t.load??0,0,1)-this.load)*s;
  this.level+=((this.active?1:0)-this.level)*s;this.pan+=((t.pan??0)-this.pan)*s;this.gain+=((t.gain??1)-this.gain)*s;
  let out=0;
  if(p.electric){
   // Preserve the subdued motor layer: no combustion recording at EV idle.
   this.motorPhase=(this.motorPhase+Math.min(2200,this.rpm/60*4)*this.step)%1;
   out=(Math.sin(TAU*this.motorPhase)+.16*Math.sin(TAU*this.motorPhase*2))*clamp(this.rpm/650,0,1)*(.16+.84*this.load)*p.tone.gain;
  }else if(this.players.length){
   const rpm=Math.max(1,this.rpm*this.voice.pitch),players=this.players;
   let lo=0;while(lo<players.length-1&&rpm>players[lo+1].rpm)lo++;
   const hi=Math.min(lo+1,players.length-1),a=players[lo],b=players[hi];
   // Equal-power crossfades between adjacent RPM recordings avoid the thin,
   // exaggerated pitch shift of stretching one idle sample across the rev range.
   const blend=lo===hi?0:clamp(Math.log(rpm/a.rpm)/Math.log(b.rpm/a.rpm),0,1);
   for(let i=0;i<players.length;i++){
    const v=players[i],value=v.loop.tick(clamp(rpm/v.rpm,.35,2.2)*this.rate);
    if(i===lo)out+=value*Math.cos(blend*Math.PI/2);
    else if(i===hi)out+=value*Math.sin(blend*Math.PI/2);
   }
   // Loading changes presence gently; it never adds a broadband throttle hiss.
   out*=this.voice.gain*(.32+.68*Math.pow(this.load,.65))*(.9+.1*clamp(this.rpm/p.redline,0,1));
  }
  this.low+=(out-this.low)*this.lowA;this.soft+=(this.low-this.soft)*this.lowA;
  return this.soft*this.level*this.gain;
 }
}
