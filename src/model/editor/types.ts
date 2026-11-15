import type { FolderKey, Id } from '../types';

/** Transient editor references; these are not part of the project document. */
export type Selection =
  | { kind: 'chart' }
  | { kind: 'group'; groupId: Id }
  /** Several data sets edited together (two or more; one is a 'group'). */
  | { kind: 'groups'; groupIds: Id[] }
  /** One raw observation's symbol (and its label); mean markers are not selectable. */
  | { kind: 'point'; groupId: Id; pointId: Id }
  /** Several points edited together (two or more; one is a 'point'), in the order they were picked; they may belong to different data sets. */
  | { kind: 'points'; points: Array<{ groupId: Id; pointId: Id }> }
  | { kind: 'annotation'; annotationId: Id }
  /** Several annotations edited together (two or more; one is an 'annotation'). */
  | { kind: 'annotations'; annotationIds: Id[] }
  /** One drawing object or several, edited together. */
  | { kind: 'drawings'; drawingIds: Id[] };

/** A page of the project, or the overview of a folder (all its pages as thumbnails). */
export type ViewRef = { kind: 'table'; id: Id } | { kind: 'chart'; id: Id } | { kind: 'analysis'; id: Id } | { kind: 'layout'; id: Id } | { kind: 'folder'; id: FolderKey };
