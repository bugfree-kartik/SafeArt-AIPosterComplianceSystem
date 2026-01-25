/**
 * Base Platform Extractor
 * 
 * Abstract base class for platform-specific poster extractors
 */

import { Page } from 'puppeteer';
import { Platform, PosterMetadata } from '@safeart/shared';
import { DiscoveredPoster } from '../index';

export interface ExtractorConfig {
  maxPosters?: number;
  scrollCount?: number;
  timeout?: number;
}

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  maxPosters: 50,
  scrollCount: 5,
  timeout: 30000,
};

/**
 * Abstract base class for platform extractors
 */
export abstract class BasePlatformExtractor {
  protected platform: Platform;
  protected config: ExtractorConfig;

  constructor(platform: Platform, config: Partial<ExtractorConfig> = {}) {
    this.platform = platform;
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
  }

  /**
   * Get the starting URL for crawling
   */
  abstract getStartUrl(): string;

  /**
   * Check if authentication is required
   */
  abstract requiresAuth(): boolean;

  /**
   * Get poster selector for this platform
   */
  abstract getPosterSelector(): string;

  /**
   * Extract poster metadata from an element
   */
  abstract extractPosterMetadata(page: Page, element: any): Promise<PosterMetadata>;

  /**
   * Extract all posters from current page
   */
  async extractPosters(page: Page): Promise<DiscoveredPoster[]> {
    const posters: DiscoveredPoster[] = [];
    const selector = this.getPosterSelector();
    const pageUrl = page.url();

    try {
      // Wait for content to load
      await page.waitForSelector(selector, { timeout: this.config.timeout });

      // Get all poster elements
      const elements = await page.$$(selector);
      console.log(`Found ${elements.length} poster elements`);

      const maxPosters = this.config.maxPosters || 50;

      for (let i = 0; i < Math.min(elements.length, maxPosters); i++) {
        try {
          const element = elements[i];
          
          // Get image URL
          const posterUrl = await this.extractPosterUrl(page, element);
          if (!posterUrl) continue;

          // Get metadata
          const metadata = await this.extractPosterMetadata(page, element);
          if (!metadata.title) continue;

          posters.push({
            posterUrl,
            pageUrl,
            metadata,
          });
        } catch (error) {
          console.error(`Error extracting poster ${i}:`, error);
        }
      }
    } catch (error) {
      console.error('Error extracting posters:', error);
    }

    return posters;
  }

  /**
   * Extract poster image URL from element
   */
  protected async extractPosterUrl(page: Page, element: any): Promise<string | null> {
    try {
      const url = await element.evaluate((el: Element) => {
        // Try various attributes
        const img = el.querySelector('img') || el;
        return (
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-image') ||
          (el as HTMLElement).style.backgroundImage?.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1') ||
          null
        );
      });

      // Ensure it's a valid URL
      if (url && url.startsWith('http')) {
        return url;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Navigate to platform and prepare for extraction
   */
  async navigateAndPrepare(page: Page): Promise<boolean> {
    try {
      const url = this.getStartUrl();
      console.log(`Navigating to: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      // Wait a bit for dynamic content
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return true;
    } catch (error) {
      console.error('Navigation error:', error);
      return false;
    }
  }
}

export default BasePlatformExtractor;
