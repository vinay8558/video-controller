(() => {
  if (window.__vscInjected) return;
  window.__vscInjected = true;

  const DEFAULTS = { enabled: true, speed: 1.0 };
  let settings = { ...DEFAULTS };
  const badges = new WeakMap();

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = stored;
    applyAll();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.speed) settings.speed = changes.speed.newValue;
    applyAll();
    findAllVideos().forEach(updateBadgeText);
  });

  function setSpeed(newSpeed) {
    newSpeed = Math.min(16, Math.max(0.07, Math.round(newSpeed * 100) / 100));
    settings.speed = newSpeed;
    chrome.storage.sync.set({ speed: newSpeed });
    applyAll();
  }

  function toggleEnabled(force) {
    settings.enabled = force !== undefined ? force : !settings.enabled;
    chrome.storage.sync.set({ enabled: settings.enabled });
    if (settings.enabled) applyAll();
    document.querySelectorAll('.vsc-badge').forEach((b) => b.classList.toggle('vsc-off', !settings.enabled));
  }

  // Walk light DOM + open shadow roots (covers most custom players)
  function findAllVideos(root = document, out = []) {
    root.querySelectorAll('video').forEach((v) => out.push(v));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) findAllVideos(el.shadowRoot, out);
    });
    return out;
  }

  function applyToVideo(video) {
    if (!settings.enabled) return;
    if (Math.abs(video.playbackRate - settings.speed) > 0.001) {
      video.playbackRate = settings.speed;
    }
    attachBadge(video);
  }

  function applyAll() {
    findAllVideos().forEach(applyToVideo);
  }

  // Some players (Netflix in particular) reset playbackRate on internal
  // events. Re-assert our chosen rate whenever the browser reports a change.
  document.addEventListener(
    'ratechange',
    (e) => {
      const v = e.target;
      if (v.tagName === 'VIDEO' && settings.enabled && Math.abs(v.playbackRate - settings.speed) > 0.001) {
        v.playbackRate = settings.speed;
      }
    },
    true
  );

  document.addEventListener('play', (e) => { if (e.target.tagName === 'VIDEO') applyToVideo(e.target); }, true);
  document.addEventListener('loadedmetadata', (e) => { if (e.target.tagName === 'VIDEO') applyToVideo(e.target); }, true);

  // Catch videos injected after page load (YouTube/Netflix/Prime all do this)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') applyToVideo(node);
        else if (node.querySelectorAll) node.querySelectorAll('video').forEach(applyToVideo);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Safety net for players that swap sources without firing the above events
  setInterval(applyAll, 1500);

  // --- floating overlay badge ---
  function attachBadge(video) {
    if (badges.has(video)) { positionBadge(video); return; }
    const badge = document.createElement('div');
    badge.className = 'vsc-badge' + (settings.enabled ? '' : ' vsc-off');
    badge.innerHTML = `
      <button class="vsc-btn vsc-minus" title="Slower">-</button>
      <span class="vsc-speed">${settings.speed.toFixed(2)}x</span>
      <button class="vsc-btn vsc-plus" title="Faster">+</button>
      <button class="vsc-btn vsc-reset" title="Reset">R</button>
    `;
    document.documentElement.appendChild(badge);
    badges.set(video, badge);

    badge.querySelector('.vsc-minus').addEventListener('click', (e) => { e.stopPropagation(); setSpeed(settings.speed - 0.1); });
    badge.querySelector('.vsc-plus').addEventListener('click', (e) => { e.stopPropagation(); setSpeed(settings.speed + 0.1); });
    badge.querySelector('.vsc-reset').addEventListener('click', (e) => { e.stopPropagation(); setSpeed(1.0); });

    makeDraggable(badge);
    positionBadge(video);

    const reposition = () => positionBadge(video);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    video.addEventListener('emptied', () => { badge.remove(); badges.delete(video); });
  }

  function positionBadge(video) {
    const badge = badges.get(video);
    if (!badge || badge.dataset.dragged) return; // respect manual placement
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { badge.style.display = 'none'; return; }
    badge.style.display = 'flex';
    badge.style.top = `${Math.max(0, rect.top + 8)}px`;
    badge.style.left = `${Math.max(0, rect.left + 8)}px`;
  }

  function updateBadgeText(video) {
    const badge = badges.get(video);
    if (!badge) return;
    badge.querySelector('.vsc-speed').textContent = settings.speed.toFixed(2) + 'x';
    badge.classList.toggle('vsc-off', !settings.enabled);
  }

  function makeDraggable(el) {
    let sx, sy, ox, oy, dragging = false;
    el.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('vsc-btn')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      el.dataset.dragged = '1';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = `${ox + (e.clientX - sx)}px`;
      el.style.top = `${oy + (e.clientY - sy)}px`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  // --- keyboard shortcuts (ignored while typing) ---
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (!settings.enabled) return;
      if (e.altKey && e.code === 'KeyD') setSpeed(settings.speed + 0.1);
      if (e.altKey && e.code === 'KeyS') setSpeed(settings.speed - 0.1);
      if (e.altKey && e.code === 'KeyR') setSpeed(1.0);
    },
    true
  );

  // messages from the popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_STATE') sendResponse({ ...settings });
    if (msg.type === 'SET_SPEED') setSpeed(msg.value);
    if (msg.type === 'SET_ENABLED') toggleEnabled(msg.value);
  });
})();
