import React, {
  useMemo,
  useState,
} from "react";

import {
  Search,
  Sparkles,
  Cpu,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  Database,
  RefreshCw,
} from "lucide-react";

import { motion } from "motion/react";

import { useApp } from "../../context/AppContext";

type DatabaseMaterial = {
  id: number;
  company: string | null;
  material_number:
    | string
    | null;
  description:
    | string
    | null;
  specifications:
    | string
    | null;
  category:
    | string
    | null;
};

type MatchResult = {
  rank:
    | number
    | null;

  material_id:
    | number
    | null;

  company:
    | string
    | null;

  material_number:
    | string
    | null;

  description:
    | string
    | null;

  category:
    | string
    | null;

  similarity:
    | number;

  similarity_percent:
    | number;

  recommendation:
    | string;
};

type SearchResponse = {
  success: boolean;

  mode?: string;

  query?: {
    material_id:
      | number
      | null;

    company:
      | string
      | null;

    material_number:
      | string
      | null;

    description:
      | string
      | null;

    category:
      | string
      | null;

    specifications:
      | string
      | null;

    search_text:
      | string
      | null;
  };

  embedding?: {
    model:
      | string;

    dimensions:
      | number;

    generated:
      | boolean;
  };

  count?: number;

  matches?:
    | MatchResult[];

  best_match_by_company?:
    | MatchResult[];

  company_results?:
    | MatchResult[];

  error?:
    | string;

  details?:
    | string;
};

const TARGET_COMPANIES = [
  "IOCL",
  "BPCL",
  "HPCL",
  "BHEL",
  "ONGC",
];

function companyName(
  value: string | null
) {
  return (
    value?.trim().toUpperCase() ||
    "UNKNOWN"
  );
}

function recommendationLabel(
  recommendation: string
) {
  switch (
    recommendation
  ) {
    case "LIKELY_MATCH":
      return "LIKELY MATCH";

    case "REVIEW":
      return "REVIEW";

    case "LOW_CONFIDENCE":
      return "LOW CONFIDENCE";

    case "NO_MATCH":
      return "NO MATCH";

    default:
      return "UNASSESSED";
  }
}

function recommendationClasses(
  recommendation: string
) {
  switch (
    recommendation
  ) {
    case "LIKELY_MATCH":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";

    case "REVIEW":
      return "bg-amber-50 text-amber-700 border-amber-200";

    case "LOW_CONFIDENCE":
      return "bg-orange-50 text-orange-700 border-orange-200";

    case "NO_MATCH":
      return "bg-slate-100 text-slate-500 border-slate-200";

    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

export default function AIMatchCenterView() {
  const {
    materials,
    materialsLoading,
    addToast,
  } = useApp();

  const databaseMaterials =
    materials as unknown as DatabaseMaterial[];

  const [materialInput, setMaterialInput] =
    useState("");

  const [specificationInput, setSpecificationInput] =
    useState("");

  const [companyInput, setCompanyInput] =
    useState("");

  const [categoryInput, setCategoryInput] =
    useState("");

  const [selectedMaterialId, setSelectedMaterialId] =
    useState<number | null>(null);

  const [suggestionsOpen, setSuggestionsOpen] =
    useState(false);

  const [isSearching, setIsSearching] =
    useState(false);

  const [results, setResults] =
    useState<SearchResponse | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const selectedMaterial =
    useMemo(
      () =>
        databaseMaterials.find(
          (material) =>
            material.id ===
            selectedMaterialId
        ) || null,
      [
        databaseMaterials,
        selectedMaterialId,
      ]
    );

  const suggestions =
    useMemo(() => {
      const query =
        materialInput
          .trim()
          .toLowerCase();

      if (!query) {
        return databaseMaterials
          .slice(0, 8);
      }

      return databaseMaterials
        .filter(
          (material) =>
            String(
              material.material_number ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              material.description ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              material.company ||
                ""
            )
              .toLowerCase()
              .includes(query)
        )
        .slice(0, 8);
    }, [
      databaseMaterials,
      materialInput,
    ]);

  const selectMaterial =
    (
      material: DatabaseMaterial
    ) => {
      setSelectedMaterialId(
        material.id
      );

      setMaterialInput(
        material.material_number ||
          material.description ||
          ""
      );

      if (
        !specificationInput.trim() &&
        material.specifications
      ) {
        setSpecificationInput(
          material.specifications
        );
      }

      if (
        !companyInput.trim() &&
        material.company
      ) {
        setCompanyInput(
          material.company
        );
      }

      if (
        !categoryInput.trim() &&
        material.category
      ) {
        setCategoryInput(
          material.category
        );
      }

      setSuggestionsOpen(false);
    };

  const findExactMaterial =
    () => {
      const query =
        materialInput
          .trim()
          .toLowerCase();

      if (!query) {
        return null;
      }

      return (
        databaseMaterials.find(
          (material) =>
            String(
              material.material_number ||
                ""
            )
              .trim()
              .toLowerCase() ===
              query
        ) ||
        databaseMaterials.find(
          (material) =>
            String(
              material.description ||
                ""
            )
              .trim()
              .toLowerCase() ===
              query
        ) ||
        null
      );
    };

  const runSearch =
    async () => {
      setErrorMessage("");
      setResults(null);

      const exactMaterial =
        selectedMaterial ||
        findExactMaterial();

      const hasMaterial =
        Boolean(
          exactMaterial
        );

      const hasQuery =
        Boolean(
          materialInput.trim() ||
            specificationInput.trim() ||
            companyInput.trim() ||
            categoryInput.trim()
        );

      if (
        !hasMaterial &&
        !hasQuery
      ) {
        const message =
          "Enter a material code, description, or specification first.";

        setErrorMessage(
          message
        );

        addToast({
          title:
            "Search Input Required",
          message,
          type: "warning",
        });

        return;
      }

      setIsSearching(true);

      try {
        const response =
          await fetch(
            "/api/semantic-search",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify(
                hasMaterial
                  ? {
                      materialId:
                        exactMaterial
                          .id,

                      matchCount:
                        30,
                    }
                  : {
                      company:
                        companyInput.trim(),

                      materialNumber:
                        materialInput.trim(),

                      description:
                        materialInput.trim(),

                      specifications:
                        specificationInput.trim(),

                      category:
                        categoryInput.trim(),

                      matchCount:
                        30,
                    }
              ),
            }
          );

        const data =
          (await response.json()) as SearchResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.details ||
              data.error ||
              "Semantic search failed."
          );
        }

        setResults(
          data
        );

        addToast({
          title:
            "AI Match Complete",
          message:
            `${data.count || 0} semantic matches evaluated.`,
          type: "success",
        });
      } catch (
        error
      ) {
        console.error(
          "AI matcher error:",
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Unable to run semantic search.";

        setErrorMessage(
          message
        );

        addToast({
          title:
            "AI Match Failed",
          message,
          type: "error",
        });
      } finally {
        setIsSearching(false);
      }
    };

  const clearSearch =
    () => {
      setMaterialInput("");
      setSpecificationInput("");
      setCompanyInput("");
      setCategoryInput("");
      setSelectedMaterialId(
        null
      );
      setResults(null);
      setErrorMessage("");
      setSuggestionsOpen(
        false
      );
    };

  const source =
    results?.query;

  const companyResults =
    results?.company_results ||
    TARGET_COMPANIES.map(
      (company) => ({
        rank: null,
        material_id: null,
        company,
        material_number: null,
        description: null,
        category: null,
        similarity: 0,
        similarity_percent: 0,
        recommendation:
          "NO_MATCH",
      })
    );

  return (
    <div className="min-h-full bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#002244] via-[#00315c] to-[#0f172a] text-white shadow-sm">
          <div className="border-b border-white/10 bg-black/10 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  LIVE AI ENGINE
                </div>

                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  AI Specification Matcher
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Compare CPSE material descriptions and
                  engineering specifications using Gemini
                  embeddings and vector similarity.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  DATABASE STATUS
                </div>

                <div className="mt-1 flex items-center justify-end gap-2 text-sm font-bold text-emerald-300">
                  <Database className="h-4 w-4" />
                  {materialsLoading
                    ? "Loading..."
                    : `${databaseMaterials.length.toLocaleString()} materials`}
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================
              SEARCH PANEL
          =================================================== */}

          <div className="grid gap-4 p-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Material / Code / Description
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={
                    materialInput
                  }
                  onChange={(
                    event
                  ) => {
                    setMaterialInput(
                      event.target
                        .value
                    );

                    setSelectedMaterialId(
                      null
                    );

                    setSuggestionsOpen(
                      true
                    );
                  }}
                  onFocus={() =>
                    setSuggestionsOpen(
                      true
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();

                      setSuggestionsOpen(
                        false
                      );

                      void runSearch();
                    }
                  }}
                  placeholder="e.g. 4834093524 or CHECK VALVE SWING TYPE"
                  className="w-full rounded-xl border border-white/15 bg-white/10 py-3.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />

                {suggestionsOpen &&
                  suggestions.length >
                    0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      {suggestions.map(
                        (
                          material
                        ) => (
                          <button
                            key={
                              material.id
                            }
                            type="button"
                            onMouseDown={(
                              event
                            ) =>
                              event.preventDefault()
                            }
                            onClick={() =>
                              selectMaterial(
                                material
                              )
                            }
                            className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                          >
                            <div className="mt-0.5 rounded-lg bg-slate-100 p-2">
                              <Building2 className="h-4 w-4 text-slate-600" />
                            </div>

                            <div className="min-w-0">
                              <div className="font-mono text-xs font-bold text-slate-900">
                                {material.material_number ||
                                  `ID ${material.id}`}
                              </div>

                              <div className="mt-0.5 truncate text-xs text-slate-600">
                                {material.description ||
                                  "No description"}
                              </div>

                              <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {companyName(
                                  material.company
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  )}
              </div>

              {selectedMaterial && (
                <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                  Selected database record:
                  <span className="ml-1 font-mono font-bold">
                    {selectedMaterial.material_number ||
                      `ID ${selectedMaterial.id}`}
                  </span>
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Company / CPSE
              </label>

              <input
                value={
                  companyInput
                }
                onChange={(
                  event
                ) =>
                  setCompanyInput(
                    event.target
                      .value
                  )
                }
                placeholder="Optional: IOCL, BPCL, HPCL..."
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <div className="lg:col-span-12">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Technical Specification
              </label>

              <textarea
                value={
                  specificationInput
                }
                onChange={(
                  event
                ) =>
                  setSpecificationInput(
                    event.target
                      .value
                  )
                }
                rows={4}
                placeholder="Enter size, pressure class, material grade, standard, end connection, dimensions, or any technical specification..."
                className="w-full resize-none rounded-xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <div className="lg:col-span-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Category
              </label>

              <input
                value={
                  categoryInput
                }
                onChange={(
                  event
                ) =>
                  setCategoryInput(
                    event.target
                      .value
                  )
                }
                placeholder="Optional: Valve, Pump, Bearing..."
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>

            <div className="flex items-end gap-2 lg:col-span-8 lg:justify-end">
              <button
                type="button"
                onClick={
                  clearSearch
                }
                disabled={
                  isSearching
                }
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Clear
              </button>

              <button
                type="button"
                onClick={() =>
                  void runSearch()
                }
                disabled={
                  isSearching
                }
                className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI MATCHING...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    FIND BEST MATCHES
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <div className="font-bold">
                AI matching failed
              </div>

              <div className="mt-1">
                {errorMessage}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SOURCE
        ===================================================== */}

        {results?.query && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">
                  SOURCE MATERIAL
                </div>

                <h2 className="mt-1 text-lg font-black text-slate-900">
                  {results.query.material_number ||
                    results.query.description ||
                    "Direct specification query"}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {results.mode ===
                  "MATERIAL"
                    ? "DATABASE MATERIAL"
                    : "DIRECT QUERY"}
                </span>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Gemini Embeddings • 768D
                </span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Company
                </div>
                <div className="mt-1 font-bold text-slate-900">
                  {companyName(
                    results.query
                      .company
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Category
                </div>
                <div className="mt-1 font-bold text-slate-900">
                  {results.query.category ||
                    "Not classified"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Matches
                </div>
                <div className="mt-1 font-mono text-xl font-black text-slate-900">
                  {results.count ||
                    0}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  AI Model
                </div>
                <div className="mt-1 font-bold text-slate-900">
                  {results.embedding
                    ?.model ||
                    "Gemini"}
                </div>
              </div>
            </div>

            {results.query.description && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Description
                </div>

                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {results.query.description}
                </p>
              </div>
            )}
          </section>
        )}

        {/* =====================================================
            COMPANY BEST MATCHES
        ===================================================== */}

        {results && (
          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">
                  SEMANTIC ENGINE RESULTS
                </div>

                <h2 className="text-2xl font-black tracking-tight text-slate-900">
                  BEST MATCHES
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Highest semantic similarity found for
                  each major CPSE.
                </p>
              </div>

              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-mono font-bold text-slate-500 shadow-sm">
                VECTOR SEARCH • COSINE SIMILARITY
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {companyResults
                .filter(
                  (result) =>
                    TARGET_COMPANIES.includes(
                      companyName(
                        result.company
                      )
                    )
                )
                .map(
                  (
                    result,
                    index
                  ) => {
                    const isNoMatch =
                      result.recommendation ===
                      "NO_MATCH";

                    return (
                      <motion.div
                        key={
                          result.company ||
                          index
                        }
                        initial={{
                          opacity: 0,
                          y: 8,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        transition={{
                          delay:
                            index *
                            0.04,
                        }}
                        className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                          isNoMatch
                            ? "border-slate-200"
                            : "border-slate-200 hover:-translate-y-0.5 hover:shadow-md"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white">
                              {companyName(
                                result.company
                              ).slice(
                                0,
                                3
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="text-sm font-black text-slate-900">
                                {companyName(
                                  result.company
                                )}
                              </div>

                              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                CPSE MATCH
                              </div>
                            </div>
                          </div>

                          {isNoMatch ? (
                            <XCircle className="h-5 w-5 text-slate-300" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          )}
                        </div>

                        {isNoMatch ? (
                          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
                            <div className="text-sm font-bold text-slate-500">
                              No sufficiently close match
                            </div>

                            <div className="mt-1 text-[11px] text-slate-400">
                              No result reached the current
                              confidence threshold.
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="mt-5 flex items-end justify-between">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                  Similarity
                                </div>

                                <div className="mt-1 font-mono text-3xl font-black text-emerald-600">
                                  {
                                    result.similarity_percent
                                  }
                                  %
                                </div>
                              </div>

                              <span
                                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${recommendationClasses(
                                  result.recommendation
                                )}`}
                              >
                                {recommendationLabel(
                                  result.recommendation
                                )}
                              </span>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      result.similarity_percent
                                    )
                                  )}%`,
                                }}
                              />
                            </div>

                            <div className="mt-5 rounded-xl bg-slate-50 p-4">
                              <div className="font-mono text-xs font-black text-slate-900">
                                {result.material_number ||
                                  `Material ID ${result.material_id}`}
                              </div>

                              <div className="mt-1 text-sm leading-5 text-slate-700">
                                {result.description ||
                                  "No description available."}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {result.category && (
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                    {result.category}
                                  </span>
                                )}

                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-mono font-bold text-slate-500">
                                  ID {result.material_id}
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </motion.div>
                    );
                  }
                )}
            </div>
          </section>
        )}

        {/* =====================================================
            ALL MATCHES
        ===================================================== */}

        {results &&
          results.matches &&
          results.matches.length >
            0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-indigo-600" />

                  <div>
                    <h3 className="font-black text-slate-900">
                      Ranked Semantic Matches
                    </h3>

                    <p className="text-[11px] text-slate-500">
                      Complete vector search result set.
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">
                        Rank
                      </th>

                      <th className="px-5 py-3">
                        Company
                      </th>

                      <th className="px-5 py-3">
                        Material
                      </th>

                      <th className="px-5 py-3">
                        Description
                      </th>

                      <th className="px-5 py-3">
                        Similarity
                      </th>

                      <th className="px-5 py-3">
                        Decision
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {results.matches.map(
                      (
                        match
                      ) => (
                        <tr
                          key={`${match.material_id}-${match.rank}`}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-5 py-4 font-mono text-xs font-black text-slate-900">
                            #
                            {
                              match.rank
                            }
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-black text-white">
                              {companyName(
                                match.company
                              )}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-mono text-xs font-bold text-slate-800">
                            {match.material_number ||
                              `ID ${match.material_id}`}
                          </td>

                          <td className="max-w-md px-5 py-4 text-xs leading-5 text-slate-600">
                            {match.description ||
                              "—"}
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-mono text-sm font-black text-emerald-600">
                              {
                                match.similarity_percent
                              }
                              %
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${recommendationClasses(
                                match.recommendation
                              )}`}
                            >
                              {match.recommendation ===
                              "LIKELY_MATCH" ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : match.recommendation ===
                                "NO_MATCH" ? (
                                <XCircle className="h-3 w-3" />
                              ) : (
                                <AlertTriangle className="h-3 w-3" />
                              )}

                              {recommendationLabel(
                                match.recommendation
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        {/* =====================================================
            EMPTY
        ===================================================== */}

        {!results &&
          !isSearching && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                <Sparkles className="h-7 w-7 text-emerald-600" />
              </div>

              <h3 className="mt-4 text-lg font-black text-slate-900">
                Ready for material harmonization
              </h3>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Enter a material code, description, and/or
                technical specification. The backend will create
                a Gemini embedding and search the national
                material vector index.
              </p>
            </section>
          )}
      </div>
    </div>
  );
}