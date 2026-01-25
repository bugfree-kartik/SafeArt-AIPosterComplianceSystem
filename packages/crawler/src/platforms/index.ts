/**
 * Platform Extractors Index
 * 
 * Export all platform-specific extractors
 */

export { BasePlatformExtractor, ExtractorConfig, DEFAULT_EXTRACTOR_CONFIG } from './base';
export { NetflixExtractor } from './netflix';
export { TMDBExtractor, DemoExtractor } from './tmdb';

import { Platform } from '@safeart/shared';
import { BasePlatformExtractor, ExtractorConfig } from './base';
import { NetflixExtractor } from './netflix';
import { TMDBExtractor, DemoExtractor } from './tmdb';

/**
 * Factory function to create the appropriate extractor for a platform
 */
export function createExtractor(
  platform: Platform,
  config: Partial<ExtractorConfig> = {},
  options: { useDemo?: boolean; tmdbApiKey?: string } = {}
): BasePlatformExtractor {
  const { useDemo = false, tmdbApiKey } = options;

  // Use demo extractor for testing
  if (useDemo) {
    console.log('Using demo extractor for testing');
    return new DemoExtractor(config);
  }

  // Use TMDB if API key is available
  if (tmdbApiKey) {
    console.log('Using TMDB extractor with API key');
    return new TMDBExtractor(config, tmdbApiKey);
  }

  // Platform-specific extractors
  switch (platform) {
    case Platform.NETFLIX:
      return new NetflixExtractor(config);
    
    case Platform.PRIME_VIDEO:
      // TODO: Implement PrimeVideoExtractor
      console.log('Prime Video extractor not implemented, using demo');
      return new DemoExtractor(config);
    
    case Platform.DISNEY_PLUS:
      // TODO: Implement DisneyPlusExtractor
      console.log('Disney+ extractor not implemented, using demo');
      return new DemoExtractor(config);
    
    case Platform.HULU:
      // TODO: Implement HuluExtractor
      console.log('Hulu extractor not implemented, using demo');
      return new DemoExtractor(config);
    
    case Platform.HBO_MAX:
      // TODO: Implement HBOMaxExtractor
      console.log('HBO Max extractor not implemented, using demo');
      return new DemoExtractor(config);
    
    case Platform.APPLE_TV:
      // TODO: Implement AppleTVExtractor
      console.log('Apple TV extractor not implemented, using demo');
      return new DemoExtractor(config);
    
    default:
      console.log(`Unknown platform: ${platform}, using demo`);
      return new DemoExtractor(config);
  }
}
