// Illustrative transient brush tyre: load-sensitive grip, lateral saturation,
// wheel inertia and a combined-slip friction circle. Parameters are not fitted
// to a particular tyre. Rapier supplies the contact patch and normal load.
export const NOMINAL_LOAD=3600, TYRE_MU=.95;
export const SURFACES={dry:{name:'Dry',grip:1},wet:{name:'Wet',grip:.60},ice:{name:'Ice',grip:.12}};
// Contact-only hysteresis loss represented as an opposing force at the hub.
// Smooth through zero to avoid a sign-flipping force or artificial reversing.
export function rollingResistance(speed,load,coefficient=.012){
  return load>0?-coefficient*load*Math.tanh(speed/.2):0;
}
export function gripLimit(load,grip=1){return load>0?grip*TYRE_MU*load*Math.pow(Math.max(.15,load/NOMINAL_LOAD),-.08):0;}
export function brushLateral(slip,load,grip=1){
  const limit=gripLimit(load,grip);if(!limit)return 0;
  const stiffness=48000*Math.pow(load/NOMINAL_LOAD,.85),t=Math.tan(Math.max(-1.4,Math.min(1.4,slip)));
  const u=Math.min(1,stiffness*Math.abs(t)/(3*limit));
  return -Math.sign(t)*limit*(3*u-3*u*u+u*u*u);
}
export function tyreStep(state,{load,longitudinal,lateral,torque,radius,dt,grip=1}){
  const inertia=2.1,limit=gripLimit(load,grip);
  const alpha=Math.atan2(lateral,Math.max(Math.abs(longitudinal),1.5));
  state.slip+=(alpha-state.slip)*(1-Math.exp(-dt*Math.max(Math.abs(longitudinal),1.5)/.35));
  if(!limit){state.omega+=dt*torque/inertia;state.slip=0;return{longitudinal:0,lateral:0,limit:0,usage:0,slip:0};}
  const fy=brushLateral(state.slip,load,grip),stiffness=65000*Math.pow(load/NOMINAL_LOAD,.85);
  // Implicit wheel-speed solve keeps the stiff low-speed slip response stable.
  const trial=fx=>{
    const omega=state.omega+dt*(torque-radius*fx)/inertia;
    const tread=omega*radius,slip=(tread-longitudinal)/Math.max(Math.abs(longitudinal),Math.abs(tread),1.5);
    const raw=limit*Math.tanh(stiffness*slip/limit),scale=Math.max(1,Math.hypot(raw,fy)/limit);
    return{fx:raw/scale,fy:fy/scale};
  };
  let low=-limit,high=limit;
  for(let n=0;n<20;n++){const mid=(low+high)/2;if(mid>trial(mid).fx)high=mid;else low=mid;}
  const fx=(low+high)/2,result=trial(fx);state.omega+=dt*(torque-radius*fx)/inertia;
  return{longitudinal:fx,lateral:result.fy,limit,usage:Math.hypot(fx,result.fy)/limit,slip:state.slip};
}
