import { useCallback } from 'react';
import { MessageType, type GameMessage } from '../types/protocol';
import type { WidgetId } from '@/components/GameBoard/widgetRegistry';

export interface SlashCommandResult {
  handled: boolean;
  messages: GameMessage[];
  widget?: WidgetId;
}

export function useSlashCommands() {
  const execute = useCallback((input: string): SlashCommandResult => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { handled: false, messages: [] };
    }

    const cmd = trimmed.split(/\s+/)[0].toLowerCase();

    // Widget triggers — toggle the widget locally, no server round-trip.
    switch (cmd) {
      case '/inventory':
        return { handled: true, messages: [], widget: 'inventory' };
      case '/character':
        return { handled: true, messages: [], widget: 'character' };
      case '/map':
        return { handled: true, messages: [], widget: 'map' };
      // /journal removed playtest 2026-04-11 — Handouts tab was removed from
      // the right-panel tab strip. The slash command had no surface to
      // toggle. Restore both together if/when the feature is revived.
      case '/knowledge':
        return { handled: true, messages: [], widget: 'knowledge' };
      case '/gallery':
        return { handled: true, messages: [], widget: 'gallery' };
      case '/yield':
        return {
          handled: true,
          messages: [
            {
              type: MessageType.YIELD,
              payload: {},
              player_id: "",
            } satisfies GameMessage,
          ],
        };
      default:
        // Unknown slash command — swallow it client-side. The backend cannot
        // receive slash text as PLAYER_ACTION without erroring. If a command
        // needs server support, add an explicit case above.
        return { handled: true, messages: [] };
    }
  }, []);

  return { execute };
}
