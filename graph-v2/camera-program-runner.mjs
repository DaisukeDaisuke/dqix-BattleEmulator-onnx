import {validateGraphInputs} from './input-domains.mjs';

export const CAMERA_PROGRAM_MODELS=['rom-common-camera-program-search','rom-common-camera-program-admission','rom-common-camera-program-project'];
const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],CHUNK=32,SENTINEL=16777215;
const clone=x=>structuredClone(x),pad=(a,n,v=0)=>Array.from({length:n},(_,i)=>a[i]??v),bytes=x=>Array.from({length:4},(_,i)=>Math.floor(x/2**(8*i))%256);
function integer(v,min,max,label){if(!Number.isInteger(v)||v<min||v>max)throw Error(`${label}: integer ${min}..${max} required`);}

export function validateResidentPrograms(row){
 const programs=row.residentPrograms;if(!Array.isArray(programs)||programs.length>=SENTINEL)throw Error('Explicit finite resident program table required');
 for(const[pindex,p]of programs.entries()){
  if(!Array.isArray(p.actions)||!Array.isArray(p.codes)||p.codes.length>=SENTINEL)throw Error('Program actions and sequential opcode data are required');
  integer(p.next??-1,-1,programs.length-1,`program${pindex}.next`);p.actions.forEach(x=>integer(x,0,65535,'action ID'));
  for(const c of p.codes){integer(c.opcode,0,SENTINEL,'opcode');integer(c.parameter??0,0,65535,'opcode parameter');if(c.next!==undefined)throw Error('Opcode data must be in actual sequential linked order');}
 }
 // Validate every linked header once. This checks structure only; membership
 // and selected-program decisions are performed by the shared ONNX search.
 const checked=new Set();
 for(let start=0;start<programs.length;start++){
  if(checked.has(start))continue;const path=new Set();let at=start;
  while(at>=0&&!checked.has(at)){if(path.has(at))throw Error('Cyclic resident program chain');path.add(at);at=programs[at].next??-1;}
  for(const index of path)checked.add(index);
 }
 integer(row.fallbackProgram??-1,-1,programs.length-1,'fallbackProgram');
 for(const object of [...row.roster,...row.lookupObjects??[]]){integer(object.residentProgram??-1,-1,programs.length-1,'object residentProgram');integer(object.objectFlags??0,0,4294967295,'Object3D flags');}
}

export function cameraProgramContext(row,enabled){
 const current=row.commands[row.currentActionIndex],previous=row.currentActionIndex>0?row.commands[row.currentActionIndex-1]:undefined,source=current?.participants[0]??0,target=current?.targets[0]??-1,objects=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a])),actor=objects.get(source);
 const record=row.rawActions.map(hex=>Array.from({length:52},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16))).find(b=>(b[4]+256*b[5])%4096===(current?.actionId??0));
 return{history:[current?.actionId??0,source,target,previous?.actionId??0,previous?.participants[0]??0,previous?.targets[0]??-1,previous?.resolvedFirstTarget??previous?.targets[0]??-1,row.currentActionIndex],snapshotPresent:[!!current?.participants.length,!!current?.targets.length,!!previous?.participants.length,!!previous?.targets.length],battleType:[row.battleType],sourceVisualFlagsBytes:bytes(actor?.visualFlags??0),objectPresent:IDS.map(id=>objects.has(id)&&objects.get(id).lookupPresent!==false),objectVisualPresent:IDS.map(id=>objects.has(id)&&objects.get(id).visualPresent!==false),objectFlagsBytes:IDS.flatMap(id=>bytes(objects.get(id)?.objectFlags??0)),currentParticipants:pad(current?.participants??[],12),participantCount:[current?.participants.length??0],actionRecordPresent:[!!record],actionWord18Bytes:record?.slice(24,28)??[0,0,0,0],presentationState:[row.presentationState??0],enabled:[enabled]};
}

function linkedActionEntries(programs,head){
 const entries=[];for(let at=head;at>=0;at=programs[at].next??-1)for(const action of programs[at].actions)entries.push({program:at,action});return entries;
}

export async function createCameraProgramRunner({runGraph,getModel,onTrace}={}){
 const models=Object.fromEntries(await Promise.all(CAMERA_PROGRAM_MODELS.map(async name=>[name,await getModel(name)])));
 async function call(name,rows,phase){
  const model=models[name];for(const[i,row]of rows.entries()){const errors=validateGraphInputs(model.contract,row);for(const d of model.inputs)if(!Array.isArray(row[d.name])||row[d.name].length!==d.shape[1])errors.push(d.name+': width');if(errors.length)throw Error(name+' lane'+i+': '+errors.join('; '));}
  const out=await runGraph(name,rows,{phase});if(out.length!==rows.length)throw Error('Program search lane count changed');if(onTrace)await onTrace({phase,model:name,inputs:clone(rows),outputs:clone(out)});return out;
 }
 async function run({rows,enabled=rows.map(r=>r.enabled!==false)}={}){
  rows.forEach(validateResidentPrograms);const contexts=rows.map((r,i)=>cameraProgramContext(r,enabled[i])),searches=[];
  rows.forEach((row,lane)=>{
   const source=contexts[lane].history[1],actor=new Map([...row.roster,...row.lookupObjects??[]].map(a=>[a.id,a])).get(source);
   for(const[kind,head,query]of[['normal',actor?.residentProgram??-1,contexts[lane].history[0]],['special',row.fallbackProgram??-1,221]])searches.push({lane,kind,query,entries:linkedActionEntries(row.residentPrograms,head),offset:0,accumulator:[0,-1,-1]});
  });
  while(true){
   const active=searches.filter(s=>s.offset<s.entries.length);if(!active.length)break;
   const inputs=active.map(s=>{const chunk=s.entries.slice(s.offset,s.offset+CHUNK);return{accumulator:s.accumulator,queryAction:[s.query],count:[chunk.length],actions:pad(chunk.map(e=>e.action),CHUNK),programIds:pad(chunk.map(e=>e.program),CHUNK,-1),enabled:[true]};}),out=await call('rom-common-camera-program-search',inputs,'camera:program:membership');
   active.forEach((s,i)=>{s.accumulator=[...out[i].nextAccumulator];s.offset=s.accumulator[0]>=2?s.entries.length:s.offset+inputs[i].count[0];});
  }
  const inputs=contexts.map((context,i)=>({...context,normalMatches:searches[i*2].accumulator,specialMatches:searches[i*2+1].accumulator})),outputs=await call('rom-common-camera-program-admission',inputs,'camera:program:admission');
  const projects=outputs.map((out,i)=>({lane:i,codes:rows[i].residentPrograms[out.selectedProgram[0]]?.codes??[],offset:0,first:true,enabled:!!out.selectorReached[0],accumulator:[0,SENTINEL,SENTINEL,SENTINEL,0,0,0]}));
  while(true){
   const active=projects.filter(p=>p.first||p.offset<p.codes.length);if(!active.length)break;
   const feed=active.map(p=>{const chunk=p.codes.slice(p.offset,p.offset+CHUNK);return{accumulator:p.accumulator,count:[chunk.length],opcodes:pad(chunk.map(c=>c.opcode),CHUNK),parameters:pad(chunk.map(c=>c.parameter??0),CHUNK),enabled:[p.enabled]};}),out=await call('rom-common-camera-program-project',feed,'camera:program:projection');
   active.forEach((p,i)=>{if(!out[i].supported[0])throw Error('Program opcode index cannot be represented exactly');p.accumulator=[...out[i].nextAccumulator];p.offset+=feed[i].count[0];p.first=false;outputs[p.lane].programProjection=[...out[i].programProjection];});
  }
  return{outputs,inputs,contexts};
 }
 return{run,models:CAMERA_PROGRAM_MODELS};
}
