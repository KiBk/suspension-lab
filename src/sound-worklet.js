import { VehicleDSP } from './sound-dsp.js';
class VehicleProcessor extends AudioWorkletProcessor {
  constructor(){super();this.dsp=new VehicleDSP(sampleRate);this.port.onmessage=e=>{if(e.data.type==='recordings')this.dsp.setRecordings(e.data.bank);else this.dsp.setFrame(e.data);};}
  process(inputs,outputs){const channels=outputs[0];if(channels?.length===2)this.dsp.process(channels[0],channels[1]);return true;}
}
registerProcessor('vehicle-sounds',VehicleProcessor);
