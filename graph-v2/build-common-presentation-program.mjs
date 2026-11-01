import {Graph} from './graph-builder.mjs';
import {fileURLToPath} from 'node:url';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199],SENTINEL=16777215;

// The actual linked opcode order is supplied by the file decoder and linked
// program builder. Repeated chunks remove the historical twelve-code limit;
// opcode searches and participant flag writes are shared ONNX operations.
export function buildCommonPresentationProgram(){
 const g=new Graph('rom-common-presentation-program-project',{
  authority:{initialize:'JPN021e91c0 / matching func_ov025_021e8d20',selector:'JPN021dc1d4 / matching func_ov025_021db8d8',opcodeSearches:'matching func_ov000_02169aa4,02169b04,02169b54'},
  scope:'Streaming projection of actual sequential linked program nodes, plus participant Object3D flag0x800 stores from program initialization. The seven-value accumulator comes only from preceding chunks of this graph. No opcode projection or selected program is accepted as an initial result. Other runtime/message/animation initialization belongs to its separate common modules.',
  accumulator:['processedCount','first0cIndex','first7Index','first3dIndex','first0cParameter','has20','has22'],
  defaults:{accumulator:[0,SENTINEL,SENTINEL,SENTINEL,0,0,0],opcodes:Array(32).fill(0),parameters:Array(32).fill(0),count:0,objectFlagsBytes:Array(48).fill(0),objectPresent:Array(12).fill(false),participants:Array(12).fill(0),participantCount:0,programFlagsU16:[0,0],actionId:1,actionCategory:0,sourceId:0,initialize:true,programPresent:true,enabled:true},
  inputDomains:{accumulator:{width:7,min:0,max:SENTINEL,integer:true},opcodes:{width:32,min:0,max:SENTINEL,integer:true},parameters:{width:32,min:0,max:65535,integer:true},count:{width:1,min:0,max:32,integer:true},objectFlagsBytes:{width:48,min:0,max:255,integer:true},participants:{width:12,min:0,max:65535,integer:true},participantCount:{width:1,min:0,max:12,integer:true},programFlagsU16:{width:2,min:0,max:65535,integer:true},actionId:{width:1,min:0,max:65535,integer:true},actionCategory:{width:1,min:0,max:15,integer:true},sourceId:{width:1,min:0,max:65535,integer:true}},
  feedback:{accumulator:'nextAccumulator',objectFlagsBytes:'nextObjectFlagsBytes'}
 });
 const a=g.split(g.input('accumulator',['N',7]),7),codes=g.split(g.input('opcodes',['N',32]),32),parameters=g.split(g.input('parameters',['N',32]),32),count=g.input('count'),flags=g.split(g.input('objectFlagsBytes',['N',48]),48),present=g.split(g.input('objectPresent',['N',12],'bool'),12),participants=g.split(g.input('participants',['N',12]),12),participantCount=g.input('participantCount'),program=g.input('programPresent',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),run=g.and(enabled,program),supported=g.lt(g.add(a[0],count),SENTINEL);
 let first0c=a[1],first7=a[2],first3d=a[3],parameter=a[4],has20=g.gt(a[5],0),has22=g.gt(a[6],0);
 for(let j=0;j<32;j++){
  const active=g.and(run,supported,g.lt(j,count)),at=g.add(a[0],j),found0c=g.and(active,g.eq(codes[j],12),g.eq(first0c,SENTINEL));
  parameter=g.where(found0c,parameters[j],parameter);first0c=g.where(found0c,at,first0c);
  first7=g.where(g.and(active,g.eq(codes[j],7),g.eq(first7,SENTINEL)),at,first7);
  first3d=g.where(g.and(active,g.eq(codes[j],61),g.eq(first3d,SENTINEL)),at,first3d);
  has20=g.or(has20,g.and(active,g.eq(codes[j],32)));has22=g.or(has22,g.and(active,g.eq(codes[j],34)));
 }
 const has0c=g.lt(first0c,SENTINEL),same=g.and(has0c,g.or(g.le(first7,first0c),g.le(first3d,first0c))),projection=g.add(g.add(g.cast(has0c,'float32'),g.mul(g.cast(same,'float32'),2)),g.add(g.mul(g.cast(has20,'float32'),4),g.mul(g.cast(has22,'float32'),8))),nextFlags=[];
 for(let i=0;i<12;i++){
  const member=g.or(...participants.map((id,j)=>g.and(g.lt(j,participantCount),g.eq(id,IDS[i]))));
  for(let b=0;b<4;b++){const v=flags[i*4+b],oldBit=g.sub(g.floor(g.mul(v,1/8)),g.mul(g.floor(g.mul(v,1/16)),2));nextFlags.push(b===1?g.where(g.and(run,present[i],member),g.add(v,g.mul(g.sub(1,oldBit),8)),v):v);}
 }
 const oldProgramFlags=g.input('programFlagsU16',['N',2]),action=g.input('actionId'),category=g.input('actionCategory'),source=g.input('sourceId'),initialize=g.input('initialize',['N',1],'bool'),partySpell=g.and(g.le(source,3),g.or(g.eq(category,2),g.eq(action,504),g.eq(action,914))),nextProgramFlags=g.where(g.and(run,initialize),g.cat([g.mul(g.cast(partySpell,'float32'),2),g.mul(count,0)]),oldProgramFlags);
 const output={supported,selectorReached:g.and(run,supported),messageResourceRequest:g.and(run,supported),nextAccumulator:g.cat([g.where(g.and(run,supported),g.add(a[0],count),a[0]),first0c,first7,first3d,parameter,g.cast(has20,'float32'),g.cast(has22,'float32')]),programProjection:g.cat([projection,parameter]),nextObjectFlagsBytes:g.cat(nextFlags),nextProgramFlagsU16:nextProgramFlags,consumed:g.mul(count,0)};
 for(const[name,value]of Object.entries(output))g.output(value,name);
 return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationProgram().save(),null,2));
