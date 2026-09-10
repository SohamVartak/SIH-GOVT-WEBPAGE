import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';

import {
  Search,
  FileDown,
  Building2,
  PackageSearch,
  ChevronRight,
  X,
  Loader2,
  FileText,
  Database,
  Hash,
  Layers3,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

type SearchResult = {
  company: string;
  company_id?: string | null;

  material_id?: number | null;

  material_number?: string | null;
  company_material_code?: string | null;

  material_name?: string | null;
  description?: string | null;
  specifications?: string | null;
  category?: string | null;

  bmg_id?: string | null;

  datasheet_id?: string | number | null;
  datasheet_file_name?: string | null;
  datasheet_file_path?: string | null;
  datasheet_file_type?: string | null;

  attributes?: {
    material_family?: string | null;
    dimensions?: Record<string, unknown> | null;
    material_grade?: string | null;
    pressure_rating?: string | null;
    temperature_rating?: string | null;
    standards?: string[] | null;
    manufacturer?: string | null;
    model?: string | null;
    design_features?: string[] | null;
    other_attributes?: Record<string, unknown> | null;
  } | null;
};

type SearchResponse = {
  success: boolean;
  query: string;
  results: SearchResult[];
  total: number;
  companies: string[];
  error?: string;
};

/* =========================================================
   HELPERS
========================================================= */

const clean = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

const displayValue = (
  value: unknown,
  fallback = 'Not available'
): string => {
  const text = clean(value);
  return text || fallback;
};

/* =========================================================
   MAIN VIEW
========================================================= */

export const ProcurementView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedCompany, setSelectedCompany] =
    useState<string | null>(null);

  const [selectedResult, setSelectedResult] =
    useState<SearchResult | null>(null);

  const [downloadingDatasheetId, setDownloadingDatasheetId] =
    useState<string | number | null>(null);

  /* =========================================================
     SEARCH
  ========================================================= */

  const performSearch = async (searchText = query) => {
    const trimmed = searchText.trim();

    if (!trimmed) {
      setResults([]);
      setSubmittedQuery('');
      setSearchError(null);
      setSelectedCompany(null);
      setSelectedResult(null);
      return;
    }

    setLoading(true);
    setSearchError(null);
    setSelectedCompany(null);
    setSelectedResult(null);

    try {
      const response = await fetch(
        `/api/part-search?q=${encodeURIComponent(trimmed)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      const data = (await response.json()) as SearchResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Unable to search the material database.'
        );
      }

      const searchResults = data.results || [];

      setResults(searchResults);
      setSubmittedQuery(trimmed);

      const companies = Array.from(
        new Set(
          searchResults
            .map(result =>
              clean(result.company).toUpperCase()
            )
            .filter(Boolean)
        )
      );

      if (companies.length === 1) {
        setSelectedCompany(companies[0]);
      }
    } catch (error) {
      console.error('Part search failed:', error);

      setResults([]);
      setSubmittedQuery(trimmed);

      setSearchError(
        error instanceof Error
          ? error.message
          : 'Unable to search the material database.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (
    event: React.FormEvent
  ) => {
    event.preventDefault();
    performSearch();
  };

  const handleClear = () => {
    setQuery('');
    setSubmittedQuery('');
    setResults([]);
    setSearchError(null);
    setSelectedCompany(null);
    setSelectedResult(null);
  };

  /* =========================================================
     GROUP RESULTS BY COMPANY
  ========================================================= */

  const companyGroups = useMemo(() => {
    const grouped =
      new Map<string, SearchResult[]>();

    results.forEach(result => {
      const company = clean(result.company).toUpperCase();

      if (!company) {
        return;
      }

      if (!grouped.has(company)) {
        grouped.set(company, []);
      }

      grouped.get(company)!.push(result);
    });

    return Array.from(grouped.entries())
      .map(([company, companyResults]) => ({
        company,
        results: companyResults,
      }))
      .sort((a, b) =>
        a.company.localeCompare(b.company)
      );
  }, [results]);

  const activeCompany = selectedCompany || '';

  const activeCompanyResults = activeCompany
    ? results.filter(
        result =>
          clean(result.company).toUpperCase() ===
          activeCompany
      )
    : [];

  /* =========================================================
     DOWNLOAD ORIGINAL DATASHEET
  ========================================================= */

  const downloadDatasheet = async (
    result: SearchResult
  ) => {
    if (!result.datasheet_id) {
      alert(
        'No uploaded datasheet is linked to this material yet.'
      );
      return;
    }

    setDownloadingDatasheetId(result.datasheet_id);

    try {
      const response = await fetch(
        `/api/datasheet-download?id=${encodeURIComponent(
          String(result.datasheet_id)
        )}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Unable to prepare the datasheet download.'
        );
      }

      const link = document.createElement('a');

      link.href = data.url;
      link.download =
        result.datasheet_file_name ||
        'datasheet';
      link.target = '_blank';

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(
        'Datasheet download failed:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Unable to download the datasheet.'
      );
    } finally {
      setDownloadingDatasheetId(null);
    }
  };

  /* =========================================================
     COUNTERS
  ========================================================= */

  const companyCount = companyGroups.length;
  const materialCount = results.length;

  const datasheetCount = results.filter(
    result => result.datasheet_id
  ).length;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-[#f4f7f9]">

      {/* =====================================================
          HERO
      ===================================================== */}

      <section className="bg-[#06213d] text-white">

        <div className="max-w-[1600px] mx-auto px-5 sm:px-7 lg:px-10 py-8 lg:py-10">

          <div className="max-w-4xl">

            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 font-mono">

              <Database className="w-3.5 h-3.5" />

              National Material Search

            </div>

            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">

              Part Search &

              <span className="block text-emerald-300">
                Datasheet Intelligence
              </span>

            </h1>

            <p className="mt-4 max-w-3xl text-sm lg:text-base text-slate-300 leading-relaxed">

              Search your uploaded material database,
              compare the same or similar part across
              participating CPSEs, and access the original
              company datasheets stored in the National
              Material Grid.

            </p>

          </div>

          {/* SEARCH BAR */}

          <form
            onSubmit={handleSearchSubmit}
            className="mt-8 max-w-5xl"
          >

            <div className="relative">

              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

              <input
                value={query}
                onChange={event =>
                  setQuery(event.target.value)
                }
                placeholder="Search by part name, material code, specification, category or keyword..."
                className="w-full rounded-2xl border border-white/10 bg-white text-slate-900 pl-14 pr-36 py-4 text-sm lg:text-base outline-none shadow-xl placeholder:text-slate-400"
              />

              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-28 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-5 text-sm font-bold text-slate-950 transition flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search
                  </>
                )}
              </button>

            </div>

          </form>

          <div className="mt-3 text-[10px] font-mono text-slate-500">
            Example: valve • gate valve • 15NB • steam trap • SS304
          </div>

        </div>

      </section>

      {/* =====================================================
          STAT CARDS
      ===================================================== */}

      <section className="max-w-[1600px] mx-auto px-5 sm:px-7 lg:px-10 -mt-5 relative z-10">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-700" />
              </div>

              <div>

                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                  Companies Found
                </div>

                <div className="text-2xl font-bold text-slate-900">
                  {companyCount}
                </div>

              </div>

            </div>

          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <PackageSearch className="w-5 h-5 text-emerald-700" />
              </div>

              <div>

                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                  Matching Materials
                </div>

                <div className="text-2xl font-bold text-slate-900">
                  {materialCount}
                </div>

              </div>

            </div>

          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-700" />
              </div>

              <div>

                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                  Linked Datasheets
                </div>

                <div className="text-2xl font-bold text-slate-900">
                  {datasheetCount}
                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="max-w-[1600px] mx-auto px-5 sm:px-7 lg:px-10 py-7">

        {/* INITIAL STATE */}

        {!submittedQuery && !loading && (

          <div className="bg-white border border-slate-200 rounded-3xl p-10 lg:p-16 text-center shadow-sm">

            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">

              <PackageSearch className="w-8 h-8 text-slate-500" />

            </div>

            <h2 className="mt-5 text-xl lg:text-2xl font-bold text-slate-900">
              Search Your Material Database
            </h2>

            <p className="mt-2 text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">

              Enter a part name, specification, company
              material code or engineering keyword to see
              matching materials across all available companies.

            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">

              {[
                'Valve',
                'Gate Valve',
                'Steam Trap',
                '15NB',
                'SS304',
              ].map(example => (

                <button
                  key={example}
                  onClick={() => {
                    setQuery(example);
                    performSearch(example);
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition"
                >
                  {example}
                </button>

              ))}

            </div>

          </div>
        )}

        {/* LOADING */}

        {loading && (

          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">

            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />

            <p className="mt-4 text-sm font-medium text-slate-700">
              Searching the national material database...
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Checking material descriptions, specifications
              and company records.
            </p>

          </div>
        )}

        {/* ERROR */}

        {searchError && !loading && (

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">

            <div className="flex gap-3">

              <ShieldCheck className="w-5 h-5 text-rose-600 shrink-0" />

              <div>

                <div className="font-bold text-sm text-rose-900">
                  Search failed
                </div>

                <p className="mt-1 text-xs text-rose-700">
                  {searchError}
                </p>

              </div>

            </div>

          </div>
        )}

        {/* NO RESULTS */}

        {submittedQuery &&
          !loading &&
          !searchError &&
          results.length === 0 && (

            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">

              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">

                <Search className="w-6 h-6 text-slate-500" />

              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                No matching part found
              </h2>

              <p className="mt-2 text-sm text-slate-500">

                No material matched:

                <span className="font-bold text-slate-700 ml-1">
                  "{submittedQuery}"
                </span>

              </p>

            </div>
        )}

        {/* RESULTS */}

        {!loading &&
          !searchError &&
          results.length > 0 && (

            <div className="space-y-6">

              {/* SUMMARY */}

              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">

                <div>

                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-400 font-mono">
                    Search Results
                  </div>

                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Matches for "{submittedQuery}"
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Select a company to inspect its material records.
                  </p>

                </div>

                <button
                  onClick={() =>
                    performSearch(submittedQuery)
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Search
                </button>

              </div>

              {/* TWO COLUMN */}

              <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6">

                {/* COMPANY LIST */}

                <aside>

                  <div className="text-[10px] uppercase tracking-[0.16em] font-bold font-mono text-slate-400 mb-3">
                    Companies Holding This Part
                  </div>

                  <div className="space-y-2">

                    {companyGroups.map(group => {

                      const isActive =
                        group.company === activeCompany;

                      const withDatasheet =
                        group.results.filter(
                          result =>
                            result.datasheet_id
                        ).length;

                      return (

                        <motion.button
                          key={group.company}
                          whileHover={{ x: 2 }}
                          onClick={() => {
                            setSelectedCompany(
                              group.company
                            );

                            setSelectedResult(null);
                          }}
                          className={`w-full text-left rounded-2xl border p-4 transition ${
                            isActive
                              ? 'bg-[#06213d] border-[#06213d] text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300'
                          }`}
                        >

                          <div className="flex items-center justify-between gap-3">

                            <div className="flex items-center gap-3">

                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                  isActive
                                    ? 'bg-white/10'
                                    : 'bg-slate-100'
                                }`}
                              >

                                <Building2
                                  className={`w-4 h-4 ${
                                    isActive
                                      ? 'text-emerald-300'
                                      : 'text-slate-600'
                                  }`}
                                />

                              </div>

                              <div>

                                <div className="font-bold text-sm">
                                  {group.company}
                                </div>

                                <div
                                  className={`text-[10px] mt-0.5 ${
                                    isActive
                                      ? 'text-slate-400'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {group.results.length}{' '}
                                  material
                                  {group.results.length !== 1
                                    ? 's'
                                    : ''}
                                </div>

                              </div>

                            </div>

                            <ChevronRight
                              className={`w-4 h-4 ${
                                isActive
                                  ? 'text-emerald-300'
                                  : 'text-slate-400'
                              }`}
                            />

                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">

                            {withDatasheet > 0 && (

                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${
                                  isActive
                                    ? 'bg-emerald-400/10 text-emerald-300'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >

                                <FileText className="w-3 h-3" />

                                {withDatasheet} datasheet
                                {withDatasheet !== 1
                                  ? 's'
                                  : ''}

                              </span>

                            )}

                          </div>

                        </motion.button>
                      );
                    })}

                  </div>

                </aside>

                {/* COMPANY DETAIL */}

                <section>

                  {!activeCompany && (

                    <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center">

                      <Building2 className="w-8 h-8 text-slate-300 mx-auto" />

                      <h3 className="mt-4 font-bold text-slate-800">
                        Select a company
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        Choose HPCL, IOCL, BPCL or another company
                        from the list.
                      </p>

                    </div>
                  )}

                  {activeCompany && (

                    <div className="space-y-4">

                      {/* COMPANY HEADER */}

                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                          <div>

                            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">

                              <Building2 className="w-3.5 h-3.5" />

                              Company Material Profile

                            </div>

                            <h3 className="mt-3 text-2xl font-black text-slate-900">
                              {activeCompany}
                            </h3>

                            <p className="mt-1 text-xs text-slate-500">
                              {activeCompanyResults.length} matching
                              record
                              {activeCompanyResults.length !== 1
                                ? 's'
                                : ''}{' '}
                              found for this search.
                            </p>

                          </div>

                          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">

                            <div className="text-[9px] uppercase tracking-wider font-mono text-slate-400">
                              Datasheets Available
                            </div>

                            <div className="text-xl font-bold text-slate-900">
                              {
                                activeCompanyResults.filter(
                                  result =>
                                    result.datasheet_id
                                ).length
                              }
                            </div>

                          </div>

                        </div>

                      </div>

                      {/* MATERIAL CARDS */}

                      {activeCompanyResults.map(result => {

                        const isSelected =
                          selectedResult === result;

                        return (

                          <motion.div
                            key={`${activeCompany}-${result.material_id ?? result.company_material_code ?? result.material_number}`}
                            layout
                            className={`bg-white border rounded-3xl overflow-hidden shadow-sm ${
                              isSelected
                                ? 'border-emerald-300 ring-1 ring-emerald-200'
                                : 'border-slate-200'
                            }`}
                          >

                            <button
                              onClick={() =>
                                setSelectedResult(
                                  isSelected
                                    ? null
                                    : result
                                )
                              }
                              className="w-full text-left p-5 lg:p-6"
                            >

                              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">

                                <div className="min-w-0 flex-1">

                                  <div className="flex flex-wrap gap-2">

                                    {result.company_material_code && (

                                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold font-mono text-slate-700">

                                        <Hash className="w-3 h-3" />

                                        {result.company_material_code}

                                      </span>

                                    )}

                                    {result.material_number &&
                                      result.material_number !==
                                        result.company_material_code && (

                                        <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold font-mono text-blue-700">

                                          Material #

                                          {result.material_number}

                                        </span>
                                    )}

                                    {result.bmg_id && (

                                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold font-mono text-emerald-700">

                                        BMG {result.bmg_id}

                                      </span>
                                    )}

                                  </div>

                                  <h4 className="mt-3 text-base lg:text-lg font-bold text-slate-900">

                                    {displayValue(
                                      result.material_name ||
                                        result.description,
                                      'Material name not available'
                                    )}

                                  </h4>

                                  {result.category && (

                                    <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                                      {result.category}
                                    </div>

                                  )}

                                  <p className="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-3">

                                    {displayValue(
                                      result.description ||
                                        result.specifications,
                                      'No description available.'
                                    )}

                                  </p>

                                </div>

                                <div className="flex items-center gap-2 shrink-0">

                                  {result.datasheet_id ? (

                                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[10px] font-bold text-emerald-700">

                                      <CheckCircle2 className="w-3.5 h-3.5" />

                                      Datasheet linked

                                    </span>

                                  ) : (

                                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500">
                                      Datasheet unavailable
                                    </span>

                                  )}

                                  <ChevronRight
                                    className={`w-4 h-4 text-slate-400 transition-transform ${
                                      isSelected
                                        ? 'rotate-90'
                                        : ''
                                    }`}
                                  />

                                </div>

                              </div>

                            </button>

                            {/* EXPANDED DETAIL */}

                            {isSelected && (

                              <div className="border-t border-slate-200">

                                <div className="p-5 lg:p-6 bg-slate-50">

                                  {/* BASIC + ENGINEERING */}

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                                    {/* PART INFO */}

                                    <div className="rounded-2xl bg-white border border-slate-200 p-5">

                                      <div className="flex items-center gap-2">

                                        <Layers3 className="w-4 h-4 text-slate-500" />

                                        <h5 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">
                                          Part Information
                                        </h5>

                                      </div>

                                      <div className="mt-4 space-y-3">

                                        <InfoRow
                                          label="Company"
                                          value={
                                            activeCompany
                                          }
                                        />

                                        <InfoRow
                                          label="Company Material Code"
                                          value={
                                            result.company_material_code ||
                                            result.material_number
                                          }
                                        />

                                        <InfoRow
                                          label="Material Family"
                                          value={
                                            result.attributes
                                              ?.material_family
                                          }
                                        />

                                        <InfoRow
                                          label="Category"
                                          value={
                                            result.category
                                          }
                                        />

                                        <InfoRow
                                          label="Manufacturer"
                                          value={
                                            result.attributes
                                              ?.manufacturer
                                          }
                                        />

                                        <InfoRow
                                          label="Model"
                                          value={
                                            result.attributes
                                              ?.model
                                          }
                                        />

                                      </div>

                                    </div>

                                    {/* ENGINEERING */}

                                    <div className="rounded-2xl bg-white border border-slate-200 p-5">

                                      <div className="flex items-center gap-2">

                                        <PackageSearch className="w-4 h-4 text-slate-500" />

                                        <h5 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">
                                          Engineering Information
                                        </h5>

                                      </div>

                                      <div className="mt-4 space-y-3">

                                        <InfoRow
                                          label="Pressure Rating"
                                          value={
                                            result.attributes
                                              ?.pressure_rating
                                          }
                                        />

                                        <InfoRow
                                          label="Temperature Rating"
                                          value={
                                            result.attributes
                                              ?.temperature_rating
                                          }
                                        />

                                        <InfoRow
                                          label="Material Grade"
                                          value={
                                            result.attributes
                                              ?.material_grade
                                          }
                                        />

                                        <InfoRow
                                          label="Standards"
                                          value={
                                            Array.isArray(
                                              result.attributes
                                                ?.standards
                                            )
                                              ? result.attributes!
                                                  .standards!
                                                  .join(', ')
                                              : ''
                                          }
                                        />

                                      </div>

                                    </div>

                                  </div>

                                  {/* DESCRIPTION */}

                                  <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5">

                                    <div className="flex items-center gap-2">

                                      <FileText className="w-4 h-4 text-slate-500" />

                                      <h5 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">
                                        Material Description
                                      </h5>

                                    </div>

                                    <div className="mt-4 text-sm text-slate-600 leading-relaxed">
                                      {displayValue(
                                        result.description,
                                        'No description available.'
                                      )}
                                    </div>

                                  </div>

                                  {/* SPECIFICATIONS */}

                                  <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5">

                                    <div className="flex items-center gap-2">

                                      <FileText className="w-4 h-4 text-slate-500" />

                                      <h5 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">
                                        Technical Specifications
                                      </h5>

                                    </div>

                                    <div className="mt-4 whitespace-pre-line text-xs lg:text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100 max-h-80 overflow-y-auto">

                                      {displayValue(
                                        result.specifications ||
                                          result.description,
                                        'No specifications available.'
                                      )}

                                    </div>

                                  </div>

                                  {/* ORIGINAL DATASHEET */}

                                  <div className="mt-4 rounded-2xl bg-[#06213d] p-5 text-white">

                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

                                      <div className="min-w-0">

                                        <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">

                                          <FileText className="w-4 h-4" />

                                          Original Company Datasheet

                                        </div>

                                        <div className="mt-2 text-sm font-bold break-words">

                                          {result.datasheet_file_name ||
                                            'No datasheet linked'}

                                        </div>

                                        <div className="mt-1 text-[10px] text-slate-400">

                                          Original file uploaded
                                          through the material
                                          repository.

                                        </div>

                                      </div>

                                      {result.datasheet_id ? (

                                        <button
                                          onClick={() =>
                                            downloadDatasheet(
                                              result
                                            )
                                          }
                                          disabled={
                                            downloadingDatasheetId ===
                                            result.datasheet_id
                                          }
                                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 px-4 py-2.5 text-xs font-bold text-slate-950 transition shrink-0"
                                        >

                                          {downloadingDatasheetId ===
                                          result.datasheet_id ? (
                                            <>
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                              Preparing...
                                            </>
                                          ) : (
                                            <>
                                              <FileDown className="w-4 h-4" />
                                              Download Datasheet
                                              <ExternalLink className="w-3 h-3" />
                                            </>
                                          )}

                                        </button>

                                      ) : (

                                        <div className="text-xs text-slate-500">
                                          No uploaded datasheet
                                          is linked to this
                                          material record.
                                        </div>

                                      )}

                                    </div>

                                  </div>

                                </div>

                              </div>
                            )}

                          </motion.div>
                        );
                      })}

                    </div>
                  )}

                </section>

              </div>

            </div>
          )}

      </main>

    </div>
  );
};

/* =========================================================
   INFO ROW
========================================================= */

const InfoRow: React.FC<{
  label: string;
  value?: unknown;
}> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-5 border-b border-slate-100 pb-2 last:border-0">

    <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400">
      {label}
    </span>

    <span className="text-xs font-semibold text-slate-700 text-right max-w-[65%]">
      {displayValue(value)}
    </span>

  </div>
);

export default ProcurementView;