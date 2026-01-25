/**
 * Browser automation module
 * 
 * Provides browser automation using Puppeteer with stealth plugins
 * Ready for Nova Act integration when available
 */

import puppeteer, { Browser, Page } from 'puppeteer';

export interface BrowserConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  userAgent?: string;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  slowMo: 50,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Browser manager for crawler operations
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private config: BrowserConfig;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Launch browser instance
   */
  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    console.log('Launching browser...');
    
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    console.log('Browser launched');
    return this.browser;
  }

  /**
   * Create a new page with default settings
   */
  async newPage(): Promise<Page> {
    const browser = await this.launch();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set user agent
    if (this.config.userAgent) {
      await page.setUserAgent(this.config.userAgent);
    }

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout || 30000);

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    return page;
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('Browser closed');
    }
  }

  /**
   * Take screenshot for debugging
   */
  async screenshot(page: Page, filename: string): Promise<void> {
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`Screenshot saved: ${filename}`);
  }
}

/**
 * Utility: Wait and scroll to load dynamic content
 */
export async function scrollToLoadContent(
  page: Page,
  scrollCount: number = 5,
  scrollDelay: number = 1000
): Promise<void> {
  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await new Promise((resolve) => setTimeout(resolve, scrollDelay));
  }
  
  // Scroll back to top
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

/**
 * Utility: Extract image URLs from page
 */
export async function extractImageUrls(
  page: Page,
  selector: string
): Promise<string[]> {
  return page.evaluate((sel) => {
    const images = document.querySelectorAll(sel);
    return Array.from(images)
      .map((img) => {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        return src;
      })
      .filter((src) => src && src.startsWith('http'));
  }, selector);
}

export default BrowserManager;
