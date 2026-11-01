---
license: unlicense
language:
  - ja
tags:
  - onnx
  - deterministic
  - game-simulation
---
# DQIX Battle Emulator — 共通ONNXグラフ

DQ9の戦闘規則を、共有ONNXモジュールと1つの戦闘制御で実行する開発中のエミュレータです。ボスの違いは能力値・編成・行動表・初期状態として入力します。ボスごとのプログラム生成や専用実行経路の選択は、公開ビルドから外しました。学習による近似は使用しません。
最終的な判断根拠はROMに対応するGhidra解析とデコンパイルです。従来のバトルエミュレータは比較対象として使用します。定義データに存在するモンスターの件数と、戦闘全体の正確性を確認できた件数は区別します。全構成・全効果・カメラ全体の完成を主張するものではありません。
## HTML PoC

[Hugging Faceの成果物](https://huggingface.co/RabbitDaisuke/dqix-BattleEmulator-onnx/tree/main)から`dq9-battle-emulator.html`をダウンロードし、ブラウザーで開きます。

1. 戦闘の入力定義を選択します。どの入力も同じ共通プログラムと同じモジュール集合を使用します。
2. 開始seed、連続seed数、同時に実行する入力数（既定256）、最大ターン数、状態遷移の実行予算を指定します。入力数が多い場合も、全seedを順番どおりに分割して実行します。
3. 必要に応じて編成・初期状態JSONの`actors`を編集します。行動・モンスター定義JSONも変更できます。
4. 既定の計算範囲は「数値遷移のみ」です。カメラを接続する場合は「数値遷移と指定カメラ呼出し」を選び、`camera.initial`にvisual roster・program・呼出し開始状態・同一stackのABIを指定します。外部状態`row+4`は4個のunsigned 32bit整数として入力します。未確定値を固定値で補う処理はありません。
5. 実行し、途中状態、最終状態、未実装の効果・制御、予算到達を確認します。全結果JSONに入力・定義・実行条件・共通プログラムSHA-256・モジュールSHA-256を収録します。

標準経路は**ONNX Runtime Web 1.31.1のWASM実行**です。JSとWASMは同じバージョンをjsDelivrから読み込みます。モデル・定義データ・共通ランタイムはHTMLに含みます。
実行方式で**WebGPU**を選択すると、同じONNXをWebGPUで実行します。対応アダプターを取得できない場合は明示的に停止し、WASMへ自動で切り替えません。倍精度が必要なカメラモデルは、宣言した1つのCPUモデルとして別の通常WASMランタイムで実行します。GPU用配布物に含まれるCPU実行器には、この倍精度演算が含まれないためです。結果にはアダプター情報、実際に使ったprovider、GPU・WASMそれぞれの呼出し数を記録します。
入力一覧の「共通戦闘 → カメラ接続の初期入力例」は、visualとABIを含む開始条件が入力済みです。この例も同じ共通プログラムを使用し、数値戦闘で算出した行動列からカメラを更新します。期待値や観測済みの途中状態は埋め込んでいません。
検証用のスカラーWASM実行器も同じONNXを使用します。この実行器が扱わない`GatherElements`および倍精度モデルは、明示してORTを併用します。照合結果には共有したORTモデル名を記録します。実行器どうしの一致は、ROMを独立に実行した検証と同一ではありません。
計測は初期化・ウォームアップ・実行を分けます。全seedを保持し、途中でseedを選別しません。要求件数、実行に着手した件数、完了件数、未着手件数を区別し、中断や未完了の戦闘を完了件数の速度へ混ぜません。表示する速度は、選択したprovider・処理範囲・端末に対する実測です。ソフトウェアGPUの結果を実機GPUの速度とは扱わず、部分カーネルの速度から戦闘全体やC++版との速度差を推定しません。
## 共通状態と定義データ

[`runtime/common-battle.mjs`](runtime/common-battle.mjs)が、共通の行動順、AI選択、対象処理、効果実行、状態更新を制御します。[`graph-v2/build-common-battle.mjs`](graph-v2/build-common-battle.mjs)が共通実行定義と必要なグラフを生成します。[`data/common-battle.mjs`](data/common-battle.mjs)は行動・モンスター定義と初期編成です。
各actorは`actorId`、所属、現在の定義ID、能力値、HP・MP、状態、テンション、AI進捗などを持ちます。複数の味方・敵を同じ配列に格納し、行動者と対象をIDで参照します。1人対1体の状態配置を全戦闘の共通形式にはしていません。
戦闘全体の入力には乱数状態、乱数位置、ターン、コンボ、グループのAI進捗、カメラ状態も含みます。AI表の遷移や再選択は共通制御で扱います。使用する効果がすでに実装されている定義は、データを追加して参照する構造です。未実装の効果・条件を専用ボスプログラムへ逃がすことはしません。
公開成果物の`programs/common-battle.json`は1件だけです。全入力定義は`runtime-index.json`から同じプログラムSHA-256を参照し、モジュール集合も一致します。公開検証は、この不変条件に加えて、HTML埋め込みデータと公開JSONの一致を検査します。
## 正確性と未完了状態

64bit乱数は小さな整数へ分割してONNXへ渡し、乱数の消費数・消費順序を状態として保持します。float32に単純変換して64bit整数を失う方式は取りません。整数幅、符号、丸め、比較順序は、各グラフの値域契約と元処理の規則で扱います。
実行予算に達した戦闘は継続中の状態として残します。未実装の効果や制御は、その入力・行動・不足した処理とともに報告し、通常の拒否、勝利、敗北に置き換えません。データ表の取り込み、グラフの生成成功、単体カメラ処理の一致だけで、戦闘全体の完成とはしません。
カメラの単体検査もHTMLに保持しています。これらは共有カメラモジュールを検査するための入力であり、ボス別の戦闘プログラムではありません。カメラの外部状態・接続範囲は個別の結果に記録します。

[`runtime/common-presentation.mjs`](runtime/common-presentation.mjs)は、数値処理が生成した行動記録を共有カメラへ渡し、乱数・world・カメラメモリー・導出した次の`row+4`を各呼出しへ引き継ぎます。観測済みの中間行動列を初期入力として与える経路はありません。現在のvisual rosterは最大4体、演出行動はROMのコマンド領域に合わせて最大72件です。数値側の編成上限は味方4人・敵8体・敵グループ3組で、カメラ側の制限と区別しています。非同期の補助イベントと次の数値ターンへの復帰が未解決なら、`projectionComplete`と`wholeCameraComplete`を分けて報告します。`complete`は要求した処理範囲の完了を表し、`wholeBattleComplete`とは区別します。

AI対象callbackも共有グラフへ合成します。[`graph-v2/common-target-callbacks.mjs`](graph-v2/common-target-callbacks.mjs)のcallback72は、怒りの対象または味方候補から守備力と守備力段階を検査し、元の重み付き反復抽選へ渡します。callback159は、ROMにある`object.enemyType == 314`とsigned `stats+0x2c <= 0`の条件を入力状態に適用します。このobject IDは現在のAI定義IDと独立して保持します。これらの条件は別の戦闘プログラムを選択しません。
「かばう」はAIの対象選択、共有乱数の抽選後の被弾先変更、連続攻撃中の対象再選択を共通処理へ接続しています。魔法・息などの耐性効果は、付与と持続・解除の順序を共有します。未実装の反射・反撃、アイテム消費の呼出し側処理、補助演出などは、関係する入力に到達した時点で具体的な不足として報告します。対応状況は同じビルドが生成する`data/action-coverage.json`と実行結果で確認できます。
## ソースから生成

Node.js 24とPython 3.12を使用します。グラフとHTMLの生成にnpmパッケージの追加は不要です。
```sh
node scripts/build-release.mjs --out dist
python -m pip install -r requirements-build.txt
python scripts/validate_release.py dist
```
公開ソースからONNX、グラフIR、共通実行定義、入力データ、単一HTMLを新規生成します。ROM本体、個人の絶対パス、Ghidraプロジェクト、過去の生成モデル、一時的なデバッグJSONをビルドの必須入力にしません。原資料のハッシュは`data/source-authority.mjs`に、必要な数値定数は公開データに保持します。
`dist/release-manifest.json`は全成果物のパス、サイズ、SHA-256、生成元コミットを記録します。検証スクリプトは未宣言ファイルを拒否し、共通プログラムの同一性と全ONNXの公式checker full checkを確認します。`--reuse-generated`はローカルの再梱包用で、CIは常にソースから生成します。

## ローカルの実行検証

既存のONNX Runtime Web 1.31.1配布ディレクトリーを`ORT_RUNTIME_DIR`へ指定すると、追加ダウンロードなしで共通プログラムを検証できます。

```sh
node scripts/verify-common-battle.mjs --ort-dir "$ORT_RUNTIME_DIR"
node scripts/verify-common-target-callbacks.mjs --ort-dir "$ORT_RUNTIME_DIR" --source strict-arm-target-response.json
node scripts/verify-common-battle-rom.mjs --ort-dir "$ORT_RUNTIME_DIR" --records projected-turn-records.json --source-root /path/to/private-evidence
```

最初の検証は単独入力とバッチ、AI定義IDの付け替え、明示した実行予算、スカラー実行器との一致を確認します。後の2つは別途保管した厳密なARM実行証拠を読み、初期入力だけから計算した結果と照合します。多ターン証拠では各途中ターンまでを初期状態から再実行し、期待される途中結果を次の入力に流用しません。入力証拠・モデル・共通プログラム・ランタイムのハッシュを結果に記録します。証拠JSONやROMは公開ビルドの依存物に含めません。
## GitHub Actions → Hugging Face

`main`へのpushと手動実行で[公開ワークフロー](.github/workflows/convert-release.yml)が動きます。既存シークレット`HF_TOKEN`はpublishステップだけに渡し、検証済み成果物を`RabbitDaisuke/dqix-BattleEmulator-onnx`へ公開します。
公開処理はHugging Faceの親コミットを指定して追加コミットを作り、返された不変のコミットIDから成果物を読み戻してサイズとSHA-256を照合します。過去のHFファイルは削除しないため、実行入口は最新の`runtime-index.json`と`dq9-battle-emulator.html`です。旧ボス別JSONが過去の公開履歴にあっても、最新の共通実行経路では参照しません。
GitHubには生成元のソースと恒久データを置きます。生成モデルとHTMLはActionsから公開し、一時的な照合結果やROM本体はGitHubへ含めません。
