#include "GPUCanvasContext.h"
#include "GPUDevice.h"
#include "GPUSwapChain.h"
#include "BackendBinding.h"

#include "DescriptorDecoder.h"

Napi::FunctionReference GPUCanvasContext::constructor;

GPUCanvasContext::GPUCanvasContext(const Napi::CallbackInfo& info) : Napi::ObjectWrap<GPUCanvasContext>(info) {
  this->window.Reset(info[0].As<Napi::Object>(), 1);
}

GPUCanvasContext::~GPUCanvasContext() {
  // destructor
}

Napi::Value GPUCanvasContext::configureSwapChain(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object swapchain = GPUSwapChain::constructor.New({
    info.This().As<Napi::Value>(),
    info[0].As<Napi::Value>()
  });
  return swapchain;
}

Napi::Value GPUCanvasContext::getSwapChainPreferredFormat(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

  GPUDevice* device = Napi::ObjectWrap<GPUDevice>::Unwrap(info[0].As<Napi::Object>());
  BackendBinding* binding = device->binding;

  uint32_t format = static_cast<uint32_t>(binding->GetPreferredSwapChainTextureFormat());

  deferred.Resolve(Napi::String::New(env, DescriptorDecoder::GPUTextureFormat(format)));

  return deferred.Promise();
}

Napi::Object GPUCanvasContext::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);
  Napi::Function func = DefineClass(env, "GPUCanvasContext", {
    InstanceMethod(
      "configureSwapChain",
      &GPUCanvasContext::configureSwapChain,
      napi_enumerable
    ),
    InstanceMethod(
      "getSwapChainPreferredFormat",
      &GPUCanvasContext::getSwapChainPreferredFormat,
      napi_enumerable
    )
  });
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("GPUCanvasContext", func);
  return exports;
}
