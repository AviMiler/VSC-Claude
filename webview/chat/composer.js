// Composer: the input box, pasted images, the `/` menu and the footer (mode, model, thinking, send/stop).

const MODE_LABELS = {
  default: 'ידני',
  acceptEdits: 'עריכה אוטומטית',
  plan: 'תכנון',
  bypassPermissions: 'ללא הרשאות',
};

/**
 * @param {HTMLElement} root
 * @param {{post: (msg: object) => void, settings: () => any, onSend: () => void}} host
 */
export function createComposer(root, host) {
  root.innerHTML = `
    <div class="no-folder" hidden>לא נפתחה תיקייה – Claude עובד בתיקיית הבית</div>
    <div class="slash-menu" hidden role="listbox"></div>
    <div class="attachments"></div>
    <textarea class="input" rows="1" dir="auto" placeholder="מה לעשות?" aria-label="הודעה ל-Claude"></textarea>
    <div class="footer">
      <select class="mode" aria-label="מצב הרשאות"></select>
      <select class="model" aria-label="מודל"></select>
      <input class="model-text" aria-label="מודל" placeholder="מודל" dir="ltr" hidden>
      <label class="thinking"><input type="checkbox" class="thinking-box" checked> חשיבה</label>
      <span class="spacer"></span>
      <button type="button" class="stop secondary" hidden>עצירה</button>
      <button type="button" class="send primary">שליחה</button>
    </div>`;
  const q = (s) => /** @type {any} */ (root.querySelector(s));
  const input = /** @type {HTMLTextAreaElement} */ (q('.input'));
  const mode = /** @type {HTMLSelectElement} */ (q('.mode'));
  const model = /** @type {HTMLSelectElement} */ (q('.model'));
  const modelText = /** @type {HTMLInputElement} */ (q('.model-text'));
  const thinking = /** @type {HTMLInputElement} */ (q('.thinking-box'));
  const menu = /** @type {HTMLElement} */ (q('.slash-menu'));
  const attachmentsEl = /** @type {HTMLElement} */ (q('.attachments'));
  /** @type {{mediaType: string, data: string}[]} */
  let attachments = [];
  /** @type {{name: string, description: string, argumentHint: string}[]} */
  let commands = [];
  let menuItems = [];
  let menuIndex = 0;

  function send() {
    const text = input.value;
    if (!text.trim() && !attachments.length) return;
    host.post({ type: 'send', text, attachments, mentions: [] });
    input.value = '';
    attachments = [];
    renderAttachments();
    autosize();
    hideMenu();
    host.onSend();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 240) + 'px';
  }

  function renderAttachments() {
    attachmentsEl.innerHTML = '';
    attachments.forEach((a, i) => {
      const chip = document.createElement('div');
      chip.className = 'attachment';
      const img = document.createElement('img');
      img.src = `data:${a.mediaType};base64,${a.data}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '✕';
      remove.title = 'הסרה';
      remove.addEventListener('click', () => {
        attachments.splice(i, 1);
        renderAttachments();
      });
      chip.append(img, remove);
      attachmentsEl.append(chip);
    });
  }

  function updateMenu() {
    const m = input.value.match(/^\/(\S*)$/);
    if (!m || !commands.length) return hideMenu();
    const query = m[1].toLowerCase();
    menuItems = commands.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 30);
    if (!menuItems.length) return hideMenu();
    menuIndex = Math.min(menuIndex, menuItems.length - 1);
    menu.innerHTML = '';
    menuItems.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = i === menuIndex ? 'slash-item active' : 'slash-item';
      row.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'slash-name';
      name.dir = 'ltr';
      name.textContent = `/${c.name}${c.argumentHint ? ' ' + c.argumentHint : ''}`;
      const desc = document.createElement('span');
      desc.className = 'slash-desc';
      desc.textContent = c.description;
      row.append(name, desc);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(i);
      });
      menu.append(row);
    });
    menu.hidden = false;
  }

  function hideMenu() {
    menu.hidden = true;
    menuItems = [];
    menuIndex = 0;
  }

  /** @param {number} i */
  function pick(i) {
    const c = menuItems[i];
    if (!c) return;
    input.value = `/${c.name} `;
    hideMenu();
    input.focus();
    autosize();
  }

  input.addEventListener('input', () => {
    autosize();
    updateMenu();
  });

  input.addEventListener('keydown', (e) => {
    if (!menu.hidden && menuItems.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        menuIndex = (menuIndex + (e.key === 'ArrowDown' ? 1 : menuItems.length - 1)) % menuItems.length;
        updateMenu();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        pick(menuIndex);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideMenu();
        return;
      }
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (host.settings().useCtrlEnterToSend ? ctrl : !e.shiftKey && !ctrl) {
      e.preventDefault();
      send();
    }
  });

  input.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData ? e.clipboardData.items : []);
    const images = items.filter((it) => it.kind === 'file' && /^image\/(png|jpeg|gif|webp)$/.test(it.type));
    if (!images.length) return;
    e.preventDefault();
    for (const it of images) {
      const file = it.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        attachments.push({ mediaType: file.type, data: url.slice(url.indexOf(',') + 1) });
        renderAttachments();
      };
      reader.readAsDataURL(file);
    }
  });

  q('.send').addEventListener('click', send);
  q('.stop').addEventListener('click', () => host.post({ type: 'interrupt' }));
  mode.addEventListener('change', () => host.post({ type: 'setMode', value: mode.value }));
  model.addEventListener('change', () => host.post({ type: 'setModel', value: model.value }));
  modelText.addEventListener('change', () => host.post({ type: 'setModel', value: modelText.value.trim() }));
  thinking.addEventListener('change', () => host.post({ type: 'setThinking', value: thinking.checked }));

  return {
    focus() {
      input.focus();
    },
    /** @param {boolean} running */
    setRunning(running) {
      q('.stop').hidden = !running;
    },
    /**
     * @param {string[]} modes
     * @param {string} current
     */
    setModes(modes, current) {
      mode.innerHTML = '';
      for (const m of modes) {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = MODE_LABELS[m] || m;
        mode.append(o);
      }
      mode.value = modes.includes(current) ? current : 'default';
    },
    /** @param {string} current */
    setMode(current) {
      mode.value = current;
    },
    /**
     * @param {{value: string, label: string, description: string}[]} models
     * @param {string} current
     */
    setModels(models, current) {
      const useSelect = models.length > 0;
      model.hidden = !useSelect;
      modelText.hidden = useSelect;
      if (!useSelect) {
        modelText.value = current || '';
        return;
      }
      model.innerHTML = '';
      const list = models.slice();
      if (current && !list.some((m) => m.value === current)) list.unshift({ value: current, label: current, description: '' });
      for (const m of list) {
        const o = document.createElement('option');
        o.value = m.value;
        o.textContent = m.label;
        o.title = m.description;
        model.append(o);
      }
      model.value = current || list[0].value;
    },
    /** @param {boolean} on */
    setThinking(on) {
      thinking.checked = on;
    },
    /** @param {any[]} list */
    setCommands(list) {
      commands = list || [];
    },
    /** @param {boolean} noFolder */
    setNoFolder(noFolder) {
      q('.no-folder').hidden = !noFolder;
    },
  };
}
