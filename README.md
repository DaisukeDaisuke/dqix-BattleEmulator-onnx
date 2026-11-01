# DQ9 共通バトルエミュレータ — ONNX / HTML

ダメージ、乱数状態と消費順序、バフ・デバフ、position、コンボ・nowstate、カメラと必要な関連メモリを、**一つの共通プログラムと定義データ**で計算する実装です。敵ごとの専用プログラムや、既知seedの正解表、学習による近似は使いません。

実行用HTMLはROMを要求しません。戦闘定義・定数・カメラ計算用データ・ONNXを同梱し、利用者は戦闘条件、seed、行動入力、候補領域、照合する実測情報を与えます。ROM、Ghidra、matching decompileは開発時の仕様確認と独立検証に使います。

> 現在は共通戦闘＋カメラ＋不確定入力探索の実装・検証を進めている版です。数値効果とカメラ用コマンド生成の対応範囲は同一ではありません。未実装の処理は具体的な境界を返し、成功・不一致・勝敗に置き換えません。定義データの件数を、戦闘全体の検証済み件数とは数えません。

## 目的と計算範囲

| 計算するもの | 実装上の扱い |
| --- | --- |
| 行動順、AI、対象選択、ダメージ、回復、効果、周期処理 | 共通ONNXグラフ。能力値・行動表・状態を入力する |
| RNG | uint64を8個のbyte limbで正確に保持し、実際の消費順に更新する |
| バフ・デバフ、継続ターン、position、combo、context、nowstate | 計算結果を次の状態へ引き継ぐ |
| カメラ選択、経路、座標、方向、必要なメモリ | 共通カメラグラフを実行し、計算した状態を保持する |
| row+4 | 真の外部入力境界で候補を列挙する。フォント・スタック履歴から生成しない |
| 実測情報 | 計算済みsnapshotと比較して枝を選ぶ。計算途中を上書きしない |
| 列挙・実行制御・保存 | ホストJavaScriptが担当する。戦闘結果の算術をホストへ移さない |

文字やモデルの描画、フォント処理、資源ローダー、ヒープ配置、VRAM、アロケータ、ゲームの演出環境全体の再構築は完成要件ではありません。以前の診断実装は履歴として保持していますが、現在の配布プログラムはそれらを必須依存から外しています。[以前の実装記録](docs/implementation-history-20261101.md)は現在の完成基準ではありません。

## HTMLで使う

配布の `dq9-battle-emulator.html` をブラウザーで開きます。モデル・定義・実行制御は埋め込み済みです。ONNX Runtime Webは固定した **1.31.1** をjsDelivrから取得します。

1. 初期条件を選び、編成・能力値・行動入力を必要に応じて編集します。
2. 「戦闘＋カメラ・row+4探索」を選び、開始seedとターン数を指定します。
3. row+4の探索条件を入力します。空の条件 `{}` は各必要ワードの全uint32領域を表します。
4. 実測を照合する場合は観測IDと比較条件を入力します。
5. 同時入力数と今回の計算量を指定して実行します。
6. 予算到達後は全結果JSONを保存できます。同じプログラムで読み込み、「保存位置から再開」で残りを続けられます。

数値だけの初期条件には、カメラ開始状態が含まれないものがあります。その場合は数値のみの実行として明示するか、初期カメラ条件を入力します。数値のみの結果を、カメラ乱数を含む完全な戦闘結果とは扱いません。

配布された2体のカメラ初期条件例は、初期状態を明示した検証用の入力です。全ての編成の自然な開始座標・演出プログラムを代替するものではありません。

## row+4の候補と枝の継続

row+4は、元のカメラ処理が作るrowの外部入力として扱います。元コード `func_ov025_021dffac.cpp` と同じ12体の容量を共通グラフへ実装しています。入力境界は、外側の早期return、対象行の絞り込み、dispatcherの実行条件を読み取る3個の小さなグラフで判定します。実際のcompact rowのIDと必要ワード数を返し、dispatcherが入力を使わない呼び出しでは候補を要求しません。存在しないpadding rowを独立した未知数にはしません。

生の命令領域は72件を扱います。一方、経路処理内の有効なactor順序リストは元コードの60件上限を保持します。超過は未対応として返します。容量を拡張したように見せて元の領域外を推測しません。[容量と通路判定の仕様](docs/common-camera-capacity.md)に対応する元関数と検証条件を記載しています。

各入力はunsigned 32 bitです。既定領域を、観測済みの値や少数の経験的候補へ自動で置き換えません。必要なワード数が `k` なら、全域は `2^(32*k)` 個です。領域はBigIntのカーソルを10進文字列として保存し、遅延列挙します。この巨大領域を短時間で走査できるという主張ではありません。

明示的に候補範囲を限定する場合は、各境界の必要ワード数に対応した `words` を指定します。

```js
const domains = {
  default: {
    words: [
      {min: 0, max: 4294967295, step: 1},
      {min: 0, max: 4294967295, step: 1}
      // 実際の境界が要求したワード数だけ指定する
    ]
  },
  boundaries: {
    // "turn:1/camera:0": {words: [...]}
  }
};
```

`maxCandidates`、`maxAdapterCalls`、`maxTransitions`は今回の計算量です。候補領域を縮める条件ではありません。予算で止まった候補は再開位置を残し、不一致として捨てません。未対応の処理や、照合に必要な出力が欠ける場合は `blocked` に保持します。

実測の指定例です。以下の値は書式の例で、配布モデルに埋め込んだ正解ではありません。

```js
const observations = [{
  id: 'turn:1/camera:0',
  checks: [
    {path: ['actors', 0, 'actor', 0], equals: 91},
    {path: ['position'], between: [50, 60]}
  ]
}];
```

`equals` と `oneOf` は型変換や暗黙の許容誤差を使いません。`between` は利用者が指定した包含区間です。複数の候補が同じ観測を満たすときは全ての枝を残します。見える出力が同じでも、隠れた状態が違う枝を勝手に合流しません。

各枝は、候補から計算したRNG、actor状態、combo/context、world、カメラの640 byte、関連状態、入力履歴を持ちます。実測情報は探索器にだけ渡し、戦闘・カメラの計算器へは渡しません。

詳細は [探索API](docs/common-battle-search.md) を参照してください。

## 共通実行API

```js
import {
  createCommonBattleCameraAdapter,
  createInitialBattleCameraState
} from './runtime/common-battle-camera.mjs';
import {
  createCommonBattleSearch,
  createBattleSearchState
} from './runtime/common-battle-search.mjs';

const adapter = await createCommonBattleCameraAdapter({
  program, definitions, getModel, runGraph,
  cpuDoubleProvider: 'onnxruntime-wasm'
});
const initial = createInitialBattleCameraState({input, maxTurns: 2});
const checkpoint = createBattleSearchState({
  adapterId: adapter.adapterId,
  initialState: initial,
  seedPath: ['battle', 'seed'],
  seedRange: {min: '0x1', max: '0x100', step: 1},
  domains: {},
  observations: []
});
const search = createCommonBattleSearch({
  adapterId: adapter.adapterId,
  advanceBatch: adapter.advanceBatch
});
const result = await search.run({
  state: checkpoint,
  batchSize: 64,
  maxCandidates: 1024,
  maxAdapterCalls: 256,
  maxTransitions: 100000
});
```

計算器は `needs-row4`、`observation`、`complete`、`budget`、`unsupported` を返します。`needs-row4` は安定した境界IDと必要ワード数を返し、候補入力にはそのIDを付けます。入力付き呼び出しでは `row4Consumed` が採用の有無を明示します。

採用前に予算へ達したときは同じ候補を再送します。採用後に止まったときは候補を保存状態に保持し、再開時に二重注入しません。数値ターンとカメラ呼び出しの途中で予算に達した場合は、未完成の算術prefixをターン境界と偽らず、保存した入力からその単位を再実行します。

`adapterId` は共通プログラム・モデルと定義の同一性を含みます。異なる定義や実装へ保存状態を黙って適用することはできません。

## 現在の検証と未完了境界

| 検証 | 確認した範囲 | 結果 |
| --- | --- | --- |
| 共通数値戦闘の元ROM比較 | 12戦闘・45ターン、15,819項目 | 不一致0。今回の能力変化・レベル依存式・命令生成の変更後も独立回帰比較で確認 |
| 探索制御 | 全uint32領域の表現、64 bit seed、明示範囲、全枝保持、実測照合、保存再開、中断、未対応保持 | 13試験合格。ゲーム算術の独立証明とは区別 |
| 実カメラgoal＋探索 | 元コード48例の周辺候補を明示的に列挙、元入力を保持し945項目比較、336回JSON再開 | 不一致0、48例全てで複数候補を保持。カメラ全体や全戦闘の証明とは区別 |
| 5・8・12体のgoal＋実測による絞り込み | 元ROM12例・678項目、将来のrowを変える候補、71回JSON再開 | 不一致0。3例では不整合候補を除外、9例では複数の整合枝を全保持 |
| 通路判定とその後の行動 | flag0x80と行動9〜11を含む元ROM17例・1,241項目、85回JSON再開 | 不一致0。通路で変更した状態を次の行動が読む例も含む |
| 次ターンのカメラ関連初期化 | 元ROM18例・684項目、追加54契約チェック | 不一致0。12体のbehavior、前回behavior、対象cache、必要なscene状態を比較 |
| カメラ全体の2ターン継続 | 2体・12体の4系列を各2ターン、元ROMの初期化→計20回のカメラ処理→命令進行、21,074項目、28回JSON再開 | 不一致0。RNG・座標・経路・前回behavior・必要cameraメモリ、初期化済み・自己対象・対象なしを比較。命令列は明示入力で、数値命令生成込みの証明とは区別 |
| プログラム検索と命令列の一般化 | 旧原本検証済みグラフとの112入力、および70本・105命令の境界3例、計7,183項目 | 不一致0。32件ずつ共通ONNXで処理し、旧12本・12命令制限を除去 |
| 数値結果からのカメラ命令生成 | 元ROM14例・1,173項目（うち命令列277項目） | 不一致0。能力変化、強化解除、テンション減少・回り込み、幻惑、刃の防御、通知942・944を含む |
| レベル依存ダメージ計算 | 11種類の共通式、元ROM759例・9,867項目 | 不一致0。元の式の丸め位置、乱数の消費順と回数を比較 |
| ROM不要の接続 | 実ONNX Runtimeで2ターン・6カメラ処理、5回の実入力境界×2ワード、探索・JSON再開・入力採用後中断 | 17試験合格。元ROMとの複数ターン全体比較は別に実施する |
| 容量と入力境界 | 12体、不要入力の省略、旧4体版との8例一致、72命令・60件有効順序上限 | 実ONNXの5試験合格 |

カメラ用コマンドは、共通数値グラフが実際に出力した命中・critical・guard・comboメタデータから生成します。comboのヘッダー値は最終ダメージ適用やcomboの解除より前の、元コードと同じ時点で計算します。通知942は計算済みの命令後反応、944はテンション消費・状態回復の発生条件から生成し、メッセージ文字列やallocatorの再現を要求しません。

連続カメラ処理では、強制配置時の `BF = BE` を元の条件で更新します。また、`scene + 0xdf4` と `camera + 0x260` は同じbyteなので、移動可否とカメラ初期化を一つの計算済み状態へ結びます。詳細と元コード対応は [common-camera-continuation.md](docs/common-camera-continuation.md) に記載しています。

対象なしの `-1` は元コードと同じunsigned byteの `255` として保存し、メモリとscalarのIDを一致させています。プログラム検索・opcode判定も共通ONNXで分割処理し、入力の本数や命令長を旧12件へ切り詰めません。詳細は [common-camera-byte-fields.md](docs/common-camera-byte-fields.md) と [common-camera-programs.md](docs/common-camera-programs.md) を参照してください。

致死処理、転送・反射、増援などに伴う未接続の補助命令、幅広い初期カメラプログラムの定義、数値とカメラを通した複数ターンの独立ROM比較は継続中です。未接続のケースを通常命令で代用しません。上の検証を「全バトル対応」とは表示しません。

旧版の何百万項目ものヒープ・描画資源比較は、現在の完成判定には使いません。対応範囲、要求出力の一致、探索の正確性、同一計算範囲の実測速度を報告します。

## CPU / GPUと配布リクエスト

WASMを既定にしています。WebGPUは同じONNXを使う明示的な選択肢で、暗黙のCPU fallbackを禁止しています。倍精度が必要なカメラグラフは、別に明示したWASM providerを使います。実行したproviderとGPUアダプター情報を結果に保存します。

GPUの目的は、多数の戦闘、seed、不確定入力を並列計算することです。描画性能の測定ではありません。単独グラフの処理速度を、C++の戦闘全体の件数/秒と比較しません。ソフトウェアGPUの速度を実GPUの予測値にも置き換えません。

モデル配布は**3個の圧縮bundle**へまとめ、Hugging Faceへのモデル取得リクエスト数を抑えています。各ONNXのbyte列とSHA-256は保持します。これは通信上の統合で、3個の巨大ONNXへのグラフ融合を達成したという意味ではありません。単体HTMLではモデル取得リクエストは0件です。

## ソースから再生成する

```sh
node scripts/build-release.mjs --out dist
```

生成スクリプト、共通runtime、事前に整理した定義、HTMLソースから再生成します。ROM画像、観測終状態、保存checkpoint、一時debug JSONはビルド入力にしません。

主要ファイル:

- `graph-v2/build-common-battle.mjs`: 共通プログラムとモデル依存
- `graph-v2/build-common-camera-turn.mjs`: カメラへ影響するターン境界の状態更新
- `runtime/common-battle.mjs`: 共通actor配列の実行制御
- `runtime/common-battle-camera.mjs`: 戦闘・カメラ・候補入力境界の接続
- `runtime/common-battle-search.mjs`: 全候補列挙、実測照合、全枝保存再開
- `web/battle-app.mjs`, `web/battle-template.html`: ROM不要のHTML
- `data/common-battle.mjs`: 共通定義と数値初期条件
- `data/common-battle-camera-example.mjs`: 明示したカメラ初期条件例

制御試験と実ONNX接続試験:

```sh
node scripts/verify-common-battle-search.mjs
node scripts/verify-common-battle-camera.mjs --ort-dir /path/to/onnxruntime-web-1.31.1 --out /path/to/report.json
```

GitHub Actionsは恒久ソースから生成し、リポジトリの `HF_TOKEN` secretでHugging Faceへ配布します。ROMや一時的な検証JSONをGitHubへ追加しません。通常のfast-forward更新を使います。

## 仕様の根拠

判断は元ROMの未変更命令を実行した結果とmatching decompileを優先します。既存C++エミュレータとの比較は補助であり、その一致だけを正しさの根拠にしません。

- matching decompile revision: `e0d1df250bfc554efe2fd37513a4ad3867a77b10`
- 検証ROM SHA-256: `b7a7f82f9da6f5bd08b5ae436d67cbde020f15e79534e0d34853201cd24d775d`
- RNG: `src/Util/Random.cpp`
- 行動境界と共通コマンド: `src/Combat/Overlay_0/func_ov000_02160030.cpp`
- カメラrow構築・dispatch: `src/Combat/Overlay_25/func_ov025_021dffac.cpp`
- 次ターンのカメラ関連初期化: `src/Combat/Overlay_25/func_ov025_021db6dc.cpp`
- 行動対象のcache: `src/Combat/Overlay_25/func_ov025_021dfbfc.cpp`, `src/Combat/Main/func_02049458.cpp`

各生成グラフのcontractにも対応する関数・入力条件・未対応境界を記録しています。
