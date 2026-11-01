import {pathToFileURL} from 'node:url';
import {Graph} from './graph-builder.mjs';
import {actualSinCosTable,exactSinCos,saveFixedGraph} from './build-camera-fixed-math.mjs';

const authority=[
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_0/func_ov000_0216d464.cpp',sha256:'f9a46da17a187fd52995303dc9f19b9d18ed39cfc9929bb63186ff721bca11c4'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_0/func_ov000_0216f0d0.cpp',sha256:'d92c2f85b4352d92aaeba1f4170222a55276149b695af0130e2a7d6f0b4a2b46'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_0/func_ov000_0216f3d4.cpp',sha256:'ef54afca41f0997fed24e1672e7855b7118b1bfb103e82222dbcff71623efac2'},
  {path:'restored/dqix-decomp-decomp-matching/src/Combat/Main/func_020a3570.cpp',sha256:'893febde73c15875bae1c90260cfcda23fa8d2b5b10cf7b428559dc7de1256de'},
  {path:'restored/dqix-decomp-decomp-matching/src/Graphics/ExtendedVectorMath.cpp',sha256:'08a5e871d287dd9f5b95750b0c9f550b845f8024bbbcfe981ebe7bb1e11a26fd'}
];
const integer=(width,min,max)=>({width,min,max,integer:true});

export function buildCommonCameraFrameGate(){
  const g=new Graph('rom-common-camera-frame-gate',{
    authority,address:'JPN 0216eb90 / USA 0216d464',
    scope:'Original common camera-frame boundary with manual-camera mode zero, inactive polar interpolation and spin, and no visible positive-alpha fade candidates. The original fade tail still clears camera byte221 when enabled. Real initial visibility/presence/inherited-alpha arrays qualify that branch; a claimed readiness or expected endpoint is never an input. Follow and border arithmetic are separate shared ONNX modules. Active input, interpolation, spin and fade effects require their own semantic module.',
    scopeJa:'カメラ更新の共通呼出し条件を検査します。手動操作・補間・回転・可視オブジェクトのフェードがある場合は未対応として返し、準備完了を代入しません。',
    inputDomains:{cameraU16:integer(320,0,65535),sourcePresent:{width:1,values:[true,false,0,1]},targetPresent:{width:1,values:[true,false,0,1]},fadeObjectPresent:{width:12,values:[true,false,0,1]},fadeObjectVisible:{width:12,values:[true,false,0,1]},fadeInheritedAlpha:integer(12,0,31)},feedback:{cameraU16:'nextCameraU16'},defaultSteps:1
  });
  const raw=g.split(g.input('cameraU16',['N',320]),320),source=g.input('sourcePresent',['N',1],'bool'),target=g.input('targetPresent',['N',1],'bool'),present=g.split(g.input('fadeObjectPresent',['N',12],'bool'),12),visible=g.split(g.input('fadeObjectVisible',['N',12],'bool'),12),alpha=g.split(g.input('fadeInheritedAlpha',['N',12]),12);
  const lowByte=offset=>g.sub(raw[offset/2],g.mul(g.floor(g.mul(raw[offset/2],1/256)),256));
  const zero32=offset=>g.and(g.eq(raw[offset/2],0),g.eq(raw[offset/2+1],0));
  const fadeEnabled=g.and(g.not(zero32(0x21c)),g.not(g.eq(lowByte(0x278),0)));
  const activeFade=g.or(...present.map((p,i)=>g.and(p,visible[i],g.gt(alpha[i],0))));
  const supported=g.and(zero32(0x218),zero32(0x238),zero32(0x23c),zero32(0x270),g.eq(lowByte(0x260),1),source,target,g.or(g.not(fadeEnabled),g.not(activeFade)));
  // Original fade tail clears byte221 before walking its visible candidates.
  // It commutes with the admitted follow/border stores, which preserve byte221.
  raw[0x220/2]=g.where(g.and(supported,fadeEnabled),lowByte(0x220),raw[0x220/2]);
  g.output(g.cat(raw),'nextCameraU16');g.output(supported,'supported');g.output(fadeEnabled,'fadeEnabled');g.output(activeFade,'requiresFadeProducer');
  return g;
}

export async function buildCommonCameraFrameStack(){
  const table=await actualSinCosTable(),g=new Graph('rom-common-camera-frame-stack',{
    authority:[...authority,table.authority],
    address:'JPN world dispatch 0218d97c; RotationMatrixY 020308bc; sin/cos 020307a0/020307d4; Mat4x3_WriteRotationY 020c3468',
    scope:'Exact nested presentation row+4 stack writes made by the admitted original world-dispatch -> camera-frame -> follow -> setPolar -> RotationMatrixY call chain. The row base is presentation-entry-SP minus0x144; later presentation entry is top component SP minus0x30. The actual cosine-call LR020308e0 overwrites row1+4, RotationY writes minusSDKsin(computed follow angle) to row2+4 and zero to row3+4. Row0+4 is preserved. The angle is produced by follow, before optional deeper border/reversePolar calls. No observed row+4 or final camera state is substituted. Other call-stack layouts require a distinct proved ABI.',
    scopeJa:'実際のワールド更新のスタック上書きを、計算したカメラ角度とROMのsin表から生成します。row+4の観測値を定数として再生しません。',
    stackAbi:'jpn-component-world-dispatch-v1',
    inputDomains:{priorU16:integer(8,0,65535),followAngle:integer(1,-4194304,4194304),enabled:{width:1,values:[true,false,0,1]}},feedback:{priorU16:'nextU16'},defaultSteps:1
  });
  const prior=g.split(g.input('priorU16',['N',8]),8),angle=g.input('followAngle',['N',1]),enabled=g.input('enabled',['N',1],'bool'),sine=exactSinCos(g,angle,table.values).sine,negativeSine=g.sub(0,sine),negative=g.lt(negativeSine,0),low=g.where(negative,g.add(negativeSine,65536),negativeSine),high=g.where(negative,65535,0);
  const next=[prior[0],prior[1],g.constant(0x08e0),g.constant(0x0203),low,high,g.constant(0),g.constant(0)];
  g.output(g.cat(next.map((v,i)=>g.where(enabled,v,prior[i]))),'nextU16');
  g.output(g.cat([g.mul(angle,0),...Array.from({length:3},()=>g.where(enabled,15,0))]),'wordByteWriteMask');
  return g;
}

export function buildCommonCameraCleanupStore(){
  const g=new Graph('rom-common-camera-cleanup-store',{
    authority:[
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021dc940.cpp',sha256:'b9bc0d8d7bbf641fb0772d337389d6c0ed0d701ef4b4a8747e2b73944f161680'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_0/func_ov000_0216f1e4.cpp',sha256:'05a2d3cfa8ee3ca9642706be91535f45cdab5b38d571265cdd6a458fef8b5d84'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021db7f8.cpp',sha256:'30ed3d0774b9c2af44c6d330e27eaded6be8b02dd758f1228456c671bf02bc6a'}
    ],
    scope:'Only the original camera stores dispatched by proved command/turn completion: command cleanup copies the current computed polar70..78 into264..26c and zeros270/274 via JPN02170910; turn cleanup clears byte278 and bound record27c. Other camera bytes are preserved. The booleans are caller control decisions, not a replacement for script/UI/resource completion. No frame index or timeout triggers these writes.',
    scopeJa:'実際の命令終了・表示ターン終了から呼ぶカメラ保存処理です。終了判定は呼出し側が計算し、フレーム番号や固定待ち時間では発火しません。',
    inputDomains:{cameraU16:integer(320,0,65535),commandCleanup:{width:1,values:[true,false,0,1]},turnCleanup:{width:1,values:[true,false,0,1]}},feedback:{cameraU16:'nextCameraU16'},defaultSteps:1
  });
  const raw=g.split(g.input('cameraU16',['N',320]),320),command=g.input('commandCleanup',['N',1],'bool'),turn=g.input('turnCleanup',['N',1],'bool');
  for(let i=0;i<6;i++)raw[0x264/2+i]=g.where(command,raw[0x70/2+i],raw[0x264/2+i]);
  for(let i=0;i<4;i++)raw[0x270/2+i]=g.where(command,0,raw[0x270/2+i]);
  raw[0x278/2]=g.where(turn,g.mul(g.floor(g.mul(raw[0x278/2],1/256)),256),raw[0x278/2]);
  for(let i=0;i<2;i++)raw[0x27c/2+i]=g.where(turn,0,raw[0x27c/2+i]);
  g.output(g.cat(raw),'nextCameraU16');return g;
}

export function buildCommonCameraFirstStack(){
  const g=new Graph('rom-common-camera-first-stack',{
    authority:[
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021eb7fc.cpp',sha256:'fc367f136aabbe7f3b0bb29ab5e28cb978e7ab0a897bd1cea966f50d182177e9'},
      {path:'restored/dqix-decomp-decomp-matching/src/Combat/Overlay_25/func_ov025_021eb8e8.cpp',sha256:'d163fdfd99f15ef01e946a7ab9842cb82feb6c9176d4ace641aee4255f92badc'}
    ],
    scope:'Bridge from the explicitly qualified first direct enclosing-admission stack to later nested frame-entry row+4. Original JPN021ebd70 saved-register stores leave scene pointers in words0/1, while021ebc84 leaves the script-manager pointer(scene+0x394) and zero in words2/3. The scene pointer is initial caller ABI data, never a fixed process address or observed endpoint. Requires the existing empty-actor-effect enclosing tail with no later stack clobber; subsequent admissions use the shared selector stack producer at their real nested entry SP.',
    scopeJa:'初回の直接呼出しから、以後のフレーム内呼出しへスタック領域を引き継ぎます。ポインタは初期ABI入力から計算し、実行結果のアドレスを固定しません。',
    stackAbi:'jpn-empty-actor-effects-direct-first-v1',
    inputDomains:{sceneBaseU16:integer(2,0,65535),priorU16:integer(8,0,65535),enabled:{width:1,values:[true,false,0,1]}},feedback:{priorU16:'nextU16'},defaultSteps:1
  });
  const base=g.split(g.input('sceneBaseU16',['N',2]),2),prior=g.split(g.input('priorU16',['N',8]),8),enabled=g.input('enabled',['N',1],'bool'),sum=g.add(base[0],0x394),carry=g.floor(g.mul(sum,1/65536)),low=g.sub(sum,g.mul(carry,65536)),h=g.add(base[1],carry),high=g.sub(h,g.mul(g.floor(g.mul(h,1/65536)),65536)),zero=g.mul(base[0],0),next=[...base,...base,low,high,zero,zero];
  g.output(g.cat(next.map((x,i)=>g.where(enabled,x,prior[i]))),'nextU16');return g;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const output=[];for(const make of [buildCommonCameraFrameGate,buildCommonCameraFrameStack,buildCommonCameraCleanupStore,buildCommonCameraFirstStack])output.push(await saveFixedGraph(await make()));console.log(JSON.stringify(output,null,2));
}
