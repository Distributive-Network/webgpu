#include "GPUDevice.h"
#include "GPUAdapter.h"
#include "GPUQueue.h"
#include "GPUBuffer.h"
#include "GPUTexture.h"

Napi::FunctionReference GPUDevice::constructor;

GPUDevice::GPUDevice(const Napi::CallbackInfo& info) : Napi::ObjectWrap<GPUDevice>(info) {
  Napi::Env env = info.Env();

  // expect arg 0 be GPUAdapter
  this->adapter.Reset(info[0].ToObject(), 1);
  this->_adapter = Napi::ObjectWrap<GPUAdapter>::Unwrap(this->adapter.Value())->adapter;

  if (info[1].IsObject()) {
    Napi::Object obj = info[1].As<Napi::Object>();
    if (obj.Has(Napi::String::New(env, "extensions"))) {
      this->extensions.Reset(obj.Get("extensions").As<Napi::Object>(), 1);
    }
    if (obj.Has(Napi::String::New(env, "limits"))) {
      this->limits.Reset(obj.Get("limits").As<Napi::Object>(), 1);
    }
  }

  this->backendDevice = this->createDevice();
  this->binding = this->createBinding(info, this->backendDevice);

  DawnProcTable procs = dawn_native::GetProcs();

  dawnSetProcs(&procs);
  procs.deviceSetUncapturedErrorCallback(
    this->backendDevice,
    [](DawnErrorType errorType, const char* message, void* ptr) {
      std::string type;
      switch (errorType) {
        case DAWN_ERROR_TYPE_VALIDATION:
          type = "Validation";
        break;
        case DAWN_ERROR_TYPE_OUT_OF_MEMORY:
          type = "Out of memory";
        break;
        case DAWN_ERROR_TYPE_UNKNOWN:
          type = "Unknown";
        break;
        case DAWN_ERROR_TYPE_DEVICE_LOST:
          type = "Device lost";
        break;
        default:
          type = "Undefined";
        break;
      }
      GPUDevice* self = reinterpret_cast<GPUDevice*>(ptr);
      Napi::Env env = self->onErrorCallback.Env();
      self->onErrorCallback.Call({
        Napi::String::New(env, type),
        Napi::String::New(env, (type + " Error: " + message))
      });
    },
    reinterpret_cast<void*>(this)
  );
  this->device = dawn::Device::Acquire(this->backendDevice);

  this->mainQueue.Reset(this->createQueue(info), 1);
}

GPUDevice::~GPUDevice() {
  // destructor
}

DawnDevice GPUDevice::createDevice() {
  DawnDevice device = this->_adapter.CreateDevice();
  return device;
}

BackendBinding* GPUDevice::createBinding(const Napi::CallbackInfo& info, DawnDevice device) {
  Napi::Env env = info.Env();
  dawn_native::BackendType backendType = this->_adapter.GetBackendType();
  BackendBinding* binding = CreateBinding(backendType, nullptr, device);
  if (binding == nullptr) {
    Napi::Error::New(env, "Failed to create binding backend").ThrowAsJavaScriptException();
  }
  return binding;
}

Napi::Object GPUDevice::createQueue(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object queue = GPUQueue::constructor.New({
    info.This().As<Napi::Value>()
  });
  return queue;
}

Napi::Value GPUDevice::GetExtensions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (this->extensions.IsEmpty()) return env.Null();
  return this->extensions.Value().As<Napi::Object>();
}

Napi::Value GPUDevice::GetLimits(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (this->extensions.IsEmpty()) return env.Null();
  return this->extensions.Value().As<Napi::Object>();
}

Napi::Value GPUDevice::GetAdapter(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return this->adapter.Value().As<Napi::Object>();
}

void GPUDevice::SetOnErrorCallback(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Env env = info.Env();
  this->onErrorCallback.Reset(value.As<Napi::Function>());
}

Napi::Value GPUDevice::tick(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  this->device.Tick();
  return env.Undefined();
}

Napi::Value GPUDevice::createBuffer(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object buffer = GPUBuffer::constructor.New({
    info.This().As<Napi::Value>(),
    info[0].As<Napi::Value>()
  });
  return buffer;
}

Napi::Value GPUDevice::createBufferMapped(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object buffer = GPUBuffer::constructor.New({
    info.This().As<Napi::Value>(),
    info[0].As<Napi::Value>()
  });
  GPUBuffer* uwBuffer = Napi::ObjectWrap<GPUBuffer>::Unwrap(buffer);
  Napi::Value arrBuffer = uwBuffer->mapReadAsync(info);
  Napi::Array out = Napi::Array::New(env);
  out.Set(Napi::Number::New(env, 0), buffer);
  out.Set(Napi::Number::New(env, 1), arrBuffer);
  return out;
}

Napi::Value GPUDevice::createBufferMappedAsync(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object buffer = GPUBuffer::constructor.New({
    info.This().As<Napi::Value>(),
    info[0].As<Napi::Value>()
  });
  Napi::Function callback = info[1].As<Napi::Function>();
  GPUBuffer* uwBuffer = Napi::ObjectWrap<GPUBuffer>::Unwrap(buffer);
  Napi::Value arrBuffer = uwBuffer->mapReadAsync(info);
  Napi::Array out = Napi::Array::New(env);
  out.Set(Napi::Number::New(env, 0), buffer);
  out.Set(Napi::Number::New(env, 1), arrBuffer);
  callback.Call({ out });
  return env.Undefined();
}

Napi::Value GPUDevice::createTexture(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object texture = GPUTexture::constructor.New({
    info.This().As<Napi::Value>(),
    info[0].As<Napi::Value>()
  });
  return texture;
}

Napi::Value GPUDevice::getQueue(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return this->mainQueue.Value().As<Napi::Object>();
}

Napi::Object GPUDevice::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);
  Napi::Function func = DefineClass(env, "GPUDevice", {
    InstanceAccessor(
      "extensions",
      &GPUDevice::GetExtensions,
      nullptr,
      napi_enumerable
    ),
    InstanceAccessor(
      "limits",
      &GPUDevice::GetLimits,
      nullptr,
      napi_enumerable
    ),
    InstanceAccessor(
      "adapter",
      &GPUDevice::GetAdapter,
      nullptr,
      napi_enumerable
    ),
    InstanceAccessor(
      "_onErrorCallback",
      nullptr,
      &GPUDevice::SetOnErrorCallback,
      napi_enumerable
    ),
    InstanceMethod(
      "getQueue",
      &GPUDevice::getQueue,
      napi_enumerable
    ),
    InstanceMethod(
      "tick",
      &GPUDevice::tick,
      napi_enumerable
    ),
    InstanceMethod(
      "createBuffer",
      &GPUDevice::createBuffer,
      napi_enumerable
    ),
    InstanceMethod(
      "createBufferMapped",
      &GPUDevice::createBufferMapped,
      napi_enumerable
    ),
    InstanceMethod(
      "_createBufferMappedAsync",
      &GPUDevice::createBufferMappedAsync,
      napi_enumerable
    ),
    InstanceMethod(
      "createTexture",
      &GPUDevice::createTexture,
      napi_enumerable
    ),
  });
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("GPUDevice", func);
  return exports;
}
