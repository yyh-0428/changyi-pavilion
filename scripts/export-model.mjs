import { writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildPavilion } from '../src/model.js';
import { installCanvas, loadPlaqueMap } from './node-canvas.mjs';

installCanvas();
const model = buildPavilion({ plaqueMap: await loadPlaqueMap() });
const binary = await new GLTFExporter().parseAsync(model.root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
const output = new URL('../changyi-pavilion.glb', import.meta.url);
await writeFile(output, new Uint8Array(binary));
console.log(`Exported changyi-pavilion.glb (${(binary.byteLength / 1048576).toFixed(2)} MiB)`);
console.log(JSON.stringify(model.root.userData.geometryMetrics, null, 2));
