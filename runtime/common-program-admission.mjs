import {createCameraProgramRunner,CAMERA_PROGRAM_MODELS} from '../graph-v2/camera-program-runner.mjs';
import {validateGraphInputs} from '../graph-v2/input-domains.mjs';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],clone=x=>structuredClone(x),pad=(a,n,v=0)=>[...a,...Array(n-a.length).fill(v)],word=b=>b.reduce((n,x,i)=>n+x*2**(8*i),0),limbs=n=>[n%65536,Math.floor(n/65536)];
export const COMMON_PROGRAM_ADMISSION_MODELS=['rom-common-presentation-program-project',...CAMERA_PROGRAM_MODELS];

// Called only after the actual file parser has produced a program. It preserves
// the already planned world, and does not call the outer planning parent.
export async function createCommonProgramAdmissionRunner({runGraph,getModel,onTrace}={}){
 const residentRunner=await createCameraProgramRunner({runGraph,getModel,onTrace});
 async function call(name,input){const ir=await getModel(name);if(!ir)throw Error('Missing shared initialization model '+name);const values={...ir.contract.defaults,...input},feeds=Object.fromEntries(ir.inputs.map(d=>[d.name,Array.isArray(values[d.name])?values[d.name]:[values[d.name]]]));const errors=validateGraphInputs(ir.contract,feeds);if(errors.length)throw Error(name+': '+errors.join('; '));const output=(await runGraph(name,[feeds]))[0];await onTrace?.({model:name,inputs:[clone(feeds)],outputs:[clone(output)]});return output;}
 async function run({rows}){
  const states=[],admissionInputs=[],admission=[],entry=[],planningStates=[],planningControl=[];
  for(const row of rows){
   const program=row.loadedProgram;
   if(!program||!Array.isArray(program.codes))throw Error('An actual decoded linked program is required');
   for(const c of program.codes){if(!Number.isInteger(c.opcode)||c.opcode<0||c.opcode>16777215||!Number.isInteger(c.parameter??0)||(c.parameter??0)<0||(c.parameter??0)>65535)throw Error('Invalid linked opcode or parameter');if(c.opcode===12&&c.parameterKnown===false)throw Error('The actual opcode0c parameter producer is required');if(c.next!==undefined)throw Error('Program codes must retain actual sequential next-pointer order');}
   const lookup=await residentRunner.run({rows:[row]}),input=lookup.contexts[0],resident=lookup.outputs[0];
   if(!resident.supported[0])return{complete:false,reason:'Original resident membership lookup is outside the shared contract',states};
   const current=row.commands[row.currentActionIndex];if(!current?.participants?.length)throw Error('Program initialization needs the actual current command and source');
   const record=row.rawActions.map(h=>Uint8Array.from(h.match(/../g),b=>parseInt(b,16))).find(b=>(b[4]+256*b[5])%4096===current.actionId);
   if(!record)throw Error('Initial raw action record is absent');
   const ir=await getModel('rom-common-presentation-program-project');let accumulator=[...ir.contract.defaults.accumulator],flags=[...input.objectFlagsBytes],programFlags=limbs(row.programFlags3e8??0),out;
   for(let offset=0;offset<Math.max(1,program.codes.length);offset+=32){
    const codes=program.codes.slice(offset,offset+32);
    out=await call('rom-common-presentation-program-project',{accumulator,opcodes:pad(codes.map(c=>c.opcode),32),parameters:pad(codes.map(c=>c.parameter??0),32),count:codes.length,objectFlagsBytes:flags,objectPresent:input.objectPresent,participants:input.currentParticipants,participantCount:input.participantCount,programFlagsU16:programFlags,actionId:current.actionId,actionCategory:Math.floor(record[25]/16),sourceId:current.participants[0],initialize:offset===0,programPresent:true,enabled:row.enabled!==false});
    if(!out.supported[0])return{complete:false,reason:'Linked program length exceeds exact projection domain',states};accumulator=out.nextAccumulator;flags=out.nextObjectFlagsBytes;programFlags=out.nextProgramFlagsU16;
   }
   const byId=Object.fromEntries(IDS.map((id,i)=>[id,word(flags.slice(i*4,i*4+4))])),next={...clone(row),roster:row.roster.map(a=>({...clone(a),objectFlags:byId[a.id]})),lookupObjects:(row.lookupObjects??[]).map(a=>({...clone(a),objectFlags:byId[a.id]})),selectedProgramIndex:-1,loadedProgramPresent:true,programProjection:[...out.programProjection],programFlags3e8:programFlags[0]+65536*programFlags[1],membershipCount:resident.membershipCount[0],selectorReached:!!out.selectorReached[0],resourceRequests:out.messageResourceRequest[0]?[{outerFilename:'actmsg.nat',innerFilename:'',directory:20}]:[]};
   states.push(next);admissionInputs.push(input);admission.push(out);entry.push({parentEnabled:[row.enabled!==false]});planningStates.push(clone(row));planningControl.push({routeEnabled:[false]});
  }
  return{complete:true,states,admissionInputs,admission,entry,planning:{complete:true,states:planningStates,control:planningControl,planningSkipped:true},outerPlanningRepeated:false,wholeCameraComplete:false};
 }
 return{run,models:COMMON_PROGRAM_ADMISSION_MODELS};
}
