#ifndef __GPU_TEXTURE_VIEW_H__
#define __GPU_TEXTURE_VIEW_H__

#include "Base.h"

class GPUTextureView : public Napi::ObjectWrap<GPUTextureView> {

  public:

    static Napi::Object Initialize(Napi::Env env, Napi::Object exports);
    static Napi::FunctionReference &GetConstructor();

    GPUTextureView(const Napi::CallbackInfo &info);
    ~GPUTextureView();

    Napi::ObjectReference texture;

    WGPUTextureView instance;
  private:

};

#endif
