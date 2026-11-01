import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const IDS=[0,1,2,3,192,193,194,195,196,197,198,199];
// The semantic subset that affects the next camera call. Rendering, resource
// allocators, messages and stack histories are deliberately not inputs.
export function buildCommonCameraTurn(){
  const g=new Graph('rom-common-camera-turn',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Overlay_26/func_ov026_021d8ba0.cpp',jpn:'021db44c: accepted-command cursor reset'},
      {path:'src/Combat/Overlay_25/func_ov025_021db6dc.cpp',jpn:'021dbfd0: presentation initializer'},
      {path:'src/Combat/Overlay_0/func_ov000_0215ec1c.cpp',jpn:'0216039c: enemy behavior reset'},
      {path:'src/Combat/Main/func_02033b58.cpp',description:'Store previous behavior BE into BF, then reset BE'},
      {path:'src/Combat/Overlay_25/func_ov025_021dfbfc.cpp',description:'Last eligible command target selection'},
      {path:'src/Combat/Main/func_02049458.cpp',description:'Store target into object+13c->+4c'}],
    scope:'Camera-relevant accepted-command/turn-entry stores only. Preserve camera memory, world coordinates, RNG, program flags and scene+5b41. Reset command cursor, presentation state and scene+71c5. Original eligible object behavior and target-cache updates use computed command records.',
    defaults:{actorLookupPresent:Array(12).fill(false),actorTypeFlagsLow16:Array(12).fill(0),actorDead:Array(12).fill(false),actorVisualPresent:Array(12).fill(false),actorBehavior:Array(12).fill(0),actorPreviousBehavior:Array(12).fill(0),actorPreferredTarget:Array(12).fill(255),partyTacticsPresent:Array(4).fill(false),partyTactics:Array(4).fill(5),recordCount:0,recordSourceIds:Array(72).fill(-1),recordFirstTargetIds:Array(72).fill(-1),recordHasTarget:Array(72).fill(false),currentActionIndex:0,presentationState:0,sceneByte71c5:0,enabled:true},
    inputDomains:{actorTypeFlagsLow16:{width:12,min:0,max:65535,integer:true},recordCount:{width:1,min:0,max:72,integer:true},sceneByte71c5:{width:1,min:0,max:255,integer:true}},actorOrder:IDS,
  });
  const input=(n,w=1,t='float32')=>g.input(n,['N',w],t),count=input('recordCount'),enabled=input('enabled',1,'bool'),supported=g.and(g.ge(count,0),g.le(count,72)),apply=g.and(enabled,supported),mod=(x,n)=>g.sub(x,g.mul(g.floor(g.mul(x,1/n)),n)),flag=(x,m)=>g.gt(mod(g.floor(g.mul(x,1/m)),2),0);
  const present=g.split(input('actorLookupPresent',12,'bool'),12),type=g.split(input('actorTypeFlagsLow16',12),12),dead=g.split(input('actorDead',12,'bool'),12),visual=g.split(input('actorVisualPresent',12,'bool'),12),behavior=g.split(input('actorBehavior',12),12),previous=g.split(input('actorPreviousBehavior',12),12),preferred=g.split(input('actorPreferredTarget',12),12),tacticsPresent=g.split(input('partyTacticsPresent',4,'bool'),4),tactics=g.split(input('partyTactics',4),4),sources=input('recordSourceIds',72),targets=input('recordFirstTargetIds',72),hasTarget=input('recordHasTarget',72,'bool');
  const positions=g.constant(Array.from({length:72},(_,i)=>i+1),'float32',[1,72]),active=g.and(hasTarget,g.le(positions,count)),nextBehavior=[],nextPrevious=[],nextPreferred=[];
  for(let i=0;i<12;i++){
    const combatant=g.and(present[i],flag(type[i],0x80)),reset=g.and(apply,combatant,i>=4?flag(type[i],0x400):g.constant(false,'bool'),g.not(dead[i]));
    nextBehavior.push(g.where(reset,0,behavior[i]));nextPrevious.push(g.where(reset,behavior[i],previous[i]));
    const eligible=g.and(apply,combatant,visual[i],i>=4?g.constant(true,'bool'):g.and(flag(type[i],0x100),tacticsPresent[i],g.not(g.eq(tactics[i],5)))),matches=g.and(active,g.eq(sources,IDS[i])),selected=g.split(g.where(matches,positions,0),72).reduce((a,b)=>g.max(a,b)),target=g.op('GatherElements',[g.cat([preferred[i],targets]),g.cast(selected,'int32')],{axis:1},{shape:['N',1]});
    nextPreferred.push(g.where(eligible,mod(target,256),preferred[i]));
  }
  g.output(g.cat(nextBehavior),'nextActorBehavior');g.output(g.cat(nextPrevious),'nextActorPreviousBehavior');g.output(g.cat(nextPreferred),'nextActorPreferredTarget');
  for(const[name,value]of[['currentActionIndex',0],['presentationState',1],['sceneByte71c5',0]])g.output(g.where(apply,value,input(name)),'next'+name[0].toUpperCase()+name.slice(1));
  g.output(supported,'supported');g.output(apply,'completed');return g;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonCameraTurn().save(new URL('./',import.meta.url))));
