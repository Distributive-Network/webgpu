#include "GPUBuffer.h"
#include "GPUDevice.h"

#include "DescriptorDecoder.h"

#include <thread>
#include <chrono>
#include <cstdint>

struct BufferCallbackResult {
  void* addr = nullptr;
  uint64_t length = 0;
};

GPUBuffer::GPUBuffer(const Napi::CallbackInfo& info) : Napi::ObjectWrap<GPUBuffer>(info) {
  Napi::Env env = info.Env();

  Napi::Array mappingArray = Napi::Array::New(env);
  this->mappingArrayBuffers.Reset(mappingArray.As<Napi::Object>(), 1);

  this->device.Reset(info[0].As<Napi::Object>(), 1);
  GPUDevice* device = Napi::ObjectWrap<GPUDevice>::Unwrap(this->device.Value());

  auto descriptor = DescriptorDecoder::GPUBufferDescriptor(device, info[1].As<Napi::Value>());

  this->instance = wgpuDeviceCreateBuffer(device->instance, &descriptor);
}

GPUBuffer::~GPUBuffer() {
  this->device.Reset();
  this->mappingArrayBuffers.Reset();
  wgpuBufferRelease(this->instance);
}

void GPUBuffer::DestroyMappingArrayBuffers() {
  Napi::Array mappingArray = this->mappingArrayBuffers.Value().As<Napi::Array>();
  Napi::Env env = mappingArray.Env();
  for (unsigned int ii = 0; ii < mappingArray.Length(); ++ii) {
    Napi::ArrayBuffer ab = mappingArray.Get(ii).As<Napi::ArrayBuffer>();
    napi_detach_arraybuffer(env, ab);
  };
  // reset to empty array
  {
    Napi::Array mappingArray = Napi::Array::New(env);
    this->mappingArrayBuffers.Reset(mappingArray.As<Napi::Object>(), 1);
  }
}

Napi::Value GPUBuffer::setSubData(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  uint64_t start = static_cast<uint64_t>(info[0].As<Napi::Number>().Uint32Value());
  size_t count = 0;

  uint8_t* data = getTypedArrayData<uint8_t>(info[1].As<Napi::Value>(), &count);

  wgpuBufferSetSubData(this->instance, start, count, data);

  return env.Undefined();
}

Napi::Value GPUBuffer::mapReadAsync(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  bool hasCallback = info[0].IsFunction();

  Napi::Function callback;
  if (hasCallback) callback = info[0].As<Napi::Function>();

  BufferCallbackResult callbackResult;

  wgpuBufferMapReadAsync(
    this->instance,
    [](WGPUBufferMapAsyncStatus status, const void* data, uint64_t dataLength, void* userdata) {
      BufferCallbackResult* result = reinterpret_cast<BufferCallbackResult*>(userdata);
      result->addr = const_cast<void*>(data);
      result->length = dataLength;
    },
    &callbackResult
  );

  GPUDevice* device = Napi::ObjectWrap<GPUDevice>::Unwrap(this->device.Value());
  WGPUDevice backendDevice = device->instance;

  wgpuDeviceTick(backendDevice);
  if (!callbackResult.addr) {
    while (!callbackResult.addr) {
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
      wgpuDeviceTick(backendDevice);
    };
  }

  Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(
    env,
    callbackResult.addr,
    callbackResult.length,
    [](Napi::Env env, void* data) { }
  );

  Napi::Array mappingArray = this->mappingArrayBuffers.Value().As<Napi::Array>();
  mappingArray[mappingArray.Length()] = buffer;

  if (hasCallback) callback.Call({ buffer });

  return hasCallback ? env.Undefined() : buffer;
}

Napi::Value GPUBuffer::mapWriteAsync(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  Napi::Function callback = info[0].As<Napi::Function>();

  BufferCallbackResult callbackResult;
  wgpuBufferMapWriteAsync(
    this->instance,
    [](WGPUBufferMapAsyncStatus status, void* ptr, uint64_t dataLength, void* userdata) {
      BufferCallbackResult* result = reinterpret_cast<BufferCallbackResult*>(userdata);
      result->addr = ptr;
      result->length = dataLength;
    },
    &callbackResult
  );

  GPUDevice* device = Napi::ObjectWrap<GPUDevice>::Unwrap(this->device.Value());
  WGPUDevice backendDevice = device->instance;

  wgpuDeviceTick(backendDevice);
  if (!callbackResult.addr) {
    while (!callbackResult.addr) {
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
      wgpuDeviceTick(backendDevice);
    };
  }

  Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(
    env,
    callbackResult.addr,
    callbackResult.length,
    [](Napi::Env env, void* data) { }
  );

  Napi::Array mappingArray = this->mappingArrayBuffers.Value().As<Napi::Array>();
  mappingArray[mappingArray.Length()] = buffer;

  callback.Call({ buffer });

  return env.Undefined();
}

Napi::Value GPUBuffer::unmap(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  this->DestroyMappingArrayBuffers();
  wgpuBufferUnmap(this->instance);
  return env.Undefined();
}

Napi::Value GPUBuffer::destroy(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  this->DestroyMappingArrayBuffers();
  wgpuBufferDestroy(this->instance);
  return env.Undefined();
}

Napi::Object GPUBuffer::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);
  Napi::Function func = DefineClass(env, "GPUBuffer", {
    InstanceMethod(
      "setSubData",
      &GPUBuffer::setSubData,
      napi_enumerable
    ),
    InstanceMethod(
      "_mapReadAsync",
      &GPUBuffer::mapReadAsync,
      napi_enumerable
    ),
    InstanceMethod(
      "_mapWriteAsync",
      &GPUBuffer::mapWriteAsync,
      napi_enumerable
    ),
    InstanceMethod(
      "unmap",
      &GPUBuffer::unmap,
      napi_enumerable
    ),
    InstanceMethod(
      "destroy",
      &GPUBuffer::destroy,
      napi_enumerable
    )
  });
  auto &constructor = GetConstructor();
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("GPUBuffer", func);
  return exports;
}

Napi::FunctionReference &GPUBuffer::GetConstructor() {
  thread_local Napi::FunctionReference constructor;
  return constructor;
}
