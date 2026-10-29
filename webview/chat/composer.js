/**
 * The composer: the input box (Enter / Ctrl+Enter), pasted images, the `/` menu, the mode and model pickers, the
 * thinking switch, the context chip and the send / stop buttons.
 */
import { el } from './thread.js';

const MAX_MENU_ITEMS = 50;

/**
 * @param {HTMLElement} root the composer container (markup in index.html)
 * @param {{send:(payload:{text:string, attachments:object[]})=>void, interrupt:()=>void,
 *   setMode:(v:string)=>void, setModel:(v:string)=>void, setThinking:(v:boolean)=>void,
 *   clearContext:()=>void}} actions
 */
export function createComposer(root, actions) {
  const input = root.querySelector('#input');
  const sendButton = root.querySelector('#send');
  const stopButton = root.querySelector('#stop');
  const modeSelect = root.querySelector('#mode');
  const modelInput = root.querySelector('#model');
  const modelList = root.querySelector('#models');
  const thinking = root.querySelector('#thinking');
  const contextChip = root.querySelector('#context-chip');
  const attachmentsBox = root.querySelector('#attachments');
  const menu = root.querySelector('#slash-menu');
  const noFolder = root.querySelector('#no-folder');

  let settings = {};
  let commands = [];
  let attachments = []; // {mediaType, data, name}
  let menuItems = [];
  let menuIndex = 0;
  /** @type {null|{items:()=>object[], pick:(item:object)=>void, render:(item:object)=>HTMLElement}} */
  let extraMenu = null; // the @-mention menu (editor context) plugs in here

  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  };

  function submit() {
    const text = input.value;
    if (!text.trim() && !attachments.length) return;
    actions.send({ text, attachments: attachments.map(({ mediaType, data }) => ({ mediaType, data })) });
    input.value = '';
    attachments = [];
    renderAttachments();
    closeMenu();
    autoGrow();
  }

  // ---- `/` menu (and the plug-in @ menu) ----

  function slashItems() {
    const match = input.value.slice(0, input.selectionStart).match(/^\/(\S*)$/);
    if (!match) return null;
    const query = match[1].toLowerCase();
    return commands.filter(command => command.name.toLowerCase().includes(query)).slice(0, MAX_MENU_ITEMS);
  }

  function renderMenu() {
    menu.replaceChildren();
    menuItems.forEach((item, index) => {
      const row = item.render();
      row.classList.add('menu-item');
      row.classList.toggle('active', index === menuIndex);
      row.setAttribute('role', 'option');
      row.addEventListener('mousedown', event => {
        event.preventDefault();
        item.pick();
      });
      menu.append(row);
    });
    menu.hidden = !menuItems.length;
    const active = menu.children[menuIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function updateMenu() {
    const slash = slashItems();
    if (slash) {
      menuItems = slash.map(command => ({
        render: () => {
          const row = el('div');
          const name = el('span', 'menu-name', `/${command.name}`);
          name.dir = 'ltr';
          row.append(name);
          if (command.argumentHint) row.append(el('span', 'menu-hint', command.argumentHint));
          if (command.description) row.append(el('span', 'menu-description', command.description));
          return row;
        },
        pick: () => {
          input.value = `/${command.name} ${input.value.slice(input.selectionStart)}`;
          const caret = command.name.length + 2;
          input.setSelectionRange(caret, caret);
          closeMenu();
          input.focus();
        },
      }));
    } else {
      menuItems = extraMenu ? extraMenu.items() : [];
    }
    menuIndex = Math.min(menuIndex, Math.max(0, menuItems.length - 1));
    renderMenu();
  }

  function closeMenu() {
    menuItems = [];
    menuIndex = 0;
    menu.hidden = true;
  }

  // ---- images ----

  function renderAttachments() {
    attachmentsBox.replaceChildren(...attachments.map((attachment, index) => {
      const chip = el('span', 'chip');
      const image = el('img');
      image.src = `data:${attachment.mediaType};base64,${attachment.data}`;
      image.alt = attachment.name;
      const remove = el('button', 'chip-remove', '✕');
      remove.type = 'button';
      remove.title = 'הסרה';
      remove.addEventListener('click', () => { attachments.splice(index, 1); renderAttachments(); });
      chip.append(image, remove);
      return chip;
    }));
    attachmentsBox.hidden = !attachments.length;
  }

  input.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const [, data] = String(reader.result).split(',');
        attachments.push({ mediaType: file.type, data, name: file.name || 'image' });
        renderAttachments();
      };
      reader.readAsDataURL(file);
    }
  });

  // ---- keys ----

  input.addEventListener('keydown', event => {
    if (!menu.hidden && menuItems.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        menuIndex = (menuIndex + (event.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length;
        renderMenu();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        menuItems[menuIndex].pick();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    const sendKey = settings.useCtrlEnterToSend ? (event.ctrlKey || event.metaKey) : !(event.shiftKey || event.ctrlKey || event.metaKey);
    if (sendKey) {
      event.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', () => { autoGrow(); updateMenu(); });
  input.addEventListener('click', updateMenu);
  input.addEventListener('blur', () => setTimeout(closeMenu, 150));

  sendButton.addEventListener('click', submit);
  stopButton.addEventListener('click', () => actions.interrupt());
  modeSelect.addEventListener('change', () => actions.setMode(modeSelect.value));
  modelInput.addEventListener('change', () => actions.setModel(modelInput.value.trim()));
  thinking.addEventListener('change', () => actions.setThinking(thinking.checked));
  contextChip.addEventListener('click', () => actions.clearContext());

  return {
    /** @param {object} value */
    setSettings(value) {
      settings = value || {};
      input.placeholder = settings.useCtrlEnterToSend
        ? 'שאלו את Claude…  (Ctrl+Enter לשליחה, / לפקודות)'
        : 'שאלו את Claude…  (Enter לשליחה, Shift+Enter לשורה חדשה, / לפקודות)';
    },
    /** @param {{value:string, label:string}[]} modes @param {string} current */
    setModes(modes, current) {
      modeSelect.replaceChildren(...modes.map(mode => {
        const option = el('option', '', mode.label);
        option.value = mode.value;
        return option;
      }));
      modeSelect.value = current;
    },
    /** @param {{value:string, label:string}[]} models */
    setModels(models) {
      modelList.replaceChildren(...models.map(model => {
        const option = el('option', '', model.label);
        option.value = model.value;
        return option;
      }));
    },
    /** @param {{name:string, description:string, argumentHint:string}[]} list */
    setCommands(list) {
      commands = list || [];
    },
    /** @param {{mode:string, model:string, thinking:boolean, running:boolean, noFolder:boolean}} session */
    setSession(session) {
      if ([...modeSelect.options].some(option => option.value === session.mode)) modeSelect.value = session.mode;
      if (document.activeElement !== modelInput) modelInput.value = session.model || '';
      thinking.checked = Boolean(session.thinking);
      stopButton.hidden = !session.running;
      noFolder.hidden = !session.noFolder;
    },
    /** @param {string|null} text the chip text ("N שורות נבחרו" / file name), null to hide */
    setContextChip(text) {
      contextChip.textContent = text || '';
      contextChip.hidden = !text;
    },
    /** Inserts text at the caret (Alt+K) and focuses the input. @param {string} text */
    insertText(text) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const before = input.value.slice(0, start);
      const spacer = before && !/\s$/.test(before) ? ' ' : '';
      input.value = `${before}${spacer}${text} ${input.value.slice(end)}`;
      const caret = before.length + spacer.length + text.length + 1;
      input.setSelectionRange(caret, caret);
      autoGrow();
      input.focus();
    },
    focus() {
      input.focus();
    },
    /** Plugs in another inline menu (the @-mention menu). */
    setExtraMenu(provider) {
      extraMenu = provider;
    },
    refreshMenu: updateMenu,
    closeMenu,
    input,
  };
}
