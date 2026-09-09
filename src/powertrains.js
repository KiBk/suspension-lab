// Representative engines for fictional bodies. hp is mechanical horsepower,
// measured at the crank; gearing/efficiency determine what reaches the tyres.
export const HP_WATTS=745.699872;
const gears={four:[2.84,1.55,1,.70],five:[3.54,2.26,1.47,1,.75],six:[4.15,2.37,1.56,1.16,.86,.67],eight:[4.71,3.14,2.11,1.67,1.29,1,.84,.67],sport:[3.91,2.29,1.65,1.30,1.08,.88,.72]};
const curves={
 petrol:[[0,.45],[.15,.56],[.35,.80],[.60,.99],[.72,1],[.9,.92],[1,.77],[1.08,0]],
 turbo:[[0,.4],[.15,.55],[.30,1],[.60,1],[.78,.90],[.92,.78],[1,.65],[1.08,0]],
 diesel:[[0,.4],[.18,.55],[.36,1],[.57,1],[.76,.83],[.9,.67],[1,.52],[1.08,0]],
 sport:[[0,.4],[.12,.5],[.35,.72],[.62,.92],[.82,1],[.95,.92],[1,.81],[1.08,0]],
};
const definitions={
 compact:{label:'1.2 L inline-three',hp:85,cylinders:3,litres:1.2,curve:'petrol',idle:850,redline:6400,gears:gears.four,finalDrive:4.10,launch:2300,shiftTime:.38,dragArea:.62,tone:{body:135,intake:430,bright:.40,uneven:.13,gain:.068}},
 hatchback:{label:'1.6 L inline-four',hp:135,cylinders:4,litres:1.6,curve:'petrol',idle:780,redline:6600,gears:gears.six,finalDrive:3.85,launch:2400,shiftTime:.30,dragArea:.66,tone:{body:150,intake:480,bright:.35,uneven:.05,gain:.064}},
 sedan:{label:'Electric · single motor',hp:300,cylinders:0,litres:0,curve:'electric',electric:true,peakTorque:410,idle:0,redline:16000,gears:[1],finalDrive:9.1,launch:0,shiftTime:.20,dragArea:.64,tone:{gain:.028}},
 wagon:{label:'2.0 L turbo inline-four',hp:180,cylinders:4,litres:2,curve:'turbo',idle:760,redline:6200,gears:gears.eight,finalDrive:3.10,launch:2100,shiftTime:.30,dragArea:.72,tone:{body:125,intake:360,bright:.25,uneven:.04,gain:.059}},
 coupe:{label:'3.0 L inline-six',hp:300,cylinders:6,litres:3,curve:'petrol',idle:780,redline:7000,gears:gears.eight,finalDrive:3.46,launch:2600,shiftTime:.24,dragArea:.62,tone:{body:105,intake:450,bright:.55,uneven:.04,gain:.076}},
 sports:{label:'4.0 L flat-six',hp:420,cylinders:6,litres:4,curve:'sport',idle:950,redline:8200,gears:gears.sport,finalDrive:3.44,launch:3100,shiftTime:.16,dragArea:.60,tone:{body:155,intake:590,bright:.80,uneven:.09,gain:.082}},
 minivan:{label:'2.0 L turbodiesel',hp:170,cylinders:4,litres:2,curve:'diesel',idle:780,redline:4600,gears:gears.six,finalDrive:3.05,launch:1900,shiftTime:.38,dragArea:.91,tone:{body:105,intake:310,bright:.22,uneven:.14,diesel:true,gain:.063}},
 suv:{label:'3.5 L V6',hp:300,cylinders:6,litres:3.5,curve:'petrol',idle:700,redline:6400,gears:gears.eight,finalDrive:3.55,launch:2400,shiftTime:.34,dragArea:1.02,tone:{body:92,intake:340,bright:.35,uneven:.08,gain:.073}},
 pickup:{label:'4.7 L V8',hp:240,cylinders:8,litres:4.7,curve:'petrol',idle:650,redline:5300,gears:gears.five,finalDrive:3.73,launch:2000,shiftTime:.44,dragArea:1.12,tone:{body:78,intake:280,bright:.32,uneven:.21,v8:true,gain:.080}},
 offroad:{label:'2.8 L turbodiesel',hp:160,cylinders:4,litres:2.8,curve:'diesel',idle:730,redline:4500,gears:gears.four,finalDrive:3.73,launch:1800,shiftTime:.46,dragArea:1.05,tone:{body:88,intake:260,bright:.27,uneven:.18,diesel:true,gain:.074}},
};
function interpolate(points,rpm){
 for(let i=1;i<points.length;i++)if(rpm<=points[i][0]){const [x,a]=points[i-1],[y,b]=points[i];return a+(b-a)*Math.max(0,(rpm-x)/(y-x));}
 return 0;
}
export const POWERTRAINS=Object.fromEntries(Object.entries(definitions).map(([id,p])=>{
 if(p.electric)return [id,{...p,id,efficiency:.94,reverse:1}];
 const shape=curves[p.curve].map(([r,t])=>[r*p.redline,t]);let peak=0;
 for(let rpm=0;rpm<=p.redline;rpm++)peak=Math.max(peak,interpolate(shape,rpm)*rpm*Math.PI/30);
 const scale=p.hp*HP_WATTS/peak,torqueCurve=shape.map(([r,t])=>[r,t*scale]);
 return [id,{...p,id,torqueCurve,peakTorque:scale,efficiency:.90,reverse:3.1}];
}));
export const engineTorque=(profile,rpm)=>profile.electric?Math.min(profile.peakTorque,profile.hp*HP_WATTS/Math.max(1,rpm*Math.PI/30)):Math.max(0,interpolate(profile.torqueCurve,rpm));
