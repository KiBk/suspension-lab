import {engineTorque} from './powertrains.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const RPM=30/Math.PI;

// Reduced torque-converter automatic: launch slip, a torque/power envelope,
// finite shifts and hysteresis. Wheel speeds drive RPM; grip never trims power.
export class Drivetrain {
 constructor(profile,wheelRadius=.34){this.profile=profile;this.wheelRadius=wheelRadius;this.reset();}
 reset(){this.gear=1;this.direction=1;this.rpm=this.profile.idle;this.throttle=0;this.load=0;this.brake=0;this.shiftRemaining=0;this.cooldown=0;this.reverseWait=0;this.wheelTorque=0;this.engaged=false;}
 shift(gear){if(gear===this.gear)return;this.gear=gear;this.shiftRemaining=this.profile.shiftTime;this.cooldown=.85;}
 step(dt,{request=0,speed=0,wheelOmega=0,enabled=true}={}){
  const p=this.profile;this.engaged=enabled;
  this.shiftRemaining=Math.max(0,this.shiftRemaining-dt);this.cooldown=Math.max(0,this.cooldown-dt);
  const wanted=Math.sign(request);let braking=enabled&&wanted!==0&&(wanted!==this.direction||request*speed<-.35);
  // Brake to a stop before engaging the other direction. A held key then
  // reverses; the brake itself can never drive a wheel backwards.
  if(enabled&&wanted&&wanted!==this.direction&&Math.abs(speed)<.45&&Math.abs(wheelOmega)<3){
   this.reverseWait+=dt;
   if(this.reverseWait>.18){this.direction=wanted;this.gear=1;this.cooldown=.85;this.shiftRemaining=p.shiftTime;this.reverseWait=0;braking=false;}
  }else this.reverseWait=0;
  this.brake=braking?Math.abs(request):0;
  const pedal=enabled&&!braking?Math.abs(request):0;
  this.throttle+=(pedal-this.throttle)*(1-Math.exp(-dt/(pedal>this.throttle?.12:.045)));
  if(braking)this.throttle=0;
  const omega=Math.abs(wheelOmega),shaftRPM=omega*RPM*p.finalDrive;
  // Schedule shifts from road speed, while retaining actual wheel RPM for
  // the engine/limiter. A burst of wheelspin must not cause 1–2–1 hunting.
  const scheduleRPM=Math.abs(speed)/this.wheelRadius*RPM*p.finalDrive;
  if(enabled&&this.direction===1&&!this.shiftRemaining){
   const linked=scheduleRPM*p.gears[this.gear-1],up=p.redline*(.44+.48*this.throttle);
   if(this.gear<p.gears.length&&linked>up&&(this.cooldown===0||linked>p.redline))this.shift(this.gear+1);
   else if(this.gear>1&&this.cooldown===0){
    const lower=Math.max(scheduleRPM,shaftRPM)*p.gears[this.gear-2],kick=this.throttle>.7&&linked<p.redline*.5;
    if((linked<p.redline*.25||kick)&&lower<p.redline*(kick?.80:.55))this.shift(this.gear-1);
   }
  }
  const ratio=(this.direction===1?p.gears[this.gear-1]:p.reverse)*p.finalDrive,linked=omega*RPM*ratio;
  const launch=p.idle+(p.launch-p.idle)*this.throttle;
  const target=enabled?Math.max(launch,linked):p.idle;
  // Converter slip at launch; a finite engine response exposes the RPM fall
  // on each gear change rather than snapping the acoustic pitch.
  const response=this.shiftRemaining>0?p.shiftTime*.30:.065;
  this.rpm+=(target-this.rpm)*(1-Math.exp(-dt/response));
  this.rpm=Math.max(p.idle,this.rpm);
  const phase=this.shiftRemaining/p.shiftTime,engagement=this.shiftRemaining>0?1-.8*Math.sin(Math.PI*phase):1;
  const limiter=clamp((p.redline-Math.max(linked,this.rpm))/(p.redline*.035));
  const torque=engineTorque(p,this.rpm)*this.throttle*limiter;
  const multiplication=p.electric?1:1+.35*clamp(1-linked/Math.max(launch,1));
  // Converter torque multiplication must not multiply power. Also covers
  // transient mismatch between engine and turbine speed while shifting.
  const power=torque*this.rpm/RPM*p.efficiency;
  const drive=(p.electric?engineTorque(p,linked)*this.throttle*limiter*ratio*p.efficiency:Math.min(torque*ratio*p.efficiency*multiplication,power/Math.max(omega,.1)))*engagement;
  const overrun=p.peakTorque*(p.electric?.12:.055)*(p.electric?1:clamp((linked-p.idle)/p.redline))*clamp(omega/8)*(1-this.throttle)*ratio*p.efficiency*engagement;
  this.wheelTorque=enabled?this.direction*drive-Math.sign(wheelOmega)*overrun:0;
  this.load+=(this.throttle*engagement*limiter-this.load)*(1-Math.exp(-dt/.055));
  return {wheelTorque:this.wheelTorque,brake:this.brake};
 }
 snapshot(){return {id:this.profile.id,hp:this.profile.hp,rpm:this.rpm,gear:this.engaged?(this.direction<0?'R':String(this.gear)):'N',load:this.load,throttle:this.throttle,shifting:this.shiftRemaining>0,wheelTorque:this.wheelTorque,brake:this.brake};}
}
