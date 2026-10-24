import type { Project } from '../model/types';
import { parseProjectWithNotes, stringifyProject } from './serialize';

/**
 * The project file (.oplot): the project as UTF-8 JSON, in the envelope of serialize.ts (format "octavaplot-project",
 * version 1). Nothing is compressed, packed or encrypted; the text is the file.
 */
export const PROJECT_EXTENSION = '.oplot';
export const PROJECT_MIME = 'application/json';

/** Largest project file that is read; a larger one is refused before its contents are loaded. */
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

/** The text to write to a project file. */
export const projectToFileText = (project: Project): string => stringifyProject(project);

const hasProjectExtension = (name: string): boolean => name.toLowerCase().endsWith(PROJECT_EXTENSION);

/** What is read from a file: its name, its size and its bytes. */
export interface ProjectSource {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Reads a project file. Anything wrong, whether the name, the size, the text or the project in it, is an Error whose
 * message says what; the caller keeps the project it has.
 */
export async function readProjectFile(file: ProjectSource): Promise<{ project: Project; notes: string[] }> {
  if (!hasProjectExtension(file.name)) throw new Error(`${file.name} is not a project file: project files end in ${PROJECT_EXTENSION}.`);
  if (file.size > MAX_PROJECT_BYTES) throw new Error(`${file.name} is too large to open (${Math.round(file.size / 1048576)} MB; the limit is ${MAX_PROJECT_BYTES / 1048576} MB).`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} is not a project file: it is not UTF-8 text.`);
  }
  return parseProjectWithNotes(text);
}
