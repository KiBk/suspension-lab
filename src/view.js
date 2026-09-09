// Translate the orbit rig with the chassis on the ground plane. Preserve its
// viewing angle, zoom and height so lifts and bounces remain visible.
export function followHorizontal(camera, target, position) {
  camera.position.x += position.x - target.x;
  camera.position.z += position.z - target.z;
  target.x = position.x;
  target.z = position.z;
}
