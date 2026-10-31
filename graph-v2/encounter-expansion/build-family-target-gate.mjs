// This gate checks the target representation before entering a family whose
// numerical kernel has an explicit single identity/self identity contract.
import {Graph} from '../graph-builder.mjs';
export function buildFamilyTargetGate(){
  const g=new Graph('rom-family-target-gate2',{
    routingOnly:true,scope:'Verify semantic planned target identities for one-party0/enemy192 composition. Ordinary single-hit actions require one opposing target; repeated73 requires3/4 planned party0 entries; self-heal30/587 requires one self192 entry. Entries after targetCount are preserved unused padding. Disabled commands are identity and do not fail the lane. Invalid enabled commands stop as unsupported before any action-body RNG; preparation already occurred at its own boundary.',
    scopeJa:'通常攻撃・多段攻撃・自己回復の対象IDと件数を確認し、表現できない対象への行動を未対応として止めます。',
    inputDomains:{sourceIndex:{values:[0,1]},actionId:{min:0,max:680,integer:true},targetCount:{min:0,max:8,integer:true},targets:{width:8,min:-1,max:255,integer:true},enabled:{values:[false,true,0,1]},supported:{values:[0,1]},finished:{values:[0,1]}},defaults:{sourceIndex:1,actionId:73,targetCount:3,targets:[0,0,0,-1,-1,-1,-1,-1],enabled:true,supported:1,finished:0}
  }),source=g.input('sourceIndex'),action=g.input('actionId'),count=g.input('targetCount'),targets=g.split(g.input('targets',['N',8]),8),enabled=g.input('enabled',['N',1],'bool'),supported=g.input('supported'),finished=g.input('finished');
  const repeated=g.eq(action,73),heal=g.or(g.eq(action,30),g.eq(action,587)),expected=g.where(heal,192,g.where(g.eq(source,0),192,0)),shape=g.or(g.and(repeated,g.or(g.eq(count,3),g.eq(count,4))),g.and(g.not(repeated),g.eq(count,1)));
  const valid=g.and(shape,...targets.map((v,i)=>g.or(g.le(count,i),g.eq(v,expected))),g.or(g.and(g.not(repeated),g.not(heal)),g.eq(source,1))),failed=g.and(enabled,g.not(valid));
  g.output(g.and(enabled,valid),'familyEnabled');g.output(g.where(failed,0,supported),'nextSupported');g.output(g.where(failed,1,finished),'nextFinished');g.output(valid,'valid');return g;
}
