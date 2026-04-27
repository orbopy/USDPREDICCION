import { NewsItem } from '../../shared/types/MarketData';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('news-api');

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string };
  publishedAt: string;
}

export class NewsAPI {
  private readonly apiKey = process.env.GNEWS_API_KEY ?? '';
  private readonly topics = ['economia argentina', 'dolar blue', 'banco central', 'inflacion', 'paraguay frontera', 'real brasileiro'];

  async fetchLatest(): Promise<NewsItem[]> {
    const results: NewsItem[] = [];

    for (const topic of this.topics) {
      try {
        const articles = await this.fetchTopic(topic);
        results.push(...articles);
      } catch (err) {
        logger.warn(`Failed to fetch news for: ${topic}`, err);
      }
    }

    return this.deduplicate(results);
  }

  private async fetchTopic(query: string): Promise<NewsItem[]> {
    if (!this.apiKey) {
      logger.warn('No GNEWS_API_KEY configured, skipping news fetch');
      return [];
    }

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=es&max=5&apikey=${this.apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as { articles: GNewsArticle[] };
    return data.articles.map((a) => ({
      id: `${a.source.name}-${a.publishedAt}`,
      title: a.title,
      body: a.description ?? '',
      source: a.source.name,
      url: a.url,
      publishedAt: new Date(a.publishedAt).getTime(),
      tags: [query],
      region: this.inferRegion(query),
    }));
  }

  private inferRegion(query: string): string[] {
    if (query.includes('argentin') || query.includes('dolar')) return ['AR'];
    if (query.includes('paraguay') || query.includes('frontera')) return ['PY'];
    if (query.includes('brasil') || query.includes('real')) return ['BR'];
    return ['AR', 'PY', 'BR'];
  }

  private deduplicate(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
}
