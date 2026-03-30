const APP_TITLE = '桌面宠物 · AI 陪伴版';

const THEME_DEFINITIONS = {
  default: {
    id: 'default',
    name: '默认暖光',
    cost: 0,
    gradient: 'radial-gradient(circle at 28% 22%, #fff8fb 0%, #ffd6ea 36%, #c9ddff 100%)'
  },
  sunset: {
    id: 'sunset',
    name: '落日陪伴',
    cost: 180,
    gradient: 'radial-gradient(circle at 30% 30%, #fff7d8 0%, #ffb98d 46%, #ff7f7f 100%)'
  },
  forest: {
    id: 'forest',
    name: '森林呼吸',
    cost: 220,
    gradient: 'radial-gradient(circle at 30% 26%, #f7fff7 0%, #b7e4c7 42%, #40916c 100%)'
  },
  ocean: {
    id: 'ocean',
    name: '海盐薄雾',
    cost: 260,
    gradient: 'radial-gradient(circle at 30% 28%, #f8fdff 0%, #a9def9 42%, #3f8efc 100%)'
  },
  galaxy: {
    id: 'galaxy',
    name: '静夜星海',
    cost: 420,
    gradient: 'radial-gradient(circle at 70% 25%, #f8d2ff 0%, #6d3fc7 38%, #15052e 100%)'
  }
};

const STYLE_LABELS = {
  cute: 'Q版可爱',
  anime: '二次元',
  pixel: '像素风',
  minimal: '极简治愈'
};

const MOOD_LABELS = {
  happy: '开心',
  calm: '平静',
  brave: '元气',
  gentle: '温柔'
};

const DEFAULT_PROMPT = '请把角色设计成适合长期陪伴用户的桌面宠物：温柔、聪明、会鼓励人，同时外观高级、耐看、适合长期放在桌面。';

const defaultState = {
  settings: {
    alwaysOnTop: true,
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    imageModel: 'gpt-image-1',
    city: '大连',
    interfaceKind: 'openai-compatible',
    lastTestSummary: '',
    lastTestAt: ''
  },
  petBounds: {
    x: 40,
    y: 40,
    width: 240,
    height: 240
  },
  focus: {
    isRunning: false,
    isPaused: false,
    mode: 'focus',
    focusMinutes: 25,
    breakMinutes: 5,
    focusTask: '开始今天最重要的一件事',
    startedAt: null,
    pausedAt: null,
    remainingSeconds: 25 * 60,
    completedSessions: 0
  },
  plans: [
    { id: 1, text: '先把今天最重要的一件事做掉', done: false },
    { id: 2, text: '完成一次专注', done: false }
  ],
  avatars: [],
  activeAvatarId: null,
  happiness: 76,
  lastInteractionTime: Date.now(),
  focusCoins: 0,
  unlockedThemes: ['default'],
  activeTheme: 'default'
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeBaseUrl(input) {
  const raw = safeString(input);
  if (!raw) return defaultState.settings.apiBaseUrl;

  let value = raw;
  const removableSuffixes = [
    '/chat/completions',
    '/images/generations',
    '/responses',
    '/models',
    ':generatecontent',
    ':generateContent'
  ];

  for (const suffix of removableSuffixes) {
    if (value.toLowerCase().endsWith(suffix.toLowerCase())) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }

  return value.replace(/\/+$/, '');
}

function inferInterfaceKind(settings = {}) {
  const baseUrl = normalizeBaseUrl(settings.apiBaseUrl || settings.aiBaseUrl || settings.customApiUrl || settings.llmApiUrl || '');
  const chatModel = safeString(settings.chatModel || settings.openaiModel || settings.model).toLowerCase();
  if (/generativelanguage\.googleapis\.com|googleapis\.com\/v1beta/i.test(baseUrl) || /^gemini/i.test(chatModel)) {
    return 'gemini';
  }
  return 'openai-compatible';
}

function normalizePlan(item, index) {
  return {
    id: Number(item && item.id) || Date.now() + index,
    text: safeString(item && item.text) || `待办 ${index + 1}`,
    done: !!(item && item.done)
  };
}

function normalizeMessage(item, fallbackRole = 'avatar') {
  return {
    role: item && item.role === 'user' ? 'user' : fallbackRole,
    text: safeString(item && (item.text || item.content))
  };
}

function normalizeAvatar(item, index) {
  const name = safeString(item && item.name) || `角色 ${index + 1}`;
  const messages = Array.isArray(item && item.messages)
    ? item.messages.map((message) => normalizeMessage(message, 'avatar')).filter((message) => message.text)
    : [];

  return {
    id: Number(item && item.id) || Date.now() + index,
    name,
    style: STYLE_LABELS[item && item.style] ? item.style : 'cute',
    mood: MOOD_LABELS[item && item.mood] ? item.mood : 'happy',
    energy: clamp(item && item.energy, 0, 100, 70),
    prompt: safeString(item && item.prompt) || DEFAULT_PROMPT,
    originalImage: safeString(item && item.originalImage),
    imageUrl: safeString(item && item.imageUrl),
    messages: messages.length ? messages : [{ role: 'avatar', text: `你好呀，我是 ${name}，以后由我陪着你。` }],
    createdAt: safeString(item && item.createdAt) || new Date().toISOString(),
    meta: item && typeof item.meta === 'object' && item.meta ? item.meta : {}
  };
}

function buildLegacyCompatibleSettings(rawSettings = {}) {
  const baseSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const settings = {
    alwaysOnTop: baseSettings.alwaysOnTop !== false,
    apiKey: safeString(
      baseSettings.apiKey ||
      baseSettings.aiApiKey ||
      baseSettings.llmApiKey ||
      baseSettings.imageApiKey ||
      ''
    ),
    apiBaseUrl: normalizeBaseUrl(
      baseSettings.apiBaseUrl ||
      baseSettings.aiBaseUrl ||
      baseSettings.customApiUrl ||
      baseSettings.llmApiUrl ||
      defaultState.settings.apiBaseUrl
    ),
    chatModel: safeString(
      baseSettings.chatModel ||
      baseSettings.model ||
      baseSettings.openaiModel ||
      baseSettings.zhipuModel ||
      defaultState.settings.chatModel
    ) || defaultState.settings.chatModel,
    imageModel: safeString(
      baseSettings.imageModel ||
      baseSettings.imageGenerationModel ||
      defaultState.settings.imageModel
    ) || defaultState.settings.imageModel,
    city: safeString(
      baseSettings.city ||
      baseSettings.weatherCity ||
      defaultState.settings.city
    ) || defaultState.settings.city,
    lastTestSummary: safeString(baseSettings.lastTestSummary),
    lastTestAt: safeString(baseSettings.lastTestAt)
  };

  settings.interfaceKind = inferInterfaceKind(settings);
  return settings;
}

function normalizeState(rawState) {
  const raw = rawState && typeof rawState === 'object' ? rawState : {};
  const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = buildLegacyCompatibleSettings(rawSettings);

  const focusRaw = raw.focus && typeof raw.focus === 'object' ? raw.focus : {};
  const focusMinutes = clamp(focusRaw.focusMinutes, 1, 180, defaultState.focus.focusMinutes);
  const breakMinutes = clamp(focusRaw.breakMinutes, 1, 60, defaultState.focus.breakMinutes);
  const focus = {
    ...defaultState.focus,
    ...focusRaw,
    focusMinutes,
    breakMinutes,
    focusTask: safeString(focusRaw.focusTask) || defaultState.focus.focusTask,
    remainingSeconds: Math.max(0, Number(focusRaw.remainingSeconds) || focusMinutes * 60),
    completedSessions: Math.max(0, Number(focusRaw.completedSessions) || 0),
    isRunning: !!focusRaw.isRunning,
    isPaused: !!focusRaw.isPaused,
    mode: focusRaw.mode === 'break' ? 'break' : 'focus',
    startedAt: Number(focusRaw.startedAt) || null,
    pausedAt: Number(focusRaw.pausedAt) || null
  };

  const avatars = Array.isArray(raw.avatars) ? raw.avatars.map(normalizeAvatar) : [];
  const plans = Array.isArray(raw.plans) && raw.plans.length ? raw.plans.map(normalizePlan) : deepClone(defaultState.plans);
  const unlockedThemes = Array.isArray(raw.unlockedThemes)
    ? [...new Set(raw.unlockedThemes.filter((themeId) => THEME_DEFINITIONS[themeId]))]
    : ['default'];
  if (!unlockedThemes.includes('default')) unlockedThemes.unshift('default');

  const activeTheme = THEME_DEFINITIONS[raw.activeTheme] ? raw.activeTheme : 'default';
  const activeAvatarId = avatars.some((avatar) => avatar.id === raw.activeAvatarId)
    ? raw.activeAvatarId
    : avatars.length
      ? avatars[0].id
      : null;

  const petBounds = {
    x: Number.isFinite(raw.petBounds && raw.petBounds.x) ? Math.round(raw.petBounds.x) : defaultState.petBounds.x,
    y: Number.isFinite(raw.petBounds && raw.petBounds.y) ? Math.round(raw.petBounds.y) : defaultState.petBounds.y,
    width: clamp(raw.petBounds && raw.petBounds.width, 180, 420, defaultState.petBounds.width),
    height: clamp(raw.petBounds && raw.petBounds.height, 180, 420, defaultState.petBounds.height)
  };

  return {
    ...deepClone(defaultState),
    ...raw,
    settings,
    petBounds,
    focus,
    plans,
    avatars,
    activeAvatarId,
    happiness: clamp(raw.happiness, 0, 100, defaultState.happiness),
    lastInteractionTime: Number(raw.lastInteractionTime) || Date.now(),
    focusCoins: Math.max(0, Number(raw.focusCoins) || 0),
    unlockedThemes,
    activeTheme
  };
}

function mergeState(currentState, patch) {
  const current = normalizeState(currentState);
  const rawPatch = patch && typeof patch === 'object' ? patch : {};
  return normalizeState({
    ...current,
    ...rawPatch,
    settings: rawPatch.settings ? { ...current.settings, ...rawPatch.settings } : current.settings,
    focus: rawPatch.focus ? { ...current.focus, ...rawPatch.focus } : current.focus
  });
}

function getActiveAvatar(state) {
  const normalized = normalizeState(state);
  return normalized.avatars.find((avatar) => avatar.id === normalized.activeAvatarId) || null;
}

function getThemeGradient(themeId) {
  return (THEME_DEFINITIONS[themeId] || THEME_DEFINITIONS.default).gradient;
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remain = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${remain}`;
}

function getFocusSnapshot(state) {
  const normalized = normalizeState(state);
  const focus = { ...normalized.focus };
  if (focus.isRunning && !focus.isPaused && focus.startedAt) {
    const elapsed = Math.floor((Date.now() - focus.startedAt) / 1000);
    focus.currentRemainingSeconds = Math.max(0, focus.remainingSeconds - elapsed);
  } else {
    focus.currentRemainingSeconds = focus.remainingSeconds;
  }
  return focus;
}

function isWeatherQuestion(text) {
  const value = safeString(text);
  if (!value) return false;
  return /(天气|气温|温度|下雨|降温|升温|穿什么|冷不冷|热不热|forecast|weather)/i.test(value);
}

function buildWeatherSummary(weather) {
  if (!weather) return '暂时没有天气信息。';
  const city = safeString(weather.city) || '当前城市';
  const description = safeString(weather.description) || '天气平稳';
  const temp = Number.isFinite(Number(weather.temp)) ? Math.round(Number(weather.temp)) : Math.round(Number(weather.temperature) || 0);
  const feelsLike = Number.isFinite(Number(weather.feelsLike)) ? Math.round(Number(weather.feelsLike)) : null;
  const humidity = Number.isFinite(Number(weather.humidity)) ? Math.round(Number(weather.humidity)) : null;
  const windSpeed = Number.isFinite(Number(weather.windSpeed)) ? Math.round(Number(weather.windSpeed)) : null;
  const min = Number.isFinite(Number(weather.min)) ? Math.round(Number(weather.min)) : null;
  const max = Number.isFinite(Number(weather.max)) ? Math.round(Number(weather.max)) : null;

  const parts = [`${city}当前${description}`];
  if (Number.isFinite(temp)) parts.push(`气温 ${temp}°C`);
  if (Number.isFinite(feelsLike)) parts.push(`体感 ${feelsLike}°C`);
  if (Number.isFinite(humidity)) parts.push(`湿度 ${humidity}%`);
  if (Number.isFinite(windSpeed)) parts.push(`风速 ${windSpeed} km/h`);
  if (Number.isFinite(min) && Number.isFinite(max)) parts.push(`今日 ${min}°C ~ ${max}°C`);
  return `${parts.join('，')}。`;
}

function buildPromptFromForm(input) {
  const name = safeString(input && input.name) || '未命名角色';
  const style = STYLE_LABELS[input && input.style] || STYLE_LABELS.cute;
  const mood = MOOD_LABELS[input && input.mood] || MOOD_LABELS.happy;
  const energy = clamp(input && input.energy, 0, 100, 70);
  return `请围绕这个人物设计桌面宠物形象：名字是“${name}”，风格是“${style}”，情绪气质是“${mood}”，活力值 ${energy}/100。保留人物的主要特征，适合常驻桌面，整体高级、干净、耐看、容易让用户产生陪伴感。`;
}

function pickRandom(list) {
  return Array.isArray(list) && list.length
    ? list[Math.floor(Math.random() * list.length)]
    : null;
}

module.exports = {
  APP_TITLE,
  THEME_DEFINITIONS,
  STYLE_LABELS,
  MOOD_LABELS,
  DEFAULT_PROMPT,
  defaultState,
  deepClone,
  safeString,
  clamp,
  normalizeBaseUrl,
  inferInterfaceKind,
  normalizeState,
  mergeState,
  getActiveAvatar,
  getThemeGradient,
  formatTime,
  getFocusSnapshot,
  isWeatherQuestion,
  buildWeatherSummary,
  buildPromptFromForm,
  pickRandom
};
