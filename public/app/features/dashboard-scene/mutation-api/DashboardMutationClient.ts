/**
 * Dashboard Mutation Client
 *
 * API for programmatic dashboard mutations. Provides
 * a declarative, command-based API where callers describe *what* to
 * change (e.g. ADD_VARIABLE, UPDATE_VARIABLE) and the client handles Scenes
 * internals, payload validation (via Zod schemas), permission checks, and
 * transactional execution with structured error responses.
 *
 * Each mutation goes through:
 * 1. Command lookup (is it a registered command?)
 * 2. Permission check (can the user edit this dashboard?)
 * 3. Payload validation (does the payload match the Zod schema?)
 */

import type { DashboardScene } from '../scene/DashboardScene';

import { ALL_COMMANDS, type RegisteredCommand, validatePayload } from './commands/registry';
import type { MutationContext } from './commands/types';
import type { MutationClient, MutationRequest, MutationResult } from './types';

type MutationHandler = (payload: unknown, context: MutationContext) => Promise<MutationResult>;

interface CommandRegistration {
  handler: MutationHandler;
  canExecute: (scene: DashboardScene) => { allowed: true } | { allowed: false; error: string };
  readOnly: boolean;
}

export class DashboardMutationClient implements MutationClient {
  private scene: DashboardScene;
  private commands: Map<string, CommandRegistration> = new Map();

  constructor(scene: DashboardScene) {
    this.scene = scene;
    for (const cmd of ALL_COMMANDS) {
      this.registerCommand(cmd);
    }
  }

  async execute(mutation: MutationRequest): Promise<MutationResult> {
    const type = mutation.type.toUpperCase();

    const registration = this.commands.get(type);
    if (!registration) {
      return { success: false, error: `Unknown command type: ${type}`, changes: [] };
    }

    const permissionResult = registration.canExecute(this.scene);
    if (!permissionResult.allowed) {
      return { success: false, error: permissionResult.error, changes: [] };
    }

    const validationResult = validatePayload(type, mutation.payload);
    if (!validationResult.success) {
      return { success: false, error: validationResult.error, changes: [] };
    }

    // Zod may return frozen or shared default objects. Deep-clone write payloads
    // so downstream code (e.g. getPanelOptionsWithDefaults) can mutate in-place.
    const payload = registration.readOnly ? validationResult.data : structuredClone(validationResult.data);

    const context: MutationContext = { scene: this.scene };

    try {
      const result = await registration.handler(payload, context);

      if (result.success && !registration.readOnly) {
        this.scene.forceRender();
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        changes: [],
      };
    }
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  // Accepts the registry's uniform `RegisteredCommand` whose `handler` already has the
  // `(payload: unknown, ctx) => Promise<MutationResult>` shape (the registry wraps the original
  // typed handler in a closure that parses the payload via the captured schema). No type
  // assertion is required when copying `cmd.handler` into the local `MutationHandler` slot.
  private registerCommand(cmd: RegisteredCommand): void {
    this.commands.set(cmd.name, {
      handler: cmd.handler,
      canExecute: cmd.permission,
      readOnly: cmd.readOnly,
    });
  }
}
