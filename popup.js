const tabQuery = () => new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, r));

async function sendToTab(msg) {
  const [tab] = await tabQuery();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, msg, () => void chrome.runtime.lastError);
}

async function init() {
  const stored = await new Promise((r) => chrome.storage.sync.get({ enabled: true, speed: 1.0 }, r));
  document.getElementById('enabledToggle').checked = stored.enabled;
  document.getElementById('speedSlider').value = stored.speed;
  document.getElementById('speedLabel').textContent = stored.speed.toFixed(2) + 'x';
}
init();

document.getElementById('enabledToggle').addEventListener('change', (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked });
  sendToTab({ type: 'SET_ENABLED', value: e.target.checked });
});

function bumpLabel(v) {
  const label = document.getElementById('speedLabel');
  label.textContent = v.toFixed(2) + 'x';
  label.classList.remove('bump');
  void label.offsetWidth;
  label.classList.add('bump');
}

document.getElementById('speedSlider').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  bumpLabel(v);
  chrome.storage.sync.set({ speed: v });
  sendToTab({ type: 'SET_SPEED', value: v });
});

document.querySelectorAll('.presets button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = parseFloat(btn.dataset.speed);
    document.getElementById('speedSlider').value = v;
    bumpLabel(v);
    chrome.storage.sync.set({ speed: v });
    sendToTab({ type: 'SET_SPEED', value: v });
  });
});
