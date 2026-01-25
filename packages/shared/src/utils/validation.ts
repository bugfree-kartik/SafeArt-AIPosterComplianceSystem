import { CreateJobRequest, Platform } from '../models';

/**
 * Validate a job creation request
 */
export function validateCreateJobRequest(request: CreateJobRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.platform || !Object.values(Platform).includes(request.platform)) {
    errors.push('Invalid or missing platform');
  }

  if (!request.posterUrl || typeof request.posterUrl !== 'string') {
    errors.push('Invalid or missing posterUrl');
  } else {
    try {
      new URL(request.posterUrl);
    } catch {
      errors.push('posterUrl must be a valid URL');
    }
  }

  if (!request.metadata || !request.metadata.title) {
    errors.push('Missing required metadata.title');
  }

  if (request.pageUrl) {
    try {
      new URL(request.pageUrl);
    } catch {
      errors.push('pageUrl must be a valid URL if provided');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

