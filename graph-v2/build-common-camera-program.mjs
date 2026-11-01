import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';
import {commonMissingProgramArchiveKind} from './build-common-presentation-resource.mjs';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],SENTINEL=16777215,CHUNK=32;
const authority=['src/Combat/Overlay_25/func_ov025_021dbe10.cpp','src/Combat/Overlay_25/func_ov025_021dfa9c.cpp','src/Combat/Overlay_25/func_ov025_021e8d20.cpp','src/Combat/Main/func_02048ab4.cpp','src/Combat/Overlay_0/func_ov000_02169a58.cpp','src/Combat/Overlay_0/func_ov000_02169aa4.cpp','src/Combat/Overlay_0/func_ov000_02169b04.cpp','src/Combat/Overlay_0/func_ov000_02169b54.cpp'].map(path=>({path,sha256:sourceSHA256(path)}));
const integer=(width,min,max)=>({width,min,max,integer:true});

// The host flattens the declared acyclic linked headers in their actual order.
// All membership, duplicate suppression and first/second-match decisions stay
// in ONNX. Chunk size bounds one call, not the number of supplied programs.
export function buildCommonCameraProgramSearch(){
 const g=new Graph('rom-common-camera-program-search',{
  authority,scope:'Streaming exact first two distinct matching program headers in original linked order. The accumulator is feedback from preceding chunks of this graph. A repeated action ID within one header counts once. The same model searches an actor chain or the special/fallback chain; no encounter-specific execution exists.',
  defaults:{accumulator:[0,-1,-1],queryAction:1,count:0,actions:Array(CHUNK).fill(0),programIds:Array(CHUNK).fill(-1),enabled:true},
  inputDomains:{accumulator:integer(3,-1,SENTINEL-1),queryAction:integer(1,0,65535),count:integer(1,0,CHUNK),actions:integer(CHUNK,0,65535),programIds:integer(CHUNK,-1,SENTINEL-1)},
  accumulator:['matchingHeaderCountCappedAtTwo','firstProgramIndex','secondProgramIndex'],feedback:{accumulator:'nextAccumulator'}
 });
 const a=g.split(g.input('accumulator',['N',3]),3),query=g.input('queryAction'),count=g.input('count'),actions=g.split(g.input('actions',['N',CHUNK]),CHUNK),ids=g.split(g.input('programIds',['N',CHUNK]),CHUNK),enabled=g.input('enabled',['N',1],'bool');
 let matches=a[0],first=a[1],second=a[2];
 for(let i=0;i<CHUNK;i++){
  const hit=g.and(enabled,g.lt(i,count),g.ge(ids[i],0),g.eq(actions[i],query),g.lt(matches,2),g.not(g.eq(ids[i],first)),g.not(g.eq(ids[i],second))),old=matches;
  second=g.where(g.and(hit,g.eq(old,1)),ids[i],second);first=g.where(g.and(hit,g.eq(old,0)),ids[i],first);matches=g.add(old,g.cast(hit,'float32'));
 }
 g.output(g.cat([matches,first,second]),'nextAccumulator');g.output(g.mul(count,0),'consumed');return g;
}

export function buildCommonCameraProgramProject(){
 const g=new Graph('rom-common-camera-program-project',{
  authority,scope:'Streaming selector-required projection of the actual sequential linked program nodes. All first-opcode locations, ordering predicates and the first0c parameter are computed in ONNX. The supplied program may have any number of chunks; no observed projection is an input.',
  defaults:{accumulator:[0,SENTINEL,SENTINEL,SENTINEL,0,0,0],opcodes:Array(CHUNK).fill(0),parameters:Array(CHUNK).fill(0),count:0,enabled:true},
  inputDomains:{accumulator:integer(7,0,SENTINEL),opcodes:integer(CHUNK,0,SENTINEL),parameters:integer(CHUNK,0,65535),count:integer(1,0,CHUNK)},
  accumulator:['processedCount','first0cIndex','first7Index','first3dIndex','first0cParameter','has20','has22'],feedback:{accumulator:'nextAccumulator'}
 });
 const a=g.split(g.input('accumulator',['N',7]),7),codes=g.split(g.input('opcodes',['N',CHUNK]),CHUNK),parameters=g.split(g.input('parameters',['N',CHUNK]),CHUNK),count=g.input('count'),enabled=g.input('enabled',['N',1],'bool'),supported=g.lt(g.add(a[0],count),SENTINEL);
 let first0c=a[1],first7=a[2],first3d=a[3],parameter=a[4],has20=g.gt(a[5],0),has22=g.gt(a[6],0);
 for(let i=0;i<CHUNK;i++){
  const active=g.and(enabled,supported,g.lt(i,count)),at=g.add(a[0],i),found0c=g.and(active,g.eq(codes[i],12),g.eq(first0c,SENTINEL));
  parameter=g.where(found0c,parameters[i],parameter);first0c=g.where(found0c,at,first0c);
  first7=g.where(g.and(active,g.eq(codes[i],7),g.eq(first7,SENTINEL)),at,first7);
  first3d=g.where(g.and(active,g.eq(codes[i],61),g.eq(first3d,SENTINEL)),at,first3d);
  has20=g.or(has20,g.and(active,g.eq(codes[i],32)));has22=g.or(has22,g.and(active,g.eq(codes[i],34)));
 }
 const has0c=g.lt(first0c,SENTINEL),same=g.and(has0c,g.or(g.le(first7,first0c),g.le(first3d,first0c))),projection=g.add(g.add(g.cast(has0c,'float32'),g.mul(g.cast(same,'float32'),2)),g.add(g.mul(g.cast(has20,'float32'),4),g.mul(g.cast(has22,'float32'),8)));
 g.output(supported,'supported');g.output(g.cat([g.where(g.and(enabled,supported),g.add(a[0],count),a[0]),first0c,first7,first3d,parameter,g.cast(has20,'float32'),g.cast(has22,'float32')]),'nextAccumulator');g.output(g.cat([projection,parameter]),'programProjection');g.output(g.mul(count,0),'consumed');return g;
}

export function buildCommonCameraProgramAdmission(){
 const defaults={history:[1,0,192,1,192,0,0,0],snapshotPresent:[true,true,false,false],battleType:0,sourceVisualFlagsBytes:[0,1,0,0],objectPresent:IDS.map(id=>id===0||id===192),objectVisualPresent:IDS.map(id=>id===0||id===192),objectFlagsBytes:Array(48).fill(0),currentParticipants:[0,...Array(11).fill(0)],participantCount:1,normalMatches:[1,0,-1],specialMatches:[0,-1,-1],actionRecordPresent:true,actionWord18Bytes:[32,0,2,64],presentationState:0,enabled:true};
 const g=new Graph('rom-common-camera-program-admission',{
  authority,scope:'Original resident-program selection, repeated-normal-attack second match, special battle800/801 action221 override, participant flag0x800 and missing-program admission. normalMatches/specialMatches are computed by the shared streaming search, never accepted from an initial battle or observation. Program node projection is a separate shared streaming graph.',
  defaults,inputDomains:{battleType:integer(1,0,65535),sourceVisualFlagsBytes:integer(4,0,255),objectFlagsBytes:integer(48,0,255),currentParticipants:integer(12,0,65535),participantCount:integer(1,0,12),normalMatches:integer(3,-1,SENTINEL-1),specialMatches:integer(3,-1,SENTINEL-1),actionWord18Bytes:integer(4,0,255),presentationState:integer(1,0,255)},
  fieldDomains:{history:['actionId','sourceId','targetId','previousActionId','previousSourceId','previousTargetId','previousResolvedTargetId','currentIndex'].map((name,i)=>({name,min:[2,5,6].includes(i)?-32768:0,max:i===7?72:[2,5,6].includes(i)?32767:65535,integer:true}))}
 });
 const h=g.split(g.input('history',['N',8]),8),snap=g.split(g.input('snapshotPresent',['N',4],'bool'),4),battle=g.input('battleType'),visualFlags=g.split(g.input('sourceVisualFlagsBytes',['N',4]),4),present=g.split(g.input('objectPresent',['N',12],'bool'),12),visual=g.split(g.input('objectVisualPresent',['N',12],'bool'),12),flags=g.split(g.input('objectFlagsBytes',['N',48]),48),participants=g.split(g.input('currentParticipants',['N',12]),12),participantCount=g.input('participantCount'),normal=g.split(g.input('normalMatches',['N',3]),3),specialResult=g.split(g.input('specialMatches',['N',3]),3),record=g.input('actionRecordPresent',['N',1],'bool'),word18=g.split(g.input('actionWord18Bytes',['N',4]),4),state=g.input('presentationState'),enabled=g.input('enabled',['N',1],'bool');
 const sourceExists=g.or(...IDS.map((id,i)=>g.and(g.eq(h[1],id),present[i]))),sourceVisual=g.or(...IDS.map((id,i)=>g.and(g.eq(h[1],id),present[i],visual[i]))),normalCount=g.where(sourceVisual,normal[0],0),normalFirst=g.where(sourceVisual,normal[1],-1),normalSecond=g.where(sourceVisual,normal[2],-1);
 const reset=g.and(enabled,sourceExists,...snap,g.gt(h[7],0),g.eq(h[0],1),g.eq(h[3],1),g.ge(visualFlags[0],128),g.eq(h[1],h[4]),g.eq(h[2],h[5]),g.eq(h[5],h[6]),g.ge(normalCount,2)),special=g.and(g.or(g.eq(battle,800),g.eq(battle,801)),g.eq(h[1],0));
 const selected=g.where(g.and(enabled,snap[0],sourceExists),g.where(special,specialResult[1],g.where(reset,normalSecond,normalFirst)),-1),reached=g.ge(selected,0),nextFlags=[];
 for(let i=0;i<IDS.length;i++){
  const member=g.or(...participants.map((id,j)=>g.and(g.lt(j,participantCount),g.eq(id,IDS[i]))));
  for(let b=0;b<4;b++){const value=flags[i*4+b],oldBit=g.sub(g.floor(g.mul(value,1/8)),g.mul(g.floor(g.mul(value,1/16)),2));nextFlags.push(b===1?g.where(g.and(reached,present[i],member),g.add(value,g.mul(g.sub(1,oldBit),8)),value):value);}
 }
 const operation=g.add(g.floor(g.mul(word18[0],1/32)),g.mul(g.sub(word18[1],g.mul(g.floor(g.mul(word18[1],1/16)),16)),8)),fallbackEntered=g.and(enabled,snap[0],sourceExists,g.not(reached),record),unsupportedSpecial=g.and(fallbackEntered,g.eq(operation,34)),resource=g.and(fallbackEntered,g.not(unsupportedSpecial)),category=g.floor(g.mul(word18[1],1/16));
 const outputs={selectedProgram:selected,selectorReached:reached,membershipCount:normalCount,secondProgram:normalSecond,resetOverride:reset,specialOverride:g.and(enabled,sourceExists,special),nextObjectFlagsBytes:g.cat(nextFlags),nextPresentationState:g.where(resource,4,state),resourceRequest:resource,resourceCategory:category,resourceArchiveKind:commonMissingProgramArchiveKind(g,category,h[1]),messageResourceRequest:reached,resourceRequestCount:g.add(g.cast(reached,'float32'),g.cast(resource,'float32')),supported:g.not(unsupportedSpecial),consumed:g.mul(h[0],0)};
 for(const[name,value]of Object.entries(outputs))g.output(value,name);return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))for(const g of[buildCommonCameraProgramSearch(),buildCommonCameraProgramProject(),buildCommonCameraProgramAdmission()])console.log(JSON.stringify(await g.save()));
