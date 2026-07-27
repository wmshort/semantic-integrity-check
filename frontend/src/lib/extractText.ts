import { extractFile } from './api';

// Supported reference-document types. Plain-text formats are read entirely in the
// browser; PDF and DOCX are parsed by the local backend, which has robust
// libraries for them.
export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf', '.docx'];
export const ACCEPT_ATTR =
  '.txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function hasExtension(name: string, exts: string[]): boolean {
  const lower = name.toLowerCase();
  return exts.some((e) => lower.endsWith(e));
}

export function isSupported(file: File): boolean {
  return hasExtension(file.name, ACCEPTED_EXTENSIONS);
}

// Output/transcript imports additionally accept .json (chat exports).
export const OUTPUT_EXTENSIONS = [...ACCEPTED_EXTENSIONS, '.json'];
export const OUTPUT_ACCEPT_ATTR = ACCEPT_ATTR + ',.json,application/json';

export function isSupportedOutput(file: File): boolean {
  return hasExtension(file.name, OUTPUT_EXTENSIONS);
}

export async function extractText(file: File): Promise<string> {
  if (hasExtension(file.name, ['.pdf', '.docx'])) {
    return extractFile(file);
  }
  // txt / md / markdown and other text-like files.
  const text = await file.text();
  return text.trim();
}
