{
  "variables": {
    "root": "../../..",
    "platform": "<(OS)",
    "build": "<@(module_root_dir)/build",
    "release": "<(build)/Release",
    "dawn": "C:/Users/User/Documents/GitHub/dawn"
  },
  "conditions": [
    [ "platform == 'win'",   { "variables": { "platform": "win" } } ],
    [ "platform == 'linux'", { "variables": { "platform": "linux" } } ],
    [ "platform == 'mac'",   { "variables": { "platform": "darwin" } } ]
  ],
  "make_global_settings": [
    ['CXX','/usr/bin/clang++'],
    ['LINK','/usr/bin/clang++'],
  ],
  "targets": [
    {
      "target_name": "action_after_build",
      "type": "none",
      "conditions": []
    },
    {
      "sources": [
        "src/*.cpp"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "target_name": "addon-win32",
            "cflags_cc": [
              "-fno-rtti",
              "-fno-exceptions",
              "-std=c++17"
            ],
            "include_dirs": [
              "<!@(node -p \"require('node-addon-api').include\")",
              "<(root)/lib/include",
              "<(dawn)/src/include",
              "<(dawn)/out/Shared2/gen",
              "<(dawn)/third_party/shaderc/libshaderc/include",
              "<(dawn)/third_party/shaderc/libshaderc/src/shaderc.cc",
              "<(dawn)/third_party/shaderc/libshaderc/src/shaderc_private.h"
            ],
            "library_dirs": [
              "<(root)/lib/<(platform)/<(target_arch)/GLFW",
              "<(build)/"
            ],
            "link_settings": {
              "libraries": [
                "-lglfw3dll.lib",
                "-llibc++.dll.lib",
                "-llibdawn.dll.lib",
                "-llibdawn_native.dll.lib",
                "-llibdawn_wire.dll.lib",
                "-llibshaderc.dll.lib",
                "-llibshaderc_spvc.dll.lib"
              ]
            },
            "defines": [
              "/bigobj",
              "_LIBCPP_ABI_UNSTABLE",
              "_LIBCPP_ENABLE_NODISCARD",
              "_LIBCPP_NO_AUTO_LINK",
              "__STD_C",
              "_CRT_RAND_S",
              "_CRT_SECURE_NO_DEPRECATE",
              "_SCL_SECURE_NO_DEPRECATE",
              "WIN32_LEAN_AND_MEAN",
              "NOMINMAX",
              "_UNICODE",
              "UNICODE",
              "DAWN_ENABLE_BACKEND_D3D12",
              "DAWN_ENABLE_BACKEND_NULL",
              "_GLFW_WIN32",
              "DAWN_NATIVE_SHARED_LIBRARY",
              "DAWN_WIRE_SHARED_LIBRARY",
              "VK_USE_PLATFORM_WIN32_KHR",
              "DAWN_SHARED_LIBRARY"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "FavorSizeOrSpeed": 1,
                "StringPooling": "true",
                "Optimization": 2,
                "WarningLevel": 3,
                "AdditionalOptions": ["/MP /EHsc /wd4458 /wd4996 /wd4702 /wd4189"],
                "ExceptionHandling": 1
              },
              "VCLibrarianTool": {
                "AdditionalOptions" : ["-fcolor-diagnostics -fmerge-all-constants -fcrash-diagnostics-dir=../../tools/clang/crashreports -Xclang -mllvm -Xclang -instcombine-lower-dbg-declare=0 -fcomplete-member-pointers /Gy /FS /bigobj /utf-8 /Zc:twoPhase /Zc:sizedDealloc- /X -fmsc-version=1916 /guard:cf,nochecks /Zc:dllexportInlines- -m64 -fansi-escape-codes /Brepro -Wno-builtin-macro-redefined -D__DATE__= -D__TIME__= -D__TIMESTAMP__= -Xclang -fdebug-compilation-dir -Xclang . -no-canonical-prefixes -Wimplicit-fallthrough -Wthread-safety -Wextra-semi -Wno-missing-field-initializers -Wno-unused-parameter -Wno-c++11-narrowing -Wno-unneeded-internal-declaration -Wno-undefined-var-template -Wno-nonportable-include-path -Wno-ignored-pragma-optimize /Ob2 /Oy- /Zc:inline /Gw /Oi /Z7 -gcodeview-ghash -fno-standalone-debug /GR- -I../../buildtools/third_party/libc++/trunk/include -Wheader-hygiene -Wstring-conversion -Wtautological-overlap-compare %(AdditionalOptions)"]
              },
              "VCLinkerTool": {
                "AdditionalLibraryDirectories": [
                  "../@PROJECT_SOURCE_DIR@/lib/<(platform)/<(target_arch)",
                  "<(build)/"
                ]
              }
            }
          }
        ]
      ]
    }
  ]
}
