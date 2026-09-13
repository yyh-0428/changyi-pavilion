import { sampleHabitat, WATER_LEVEL, FISH_CENTRES } from './fish-habitat.js';

export const FIXED_STEP=1/60;
export const FISH_STRIDE=12;
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function fishRandom(seed) { let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;}; }

// A fixed-size spatial grid supplies local neighbours and collision candidates.
// Arrays are reused through the complete simulation, including constraint solves.
export class FishSimulation {
  constructor({count=120,seed=90217}={}) {
    this.count=count;this.time=0;this.accumulator=0;this.steps=0;
    this.random=fishRandom(seed);this.habitat=new Float64Array(4);
    for(const key of ['x','y','z','vx','vy','vz','yaw','pitch','turn','phase','size','width','height','radius','cruise','goalX','goalZ','goalTime','px','py','pz','pvx','pvy','pvz'])this[key]=new Float64Array(count);
    this.gridSize=24;this.cellSize=2;this.head=new Int32Array(this.gridSize*this.gridSize);this.next=new Int32Array(count);
    this.diagnostics={maxCorrection:0,maxNeighbours:0,droppedTime:0,steps:0};
    for(let i=0;i<count;i++) {
      this.size[i]=.49+this.random()*.24; // Full nose-to-tail length: 0.61–0.91 m.
      this.width[i]=.88+this.random()*.22;this.height[i]=.91+this.random()*.17;
      // Encloses the complete animated silhouette, including fin and tail sweep.
      this.radius[i]=this.size[i]*.68+.025;
      this.cruise[i]=.25+this.random()*.22;this.phase[i]=this.random()*TAU;
      let placed=false;
      for(let attempt=0;attempt<5000;attempt++) {
        const centre=FISH_CENTRES[i%FISH_CENTRES.length],a=this.random()*TAU,r=Math.sqrt(this.random())*(attempt<300?3.3:9);
        const x=centre[0]+Math.cos(a)*r,z=centre[1]+Math.sin(a)*r;
        sampleHabitat(x,z,this.habitat);
        if(this.habitat[0]<this.radius[i]+.25)continue;
        const top=WATER_LEVEL-this.radius[i]-.065,bottom=this.habitat[3]+this.radius[i]+.10;
        if(bottom>top)continue;
        const y=clamp(-.72-this.random()*.70,bottom,top);
        let clear=true;
        for(let j=0;j<i;j++)if(Math.hypot(x-this.x[j],y-this.y[j],z-this.z[j])<this.radius[i]+this.radius[j]+.16){clear=false;break;}
        if(!clear)continue;
        this.x[i]=x;this.y[i]=y;this.z[i]=z;placed=true;break;
      }
      if(!placed)throw new Error(`Fish ${i}: no safe starting volume`);
      this.yaw[i]=this.random()*TAU;this.vx[i]=Math.cos(this.yaw[i])*this.cruise[i];this.vz[i]=Math.sin(this.yaw[i])*this.cruise[i];
      this.chooseGoal(i);
    }
  }
  chooseGoal(i) {
    for(let j=0;j<40;j++) {
      // Independent visits to overlapping habitat patches; no fixed animation loop.
      const centre=FISH_CENTRES[Math.floor(this.random()*FISH_CENTRES.length)],a=this.random()*TAU,r=Math.sqrt(this.random())*2.8;
      const x=centre[0]+Math.cos(a)*r,z=centre[1]+Math.sin(a)*r;
      sampleHabitat(x,z,this.habitat);
      if(this.habitat[0]>this.radius[i]+.5){this.goalX[i]=x;this.goalZ[i]=z;break;}
    }
    this.goalTime[i]=this.time+12+this.random()*20;
  }
  rebuildGrid() {
    this.head.fill(-1);
    for(let i=0;i<this.count;i++) {
      const cx=clamp(Math.floor((this.x[i]+24)/this.cellSize),0,this.gridSize-1),cz=clamp(Math.floor((this.z[i]+24)/this.cellSize),0,this.gridSize-1),cell=cz*this.gridSize+cx;
      this.next[i]=this.head[cell];this.head[cell]=i;
    }
  }
  advance(delta) {
    const accepted=clamp(delta,0,4*FIXED_STEP);this.diagnostics.droppedTime+=Math.max(0,delta-accepted);
    this.accumulator+=accepted;
    let iterations=0;
    while(this.accumulator+1e-10>=FIXED_STEP && iterations++<4){this.step();this.accumulator-=FIXED_STEP;}
    return this.time;
  }
  step() {
    const dt=FIXED_STEP,n=this.count;
    this.px.set(this.x);this.py.set(this.y);this.pz.set(this.z);this.pvx.set(this.vx);this.pvy.set(this.vy);this.pvz.set(this.vz);this.rebuildGrid();
    for(let i=0;i<n;i++) {
      const x=this.x[i],z=this.z[i],y=this.y[i],radius=this.radius[i];
      if(this.time>this.goalTime[i]||Math.hypot(x-this.goalX[i],z-this.goalZ[i])<1)this.chooseGoal(i);
      const goalLength=Math.hypot(this.goalX[i]-x,this.goalZ[i]-z)||1;
      let dx=(this.goalX[i]-x)/goalLength*.50,dz=(this.goalZ[i]-z)/goalLength*.50;
      let alignX=0,alignZ=0,cohesionX=0,cohesionZ=0,neighbours=0;
      const cx=Math.floor((x+24)/2),cz=Math.floor((z+24)/2);
      for(let gz=Math.max(0,cz-2);gz<=Math.min(this.gridSize-1,cz+2);gz++)for(let gx=Math.max(0,cx-2);gx<=Math.min(this.gridSize-1,cx+2);gx++) {
        for(let j=this.head[gz*this.gridSize+gx];j!==-1;j=this.next[j]) {
          if(i===j)continue;
          const rx=x-this.px[j],ry=y-this.py[j],rz=z-this.pz[j],distance=Math.hypot(rx,ry,rz);
          if(distance>3.5)continue;
          neighbours++;alignX+=this.pvx[j];alignZ+=this.pvz[j];cohesionX+=this.px[j]-x;cohesionZ+=this.pz[j]-z;
          const safe=radius+this.radius[j],separation=Math.max(0,(safe+.80-distance)/.80);
          dx+=rx/(distance||1)*separation*2.5;dz+=rz/(distance||1)*separation*2.5;
          // Predict closest approach, then share avoidance before the bodies meet.
          const rvx=this.pvx[i]-this.pvx[j],rvy=this.pvy[i]-this.pvy[j],rvz=this.pvz[i]-this.pvz[j];
          const v2=rvx*rvx+rvy*rvy+rvz*rvz;
          const t=clamp(-(rx*rvx+ry*rvy+rz*rvz)/(v2+1e-8),0,1.8);
          const ax=rx+rvx*t,ay=ry+rvy*t,az=rz+rvz*t,approach=Math.hypot(ax,ay,az);
          if(t>0 && approach<safe+.32) {
            let avoidX=ax,avoidZ=az,l=Math.hypot(avoidX,avoidZ);
            if(l<.08){avoidX=-rz;avoidZ=rx;l=Math.hypot(avoidX,avoidZ)||1;}
            const force=(safe+.32-approach)/(safe+.32)*(1.7/(.5+t));
            dx+=avoidX/l*force;dz+=avoidZ/l*force;
          }
        }
      }
      this.diagnostics.maxNeighbours=Math.max(this.diagnostics.maxNeighbours,neighbours);
      if(neighbours){dx+=alignX/neighbours*.36+cohesionX/neighbours*.045;dz+=alignZ/neighbours*.36+cohesionZ/neighbours*.045;}
      dx+=Math.sin(this.time*.23+i*2.39996)*.18;dz+=Math.cos(this.time*.19+i*1.731)*.18;
      sampleHabitat(x+this.vx[i]*1.25,z+this.vz[i]*1.25,this.habitat);
      const shoreWeight=clamp((radius+1.4-this.habitat[0])/1.4,0,2.5);
      dx+=this.habitat[1]*shoreWeight*3.4;dz+=this.habitat[2]*shoreWeight*3.4;
      const wanted=Math.atan2(dz,dx),error=angle(wanted-this.yaw[i]);
      const targetTurn=clamp(error*1.8,-1.05,1.05);
      this.turn[i]+=(targetTurn-this.turn[i])*(1-Math.exp(-dt*3.8));this.yaw[i]=angle(this.yaw[i]+this.turn[i]*dt);
      const burst=.80+.24*Math.sin(this.time*.46+i*.81)+.12*Math.sin(this.time*.17+i*2.4);
      const speed=this.cruise[i]*clamp(burst,.50,1.15)*(1-.25*Math.min(1,Math.abs(error)));
      const forwardX=Math.cos(this.yaw[i]),forwardZ=Math.sin(this.yaw[i]);
      // A damped propulsion model: bounded acceleration, lateral drag, no instant turns.
      let ax=(forwardX*speed-this.vx[i])*1.7,az=(forwardZ*speed-this.vz[i])*1.7;
      const acceleration=Math.hypot(ax,az),limit=.40;
      if(acceleration>limit){ax*=limit/acceleration;az*=limit/acceleration;}
      this.vx[i]+=ax*dt;this.vz[i]+=az*dt;
      sampleHabitat(x,z,this.habitat);
      const top=WATER_LEVEL-radius-.065,bottom=this.habitat[3]+radius+.10;
      const targetY=clamp(-.93+Math.sin(this.time*.16+i*1.37)*.27,Math.min(bottom,top),top);
      const verticalTarget=clamp((targetY-y)*.5,-.115,.115);
      this.vy[i]+=(verticalTarget-this.vy[i])*(1-Math.exp(-dt*1.7));
      this.x[i]+=this.vx[i]*dt;this.y[i]+=this.vy[i]*dt;this.z[i]+=this.vz[i]*dt;
      const pace=Math.hypot(this.vx[i],this.vz[i]);
      this.pitch[i]+=(Math.atan2(this.vy[i],Math.max(.08,pace))-this.pitch[i])*(1-Math.exp(-dt*3));
      this.phase[i]=(this.phase[i]+TAU*(.62+pace/(this.size[i]*1.24)*1.7)*dt)%TAU;
    }
    // Non-penetration constraints are the safety net, not the locomotion driver.
    // The bounding spheres contain every pose, so tails/fins cannot interpenetrate.
    for(let iteration=0;iteration<8;iteration++) {
      this.rebuildGrid();let penetration=0;
      for(let i=0;i<n;i++) {
        const cx=Math.floor((this.x[i]+24)/2),cz=Math.floor((this.z[i]+24)/2);
        for(let gz=Math.max(0,cz-1);gz<=Math.min(this.gridSize-1,cz+1);gz++)for(let gx=Math.max(0,cx-1);gx<=Math.min(this.gridSize-1,cx+1);gx++)for(let j=this.head[gz*this.gridSize+gx];j!==-1;j=this.next[j]) {
          if(j<=i)continue;
          let dx=this.x[i]-this.x[j],dy=this.y[i]-this.y[j],dz=this.z[i]-this.z[j],distance=Math.hypot(dx,dy,dz);
          const target=this.radius[i]+this.radius[j]+.018;
          if(distance>=target)continue;
          const correction=(target-distance)*.501;penetration=Math.max(penetration,correction);
          if(distance<1e-9){dx=i%2?1:-1;dy=0;dz=.5;distance=Math.hypot(dx,dz);}
          const nx=dx/distance,ny=dy/distance,nz=dz/distance;
          this.x[i]+=nx*correction;this.y[i]+=ny*correction;this.z[i]+=nz*correction;
          this.x[j]-=nx*correction;this.y[j]-=ny*correction;this.z[j]-=nz*correction;
          const closing=(this.vx[i]-this.vx[j])*nx+(this.vy[i]-this.vy[j])*ny+(this.vz[i]-this.vz[j])*nz;
          if(closing<0){const impulse=-closing*.5;this.vx[i]+=nx*impulse;this.vy[i]+=ny*impulse;this.vz[i]+=nz*impulse;this.vx[j]-=nx*impulse;this.vy[j]-=ny*impulse;this.vz[j]-=nz*impulse;}
        }
      }
      for(let i=0;i<n;i++) {
        for(let boundary=0;boundary<3;boundary++) {
          sampleHabitat(this.x[i],this.z[i],this.habitat);
          const required=this.radius[i]+.045,overlap=required-this.habitat[0];
          if(overlap>0) {
            this.x[i]+=this.habitat[1]*(overlap+.002);this.z[i]+=this.habitat[2]*(overlap+.002);
            const closing=this.vx[i]*this.habitat[1]+this.vz[i]*this.habitat[2];
            if(closing<0){this.vx[i]-=this.habitat[1]*closing;this.vz[i]-=this.habitat[2]*closing;}
            penetration=Math.max(penetration,overlap);
          }
        }
        const top=WATER_LEVEL-this.radius[i]-.05,bottom=this.habitat[3]+this.radius[i]+.07;
        const y=clamp(this.y[i],Math.min(bottom,top),top);
        if(y!==this.y[i]){this.y[i]=y;this.vy[i]*=.2;}
      }
      this.diagnostics.maxCorrection=Math.max(this.diagnostics.maxCorrection,penetration);
      if(penetration<1e-6)break;
    }
    this.time+=dt;this.steps++;this.diagnostics.steps=this.steps;
  }
  writeSnapshot(buffer) {
    const out=new Float32Array(buffer??new ArrayBuffer(this.count*FISH_STRIDE*4));
    for(let i=0;i<this.count;i++) {
      const at=i*FISH_STRIDE;
      out[at]=this.x[i];out[at+1]=this.y[i];out[at+2]=this.z[i];out[at+3]=this.yaw[i];out[at+4]=this.pitch[i];out[at+5]=this.phase[i];out[at+6]=Math.hypot(this.vx[i],this.vz[i]);out[at+7]=this.turn[i];out[at+8]=this.size[i];out[at+9]=this.width[i];out[at+10]=this.height[i];out[at+11]=i;
    }
    return out;
  }
  audit() {
    let minimumGap=Infinity,minimumShore=Infinity,minimumSurface=Infinity,minimumBottom=Infinity,maxSpeed=0;
    for(let i=0;i<this.count;i++) {
      for(let j=0;j<i;j++)minimumGap=Math.min(minimumGap,Math.hypot(this.x[i]-this.x[j],this.y[i]-this.y[j],this.z[i]-this.z[j])-this.radius[i]-this.radius[j]);
      sampleHabitat(this.x[i],this.z[i],this.habitat);
      minimumShore=Math.min(minimumShore,this.habitat[0]-this.radius[i]);minimumSurface=Math.min(minimumSurface,WATER_LEVEL-this.y[i]-this.radius[i]);minimumBottom=Math.min(minimumBottom,this.y[i]-this.radius[i]-this.habitat[3]);maxSpeed=Math.max(maxSpeed,Math.hypot(this.vx[i],this.vy[i],this.vz[i]));
    }
    return {count:this.count,time:this.time,minimumGap,minimumShore,minimumSurface,minimumBottom,maxSpeed,...this.diagnostics};
  }
}
