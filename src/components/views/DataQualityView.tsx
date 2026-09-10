import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { ProgressBar } from '../ui/ProgressBar';
import { StatusBadge } from '../ui/StatusBadge';
import { AnimatedButton } from '../ui/AnimatedButton';

import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Building,
  Database,
  Search,
  Copy,
  FileWarning,
  GitMerge,
  ChevronDown,
  ArrowRight,
  XCircle,
} from 'lucide-react';

/* ============================================================
   TYPES
============================================================ */

interface IncompleteRecord {
  id: number;
  company: string | null;
  material_number: string | null;
  description: string | null;
  missing_fields: string[];
}

interface DuplicateMaterialNumberGroup {
  key: string;
  company: string;
  material_number: string;
  count: number;
  material_ids: number[];
}

interface ExactDescriptionDuplicateGroup {
  normalized_description: string;
  count: number;
  material_ids: number[];
  companies: string[];
}

interface PotentialCrossCompanyMatch {
  source_material_id: number;
  source_company: string;
  source_description: string;

  candidate_material_id: number;
  candidate_company: string;
  candidate_description: string;

  similarity_percent: number;
}

interface CompanyDistribution {
  company: string;
  records: number;
}

interface CategoryDistribution {
  category: string;
  records: number;
}

interface QualitySummary {
  total_records: number;
  complete_records: number;
  incomplete_records: number;
  completeness_percent: number;
  quality_score: number;

  missing_company: number;
  missing_material_number: number;
  missing_description: number;
  missing_specifications: number;

  duplicate_material_numbers: number;
  duplicate_material_number_groups: number;
  exact_description_duplicate_groups: number;
  potential_cross_company_matches: number;
}

interface QualityApiResponse {
  success: boolean;

  generated_at?: string;

  summary: QualitySummary;

  issues: {
    incomplete_records: IncompleteRecord[];
    duplicate_material_numbers: DuplicateMaterialNumberGroup[];
    exact_description_duplicates: ExactDescriptionDuplicateGroup[];
    potential_cross_company_matches: PotentialCrossCompanyMatch[];
  };

  company_distribution: CompanyDistribution[];
  category_distribution: CategoryDistribution[];
}

/* ============================================================
   HELPERS
============================================================ */

function safeNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatNumber(value: unknown): string {
  return safeNumber(value).toLocaleString(
    'en-IN'
  );
}

function formatDate(value?: string) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

/* ============================================================
   COMPONENT
============================================================ */

export const DataQualityView: React.FC = () => {
  const {
    qualityIssues,
    executeCleanupRule,
    cpses,
    addToast,
    setCurrentTab,
  } = useApp();

  /* ==========================================================
     LIVE QUALITY STATE
  ========================================================== */

  const [qualityData, setQualityData] =
    useState<QualityApiResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [apiError, setApiError] =
    useState('');

  /* ==========================================================
     LOCAL FILTERS
  ========================================================== */

  const [severityFilter, setSeverityFilter] =
    useState<
      'All' | 'High' | 'Medium' | 'Low'
    >('All');

  const [issueFilter, setIssueFilter] =
    useState<
      | 'all'
      | 'incomplete'
      | 'duplicate-code'
      | 'duplicate-description'
      | 'cross-company'
    >('all');

  const [search, setSearch] =
    useState('');

  const [expandedIssue, setExpandedIssue] =
    useState<string | null>(null);

  const [runningRuleId, setRunningRuleId] =
    useState<string | null>(null);

  /* ==========================================================
     LOAD QUALITY DATA
  ========================================================== */

  const loadQualityData =
    useCallback(
      async (
        showRefreshing = false
      ) => {
        try {
          if (showRefreshing) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setApiError('');

          const response =
            await fetch(
              '/api/data-quality',
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
                'Failed to load data-quality analysis.'
            );
          }

          setQualityData(
            result
          );
        } catch (error) {
          console.error(
            'Quality API error:',
            error
          );

          setApiError(
            error instanceof Error
              ? error.message
              : 'Failed to load live data-quality analysis.'
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    loadQualityData();
  }, [loadQualityData]);

  /* ==========================================================
     DATA FALLBACKS
  ========================================================== */

  const summary =
    qualityData?.summary || {
      total_records: 0,
      complete_records: 0,
      incomplete_records: 0,
      completeness_percent: 0,
      quality_score: 0,
      missing_company: 0,
      missing_material_number: 0,
      missing_description: 0,
      missing_specifications: 0,
      duplicate_material_numbers: 0,
      duplicate_material_number_groups: 0,
      exact_description_duplicate_groups: 0,
      potential_cross_company_matches: 0,
    };

  const incompleteRecords =
    qualityData?.issues
      ?.incomplete_records || [];

  const duplicateMaterialNumbers =
    qualityData?.issues
      ?.duplicate_material_numbers || [];

  const exactDescriptionDuplicates =
    qualityData?.issues
      ?.exact_description_duplicates || [];

  const potentialCrossCompanyMatches =
    qualityData?.issues
      ?.potential_cross_company_matches || [];

  const companyDistribution =
    qualityData
      ?.company_distribution || [];

  const categoryDistribution =
    qualityData
      ?.category_distribution || [];

  /* ==========================================================
     EXISTING MOCK QUALITY ISSUES
     
     Kept as a secondary legacy/remediation layer.
  ========================================================== */

  const fallbackFlaggedRecords =
    qualityIssues.reduce(
      (
        acc,
        q
      ) =>
        acc +
        (
          q.status ===
          'Open'
            ? safeNumber(
                q.affectedRecordsCount
              )
            : 0
        ),
      0
    );

  /* ==========================================================
     LIVE ISSUE COUNTS
  ========================================================== */

  const totalLiveIssues =
    summary.incomplete_records +
    summary.duplicate_material_numbers +
    summary.exact_description_duplicate_groups +
    summary.potential_cross_company_matches;

  const activeIssueCount =
    totalLiveIssues ||
    fallbackFlaggedRecords;

  /* ==========================================================
     ISSUE BUILDING
  ========================================================== */

  const liveIssueCards =
    useMemo(() => {
      const issues: {
        id: string;
        type:
          | 'incomplete'
          | 'duplicate-code'
          | 'duplicate-description'
          | 'cross-company';

        title: string;
        description: string;
        count: number;
        severity:
          | 'High'
          | 'Medium'
          | 'Low';
        icon: React.ReactNode;
        actionText: string;
      }[] = [];

      if (
        summary.incomplete_records >
        0
      ) {
        issues.push({
          id:
            'DQ-INCOMPLETE',

          type:
            'incomplete',

          title:
            'Incomplete Material Records',

          description:
            'Material records contain one or more missing core fields required for reliable standardization.',

          count:
            summary.incomplete_records,

          severity:
            summary.incomplete_records >
            summary.total_records * 0.2
              ? 'High'
              : 'Medium',

          icon:
            <FileWarning className="w-4 h-4" />,

          actionText:
            'Inspect incomplete records',
        });
      }

      if (
        summary.duplicate_material_numbers >
        0
      ) {
        issues.push({
          id:
            'DQ-DUP-CODE',

          type:
            'duplicate-code',

          title:
            'Duplicate Material Numbers',

          description:
            'The same CPSE material number appears more than once within a company.',

          count:
            summary.duplicate_material_numbers,

          severity:
            'High',

          icon:
            <Copy className="w-4 h-4" />,

          actionText:
            'Inspect duplicate codes',
        });
      }

      if (
        summary.exact_description_duplicate_groups >
        0
      ) {
        issues.push({
          id:
            'DQ-DUP-DESC',

          type:
            'duplicate-description',

          title:
            'Exact Description Duplicates',

          description:
            'Normalized descriptions occur multiple times and require review for possible duplicate identities.',

          count:
            summary.exact_description_duplicate_groups,

          severity:
            'Medium',

          icon:
            <GitMerge className="w-4 h-4" />,

          actionText:
            'Inspect description duplicates',
        });
      }

      if (
        summary.potential_cross_company_matches >
        0
      ) {
        issues.push({
          id:
            'DQ-CROSS-COMPANY',

          type:
            'cross-company',

          title:
            'Potential Cross-Company Duplicates',

          description:
            'Material descriptions show a high lexical similarity across different CPSEs.',

          count:
            summary.potential_cross_company_matches,

          severity:
            'High',

          icon:
            <ShieldAlert className="w-4 h-4" />,

          actionText:
            'Inspect cross-company candidates',
        });
      }

      return issues;
    }, [
      summary,
    ]);

  /* ==========================================================
     FILTERED LIVE ISSUES
  ========================================================== */

  const filteredLiveIssues =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return liveIssueCards.filter(
        issue => {
          const severityMatch =
            severityFilter ===
              'All' ||
            issue.severity ===
              severityFilter;

          const typeMatch =
            issueFilter ===
              'all' ||
            issue.type ===
              issueFilter;

          const searchMatch =
            !normalizedSearch ||
            issue.title
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            issue.description
              .toLowerCase()
              .includes(
                normalizedSearch
              );

          return (
            severityMatch &&
            typeMatch &&
            searchMatch
          );
        }
      );
    }, [
      liveIssueCards,
      severityFilter,
      issueFilter,
      search,
    ]);

  /* ==========================================================
     DETAIL DATA FOR EXPANSION
  ========================================================== */

  const renderIssueDetails = (
    type:
      | 'incomplete'
      | 'duplicate-code'
      | 'duplicate-description'
      | 'cross-company'
  ) => {
    if (
      type ===
      'incomplete'
    ) {
      return (
        <div className="space-y-2">
          {incompleteRecords
            .slice(0, 30)
            .map(record => (
              <div
                key={record.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Material ID #
                      {record.id}
                    </div>

                    <div className="mt-1 text-xs text-slate-600">
                      {record.company ||
                        'Company missing'}
                      {' • '}
                      {record.material_number ||
                        'Material number missing'}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400">
                    {
                      record.missing_fields
                        .length
                    }{' '}
                    missing
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {record.missing_fields.map(
                    field => (
                      <span
                        key={field}
                        className="px-2 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold"
                      >
                        {field.replaceAll(
                          '_',
                          ' '
                        )}
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}
        </div>
      );
    }

    if (
      type ===
      'duplicate-code'
    ) {
      return (
        <div className="space-y-2">
          {duplicateMaterialNumbers
            .slice(0, 30)
            .map(group => (
              <div
                key={group.key}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {group.company}
                    </div>

                    <div className="mt-1 text-xs font-mono text-blue-700">
                      {
                        group.material_number
                      }
                    </div>
                  </div>

                  <span className="px-2 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                    {group.count} records
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-slate-500 font-mono">
                  Material IDs:{' '}
                  {group.material_ids.join(
                    ', '
                  )}
                </div>
              </div>
            ))}
        </div>
      );
    }

    if (
      type ===
      'duplicate-description'
    ) {
      return (
        <div className="space-y-2">
          {exactDescriptionDuplicates
            .slice(0, 30)
            .map(
              (
                group,
                index
              ) => (
                <div
                  key={`${group.normalized_description}-${index}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="text-xs font-semibold text-slate-800">
                    {
                      group
                        .normalized_description
                    }
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                      {
                        group.count
                      }{' '}
                      records
                    </span>

                    {group.companies.map(
                      company => (
                        <span
                          key={
                            company
                          }
                          className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-semibold"
                        >
                          {
                            company
                          }
                        </span>
                      )
                    )}
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500 font-mono">
                    IDs:{' '}
                    {group.material_ids.join(
                      ', '
                    )}
                  </div>
                </div>
              )
            )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {potentialCrossCompanyMatches
          .slice(0, 30)
          .map(
            (
              match,
              index
            ) => (
              <div
                key={`${match.source_material_id}-${match.candidate_material_id}-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-center">

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {
                        match.source_company
                      }
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-900">
                      {
                        match.source_description
                      }
                    </div>

                    <div className="mt-1 text-[10px] text-slate-500">
                      Material ID #
                      {
                        match.source_material_id
                      }
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold">
                      {
                        match.similarity_percent
                      }%
                    </span>

                    <ArrowRight className="w-4 h-4 text-slate-300 mt-2" />
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {
                        match.candidate_company
                      }
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-900">
                      {
                        match.candidate_description
                      }
                    </div>

                    <div className="mt-1 text-[10px] text-slate-500">
                      Material ID #
                      {
                        match.candidate_material_id
                      }
                    </div>
                  </div>

                </div>
              </div>
            )
          )}
      </div>
    );
  };

  /* ==========================================================
     AUTO-CLEANUP
     
     Existing local rules are retained, but now clearly separated
     from the live database analyzer.
  ========================================================== */

  const handleRunRule = (
    id: string
  ) => {
    setRunningRuleId(id);

    setTimeout(() => {
      executeCleanupRule(id);

      setRunningRuleId(null);

      addToast({
        type: 'success',

        title:
          'Remediation Action Recorded',

        message:
          `Cleanup workflow recorded for ${id}.`,
      });
    }, 800);
  };

  /* ==========================================================
     CPSE QUALITY
  ========================================================== */

  const liveCompanyQuality =
    useMemo(() => {
      return cpses
        .map(cpse => ({
          ...cpse,
          liveRecords:
            companyDistribution.find(
              row =>
                row.company
                  .trim()
                  .toUpperCase() ===
                cpse.code
                  .trim()
                  .toUpperCase()
            )?.records || 0,
        }))
        .slice(
          0,
          8
        );
    }, [
      cpses,
      companyDistribution,
    ]);

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">

          <div>

            <div className="flex items-center flex-wrap gap-2">

              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Live Data Quality Engine
              </span>

              <span className="text-xs text-slate-400 font-mono">
                Database-backed analysis
              </span>

            </div>

            <h1 className="text-xl font-bold text-white tracking-tight mt-1">
              Catalog Completeness & Anomaly Remediation Center
            </h1>

            <p className="text-xs text-slate-300 max-w-3xl leading-5 mt-1">
              Detect missing technical data, duplicate material
              identifiers, repeated descriptions and potential
              cross-company equivalence candidates from the live
              national material database.
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-3">

            <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-300 font-mono">

              <span>
                Flagged Records:{' '}
              </span>

              <strong className="text-rose-400 font-bold ml-1">
                {formatNumber(
                  activeIssueCount
                )}
              </strong>

            </div>

            <button
              onClick={() =>
                loadQualityData(
                  true
                )
              }
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-white text-slate-800 hover:bg-slate-100 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >

              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  refreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Refresh Analysis

            </button>

          </div>

        </div>

        {apiError && (
          <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-300 px-3 py-2.5 text-xs">
            Live quality analysis unavailable.
            <div className="mt-1 font-mono text-[10px]">
              {apiError}
            </div>
          </div>
        )}

        {qualityData?.generated_at && (
          <div className="mt-3 text-[10px] text-slate-500 font-mono">
            Last analysis:{' '}
            {formatDate(
              qualityData.generated_at
            )}
          </div>
        )}

      </div>

      {/* ======================================================
          QUALITY KPI CARDS
      ====================================================== */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <motion.div
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >

          <div className="flex items-center justify-between">

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Quality Score
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {loading
                  ? '—'
                  : `${summary.quality_score}`}
              </div>
            </div>

            <ShieldAlert className="w-5 h-5 text-blue-700" />

          </div>

          <div className="mt-2">
            <ProgressBar
              value={
                safeNumber(
                  summary.quality_score
                )
              }
              max={100}
              variant={
                summary.quality_score >=
                90
                  ? 'emerald'
                  : 'amber'
              }
              size="sm"
            />
          </div>

        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.05,
          }}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >

          <div className="flex items-center justify-between">

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Completeness
              </div>

              <div className="mt-2 text-2xl font-bold text-slate-900">
                {loading
                  ? '—'
                  : `${summary.completeness_percent}%`}
              </div>
            </div>

            <CheckCircle2 className="w-5 h-5 text-emerald-700" />

          </div>

          <div className="mt-2">
            <ProgressBar
              value={
                safeNumber(
                  summary.completeness_percent
                )
              }
              max={100}
              variant="emerald"
              size="sm"
            />
          </div>

        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.1,
          }}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >

          <div className="flex items-center justify-between">

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Incomplete Records
              </div>

              <div className="mt-2 text-2xl font-bold text-rose-700">
                {loading
                  ? '—'
                  : formatNumber(
                      summary.incomplete_records
                    )}
              </div>
            </div>

            <FileWarning className="w-5 h-5 text-rose-700" />

          </div>

          <div className="mt-2 text-[10px] text-slate-500">
            Missing one or more core material fields
          </div>

        </motion.div>

        <motion.div
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.15,
          }}
          className="bg-white rounded-xl border border-slate-200 p-4"
        >

          <div className="flex items-center justify-between">

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Cross-Company Candidates
              </div>

              <div className="mt-2 text-2xl font-bold text-violet-700">
                {loading
                  ? '—'
                  : formatNumber(
                      summary.potential_cross_company_matches
                    )}
              </div>
            </div>

            <GitMerge className="w-5 h-5 text-violet-700" />

          </div>

          <div className="mt-2 text-[10px] text-slate-500">
            High lexical similarity requiring engineering review
          </div>

        </motion.div>

      </div>

      {/* ======================================================
          DATA PROFILE
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* FIELD COMPLETENESS */}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                Field Completeness
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Missing-value distribution in the live dataset
              </p>
            </div>

            <Database className="w-5 h-5 text-slate-400" />

          </div>

          <div className="mt-5 space-y-3">

            {[
              [
                'Company',
                summary.missing_company,
              ],
              [
                'Material Number',
                summary.missing_material_number,
              ],
              [
                'Description',
                summary.missing_description,
              ],
              [
                'Specifications',
                summary.missing_specifications,
              ],
            ].map(
              ([label, value]) => {

                const numericValue =
                  safeNumber(
                    value
                  );

                const percent =
                  summary.total_records >
                  0
                    ? (
                        (
                          numericValue /
                          summary.total_records
                        ) *
                        100
                      )
                    : 0;

                return (
                  <div
                    key={
                      String(label)
                    }
                    className="space-y-1.5"
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

                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">

                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{
                          width: `${Math.min(
                            100,
                            percent
                          )}%`,
                        }}
                      />

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>

        {/* COMPANY DISTRIBUTION */}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                CPSE Database Distribution
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Live material-record coverage
              </p>
            </div>

            <Building className="w-5 h-5 text-slate-400" />

          </div>

          <div className="mt-4 space-y-2.5">

            {companyDistribution
              .slice(
                0,
                7
              )
              .map(
                company => {

                  const maxRecords =
                    companyDistribution[0]
                      ?.records ||
                    1;

                  return (
                    <div
                      key={
                        company.company
                      }
                    >

                      <div className="flex items-center justify-between text-xs mb-1">

                        <span className="font-semibold text-slate-700">
                          {
                            company.company
                          }
                        </span>

                        <span className="font-mono font-bold text-slate-900">
                          {formatNumber(
                            company.records
                          )}
                        </span>

                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">

                        <div
                          className="h-full bg-slate-700 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              (
                                company.records /
                                maxRecords
                              ) *
                                100
                            )}%`,
                          }}
                        />

                      </div>

                    </div>
                  );
                }
              )}

          </div>

        </div>

        {/* CATEGORY DISTRIBUTION */}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">

          <div className="flex items-center justify-between">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                Category Coverage
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Most represented material categories
              </p>
            </div>

            <Layers className="w-5 h-5 text-slate-400" />

          </div>

          <div className="mt-4 space-y-2">

            {categoryDistribution
              .slice(
                0,
                7
              )
              .map(
                category => (
                  <div
                    key={
                      category.category
                    }
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2"
                  >

                    <span className="text-xs font-semibold text-slate-700 truncate">
                      {
                        category.category
                      }
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-900">
                      {formatNumber(
                        category.records
                      )}
                    </span>

                  </div>
                )
              )}

            {categoryDistribution.length ===
              0 && (
              <div className="text-xs text-slate-500 py-6 text-center">
                No category data available.
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ======================================================
          ISSUE FILTERS
      ====================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">

          <div>

            <h2 className="text-base font-bold text-slate-900">
              Active Quality Non-Conformances
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              Live database findings requiring remediation or engineering review
            </p>

          </div>

          <div className="relative w-full xl:w-80">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

            <input
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search quality findings..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />

          </div>

        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-between">

          <div className="flex flex-wrap gap-1.5">

            {(
              [
                'All',
                'High',
                'Medium',
                'Low',
              ] as const
            ).map(
              severity => (
                <button
                  key={
                    severity
                  }
                  onClick={() =>
                    setSeverityFilter(
                      severity
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    severityFilter ===
                    severity
                      ? 'bg-slate-900 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {severity}
                </button>
              )
            )}

          </div>

          <div className="flex flex-wrap gap-1.5">

            {[
              [
                'all',
                'All Issues',
              ],
              [
                'incomplete',
                'Incomplete',
              ],
              [
                'duplicate-code',
                'Duplicate Codes',
              ],
              [
                'duplicate-description',
                'Duplicate Descriptions',
              ],
              [
                'cross-company',
                'Cross-Company',
              ],
            ].map(
              ([value, label]) => (
                <button
                  key={value}
                  onClick={() =>
                    setIssueFilter(
                      value as
                        | 'all'
                        | 'incomplete'
                        | 'duplicate-code'
                        | 'duplicate-description'
                        | 'cross-company'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    issueFilter ===
                    value
                      ? 'bg-blue-700 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            )}

          </div>

        </div>

        {/* ====================================================
            LIVE ISSUE LIST
        ==================================================== */}

        <div className="mt-5 space-y-3">

          {loading ? (

            <div className="py-12 text-center">

              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />

              <div className="mt-3 text-sm text-slate-600">
                Running live data-quality analysis...
              </div>

            </div>

          ) : filteredLiveIssues.length ===
            0 ? (

            <div className="py-12 text-center rounded-xl border border-dashed border-slate-300">

              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />

              <div className="mt-3 text-sm font-bold text-slate-800">
                No matching quality findings
              </div>

              <div className="mt-1 text-xs text-slate-500">
                The selected filters returned no active live-data findings.
              </div>

            </div>

          ) : (

            <AnimatePresence mode="popLayout">

              {filteredLiveIssues.map(
                issue => {

                  const expanded =
                    expandedIssue ===
                    issue.id;

                  const running =
                    runningRuleId ===
                    issue.id;

                  return (
                    <motion.div
                      key={
                        issue.id
                      }
                      layout
                      initial={{
                        opacity: 0,
                        y: 10,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.97,
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all overflow-hidden"
                    >

                      <div className="p-4">

                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">

                          <div className="flex items-center gap-2">

                            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                              {
                                issue.icon
                              }
                            </span>

                            <div>

                              <div className="flex items-center flex-wrap gap-2">

                                <span className="text-xs font-bold text-slate-900">
                                  {
                                    issue.title
                                  }
                                </span>

                                <StatusBadge
                                  status={
                                    issue.severity ===
                                    'High'
                                      ? 'danger'
                                      : issue.severity ===
                                        'Medium'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                  label={`${issue.severity} Severity`}
                                  size="sm"
                                />

                              </div>

                              <div className="text-[11px] text-slate-500 mt-1">
                                {
                                  issue.description
                                }
                              </div>

                            </div>

                          </div>

                          <div className="flex items-center gap-3">

                            <div className="text-right">

                              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                Findings
                              </div>

                              <div className="text-lg font-bold text-slate-900 font-mono">
                                {formatNumber(
                                  issue.count
                                )}
                              </div>

                            </div>

                            <button
                              onClick={() =>
                                setExpandedIssue(
                                  expanded
                                    ? null
                                    : issue.id
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              {expanded
                                ? 'Close'
                                : 'Inspect'}

                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${
                                  expanded
                                    ? 'rotate-180'
                                    : ''
                                }`}
                              />

                            </button>

                          </div>

                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">

                          <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-semibold text-slate-600">
                            Live DB Finding
                          </span>

                          {issue.type ===
                            'cross-company' && (
                            <span className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-700">
                              Engineering Review Candidate
                            </span>
                          )}

                          {issue.type ===
                            'duplicate-code' && (
                            <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-semibold text-rose-700">
                              Identifier Conflict
                            </span>
                          )}

                          {issue.type ===
                            'incomplete' && (
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700">
                              Data Remediation Required
                            </span>
                          )}

                        </div>

                      </div>

                      {expanded && (
                        <div className="border-t border-slate-200 bg-slate-50 p-4">

                          <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Detailed Findings
                          </div>

                          {renderIssueDetails(
                            issue.type
                          )}

                        </div>
                      )}

                    </motion.div>
                  );
                }
              )}

            </AnimatePresence>

          )}

        </div>

      </div>

      {/* ======================================================
          EXISTING RULE ENGINE
      ====================================================== */}

      {qualityIssues.length >
        0 && (

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">

          <div className="flex items-center justify-between gap-4">

            <div>

              <div className="flex items-center gap-2">

                <Sparkles className="w-4 h-4 text-emerald-700" />

                <h2 className="text-base font-bold text-slate-900">
                  Rule Engine Remediation Queue
                </h2>

              </div>

              <p className="text-xs text-slate-500 mt-1">
                Existing application remediation actions retained alongside the live database analyzer.
              </p>

            </div>

            <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600">
              {qualityIssues.length}{' '}
              Rules
            </span>

          </div>

          <div className="mt-4 space-y-3">

            {qualityIssues
              .filter(
                issue =>
                  issue.status ===
                  'Open'
              )
              .slice(
                0,
                10
              )
              .map(
                issue => {

                  const running =
                    runningRuleId ===
                    issue.id;

                  return (
                    <div
                      key={
                        issue.id
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                    >

                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">

                        <div>

                          <div className="flex items-center gap-2 flex-wrap">

                            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                              {
                                issue.id
                              }
                            </span>

                            <span className="text-xs font-bold text-slate-900">
                              {
                                issue.issueType
                              }
                            </span>

                            <StatusBadge
                              status={
                                issue.severity ===
                                'High'
                                  ? 'danger'
                                  : issue.severity ===
                                    'Medium'
                                    ? 'warning'
                                    : 'neutral'
                              }
                              label={`${issue.severity} Severity`}
                              size="sm"
                            />

                          </div>

                          <div className="mt-2 text-[11px] text-slate-500">
                            {
                              issue.cpseName
                            }{' '}
                            (
                            {
                              issue.cpseCode
                            }
                            ) ·{' '}
                            {formatNumber(
                              issue.affectedRecordsCount
                            )}{' '}
                            affected records
                          </div>

                          <div className="mt-1 text-[11px] text-slate-600">
                            {
                              issue.suggestedFix
                            }
                          </div>

                        </div>

                        <AnimatedButton
                          onClick={() =>
                            handleRunRule(
                              issue.id
                            )
                          }
                          isLoading={
                            running
                          }
                          variant="primary"
                          size="sm"
                          icon={
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          }
                        >
                          {running
                            ? 'Remediating...'
                            : 'Run Auto-Cleanup Rule'}
                        </AnimatedButton>

                      </div>

                    </div>
                  );
                }
              )}

          </div>

        </div>

      )}

      {/* ======================================================
          FOOTER ACTIONS
      ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        <button
          onClick={() =>
            setCurrentTab(
              'ai-match'
            )
          }
          className="rounded-xl bg-slate-900 text-white px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          Open AI Spec Matcher
        </button>

        <button
          onClick={() =>
            setCurrentTab(
              'review-queue'
            )
          }
          className="rounded-xl bg-amber-600 text-white px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-700 cursor-pointer"
        >
          <AlertTriangle className="w-4 h-4" />
          Open Review Queue
        </button>

        <button
          onClick={() =>
            setCurrentTab(
              'audit'
            )
          }
          className="rounded-xl border border-slate-300 bg-white text-slate-700 px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 cursor-pointer"
        >
          <ShieldAlert className="w-4 h-4" />
          Open Audit Center
        </button>

      </div>

    </div>
  );
};

export default DataQualityView;