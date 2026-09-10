import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { StatusBadge } from '../ui/StatusBadge';
import { AnimatedButton } from '../ui/AnimatedButton';
import { EmptyState } from '../ui/EmptyState';
import {
  ShieldCheck,
  Search,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface AuditLog {
  audit_id: number;
  material_id: number | null;
  ncs_id: number | null;
  request_id: number | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string | null;
  comments: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface AuditResponse {
  success: boolean;
  summary: {
    total: number;
    approvals: number;
    rejections: number;
    needs_more_data: number;
  };
  count: number;
  logs: AuditLog[];
  error?: string;
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return String(value);
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
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true
  });
}

function getActionLabel(action: string) {
  const normalized = safeText(action)
    .trim()
    .toUpperCase();

  switch (normalized) {
    case 'APPROVE':
      return 'Approved';

    case 'REJECT':
      return 'Rejected';

    case 'NEEDS_MORE_DATA':
      return 'Needs More Data';

    default:
      return normalized || 'Unknown';
  }
}

function getActionBadgeStatus(
  action: string
): 'success' | 'warning' | 'danger' | 'primary' | 'neutral' {
  const normalized = safeText(action)
    .trim()
    .toUpperCase();

  if (normalized === 'APPROVE') {
    return 'success';
  }

  if (normalized === 'REJECT') {
    return 'danger';
  }

  if (normalized === 'NEEDS_MORE_DATA') {
    return 'warning';
  }

  return 'neutral';
}

function createAuditReference(log: AuditLog) {
  return `AUD-${String(log.audit_id).padStart(6, '0')}`;
}

export const AuditCenterView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const [summary, setSummary] =
    useState<AuditResponse['summary']>({
      total: 0,
      approvals: 0,
      rejections: 0,
      needs_more_data: 0
    });

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] =
    useState('All');

  const [expandedRowId, setExpandedRowId] =
    useState<number | null>(null);

  const [copiedAuditId, setCopiedAuditId] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /* ==========================================================
     LOAD REAL AUDIT DATA
  ========================================================== */

  const loadAuditLogs = async (
    showRefreshState = false
  ) => {
    try {
      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const response = await fetch(
        '/api/audit-log',
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

      const result =
        (await response.json()) as AuditResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            'Failed to load audit logs.'
        );
      }

      setLogs(
        Array.isArray(result.logs)
          ? result.logs
          : []
      );

      setSummary({
        total:
          Number(
            result.summary?.total
          ) || 0,

        approvals:
          Number(
            result.summary?.approvals
          ) || 0,

        rejections:
          Number(
            result.summary?.rejections
          ) || 0,

        needs_more_data:
          Number(
            result.summary?.needs_more_data
          ) || 0
      });
    } catch (err) {
      console.error(
        'Audit Center load error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load audit records.'
      );

      setLogs([]);

      setSummary({
        total: 0,
        approvals: 0,
        rejections: 0,
        needs_more_data: 0
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  /* ==========================================================
     FILTERS
  ========================================================== */

  const filteredLogs = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return logs.filter((log) => {
      const action = safeText(log.action)
        .trim()
        .toUpperCase();

      let matchesAction = true;

      if (actionFilter === 'Approved') {
        matchesAction =
          action === 'APPROVE';
      } else if (
        actionFilter === 'Rejected'
      ) {
        matchesAction =
          action === 'REJECT';
      } else if (
        actionFilter === 'Needs More Data'
      ) {
        matchesAction =
          action === 'NEEDS_MORE_DATA';
      }

      if (!matchesAction) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        createAuditReference(log),
        log.audit_id,
        log.material_id,
        log.ncs_id,
        log.request_id,
        log.action,
        getActionLabel(log.action),
        log.performed_by,
        log.comments,
        log.previous_status,
        log.new_status,
        log.metadata?.ncs_code,
        log.metadata?.ncs_name
      ]
        .map(safeText)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(
        normalizedSearch
      );
    });
  }, [
    logs,
    search,
    actionFilter
  ]);

  /* ==========================================================
     COPY AUDIT REFERENCE
  ========================================================== */

  const handleCopyAuditReference = async (
    log: AuditLog
  ) => {
    const reference =
      createAuditReference(log);

    try {
      await navigator.clipboard.writeText(
        reference
      );

      setCopiedAuditId(
        log.audit_id
      );

      setTimeout(() => {
        setCopiedAuditId(
          null
        );
      }, 2000);
    } catch (copyError) {
      console.error(
        'Copy failed:',
        copyError
      );
    }
  };

  /* ==========================================================
     EXPORT CSV
  ========================================================== */

  const handleExportCSV = () => {
    const headers = [
      'Audit ID',
      'Timestamp',
      'Action',
      'Material ID',
      'NCS ID',
      'Request ID',
      'Previous Status',
      'New Status',
      'Performed By',
      'Comments'
    ];

    const rows = logs.map(
      (log) =>
        [
          createAuditReference(log),

          log.created_at,

          getActionLabel(
            log.action
          ),

          log.material_id ?? '',

          log.ncs_id ?? '',

          log.request_id ?? '',

          log.previous_status ?? '',

          log.new_status ?? '',

          log.performed_by ?? '',

          log.comments ?? ''
        ]
          .map(
            (value) =>
              `"${safeText(value).replace(
                /"/g,
                '""'
              )}"`
          )
          .join(',')
    );

    const csv = [
      headers.join(','),
      ...rows
    ].join('\n');

    const blob = new Blob(
      [csv],
      {
        type:
          'text/csv;charset=utf-8;'
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = url;

    link.download =
      `Bharat_Material_Grid_Audit_Log_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
              Government Audit Trail
            </span>

            <span className="text-xs text-slate-400 font-mono">
              Supabase Persistent Ledger
            </span>
          </div>

          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            National Audit &amp; Governance Trail
          </h1>

          <p className="text-xs text-slate-300">
            Persistent record of government review decisions,
            NCS status changes and material standardization actions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AnimatedButton
            onClick={() =>
              loadAuditLogs(true)
            }
            variant="secondary"
            size="sm"
            icon={
              <RefreshCw
                className={`w-4 h-4 ${
                  refreshing
                    ? 'animate-spin'
                    : ''
                }`}
              />
            }
          >
            Refresh
          </AnimatedButton>

          <AnimatedButton
            onClick={handleExportCSV}
            variant="secondary"
            size="sm"
            icon={
              <Download className="w-4 h-4 text-emerald-400" />
            }
          >
            Export CSV
          </AnimatedButton>
        </div>
      </div>

      {/* ======================================================
          SUMMARY CARDS
      ====================================================== */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Total Events
          </div>

          <div className="text-2xl font-bold text-slate-900 mt-1">
            {summary.total}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
          <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-600">
            Approvals
          </div>

          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {summary.approvals}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-xs">
          <div className="text-[10px] font-mono uppercase tracking-wider text-red-600">
            Rejections
          </div>

          <div className="text-2xl font-bold text-red-700 mt-1">
            {summary.rejections}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-600">
            Needs More Data
          </div>

          <div className="text-2xl font-bold text-amber-700 mt-1">
            {summary.needs_more_data}
          </div>
        </div>

      </div>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />

          <div>
            <div className="text-sm font-semibold text-red-800">
              Audit data could not be loaded
            </div>

            <div className="text-xs text-red-700 mt-1">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          FILTERS
      ====================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">

          {[
            'All',
            'Approved',
            'Rejected',
            'Needs More Data'
          ].map((filter) => (
            <button
              key={filter}
              onClick={() =>
                setActionFilter(filter)
              }
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                actionFilter === filter
                  ? 'bg-slate-900 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}

        </div>

        <div className="relative w-full sm:w-80">

          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search audit ID, material, NCS, officer..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
          />

        </div>

      </div>

      {/* ======================================================
          AUDIT TABLE
      ====================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">

        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">

          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
            Audit Ledger ({filteredLogs.length} Events)
          </h2>

          <span className="text-xs font-mono text-emerald-600 font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Persistent Record
          </span>

        </div>

        {loading ? (
          <div className="p-10 text-center">

            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" />

            <div className="text-xs text-slate-500 mt-3">
              Loading audit ledger...
            </div>

          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={<FileCheck className="w-8 h-8" />}
            title="No audit records found"
            description={
              logs.length === 0
                ? 'No government review actions have been recorded yet.'
                : 'No ledger records match the active filter or search query.'
            }
          />
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-left text-xs">

              <thead className="bg-slate-100/80 text-[10px] font-mono text-slate-500 uppercase border-b border-slate-200">

                <tr>

                  <th className="p-3 font-semibold">
                    Audit ID
                  </th>

                  <th className="p-3 font-semibold">
                    Timestamp
                  </th>

                  <th className="p-3 font-semibold">
                    Action
                  </th>

                  <th className="p-3 font-semibold">
                    Material / NCS
                  </th>

                  <th className="p-3 font-semibold">
                    Actor
                  </th>

                  <th className="p-3 font-semibold">
                    Status Change
                  </th>

                  <th className="p-3 font-semibold text-right">
                    Reference
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {filteredLogs.map(
                  (log, index) => {
                    const isExpanded =
                      expandedRowId ===
                      log.audit_id;

                    const reference =
                      createAuditReference(
                        log
                      );

                    return (
                      <React.Fragment
                        key={
                          log.audit_id
                        }
                      >

                        <motion.tr
                          initial={{
                            opacity: 0,
                            y: 4
                          }}
                          animate={{
                            opacity: 1,
                            y: 0
                          }}
                          transition={{
                            duration: 0.15,
                            delay: Math.min(
                              index * 0.02,
                              0.3
                            )
                          }}
                          onClick={() =>
                            setExpandedRowId(
                              isExpanded
                                ? null
                                : log.audit_id
                            )
                          }
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >

                          <td className="p-3 font-mono font-bold text-slate-900">

                            <div className="flex items-center gap-1.5">

                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              )}

                              <span>
                                {reference}
                              </span>

                            </div>

                          </td>

                          <td className="p-3 text-slate-600 text-[11px] whitespace-nowrap">
                            {formatDate(
                              log.created_at
                            )}
                          </td>

                          <td className="p-3">

                            <StatusBadge
                              status={getActionBadgeStatus(
                                log.action
                              )}
                              label={getActionLabel(
                                log.action
                              )}
                              size="sm"
                            />

                          </td>

                          <td className="p-3">

                            <div className="font-semibold text-slate-800">
                              Material #
                              {log.material_id ??
                                'N/A'}
                            </div>

                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              NCS #
                              {log.ncs_id ??
                                'N/A'}
                            </div>

                          </td>

                          <td className="p-3 text-slate-800">
                            {log.performed_by ||
                              'Not specified'}
                          </td>

                          <td className="p-3 font-mono text-[10px]">

                            <div className="text-slate-500">
                              {log.previous_status ||
                                '—'}
                            </div>

                            <div className="text-slate-800 font-bold">
                              ↓{' '}
                              {log.new_status ||
                                '—'}
                            </div>

                          </td>

                          <td className="p-3 text-right">

                            <button
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();

                                handleCopyAuditReference(
                                  log
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-mono text-[10px] cursor-pointer"
                              title="Copy audit reference"
                            >

                              {copiedAuditId ===
                              log.audit_id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}

                              {reference}

                            </button>

                          </td>

                        </motion.tr>

                        {/* ==================================================
                            EXPANDED DETAILS
                        ================================================== */}

                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">

                            <td
                              colSpan={7}
                              className="p-4"
                            >

                              <motion.div
                                initial={{
                                  opacity: 0,
                                  height: 0
                                }}
                                animate={{
                                  opacity: 1,
                                  height: 'auto'
                                }}
                                transition={{
                                  duration: 0.2
                                }}
                                className="space-y-4 text-xs"
                              >

                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">

                                  <div>

                                    <div className="font-bold text-slate-800">
                                      Audit Transaction
                                    </div>

                                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                                      {reference}
                                    </div>

                                  </div>

                                  <div className="text-[10px] text-slate-500 font-mono">

                                    Recorded:
                                    {' '}
                                    {formatDate(
                                      log.created_at
                                    )}

                                  </div>

                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

                                  <div className="p-3 bg-white rounded-xl border border-slate-200">

                                    <div className="text-[10px] uppercase font-mono text-slate-400">
                                      Material ID
                                    </div>

                                    <div className="font-bold text-slate-900 mt-1">
                                      {log.material_id ??
                                        'Not available'}
                                    </div>

                                  </div>

                                  <div className="p-3 bg-white rounded-xl border border-slate-200">

                                    <div className="text-[10px] uppercase font-mono text-slate-400">
                                      NCS ID
                                    </div>

                                    <div className="font-bold text-slate-900 mt-1">
                                      {log.ncs_id ??
                                        'Not available'}
                                    </div>

                                  </div>

                                  <div className="p-3 bg-white rounded-xl border border-slate-200">

                                    <div className="text-[10px] uppercase font-mono text-slate-400">
                                      Request ID
                                    </div>

                                    <div className="font-bold text-slate-900 mt-1">
                                      {log.request_id ??
                                        'Not available'}
                                    </div>

                                  </div>

                                  <div className="p-3 bg-white rounded-xl border border-slate-200">

                                    <div className="text-[10px] uppercase font-mono text-slate-400">
                                      Performed By
                                    </div>

                                    <div className="font-bold text-slate-900 mt-1">
                                      {log.performed_by ||
                                        'Not specified'}
                                    </div>

                                  </div>

                                </div>

                                <div className="p-3 bg-white rounded-xl border border-slate-200">

                                  <div className="text-[10px] uppercase font-mono text-slate-400">
                                    Status Transition
                                  </div>

                                  <div className="flex items-center gap-2 mt-2 font-mono text-xs">

                                    <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                                      {log.previous_status ||
                                        '—'}
                                    </span>

                                    <span className="text-slate-400">
                                      →
                                    </span>

                                    <span className="px-2 py-1 rounded-lg bg-slate-900 text-white">
                                      {log.new_status ||
                                        '—'}
                                    </span>

                                  </div>

                                </div>

                                {log.comments && (
                                  <div className="p-3 bg-white rounded-xl border border-slate-200">

                                    <div className="text-[10px] uppercase font-mono text-slate-400">
                                      Government Comments
                                    </div>

                                    <div className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">
                                      {log.comments}
                                    </div>

                                  </div>
                                )}

                                {log.metadata &&
                                  Object.keys(
                                    log.metadata
                                  ).length > 0 && (
                                    <div className="p-3 bg-white rounded-xl border border-slate-200">

                                      <div className="text-[10px] uppercase font-mono text-slate-400 mb-2">
                                        Audit Metadata
                                      </div>

                                      <pre className="text-[10px] text-slate-700 font-mono whitespace-pre-wrap break-all bg-slate-50 rounded-lg p-3 overflow-auto max-h-80">
                                        {JSON.stringify(
                                          log.metadata,
                                          null,
                                          2
                                        )}
                                      </pre>

                                    </div>
                                  )}

                                <div className="p-3 bg-slate-900 rounded-xl text-[10px] font-mono text-slate-300">

                                  <div className="text-white font-sans font-semibold mb-1">
                                    Database Audit Record
                                  </div>

                                  <div>
                                    Audit ID:{' '}
                                    {log.audit_id}
                                  </div>

                                  <div>
                                    Created At:{' '}
                                    {log.created_at}
                                  </div>

                                  <div>
                                    Action:{' '}
                                    {log.action}
                                  </div>

                                  <div>
                                    Request ID:{' '}
                                    {log.request_id ??
                                      'NULL'}
                                  </div>

                                </div>

                              </motion.div>

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

    </div>
  );
};

export default AuditCenterView;