/**
 * Search Provider Adapters
 *
 * Unified interface for multiple web search providers:
 * - Bing Web Search API
 * - Brave Search API
 * - Tavily Search API
 * - SearXNG (self-hosted, no API key needed)
 *
 * All HTTP requests use getTauriFetch() to bypass CORS.
 */

import type { SearchResult, WebSearchResponse } from '../../types';
import { getTauriFetch } from '../llm/tauriFetch';

export interface SearchOptions {
  count: number;
  market: string;
  freshness?: string;
}

export interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<WebSearchResponse>;
}

/** Extract domain from a URL */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// --- Bing Web Search API ---

export function createBingProvider(apiKey: string): SearchProvider {
  return {
    async search(query: string, options: SearchOptions): Promise<WebSearchResponse> {
      const fetchFn = await getTauriFetch();
      const params = new URLSearchParams({
        q: query,
        count: String(options.count),
        mkt: options.market,
        responseFilter: 'Webpages',
      });
      if (options.freshness) {
        params.set('freshness', options.freshness);
      }

      const response = await fetchFn(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bing Search API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        webPages?: {
          value: Array<{
            name: string;
            url: string;
            snippet: string;
            datePublished?: string;
          }>;
        };
      };

      const results: SearchResult[] = (data.webPages?.value || []).map((item) => ({
        title: item.name,
        url: item.url,
        snippet: item.snippet,
        source: extractDomain(item.url),
        publishedDate: item.datePublished,
      }));

      return { query, results };
    },
  };
}

// --- Brave Search API ---

export function createBraveProvider(apiKey: string): SearchProvider {
  return {
    async search(query: string, options: SearchOptions): Promise<WebSearchResponse> {
      const fetchFn = await getTauriFetch();
      const params = new URLSearchParams({
        q: query,
        count: String(options.count),
      });
      if (options.freshness) {
        params.set('freshness', options.freshness);
      }

      const response = await fetchFn(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brave Search API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        web?: {
          results: Array<{
            title: string;
            url: string;
            description: string;
            page_age?: string;
          }>;
        };
      };

      const results: SearchResult[] = (data.web?.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description,
        source: extractDomain(item.url),
        publishedDate: item.page_age,
      }));

      return { query, results };
    },
  };
}

// --- Tavily Search API ---

export function createTavilyProvider(apiKey: string): SearchProvider {
  return {
    async search(query: string, options: SearchOptions): Promise<WebSearchResponse> {
      const fetchFn = await getTauriFetch();

      const response = await fetchFn('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: options.count,
          search_depth: 'basic',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily Search API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        results: Array<{
          title: string;
          url: string;
          content: string;
          published_date?: string;
        }>;
      };

      const results: SearchResult[] = (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content,
        source: extractDomain(item.url),
        publishedDate: item.published_date,
      }));

      return { query, results };
    },
  };
}

// --- SearXNG (self-hosted) ---

export function createSearXNGProvider(baseUrl: string): SearchProvider {
  return {
    async search(query: string, options: SearchOptions): Promise<WebSearchResponse> {
      const fetchFn = await getTauriFetch();
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        pageno: '1',
      });

      const response = await fetchFn(`${cleanBaseUrl}/search?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SearXNG error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        results: Array<{
          title: string;
          url: string;
          content: string;
          publishedDate?: string;
        }>;
      };

      const results: SearchResult[] = (data.results || [])
        .slice(0, options.count)
        .map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.content,
          source: extractDomain(item.url),
          publishedDate: item.publishedDate,
        }));

      return { query, results };
    },
  };
}

// --- Baidu Search API (Smart + Web) ---

export type BaiduSearchMode = 'smart' | 'web';

export function createBaiduProvider(apiKey: string, mode: BaiduSearchMode = 'smart'): SearchProvider {
  return {
    async search(query: string, options: SearchOptions): Promise<WebSearchResponse> {
      const fetchFn = await getTauriFetch();

      let url: string;
      let requestBody: Record<string, unknown>;

      if (mode === 'web') {
        // Web search: 直接返回搜索结果
        url = 'https://qianfan.baidubce.com/v2/ai_search/web_search';
        requestBody = {
          messages: [
            {
              role: 'user',
              content: query,
            },
          ],
          search_source: 'baidu_search_v2',
          resource_type_filter: [
            { type: 'web', top_k: Math.min(options.count, 20) },
          ],
        };
      } else {
        // Smart search: AI 总结 + 搜索结果
        url = 'https://qianfan.baidubce.com/v2/ai_search/chat/completions';
        requestBody = {
          messages: [
            {
              role: 'user',
              content: query,
            },
          ],
          model: 'ernie-4.5-turbo-32k',
          search_source: 'baidu_search_v2',
          resource_type_filter: [
            { type: 'web', top_k: Math.min(options.count, 10) },
          ],
          stream: false,
          enable_reasoning: true,
          enable_deep_search: false,
          enable_corner_markers: true,
        };
      }

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Baidu Search API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        references?: Array<{
          title?: string;
          url?: string;
          content?: string;
          source?: string;
        }>;
      };

      const references = data.references || [];

      const results: SearchResult[] = references.slice(0, options.count).map((item, idx) => ({
        title: item.title || `Result ${idx + 1}`,
        url: item.url || '',
        snippet: item.content?.substring(0, 300) || '',
        source: item.source || extractDomain(item.url || ''),
      }));

      return { query, results };
    },
  };
}

// --- Provider factory ---

export type WebSearchProviderType = 'bing' | 'brave' | 'tavily' | 'searxng' | 'baidu';

export function createSearchProvider(
  providerType: WebSearchProviderType,
  apiKey: string,
  _secretKey?: string,
  baseUrl?: string,
  baiduSearchMode?: BaiduSearchMode,
): SearchProvider {
  switch (providerType) {
    case 'bing':
      return createBingProvider(apiKey);
    case 'brave':
      return createBraveProvider(apiKey);
    case 'tavily':
      return createTavilyProvider(apiKey);
    case 'searxng':
      return createSearXNGProvider(baseUrl || '');
    case 'baidu':
      return createBaiduProvider(apiKey, baiduSearchMode || 'smart');
  }
}
