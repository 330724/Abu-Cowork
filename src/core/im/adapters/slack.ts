/**
 * Slack Adapter
 *
 * Uses Block Kit format. Converts Markdown to Slack mrkdwn.
 *
 * Known limitations (Phase 1 — to be addressed as needed):
 * - Tables not supported, rendered as-is
 * - Nested lists get flattened
 * - Image syntax not supported
 */

import { BaseAdapter } from './base';
import type { AdapterConfig, AbuMessage } from './types';

export class SlackAdapter extends BaseAdapter {
  readonly config: AdapterConfig = {
    platform: 'slack',
    displayName: 'Slack',
    maxLength: 3000, // Block Kit section limit with margin
    chunkMode: 'newline',
    supportsMarkdown: false, // Slack uses mrkdwn, not standard Markdown
    supportsCard: true,
    supportsMessageUpdate: true,
  };

  formatOutbound(message: AbuMessage): unknown {
    const blocks: unknown[] = [];

    if (message.title) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: message.title },
      });
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: this.toMrkdwn(message.content) },
    });

    if (message.footer) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: message.footer }],
      });
    }

    return { blocks };
  }

  /**
   * Convert Markdown → Slack mrkdwn
   */
  private toMrkdwn(md: string): string {
    return (
      md
        // Headings → bold
        .replace(/^#{1,3} (.+)$/gm, '*$1*')
        // **bold** → *bold*
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        // [text](url) → <url|text>
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
        // ~~strikethrough~~ → ~strikethrough~
        .replace(/~~(.+?)~~/g, '~$1~')
        // - list → • list
        .replace(/^- /gm, '• ')
    );
    // > blockquote stays the same (Slack also uses >)
  }
}
