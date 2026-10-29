// Event translator: turns CLI stream-json messages into the thread ops the chat webview renders.

/**
 * Thread ops (host → webview `event`, also kept by the host to rebuild a recreated webview):
 * - {op:'user', id, text, images, at}
 * - {op:'text', id, append?, set?}         Claude's text block (created on first use)
 * - {op:'thinking', id, append?, set?}
 * - {op:'tool', id, name, input?}          tool row (input arrives with the complete assistant message)
 * - {op:'toolResult', id, content, isError}
 * - {op:'result', durationMs, inputTokens, outputTokens, costUsd, isError, error?, at}
 * - {op:'notice', text, level: 'info'|'error'}
 * @typedef {{op: string, [key: string]: any}} ThreadOp
 */

const MAX_TOOL_RESULT = 20000;

class EventTranslator {
  constructor() {
    /** Message ids whose blocks arrived as stream events (their complete text is not re-sent). */
    this.streamed = new Set();
    /** `${messageId}:${index}` → block id, for deltas */
    this.blocks = new Map();
    this.currentMessageId = '';
  }

  /**
   * @param {any} msg — one stdout message (not a control message)
   * @returns {{ops: ThreadOp[], session?: {sessionId?: string, model?: string, permissionMode?: string, slashCommands?: string[]}, status?: string, turnEnded?: boolean}}
   */
  translate(msg) {
    switch (msg.type) {
      case 'stream_event':
        return { ops: this.streamEvent(msg.event || {}) };
      case 'assistant':
        return { ops: this.assistant(msg.message || {}) };
      case 'user':
        return { ops: this.user(msg) };
      case 'result':
        return { ops: [resultOp(msg)], turnEnded: true };
      case 'system':
        if (msg.subtype === 'init') {
          return {
            ops: [],
            session: { sessionId: msg.session_id, model: msg.model, permissionMode: msg.permissionMode, slashCommands: msg.slash_commands },
          };
        }
        if (msg.subtype === 'status') return { ops: [], status: msg.status || '' };
        return { ops: [] };
      default:
        return { ops: [] };
    }
  }

  /** @param {any} ev */
  streamEvent(ev) {
    if (ev.type === 'message_start') {
      this.currentMessageId = (ev.message && ev.message.id) || `m${Date.now()}`;
      this.streamed.add(this.currentMessageId);
      return [];
    }
    const key = `${this.currentMessageId}:${ev.index}`;
    if (ev.type === 'content_block_start') {
      const block = ev.content_block || {};
      if (block.type === 'text') {
        this.blocks.set(key, { id: key, kind: 'text' });
        return block.text ? [{ op: 'text', id: key, append: block.text }] : [];
      }
      if (block.type === 'thinking') {
        this.blocks.set(key, { id: key, kind: 'thinking' });
        return [{ op: 'thinking', id: key, append: block.thinking || '' }];
      }
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        this.blocks.set(key, { id: block.id, kind: 'tool' });
        return [{ op: 'tool', id: block.id, name: block.name }];
      }
      return [];
    }
    if (ev.type === 'content_block_delta') {
      const block = this.blocks.get(key);
      const delta = ev.delta || {};
      if (!block) return [];
      if (delta.type === 'text_delta' && block.kind === 'text') return [{ op: 'text', id: block.id, append: delta.text || '' }];
      if (delta.type === 'thinking_delta' && block.kind === 'thinking') return [{ op: 'thinking', id: block.id, append: delta.thinking || '' }];
      return [];
    }
    return [];
  }

  /** @param {any} message */
  assistant(message) {
    const ops = [];
    const streamed = this.streamed.has(message.id);
    const content = Array.isArray(message.content) ? message.content : [];
    content.forEach((block, i) => {
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        ops.push({ op: 'tool', id: block.id, name: block.name, input: block.input || {} });
      } else if (!streamed && block.type === 'text') {
        ops.push({ op: 'text', id: `${message.id}:a${i}`, set: block.text || '' });
      } else if (!streamed && block.type === 'thinking') {
        ops.push({ op: 'thinking', id: `${message.id}:a${i}`, set: block.thinking || '' });
      }
    });
    return ops;
  }

  /** @param {any} msg */
  user(msg) {
    const content = msg.message && msg.message.content;
    if (typeof content === 'string') {
      const out = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
      return out ? [{ op: 'notice', text: out[1].trim(), level: 'info' }] : [];
    }
    if (!Array.isArray(content)) return [];
    return content
      .filter((b) => b.type === 'tool_result')
      .map((b) => ({ op: 'toolResult', id: b.tool_use_id, content: toolResultText(b.content), isError: !!b.is_error }));
  }
}

/**
 * @param {any} content
 * @returns {string}
 */
function toolResultText(content) {
  let text;
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[תמונה]' : '')).join('\n');
  else text = '';
  return text.length > MAX_TOOL_RESULT ? text.slice(0, MAX_TOOL_RESULT) + '\n…' : text;
}

/** @param {any} msg */
function resultOp(msg) {
  const u = msg.usage || {};
  return {
    op: 'result',
    durationMs: msg.duration_ms || 0,
    inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    costUsd: msg.total_cost_usd || 0,
    isError: !!msg.is_error,
    error: msg.is_error ? String(msg.result || (msg.errors || []).join('\n') || msg.subtype || '') : undefined,
    at: Date.now(),
  };
}

module.exports = { EventTranslator, toolResultText };
