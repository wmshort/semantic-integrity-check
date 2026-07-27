// Thin client for the local FastAPI backend.
//
// The backend runs on :8000 (see docker-compose). API keys are passed in the
// `x-api-key` header directly from the browser to the local proxy — they are
// never sent anywhere else and never stored server-side.

import type {
  EvaluateResponse,
  GenerateResponse,
  ModuleId,
  Provider,
} from './types';

export interface WireMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  'http://localhost:8000';

async function post<T>(
  path: string,
  body: unknown,
  apiKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface GenerateArgs {
  provider: Provider;
  model: string;
  prompt: string;
  systemPrompt?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function generate(args: GenerateArgs): Promise<GenerateResponse> {
  return post<GenerateResponse>(
    '/api/generate',
    {
      provider: args.provider,
      model: args.model,
      prompt: args.prompt,
      system_prompt: args.systemPrompt || null,
      base_url: args.baseUrl || null,
    },
    args.apiKey
  );
}

export interface ChatArgs {
  provider: Provider;
  model: string;
  messages: WireMessage[];
  systemPrompt?: string;
  baseUrl?: string;
  apiKey?: string;
}

// Multi-turn: send the whole conversation history and get the next assistant
// turn. Shares the /api/generate endpoint (messages take precedence over prompt).
export function chat(args: ChatArgs): Promise<GenerateResponse> {
  return post<GenerateResponse>(
    '/api/generate',
    {
      provider: args.provider,
      model: args.model,
      messages: args.messages,
      system_prompt: args.systemPrompt || null,
      base_url: args.baseUrl || null,
    },
    args.apiKey
  );
}

export async function extractFile(file: File): Promise<string> {
  // PDF/DOCX are parsed by the local backend (pypdf / python-docx); the bytes go
  // straight to the local proxy and are never persisted.
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/extract`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let detail = `Could not read ${file.name}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export interface EvaluateArgs {
  referenceText: string;
  responseText: string;
  activeModules: ModuleId[];
  comparisonText?: string;
  useAgent: boolean;
  provider?: Provider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function evaluate(args: EvaluateArgs): Promise<EvaluateResponse> {
  return post<EvaluateResponse>(
    '/api/evaluate',
    {
      reference_text: args.referenceText,
      response_text: args.responseText,
      active_modules: args.activeModules,
      comparison_text: args.comparisonText || null,
      use_agent: args.useAgent,
      provider: args.provider || null,
      model: args.model || null,
      base_url: args.baseUrl || null,
    },
    args.apiKey
  );
}
