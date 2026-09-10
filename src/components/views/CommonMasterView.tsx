import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Search,
  Building,
  CheckCircle2,
  Clock3,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Layers,
  RefreshCw,
} from 'lucide-react';

interface NCSMapping {
  mapping_id: string;
  material_id: number;
  company: string;
  company_id: number | null;
  material_number: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
  ai_confidence: number;
  match_status: string;
  verified: boolean;
}

interface NCSRecord {
  ncs_id: number | string;
  ncs_code: string | null;
  ncs_name: string | null;
  category: string | null;
  subcategory: string | null;
  standard_specification: string | null;
  status: string | null;
  cpse_count: number;
  material_count: number;
  verified_count: number;
  proposed_count: number;
  average_confidence: number;
  companies: string[];
  mappings: NCSMapping[];
}

interface NCSSummary {
  total_national_materials: number;
  approved_national_materials: number;
  proposed_national_materials: number;
  review_national_materials: number;
  total_mapped_cpse_materials: number;
  participating_cpse_count: number;
}

const safeText = (value: unknown) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 'Not available';
  }

  return String(value);
};

const statusClasses = (status: string | null) => {
  const value = String(status || '')
    .trim()
    .toUpperCase();

  if (value === 'APPROVED') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (
    value === 'PENDING_REVIEW' ||
    value === 'UNDER_REVIEW'
  ) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return 'bg-blue-50 text-blue-700 border-blue-200';
};

export const CommonMasterView: React.FC = () => {
  const [records, setRecords] = useState<NCSRecord[]>([]);
  const [summary, setSummary] =
    useState<NCSSummary | null>(null);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('All');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] =
    useState<string | number | null>(null);

  /* =========================================================
     LOAD REAL NATIONAL MASTER
  ========================================================= */

  const loadNationalMaster = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(
        '/api/ncs-master',
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            'Failed to load national material master.'
        );
      }

      setRecords(result.results || []);
      setSummary(result.summary || null);
    } catch (err) {
      console.error(
        'National master load error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load national material master.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNationalMaster();
  }, []);

  /* =========================================================
     COMPANY LIST
  ========================================================= */

  const companies = useMemo(() => {
    return [
      ...new Set(
        records
          .flatMap(
            (record) =>
              record.companies || []
          )
          .map(
            (company) =>
              String(company)
                .trim()
                .toUpperCase()
          )
          .filter(Boolean)
      ),
    ].sort();
  }, [records]);

  /* =========================================================
     FILTER
  ========================================================= */

  const filteredRecords = useMemo(() => {
    const searchText =
      search.trim().toLowerCase();

    return records.filter(
      (record) => {
        const matchesCompany =
          companyFilter === 'All' ||
          record.companies.some(
            (company) =>
              company
                .trim()
                .toUpperCase() ===
              companyFilter
          );

        if (!matchesCompany) {
          return false;
        }

        if (!searchText) {
          return true;
        }

        const nationalText = [
          record.ncs_code,
          record.ncs_name,
          record.category,
          record.subcategory,
          record.standard_specification,
          ...(record.companies || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const mappedMaterialText =
          record.mappings
            .map(
              (mapping) =>
                [
                  mapping.company,
                  mapping.material_number,
                  mapping.description,
                  mapping.specifications,
                  mapping.category,
                ]
                  .filter(Boolean)
                  .join(' ')
            )
            .join(' ')
            .toLowerCase();

        return (
          nationalText.includes(searchText) ||
          mappedMaterialText.includes(
            searchText
          )
        );
      }
    );
  }, [
    records,
    search,
    companyFilter,
  ]);

  /* =========================================================
     COMPANY COUNTS
  ========================================================= */

  const companyCounts = useMemo(() => {
    return companies.map(
      (company) => ({
        company,

        count: records.filter(
          (record) =>
            record.companies.some(
              (item) =>
                item
                  .trim()
                  .toUpperCase() ===
                company
            )
        ).length,
      })
    );
  }, [records, companies]);

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="bg-[#000a1e] rounded-2xl border border-slate-800 p-12 text-center">

          <RefreshCw className="w-8 h-8 mx-auto text-emerald-400 animate-spin mb-4" />

          <h2 className="text-sm font-bold text-white">
            Loading National Material Master
          </h2>

          <p className="text-xs text-slate-400 mt-2">
            Reading Common National Material records from Supabase.
          </p>

        </div>
      </div>
    );
  }

  /* =========================================================
     ERROR
  ========================================================= */

  if (error) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="bg-white rounded-2xl border border-red-200 p-10 text-center">

          <Database className="w-10 h-10 mx-auto text-red-300 mb-3" />

          <h2 className="text-sm font-bold text-slate-900">
            National Master Could Not Be Loaded
          </h2>

          <p className="text-xs text-red-600 mt-2">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadNationalMaster()
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

      <div className="bg-[#000a1e] border border-slate-800 rounded-2xl p-5 shadow-sm">

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

          <div>

            <div className="flex items-center gap-2 flex-wrap">

              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono">
                NATIONAL MASTER
              </span>

              <span className="text-xs text-slate-400 font-mono">
                {summary
                  ? summary.total_national_materials.toLocaleString()
                  : '0'}{' '}
                Common Material Records
              </span>

            </div>

            <h1 className="text-xl font-bold text-white tracking-tight mt-2">
              Bharat Common Material Master
            </h1>

            <p className="text-xs text-slate-300 mt-1">
              One national material identity with traceability to participating CPSE material codes.
            </p>

          </div>

          <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
            <Database className="w-4 h-4" />
            Supabase Connected
          </div>

        </div>

        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800">

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">

            <div className="text-[10px] text-slate-400 font-mono">
              NATIONAL MATERIALS
            </div>

            <div className="text-2xl font-bold text-white font-mono mt-2">
              {summary?.total_national_materials?.toLocaleString() || '0'}
            </div>

          </div>

          <div className="bg-slate-900 border border-emerald-900/40 rounded-xl p-4">

            <div className="text-[10px] text-slate-400 font-mono">
              APPROVED
            </div>

            <div className="text-2xl font-bold text-emerald-400 font-mono mt-2">
              {summary?.approved_national_materials?.toLocaleString() || '0'}
            </div>

          </div>

          <div className="bg-slate-900 border border-amber-900/40 rounded-xl p-4">

            <div className="text-[10px] text-slate-400 font-mono">
              PROPOSED
            </div>

            <div className="text-2xl font-bold text-amber-400 font-mono mt-2">
              {summary?.proposed_national_materials?.toLocaleString() || '0'}
            </div>

          </div>

          <div className="bg-slate-900 border border-blue-900/40 rounded-xl p-4">

            <div className="text-[10px] text-slate-400 font-mono">
              MAPPED MATERIALS
            </div>

            <div className="text-2xl font-bold text-blue-400 font-mono mt-2">
              {summary?.total_mapped_cpse_materials?.toLocaleString() || '0'}
            </div>

          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">

            <div className="text-[10px] text-slate-400 font-mono">
              PARTICIPATING CPSEs
            </div>

            <div className="text-2xl font-bold text-white font-mono mt-2">
              {summary?.participating_cpse_count?.toLocaleString() || '0'}
            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          CPSE FILTERS
      ===================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {companyCounts.map(
            ({
              company,
              count,
            }) => (
              <button
                key={company}
                type="button"
                onClick={() =>
                  setCompanyFilter(
                    companyFilter ===
                      company
                      ? 'All'
                      : company
                  )
                }
                className={`text-left p-4 rounded-xl border transition-all ${
                  companyFilter ===
                  company
                    ? 'bg-emerald-50 border-emerald-400'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                }`}
              >

                <div className="flex items-center justify-between">

                  <span className="text-[10px] text-slate-500 font-mono font-bold">
                    {company}
                  </span>

                  <Building className="w-4 h-4 text-slate-400" />

                </div>

                <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
                  {count.toLocaleString()}
                </div>

                <div className="text-[10px] text-slate-500 mt-1">
                  national materials mapped
                </div>

              </button>
            )
          )}

        </div>

      </div>

      {/* =====================================================
          SEARCH
      ===================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">

        <div className="flex flex-col md:flex-row gap-3">

          <div className="relative flex-1">

            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search NCS code, common name, CPSE code, description, specification..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />

          </div>

          <select
            value={companyFilter}
            onChange={(event) =>
              setCompanyFilter(
                event.target.value
              )
            }
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
          >

            <option value="All">
              All Companies
            </option>

            {companies.map(
              (company) => (
                <option
                  key={company}
                  value={company}
                >
                  {company}
                </option>
              )
            )}

          </select>

        </div>

        <div className="flex items-center justify-between mt-3 text-[10px] font-mono text-slate-400">

          <span>
            Showing{' '}
            {filteredRecords.length.toLocaleString()}{' '}
            national material records
          </span>

          {companyFilter !== 'All' && (
            <button
              type="button"
              onClick={() =>
                setCompanyFilter(
                  'All'
                )
              }
              className="text-amber-600 font-bold hover:underline"
            >
              Show All Companies
            </button>
          )}

        </div>

      </div>

      {/* =====================================================
          EMPTY STATE
      ===================================================== */}

      {filteredRecords.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">

          <Layers className="w-10 h-10 mx-auto text-slate-300 mb-3" />

          <h2 className="text-sm font-bold text-slate-800">
            No National Material Records Found
          </h2>

          <p className="text-xs text-slate-500 mt-1">
            No NCS records match your current search or CPSE filter.
          </p>

        </div>
      )}

      {/* =====================================================
          NATIONAL MASTER GRID
      ===================================================== */}

      {filteredRecords.length > 0 && (
        <div className="space-y-4">

          {filteredRecords.map(
            (record) => {

              const recordKey =
                String(
                  record.ncs_id
                );

              const expanded =
                expandedId ===
                record.ncs_id;

              return (
                <div
                  key={recordKey}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >

                  {/* =========================================
                      MAIN RECORD
                  ========================================= */}

                  <div className="p-5">

                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">

                      <div className="flex-1">

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="bg-slate-900 text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded">
                            {safeText(
                              record.ncs_code
                            )}
                          </span>

                          <span
                            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${statusClasses(
                              record.status
                            )}`}
                          >

                            {String(
                              record.status ||
                                ''
                            )
                              .toUpperCase() ===
                            'APPROVED' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock3 className="w-3 h-3" />
                            )}

                            {safeText(
                              record.status
                            )}

                          </span>

                        </div>

                        <h2 className="text-lg font-bold text-slate-900 mt-3">
                          {safeText(
                            record.ncs_name
                          )}
                        </h2>

                        <p className="text-xs text-slate-500 mt-1">
                          {safeText(
                            record.standard_specification
                          )}
                        </p>

                        <div className="flex flex-wrap gap-2 mt-3">

                          {record.companies.map(
                            (company) => (
                              <span
                                key={company}
                                className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-mono font-bold px-2 py-1 rounded"
                              >
                                {company}
                              </span>
                            )
                          )}

                        </div>

                      </div>

                      {/* =====================================
                          METRICS
                      ===================================== */}

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 lg:min-w-[480px]">

                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">

                          <div className="text-[9px] text-slate-400 font-mono uppercase">
                            CPSEs
                          </div>

                          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                            {record.cpse_count}
                          </div>

                        </div>

                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">

                          <div className="text-[9px] text-slate-400 font-mono uppercase">
                            MAPPED
                          </div>

                          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                            {record.material_count}
                          </div>

                        </div>

                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">

                          <div className="text-[9px] text-slate-400 font-mono uppercase">
                            VERIFIED
                          </div>

                          <div className="text-xl font-bold text-emerald-600 font-mono mt-1">
                            {record.verified_count}
                          </div>

                        </div>

                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">

                          <div className="text-[9px] text-slate-400 font-mono uppercase">
                            AI CONFIDENCE
                          </div>

                          <div className="text-xl font-bold text-blue-600 font-mono mt-1">
                            {record.average_confidence}%
                          </div>

                        </div>

                      </div>

                    </div>

                    {/* =====================================
                        CATEGORY
                    ===================================== */}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">

                      <div className="border border-slate-100 rounded-xl p-3">

                        <div className="text-[9px] text-slate-400 font-mono uppercase">
                          Category
                        </div>

                        <div className="text-xs font-semibold text-slate-800 mt-1">
                          {safeText(
                            record.category
                          )}
                        </div>

                      </div>

                      <div className="border border-slate-100 rounded-xl p-3">

                        <div className="text-[9px] text-slate-400 font-mono uppercase">
                          Subcategory
                        </div>

                        <div className="text-xs font-semibold text-slate-800 mt-1">
                          {safeText(
                            record.subcategory
                          )}
                        </div>

                      </div>

                      <div className="border border-slate-100 rounded-xl p-3">

                        <div className="text-[9px] text-slate-400 font-mono uppercase">
                          Standard Specification
                        </div>

                        <div className="text-xs font-semibold text-slate-800 mt-1">
                          {safeText(
                            record.standard_specification
                          )}
                        </div>

                      </div>

                    </div>

                    {/* =====================================
                        EXPAND BUTTON
                    ===================================== */}

                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">

                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">

                        <ShieldCheck className="w-4 h-4" />

                        CPSE traceability retained

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            expanded
                              ? null
                              : record.ncs_id
                          )
                        }
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                      >

                        {expanded
                          ? 'Hide CPSE Mappings'
                          : 'View CPSE Mappings'}

                        {expanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}

                      </button>

                    </div>

                  </div>

                  {/* =========================================
                      CPSE MAPPINGS
                  ========================================= */}

                  {expanded && (
                    <div className="bg-slate-50 border-t border-slate-200 p-5">

                      <div className="flex items-center justify-between mb-4">

                        <div>

                          <h3 className="text-sm font-bold text-slate-900">
                            CPSE Material Mappings
                          </h3>

                          <p className="text-[10px] text-slate-500 mt-1">
                            Existing CPSE codes remain preserved under this national identity.
                          </p>

                        </div>

                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {record.mappings.length}{' '}
                          mappings
                        </span>

                      </div>

                      {record.mappings.length ===
                      0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">

                          <p className="text-xs text-slate-500">
                            No CPSE material mappings are available for this NCS record.
                          </p>

                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                          {record.mappings.map(
                            (mapping) => (
                              <div
                                key={
                                  mapping.mapping_id
                                }
                                className="bg-white border border-slate-200 rounded-xl p-4"
                              >

                                <div className="flex items-center justify-between gap-3">

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

                                <div className="mt-4">

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

                                <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-3">

                                  <div className="text-[9px] text-slate-400 font-mono uppercase">
                                    Specifications
                                  </div>

                                  <div className="text-xs text-slate-700 mt-1 leading-relaxed">
                                    {safeText(
                                      mapping.specifications
                                    )}
                                  </div>

                                </div>

                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">

                                  <span className="text-[9px] font-mono text-slate-400">
                                    Match status:{' '}
                                    {safeText(
                                      mapping.match_status
                                    )}
                                  </span>

                                  <span className="text-[10px] font-mono font-bold text-blue-700">
                                    {mapping.ai_confidence}% AI confidence
                                  </span>

                                </div>

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>
                  )}

                </div>
              );
            }
          )}

        </div>
      )}

    </div>
  );
};