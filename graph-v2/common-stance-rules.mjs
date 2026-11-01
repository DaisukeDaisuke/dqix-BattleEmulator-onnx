import {Graph} from './graph-builder.mjs';
import {commonRawBit,commonRawOverlay} from './common-modifier-rules.mjs';

export const COMMON_STANCE_RULES=Object.freeze([
  {operation:25,field:'doubleDodge',rank:9,flag:'rawStatusBytes',bit:25,durationOffset:0x77,recoveryOffset:0x9a,source:'matching021dde08 /02087f24 /02087f78 /02087ff0',address:'JPN021de6b4'},
  {operation:37,field:'doubleGuard',rank:8,flag:'rawFlagsBytes',bit:0,durationOffset:0x76,recoveryOffset:0x99,source:'matching021ded48 /02088018 /0208806c /020880e4',address:'JPN021df5e0'}
].map(Object.freeze));

// These original setters test the signed raw rank, not the stored flag.
// A zero result removes the stance; every other successful result refreshes
// five actions of duration. Neither operation consumes a random number.
export function commonStanceRank(g,{enabled,present,dead,parameter,rank,flag,duration,recovery}){
  const delta=g.min(2,g.max(-2,parameter)),eligible=g.and(present,g.not(dead),g.or(g.and(g.lt(delta,0),g.gt(rank,-2)),g.and(g.ge(delta,0),g.lt(rank,2)))),applied=g.and(enabled,eligible),next=g.min(2,g.max(-2,g.add(rank,delta))),nonzero=g.not(g.eq(next,0));
  return{applied,rank:g.where(applied,next,rank),flag:g.where(applied,g.cast(nonzero,'float32'),flag),duration:g.where(applied,g.where(nonzero,5,0),duration),recovery:g.where(applied,0,recovery)};
}

export function buildCommonStanceCreation(){
  const g=new Graph('rom-common-stance-creation',{scope:'Original double-dodge and double-guard operation bodies. Input parameters clamp to signed -2..2 before rank eligibility. Dead status is the raw flag, independent of HP; high tension does not prohibit these setters.',authority:COMMON_STANCE_RULES,
    defaults:{operation:25,parameter:2,hit:true,present:true,rawStatusBytes:[0,0,0,0],rawFlagsBytes:[0,0,0,0],rawRanks:Array(10).fill(0),stanceTimers:[0,0,0,0]},
    inputDomains:{operation:{min:0,max:127,integer:true},parameter:{min:-32768,max:32767,integer:true},hit:{values:[true,false,0,1]},present:{values:[true,false,0,1]},rawStatusBytes:{min:0,max:255,integer:true},rawFlagsBytes:{min:0,max:255,integer:true},rawRanks:{min:-4,max:3,integer:true}},fieldDomains:{stanceTimers:['dodgeDuration','dodgeRecovery','guardDuration','guardRecovery'].map((name,i)=>({name,min:0,max:i%2?4:255,integer:true}))}});
  const operation=g.input('operation'),parameter=g.input('parameter'),hit=g.input('hit',['N',1],'bool'),present=g.input('present',['N',1],'bool'),state={};
  for(const[name,width]of[['rawStatusBytes',4],['rawFlagsBytes',4],['rawRanks',10],['stanceTimers',4]])state[name]=[...g.split(g.input(name,['N',width]),width)];
  const dead=g.gt(commonRawBit(g,state.rawStatusBytes,0),0),applied=[];
  COMMON_STANCE_RULES.forEach((rule,i)=>{
    const result=commonStanceRank(g,{enabled:g.and(hit,g.eq(operation,rule.operation)),present,dead,parameter,rank:state.rawRanks[rule.rank],flag:commonRawBit(g,state[rule.flag],rule.bit),duration:state.stanceTimers[i*2],recovery:state.stanceTimers[i*2+1]});
    state.rawRanks[rule.rank]=result.rank;commonRawOverlay(g,state[rule.flag],rule.bit,result.flag);state.stanceTimers[i*2]=result.duration;state.stanceTimers[i*2+1]=result.recovery;applied.push(result.applied);
  });
  for(const[key,value]of Object.entries(state))g.output(g.cat(value),'next'+key[0].toUpperCase()+key.slice(1));
  g.output(g.or(...applied),'applied');g.output(g.or(...COMMON_STANCE_RULES.map(rule=>g.eq(operation,rule.operation))),'supported');return g;
}
