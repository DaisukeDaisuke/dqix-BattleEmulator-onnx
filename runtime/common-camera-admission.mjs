// One shared enclosing admission, callable from the common frame controller.
// Initial pointer identities and call-stack layout are explicit ABI data.
import {createCameraEnclosingPhaseRunner,CAMERA_ENCLOSING_PHASE_MODELS} from '../graph-v2/camera-enclosing-phase-runner.mjs';
import {createCameraRetainedMemoryRunner} from '../graph-v2/camera-retained-memory-runner.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';
import {createCommonProgramAdmissionRunner,COMMON_PROGRAM_ADMISSION_MODELS} from './common-program-admission.mjs';

export const COMMON_CAMERA_ADMISSION_MODELS=[...new Set([...CAMERA_ENCLOSING_PHASE_MODELS,'rom-common-presentation-stack','rom-common-camera-first-stack','rom-common-presentation-admission-stack',...COMMON_PROGRAM_ADMISSION_MODELS])];
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199];
const clone=x=>structuredClone(x),limbs=words=>words.flatMap(x=>[x%65536,Math.floor(x/65536)]),words=raw=>Array.from({length:raw.length/2},(_,i)=>raw[i*2]+65536*raw[i*2+1]);

export async function createCommonCameraAdmissionRunner(options){
  const {runGraph,getModel,onTrace}=options,initial=await createCameraEnclosingPhaseRunner(options),retained=await createCameraRetainedMemoryRunner(options),loaded=await createCameraRetainedMemoryRunner({...options,admissionFactory:createCommonProgramAdmissionRunner});
  async function call(name,input){
    const model=await getModel(name),errors=validateGraphInputs(model.contract,input);if(errors.length)throw Error(`${name}: ${errors.join('; ')}`);
    const output=(await runGraph(name,[input]))[0];if(onTrace)await onTrace({model:name,inputs:[clone(input)],outputs:[clone(output)]});return output;
  }
  async function run({row,firstAdmission=false,stackAbi,maxRouteAttempts=10861,programInitialization=false}){
    if(!stackAbi?.sameStack||!Array.isArray(stackAbi.gameStateSingletonU16)||!stackAbi.objectAddressU16)throw Error('Original caller stack and pointer ABI data are required');
    if(firstAdmission&&(stackAbi.firstAdmissionTail!=='jpn-empty-actor-effects-direct-first-v1'||!Array.isArray(stackAbi.sceneBaseU16)))throw Error('The initial direct-call tail and scene pointer must be qualified explicitly');
    const currentInput=programInitialization?clone(row):{...clone(row),loadedProgramPresent:false,loadedProgram:null};
    const result=await(programInitialization?loaded:firstAdmission?initial:retained).run({rows:[currentInput],maxRouteAttempts});
    if(!result.complete)return result;
    const current=result.states[0],planning=result.world.prior.admission.planning,before=result.world.prior.states[0],decision=result.world.prior.event.decisions[0],activeIds=planning.states[0].activeRosterIds,
      command=before.commands[before.currentActionIndex],source=[...before.roster,...before.lookupObjects??[]].find(a=>a.id===command?.participants[0]),second=activeIds[1],address=stackAbi.objectAddressU16[String(second)];
    const stackInput={
      priorU16:limbs(row.row4Words),programProjection:before.programProjection,currentActionIndex:[before.currentActionIndex],sourceAuxiliaryNode:[source?.auxiliaryNode??255],
      sourcePresent:[!!source&&source.lookupPresent!==false],sourceVisualPresent:[!!source&&source.visualPresent!==false],programPresent:[before.selectedProgramIndex>=0||before.loadedProgramPresent===true],selectorReached:[!!before.selectorReached],
      callFreeCamera:decision.callFreeCamera,forced:decision.forced,freeCameraSelected:result.world.prior.event.camera[0].selected,plannerReached:[!!planning.control[0].routeEnabled[0]],plannerSecondPresent:[activeIds.length>=2&&Array.isArray(address)&&address.length===2],
      plannerSecondAddressU16:address??[0,0],gameStateSingletonU16:stackAbi.gameStateSingletonU16,enabled:[true]
    };
    let stack;
    if(!programInitialization&&row.visualRoster){
      const raw=row.visualRoster,objects=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a]));
      for(const key of ['partyOrder','partyCount','battlePartyMask','context81fe','actorTypeFlagsLow16','actorFlags18Low16','actorModelPresent'])if(raw[key]===undefined)throw Error('Actual visual roster input missing: '+key);
      const input={...stackInput,...Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,Array.isArray(value)?value:[value]])),actorLookupPresent:IDS.map(id=>objects.has(id)&&objects.get(id).lookupPresent!==false),actorAddressU16:IDS.flatMap(id=>{const pointer=stackAbi.objectAddressU16[String(id)];if(objects.has(id)&&objects.get(id).lookupPresent!==false&&(!Array.isArray(pointer)||pointer.length!==2))throw Error('Original object pointer ABI missing for '+id);return pointer??[0,0];})};
      delete input.plannerSecondPresent;delete input.plannerSecondAddressU16;
      stack=await call('rom-common-presentation-admission-stack',input);
    }else stack=await call('rom-common-presentation-stack',stackInput);
    if(!stack.supported[0])return{complete:false,reason:'The admission requires an additional correlated-stack producer',result};
    const callerRow4=words(stack.nextU16),nested=firstAdmission?(await call('rom-common-camera-first-stack',{sceneBaseU16:stackAbi.sceneBaseU16,priorU16:stack.nextU16,enabled:[true]})).nextU16:stack.nextU16;
    const geometry=clone(result.cameraGeometry[0]),next={...clone(current),cameraGeometry:geometry,cameraU16:[...result.cameraU16[0]],cameraState:[geometry.counter,geometry.globals7[0],geometry.globals7[1],geometry.globals7[3],geometry.globals7[4]],cameraInitialized:!!geometry.initialized,
      row4Words:words(nested),nestedRow4U16:[...nested],commandBaseU16:[...row.commandBaseU16],cameraRngPointerU16:[...row.cameraRngPointerU16],retainedMemoryOrigin:'computed-previous-outer-v1'};
    return{complete:true,row:next,callerRow4Words:callerRow4,nestedRow4U16:[...nested],result,resourceRequests:clone(next.resourceRequests??[]),outerPlanningRepeated:!programInitialization,wholeWorldFrameComplete:false,scope:programInitialization?'Actual linked program initialization and the shared selector/world/camera suffix. The already computed planning state is retained; the outer planning parent is not executed. Resource parsing and message/script state initialization remain the frame controller responsibility.':'The existing original enclosing camera projection, with first-direct versus nested frame stack handoff. Frame/UI/resource advancement is performed by the common controller, outside this call.'};
  }
  async function initializeProgram({row,program,stackAbi,maxRouteAttempts=10861}){
    if(!program||!Array.isArray(program.codes))throw Error('A computed linked program is required');
    return run({row:{...clone(row),loadedProgram:clone(program)},stackAbi,maxRouteAttempts,programInitialization:true});
  }
  return{run,initializeProgram,models:COMMON_CAMERA_ADMISSION_MODELS};
}
