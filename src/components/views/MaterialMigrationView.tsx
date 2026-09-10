import React from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileCode2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Sparkles,
  Zap,
} from 'lucide-react';

/* ============================================================
   TYPES
============================================================ */

interface MigrationRecord {
  migration_id: number;
  material_id: number | null;
  ncs_id: number | null;
  cpse_company: string;
  legacy_material_number: string;
  legacy_description: string | null;
  national_material_code: string | null;
  migration_status: string;
  mapping_method: string | null;
  confidence: number | null;
  source_system: string | null;
  target_system: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

interface MigrationSummary {
  total: number;
  pending: number;
  ai_proposed: number;
  under_review: number;
  approved: number;
  rejected: number;
  migrated: number;
}

interface BulkProposalResponse {
  success: boolean;
  message?: string;
  requested?: number;
  processed?: number;
  created?: number;
  skipped?: number;
  failed?: number;
  status?: string;
  proposals?: MigrationRecord[];
  skipped_records?: {
    material_id: number;
    material_number: string;
    reason: string;
  }[];
  failed_records?: {
    material_id: number;
    material_number: string;
    error: string;
  }[];
  error?: string;
  details?: string;
}

const EMPTY_SUMMARY: MigrationSummary = {
  total: 0,
  pending: 0,
  ai_proposed: 0,
  under_review: 0,
  approved: 0,
  rejected: 0,
  migrated: 0,
};

const STATUS_OPTIONS = [
  'ALL',
  'PENDING',
  'AI_PROPOSED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'MIGRATED',
];

const STATUS_LABELS: Record<string, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  AI_PROPOSED: 'AI Proposed',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MIGRATED: 'Migrated',
};

function formatStatus(status: string) {
  return (
    STATUS_LABELS[status] ||
    status.replaceAll('_', ' ')
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function confidenceClass(
  value: number | null
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return 'text-slate-500 bg-slate-100';
  }

  if (value >= 90) {
    return 'text-emerald-700 bg-emerald-50';
  }

  if (value >= 75) {
    return 'text-amber-700 bg-amber-50';
  }

  return 'text-red-700 bg-red-50';
}

function statusClass(
  status: string
) {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';

    case 'MIGRATED':
      return 'bg-blue-50 text-blue-700 border-blue-200';

    case 'REJECTED':
      return 'bg-red-50 text-red-700 border-red-200';

    case 'AI_PROPOSED':
      return 'bg-violet-50 text-violet-700 border-violet-200';

    case 'UNDER_REVIEW':
      return 'bg-amber-50 text-amber-700 border-amber-200';

    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function StatusIcon({
  status,
}: {
  status: string;
}) {
  switch (status) {
    case 'APPROVED':
      return (
        <CheckCircle2 className="w-4 h-4" />
      );

    case 'MIGRATED':
      return (
        <ShieldCheck className="w-4 h-4" />
      );

    case 'REJECTED':
      return (
        <XCircle className="w-4 h-4" />
      );

    case 'AI_PROPOSED':
      return (
        <Database className="w-4 h-4" />
      );

    case 'UNDER_REVIEW':
      return (
        <Clock3 className="w-4 h-4" />
      );

    default:
      return (
        <AlertCircle className="w-4 h-4" />
      );
  }
}

/* ============================================================
   COMPONENT
============================================================ */

export const MaterialMigrationView: React.FC = () => {
  const [records, setRecords] =
    React.useState<MigrationRecord[]>([]);

  const [summary, setSummary] =
    React.useState<MigrationSummary>(
      EMPTY_SUMMARY
    );

  const [loading, setLoading] =
    React.useState(true);

  const [refreshing, setRefreshing] =
    React.useState(false);

  const [generatingProposals, setGeneratingProposals] =
    React.useState(false);

  const [bulkLimit, setBulkLimit] =
    React.useState('50');

  const [search, setSearch] =
    React.useState('');

  const [statusFilter, setStatusFilter] =
    React.useState('ALL');

  const [companyFilter, setCompanyFilter] =
    React.useState('ALL');

  const [expandedId, setExpandedId] =
    React.useState<number | null>(null);

  const [updatingId, setUpdatingId] =
    React.useState<number | null>(null);

  const [message, setMessage] =
    React.useState('');

  const [bulkResult, setBulkResult] =
    React.useState<{
      created: number;
      skipped: number;
      failed: number;
    } | null>(null);

  /* ==========================================================
     LOAD DATA
  ========================================================== */

  const loadRecords =
    React.useCallback(
      async (
        showRefreshing = false
      ) => {
        try {
          if (showRefreshing) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setMessage('');

          const params =
            new URLSearchParams();

          if (
            statusFilter &&
            statusFilter !== 'ALL'
          ) {
            params.set(
              'status',
              statusFilter
            );
          }

          if (
            companyFilter &&
            companyFilter !== 'ALL'
          ) {
            params.set(
              'company',
              companyFilter
            );
          }

          const queryString =
            params.toString();

          const response =
            await fetch(
              `/api/material-migration${
                queryString
                  ? `?${queryString}`
                  : ''
              }`,
              {
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
                'Failed to load migration data.'
            );
          }

          setRecords(
            Array.isArray(
              result.records
            )
              ? result.records
              : []
          );

          setSummary(
            result.summary ||
              EMPTY_SUMMARY
          );
        } catch (error) {
          console.error(
            'Migration load error:',
            error
          );

          setMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load migration records.'
          );

          setRecords([]);
          setSummary(
            EMPTY_SUMMARY
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        statusFilter,
        companyFilter,
      ]
    );

  React.useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  /* ==========================================================
     COMPANY OPTIONS
  ========================================================== */

  const companies =
    React.useMemo(() => {
      return Array.from(
        new Set(
          records
            .map(
              record =>
                record.cpse_company
            )
            .filter(Boolean)
        )
      ).sort();
    }, [records]);

  /* ==========================================================
     LOCAL SEARCH
  ========================================================== */

  const filteredRecords =
    React.useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      if (
        !normalizedSearch
      ) {
        return records;
      }

      return records.filter(
        record => {
          const haystack = [
            record.cpse_company,
            record.legacy_material_number,
            record.legacy_description,
            record.national_material_code,
            record.source_system,
            record.target_system,
            record.mapping_method,
            record.comments,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(
            normalizedSearch
          );
        }
      );
    }, [
      records,
      search,
    ]);

  /* ==========================================================
     BULK AI PROPOSAL GENERATION
  ========================================================== */

  const generateBulkProposals =
    async () => {
      try {
        const requestedLimit =
          Number(
            bulkLimit
          );

        if (
          !Number.isInteger(
            requestedLimit
          ) ||
          requestedLimit <= 0 ||
          requestedLimit > 250
        ) {
          setMessage(
            'Batch size must be between 1 and 250.'
          );

          return;
        }

        const confirmed =
          window.confirm(
            `Generate AI migration proposals for up to ${requestedLimit} material records? Existing migration mappings will be skipped.`
          );

        if (!confirmed) {
          return;
        }

        setGeneratingProposals(true);
        setMessage('');
        setBulkResult(null);

        const response =
          await fetch(
            '/api/material-migration/bulk',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                limit:
                  requestedLimit,
              }),
            }
          );

        const result =
          (await response.json()) as BulkProposalResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result?.details ||
              result?.error ||
              'Bulk migration proposal generation failed.'
          );
        }

        const created =
          Number(
            result.created || 0
          );

        const skipped =
          Number(
            result.skipped || 0
          );

        const failed =
          Number(
            result.failed || 0
          );

        setBulkResult({
          created,
          skipped,
          failed,
        });

        setMessage(
          `Bulk proposal run completed: ${created} AI proposal(s) created, ${skipped} skipped, ${failed} failed.`
        );

        await loadRecords(true);
      } catch (error) {
        console.error(
          'Bulk migration proposal error:',
          error
        );

        setMessage(
          error instanceof Error
            ? error.message
            : 'Failed to generate bulk migration proposals.'
        );
      } finally {
        setGeneratingProposals(
          false
        );
      }
    };

  /* ==========================================================
     UPDATE STATUS
  ========================================================== */

  const updateStatus = async (
    record: MigrationRecord,
    newStatus: string
  ) => {
    try {
      setUpdatingId(
        record.migration_id
      );

      setMessage('');

      if (
        newStatus ===
        'REJECTED'
      ) {
        const confirmed =
          window.confirm(
            `Reject migration mapping for ${record.legacy_material_number}?`
          );

        if (!confirmed) {
          return;
        }
      }

      const response =
        await fetch(
          '/api/material-migration',
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              migrationId:
                record.migration_id,

              migrationStatus:
                newStatus,

              reviewedBy:
                'Material Master Officer',

              comments:
                newStatus ===
                'APPROVED'
                  ? 'Mapping approved through National Material Master migration workflow.'
                  : newStatus ===
                    'REJECTED'
                    ? 'Mapping rejected during National Material Master review.'
                    : newStatus ===
                      'MIGRATED'
                      ? 'Legacy material mapping marked as migrated.'
                      : record.comments ||
                        null,
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
          result?.details ||
            result?.error ||
            'Migration update failed.'
        );
      }

      setMessage(
        `Migration ${record.legacy_material_number} updated to ${formatStatus(
          newStatus
        )}.`
      );

      await loadRecords(true);
    } catch (error) {
      console.error(
        'Migration status update error:',
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to update migration status.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* ==========================================================
     CSV EXPORT
  ========================================================== */

  const exportCSV = () => {
    if (
      !filteredRecords.length
    ) {
      return;
    }

    const headers = [
      'Migration ID',
      'CPSE',
      'Legacy Material Number',
      'Legacy Description',
      'National Material Code',
      'Status',
      'Mapping Method',
      'Confidence',
      'Source System',
      'Target System',
      'Reviewed By',
      'Reviewed At',
    ];

    const rows =
      filteredRecords.map(
        record => [
          record.migration_id,
          record.cpse_company,
          record.legacy_material_number,
          record.legacy_description ||
            '',
          record.national_material_code ||
            '',
          record.migration_status,
          record.mapping_method ||
            '',
          record.confidence ?? '',
          record.source_system ||
            '',
          record.target_system ||
            '',
          record.reviewed_by ||
            '',
          record.reviewed_at ||
            '',
        ]
      );

    const csv = [
      headers,
      ...rows,
    ]
      .map(row =>
        row
          .map(
            value =>
              `"${String(
                value ?? ''
              ).replace(
                /"/g,
                '""'
              )}"`
          )
          .join(',')
      )
      .join('\n');

    const blob =
      new Blob(
        [csv],
        {
          type:
            'text/csv;charset=utf-8;',
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        'a'
      );

    link.href = url;

    link.download =
      'national-material-migration.csv';

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="w-full min-h-screen bg-slate-50">

      {/* ======================================================
          PAGE HEADER
      ====================================================== */}

      <section className="border-b border-slate-200 bg-white">

        <div className="max-w-[1600px] mx-auto px-6 py-7">

          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">

            <div>

              <div className="flex items-center gap-3 mb-2">

                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <FileCode2 className="w-6 h-6 text-blue-700" />
                </div>

                <div>

                  <div className="text-xs font-bold tracking-[0.18em] text-blue-700 uppercase">
                    National Material Master
                  </div>

                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
                    ERP / Legacy Material Migration
                  </h1>

                </div>

              </div>

              <p className="max-w-4xl text-sm text-slate-600 leading-6">
                Map legacy CPSE material numbers to National
                Material Codes, generate AI-assisted migration
                proposals in batches, and manage controlled
                approval before ERP migration.
              </p>

            </div>

            <div className="flex flex-wrap items-center gap-3">

              <button
                onClick={() =>
                  loadRecords(true)
                }
                disabled={
                  refreshing ||
                  generatingProposals
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >

                <RefreshCw
                  className={`w-4 h-4 ${
                    refreshing
                      ? 'animate-spin'
                      : ''
                  }`}
                />

                Refresh

              </button>

              <button
                onClick={
                  exportCSV
                }
                disabled={
                  filteredRecords.length ===
                    0 ||
                  generatingProposals
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >

                <Download className="w-4 h-4" />

                Export CSV

              </button>

            </div>

          </div>

        </div>

      </section>

      {/* ======================================================
          AI BULK MIGRATION PANEL
      ====================================================== */}

      <section className="max-w-[1600px] mx-auto px-6 pt-6">

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 p-5">

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">

            <div className="flex items-start gap-3">

              <div className="w-11 h-11 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-violet-700" />
              </div>

              <div>

                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
                  AI-Assisted Migration
                </div>

                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  Generate National Material Code Proposals
                </h2>

                <p className="mt-1 max-w-3xl text-xs text-slate-600 leading-5">
                  Processes source material records in batches,
                  searches existing verified National Material
                  mappings, and creates controlled
                  <span className="font-bold text-violet-700">
                    {' '}
                    AI_PROPOSED
                  </span>
                  {' '}migration records. Existing migration
                  mappings are automatically skipped.
                </p>

              </div>

            </div>

            <div className="flex flex-wrap items-center gap-3">

              <div>

                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                  Batch Size
                </label>

                <select
                  value={
                    bulkLimit
                  }
                  onChange={event =>
                    setBulkLimit(
                      event.target.value
                    )
                  }
                  disabled={
                    generatingProposals
                  }
                  className="h-10 px-3 min-w-[130px] rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <option value="25">
                    25 materials
                  </option>

                  <option value="50">
                    50 materials
                  </option>

                  <option value="100">
                    100 materials
                  </option>

                  <option value="250">
                    250 materials
                  </option>
                </select>

              </div>

              <button
                onClick={
                  generateBulkProposals
                }
                disabled={
                  generatingProposals
                }
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-bold shadow-sm disabled:opacity-50 cursor-pointer"
              >

                {generatingProposals ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}

                {generatingProposals
                  ? 'Generating...'
                  : 'Generate AI Proposals'}

              </button>

            </div>

          </div>

          {bulkResult && (
            <div className="mt-5 pt-4 border-t border-violet-100 grid grid-cols-1 sm:grid-cols-3 gap-3">

              <div className="rounded-xl bg-white border border-emerald-200 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                  Created
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {bulkResult.created.toLocaleString(
                    'en-IN'
                  )}
                </div>

                <div className="text-[10px] text-slate-500">
                  AI proposed mappings
                </div>
              </div>

              <div className="rounded-xl bg-white border border-amber-200 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
                  Skipped
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {bulkResult.skipped.toLocaleString(
                    'en-IN'
                  )}
                </div>

                <div className="text-[10px] text-slate-500">
                  Existing or unavailable mappings
                </div>
              </div>

              <div className="rounded-xl bg-white border border-red-200 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-red-700">
                  Failed
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {bulkResult.failed.toLocaleString(
                    'en-IN'
                  )}
                </div>

                <div className="text-[10px] text-slate-500">
                  Records requiring attention
                </div>
              </div>

            </div>
          )}

        </div>

      </section>

      {/* ======================================================
          CONTROLLED WORKFLOW
      ====================================================== */}

      <section className="max-w-[1600px] mx-auto px-6 pt-6">

        <div className="bg-white border border-slate-200 rounded-2xl p-5">

          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 mb-4">
            Controlled Migration Workflow
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">

            {[
              {
                title: 'Legacy ERP',
                text: 'CPSE material code',
              },
              {
                title: 'AI / Engineering Mapping',
                text: 'Candidate national code',
              },
              {
                title: 'Government Review',
                text: 'Approval and governance',
              },
              {
                title: 'National Master',
                text: 'Approved material code',
              },
              {
                title: 'ERP Migration',
                text: 'Controlled migration',
              },
            ].map(
              (step, index) => (
                <React.Fragment
                  key={
                    step.title
                  }
                >

                  <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">

                    <div className="text-xs font-bold text-blue-700">
                      STEP {index + 1}
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-900">
                      {step.title}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {step.text}
                    </div>

                  </div>

                  {index < 4 && (
                    <ArrowRight className="hidden lg:block w-5 h-5 text-slate-300 shrink-0" />
                  )}

                </React.Fragment>
              )
            )}

          </div>

        </div>

      </section>

      {/* ======================================================
          SUMMARY CARDS
      ====================================================== */}

      <section className="max-w-[1600px] mx-auto px-6 pt-6">

        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">

          {[
            [
              'Total',
              summary.total,
              'bg-slate-900 text-white',
            ],
            [
              'Pending',
              summary.pending,
              'bg-white border border-slate-200',
            ],
            [
              'AI Proposed',
              summary.ai_proposed,
              'bg-white border border-violet-200',
            ],
            [
              'Under Review',
              summary.under_review,
              'bg-white border border-amber-200',
            ],
            [
              'Approved',
              summary.approved,
              'bg-white border border-emerald-200',
            ],
            [
              'Rejected',
              summary.rejected,
              'bg-white border border-red-200',
            ],
            [
              'Migrated',
              summary.migrated,
              'bg-white border border-blue-200',
            ],
          ].map(
            ([label, value, className]) => (
              <div
                key={
                  String(label)
                }
                className={`rounded-xl p-4 ${className}`}
              >

                <div
                  className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
                    label === 'Total'
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  {label}
                </div>

                <div
                  className={`mt-2 text-2xl font-bold ${
                    label === 'Total'
                      ? 'text-white'
                      : 'text-slate-900'
                  }`}
                >
                  {Number(
                    value || 0
                  ).toLocaleString(
                    'en-IN'
                  )}
                </div>

              </div>
            )
          )}

        </div>

      </section>

      {/* ======================================================
          FILTER BAR
      ====================================================== */}

      <section className="max-w-[1600px] mx-auto px-6 pt-6">

        <div className="bg-white border border-slate-200 rounded-2xl p-4">

          <div className="flex flex-col xl:flex-row gap-3">

            <div className="relative flex-1">

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input
                value={
                  search
                }
                onChange={event =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search legacy code, description, national code, CPSE..."
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              />

            </div>

            <select
              value={
                companyFilter
              }
              onChange={event =>
                setCompanyFilter(
                  event.target.value
                )
              }
              className="h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700"
            >

              <option value="ALL">
                All CPSEs
              </option>

              {companies.map(
                company => (
                  <option
                    key={
                      company
                    }
                    value={
                      company
                    }
                  >
                    {company}
                  </option>
                )
              )}

            </select>

          </div>

          <div className="mt-4 flex flex-wrap gap-2">

            {STATUS_OPTIONS.map(
              status => (
                <button
                  key={
                    status
                  }
                  onClick={() =>
                    setStatusFilter(
                      status
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    statusFilter ===
                    status
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {formatStatus(
                    status
                  )}
                </button>
              )
            )}

          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {message}
            </div>
          )}

        </div>

      </section>

      {/* ======================================================
          TABLE
      ====================================================== */}

      <section className="max-w-[1600px] mx-auto px-6 py-6">

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">

          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">

            <div>

              <div className="text-base font-bold text-slate-900">
                Legacy Material Mapping Registry
              </div>

              <div className="text-xs text-slate-500 mt-1">
                {filteredRecords.length.toLocaleString(
                  'en-IN'
                )}{' '}
                record
                {filteredRecords.length ===
                1
                  ? ''
                  : 's'} displayed
              </div>

            </div>

            <div className="hidden sm:block text-xs font-semibold text-slate-500">
              National Material Master Migration
            </div>

          </div>

          {loading ? (

            <div className="py-16 flex flex-col items-center justify-center">

              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />

              <div className="mt-3 text-sm text-slate-600">
                Loading migration registry...
              </div>

            </div>

          ) : filteredRecords.length === 0 ? (

            <div className="py-16 px-6 text-center">

              <Database className="w-10 h-10 text-slate-300 mx-auto" />

              <div className="mt-3 text-base font-bold text-slate-800">
                No migration records found
              </div>

              <div className="mt-1 text-sm text-slate-500 max-w-xl mx-auto">
                Use the AI migration proposal panel above
                to generate mappings from existing verified
                National Material relationships.
              </div>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1200px]">

                <thead className="bg-slate-50 border-b border-slate-200">

                  <tr className="text-left">

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      CPSE
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Legacy Material
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      National Material Code
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Mapping
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Confidence
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </th>

                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Action
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {filteredRecords.map(
                    record => {

                      const expanded =
                        expandedId ===
                        record.migration_id;

                      const isUpdating =
                        updatingId ===
                        record.migration_id;

                      return (
                        <React.Fragment
                          key={
                            record.migration_id
                          }
                        >

                          <tr className="hover:bg-slate-50/80">

                            <td className="px-5 py-4 align-top">

                              <div className="text-sm font-bold text-slate-900">
                                {
                                  record.cpse_company
                                }
                              </div>

                              <div className="text-xs text-slate-500 mt-1">
                                ID #
                                {
                                  record.migration_id
                                }
                              </div>

                            </td>

                            <td className="px-5 py-4 align-top">

                              <div className="text-sm font-semibold text-slate-900">
                                {
                                  record.legacy_material_number
                                }
                              </div>

                              <div className="max-w-[280px] text-xs text-slate-500 mt-1 line-clamp-2">
                                {record.legacy_description ||
                                  'Description not available'}
                              </div>

                            </td>

                            <td className="px-5 py-4 align-top">

                              <div className="text-sm font-bold text-blue-700">
                                {record.national_material_code ||
                                  'Not assigned'}
                              </div>

                              {record.ncs_id && (
                                <div className="text-xs text-slate-500 mt-1">
                                  NCS ID #
                                  {
                                    record.ncs_id
                                  }
                                </div>
                              )}

                            </td>

                            <td className="px-5 py-4 align-top">

                              <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                                {record.mapping_method ||
                                  'Not specified'}
                              </span>

                            </td>

                            <td className="px-5 py-4 align-top">

                              <span
                                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${confidenceClass(
                                  record.confidence
                                )}`}
                              >
                                {record.confidence !==
                                  null &&
                                Number.isFinite(
                                  record.confidence
                                )
                                  ? `${record.confidence}%`
                                  : 'Not available'}
                              </span>

                            </td>

                            <td className="px-5 py-4 align-top">

                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${statusClass(
                                  record.migration_status
                                )}`}
                              >

                                <StatusIcon
                                  status={
                                    record.migration_status
                                  }
                                />

                                {formatStatus(
                                  record.migration_status
                                )}

                              </span>

                            </td>

                            <td className="px-5 py-4 align-top">

                              <div className="flex flex-wrap gap-2">

                                <button
                                  onClick={() =>
                                    setExpandedId(
                                      expanded
                                        ? null
                                        : record.migration_id
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
                                >
                                  {expanded
                                    ? 'Close'
                                    : 'Inspect'}
                                </button>

                                {record.migration_status !==
                                  'APPROVED' &&
                                  record.migration_status !==
                                    'MIGRATED' && (
                                    <button
                                      onClick={() =>
                                        updateStatus(
                                          record,
                                          'APPROVED'
                                        )
                                      }
                                      disabled={
                                        isUpdating
                                      }
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                  )}

                                {record.migration_status !==
                                  'REJECTED' &&
                                  record.migration_status !==
                                    'MIGRATED' && (
                                    <button
                                      onClick={() =>
                                        updateStatus(
                                          record,
                                          'REJECTED'
                                        )
                                      }
                                      disabled={
                                        isUpdating
                                      }
                                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 text-xs font-semibold hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  )}

                                {record.migration_status ===
                                  'APPROVED' && (
                                  <button
                                    onClick={() =>
                                      updateStatus(
                                        record,
                                        'MIGRATED'
                                      )
                                    }
                                    disabled={
                                      isUpdating
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                                  >
                                    Mark Migrated
                                  </button>
                                )}

                              </div>

                            </td>

                          </tr>

                          {expanded && (

                            <tr>

                              <td
                                colSpan={
                                  7
                                }
                                className="bg-slate-50 px-5 py-5"
                              >

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                                  <div className="bg-white border border-slate-200 rounded-xl p-4">

                                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Source System
                                    </div>

                                    <div className="mt-2 text-sm font-bold text-slate-900">
                                      {record.source_system ||
                                        'Not available'}
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Legacy Material Number
                                    </div>

                                    <div className="mt-2 text-sm font-mono font-semibold text-slate-800">
                                      {
                                        record.legacy_material_number
                                      }
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Legacy Description
                                    </div>

                                    <div className="mt-2 text-sm text-slate-700 leading-6">
                                      {record.legacy_description ||
                                        'Not available'}
                                    </div>

                                  </div>

                                  <div className="bg-white border border-slate-200 rounded-xl p-4">

                                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      National Target
                                    </div>

                                    <div className="mt-2 text-sm font-bold text-blue-700">
                                      {record.national_material_code ||
                                        'Not assigned'}
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Target System
                                    </div>

                                    <div className="mt-2 text-sm font-bold text-slate-900">
                                      {record.target_system ||
                                        'Not available'}
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Mapping Method
                                    </div>

                                    <div className="mt-2 text-sm font-semibold text-slate-800">
                                      {record.mapping_method ||
                                        'Not specified'}
                                    </div>

                                  </div>

                                  <div className="bg-white border border-slate-200 rounded-xl p-4">

                                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Governance
                                    </div>

                                    <div className="mt-2 flex items-center gap-2">

                                      <span
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${statusClass(
                                          record.migration_status
                                        )}`}
                                      >

                                        <StatusIcon
                                          status={
                                            record.migration_status
                                          }
                                        />

                                        {formatStatus(
                                          record.migration_status
                                        )}

                                      </span>

                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Reviewed By
                                    </div>

                                    <div className="mt-2 text-sm font-semibold text-slate-800">
                                      {record.reviewed_by ||
                                        'Not reviewed'}
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Reviewed At
                                    </div>

                                    <div className="mt-2 text-sm text-slate-700">
                                      {formatDate(
                                        record.reviewed_at
                                      )}
                                    </div>

                                    <div className="mt-4 text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Confidence
                                    </div>

                                    <div className="mt-2">

                                      <span
                                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${confidenceClass(
                                          record.confidence
                                        )}`}
                                      >
                                        {record.confidence !==
                                          null &&
                                        Number.isFinite(
                                          record.confidence
                                        )
                                          ? `${record.confidence}%`
                                          : 'Not available'}
                                      </span>

                                    </div>

                                  </div>

                                  <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4">

                                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                                      Migration Comments
                                    </div>

                                    <div className="mt-2 text-sm text-slate-700 leading-6">
                                      {record.comments ||
                                        'No comments recorded.'}
                                    </div>

                                    <div className="mt-4 text-xs text-slate-400">
                                      Created:{' '}
                                      {formatDate(
                                        record.created_at
                                      )}{' '}
                                      · Updated:{' '}
                                      {formatDate(
                                        record.updated_at
                                      )}
                                    </div>

                                  </div>

                                </div>

                              </td>

                            </tr>

                          )}

                        </React.Fragment>
                      );
                    }
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </section>

    </div>
  );
};

export default MaterialMigrationView;