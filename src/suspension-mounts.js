// Metres in the imported body coordinate system (before the small ride lift).
// Heights were reviewed against each model's bonnet, inner wing and rear deck.
// These are plausible packages for fictional cars, not OEM hard-point data.
// inset is measured inward from the corresponding wheel centre; z is an offset
// from that axle. Separate rear springs sit on an arm, shocks on the upright.
export const SUSPENSION_MOUNTS = {
 compact:  {front:{height:.84,inset:.21}, rear:{height:.88,inset:.18,z:-.06,springHeight:.56,springInset:.24,springZ:.14}},
 hatchback:{front:{height:.93,inset:.24}, rear:{height:1.01,inset:.21,z:-.07,springHeight:.64,springInset:.28,springZ:.14}},
 sedan:    {front:{height:.905,inset:.26},rear:{height:.97,inset:.23,z:-.10,springHeight:.67,springInset:.35}},
 wagon:    {front:{height:.91,inset:.26}, rear:{height:.97,inset:.24,z:-.10,springHeight:.70,springInset:.35}},
 coupe:    {front:{height:.86,inset:.28}, rear:{height:.83,inset:.26,z:-.10,springHeight:.62,springInset:.36}},
 sports:   {front:{height:.69,inset:.30}, rear:{height:.76,inset:.30,coilover:true}},
 minivan:  {front:{height:1.14,inset:.28}, rear:{height:1.07,inset:.26,z:-.08,springHeight:.70,springInset:.34,springZ:.16}},
 suv:      {front:{height:1.20,inset:.32}, rear:{height:1.20,inset:.33,z:-.10,springHeight:.82,springInset:.39}},
 pickup:   {front:{height:1.20,inset:.32}, rear:{height:.90,inset:.31,z:.24,springHeight:.80,springInset:.246}},
 offroad:  {front:{height:1.10,inset:.28,z:.15,springHeight:1.00,springInset:.29},rear:{height:1.10,inset:.28,z:-.16,springHeight:.93,springInset:.29}},
};

export function suspensionMount(cfg, index) {
 const p=SUSPENSION_MOUNTS[cfg.id][index<2?'front':'rear'];
 const wheel=cfg.wheels[index],sign=Math.sign(wheel.position[0]);
 return {...p,top:{x:wheel.position[0]-sign*p.inset,y:p.height+cfg.lift-cfg.ride,z:wheel.position[2]+(p.z??0)}};
}
