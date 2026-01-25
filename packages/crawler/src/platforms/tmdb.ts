/**
 * TMDB (The Movie Database) Extractor
 * 
 * Extracts poster images from TMDB - a public movie database
 * Great for testing without authentication
 */

import { Page } from 'puppeteer';
import { Platform, PosterMetadata } from '@safeart/shared';
import { BasePlatformExtractor, ExtractorConfig } from './base';
import { DiscoveredPoster } from '../index';

/**
 * TMDB API Response types
 */
interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
}

interface TMDBResponse {
  results: TMDBMovie[];
  page: number;
  total_pages: number;
}

/**
 * TMDB Extractor - Uses TMDB API for reliable poster discovery
 */
export class TMDBExtractor extends BasePlatformExtractor {
  private apiKey: string;
  private baseImageUrl = 'https://image.tmdb.org/t/p/w500';

  constructor(config: Partial<ExtractorConfig> = {}, apiKey?: string) {
    super(Platform.NETFLIX, config); // Map to Netflix for testing
    // Use demo API key if not provided (limited rate)
    this.apiKey = apiKey || process.env.TMDB_API_KEY || '';
  }

  getStartUrl(): string {
    return 'https://www.themoviedb.org/movie';
  }

  requiresAuth(): boolean {
    return false; // TMDB is publicly accessible
  }

  getPosterSelector(): string {
    return '.card.style_1 img, .poster img, .image_content img';
  }

  async extractPosterMetadata(page: Page, element: any): Promise<PosterMetadata> {
    try {
      const metadata = await element.evaluate((el: Element) => {
        const card = el.closest('.card') || el.closest('.poster');
        const titleEl = card?.querySelector('h2, .title, a[title]');
        const title = titleEl?.textContent?.trim() || el.getAttribute('alt') || 'Unknown';
        
        const dateEl = card?.querySelector('.release_date, .date');
        const releaseYear = dateEl?.textContent ? 
          parseInt(dateEl.textContent.split(',')[0]) : undefined;

        return { title, releaseYear };
      });

      return metadata;
    } catch {
      return { title: 'Unknown Title' };
    }
  }

  /**
   * Extract posters using TMDB API (more reliable than scraping)
   */
  async extractPostersFromAPI(category: 'popular' | 'top_rated' | 'now_playing' = 'popular'): Promise<DiscoveredPoster[]> {
    const posters: DiscoveredPoster[] = [];
    
    if (!this.apiKey) {
      console.log('No TMDB API key, falling back to web scraping');
      return posters;
    }

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${category}?api_key=${this.apiKey}&language=en-US&page=1`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }

      const data = await response.json() as TMDBResponse;
      const maxPosters = this.config.maxPosters || 50;

      for (const movie of data.results.slice(0, maxPosters)) {
        if (!movie.poster_path) continue;

        const posterUrl = `${this.baseImageUrl}${movie.poster_path}`;
        const releaseYear = movie.release_date ? 
          parseInt(movie.release_date.split('-')[0]) : undefined;

        posters.push({
          posterUrl,
          pageUrl: `https://www.themoviedb.org/movie/${movie.id}`,
          metadata: {
            title: movie.title,
            titleId: movie.id.toString(),
            releaseYear,
            description: movie.overview,
          },
        });
      }

      console.log(`Extracted ${posters.length} posters from TMDB API`);
    } catch (error) {
      console.error('TMDB API error:', error);
    }

    return posters;
  }

  /**
   * Override to use API when available
   */
  async extractPosters(page: Page): Promise<DiscoveredPoster[]> {
    // Try API first
    const apiPosters = await this.extractPostersFromAPI();
    if (apiPosters.length > 0) {
      return apiPosters;
    }

    // Fall back to web scraping
    return super.extractPosters(page);
  }
}

/**
 * Demo extractor that uses curated public poster URLs
 * For testing when no API key is available
 */
export class DemoExtractor extends BasePlatformExtractor {
  constructor(config: Partial<ExtractorConfig> = {}) {
    super(Platform.NETFLIX, config);
  }

  getStartUrl(): string {
    return 'https://picsum.photos';
  }

  requiresAuth(): boolean {
    return false;
  }

  getPosterSelector(): string {
    return 'img';
  }

  async extractPosterMetadata(): Promise<PosterMetadata> {
    return { title: 'Demo Movie' };
  }

  /**
   * Generate demo posters using Lorem Picsum
   */
  async extractPosters(): Promise<DiscoveredPoster[]> {
    const posters: DiscoveredPoster[] = [];
    const maxPosters = this.config.maxPosters || 10;
    const timestamp = Date.now();

    const demoMovies = [
      { title: 'The Adventure Begins', year: 2024, genre: ['Action', 'Adventure'] },
      { title: 'Mystery of the Night', year: 2023, genre: ['Mystery', 'Thriller'] },
      { title: 'Love in Paris', year: 2024, genre: ['Romance', 'Drama'] },
      { title: 'Space Odyssey 2025', year: 2025, genre: ['Sci-Fi', 'Adventure'] },
      { title: 'The Last Stand', year: 2023, genre: ['Action', 'Drama'] },
      { title: 'Comedy Central', year: 2024, genre: ['Comedy'] },
      { title: 'Horror House', year: 2023, genre: ['Horror', 'Thriller'] },
      { title: 'Documentary: Earth', year: 2024, genre: ['Documentary'] },
      { title: 'Animated Dreams', year: 2024, genre: ['Animation', 'Family'] },
      { title: 'Crime Scene', year: 2023, genre: ['Crime', 'Drama'] },
    ];

    for (let i = 0; i < Math.min(maxPosters, demoMovies.length); i++) {
      const movie = demoMovies[i];
      posters.push({
        posterUrl: `https://picsum.photos/seed/safeart-${timestamp}-${i}/300/450`,
        pageUrl: `https://demo.safeart.example/movie/${i + 1}`,
        metadata: {
          title: movie.title,
          titleId: `demo-${i + 1}`,
          releaseYear: movie.year,
          genre: movie.genre,
        },
      });
    }

    console.log(`Generated ${posters.length} demo posters`);
    return posters;
  }
}

export default TMDBExtractor;
