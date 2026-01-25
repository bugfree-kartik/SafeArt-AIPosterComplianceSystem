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
    platform: 'NETFLIX',
    title: 'The Adventure Begins',
    posterUrl: 'https://picsum.photos/seed/safeart-adventure/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:10Z',
    completedAt: '2026-01-25T18:27:12Z',
    processingDurationMs: 126,
  },
  {
    jobId: 'd4f2fddaa693520bed8f7b3ddb8ebb6d',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Mystery of the Night',
    posterUrl: 'https://picsum.photos/seed/safeart-mystery/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:11Z',
    completedAt: '2026-01-25T18:27:13Z',
    processingDurationMs: 98,
  },
  {
    jobId: 'b533a6429e870439b3f87d0d9b1f47e0',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Love in Paris',
    posterUrl: 'https://picsum.photos/seed/safeart-love/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:12Z',
    completedAt: '2026-01-25T18:27:14Z',
    processingDurationMs: 145,
  },
  {
    jobId: 'c8b6464e80a03875d9989f5211e3f49a',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Space Odyssey 2025',
    posterUrl: 'https://picsum.photos/seed/safeart-space/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'MEDIUM', message: 'Mild violence detected', confidence: 0.72 }
    ],
    createdAt: '2026-01-25T18:27:12Z',
    completedAt: '2026-01-25T18:27:15Z',
    processingDurationMs: 203,
  },
  {
    jobId: '998d6a09cf85d95646a17ee723c40fd5',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'The Last Stand',
    posterUrl: 'https://picsum.photos/seed/safeart-stand/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:13Z',
    completedAt: '2026-01-25T18:27:16Z',
    processingDurationMs: 112,
  },
  {
    jobId: '1dca6bb8f4edf9a958da2b515493fbac',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Comedy Central',
    posterUrl: 'https://picsum.photos/seed/safeart-comedy/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:13Z',
    completedAt: '2026-01-25T18:27:17Z',
    processingDurationMs: 89,
  },
  {
    jobId: 'c1e17b6e26d61ccb90cbc8e227a8831c',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Horror House',
    posterUrl: 'https://picsum.photos/seed/safeart-horror/300/450',
    isCompliant: false,
    violations: [
      { code: 'VIOLENCE', severity: 'HIGH', message: 'Graphic violence detected', confidence: 0.85 },
      { code: 'INAPPROPRIATE_CONTENT', severity: 'MEDIUM', message: 'Disturbing imagery', confidence: 0.67 }
    ],
    createdAt: '2026-01-25T18:27:14Z',
    completedAt: '2026-01-25T18:27:18Z',
    processingDurationMs: 178,
  },
  {
    jobId: '33d2a4b64b5ffa1ba1dc352f666fe31c',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Documentary: Earth',
    posterUrl: 'https://picsum.photos/seed/safeart-earth/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:15Z',
    completedAt: '2026-01-25T18:27:19Z',
    processingDurationMs: 134,
  },
  {
    jobId: '61d5eaab9b75c1f7e8bd12b0a9eac8eb',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Animated Dreams',
    posterUrl: 'https://picsum.photos/seed/safeart-animated/300/450',
    isCompliant: true,
    violations: [],
    createdAt: '2026-01-25T18:27:15Z',
    completedAt: '2026-01-25T18:27:20Z',
    processingDurationMs: 95,
  },
  {
    jobId: '03d58f8017982d86a3525fb9ea5dffaf',
    status: 'COMPLETED',
    platform: 'NETFLIX',
    title: 'Crime Scene',
    posterUrl: 'https://picsum.photos/seed/safeart-crime/300/450',
    isCompliant: false,
    violations: [
      { code: 'WEAPONS', severity: 'LOW', message: 'Weapon visible', confidence: 0.58 }
    ],
    createdAt: '2026-01-25T18:27:16Z',
    completedAt: '2026-01-25T18:27:21Z',
    processingDurationMs: 167,
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
