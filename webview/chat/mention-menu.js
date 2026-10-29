/**
 * The composer's `@` menu: asks the host (`mentionQuery`) and shows files, folders and terminals
 * (`mentionResults`); picking one replaces the typed `@query` with the reference.
 */
import { el } from './thread.js';

const QUERY_DELAY_MS = 120;
const ICONS = { file: '📄', folder: '📁', terminal: '⌨' };

/**
 * @param {ReturnType<import('./composer.js').createComposer>} composer
 * @param {(message:object)=>void} post
 * @returns {{showResults:(message:{query:string, items:object[]})=>void}}
 */
export function createMentionMenu(composer, post) {
  const input = composer.input;
  let results = { query: null, items: [] };
  let timer = null;

  /** @returns {{query:string, start:number}|null} the `@word` that ends at the caret */
  const activeMention = () => {
    const before = input.value.slice(0, input.selectionStart);
    const match = before.match(/(^|\s)@([^\s@]*)$/);
    return match ? { query: match[2], start: before.length - match[2].length - 1 } : null;
  };

  const pick = (item, mention) => {
    const after = input.value.slice(input.selectionStart);
    const suffix = item.kind === 'folder' ? '' : ' ';
    input.value = `${input.value.slice(0, mention.start)}${item.insert}${suffix}${after}`;
    const caret = mention.start + item.insert.length + suffix.length;
    input.setSelectionRange(caret, caret);
    composer.closeMenu();
    input.focus();
    if (item.kind === 'folder') composer.refreshMenu();
  };

  composer.setExtraMenu({
    items() {
      const mention = activeMention();
      if (!mention) return [];
      if (mention.query !== results.query) {
        clearTimeout(timer);
        timer = setTimeout(() => post({ type: 'mentionQuery', query: mention.query }), QUERY_DELAY_MS);
        return [];
      }
      return results.items.map(item => ({
        render: () => {
          const row = el('div');
          row.append(el('span', 'menu-icon', ICONS[item.kind] || ''));
          const label = el('span', 'menu-name', item.label);
          label.dir = 'ltr';
          row.append(label);
          if (item.detail) row.append(el('span', 'menu-description', item.detail));
          return row;
        },
        pick: () => pick(item, mention),
      }));
    },
  });

  return {
    showResults(message) {
      const mention = activeMention();
      if (!mention || mention.query !== message.query) return; // an older answer
      results = { query: message.query, items: message.items || [] };
      composer.refreshMenu();
    },
  };
}
