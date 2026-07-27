import { useState } from 'react';
import {
  MessagesSquare,
  ChevronDown,
  GitCompare,
  Wand2,
  Upload,
  ClipboardPaste,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { StepHeader } from './StepHeader';
import { ChatConsole } from './ChatConsole';
import { OutputImport } from './OutputImport';
import { ScenarioCapture } from './ScenarioCapture';
import { ScenarioLockBar } from './ScenarioLockBar';
import type { CapturedScenario, ChatMessage, UploadedDoc } from '../lib/types';

export type OutputMethod = 'generate' | 'import' | 'paste';

interface Props {
  method: OutputMethod;
  onMethodChange: (m: OutputMethod) => void;

  systemPrompt: string;
  onSystemPromptChange: (text: string) => void;

  // Generate — a live chat with the model (one turn or many).
  messages: ChatMessage[];
  chatSending: boolean;
  chatAssistantTurns: number;
  chatUsedFallback: boolean;
  onSend: (text: string) => void;
  onClearConversation: () => void;

  // Import.
  importedOutputs: UploadedDoc[];
  onAddImports: (items: UploadedDoc[]) => void;
  onRemoveImport: (id: string) => void;

  // Paste · single / conversation.
  // Paste ingests a single response or a whole transcript; note/error describe
  // what was recognised.
  pasteText: string;
  onPasteTextChange: (text: string) => void;
  pasteNote: string | null;
  pasteError: string | null;

  // Differential Context (shown only when the check is on).
  differentialOn: boolean;
  captureSubject: string;
  scenarioA: CapturedScenario | null;
  scenarioB: CapturedScenario | null;
  canCaptureScenario: boolean;
  currentIsA: boolean;
  currentIsB: boolean;
  onCaptureScenario: (slot: 'A' | 'B') => void;
  onClearScenario: (slot: 'A' | 'B') => void;
}

const METHODS: { id: OutputMethod; label: string; icon: typeof Wand2 }[] = [
  { id: 'generate', label: 'Generate', icon: Wand2 },
  { id: 'import', label: 'Import', icon: Upload },
  { id: 'paste', label: 'Paste', icon: ClipboardPaste },
];

export function OutputStep(props: Props) {
  const [showSystem, setShowSystem] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-raised p-4 shadow-lg shadow-black/20">
      <StepHeader
        n={2}
        title="Output to audit"
        subtitle="The assistant text to check against your documents."
      />

      {/* Method: how you provide the output */}
      <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface p-1 text-xs">
        {METHODS.map((m) => {
          const Icon = m.icon;
          const active = props.method === m.id;
          return (
            <button
              key={m.id}
              onClick={() => props.onMethodChange(m.id)}
              className={
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition ' +
                (active
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-gray-400 hover:text-gray-200')
              }
            >
              <Icon size={13} /> {m.label}
            </button>
          );
        })}
      </div>

      {/* ---- Generate — a live chat with the model ---- */}
      {props.method === 'generate' && (
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <MessagesSquare size={11} /> Live Chat
          </span>
          <SystemField
            value={props.systemPrompt}
            onChange={props.onSystemPromptChange}
            open={showSystem}
            onToggle={() => setShowSystem((v) => !v)}
          />
          <ChatConsole
            messages={props.messages}
            sending={props.chatSending}
            assistantTurns={props.chatAssistantTurns}
            usedFallback={props.chatUsedFallback}
            onSend={props.onSend}
            onClear={props.onClearConversation}
          />
          <p className="text-[11px] text-gray-600">
            Uses the target model above (set a provider and key, or a local Ollama).
          </p>
        </div>
      )}

      {/* ---- Import ---- */}
      {props.method === 'import' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">
            Import one file or many. A transcript is reduced to its assistant
            turns; multiple files are audited together as a single unit.
          </p>
          <OutputImport
            items={props.importedOutputs}
            onAdd={props.onAddImports}
            onRemove={props.onRemoveImport}
          />
        </div>
      )}

      {/* ---- Paste (a single response or a whole conversation) ---- */}
      {props.method === 'paste' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400">Response or conversation</label>
          <textarea
            value={props.pasteText}
            onChange={(e) => props.onPasteTextChange(e.target.value)}
            placeholder={
              'Paste a single response, or a whole conversation — a JSON messages ' +
              'array, a ShareGPT export, or raw text with labelled User and ' +
              'Assistant turns.'
            }
            className="h-40 w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm leading-relaxed text-gray-200 outline-none placeholder:text-gray-600 focus:border-emerald-500/60"
          />
          {props.pasteError ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                <span className="font-medium">That looks like a transcript but isn&rsquo;t valid. </span>
                {props.pasteError}
              </span>
            </div>
          ) : props.pasteNote ? (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Check size={12} /> {props.pasteNote}.
            </p>
          ) : null}
        </div>
      )}

      {/* ---- Differential Context scenario capture ---- */}
      {props.differentialOn && (
        <div className="flex flex-col gap-2 border-t border-surface-border pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-orange-200">
            <GitCompare size={13} /> Differential Context — capture two scenarios
          </div>
          <ScenarioLockBar
            subject={props.captureSubject}
            canCapture={props.canCaptureScenario}
            isA={props.currentIsA}
            isB={props.currentIsB}
            onCapture={props.onCaptureScenario}
          />
          <ScenarioCapture
            scenarioA={props.scenarioA}
            scenarioB={props.scenarioB}
            onClear={props.onClearScenario}
          />
        </div>
      )}
    </section>
  );
}

// A compact, collapsible "System instructions" field for the live chat.
function SystemField({
  value,
  onChange,
  open,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
      >
        <ChevronDown
          size={12}
          className={'transition-transform ' + (open ? 'rotate-180' : '')}
        />
        System instructions {value.trim() ? '(set)' : '(optional)'}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. You are a helpful assistant for university students."
          className="mt-1.5 h-16 w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60"
        />
      )}
    </div>
  );
}
