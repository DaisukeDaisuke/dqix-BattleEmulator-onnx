// Input-only example for the common program. No expected final seed, frame
// count, generated command, token buffer or ROM asset bytes are included.
import {COMMON_PRESENTATION_EXAMPLE} from './common-presentation-example.mjs';
const inputs=structuredClone(COMMON_PRESENTATION_EXAMPLE.inputs);
inputs.encounterId='common-functional-frame-example';
inputs.actors[0].actor.splice(0,4,999,999,999,999);
inputs.actors[0].magic=[100,0];inputs.actors[0].packedScale=[0,450];
inputs.actors[0].aux[6]=0;
inputs.actors[1].actor.splice(0,2,9999,9999);
for(const actor of inputs.actors){actor.coverById=0;actor.coverTargetId=0;actor.ai.revengeId=0;actor.ai.previousId=0;}
inputs.camera.mode='functional-frame';inputs.camera.maxFrames=256;
inputs.camera.initial.initialCameraFlagsU16=[8,0];
inputs.camera.initial.residentPrograms=[{actions:[1,275,48,44,228,934],codes:[]}];
inputs.camera.frameInput={
  contract:'dq9-empty-script-static-font-functional-frame-v1',initialLayout:'zero-unless-supplied-v1',
  worldDispatchStackAbi:'jpn-component-world-dispatch-v1',
  stackAbi:{...structuredClone(inputs.camera.initial.stackAbi),sceneBaseU16:[0,0x0237],firstAdmissionTail:'jpn-empty-actor-effects-direct-first-v1'},
  mainState:8,deltaTicks:17,frameTicks:1,fontCallsPerFrame:16,
  namesById:{0:'',1:'',2:'',3:'',192:''},
  actors:Object.fromEntries([0,1,2,3,192].map(id=>[id,{present:true,modelPresent:id===0||id===192,inheritedAlpha:0}])),
  audioHandle:-1,secondaryResourceIdentifier:0,soundGlobalWordU16:[0,0]
};
export const COMMON_FUNCTIONAL_FRAME_EXAMPLE={id:'common-functional-frame-example',titleJa:'共通戦闘 → メッセージ・カメラのフレーム実行',
  scopeJa:'実際のメッセージと静的フォントをローカルROMから読み、共通ONNXで表示待機・カメラ・後片付けを計算します。空の演出スクリプトと明示した静的状態の機能的フレーム順序が対象です。次のコマンド入力までの境界を扱い、メニューや実機描画の時間は含みません。',inputs};
