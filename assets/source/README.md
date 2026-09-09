# Original downloaded car models

These three unmodified downloads were provided by the repository owner:

- `original-fbx.zip`: original FBX and textures (`generic-passenger-car-pack.zip`).
- `sketchfab-gltf.zip`: converted glTF, binary buffer, textures and licence.
- `sketchfab.glb`: the same pack as a self-contained GLB, used by the processor.

All are **Generic passenger car pack** by **Comrade1280**, licensed CC BY 4.0.
Source: https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5
Author: https://sketchfab.com/comrade1280
Licence: https://creativecommons.org/licenses/by/4.0/
See `../cars/LICENSE.txt` for attribution and the adaptation notice.

`SHA256SUMS` records original bytes. Archives are retained for reproducibility
and editing; the browser build copies only the processed `assets/cars` directory.

Regenerate the ten GLBs, measurements and source module from the repo root:

```sh
node scripts/process-car-pack.mjs assets/source/sketchfab.glb
```
