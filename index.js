const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");

let {platform} = process;
/*
process.stdout.write(`(nvk) Validation checks are enabled\n`);
module.exports = require(`${generatedPath}/interfaces.js`);
*/

const dawnVersion = "0.0.1";

const releasePath = `${pkg.config.GEN_OUT_DIR}/${dawnVersion}/${platform}/build/Release`;
const bindingsPath = path.join(__dirname, `${pkg.config.GEN_OUT_DIR}/`);
const generatedPath = bindingsPath + `${dawnVersion}/${platform}`;

console.log(`${generatedPath}/build/Release/addon-${platform}.node`);
module.exports = require(`${generatedPath}/build/Release/addon-${platform}.node`);

// the creates an auto tick loop for each device
{
  let devices = [];
  process.nextTick(() => {
    for (let ii = 0; ii < devices.length; ++ii) {
      /*if (!device.isDestroyed) */
      devices[ii].tick();
    };
  });
  const {GPUAdapter} = module.exports;
  GPUAdapter.prototype.requestDevice = function() {
    let args = arguments;
    return new Promise((resolve, reject) => {
      this._requestDevice(...args).then(device => {
        device._onErrorCallback = function(type, msg) {
          setImmediate(() => {
            switch (type) {
              case "Error": throw new Error(msg); break;
              case "Type": throw new TypeError(msg); break;
              case "Range": throw new RangeError(msg); break;
              case "Reference": throw new ReferenceError(msg); break;
              case "Internal": throw new InternalError(msg); break;
              case "Syntax": throw new SyntaxError(msg); break;
              default: throw new Error(msg); break;
            };
          });
        };
        devices.push(device);
        resolve(device);
      });
    });
  };
}

// temporary hack to return a promise instead of a callback
{
  const {GPUFence} = module.exports;
  GPUFence.prototype.onCompletion = function(completionValue) {
    return new Promise(resolve => {
      setImmediate(() => {
        this._onCompletion(completionValue, resolve);
      });
    });
  };
}
{
  const {GPUBuffer} = module.exports;
  GPUBuffer.prototype.mapReadAsync = function() {
    return new Promise(resolve => {
      setImmediate(() => {
        this._mapReadAsync(resolve);
      });
    });
  };
}
{
  const {GPUBuffer} = module.exports;
  GPUBuffer.prototype.mapWriteAsync = function() {
    return new Promise(resolve => {
      setImmediate(() => {
        this._mapWriteAsync(resolve);
      });
    });
  };
}
{
  const {GPUDevice} = module.exports;
  GPUDevice.prototype.createBufferMappedAsync = function(descriptor) {
    return new Promise(resolve => {
      setImmediate(() => {
        this._createBufferMappedAsync(descriptor, resolve);
      });
    });
  };
}
