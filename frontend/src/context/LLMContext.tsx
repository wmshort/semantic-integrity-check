import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Provider } from '../lib/types';

// All credentials live exclusively in the browser's localStorage. They are read
// on init, written back on change, and handed to the local backend proxy only at
// request time. Nothing is transmitted to any database or third-party endpoint.

interface Credentials {
  anthropic_key: string;
  openai_key: string;
  gemini_key: string;
  ollama_base_url: string;
}

interface LLMState extends Credentials {
  provider: Provider;
  model: string;
}

interface LLMContextValue extends LLMState {
  setProvider: (p: Provider) => void;
  setModel: (m: string) => void;
  setCredential: (key: keyof Credentials, value: string) => void;
  activeKey: () => string | undefined;
  clearAll: () => void;
}

const STORAGE_KEY = 'sic.llm.settings.v1';

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  ollama: 'llama3.1',
};

const DEFAULT_STATE: LLMState = {
  provider: 'anthropic',
  model: DEFAULT_MODELS.anthropic,
  anthropic_key: '',
  openai_key: '',
  gemini_key: '',
  ollama_base_url: 'http://localhost:11434',
};

function loadState(): LLMState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<LLMState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

const LLMContext = createContext<LLMContextValue | null>(null);

export function LLMProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LLMState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — keep operating in-memory */
    }
  }, [state]);

  const setProvider = useCallback((provider: Provider) => {
    setState((s) => ({ ...s, provider, model: DEFAULT_MODELS[provider] }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState((s) => ({ ...s, model }));
  }, []);

  const setCredential = useCallback(
    (key: keyof Credentials, value: string) => {
      setState((s) => ({ ...s, [key]: value }));
    },
    []
  );

  const clearAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(DEFAULT_STATE);
  }, []);

  const activeKey = useCallback((): string | undefined => {
    switch (state.provider) {
      case 'anthropic':
        return state.anthropic_key || undefined;
      case 'openai':
        return state.openai_key || undefined;
      case 'gemini':
        return state.gemini_key || undefined;
      case 'ollama':
        return undefined; // local; no key required
    }
  }, [state]);

  const value = useMemo<LLMContextValue>(
    () => ({
      ...state,
      setProvider,
      setModel,
      setCredential,
      activeKey,
      clearAll,
    }),
    [state, setProvider, setModel, setCredential, activeKey, clearAll]
  );

  return <LLMContext.Provider value={value}>{children}</LLMContext.Provider>;
}

export function useLLM(): LLMContextValue {
  const ctx = useContext(LLMContext);
  if (!ctx) throw new Error('useLLM must be used within an LLMProvider');
  return ctx;
}
