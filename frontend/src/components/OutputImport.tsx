import { useCallback, useRef, useState } from 'react';
import { FileText, Loader2, UploadCloud, X, Layers } from 'lucide-react';
import { extractText, isSupportedOutput, OUTPUT_ACCEPT_ATTR } from '../lib/extractText';
import {
  auditMessages,
  importToMessages,
  validateConversation,
} from '../lib/conversation';
import type { UploadedDoc } from '../lib/types';

interface Props {
  items: UploadedDoc[];
  onAdd: (items: UploadedDoc[]) => void;
  onRemove: (id: string) => void;
}

function newId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Import one or many output/transcript files. A transcript is reduced to its
// assistant turns; a plain file is kept as-is. Multiple files are audited
// together as a single unit.
export function OutputImport({ items, onAdd, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setBusy(true);
      setErrors([]);
      const added: UploadedDoc[] = [];
      const failures: string[] = [];
      for (const file of list) {
        if (!isSupportedOutput(file)) {
          failures.push(`${file.name}: unsupported (use .txt, .md, .json, .pdf, .docx)`);
          continue;
        }
        try {
          const raw = await extractText(file);
          // A .json file must validate as an OpenAI or ShareGPT transcript.
          if (file.name.toLowerCase().endsWith('.json')) {
            const v = validateConversation(raw);
            if (!v.ok) {
              failures.push(`${file.name}: ${v.errors[0] ?? 'unrecognised transcript'}`);
              continue;
            }
          }
          // A transcript collapses to its assistant turns; plain text stays.
          const audited = auditMessages(importToMessages(raw)).auditedOutput;
          if (audited.trim()) added.push({ id: newId(), name: file.name, text: audited });
          else failures.push(`${file.name}: no auditable text`);
        } catch (e) {
          failures.push(e instanceof Error ? e.message : `${file.name}: failed to read`);
        }
      }
      if (added.length) onAdd(added);
      if (failures.length) setErrors(failures);
      setBusy(false);
    },
    [onAdd]
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void ingest(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition ' +
          (dragging
            ? 'border-emerald-500/70 bg-emerald-500/5'
            : 'border-surface-border bg-surface hover:border-gray-600')
        }
      >
        {busy ? (
          <Loader2 size={20} className="animate-spin text-emerald-400" />
        ) : (
          <UploadCloud size={20} className="text-gray-500" />
        )}
        <span className="text-sm text-gray-300">
          {busy ? 'Reading…' : 'Drop output / transcript files or click to upload'}
        </span>
        <span className="text-[11px] text-gray-600">
          .txt &middot; .md &middot; .json &middot; .pdf &middot; .docx &mdash; one or many
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={OUTPUT_ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Layers size={12} />
            {items.length === 1
              ? 'Auditing 1 file.'
              : `Auditing ${items.length} files together as one output.`}
          </div>
          <ul className="flex flex-col gap-1.5">
            {items.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2"
              >
                <FileText size={14} className="flex-shrink-0 text-emerald-400/80" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-200" title={f.name}>
                  {f.name}
                </span>
                <button
                  onClick={() => onRemove(f.id)}
                  className="flex-shrink-0 rounded p-0.5 text-gray-500 hover:bg-surface-border hover:text-red-400"
                  aria-label={`Remove ${f.name}`}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
    </div>
  );
}
