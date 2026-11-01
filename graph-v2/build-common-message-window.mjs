import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const directory=new URL('./',import.meta.url),CAPACITY=160;
const pick=(g,values,index)=>g.op('GatherElements',[values,g.cast(index,'int32')],{axis:1},{shape:['N',1]});
const positions=(g,count)=>g.constant(Array.from({length:count},(_,i)=>i),'float32',[1,count]);
const any=(g,value,list)=>g.or(...list.map(item=>g.eq(value,item)));
const operands=(g,token)=>g.where(any(g,token,[0xff24,0xff27]),2,g.where(any(g,token,[0xff22,0xff23,0xff25,0xff26]),1,0));
const firstFree=(g,values,count)=>g.split(values,count).map((value,index)=>g.where(g.eq(value,0),index,count)).reduce((a,b)=>g.min(a,b));

/** The semantic message-buffer initialization of the admitted show-text branch. */
export function buildCommonMessageWindowBegin(){
  const g=new Graph('rom-common-message-window-begin',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Main/func_0204500c.cpp',jpn:'02045d88'},{path:'src/Combat/Main/func_0206aa28.cpp',jpn:'token preparation called by0206c570'},{path:'src/Combat/Overlay_25/func_ov025_021ed634.cpp',jpn:'021edb38'}],
    scope:'Exact buffer/counter/slot-reference initialization for a nonempty single admitted message segment, static-font/no-render-object branch. compiledTokens are parsed input asset data, never a captured producer output. The caller must validate text controls and execute the resource and formatter stages. UI rendering/audio and other message-controller fields are not represented here.',
    defaults:{compiledTokens:Array(CAPACITY).fill(0),compiledTotal:1,priorSlotReferences:Array(128).fill(0)},
    inputDomains:{compiledTokens:{width:CAPACITY,min:0,max:65535,integer:true},compiledTotal:{width:1,min:1,max:CAPACITY,integer:true},priorSlotReferences:{width:128,min:0,max:255,integer:true}}
  });
  const tokens=g.input('compiledTokens',['N',CAPACITY]),total=g.input('compiledTotal'),refs=g.input('priorSlotReferences',['N',128]);
  const zero=g.mul(total,0),zeroTokens=g.mul(tokens,0),zeroRefs=g.mul(refs,0);
  g.output(tokens,'rawTokens');g.output(zeroTokens,'outputTokens');g.output(total,'total');g.output(zero,'produced');g.output(zero,'index');
  g.output(g.where(g.lt(positions(g,128),14),refs,zeroRefs),'slotReferences');
  g.output(g.add(g.constant(Array(32).fill(0),'float32',[1,32]),zero),'allocationBits');
  g.output(g.add(zero,14),'glyphCount');g.output(g.add(zero,5),'windowState');g.output(g.ge(total,1),'windowActive');g.output(g.lt(total,0),'rubyMode');
  return g;
}

/** One original inner font-producer iteration; the common caller retains loops. */
export function buildCommonMessageFontStep(){
  const g=new Graph('rom-common-message-font-step',{
    inputContractVersion:1,
    authority:[
      {path:'src/Combat/Main/func_02067b28.cpp',jpn:'020694dc..02069820',note:'JPN ARM assembly is authoritative for the regional token representation and offsets'},
      {path:'src/Combat/Main/func_02044420.cpp',jpn:'02069444'},
      {path:'src/Combat/Main/func_020459b8.cpp',jpn:'02046530'},
      {path:'src/Combat/Main/func_02042a90.cpp',jpn:'0204316c'}
    ],
    scope:'One exact inner iteration of original020694dc with original static-font glyph presence supplied as asset data, absent dynamic font banks, null rendering object, zero glyph metadata and active name-format flag17f3. No cached glyph can match a nonzero token in this admitted state. The four-byte bitmap allocator and128 slot reference bytes remain actual mutable state. Control operands copy without spending another font call; a new glyph attempt ends the original inner loop even when allocation fails. The caller must obey the original max(argument,tickCount) outer-call budget and ruby continuation. No resource or UI completion is assumed.',
    defaults:{rawTokens:Array(CAPACITY).fill(0),outputTokens:Array(CAPACITY).fill(0),baseGlyphPresent:Array(CAPACITY).fill(0),smallGlyphPresent:Array(CAPACITY).fill(0),produced:0,total:0,rubyMode:false,slotReferences:Array(128).fill(0),allocationBits:Array(32).fill(0),glyphCount:14,tokensPresent:true,rendererPresent:false,slotMetadataZero:true,nameFormatActive:true,staticFontsPresent:true,dynamicBanksAbsent:true},
    inputDomains:{rawTokens:{width:CAPACITY,min:0,max:65535,integer:true},outputTokens:{width:CAPACITY,min:0,max:65535,integer:true},baseGlyphPresent:{width:CAPACITY,min:0,max:1,integer:true},smallGlyphPresent:{width:CAPACITY,min:0,max:1,integer:true},produced:{width:1,min:0,max:CAPACITY,integer:true},total:{width:1,min:0,max:CAPACITY,integer:true},slotReferences:{width:128,min:0,max:255,integer:true},allocationBits:{width:32,min:0,max:1,integer:true},glyphCount:{width:1,min:0,max:127,integer:true}},
    feedback:{produced:'nextProduced',outputTokens:'nextOutputTokens',slotReferences:'nextSlotReferences',allocationBits:'nextAllocationBits',glyphCount:'nextGlyphCount',rubyMode:'nextRubyMode'}
  });
  const raw=g.input('rawTokens',['N',CAPACITY]),output=g.input('outputTokens',['N',CAPACITY]);
  const base=g.input('baseGlyphPresent',['N',CAPACITY]),small=g.input('smallGlyphPresent',['N',CAPACITY]),produced=g.input('produced'),total=g.input('total');
  const ruby=g.input('rubyMode',['N',1],'bool'),refs=g.input('slotReferences',['N',128]),allocation=g.input('allocationBits',['N',32]),glyphCount=g.input('glyphCount');
  const present=g.input('tokensPresent',['N',1],'bool'),renderer=g.input('rendererPresent',['N',1],'bool'),emptyMetadata=g.input('slotMetadataZero',['N',1],'bool'),nameActive=g.input('nameFormatActive',['N',1],'bool'),staticFonts=g.input('staticFontsPresent',['N',1],'bool'),noDynamic=g.input('dynamicBanksAbsent',['N',1],'bool');
  const index=g.min(produced,CAPACITY-1),token=pick(g,raw,index),control=g.ge(token,0xff00),args=operands(g,token),next=g.add(produced,g.where(control,g.add(args,1),1));
  const contract=g.and(g.not(renderer),emptyMetadata,nameActive,staticFonts,noDynamic,g.le(produced,total),g.le(total,CAPACITY));
  const active=g.and(present,g.lt(produced,total)),supported=g.and(contract,g.or(g.not(active),g.le(next,total)));
  const execute=g.and(active,supported),exists=g.gt(pick(g,g.where(ruby,small,base),index),0),newGlyph=g.and(execute,g.not(control),exists);
  const freeAllocation=firstFree(g,allocation,32),freeSlot=firstFree(g,refs,128),allocatePage=g.and(newGlyph,g.lt(freeAllocation,32)),allocateSlot=g.and(allocatePage,g.lt(freeSlot,128));
  const glyph=g.where(allocateSlot,freeSlot,0),value=g.where(control,token,g.where(exists,glyph,0xff19)),nextProduced=g.where(execute,next,produced);
  const pos=positions(g,CAPACITY),copy=g.and(execute,g.ge(pos,produced),g.lt(pos,nextProduced));
  const copied=g.where(control,raw,value);
  g.output(g.where(copy,copied,output),'nextOutputTokens');
  g.output(nextProduced,'nextProduced');
  g.output(g.where(g.and(allocatePage,g.eq(positions(g,32),freeAllocation)),1,allocation),'nextAllocationBits');
  g.output(g.where(g.and(allocateSlot,g.eq(positions(g,128),freeSlot)),1,refs),'nextSlotReferences');
  const increment=g.add(glyphCount,1),wrapped=g.sub(increment,g.mul(g.floor(g.mul(increment,1/128)),128));
  g.output(g.where(newGlyph,wrapped,glyphCount),'nextGlyphCount');
  g.output(g.gt(g.where(execute,g.where(g.eq(token,0xff37),1,g.where(g.eq(token,0xff38),0,g.cast(ruby,'float32'))),g.cast(ruby,'float32')),0),'nextRubyMode');
  g.output(g.or(g.not(execute),newGlyph,g.ge(nextProduced,total)),'endFontCall');
  g.output(newGlyph,'newGlyphAttempt');g.output(supported,'supported');
  return g;
}

/** One original token-consumer iteration after the quiet UI prefix has passed. */
export function buildCommonMessageConsumeStep(){
  const g=new Graph('rom-common-message-consume-step',{
    inputContractVersion:1,
    authority:[{path:'src/Combat/Main/func_02065990.cpp',jpn:'02066dc4'},{path:'src/Combat/Main/func_02044420.cpp',jpn:'02069444'}],
    scope:'One exact JPN message-consumer iteration after the admitted quiet message-window prefix: no actor animation, window transition, audio wait, delayed close, scroll or renderer work. Supports glyph slots0..127, FF18/19, spaces FF1A/1B, parameter controls FF22..27, ruby/continuous FF36/37/38, and terminal FF01/02. Other control instructions stop with supported=false and preserve state. A terminal leaves the cursor on its token. This graph produces UI state from token availability and the supplied per-frame budget; it does not equate an empty producer queue with UI completion.',
    defaults:{tokens:Array(CAPACITY).fill(0),produced:0,index:0,windowState:5,windowActive:true,budget:16,continuous:false,quietPrefixSatisfied:true},
    inputDomains:{tokens:{width:CAPACITY,min:0,max:65535,integer:true},produced:{width:1,min:0,max:CAPACITY,integer:true},index:{width:1,min:0,max:CAPACITY,integer:true},windowState:{width:1,min:0,max:5,integer:true},budget:{width:1,min:0,max:65535,integer:true}},
    feedback:{index:'nextIndex',windowState:'nextWindowState',budget:'nextBudget',continuous:'nextContinuous'}
  });
  const tokens=g.input('tokens',['N',CAPACITY]),produced=g.input('produced'),index=g.input('index'),state=g.input('windowState'),active=g.input('windowActive',['N',1],'bool'),budget=g.input('budget'),continuous=g.input('continuous',['N',1],'bool'),quiet=g.input('quietPrefixSatisfied',['N',1],'bool');
  const token=pick(g,tokens,g.min(index,CAPACITY-1)),args=operands(g,token),terminal=any(g,token,[0xff01,0xff02]);
  const ordinary=g.lt(token,128),known=g.or(ordinary,any(g,token,[0xff18,0xff19,0xff1a,0xff1b,0xff36,0xff37,0xff38,0xff01,0xff02]),g.gt(args,0));
  const eligible=g.and(active,g.eq(state,5),g.gt(budget,0),g.lt(index,produced));
  const supported=g.and(quiet,g.or(g.eq(state,0),g.eq(state,5)),g.or(g.not(eligible),g.and(known,g.le(g.add(index,g.add(args,1)),produced))));
  const execute=g.and(eligible,supported),progress=g.and(execute,g.not(terminal)),parameter=g.gt(args,0);
  const nextContinuous=g.gt(g.where(execute,g.where(g.eq(token,0xff37),1,g.where(g.eq(token,0xff38),0,g.cast(continuous,'float32'))),g.cast(continuous,'float32')),0);
  const spent=g.sub(g.add(budget,g.cast(any(g,token,[0xff1a,0xff1b]),'float32')),g.cast(g.not(nextContinuous),'float32'));
  const nextBudget=g.where(g.and(progress,g.not(parameter)),spent,budget),nextIndex=g.where(progress,g.add(index,g.add(args,1)),index),nextState=g.where(g.and(execute,terminal),0,state);
  g.output(nextIndex,'nextIndex');g.output(nextState,'nextWindowState');g.output(nextBudget,'nextBudget');g.output(nextContinuous,'nextContinuous');g.output(supported,'supported');
  g.output(g.or(g.not(execute),terminal,g.eq(nextBudget,0),g.ge(nextIndex,produced)),'endConsumeCall');
  return g;
}

export async function buildCommonMessageWindow(){return Promise.all([buildCommonMessageWindowBegin(),buildCommonMessageFontStep(),buildCommonMessageConsumeStep()].map(graph=>graph.save(directory)));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonMessageWindow()));
