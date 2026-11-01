import {fileURLToPath} from 'node:url';
import {Graph} from './graph-builder.mjs';

const directory=new URL('./',import.meta.url);
const authority=(name,sha256,jpn)=>({path:`src/Combat/Overlay_25/func_ov025_${name}.cpp`,sha256,jpn});

/** Exact leaf predicates. Their truth is not a natural frame-completion proof. */
export function buildCommonPresentationCompletion(){
  const g=new Graph('rom-common-presentation-completion',{
    inputContractVersion:1,
    authority:[
      authority('021e9528','e7d966ad9ffe9907f4caf485006e84e633290354121cc46008b7beb132b87e34','021e99b8'),
      authority('021ed2f4','ec35e7c73d35b4bf2efa0b1394e94b5803ed525be7c9dd2ef51a55b136d5bc23','021ed7f8'),
      authority('021ed0fc','eb50389293869e4428df0e5e24a4348c8871b411a5281771e40e787d1cf2c416','021ed57c')
    ],
    scope:'Exact script, controller and timeline completion leaf predicates. These do not execute script update, wait for asynchronous resource work, finalize a scene, remove effects, advance commands or authorize a next numeric turn. The full caller invokes the scheduler only after its presentation-state gate.',
    defaults:{cursorPresent:false,controllerActive:0,controllerWait:0,timelineCount:0},
    inputDomains:{controllerActive:{width:1,min:0,max:255,integer:true},controllerWait:{width:1,min:0,max:65535,integer:true},timelineCount:{width:1,min:0,max:255,integer:true}}
  });
  const cursor=g.input('cursorPresent',['N',1],'bool'),active=g.input('controllerActive'),wait=g.input('controllerWait'),count=g.input('timelineCount');
  const controllerComplete=g.and(g.eq(active,0),g.eq(wait,0));
  g.output(controllerComplete,'controllerComplete');
  g.output(g.and(g.not(cursor),controllerComplete),'scriptComplete');
  g.output(g.eq(count,0),'timelineComplete');
  return g;
}

/** Exact timer prefix of script update, stopping before the sound/event helper. */
export function buildCommonPresentationDelay(){
  const g=new Graph('rom-common-presentation-delay',{
    inputContractVersion:1,
    authority:[authority('021e9778','9467787abf897a1f9f8283779dbd6ee6e710c0340c1eeffb7092ae937866b110','021e9c0c')],
    scope:'Exact unsigned16 delay subtraction against unsigned32 GameState effective delta time, carried as two u16 limbs. Expiry requests the original delay-commit helper021ebb84 before the enabled/resource checks. No expiry side effects or asynchronous resource completion are inferred. A caller must dispatch the requested helper before continuing.',
    defaults:{delay:0,deltaU16:[17,0],scriptEnabled:false,enabled:true},
    inputDomains:{delay:{width:1,min:0,max:65535,integer:true},deltaU16:{width:2,min:0,max:65535,integer:true}},
    feedback:{delay:'nextDelay'}
  });
  const delay=g.input('delay'),delta=g.split(g.input('deltaU16',['N',2]),2),scriptEnabled=g.input('scriptEnabled',['N',1],'bool'),enabled=g.input('enabled',['N',1],'bool');
  const pending=g.and(enabled,g.gt(delay,0)),wait=g.and(pending,g.eq(delta[1],0),g.lt(delta[0],delay)),expired=g.and(pending,g.not(wait));
  g.output(g.where(pending,g.where(wait,g.sub(delay,delta[0]),0),delay),'nextDelay');
  g.output(wait,'returnedForDelay');
  g.output(expired,'requiresDelayCommit');
  g.output(g.and(enabled,g.not(wait),scriptEnabled),'enabledAfterDelay');
  return g;
}

export async function buildCommonPresentationScheduler(){
  const reports=[];
  for(const graph of[buildCommonPresentationCompletion(),buildCommonPresentationDelay()])reports.push(await graph.save(directory));
  return reports.map(({name,nodes,bytes})=>({name,nodes,bytes}));
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCommonPresentationScheduler()));
