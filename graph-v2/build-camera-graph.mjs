// A bounded open-list step represented with shared tensor operations. The
// adjacency matrix is fixed ROM geometry, not an enumerated path lookup table.
import {Graph} from './graph-builder.mjs';
import {writeFile} from 'node:fs/promises';
const valid=(r,c)=>r>=0&&r<9&&c>=0&&c<9&&!(r%2&&c===8);
const id=(r,c)=>valid(r,c)?r*9+c:255;
export const cameraNeighbors=Array.from({length:81},(_,i)=>{
 const r=Math.floor(i/9),c=i%9;if(!valid(r,c))return Array(6).fill(255);
 return r%2?[id(r+1,c),id(r+1,c+1),id(r,c-1),id(r,c+1),id(r-1,c),id(r-1,c+1)]:[id(r+1,c-1),id(r+1,c),id(r,c-1),id(r,c+1),id(r-1,c-1),id(r-1,c)];
});
const g=new Graph('rom-camera-route-step',{
 authority:'JPN overlay0:0x02171498 / neighbors0x02170f58; matching func_ov025_021e2148; LIFO insertion, first minimum, first equal-distance parent',
 scope:'One exact open-list pop and up to six ordered discoveries, plus goal-to-start path projection. Iterate 81 times with feedback from initialized iteration0. No camera RNG, actor occupancy builder or row+4 consumer is included.',
 scopeJa:'カメラ最短経路の1 step。状態を81回渡すと有効77ノードの探索が完了します。開始から目標への経路を、ROMと同じ目標→開始の順で返します。',
 bounds:'start/goal are valid nodes in0..80 excluding17,35,53,71; at most12 blocked nodes; maxRoute1..16. states/meta must be zero on first call and subsequently copied only from this graph.',
 stateLayout:'states[324]=distance[81],parent[81],insertionStamp[81],closed[81]. meta[3]=insertionCounter,iteration,finished. Virtual sufficient state, not an address-for-address emulation of ROM scratch memory.',
 feedback:{states:'nextStates',meta:'nextMeta'},defaultSteps:81,rateUnit:'最短経路 microstep / 秒',
 defaults:{start:0,goal:20,blocked:Array(81).fill(0),maxRoute:16,states:Array(324).fill(0),meta:[0,0,0]},
 labels:{start:'開始node',goal:'目標node',blocked:'通行不可mask 81個（1=nodeを塞ぐ）',maxRoute:'保存する経路長',states:'継続state（初回は全0）',meta:'挿入順counter / iteration / 完了'},
 inputDomains:{start:{integer:true,values:Array.from({length:81},(_,i)=>i).filter(i=>valid(Math.floor(i/9),i%9))},goal:{integer:true,values:Array.from({length:81},(_,i)=>i).filter(i=>valid(Math.floor(i/9),i%9))},maxRoute:{integer:true,min:1,max:16},blocked:{values:[0,1]}},
 fieldDomains:{states:[...Array.from({length:81},()=>({integer:true,min:0,max:255})),...Array.from({length:81},()=>({integer:true,values:[...Array.from({length:81},(_,i)=>i).filter(i=>valid(Math.floor(i/9),i%9)),255]})),...Array.from({length:81},()=>({integer:true,min:0,max:81})),...Array.from({length:81},()=>({values:[0,1]}))],meta:[{integer:true,min:0,max:81},{integer:true,min:0,max:81},{values:[0,1]}]},
 relations:[{left:{input:'blocked',reduce:'sum'},op:'<=',right:{value:12}}],
 initialization:{counter:{input:'meta',index:1},equals:0,zeroInputs:['states','meta']}
});
const start=g.input('start'),goal=g.input('goal'),blocked=g.input('blocked',['N',81]),maxRoute=g.input('maxRoute'),state=g.input('states',['N',324]),meta=g.input('meta',['N',3]);
const [oldD,oldP,oldS,oldC]=g.split(state,4);for(const x of [oldD,oldP,oldS,oldC])g.values[x].shape=['N',81];
const [oldSerial,iteration,oldFinished]=g.split(meta,3),initial=g.eq(iteration,0),ids=g.constant(Array.from({length:81},(_,i)=>i),'float32',[81]);
const mask=g.constant(Array.from({length:81},(_,i)=>valid(Math.floor(i/9),i%9)?1:0),'float32',[81]),ones=g.constant(Array(81).fill(1),'float32',[81,1]);
const sum=x=>g.op('MatMul',[x,ones],{},{shape:['N',1]});
// A guarded lane-local gather is the exact one-hot projection, including the
// invalid-parent sentinel255. It avoids materializing81-element masks for each
// of the16 path links. GatherElements preserves the independent batch lanes.
const select=(vector,index)=>{
 const ix=g.cast(g.min(g.max(index,0),80),'int32'),constant=g.values[vector].shape[0]!=='N';
 const value=g.op(constant?'Gather':'GatherElements',[vector,ix],{axis:constant?0:1},{shape:['N',1]});
 return g.where(g.and(g.ge(index,0),g.le(index,80)),value,0);
};
const sameStart=g.eq(ids,start),validStart=g.gt(select(mask,start),0),validGoal=g.gt(select(mask,goal),0);
const unavailable=g.and(g.gt(blocked,0),g.not(sameStart)),blockedGoal=g.gt(select(g.cast(unavailable,'float32'),goal),0);
let distance=g.where(initial,g.where(sameStart,0,255),oldD),parent=g.where(initial,255,oldP),stamp=g.where(initial,g.where(sameStart,1,0),oldS),closed=g.where(initial,0,oldC),serial=g.where(initial,1,oldSerial);
let finished=g.where(initial,g.cast(g.or(g.not(validStart),g.not(validGoal),blockedGoal),'float32'),oldFinished);
const opened=g.and(g.gt(stamp,0),g.lt(distance,255),g.eq(closed,0));
const key=g.where(opened,g.add(g.mul(distance,1024),g.sub(1023,stamp)),1000000),keys=g.split(key,81);
let minimum=keys[0],current=g.constant(0);
for(let i=1;i<81;i++){const take=g.lt(keys[i],minimum);current=g.where(take,i,current);minimum=g.min(keys[i],minimum);}
const hasCurrent=g.lt(minimum,1000000),running=g.eq(finished,0),pop=g.and(running,hasCurrent),atGoal=g.eq(current,goal),expand=g.and(pop,g.not(atGoal));
finished=g.where(running,g.cast(g.or(g.not(hasCurrent),atGoal),'float32'),finished);
closed=g.where(g.and(g.eq(ids,current),pop),1,closed);
const onehot=g.cast(g.eq(ids,current),'float32'),neighbors=g.op('MatMul',[onehot,g.constant(cameraNeighbors.flat(),'float32',[81,6])],{},{shape:['N',6]}),ordered=g.split(neighbors,6);
const nextDistance=g.add(g.floor(g.mul(minimum,1/1024)),1);
for(const neighbor of ordered){
 const discover=g.and(expand,g.eq(ids,neighbor),g.eq(distance,255),g.not(unavailable),g.gt(mask,0));
 const count=sum(g.cast(discover,'float32')),nextSerial=g.add(serial,count);
 distance=g.where(discover,nextDistance,distance);parent=g.where(discover,current,parent);stamp=g.where(discover,nextSerial,stamp);serial=nextSerial;
}
const ready=g.and(g.gt(finished,0),validStart,validGoal,g.not(blockedGoal),g.lt(select(distance,goal),255));
const length=g.where(ready,g.min(g.add(select(distance,goal),1),maxRoute),0),path=[];let at=goal;
for(let j=0;j<16;j++){const used=g.lt(j,length);path.push(g.where(used,at,0));at=select(parent,at);}
g.output(g.cat([distance,parent,stamp,closed]),'nextStates');
g.output(g.cat([serial,g.add(iteration,g.cast(running,'float32')),finished]),'nextMeta');
g.output(g.cat(path),'route');g.output(length,'count');g.output(finished,'finished');g.output(g.where(pop,current,-1),'poppedNode');
for(const node of g.nodes){node.exactArithmetic=true;node.exactArithmeticReason='All supported state values and products are bounded integer values below2^24; discovery stamps<=81, distance<=80, sentinel=1000000, 81-term projection sums<=20655.';}
const result=await g.save();await writeFile(new URL('camera-models.json',import.meta.url),JSON.stringify([result],null,2)+'\n');console.log(JSON.stringify(result));
