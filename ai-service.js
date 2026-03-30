const {
  STYLE_LABELS,
  MOOD_LABELS,
  buildPromptFromForm,
  inferInterfaceKind,
  normalizeBaseUrl,
  buildWeatherSummary
} = require('./app-core');

const WEATHER_CODE_MAP = {
  0: '晴朗',
  1: '大致晴',
  2: '局部多云',
  3: '阴天',
  45: '雾',
  48: '冻雾',
  51: '毛毛雨',
  53: '小雨',
  55: '中雨',
  56: '冻毛雨',
  57: '冻毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '冰粒',
  80: '阵雨',
  81: '较强阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '大阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷阵雨伴冰雹'
};

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    const data = parseJson(text);
    return {
      ok: response.ok,
      status: response.status,
      data,
      text,
      headers: response.headers,
      url
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: '',
      error,
      url
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildFriendlyError(label, response, fallbackMessage) {
  if (response && response.error) {
    if (response.error.name === 'AbortError') return `${label} 连接超时，请稍后再试。`;
    return `${label} 连接失败：${response.error.message}`;
  }

  if (response && response.data) {
    const candidate = response.data.error || response.data.message || response.data.msg;
    if (typeof candidate === 'string') return `${label} 返回错误：${candidate}`;
    if (candidate && typeof candidate.message === 'string') return `${label} 返回错误：${candidate.message}`;
  }

  if (response && response.text) {
    const compact = response.text.replace(/\s+/g, ' ').trim().slice(0, 220);
    if (compact) return `${label} 返回错误：${compact}`;
  }

  return fallbackMessage || `${label} 请求失败。`;
}

function getInterfaceKind(settings) {
  return safeString(settings && settings.interfaceKind) || inferInterfaceKind(settings);
}

function getBaseUrl(settings) {
  return normalizeBaseUrl(settings && settings.apiBaseUrl);
}

function getApiKey(settings) {
  return safeString(settings && settings.apiKey);
}

function getChatModel(settings) {
  return safeString(settings && settings.chatModel);
}

function getImageModel(settings) {
  return safeString(settings && settings.imageModel);
}

function extractOpenAiText(response) {
  const choice = response && response.choices && response.choices[0];
  if (!choice || !choice.message) return '';
  const content = choice.message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => item && (item.text || (item.type === 'text' ? item.text : '')) || '')
      .join('\n')
      .trim();
  }
  return '';
}

function extractGeminiText(response) {
  const candidate = response && response.candidates && response.candidates[0];
  const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  return parts.map((part) => part && (part.text || '')).join('\n').trim();
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function stripCodeFence(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createSvgAvatar(spec) {
  const palette = Array.isArray(spec.palette) && spec.palette.length >= 3
    ? spec.palette.slice(0, 3)
    : ['#ffd5ea', '#f8fbff', '#c8dcff'];
  const [c1, c2, c3] = palette;
  const faceEmoji = /开心|笑|元气|可爱|happy|smile/i.test(spec.face) ? '😊' : /冷静|平静|calm/i.test(spec.face) ? '🙂' : '✨';
  const accessoryEmoji = /星|spark/i.test(spec.accessory) ? '⭐' : /猫|cat/i.test(spec.accessory) ? '🐾' : /花|flower/i.test(spec.accessory) ? '🌸' : '🎀';
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${escapeXml(c1)}" />
        <stop offset="55%" stop-color="${escapeXml(c2)}" />
        <stop offset="100%" stop-color="${escapeXml(c3)}" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#324155" flood-opacity="0.22" />
      </filter>
    </defs>
    <rect width="768" height="768" rx="72" fill="url(#bg)" />
    <circle cx="384" cy="348" r="212" fill="#fff7fb" opacity="0.92" filter="url(#shadow)" />
    <circle cx="384" cy="330" r="156" fill="#ffffff" opacity="0.98" />
    <circle cx="384" cy="542" r="126" fill="#ffffff" opacity="0.92" />
    <text x="384" y="360" text-anchor="middle" font-size="138">${escapeXml(faceEmoji)}</text>
    <text x="542" y="202" text-anchor="middle" font-size="66">${escapeXml(accessoryEmoji)}</text>
    <rect x="156" y="604" width="456" height="90" rx="45" fill="#ffffff" opacity="0.82" />
    <text x="384" y="645" text-anchor="middle" font-size="34" font-family="Arial, sans-serif" fill="#203047">${escapeXml(spec.title)}</text>
    <text x="384" y="688" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" fill="#516173">${escapeXml(spec.pose)} · ${escapeXml(spec.hair)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function parseAvatarSpec(text, fallbackName) {
  const cleaned = stripCodeFence(text);
  const data = parseJson(cleaned) || {};
  const palette = Array.isArray(data.palette) && data.palette.length >= 3
    ? data.palette.slice(0, 3)
    : ['#ffd5ea', '#f8fbff', '#c8dcff'];
  return {
    palette: palette.map((item) => String(item || '').trim() || '#ffd5ea'),
    face: String(data.face || '微笑').trim(),
    accessory: String(data.accessory || '星星发夹').trim(),
    pose: String(data.pose || '轻轻挥手').trim(),
    title: String(data.title || fallbackName || '桌宠伙伴').trim(),
    bubble: String(data.bubble || '我会在这里陪着你').trim().slice(0, 22),
    hair: String(data.hair || '柔软短发').trim(),
    clothing: String(data.clothing || '简洁连帽衫').trim()
  };
}

function cleanHistory(history) {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      role: item && item.role === 'user' ? 'user' : 'assistant',
      content: safeString(item && (item.text || item.content))
    }))
    .filter((item) => item.content)
    .slice(-12);
}

async function callOpenAiCompatibleChat(settings, messages, options = {}) {
  const apiKey = getApiKey(settings);
  if (!apiKey) throw new Error('还没有填写 API Key。');
  const model = safeString(options.model || getChatModel(settings));
  if (!model) throw new Error('还没有填写聊天模型。');
  const response = await requestJson(`${getBaseUrl(settings)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 500
    })
  });
  if (!response.ok) throw new Error(buildFriendlyError('聊天接口', response, '聊天接口调用失败。'));
  return response.data;
}

function mapHistoryToGemini(history) {
  return history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }));
}

async function callGemini(settings, body, modelName) {
  const apiKey = getApiKey(settings);
  if (!apiKey) throw new Error('还没有填写 API Key。');
  const model = safeString(modelName || getChatModel(settings));
  if (!model) throw new Error('还没有填写聊天模型。');
  const response = await requestJson(`${getBaseUrl(settings)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(buildFriendlyError('Gemini 接口', response, 'Gemini 调用失败。'));
  return response.data;
}

async function testAiConnection(settings) {
  const kind = getInterfaceKind(settings);
  const apiKey = getApiKey(settings);
  if (!apiKey) throw new Error('请先填写 API Key。');
  const baseUrl = getBaseUrl(settings);
  const chatModel = getChatModel(settings);
  const imageModel = getImageModel(settings);

  if (!baseUrl) throw new Error('请先填写接口地址。');
  if (!chatModel) throw new Error('请先填写聊天模型。');

  let preview = '';
  if (kind === 'gemini') {
    const data = await callGemini(settings, {
      contents: [{ role: 'user', parts: [{ text: '请只回复：连接成功。' }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 40 }
    }, chatModel);
    preview = extractGeminiText(data) || '连接成功';
  } else {
    const data = await callOpenAiCompatibleChat(settings, [
      { role: 'system', content: '请只回复“连接成功”。' },
      { role: 'user', content: '测试接口连通性。' }
    ], {
      model: chatModel,
      temperature: 0.2,
      maxTokens: 40
    });
    preview = extractOpenAiText(data) || '连接成功';
  }

  return {
    kind,
    baseUrl,
    chatModel,
    imageModel,
    preview: preview.slice(0, 120) || '连接成功'
  };
}

async function describeUploadedImage(settings, uploadedImage) {
  if (!uploadedImage) return '';
  const question = '请只提炼人物外观要点，输出 4 到 6 条，尽量具体：发型、配色、气质、服饰、配件、面部表情。不要解释。';
  const kind = getInterfaceKind(settings);

  if (kind === 'gemini') {
    const parsed = parseDataUrl(uploadedImage);
    if (!parsed) return '';
    const data = await callGemini(settings, {
      contents: [{
        role: 'user',
        parts: [
          { text: question },
          { inline_data: { mime_type: parsed.mimeType, data: parsed.data } }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 220 }
    }, getChatModel(settings));
    return extractGeminiText(data);
  }

  const data = await callOpenAiCompatibleChat(settings, [{
    role: 'user',
    content: [
      { type: 'text', text: question },
      { type: 'image_url', image_url: { url: uploadedImage, detail: 'low' } }
    ]
  }], {
    model: getChatModel(settings),
    temperature: 0.2,
    maxTokens: 220
  });
  return extractOpenAiText(data);
}

function buildAvatarImagePrompt(payload, imageNotes) {
  return [
    '请生成一个高级、干净、可爱的桌面宠物形象。',
    `角色名称：${payload.name}`,
    `整体风格：${STYLE_LABELS[payload.style] || payload.style}`,
    `情绪：${MOOD_LABELS[payload.mood] || payload.mood}`,
    `设定：${payload.prompt || buildPromptFromForm(payload)}`,
    imageNotes ? `保留这些人物特征：${imageNotes}` : '如果没有图片特征，就根据设定自行补足细节。',
    '画面要求：单人，治愈、简洁、适合长期放在桌面，颜色柔和。'
  ].join('\n');
}

async function tryImageEndpoint(settings, payload, imageNotes) {
  const kind = getInterfaceKind(settings);
  const imageModel = getImageModel(settings);
  if (!imageModel || kind === 'gemini') return null;

  const response = await requestJson(`${getBaseUrl(settings)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey(settings)}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: buildAvatarImagePrompt(payload, imageNotes),
      size: '1024x1024'
    })
  });

  if (!response.ok) {
    throw new Error(buildFriendlyError('图片生成接口', response, '图片生成失败。'));
  }

  const image = Array.isArray(response.data && response.data.data) ? response.data.data[0] : null;
  if (!image) {
    throw new Error('图片接口没有返回可用图像。');
  }

  if (image.b64_json) {
    return {
      imageUrl: `data:image/png;base64,${image.b64_json}`,
      engine: 'remote-image',
      revisedPrompt: image.revised_prompt || ''
    };
  }

  if (image.url) {
    return {
      imageUrl: image.url,
      engine: 'remote-image-url',
      revisedPrompt: image.revised_prompt || ''
    };
  }

  throw new Error('图片接口返回格式暂不支持。');
}

function buildAvatarSpecPrompt(payload, imageNotes) {
  return [
    '请你为桌面宠物输出一个紧凑 JSON，用于生成 SVG 头像。',
    '只输出 JSON，不要解释。',
    'JSON 字段必须包含：palette(array, 3个颜色), face(string), accessory(string), pose(string), title(string), bubble(string), hair(string), clothing(string)。',
    `角色名字：${payload.name || '未命名角色'}`,
    `风格：${STYLE_LABELS[payload.style] || payload.style}`,
    `情绪：${MOOD_LABELS[payload.mood] || payload.mood}`,
    `设定：${payload.prompt || buildPromptFromForm(payload)}`,
    imageNotes ? `已从上传图片提炼到的人物特征：${imageNotes}` : '没有图片特征时，请根据文字设定自行补全。',
    '要求：高级、耐看、适合桌面长期观看；bubble 不超过 18 个字。'
  ].join('\n');
}

async function buildAiDesignedSvg(settings, payload, imageNotes) {
  const kind = getInterfaceKind(settings);
  const prompt = buildAvatarSpecPrompt(payload, imageNotes);

  let content = '';
  if (kind === 'gemini') {
    const data = await callGemini(settings, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 320 }
    }, getChatModel(settings));
    content = extractGeminiText(data);
  } else {
    const data = await callOpenAiCompatibleChat(settings, [{ role: 'user', content: prompt }], {
      model: getChatModel(settings),
      temperature: 0.75,
      maxTokens: 320
    });
    content = extractOpenAiText(data);
  }

  const spec = parseAvatarSpec(content, payload.name);
  return {
    imageUrl: createSvgAvatar(spec),
    engine: 'ai-svg',
    spec
  };
}

async function generateAvatarArtwork(settings, payload) {
  if (!getApiKey(settings)) throw new Error('请先填写 API Key。');
  const imageNotes = await describeUploadedImage(settings, payload.image).catch(() => '');

  try {
    const remoteImage = await tryImageEndpoint(settings, payload, imageNotes);
    if (remoteImage) {
      return {
        ...remoteImage,
        imageNotes
      };
    }
  } catch (error) {
    // fallback to SVG, but keep note for UI if needed
  }

  const svgResult = await buildAiDesignedSvg(settings, payload, imageNotes);
  return {
    ...svgResult,
    imageNotes
  };
}

async function generateCompanionReply({ settings, avatar, history, message, happiness, focus }) {
  const kind = getInterfaceKind(settings);
  const mood = happiness > 82 ? '心情很好' : happiness > 60 ? '状态稳定' : happiness > 35 ? '有点疲惫' : '需要被安慰';
  const focusState = focus && focus.isRunning
    ? `用户正在${focus.mode === 'focus' ? '专注' : '休息'}，当前任务是“${focus.focusTask}”。`
    : '用户当前没有开启专注。';
  const systemPrompt = [
    `你是桌面宠物 ${avatar.name || '桌宠'}。`,
    `你的角色风格是 ${STYLE_LABELS[avatar.style] || avatar.style || 'Q版可爱'}，情绪基调是 ${MOOD_LABELS[avatar.mood] || avatar.mood || '开心'}。`,
    avatar.prompt ? `角色补充设定：${avatar.prompt}` : '',
    `你现在的心情：${mood}。`,
    focusState,
    '请用温柔、自然、聪明、具陪伴感的中文回答，不要冷冰冰，也不要假装自己无所不能。',
    '回答长度以 2 到 5 句为主，必要时给一个很小的下一步行动建议。'
  ].filter(Boolean).join('\n');

  const clean = cleanHistory(history);

  if (kind === 'gemini') {
    const data = await callGemini(settings, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...mapHistoryToGemini(clean),
        { role: 'user', parts: [{ text: message }] }
      ],
      generationConfig: { temperature: 0.85, maxOutputTokens: 420 }
    }, getChatModel(settings));
    return extractGeminiText(data) || '我在认真听你说，再和我讲讲。';
  }

  const data = await callOpenAiCompatibleChat(settings, [
    { role: 'system', content: systemPrompt },
    ...clean.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: message }
  ], {
    model: getChatModel(settings),
    temperature: 0.85,
    maxTokens: 420
  });
  return extractOpenAiText(data) || '我在认真听你说，再和我讲讲。';
}

async function getWeatherSnapshot(city) {
  const normalizedCity = safeString(city);
  if (!normalizedCity) throw new Error('请先填写城市。');

  const geo = await requestJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizedCity)}&count=1&language=zh&format=json`);
  if (!geo.ok) throw new Error(buildFriendlyError('天气定位', geo, '城市定位失败。'));
  const location = Array.isArray(geo.data && geo.data.results) ? geo.data.results[0] : null;
  if (!location) throw new Error(`没有找到城市“${normalizedCity}”。`);

  const weather = await requestJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  );
  if (!weather.ok) throw new Error(buildFriendlyError('天气服务', weather, '天气获取失败。'));

  const current = weather.data && weather.data.current ? weather.data.current : {};
  const daily = weather.data && weather.data.daily ? weather.data.daily : {};
  const result = {
    city: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    description: WEATHER_CODE_MAP[current.weather_code] || '天气平稳',
    temp: current.temperature_2m,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    min: (daily.temperature_2m_min || [null])[0],
    max: (daily.temperature_2m_max || [null])[0]
  };
  result.summary = buildWeatherSummary(result);
  return result;
}

module.exports = {
  testAiConnection,
  generateAvatarArtwork,
  generateCompanionReply,
  getWeatherSnapshot,
  buildFriendlyError,
  requestJson,
  getInterfaceKind
};
