/**
 * Command Registry
 *
 * Imports all command definitions and provides lookup helpers.
 * The DashboardMutationClient iterates over ALL_COMMANDS generically.
 */

import { addPanelCommand } from './addPanel';
import { addRowCommand } from './addRow';
import { addTabCommand } from './addTab';
import { addVariableCommand } from './addVariable';
import { enterEditModeCommand } from './enterEditMode';
import { getDashboardInfoCommand } from './getDashboardInfo';
import { getLayoutCommand } from './getLayout';
import { listPanelsCommand } from './listPanels';
import { listVariablesCommand } from './listVariables';
import { movePanelCommand } from './movePanel';
import { moveRowCommand } from './moveRow';
import { moveTabCommand } from './moveTab';
import { removePanelCommand } from './removePanel';
import { removeRowCommand } from './removeRow';
import { removeTabCommand } from './removeTab';
import { removeVariableCommand } from './removeVariable';
import type { MutationCommand } from './types';
import { updateLayoutCommand } from './updateLayout';
import { updatePanelCommand } from './updatePanel';
import { updateRowCommand } from './updateRow';
import { updateTabCommand } from './updateTab';
import { updateVariableCommand } from './updateVariable';

// Heterogeneous command payload union; each concrete command's payload type is
// validated at dispatch time via its Zod schema (see validatePayload below).
// MutationCommand<T> is contravariant in T (handler parameter position) and
// invariant in T (payloadSchema: z.ZodType<T>), so an Array<MutationCommand<X>>
// cannot be implicitly upcast to Array<MutationCommand<unknown>>. The cast on
// the closing bracket exposes a single uniform iteration type to consumers.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- safe: MutationCommand<T> invariance forces this cast; handler payloads are Zod-validated before dispatch (see DashboardMutationClient.execute)
export const ALL_COMMANDS: ReadonlyArray<MutationCommand<unknown>> = [
  addVariableCommand,
  removeVariableCommand,
  updateVariableCommand,
  listVariablesCommand,
  enterEditModeCommand,
  getLayoutCommand,
  addRowCommand,
  removeRowCommand,
  updateRowCommand,
  moveRowCommand,
  addTabCommand,
  removeTabCommand,
  updateTabCommand,
  moveTabCommand,
  movePanelCommand,
  updateLayoutCommand,
  addPanelCommand,
  updatePanelCommand,
  removePanelCommand,
  listPanelsCommand,
  getDashboardInfoCommand,
] as ReadonlyArray<MutationCommand<unknown>>;

/** All valid command names. */
export const MUTATION_TYPES = ALL_COMMANDS.map((cmd) => cmd.name);

/** Lookup command by name (case-insensitive). */
function findCommand(command: string): MutationCommand | undefined {
  const normalized = command.toUpperCase();
  return ALL_COMMANDS.find((cmd) => cmd.name === normalized);
}

/** Validate a payload against the Zod schema for a command. */
export function validatePayload(
  commandType: string,
  payload: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  const cmd = findCommand(commandType);
  if (!cmd) {
    return { success: false, error: `Unknown command type: ${commandType}` };
  }

  const schema = cmd.payloadSchema;

  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { success: false, error: `Validation failed: ${errorMessages.join(', ')}` };
}
