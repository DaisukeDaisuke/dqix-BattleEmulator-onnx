import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const authority = {
  '0215c758': '37be63b19166c2dd9aaf5f975a0473050a344ba0b9ce063257fe81681574928d',
  '02160030': '03389919486632ccf069412b3c3b72feb0376db208ddfdd7bd9825f707c93ef7',
  '02160068': '9260991499b7a7e9f873576059bfda1ec26c34b9dcc5cba9f565d9e6593908ca',
  '021600cc': 'b7653ea7d48164bd12ed797355a9d4a890c55d25962cf92d257e8141cc82afb6',
  '0215e918': '83650a8994dcfbcab73d4b11da7414ccab3d599ab4b1a3316d6d2a701d13bb95',
  '0215e938': '0e4c46f834b73a9b1dda6b367d97a8332dfe7db2f19b9fd15f8de69846f53a39',
  '0215e958': '7b2aa62a0f6b25fedea2075fa24a4e43b5207d2120f448bb232a1d90b8020891',
  '0215e9d8': '28f00229e856da5fe5e76f282bd64f9e93fcca0db63f07c75b22ca9f1983916e',
  '0215a88c': '65ac07b8ecbc42cd9b0a111488d6bf11e170622eb8276ef6bd36745b69bbc201',
  '02157cdc': '84c08a161b1582d5e6c2af9ad96649529b270d9de0472cd9362a3e1ede9e0ff4',
  '0215fe00': '4aa3ef5062687aa94c602476e5ca8463cc82a87ebf7a2c85a94d45c02d6d6059',
  '0215e9b8': 'ca2548f692342bdaeb37119f928194c44a3171de2287762f5042a429d9378006',
};

// The caller passes computed semantic payloads. This module allocates the
// original record slots, writes their byte layouts and links those records.
// Absolute addresses stay in u16 limbs; no pointer passes through float32.
export function buildCommonPeriodicArena() {
  const g = new Graph('rom-common-periodic-arena', {
    authority: Object.entries(authority).map(([address,sha256]) => ({path:`src/Combat/Overlay_0/func_ov000_${address}.cpp`,sha256})),
    address: 'JPN0215ded8 / matching USA0215c758',
    scope: 'One computed periodic group produces command40, participant52, target36, impact36 and message8 patches with exact arena indices and linked pointers. It retains untouched message padding and original u8 counter arithmetic. Input payloads must come from the shared periodic producer. No message rendering, camera readiness or next-turn completion is inferred.',
    inputContractVersion: 1,
    counterFields: ['commands','participants','targets','impacts','messages'],
    defaults: {arenaBaseU16:[0,0],counters:[0,0,0,0,0],actionId:930,startMessage:0,clearStartMessageOnImpact:false,targetCount:1,targetIds:[0,-1,-1,-1,-1,-1,-1,-1],participantVitals:[0,0],impactPayloadBytes:Array(288).fill(0),impactMessageIds:[0,0],impactMessageCount:0,messagePaddingBytes:Array(504).fill(0),enabled:true},
    inputDomains: {arenaBaseU16:{width:2,min:0,max:65535,integer:true},counters:{width:5,min:0,max:255,integer:true},targetCount:{width:1,min:1,max:8,integer:true},impactPayloadBytes:{width:288,min:0,max:255,integer:true},impactMessageCount:{width:1,min:0,max:2,integer:true},messagePaddingBytes:{width:504,min:0,max:255,integer:true}},
  });
  const input = (name,width=1,type='float32') => g.input(name,['N',width],type);
  const base = g.split(input('arenaBaseU16',2),2), counters = g.split(input('counters',5),5);
  const action = input('actionId'), startMessage = input('startMessage'), count = input('targetCount');
  const clearStartMessage = input('clearStartMessageOnImpact',1,'bool');
  const ids = g.split(input('targetIds',8),8), payload = g.split(input('impactPayloadBytes',288),288);
  const participantVitals = g.split(input('participantVitals',2),2);
  const messageIds = g.split(input('impactMessageIds',2),2), messageCount = input('impactMessageCount');
  const padding = input('messagePaddingBytes',504), enabled = input('enabled',1,'bool'), zero = g.mul(count,0);
  const mod = (x,n) => g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n));
  const bytes16 = x => {const u=mod(x,65536);return [mod(u,256),g.floor(g.mul(u,1/256))];};
  const pointer = (offset,present) => {
    const sum=g.add(base[0],offset),low=mod(sum,65536),high=mod(g.add(base[1],g.floor(g.mul(sum,1/65536))),65536);
    return [...bytes16(low),...bytes16(high)].map(x=>g.where(present,x,0));
  };
  const supported = g.and(g.ge(count,1),g.le(count,8),g.ge(messageCount,0),g.le(messageCount,2),...counters.flatMap(x=>[g.ge(x,0),g.le(x,255)]));
  const active = g.and(enabled,supported,g.lt(counters[0],72),g.lt(counters[1],72));
  const written = g.where(active,g.min(count,g.max(g.sub(136,counters[2]),0)),0);
  const header = Array(40).fill(zero), participant = Array(52).fill(zero);
  const store = (record,offset,values) => values.forEach((value,i)=>record[offset+i]=value);
  store(header,0,bytes16(action));store(header,6,bytes16(65535));header[8]=g.add(zero,1);header[9]=written;
  store(header,16,pointer(g.add(0x20,g.mul(counters[1],52)),active));
  store(header,20,pointer(g.add(0xec0,g.mul(counters[2],36)),g.gt(written,0)));
  // Poison clears the header's start message only inside an allocated target
  // branch. When the target arena is full, the initial action message survives.
  store(header,24,bytes16(g.where(g.and(clearStartMessage,g.gt(written,0)),0,startMessage)));
  store(participant,28,bytes16(65535));store(participant,32,bytes16(ids[0]));
  // The participant reads current actor HP/MP; the separate impact operands
  // may describe another snapshot and must not replace this current state.
  store(participant,34,participantVitals.flatMap(bytes16));
  const targetBytes=[],impactBytes=[],messageBytes=[],targetIndices=[],impactIndices=[],messageIndices=[];
  let nextMessage=counters[4];
  for(let i=0;i<8;i++){
    const hit=g.lt(i,written),targetIndex=g.add(counters[2],i),impactIndex=mod(g.add(counters[3],2*i),256);
    const target=Array(36).fill(zero),impact=payload.slice(i*36,(i+1)*36);
    const messageSlots=[],messageGates=[];
    for(let j=0;j<2;j++){
      const gate=g.and(hit,g.gt(messageCount,j),g.lt(nextMessage,252));
      messageSlots.push(nextMessage);messageGates.push(gate);
      nextMessage=g.add(nextMessage,g.cast(gate,'float32'));
    }
    store(target,0,pointer(g.add(0x21e0,g.mul(impactIndex,36)),hit));
    store(target,12,bytes16(65535));store(target,14,bytes16(ids[i]));
    store(target,16,bytes16(65535));store(target,18,bytes16(65535));
    target[23]=g.add(zero,1);target[24]=g.add(zero,1);
    store(target,32,pointer(g.add(0xec0,g.mul(g.add(targetIndex,1),36)),g.lt(i+1,written)));
    store(impact,8,pointer(g.add(0x5480,g.mul(messageSlots[0],8)),messageGates[0]));
    impact[31]=g.add(g.cast(messageGates[0],'float32'),g.cast(messageGates[1],'float32'));
    store(impact,32,[zero,zero,zero,zero]);
    for(let j=0;j<2;j++){
      const record=Array(8).fill(zero);store(record,0,bytes16(messageIds[j]));
      for(let b=0;b<2;b++){
        const index=g.cast(g.add(g.mul(g.min(messageSlots[j],251),2),b),'int32');
        record[2+b]=g.op('GatherElements',[padding,index],{axis:1},{shape:['N',1],dtype:'float32'});
      }
      if(j===0)store(record,4,pointer(g.add(0x5480,g.mul(messageSlots[1],8)),messageGates[1]));
      messageBytes.push(...record.map(x=>g.where(messageGates[j],x,0)));
      messageIndices.push(g.where(messageGates[j],messageSlots[j],-1));
    }
    targetBytes.push(...target.map(x=>g.where(hit,x,0)));impactBytes.push(...impact.map(x=>g.where(hit,x,0)));
    targetIndices.push(g.where(hit,targetIndex,-1));impactIndices.push(g.where(hit,impactIndex,-1));
  }
  const nextCounters=[g.add(counters[0],g.cast(active,'float32')),g.add(counters[1],g.cast(active,'float32')),g.add(counters[2],written),mod(g.add(counters[3],g.mul(written,2)),256),nextMessage];
  g.output(g.cat(nextCounters),'nextCounters');g.output(g.where(active,counters[0],-1),'commandIndex');g.output(g.where(active,counters[1],-1),'participantIndex');
  g.output(g.cat(header.map(x=>g.where(active,x,0))),'commandBytes');g.output(g.cat(participant.map(x=>g.where(active,x,0))),'participantBytes');
  for(const [name,values] of Object.entries({targetIndices,impactIndices,messageIndices,targetBytes,impactBytes,messageBytes}))g.output(g.cat(values),name);
  g.output(g.or(g.not(enabled),supported),'supported');g.output(active,'created');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const saved=await buildCommonPeriodicArena().save(new URL('./',import.meta.url));
  console.log(JSON.stringify({name:saved.name,nodes:saved.nodes,bytes:saved.bytes}));
}
