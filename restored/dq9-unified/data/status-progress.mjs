// Status duration and recovery rules, without lowered game bodies.
export default {
  "expirations": [
    {
      "offset": 20,
      "mask": 64,
      "counter": 130,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 64
        },
        {
          "offset": 92,
          "mask": 4278190080
        },
        {
          "offset": 128,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 256,
      "counter": 131,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 256
        },
        {
          "offset": 96,
          "mask": 255
        },
        {
          "offset": 128,
          "mask": 4278190080
        }
      ],
      "event": 45,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 512,
      "counter": 132,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 512
        },
        {
          "offset": 96,
          "mask": 65280
        },
        {
          "offset": 132,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 134217728,
      "counter": 133,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 134217728
        },
        {
          "offset": 96,
          "mask": 16711680
        },
        {
          "offset": 132,
          "mask": 65280
        }
      ],
      "event": 40,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 268435456,
      "counter": 134,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 268435456
        },
        {
          "offset": 96,
          "mask": 4278190080
        },
        {
          "offset": 132,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 536870912,
      "counter": 135,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 536870912
        },
        {
          "offset": 100,
          "mask": 255
        },
        {
          "offset": 132,
          "mask": 4278190080
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 67108864,
      "counter": 137,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 67108864
        },
        {
          "offset": 100,
          "mask": 16711680
        },
        {
          "offset": 136,
          "mask": 65280
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 4194304,
      "counter": 138,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 4194304
        },
        {
          "offset": 100,
          "mask": 4278190080
        },
        {
          "offset": 136,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 128,
      "counter": 141,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 128
        },
        {
          "offset": 32,
          "mask": 234881024
        },
        {
          "offset": 104,
          "mask": 16711680
        },
        {
          "offset": 140,
          "mask": 65280
        }
      ],
      "event": 0,
      "subtype": true,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 8,
      "counter": 142,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 8
        },
        {
          "offset": 104,
          "mask": 4278190080
        },
        {
          "offset": 140,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 16,
      "counter": 158,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 16
        },
        {
          "offset": 120,
          "mask": 4278190080
        },
        {
          "offset": 156,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 2,
      "counter": 143,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 2
        },
        {
          "offset": 108,
          "mask": 255
        },
        {
          "offset": 140,
          "mask": 4278190080
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 4,
      "counter": 144,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 4
        },
        {
          "offset": 108,
          "mask": 65280
        },
        {
          "offset": 144,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 1024,
      "counter": 145,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 1024
        },
        {
          "offset": 88,
          "mask": 7
        },
        {
          "offset": 108,
          "mask": 16711680
        },
        {
          "offset": 144,
          "mask": 65280
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 0
    },
    {
      "offset": 20,
      "mask": 2048,
      "counter": 146,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 2048
        },
        {
          "offset": 88,
          "mask": 56
        },
        {
          "offset": 108,
          "mask": 4278190080
        },
        {
          "offset": 144,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 1
    },
    {
      "offset": 20,
      "mask": 4096,
      "counter": 147,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 4096
        },
        {
          "offset": 88,
          "mask": 448
        },
        {
          "offset": 112,
          "mask": 255
        },
        {
          "offset": 144,
          "mask": 4278190080
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 2
    },
    {
      "offset": 20,
      "mask": 8192,
      "counter": 148,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 8192
        },
        {
          "offset": 88,
          "mask": 3584
        },
        {
          "offset": 112,
          "mask": 65280
        },
        {
          "offset": 148,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 3
    },
    {
      "offset": 20,
      "mask": 16384,
      "counter": 149,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 16384
        },
        {
          "offset": 88,
          "mask": 28672
        },
        {
          "offset": 112,
          "mask": 16711680
        },
        {
          "offset": 148,
          "mask": 65280
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 4
    },
    {
      "offset": 20,
      "mask": 32768,
      "counter": 150,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 32768
        },
        {
          "offset": 88,
          "mask": 229376
        },
        {
          "offset": 112,
          "mask": 4278190080
        },
        {
          "offset": 148,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": 5
    },
    {
      "offset": 20,
      "mask": 65536,
      "counter": 151,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 65536
        },
        {
          "offset": 88,
          "mask": 1835008
        },
        {
          "offset": 116,
          "mask": 255
        },
        {
          "offset": 148,
          "mask": 4278190080
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 131072,
      "counter": 152,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 131072
        },
        {
          "offset": 88,
          "mask": 14680064
        },
        {
          "offset": 116,
          "mask": 65280
        },
        {
          "offset": 152,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 1,
      "counter": 153,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 1
        },
        {
          "offset": 88,
          "mask": 117440512
        },
        {
          "offset": 116,
          "mask": 16711680
        },
        {
          "offset": 152,
          "mask": 65280
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 20,
      "mask": 33554432,
      "counter": 154,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 33554432
        },
        {
          "offset": 88,
          "mask": 939524096
        },
        {
          "offset": 116,
          "mask": 4278190080
        },
        {
          "offset": 152,
          "mask": 16711680
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 512,
      "counter": 155,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 512
        },
        {
          "offset": 120,
          "mask": 255
        },
        {
          "offset": 152,
          "mask": 4278190080
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 1024,
      "counter": 156,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 1024
        },
        {
          "offset": 120,
          "mask": 65280
        },
        {
          "offset": 156,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    },
    {
      "offset": 24,
      "mask": 256,
      "counter": 160,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 24,
          "mask": 256
        },
        {
          "offset": 124,
          "mask": 65280
        },
        {
          "offset": 160,
          "mask": 255
        }
      ],
      "event": 0,
      "subtype": false,
      "refresh": -1
    }
  ],
  "durations": [
    {
      "offset": 24,
      "mask": 1024,
      "index": 29,
      "steps": 1
    },
    {
      "offset": 24,
      "mask": 512,
      "index": 28,
      "steps": 1
    },
    {
      "offset": 20,
      "mask": 64,
      "index": 3,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 256,
      "index": 4,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 512,
      "index": 5,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 134217728,
      "index": 6,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 268435456,
      "index": 7,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 536870912,
      "index": 8,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 67108864,
      "index": 10,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 4194304,
      "index": 11,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 8,
      "index": 15,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 128,
      "index": 14,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 16,
      "index": 31,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 2,
      "index": 16,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 4,
      "index": 17,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 1024,
      "index": 18,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 2048,
      "index": 19,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 4096,
      "index": 20,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 8192,
      "index": 21,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 16384,
      "index": 22,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 32768,
      "index": 23,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 65536,
      "index": 24,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 131072,
      "index": 25,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 1,
      "index": 26,
      "steps": 4
    },
    {
      "offset": 20,
      "mask": 33554432,
      "index": 27,
      "steps": 4
    },
    {
      "offset": 24,
      "mask": 256,
      "index": 33,
      "steps": 4
    }
  ],
  "primary": [
    {
      "offset": 20,
      "mask": 8,
      "index": 0,
      "action": 900,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 8
        },
        {
          "offset": 92,
          "mask": 255
        },
        {
          "offset": 124,
          "mask": 4278190080
        }
      ]
    },
    {
      "offset": 20,
      "mask": 16,
      "index": 1,
      "action": 901,
      "thresholds": [
        100,
        88,
        63,
        38
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 16
        },
        {
          "offset": 92,
          "mask": 65280
        },
        {
          "offset": 128,
          "mask": 255
        }
      ]
    },
    {
      "offset": 20,
      "mask": 32,
      "index": 2,
      "action": 938,
      "thresholds": [
        100,
        88,
        75,
        63
      ],
      "clear": [
        {
          "offset": 20,
          "mask": 32
        },
        {
          "offset": 92,
          "mask": 16711680
        },
        {
          "offset": 128,
          "mask": 65280
        }
      ]
    }
  ],
  "sources": [
    {
      "name": "func_ov000_0215858c",
      "source": "src/Combat/Overlay_0/func_ov000_0215858c.cpp",
      "sha256": "793bcbe37362a785ab8174586032edc4074133f8d00251787e61e4f7a3fdd850"
    },
    {
      "name": "func_ov000_02156b20",
      "source": "src/Combat/Overlay_0/func_ov000_02156b20.cpp",
      "sha256": "4d8186a7e79b0a293a240c6aa0a8f1cc4bdebaf68f00f1a3e7701bd5530aaca9"
    },
    {
      "name": "func_02088874",
      "source": "src/Combat/Main/func_02088874.cpp",
      "sha256": "0a58144a7843b6073732a49573882e340c3896eb936bf07a62256cb7cf565a89"
    },
    {
      "name": "func_ov000_0215985c",
      "source": "src/Combat/Overlay_0/func_ov000_0215985c.cpp",
      "sha256": "340200ff49875680e1403dd7675e26ec4457d41561b7a9bd0a0258261486afc7"
    },
    {
      "name": "func_020888c4",
      "source": "src/Combat/Main/func_020888c4.cpp",
      "sha256": "74ce223b0cd772c805076be527151182f3a0dc2add24436338d03303f49c5169"
    },
    {
      "name": "func_ov000_02159874",
      "source": "src/Combat/Overlay_0/func_ov000_02159874.cpp",
      "sha256": "a68527a6fa0cae70da7308c550195cdd9822b5513a3051c143dcd28e8f7c5a10"
    },
    {
      "name": "func_02088914",
      "source": "src/Combat/Main/func_02088914.cpp",
      "sha256": "751690ee0f9fbe85c60a59abcf88b4b821e98544284388f0c09135c24bab39ab"
    },
    {
      "name": "func_ov000_0215516c",
      "source": "src/Combat/Overlay_0/func_ov000_0215516c.cpp",
      "sha256": "71085d32a0f4b45b29c9dcf5b724c2e091501305545382622734f9350399f990"
    },
    {
      "name": "func_020889b4",
      "source": "src/Combat/Main/func_020889b4.cpp",
      "sha256": "a5e2910a46eb17cf1221ef0422bcee2a54ca2a92da390b187f84d8f06f709cb0"
    },
    {
      "name": "func_ov000_0215988c",
      "source": "src/Combat/Overlay_0/func_ov000_0215988c.cpp",
      "sha256": "b0026ec2cf9f001079eecb26ea1bb468efcd188656d886d1d017fb16c24fd4a8"
    },
    {
      "name": "func_02088a04",
      "source": "src/Combat/Main/func_02088a04.cpp",
      "sha256": "b1f8e2b0c64a39f45833ae72cb74d371a432c438f7dc1e04b0f5003b671e2867"
    },
    {
      "name": "func_ov000_021598a4",
      "source": "src/Combat/Overlay_0/func_ov000_021598a4.cpp",
      "sha256": "34c285bf48f79e870be7f56717ef8055608dde83fcaacf8099055ef2b2140805"
    },
    {
      "name": "func_02088a54",
      "source": "src/Combat/Main/func_02088a54.cpp",
      "sha256": "4dd57fe0f430bd2bb1d8c60fd4f25039d51557f6719639d39cb67f433663da31"
    },
    {
      "name": "func_ov000_021598bc",
      "source": "src/Combat/Overlay_0/func_ov000_021598bc.cpp",
      "sha256": "b206b14293d556a3f4e0d9d6c7be1d8bda7c300c2df9758a7cd25808788d2095"
    },
    {
      "name": "func_02088964",
      "source": "src/Combat/Main/func_02088964.cpp",
      "sha256": "ae89487aa4de93492f0796f0c9f05a01236605fdeb28b40efb6117b748fc0c8d"
    },
    {
      "name": "func_ov000_021598d4",
      "source": "src/Combat/Overlay_0/func_ov000_021598d4.cpp",
      "sha256": "7a04f38c88dd696efb3aa061e045b6081862ece610b09bb321a798511869083a"
    },
    {
      "name": "func_02088b34",
      "source": "src/Combat/Main/func_02088b34.cpp",
      "sha256": "48889f81abba8313efb09b22620a3cf25b2c69d5612eb0cc7862372fb7aa532a"
    },
    {
      "name": "func_02088660",
      "source": "src/Combat/Main/func_02088660.cpp",
      "sha256": "e54d7a5f724ed9ec3d50ae20b69b23c5a40db7b7c97203093a513895d6986eec"
    },
    {
      "name": "func_02088674",
      "source": "src/Combat/Main/func_02088674.cpp",
      "sha256": "e3c7f72c1cf456d24f63de8d10d7feced69adf30d6f936f31bc5c7d3e96409d3"
    },
    {
      "name": "func_ov000_02156c94",
      "source": "src/Combat/Overlay_0/func_ov000_02156c94.cpp",
      "sha256": "9d484def8f2a69eaa39f14f674d58a72ae62abf9f0cdf85cad2efb2dcd695140"
    },
    {
      "name": "func_02088cf4",
      "source": "src/Combat/Main/func_02088cf4.cpp",
      "sha256": "af74f0637c8eb6175409155be95b78d18e4501dbc2fe1d9ccf5eef178a512087"
    },
    {
      "name": "func_ov000_02156cac",
      "source": "src/Combat/Overlay_0/func_ov000_02156cac.cpp",
      "sha256": "0fb982df66e7b571b82913e52e1334aa9c12191a9591ed39618905bf3a7bbde5"
    },
    {
      "name": "func_02088d4c",
      "source": "src/Combat/Main/func_02088d4c.cpp",
      "sha256": "5daff3a8fc0607254d321f2925049fe6f453e6af506d3c2ea49f8e82b0ad9013"
    },
    {
      "name": "func_ov000_021598ec",
      "source": "src/Combat/Overlay_0/func_ov000_021598ec.cpp",
      "sha256": "7e27ea0480bc4c94858aeed12c9e8e51a5ed2c7a8e47bdb64905f575622cf0eb"
    },
    {
      "name": "func_02088c38",
      "source": "src/Combat/Main/func_02088c38.cpp",
      "sha256": "c28a79f66eb4768da83983a70b793c95f1acad6bdfe3f5abe58868b1cf8f08e2"
    },
    {
      "name": "func_ov000_02159904",
      "source": "src/Combat/Overlay_0/func_ov000_02159904.cpp",
      "sha256": "12d2e83849cf1d827cf290bb121d2f0c475145b634d9813daddc537a58c9c22c"
    },
    {
      "name": "func_02088c9c",
      "source": "src/Combat/Main/func_02088c9c.cpp",
      "sha256": "16d9e2bdde98b3dbb2e19b40447fc0243876231b30c3db2ac24dd51cca9196d0"
    },
    {
      "name": "func_ov000_0215991c",
      "source": "src/Combat/Overlay_0/func_ov000_0215991c.cpp",
      "sha256": "9ec8e436722d4e87d0abfa715f5abf5ca29b41fec1d71e6cfd28af6cd04ab0a1"
    },
    {
      "name": "func_02087838",
      "source": "src/Combat/Main/func_02087838.cpp",
      "sha256": "c5710a1768fae2acc9c9b50b716194eef4c0460a9e6899faabe54c7d30e0dd7e"
    },
    {
      "name": "func_ov000_02159934",
      "source": "src/Combat/Overlay_0/func_ov000_02159934.cpp",
      "sha256": "133d2f4a6ceaffab68de55b85126ac6b51cc0cfc2d07830d238317b54df692f9"
    },
    {
      "name": "func_0208792c",
      "source": "src/Combat/Main/func_0208792c.cpp",
      "sha256": "36e0ae0a0e7af8d36e147a19d8b8d22005f09d01336e60bff0dea57364311fb6"
    },
    {
      "name": "func_ov000_0215994c",
      "source": "src/Combat/Overlay_0/func_ov000_0215994c.cpp",
      "sha256": "f04ab0a09595a4d7f583ff417f1785a68a6bf78d0953ddfaac76c28e60fc6172"
    },
    {
      "name": "func_02087a20",
      "source": "src/Combat/Main/func_02087a20.cpp",
      "sha256": "a70864e498e2d3ac6e526b343d095a0f17d1b9553916fde08a10c5a74d58f5b3"
    },
    {
      "name": "func_ov000_02159964",
      "source": "src/Combat/Overlay_0/func_ov000_02159964.cpp",
      "sha256": "575eed8e12928c527a46dfabe8cb81767a465df4a9b6e033fcd16d8323f4a148"
    },
    {
      "name": "func_02087b14",
      "source": "src/Combat/Main/func_02087b14.cpp",
      "sha256": "3a916571305088dd4482eabd8cecb2194426cde8769420f0dfd7511b9a2b5da9"
    },
    {
      "name": "func_ov000_0215997c",
      "source": "src/Combat/Overlay_0/func_ov000_0215997c.cpp",
      "sha256": "01be378ae12ba278e8640ef66fa1fc9054e03156adc19ad693270e47eb9ea2d6"
    },
    {
      "name": "func_02087c08",
      "source": "src/Combat/Main/func_02087c08.cpp",
      "sha256": "a2cb7487a3fe716fd8c5ae0502df72c16fa16b5dafecc319dd4e7117b13bbf66"
    },
    {
      "name": "func_ov000_02159994",
      "source": "src/Combat/Overlay_0/func_ov000_02159994.cpp",
      "sha256": "96ba2130c2ca3ebe19c809d3b2b89337a9c060707277d8d7c2324bc7c9387e28"
    },
    {
      "name": "func_02087cfc",
      "source": "src/Combat/Main/func_02087cfc.cpp",
      "sha256": "dca06d467190828bb2a0850840fbc916a48db4ffbcf7e3a0f30a9d7c656f7672"
    },
    {
      "name": "func_ov000_021599ac",
      "source": "src/Combat/Overlay_0/func_ov000_021599ac.cpp",
      "sha256": "e2cdf989c61da246061887f2f9c643fa0f55b85c92b2ea8ba3e8e928329a5487"
    },
    {
      "name": "func_02087df0",
      "source": "src/Combat/Main/func_02087df0.cpp",
      "sha256": "b7d1375f770d577079b89323c2e249dd28dfa3a0c31384785092f7144835c5c7"
    },
    {
      "name": "func_ov000_021599c4",
      "source": "src/Combat/Overlay_0/func_ov000_021599c4.cpp",
      "sha256": "23d4d87219dd5e4f1f6bf4e7f939a66ad2ac6c104648a2e7dfe5e8c95111dc44"
    },
    {
      "name": "func_02087efc",
      "source": "src/Combat/Main/func_02087efc.cpp",
      "sha256": "d9745da0032df37917bb6e687f52a0b7cf6b728f1012bc6e5a27ff683f42e137"
    },
    {
      "name": "func_ov000_02156258",
      "source": "src/Combat/Overlay_0/func_ov000_02156258.cpp",
      "sha256": "111618d041fd44eb8b2656e936aaec85373dd391c8a3e6ee031b6063cd541e38"
    },
    {
      "name": "func_020880e4",
      "source": "src/Combat/Main/func_020880e4.cpp",
      "sha256": "cbcd27caa8f1b6309f04659a35bab82b83bfb5e30f0253580fbdbef7212b6710"
    },
    {
      "name": "func_ov000_021563ec",
      "source": "src/Combat/Overlay_0/func_ov000_021563ec.cpp",
      "sha256": "9903a81cb019ec705619d4910fb66754c0c1c5e4b26681fae82d7c7362f381a2"
    },
    {
      "name": "func_02087ff0",
      "source": "src/Combat/Main/func_02087ff0.cpp",
      "sha256": "dcce215336f4ffedbb8ff217833f5febb52cca2893cc60df69f4ca58d0a41cb0"
    },
    {
      "name": "func_ov000_02153a8c",
      "source": "src/Combat/Overlay_0/func_ov000_02153a8c.cpp",
      "sha256": "517c8aaf4ae1fa22791343ec57322bd256fee70f6e355dff1c2f573a342bda3f"
    },
    {
      "name": "func_020890f4",
      "source": "src/Combat/Main/func_020890f4.cpp",
      "sha256": "2f7ba5217ce552d40b56dbc0d0ad51067762abd2cab3e04840ebf2d9821955af"
    },
    {
      "name": "func_ov000_02156404",
      "source": "src/Combat/Overlay_0/func_ov000_02156404.cpp",
      "sha256": "5b88ca5f58b3d817d37f1c5ae14c6dfb56a3cdc3f43cfdebad578374b91b1327"
    },
    {
      "name": "func_02089144",
      "source": "src/Combat/Main/func_02089144.cpp",
      "sha256": "d31d4679b46fd3bf70b54f2e43124be0f5566983cbf14a2e2a1eb805940237d5"
    },
    {
      "name": "func_ov000_021599dc",
      "source": "src/Combat/Overlay_0/func_ov000_021599dc.cpp",
      "sha256": "5d72c8b2ffda146b6ff5e1713a03eb276908e8807af46bb591aa49d821e86d9c"
    },
    {
      "name": "func_02088d9c",
      "source": "src/Combat/Main/func_02088d9c.cpp",
      "sha256": "3410442cbc82c45d85bdd8475bedfbcf7647b13338a75580d2772f7d65a962d4"
    },
    {
      "name": "func_ov000_021599f4",
      "source": "src/Combat/Overlay_0/func_ov000_021599f4.cpp",
      "sha256": "53df38b22ab5ace5af3b55e233fd2a1917c10f948258eb4649554005fa118c0c"
    },
    {
      "name": "func_ov000_02156038",
      "source": "src/Combat/Overlay_0/func_ov000_02156038.cpp",
      "sha256": "8060156d58e0d41830dac81a967a4b27fed8ac2117d5ac9e72bf6250de2a56ac"
    },
    {
      "name": "func_020882f8",
      "source": "src/Combat/Main/func_020882f8.cpp",
      "sha256": "b819c4e569b166a8fac8d3ee09b23fdda5a8ca78d19cb9b24c0f86718a625bfb"
    },
    {
      "name": "func_ov000_021543f4",
      "source": "src/Combat/Overlay_0/func_ov000_021543f4.cpp",
      "sha256": "5b83b3d39d0dfe013a03b6ba4d88aeb4b309bdee55a641371082bf091dfcce2e"
    },
    {
      "name": "func_ov000_0215833c",
      "source": "src/Combat/Overlay_0/func_ov000_0215833c.cpp",
      "sha256": "4f13d650f2f06b51a8f64188f43351f8f0d46e72fa63a2ddc48a58b8290d8d05"
    },
    {
      "name": "func_020882dc",
      "source": "src/Combat/Main/func_020882dc.cpp",
      "sha256": "980096b77ea9b41c2aa93c1f230dc10b46c997f39cf1e05f81a2799ea671edcf"
    },
    {
      "name": "func_02088390",
      "source": "src/Combat/Main/func_02088390.cpp",
      "sha256": "633cedec02bd870f2c6715d43024a874deafa5317b6fea3dc7bb9b683cd7ab0a"
    },
    {
      "name": "func_020883fc",
      "source": "src/Combat/Main/func_020883fc.cpp",
      "sha256": "135f76a5b10c8536a3f8a5ff8074363a6414db4dc669b96c40645c75077751a4"
    }
  ]
};
