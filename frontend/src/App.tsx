import { useCallback, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { AboutModal } from './components/AboutModal';
import { LLMSettings } from './components/LLMSettings';
import { DocumentUploader } from './components/DocumentUploader';
import { OutputStep, type OutputMethod } from './components/OutputStep';
import { ChecksStep } from './components/ChecksStep';
import { AuditVisualizer } from './components/AuditVisualizer';
import { Loader2, Play } from 'lucide-react';
import { useLLM } from './context/LLMContext';
import {
  auditMessages,
  importToMessages,
  messageId,
  validateConversation,
} from './lib/conversation';
import * as api from './lib/api';
import type {
  CapturedScenario,
  ChatMessage,
  EvaluateResponse,
  ModuleId,
  UploadedDoc,
} from './lib/types';

const ALL_MODULES: ModuleId[] = [
  'polarity',
  'scope',
  'quant',
  'deontic',
  'temporal',
  'epistemic',
  'participant',
  'pathos',
  'differential',
];

// Every single-output check is on by default; Differential needs a second
// scenario, so it starts off.
const DEFAULT_MODULES: ModuleId[] = ALL_MODULES.filter((m) => m !== 'differential');

// Roles the provider proxy accepts. Anything else is treated as a user turn.
function toWire(messages: ChatMessage[]): api.WireMessage[] {
  return messages.map((m) => ({
    role:
      m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
    content: m.content,
  }));
}

export default function App() {
  const llm = useLLM();

  const [documents, setDocuments] = useState<UploadedDoc[]>([]);

  // How the output is provided.
  const [method, setMethod] = useState<OutputMethod>('paste');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Per-method content holders — kept separate so switching methods loses nothing.
  const [messages, setMessages] = useState<ChatMessage[]>([]); // generate (live chat)
  const [chatSending, setChatSending] = useState(false);
  const [importedOutputs, setImportedOutputs] = useState<UploadedDoc[]>([]); // import
  const [pasteText, setPasteText] = useState(''); // paste (response or transcript)

  // Differential Context scenarios, captured from whatever the output is now.
  const [scenarioA, setScenarioA] = useState<CapturedScenario | null>(null);
  const [scenarioB, setScenarioB] = useState<CapturedScenario | null>(null);

  // Differential is opt-in: it needs a second scenario output, so it starts off.
  const [activeModules, setActiveModules] = useState<ModuleId[]>(DEFAULT_MODULES);
  const [useAgent, setUseAgent] = useState(false);

  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  // --- Derived inputs -------------------------------------------------------
  const referenceText = useMemo(
    () => documents.map((d) => d.text).join('\n\n'),
    [documents]
  );
  const chatAudit = useMemo(() => auditMessages(messages), [messages]);
  const importText = useMemo(
    () => importedOutputs.map((o) => o.text).join('\n\n'),
    [importedOutputs]
  );

  // Paste ingests whatever it's given — a single response or a whole
  // conversation. Plain prose is audited as-is; a transcript (labelled text, or
  // JSON that validates as OpenAI/ShareGPT) has its assistant turns extracted.
  // Only input that *looks* like JSON but fails to validate is rejected.
  const pasteSummary = useMemo(() => {
    const raw = pasteText.trim();
    if (!raw)
      return { audited: '', note: null as string | null, error: null as string | null, label: 'Pasted response' };
    const turnNote = (n: number) => `auditing ${n} assistant turn${n === 1 ? '' : 's'}`;
    if (raw.startsWith('{') || raw.startsWith('[')) {
      const v = validateConversation(raw);
      if (!v.ok)
        return { audited: '', note: null, error: v.errors[0] ?? 'Unrecognised transcript.', label: 'Pasted transcript' };
      const a = auditMessages(importToMessages(raw));
      return {
        audited: a.auditedOutput,
        note: `${v.label} · ${turnNote(v.assistantTurns)}`,
        error: null,
        label: `Pasted transcript · ${v.assistantTurns} assistant turn${v.assistantTurns === 1 ? '' : 's'}`,
      };
    }
    const a = auditMessages(importToMessages(raw));
    if (a.usedFallback)
      return { audited: a.auditedOutput, note: null, error: null, label: 'Pasted response' };
    return {
      audited: a.auditedOutput,
      note: `Labelled transcript · ${turnNote(a.assistantTurns)}`,
      error: null,
      label: `Pasted transcript · ${a.assistantTurns} assistant turn${a.assistantTurns === 1 ? '' : 's'}`,
    };
  }, [pasteText]);

  // The output the current method/shape yields.
  const currentOutput = useMemo(() => {
    if (method === 'generate') return chatAudit.auditedOutput;
    if (method === 'import') return importText;
    return pasteSummary.audited;
  }, [method, chatAudit, importText, pasteSummary]);

  const currentSourceLabel = useMemo(() => {
    if (method === 'generate')
      return chatAudit.usedFallback
        ? 'Live chat · all turns'
        : `Live chat · ${chatAudit.assistantTurns} assistant turn${chatAudit.assistantTurns === 1 ? '' : 's'}`;
    if (method === 'import')
      return `Imported · ${importedOutputs.length} file${importedOutputs.length === 1 ? '' : 's'}`;
    return pasteSummary.label;
  }, [method, chatAudit, importedOutputs, pasteSummary]);

  const captureSubject =
    method === 'import'
      ? 'these files'
      : method === 'generate'
        ? 'this conversation'
        : 'this output';

  const differentialOn = activeModules.includes('differential');

  // When comparing scenarios, Scenario A is the audited output and B the
  // contrast. Outside differential mode, we audit the current output.
  const auditedOutput =
    differentialOn && scenarioA ? scenarioA.text : currentOutput;
  const comparisonText =
    differentialOn && scenarioB ? scenarioB.text : undefined;

  const currentIsA =
    differentialOn && !!scenarioA && currentOutput.trim() !== '' && scenarioA.text === currentOutput;
  const currentIsB =
    differentialOn && !!scenarioB && currentOutput.trim() !== '' && scenarioB.text === currentOutput;

  const runDisabledReason =
    referenceText.trim().length === 0
      ? 'Add at least one reference document'
      : auditedOutput.trim().length === 0
        ? 'Add an output to audit'
        : activeModules.length === 0
          ? 'Select at least one check'
          : null;
  const canRun = runDisabledReason === null && !evaluating;

  // --- Actions --------------------------------------------------------------
  const captureScenario = useCallback(
    (slot: 'A' | 'B') => {
      if (!currentOutput.trim()) return;
      const snapshot: CapturedScenario = { text: currentOutput, label: currentSourceLabel };
      (slot === 'A' ? setScenarioA : setScenarioB)(snapshot);
    },
    [currentOutput, currentSourceLabel]
  );

  const clearScenario = useCallback((slot: 'A' | 'B') => {
    (slot === 'A' ? setScenarioA : setScenarioB)(null);
  }, []);

  const addDocuments = useCallback((docs: UploadedDoc[]) => {
    setDocuments((prev) => [...prev, ...docs]);
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const addImports = useCallback((items: UploadedDoc[]) => {
    setImportedOutputs((prev) => [...prev, ...items]);
  }, []);

  const removeImport = useCallback((id: string) => {
    setImportedOutputs((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const toggleModule = useCallback((id: ModuleId) => {
    setActiveModules((mods) =>
      mods.includes(id) ? mods.filter((m) => m !== id) : [...mods, id]
    );
  }, []);

  // Generate (live chat): append the user turn, send history, append reply.
  const handleSend = useCallback(
    async (text: string) => {
      setError(null);
      const history = [...messages, { id: messageId(), role: 'user' as const, content: text }];
      setMessages(history);
      setChatSending(true);
      try {
        const res = await api.chat({
          provider: llm.provider,
          model: llm.model,
          messages: toWire(history),
          systemPrompt,
          baseUrl: llm.provider === 'ollama' ? llm.ollama_base_url : undefined,
          apiKey: llm.activeKey(),
        });
        setMessages((h) => [...h, { id: messageId(), role: 'assistant', content: res.text }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The model did not respond.');
      } finally {
        setChatSending(false);
      }
    },
    [messages, llm, systemPrompt]
  );

  const handleClearConversation = useCallback(() => setMessages([]), []);

  const handleRunAudits = useCallback(async () => {
    setError(null);
    setEvaluating(true);
    try {
      const res = await api.evaluate({
        referenceText,
        responseText: auditedOutput,
        activeModules,
        comparisonText,
        useAgent,
        provider: useAgent ? llm.provider : undefined,
        model: useAgent ? llm.model : undefined,
        baseUrl:
          useAgent && llm.provider === 'ollama' ? llm.ollama_base_url : undefined,
        apiKey: useAgent ? llm.activeKey() : undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  }, [referenceText, auditedOutput, comparisonText, activeModules, useAgent, llm]);

  return (
    <div className="min-h-full">
      <Header onAbout={() => setAboutOpen(true)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_1fr]">
          {/* Left column: the audit flow */}
          <div className="flex flex-col gap-4">
            <DocumentUploader
              documents={documents}
              onAdd={addDocuments}
              onRemove={removeDocument}
            />
            {/* Target model is only relevant to Generate; show it there. */}
            {method === 'generate' && <LLMSettings />}
            <OutputStep
              method={method}
              onMethodChange={setMethod}
              systemPrompt={systemPrompt}
              onSystemPromptChange={setSystemPrompt}
              messages={messages}
              chatSending={chatSending}
              chatAssistantTurns={chatAudit.assistantTurns}
              chatUsedFallback={chatAudit.usedFallback}
              onSend={handleSend}
              onClearConversation={handleClearConversation}
              importedOutputs={importedOutputs}
              onAddImports={addImports}
              onRemoveImport={removeImport}
              pasteText={pasteText}
              onPasteTextChange={setPasteText}
              pasteNote={pasteSummary.note}
              pasteError={pasteSummary.error}
              differentialOn={differentialOn}
              captureSubject={captureSubject}
              scenarioA={scenarioA}
              scenarioB={scenarioB}
              canCaptureScenario={currentOutput.trim().length > 0}
              currentIsA={currentIsA}
              currentIsB={currentIsB}
              onCaptureScenario={captureScenario}
              onClearScenario={clearScenario}
            />
            <ChecksStep
              activeModules={activeModules}
              onToggleModule={toggleModule}
              useAgent={useAgent}
              onUseAgentChange={setUseAgent}
            />
            {/* The agentic adjudicator also needs a model — show it here when
                the user isn't already generating. */}
            {method !== 'generate' && useAgent && <LLMSettings />}

            {/* Final action */}
            <div className="flex flex-col gap-2">
              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <button
                onClick={handleRunAudits}
                disabled={!canRun}
                className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {evaluating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                {evaluating ? 'Running audits…' : 'Run Audits'}
              </button>
              <p className="text-center text-[11px] text-gray-500">
                {runDisabledReason
                  ? runDisabledReason
                  : `Runs ${activeModules.length} check${
                      activeModules.length === 1 ? '' : 's'
                    } on your output${useAgent ? ' with the agentic adjudicator' : ' (deterministic baseline)'}.`}
              </p>
            </div>
          </div>

          {/* Right column: results */}
          <AuditVisualizer
            referenceText={referenceText}
            responseText={auditedOutput}
            result={result}
          />
        </div>
      </main>
      <footer className="mx-auto max-w-[1400px] px-6 pb-8 pt-2 text-center text-xs text-gray-600">
        All processing is local. Uploaded documents and keys never leave your
        machine or persist beyond this container.
      </footer>
    </div>
  );
}

// Exported for potential reuse / tests.
export { ALL_MODULES };
