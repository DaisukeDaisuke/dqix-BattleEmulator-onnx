import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {COMMON_ORDINARY_ACTION_FIELDS} from '../data/common-ordinary-presentation.mjs';
import {pinOrdinaryAuthority} from './common-ordinary-authority.mjs';

// Allocate one ordinary computed command. Secondary status snapshots precede
// primary damage allocations. The host scatters these byte patches only.
export function buildCommonOrdinaryArena(){
  const capacity=8,defaults={arenaBaseU16:[0,0],counters:[0,0,0,0,0],actionId:1,sourceId:0,participantVitals:[100,10],participantCount:1,targetCount:1,
    actionData:[1,0,0,0,1,1,1,2,5,4,7,8,9,140,155,0,0],targetIds:[192,...Array(7).fill(-1)],
    impactFlagsA:Array(8).fill(0),impactFlagsB:Array(8).fill(8),targetHitFlags:Array(8).fill(0),positiveDamage:Array(8).fill(false),
    secondaryPresent:Array(8).fill(false),primaryMessageIds:Array(8).fill(0),secondaryMessageIds:Array(8).fill(0),
    primaryPayloadBytes:Array(288).fill(0),secondaryPayloadBytes:Array(288).fill(0),messagePaddingBytes:Array(504).fill(0),semanticInputsComplete:false,enabled:true};
  const g=new Graph('rom-common-ordinary-arena',{
    inputContractVersion:1,capacity,defaults,actionDataFields:COMMON_ORDINARY_ACTION_FIELDS,counterFields:['commands','participants','targets','impacts','messages'],
    authority:pinOrdinaryAuthority([
      {path:'src/Combat/Overlay_24/func_ov024_021eb5d0.cpp',role:'original target loop and final header'},
      {path:'src/Combat/Overlay_24/func_ov024_021e80e4.cpp',role:'side-specific messages and grouped suppression'},
      {path:'src/Combat/Overlay_24/func_ov024_021e99d8.cpp',role:'start message'},
      {path:'src/Combat/Overlay_24/func_ov024_021e9b24.cpp',role:'action message data'},
      {path:'src/Combat/Overlay_0/func_ov000_02160030.cpp',role:'command initializer'},
      {path:'src/Combat/Overlay_0/func_ov000_0215fef0.cpp',role:'target initializer'},
      {path:'src/Combat/Overlay_0/func_ov000_0215e958.cpp',role:'impact allocator reads u8 count'},
      {path:'src/Combat/Overlay_0/func_ov000_0215ffc4.cpp',role:'category links'},
      {path:'src/Combat/Overlay_0/func_ov000_0215a88c.cpp',role:'message allocation'}]),
    scope:'One shared ordinary command from one source to up to eight distinct opposing targets. Per-target semantic inputs must be the computed outputs of rom-common-ordinary-impact. It produces complete command40/participant52/target36/impact36/message8 records, exact u16 pointer carries, original u8 impact counter wrap, side-specific header messages, critical messages and group suppression. The same counters compose with the periodic arena.',
    boundaries:['Repeated target auxiliary-message migration, redirected sources, successful other auxiliary events and after-action records need separate shared producers.','The numerical action kernel does not model partial command/target allocation failure. Insufficient command, participant or target capacity is rejected before writes. Message exhaustion preserves the original failed-allocation behavior.','Arena bytes are not rendering readiness or camera completion.'],
    inputDomains:{arenaBaseU16:{width:2,min:0,max:65535,integer:true},counters:{width:5,min:0,max:255,integer:true},targetCount:{width:1,min:1,max:8,integer:true},primaryPayloadBytes:{width:288,min:0,max:255,integer:true},secondaryPayloadBytes:{width:288,min:0,max:255,integer:true},messagePaddingBytes:{width:504,min:0,max:255,integer:true}}
  });
  const input=(name,width=1,dtype='float32')=>g.input(name,['N',width],dtype),split=(name,width,type)=>g.split(input(name,width,type),width),
    base=split('arenaBaseU16',2),counters=split('counters',5),action=input('actionId'),source=input('sourceId'),vitals=split('participantVitals',2),participants=input('participantCount'),count=input('targetCount'),
    fields=split('actionData',COMMON_ORDINARY_ACTION_FIELDS.length),r=Object.fromEntries(COMMON_ORDINARY_ACTION_FIELDS.map((key,i)=>[key,fields[i]])),ids=split('targetIds',8),flagsA=split('impactFlagsA',8),flagsB=split('impactFlagsB',8),hitFlags=split('targetHitFlags',8),positive=split('positiveDamage',8,'bool'),secondary=split('secondaryPresent',8,'bool'),
    primaryMessages=split('primaryMessageIds',8),secondaryMessages=split('secondaryMessageIds',8),primary=split('primaryPayloadBytes',288),extra=split('secondaryPayloadBytes',288),padding=input('messagePaddingBytes',504),complete=input('semanticInputsComplete',1,'bool'),enabled=input('enabled',1,'bool'),zero=g.mul(action,0);
  const mod=(v,n)=>g.sub(v,g.mul(g.floor(g.mul(v,1/n)),n)),bit=(v,n)=>g.eq(mod(g.floor(g.mul(v,1/n)),2),1),bytes16=v=>{const u=mod(v,65536);return[mod(u,256),g.floor(g.mul(u,1/256))];},
    pointer=(offset,present)=>{const sum=g.add(base[0],offset),lo=mod(sum,65536),hi=mod(g.add(base[1],g.floor(g.mul(sum,1/65536))),65536);return[...bytes16(lo),...bytes16(hi)].map(v=>g.where(present,v,0));},
    store=(out,at,values)=>values.forEach((value,i)=>out[at+i]=value),isParty=id=>g.and(g.ge(id,0),g.le(id,3)),sourceParty=isParty(source),damageLike=g.eq(r.operation,1),exists=ids.map((_,i)=>g.lt(i,count));
  const checks=[complete,g.eq(participants,1),g.ge(count,1),g.le(count,8),g.eq(r.afterAction,0),g.eq(r.specialHeader,0),g.lt(counters[0],72),g.lt(counters[1],72),g.le(g.add(counters[2],count),136),...counters.flatMap(v=>[g.ge(v,0),g.le(v,255)])];
  for(let i=0;i<capacity;i++){
    checks.push(g.or(g.not(exists[i]),g.not(g.eq(isParty(ids[i]),sourceParty))));
    for(let j=0;j<i;j++)checks.push(g.or(g.not(exists[i]),g.not(g.eq(ids[i],ids[j]))));
  }
  const supported=g.and(...checks),active=g.and(enabled,supported),hit=exists.map(value=>g.and(active,value));
  let currentImpact=counters[3],currentMessage=counters[4];
  const impactSlots=[],messageSlots=[],messageGates=[],primaryMessageGates=[],secondaryMessageGates=[];
  for(let i=0;i<capacity;i++){
    const hasSecondary=g.and(hit[i],secondary[i]),secondarySlot=currentImpact;
    currentImpact=mod(g.add(currentImpact,g.cast(hasSecondary,'float32')),256);const primarySlot=currentImpact;
    currentImpact=mod(g.add(currentImpact,g.cast(hit[i],'float32')),256);impactSlots.push({secondary:secondarySlot,primary:primarySlot,hasSecondary});
    const secondaryMessage=g.and(hasSecondary,g.gt(secondaryMessages[i],0),g.lt(currentMessage,252)),s=currentMessage;
    currentMessage=g.add(currentMessage,g.cast(secondaryMessage,'float32'));
    const primaryMessage=g.and(hit[i],g.gt(primaryMessages[i],0),g.lt(currentMessage,252)),p=currentMessage;
    currentMessage=g.add(currentMessage,g.cast(primaryMessage,'float32'));
    messageSlots.push(s,p);messageGates.push(secondaryMessage,primaryMessage);secondaryMessageGates.push(secondaryMessage);primaryMessageGates.push(primaryMessage);
  }
  let commandA=zero;for(const flag of[1,2,4])commandA=g.add(commandA,g.where(g.or(...exists.map((keep,i)=>g.and(keep,bit(flagsA[i],flag)))),flag,0));
  let commandB=g.add(zero,8),comboBits=zero;
  for(let i=0;i<capacity;i++){
    commandB=g.where(g.and(exists[i],g.not(bit(flagsB[i],8))),0,commandB);
    const nextCombo=g.mul(g.floor(g.mul(flagsB[i],1/32)),32);comboBits=g.where(g.and(exists[i],g.gt(nextCombo,0)),nextCombo,comboBits);
  }
  commandB=g.add(commandB,comboBits);
  const sum=values=>values.reduce((v,x)=>g.add(v,g.cast(x,'float32')),zero),positiveCount=sum(exists.map((keep,i)=>g.and(keep,positive[i]))),targetParty=isParty(ids[0]),
    successfulTargets=g.where(damageLike,positiveCount,count),blocked=g.or(...exists.map((keep,i)=>g.and(keep,g.or(bit(hitFlags[i],2),bit(hitFlags[i],4))))),
    grouped=g.and(damageLike,g.ge(count,2)),allowFallback=g.or(g.not(damageLike),g.not(blocked),grouped),
    defaultTarget=g.where(targetParty,r.untargetedParty,r.untargetedEnemy),hitTarget=g.where(targetParty,r.hitParty,r.hitEnemy),
    genericSingle=g.where(targetParty,2,5),genericMultiple=g.where(targetParty,3,6),generic=g.where(g.gt(successfulTargets,1),genericMultiple,g.where(g.gt(positiveCount,1),g.where(targetParty,0x261,0x262),genericSingle)),
    chosenHit=g.where(g.gt(hitTarget,0),hitTarget,g.where(damageLike,genericSingle,0));
  // USA021e80e4 considers nonzero-damage target identities only for operation1.
  // A failed status body already owns its message, so its side header stays0.
  let targetMessage=g.where(g.lt(successfulTargets,1),g.where(allowFallback,defaultTarget,0),
    g.where(g.and(primaryMessageGates[0],g.not(damageLike)),0,
      g.where(g.gt(count,1),g.where(g.gt(positiveCount,0),g.where(damageLike,generic,0),g.where(allowFallback,defaultTarget,0)),
        g.where(g.gt(positiveCount,0),chosenHit,g.where(allowFallback,defaultTarget,0)))));
  const partyMessage=g.where(targetParty,targetMessage,r.untargetedParty),enemyMessage=g.where(targetParty,r.untargetedEnemy,targetMessage),
    partyMulti=g.and(targetParty,grouped),enemyMulti=g.and(g.not(targetParty),grouped),
    partyHeaderBits=g.where(g.or(g.eq(partyMessage,3),g.eq(partyMessage,0x261)),3,g.add(g.where(g.eq(partyMessage,2),1,0),g.where(partyMulti,2,0))),
    enemyHeaderBits=g.where(g.or(g.eq(enemyMessage,6),g.eq(enemyMessage,0x262)),24,g.add(g.where(g.eq(enemyMessage,5),8,0),g.where(enemyMulti,16,0))),
    headerFlags=g.where(damageLike,g.add(partyHeaderBits,enemyHeaderBits),0),start=g.where(g.and(sourceParty,g.gt(r.noDamageMpMessage,0),g.eq(positiveCount,0)),0x1ef,g.where(sourceParty,r.startParty,r.startEnemy)),
    criticalMessage=g.where(bit(commandA,1),g.where(sourceParty,r.criticalParty,r.criticalEnemy),0);
  const header=Array(40).fill(zero),participant=Array(52).fill(zero);
  store(header,0,bytes16(action));store(header,6,bytes16(65535));header[8]=g.add(zero,1);header[9]=count;header[10]=commandA;header[11]=g.add(commandB,g.where(g.and(sourceParty,g.gt(r.noDamageMpMessage,0),g.eq(positiveCount,0)),2,0));header[12]=headerFlags;
  store(header,16,pointer(g.add(0x20,g.mul(counters[1],52)),active));store(header,20,pointer(g.add(0xec0,g.mul(counters[2],36)),active));
  store(header,24,[start,partyMessage,enemyMessage].flatMap(bytes16));store(header,34,bytes16(criticalMessage));
  store(participant,28,bytes16(65535));store(participant,32,[source,...vitals].flatMap(bytes16));
  const targetBytes=[],impactBytes=[],messageBytes=[],targetIndices=[],impactIndices=[],messageIndices=[];
  for(let i=0;i<capacity;i++){
    const slots=impactSlots[i],target=Array(36).fill(zero),targetIndex=g.add(counters[2],i),primaryPayload=primary.slice(i*36,(i+1)*36),secondaryPayload=extra.slice(i*36,(i+1)*36);
    store(target,0,pointer(g.add(0x21e0,g.mul(slots.primary,36)),hit[i]));store(target,4,pointer(g.add(0x21e0,g.mul(slots.secondary,36)),slots.hasSecondary));
    store(target,12,bytes16(65535));store(target,14,bytes16(ids[i]));store(target,16,bytes16(65535));store(target,18,bytes16(65535));
    target[23]=g.add(zero,1);target[24]=g.add(zero,1);target[25]=g.cast(secondary[i],'float32');target[28]=hitFlags[i];
    store(target,32,pointer(g.add(0xec0,g.mul(g.add(targetIndex,1),36)),g.and(active,g.lt(i+1,count))));
    for(let j=0;j<2;j++){
      const extraSlot=j===0,payload=extraSlot?secondaryPayload:primaryPayload,present=extraSlot?slots.hasSecondary:hit[i],slot=extraSlot?slots.secondary:slots.primary,msgIndex=messageSlots[i*2+j],msgPresent=messageGates[i*2+j],message=Array(8).fill(zero);
      store(payload,8,pointer(g.add(0x5480,g.mul(msgIndex,8)),msgPresent));payload[31]=g.cast(msgPresent,'float32');store(payload,32,[zero,zero,zero,zero]);
      // Group suppression zeroes selected message IDs; it keeps their nodes,
      // pointers, message count and allocation order intact.
      const originalMessage=extraSlot?secondaryMessages[i]:primaryMessages[i],suppress=g.and(grouped,g.or(...[0x96,0x255,0x97,0x1b9,0x24d,0x2b].map(id=>g.eq(originalMessage,id))));
      store(message,0,bytes16(g.where(suppress,0,originalMessage)));
      for(let b=0;b<2;b++)message[2+b]=g.op('GatherElements',[padding,g.cast(g.add(g.mul(g.min(msgIndex,251),2),b),'int32')],{axis:1},{shape:['N',1]});
      impactBytes.push(...payload.map(v=>g.where(present,v,0)));impactIndices.push(g.where(present,slot,-1));
      messageBytes.push(...message.map(v=>g.where(msgPresent,v,0)));messageIndices.push(g.where(msgPresent,msgIndex,-1));
    }
    targetBytes.push(...target.map(v=>g.where(hit[i],v,0)));targetIndices.push(g.where(hit[i],targetIndex,-1));
  }
  g.output(g.cat([g.add(counters[0],g.cast(active,'float32')),g.add(counters[1],g.cast(active,'float32')),g.add(counters[2],g.where(active,count,0)),currentImpact,currentMessage]),'nextCounters');
  g.output(g.where(active,counters[0],-1),'commandIndex');g.output(g.where(active,counters[1],-1),'participantIndex');
  g.output(g.cat(header.map(v=>g.where(active,v,0))),'commandBytes');g.output(g.cat(participant.map(v=>g.where(active,v,0))),'participantBytes');
  for(const[name,values]of Object.entries({targetBytes,targetIndices,impactBytes,impactIndices,messageBytes,messageIndices}))g.output(g.cat(values),name);
  g.output(g.cat([action,zero,source,ids[0],commandA,header[11]]),'command');g.output(g.cat([start,partyMessage,enemyMessage,criticalMessage]),'headerMessages');
  g.output(g.or(g.not(enabled),supported),'supported');g.output(active,'created');return g;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const saved=await buildCommonOrdinaryArena().save(new URL('./',import.meta.url));console.log(JSON.stringify({name:saved.name,nodes:saved.nodes,bytes:saved.bytes}));
}
