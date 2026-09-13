import { parentPort, workerData } from 'node:worker_threads';
globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
await import(workerData.moduleURL);
parentPort.on('message',data=>self.onmessage({data}));
