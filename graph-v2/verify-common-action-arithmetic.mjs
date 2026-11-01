import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildCommonAccuracyBoundary,buildCommonPartyPackedBoundary,buildCommonPostprocessBoundary,COMMON_ACTION_RULES} from './build-common-action.mjs';
import {NativeGraphWasmSession} from '../poc-v2/native-graph-wasm-prototype.mjs';
import rom from '../restored/dq9-unified/data/rom.mjs';

// Private ROM responses are optional verification inputs, not embedded graph
// weights. Only each response.case initializes the graph. Observed ARM return,
// final RNG and call count are read after inference solely for comparison.
const seedBytes=value=>Array.from({length:8},(_,i)=>Number(BigInt(value)>>BigInt(i*8)&255n));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const byId=new Map(COMMON_ACTION_RULES.map(rule=>[rule.id,rule]));
const rows=new Map(rom.damage.map(row=>[row.id,row]));
const rawStats=(actor={})=>{const b=Buffer.alloc(0xb0);b.writeUInt32LE((actor.status??0)>>>0,0x14);b.writeUInt32LE((actor.flags18??0)>>>0,0x18);b.writeUInt16LE(actor.poisonKind??0,0x22);b.writeUInt32LE((actor.ranksPacked??0)>>>0,0x58);for(const[offset,value]of Object.entries(actor.statBytes??{}))b[Number(offset)]=value;return b;};

export async function verifyCommonActionArithmetic(paths){
  const builders={party_accuracy:buildCommonAccuracyBoundary,party_base_damage:buildCommonPartyPackedBoundary,party_postprocess:buildCommonPostprocessBoundary},sessions=new Map(),graphs=new Map(),differences=[],cohorts=[];
  let checked=0,fields=0;
  for(const path of paths){
    const response=JSON.parse(await readFile(path,'utf8'));
    if(response.romSHA256!==rom.romSha256||!response.executionComplete||!response.programUnmodified)throw Error('Unqualified ROM response: '+path);
    let cohortCases=0,cohortDifferences=0;
    for(const result of response.results){
      const c=result.case,rule=byId.get(c.actionId),builder=builders[c.kind];
      if(!builder||!result.ok||!result.strictInitializedMemory)throw Error('Incomplete or unknown ARM case: '+c.id);
      if(!rule||rule.raw!==c.actionRaw)throw Error('Action bytes differ from the original table: '+c.id);
      if(c.sourceIndex!==0)throw Error('This verification cohort requires a party source: '+c.id);
      if(!sessions.has(c.kind)){
        const graph=builder();graphs.set(c.kind,graph);
        sessions.set(c.kind,await NativeGraphWasmSession.create({onnx:graph.model(),ir:graph.json()}));
      }
      const source=c.actors[0],target=c.actors[1],row={seed:seedBytes(c.seed),position:1,actionId:c.actionId,enabled:true,sourceMagic:[source.magicalMight??0,source.magicalMending??0]};
      if(c.kind==='party_accuracy'){
        Object.assign(row,{partySource:true,critical:!!c.commandCritical,guaranteed:!!c.guaranteed,blind:Number(!!(source.status&64)),resistance:rule.effectElement===0?100:target.resistances[rule.effectElement-1]});
      }else if(c.kind==='party_base_damage'){
        const damage=rows.get(rule.damageId);
        if(damage&&(damage.w0!==c.damageW0||damage.w1!==c.damageW1))throw Error('Damage bytes differ from the original table: '+c.id);
        if(!damage&&(c.damageW0!==undefined||c.damageW1!==undefined))throw Error('Unexpected damage row: '+c.id);
        Object.assign(row,{sourcePackedScale:[c.packedScale0,c.packedScale4],attack:source.attack,defense:target.defense});
      }else{
        if(!c.allowTension||target.defend)throw Error('Postprocess fixture exceeds the explicit probe contract: '+c.id);
        const s=rawStats(source),t=rawStats(target),ranks=t.readUInt32LE(0x58);
        Object.assign(row,{rawBase:c.rawBase,baseAttack:source.baseAttack??source.attack,level:source.level,partySource:true,critical:!!c.commandCritical,sourceTension:[c.tensionStage,Number(c.tensionStage>0),0],resistances:target.resistances??Array(22).fill(100),sourceRawFlagsBytes:Array.from(s.subarray(0x18,0x1c)),sourceStatusKindsBytes:Array.from(s.subarray(0x22,0x24)),targetRawStatusBytes:Array.from(t.subarray(0x14,0x18)),targetRawFlagsBytes:Array.from(t.subarray(0x18,0x1c)),targetRawRanks:Array.from({length:10},(_,i)=>{const value=ranks>>>3*i&7;return value<4?value:value-8;}),sourceSpecies:c.sourceSpecies??source.species??0});
      }
      const output=sessions.get(c.kind).runRows([row]),value=name=>Array.from(output[name].data);
      const compared={integerResult:[value(c.kind==='party_accuracy'?'passed':'damage'),[result.integerResult]],nextSeed:[value('nextSeed'),seedBytes(result.nextState)],consumed:[value('consumed'),[result.consumed]]};
      for(const[name,[got,want]]of Object.entries(compared)){
        fields+=got.length;
        if(!same(got,want)){differences.push({id:c.id,field:name,got,want});cohortDifferences++;}
      }
      checked++;cohortCases++;
    }
    cohorts.push({path,cases:cohortCases,differences:cohortDifferences});
  }
  for(const session of sessions.values())await session.release();
  return{schema:'dq9-common-action-arithmetic-arm-verification-v1',romSHA256:rom.romSha256,checked,comparedFields:fields,differences:differences.length,examples:differences.slice(0,16),cohorts,graphs:[...graphs].map(([kind,graph])=>({kind,sha256:createHash('sha256').update(graph.model()).digest('hex'),nodes:graph.nodes.length})),authority:'Actual original ARM p-code execution through return with strict initialized memory; no RNG/soft-float replacement.',limits:'Accuracy, GetAttackBaseDamage and postprocess helper boundaries with the explicitly supplied raw modifiers. This does not independently certify the complete spell caller or unrepresented equipment, reflection or metal effects. Modifier creation/expiration is outside the arithmetic boundary.'};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const paths=process.argv.slice(2);
  if(!paths.length)throw Error('Pass one or more saved actual-ROM response paths. No fixture data is bundled.');
  const report=await verifyCommonActionArithmetic(paths);console.log(JSON.stringify(report,null,2));if(report.differences)process.exitCode=1;
}
