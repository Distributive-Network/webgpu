#include "GPU.h"
#include "GPUAdapter.h"

namespace {
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32__) || defined(__NT__)
  const char *const platform = "win32";
#elif defined(__APPLE__)
  const char *const platform = "darwin";
#elif defined(__linux__)
  const char *const platform = "linux";
#else
#error Platform not supported.
#endif
}

Napi::FunctionReference GPU::constructor;

GPU::GPU(const Napi::CallbackInfo& info) : Napi::ObjectWrap<GPU>(info) { }
GPU::~GPU() { }

Napi::Value GPU::requestAdapter(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);

  std::vector<napi_value> args = {};
  if (info[0].IsObject()) args.push_back(info[0].As<Napi::Value>());
  else args.push_back(env.Undefined());
  args.push_back(Napi::String::New(env, platform));

  deferred.Resolve(GPUAdapter::constructor.New(args));

  return deferred.Promise();
}

Napi::Object GPU::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);
  Napi::Function func = DefineClass(env, "GPU", {
    StaticMethod(
      "requestAdapter",
      &GPU::requestAdapter,
      napi_enumerable
    )
  });
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("GPU", func);
  return exports;
}
