/**
 * Netflix Platform Extractor
 * 
 * Extracts poster images and metadata from Netflix
 * Note: Requires authentication for full access
 */

import { Page } from 'puppeteer';
import { Platform, PosterMetadata } from '@safeart/shared';
import { BasePlatformExtractor, ExtractorConfig } from './base';

/**
 * Netflix-specific extractor implementation
 */
export class NetflixExtractor extends BasePlatformExtractor {
  constructor(config: Partial<ExtractorConfig> = {}) {
    super(Platform.NETFLIX, config);
  }

  getStartUrl(): string {
    // Netflix browse page (requires auth for full catalog)
    // For demo, we use the public-facing page
    return 'https://www.netflix.com/browse';
  }

  requiresAuth(): boolean {
    return true;
  }

  getPosterSelector(): string {
    // Netflix poster selectors
    return '.title-card-container img, .boxart-image, .ptrack-content img';
  }

  async extractPosterMetadata(page: Page, element: any): Promise<PosterMetadata> {
    try {
      const metadata = await element.evaluate((el: Element) => {
        // Try to find title from various sources
        const titleCard = el.closest('.title-card-container');
        const sliderItem = el.closest('.slider-item');
        const jawBone = el.closest('.jawBone');

        let title = '';
        let titleId = '';

        // Try title card
        if (titleCard) {
          const titleEl = titleCard.querySelector('.fallback-text, .title-card-title');
          title = titleEl?.textContent?.trim() || '';
        }

        // Try aria-label on image
        if (!title) {
          title = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
        }

        // Try slider item
        if (!title && sliderItem) {
          const link = sliderItem.querySelector('a');
          title = link?.getAttribute('aria-label') || '';
          const href = link?.getAttribute('href') || '';
          const match = href.match(/\/watch\/(\d+)/);
          if (match) titleId = match[1];
        }

        return { title, titleId };
      });

      return {
        title: metadata.title || 'Unknown Title',
        titleId: metadata.titleId || undefined,
      };
    } catch {
      return { title: 'Unknown Title' };
    }
  }

  /**
   * Handle Netflix login if needed
   */
  async login(page: Page, email: string, password: string): Promise<boolean> {
    try {
      // Navigate to login page
      await page.goto('https://www.netflix.com/login', { waitUntil: 'networkidle2' });

      // Enter credentials
      await page.type('input[name="userLoginId"]', email);
      await page.type('input[name="password"]', password);

      // Click sign in
      await page.click('button[type="submit"]');

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      // Check if login succeeded
      const isLoggedIn = await page.evaluate(() => {
        return window.location.pathname.includes('/browse');
      });

      return isLoggedIn;
    } catch (error) {
      console.error('Netflix login failed:', error);
      return false;
    }
  }

  /**
   * Scroll to load more Netflix content
   */
  async loadMoreContent(page: Page): Promise<void> {
    const scrollCount = this.config.scrollCount || 5;
    
    for (let i = 0; i < scrollCount; i++) {
      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      // Wait for content to load
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Also try clicking "See All" buttons to expand rows
      try {
        const seeAllButtons = await page.$$('.row-header .see-all-link');
        for (const button of seeAllButtons.slice(0, 2)) {
          await button.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch {
        // Ignore if no buttons found
      }
    }
  }
}

export default NetflixExtractor;
