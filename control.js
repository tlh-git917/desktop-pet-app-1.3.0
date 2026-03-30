const $ = (id) => document.getElementById(id);
const CONFIG = window.DesktopPetRendererConfig || { styles: {}, moods: {}, themes: {} };
const STYLES = CONFIG.styles;
const MOODS = CONFIG.moods;
const THEMES = CONFIG.themes;

let appState = null;
let activeAvatar = null;
let uploadedImage = '';
let latestGeneratedRole = null;
let transientMessages = [];
let initialized = false;
let lastActiveAvatarId = null;

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remain = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${remain}`;
}

function setStatus(element, text, type = 'info') {
  if (!element) return;
  element.textContent = text;
  element.className = `status-box ${type}`;
}

function setTinyStatus(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function renderImagePreview(container, src, fallbackText) {
  if (!container) return;
  if (src) {
    container.classList.remove('placeholder');
    container.innerHTML = `<img src="${src}" alt="preview" />`;
  } else {
    container.classList.add('placeholder');
    container.textContent = fallbackText;
  }
}

function buildPrompt() {
  const name = $('avatarName').value.trim() || '未命名角色';
  const style = STYLES[$('avatarStyle').value] || 'Q版可爱';
  const mood = MOODS[$('avatarMood').value] || '开心';
  const energy = Number($('avatarEnergy').value || 70);
  return `请围绕这个人物设计桌面宠物形象：名字是“${name}”，风格是“${style}”，情绪气质是“${mood}”，活力值 ${energy}/100。保留人物主要特征，适合常驻桌面，整体高级、干净、耐看、容易让用户产生陪伴感。`;
}

function createBaseAvatarDraft() {
  const name = $('avatarName').value.trim() || `角色 ${((appState && appState.avatars && appState.avatars.length) || 0) + 1}`;
  return {
    name,
    style: $('avatarStyle').value,
    mood: $('avatarMood').value,
    energy: Number($('avatarEnergy').value || 70),
    prompt: $('editablePrompt').value.trim() || buildPrompt(),
    originalImage: uploadedImage,
    imageUrl: '',
    messages: transientMessages.length
      ? transientMessages.map((item) => ({ ...item }))
      : [{ role: 'avatar', text: `你好呀，我是 ${name}，以后由我陪着你。` }]
  };
}

function cloneMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((item) => ({
    role: item && item.role === 'user' ? 'user' : 'avatar',
    text: String(item && (item.text || item.content) || '').trim()
  })).filter((item) => item.text);
}

function getCurrentChatAvatar() {
  if (activeAvatar) return activeAvatar;
  if (latestGeneratedRole) return latestGeneratedRole;
  const base = createBaseAvatarDraft();
  return {
    id: 'draft-avatar',
    ...base,
    messages: base.messages.length ? base.messages : [{ role: 'avatar', text: `你好呀，我是 ${base.name}，以后由我陪着你。` }]
  };
}

function upsertAvatarMessages(avatarId, messages) {
  if (activeAvatar && activeAvatar.id === avatarId) {
    activeAvatar = { ...activeAvatar, messages };
  }
  if (latestGeneratedRole && latestGeneratedRole.id === avatarId) {
    latestGeneratedRole = { ...latestGeneratedRole, messages };
  }
  transientMessages = messages.map((item) => ({ ...item }));
}

function renderHero() {
  $('heroAvatarName').textContent = activeAvatar ? activeAvatar.name : (latestGeneratedRole ? latestGeneratedRole.name : '未创建');
  $('heroCoins').textContent = String(appState.focusCoins || 0);
  $('heroHappiness').textContent = `${appState.happiness || 76}/100`;
  $('happinessDisplay').textContent = `${appState.happiness || 76}/100`;
  $('focusCoinsDisplay').textContent = `${appState.focusCoins || 0}`;
}

function renderFocus() {
  const focus = appState.focus;
  $('focusModeLabel').textContent = focus.mode === 'focus' ? (focus.isPaused ? '已暂停' : '专注中') : '休息中';
  $('focusTimer').textContent = formatTime(focus.currentRemainingSeconds || focus.remainingSeconds || 0);
  $('completedSessions').textContent = String(focus.completedSessions || 0);

  if (!focus.isRunning) $('focusPrimaryBtn').textContent = '开始专注';
  else if (focus.isPaused) $('focusPrimaryBtn').textContent = '继续专注';
  else $('focusPrimaryBtn').textContent = '暂停专注';
}

function renderPlans() {
  const list = $('planList');
  list.innerHTML = '';
  const completed = appState.plans.filter((plan) => plan.done).length;
  $('planProgress').textContent = `已完成 ${completed}/${appState.plans.length}`;

  appState.plans.forEach((plan) => {
    const item = document.createElement('div');
    item.className = `plan-item ${plan.done ? 'done' : ''}`;
    item.innerHTML = `
      <button class="plan-toggle ${plan.done ? 'done' : ''}" data-action="toggle">${plan.done ? '✓' : ''}</button>
      <div class="plan-text">${plan.text}</div>
      <button class="btn tertiary small" data-action="delete">删除</button>
    `;

    item.querySelector('[data-action="toggle"]').onclick = async () => {
      const plans = appState.plans.map((entry) => entry.id === plan.id ? { ...entry, done: !entry.done } : entry);
      appState.plans = plans;
      renderPlans();
      await window.desktopPet.saveState({ plans });
    };

    item.querySelector('[data-action="delete"]').onclick = async () => {
      const plans = appState.plans.filter((entry) => entry.id !== plan.id);
      appState.plans = plans;
      renderPlans();
      await window.desktopPet.saveState({ plans });
    };

    list.appendChild(item);
  });
}

function renderRoles() {
  const list = $('roleList');
  list.innerHTML = '';
  if (!appState.avatars.length) {
    list.innerHTML = '<div class="tiny-status">还没有保存角色。先生成一个，再点“保存当前角色”。</div>';
    return;
  }

  appState.avatars.forEach((avatar) => {
    const item = document.createElement('div');
    item.className = `role-item ${appState.activeAvatarId === avatar.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="role-thumb">${avatar.imageUrl ? `<img src="${avatar.imageUrl}" alt="${avatar.name}" />` : '😊'}</div>
      <div class="role-meta">
        <strong>${avatar.name}</strong>
        <span>${STYLES[avatar.style] || avatar.style} · ${MOODS[avatar.mood] || avatar.mood}</span>
      </div>
      <div class="role-actions">
        <button class="btn secondary small" data-action="activate">${appState.activeAvatarId === avatar.id ? '当前角色' : '设为当前'}</button>
        <button class="btn tertiary small" data-action="delete">删除</button>
      </div>
    `;

    item.querySelector('[data-action="activate"]').onclick = async () => {
      if (appState.activeAvatarId === avatar.id) return;
      appState.activeAvatarId = avatar.id;
      activeAvatar = avatar;
      lastActiveAvatarId = avatar.id;
      syncRoleEditorFromAvatar(avatar, true);
      renderHero();
      renderChats();
      renderRoles();
      await window.desktopPet.saveState({ activeAvatarId: avatar.id });
    };

    item.querySelector('[data-action="delete"]').onclick = async () => {
      const avatars = appState.avatars.filter((entry) => entry.id !== avatar.id);
      const nextActiveId = avatars.some((entry) => entry.id === appState.activeAvatarId)
        ? appState.activeAvatarId
        : avatars[0] ? avatars[0].id : null;
      appState.avatars = avatars;
      appState.activeAvatarId = nextActiveId;
      activeAvatar = avatars.find((entry) => entry.id === nextActiveId) || null;
      renderHero();
      renderRoles();
      renderChats();
      await window.desktopPet.saveState({ avatars, activeAvatarId: nextActiveId });
    };

    list.appendChild(item);
  });
}

function renderThemes() {
  const store = $('themeStoreList');
  store.innerHTML = '';

  Object.values(THEMES).forEach((theme) => {
    const unlocked = appState.unlockedThemes.includes(theme.id);
    const active = appState.activeTheme === theme.id;
    const item = document.createElement('div');
    item.className = `theme-item ${active ? 'active' : ''}`;
    item.innerHTML = `
      <div class="theme-preview" style="background:${theme.gradient}"></div>
      <div class="theme-title">${theme.name}</div>
      <div class="theme-meta">${unlocked ? (active ? '已应用' : '已拥有') : `${theme.cost} 专注币`}</div>
      <div class="theme-actions">
        <span class="tiny-status">${active ? '当前使用中' : unlocked ? '可立即切换' : '先购买再应用'}</span>
        <button class="btn ${unlocked ? 'secondary' : 'primary'} small">${active ? '已应用' : unlocked ? '应用' : '购买'}</button>
      </div>
    `;

    const actionButton = item.querySelector('button');
    if (active) {
      actionButton.disabled = true;
    } else if (unlocked) {
      actionButton.onclick = async () => {
        appState.activeTheme = theme.id;
        renderThemes();
        await window.desktopPet.saveState({ activeTheme: theme.id });
      };
    } else {
      const affordable = (appState.focusCoins || 0) >= theme.cost;
      actionButton.disabled = !affordable;
      actionButton.onclick = async () => {
        const focusCoins = (appState.focusCoins || 0) - theme.cost;
        const unlockedThemes = [...new Set([...appState.unlockedThemes, theme.id])];
        appState.focusCoins = focusCoins;
        appState.unlockedThemes = unlockedThemes;
        renderHero();
        renderThemes();
        await window.desktopPet.saveState({ focusCoins, unlockedThemes });
      };
    }

    store.appendChild(item);
  });
}

function renderChats() {
  const list = $('chatList');
  list.innerHTML = '';
  const targetAvatar = getCurrentChatAvatar();
  const messages = cloneMessages(targetAvatar.messages && targetAvatar.messages.length ? targetAvatar.messages : transientMessages);
  const effectiveMessages = messages.length
    ? messages
    : [{ role: 'avatar', text: `你好呀，我是 ${targetAvatar.name || '桌宠'}，以后由我陪着你。` }];

  effectiveMessages.forEach((message) => {
    const wrap = document.createElement('div');
    wrap.className = `chat-wrap ${message.role === 'user' ? 'user' : 'avatar'}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = message.text;
    wrap.appendChild(bubble);
    list.appendChild(wrap);
  });

  list.scrollTop = list.scrollHeight;
}

function syncRoleEditorFromAvatar(avatar, force = false) {
  if (!avatar) return;
  if (!force && document.activeElement && ['avatarName', 'editablePrompt'].includes(document.activeElement.id)) return;
  $('avatarName').value = avatar.name || '';
  $('avatarStyle').value = avatar.style || 'cute';
  $('avatarMood').value = avatar.mood || 'happy';
  $('avatarEnergy').value = avatar.energy || 70;
  $('editablePrompt').value = avatar.prompt || buildPrompt();
  renderImagePreview($('generatedPreview'), avatar.imageUrl, '生成后会显示在这里');
}

function hydrateStaticInputs() {
  if (initialized) return;
  $('aiApiKey').value = appState.settings.apiKey || '';
  $('aiBaseUrl').value = appState.settings.apiBaseUrl || '';
  $('chatModelInput').value = appState.settings.chatModel || '';
  $('imageModelInput').value = appState.settings.imageModel || '';
  $('cityInput').value = appState.settings.city || '';
  $('alwaysOnTopInput').checked = !!appState.settings.alwaysOnTop;
  $('focusTaskInput').value = appState.focus.focusTask || '';
  $('focusMinutesInput').value = appState.focus.focusMinutes || 25;
  $('breakMinutesInput').value = appState.focus.breakMinutes || 5;
  $('editablePrompt').value = buildPrompt();
  initialized = true;
}

function renderAll(payload) {
  appState = payload.state;
  activeAvatar = payload.activeAvatar;
  hydrateStaticInputs();
  renderHero();
  renderFocus();
  renderPlans();
  renderRoles();
  renderThemes();
  renderChats();

  if (activeAvatar && activeAvatar.id !== lastActiveAvatarId) {
    lastActiveAvatarId = activeAvatar.id;
    syncRoleEditorFromAvatar(activeAvatar, true);
  }

  if (appState.settings.lastTestSummary && $('aiStatus').textContent === '还没有测试 AI 接口。') {
    setStatus($('aiStatus'), `${appState.settings.lastTestSummary}。最后测试时间：${appState.settings.lastTestAt || '未知'}。`, 'info');
  }
}

async function safeCall(fn, fallbackMessage = '操作失败。') {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : fallbackMessage };
  }
}

$('pickImageBtn').onclick = async () => {
  const result = await safeCall(() => window.desktopPet.selectImage(), '读取图片失败。');
  if (!result || result.ok === false || !result.dataUrl) return;
  uploadedImage = result.dataUrl;
  renderImagePreview($('uploadPreview'), uploadedImage, '未选择图片');
};

$('avatarStyle').onchange = () => {
  if (!$('editablePrompt').value.trim() || $('editablePrompt').value.trim() === buildPrompt()) {
    $('editablePrompt').value = buildPrompt();
  }
};
$('avatarMood').onchange = () => {
  if (!$('editablePrompt').value.trim() || $('editablePrompt').value.trim() === buildPrompt()) {
    $('editablePrompt').value = buildPrompt();
  }
};
$('avatarName').oninput = () => {
  if (!$('editablePrompt').value.trim()) {
    $('editablePrompt').value = buildPrompt();
  }
};
$('avatarEnergy').oninput = () => {
  if (!$('editablePrompt').value.trim()) {
    $('editablePrompt').value = buildPrompt();
  }
};

$('generateBtn').onclick = async () => {
  const payload = createBaseAvatarDraft();
  $('generateBtn').disabled = true;
  $('generationModeBadge').textContent = '生成中';
  setTinyStatus('generationStatus', '正在调用接口生成角色，请稍等。');

  const result = await safeCall(() => window.desktopPet.generateAvatar(payload), '角色生成失败。');

  $('generateBtn').disabled = false;
  if (!result || !result.imageUrl) {
    $('generationModeBadge').textContent = '生成失败';
    setTinyStatus('generationStatus', result && result.error ? result.error : '角色生成失败。');
    return;
  }

  latestGeneratedRole = {
    id: `draft-${Date.now()}`,
    ...payload,
    imageUrl: result.imageUrl,
    messages: [{ role: 'avatar', text: `你好呀，我是 ${payload.name}，以后由我陪着你。` }]
  };
  transientMessages = latestGeneratedRole.messages.map((item) => ({ ...item }));

  renderImagePreview($('generatedPreview'), result.imageUrl, '生成后会显示在这里');
  $('generationModeBadge').textContent = result.engine === 'ai-svg' ? 'AI SVG' : '图片模型';
  setTinyStatus('generationStatus', result.ok === false ? `${result.error}；已自动回退为可用角色图。` : `生成完成：${result.engine === 'ai-svg' ? '已用 AI 设计 SVG 角色' : '已完成图片生成'}`);
  renderChats();
};

$('saveRoleBtn').onclick = async () => {
  const draft = latestGeneratedRole || {
    id: `draft-${Date.now()}`,
    ...createBaseAvatarDraft(),
    imageUrl: $('generatedPreview').querySelector('img') ? $('generatedPreview').querySelector('img').src : ''
  };

  if (!draft.name) {
    setTinyStatus('generationStatus', '请先填写角色名。');
    return;
  }

  const avatar = {
    ...draft,
    id: Date.now(),
    createdAt: new Date().toISOString(),
    messages: cloneMessages(draft.messages).length ? cloneMessages(draft.messages) : [{ role: 'avatar', text: `你好呀，我是 ${draft.name}，以后由我陪着你。` }]
  };

  const avatars = [avatar, ...appState.avatars];
  appState.avatars = avatars;
  appState.activeAvatarId = avatar.id;
  activeAvatar = avatar;
  lastActiveAvatarId = avatar.id;
  latestGeneratedRole = avatar;
  transientMessages = avatar.messages.map((item) => ({ ...item }));

  renderHero();
  renderRoles();
  renderChats();
  await window.desktopPet.saveState({ avatars, activeAvatarId: avatar.id });
  setTinyStatus('generationStatus', '角色已保存，并设为当前桌宠。');
};

$('saveAiBtn').onclick = async () => {
  const settings = {
    ...appState.settings,
    apiKey: $('aiApiKey').value.trim(),
    apiBaseUrl: $('aiBaseUrl').value.trim(),
    chatModel: $('chatModelInput').value.trim(),
    imageModel: $('imageModelInput').value.trim(),
    city: $('cityInput').value.trim(),
    alwaysOnTop: $('alwaysOnTopInput').checked
  };
  appState.settings = settings;
  await window.desktopPet.saveState({ settings });
  setStatus($('aiStatus'), 'AI 设置已保存。你可以直接点“测试 AI 接口”。', 'info');
};

$('testAiBtn').onclick = async () => {
  $('testAiBtn').disabled = true;
  setStatus($('aiStatus'), '正在测试 AI 接口，请稍等。', 'info');
  const result = await safeCall(() => window.desktopPet.testAIConnection(), 'AI 接口测试失败。');
  $('testAiBtn').disabled = false;

  if (!result || result.ok === false) {
    setStatus($('aiStatus'), `AI 接口测试失败：${result && result.error ? result.error : '未知错误'}`, 'error');
    return;
  }

  setStatus(
    $('aiStatus'),
    `${result.message}\n接口类型：${result.kind === 'gemini' ? 'Gemini' : '兼容接口'}\n预览回复：${result.preview}`,
    'success'
  );
};

$('saveWeatherBtn').onclick = async () => {
  const settings = {
    ...appState.settings,
    city: $('cityInput').value.trim() || appState.settings.city
  };
  appState.settings = settings;
  await window.desktopPet.saveState({ settings });
  setStatus($('weatherPreview'), `城市已保存：${settings.city}。点击“刷新天气”即可查看。`, 'soft');
};

$('testWeatherBtn').onclick = async () => {
  $('testWeatherBtn').disabled = true;
  setStatus($('weatherPreview'), '正在获取实时天气。', 'info');
  const result = await safeCall(() => window.desktopPet.getWeatherPreview(), '天气获取失败。');
  $('testWeatherBtn').disabled = false;
  if (!result || result.ok === false || !result.weather) {
    setStatus($('weatherPreview'), `天气获取失败：${result && result.error ? result.error : '未知错误'}`, 'error');
    return;
  }
  setStatus($('weatherPreview'), result.weather.summary, 'success');
};

$('focusPrimaryBtn').onclick = async () => {
  const focus = appState.focus;
  if (!focus.isRunning) {
    await window.desktopPet.updateFocus({
      isRunning: true,
      isPaused: false,
      mode: 'focus',
      focusTask: $('focusTaskInput').value.trim() || focus.focusTask,
      focusMinutes: Number($('focusMinutesInput').value || focus.focusMinutes),
      breakMinutes: Number($('breakMinutesInput').value || focus.breakMinutes),
      remainingSeconds: Number($('focusMinutesInput').value || focus.focusMinutes) * 60,
      startedAt: Date.now(),
      pausedAt: null
    });
    return;
  }

  if (!focus.isPaused) {
    await window.desktopPet.updateFocus({
      isPaused: true,
      remainingSeconds: focus.currentRemainingSeconds || focus.remainingSeconds,
      startedAt: null,
      pausedAt: Date.now()
    });
    return;
  }

  await window.desktopPet.updateFocus({
    isPaused: false,
    startedAt: Date.now(),
    pausedAt: null
  });
};

$('focusResetBtn').onclick = async () => {
  const minutes = Number($('focusMinutesInput').value || appState.focus.focusMinutes || 25);
  const breakMinutes = Number($('breakMinutesInput').value || appState.focus.breakMinutes || 5);
  await window.desktopPet.updateFocus({
    isRunning: false,
    isPaused: false,
    mode: 'focus',
    remainingSeconds: minutes * 60,
    startedAt: null,
    pausedAt: null,
    focusMinutes: minutes,
    breakMinutes,
    focusTask: $('focusTaskInput').value.trim() || appState.focus.focusTask
  });
};

$('saveFocusSettingsBtn').onclick = async () => {
  const focus = {
    ...appState.focus,
    focusTask: $('focusTaskInput').value.trim() || '开始今天最重要的一件事',
    focusMinutes: Number($('focusMinutesInput').value || 25),
    breakMinutes: Number($('breakMinutesInput').value || 5),
    remainingSeconds: Number($('focusMinutesInput').value || 25) * 60
  };
  await window.desktopPet.updateFocus(focus);
};

$('addPlanBtn').onclick = async () => {
  const text = $('newPlanInput').value.trim();
  if (!text) return;
  const plans = [...appState.plans, { id: Date.now(), text, done: false }];
  $('newPlanInput').value = '';
  appState.plans = plans;
  renderPlans();
  await window.desktopPet.saveState({ plans });
};

$('triggerVisitorBtn').onclick = async () => {
  const result = await safeCall(() => window.desktopPet.triggerVisitor(), '触发访客失败。');
  if (!result || result.ok === false) {
    setTinyStatus('chatStatus', result && result.error ? result.error : '触发访客失败。');
    return;
  }
  setTinyStatus('chatStatus', `${result.visitor.name} 已经来串门了。`);
};

$('sendChatBtn').onclick = async () => {
  const text = $('chatInput').value.trim();
  if (!text) return;
  const target = getCurrentChatAvatar();
  const history = cloneMessages(target.messages);
  const pendingMessages = [...history, { role: 'user', text }];
  $('chatInput').value = '';

  upsertAvatarMessages(target.id, pendingMessages);
  if (activeAvatar && activeAvatar.id === target.id) {
    const avatars = appState.avatars.map((avatar) => avatar.id === target.id ? { ...avatar, messages: pendingMessages } : avatar);
    appState.avatars = avatars;
  } else if (latestGeneratedRole && latestGeneratedRole.id === target.id) {
    latestGeneratedRole = { ...latestGeneratedRole, messages: pendingMessages };
  }
  renderChats();
  setTinyStatus('chatStatus', '桌宠正在思考。');

  const result = await safeCall(() => window.desktopPet.chatAvatar({
    message: text,
    avatar: {
      id: target.id,
      name: target.name,
      style: target.style,
      mood: target.mood,
      energy: target.energy,
      prompt: target.prompt
    },
    history: pendingMessages
  }), '聊天失败。');

  const replyText = result && result.reply ? result.reply : (result && result.error ? `聊天失败：${result.error}` : '我这次没有想好怎么回答。');
  const finalMessages = [...pendingMessages, { role: 'avatar', text: replyText }];
  upsertAvatarMessages(target.id, finalMessages);

  if (activeAvatar && activeAvatar.id === target.id) {
    const avatars = appState.avatars.map((avatar) => avatar.id === target.id ? { ...avatar, messages: finalMessages } : avatar);
    appState.avatars = avatars;
    activeAvatar = { ...activeAvatar, messages: finalMessages };
    await window.desktopPet.saveState({ avatars });
  } else if (latestGeneratedRole && latestGeneratedRole.id === target.id) {
    latestGeneratedRole = { ...latestGeneratedRole, messages: finalMessages };
  }

  renderChats();
  setTinyStatus('chatStatus', result && result.source === 'weather' ? '已直接返回实时天气结果。' : (result && result.ok === false ? '这次是接口返回错误，我已经把错误信息显示出来了。' : '桌宠已回复。'));
};

window.desktopPet.getState().then((payload) => {
  renderImagePreview($('uploadPreview'), '', '未选择图片');
  renderImagePreview($('generatedPreview'), '', '生成后会显示在这里');
  $('editablePrompt').value = buildPrompt();
  renderAll(payload);
});

window.desktopPet.onStateUpdated(renderAll);
