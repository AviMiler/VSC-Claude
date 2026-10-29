/**
 * Converts CLI stream-json events into the UI events the chat webview draws (`event` messages).
 * Why isolated: the CLI event format is the part most likely to change between versions.
 * Plain Node (no `vscode`).
 */
const MAX_RESULT_CHARS = 20000;

/**
 * @typedef {{kind:string, [key:string]:any}} UiEvent
 * kinds: text-delta, thinking-delta, text, thinking, tool, tool-result, result, notice, init
 */

function stringifyContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(block => (block.type === 'image' ? '[תמונה]' : block.text ?? '')).join('\n');
  return JSON.stringify(content ?? '');
}

const truncate = text => (text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (קוצר)` : text);

function translateAssistant(event) {
  const parent = event.parent_tool_use_id || null;
  const items = [];
  for (const block of event.message?.content ?? []) {
    if (block.type === 'text' && block.text.trim()) items.push({ kind: 'text', text: block.text, parent });
    if (block.type === 'thinking' && block.thinking?.trim()) items.push({ kind: 'thinking', text: block.thinking, parent });
    if (block.type === 'tool_use') items.push({ kind: 'tool', id: block.id, name: block.name, input: block.input || {}, parent });
  }
  return items;
}

function translateUser(event) {
  const content = event.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(block => block.type === 'tool_result').map(block => ({
    kind: 'tool-result', toolUseId: block.tool_use_id, parent: event.parent_tool_use_id || null,
    text: truncate(stringifyContent(block.content)), isError: Boolean(block.is_error),
  }));
}

function translateResult(event) {
  const isError = Boolean(event.is_error) || (event.subtype && event.subtype !== 'success');
  return [{
    kind: 'result', isError, subtype: event.subtype || 'success',
    text: isError ? String(event.result ?? (event.errors || []).join('\n') ?? '') : '',
    durationMs: event.duration_ms ?? 0,
    tokens: event.usage ? (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0) : null,
  }];
}

function translateSystem(event) {
  if (event.subtype === 'init') {
    return [{ kind: 'init', model: event.model, permissionMode: event.permissionMode, slashCommands: event.slash_commands || [] }];
  }
  if (event.subtype === 'compact_boundary') return [{ kind: 'notice', text: 'השיחה נדחסה (compact)' }];
  if (event.subtype === 'api_retry') {
    return [{ kind: 'notice', text: `ניסיון חוזר מול שרת המודל (${event.attempt ?? '?'}/${event.max_retries ?? '?'})` }];
  }
  return [];
}

/**
 * @param {object} event one parsed stdout line
 * @returns {UiEvent[]}
 * @example translateEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } })
 */
function translateEvent(event) {
  if (event.type === 'assistant') return translateAssistant(event);
  if (event.type === 'user') return event.isReplay ? [] : translateUser(event);
  if (event.type === 'result') return translateResult(event);
  if (event.type === 'system') return translateSystem(event);
  if (event.type === 'stream_event' && !event.parent_tool_use_id) {
    const delta = event.event?.type === 'content_block_delta' ? event.event.delta : null;
    if (delta?.type === 'text_delta') return [{ kind: 'text-delta', text: delta.text }];
    if (delta?.type === 'thinking_delta') return [{ kind: 'thinking-delta', text: delta.thinking }];
  }
  return [];
}

/**
 * @param {object} event
 * @returns {string|null} the CLI session id carried by the event
 */
function sessionIdOf(event) {
  return typeof event.session_id === 'string' && event.session_id ? event.session_id : null;
}

module.exports = { translateEvent, sessionIdOf };
