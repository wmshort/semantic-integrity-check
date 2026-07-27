// Parse a pasted or imported chat transcript into turns, then isolate the
// assistant's contribution — the text an audit should actually judge.
//
// Two input shapes are handled:
//   1. JSON — an array of { role, content } messages, or an object with a
//      `messages` array (the common OpenAI/Anthropic-style export).
//   2. Plain text — lines prefixed with a speaker label ("Assistant:", "User:",
//      "AI:", "Human:", …).
//
// If neither shape yields assistant turns, the whole transcript is audited as a
// fallback, so nothing is silently dropped.

import type { ChatMessage } from './types';

export type Role = 'user' | 'assistant' | 'system' | 'other';

export interface Turn {
  role: Role;
  content: string;
}

// 'gpt' covers the ShareGPT dataset convention ({ from: 'gpt', value: … }).
const ASSISTANT_LABELS = ['assistant', 'ai', 'bot', 'model', 'chatbot', 'gpt'];
const USER_LABELS = ['user', 'human', 'you'];
const SYSTEM_LABELS = ['system', 'developer'];

function normaliseRole(raw: string): Role {
  const r = raw.trim().toLowerCase();
  if (ASSISTANT_LABELS.includes(r)) return 'assistant';
  if (USER_LABELS.includes(r)) return 'user';
  if (SYSTEM_LABELS.includes(r)) return 'system';
  return 'other';
}

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  // Anthropic/OpenAI content can be an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
          if (typeof p.content === 'string') return p.content;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function parseJson(raw: string): Turn[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  let messages: unknown;
  if (Array.isArray(data)) {
    messages = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // OpenAI/Anthropic-style `messages`, or ShareGPT-style `conversations`.
    messages = obj.messages ?? obj.conversations ?? obj.turns;
  }
  if (!Array.isArray(messages)) return null;

  const turns: Turn[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const obj = m as Record<string, unknown>;
    // role: OpenAI `role`, ShareGPT `from`, or generic `author`.
    const role = normaliseRole(String(obj.role ?? obj.from ?? obj.author ?? 'other'));
    // content: OpenAI `content`, ShareGPT `value`, or generic `text`.
    const content = contentToString(obj.content ?? obj.value ?? obj.text ?? '').trim();
    if (content) turns.push({ role, content });
  }
  return turns.length ? turns : null;
}

const LABEL_RE =
  /^\s*(assistant|ai|bot|model|chatbot|gpt|user|human|you|system|developer)\s*[:\-–]\s*/i;

function parseLabelled(raw: string): Turn[] | null {
  const lines = raw.split(/\r?\n/);
  const turns: Turn[] = [];
  let current: Turn | null = null;
  let sawLabel = false;

  for (const line of lines) {
    const match = line.match(LABEL_RE);
    if (match) {
      sawLabel = true;
      if (current) turns.push(current);
      current = {
        role: normaliseRole(match[1]),
        content: line.slice(match[0].length),
      };
    } else if (current) {
      current.content += '\n' + line;
    }
  }
  if (current) turns.push(current);
  if (!sawLabel) return null;

  return turns
    .map((t) => ({ ...t, content: t.content.trim() }))
    .filter((t) => t.content.length > 0);
}

export function parseConversation(raw: string): Turn[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return parseJson(trimmed) ?? parseLabelled(trimmed) ?? [{ role: 'other', content: trimmed }];
}

// ---------------------------------------------------------------------------
// Validation — is this a recognised transcript format?
// ---------------------------------------------------------------------------
export type ConversationFormat =
  | 'openai'
  | 'sharegpt'
  | 'labelled'
  | 'empty'
  | 'invalid';

export interface ConversationValidation {
  ok: boolean;
  format: ConversationFormat;
  label: string;
  turns: Turn[];
  assistantTurns: number;
  errors: string[];
}

const FORMAT_LABEL: Record<ConversationFormat, string> = {
  openai: 'OpenAI messages',
  sharegpt: 'ShareGPT',
  labelled: 'Labelled transcript',
  empty: 'Empty',
  invalid: 'Unrecognised',
};

function summarise(format: ConversationFormat, turns: Turn[], errors: string[]): ConversationValidation {
  return {
    ok: errors.length === 0 && (format === 'openai' || format === 'sharegpt' || format === 'labelled'),
    format,
    label: FORMAT_LABEL[format],
    turns,
    assistantTurns: turns.filter((t) => t.role === 'assistant').length,
    errors,
  };
}

/** Validate a pasted/imported conversation against the OpenAI `messages` and
 *  ShareGPT `conversations` schemas (labelled text is accepted as a fallback). */
export function validateConversation(raw: string): ConversationValidation {
  const trimmed = raw.trim();
  if (!trimmed) return summarise('empty', [], ['Nothing to validate yet.']);

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      return summarise('invalid', [], [
        'Invalid JSON: ' + (e instanceof Error ? e.message : 'could not parse'),
      ]);
    }
    const obj =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const messages = Array.isArray(data)
      ? (data as unknown[])
      : obj && Array.isArray(obj.messages)
        ? (obj.messages as unknown[])
        : null;
    const conversations = obj && Array.isArray(obj.conversations)
      ? (obj.conversations as unknown[])
      : null;

    if (messages) {
      const errors: string[] = [];
      if (messages.length === 0) errors.push('The messages array is empty.');
      messages.forEach((m, i) => {
        if (!m || typeof m !== 'object') return errors.push(`message ${i + 1} is not an object`);
        const mm = m as Record<string, unknown>;
        if (typeof mm.role !== 'string') errors.push(`message ${i + 1} has no string "role"`);
        if (mm.content === undefined && mm.text === undefined)
          errors.push(`message ${i + 1} has no "content"`);
      });
      return summarise('openai', parseConversation(trimmed), errors.slice(0, 5));
    }
    if (conversations) {
      const errors: string[] = [];
      if (conversations.length === 0) errors.push('The conversations array is empty.');
      conversations.forEach((m, i) => {
        if (!m || typeof m !== 'object') return errors.push(`turn ${i + 1} is not an object`);
        const mm = m as Record<string, unknown>;
        if (typeof mm.from !== 'string') errors.push(`turn ${i + 1} has no string "from"`);
        if (typeof mm.value !== 'string') errors.push(`turn ${i + 1} has no string "value"`);
      });
      return summarise('sharegpt', parseConversation(trimmed), errors.slice(0, 5));
    }
    return summarise('invalid', [], [
      'JSON is neither an OpenAI `messages` array nor a ShareGPT `conversations` array.',
    ]);
  }

  // Non-JSON: accept labelled "User:/Assistant:" text.
  const turns = parseConversation(trimmed);
  if (turns.some((t) => t.role !== 'other')) {
    return summarise('labelled', turns, []);
  }
  return summarise('invalid', turns, [
    'Not recognised — expected OpenAI `messages` JSON, ShareGPT JSON, or labelled ' +
      '"User:/Assistant:" text.',
  ]);
}

// ---------------------------------------------------------------------------
// Message-list helpers (live chat + import share one representation)
// ---------------------------------------------------------------------------
let _seq = 0;

export function messageId(): string {
  _seq += 1;
  return `m${Date.now().toString(36)}-${_seq}`;
}

/** Convert a parsed/imported transcript into identified chat messages. */
export function importToMessages(raw: string): ChatMessage[] {
  return parseConversation(raw).map((t) => ({
    id: messageId(),
    role: t.role,
    content: t.content,
  }));
}

export interface MessagesAudit {
  assistantTurns: number;
  /** The text an audit should judge: assistant turns joined, or the whole
   *  conversation when no assistant turns could be identified. */
  auditedOutput: string;
  /** True when we fell back to auditing every turn (no assistant labels). */
  usedFallback: boolean;
}

export function auditMessages(messages: ChatMessage[]): MessagesAudit {
  const assistant = messages.filter((m) => m.role === 'assistant');
  if (assistant.length > 0) {
    return {
      assistantTurns: assistant.length,
      auditedOutput: assistant.map((m) => m.content).join('\n\n'),
      usedFallback: false,
    };
  }
  const all = messages
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  return { assistantTurns: 0, auditedOutput: all, usedFallback: messages.length > 0 };
}
