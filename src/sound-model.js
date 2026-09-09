// Observes the existing simulation; sound never feeds forces back into it.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export class SoundModel {
  constructor(){this.reset();}
  reset(){this.previous=[];this.events=[];this.voices=[];this.engine=null;this.world=null;}
  sample(sim,dt){
    if(this.world!==sim.world){this.reset();this.world=sim.world;}
    this.engine=sim.drivetrain?.snapshot()??null;
    const surface=sim.surface,wet=surface==='wet',ice=surface==='ice';
    this.voices=sim.tyres.map((t,i)=>{
      const s=sim.springs.find(s=>s.index===i),length=s.length??s.rest;
      const velocity=s.velocity??0,travel=Math.abs(velocity);
      const contact=!!t.contact&&t.load>50,load=contact?Math.pow(clamp(t.load/3800,0,2),.55):0;
      const speed=Math.hypot(t.longitudinal??0,t.lateral??0);
      const tread=t.omega*sim.radius,longitudinal=t.longitudinal??0,longSlip=Math.abs(tread-longitudinal);
      const slipRatio=longSlip/Math.max(Math.abs(tread),Math.abs(longitudinal),1.5);
      // Ordinary traction needs a little longitudinal slip. At motorway speed
      // its absolute velocity can look large without being an audible skid.
      // Keep lateral suspension scrub; gate only the longitudinal contribution.
      const longSliding=smooth(.04,.12,slipRatio)*smooth(.55,.9,t.usage);
      const slip=Math.hypot(longSlip*longSliding,t.lateral??0);
      // Preserve low-speed suspension scrub on landing. Once genuinely sliding
      // along the road, keep this noisy friction layer beneath the recorded skid.
      const scrub=smooth(.025,.7,slip)*load*(1-.82*smooth(2,7,speed));
      const sliding=smooth(.35,3.5,slip)*smooth(.55,.98,t.usage)*load;
      const previous=this.previous[i];
      if(previous){
        previous.cooldown=Math.max(0,previous.cooldown-dt);
        if(contact&&!previous.contact&&previous.airtime>.045&&previous.fall>.25){
          this.events.push({wheel:i,kind:'land',strength:clamp((previous.fall-.2)/5)**.65});
        }
        const bottom=length<s.min+.018,top=length>s.max-.018;
        if(previous.cooldown===0&&((bottom&&!previous.bottom&&velocity<-.35)||(top&&!previous.top&&velocity>.45))){
          this.events.push({wheel:i,kind:bottom?'bump':'droop',strength:clamp((travel-.25)/3.5)**.6});
          previous.cooldown=.16;
        }
        Object.assign(previous,{contact,bottom,top,airtime:contact?0:previous.airtime+dt,fall:contact?0:Math.max(0,-(t.verticalSpeed??0))});
      }else this.previous[i]={contact,bottom:length<s.min+.018,top:length>s.max-.018,airtime:0,fall:0,cooldown:0};
      return {
        roll:load*smooth(.15,1.2,speed)*Math.pow(clamp(speed/32,0,1.65),.72)*(ice?.035:wet?.10:.085),
        speed,omega:Math.abs(t.omega),blocks:sim.type==='baja'?43:67,
        roughness:sim.type==='baja'?1.4:1,wet:wet?1:0,
        flow:.052*Math.pow(clamp(travel-.018,0,3.5),.65)*(s.bypass?1.12:1),
        compression:velocity<0?1:0,
        creak:.012*smooth(.025,.16,travel)*(1-smooth(.5,1.6,travel)),
        scrub:scrub*(ice?.006:wet?.021:.037),
        squeal:sliding*(ice?.006:wet?.055:.15),
        pan:0,gain:1,
      };
    });
    // Long stalls must not build up a burst of old impacts.
    if(this.events.length>32)this.events.splice(0,this.events.length-32);
  }
  drain(){const events=this.events;this.events=[];return events;}
}
