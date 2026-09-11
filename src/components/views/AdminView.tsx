'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import { useApp } from '../../context/AppContext';

type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ALL';

type ApprovalRecord = {
  id: string;
  company_name: string | null;
  company_material_id: number | null;
  part_name: string | null;
  company_material_code: string | null;
  ai_standard_code: string | null;
  ai_confidence: number | null;
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  company_email: string | null;
  email_status: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ActionType =
  | 'APPROVE'
  | 'REJECT'
  | 'DELETE';

const AdminView: React.FC = () => {
  const { addToast } = useApp();

  const [approvals, setApprovals] =
    useState<ApprovalRecord[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isActionLoading, setIsActionLoading] =
    useState(false);

  const [searchTerm, setSearchTerm] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState<ApprovalStatus>('ALL');

  const [selectedApproval, setSelectedApproval] =
    useState<ApprovalRecord | null>(null);

  const [modalType, setModalType] =
    useState<'reject' | 'delete' | null>(null);

  const [rejectionReason, setRejectionReason] =
    useState('');

  /*
   * =========================================================
   * INITIAL LOAD CONTROL
   * =========================================================
   */

  const initialLoadStarted =
    useRef(false);

  /*
   * =========================================================
   * LOAD APPROVALS
   * =========================================================
   *
   * IMPORTANT:
   *
   * This component DOES NOT read the browser Supabase session.
   *
   * Authentication is handled by:
   *
   * Browser
   *    ↓
   * /api/admin/ai-code-approvals
   *    ↓
   * Server Supabase session cookies
   *
   * Therefore there is no:
   *
   * supabase.auth.getSession()
   * supabase.auth.refreshSession()
   * Authorization: Bearer <token>
   *
   * here.
   */

  const loadApprovals = useCallback(
    async () => {
      setIsLoading(true);

      try {
        console.log(
          'ADMIN APPROVALS: Loading through server session...'
        );

        const response = await fetch(
          `/api/admin/ai-code-approvals?status=ALL&t=${Date.now()}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'Cache-Control': 'no-cache',
            },
            cache: 'no-store',
          }
        );

        let result: any = null;

        try {
          result = await response.json();
        } catch {
          result = null;
        }

        console.log(
          'ADMIN APPROVAL API STATUS:',
          response.status
        );

        if (!response.ok) {
          throw new Error(
            result?.error ||
              result?.message ||
              `Unable to load approval records (${response.status}).`
          );
        }

        if (result?.success === false) {
          throw new Error(
            result?.error ||
              'Unable to load approval records.'
          );
        }

        const records = Array.isArray(
          result?.approvals
        )
          ? result.approvals
          : Array.isArray(result?.data)
          ? result.data
          : [];

        setApprovals(records);

        console.log(
          'ADMIN APPROVALS LOADED:',
          records.length
        );
      } catch (error: any) {
        console.error(
          'ADMIN APPROVAL LOAD ERROR:',
          error
        );

        setApprovals([]);

        addToast({
          title:
            'Unable to Load Approvals',
          message:
            error?.message ||
            'Unable to load Government Administration approval records.',
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [addToast]
  );

  /*
   * =========================================================
   * KEEP LATEST LOAD FUNCTION IN REF
   * =========================================================
   */

  const loadApprovalsRef =
    useRef(loadApprovals);

  loadApprovalsRef.current =
    loadApprovals;

  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {
    if (initialLoadStarted.current) {
      return;
    }

    initialLoadStarted.current = true;

    void loadApprovalsRef.current();
  }, []);

  /*
   * =========================================================
   * ACTION
   * =========================================================
   */

  const performAction = async (
    action: ActionType,
    approval: ApprovalRecord,
    reason?: string
  ) => {
    if (isActionLoading) {
      return;
    }

    setIsActionLoading(true);

    try {
      /*
       * IMPORTANT:
       *
       * Do NOT request a browser Supabase token here.
       *
       * The server receives the authenticated session
       * through the cookies created during login.
       */

      console.log(
        `ADMIN ${action}: Sending request through server session...`
      );

      const response = await fetch(
        '/api/admin/ai-code-approvals',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type':
              'application/json',
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({
            action,
            approvalId: approval.id,

            reason:
              action === 'REJECT'
                ? reason?.trim() ||
                  'Rejected by Government Administrator.'
                : undefined,

            rejectionReason:
              action === 'REJECT'
                ? reason?.trim() ||
                  'Rejected by Government Administrator.'
                : undefined,
          }),
          cache: 'no-store',
        }
      );

      let result: any = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      console.log(
        `ADMIN ${action} API STATUS:`,
        response.status
      );

      if (!response.ok) {
        throw new Error(
          result?.error ||
            result?.message ||
            `Unable to ${action.toLowerCase()} approval.`
        );
      }

      if (result?.success === false) {
        throw new Error(
          result?.error ||
            `Unable to ${action.toLowerCase()} approval.`
        );
      }

      /*
       * Immediately remove processed item.
       */

      setApprovals((current) =>
        current.filter(
          (item) =>
            item.id !== approval.id
        )
      );

      setSelectedApproval(null);
      setModalType(null);
      setRejectionReason('');

      /*
       * APPROVE
       */

      if (action === 'APPROVE') {
        addToast({
          title:
            'Material Approved',
          message:
            result?.message ||
            'The AI standardization record has been approved and the company notification process has been started.',
          type: 'success',
        });
      }

      /*
       * REJECT
       */

      if (action === 'REJECT') {
        addToast({
          title:
            'Material Rejected',
          message:
            result?.message ||
            'The material has been rejected and removed from the active AI specification matcher.',
          type: 'success',
        });
      }

      /*
       * DELETE
       */

      if (action === 'DELETE') {
        addToast({
          title:
            'Record Deleted',
          message:
            result?.message ||
            'The approval and associated material record have been permanently removed.',
          type: 'success',
        });
      }

      /*
       * Synchronize backend data.
       */

      await loadApprovalsRef.current();
    } catch (error: any) {
      console.error(
        `ADMIN ${action} ERROR:`,
        error
      );

      addToast({
        title: `${action} Failed`,
        message:
          error?.message ||
          `Unable to ${action.toLowerCase()} this record.`,
        type: 'error',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  /*
   * =========================================================
   * APPROVE
   * =========================================================
   */

  const handleApprove = async (
    approval: ApprovalRecord
  ) => {
    await performAction(
      'APPROVE',
      approval
    );
  };

  /*
   * =========================================================
   * REJECT
   * =========================================================
   */

  const openRejectModal = (
    approval: ApprovalRecord
  ) => {
    setSelectedApproval(approval);
    setRejectionReason('');
    setModalType('reject');
  };

  const confirmReject = async () => {
    if (!selectedApproval) {
      return;
    }

    await performAction(
      'REJECT',
      selectedApproval,
      rejectionReason
    );
  };

  /*
   * =========================================================
   * DELETE
   * =========================================================
   */

  const openDeleteModal = (
    approval: ApprovalRecord
  ) => {
    setSelectedApproval(approval);
    setModalType('delete');
  };

  const confirmDelete = async () => {
    if (!selectedApproval) {
      return;
    }

    await performAction(
      'DELETE',
      selectedApproval
    );
  };

  /*
   * =========================================================
   * CLOSE MODAL
   * =========================================================
   */

  const closeModal = () => {
    if (isActionLoading) {
      return;
    }

    setSelectedApproval(null);
    setModalType(null);
    setRejectionReason('');
  };

  /*
   * =========================================================
   * FILTER
   * =========================================================
   */

  const filteredApprovals =
    useMemo(() => {
      const query =
        searchTerm
          .trim()
          .toLowerCase();

      return approvals.filter(
        (approval) => {
          const status =
            String(
              approval.approval_status ||
                ''
            ).toUpperCase();

          const matchesStatus =
            statusFilter === 'ALL' ||
            status ===
              statusFilter;

          if (!matchesStatus) {
            return false;
          }

          if (!query) {
            return true;
          }

          const searchableText = [
            approval.company_name,
            approval.part_name,
            approval.company_material_code,
            approval.ai_standard_code,
            approval.company_email,
            approval.company_material_id,
          ]
            .filter(
              (value) =>
                value !== null &&
                value !== undefined
            )
            .join(' ')
            .toLowerCase();

          return searchableText.includes(
            query
          );
        }
      );
    }, [
      approvals,
      searchTerm,
      statusFilter,
    ]);

  /*
   * =========================================================
   * STATISTICS
   * =========================================================
   */

  const stats = useMemo(() => {
    const pending =
      approvals.filter(
        (item) =>
          String(
            item.approval_status ||
              ''
          ).toUpperCase() ===
          'PENDING'
      ).length;

    const approved =
      approvals.filter(
        (item) =>
          String(
            item.approval_status ||
              ''
          ).toUpperCase() ===
          'APPROVED'
      ).length;

    const rejected =
      approvals.filter(
        (item) =>
          String(
            item.approval_status ||
              ''
          ).toUpperCase() ===
          'REJECTED'
      ).length;

    return {
      total: approvals.length,
      pending,
      approved,
      rejected,
    };
  }, [approvals]);

  /*
   * =========================================================
   * HELPERS
   * =========================================================
   */

  const formatConfidence = (
    value: number | null
  ) => {
    if (
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
    ) {
      return '—';
    }

    const numeric =
      Number(value);

    const percentage =
      numeric <= 1
        ? numeric * 100
        : numeric;

    return `${percentage.toFixed(
      1
    )}%`;
  };

  const formatDate = (
    value: string | null
  ) => {
    if (!value) {
      return '—';
    }

    try {
      return new Date(
        value
      ).toLocaleString(
        'en-IN',
        {
          dateStyle: 'medium',
          timeStyle: 'short',
        }
      );
    } catch {
      return value;
    }
  };

  const getStatus = (
    approval: ApprovalRecord
  ) =>
    String(
      approval.approval_status ||
        'PENDING'
    ).toUpperCase();

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* HEADER */}

      <div className="bg-[#001f3f] text-white border-b border-[#123b60]">
        <div className="max-w-[1600px] mx-auto px-5 sm:px-7 lg:px-10 py-5">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-amber-300" />

                <span className="text-[10px] font-black tracking-[0.2em] uppercase text-amber-300">
                  Government Administration
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black mt-2">
                AI Code Approval Center
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Review, approve, reject and manage AI-generated material standardization records.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadApprovalsRef.current()
              }
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition-all text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  isLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Refresh Records
            </button>

          </div>
        </div>
      </div>

      {/* CONTENT */}

      <main className="max-w-[1600px] mx-auto px-5 sm:px-7 lg:px-10 py-7">

        {/* STATISTICS */}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-slate-400">
                  Total Records
                </div>

                <div className="text-3xl font-black text-slate-900 mt-1">
                  {stats.total}
                </div>
              </div>

              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>

            </div>
          </div>

          <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-amber-600">
                  Pending
                </div>

                <div className="text-3xl font-black text-amber-700 mt-1">
                  {stats.pending}
                </div>
              </div>

              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Clock3 className="w-5 h-5" />
              </div>

            </div>
          </div>

          <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-emerald-600">
                  Approved
                </div>

                <div className="text-3xl font-black text-emerald-700 mt-1">
                  {stats.approved}
                </div>
              </div>

              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>

            </div>
          </div>

          <div className="bg-white border border-red-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">

              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-red-600">
                  Rejected
                </div>

                <div className="text-3xl font-black text-red-700 mt-1">
                  {stats.rejected}
                </div>
              </div>

              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>

            </div>
          </div>

        </div>

        {/* FILTER BAR */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-6">

          <div className="flex flex-col lg:flex-row gap-3">

            <div className="relative flex-1">

              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value
                  )
                }
                placeholder="Search company, part name, material code or AI standard code..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-sm"
              />

            </div>

            <div className="flex gap-2 flex-wrap">

              {(
                [
                  'ALL',
                  'PENDING',
                  'APPROVED',
                  'REJECTED',
                ] as ApprovalStatus[]
              ).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setStatusFilter(
                        status
                      )
                    }
                    className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-all ${
                      statusFilter ===
                      status
                        ? 'bg-[#002244] text-white border-[#002244]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {status}
                  </button>
                )
              )}

            </div>

          </div>

          <div className="mt-3 text-[10px] text-slate-400">

            Showing{' '}

            <span className="font-bold text-slate-700">
              {
                filteredApprovals.length
              }
            </span>

            {' '}of{' '}

            <span className="font-bold text-slate-700">
              {approvals.length}
            </span>

            {' '}records

          </div>

        </div>

        {/* LOADING */}

        {isLoading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-14 flex flex-col items-center justify-center">

            <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />

            <div className="text-sm font-bold text-slate-700 mt-4">
              Loading AI approval records...
            </div>

            <div className="text-xs text-slate-400 mt-1">
              Verifying Government Administration access.
            </div>

          </div>
        )}

        {/* EMPTY */}

        {!isLoading &&
          filteredApprovals.length ===
            0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-14 text-center">

              <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <FileCheck2 className="w-7 h-7 text-slate-400" />
              </div>

              <h2 className="text-lg font-black text-slate-800 mt-5">
                No approval records found
              </h2>

              <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                There are currently no records matching the selected status or search criteria.
              </p>

              {(searchTerm ||
                statusFilter !==
                  'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter(
                      'ALL'
                    );
                  }}
                  className="mt-5 px-4 py-2.5 rounded-xl bg-[#002244] text-white text-xs font-bold"
                >
                  Clear Filters
                </button>
              )}

            </div>
          )}

        {/* APPROVAL CARDS */}

        {!isLoading &&
          filteredApprovals.length >
            0 && (
            <div className="space-y-4">

              {filteredApprovals.map(
                (approval) => {
                  const status =
                    getStatus(
                      approval
                    );

                  return (
                    <div
                      key={
                        approval.id
                      }
                      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                    >

                      {/* CARD HEADER */}

                      <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">

                        <div className="min-w-0">

                          <div className="flex items-center gap-2 flex-wrap">

                            <h2 className="font-black text-base text-slate-900">
                              {approval.part_name ||
                                'Unnamed Material'}
                            </h2>

                            <span
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-black border ${
                                status ===
                                'PENDING'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : status ===
                                    'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : status ===
                                    'REJECTED'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {status}
                            </span>

                          </div>

                          <div className="text-[10px] text-slate-400 mt-1">

                            Approval ID:{' '}

                            <span className="font-mono">
                              {
                                approval.id
                              }
                            </span>

                          </div>

                        </div>

                        <div className="flex items-center gap-2 shrink-0">

                          {status ===
                            'PENDING' && (
                            <button
                              type="button"
                              disabled={
                                isActionLoading
                              }
                              onClick={() =>
                                void handleApprove(
                                  approval
                                )
                              }
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve
                            </button>
                          )}

                          {status ===
                            'PENDING' && (
                            <button
                              type="button"
                              disabled={
                                isActionLoading
                              }
                              onClick={() =>
                                openRejectModal(
                                  approval
                                )
                              }
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-black transition-all disabled:opacity-50"
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={
                              isActionLoading
                            }
                            onClick={() =>
                              openDeleteModal(
                                approval
                              )
                            }
                            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-black transition-all disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>

                        </div>

                      </div>

                      {/* CARD BODY */}

                      <div className="p-5">

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                          {/* COMPANY */}

                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                            <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">
                              Company
                            </div>

                            <div className="text-sm font-black text-slate-800 mt-1">
                              {approval.company_name ||
                                '—'}
                            </div>

                            <div className="text-[10px] text-slate-500 mt-1 break-all">
                              {approval.company_email ||
                                'No email'}
                            </div>

                          </div>

                          {/* COMPANY CODE */}

                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                            <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">
                              Company Material Code
                            </div>

                            <div className="text-sm font-mono font-black text-slate-800 mt-1 break-all">
                              {approval.company_material_code ||
                                '—'}
                            </div>

                            <div className="text-[10px] text-slate-500 mt-1">
                              Company Material ID:{' '}
                              {approval.company_material_id ??
                                '—'}
                            </div>

                          </div>

                          {/* AI CODE */}

                          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">

                            <div className="text-[9px] uppercase tracking-wider font-black text-blue-600">
                              AI Standard Code
                            </div>

                            <div className="text-sm font-mono font-black text-blue-900 mt-1 break-all">
                              {approval.ai_standard_code ||
                                '—'}
                            </div>

                            <div className="text-[10px] text-blue-600 mt-1">

                              AI Confidence:{' '}

                              <span className="font-black">
                                {formatConfidence(
                                  approval.ai_confidence
                                )}
                              </span>

                            </div>

                          </div>

                          {/* CREATED */}

                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">

                            <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">
                              Submitted
                            </div>

                            <div className="text-xs font-bold text-slate-700 mt-1">
                              {formatDate(
                                approval.created_at
                              )}
                            </div>

                            {approval.approved_at && (
                              <div className="text-[10px] text-emerald-600 mt-1">
                                Approved:{' '}
                                {formatDate(
                                  approval.approved_at
                                )}
                              </div>
                            )}

                            {approval.rejected_at && (
                              <div className="text-[10px] text-red-600 mt-1">
                                Rejected:{' '}
                                {formatDate(
                                  approval.rejected_at
                                )}
                              </div>
                            )}

                          </div>

                        </div>

                        {/* EMAIL STATUS */}

                        {approval.email_status && (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">

                              <div>

                                <div className="text-[9px] uppercase tracking-wider font-black text-slate-400">
                                  Company Notification
                                </div>

                                <div className="text-xs font-bold text-slate-700 mt-1">

                                  Email Status:{' '}

                                  <span className="uppercase">
                                    {
                                      approval.email_status
                                    }
                                  </span>

                                </div>

                              </div>

                              {approval.email_sent_at && (
                                <div className="text-[10px] text-slate-400">

                                  Sent:{' '}

                                  {formatDate(
                                    approval.email_sent_at
                                  )}

                                </div>
                              )}

                            </div>

                            {approval.email_error && (
                              <div className="mt-2 text-[10px] text-red-600">
                                {
                                  approval.email_error
                                }
                              </div>
                            )}

                          </div>
                        )}

                        {/* REJECTION REASON */}

                        {status ===
                          'REJECTED' &&
                          approval.rejection_reason && (
                            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">

                              <div className="text-[9px] uppercase tracking-wider font-black text-red-600">
                                Rejection Reason
                              </div>

                              <div className="text-xs text-red-800 mt-1 leading-relaxed">
                                {
                                  approval.rejection_reason
                                }
                              </div>

                            </div>
                          )}

                      </div>

                    </div>
                  );
                }
              )}

            </div>
          )}

      </main>

      {/* =====================================================
          REJECTION MODAL
      ===================================================== */}

      {modalType ===
        'reject' &&
        selectedApproval && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">

            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">

                <div>

                  <div className="text-lg font-black text-slate-900">
                    Reject Material
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    This will remove the material from the active AI specification matcher.
                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    isActionLoading
                  }
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>

              </div>

              <div className="p-5">

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4">

                  <div className="text-xs font-black text-slate-800">
                    {selectedApproval.part_name ||
                      'Unnamed Material'}
                  </div>

                  <div className="text-[10px] text-slate-500 mt-1">
                    {selectedApproval.company_name ||
                      'Unknown Company'}
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {
                      selectedApproval.company_material_code
                    }
                  </div>

                </div>

                <label className="block text-xs font-black text-slate-800 mb-2">
                  Rejection Reason
                </label>

                <textarea
                  value={
                    rejectionReason
                  }
                  onChange={(
                    event
                  ) =>
                    setRejectionReason(
                      event.target
                        .value
                    )
                  }
                  rows={5}
                  placeholder="Enter the reason for rejecting this material..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm resize-none focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400"
                />

                <div className="mt-3 flex items-start gap-2 text-[10px] text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">

                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />

                  <span>
                    Rejection will remove this material from the active AI matcher while preserving the administrative rejection record.
                  </span>

                </div>

                <div className="mt-5 flex gap-3">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      isActionLoading
                    }
                    className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void confirmReject()
                    }
                    disabled={
                      isActionLoading
                    }
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}

                    Confirm Rejection
                  </button>

                </div>

              </div>

            </div>

          </div>
        )}

      {/* =====================================================
          DELETE MODAL
      ===================================================== */}

      {modalType ===
        'delete' &&
        selectedApproval && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">

            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">

                <div>

                  <div className="text-lg font-black text-red-700">
                    Permanently Delete Record
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    This action cannot be undone.
                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    isActionLoading
                  }
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>

              </div>

              <div className="p-5">

                <div className="rounded-xl border border-red-200 bg-red-50 p-4">

                  <div className="flex items-start gap-3">

                    <Trash2 className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />

                    <div>

                      <div className="text-sm font-black text-red-900">
                        Delete this entire record?
                      </div>

                      <p className="text-xs text-red-700 mt-1 leading-relaxed">
                        The approval record and associated material data will be permanently removed according to the backend deletion workflow.
                      </p>

                    </div>

                  </div>

                </div>

                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">

                  <div className="text-sm font-black text-slate-800">
                    {selectedApproval.part_name ||
                      'Unnamed Material'}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {selectedApproval.company_name ||
                      'Unknown Company'}
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {
                      selectedApproval.company_material_code
                    }
                  </div>

                  <div className="text-[10px] text-slate-400 mt-2">

                    Approval ID:{' '}

                    {
                      selectedApproval.id
                    }

                  </div>

                </div>

                <div className="mt-5 flex gap-3">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    disabled={
                      isActionLoading
                    }
                    className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void confirmDelete()
                    }
                    disabled={
                      isActionLoading
                    }
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}

                    Permanently Delete
                  </button>

                </div>

              </div>

            </div>

          </div>
        )}

    </div>
  );
};

export default AdminView;