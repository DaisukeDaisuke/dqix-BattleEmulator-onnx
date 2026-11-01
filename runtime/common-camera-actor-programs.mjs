// Initial definition binding only. Membership, projection, selector decisions,
// RNG and state updates are still computed by the common ONNX program.
import {COMMON_CAMERA_ACTOR_PROGRAM_DATA} from '../data/common-camera-actor-program-data.mjs';
import {validateResidentPrograms} from '../graph-v2/camera-program-runner.mjs';

export {COMMON_CAMERA_ACTOR_PROGRAM_DATA};
const clone=x=>structuredClone(x);
const entries=new Map(COMMON_CAMERA_ACTOR_PROGRAM_DATA.entries.map(e=>[e.id,e]));
const monsters=new Map(COMMON_CAMERA_ACTOR_PROGRAM_DATA.monsterModels.map(e=>[e.model,e.entryId]));
const parties=new Map(COMMON_CAMERA_ACTOR_PROGRAM_DATA.partyPrograms.map(e=>[e.filename,e.entryId]));

function resolveDefinition(reference){
 if(!reference||typeof reference!=='object'||Array.isArray(reference))throw Error('An actor program definition reference is required');
 let id;
 if(reference.kind==='monster')id=monsters.get(reference.model);
 else if(reference.kind==='party')id=parties.get(reference.filename);
 else if(reference.kind==='character')id=COMMON_CAMERA_ACTOR_PROGRAM_DATA.entries.find(e=>e.entryCRC===undefined&&e.archive===reference.path)?.id;
 else throw Error('Actor program definition kind must be monster, party or character');
 const entry=entries.get(id);if(!entry)throw Error('The declared initial actor program is not packaged');return entry;
}

export function withPackagedActorPrograms(initial){
 const next=clone(initial);next.residentPrograms??=[];
 for(const object of [...next.roster,...next.lookupObjects??[]]){
  // An explicit pointer, including -1, retains the declared initial state.
  // A separate definition reference avoids guessing equipment or model state
  // from combat statistics that do not carry those original identities.
  if(object.residentProgram!==undefined||object.residentProgramDefinition===undefined)continue;
  const entry=resolveDefinition(object.residentProgramDefinition),offset=next.residentPrograms.length;
  next.residentPrograms.push(...entry.programs.map(p=>({...clone(p),next:p.next<0?-1:offset+p.next})));
  object.residentProgram=entry.programs.length?offset:-1;
  object.residentProgramSource={entryId:entry.id,member:entry.member,sha256:entry.sha256};
 }
 validateResidentPrograms(next);return next;
}
