const fs = require("fs");
const ncp = require("ncp");
const { spawn } = require("child_process");

const pkg = require("./package.json");

const platform = process.platform;
const v8Version = process.versions.v8;
const nodeVersion = process.versions.node;
const architecture = process.arch;

ncp.limit = 16;

const dawnVersion = process.env.npm_config_dawnversion;
if (!dawnVersion) throw `No Dawn version --dawnversion specified!`;

const msvsVersion = process.env.npm_config_msvsversion || "";

const generatePath = `${pkg.config.GEN_OUT_DIR}/${dawnVersion}/${platform}`;

const unitPlatform = (
  platform === "win32" ? "win" :
  platform === "linux" ? "linux" :
  platform === "darwin" ? "darwin" :
  "unknown"
);

if (unitPlatform === "unknown") {
  process.stderr.write(`Unsupported platform!\n`);
  process.stderr.write(`Exiting..\n`);
  return;
}

// generated/version/
if (!fs.existsSync(generatePath)) {
  process.stderr.write(`Cannot find bindings for ${dawnVersion} in ${generatePath}\n`);
  process.stderr.write(`Exiting..\n`);
  return;
}

// build
// build/release
let buildDir = `${generatePath}/build/`;
let buildReleaseDir = buildDir + "Release/";
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);
if (!fs.existsSync(buildReleaseDir)) fs.mkdirSync(buildReleaseDir);

process.stdout.write(`
Compiling bindings for version ${dawnVersion}...
Platform: ${platform} | ${architecture}
Node: ${nodeVersion}
V8: ${v8Version}
`);

function copyFiles() {
  process.stdout.write(`\nCopying files..\n`);
  return new Promise(resolve => {
    // copy files into release folder
    let baseDir = `./lib/${unitPlatform}/${architecture}`;
    let targetDir = `${generatePath}/build/Release`;
    let files = [];
    // add win32 runtime files
    if (platform === "win32") {
      //files.push([`${baseDir}/GLFW/glfw3.dll`, targetDir]);
      //files.push([`${baseDir}/GLFW/glfw3.lib`, targetDir + `/../`]);
    }
    let counter = 0;
    if (!files.length) return resolve(true);
    files.map(entry => {
      let source = entry[0];
      let target = entry[1];
      // copy single files
      let fileName = source.replace(/^.*[\\\/]/, "");
      let isFile = fileName.length > 0;
      if (isFile) target += "/" + fileName;
      // copy
      ncp(source, target, error => {
        process.stdout.write(`Copying ${source} -> ${target}\n`);
        if (error) {
          process.stderr.write(`Failed to copy ${source} -> ${target}\n`);
          throw error;
        }
      });
      if (counter++ >= files.length - 1) {
        process.stdout.write("Done!\n");
        resolve(true);
      }
    });
  });
};

function buildFiles() {
  process.stdout.write(`\nCompiling bindings..\n`);
  return new Promise(resolve => {
    let msargs = "";
    // add win32 vs version
    if (platform === "win32") {
      msargs += `--msvs_version ${msvsVersion}`;
    }
    let cmd = `cd ${generatePath} && node-gyp configure ${msargs} && node-gyp build`;
    let shell = spawn(cmd, { shell: true, stdio: "inherit" }, { stdio: "pipe" });
    shell.on("exit", error => {
      if (!error) {
        process.stdout.write("Done!\n");
      }
      resolve(!error);
    });
  });
};

(async function run() {
  await copyFiles();
  let buildSuccess = await buildFiles();
  if (buildSuccess) {
    process.stdout.write(`\nSuccessfully compiled bindings for ${dawnVersion}!\n`);
  } else {
    process.stderr.write(`\nFailed to compile bindings for ${dawnVersion}!`);
  }
})();
