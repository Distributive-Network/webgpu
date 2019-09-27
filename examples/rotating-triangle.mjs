import WebGPU from "../index.js";
import glMatrix from "gl-matrix";

Object.assign(global, WebGPU);
Object.assign(global, glMatrix);

const vsSrc = `
  #version 450
  #pragma shader_stage(vertex)

  layout(set = 0, binding = 0) uniform Matrices {
    mat4 modelViewProjection;
  } uMatrices;

  layout(location = 0) in vec2 position;
  layout(location = 1) in vec3 color;

  layout(location = 0) out vec4 vColor;

  void main() {
    gl_Position = uMatrices.modelViewProjection * vec4(position, 0.0, 1.0);
    vColor = vec4(color, 1.0);
  }
`;

const fsSrc = `
  #version 450
  #pragma shader_stage(fragment)

  layout(location = 0) in vec4 vColor;

  layout(location = 0) out vec4 outColor;

  void main() {
    outColor = vColor;
  }
`;

(async function main() {

  const triangleVertices = new Float32Array([
     0.0,  0.5, 1.0, 0.0, 0.0,
    -0.5, -0.5, 0.0, 1.0, 0.0,
     0.5, -0.5, 0.0, 0.0, 1.0
  ]);

  const triangleIndices = new Uint32Array([
    0, 1, 2
  ]);

  const swapChainFormat = "rgba8unorm";

  const window = new WebGPUWindow({
    width: 640,
    height: 480,
    title: "WebGPU"
  });

  const aspect = Math.abs(window.width / window.height);

  const mModel = mat4.create();
  const mView = mat4.create();
  const mProjection = mat4.create();
  const mModelViewProjection = mat4.create();

  mat4.perspective(mProjection, (2 * Math.PI) / 5, -aspect, 0.1, 4096.0);
  mat4.translate(mView, mView, vec3.fromValues(0, 0, -4));

  const adapter = await GPU.requestAdapter({ window });

  const device = await adapter.requestDevice();

  const queue = device.getQueue();

  const context = window.getContext("webgpu");

  const swapChain = context.configureSwapChain({
    device: device,
    format: swapChainFormat
  });

  const stagedVertexBuffer = device.createBuffer({
    size: BigInt(triangleVertices.byteLength),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  stagedVertexBuffer.setSubData(0n, triangleVertices);

  const stagedIndexBuffer = device.createBuffer({
    size: BigInt(triangleIndices.byteLength),
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  stagedIndexBuffer.setSubData(0n, triangleIndices);

  const stagedUniformBuffer = device.createBuffer({
    size: BigInt(mModelViewProjection.byteLength),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  stagedUniformBuffer.setSubData(0n, mModelViewProjection);

  const uniformBindGroupLayout = device.createBindGroupLayout({
    bindings: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      type: "uniform-buffer"
    }]
  });

  const layout = device.createPipelineLayout({
    bindGroupLayouts: [ uniformBindGroupLayout ]
  });

  const vertexShaderModule = device.createShaderModule({ code: vsSrc });
  const fragmentShaderModule = device.createShaderModule({ code: fsSrc });

  const pipeline = device.createRenderPipeline({
    layout,
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
    vertexInput: {
      indexFormat: "uint32",
      buffers: [
        {
          stride: BigInt(5 * Float32Array.BYTES_PER_ELEMENT),
          stepMode: "vertex",
          attributes: [
            {
              shaderLocation: 0,
              offset: BigInt(0 * Float32Array.BYTES_PER_ELEMENT),
              format: "float2"
            },
            {
              shaderLocation: 1,
              offset: BigInt(2 * Float32Array.BYTES_PER_ELEMENT),
              format: "float3"
            }
          ]
        },
      ]
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

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    bindings: [{
      binding: 0,
      buffer: stagedUniformBuffer,
      offset: 0n,
      size: BigInt(mModelViewProjection.byteLength)
    }]
  });

  function onFrame() {
    if (!window.shouldClose()) setTimeout(onFrame, 1e3 / 60);

    let now = Date.now() / 1e3;
    mat4.identity(mModel);
    mat4.rotateY(mModel, mModel, now);
    mat4.scale(mModel, mModel, vec3.fromValues(3, 3, 3));
    mat4.multiply(mModelViewProjection, mView, mModel);
    mat4.multiply(mModelViewProjection, mProjection, mModelViewProjection);
    stagedUniformBuffer.setSubData(0n, mModelViewProjection);

    const backBuffer = swapChain.getCurrentTexture();
    const backBufferView = backBuffer.createView({
      format: swapChainFormat
    });
    const commandEncoder = device.createCommandEncoder({});
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        clearColor: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
        attachment: backBufferView
      }]
    });
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, uniformBindGroup);
    renderPass.setVertexBuffers(0, [stagedVertexBuffer], [0n]);
    renderPass.setIndexBuffer(stagedIndexBuffer);
    renderPass.drawIndexed(triangleIndices.length, 1, 0, 0, 0);
    renderPass.endPass();

    const commandBuffer = commandEncoder.finish();
    queue.submit([ commandBuffer ]);
    swapChain.present(backBuffer);
    window.pollEvents();
  };
  setTimeout(onFrame, 1e3 / 60);

})();
