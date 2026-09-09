// Shared keyboard/touch state; releasing opposite keys in either order is safe.
export class DrivingInput {
  constructor(){this.keys=new Set();}
  set(key,down){if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return false;down?this.keys.add(key):this.keys.delete(key);return true;}
  clear(){this.keys.clear();}
  get axes(){return{throttle:Number(this.keys.has('ArrowUp'))-Number(this.keys.has('ArrowDown')),steer:Number(this.keys.has('ArrowLeft'))-Number(this.keys.has('ArrowRight'))};}
}
