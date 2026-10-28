import type { Chart, DataTable, Project } from '../model/types';
import { parseProject, stringifyProject } from '../state/serialize';
import type { Command } from '../state/commands';

/** What the tests of the looks and range switches of the parts of a chart share: a project round trip and the ids of a drawing. */
const projectOf = (chart: Chart, table: DataTable): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });

/** The chart after commands have been run on it. */
export const afterCommands = (chart: Chart, table: DataTable, ...commands: Command[]): Chart => commands.reduce((p, c) => c(p), projectOf(chart, table)).charts[0];

/** The chart as it is after saving the project to a file and opening it again. */
export const reopened = (chart: Chart, table: DataTable): Chart => parseProject(stringifyProject(projectOf(chart, table))).charts[0];

/** The ids of the marks of an SVG drawing, in order. */
export const markIds = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
