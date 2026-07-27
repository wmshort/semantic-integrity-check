import { useCallback, useRef, useState } from 'react';
import { FileText, FilePlus2, Loader2, UploadCloud, X } from 'lucide-react';
import { StepHeader } from './StepHeader';
import { ACCEPT_ATTR, extractText, isSupported } from '../lib/extractText';
import type { UploadedDoc } from '../lib/types';

interface Props {
  documents: UploadedDoc[];
  onAdd: (docs: UploadedDoc[]) => void;
  onRemove: (id: string) => void;
}

function newId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function charCount(text: string): string {
  return text.length > 1000
    ? `${(text.length / 1000).toFixed(1)}k chars`
    : `${text.length} chars`;
}

export function DocumentUploader({ documents, onAdd, onRemove }: Props) {
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
        if (!isSupported(file)) {
          failures.push(`${file.name}: unsupported type (use .txt, .md, .pdf, .docx)`);
          continue;
        }
        try {
          const text = await extractText(file);
          if (text.trim().length === 0) {
            failures.push(`${file.name}: no text found`);
            continue;
          }
          added.push({ id: newId(), name: file.name, text });
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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) void ingest(e.dataTransfer.files);
    },
    [ingest]
  );

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-raised p-4 shadow-lg shadow-black/20">
      <div className="mb-3">
        <StepHeader
          n={1}
          title="Reference documents"
          subtitle="The source of truth your output is checked against."
          right={
            documents.length > 0 ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-gray-300 hover:border-emerald-500/50"
              >
                <FilePlus2 size={13} /> Add
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
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
          {busy ? 'Reading…' : 'Drop files or click to upload'}
        </span>
        <span className="text-[11px] text-gray-600">
          .txt &middot; .md &middot; .pdf &middot; .docx &mdash; multiple allowed
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void ingest(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Uploaded document list */}
      {documents.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2"
            >
              <FileText size={14} className="flex-shrink-0 text-emerald-400/80" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200" title={doc.name}>
                {doc.name}
              </span>
              <span className="flex-shrink-0 text-[11px] text-gray-500">
                {charCount(doc.text)}
              </span>
              <button
                onClick={() => onRemove(doc.id)}
                className="flex-shrink-0 rounded p-0.5 text-gray-500 hover:bg-surface-border hover:text-red-400"
                aria-label={`Remove ${doc.name}`}
                title="Remove"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      {documents.length === 0 && !busy && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
          Uploaded documents are read locally and sent only to the local backend
          at audit time — never stored or shared.
        </p>
      )}
    </section>
  );
}
