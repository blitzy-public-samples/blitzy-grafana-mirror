/**
 * Command Registry
 *
 * Imports all command definitions and provides lookup helpers.
 * The DashboardMutationClient iterates over ALL_COMMANDS generically.
 *
 * Implementation note: `MutationCommand<T>` is contravariant in `T` (`handler` parameter) and
 * invariant in `T` (`payloadSchema: z.ZodType<T>`), so a heterogeneous list of concrete
 * `MutationCommand<XN>` values cannot be directly typed as `Array<MutationCommand<unknown>>` and
 * the upcast cannot be expressed without a type assertion. Instead, each command is wrapped at
 * registration time by a generic `register<T>(cmd)` helper that captures the original schema and
 * handler in a closure: the stored `handler(payload: unknown, ctx)` closure parses `payload`
 * through the schema (recovering `T` via `z.ZodType.parse`'s return type) before calling the
 * original typed handler. This makes the registration path fully type-safe without any
 * `consistent-type-assertions` suppression.
 */

import { type z } from 'zod';

import type { MutationResult } from '../types';

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
import type { MutationCommand, MutationContext, PermissionCheck } from './types';
import { updateLayoutCommand } from './updateLayout';
import { updatePanelCommand } from './updatePanel';
import { updateRowCommand } from './updateRow';
import { updateTabCommand } from './updateTab';
import { updateVariableCommand } from './updateVariable';

/**
 * Uniform shape of a registered command in the registry. The `handler` accepts `unknown` because
 * its closure body internally re-parses the incoming payload via the captured `payloadSchema`,
 * recovering the original concrete payload type from `z.ZodType.parse`'s return type. This lets
 * consumers iterate the registry generically without needing to know the concrete payload type.
 */
export interface RegisteredCommand {
  readonly name: string;
  readonly description: string;
  readonly payloadSchema: z.ZodTypeAny;
  readonly permission: PermissionCheck;
  readonly readOnly: boolean;
  readonly handler: (payload: unknown, context: MutationContext) => Promise<MutationResult>;
}

const COMMAND_MAP = new Map<string, RegisteredCommand>();

/**
 * Register a typed `MutationCommand<T>` into the uniform `RegisteredCommand` map.
 *
 * The function is generic in `T` so each call instantiates its own `T` locally — there is no
 * union/widening of the heterogeneous list, and therefore no need to assert any element to a
 * common type. The captured `handler` closure preserves the original schema/handler relationship:
 * `cmd.payloadSchema.parse(payload)` returns the original payload type `T` (because
 * `z.ZodType<T>` declares `parse(data: unknown): T`), which then matches `cmd.handler`'s
 * parameter type exactly without any assertion.
 */
function register<T>(cmd: MutationCommand<T>): void {
  COMMAND_MAP.set(cmd.name, {
    name: cmd.name,
    description: cmd.description,
    payloadSchema: cmd.payloadSchema,
    permission: cmd.permission,
    readOnly: cmd.readOnly ?? false,
    handler: (payload, context) => cmd.handler(cmd.payloadSchema.parse(payload), context),
  });
}

// Register every command via the generic helper. Each call carries its own `T` parameter, so this
// list expansion does not require any upcast or type assertion to a common element type.
register(addVariableCommand);
register(removeVariableCommand);
register(updateVariableCommand);
register(listVariablesCommand);
register(enterEditModeCommand);
register(getLayoutCommand);
register(addRowCommand);
register(removeRowCommand);
register(updateRowCommand);
register(moveRowCommand);
register(addTabCommand);
register(removeTabCommand);
register(updateTabCommand);
register(moveTabCommand);
register(movePanelCommand);
register(updateLayoutCommand);
register(addPanelCommand);
register(updatePanelCommand);
register(removePanelCommand);
register(listPanelsCommand);
register(getDashboardInfoCommand);

/**
 * Read-only snapshot of all registered commands. The element type is the registry's uniform
 * `RegisteredCommand`, which carries an `unknown`-payload handler closure. Consumers can iterate,
 * inspect (`name`, `description`, `payloadSchema`, `permission`, `readOnly`), or invoke
 * (`handler(payload, context)`) without needing the original generic `T`.
 */
export const ALL_COMMANDS: readonly RegisteredCommand[] = Array.from(COMMAND_MAP.values());

/** All valid command names. */
export const MUTATION_TYPES: string[] = ALL_COMMANDS.map((cmd) => cmd.name);

/** Lookup command by name (case-insensitive). */
function findCommand(command: string): RegisteredCommand | undefined {
  return COMMAND_MAP.get(command.toUpperCase());
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
