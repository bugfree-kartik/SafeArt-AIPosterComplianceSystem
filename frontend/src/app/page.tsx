'use client';

import { useState, useEffect } from 'react';

// Types
interface Job {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CACHED';
  platform: string;
  title: string;
  posterUrl?: string;
  s3Key?: string;
  isCompliant?: boolean;
  violations?: Array<{
    code: string;
    severity: string;
    message: string;
    confidence: number;
  }>;
  createdAt: string;
  completedAt?: string;
  processingDurationMs?: number;
}

// Demo data - In production, this would come from your API
const DEMO_JOBS: Job[] = [
  {
    jobId: '92e9bfa8035a4dc8aba721f893d347f4',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Boys: Season 4',
    posterUrl: 'https://picsum.photos/seed/prime-boys/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Graphic superhero violence detected', confidence: 0.91 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'MEDIUM', message: 'Dark thematic content', confidence: 0.74 }
    ],
    createdAt: '2026-01-25T18:27:10Z',
    completedAt: '2026-01-25T18:27:12Z',
    processingDurationMs: 126,
  },
  {
    jobId: 'd4f2fddaa693520bed8f7b3ddb8ebb6d',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Reacher: Season 2',
    posterUrl: 'https://picsum.photos/seed/prime-reacher/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'MEDIUM', message: 'Action violence scenes', confidence: 0.68 },
      { code: 'WEAPONS', severity: 'LOW', message: 'Firearms visible', confidence: 0.52 }
    ],
    createdAt: '2026-01-25T18:27:11Z',
    completedAt: '2026-01-25T18:27:13Z',
    processingDurationMs: 98,
  },
  {
    jobId: 'b533a6429e870439b3f87d0d9b1f47e0',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Marvelous Mrs. Maisel',
    posterUrl: 'https://picsum.photos/seed/prime-maisel/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:12Z',
    completedAt: '2026-01-25T18:27:14Z',
    processingDurationMs: 145,
  },
  {
    jobId: 'c8b6464e80a03875d9989f5211e3f49a',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Invincible: Season 2',
    posterUrl: 'https://picsum.photos/seed/prime-invincible/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'CRITICAL', message: 'Extreme animated violence and gore', confidence: 0.95 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'HIGH', message: 'Graphic injury depictions', confidence: 0.87 }
    ],
    createdAt: '2026-01-25T18:27:12Z',
    completedAt: '2026-01-25T18:27:15Z',
    processingDurationMs: 203,
  },
  {
    jobId: '998d6a09cf85d95646a17ee723c40fd5',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Fallout',
    posterUrl: 'https://picsum.photos/seed/prime-fallout/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Post-apocalyptic violence', confidence: 0.82 },
      { code: 'WEAPONS', severity: 'MEDIUM', message: 'Various weapons displayed', confidence: 0.71 }
    ],
    createdAt: '2026-01-25T18:27:13Z',
    completedAt: '2026-01-25T18:27:16Z',
    processingDurationMs: 112,
  },
  {
    jobId: '1dca6bb8f4edf9a958da2b515493fbac',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Fleabag',
    posterUrl: 'https://picsum.photos/seed/prime-fleabag/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:13Z',
    completedAt: '2026-01-25T18:27:17Z',
    processingDurationMs: 89,
  },
  {
    jobId: 'c1e17b6e26d61ccb90cbc8e227a8831c',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Hunters',
    posterUrl: 'https://picsum.photos/seed/prime-hunters/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Historical violence depicted', confidence: 0.85 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'HIGH', message: 'Disturbing historical imagery', confidence: 0.79 }
    ],
    createdAt: '2026-01-25T18:27:14Z',
    completedAt: '2026-01-25T18:27:18Z',
    processingDurationMs: 178,
  },
  {
    jobId: '33d2a4b64b5ffa1ba1dc352f666fe31c',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Grand Tour',
    posterUrl: 'https://picsum.photos/seed/prime-grandtour/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:15Z',
    completedAt: '2026-01-25T18:27:19Z',
    processingDurationMs: 134,
  },
  {
    jobId: '61d5eaab9b75c1f7e8bd12b0a9eac8eb',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Good Omens',
    posterUrl: 'https://picsum.photos/seed/prime-omens/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:15Z',
    completedAt: '2026-01-25T18:27:20Z',
    processingDurationMs: 95,
  },
  {
    jobId: '03d58f8017982d86a3525fb9ea5dffaf',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Jack Ryan: Season 4',
    posterUrl: 'https://picsum.photos/seed/prime-jackryan/300/450',
    isCompliant: false,
    violations: [
      { code: 'WEAPONS', severity: 'HIGH', message: 'Military weapons prominently featured', confidence: 0.88 },
      { code: 'VIOLENCE', severity: 'MEDIUM', message: 'Action combat sequences', confidence: 0.72 }
    ],
    createdAt: '2026-01-25T18:27:16Z',
    completedAt: '2026-01-25T18:27:21Z',
    processingDurationMs: 167,
  },
  {
    jobId: 'a1b2c3d4e5f6g7h8i9j0k1l2',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Citadel',
    posterUrl: 'https://picsum.photos/seed/prime-citadel/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'MEDIUM', message: 'Spy action violence', confidence: 0.69 },
      { code: 'WEAPONS', severity: 'MEDIUM', message: 'Various weapons shown', confidence: 0.64 }
    ],
    createdAt: '2026-01-25T18:28:10Z',
    completedAt: '2026-01-25T18:28:15Z',
    processingDurationMs: 234,
  },
  {
    jobId: 'b2c3d4e5f6g7h8i9j0k1l2m3',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Wheel of Time',
    posterUrl: 'https://picsum.photos/seed/prime-wheeltime/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:11Z',
    completedAt: '2026-01-25T18:28:16Z',
    processingDurationMs: 189,
  },
  {
    jobId: 'c3d4e5f6g7h8i9j0k1l2m3n4',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Upload: Season 3',
    posterUrl: 'https://picsum.photos/seed/prime-upload/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:12Z',
    completedAt: '2026-01-25T18:28:17Z',
    processingDurationMs: 78,
  },
  {
    jobId: 'd4e5f6g7h8i9j0k1l2m3n4o5',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Terminal List',
    posterUrl: 'https://picsum.photos/seed/prime-terminal/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Military combat violence', confidence: 0.89 },
      { code: 'WEAPONS', severity: 'HIGH', message: 'Heavy military weaponry', confidence: 0.91 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'MEDIUM', message: 'Intense thriller content', confidence: 0.67 }
    ],
    createdAt: '2026-01-25T18:28:13Z',
    completedAt: '2026-01-25T18:28:20Z',
    processingDurationMs: 312,
  },
  {
    jobId: 'e5f6g7h8i9j0k1l2m3n4o5p6',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Summer I Turned Pretty',
    posterUrl: 'https://picsum.photos/seed/prime-summer/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:14Z',
    completedAt: '2026-01-25T18:28:18Z',
    processingDurationMs: 92,
  },
  {
    jobId: 'f6g7h8i9j0k1l2m3n4o5p6q7',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Peripheral',
    posterUrl: 'https://picsum.photos/seed/prime-peripheral/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:15Z',
    completedAt: '2026-01-25T18:28:19Z',
    processingDurationMs: 156,
  },
  {
    jobId: 'g7h8i9j0k1l2m3n4o5p6q7r8',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Gen V',
    posterUrl: 'https://picsum.photos/seed/prime-genv/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Superhero violence and gore', confidence: 0.88 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'HIGH', message: 'Mature thematic elements', confidence: 0.81 },
      { code: 'NUDITY', severity: 'MEDIUM', message: 'Partial nudity detected', confidence: 0.56 }
    ],
    createdAt: '2026-01-25T18:28:16Z',
    completedAt: '2026-01-25T18:28:22Z',
    processingDurationMs: 267,
  },
  {
    jobId: 'h8i9j0k1l2m3n4o5p6q7r8s9',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'A League of Their Own',
    posterUrl: 'https://picsum.photos/seed/prime-league/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:17Z',
    completedAt: '2026-01-25T18:28:21Z',
    processingDurationMs: 104,
  },
  {
    jobId: 'i9j0k1l2m3n4o5p6q7r8s9t0',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'The Lord of the Rings: Rings of Power',
    posterUrl: 'https://picsum.photos/seed/prime-rings/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:28:18Z',
    completedAt: '2026-01-25T18:28:22Z',
    processingDurationMs: 87,
  },
  {
    jobId: 'j0k1l2m3n4o5p6q7r8s9t0u1',
    status: 'COMPLETED',
    platform: 'PRIME_VIDEO',
    title: 'Mr. & Mrs. Smith',
    posterUrl: 'https://picsum.photos/seed/prime-smith/300/450',
    isCompliant: false,
    violations: [
      { code: 'WEAPONS', severity: 'MEDIUM', message: 'Firearms in spy scenes', confidence: 0.73 },
      { code: 'VIOLENCE', severity: 'LOW', message: 'Action sequences', confidence: 0.48 }
    ],
    createdAt: '2026-01-25T18:28:19Z',
    completedAt: '2026-01-25T18:28:24Z',
    processingDurationMs: 198,
  },
];

// Status badge component
function StatusBadge({ status }: { status: Job['status'] }) {
  const styles = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    PROCESSING: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    FAILED: 'bg-red-500/20 text-red-300 border-red-500/30',
    CACHED: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status]}`}>
      {status}
    </span>
  );
}

// Compliance badge component
function ComplianceBadge({ isCompliant, violations }: { isCompliant?: boolean; violations?: Job['violations'] }) {
  if (isCompliant === undefined) return null;
  
  if (isCompliant) {
    return (
      <div className="flex items-center gap-1.5 text-emerald-400">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-medium">Compliant</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-red-400">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-medium">Non-Compliant</span>
      </div>
      {violations && violations.length > 0 && (
        <div className="text-xs text-gray-400">
          {violations.map((v, i) => (
            <span key={i} className="inline-block mr-2">
              <span className={`
                ${v.severity === 'HIGH' ? 'text-red-400' : ''}
                ${v.severity === 'MEDIUM' ? 'text-amber-400' : ''}
                ${v.severity === 'LOW' ? 'text-yellow-400' : ''}
              `}>
                {v.code}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Poster card component
function PosterCard({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="group relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl overflow-hidden border border-gray-700/50 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1"
    >
      {/* Poster Image */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img 
          src={job.posterUrl} 
          alt={job.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-80" />
        
        {/* Compliance indicator */}
        <div className="absolute top-3 right-3">
          {job.isCompliant !== undefined && (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              job.isCompliant 
                ? 'bg-emerald-500/90 shadow-lg shadow-emerald-500/30' 
                : 'bg-red-500/90 shadow-lg shadow-red-500/30'
            }`}>
              {job.isCompliant ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Platform badge */}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-1 text-xs font-bold rounded bg-black/60 text-white backdrop-blur-sm">
            {job.platform}
          </span>
        </div>
      </div>

      {/* Card content */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-white text-lg leading-tight line-clamp-2 group-hover:text-cyan-300 transition-colors">
          {job.title}
        </h3>
        
        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} />
          {job.processingDurationMs && (
            <span className="text-xs text-gray-500">
              {job.processingDurationMs}ms
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal component for poster details
function PosterModal({ job, onClose }: { job: Job | null; onClose: () => void }) {
  if (!job) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          {/* Poster */}
          <div className="md:w-1/2">
            <img 
              src={job.posterUrl} 
              alt={job.title}
              className="w-full h-full object-cover rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none"
            />
          </div>
          
          {/* Details */}
          <div className="md:w-1/2 p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-2xl font-bold text-white">{job.title}</h2>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Platform:</span>
                <span className="text-white font-medium">{job.platform}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-400">Status:</span>
                <StatusBadge status={job.status} />
              </div>

              <div>
                <span className="text-gray-400">Compliance:</span>
                <div className="mt-2">
                  <ComplianceBadge isCompliant={job.isCompliant} violations={job.violations} />
                </div>
              </div>

              {job.violations && job.violations.length > 0 && (
                <div>
                  <span className="text-gray-400">Violations:</span>
                  <div className="mt-2 space-y-2">
                    {job.violations.map((v, i) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{v.code}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            v.severity === 'HIGH' ? 'bg-red-500/20 text-red-300' :
                            v.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300' :
                            'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {v.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{v.message}</p>
                        <p className="text-xs text-gray-500 mt-1">Confidence: {(v.confidence * 100).toFixed(0)}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-700 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Job ID:</span>
                  <span className="text-gray-300 font-mono text-xs">{job.jobId.slice(0, 12)}...</span>
                </div>
                {job.processingDurationMs && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Processing Time:</span>
                    <span className="text-gray-300">{job.processingDurationMs}ms</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Created:</span>
                  <span className="text-gray-300">{new Date(job.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stats card component
function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-4 border border-gray-700/50`}>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>(DEMO_JOBS);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<'all' | 'compliant' | 'non-compliant'>('all');

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    if (filter === 'compliant') return job.isCompliant === true;
    if (filter === 'non-compliant') return job.isCompliant === false;
    return true;
  });

  const stats = {
    total: jobs.length,
    compliant: jobs.filter(j => j.isCompliant === true).length,
    nonCompliant: jobs.filter(j => j.isCompliant === false).length,
    pending: jobs.filter(j => j.status === 'PENDING').length,
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">SafeArt</h1>
                <p className="text-xs text-gray-400">AI Poster Compliance System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-medium border border-emerald-500/30">
                ● Live
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Posters" value={stats.total} color="from-gray-800 to-gray-900" />
          <StatCard label="Compliant" value={stats.compliant} color="from-emerald-900/50 to-emerald-950/50" />
          <StatCard label="Non-Compliant" value={stats.nonCompliant} color="from-red-900/50 to-red-950/50" />
          <StatCard label="Pass Rate" value={`${((stats.compliant / stats.total) * 100).toFixed(0)}%`} color="from-cyan-900/50 to-cyan-950/50" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-gray-400 text-sm">Filter:</span>
          {(['all', 'compliant', 'non-compliant'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'compliant' ? '✓ Compliant' : '✗ Non-Compliant'}
            </button>
          ))}
        </div>

        {/* Poster Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredJobs.map((job) => (
            <PosterCard 
              key={job.jobId} 
              job={job} 
              onClick={() => setSelectedJob(job)}
            />
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400">No posters found matching your filter.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>SafeArt AI Poster Compliance System • Built with Next.js & AWS</p>
          <p className="mt-1">Powered by AWS Rekognition for AI-based content moderation</p>
        </div>
      </footer>

      {/* Modal */}
      <PosterModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
