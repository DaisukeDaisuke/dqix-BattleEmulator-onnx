// Structural adapter only: numerical selection, message choices and all arena
// counters/bytes are produced by the shared ONNX semantic and allocator models.
import {commonOrdinaryActionData} from '../data/common-ordinary-presentation.mjs';

export const COMMON_ORDINARY_PRESENTATION_MODELS=['rom-common-ordinary-impact','rom-common-ordinary-arena'];
const limbs=value=>[(value??0)%65536,Math.floor((value??0)/65536)];
const pad=(values,width,value=0)=>[...values,...Array(Math.max(0,width-values.length)).fill(value)];

export function createCommonOrdinaryArenaRunner({definitions}={}){
  if(!definitions?.actions)throw Error('Original shared action definitions are required');
  return async function ordinary({record,arenaBaseU16,counters,messagePaddingBytes=Array(504).fill(0),terminal=false,partyWeaponMessage=false,battleMode=0,runGraph,getModel}){
    const fail=(reason,details={})=>({complete:false,reason,...details}),action=definitions.actions[record.actionId];
    if(!action)return fail('ordinary-action-definition');
    if(!record.presentationBefore||!record.presentationAfter)return fail('ordinary-computed-snapshots');
    if(record.impacts.length!==record.targets.length||record.impacts.length<1||record.impacts.length>8)return fail('ordinary-target-record-capacity');
    if(record.participants.length!==1||record.impacts.some(impact=>impact.sourceId!==record.sourceId||impact.targetId!==impact.originalTargetId))return fail('ordinary-redirected-records');
    const call=async(name,input)=>{
      const ir=await getModel(name),feed={};for(const field of ir.inputs){const value=input[field.name]??ir.contract.defaults?.[field.name];if(value===undefined)throw Error(name+'.'+field.name+': missing computed ordinary operand');feed[field.name]=Array.isArray(value)?value:[value];}
      return(await runGraph(name,[feed]))[0];
    };
    const actionData=commonOrdinaryActionData(action.raw),outputs=[];
    for(const[index,impact]of record.impacts.entries()){
      const input={actionId:record.actionId,operation:action.operation,actionData,sourceId:record.sourceId,targetId:impact.targetId,participantCount:record.participants.length,targetCount:record.impacts.length,
        damage:impact.damage,comboCount:impact.comboCount??record.comboCount??0,comboEnabled:!!action.combo,critical:!!impact.critical,dodged:!!impact.dodged,guarded:!!impact.guarded,operationHit:!!impact.operationHit,effectApplied:!!impact.effectApplied,
        auxiliaryEvent:!!record.auxiliaryEvent,terminal,partyWeaponMessage,battleMode,enabled:true};
      for(const[when,snap]of[['before',impact.presentationBefore],['after',impact.presentationAfter]]){
        if(!snap?.source||!snap?.target)return fail('ordinary-computed-impact-snapshots',{index});
        for(const who of['Source','Target'])for(const type of['Actor','Aux','Status','WakeSkip','Tension'])input[when+who+type]=snap[who.toLowerCase()][type[0].toLowerCase()+type.slice(1)];
        input[when+'TargetRawStatusU16']=limbs(snap.target.rawStatus);input[when+'TargetStatusKinds']=snap.target.statusKinds??0;
      }
      const output=await call('rom-common-ordinary-impact',input);
      if(!output.supported[0]||!output.wrote[0])return fail('ordinary-impact-semantics',{index,actionId:record.actionId});
      outputs.push(output);
    }
    const source=record.presentationAfter.source.actor;
    const input={arenaBaseU16,counters,actionId:record.actionId,sourceId:record.sourceId,participantCount:record.participants.length,participantVitals:[source[0],source[2]],actionData,targetCount:record.impacts.length,targetIds:pad(record.impacts.map(impact=>impact.targetId),8,-1),semanticInputsComplete:true,messagePaddingBytes,enabled:true};
    for(const[field,key]of[['impactFlagsA','command'],['impactFlagsB','command']])input[field]=pad(outputs.map(output=>output[key][field==='impactFlagsA'?4:5]),8);
    for(const[field,key]of[['targetHitFlags','targetHitFlags'],['positiveDamage','positiveDamage'],['secondaryPresent','secondaryPresent'],['primaryMessageIds','primaryMessageId'],['secondaryMessageIds','secondaryMessageId']])input[field]=pad(outputs.map(output=>output[key][0]),8);
    for(const field of['primaryPayloadBytes','secondaryPayloadBytes'])input[field]=pad(outputs.flatMap(output=>output[field]),288);
    const arena=await call('rom-common-ordinary-arena',input);
    if(!arena.supported[0]||!arena.created[0])return fail('ordinary-arena-allocation',{actionId:record.actionId,counters});
    return{complete:true,arena,impacts:outputs};
  };
}
