// Input-only nonempty linked-program example. The same common graph executes
// these nodes for every listed action; no observed final state is supplied.
import {COMMON_FUNCTIONAL_FRAME_EXAMPLE} from './common-functional-frame-example.mjs';
const inputs=structuredClone(COMMON_FUNCTIONAL_FRAME_EXAMPLE.inputs);
inputs.encounterId='common-script-frame-example';
inputs.camera.frameInput.contract='dq9-script-static-font-functional-frame-v2';
const node=(opcode,payload)=>({opcode,parameter:payload[0]??0,payloadU16:[...payload,...Array(10-payload.length).fill(0)],payloadMaskU16:Array(10).fill(65535)});
inputs.camera.initial.residentPrograms=[{actions:[1,275,48,44,228,934],codes:[node(66,[17]),node(71,[65535]),node(80,[12345,65432]),node(93,[255]),node(11,[])]}];
export const COMMON_SCRIPT_FRAME_EXAMPLE={id:'common-script-frame-example',titleJa:'共通戦闘 → 演出命令列・メッセージ・カメラ',scopeJa:'初期入力の演出命令列を共通ONNXで実行し、メッセージ・カメラ・終了処理まで進めます。ローカルROMのメッセージと静的フォントを使用します。実装済みの状態命令と静的な描画条件が対象です。',inputs};
