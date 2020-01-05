import WebGPU from "../index.js";
import glMatrix from "gl-matrix";

Object.assign(global, WebGPU);
Object.assign(global, glMatrix);

const vsSrc = `
  #version 450
  #pragma shader_stage(vertex)

  layout (location = 0) out vec2 uv;

  void main() {
    vec2 pos = vec2((gl_VertexIndex << 1) & 2, gl_VertexIndex & 2);
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    uv = pos;
  }
`;

const fsSrc = `
  #version 450
  #pragma shader_stage(fragment)

  layout (location = 0) in vec2 uv;
  layout (location = 0) out vec4 outColor;

  layout(std140, set = 0, binding = 0) buffer PixelBuffer {
    vec4 pixels[];
  } pixelBuffer;

  const vec2 resolution = vec2(640, 480);

  void main() {
    const ivec2 bufferCoord = ivec2(floor(uv * resolution));
    const vec2 fragCoord = (uv * resolution);
    const uint pixelIndex = bufferCoord.y * uint(resolution.x) + bufferCoord.x;

    vec4 pixelColor = pixelBuffer.pixels[pixelIndex];
    outColor = pixelColor;
  }
`;

const rayGenSrc = `
  #version 460
  #extension GL_NV_ray_tracing : require
  #pragma shader_stage(raygen)

  layout(location = 0) rayPayloadNV vec3 hitValue;

  layout(binding = 0, set = 0) uniform accelerationStructureNV topLevelAS;

  layout(std140, set = 0, binding = 1) buffer PixelBuffer {
    vec4 pixels[];
  } pixelBuffer;

  layout(set = 0, binding = 2) uniform Camera {
    mat4 view;
    mat4 projection;
  } uCamera;

  void main() {
    ivec2 ipos = ivec2(gl_LaunchIDNV.xy);
    const ivec2 resolution = ivec2(gl_LaunchSizeNV.xy);

    const vec2 offset = vec2(0);
    const vec2 pixel = vec2(ipos.x, ipos.y);
    const vec2 uv = (pixel / gl_LaunchSizeNV.xy) * 2.0 - 1.0;

    vec4 origin = uCamera.view * vec4(offset, 0, 1);
    vec4 target = uCamera.projection * (vec4(uv.x, uv.y, 1, 1));
    vec4 direction = uCamera.view * vec4(normalize(target.xyz), 0);

    traceNV(topLevelAS, gl_RayFlagsOpaqueNV, 0xFF, 0, 0, 0, origin.xyz, 0.01, direction.xyz, 4096.0, 0);

    const uint pixelIndex = ipos.y * resolution.x + ipos.x;
    pixelBuffer.pixels[pixelIndex] = vec4(hitValue, 1);
  }
`;

const rayCHitSrc = `
  #version 460
  #extension GL_NV_ray_tracing : require
  #pragma shader_stage(closest)

  layout(location = 0) rayPayloadInNV vec3 hitValue;

  hitAttributeNV vec3 attribs;

  void main() {
    const vec3 bary = vec3(1.0f - attribs.x - attribs.y, attribs.x, attribs.y);
    hitValue = bary;
  }
`;

const rayMissSrc = `
  #version 460
  #extension GL_NV_ray_tracing : require
  #pragma shader_stage(miss)

  layout(location = 0) rayPayloadInNV vec3 hitValue;

  void main() {
    hitValue = vec3(0.15);
  }
`;

(async function main() {

  let window = new WebGPUWindow({
    width: 640,
    height: 480,
    title: "WebGPU"
  });

  let adapter = await GPU.requestAdapter({
    window,
    preferredBackend: "Vulkan"
  });

  let device = await adapter.requestDevice();

  let queue = device.getQueue();

  let context = window.getContext("webgpu");

  let swapChainFormat = await context.getSwapChainPreferredFormat(device);

  let swapChain = context.configureSwapChain({
    device: device,
    format: swapChainFormat
  });

  let aspect = Math.abs(window.width / window.height);

  let mView = mat4.create();
  let mProjection = mat4.create();

  mat4.perspective(mProjection, (2 * Math.PI) / 5, -aspect, 0.1, 4096.0);

  mat4.translate(mView, mView, vec3.fromValues(0, 0, -2));

  // invert
  mat4.invert(mView, mView);
  mat4.invert(mProjection, mProjection);
  mProjection[5] *= -1.0;

  // rasterization shaders
  let vertexShaderModule = device.createShaderModule({ code: vsSrc });
  let fragmentShaderModule = device.createShaderModule({ code: fsSrc });

  // ray-tracing shaders
  let rayGenShaderModule = device.createShaderModule({ code: rayGenSrc });
  let rayCHitShaderModule = device.createShaderModule({ code: rayCHitSrc });
  let rayMissShaderModule = device.createShaderModule({ code: rayMissSrc });

  // camera uniform buffer
  let cameraData = new Float32Array(
    // (mat4) view
    mView.byteLength +
    // (mat4) projection
    mProjection.byteLength
  );
  let cameraUniformBuffer = device.createBuffer({
    size: cameraData.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
  });
  // fill in the data
  {
    let offset = 0x0;
    cameraData.set(mView, offset);
    offset += mView.length;
    cameraData.set(mProjection, offset);
    offset += mProjection.length;
  }
  cameraUniformBuffer.setSubData(0, cameraData);

  // this storage buffer is used as a pixel buffer
  // the result of the ray tracing pass gets written into it
  // and it gets copied to the screen in the rasterization pass
  let pixelBufferSize = window.width * window.height * 4 * Float32Array.BYTES_PER_ELEMENT;
  let pixelBuffer = device.createBuffer({
    size: pixelBufferSize,
    usage: GPUBufferUsage.STORAGE
  });

  let triangleVertices = new Float32Array([
     1.0,  1.0, 0.0,
    -1.0,  1.0, 0.0,
     0.0, -1.0, 0.0
  ]);
  let triangleVertexBuffer = device.createBuffer({
    size: triangleVertices.byteLength,
    usage: GPUBufferUsage.COPY_DST
  });
  triangleVertexBuffer.setSubData(0, triangleVertices);

  let triangleIndices = new Uint32Array([
    0, 1, 2
  ]);
  let triangleIndexBuffer = device.createBuffer({
    size: triangleIndices.byteLength,
    usage: GPUBufferUsage.COPY_DST
  });
  triangleIndexBuffer.setSubData(0, triangleIndices);

  // create a geometry container
  // which holds references to our geometry
  let geometryContainer0 = device.createRayTracingAccelerationContainer({
    level: "bottom",
    flags: GPURayTracingAccelerationContainerFlag.PREFER_FAST_TRACE,
    geometries: [
      {
        type: "triangles",
        vertexBuffer: triangleVertexBuffer,
        vertexFormat: "float3",
        vertexStride: 3 * Float32Array.BYTES_PER_ELEMENT,
        vertexCount: triangleVertices.length,
        indexBuffer: triangleIndexBuffer,
        indexFormat: "uint32",
        indexCount: triangleIndices.length
      }
    ]
  });

  // create an instance container
  // which contains object instances with transforms
  // and links to the geometry container
  let instanceContainer0 = device.createRayTracingAccelerationContainer({
    level: "top",
    flags: GPURayTracingAccelerationContainerFlag.PREFER_FAST_TRACE,
    instances: [
      {
        flags: GPURayTracingAccelerationInstanceFlag.TRIANGLE_CULL_DISABLE,
        mask: 0xFF,
        instanceId: 0,
        instanceOffset: 0x0,
        transform: {
          translation: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        geometryContainer: geometryContainer0
      },
      {
        flags: GPURayTracingAccelerationInstanceFlag.TRIANGLE_CULL_DISABLE,
        mask: 0xFF,
        instanceId: 0,
        instanceOffset: 0x0,
        transform: {
          translation: { x: 0.9, y: -0.25, z: 0.01 },
          rotation: { x: 0, y: 0, z: 55 },
          scale: { x: 0.5, y: 0.5, z: 0.75 }
        },
        geometryContainer: geometryContainer0
      },
      {
        flags: GPURayTracingAccelerationInstanceFlag.TRIANGLE_CULL_DISABLE,
        mask: 0xFF,
        instanceId: 0,
        instanceOffset: 0x0,
        transform: {
          translation: { x: -0.9, y: -0.25, z: 0.01 },
          rotation: { x: 0, y: 0, z: -55 },
          scale: { x: 0.5, y: 0.5, z: 0.75 }
        },
        geometryContainer: geometryContainer0
      }
    ]
  });

  // build the containers (the order is important)
  // geometry containers have to be built before
  // an instance container, if it has a geometry reference into it
  {
    let commandEncoder = device.createCommandEncoder({});
    commandEncoder.buildRayTracingAccelerationContainer(geometryContainer0, false);
    commandEncoder.buildRayTracingAccelerationContainer(instanceContainer0, false);
    queue.submit([ commandEncoder.finish() ]);
  }

  // a collection of shader modules which get dynamically
  // invoked, for example when calling traceNV
  let shaderBindingTable = device.createRayTracingShaderBindingTable({
    shaders: [
      {
        module: rayGenShaderModule,
        stage: GPUShaderStage.RAY_GENERATION
      },
      {
        module: rayCHitShaderModule,
        stage: GPUShaderStage.RAY_CLOSEST_HIT
      },
      {
        module: rayMissShaderModule,
        stage: GPUShaderStage.RAY_MISS
      }
    ]
  });

  let rtBindGroupLayout = device.createBindGroupLayout({
    bindings: [
      {
        binding: 0,
        visibility: GPUShaderStage.RAY_GENERATION,
        type: "acceleration-container"
      },
      {
        binding: 1,
        visibility: GPUShaderStage.RAY_GENERATION,
        type: "storage-buffer"
      },
      {
        binding: 2,
        visibility: GPUShaderStage.RAY_GENERATION,
        type: "uniform-buffer"
      }
    ]
  });

  let rtBindGroup = device.createBindGroup({
    layout: rtBindGroupLayout,
    bindings: [
      {
        binding: 0,
        accelerationContainer: instanceContainer0,
        offset: 0,
        size: 0
      },
      {
        binding: 1,
        buffer: pixelBuffer,
        offset: 0,
        size: pixelBufferSize
      },
      {
        binding: 2,
        buffer: cameraUniformBuffer,
        offset: 0,
        size: cameraData.byteLength
      }
    ]
  });

  let rtPipeline = device.createRayTracingPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [rtBindGroupLayout]
    }),
    rayTracingState: {
      shaderBindingTable,
      maxRecursionDepth: 1
    }
  });

  let renderBindGroupLayout = device.createBindGroupLayout({
    bindings: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        type: "storage-buffer",
        textureDimension: "2D"
      }
    ]
  });

  let renderBindGroup = device.createBindGroup({
    layout: renderBindGroupLayout,
    bindings: [
      {
        binding: 0,
        buffer: pixelBuffer,
        offset: 0,
        size: pixelBufferSize
      }
    ]
  });

  let renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout]
    }),
    sampleCount: 1,
    vertexStage: {
      module: vertexShaderModule,
      entryPoint: "main"
    },
    fragmentStage: {
      module: fragmentShaderModule,
      entryPoint: "main"
    },
    primitiveTopology: "triangle-list",
    vertexState: {
      indexFormat: "uint32",
      vertexBuffers: []
    },
    rasterizationState: {
      frontFace: "CCW",
      cullMode: "none"
    },
    colorStates: [{
      format: swapChainFormat,
      alphaBlend: {},
      colorBlend: {}
    }]
  });

  function onFrame() {
    if (!window.shouldClose()) setTimeout(onFrame, 1e3 / 60);

    let backBufferView = swapChain.getCurrentTextureView();

    // ray tracing pass
    {
      let commandEncoder = device.createCommandEncoder({});
      let passEncoder = commandEncoder.beginRayTracingPass({});
      passEncoder.setPipeline(rtPipeline);
      passEncoder.setBindGroup(0, rtBindGroup);
      passEncoder.traceRays(window.width, window.height, 1);
      passEncoder.endPass();
      queue.submit([ commandEncoder.finish() ]);

    }
    // rasterization pass
    // the rasterization's pass only use right now,
    // is to bring the pixel buffer we write into from the
    // ray tracing pass, to the screen
    {
      let commandEncoder = device.createCommandEncoder({});
      let passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          clearColor: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
          attachment: backBufferView
        }]
      });
      passEncoder.setPipeline(renderPipeline);
      passEncoder.setBindGroup(0, renderBindGroup);
      passEncoder.draw(3, 1, 0, 0);
      passEncoder.endPass();
      queue.submit([ commandEncoder.finish() ]);
    }

    swapChain.present();
    window.pollEvents();
  };
  setTimeout(onFrame, 1e3 / 60);

})();
