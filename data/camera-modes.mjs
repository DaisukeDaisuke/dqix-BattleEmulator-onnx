// Durable initial conditions and represented camera runner declarations.
// Only initial inputs are included; no observed/expected output or debug record.
export const CAMERA_MODES = Object.freeze([
  {
    "id": "camera-phase",
    "titleJa": "カメラ：配置・経路・視点",
    "runner": {
      "path": "graph-v2/camera-phase-runner.mjs",
      "export": "createCameraPhaseRunner"
    },
    "models": [
      "rom-camera-occupancy-step",
      "rom-camera-fallback-goal",
      "rom-camera-route-prepare",
      "rom-camera-route-step",
      "rom-camera-route-accept",
      "rom-camera-route-finalize",
      "rom-camera-distance3",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-ring-labels",
      "rom-camera-class-paint",
      "rom-camera-nonmember-goal-finalize"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "occupancy": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            255,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            255,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            255,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            255,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "actors": [
            {
              "id": 0,
              "class": 242,
              "start": 1,
              "goal": 1,
              "aux": 1,
              "depth": 0,
              "flag400": false,
              "descriptorPresent": true,
              "cachedTarget": 0,
              "storedRoute": [
                11,
                14,
                17,
                20,
                23,
                26,
                29,
                32,
                35,
                38,
                41,
                44,
                47,
                50,
                53,
                56
              ]
            },
            {
              "id": 192,
              "class": 243,
              "start": 79,
              "goal": 79,
              "aux": 79,
              "depth": 0,
              "flag400": false,
              "descriptorPresent": true,
              "cachedTarget": 0,
              "storedRoute": [
                28,
                31,
                34,
                37,
                40,
                43,
                46,
                49,
                52,
                55,
                58,
                61,
                64,
                67,
                70,
                73
              ]
            }
          ],
          "observedRow4Bytes": [
            32,
            41,
            57,
            2,
            32,
            41,
            57,
            2,
            8,
            0,
            0,
            0,
            15,
            0,
            0,
            0
          ],
          "goalCalls": [
            {
              "kind": "nonmember",
              "row": 0,
              "targetRow": 1
            }
          ],
          "actionActors": [
            0,
            192,
            192
          ],
          "actionPresent": [
            true,
            true,
            true
          ],
          "currentActionIndex": 1,
          "seed": [
            244,
            243,
            96,
            71,
            27,
            198,
            66,
            26
          ],
          "position": [
            1
          ],
          "cameraState": [
            1,
            1,
            3,
            -4000,
            6000
          ],
          "presentation": {
            "programProjection": [
              0,
              0
            ],
            "history": [
              1,
              192,
              0,
              1,
              0,
              192,
              192,
              1
            ],
            "snapshotPresent": [
              true,
              true,
              true,
              true
            ],
            "actorPresent": [
              true
            ],
            "targetPresent": [
              true
            ],
            "actorFlag80": [
              false
            ],
            "membershipCount": [
              1
            ],
            "actorRouteCount": [
              2
            ],
            "participantRouteCounts": [
              2,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "targetAuxiliaryNode": [
              255
            ],
            "geometry": [
              24576,
              4096,
              8192
            ],
            "enabled": [
              true
            ]
          },
          "geometry": {
            "sourcePosition": [
              0,
              0,
              0
            ],
            "targetPosition": [
              4096,
              1024,
              8192
            ],
            "radii": [
              4096,
              8192
            ]
          },
          "camera": {
            "sourcePresent": [
              true
            ],
            "targetPresent": [
              true
            ],
            "targetHeight": [
              11468
            ],
            "recordPresent": [
              true
            ],
            "recordFirstU16": [
              1
            ]
          }
        }
      }
    ],
    "explicitCpuModels": [],
    "scopeJa": "接続済みの数値カメラ処理。row+4、初期配置、履歴は入力です。未対応条件はエラーとして報告します。"
  },
  {
    "id": "camera-dispatched-phase",
    "titleJa": "カメラ：行動リストから視点",
    "runner": {
      "path": "graph-v2/camera-dispatched-phase-runner.mjs",
      "export": "createCameraDispatchedPhaseRunner"
    },
    "models": [
      "rom-camera-goal-dispatch-init4",
      "rom-camera-goal-dispatch-decision4",
      "rom-camera-goal-dispatch-commit4",
      "rom-camera-fallback-goal",
      "rom-camera-occupancy-step",
      "rom-camera-member-goal-prepare-wide",
      "rom-camera-nearest-node",
      "rom-camera-conflict-update",
      "rom-camera-ring-labels",
      "rom-camera-nonmember-goal-finalize",
      "rom-camera-member-goal-commit-wide",
      "rom-camera-class-paint",
      "rom-camera-map-write",
      "rom-camera-delayed-paint-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-route-prepare",
      "rom-camera-route-step",
      "rom-camera-route-accept",
      "rom-camera-route-finalize",
      "rom-camera-distance3",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "roster": [
            {
              "id": 0,
              "start": 0,
              "goal": 255,
              "auxiliaryNode": 10,
              "expansionDepth": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "faceNode": 77,
              "movementPresence": 1,
              "flag400": false,
              "descriptorPresent": true,
              "flag80": false,
              "flag100": false,
              "partyStatePresent": true,
              "partyDisabled": false,
              "position": [
                -42566,
                0,
                -36864
              ],
              "lookupPresent": true,
              "storedRoute": [
                0,
                3,
                6,
                9,
                12,
                15,
                18,
                21,
                24,
                27,
                30,
                33,
                36,
                39,
                42,
                45
              ]
            },
            {
              "id": 1,
              "start": 20,
              "goal": 255,
              "auxiliaryNode": 255,
              "expansionDepth": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "faceNode": 77,
              "movementPresence": 1,
              "flag400": false,
              "descriptorPresent": true,
              "flag80": false,
              "flag100": false,
              "partyStatePresent": true,
              "partyDisabled": false,
              "position": [
                -21283,
                0,
                -18432
              ],
              "lookupPresent": true,
              "storedRoute": [
                17,
                20,
                23,
                26,
                29,
                32,
                35,
                38,
                41,
                44,
                47,
                50,
                53,
                56,
                59,
                62
              ]
            },
            {
              "id": 192,
              "start": 40,
              "goal": 255,
              "auxiliaryNode": 255,
              "expansionDepth": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "faceNode": 77,
              "movementPresence": 1,
              "flag400": true,
              "descriptorPresent": true,
              "flag80": false,
              "flag100": false,
              "partyStatePresent": false,
              "partyDisabled": false,
              "position": [
                0,
                0,
                0
              ],
              "lookupPresent": true,
              "storedRoute": [
                34,
                37,
                40,
                43,
                46,
                49,
                52,
                55,
                58,
                61,
                64,
                67,
                70,
                73,
                76,
                79
              ]
            }
          ],
          "commands": [
            {
              "actionId": 1,
              "participants": [
                0
              ],
              "targetId": 192,
              "targetPresent": true
            },
            {
              "actionId": 1,
              "participants": [
                192
              ],
              "targetId": 1,
              "targetPresent": true
            }
          ],
          "currentActionIndex": 1,
          "row4Words": [
            37300512,
            37300512,
            8,
            15
          ],
          "priorInnerFlag": false,
          "seed": [
            13,
            200,
            195,
            124,
            219,
            38,
            96,
            171
          ],
          "position": [
            1
          ],
          "cameraState": [
            0,
            0,
            3,
            -4000,
            6000
          ],
          "presentation": {
            "programProjection": [
              4,
              0
            ],
            "history": [
              1,
              192,
              1,
              1,
              1,
              192,
              192,
              1
            ],
            "snapshotPresent": [
              true,
              true,
              true,
              true
            ],
            "actorPresent": [
              true
            ],
            "targetPresent": [
              true
            ],
            "actorFlag80": [
              false
            ],
            "membershipCount": [
              1
            ],
            "actorRouteCount": [
              2
            ],
            "participantRouteCounts": [
              2,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "targetAuxiliaryNode": [
              255
            ],
            "geometry": [
              24576,
              4096,
              8192
            ],
            "enabled": [
              true
            ]
          },
          "geometry": {
            "radii": [
              4096,
              8192
            ]
          },
          "camera": {
            "sourcePresent": [
              true
            ],
            "targetPresent": [
              true
            ],
            "targetHeight": [
              10240
            ],
            "recordPresent": [
              true
            ],
            "recordFirstU16": [
              1
            ]
          }
        }
      }
    ],
    "explicitCpuModels": [],
    "scopeJa": "接続済みの数値カメラ処理。row+4、初期配置、履歴は入力です。未対応条件はエラーとして報告します。"
  },
  {
    "id": "camera-parent-phase",
    "titleJa": "カメラ：前処理から視点",
    "runner": {
      "path": "graph-v2/camera-parent-phase-runner.mjs",
      "export": "createCameraParentPhaseRunner"
    },
    "models": [
      "rom-camera-parent-control",
      "rom-camera-route-post4",
      "rom-camera-preprocess-scan4",
      "rom-camera-distance3",
      "rom-camera-preprocess-commit4",
      "rom-camera-goal-dispatch-init4",
      "rom-camera-goal-dispatch-decision4",
      "rom-camera-goal-dispatch-commit4",
      "rom-camera-fallback-goal",
      "rom-camera-occupancy-step",
      "rom-camera-member-goal-prepare-wide",
      "rom-camera-nearest-node",
      "rom-camera-conflict-update",
      "rom-camera-ring-labels",
      "rom-camera-nonmember-goal-finalize",
      "rom-camera-member-goal-commit-wide",
      "rom-camera-class-paint",
      "rom-camera-map-write",
      "rom-camera-delayed-paint-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-route-byte-prepare",
      "rom-camera-route-step",
      "rom-camera-route-byte-accept",
      "rom-camera-route-byte-finalize",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "seed": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "roster": [
            {
              "id": 0,
              "start": 0,
              "goal": 255,
              "auxiliaryNode": 10,
              "faceNode": 77,
              "flag400": false,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                -42566,
                0,
                -36864
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "partyStatePresent": true,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ]
            },
            {
              "id": 1,
              "start": 20,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": false,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                -21283,
                0,
                -18432
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                12,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                1,
                12,
                23,
                34,
                45,
                56,
                67,
                78,
                89,
                100,
                111,
                122,
                133,
                144,
                155,
                166
              ],
              "partyStatePresent": true,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                1,
                12,
                23,
                34,
                45,
                56,
                67,
                78,
                89,
                100,
                111,
                122,
                133,
                144,
                155,
                166
              ]
            },
            {
              "id": 192,
              "start": 40,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": true,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                0,
                0,
                0
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                203,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "partyStatePresent": false,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ]
            }
          ],
          "commands": [
            {
              "actionId": 1,
              "participants": [
                0
              ],
              "targets": [
                192
              ],
              "targetId": 192,
              "targetPresent": true
            },
            {
              "actionId": 1,
              "participants": [
                192
              ],
              "targets": [
                1
              ],
              "targetId": 1,
              "targetPresent": true
            }
          ],
          "lookupObjects": [],
          "currentActionIndex": 1,
          "battleType": 0,
          "sceneByte": 164,
          "row4Words": [
            37300512,
            37300512,
            8,
            15
          ],
          "priorInnerFlag": false,
          "position": [
            1
          ],
          "cameraState": [
            0,
            0,
            3,
            -4000,
            6000
          ],
          "programPresent": true,
          "presentationParticipantIds": [
            0,
            1,
            192
          ],
          "presentation": {
            "programProjection": [
              4,
              0
            ],
            "history": [
              1,
              192,
              1,
              1,
              1,
              192,
              192,
              1
            ],
            "snapshotPresent": [
              true,
              true,
              true,
              true
            ],
            "actorPresent": [
              true
            ],
            "targetPresent": [
              true
            ],
            "actorFlag80": [
              false
            ],
            "membershipCount": [
              1
            ],
            "actorRouteCount": [
              2
            ],
            "participantRouteCounts": [
              2,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "targetAuxiliaryNode": [
              255
            ],
            "geometry": [
              24576,
              4096,
              8192
            ],
            "enabled": [
              true
            ]
          },
          "geometry": {
            "radii": [
              4096,
              8192
            ]
          },
          "camera": {
            "targetHeight": [
              10240
            ],
            "recordPresent": [
              true
            ],
            "recordFirstU16": [
              1
            ]
          }
        }
      }
    ],
    "explicitCpuModels": [],
    "scopeJa": "初期名簿・行動リスト・生のフラグから、前処理→特殊戦闘の名簿/分岐→ゴール割当→経路→表示フラグまでを実ROM52ケースと照合しています。その後のprogram有無、参加者一覧、履歴、半径、高さは明示入力として、視点選択と乱数消費へ接続します。カメラ全体の完成は主張しません。"
  },
  {
    "id": "camera-admission-phase",
    "titleJa": "カメラ：表示プログラムから視点",
    "runner": {
      "path": "graph-v2/camera-admission-phase-runner.mjs",
      "export": "createCameraAdmissionPhaseRunner"
    },
    "models": [
      "rom-camera-admission-entry4",
      "rom-camera-program-admission4",
      "rom-camera-parent-control",
      "rom-camera-route-post4",
      "rom-camera-preprocess-scan4",
      "rom-camera-distance3",
      "rom-camera-preprocess-commit4",
      "rom-camera-goal-dispatch-init4",
      "rom-camera-goal-dispatch-decision4",
      "rom-camera-goal-dispatch-commit4",
      "rom-camera-fallback-goal",
      "rom-camera-occupancy-step",
      "rom-camera-member-goal-prepare-wide",
      "rom-camera-nearest-node",
      "rom-camera-conflict-update",
      "rom-camera-ring-labels",
      "rom-camera-nonmember-goal-finalize",
      "rom-camera-member-goal-commit-wide",
      "rom-camera-class-paint",
      "rom-camera-map-write",
      "rom-camera-delayed-paint-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-route-byte-prepare",
      "rom-camera-route-step",
      "rom-camera-route-byte-accept",
      "rom-camera-route-byte-finalize",
      "rom-camera-admission-event-view4",
      "rom-camera-admission-event-commit4",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "seed": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "roster": [
            {
              "id": 0,
              "start": 0,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": false,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                -42566,
                0,
                -36864
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "residentProgram": 0,
              "height": 4096,
              "radius": 4096,
              "partyStatePresent": true,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "objectFlags": 0
            },
            {
              "id": 192,
              "start": 40,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": true,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                0,
                0,
                0
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "residentProgram": 0,
              "height": 10241,
              "radius": 4096,
              "partyStatePresent": false,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "objectFlags": 0
            }
          ],
          "commands": [
            {
              "actionId": 1,
              "participants": [
                0
              ],
              "targets": [
                192
              ],
              "targetId": 192,
              "targetPresent": true
            }
          ],
          "lookupObjects": [],
          "currentActionIndex": 0,
          "battleType": 0,
          "sceneByte": 164,
          "row4Words": [
            41825416,
            2,
            0,
            0
          ],
          "priorInnerFlag": false,
          "residentPrograms": [
            {
              "actions": [
                1
              ],
              "codes": []
            }
          ],
          "fallbackProgram": -1,
          "rawActions": [
            "00000000010000000019000a00000100f83bff010000805c200002400000000001042000051070000824c0089b00000800000000",
            "260000000920c3f90259400807000200517400000000402620200200e70330002eb82000056cb0010824d0088d00000800000000"
          ],
          "presentationState": 0,
          "queuedPresentationRecords": [],
          "position": [
            1
          ],
          "cameraState": [
            0,
            77,
            3,
            12345,
            -23456
          ],
          "enabled": true
        }
      }
    ],
    "explicitCpuModels": [],
    "scopeJa": "初期RAMの連結プログラム、行動リスト、名簿と観測状態から、前処理→移動計画→表示プログラム選択→距離→視点選択→乱数消費を接続します。外側関数の入口から同じメモリで実行した実ROM116ケースと、表現対象7,380項目が一致しています。表示後の描画・非同期資源読み込み・未知のrow+4生成は未接続で、カメラ全体の完成は主張しません。"
  },
  {
    "id": "camera-tail-phase",
    "titleJa": "カメラ：最終座標・向き・シーン",
    "runner": {
      "path": "graph-v2/camera-tail-phase-runner.mjs",
      "export": "createCameraTailPhaseRunner"
    },
    "models": [
      "rom-camera-admission-entry4",
      "rom-camera-program-admission4",
      "rom-camera-parent-control",
      "rom-camera-route-post4",
      "rom-camera-preprocess-scan4",
      "rom-camera-distance3",
      "rom-camera-preprocess-commit4",
      "rom-camera-goal-dispatch-init4",
      "rom-camera-goal-dispatch-decision4",
      "rom-camera-goal-dispatch-commit4",
      "rom-camera-fallback-goal",
      "rom-camera-occupancy-step",
      "rom-camera-member-goal-prepare-wide",
      "rom-camera-nearest-node",
      "rom-camera-conflict-update",
      "rom-camera-ring-labels",
      "rom-camera-nonmember-goal-finalize",
      "rom-camera-member-goal-commit-wide",
      "rom-camera-class-paint",
      "rom-camera-map-write",
      "rom-camera-delayed-paint-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-route-byte-prepare",
      "rom-camera-route-step",
      "rom-camera-route-byte-accept",
      "rom-camera-route-byte-finalize",
      "rom-camera-admission-event-view4",
      "rom-camera-admission-event-commit4",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step",
      "rom-camera-world-prefix1",
      "rom-camera-tail-control",
      "rom-camera-route-finalize16",
      "rom-camera-facing-direction3",
      "rom-camera-tail-object1"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "seed": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "roster": [
            {
              "id": 0,
              "start": 0,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": false,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                -42566,
                0,
                -36864
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "residentProgram": 0,
              "height": 4096,
              "radius": 4096,
              "partyStatePresent": true,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "objectFlags": 0,
              "rotation": [
                0,
                0,
                0
              ],
              "orientationAE": 0,
              "pendingFacingTarget": 0,
              "objectIndex": 0,
              "behaviorBE": 0,
              "flagsC4": 0
            },
            {
              "id": 192,
              "start": 40,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": true,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                0,
                0,
                0
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "residentProgram": 0,
              "height": 10241,
              "radius": 4096,
              "partyStatePresent": false,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "objectFlags": 0,
              "rotation": [
                0,
                0,
                0
              ],
              "orientationAE": 0,
              "pendingFacingTarget": 0,
              "objectIndex": 192,
              "behaviorBE": 0,
              "flagsC4": 0
            }
          ],
          "commands": [
            {
              "actionId": 1,
              "participants": [
                0
              ],
              "targets": [
                192
              ],
              "targetId": 192,
              "targetPresent": true
            }
          ],
          "lookupObjects": [],
          "currentActionIndex": 0,
          "battleType": 0,
          "sceneByte": 164,
          "row4Words": [
            41825416,
            2,
            0,
            0
          ],
          "priorInnerFlag": false,
          "residentPrograms": [
            {
              "actions": [
                1
              ],
              "codes": []
            }
          ],
          "fallbackProgram": -1,
          "rawActions": [
            "00000000010000000019000a00000100f83bff010000805c200002400000000001042000051070000824c0089b00000800000000",
            "260000000920c3f90259400807000200517400000000402620200200e70330002eb82000056cb0010824d0088d00000800000000"
          ],
          "presentationState": 0,
          "queuedPresentationRecords": [],
          "position": [
            1
          ],
          "cameraState": [
            0,
            77,
            3,
            12345,
            -23456
          ],
          "resourceFlags04": 1515848704,
          "sceneByte71c5": 0,
          "programFlags3e8": 0,
          "enabled": true,
          "cameraInitialized": false,
          "advanceDelay": 0,
          "advanceState": 0
        }
      }
    ],
    "explicitCpuModels": [],
    "scopeJa": "初期RAMの行動・名簿・programと観測4wordから、移動計画、視点選択と乱数、表示後の座標・yaw・対象への向き・経路バイト・scene/resourceフラグまでを接続します。外側関数を最後まで実行した実ROM140ケースの表現対象13,304項目が一致。カメラ極座標・行列160word、一般アニメーション、非同期I/O、未知のrow+4生成は未接続です。"
  },
  {
    "id": "camera-enclosing-phase",
    "titleJa": "カメラ：関連メモリ160ワード",
    "runner": {
      "path": "graph-v2/camera-enclosing-phase-runner.mjs",
      "export": "createCameraEnclosingPhaseRunner"
    },
    "models": [
      "rom-camera-admission-entry4",
      "rom-camera-program-admission4",
      "rom-camera-parent-control",
      "rom-camera-route-post4",
      "rom-camera-preprocess-scan4",
      "rom-camera-distance3",
      "rom-camera-preprocess-commit4",
      "rom-camera-goal-dispatch-init4",
      "rom-camera-goal-dispatch-decision4",
      "rom-camera-goal-dispatch-commit4",
      "rom-camera-fallback-goal",
      "rom-camera-occupancy-step",
      "rom-camera-member-goal-prepare-wide",
      "rom-camera-nearest-node",
      "rom-camera-conflict-update",
      "rom-camera-ring-labels",
      "rom-camera-nonmember-goal-finalize",
      "rom-camera-member-goal-commit-wide",
      "rom-camera-class-paint",
      "rom-camera-map-write",
      "rom-camera-delayed-paint-step",
      "rom-camera-nonmember-goal-prepare",
      "rom-camera-route-byte-prepare",
      "rom-camera-route-step",
      "rom-camera-route-byte-accept",
      "rom-camera-route-byte-finalize",
      "rom-camera-admission-event-view4",
      "rom-camera-admission-event-commit4",
      "rom-free-camera-selector",
      "rom-free-camera-rng-step",
      "rom-camera-world-prefix1",
      "rom-camera-tail-control",
      "rom-camera-route-finalize16",
      "rom-camera-facing-direction3",
      "rom-camera-tail-object1",
      "rom-free-camera-geometry-prepare3",
      "rom-camera-set-polar-wide3",
      "rom-free-camera-range3",
      "rom-free-camera-follow-update3",
      "rom-camera-border-constraint3",
      "rom-camera-reverse-polar-values-cpu3",
      "rom-camera-memory-patch160",
      "rom-camera-record-bind160"
    ],
    "presets": [
      {
        "id": "initial-1",
        "labelJa": "初期条件1",
        "inputs": {
          "seed": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "roster": [
            {
              "id": 0,
              "start": 0,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": false,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                -42566,
                0,
                -36864
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "residentProgram": 0,
              "height": 4096,
              "radius": 4096,
              "partyStatePresent": true,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                0,
                11,
                22,
                33,
                44,
                55,
                66,
                77,
                88,
                99,
                110,
                121,
                132,
                143,
                154,
                165
              ],
              "objectFlags": 0,
              "rotation": [
                0,
                0,
                0
              ],
              "orientationAE": 0,
              "pendingFacingTarget": 0,
              "objectIndex": 0,
              "behaviorBE": 0,
              "flagsC4": 0
            },
            {
              "id": 192,
              "start": 40,
              "goal": 255,
              "auxiliaryNode": 255,
              "faceNode": 77,
              "flag400": true,
              "descriptorPresent": true,
              "expansionDepth": 0,
              "movementPresence": 1,
              "flag80": 0,
              "flag100": 0,
              "preferredTarget": 255,
              "secondaryTarget": 255,
              "position": [
                0,
                0,
                0
              ],
              "visualPresent": true,
              "routeCount": 3,
              "routeStep": -7,
              "routeTime": 123,
              "visualFlags": 0,
              "routePositionXYZ": [
                11,
                22,
                33
              ],
              "resetPositionXYZ": [
                99,
                88,
                77
              ],
              "initialRouteBytes": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "residentProgram": 0,
              "height": 10241,
              "radius": 4096,
              "partyStatePresent": false,
              "partyDisabled": false,
              "lookupPresent": true,
              "storedRoute": [
                192,
                203,
                214,
                225,
                236,
                247,
                2,
                13,
                24,
                35,
                46,
                57,
                68,
                79,
                90,
                101
              ],
              "objectFlags": 0,
              "rotation": [
                0,
                0,
                0
              ],
              "orientationAE": 0,
              "pendingFacingTarget": 0,
              "objectIndex": 192,
              "behaviorBE": 0,
              "flagsC4": 0
            }
          ],
          "commands": [
            {
              "actionId": 1,
              "participants": [
                0
              ],
              "targets": [
                192
              ],
              "targetId": 192,
              "targetPresent": true
            }
          ],
          "lookupObjects": [],
          "currentActionIndex": 0,
          "battleType": 0,
          "sceneByte": 164,
          "row4Words": [
            41825416,
            2,
            0,
            0
          ],
          "priorInnerFlag": false,
          "residentPrograms": [
            {
              "actions": [
                1
              ],
              "codes": []
            }
          ],
          "fallbackProgram": -1,
          "rawActions": [
            "00000000010000000019000a00000100f83bff010000805c200002400000000001042000051070000824c0089b00000800000000",
            "260000000920c3f90259400807000200517400000000402620200200e70330002eb82000056cb0010824d0088d00000800000000"
          ],
          "presentationState": 0,
          "queuedPresentationRecords": [],
          "position": [
            1
          ],
          "cameraState": [
            0,
            77,
            3,
            12345,
            -23456
          ],
          "resourceFlags04": 1515848704,
          "sceneByte71c5": 0,
          "programFlags3e8": 0,
          "enabled": true,
          "cameraInitialized": false,
          "advanceDelay": 0,
          "advanceState": 0,
          "cameraGeometry": {
            "position": [
              0,
              0,
              0
            ],
            "lookAt": [
              0,
              0,
              0
            ],
            "polar": [
              0,
              0,
              0
            ],
            "roll": 0,
            "rollScratch": [
              0,
              0
            ],
            "range": 0,
            "mode": 0,
            "initialized": 0,
            "camera261": 0,
            "sourceId": 0,
            "targetId": 0,
            "firstCameraFlag": 0,
            "globals7": [
              77,
              3,
              0,
              12345,
              -23456,
              0,
              0
            ],
            "counter": 0
          },
          "commandBaseU16": [
            33308,
            574
          ],
          "cameraRngPointerU16": [
            0,
            574
          ],
          "initialGeometryLayout": "explicit-zero-camera-with-fields-v1"
        }
      }
    ],
    "explicitCpuModels": [
      "rom-camera-reverse-polar-values-cpu3"
    ],
    "scopeJa": "観測4wordと初期RAMから移動計画・program・視点選択、極座標・追従・境界制限、最終world/向き/sceneとカメラ160wordを接続。実ROM外側140呼出しの38,440項目が一致。逆極座標のbinary64小核1個は明示CPU/WASM、他の数値核は選択backend。非同期フレーム進行・一般animation・描画・未知row+4生成は未接続。"
  }
]);
