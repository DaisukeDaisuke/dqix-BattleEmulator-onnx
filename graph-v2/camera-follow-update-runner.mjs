// New first-follow/constraint composition; all five earlier phase packs are immutable.
// DOUBLE reverse-polar is an explicit CPU provider boundary, never silent GPU fallback.
import {validateGraphInputs} from './input-domains.mjs';
import {seedBytes} from './reference.mjs';
export const CAMERA_FOLLOW_UPDATE_MODELS=['rom-free-camera-rng-step','rom-free-camera-geometry-prepare3','rom-camera-set-polar-wide3','rom-free-camera-range3','rom-free-camera-follow-update3','rom-camera-border-constraint3','rom-camera-reverse-polar-values-cpu3'];
export async function createCameraFollowUpdateRunner({runGraph,runDoubleGraph,getModel,onTrace}={}){
 if(typeof runDoubleGraph!=='function')throw Error('Explicit CPU DOUBLE provider is required');
 const models=Object.fromEntries(await Promise.all(CAMERA_FOLLOW_UPDATE_MODELS.map(async n=>[n,await getModel(n)])));
 async function call(name,rows){if(!rows.length)return[];const m=models[name];for(const[i,r]of rows.entries()){const errors=validateGraphInputs(m.contract,r);for(const d of m.inputs)if(!Array.isArray(r[d.name])||r[d.name].length!==d.shape[1])errors.push(`${d.name}: invalid width`);if(errors.length)throw Error(`${name} lane${i}: ${errors.join('; ')}`);}const o=await(name==='rom-camera-reverse-polar-values-cpu3'?runDoubleGraph:runGraph)(name,rows);if(onTrace)await onTrace({model:name,inputs:structuredClone(rows),outputs:structuredClone(o)});return o;}
 async function runRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error('Initial rows required');for(const r of rows)if(!Number.isInteger(r.followRepeats??1)||(r.followRepeats??1)<0||(r.followRepeats??1)>16)throw Error('Explicit followRepeats must be integer0..16');
  const states=rows.map(r=>({position:[...r.position],lookAt:[...r.lookAt],polar:[...r.polar],roll:r.roll??0,rollScratch:[r.rollScratch0??0,r.rollScratch1??0],range:r.range??0,mode:r.mode??0,initialized:+!!r.initialized,camera261:+!!r.camera261,sourceId:r.sourceId??0,targetId:r.targetId??192,firstCameraFlag:+!!r.firstCameraFlag,globals7:[...r.globals7],seed:seedBytes(BigInt(r.seed??1)),rngPosition:[r.rngPosition??1],counter:r.counter??0})),phases=[];
  async function snapshot(name,indices){const p={name,indices:[...indices],states:indices.map(i=>structuredClone(states[i]))};phases.push(p);}
  let indices=rows.flatMap((r,i)=>r.initializeFreeCamera?[i]:[]);
  if(indices.length){for(const i of indices)if((rows[i].resetMode??-1)!==-1)throw Error(`lane${i}: resetMode==-1 required; stored restore geometry is outside this variant`);
   const rng=await call('rom-free-camera-rng-step',indices.map(i=>{const s=states[i],r=rows[i];return{seed:s.seed,position:s.rngPosition,cameraState:[s.counter,s.globals7[0],s.globals7[1],s.globals7[3],s.globals7[4]],forced:[r.forced!==0&&r.forced!==false],sourcePresent:[r.sourcePresent!==0&&r.sourcePresent!==false],targetPresent:[r.targetPresent!==0&&r.targetPresent!==false],targetHeight:[r.targetHeight??4096],recordPresent:[r.recordPresent!==0&&r.recordPresent!==false],recordFirstU16:[r.recordFirstU16??1],enabled:[true]};}));
   const prep=await call('rom-free-camera-geometry-prepare3',indices.map((i,k)=>({sourcePosition:rows[i].sourcePosition,targetPosition:rows[i].targetPosition,sourceHeight:[rows[i].sourceHeight??4096],targetHeight:[rows[i].targetHeight??4096],presetIndex:rng[k].presetIndex,heightQ12:[rng[k].nextCameraState[3]],applied:rng[k].applied})));
   const p=await call('rom-camera-set-polar-wide3',prep.map(r=>({lookAt:r.lookAt,angle:r.angle,height:r.height,distance:r.distance}))),range=await call('rom-free-camera-range3',p.map(r=>({position:r.position})));
   for(let k=0;k<indices.length;k++){const i=indices[k],s=states[i],r=rows[i],o=rng[k];s.firstCameraFlag=+(!s.initialized&&!r.suppressFirstCameraFlag);s.initialized=1;s.camera261=0;s.mode=0;s.seed=o.nextSeed;s.rngPosition=o.nextPosition;s.counter=o.nextCameraState[0];s.globals7=[o.nextCameraState[1],o.nextCameraState[2],0,o.nextCameraState[3],o.nextCameraState[4],0,0];if(o.applied[0]){s.lookAt=prep[k].lookAt;s.position=p[k].position;s.polar=p[k].polar;s.range=range[k].range[0];}}
   await snapshot('initial_free_camera',indices);
  }
  for(let followIndex=0;followIndex<Math.max(...rows.map(r=>r.follow===false?0:(r.followRepeats??1)));followIndex++){
  indices=rows.flatMap((r,i)=>r.follow!==false&&followIndex<(r.followRepeats??1)?[i]:[]);
  if(indices.length){const output=await call('rom-free-camera-follow-update3',indices.map(i=>{const r=rows[i],s=states[i];return{sourcePosition:r.sourcePosition,targetPosition:r.targetPosition,sourceHeight:[r.sourceHeight??4096],targetHeight:[r.targetHeight??4096],sourceId:[s.sourceId],targetId:[s.targetId],lookAt:s.lookAt,polar:s.polar,globals:s.globals7,initialized:[!!s.initialized],firstCameraFlag:[!!s.firstCameraFlag],sourcePresent:[r.sourcePresent!==0&&r.sourcePresent!==false],targetPresent:[r.targetPresent!==0&&r.targetPresent!==false],recordPresent:[r.recordPresent!==0&&r.recordPresent!==false],recordFirstU16:[r.recordFirstU16??1],camera261:[!!s.camera261],roll:[s.roll],rollScratch:s.rollScratch};}));
   for(const[k,o]of output.entries())if(!o.supported[0])throw Error(`lane${indices[k]}: follow geometry outside admitted domain`);
   const updated=output.flatMap((o,k)=>o.updated[0]?[k]:[]),p=await call('rom-camera-set-polar-wide3',updated.map(k=>({lookAt:output[k].nextLookAt,angle:[output[k].nextPolar[0]],height:[output[k].nextPolar[1]],distance:[output[k].nextPolar[2]]})));
   for(let k=0;k<indices.length;k++){const s=states[indices[k]],o=output[k];s.lookAt=o.nextLookAt;s.polar=o.nextPolar;s.roll=o.nextRoll[0];s.rollScratch=o.nextRollScratch;s.globals7=o.nextGlobals;s.camera261=+!!o.nextCamera261[0];s.firstCameraFlag=+!!o.nextFirstCameraFlag[0];}for(let k=0;k<updated.length;k++)states[indices[updated[k]]].position=p[k].position;
   await snapshot(`camera_follow_${followIndex}`,indices);
  }}
  indices=rows.flatMap((r,i)=>r.constraint?[i]:[]);
  if(indices.length){const o=await call('rom-camera-border-constraint3',indices.map(i=>{const s=states[i];return{position:s.position,range:[s.range],mode:[s.mode],initialized:[!!s.initialized]};}));for(let k=0;k<indices.length;k++){states[indices[k]].position=o[k].nextPosition;states[indices[k]].range=o[k].nextRange[0];}
   const changed=o.flatMap((v,k)=>v.reverseRequired[0]?[k]:[]),v=await call('rom-camera-reverse-polar-values-cpu3',changed.map(k=>({position:states[indices[k]].position,lookAt:states[indices[k]].lookAt}))),p=await call('rom-camera-set-polar-wide3',changed.map((k,j)=>({lookAt:states[indices[k]].lookAt,angle:[v[j].polar[0]],height:[v[j].polar[1]],distance:[v[j].polar[2]]})));
   for(let j=0;j<changed.length;j++){const s=states[indices[changed[j]]];s.position=p[j].position;s.polar=v[j].polar;}
   await snapshot('border_constraint',indices);
  }
  return{states,phases,complete:true,wholeCameraComplete:false,cpuDoubleExplicit:true,scope:'Explicit initial free-camera optional call -> one or more first/continuing follow calls -> optional border/reversePolar/setPolar. Arithmetic is in ONNX, including explicit CPU DOUBLE atan2. Same initial inputs and graph-produced feedback only; matrix160words, other interpolation/script updates and renderer-frame scheduling are outside this variant.'};
 }
 return{runRows,models:CAMERA_FOLLOW_UPDATE_MODELS};
}
