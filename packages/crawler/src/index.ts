/**
 * SafeArt Poster Crawler
 * 
 * Discovers poster images from streaming platforms using browser automation
 * Supports multiple platforms: Netflix, Prime Video, Disney+, etc.
 */

import { Platform, PosterMetadata, CreateJobRequest } from '@safeart/shared';
import { createJob } from '@safeart/backend';
import BrowserManager from './browser';
import { createExtractor, BasePlatformExtractor, ExtractorConfig } from './platforms';

/**
 * Discovered poster information
 */
export interface DiscoveredPoster {
  posterUrl: string;
  pageUrl: string;
  metadata: PosterMetadata;
}

/**
 * Crawler configuration
 */
export interface CrawlerConfig {
  platform: Platform;
  maxTitles?: number;
  headless?: boolean;
  useDemo?: boolean;
  tmdbApiKey?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Crawl results summary
 */
export interface CrawlResults {
  discovered: number;
  submitted: number;
  cached: number;
  skipped: number;
  errors: number;
  duration: number;
}

/**
 * Main Poster Crawler class
 */
export class PosterCrawler {
  private config: CrawlerConfig;
  private browserManager: BrowserManager;
  private extractor: BasePlatformExtractor;

  constructor(config: CrawlerConfig) {
    this.config = {
      maxTitles: 50,
      headless: true,
      useDemo: false,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.browserManager = new BrowserManager({
      headless: this.config.headless,
    });

    const extractorConfig: Partial<ExtractorConfig> = {
      maxPosters: this.config.maxTitles,
    };

    this.extractor = createExtractor(
      this.config.platform,
      extractorConfig,
      {
        useDemo: this.config.useDemo,
        tmdbApiKey: this.config.tmdbApiKey,
      }
    );
  }

  /**
   * Discover posters from the target platform
   */
  async discoverPosters(): Promise<DiscoveredPoster[]> {
    console.log(`\n🔍 Discovering posters for platform: ${this.config.platform}`);
    console.log(`   Mode: ${this.config.useDemo ? 'Demo' : 'Live'}`);
    console.log(`   Max titles: ${this.config.maxTitles}`);

    // For demo mode, no browser needed
    if (this.config.useDemo) {
      return this.extractor.extractPosters(null as any);
    }

    let posters: DiscoveredPoster[] = [];
    let retries = 0;

    while (retries < (this.config.retryAttempts || 3)) {
      try {
        const page = await this.browserManager.newPage();

        // Navigate to platform
        const success = await this.extractor.navigateAndPrepare(page);
        if (!success) {
          throw new Error('Failed to navigate to platform');
        }

        // Extract posters
        posters = await this.extractor.extractPosters(page);

        // Close page
        await page.close();
        break;
      } catch (error) {
        retries++;
        console.error(`Attempt ${retries} failed:`, error);
        
        if (retries < (this.config.retryAttempts || 3)) {
          console.log(`Retrying in ${this.config.retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    console.log(`   Found: ${posters.length} posters`);
    return posters;
  }

  /**
   * Process discovered posters and create jobs
   */
  async processPosters(posters: DiscoveredPoster[]): Promise<CrawlResults> {
    console.log(`\n📤 Processing ${posters.length} posters...`);

    const results: CrawlResults = {
      discovered: posters.length,
      submitted: 0,
      cached: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
    };

    const startTime = Date.now();

    for (let i = 0; i < posters.length; i++) {
      const poster = posters[i];
      const progress = `[${i + 1}/${posters.length}]`;

      try {
        console.log(`   ${progress} Processing: ${poster.metadata.title}`);

        const request: CreateJobRequest = {
          platform: this.config.platform,
          posterUrl: poster.posterUrl,
          pageUrl: poster.pageUrl,
          metadata: poster.metadata,
        };

        const response = await createJob(request);

        if (response.isCacheHit) {
          console.log(`   ${progress} ♻️  Cache hit`);
          results.cached++;
        } else if (response.status === 'PENDING') {
          console.log(`   ${progress} ✅ Submitted: ${response.jobId}`);
          results.submitted++;
        } else {
          console.log(`   ${progress} ⏭️  Skipped: ${response.message}`);
          results.skipped++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ${progress} ❌ Error: ${errorMsg}`);
        results.errors++;
      }

      // Small delay between submissions to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    results.duration = Date.now() - startTime;
    return results;
  }

  /**
   * Run a complete crawl cycle
   */
  async run(): Promise<CrawlResults> {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SafeArt Crawler Starting');
    console.log('='.repeat(50));

    const startTime = Date.now();

    try {
      // Discover posters
      const posters = await this.discoverPosters();

      if (posters.length === 0) {
        console.log('\n⚠️  No posters discovered');
        return {
          discovered: 0,
          submitted: 0,
          cached: 0,
          skipped: 0,
          errors: 0,
          duration: Date.now() - startTime,
        };
      }

      // Limit to maxTitles
      const limitedPosters = posters.slice(0, this.config.maxTitles);

      // Process posters
      const results = await this.processPosters(limitedPosters);

      // Print summary
      this.printSummary(results);

      return results;
    } finally {
      // Cleanup
      await this.browserManager.close();
    }
  }

  /**
   * Print crawl summary
   */
  private printSummary(results: CrawlResults): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 CRAWL SUMMARY');
    console.log('='.repeat(50));
    console.log(`   Platform:   ${this.config.platform}`);
    console.log(`   Discovered: ${results.discovered}`);
    console.log(`   Submitted:  ${results.submitted}`);
    console.log(`   Cached:     ${results.cached}`);
    console.log(`   Skipped:    ${results.skipped}`);
    console.log(`   Errors:     ${results.errors}`);
    console.log(`   Duration:   ${(results.duration / 1000).toFixed(2)}s`);
    console.log('='.repeat(50) + '\n');
  }
}

/**
 * Main entry point
 */
async function main() {
  // Configuration from environment
  const platform = (process.env.PLATFORM as Platform) || Platform.NETFLIX;
  const maxTitles = process.env.MAX_TITLES ? parseInt(process.env.MAX_TITLES) : 10;
  const useDemo = process.env.USE_DEMO === 'true' || !process.env.TMDB_API_KEY;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  const headless = process.env.HEADLESS !== 'false';

  const crawler = new PosterCrawler({
    platform,
    maxTitles,
    useDemo,
    tmdbApiKey,
    headless,
  });

  try {
    const results = await crawler.run();
    
    // Exit with error if too many failures
    if (results.errors > results.discovered / 2) {
      console.error('Too many errors during crawl');
      process.exit(1);
    }
  } catch (error) {
    console.error('Crawler fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
