/**
 * D-Chat Adapter — 滴滴内部 IM
 *
 * Short messages: plain text
 * Long messages: attachment format with color sidebar
 */

import { BaseAdapter } from './base';
import type { AdapterConfig, AbuMessage, MessageColor } from './types';

export class DchatAdapter extends BaseAdapter {
  readonly config: AdapterConfig = {
    platform: 'dchat',
    displayName: 'D-Chat',
    maxLength: 20000,
    chunkMode: 'newline',
    supportsMarkdown: true,
    supportsCard: true,
  };

  formatOutbound(message: AbuMessage): unknown {
    // Short messages use plain text
    if (message.content.length <= 3000 && !message.title) {
      return { text: message.content };
    }

    const colorMap: Record<MessageColor, string> = {
      success: '#36a64f',
      warning: '#ff9800',
      danger: '#e53935',
      info: '#2196f3',
    };

    return {
      text: message.title ?? '',
      attachments: [
        {
          title: message.title,
          text: message.content,
          color: message.color ? colorMap[message.color] : '#2196f3',
          ...(message.footer ? { footer: message.footer } : {}),
        },
      ],
    };
  }
}
