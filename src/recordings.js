// Local, attributed recordings shared by the browser worklet and offline renders.
export function decodeLoop(buffer){
 const view=new DataView(buffer),text=(p,n)=>String.fromCharCode(...new Uint8Array(buffer,p,n));
 if(view.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw Error('Invalid audio recording');
 let sampleRate=0,data=null;
 for(let p=12;p+8<=view.byteLength;){
  const kind=text(p,4),size=view.getUint32(p+4,true),start=p+8;
  if(start+size>view.byteLength)throw Error('Truncated audio recording');
  if(kind==='fmt '){
   if(size<16||view.getUint16(start,true)!==1||view.getUint16(start+2,true)!==1||view.getUint16(start+14,true)!==16)throw Error('Expected mono PCM16 recording');
   sampleRate=view.getUint32(start+4,true);
  }
  if(kind==='data')data={start,size};p=start+size+(size%2);
 }
 if(!sampleRate||!data||data.size<4||data.size%2)throw Error('Empty audio recording');
 const samples=new Float32Array(data.size/2);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(data.start+i*2,true)/32768;
 return {sampleRate,samples};
}
export async function loadRecordings(read=async url=>{
 const response=await fetch(url);if(!response.ok)throw Error(`Audio recording unavailable (${response.status})`);return response.arrayBuffer();
},base=new URL('./assets/audio/',import.meta.url)){
 const manifest=JSON.parse(new TextDecoder().decode(await read(new URL('manifest.json',base))));
 const entries=await Promise.all(manifest.loops.map(async row=>[row.id,{...decodeLoop(await read(new URL(row.file,base))),rpm:row.rpm}]));
 return Object.fromEntries(entries);
}
export class RecordingLoop {
 constructor(recording,sampleRate,offset=0){this.recording=recording;this.sr=sampleRate;this.position=(recording?.samples.length??0)*offset;}
 tick(speed=1){
  const r=this.recording;if(!r)return 0;
  const a=r.samples,n=a.length,p=this.position,i=Math.floor(p),f=p-i;
  const out=a[i]+(a[(i+1)%n]-a[i])*f;
  this.position=(p+r.sampleRate/this.sr*speed)%n;return out;
 }
}
