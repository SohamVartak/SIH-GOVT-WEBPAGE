import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../ui/StatusBadge';
import {
  Database,
  Building,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Search,
  RefreshCw,
  Link2,
  MapPin,
  Package,
  X,
} from 'lucide-react';

type BMGProduct = {
  material_id: number;
  unique_product_code: string | null;
  company: string | null;
  company_id: number | null;
  company_type: string | null;
  original_company_material_code: string | null;
  material_name: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
  facility_id: number | null;
  facility_name?: string | null;
  location?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
  technical_details?: Record<string, unknown> | null;
  bmg_mapping?: {
    mapping_id: number;
    match_status: string;
    ai_confidence: number | null;
    ai_reason: string | null;
    verified: boolean;
    verified_by: string | null;
    verified_at: string | null;
    active: boolean;
  } | null;
  facility?: {
    facility_id: number | null;
    facility_name: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    address: string | null;
  } | null;
};

type BMGIdentity = {
  bmg_id: number;
  bmg_code: string;
  ncs_name: string | null;
  category: string | null;
  subcategory: string | null;
  ncs_standard_specification: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  government_comments: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BMGSearchResult = {
  bmg_identity: BMGIdentity;
  product_count: number;
  products: BMGProduct[];
};

export const Material360View: React.FC = () => {
  const { materials } = useApp();

  // ==========================================================
  // MATERIAL 360 STATE
  // ==========================================================

  const [selectedMaterialId, setSelectedMaterialId] =
    useState<number | null>(
      materials.length > 0
        ? materials[0].id
        : null
    );

  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'mappings' | 'audit'
  >('overview');

  // ==========================================================
  // BMG SEARCH STATE
  // ==========================================================

  const [bmgSearchText, setBmgSearchText] =
    useState('');

  const [bmgSearchLoading, setBmgSearchLoading] =
    useState(false);

  const [bmgSearchError, setBmgSearchError] =
    useState('');

  const [bmgResults, setBmgResults] =
    useState<BMGSearchResult[]>([]);

  const [selectedBMGResult, setSelectedBMGResult] =
    useState<BMGSearchResult | null>(null);

  const [selectedBMGProduct, setSelectedBMGProduct] =
    useState<BMGProduct | null>(null);

  // ==========================================================
  // ACTIVE MATERIAL
  // ==========================================================

  const activeMaterial =
    materials.find(
      m => m.id === selectedMaterialId
    ) ||
    materials[0];

  // ==========================================================
  // COMPANIES
  // ==========================================================

  const companies = [
    'BPCL',
    'BHEL',
    'HPCL',
    'IOCL',
  ];

  // ==========================================================
  // COMPANY COUNTS
  // ==========================================================

  const companyCounts =
    useMemo(() => {
      return companies.map(company => ({
        company,
        count: materials.filter(
          m =>
            m.company
              ?.trim()
              .toUpperCase() ===
            company
        ).length,
      }));
    }, [materials]);

  // ==========================================================
  // LOAD DEFAULT BMG CODE
  //
  // This makes testing easier if BMG-000001 exists.
  // It is not mandatory; failure is ignored.
  // ==========================================================

  useEffect(() => {
    if (bmgResults.length > 0) {
      return;
    }

    searchBMG('BMG-000001', true);
  }, []);

  // ==========================================================
  // BMG SEARCH
  // ==========================================================

  async function searchBMG(
    searchValue?: string,
    silent = false
  ) {
    const value =
      (searchValue ??
        bmgSearchText).trim();

    if (!value) {
      setBmgSearchError(
        'Enter a BMG Common Code or NCS name.'
      );
      return;
    }

    if (!silent) {
      setBmgSearchError('');
    }

    setBmgSearchLoading(true);

    try {
      const response =
        await fetch(
          `/api/bmg-search?q=${encodeURIComponent(
            value
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            'Failed to search BMG Common Codes.'
        );
      }

      const results =
        data.results || [];

      setBmgResults(
        results
      );

      if (results.length > 0) {
        setSelectedBMGResult(
          results[0]
        );

        setSelectedBMGProduct(
          null
        );
      } else {
        setSelectedBMGResult(
          null
        );

        setSelectedBMGProduct(
          null
        );

        if (!silent) {
          setBmgSearchError(
            `No BMG identity found for "${value}".`
          );
        }
      }
    } catch (error) {
      console.error(
        'BMG search error:',
        error
      );

      if (!silent) {
        setBmgSearchError(
          error instanceof Error
            ? error.message
            : 'Failed to search BMG.'
        );
      }
    } finally {
      setBmgSearchLoading(false);
    }
  }

  // ==========================================================
  // CLEAR BMG SEARCH
  // ==========================================================

  function clearBMGSearch() {
    setBmgSearchText('');
    setBmgSearchError('');
    setBmgResults([]);
    setSelectedBMGResult(null);
    setSelectedBMGProduct(null);
  }

  // ==========================================================
  // NO MATERIAL DATA
  // ==========================================================

  if (!activeMaterial) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <Database className="w-10 h-10 mx-auto text-slate-400 mb-3" />

          <h1 className="text-lg font-bold text-slate-900">
            No Material Data Available
          </h1>

          <p className="text-sm text-slate-500 mt-2">
            No records were found in the
            Supabase materials table.
          </p>
        </div>
      </div>
    );
  }

  const specifications =
    activeMaterial.specifications?.trim() ||
    'Not available';

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ======================================================
          BMG COMMON CODE SEARCH
      ====================================================== */}

      <section className="bg-slate-950 border border-slate-800 rounded-2xl p-5 lg:p-6 shadow-sm">

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-5 h-5 text-violet-400" />

              <span className="text-xs font-bold text-violet-300 uppercase tracking-wider font-mono">
                Common Material Identity
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white">
              BMG Common Code Search
            </h2>

            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Search by BMG Common Code or NCS
              Standard Name to retrieve all
              technically equivalent company
              products.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <Database className="w-4 h-4" />
            Supabase BMG Master
          </div>

        </div>

        {/* SEARCH BAR */}

        <div className="mt-5 flex flex-col sm:flex-row gap-2">

          <div className="relative flex-1">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

            <input
              value={bmgSearchText}
              onChange={e =>
                setBmgSearchText(
                  e.target.value
                )
              }
              onKeyDown={e => {
                if (
                  e.key === 'Enter'
                ) {
                  searchBMG();
                }
              }}
              placeholder="BMG-000001 or VALVE, CHECK, SWING"
              className="w-full bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl pl-10 pr-10 py-3 text-sm font-mono focus:outline-none focus:border-violet-500"
            />

            {bmgSearchText && (
              <button
                type="button"
                onClick={
                  clearBMGSearch
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}

          </div>

          <button
            type="button"
            onClick={() =>
              searchBMG()
            }
            disabled={
              bmgSearchLoading
            }
            className="sm:w-auto w-full px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {bmgSearchLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search
              </>
            )}
          </button>

        </div>

        {/* ERROR */}

        {bmgSearchError && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {bmgSearchError}
          </div>
        )}

        {/* ====================================================
            SEARCH RESULTS
        ==================================================== */}

        {bmgResults.length > 0 && (
          <div className="mt-5 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5">

            {/* BMG IDENTITY LIST */}

            <div className="space-y-2">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-2">
                BMG Identities
              </div>

              {bmgResults.map(
                result => {
                  const selected =
                    selectedBMGResult
                      ?.bmg_identity
                      .bmg_id ===
                    result.bmg_identity
                      .bmg_id;

                  return (
                    <button
                      key={
                        result
                          .bmg_identity
                          .bmg_id
                      }
                      type="button"
                      onClick={() => {
                        setSelectedBMGResult(
                          result
                        );
                        setSelectedBMGProduct(
                          null
                        );
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        selected
                          ? 'bg-violet-500/10 border-violet-500/50'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-mono text-violet-300 text-sm font-bold">
                        {
                          result
                            .bmg_identity
                            .bmg_code
                        }
                      </div>

                      <div className="text-white text-sm font-bold mt-1">
                        {
                          result
                            .bmg_identity
                            .ncs_name ||
                          'NCS name unavailable'
                        }
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[10px] text-slate-500">
                          Products
                        </span>

                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {
                            result.product_count
                          }
                        </span>
                      </div>
                    </button>
                  );
                }
              )}

            </div>

            {/* SELECTED BMG */}

            {selectedBMGResult && (
              <div className="min-w-0">

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">

                    <div>

                      <div className="font-mono text-violet-300 text-xl font-bold">
                        {
                          selectedBMGResult
                            .bmg_identity
                            .bmg_code
                        }
                      </div>

                      <h3 className="text-white text-lg font-bold mt-1">
                        {
                          selectedBMGResult
                            .bmg_identity
                            .ncs_name ||
                          'NCS name unavailable'
                        }
                      </h3>

                      <div className="flex flex-wrap gap-2 mt-3">

                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase">
                          {
                            selectedBMGResult
                              .bmg_identity
                              .status
                          }
                        </span>

                        {selectedBMGResult
                          .bmg_identity
                          .category && (
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                            {
                              selectedBMGResult
                                .bmg_identity
                                .category
                            }
                          </span>
                        )}

                        {selectedBMGResult
                          .bmg_identity
                          .subcategory && (
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                            {
                              selectedBMGResult
                                .bmg_identity
                                .subcategory
                            }
                          </span>
                        )}

                      </div>

                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 min-w-[160px]">

                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                        Equivalent Products
                      </div>

                      <div className="text-3xl font-bold text-emerald-400 font-mono mt-1">
                        {
                          selectedBMGResult
                            .product_count
                        }
                      </div>

                      <div className="text-[10px] text-slate-500">
                        company records
                      </div>

                    </div>

                  </div>

                  {/* STANDARD SPECIFICATION */}

                  {selectedBMGResult
                    .bmg_identity
                    .ncs_standard_specification && (
                    <div className="mt-5 p-4 bg-slate-950 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-mono uppercase mb-1">
                        NCS Standard Specification
                      </div>

                      <div className="text-xs text-slate-300 leading-relaxed">
                        {
                          selectedBMGResult
                            .bmg_identity
                            .ncs_standard_specification
                        }
                      </div>
                    </div>
                  )}

                </div>

                {/* ==================================================
                    COMPANY PRODUCTS
                ================================================== */}

                <div className="mt-4">

                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      Company Products Sharing This BMG
                    </div>

                    <div className="text-[10px] text-slate-500">
                      {
                        selectedBMGResult
                          .products
                          .length
                      }{' '}
                      records
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                    {selectedBMGResult.products.map(
                      product => {
                        const selected =
                          selectedBMGProduct
                            ?.material_id ===
                          product.material_id;

                        return (
                          <button
                            key={
                              product.material_id
                            }
                            type="button"
                            onClick={() =>
                              setSelectedBMGProduct(
                                product
                              )
                            }
                            className={`text-left rounded-xl p-4 border transition-colors ${
                              selected
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >

                            <div className="flex items-start justify-between gap-3">

                              <div className="min-w-0">

                                <div className="text-sm font-bold text-slate-900 break-words">
                                  {
                                    product
                                      .material_name ||
                                    'Unnamed Material'
                                  }
                                </div>

                                <div className="text-xs text-slate-500 mt-1">
                                  {
                                    product
                                      .company ||
                                    'Unknown Company'
                                  }
                                </div>

                              </div>

                              <div className="shrink-0 px-2 py-1 bg-violet-50 border border-violet-200 text-violet-700 rounded-md text-[10px] font-mono font-bold">
                                {
                                  selectedBMGResult
                                    .bmg_identity
                                    .bmg_code
                                }
                              </div>

                            </div>

                            <div className="mt-3 space-y-1.5 text-[11px]">

                              <div className="flex gap-2">
                                <span className="text-slate-400">
                                  Original Code:
                                </span>

                                <span className="font-mono font-semibold text-slate-700 break-all">
                                  {
                                    product
                                      .original_company_material_code ||
                                    'N/A'
                                  }
                                </span>
                              </div>

                              <div className="flex gap-2">
                                <span className="text-slate-400">
                                  Unique Code:
                                </span>

                                <span className="font-mono font-semibold text-slate-700 break-all">
                                  {
                                    product
                                      .unique_product_code ||
                                    'N/A'
                                  }
                                </span>
                              </div>

                              <div className="flex gap-2">
                                <span className="text-slate-400">
                                  Facility:
                                </span>

                                <span className="font-semibold text-slate-700">
                                  {
                                    product
                                      .facility
                                      ?.facility_name ||
                                    'N/A'
                                  }
                                </span>
                              </div>

                            </div>

                          </button>
                        );
                      }
                    )}

                  </div>

                </div>

                {/* ==================================================
                    SELECTED COMPANY PRODUCT
                ================================================== */}

                {selectedBMGProduct && (
                  <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5">

                    <div className="flex items-center justify-between gap-3 mb-4">

                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Material 360 — BMG Linked Record
                        </div>

                        <h4 className="text-base font-bold text-slate-900 mt-1">
                          {
                            selectedBMGProduct
                              .material_name ||
                            'Unnamed Material'
                          }
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedBMGProduct(
                            null
                          )
                        }
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-4 h-4" />
                      </button>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

                      <IdentityBox
                        label="Company"
                        value={
                          selectedBMGProduct.company ||
                          'N/A'
                        }
                      />

                      <IdentityBox
                        label="Original Company Code"
                        value={
                          selectedBMGProduct
                            .original_company_material_code ||
                          'N/A'
                        }
                        mono
                      />

                      <IdentityBox
                        label="Unique Product Code"
                        value={
                          selectedBMGProduct
                            .unique_product_code ||
                          'N/A'
                        }
                        mono
                      />

                      <IdentityBox
                        label="BMG Common Code"
                        value={
                          selectedBMGResult
                            .bmg_identity
                            .bmg_code
                        }
                        mono
                        violet
                      />

                      <IdentityBox
                        label="NCS Standard Name"
                        value={
                          selectedBMGResult
                            .bmg_identity
                            .ncs_name ||
                          'N/A'
                        }
                        green
                      />

                      <IdentityBox
                        label="Material ID"
                        value={String(
                          selectedBMGProduct
                            .material_id
                        )}
                        mono
                      />

                    </div>

                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

                      <div className="border border-slate-200 rounded-xl p-4">

                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="w-4 h-4 text-slate-500" />

                          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Facility & Location
                          </div>
                        </div>

                        <div className="space-y-2 text-xs">

                          <LineItem
                            label="Facility"
                            value={
                              selectedBMGProduct
                                .facility
                                ?.facility_name ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="City"
                            value={
                              selectedBMGProduct
                                .facility
                                ?.city ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="State"
                            value={
                              selectedBMGProduct
                                .facility
                                ?.state ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="Country"
                            value={
                              selectedBMGProduct
                                .facility
                                ?.country ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="Address"
                            value={
                              selectedBMGProduct
                                .facility
                                ?.address ||
                              'N/A'
                            }
                          />

                        </div>

                      </div>

                      <div className="border border-slate-200 rounded-xl p-4">

                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-4 h-4 text-slate-500" />

                          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Product Information
                          </div>
                        </div>

                        <div className="space-y-2 text-xs">

                          <LineItem
                            label="Category"
                            value={
                              selectedBMGProduct
                                .category ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="Description"
                            value={
                              selectedBMGProduct
                                .description ||
                              'N/A'
                            }
                          />

                          <LineItem
                            label="Specifications"
                            value={
                              selectedBMGProduct
                                .specifications ||
                              'N/A'
                            }
                          />

                        </div>

                      </div>

                    </div>

                    {/* MAPPING INFORMATION */}

                    {selectedBMGProduct
                      .bmg_mapping && (
                      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">

                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                          BMG Mapping Record
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                          <LineItem
                            label="Match Status"
                            value={
                              selectedBMGProduct
                                .bmg_mapping
                                .match_status
                            }
                          />

                          <LineItem
                            label="AI Confidence"
                            value={
                              selectedBMGProduct
                                .bmg_mapping
                                .ai_confidence !==
                              null
                                ? `${selectedBMGProduct.bmg_mapping.ai_confidence}%`
                                : 'N/A'
                            }
                          />

                          <LineItem
                            label="Verified"
                            value={
                              selectedBMGProduct
                                .bmg_mapping
                                .verified
                                ? 'YES'
                                : 'NO'
                            }
                          />

                          <LineItem
                            label="Verified By"
                            value={
                              selectedBMGProduct
                                .bmg_mapping
                                .verified_by ||
                              'Not yet verified'
                            }
                          />

                        </div>

                        {selectedBMGProduct
                          .bmg_mapping
                          .ai_reason && (
                          <div className="mt-3 text-xs text-slate-600 leading-relaxed">
                            <strong>
                              AI Reason:
                            </strong>{' '}
                            {
                              selectedBMGProduct
                                .bmg_mapping
                                .ai_reason
                            }
                          </div>
                        )}

                      </div>
                    )}

                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </section>

      {/* ======================================================
          ORIGINAL MATERIAL 360 HEADER
      ====================================================== */}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

          <div className="space-y-2">

            <div className="flex items-center gap-2 flex-wrap">

              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono">
                LIVE SUPABASE DATA
              </span>

              <span className="text-xs text-slate-400 font-mono">
                Material 360
              </span>

            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {activeMaterial.description ||
                'Unnamed Material'}
            </h1>

            <div className="font-mono text-sm font-bold bg-slate-800 border border-slate-700 text-emerald-300 px-3 py-1 rounded-lg inline-block">
              {activeMaterial.material_number ||
                'No Material Number'}
            </div>

            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              {specifications}
            </p>

          </div>

          {/* MATERIAL SELECTOR */}

          <select
            value={activeMaterial.id}
            onChange={e =>
              setSelectedMaterialId(
                Number(
                  e.target.value
                )
              )
            }
            className="bg-slate-800 border border-slate-700 text-white text-xs font-mono rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {materials.map(
              material => (
                <option
                  key={
                    material.id
                  }
                  value={
                    material.id
                  }
                >
                  {
                    material.company
                  }{' '}
                  -{' '}
                  {material.material_number ||
                    'No Code'}{' '}
                  -{' '}
                  {material.description ||
                    'No Description'}
                </option>
              )
            )}
          </select>

        </div>

        {/* COMPANY AVAILABILITY */}

        <div className="mt-6 pt-5 border-t border-slate-800">

          <div className="flex items-center gap-2 mb-4">

            <Building className="w-4 h-4 text-cyan-400" />

            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Company Data Availability
            </span>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

            {companyCounts.map(
              item => (
                <div
                  key={
                    item.company
                  }
                  className="bg-slate-800/70 border border-slate-700 rounded-xl p-4"
                >

                  <div className="text-[10px] text-slate-400 font-mono">
                    {
                      item.company
                    }
                  </div>

                  <div
                    className={`text-2xl font-bold font-mono mt-1 ${
                      item.count >
                      0
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.count.toLocaleString()}
                  </div>

                  <div className="text-[10px] text-slate-400 mt-1">
                    materials available
                  </div>

                </div>
              )
            )}

          </div>
        </div>

      </div>

      {/* ======================================================
          TABS
      ====================================================== */}

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-medium">

        <button
          onClick={() =>
            setActiveSubTab(
              'overview'
            )
          }
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab ===
            'overview'
              ? 'bg-slate-900 text-white font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Material Details
        </button>

        <button
          onClick={() =>
            setActiveSubTab(
              'mappings'
            )
          }
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab ===
            'mappings'
              ? 'bg-slate-900 text-white font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Company Records
        </button>

        <button
          onClick={() =>
            setActiveSubTab(
              'audit'
            )
          }
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab ===
            'audit'
              ? 'bg-slate-900 text-white font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Data Integrity
        </button>

      </div>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <AnimatePresence mode="wait">

        <motion.div
          key={`${activeMaterial.id}-${activeSubTab}`}
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            y: -8,
          }}
          transition={{
            duration: 0.2,
          }}
        >

          {/* ==================================================
              OVERVIEW
          ================================================== */}

          {activeSubTab ===
            'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">

                <div className="flex items-center justify-between">

                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    Material Information
                  </h2>

                  <StatusBadge
                    status="success"
                    label="Live Data"
                    size="sm"
                  />

                </div>

                <div className="space-y-3 text-xs">

                  <LineItem
                    label="Company"
                    value={
                      activeMaterial.company
                    }
                  />

                  <LineItem
                    label="Material Number"
                    value={
                      activeMaterial.material_number ||
                      'N/A'
                    }
                    mono
                  />

                  <LineItem
                    label="Description"
                    value={
                      activeMaterial.description ||
                      'N/A'
                    }
                  />

                  <LineItem
                    label="Category"
                    value={
                      activeMaterial.category ||
                      'N/A'
                    }
                  />

                  <div className="py-2">

                    <div className="text-slate-500 mb-2">
                      Specifications
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 leading-relaxed">
                      {
                        specifications
                      }
                    </div>

                  </div>

                </div>

              </div>

              {/* AVAILABILITY */}

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">

                <div className="flex items-center gap-2">

                  <TrendingUp className="w-4 h-4 text-emerald-500" />

                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    Database Coverage
                  </h2>

                </div>

                <div className="space-y-3">

                  {companyCounts.map(
                    item => (
                      <div
                        key={
                          item.company
                        }
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200"
                      >

                        <div className="flex items-center gap-3">

                          <Building className="w-4 h-4 text-slate-500" />

                          <span className="font-bold text-slate-800 text-sm">
                            {
                              item.company
                            }
                          </span>

                        </div>

                        <span
                          className={`font-mono font-bold ${
                            item.count >
                            0
                              ? 'text-emerald-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.count.toLocaleString()}
                        </span>

                      </div>
                    )
                  )}

                </div>

                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">

                  <div className="font-bold text-emerald-800 flex items-center gap-2">

                    <CheckCircle2 className="w-4 h-4" />

                    Data source: Supabase

                  </div>

                  <p className="text-emerald-700 text-[11px] mt-1">
                    These figures represent the
                    material records currently
                    stored in the database.
                  </p>

                </div>

              </div>

            </div>
          )}

          {/* ==================================================
              COMPANY RECORDS
          ================================================== */}

          {activeSubTab ===
            'mappings' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">

              <div className="mb-5">

                <h2 className="text-base font-bold text-slate-900">
                  Live Material Records
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Records currently available
                  in Supabase
                </p>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-left text-xs">

                  <thead>

                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-mono">

                      <th className="pb-3">
                        Company
                      </th>

                      <th className="pb-3">
                        Material Number
                      </th>

                      <th className="pb-3">
                        Description
                      </th>

                      <th className="pb-3">
                        Category
                      </th>

                      <th className="pb-3">
                        Specifications
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {materials.map(
                      material => (
                        <tr
                          key={
                            material.id
                          }
                          className="hover:bg-slate-50 transition-colors"
                        >

                          <td className="py-3 font-bold text-slate-900">

                            <span className="bg-slate-100 px-2 py-1 rounded font-mono">
                              {
                                material.company
                              }
                            </span>

                          </td>

                          <td className="py-3 font-mono text-slate-700">
                            {
                              material.material_number ||
                              '-'
                            }
                          </td>

                          <td className="py-3 text-slate-800 max-w-xs">
                            {
                              material.description ||
                              '-'
                            }
                          </td>

                          <td className="py-3 text-slate-700">
                            {
                              material.category ||
                              '-'
                            }
                          </td>

                          <td className="py-3 text-slate-600 max-w-md">
                            {
                              material.specifications ||
                              '-'
                            }
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </div>
          )}

          {/* ==================================================
              AUDIT
          ================================================== */}

          {activeSubTab ===
            'audit' && (
            <div className="bg-slate-950 text-slate-300 rounded-2xl p-6 border border-slate-800 space-y-5 font-mono text-xs">

              <div className="flex items-center gap-2 text-emerald-400 font-bold">

                <ShieldCheck className="w-5 h-5" />

                <span className="text-sm">
                  MATERIAL DATABASE INTEGRITY
                </span>

              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">

                <div className="text-slate-500 text-[10px]">
                  DATA SOURCE
                </div>

                <div className="text-emerald-300 mt-1">
                  Supabase / materials
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">

                  <div className="text-slate-500 text-[10px]">
                    TOTAL MATERIAL RECORDS
                  </div>

                  <div className="text-white text-xl font-bold mt-1">
                    {
                      materials.length.toLocaleString()
                    }
                  </div>

                </div>

                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">

                  <div className="text-slate-500 text-[10px]">
                    COMPANIES WITH DATA
                  </div>

                  <div className="text-emerald-400 text-xl font-bold mt-1">
                    {
                      companyCounts.filter(
                        c =>
                          c.count >
                          0
                      ).length
                    }
                  </div>

                </div>

              </div>

            </div>
          )}

        </motion.div>

      </AnimatePresence>

    </div>
  );
};

// ============================================================
// IDENTITY BOX
// ============================================================

function IdentityBox({
  label,
  value,
  mono = false,
  violet = false,
  green = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  violet?: boolean;
  green?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        violet
          ? 'bg-violet-50 border-violet-200'
          : green
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
        {label}
      </div>

      <div
        className={`text-xs font-bold break-words ${
          mono
            ? 'font-mono'
            : ''
        } ${
          violet
            ? 'text-violet-700'
            : green
            ? 'text-emerald-700'
            : 'text-slate-800'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// LINE ITEM
// ============================================================

function LineItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-b-0">

      <span className="text-slate-500 shrink-0">
        {label}
      </span>

      <span
        className={`font-semibold text-slate-900 text-right break-words ${
          mono
            ? 'font-mono'
            : ''
        }`}
      >
        {value}
      </span>

    </div>
  );
}