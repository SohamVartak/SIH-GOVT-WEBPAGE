import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { KPICard } from '../ui/KPICard';

import {
  Layers,
  Database,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Building,
  ArrowRight,
  Sparkles,
  FileCheck,
  RefreshCw,
  Clock,
  ChevronRight,
  ArrowRightLeft,
  Brain,
} from 'lucide-react';

/* ============================================================
   TYPES
============================================================ */

interface DashboardStats {
  success: boolean;

  generated_at?: string;

  materials: {
    total: number;
    embeddings: number;
    embedding_coverage_percent: number;
  };

  ncs: {
    total: number;
    proposed: number;
    approved: number;
    rejected: number;
  };

  standardization_requests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    needs_more_data: number;
  };

  migration: {
    total: number;
    pending: number;
    ai_proposed: number;
    under_review: number;
    approved: number;
    rejected: number;
    migrated: number;
    progress_percent: number;
  };

  audit: {
    total: number;
    approvals: number;
    rejections: number;
    needs_more_data: number;
  };

  ml_feedback: {
    total: number;
    positive: number;
    negative: number;
    labeled: number;
  };

  national_master: {
    total_mappings: number;
    verified_mappings: number;
    verification_percent: number;
  };

  companies: {
    company: string;
    records: number;
  }[];
}

const EMPTY_STATS: DashboardStats = {
  success: true,

  materials: {
    total: 0,
    embeddings: 0,
    embedding_coverage_percent: 0,
  },

  ncs: {
    total: 0,
    proposed: 0,
    approved: 0,
    rejected: 0,
  },

  standardization_requests: {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    needs_more_data: 0,
  },

  migration: {
    total: 0,
    pending: 0,
    ai_proposed: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    migrated: 0,
    progress_percent: 0,
  },

  audit: {
    total: 0,
    approvals: 0,
    rejections: 0,
    needs_more_data: 0,
  },

  ml_feedback: {
    total: 0,
    positive: 0,
    negative: 0,
    labeled: 0,
  },

  national_master: {
    total_mappings: 0,
    verified_mappings: 0,
    verification_percent: 0,
  },

  companies: [],
};

/* ============================================================
   HELPERS
============================================================ */

function safeNumber(
  value: unknown
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatNumber(
  value: unknown
): string {
  return safeNumber(value).toLocaleString(
    'en-IN'
  );
}

function percentage(
  numerator: number,
  denominator: number
): number {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      (numerator / denominator) *
      100
    ).toFixed(1)
  );
}

/* ============================================================
   COMPONENT
============================================================ */

export const DashboardView: React.FC = () => {
  const {
    cpses,
    procurementOpportunities,
    setCurrentTab,
    setSelectedCPSEId,
    setSelectedOpportunityId,
    startSIHDemo,
  } = useApp();

  const [sectorFilter, setSectorFilter] =
    useState<string>('All');

  const [stats, setStats] =
    useState<DashboardStats>(
      EMPTY_STATS
    );

  const [loadingStats, setLoadingStats] =
    useState(true);

  const [refreshingStats, setRefreshingStats] =
    useState(false);

  const [statsError, setStatsError] =
    useState('');

  /* ==========================================================
     LIVE DASHBOARD API
  ========================================================== */

  const loadDashboardStats =
    async (
      showRefreshing = false
    ) => {
      try {
        if (showRefreshing) {
          setRefreshingStats(true);
        } else {
          setLoadingStats(true);
        }

        setStatsError('');

        const response =
          await fetch(
            '/api/dashboard-stats',
            {
              method: 'GET',
              cache: 'no-store',
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result?.details ||
              result?.error ||
              'Failed to load dashboard statistics.'
          );
        }

        setStats(result);
      } catch (error) {
        console.error(
          'Dashboard statistics error:',
          error
        );

        setStatsError(
          error instanceof Error
            ? error.message
            : 'Failed to load dashboard statistics.'
        );
      } finally {
        setLoadingStats(false);
        setRefreshingStats(false);
      }
    };

  useEffect(() => {
    loadDashboardStats();
  }, []);

  /* ==========================================================
     EXISTING CPSE DATA
  ========================================================== */

  const totalUploaded =
    cpses.reduce(
      (acc, c) =>
        acc +
        safeNumber(
          c.recordsUploaded
        ),
      0
    );

  const totalNormalized =
    cpses.reduce(
      (acc, c) =>
        acc +
        safeNumber(
          c.recordsNormalized
        ),
      0
    );

  const totalMatched =
    cpses.reduce(
      (acc, c) =>
        acc +
        safeNumber(
          c.recordsMatched
        ),
      0
    );

  const totalReviewBacklog =
    cpses.reduce(
      (acc, c) =>
        acc +
        safeNumber(
          c.reviewBacklog
        ),
      0
    );

  const avgQualityScore =
    cpses.length > 0
      ? Number(
          (
            cpses.reduce(
              (acc, c) =>
                acc +
                safeNumber(
                  c.qualityScore
                ),
              0
            ) /
            cpses.length
          ).toFixed(1)
        )
      : 0;

  const totalSavingsINR =
    procurementOpportunities.reduce(
      (acc, p) =>
        acc +
        safeNumber(
          p.projectedSavingsINR
        ),
      0
    );

  const filteredCPSEs =
    sectorFilter === 'All'
      ? cpses
      : cpses.filter(
          c =>
            c.sector ===
            sectorFilter
        );

  const sectors = [
    'All',
    'Oil & Gas',
    'Power',
    'Steel',
    'Mining',
    'Heavy Engineering',
    'Petrochemicals',
  ];

  /* ==========================================================
     LIVE NATIONAL METRICS
  ========================================================== */

  const materialTotal =
    safeNumber(
      stats.materials.total
    );

  const embeddedTotal =
    safeNumber(
      stats.materials.embeddings
    );

  const embeddingCoverage =
    safeNumber(
      stats.materials
        .embedding_coverage_percent
    );

  const ncsApproved =
    safeNumber(
      stats.ncs.approved
    );

  const ncsTotal =
    safeNumber(
      stats.ncs.total
    );

  const standardizationPending =
    safeNumber(
      stats.standardization_requests
        .pending
    );

  const migrationTotal =
    safeNumber(
      stats.migration.total
    );

  const migrationMigrated =
    safeNumber(
      stats.migration.migrated
    );

  const migrationProgress =
    safeNumber(
      stats.migration
        .progress_percent
    );

  const verifiedMappings =
    safeNumber(
      stats.national_master
        .verified_mappings
    );

  const totalMappings =
    safeNumber(
      stats.national_master
        .total_mappings
    );

  const feedbackTotal =
    safeNumber(
      stats.ml_feedback.total
    );

  const companyCount =
    stats.companies.length;

  const normalizationRate =
    percentage(
      totalNormalized,
      totalUploaded
    );

  const matchingRate =
    percentage(
      totalMatched,
      totalNormalized
    );

  const approvedNcsRate =
    percentage(
      ncsApproved,
      ncsTotal
    );

  const verifiedMappingRate =
    percentage(
      verifiedMappings,
      totalMappings
    );

  /* ==========================================================
     COMPANY COVERAGE
  ========================================================== */

  const topCompanies =
    useMemo(
      () =>
        stats.companies.slice(
          0,
          8
        ),
      [stats.companies]
    );

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="p-4 lg:p-7 space-y-6 w-full">

      {/* ======================================================
          TOP WELCOME
      ====================================================== */}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-7 shadow-xs">

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">

          <div className="space-y-2 max-w-4xl">

            <div className="flex flex-wrap items-center gap-2">

              <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider font-mono">
                Govt. of India • National Material Intelligence
              </span>

              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium px-2.5 py-0.5 rounded-md font-mono">
                {companyCount || 0} CPSE Data Sources
              </span>

            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              National Material Intelligence Platform
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal max-w-3xl">
              Unified material intelligence combining
              semantic retrieval, engineering validation,
              National Material Code governance, ERP
              migration, and auditable approval workflows.
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">

            <button
              onClick={() =>
                loadDashboardStats(true)
              }
              disabled={
                refreshingStats
              }
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  refreshingStats
                    ? 'animate-spin'
                    : ''
                }`}
              />
              Refresh Data
            </button>

            <button
              onClick={startSIHDemo}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>
                Interactive Walkthrough
              </span>
            </button>

            <button
              onClick={() =>
                setCurrentTab(
                  'upload'
                )
              }
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              <span>
                Ingest CPSE Batch
              </span>
            </button>

          </div>
        </div>

        {/* ====================================================
            LIVE STATUS STRIP
        ==================================================== */}

        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>

            <div>
              <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                Material Records
              </span>

              <span className="text-slate-900 font-bold text-xs">
                {loadingStats
                  ? 'Loading...'
                  : formatNumber(
                      materialTotal
                    )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <Brain className="w-4 h-4 text-slate-700 shrink-0" />

            <div>
              <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                Embedding Coverage
              </span>

              <span className="text-slate-900 font-bold text-xs">
                {embeddingCoverage.toFixed(
                  1
                )}
                %
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />

            <div>
              <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                Verified NCS Mappings
              </span>

              <span className="text-emerald-700 font-bold text-xs">
                {verifiedMappingRate.toFixed(
                  1
                )}
                %
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <TrendingUp className="w-4 h-4 text-slate-700 shrink-0" />

            <div>
              <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                Projected Savings
              </span>

              <span className="text-slate-900 font-bold font-mono text-xs">
                ₹
                {(
                  totalSavingsINR /
                  10000000
                ).toFixed(2)}{' '}
                Crore
              </span>
            </div>
          </div>

        </div>

        {statsError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            Live national statistics could not be loaded.
            Existing CPSE dashboard data is still available.
            <div className="mt-1 font-mono text-[10px]">
              {statsError}
            </div>
          </div>
        )}

      </div>

      {/* ======================================================
          LIVE KPI CARDS
      ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <KPICard
          label="Material Records"
          value={
            loadingStats
              ? '—'
              : materialTotal
          }
          trend={{
            value: `${embeddedTotal.toLocaleString(
              'en-IN'
            )} embedded`,
            direction: 'neutral',
          }}
          subtitle="Records in the national source database"
          icon={
            <Database className="w-4 h-4" />
          }
          delay={0}
        />

        <KPICard
          label="Normalized & Validated"
          value={
            totalNormalized
          }
          trend={{
            value: `${normalizationRate}% Yield`,
            direction: 'up',
          }}
          subtitle="Based on current CPSE ingestion metrics"
          icon={
            <FileCheck className="w-4 h-4" />
          }
          progressPercent={
            normalizationRate
          }
          progressLabel="Standardization Rate"
          delay={1}
        />

        <KPICard
          label="Approved NCS Materials"
          value={
            loadingStats
              ? '—'
              : ncsApproved
          }
          trend={{
            value: `${approvedNcsRate}% of NCS`,
            direction: 'neutral',
          }}
          subtitle="Approved records in the national master"
          icon={
            <CheckCircle2 className="w-4 h-4" />
          }
          iconBg="bg-emerald-50"
          iconColor="text-emerald-700"
          delay={2}
        />

        <KPICard
          label="Review Backlog"
          value={
            totalReviewBacklog +
            standardizationPending
          }
          trend={{
            value: `${standardizationPending.toLocaleString(
              'en-IN'
            )} DB requests`,
            direction: 'neutral',
          }}
          subtitle="CPSE backlog plus live standardization requests"
          icon={
            <AlertTriangle className="w-4 h-4" />
          }
          iconBg="bg-amber-50"
          iconColor="text-amber-700"
          delay={3}
        />

      </div>

      {/* ======================================================
          REAL PLATFORM STATUS
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                NCS Master
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(
                  ncsTotal
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {formatNumber(
                  ncsApproved
                )}{' '}
                approved
              </div>
            </div>

            <Layers className="w-6 h-6 text-blue-700" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                ERP Migration
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(
                  migrationTotal
                )}
              </div>

              <div className="mt-1 text-xs text-blue-700 font-semibold">
                {migrationProgress.toFixed(
                  1
                )}
                % completed
              </div>
            </div>

            <ArrowRightLeft className="w-6 h-6 text-blue-700" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Audit Events
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(
                  stats.audit.total
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {formatNumber(
                  stats.audit.approvals
                )}{' '}
                approvals
              </div>
            </div>

            <ShieldCheck className="w-6 h-6 text-emerald-700" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                ML Feedback
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(
                  feedbackTotal
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {formatNumber(
                  stats.ml_feedback.positive
                )}{' '}
                positive •{' '}
                {formatNumber(
                  stats.ml_feedback.negative
                )}{' '}
                negative
              </div>
            </div>

            <Cpu className="w-6 h-6 text-violet-700" />
          </div>
        </div>

      </div>

      {/* ======================================================
          HARMONIZATION FUNNEL + MIGRATION
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FUNNEL */}

        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                National Harmonization Funnel
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                Live platform progression from source records to
                governed national identities
              </p>
            </div>

            <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md">
              LIVE DATABASE
            </span>

          </div>

          <div className="space-y-2.5 pt-1">

            {/* STEP 1 */}

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center font-mono">
                  1
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Source Material Records
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Current material records available for processing
                  </div>
                </div>

              </div>

              <div className="flex items-center gap-4 text-right font-mono">

                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {formatNumber(
                      materialTotal
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    Source records
                  </div>
                </div>

                <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-slate-700 h-full w-full rounded-full" />
                </div>

              </div>

            </div>

            {/* STEP 2 */}

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-slate-700 text-white font-bold text-xs flex items-center justify-center font-mono">
                  2
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Semantic Intelligence Coverage
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Material records with generated vector embeddings
                  </div>
                </div>

              </div>

              <div className="flex items-center gap-4 text-right font-mono">

                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {formatNumber(
                      embeddedTotal
                    )}
                  </div>

                  <div className="text-[10px] text-slate-600">
                    {embeddingCoverage.toFixed(
                      1
                    )}
                    % embedded
                  </div>
                </div>

                <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-slate-600 h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        embeddingCoverage
                      )}%`,
                    }}
                  />
                </div>

              </div>

            </div>

            {/* STEP 3 */}

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-slate-700 text-white font-bold text-xs flex items-center justify-center font-mono">
                  3
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Engineering & NCS Governance
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Verified mappings and approved National Material Codes
                  </div>
                </div>

              </div>

              <div className="flex items-center gap-4 text-right font-mono">

                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {formatNumber(
                      verifiedMappings
                    )}
                  </div>

                  <div className="text-[10px] text-slate-600">
                    {verifiedMappingRate.toFixed(
                      1
                    )}
                    % verified
                  </div>
                </div>

                <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-slate-600 h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        verifiedMappingRate
                      )}%`,
                    }}
                  />
                </div>

              </div>

            </div>

            {/* STEP 4 */}

            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center font-mono">
                  4
                </div>

                <div>
                  <div className="text-xs font-semibold text-emerald-900">
                    ERP Migration Completion
                  </div>

                  <div className="text-[11px] text-emerald-700">
                    Approved legacy-to-national mappings migrated
                  </div>
                </div>

              </div>

              <div className="flex items-center gap-4 text-right font-mono">

                <div>
                  <div className="text-xs font-bold text-emerald-900">
                    {formatNumber(
                      migrationMigrated
                    )}
                  </div>

                  <div className="text-[10px] text-emerald-700">
                    {migrationProgress.toFixed(
                      1
                    )}
                    % of migration registry
                  </div>
                </div>

                <div className="w-24 bg-emerald-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-700 h-full rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        migrationProgress
                      )}%`,
                    }}
                  />
                </div>

              </div>

            </div>

          </div>

        </div>

        {/* MIGRATION STATUS */}

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">

          <div>

            <div className="flex items-start justify-between gap-3">

              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  ERP Migration Control
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">
                  Legacy material-code migration status
                </p>
              </div>

              <ArrowRightLeft className="w-5 h-5 text-blue-700" />

            </div>

            <div className="mt-5 space-y-3">

              {[
                [
                  'Pending',
                  stats.migration.pending,
                ],
                [
                  'AI Proposed',
                  stats.migration.ai_proposed,
                ],
                [
                  'Under Review',
                  stats.migration.under_review,
                ],
                [
                  'Approved',
                  stats.migration.approved,
                ],
                [
                  'Migrated',
                  stats.migration.migrated,
                ],
              ].map(
                ([label, value]) => {

                  const numericValue =
                    safeNumber(
                      value
                    );

                  const denominator =
                    migrationTotal ||
                    1;

                  const width =
                    Math.min(
                      100,
                      (
                        numericValue /
                        denominator
                      ) *
                        100
                    );

                  return (
                    <div
                      key={
                        String(label)
                      }
                      className="space-y-1"
                    >

                      <div className="flex items-center justify-between text-xs">

                        <span className="font-semibold text-slate-700">
                          {label}
                        </span>

                        <span className="font-mono font-bold text-slate-900">
                          {formatNumber(
                            numericValue
                          )}
                        </span>

                      </div>

                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">

                        <div
                          className="h-full bg-slate-700 rounded-full"
                          style={{
                            width: `${width}%`,
                          }}
                        />

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </div>

          <button
            onClick={() =>
              setCurrentTab(
                'migration'
              )
            }
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            Open ERP Migration
            <ArrowRight className="w-4 h-4" />
          </button>

        </div>

      </div>

      {/* ======================================================
          GOVERNANCE STATUS
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                NCS Governance
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                National Material Code approval state
              </p>
            </div>

            <ShieldCheck className="w-5 h-5 text-emerald-700" />

          </div>

          <div className="grid grid-cols-3 gap-2 mt-5">

            <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">
              <div className="text-[10px] uppercase font-bold text-violet-600">
                Proposed
              </div>

              <div className="mt-1 text-lg font-bold text-violet-800">
                {formatNumber(
                  stats.ncs.proposed
                )}
              </div>
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <div className="text-[10px] uppercase font-bold text-emerald-600">
                Approved
              </div>

              <div className="mt-1 text-lg font-bold text-emerald-800">
                {formatNumber(
                  stats.ncs.approved
                )}
              </div>
            </div>

            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <div className="text-[10px] uppercase font-bold text-red-600">
                Rejected
              </div>

              <div className="mt-1 text-lg font-bold text-red-800">
                {formatNumber(
                  stats.ncs.rejected
                )}
              </div>
            </div>

          </div>

          <button
            onClick={() =>
              setCurrentTab(
                'master'
              )
            }
            className="mt-5 w-full border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            Open Material Catalog
            <ArrowRight className="w-4 h-4" />
          </button>

        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                Review Governance
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Standardization decisions requiring controlled review
              </p>
            </div>

            <Clock className="w-5 h-5 text-amber-700" />

          </div>

          <div className="mt-5 space-y-3">

            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <span className="text-xs font-semibold text-amber-900">
                Pending
              </span>

              <span className="text-lg font-bold text-amber-800">
                {formatNumber(
                  stats.standardization_requests.pending
                )}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <span className="text-xs font-semibold text-slate-700">
                Needs More Data
              </span>

              <span className="text-lg font-bold text-slate-900">
                {formatNumber(
                  stats.standardization_requests
                    .needs_more_data
                )}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
              <span className="text-xs font-semibold text-emerald-800">
                Approved
              </span>

              <span className="text-lg font-bold text-emerald-800">
                {formatNumber(
                  stats.standardization_requests
                    .approved
                )}
              </span>
            </div>

          </div>

          <button
            onClick={() =>
              setCurrentTab(
                'review-queue'
              )
            }
            className="mt-5 w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            Open Review Queue
            <ArrowRight className="w-4 h-4" />
          </button>

        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                ML Learning Readiness
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Reviewer feedback available as training labels
              </p>
            </div>

            <Brain className="w-5 h-5 text-violet-700" />

          </div>

          <div className="mt-5">

            <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">

              <div className="text-[10px] uppercase tracking-wider font-bold text-violet-600">
                Collected Labels
              </div>

              <div className="mt-2 text-3xl font-bold text-violet-900">
                {formatNumber(
                  stats.ml_feedback.labeled
                )}
              </div>

              <div className="mt-2 text-xs text-violet-700">
                {formatNumber(
                  stats.ml_feedback.positive
                )}{' '}
                accepted •{' '}
                {formatNumber(
                  stats.ml_feedback.negative
                )}{' '}
                rejected
              </div>

            </div>

          </div>

          <div className="mt-4 text-[11px] leading-5 text-slate-500">
            These records are feedback labels for future
            supervised learning. They do not represent a
            separately trained custom model yet.
          </div>

          <button
            onClick={() =>
              setCurrentTab(
                'audit'
              )
            }
            className="mt-5 w-full border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            Open Audit Records
            <ArrowRight className="w-4 h-4" />
          </button>

        </div>

      </div>

      {/* ======================================================
          CPSE PERFORMANCE + SAVINGS
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* CPSE TABLE */}

        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                CPSE Master Data Performance
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                Current application-level ingestion and quality metrics
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">

              {sectors
                .slice(0, 4)
                .map(
                  sec => (
                    <button
                      key={sec}
                      onClick={() =>
                        setSectorFilter(
                          sec
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                        sectorFilter ===
                        sec
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {sec}
                    </button>
                  )
                )}

            </div>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-left text-xs">

              <thead>

                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-mono">

                  <th className="pb-3 font-semibold">
                    CPSE Entity
                  </th>

                  <th className="pb-3 font-semibold">
                    Sector
                  </th>

                  <th className="pb-3 font-semibold text-right">
                    Uploaded
                  </th>

                  <th className="pb-3 font-semibold text-right">
                    Quality
                  </th>

                  <th className="pb-3 font-semibold text-right">
                    Completeness
                  </th>

                  <th className="pb-3 font-semibold text-right">
                    Backlog
                  </th>

                  <th className="pb-3 font-semibold text-right">
                    Action
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {filteredCPSEs.map(
                  c => (
                    <tr
                      key={
                        c.id
                      }
                      onClick={() => {
                        setSelectedCPSEId(
                          c.id
                        );

                        setCurrentTab(
                          'cpse'
                        );
                      }}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >

                      <td className="py-3 font-bold text-slate-900 flex items-center gap-2.5">

                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              c.logoColor,
                          }}
                        />

                        <span className="group-hover:text-slate-700 transition-colors">
                          {c.name}
                        </span>

                        <span className="text-[10px] text-slate-400 font-mono">
                          ({c.code})
                        </span>

                      </td>

                      <td className="py-3 text-slate-600 font-normal">
                        {c.sector}
                      </td>

                      <td className="py-3 text-right font-mono font-semibold text-slate-800">
                        {safeNumber(
                          c.recordsUploaded
                        ).toLocaleString(
                          'en-IN'
                        )}
                      </td>

                      <td className="py-3 text-right font-mono">

                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold border ${
                            safeNumber(
                              c.qualityScore
                            ) >=
                            90
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : safeNumber(
                                  c.qualityScore
                                ) >=
                                80
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {safeNumber(
                            c.qualityScore
                          )}
                          %
                        </span>

                      </td>

                      <td className="py-3 text-right font-mono text-slate-700">
                        {safeNumber(
                          c.completenessRate
                        )}
                        %
                      </td>

                      <td className="py-3 text-right font-mono">

                        <span
                          className={`font-semibold px-2 py-0.5 rounded-md ${
                            safeNumber(
                              c.reviewBacklog
                            ) >
                            500
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-600'
                          }`}
                        >
                          {safeNumber(
                            c.reviewBacklog
                          )}
                        </span>

                      </td>

                      <td className="py-3 text-right">

                        <button
                          className="text-slate-400 group-hover:text-slate-900 font-semibold flex items-center justify-end gap-1 ml-auto transition-colors"
                        >
                          <span>
                            View
                          </span>

                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">
                Avg Quality
              </div>

              <div className="mt-1 text-lg font-bold text-slate-900">
                {avgQualityScore}%
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">
                Match Yield
              </div>

              <div className="mt-1 text-lg font-bold text-slate-900">
                {matchingRate}%
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] uppercase font-bold text-slate-500">
                Active CPSE Records
              </div>

              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatNumber(
                  totalUploaded
                )}
              </div>
            </div>

          </div>

        </div>

        {/* SAVINGS */}

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">

          <div>

            <div className="flex items-center justify-between">

              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  National Rate Opportunities
                </h2>

                <p className="text-xs text-slate-500 mt-0.5">
                  Aggregated procurement savings
                </p>
              </div>

              <button
                onClick={() =>
                  setCurrentTab(
                    'procurement'
                  )
                }
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                <span>
                  All Deals
                </span>

                <ArrowRight className="w-3.5 h-3.5" />
              </button>

            </div>

            <div className="space-y-2.5 mt-3">

              {procurementOpportunities
                .slice(
                  0,
                  3
                )
                .map(
                  opp => (
                    <div
                      key={
                        opp.id
                      }
                      onClick={() => {
                        setSelectedOpportunityId(
                          opp.id
                        );

                        setCurrentTab(
                          'procurement'
                        );
                      }}
                      className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/60 hover:bg-slate-50 transition-all cursor-pointer space-y-2 group shadow-2xs"
                    >

                      <div className="flex items-start justify-between gap-2">

                        <div>

                          <span className="text-[10px] font-mono font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {opp.id} •{' '}
                            {
                              opp.category
                            }
                          </span>

                          <h3 className="text-xs font-bold text-slate-900 mt-1 group-hover:text-slate-700 transition-colors">
                            {opp.title}
                          </h3>

                        </div>

                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                          -
                          {safeNumber(
                            opp.projectedSavingsPercent
                          )}
                          %
                        </span>

                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-200/60 font-mono">

                        <span>
                          {
                            opp.participatingCPSEs
                              .length
                          }{' '}
                          CPSEs Pooled
                        </span>

                        <span className="font-semibold text-slate-800">
                          ₹
                          {(
                            safeNumber(
                              opp.projectedSavingsINR
                            ) /
                            10000000
                          ).toFixed(
                            2
                          )}{' '}
                          Cr Savings
                        </span>

                      </div>

                    </div>
                  )
                )}

            </div>

          </div>

          <div className="bg-slate-900 text-white rounded-xl p-4.5 space-y-2.5 shadow-xs">

            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">

              <Sparkles className="w-4 h-4" />

              <span>
                What-If Savings Simulator
              </span>

            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Simulate bulk rate tenders using the existing
              procurement opportunity data.
            </p>

            <button
              onClick={() =>
                setCurrentTab(
                  'what-if'
                )
              }
              className="w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer active:scale-95"
            >
              Launch Simulator
            </button>

          </div>

        </div>

      </div>

      {/* ======================================================
          COMPANY COVERAGE
      ====================================================== */}

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

        <div className="flex items-center justify-between gap-4">

          <div>
            <h2 className="text-base font-bold text-slate-900">
              Material Database Coverage
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              Current source-record distribution by company
            </p>
          </div>

          <Building className="w-5 h-5 text-blue-700" />

        </div>

        {topCompanies.length === 0 ? (

          <div className="py-10 text-center text-sm text-slate-500">
            No company statistics available.
          </div>

        ) : (

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            {topCompanies.map(
              company => {

                const maxRecords =
                  topCompanies[0]
                    ?.records ||
                  1;

                const barWidth =
                  Math.min(
                    100,
                    (
                      company.records /
                      maxRecords
                    ) *
                      100
                  );

                return (
                  <div
                    key={
                      company.company
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="min-w-0">

                        <div className="text-xs font-bold text-slate-900 truncate">
                          {
                            company.company
                          }
                        </div>

                        <div className="text-[10px] text-slate-500 mt-1">
                          {formatNumber(
                            company.records
                          )}{' '}
                          records
                        </div>

                      </div>

                      <Database className="w-4 h-4 text-slate-400 shrink-0" />

                    </div>

                    <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">

                      <div
                        className="h-full bg-slate-700 rounded-full"
                        style={{
                          width: `${barWidth}%`,
                        }}
                      />

                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </div>

    </div>
  );
};

export default DashboardView;