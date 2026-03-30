const petShell = document.getElementById('petShell');
const petCard = document.getElementById('petCard');
const petInner = document.getElementById('petInner');
const petTag = document.getElementById('petTag');
const petBubble = document.getElementById('petBubble');
const openBtn = document.getElementById('openBtn');
const petNotice = document.getElementById('petNotice');
const visitorCard = document.getElementById('visitorCard');
const visitorAvatar = document.getElementById('visitorAvatar');
const visitorName = document.getElementById('visitorName');
const visitorLine = document.getElementById('visitorLine');

let appState = null;
let activeAvatar = null;
let dragState = null;
let localInteractionAt = Date.now();
let idleBurstUntil = 0;
let nextIdleDecisionAt = 0;
let noticeTimer = null;
let visitorTimer = null;

function formatTime(totalSeconds) {
  const value = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(value / 60)).padStart(2, '0');
  const seconds = String(Math.floor(value % 60)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function markInteraction() {
  localInteractionAt = Date.now();
  clearIdleAnimation();
}

function clearIdleAnimation() {
  petCard.classList.remove('idle-happy', 'idle-sad');
}

function getPetFace(state) {
  if (state.focus.isRunning && !state.focus.isPaused) return '✨';
  if (state.happiness <= 30) return '🥺';
  if (state.happiness <= 70) return '😌';
  return '😊';
}

function applyTheme(gradient) {
  document.documentElement.style.setProperty('--pet-gradient', gradient || 'radial-gradient(circle at 28% 22%, #fff8fb 0%, #ffd6ea 36%, #c9ddff 100%)');
}

function getBubbleText(state, avatar) {
  const focus = state.focus;
  const name = avatar && avatar.name ? avatar.name : '小光';
  if (focus.isRunning && !focus.isPaused) return `${name}正在帮你守住这段专注时间。`;
  if (focus.isPaused) return `${name}在这里等你，喘口气以后我们继续。`;
  if (state.happiness <= 30) return '如果今天有点累，就先做最小的一步。我会陪着你。';
  if (state.happiness <= 70) return avatar ? `我是 ${name}，今天节奏刚刚好，我们稳稳推进。` : '先从最小的动作开始，状态会慢慢回来。';
  return avatar ? `${name}今天状态很好，随时可以陪你冲一下。` : '准备好了就开始今天最重要的一件事吧。';
}

function renderAvatarVisual(avatar, face) {
  if (avatar && avatar.imageUrl) {
    petInner.innerHTML = `<img src="${avatar.imageUrl}" alt="${avatar.name}" class="pet-portrait" />`;
  } else {
    petInner.innerHTML = `<div class="pet-face">${face}</div>`;
  }
}

function renderTag(state, avatar) {
  const focus = state.focus;
  if (focus.isRunning && !focus.isPaused) {
    petTag.textContent = `${focus.mode === 'focus' ? '专注' : '休息'} ${formatTime(focus.currentRemainingSeconds || focus.remainingSeconds || 0)}`;
    return;
  }
  if (focus.isPaused) {
    petTag.textContent = `暂停 ${formatTime(focus.currentRemainingSeconds || focus.remainingSeconds || 0)}`;
    return;
  }
  petTag.textContent = avatar ? `${avatar.name} 待命` : '准备就绪';
}

function render(payload) {
  appState = payload.state;
  activeAvatar = payload.activeAvatar;
  applyTheme(appState.themeGradient || appState.activeTheme);
  const face = getPetFace(appState);
  renderAvatarVisual(activeAvatar, face);
  renderTag(appState, activeAvatar);
  petBubble.textContent = getBubbleText(appState, activeAvatar);
}

function playTapAnimation() {
  petCard.classList.add('clicked');
  setTimeout(() => petCard.classList.remove('clicked'), 320);
}

async function handlePetTap() {
  markInteraction();
  playTapAnimation();
  if (!appState) return;
  const nextHappiness = Math.min(100, (appState.happiness || 70) + 2);
  try {
    await window.desktopPet.saveState({ happiness: nextHappiness });
  } catch {
    // ignore temporary save errors
  }
}

function showNotice(payload) {
  if (noticeTimer) clearTimeout(noticeTimer);
  petNotice.textContent = payload && payload.text ? payload.text : '收到一条提醒。';
  petNotice.className = `pet-notice ${payload && payload.tone ? payload.tone : 'info'}`;
  petNotice.classList.remove('hidden');
  noticeTimer = setTimeout(() => {
    petNotice.classList.add('hidden');
  }, 2600);
}

function showVisitor(payload) {
  if (visitorTimer) clearTimeout(visitorTimer);
  visitorName.textContent = payload && payload.name ? payload.name : '访客';
  visitorLine.textContent = payload && payload.line ? payload.line : '来看看你。';
  if (payload && payload.imageUrl) {
    visitorAvatar.innerHTML = `<img src="${payload.imageUrl}" alt="${payload.name || '访客'}" class="pet-portrait" />`;
  } else {
    visitorAvatar.textContent = '👋';
  }
  visitorCard.classList.remove('hidden');
  markInteraction();
  visitorTimer = setTimeout(() => {
    visitorCard.classList.add('hidden');
  }, 8000);
}

function maybeTriggerIdleAnimation() {
  if (!appState) return;
  const now = Date.now();
  const visitorShowing = !visitorCard.classList.contains('hidden');
  const idleReady = now - localInteractionAt > 12000 && !dragState && !visitorShowing;

  if (!idleReady) {
    idleBurstUntil = 0;
    nextIdleDecisionAt = now + 3000;
    clearIdleAnimation();
    return;
  }

  if (idleBurstUntil && now > idleBurstUntil) {
    clearIdleAnimation();
    idleBurstUntil = 0;
  }

  if (now < idleBurstUntil || now < nextIdleDecisionAt) return;

  nextIdleDecisionAt = now + 8000 + Math.floor(Math.random() * 7000);
  if (appState.happiness >= 70 && Math.random() < 0.8) {
    petCard.classList.add('idle-happy');
    idleBurstUntil = now + 5200;
    return;
  }
  if (appState.happiness <= 30 && Math.random() < 0.8) {
    petCard.classList.add('idle-sad');
    idleBurstUntil = now + 5800;
  }
}

function startDrag(event) {
  if (event.button !== 0) return;
  dragState = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    hasMoved: false
  };
  markInteraction();
  petCard.classList.add('dragging');
  petCard.setPointerCapture(event.pointerId);
  window.desktopPet.startDrag({ screenX: event.screenX, screenY: event.screenY });
}

function continueDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const movedX = Math.abs(event.screenX - dragState.startScreenX);
  const movedY = Math.abs(event.screenY - dragState.startScreenY);
  if (movedX > 4 || movedY > 4) dragState.hasMoved = true;
  window.desktopPet.dragging({ screenX: event.screenX, screenY: event.screenY });
}

function finishDrag(event, cancelled = false) {
  if (!dragState) return;
  if (event && event.pointerId !== dragState.pointerId) return;
  const wasClick = !dragState.hasMoved && !cancelled;
  if (petCard.hasPointerCapture(dragState.pointerId)) {
    try {
      petCard.releasePointerCapture(dragState.pointerId);
    } catch {
      // ignore
    }
  }
  dragState = null;
  petCard.classList.remove('dragging');
  window.desktopPet.endDrag();
  if (wasClick) handlePetTap();
}

openBtn.addEventListener('click', async () => {
  markInteraction();
  await window.desktopPet.showControlWindow();
});

petCard.addEventListener('pointerdown', startDrag);
petCard.addEventListener('pointermove', continueDrag);
petCard.addEventListener('pointerup', (event) => finishDrag(event, false));
petCard.addEventListener('pointercancel', (event) => finishDrag(event, true));
petCard.addEventListener('lostpointercapture', () => {
  if (dragState) finishDrag({ pointerId: dragState.pointerId }, true);
});

window.desktopPet.onVisitor(showVisitor);
window.desktopPet.onPetNotice(showNotice);
window.desktopPet.onStateUpdated(render);
window.desktopPet.getState().then(render).catch(() => {
  // ignore initial load error
});

setInterval(maybeTriggerIdleAnimation, 700);
