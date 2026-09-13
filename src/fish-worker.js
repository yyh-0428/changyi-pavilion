import { FishSimulation } from './fish-simulation.js';
let simulation;
self.onmessage=({data})=>{
  if(data.type==='init')simulation=new FishSimulation(data.options);
  if(!simulation)return;
  const start=performance.now();
  if(data.type==='step')simulation.advance(data.delta);
  const state=simulation.writeSnapshot(data.buffer);
  self.postMessage({time:simulation.time,buffer:state.buffer,stepMs:performance.now()-start,steps:simulation.steps},[state.buffer]);
};
