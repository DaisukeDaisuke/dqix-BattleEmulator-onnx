import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {sourceSHA256} from '../data/source-authority.mjs';

export function buildCommonCameraCommand(){
  const authority=path=>({path,sha256:sourceSHA256(path)});
  const g=new Graph('rom-common-camera-command',{
    inputContractVersion:1,
    authority:['src/Combat/Overlay_0/func_ov000_02160030.cpp','src/Combat/Overlay_0/func_ov000_0215bbbc.cpp','src/Combat/Overlay_0/func_ov000_0215c2d0.cpp','src/Combat/Overlay_0/func_ov000_0215858c.cpp','src/Combat/Overlay_24/func_ov024_021eb5d0.cpp','src/Combat/Overlay_24/func_ov024_021e6a90.cpp'].map(authority),
    scope:'Camera command metadata from a completed common numerical target operation. Rank, ailment, tension and MP changes do not require message/heap reconstruction. Target-header combo bits are emitted at their original numerical postprocess point, before final damage and combo reset. Additional command producers and redirected source/target records remain explicit boundaries.',
    commandFields:['actionId','messageId','sourceId','targetId','flagsA','flagsB'],
    defaults:{actionId:1,sourceId:0,targetId:192,effectiveActionId:1,effectiveSourceId:0,participantCount:1,targetCount:1,cameraFlagsB:0,critical:false,dodged:false,guarded:false,metadataPresent:true,reactionEvent:false,recoveryEvent:false,auxiliaryEvent:false,terminal:false,partyWeaponMessage:false,enabled:true},
    inputDomains:{actionId:{width:1,min:0,max:65535,integer:true},sourceId:{width:1,min:0,max:199,integer:true},targetId:{width:1,min:0,max:199,integer:true},cameraFlagsB:{width:1,min:0,max:255,integer:true}}
  });
  const x={};for(const name of ['actionId','sourceId','targetId','effectiveActionId','effectiveSourceId','participantCount','targetCount','cameraFlagsB'])x[name]=g.input(name);
  for(const name of ['critical','dodged','guarded','metadataPresent','reactionEvent','recoveryEvent','auxiliaryEvent','terminal','partyWeaponMessage','enabled'])x[name]=g.input(name,['N',1],'bool');
  const validActor=id=>g.or(g.and(g.ge(id,0),g.le(id,3)),g.and(g.ge(id,192),g.le(id,199))),zero=g.mul(x.actionId,0),
    admitted=g.and(x.metadataPresent,g.eq(x.participantCount,1),g.ge(x.targetCount,1),g.le(x.targetCount,8),validActor(x.sourceId),validActor(x.targetId),g.eq(x.effectiveSourceId,x.sourceId),g.eq(x.effectiveActionId,x.actionId),g.not(x.auxiliaryEvent),g.not(x.terminal),g.not(x.partyWeaponMessage)),
    self=g.eq(x.sourceId,x.targetId),action=g.where(g.and(self,g.or(g.eq(x.actionId,168),g.eq(x.actionId,330))),940,g.where(g.and(self,g.or(g.eq(x.actionId,183),g.eq(x.actionId,184))),941,x.actionId)),
    flagsA=g.add(g.cast(x.critical,'float32'),g.add(g.mul(g.cast(x.guarded,'float32'),2),g.mul(g.cast(x.dodged,'float32'),4)));
  g.output(g.cat([action,zero,x.sourceId,x.targetId,flagsA,x.cameraFlagsB]),'command');
  g.output(g.cat([g.add(zero,942),zero,x.sourceId,x.sourceId,zero,g.add(zero,4)]),'reactionCommand');g.output(g.and(x.enabled,admitted,x.reactionEvent),'reactionWrote');
  g.output(g.cat([g.add(zero,944),zero,x.sourceId,x.sourceId,zero,g.add(zero,4)]),'recoveryCommand');g.output(g.and(x.enabled,admitted,x.recoveryEvent),'recoveryWrote');
  g.output(g.or(g.not(x.enabled),admitted),'supported');g.output(g.and(x.enabled,admitted),'wrote');return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await buildCommonCameraCommand().save(new URL('./',import.meta.url));console.log(JSON.stringify({name:r.name,nodes:r.nodes,bytes:r.bytes}));}
