import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { motion } from "motion/react";

import { useApp } from "../../context/AppContext";

import { KPICard } from "../ui/KPICard";

import {
  Database,
  Layers,
  Brain,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Building,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Clock,
  ChevronRight,
  Network,
  Search,
  FileCheck,
} from "lucide-react";

/* ============================================================
   TYPES
============================================================ */

interface DashboardStats {
  success: boolean;

  generated_at?: string;

  materials: {
    total: number;
    details: number;
    embeddings: number;
    embedding_coverage_percent: number;
    assigned_bmg: number;
    unassigned_bmg: number;
    bmg_assignment_coverage_percent: number;
  };

  bmg: {
    total: number;
    proposed: number;
    approved: number;
    rejected: number;

    mappings: number;
    active_mappings: number;
    ai_proposed_mappings: number;
    pending_mappings: number;
    approved_mappings: number;
  };

  review: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };

  companies: {
    company: string;
    records: number;
  }[];
}

/* ============================================================
   EMPTY STATE
============================================================ */

const EMPTY_STATS: DashboardStats = {
  success: true,

  materials: {
    total: 0,
    details: 0,
    embeddings: 0,
    embedding_coverage_percent: 0,
    assigned_bmg: 0,
    unassigned_bmg: 0,
    bmg_assignment_coverage_percent: 0,
  },

  bmg: {
    total: 0,
    proposed: 0,
    approved: 0,
    rejected: 0,

    mappings: 0,
    active_mappings: 0,
    ai_proposed_mappings: 0,
    pending_mappings: 0,
    approved_mappings: 0,
  },

  review: {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
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
    "en-IN"
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

export const DashboardView: React.FC =
  () => {
    const {
      cpses,
      procurementOpportunities,
      setCurrentTab,
      setSelectedCPSEId,
      setSelectedOpportunityId,
      startSIHDemo,
    } = useApp();

    const [stats, setStats] =
      useState<DashboardStats>(
        EMPTY_STATS
      );

    const [
      loadingStats,
      setLoadingStats,
    ] = useState(true);

    const [
      refreshingStats,
      setRefreshingStats,
    ] = useState(false);

    const [
      statsError,
      setStatsError,
    ] = useState("");

    const [
      lastUpdated,
      setLastUpdated,
    ] = useState<string | null>(
      null
    );

    /* ========================================================
       LOAD LIVE DASHBOARD DATA
    ======================================================== */

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

          setStatsError("");

          const response =
            await fetch(
              "/api/dashboard-stats",
              {
                method: "GET",
                cache: "no-store",
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
                "Failed to load dashboard statistics."
            );
          }

          setStats(result);

          setLastUpdated(
            result.generated_at ||
              new Date().toISOString()
          );
        } catch (error) {
          console.error(
            "Dashboard statistics error:",
            error
          );

          setStatsError(
            error instanceof Error
              ? error.message
              : "Failed to load dashboard statistics."
          );
        } finally {
          setLoadingStats(false);
          setRefreshingStats(false);
        }
      };

    /* ========================================================
       INITIAL LOAD + AUTO REFRESH
    ======================================================== */

    useEffect(() => {
      loadDashboardStats();

      const interval =
        window.setInterval(() => {
          loadDashboardStats(true);
        }, 30000);

      return () =>
        window.clearInterval(
          interval
        );
    }, []);

    /* ========================================================
       LIVE DATABASE VALUES
    ======================================================== */

    const materialTotal =
      safeNumber(
        stats.materials.total
      );

    const assignedMaterials =
      safeNumber(
        stats.materials.assigned_bmg
      );

    const unassignedMaterials =
      safeNumber(
        stats.materials.unassigned_bmg
      );

    const embeddingTotal =
      safeNumber(
        stats.materials.embeddings
      );

    const embeddingCoverage =
      safeNumber(
        stats.materials
          .embedding_coverage_percent
      );

    const bmgTotal =
      safeNumber(
        stats.bmg.total
      );

    const activeMappings =
      safeNumber(
        stats.bmg.active_mappings
      );

    const aiProposedMappings =
      safeNumber(
        stats.bmg.ai_proposed_mappings
      );

    const pendingMappings =
      safeNumber(
        stats.bmg.pending_mappings
      );

    const approvedMappings =
      safeNumber(
        stats.bmg.approved_mappings
      );

    const bmgCoverage =
      safeNumber(
        stats.materials
          .bmg_assignment_coverage_percent
      );

    const pendingReviews =
      safeNumber(
        stats.review.pending
      );

    const totalReviews =
      safeNumber(
        stats.review.total
      );

    const approvedReviews =
      safeNumber(
        stats.review.approved
      );

    /* ========================================================
       EXISTING APPLICATION DATA
    ======================================================== */

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

    const reviewRate =
      percentage(
        approvedReviews,
        totalReviews
      );

    /* ========================================================
       COMPANY COVERAGE
    ======================================================== */

    const topCompanies =
      useMemo(
        () =>
          stats.companies.slice(
            0,
            8
          ),
        [stats.companies]
      );

    /* ========================================================
       LAST UPDATED
    ======================================================== */

    const formattedLastUpdated =
      lastUpdated
        ? new Date(
            lastUpdated
          ).toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }
          )
        : "—";

    /* ========================================================
       RENDER
    ======================================================== */

    return (
      <div className="p-4 lg:p-7 space-y-6 w-full">

        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-7 shadow-xs">

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">

            <div className="space-y-2 max-w-4xl">

              <div className="flex flex-wrap items-center gap-2">

                <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider font-mono">
                  Govt. of India • National Material Intelligence
                </span>

                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium px-2.5 py-0.5 rounded-md font-mono">
                  {formatNumber(
                    stats.companies.length
                  )}{" "}
                  CPSE Data Sources
                </span>

              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                National Material Intelligence Platform
              </h1>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
                Live national material database with
                AI-assisted technical matching and
                shared Bharat Material Grid identities
                across participating CPSEs.
              </p>

            </div>

            <div className="flex flex-wrap items-center gap-3">

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
                      ? "animate-spin"
                      : ""
                  }`}
                />

                Refresh Data
              </button>

              <button
                onClick={
                  startSIHDemo
                }
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />

                Interactive Walkthrough
              </button>

              <button
                onClick={() =>
                  setCurrentTab(
                    "upload"
                  )
                }
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4" />

                Ingest CPSE Batch
              </button>

            </div>

          </div>

          {/* ==================================================
              LIVE STATUS STRIP
          ================================================== */}

          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">

              <Database className="w-4 h-4 text-slate-700" />

              <div>

                <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                  Material Records
                </span>

                <span className="text-slate-900 font-bold text-xs">
                  {loadingStats
                    ? "Loading..."
                    : formatNumber(
                        materialTotal
                      )}
                </span>

              </div>

            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">

              <Network className="w-4 h-4 text-emerald-700" />

              <div>

                <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                  BMG Assigned
                </span>

                <span className="text-emerald-700 font-bold text-xs">
                  {formatNumber(
                    assignedMaterials
                  )}
                </span>

              </div>

            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">

              <Brain className="w-4 h-4 text-violet-700" />

              <div>

                <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                  Embeddings
                </span>

                <span className="text-slate-900 font-bold text-xs">
                  {embeddingCoverage.toFixed(
                    1
                  )}
                  %
                </span>

              </div>

            </div>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">

              <Clock className="w-4 h-4 text-amber-700" />

              <div>

                <span className="text-slate-500 block text-[10px] font-mono uppercase tracking-wider">
                  Last Sync
                </span>

                <span className="text-slate-900 font-bold text-xs">
                  {formattedLastUpdated}
                </span>

              </div>

            </div>

          </div>

          {statsError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">

              Live dashboard statistics could
              not be loaded.

              <div className="mt-1 font-mono text-[10px]">
                {statsError}
              </div>

            </div>
          )}

        </div>

        {/* ====================================================
            MAIN KPI CARDS
        ==================================================== */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <KPICard
            label="Material Records"
            value={
              loadingStats
                ? "—"
                : materialTotal
            }
            trend={{
              value: `${formatNumber(
                assignedMaterials
              )} BMG assigned`,
              direction:
                "neutral",
            }}
            subtitle="Live records in the national material database"
            icon={
              <Database className="w-4 h-4" />
            }
            delay={0}
          />

          <KPICard
            label="BMG Identities"
            value={
              loadingStats
                ? "—"
                : bmgTotal
            }
            trend={{
              value: `${bmgCoverage}% material coverage`,
              direction: "up",
            }}
            subtitle="Shared technical identities across companies"
            icon={
              <Layers className="w-4 h-4" />
            }
            progressPercent={
              bmgCoverage
            }
            progressLabel="BMG Assignment Coverage"
            delay={1}
          />

          <KPICard
            label="Active BMG Mappings"
            value={
              loadingStats
                ? "—"
                : activeMappings
            }
            trend={{
              value: `${formatNumber(
                approvedMappings
              )} approved`,
              direction:
                "up",
            }}
            subtitle="Materials currently linked to a BMG identity"
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
              loadingStats
                ? "—"
                : pendingReviews +
                  pendingMappings
            }
            trend={{
              value: `${formatNumber(
                pendingReviews
              )} review requests`,
              direction:
                "neutral",
            }}
            subtitle="Assignments requiring controlled governance"
            icon={
              <AlertTriangle className="w-4 h-4" />
            }
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
            delay={3}
          />

        </div>

        {/* ====================================================
            BMG PLATFORM STATUS
        ==================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* BMG MASTER */}

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  BMG Master
                </div>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatNumber(
                    bmgTotal
                  )}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {formatNumber(
                    stats.bmg.proposed
                  )}{" "}
                  proposed
                </div>

              </div>

              <Layers className="w-6 h-6 text-blue-700" />

            </div>

          </div>

          {/* ACTIVE MAPPINGS */}

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Active Mappings
                </div>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatNumber(
                    activeMappings
                  )}
                </div>

                <div className="mt-1 text-xs text-emerald-700 font-semibold">
                  {bmgCoverage}%
                  {" "}
                  coverage
                </div>

              </div>

              <Network className="w-6 h-6 text-emerald-700" />

            </div>

          </div>

          {/* AI PROPOSED */}

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  AI Proposed
                </div>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatNumber(
                    aiProposedMappings
                  )}
                </div>

                <div className="mt-1 text-xs text-violet-700 font-semibold">
                  Awaiting governance
                </div>

              </div>

              <Brain className="w-6 h-6 text-violet-700" />

            </div>

          </div>

          {/* UNASSIGNED */}

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Unassigned
                </div>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatNumber(
                    unassignedMaterials
                  )}
                </div>

                <div className="mt-1 text-xs text-amber-700 font-semibold">
                  Materials without BMG
                </div>

              </div>

              <Search className="w-6 h-6 text-amber-700" />

            </div>

          </div>

        </div>

        {/* ====================================================
            BMG HARMONIZATION FUNNEL
        ==================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between mb-5">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Bharat Material Grid Harmonization
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Live progression from source material
                  records to shared technical identities
                </p>

              </div>

              <span className="text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md">
                LIVE DATABASE
              </span>

            </div>

            <div className="space-y-3">

              {/* SOURCE */}

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                      1
                    </div>

                    <div>

                      <div className="text-xs font-bold text-slate-900">
                        Source Material Records
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Materials stored in the national database
                      </div>

                    </div>

                  </div>

                  <div className="font-mono font-bold text-slate-900">
                    {formatNumber(
                      materialTotal
                    )}
                  </div>

                </div>

              </div>

              {/* EMBEDDINGS */}

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-slate-700 text-white font-bold text-xs flex items-center justify-center">
                      2
                    </div>

                    <div>

                      <div className="text-xs font-bold text-slate-900">
                        Semantic Intelligence
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Technical representations available for search
                      </div>

                    </div>

                  </div>

                  <div className="text-right">

                    <div className="font-mono font-bold text-slate-900">
                      {formatNumber(
                        embeddingTotal
                      )}
                    </div>

                    <div className="text-[10px] text-slate-500">
                      {embeddingCoverage}%
                    </div>

                  </div>

                </div>

                <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">

                  <div
                    className="h-full bg-slate-700 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        embeddingCoverage
                      )}%`,
                    }}
                  />

                </div>

              </div>

              {/* BMG */}

              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200">

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
                      3
                    </div>

                    <div>

                      <div className="text-xs font-bold text-emerald-900">
                        Shared BMG Identity
                      </div>

                      <div className="text-[11px] text-emerald-700">
                        Technically equivalent products share one BMG code
                      </div>

                    </div>

                  </div>

                  <div className="text-right">

                    <div className="font-mono font-bold text-emerald-900">
                      {formatNumber(
                        bmgTotal
                      )}
                    </div>

                    <div className="text-[10px] text-emerald-700">
                      identities
                    </div>

                  </div>

                </div>

                <div className="mt-3 h-1.5 bg-emerald-100 rounded-full overflow-hidden">

                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        bmgCoverage
                      )}%`,
                    }}
                  />

                </div>

              </div>

              {/* GOVERNANCE */}

              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200">

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 rounded-lg bg-amber-600 text-white font-bold text-xs flex items-center justify-center">
                      4
                    </div>

                    <div>

                      <div className="text-xs font-bold text-amber-900">
                        Governance & Review
                      </div>

                      <div className="text-[11px] text-amber-700">
                        AI proposals controlled by review workflow
                      </div>

                    </div>

                  </div>

                  <div className="font-mono font-bold text-amber-900">
                    {formatNumber(
                      pendingReviews +
                        pendingMappings
                    )}
                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* ==================================================
              REVIEW CONTROL
          ================================================== */}

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">

            <div>

              <div className="flex items-start justify-between">

                <div>

                  <h2 className="text-base font-bold text-slate-900">
                    Governance Control
                  </h2>

                  <p className="text-xs text-slate-500 mt-1">
                    AI-generated BMG decisions requiring review
                  </p>

                </div>

                <ShieldCheck className="w-5 h-5 text-emerald-700" />

              </div>

              <div className="mt-5 space-y-3">

                <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">

                  <span className="text-xs font-semibold text-amber-900">
                    Pending Reviews
                  </span>

                  <span className="text-lg font-bold text-amber-800">
                    {formatNumber(
                      pendingReviews
                    )}
                  </span>

                </div>

                <div className="flex items-center justify-between rounded-lg bg-violet-50 border border-violet-100 px-4 py-3">

                  <span className="text-xs font-semibold text-violet-900">
                    AI Proposed
                  </span>

                  <span className="text-lg font-bold text-violet-800">
                    {formatNumber(
                      aiProposedMappings
                    )}
                  </span>

                </div>

                <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">

                  <span className="text-xs font-semibold text-emerald-800">
                    Approved Reviews
                  </span>

                  <span className="text-lg font-bold text-emerald-800">
                    {formatNumber(
                      approvedReviews
                    )}
                  </span>

                </div>

              </div>

              <div className="mt-4 text-[11px] text-slate-500">
                Review approval rate:{" "}
                <span className="font-bold text-slate-800">
                  {reviewRate}%
                </span>
              </div>

            </div>

            <button
              onClick={() =>
                setCurrentTab(
                  "review-queue"
                )
              }
              className="mt-5 w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              Open Review Queue

              <ArrowRight className="w-4 h-4" />
            </button>

          </div>

        </div>

        {/* ====================================================
            BMG GOVERNANCE
        ==================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* BMG MASTER */}

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  BMG Master
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Global technical identities
                </p>

              </div>

              <Layers className="w-5 h-5 text-blue-700" />

            </div>

            <div className="grid grid-cols-3 gap-2 mt-5">

              <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">

                <div className="text-[10px] uppercase font-bold text-violet-600">
                  Proposed
                </div>

                <div className="mt-1 text-lg font-bold text-violet-800">
                  {formatNumber(
                    stats.bmg.proposed
                  )}
                </div>

              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">

                <div className="text-[10px] uppercase font-bold text-emerald-600">
                  Approved
                </div>

                <div className="mt-1 text-lg font-bold text-emerald-800">
                  {formatNumber(
                    stats.bmg.approved
                  )}
                </div>

              </div>

              <div className="rounded-lg bg-red-50 border border-red-100 p-3">

                <div className="text-[10px] uppercase font-bold text-red-600">
                  Rejected
                </div>

                <div className="mt-1 text-lg font-bold text-red-800">
                  {formatNumber(
                    stats.bmg.rejected
                  )}
                </div>

              </div>

            </div>

            <button
              onClick={() =>
                setCurrentTab(
                  "master"
                )
              }
              className="mt-5 w-full border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              Open Material Catalog

              <ArrowRight className="w-4 h-4" />
            </button>

          </div>

          {/* MAPPING STATUS */}

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Mapping Status
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Material-to-BMG relationships
                </p>

              </div>

              <Network className="w-5 h-5 text-emerald-700" />

            </div>

            <div className="mt-5 space-y-3">

              <div className="flex items-center justify-between">

                <span className="text-xs font-semibold text-slate-600">
                  Active
                </span>

                <span className="font-mono font-bold text-emerald-700">
                  {formatNumber(
                    activeMappings
                  )}
                </span>

              </div>

              <div className="flex items-center justify-between">

                <span className="text-xs font-semibold text-slate-600">
                  AI Proposed
                </span>

                <span className="font-mono font-bold text-violet-700">
                  {formatNumber(
                    aiProposedMappings
                  )}
                </span>

              </div>

              <div className="flex items-center justify-between">

                <span className="text-xs font-semibold text-slate-600">
                  Pending
                </span>

                <span className="font-mono font-bold text-amber-700">
                  {formatNumber(
                    pendingMappings
                  )}
                </span>

              </div>

              <div className="flex items-center justify-between">

                <span className="text-xs font-semibold text-slate-600">
                  Approved
                </span>

                <span className="font-mono font-bold text-emerald-700">
                  {formatNumber(
                    approvedMappings
                  )}
                </span>

              </div>

            </div>

          </div>

          {/* SEMANTIC INTELLIGENCE */}

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Semantic Intelligence
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Technical retrieval infrastructure
                </p>

              </div>

              <Brain className="w-5 h-5 text-violet-700" />

            </div>

            <div className="mt-5">

              <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">

                <div className="text-[10px] uppercase tracking-wider font-bold text-violet-600">
                  Embedding Coverage
                </div>

                <div className="mt-2 text-3xl font-bold text-violet-900">
                  {embeddingCoverage}%
                </div>

                <div className="mt-2 text-xs text-violet-700">
                  {formatNumber(
                    embeddingTotal
                  )}{" "}
                  material vectors
                </div>

              </div>

            </div>

            <div className="mt-4 text-[11px] leading-5 text-slate-500">
              Semantic retrieval supports technical
              comparison, while BMG assignment remains
              governed by technical equivalence.
            </div>

          </div>

        </div>

        {/* ====================================================
            COMPANY DATABASE COVERAGE
        ==================================================== */}

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

          <div className="flex items-center justify-between gap-4">

            <div>

              <h2 className="text-base font-bold text-slate-900">
                Material Database Coverage
              </h2>

              <p className="text-xs text-slate-500 mt-1">
                Live source-record distribution by company
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
                            )}{" "}
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

        {/* ====================================================
            EXISTING CPSE PERFORMANCE
        ==================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Application CPSE Performance
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Existing ingestion metrics
                </p>

              </div>

              <FileCheck className="w-5 h-5 text-slate-700" />

            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">

                <div className="text-[10px] uppercase font-bold text-slate-500">
                  Uploaded
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {formatNumber(
                    totalUploaded
                  )}
                </div>

              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">

                <div className="text-[10px] uppercase font-bold text-slate-500">
                  Normalized
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {formatNumber(
                    totalNormalized
                  )}
                </div>

              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">

                <div className="text-[10px] uppercase font-bold text-slate-500">
                  Matched
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {formatNumber(
                    totalMatched
                  )}
                </div>

              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">

                <div className="text-[10px] uppercase font-bold text-slate-500">
                  Avg Quality
                </div>

                <div className="mt-1 text-xl font-bold text-slate-900">
                  {avgQualityScore}%
                </div>

              </div>

            </div>

          </div>

          {/* SAVINGS */}

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  National Rate Opportunities
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Existing procurement opportunity data
                </p>

              </div>

              <TrendingUp className="w-5 h-5 text-emerald-700" />

            </div>

            <div className="mt-5">

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">

                <div className="text-[10px] uppercase font-bold text-emerald-700">
                  Projected Savings
                </div>

                <div className="mt-2 text-3xl font-bold text-emerald-900">
                  ₹
                  {(
                    totalSavingsINR /
                    10000000
                  ).toFixed(2)}{" "}
                  Cr
                </div>

              </div>

              <button
                onClick={() =>
                  setCurrentTab(
                    "procurement"
                  )
                }
                className="mt-4 w-full border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                Open Procurement

                <ArrowRight className="w-4 h-4" />
              </button>

            </div>

          </div>

        </div>

      </div>
    );
  };

export default DashboardView;