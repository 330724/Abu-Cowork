/**
 * Feishu (Lark) Adapter
 *
 * Uses interactive card messages with Markdown support.
 */

import { BaseAdapter } from './base';
import type { AdapterConfig, AbuMessage, MessageColor } from './types';

export class FeishuAdapter extends BaseAdapter {
  readonly config: AdapterConfig = {
    platform: 'feishu',
    displayName: '飞书',
    maxLength: 30000,
    chunkMode: 'newline',
    supportsMarkdown: true,
    supportsCard: true,
    supportsMessageUpdate: true,
  };

  formatOutbound(message: AbuMessage): unknown {
    const colorMap: Record<MessageColor, string> = {
      success: 'green',
      warning: 'orange',
      danger: 'red',
      info: 'blue',
    };

    return {
      msg_type: 'interactive',
      card: {
        header: message.title
          ? {
              title: { tag: 'plain_text', content: message.title },
              template: message.color ? colorMap[message.color] : 'blue',
            }
          : undefined,
        elements: [
          { tag: 'markdown', content: message.content },
          ...(message.footer
            ? [
                {
                  tag: 'note',
                  elements: [{ tag: 'plain_text', content: message.footer }],
                },
              ]
            : []),
        ],
      },
    };
  }
}
