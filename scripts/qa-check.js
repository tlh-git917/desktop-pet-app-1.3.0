const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'README.md',
  'app-core.js',
  'ai-service.js',
  'main.js',
  'preload.js',
  'control.html',
  'control.js',
  'pet.html',
  'pet.js',
  'styles.css',
  'package.json',
  'build-windows.bat',
  'build.yml',
  '.github/workflows/build.yml',
  'scripts/qa-check.js'
];
const syntaxFiles = [
  'app-core.js',
  'ai-service.js',
  'main.js',
  'preload.js',
  'control.js',
  'pet.js',
  'scripts/qa-check.js'
];

let failed = false;

function log(ok, message, details = '') {
  const icon = ok ? '✓' : '✗';
  const writer = ok ? console.log : console.error;
  writer(`${icon} ${message}${details ? `\n${details}` : ''}`);
  if (!ok) failed = true;
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8'
  });
}

function collectIds(html) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function collectRefIds(js) {
  const refs = [
    ...js.matchAll(/\$\('([^']+)'\)/g),
    ...js.matchAll(/getElementById\('([^']+)'\)/g)
  ].map((match) => match[1]);
  return [...new Set(refs)];
}

requiredFiles.forEach((file) => {
  const exists = fs.existsSync(path.join(root, file));
  log(exists, exists ? `必要文件存在：${file}` : `缺少必要文件：${file}`);
});

syntaxFiles.forEach((file) => {
  const result = run(process.execPath, ['--check', path.join(root, file)]);
  log(result.status === 0, `语法检查${result.status === 0 ? '通过' : '失败'}：${file}`, result.status === 0 ? '' : (result.stderr || result.stdout));
});

const controlHtml = read('control.html');
const petHtml = read('pet.html');
const controlJs = read('control.js');
const petJs = read('pet.js');
const preloadJs = read('preload.js');
const mainJs = read('main.js');
const packageJson = JSON.parse(read('package.json'));

const controlDup = collectIds(controlHtml);
const petDup = collectIds(petHtml);
log(controlDup.length === 0, controlDup.length === 0 ? 'control.html 没有重复 ID' : 'control.html 存在重复 ID', controlDup.join(', '));
log(petDup.length === 0, petDup.length === 0 ? 'pet.html 没有重复 ID' : 'pet.html 存在重复 ID', petDup.join(', '));

const controlIds = new Set([...controlHtml.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const petIds = new Set([...petHtml.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const missingControlIds = collectRefIds(controlJs).filter((id) => !controlIds.has(id));
const missingPetIds = collectRefIds(petJs).filter((id) => !petIds.has(id));
log(missingControlIds.length === 0, missingControlIds.length === 0 ? 'control.js 的 DOM 引用完整' : 'control.js 引用了不存在的 DOM ID', missingControlIds.join(', '));
log(missingPetIds.length === 0, missingPetIds.length === 0 ? 'pet.js 的 DOM 引用完整' : 'pet.js 引用了不存在的 DOM ID', missingPetIds.join(', '));

log(packageJson.main === 'main.js', packageJson.main === 'main.js' ? 'package.json main 配置正确' : 'package.json main 配置错误', packageJson.main || '(empty)');
log((packageJson.scripts || {}).check === 'node scripts/qa-check.js', 'package.json 已接入 QA 脚本');
log(mainJs.includes("ipcMain.handle('test-ai-connection'") && mainJs.includes("ipcMain.handle('chat-avatar'") && mainJs.includes("ipcMain.handle('generate-avatar'"), '主进程已接入 AI 相关 IPC');
log(mainJs.includes("ipcMain.on('start-drag'") && mainJs.includes("ipcMain.on('dragging'") && mainJs.includes("ipcMain.on('end-drag'"), '主进程已接入桌宠拖动 IPC');
log(mainJs.includes("getWeatherSnapshot") && !mainJs.includes('weatherApiKey'), '天气逻辑已独立，不再依赖 weatherApiKey');
log(!controlHtml.includes('网站屏蔽'), '控制台已移除网站屏蔽器');
log(preloadJs.includes('testAiConnection') && preloadJs.includes('getWeatherPreview') && preloadJs.includes('generateAvatar'), 'preload API 暴露完整');

if (failed) process.exit(1);
