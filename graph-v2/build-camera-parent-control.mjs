import {sourceSHA256} from '../data/source-authority.mjs';
// The enclosing preprocessor/dispatcher/planner branch, separate from the
// outer BACT/presentation function. No existing model is regenerated.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Graph} from './graph-builder.mjs';
const source='src/Combat/Overlay_25/func_ov025_021dc0d8.cpp',hash=b=>createHash('sha256').update(b).digest('hex');
export async function buildCameraParentControl({capacity=4}={}){
 if(![4,12].includes(capacity))throw Error('Camera parent actor capacity must be 4 or 12');
 const contract={authority:{matchingCommit:'e0d1df250bfc554efe2fd37513a4ad3867a77b10',source,sourceSHA256:sourceSHA256(source),address:'JPN overlay25:0x021dc9cc',typeGetter:'JPN overlay0:0x021613e0; raw RNG+0x81fe u16 values800/801'},
 scope:'After mandatory preprocessing, special battle type800/801 with an existing first participant ID0 returns before dispatch and preserves scene+5b41. Ordinary entry writes only bit2 from dispatcher return lowbit and plans routes only when that bit is1. Outer BACT program/presentation selection is independent and outside this model.',
 scopeJa:'前処理後の特殊戦闘判定とsceneフラグ更新です。800/801で現在の先頭参加者ID0ならdispatcher前に戻り、それ以外は戻り値の下位bitをsceneへ写します。',
 defaults:{battleType:0,sourceId:0,sourcePresent:true,sceneByte:0,dispatcherReturn:1,commit:true,enabled:true,ids:[0,192,...Array(capacity-2).fill(0)],rosterCount:2,visualFlagsBytes:Array(capacity*4).fill(0)},
 inputDomains:{battleType:{min:0,max:65535,integer:true},sourceId:{min:0,max:65535,integer:true},sceneByte:{min:0,max:255,integer:true},dispatcherReturn:{min:0,max:1,integer:true},ids:{min:0,max:255,integer:true,width:capacity},rosterCount:{min:0,max:capacity,integer:true},visualFlagsBytes:{min:0,max:255,integer:true,width:capacity*4}},
 labels:{battleType:'Initial RNG+0x81fe u16',sourceId:'Current first participant ID',sourcePresent:'Current first participant exists',sceneByte:'Initial scene+0x5b41 byte',dispatcherReturn:'Computed dispatcher return',commit:'Apply the computed dispatcher result',enabled:'Execute enclosing caller'},feedback:{},defaultSteps:1,unsupported:'The surrounding BACT lookup, rendering geometry and row+4 producer are not claimed. Dispatcher return0 does not imply the outer presentation is skipped.'};
 const g=new Graph(capacity===4?'rom-camera-parent-control':`rom-camera-parent-control${capacity}`,contract),type=g.input('battleType'),sourceId=g.input('sourceId'),present=g.input('sourcePresent',['N',1],'bool'),scene=g.input('sceneByte'),result=g.input('dispatcherReturn'),commit=g.input('commit',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool'),ids=g.split(g.input('ids',['N',capacity]),capacity),count=g.input('rosterCount'),flags=g.split(g.input('visualFlagsBytes',['N',capacity*4]),capacity*4);
 const special=g.or(g.eq(type,800),g.eq(type,801));
 const early=g.and(enabled,special,present,g.eq(sourceId,0)),dispatch=g.and(enabled,g.not(early));
 const bit2=g.sub(g.floor(g.mul(scene,.25)),g.mul(g.floor(g.mul(scene,.125)),2));
 const next=g.add(g.sub(scene,g.mul(bit2,4)),g.mul(result,4));
 const included=ids.map((id,i)=>g.and(g.lt(i,count),g.not(g.and(special,g.gt(id,0),g.lt(id,4)))));
 const flag80=ids.map((_,i)=>g.ge(flags[i*4],128));
 const flag100=ids.map((_,i)=>g.gt(g.sub(flags[i*4+1],g.mul(g.floor(g.mul(flags[i*4+1],.5)),2)),0));
 contract.rosterRule='Matching func_ov000_0215e9fc: special battle800/801 lists party0 only, then enemies; existing nonzero-party objects remain lookup-capable but are absent from the compact processing roster.';
 contract.visualFlagsRule='flag80 and flag100 are decoded from actual raw visual+0x20, not independent stale booleans. Preprocessing clears0x10/0x40 and leaves these bits unchanged.';
 for(const [name,value]of Object.entries({earlyReturn:early,dispatchEnabled:dispatch,routeEnabled:g.and(dispatch,g.gt(result,0)),nextSceneByte:g.where(g.and(dispatch,commit),next,scene),includedRows:g.cat(included),flag80:g.cat(flag80),flag100:g.cat(flag100)}))g.output(value,name);
 return g;
}
if(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url){const g=await buildCameraParentControl(),model=g.model();for(const [ext,value]of [['onnx',model],['json',JSON.stringify(g.json(),null,2)+'\n']]){const p=new URL(`${g.name}.${ext}`,import.meta.url),t=new URL(`${g.name}.${ext}.pending-${process.pid}`,import.meta.url);await writeFile(t,value);await rename(t,p);}console.log(JSON.stringify({name:g.name,nodes:g.nodes.length,bytes:model.length,sha256:hash(model)}));}
