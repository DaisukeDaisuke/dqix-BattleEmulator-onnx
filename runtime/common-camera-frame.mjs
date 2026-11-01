import {createCameraFollowUpdateRunner,CAMERA_FOLLOW_UPDATE_MODELS} from '../graph-v2/camera-follow-update-runner.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';

export const COMMON_CAMERA_FRAME_MODELS=[...new Set([...CAMERA_FOLLOW_UPDATE_MODELS,'rom-camera-memory-patch160','rom-common-camera-frame-gate','rom-common-camera-frame-stack','rom-common-camera-cleanup-store','rom-common-camera-first-stack'])];
const clone=x=>structuredClone(x);
const seedHex=seed=>typeof seed==='string'?seed:'0x'+[...seed].reverse().map(x=>x.toString(16).padStart(2,'0')).join('');

export function cameraGeometryFromMemory(cameraU16,globals7,firstCameraFlag){
  if(!Array.isArray(cameraU16)||cameraU16.length!==320||cameraU16.some(x=>!Number.isInteger(x)||x<0||x>65535))throw Error('Camera frame requires 320 exact u16 limbs');
  if(!Array.isArray(globals7)||globals7.length!==7)throw Error('Camera frame requires seven initial or computed globals');
  const data=new DataView(new ArrayBuffer(640));cameraU16.forEach((x,i)=>data.setUint16(i*2,x,true));
  const i32=o=>data.getInt32(o,true),i16=o=>data.getInt16(o,true);
  return{position:[4,8,12].map(i32),lookAt:[0x10,0x14,0x18].map(i32),polar:[0x70,0x74,0x78].map(i32),roll:i16(0x7c),rollScratch:[i16(0x1ec),i16(0x1ee)],range:i32(0x258),counter:i32(0x25c),mode:data.getUint8(0x220),initialized:data.getUint8(0x260),camera261:data.getUint8(0x261),sourceId:data.getUint8(0x262),targetId:data.getUint8(0x263),globals7:[...globals7],firstCameraFlag:+!!firstCameraFlag};
}

export async function createCommonCameraFrameRunner({runGraph,runDoubleGraph,getModel,onTrace}={}){
  const follow=await createCameraFollowUpdateRunner({runGraph,runDoubleGraph,getModel,onTrace});
  async function call(name,rows){
    const model=await getModel(name);
    for(const [i,row]of rows.entries()){const errors=validateGraphInputs(model.contract,row);if(errors.length)throw Error(`${name} lane${i}: ${errors.join('; ')}`);}
    const output=await runGraph(name,rows);if(onTrace)await onTrace({model:name,inputs:clone(rows),outputs:clone(output)});return output;
  }
  async function runRows(rows){
    if(!rows.length)throw Error('Camera frame requires nonempty rows');
    for(const [i,row]of rows.entries()){
      if(row.worldDispatchStackAbi!=='jpn-component-world-dispatch-v1')throw Error(`lane${i}: actual world-dispatch stack ABI is required`);
      const decoded=cameraGeometryFromMemory(row.cameraU16,row.cameraGeometry.globals7,row.cameraGeometry.firstCameraFlag);
      for(const [key,value]of Object.entries(decoded))if(JSON.stringify(value)!==JSON.stringify(row.cameraGeometry[key]))throw Error(`lane${i}: camera memory and scalar ${key} disagree`);
      if(!Array.isArray(row.nestedRow4U16)||row.nestedRow4U16.length!==8)throw Error('Exact prior nested row+4 limbs are required');
    }
    const gates=await call('rom-common-camera-frame-gate',rows.map(r=>({cameraU16:r.cameraU16,sourcePresent:[!!r.sourcePresent],targetPresent:[!!r.targetPresent],fadeObjectPresent:r.fadeObjectPresent,fadeObjectVisible:r.fadeObjectVisible,fadeInheritedAlpha:r.fadeInheritedAlpha})));
    const rejected=gates.flatMap((g,i)=>g.supported[0]?[]:[i]);
    if(rejected.length)return{complete:false,rejected,reason:'Camera frame requires an additional input/interpolation/spin/fade producer',states:clone(rows)};
    const result=await follow.runRows(rows.map(r=>({...clone(r.cameraGeometry),rollScratch0:r.cameraGeometry.rollScratch[0],rollScratch1:r.cameraGeometry.rollScratch[1],sourcePosition:r.sourcePosition,targetPosition:r.targetPosition,sourceHeight:r.sourceHeight,targetHeight:r.targetHeight,sourcePresent:r.sourcePresent,targetPresent:r.targetPresent,recordPresent:r.recordPresent,recordFirstU16:r.recordFirstU16,seed:seedHex(r.seed??'0x0000000000000001'),rngPosition:r.rngPosition??1,followRepeats:1,initializeFreeCamera:false,follow:true,constraint:true})));
    const raw=gates.map(x=>x.nextCameraU16),followStates=result.phases.find(p=>p.name==='camera_follow_0')?.states;
    if(!followStates||followStates.length!==rows.length)throw Error('Admitted original follow did not execute');
    for(const phase of result.phases){
      const output=await call('rom-camera-memory-patch160',phase.indices.map((index,k)=>{const s=phase.states[k];return{cameraU16:raw[index],operation:[phase.name==='border_constraint'?2:1],position:s.position,lookAt:s.lookAt,polar:s.polar,roll:[s.roll],rollScratch:s.rollScratch,range:[s.range],counter:[s.counter],mode:[s.mode],flagsIds:[s.initialized,s.camera261,s.sourceId,s.targetId]};}));
      phase.indices.forEach((index,k)=>raw[index]=output[k].nextCameraU16);
    }
    const stack=await call('rom-common-camera-frame-stack',rows.map((r,i)=>({priorU16:r.nestedRow4U16,followAngle:[followStates[i].polar[0]],enabled:[true]})));
    return{complete:true,cameraFrameComplete:true,wholeWorldFrameComplete:false,states:rows.map((r,i)=>({...clone(r),cameraGeometry:clone(result.states[i]),cameraU16:raw[i],nestedRow4U16:stack[i].nextU16,nestedRow4WriteMask:stack[i].wordByteWriteMask})),scope:'One original world camera component: admitted no-manual/no-interpolation/no-spin/no-active-fade path, exact follow and border, retained 640 bytes, seven globals, and nested stack writes. UI, font, resource, actor animation, other world components and physical frame timing are separate producers.'};
  }
  async function cleanupRows(rows){
    const output=await call('rom-common-camera-cleanup-store',rows.map(r=>({cameraU16:r.cameraU16,commandCleanup:[!!r.commandCleanup],turnCleanup:[!!r.turnCleanup]})));
    return rows.map((r,i)=>({...clone(r),cameraU16:output[i].nextCameraU16}));
  }
  return{runRows,cleanupRows,models:COMMON_CAMERA_FRAME_MODELS};
}
