import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  motion,
  AnimatePresence,
} from 'motion/react';

import {
  CheckSquare,
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  Clock3,
  Building,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ============================================================
   TYPES
============================================================ */

interface ReviewMapping {
  material_id: number;
  company: string;
  company_id: number | null;
  material_number: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
  ai_confidence: number;
  ai_reason: string | null;
  match_status: string;
  verified: boolean;
}

interface ReviewItem {
  request_id: number | string;
  ncs_id: number | string;
  ncs_code: string | null;
  ncs_name: string | null;
  ncs_category: string | null;
  ncs_specification: string | null;
  ncs_status: string;
  status: string;
  database_status: string | null;
  priority: string;
  highest_confidence: number;
  created_by_ai: boolean;
  reviewed_by: string | null;
  review_date: string | null;
  government_comments: string | null;
  companies: string[];
  mappings: ReviewMapping[];
  difference_analysis: string[];
  submitted_at: string;
}

interface ReviewSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  needs_more_data: number;
}

type ActionType =
  | 'APPROVE'
  | 'REJECT'
  | 'NEEDS_MORE_DATA';

/* ============================================================
   HELPERS
============================================================ */

const safeText = (
  value: unknown
) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 'Not available';
  }

  return String(value);
};

const statusClasses = (
  status: string
) => {
  const value = String(
    status || ''
  )
    .trim()
    .toUpperCase();

  if (
    value === 'APPROVED'
  ) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (
    value === 'REJECTED'
  ) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }

  if (
    value === 'NEEDS MORE DATA' ||
    value === 'NEEDS_MORE_DATA'
  ) {
    return 'bg-orange-50 text-orange-700 border-orange-200';
  }

  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const priorityClasses = (
  priority: string
) => {
  const value = String(
    priority || ''
  )
    .trim()
    .toUpperCase();

  if (
    value === 'CRITICAL'
  ) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }

  if (
    value === 'HIGH'
  ) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return 'bg-slate-100 text-slate-600 border-slate-200';
};

/* ============================================================
   COMPONENT
============================================================ */

export const ReviewQueueView: React.FC =
  () => {
    const [reviews, setReviews] =
      useState<ReviewItem[]>([]);

    const [summary, setSummary] =
      useState<ReviewSummary>({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        needs_more_data: 0,
      });

    const [activeTab, setActiveTab] =
      useState<
        | 'Pending'
        | 'High Priority'
        | 'Needs More Data'
        | 'Approved'
        | 'Rejected'
        | 'All'
      >('Pending');

    const [search, setSearch] =
      useState('');

    const [loading, setLoading] =
      useState(true);

    const [error, setError] =
      useState('');

    const [
      actionLoading,
      setActionLoading,
    ] = useState<
      number | string | null
    >(null);

    const [
      actionError,
      setActionError,
    ] = useState('');

    const [
      expandedId,
      setExpandedId,
    ] =
      useState<
        number | string | null
      >(null);

    /* ========================================================
       LOAD REAL REVIEW QUEUE
    ======================================================== */

    const loadReviews = async (
      showLoading = true
    ) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError('');
        setActionError('');

        const response =
          await fetch(
            '/api/standardization-requests',
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
            result.error ||
              'Failed to load review queue.'
          );
        }

        setReviews(
          result.results || []
        );

        setSummary(
          result.summary || {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            needs_more_data: 0,
          }
        );
      } catch (err) {
        console.error(
          'Review queue load error:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load review queue.'
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    };

    useEffect(() => {
      void loadReviews();
    }, []);

    /* ========================================================
       PERFORM DATABASE ACTION
    ======================================================== */

    const performAction = async (
      item: ReviewItem,
      action: ActionType
    ) => {
      if (
        actionLoading !== null
      ) {
        return;
      }

      const actionLabels: Record<
        ActionType,
        string
      > = {
        APPROVE:
          'approve this national material identity',
        REJECT:
          'reject this national material proposal',
        NEEDS_MORE_DATA:
          'request additional technical data',
      };

      const confirmed =
        window.confirm(
          `Are you sure you want to ${actionLabels[action]}?\n\nNCS: ${
            item.ncs_code ||
            'Not available'
          }\nMaterial: ${
            item.ncs_name ||
            'Not available'
          }`
        );

      if (!confirmed) {
        return;
      }

      let comments = '';

      if (
        action ===
        'REJECT'
      ) {
        comments =
          window.prompt(
            'Enter the reason for rejecting this national material proposal:'
          ) || '';

        if (
          !comments.trim()
        ) {
          window.alert(
            'A rejection reason is required.'
          );

          return;
        }
      }

      if (
        action ===
        'NEEDS_MORE_DATA'
      ) {
        comments =
          window.prompt(
            'Enter the additional technical information/documentation required:'
          ) || '';

        if (
          !comments.trim()
        ) {
          window.alert(
            'Please specify what additional data is required.'
          );

          return;
        }
      }

      if (
        action ===
        'APPROVE'
      ) {
        comments =
          window.prompt(
            'Optional approval comment:'
          ) || '';
      }

      try {
        setActionLoading(
          item.request_id
        );

        setActionError('');

        const response =
          await fetch(
            '/api/standardization-action',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                requestId:
                  item.request_id,

                action,

                reviewer:
                  'Material Master Officer',

                comments:
                  comments.trim(),
              }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              'The database action failed.'
          );
        }

        window.alert(
          result.message ||
            'Action completed successfully.'
        );

        setExpandedId(
          null
        );

        await loadReviews(
          false
        );
      } catch (err) {
        console.error(
          'Standardization action error:',
          err
        );

        setActionError(
          err instanceof Error
            ? err.message
            : 'The requested action could not be completed.'
        );
      } finally {
        setActionLoading(
          null
        );
      }
    };

    /* ========================================================
       FILTER REVIEW ITEMS
    ======================================================== */

    const filteredReviews =
      useMemo(() => {
        const q =
          search
            .trim()
            .toLowerCase();

        return reviews.filter(
          (review) => {
            const status =
              String(
                review.status || ''
              )
                .trim()
                .toUpperCase();

            let matchesTab =
              false;

            if (
              activeTab ===
              'All'
            ) {
              matchesTab =
                true;
            } else if (
              activeTab ===
              'Pending'
            ) {
              matchesTab =
                status ===
                  'PENDING' ||
                status ===
                  'HIGH PRIORITY' ||
                status ===
                  'HIGH';
            } else if (
              activeTab ===
              'High Priority'
            ) {
              const priority =
                String(
                  review.priority ||
                    ''
                ).toUpperCase();

              matchesTab =
                priority ===
                  'HIGH' ||
                priority ===
                  'CRITICAL';
            } else if (
              activeTab ===
              'Needs More Data'
            ) {
              matchesTab =
                status ===
                'NEEDS MORE DATA';
            } else {
              matchesTab =
                status ===
                activeTab.toUpperCase();
            }

            if (
              !matchesTab
            ) {
              return false;
            }

            if (!q) {
              return true;
            }

            const nationalText =
              [
                review.request_id,
                review.ncs_id,
                review.ncs_code,
                review.ncs_name,
                review.ncs_category,
                review.ncs_specification,
                review.priority,
                review.status,
                ...(review.companies ||
                  []),
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            const materialText =
              review.mappings
                .map(
                  (mapping) =>
                    [
                      mapping.company,
                      mapping.material_number,
                      mapping.description,
                      mapping.specifications,
                      mapping.category,
                      mapping.ai_reason,
                    ]
                      .filter(Boolean)
                      .join(' ')
                )
                .join(' ')
                .toLowerCase();

            return (
              nationalText.includes(
                q
              ) ||
              materialText.includes(
                q
              )
            );
          }
        );
      }, [
        reviews,
        search,
        activeTab,
      ]);

    /* ========================================================
       TAB COUNTS
    ======================================================== */

    const tabCounts =
      useMemo(() => {
        const all =
          reviews.length;

        const pending =
          reviews.filter(
            (review) => {
              const status =
                String(
                  review.status ||
                    ''
                ).toUpperCase();

              return (
                status ===
                  'PENDING' ||
                status ===
                  'HIGH PRIORITY' ||
                status ===
                  'HIGH'
              );
            }
          ).length;

        const highPriority =
          reviews.filter(
            (review) => {
              const priority =
                String(
                  review.priority ||
                    ''
                ).toUpperCase();

              return (
                priority ===
                  'HIGH' ||
                priority ===
                  'CRITICAL'
              );
            }
          ).length;

        const needsMoreData =
          reviews.filter(
            (review) =>
              String(
                review.status ||
                  ''
              ).toUpperCase() ===
              'NEEDS MORE DATA'
          ).length;

        const approved =
          reviews.filter(
            (review) =>
              String(
                review.status ||
                  ''
              ).toUpperCase() ===
              'APPROVED'
          ).length;

        const rejected =
          reviews.filter(
            (review) =>
              String(
                review.status ||
                  ''
              ).toUpperCase() ===
              'REJECTED'
          ).length;

        return {
          all,
          pending,
          highPriority,
          needsMoreData,
          approved,
          rejected,
        };
      }, [reviews]);

    /* ========================================================
       LOADING STATE
    ======================================================== */

    if (loading) {
      return (
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">

            <RefreshCw className="w-8 h-8 mx-auto text-emerald-400 animate-spin mb-4" />

            <h2 className="text-sm font-bold text-white">
              Loading Government Review Queue
            </h2>

            <p className="text-xs text-slate-400 mt-2">
              Loading AI standardization proposals from Supabase.
            </p>

          </div>

        </div>
      );
    }

    /* ========================================================
       ERROR STATE
    ======================================================== */

    if (error) {
      return (
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">

          <div className="bg-white border border-red-200 rounded-2xl p-12 text-center">

            <XCircle className="w-10 h-10 mx-auto text-red-300 mb-3" />

            <h2 className="text-sm font-bold text-slate-900">
              Review Queue Could Not Be Loaded
            </h2>

            <p className="text-xs text-red-600 mt-2">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadReviews()
              }
              className="mt-5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold"
            >
              Retry
            </button>

          </div>

        </div>
      );
    }

    return (
      <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

            <div>

              <div className="flex items-center gap-2 flex-wrap">

                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  Human-in-the-Loop Governance
                </span>

                <span className="text-xs text-slate-400 font-mono">
                  Live Supabase Queue
                </span>

              </div>

              <h1 className="text-xl font-bold text-white tracking-tight mt-1">
                Material Master Officer Review Queue
              </h1>

              <p className="text-xs text-slate-300">
                AI-generated national material proposals requiring engineering and government validation.
              </p>

            </div>

            <div className="flex items-center gap-3">

              <button
                type="button"
                onClick={() =>
                  void loadReviews()
                }
                disabled={
                  loading ||
                  actionLoading !==
                    null
                }
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono flex items-center gap-2"
              >

                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    loading
                      ? 'animate-spin'
                      : ''
                  }`}
                />

                Refresh

              </button>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-300 font-mono">

                <span>
                  Pending Review:{' '}
                </span>

                <strong className="text-emerald-400 font-bold ml-1">
                  {summary.pending}
                </strong>

              </div>

            </div>

          </div>

          {/* =================================================
              SUMMARY
          ================================================= */}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800">

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">

              <div className="text-[9px] text-slate-400 font-mono">
                TOTAL
              </div>

              <div className="text-2xl font-bold text-white font-mono mt-1">
                {summary.total}
              </div>

            </div>

            <div className="bg-slate-800 border border-amber-900/40 rounded-xl p-3">

              <div className="text-[9px] text-slate-400 font-mono">
                PENDING
              </div>

              <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                {summary.pending}
              </div>

            </div>

            <div className="bg-slate-800 border border-emerald-900/40 rounded-xl p-3">

              <div className="text-[9px] text-slate-400 font-mono">
                APPROVED
              </div>

              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {summary.approved}
              </div>

            </div>

            <div className="bg-slate-800 border border-rose-900/40 rounded-xl p-3">

              <div className="text-[9px] text-slate-400 font-mono">
                REJECTED
              </div>

              <div className="text-2xl font-bold text-rose-400 font-mono mt-1">
                {summary.rejected}
              </div>

            </div>

            <div className="bg-slate-800 border border-orange-900/40 rounded-xl p-3">

              <div className="text-[9px] text-slate-400 font-mono">
                MORE DATA
              </div>

              <div className="text-2xl font-bold text-orange-400 font-mono mt-1">
                {summary.needs_more_data}
              </div>

            </div>

          </div>

        </div>

        {/* =====================================================
            ACTION ERROR
        ===================================================== */}

        {actionError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3">

            <div>

              <div className="text-xs font-bold text-rose-800">
                Database Action Failed
              </div>

              <div className="text-xs text-rose-700 mt-1">
                {actionError}
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                setActionError('')
              }
              className="text-rose-500 hover:text-rose-700 text-xs font-bold"
            >
              Close
            </button>

          </div>
        )}

        {/* =====================================================
            FILTER BAR
        ===================================================== */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            <div className="flex items-center gap-1 overflow-x-auto pb-1">

              {(
                [
                  [
                    'Pending',
                    tabCounts.pending,
                  ],
                  [
                    'High Priority',
                    tabCounts.highPriority,
                  ],
                  [
                    'Needs More Data',
                    tabCounts.needsMoreData,
                  ],
                  [
                    'Approved',
                    tabCounts.approved,
                  ],
                  [
                    'Rejected',
                    tabCounts.rejected,
                  ],
                  [
                    'All',
                    tabCounts.all,
                  ],
                ] as const
              ).map(
                ([
                  tab,
                  count,
                ]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() =>
                      setActiveTab(
                        tab
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      activeTab ===
                      tab
                        ? 'bg-slate-900 text-white font-bold shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab} ({count})
                  </button>
                )
              )}

            </div>

            <div className="relative w-full lg:w-72">

              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search NCS, CPSE or material..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
              />

            </div>

          </div>

        </div>

        {/* =====================================================
            EMPTY STATE
        ===================================================== */}

        {filteredReviews.length ===
          0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">

            <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300 mb-3" />

            <h2 className="text-sm font-bold text-slate-800">
              Queue is clear
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              No database review requests match the current filter.
            </p>

          </div>
        )}

        {/* =====================================================
            REVIEW ITEMS
        ===================================================== */}

        {filteredReviews.length >
          0 && (
          <div className="space-y-4">

            <AnimatePresence mode="popLayout">

              {filteredReviews.map(
                (item) => {
                  const expanded =
                    expandedId ===
                    item.request_id;

                  const isApproved =
                    String(
                      item.status
                    ).toUpperCase() ===
                    'APPROVED';

                  const isRejected =
                    String(
                      item.status
                    ).toUpperCase() ===
                    'REJECTED';

                  const isActionBusy =
                    actionLoading ===
                    item.request_id;

                  return (
                    <motion.div
                      key={String(
                        item.request_id
                      )}
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
                      transition={{
                        duration: 0.2,
                      }}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                    >

                      {/* ===================================
                          TOP CONTENT
                      =================================== */}

                      <div className="p-5">

                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">

                          <div className="flex items-center gap-2 flex-wrap">

                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                              REQ-{item.request_id}
                            </span>

                            <span
                              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${statusClasses(
                                item.status
                              )}`}
                            >
                              {safeText(
                                item.status
                              )}
                            </span>

                            <span
                              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${priorityClasses(
                                item.priority
                              )}`}
                            >
                              {safeText(
                                item.priority
                              )}{' '}
                              Priority
                            </span>

                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">

                            <span className="flex items-center gap-1">

                              <Clock3 className="w-3.5 h-3.5" />

                              AI Generated
                              {item.created_by_ai
                                ? ' • Yes'
                                : ' • No'}

                            </span>

                            <span>
                              NCS ID:{' '}
                              {safeText(
                                item.ncs_id
                              )}
                            </span>

                          </div>

                        </div>

                        {/* =================================
                            NATIONAL IDENTITY
                        ================================= */}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">

                          <div className="lg:col-span-2">

                            <div className="flex items-center gap-2">

                              <ShieldCheck className="w-5 h-5 text-emerald-600" />

                              <span className="text-[10px] text-slate-400 font-mono uppercase">
                                Proposed National Identity
                              </span>

                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-2">

                              <span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-mono text-xs font-bold">
                                {safeText(
                                  item.ncs_code
                                )}
                              </span>

                              <h2 className="text-lg font-bold text-slate-900">
                                {safeText(
                                  item.ncs_name
                                )}
                              </h2>

                            </div>

                            <p className="text-xs text-slate-500 mt-2">
                              {safeText(
                                item.ncs_specification
                              )}
                            </p>

                          </div>

                          <div className="grid grid-cols-2 gap-3">

                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">

                              <div className="text-[9px] text-slate-400 font-mono uppercase">
                                CPSEs
                              </div>

                              <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                                {item.companies.length}
                              </div>

                            </div>

                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">

                              <div className="text-[9px] text-slate-400 font-mono uppercase">
                                AI Confidence
                              </div>

                              <div className="text-xl font-bold text-blue-600 font-mono mt-1">
                                {item.highest_confidence}%
                              </div>

                            </div>

                          </div>

                        </div>

                        {/* =================================
                            CPSE BADGES
                        ================================= */}

                        <div className="flex flex-wrap gap-2 mt-5">

                          {item.companies.map(
                            (company) => (
                              <span
                                key={company}
                                className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono font-bold px-2 py-1 rounded"
                              >
                                <Building className="w-3 h-3" />

                                {company}

                              </span>
                            )
                          )}

                        </div>

                        {/* =================================
                            MAPPING PREVIEW
                        ================================= */}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">

                          {item.mappings.map(
                            (mapping) => (
                              <div
                                key={`${item.request_id}-${mapping.material_id}`}
                                className="bg-slate-50 border border-slate-200 rounded-xl p-4"
                              >

                                <div className="flex items-center justify-between gap-2">

                                  <span className="text-xs font-bold text-slate-800">
                                    {safeText(
                                      mapping.company
                                    )}
                                  </span>

                                  <span className="text-[10px] font-mono font-bold text-blue-700">
                                    {mapping.ai_confidence}%
                                  </span>

                                </div>

                                <div className="mt-3">

                                  <div className="text-[9px] text-slate-400 font-mono uppercase">
                                    CPSE Material Code
                                  </div>

                                  <div className="text-sm font-mono font-bold text-slate-900 mt-1 break-all">
                                    {safeText(
                                      mapping.material_number
                                    )}
                                  </div>

                                </div>

                                <div className="mt-3">

                                  <div className="text-[9px] text-slate-400 font-mono uppercase">
                                    Description
                                  </div>

                                  <div className="text-xs font-semibold text-slate-800 mt-1">
                                    {safeText(
                                      mapping.description
                                    )}
                                  </div>

                                </div>

                              </div>
                            )
                          )}

                        </div>

                        {/* =================================
                            EXPAND / DETAILS
                        ================================= */}

                        <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">

                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">

                            <CheckSquare className="w-4 h-4" />

                            {item.mappings.length}{' '}
                            CPSE mapping
                            {item.mappings.length ===
                            1
                              ? ''
                              : 's'}

                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(
                                expanded
                                  ? null
                                  : item.request_id
                              )
                            }
                            className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                          >

                            {expanded
                              ? 'Hide Technical Details'
                              : 'View Technical Details'}

                            {expanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}

                          </button>

                        </div>

                      </div>

                      {/* ===================================
                          EXPANDED TECHNICAL DATA
                      =================================== */}

                      {expanded && (
                        <div className="bg-slate-50 border-t border-slate-200 p-5 space-y-5">

                          <div>

                            <h3 className="text-sm font-bold text-slate-900">
                              CPSE Material Mapping Details
                            </h3>

                            <p className="text-[10px] text-slate-500 mt-1">
                              Existing CPSE material codes remain traceable under the proposed national identity.
                            </p>

                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                            {item.mappings.map(
                              (mapping) => (
                                <div
                                  key={`detail-${item.request_id}-${mapping.material_id}`}
                                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                                >

                                  <div className="flex items-center justify-between">

                                    <span className="bg-slate-900 text-white text-[10px] font-mono font-bold px-2 py-1 rounded">
                                      {safeText(
                                        mapping.company
                                      )}
                                    </span>

                                    <span
                                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded-full border ${
                                        mapping.verified
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                    >
                                      {mapping.verified
                                        ? 'VERIFIED'
                                        : 'AI PROPOSED'}
                                    </span>

                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                                    <div>

                                      <div className="text-[9px] text-slate-400 font-mono uppercase">
                                        Material Code
                                      </div>

                                      <div className="text-xs font-mono font-bold text-slate-900 mt-1 break-all">
                                        {safeText(
                                          mapping.material_number
                                        )}
                                      </div>

                                    </div>

                                    <div>

                                      <div className="text-[9px] text-slate-400 font-mono uppercase">
                                        Category
                                      </div>

                                      <div className="text-xs text-slate-700 mt-1">
                                        {safeText(
                                          mapping.category
                                        )}
                                      </div>

                                    </div>

                                  </div>

                                  <div>

                                    <div className="text-[9px] text-slate-400 font-mono uppercase">
                                      Description
                                    </div>

                                    <div className="text-xs font-semibold text-slate-800 mt-1">
                                      {safeText(
                                        mapping.description
                                      )}
                                    </div>

                                  </div>

                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">

                                    <div className="text-[9px] text-slate-400 font-mono uppercase">
                                      Specifications
                                    </div>

                                    <div className="text-xs text-slate-700 mt-1 leading-relaxed">
                                      {safeText(
                                        mapping.specifications
                                      )}
                                    </div>

                                  </div>

                                  <div className="border-t border-slate-100 pt-3">

                                    <div className="flex items-center justify-between gap-3">

                                      <span className="text-[9px] text-slate-400 font-mono">
                                        Match Status
                                      </span>

                                      <span className="text-[10px] font-mono font-bold text-slate-700">
                                        {safeText(
                                          mapping.match_status
                                        )}
                                      </span>

                                    </div>

                                    <div className="flex items-center justify-between gap-3 mt-2">

                                      <span className="text-[9px] text-slate-400 font-mono">
                                        AI Confidence
                                      </span>

                                      <span className="text-xs font-mono font-bold text-blue-700">
                                        {mapping.ai_confidence}%
                                      </span>

                                    </div>

                                    <div className="mt-3">

                                      <div className="text-[9px] text-slate-400 font-mono uppercase">
                                        AI Reason
                                      </div>

                                      <div className="text-xs text-slate-700 mt-1 leading-relaxed">
                                        {safeText(
                                          mapping.ai_reason
                                        )}
                                      </div>

                                    </div>

                                  </div>

                                </div>
                              )
                            )}

                          </div>

                          {/* =================================
                              AI ANALYSIS
                          ================================= */}

                          {item.difference_analysis
                            .length >
                            0 && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4">

                              <h3 className="text-sm font-bold text-slate-900">
                                AI Analysis
                              </h3>

                              <ul className="mt-3 space-y-2">

                                {item.difference_analysis.map(
                                  (
                                    analysis,
                                    index
                                  ) => (
                                    <li
                                      key={
                                        index
                                      }
                                      className="text-xs text-slate-700 leading-relaxed flex gap-2"
                                    >

                                      <span className="text-emerald-600 font-bold">
                                        •
                                      </span>

                                      <span>
                                        {analysis}
                                      </span>

                                    </li>
                                  )
                                )}

                              </ul>

                            </div>
                          )}

                          {/* =================================
                              GOVERNMENT STATUS
                          ================================= */}

                          <div className="bg-white border border-slate-200 rounded-xl p-4">

                            <div className="flex items-center gap-2">

                              <ShieldCheck className="w-4 h-4 text-emerald-600" />

                              <h3 className="text-sm font-bold text-slate-900">
                                Government Review Status
                              </h3>

                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">

                                <div className="text-[9px] text-slate-400 font-mono uppercase">
                                  Request Status
                                </div>

                                <div className="text-xs font-bold text-slate-800 mt-1">
                                  {safeText(
                                    item.status
                                  )}
                                </div>

                              </div>

                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">

                                <div className="text-[9px] text-slate-400 font-mono uppercase">
                                  Reviewed By
                                </div>

                                <div className="text-xs font-bold text-slate-800 mt-1">
                                  {safeText(
                                    item.reviewed_by
                                  )}
                                </div>

                              </div>

                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">

                                <div className="text-[9px] text-slate-400 font-mono uppercase">
                                  Review Date
                                </div>

                                <div className="text-xs font-bold text-slate-800 mt-1">
                                  {safeText(
                                    item.review_date
                                  )}
                                </div>

                              </div>

                            </div>

                            {item.government_comments && (
                              <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-3">

                                <div className="text-[9px] text-slate-400 font-mono uppercase">
                                  Government Comments
                                </div>

                                <div className="text-xs text-slate-700 mt-1">
                                  {item.government_comments}
                                </div>

                              </div>
                            )}

                          </div>

                        </div>
                      )}

                      {/* =====================================
                          ACTION BAR
                      ===================================== */}

                      <div className="bg-white border-t border-slate-100 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">

                        <div className="flex items-center gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(
                                item.request_id
                              )
                            }
                            className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                          >

                            <ExternalLink className="w-3.5 h-3.5" />

                            Inspect National Mapping

                          </button>

                        </div>

                        <div className="flex flex-wrap items-center gap-2">

                          {!isApproved &&
                            !isRejected && (
                              <>

                                {/* REQUEST MORE DATA */}

                                <button
                                  type="button"
                                  disabled={
                                    isActionBusy
                                  }
                                  onClick={() =>
                                    void performAction(
                                      item,
                                      'NEEDS_MORE_DATA'
                                    )
                                  }
                                  className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                                >

                                  {isActionBusy ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <FileText className="w-3.5 h-3.5" />
                                  )}

                                  Request More Data

                                </button>

                                {/* REJECT */}

                                <button
                                  type="button"
                                  disabled={
                                    isActionBusy
                                  }
                                  onClick={() =>
                                    void performAction(
                                      item,
                                      'REJECT'
                                    )
                                  }
                                  className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                                >

                                  {isActionBusy ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5" />
                                  )}

                                  Reject Proposal

                                </button>

                                {/* APPROVE */}

                                <button
                                  type="button"
                                  disabled={
                                    isActionBusy
                                  }
                                  onClick={() =>
                                    void performAction(
                                      item,
                                      'APPROVE'
                                    )
                                  }
                                  className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                                >

                                  {isActionBusy ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}

                                  {isActionBusy
                                    ? 'Saving...'
                                    : 'Approve National Identity'}

                                </button>

                              </>
                            )}

                          {isApproved && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">

                              <CheckCircle2 className="w-4 h-4" />

                              Approved by{' '}
                              {safeText(
                                item.reviewed_by
                              )}

                            </span>
                          )}

                          {isRejected && (
                            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">

                              <XCircle className="w-4 h-4" />

                              Proposal Rejected

                            </span>
                          )}

                        </div>

                      </div>

                    </motion.div>
                  );
                }
              )}

            </AnimatePresence>

          </div>
        )}

      </div>
    );
  };