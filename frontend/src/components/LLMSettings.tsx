import { useState } from 'react';
import { Eye, EyeOff, Server, Trash2 } from 'lucide-react';
import { useLLM } from '../context/LLMContext';
import type { Provider } from '../lib/types';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'ollama', label: 'Ollama (local)' },
];

export function LLMSettings() {
  const {
    provider,
    model,
    anthropic_key,
    openai_key,
    gemini_key,
    ollama_base_url,
    setProvider,
    setModel,
    setCredential,
    clearAll,
  } = useLLM();
  const [reveal, setReveal] = useState(false);

  const keyField: Record<
    Provider,
    { value: string; field: 'anthropic_key' | 'openai_key' | 'gemini_key'; placeholder: string } | null
  > = {
    anthropic: { value: anthropic_key, field: 'anthropic_key', placeholder: 'sk-ant-...' },
    openai: { value: openai_key, field: 'openai_key', placeholder: 'sk-...' },
    gemini: { value: gemini_key, field: 'gemini_key', placeholder: 'AIza...' },
    ollama: null,
  };
  const activeField = keyField[provider];

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-raised p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Server size={15} className="mt-0.5 text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Target model</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              The model you generate or chat with, and the agentic adjudicator.
            </p>
          </div>
        </div>
        <button
          onClick={clearAll}
          className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500 hover:text-red-400"
          title="Clear all stored keys from this browser"
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={
              'rounded-lg border px-3 py-2 text-sm transition ' +
              (provider === p.id
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                : 'border-surface-border bg-surface text-gray-400 hover:border-gray-600')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs text-gray-400">Model</label>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="mb-3 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60"
      />

      {activeField ? (
        <>
          <label className="mb-1 block text-xs text-gray-400">API Key</label>
          <div className="relative">
            <input
              type={reveal ? 'text' : 'password'}
              value={activeField.value}
              placeholder={activeField.placeholder}
              onChange={(e) => setCredential(activeField.field, e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 pr-10 text-sm text-gray-200 outline-none focus:border-emerald-500/60"
            />
            <button
              onClick={() => setReveal((r) => !r)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              type="button"
              aria-label={reveal ? 'Hide key' : 'Show key'}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="mb-1 block text-xs text-gray-400">Base URL</label>
          <input
            value={ollama_base_url}
            onChange={(e) => setCredential('ollama_base_url', e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Runs fully offline against your local Ollama server. No key required.
          </p>
        </>
      )}
    </section>
  );
}
