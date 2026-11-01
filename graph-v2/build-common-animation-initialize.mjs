import {Graph} from './graph-builder.mjs';
import {COMMON_ANIMATION_STATE_OFFSETS} from './common-animation-fields.mjs';

/** The complete set of initializer stores consumed by the pure opcode model.
 * Other initializer effects retain their separate, explicit producers. */
export function buildCommonAnimationInitialize(){
  const width=COMMON_ANIMATION_STATE_OFFSETS.length,g=new Graph('rom-common-animation-initialize',{
    inputContractVersion:1,
    authority:{entry:'JPN021e91c0 / matching021e8d20',path:'src/Combat/Overlay_25/func_ov025_021e8d20.cpp',sha256:'45e363ee428244a622c09618c961534d28462ca8849344fcf37050b116d4a3e7'},
    scope:'Exactly the eighteen raw u16 script fields consumed by the pure animation opcodes, after the actual program initializer is reached. Linked participants and combatant/stats lookup presence are explicit initial operands. The status+18 bit0x20 override comes from the actual participant stats, not actor identity. Other resource, audio, window, flag and allocator effects of the enclosing initializer are separate modules. Unknown stats pointers reject the original dereference. No completion or timing is inferred.',
    stateOffsets:COMMON_ANIMATION_STATE_OFFSETS,
    defaults:{stateU16:Array(width).fill(0),actionId:1,participantPresent:Array(12).fill(false),participantCombatantPresent:Array(12).fill(false),participantStatsPresent:Array(12).fill(false),participantStats18Low16:Array(12).fill(0),enabled:true},
    inputDomains:{stateU16:{width,min:0,max:65535,integer:true},actionId:{width:1,min:0,max:65535,integer:true},participantStats18Low16:{width:12,min:0,max:65535,integer:true}},feedback:{stateU16:'nextStateU16'}
  });
  const prior=g.split(g.input('stateU16',['N',width]),width),action=g.input('actionId'),present=g.split(g.input('participantPresent',['N',12],'bool'),12),combatant=g.split(g.input('participantCombatantPresent',['N',12],'bool'),12),stats=g.split(g.input('participantStatsPresent',['N',12],'bool'),12),raw=g.split(g.input('participantStats18Low16',['N',12]),12),enabled=g.input('enabled',['N',1],'bool');
  const invalid=g.or(...present.map((p,i)=>g.and(p,combatant[i],g.not(stats[i])))),supported=g.or(g.not(enabled),g.not(invalid)),run=g.and(enabled,supported),special=g.or(...present.map((p,i)=>g.and(p,combatant[i],stats[i],g.gt(g.sub(g.floor(g.mul(raw[i],1/32)),g.mul(g.floor(g.mul(raw[i],1/64)),2)),0))));
  const values=new Map([[0x21c,g.where(special,31,1)],[0x220,30],[0x222,65535],[0x224,g.cast(g.or(g.eq(action,1),g.eq(action,2)),'float32')],[0x226,0],[0x548,0],[0x54a,0],[0x554,65535],[0x55c,65535],[0x566,0],[0x568,0],[0x56e,0],[0x570,0],[0x572,0],[0x574,0],[0x57c,0],[0x57e,0],[0x580,0x333]]);
  const next=COMMON_ANIMATION_STATE_OFFSETS.map((offset,i)=>g.where(run,values.get(offset),prior[i]));
  g.output(supported,'supported');g.output(run,'storesCompleted');g.output(g.and(run,special),'requiresParticipantResource');g.output(g.cat(next),'nextStateU16');g.output(g.or(g.gt(next[3],0),g.gt(next[4],0)),'tailOwnerPresent');g.output(g.mul(action,0),'consumed');return g;
}
