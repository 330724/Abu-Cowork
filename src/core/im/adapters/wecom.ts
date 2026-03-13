/**
 * WeCom (企业微信) Adapter
 *
 * Uses markdown message type. 4096 byte limit (not character).
 */

import { BaseAdapter } from './base';
import type { AdapterConfig, AbuMessage } from './types';

export class WecomAdapter extends BaseAdapter {
  readonly config: AdapterConfig = {
    platform: 'wecom',
    displayName: '企业微信',
    maxLength: 4096, // byte limit
    chunkMode: 'newline',
    supportsMarkdown: true,
    supportsCard: false,
  };

  formatOutbound(message: AbuMessage): unknown {
    let content = '';
    if (message.title) content += `### ${message.title}\n\n`;
    content += message.content;
    if (message.footer) content += `\n\n> ${message.footer}`;

    return {
      msgtype: 'markdown',
      markdown: { content },
    };
  }

  /**
   * Override chunking — WeCom counts bytes, not characters.
   */
  chunkContent(content: string): string[] {
    const maxBytes = this.config.maxLength;
    const encoder = new TextEncoder();

    if (encoder.encode(content).length <= maxBytes) return [content];

    const chunks: string[] = [];
    let current = '';

    for (const line of content.split('\n')) {
      const candidate = current ? current + '\n' + line : line;

      // Single line exceeds byte limit → hard byte-cut
      if (encoder.encode(line).length > maxBytes) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        let segment = '';
        for (const char of line) {
          if (encoder.encode(segment + char).length > maxBytes - 20) {
            chunks.push(segment + '...');
            segment = char;
          } else {
            segment += char;
          }
        }
        if (segment) current = segment;
        continue;
      }

      if (encoder.encode(candidate).length > maxBytes && current) {
        chunks.push(current);
        current = line;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}
