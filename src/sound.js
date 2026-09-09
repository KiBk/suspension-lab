import { SoundModel } from './sound-model.js';

export class VehicleAudio {
  constructor(){this.model=new SoundModel();this.enabled=false;this.blocked=false;this.context=null;this.node=null;this.generation=0;}
  async toggle(){
    if(this.enabled){this.enabled=false;this.reset();this.sync();return false;}
    if(!this.context){
      this.context=new AudioContext({latencyHint:'interactive'});
      // Start inside the click, before loading the worklet asynchronously.
      const resumed=this.context.resume();
      await this.context.audioWorklet.addModule(new URL('./sound-worklet.js',import.meta.url));
      this.node=new AudioWorkletNode(this.context,'vehicle-sounds',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      this.gain=this.context.createGain();this.gain.gain.value=0;this.node.connect(this.gain).connect(this.context.destination);
      await resumed;
    }
    this.enabled=true;this.reset();await this.sync();return true;
  }
  reset(){this.model.reset();this.node?.port.postMessage({active:false,reset:true});}
  async sync(){
    const generation=++this.generation,active=this.enabled&&!this.blocked;
    if(!this.context||!this.node)return;
    if(active){
      await this.context.resume();if(generation!==this.generation)return;
      this.gain.gain.setTargetAtTime(1,this.context.currentTime,.025);
    }else{
      this.reset();this.gain.gain.setTargetAtTime(0,this.context.currentTime,.015);
      setTimeout(()=>{if(generation===this.generation)this.context.suspend().catch(()=>{});},90);
    }
  }
  setBlocked(blocked){if(this.blocked===blocked)return;this.blocked=blocked;this.reset();this.sync().catch(()=>{});}
  sample(sim,dt){if(this.enabled&&!this.blocked)this.model.sample(sim,dt);}
  render(frame,camera,right,rate){
    if(!this.enabled||this.blocked||!this.node)return;
    const distance=Math.hypot(camera.x-frame.position.x,camera.y-frame.position.y,camera.z-frame.position.z);
    const gain=Math.max(.65,Math.min(1.2,Math.sqrt(9/Math.max(distance,1))));
    const voices=this.model.voices.map((voice,i)=>{
      const p=frame.wheels[i].position,c=frame.position;
      return {...voice,pan:Math.max(-.85,Math.min(.85,((p.x-c.x)*right.x+(p.y-c.y)*right.y+(p.z-c.z)*right.z)/2.5)),gain};
    });
    this.node.port.postMessage({voices,events:this.model.drain(),rate,active:true});
  }
  async dispose(){this.enabled=false;++this.generation;this.node?.disconnect();await this.context?.close();this.context=null;this.node=null;}
}
