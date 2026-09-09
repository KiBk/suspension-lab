// Use the exact same WAV decoder and sample bank in Node and the browser.
import {readFile} from 'node:fs/promises';
import {loadRecordings} from '../src/recordings.js';
export const audioBank=await loadRecordings(async url=>{
 const bytes=await readFile(url);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
},new URL('../assets/audio/',import.meta.url));
