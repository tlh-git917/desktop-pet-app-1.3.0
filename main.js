const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  APP_TITLE,
  defaultState,
  deepClone,
  clamp,
  normalizeState,
  mergeState,
  getActiveAvatar,
  getThemeGradient,
  getFocusSnapshot,
  isWeatherQuestion,
  pickRandom
} = require('./app-core');
const {
  testAiConnection,
  generateAvatarArtwork,
  generateCompanionReply,
  getWeatherSnapshot
} = require('./ai-service');

const statePath = path.join(app.getPath('userData'), 'app-state.json');
const WEATHER_CACHE_MS = 10 * 60 * 1000;
const VISITOR_MIN_INTERVAL_MS = 25 * 60 * 1000;
const VISITOR_MAX_INTERVAL_MS = 50 * 60 * 1000;

let petWindow = null;
let controlWindow = null;
let tray = null;
let refreshTrayMenu = () => {};
let visitorTimer = null;
let isQuitting = false;
const weatherCache = new Map();

function loadState() {
  try {
    if (!fs.existsSync(statePath)) {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const created = normalizeState(defaultState);
      fs.writeFileSync(statePath, JSON.stringify(created, null, 2), 'utf8');
      return created;
    }
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return normalizeState(raw);
  } catch (error) {
    console.error('Failed to load state:', error);
    return normalizeState(deepClone(defaultState));
  }
}

let state = loadState();

function saveState() {
  try {
    state = normalizeState(state);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

function getStatePayload() {
  return {
    state: {
      ...state,
      focus: getFocusSnapshot(state),
      themeGradient: getThemeGradient(state.activeTheme)
    },
    activeAvatar: getActiveAvatar(state)
  };
}

function sendToWindow(target, channel, payload) {
  if (target && !target.isDestroyed()) {
    target.webContents.send(channel, payload);
  }
}

function broadcastState() {
  const payload = getStatePayload();
  sendToWindow(petWindow, 'state-updated', payload);
  sendToWindow(controlWindow, 'state-updated', payload);
}

function updateLastInteraction() {
  state.lastInteractionTime = Date.now();
}

function constrainPetBounds(bounds = state.petBounds) {
  const width = clamp(bounds.width, 180, 420, 240);
  const height = clamp(bounds.height, 180, 420, 240);
  const point = {
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : 40,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : 40
  };
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;
  const x = Math.min(Math.max(point.x, area.x), maxX);
  const y = Math.min(Math.max(point.y, area.y), maxY);
  return { x, y, width, height };
}

function applyAlwaysOnTop() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(!!state.settings.alwaysOnTop);
  }
}

function createPetWindow() {
  const bounds = constrainPetBounds(state.petBounds);
  state.petBounds = bounds;

  petWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: !!state.settings.alwaysOnTop,
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  petWindow.loadFile(path.join(__dirname, 'pet.html'));

  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      petWindow.hide();
    }
  });

  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    const [width, height] = petWindow.getSize();
    state.petBounds = constrainPetBounds({ x, y, width, height });
    saveState();
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    title: APP_TITLE,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f3f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile(path.join(__dirname, 'control.html'));

  controlWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      controlWindow.hide();
    }
  });

  controlWindow.on('closed', () => {
    controlWindow = null;
  });
}

function showControlWindow() {
  if (!controlWindow || controlWindow.isDestroyed()) {
    createControlWindow();
  }
  controlWindow.show();
  controlWindow.focus();
}

function createTray() {
  const image = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAA90lEQVR4AWP4TwAw/P//PwMDA8P///8ZGBiYwMDA4P///xkYGBjw////GQYGBkYGBgYe/fv3fwYGBib/////gYGBgYEhIyPjP2JjY7+ysrL/4+Pj/8LCwv9WVlb/FxcX/1NTU/+5ubn/6urq/1dXV/+dnZ3/2NjY/8HBwf+Wlpb/7e3t/39/f/9mZmb/0tLS/8fHx/+goKD/9vb2/5WVlf+hoaH/5+fn/+Dg4P8pKSn/FRUV/8zMzP9RUVH/9fX1/9DQ0P8YGBhQYGBg8P///5GRkf8YGBgYGBgYGLi4uP8fHx8YGBgYGBgYGOA/AKzrN9tWBv7uAAAAAElFTkSuQmCC'
  );
  tray = new Tray(image);

  const updateMenu = () => {
    if (!tray) return;
    const focus = getFocusSnapshot(state);
    const startPauseLabel = !focus.isRunning ? '开始专注' : focus.isPaused ? '继续专注' : '暂停专注';
    const menu = Menu.buildFromTemplate([
      {
        label: '显示桌宠',
        click: () => {
          if (petWindow) petWindow.show();
        }
      },
      {
        label: '打开主控制台',
        click: () => showControlWindow()
      },
      { type: 'separator' },
      {
        label: startPauseLabel,
        click: () => toggleFocusFromTray()
      },
      {
        label: state.settings.alwaysOnTop ? '关闭始终置顶' : '开启始终置顶',
        click: () => {
          state.settings.alwaysOnTop = !state.settings.alwaysOnTop;
          saveState();
          applyAlwaysOnTop();
          updateMenu();
          broadcastState();
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip(APP_TITLE);
    tray.setContextMenu(menu);
  };

  tray.on('double-click', () => {
    if (petWindow) petWindow.show();
    showControlWindow();
  });

  updateMenu();
  return updateMenu;
}

function applyStatePatch(patch = {}) {
  const previousCompletedPlans = state.plans.filter((plan) => plan.done).length;
  const merged = mergeState(state, patch);
  const nextCompletedPlans = merged.plans.filter((plan) => plan.done).length;
  const completedDiff = nextCompletedPlans - previousCompletedPlans;

  if (completedDiff > 0) {
    merged.happiness = clamp(merged.happiness + completedDiff * 8, 0, 100, merged.happiness);
  } else if (completedDiff < 0) {
    merged.happiness = clamp(merged.happiness + completedDiff * 4, 0, 100, merged.happiness);
  }

  merged.lastInteractionTime = Date.now();
  state = normalizeState(merged);
  saveState();
  applyAlwaysOnTop();
  refreshTrayMenu();
  broadcastState();
  return state;
}

function updateFocusState(focusPatch = {}) {
  state = normalizeState({
    ...state,
    focus: {
      ...state.focus,
      ...focusPatch
    }
  });
  updateLastInteraction();
  saveState();
  refreshTrayMenu();
  broadcastState();
  return getFocusSnapshot(state);
}

function toggleFocusFromTray() {
  const focus = getFocusSnapshot(state);
  if (!focus.isRunning) {
    updateFocusState({
      isRunning: true,
      isPaused: false,
      mode: 'focus',
      remainingSeconds: state.focus.focusMinutes * 60,
      startedAt: Date.now(),
      pausedAt: null
    });
    return;
  }

  if (!focus.isPaused) {
    updateFocusState({
      isPaused: true,
      remainingSeconds: focus.currentRemainingSeconds || focus.remainingSeconds,
      startedAt: null,
      pausedAt: Date.now()
    });
    return;
  }

  updateFocusState({
    isPaused: false,
    startedAt: Date.now(),
    pausedAt: null
  });
}

function completeFocusTransition() {
  const focus = getFocusSnapshot(state);
  if (!focus.isRunning || focus.currentRemainingSeconds > 0) return;

  if (focus.mode === 'focus') {
    state.focus.completedSessions += 1;
    state.focusCoins += state.focus.focusMinutes;
    state.happiness = clamp(state.happiness + 5, 0, 100, state.happiness);
    state.focus.mode = 'break';
    state.focus.remainingSeconds = state.focus.breakMinutes * 60;
    state.focus.startedAt = Date.now();
    state.focus.isPaused = false;
    state.focus.pausedAt = null;
    sendToWindow(petWindow, 'pet-notice', { text: '专注完成，休息一下吧。', tone: 'success' });
  } else {
    state.focus.mode = 'focus';
    state.focus.remainingSeconds = state.focus.focusMinutes * 60;
    state.focus.startedAt = null;
    state.focus.isRunning = false;
    state.focus.isPaused = false;
    state.focus.pausedAt = null;
    sendToWindow(petWindow, 'pet-notice', { text: '休息结束，准备继续。', tone: 'info' });
  }

  saveState();
  refreshTrayMenu();
  broadcastState();
}

function startTicker() {
  setInterval(() => {
    completeFocusTransition();
    const now = Date.now();
    const idleGap = now - state.lastInteractionTime;
    if (idleGap > 2 * 60 * 60 * 1000 && now % 60000 < 1200) {
      state.happiness = clamp(state.happiness - 1, 0, 100, state.happiness);
      saveState();
    }
    broadcastState();
  }, 1000);
}

function buildFallbackAvatarImage(payload) {
  const label = String(payload && payload.name || '新角色').trim() || '新角色';
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffe0ef" />
          <stop offset="100%" stop-color="#cfe2ff" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="48" fill="url(#g)" />
      <circle cx="256" cy="228" r="124" fill="#ffffff" opacity="0.95" />
      <text x="256" y="260" text-anchor="middle" font-size="120">😊</text>
      <rect x="110" y="388" width="292" height="74" rx="37" fill="#ffffff" opacity="0.86" />
      <text x="256" y="432" text-anchor="middle" font-size="28" font-family="Arial" fill="#30445c">${label}</text>
    </svg>
  `)}`;
}

function chooseVisitor() {
  if (!Array.isArray(state.avatars) || state.avatars.length < 2) return null;
  const candidates = state.avatars.filter((avatar) => avatar.id !== state.activeAvatarId);
  return candidates.length ? pickRandom(candidates) : null;
}

async function triggerVisitor(manual) {
  const visitor = chooseVisitor();
  if (!visitor) return null;
  const payload = {
    name: visitor.name,
    imageUrl: visitor.imageUrl,
    line: manual
      ? `${visitor.name} 跑来看看你，顺手给你打个气。`
      : `${visitor.name} 路过一下：记得慢一点也没关系。`
  };
  sendToWindow(petWindow, 'visitor-appeared', payload);
  return payload;
}

function scheduleVisitor() {
  if (visitorTimer) clearTimeout(visitorTimer);
  const delay = Math.floor(Math.random() * (VISITOR_MAX_INTERVAL_MS - VISITOR_MIN_INTERVAL_MS + 1)) + VISITOR_MIN_INTERVAL_MS;
  visitorTimer = setTimeout(() => {
    triggerVisitor(false).finally(() => scheduleVisitor());
  }, delay);
}

async function getWeatherWithCache(city) {
  const normalizedCity = String(city || '').trim();
  if (!normalizedCity) throw new Error('请先填写城市。');
  const cached = weatherCache.get(normalizedCity);
  if (cached && Date.now() - cached.at < WEATHER_CACHE_MS) {
    return cached.data;
  }
  const data = await getWeatherSnapshot(normalizedCity);
  weatherCache.set(normalizedCity, { at: Date.now(), data });
  return data;
}

app.whenReady().then(() => {
  createPetWindow();
  createControlWindow();
  refreshTrayMenu = createTray();
  startTicker();
  scheduleVisitor();
  broadcastState();
  if (petWindow) petWindow.show();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
      createControlWindow();
      refreshTrayMenu = createTray();
    } else if (petWindow) {
      petWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // keep app alive in tray
});

ipcMain.handle('get-state', async () => getStatePayload());

ipcMain.handle('show-control-window', async () => {
  showControlWindow();
  return { ok: true };
});

ipcMain.handle('save-state', async (_event, patch) => {
  const nextState = applyStatePatch(patch || {});
  return { ok: true, state: nextState };
});

ipcMain.handle('update-focus', async (_event, focusPatch) => {
  const focus = updateFocusState(focusPatch || {});
  return { ok: true, focus };
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const extension = path.extname(filePath).slice(1) || 'png';
  const base64 = fs.readFileSync(filePath).toString('base64');
  return {
    filePath,
    dataUrl: `data:image/${extension};base64,${base64}`
  };
});

ipcMain.handle('test-ai-connection', async () => {
  const result = await testAiConnection(state.settings);
  state.settings.lastTestSummary = `${result.kind === 'gemini' ? 'Gemini' : '兼容接口'} 已连接：${result.chatModel}`;
  state.settings.lastTestAt = new Date().toISOString();
  saveState();
  broadcastState();
  return {
    ok: true,
    ...result,
    message: `AI 接口可用。当前聊天模型：${result.chatModel}${result.imageModel ? `，图片模型：${result.imageModel}` : ''}。`,
    preview: result.preview
  };
});

ipcMain.handle('get-weather-preview', async () => {
  const weather = await getWeatherWithCache(state.settings.city);
  return { ok: true, weather };
});

ipcMain.handle('trigger-visitor', async () => {
  const visitor = await triggerVisitor(true);
  if (!visitor) {
    return { ok: false, error: '至少需要两个已保存角色，才能触发访客。' };
  }
  return { ok: true, visitor };
});

ipcMain.handle('generate-avatar', async (_event, payload) => {
  if (!state.settings.apiKey) {
    return {
      ok: false,
      error: '请先填写 API Key，再生成角色。',
      imageUrl: buildFallbackAvatarImage(payload)
    };
  }

  try {
    const result = await generateAvatarArtwork(state.settings, payload || {});
    return {
      ok: true,
      ...result
    };
  } catch (error) {
    console.error('generate-avatar error:', error);
    return {
      ok: false,
      error: error.message || '生成角色失败。',
      imageUrl: buildFallbackAvatarImage(payload)
    };
  }
});

ipcMain.handle('chat-avatar', async (_event, payload) => {
  const avatar = payload && payload.avatar ? payload.avatar : { name: '桌宠', style: 'cute', mood: 'happy', prompt: '' };
  const message = String(payload && payload.message || '').trim();
  if (!message) {
    return { ok: false, reply: '你还没输入内容。', error: '消息为空。' };
  }

  updateLastInteraction();
  saveState();

  if (isWeatherQuestion(message)) {
    try {
      const weather = await getWeatherWithCache(state.settings.city);
      return {
        ok: true,
        reply: weather.summary,
        weather,
        source: 'weather'
      };
    } catch (error) {
      return {
        ok: false,
        reply: `天气获取失败：${error.message}`,
        error: error.message,
        source: 'weather'
      };
    }
  }

  if (!state.settings.apiKey) {
    const fallbackReplies = [
      '我在这里陪着你。先把现在最重要的一步说给我听。',
      '别急，我们先把事情缩小到可以马上开始的那一步。',
      '你不是一个人在扛，我先陪你把思路理顺。'
    ];
    return {
      ok: true,
      reply: pickRandom(fallbackReplies),
      degraded: true
    };
  }

  try {
    const reply = await generateCompanionReply({
      settings: state.settings,
      avatar,
      history: payload.history,
      message,
      happiness: state.happiness,
      focus: getFocusSnapshot(state)
    });
    return {
      ok: true,
      reply
    };
  } catch (error) {
    console.error('chat-avatar error:', error);
    return {
      ok: false,
      reply: `AI 接口调用失败：${error.message}`,
      error: error.message
    };
  }
});

ipcMain.on('start-drag', () => {
  updateLastInteraction();
  saveState();
});

ipcMain.on('dragging', (_event, payload) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  const screenX = Number(payload && payload.screenX);
  const screenY = Number(payload && payload.screenY);
  const offsetX = Number(payload && payload.offsetX);
  const offsetY = Number(payload && payload.offsetY);
  if ([screenX, screenY, offsetX, offsetY].some((value) => Number.isNaN(value))) return;

  const nextBounds = constrainPetBounds({
    x: Math.round(screenX - offsetX),
    y: Math.round(screenY - offsetY),
    width: state.petBounds.width,
    height: state.petBounds.height
  });
  petWindow.setPosition(nextBounds.x, nextBounds.y);
  state.petBounds = nextBounds;
  saveState();
});

ipcMain.on('end-drag', () => {
  updateLastInteraction();
  saveState();
});
