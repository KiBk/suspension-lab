// Schematic front-view linkages. Lengths stay fixed; input is wheel height.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lowerPivot={x:.10,y:-.30};
const upperPivot={x:.22,y:-.03};
const lowerLength=.95, upperLength=.80, uprightLength=.36;
export function bodyPoint(p, body) {
  const cp=Math.cos(body.pitch),sp=Math.sin(body.pitch),cr=Math.cos(body.roll),sr=Math.sin(body.roll);
  const v=p.x*sr+p.y*cr;
  return {x:p.x*cr-p.y*sr,y:body.y+v*cp-p.z*sp,z:v*sp+p.z*cp};
}
function pose(type,angle) {
  const lower={x:lowerPivot.x+lowerLength*Math.cos(angle),y:lowerPivot.y+lowerLength*Math.sin(angle)};
  let upper,top;
  if(type==='wishbone') {
    const dx=lower.x-upperPivot.x,dy=lower.y-upperPivot.y,d=Math.hypot(dx,dy);
    if(d>upperLength+uprightLength||d<Math.abs(upperLength-uprightLength))return null;
    const a=(upperLength**2-uprightLength**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,upperLength**2-a*a));
    upper={x:upperPivot.x+a*dx/d-h*dy/d,y:upperPivot.y+a*dy/d+h*dx/d};
    top=upperPivot;
  }else{
    top={x:.93,y:.14};const d=distance(top,lower);
    upper={x:lower.x+(top.x-lower.x)/d*uprightLength,y:lower.y+(top.y-lower.y)/d*uprightLength};
  }
  const hub={x:(lower.x+upper.x)/2,y:(lower.y+upper.y)/2};
  return {lower,upper,hub,lowerPivot,upperPivot,top};
}
export function independentLinkage(type, wheelY, body, side, z) {
  const toWorld=p=>bodyPoint({x:p.x*side,y:p.y,z},body);
  let lo=-1.03,hi=.30,result;
  // All four-bar configurations within this travel interval are on one branch.
  for(let j=0;j<28;j++) {
    const mid=(lo+hi)/2,candidate=pose(type,mid);
    if(!candidate){lo=mid;continue;}
    result=candidate;
    if(toWorld(candidate.hub).y<wheelY)lo=mid;else hi=mid;
  }
  const world=Object.fromEntries(Object.entries(result).map(([key,p])=>[key,toWorld(p)]));
  return {...world,camber:Math.atan2(-(world.upper.x-world.lower.x),world.upper.y-world.lower.y),local:result};
}
