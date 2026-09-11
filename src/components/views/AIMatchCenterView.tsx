import React, {
  useCallback,
  useEffect,
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
  ShieldCheck,
  SlidersHorizontal,
  Tag,
} from "lucide-react";

import { motion } from "motion/react";

import { useApp } from "../../context/AppContext";

/* =========================================================
   TYPES
========================================================= */

type DatabaseMaterial = {
  id: number;

  company: string | null;
  company_id?: number | null;

  material_number: string | null;

  description: string | null;

  specifications: string | null;

  category: string | null;

  bmg_id?: string | null;

  bmg_code?: string | null;

  ai_name?: string | null;
  bmg_name?: string | null;

  ai_confidence?: number | null;

  match_status?: string | null;

  bmg_status?: string | null;

  verified?: boolean;
};

type MatchResult = {
  rank: number | null;

  material_id: number | null;

  company: string | null;

  company_id?: number | null;

  material_number: string | null;

  description: string | null;

  specifications?: string | null;

  category: string | null;

  bmg_id?: string | null;

  bmg_code?: string | null;

  ai_name?: string | null;

  bmg_name?: string | null;

  similarity?: number | null;

  similarity_percent?: number | null;

  technical_match_percent?: number | null;

  match_percent?: number | null;

  confidence?: number | null;

  recommendation: string;

  technical_match?: boolean;

  critical_conflict?: boolean;

  critical_spec_conflict?: boolean;

  reason?: string | null;

  match_reason?: string | null;

  source?: string | null;
};

type SearchResponse = {
  success: boolean;

  mode?: string;

  query?: {
    material_id: number | null;

    company: string | null;

    material_number: string | null;

    description: string | null;

    specifications: string | null;

    category: string | null;

    search_text: string | null;

    bmg_id?: string | null;

    bmg_code?: string | null;

    ai_name?: string | null;

    bmg_name?: string | null;
  };

  source_material?: DatabaseMaterial | null;

  embedding?: {
    model: string;

    dimensions: number;

    generated: boolean;
  };

  count?: number;

  matches?: MatchResult[];

  results?: MatchResult[];

  best_match_by_company?: MatchResult[];

  company_results?: MatchResult[];

  error?: string;

  details?: string;

  message?: string;
};

type ActiveMaterialsResponse = {
  success: boolean;

  materials?: DatabaseMaterial[];

  count?: number;

  totalMaterials?: number;

  rejectedMaterials?: number;

  error?: string;
};

/* =========================================================
   CONSTANTS
========================================================= */

const TECHNICAL_MATCH_THRESHOLD = 60;

/*
 * Company-specific material numbers are NOT BMG identities.
 *
 * They can be displayed as source identifiers, but they
 * must never determine technical equivalence.
 */

const COMPANY_CODE_PREFIXES = [
  "BPCL-",
  "HPCL-",
  "IOCL-",
  "BHEL-",
  "ONGC-",
  "HOCL-",
];

/* =========================================================
   HELPERS
========================================================= */

function normalizeCompany(
  value: string | null | undefined
) {
  return (
    value?.trim().toUpperCase() ||
    "UNKNOWN"
  );
}

function cleanText(
  value: string | null | undefined
) {
  return (
    value?.trim() || ""
  );
}

function isCompanyMaterialCode(
  value: string | null | undefined
) {
  const normalized =
    cleanText(value).toUpperCase();

  if (!normalized) {
    return false;
  }

  return COMPANY_CODE_PREFIXES.some(
    (prefix) =>
      normalized.startsWith(prefix)
  );
}

/*
 * BMG identity is deliberately preferred over company
 * material numbers.
 */

function getBmgIdentity(
  result:
    | DatabaseMaterial
    | MatchResult
    | null
    | undefined
) {
  if (!result) {
    return "";
  }

  return (
    cleanText(result.bmg_code) ||
    cleanText(result.bmg_id) ||
    cleanText(result.ai_name) ||
    cleanText(result.bmg_name)
  );
}

function getBmgName(
  result:
    | DatabaseMaterial
    | MatchResult
    | null
    | undefined
) {
  if (!result) {
    return "";
  }

  return (
    cleanText(result.ai_name) ||
    cleanText(result.bmg_name) ||
    cleanText(result.description)
  );
}

/*
 * The matcher backend may return:
 *
 * match_percent
 * technical_match_percent
 * similarity_percent
 * confidence
 *
 * Technical match is preferred.
 */

function getMatchPercent(
  result: MatchResult
) {
  const value =
    result.match_percent ??
    result.technical_match_percent ??
    result.confidence ??
    result.similarity_percent ??
    (
      typeof result.similarity ===
      "number"
        ? result.similarity * 100
        : 0
    );

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    )
  );
}

/*
 * A backend may explicitly tell us that a critical
 * specification conflicts.
 *
 * In that case the result is NOT considered technically
 * equivalent even if its vector similarity is high.
 */

function hasCriticalConflict(
  result: MatchResult
) {
  return Boolean(
    result.critical_conflict ||
      result.critical_spec_conflict
  );
}

function isTechnicalMatch(
  result: MatchResult
) {
  if (
    hasCriticalConflict(result)
  ) {
    return false;
  }

  if (
    result.technical_match ===
    false
  ) {
    return false;
  }

  return (
    getMatchPercent(result) >=
    TECHNICAL_MATCH_THRESHOLD
  );
}

function recommendationLabel(
  recommendation: string,
  percent: number,
  criticalConflict = false
) {
  if (criticalConflict) {
    return "SPEC CONFLICT";
  }

  if (
    percent >=
    TECHNICAL_MATCH_THRESHOLD
  ) {
    if (
      recommendation ===
      "LIKELY_MATCH"
    ) {
      return "TECHNICAL MATCH";
    }

    if (
      recommendation ===
      "TECHNICAL_MATCH"
    ) {
      return "TECHNICAL MATCH";
    }

    return "REVIEW MATCH";
  }

  if (
    recommendation ===
      "LOW_CONFIDENCE" ||
    recommendation ===
      "NO_MATCH"
  ) {
    return "BELOW THRESHOLD";
  }

  return "REVIEW";
}

function recommendationClasses(
  recommendation: string,
  percent: number,
  criticalConflict = false
) {
  if (criticalConflict) {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (
    percent >=
    TECHNICAL_MATCH_THRESHOLD
  ) {
    if (
      recommendation ===
        "LIKELY_MATCH" ||
      recommendation ===
        "TECHNICAL_MATCH"
    ) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (
    recommendation ===
    "NO_MATCH"
  ) {
    return "bg-slate-100 text-slate-500 border-slate-200";
  }

  return "bg-orange-50 text-orange-700 border-orange-200";
}

/*
 * Normalize whatever result array the matcher backend returns.
 *
 * This prevents the UI from silently breaking if the backend
 * uses "results" instead of "matches".
 */

function extractMatchResults(
  data: SearchResponse
): MatchResult[] {
  const candidates =
    data.matches ||
    data.results ||
    data.best_match_by_company ||
    data.company_results ||
    [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter(Boolean)
    .map(
      (
        result,
        index
      ) => ({
        ...result,

        rank:
          result.rank ??
          index + 1,

        material_id:
          result.material_id ??
          null,

        company:
          result.company ??
          null,

        material_number:
          result.material_number ??
          null,

        description:
          result.description ??
          null,

        category:
          result.category ??
          null,

        recommendation:
          result.recommendation ||
          (
            isTechnicalMatch(
              result
            )
              ? "TECHNICAL_MATCH"
              : "LOW_CONFIDENCE"
          ),
      })
    );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AIMatchCenterView() {
  const { addToast } = useApp();

  /* =========================================================
     MATERIAL INDEX
  ========================================================= */

  const [
    materials,
    setMaterials,
  ] = useState<
    DatabaseMaterial[]
  >([]);

  const [
    materialsLoading,
    setMaterialsLoading,
  ] = useState(true);

  const [
    materialsError,
    setMaterialsError,
  ] = useState("");

  const [
    lastMaterialsRefresh,
    setLastMaterialsRefresh,
  ] = useState<Date | null>(
    null
  );

  /* =========================================================
     SEARCH
  ========================================================= */

  const [
    searchInput,
    setSearchInput,
  ] = useState("");

  const [
    specificationInput,
    setSpecificationInput,
  ] = useState("");

  const [
    categoryInput,
    setCategoryInput,
  ] = useState("");

  const [
    selectedMaterialId,
    setSelectedMaterialId,
  ] = useState<number | null>(
    null
  );

  const [
    suggestionsOpen,
    setSuggestionsOpen,
  ] = useState(false);

  const [
    advancedOpen,
    setAdvancedOpen,
  ] = useState(false);

  const [
    isSearching,
    setIsSearching,
  ] = useState(false);

  const [
    results,
    setResults,
  ] = useState<SearchResponse | null>(
    null
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  /* =========================================================
     LOAD ACTIVE MATERIALS
  ========================================================= */

  const loadMaterials =
    useCallback(
      async (
        showToast = false
      ) => {
        setMaterialsLoading(
          true
        );

        setMaterialsError("");

        try {
          const response =
            await fetch(
              `/api/materials/active?t=${Date.now()}`,
              {
                method: "GET",

                cache: "no-store",

                headers: {
                  "Cache-Control":
                    "no-cache",

                  Pragma:
                    "no-cache",
                },
              }
            );

          const data =
            (await response.json()) as ActiveMaterialsResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Unable to load active materials."
            );
          }

          const activeMaterials =
            Array.isArray(
              data.materials
            )
              ? data.materials
              : [];

          setMaterials(
            activeMaterials
          );

          setLastMaterialsRefresh(
            new Date()
          );

          if (
            selectedMaterialId !==
              null &&
            !activeMaterials.some(
              (material) =>
                material.id ===
                selectedMaterialId
            )
          ) {
            setSelectedMaterialId(
              null
            );
          }

          if (showToast) {
            const rejectedCount =
              data.rejectedMaterials ||
              0;

            addToast({
              title:
                "BMG Material Index Refreshed",

              message:
                `${activeMaterials.length.toLocaleString()} active material records loaded.` +
                (rejectedCount >
                0
                  ? ` ${rejectedCount.toLocaleString()} rejected records excluded.`
                  : ""),

              type: "success",
            });
          }
        } catch (error) {
          console.error(
            "Failed to load active materials:",
            error
          );

          const message =
            error instanceof Error
              ? error.message
              : "Unable to load active materials.";

          setMaterialsError(
            message
          );

          if (showToast) {
            addToast({
              title:
                "Material Index Refresh Failed",

              message,

              type: "error",
            });
          }
        } finally {
          setMaterialsLoading(
            false
          );
        }
      },
      [
        addToast,
        selectedMaterialId,
      ]
    );

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  /* =========================================================
     REFRESH WHEN WINDOW GETS FOCUS
  ========================================================= */

  useEffect(() => {
    const handleFocus =
      () => {
        void loadMaterials();
      };

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, [loadMaterials]);

  /* =========================================================
     REFRESH WHEN TAB BECOMES VISIBLE
  ========================================================= */

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void loadMaterials();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [loadMaterials]);

  /* =========================================================
     SELECTED MATERIAL
  ========================================================= */

  const selectedMaterial =
    useMemo(
      () =>
        materials.find(
          (material) =>
            material.id ===
            selectedMaterialId
        ) || null,
      [
        materials,
        selectedMaterialId,
      ]
    );

  /* =========================================================
     AUTOCOMPLETE
  ========================================================= */

  const suggestions =
    useMemo(() => {
      const query =
        searchInput
          .trim()
          .toLowerCase();

      /*
       * Company material numbers are deliberately not used
       * as search identities.
       */

      const validMaterials =
        materials.filter(
          (material) =>
            !isCompanyMaterialCode(
              material.material_number
            )
        );

      if (!query) {
        return validMaterials.slice(
          0,
          10
        );
      }

      return validMaterials
        .filter(
          (material) => {
            const description =
              cleanText(
                material.description
              ).toLowerCase();

            const specifications =
              cleanText(
                material.specifications
              ).toLowerCase();

            const category =
              cleanText(
                material.category
              ).toLowerCase();

            const bmgCode =
              cleanText(
                material.bmg_code
              ).toLowerCase();

            const bmgId =
              cleanText(
                material.bmg_id
              ).toLowerCase();

            const bmgName =
              getBmgName(
                material
              ).toLowerCase();

            return (
              description.includes(
                query
              ) ||
              specifications.includes(
                query
              ) ||
              category.includes(
                query
              ) ||
              bmgCode.includes(
                query
              ) ||
              bmgId.includes(
                query
              ) ||
              bmgName.includes(
                query
              )
            );
          }
        )
        .slice(0, 10);
    }, [
      materials,
      searchInput,
    ]);

  /* =========================================================
     SELECT MATERIAL
  ========================================================= */

  const selectMaterial = (
    material: DatabaseMaterial
  ) => {
    if (
      isCompanyMaterialCode(
        material.material_number
      )
    ) {
      addToast({
        title:
          "Company Code Not Accepted",

        message:
          "Use the part description, technical specification, or BMG identity instead.",

        type: "warning",
      });

      return;
    }

    setSelectedMaterialId(
      material.id
    );

    setSearchInput(
      material.description ||
        getBmgName(material) ||
        material.bmg_code ||
        ""
    );

    setCategoryInput(
      material.category || ""
    );

    setSpecificationInput(
      material.specifications || ""
    );

    setSuggestionsOpen(
      false
    );

    setResults(null);

    setErrorMessage("");
  };

  /* =========================================================
     EXACT MATERIAL LOOKUP
  ========================================================= */

  const findExactMaterial =
    () => {
      const query =
        searchInput
          .trim()
          .toLowerCase();

      if (!query) {
        return null;
      }

      return (
        materials.find(
          (material) => {
            if (
              isCompanyMaterialCode(
                material.material_number
              )
            ) {
              return false;
            }

            const description =
              cleanText(
                material.description
              ).toLowerCase();

            const bmgCode =
              cleanText(
                material.bmg_code
              ).toLowerCase();

            const bmgId =
              cleanText(
                material.bmg_id
              ).toLowerCase();

            const bmgName =
              getBmgName(
                material
              ).toLowerCase();

            return (
              description ===
                query ||
              bmgCode ===
                query ||
              bmgId ===
                query ||
              bmgName ===
                query
            );
          }
        ) || null
      );
    };

  /* =========================================================
     RUN TECHNICAL MATCHER
  ========================================================= */

  const runSearch =
    async () => {
      setErrorMessage("");
      setResults(null);

      const trimmedSearch =
        searchInput.trim();

      /* ======================================================
         HARD BLOCK COMPANY CODES
      ====================================================== */

      if (
        isCompanyMaterialCode(
          trimmedSearch
        )
      ) {
        const message =
          "Company material codes such as BPCL-XXXX, HPCL-XXXX or IOCL-XXXX cannot be used as the AI search identity. Search using the part name, technical specification, or BMG identity.";

        setErrorMessage(
          message
        );

        addToast({
          title:
            "Use a Part or BMG Identity",

          message,

          type: "warning",
        });

        return;
      }

      const exactMaterial =
        selectedMaterial ||
        findExactMaterial();

      const hasSearch =
        Boolean(
          trimmedSearch
        );

      const hasSpecification =
        Boolean(
          specificationInput.trim()
        );

      const hasCategory =
        Boolean(
          categoryInput.trim()
        );

      if (
        !hasSearch &&
        !hasSpecification &&
        !hasCategory
      ) {
        const message =
          "Enter a part name, BMG identity, or technical specification.";

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

      /* ======================================================
         VERIFY SELECTED MATERIAL IS STILL ACTIVE
      ====================================================== */

      if (
        exactMaterial &&
        !materials.some(
          (material) =>
            material.id ===
            exactMaterial.id
        )
      ) {
        const message =
          "This material is no longer active. Please refresh the BMG material index.";

        setSelectedMaterialId(
          null
        );

        setResults(null);

        setErrorMessage(
          message
        );

        addToast({
          title:
            "Material No Longer Available",

          message,

          type: "warning",
        });

        await loadMaterials(
          true
        );

        return;
      }

      setIsSearching(true);

      try {
        /*
         * IMPORTANT:
         *
         * The PEC/technical matcher uses /api/match-materials.
         *
         * We intentionally do NOT call /api/semantic-search here.
         *
         * semantic-search is a candidate/vector search endpoint.
         * This screen is the technical equivalence matcher.
         */

        const requestBody =
          exactMaterial
            ? {
                materialId:
                  exactMaterial.id,

                matchCount: 30,

                matchThreshold:
                  TECHNICAL_MATCH_THRESHOLD /
                  100,
              }
            : {
                description:
                  trimmedSearch,

                specifications:
                  specificationInput.trim(),

                category:
                  categoryInput.trim(),

                matchCount: 30,

                matchThreshold:
                  TECHNICAL_MATCH_THRESHOLD /
                  100,
              };

        const response =
          await fetch(
            "/api/match-materials",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "Cache-Control":
                  "no-cache",
              },

              cache: "no-store",

              body: JSON.stringify(
                requestBody
              ),
            }
          );

        const rawData =
          await response.json();

        const data =
          rawData as SearchResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.details ||
              data.error ||
              data.message ||
              "Technical material matching failed."
          );
        }

        /*
         * Normalize the matcher result before giving it to
         * the UI.
         */

        const normalizedMatches =
          extractMatchResults(
            data
          );

        const normalizedResponse:
          SearchResponse = {
          ...data,

          matches:
            normalizedMatches,

          count:
            normalizedMatches.length,
        };

        setResults(
          normalizedResponse
        );

        const count =
          normalizedMatches.length;

        const technicalCount =
          normalizedMatches.filter(
            (match) =>
              isTechnicalMatch(
                match
              )
          ).length;

        addToast({
          title:
            "Technical Matching Complete",

          message:
            `${count} candidates evaluated; ${technicalCount} meet the ${TECHNICAL_MATCH_THRESHOLD}% technical threshold.`,

          type: "success",
        });
      } catch (error) {
        console.error(
          "Technical material matching error:",
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Unable to run technical material matching.";

        setErrorMessage(
          message
        );

        addToast({
          title:
            "Technical Match Failed",

          message,

          type: "error",
        });
      } finally {
        setIsSearching(
          false
        );
      }
    };

  /* =========================================================
     CLEAR
  ========================================================= */

  const clearSearch =
    () => {
      setSearchInput("");

      setSpecificationInput(
        ""
      );

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

  /* =========================================================
     MATCH RESULTS
  ========================================================= */

  const rankedMatches =
    useMemo(() => {
      const matches =
        results?.matches || [];

      return [
        ...matches,
      ].sort(
        (a, b) => {
          const aTechnical =
            isTechnicalMatch(a)
              ? 1
              : 0;

          const bTechnical =
            isTechnicalMatch(b)
              ? 1
              : 0;

          if (
            bTechnical !==
            aTechnical
          ) {
            return (
              bTechnical -
              aTechnical
            );
          }

          return (
            getMatchPercent(b) -
            getMatchPercent(a)
          );
        }
      );
    }, [results]);

  const qualifyingMatches =
    rankedMatches.filter(
      (result) =>
        isTechnicalMatch(
          result
        )
    );

  const belowThresholdMatches =
    rankedMatches.filter(
      (result) =>
        !isTechnicalMatch(
          result
        )
    );

  /*
   * The best match MUST be a technically compatible result
   * whenever one exists.
   *
   * A 95% vector result with a critical specification conflict
   * must not become BEST MATCH.
   */

  const bestMatch =
    qualifyingMatches[0] ||
    null;

  /* =========================================================
     SHARED BMG GROUPS
  ========================================================= */

  /*
   * Equivalent materials should converge on the same BMG
   * identity.
   *
   * This does not create or change BMG codes.
   * It only groups the returned results for display.
   */

  const bmgGroups =
    useMemo(() => {
      const groups =
        new Map<
          string,
          MatchResult[]
        >();

      for (const match of qualifyingMatches) {
        const identity =
          getBmgIdentity(
            match
          );

        if (!identity) {
          continue;
        }

        const existing =
          groups.get(
            identity
          ) || [];

        existing.push(
          match
        );

        groups.set(
          identity,
          existing
        );
      }

      return Array.from(
        groups.entries()
      )
        .map(
          ([
            identity,
            group,
          ]) => ({
            identity,
            matches: group,
          })
        )
        .sort(
          (a, b) =>
            b.matches.length -
            a.matches.length
        );
    }, [
      qualifyingMatches,
    ]);

  /* =========================================================
     RESULT COMPANIES
  ========================================================= */

  const resultCompanyCount =
    new Set(
      rankedMatches
        .map((result) =>
          normalizeCompany(
            result.company
          )
        )
        .filter(
          (company) =>
            company !== "UNKNOWN"
        )
    ).size;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-full bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">

      <div className="mx-auto max-w-[1500px] space-y-6">

        {/* ===================================================
            HEADER
        =================================================== */}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#002244] via-[#00315c] to-[#0f172a] text-white shadow-lg">

          <div className="border-b border-white/10 bg-black/10 px-6 py-6 lg:px-8">

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black tracking-[0.18em] text-emerald-300">

                  <Sparkles className="h-3.5 w-3.5" />

                  BMG AI ENGINE

                </div>

                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">

                  AI Specification Matcher

                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">

                  Find technically equivalent materials
                  across the entire Bharat Material Grid.
                  Search by the part itself or its
                  BMG identity — not by company-specific
                  material codes.

                </p>

              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">

                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    ACTIVE MATERIALS
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-lg font-black text-emerald-300">

                    {materialsLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4" />
                    )}

                    {materialsLoading
                      ? "..."
                      : materials.length.toLocaleString()}

                  </div>

                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">

                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    MATCH THRESHOLD
                  </div>

                  <div className="mt-1 text-lg font-black text-emerald-300">
                    {TECHNICAL_MATCH_THRESHOLD}%
                  </div>

                </div>

                <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:block">

                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    COMPANIES
                  </div>

                  <div className="mt-1 text-lg font-black text-emerald-300">
                    ALL CPSEs
                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* =================================================
              SEARCH
          ================================================= */}

          <div className="p-6 lg:p-8">

            <div className="mb-3">

              <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-300">

                Search Part or BMG Identity

              </label>

              <p className="mt-1 text-[11px] text-slate-400">

                Search by part name, engineering description,
                technical specification, or the unique BMG
                identity assigned by the AI.

              </p>

            </div>

            <div className="relative">

              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

              <input
                value={
                  searchInput
                }
                onChange={(event) => {
                  const value =
                    event.target
                      .value;

                  setSearchInput(
                    value
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
                placeholder="e.g. Gate Valve 15NB SS304 or BMG-VLV-001"
                className="w-full rounded-2xl border border-white/15 bg-white/10 py-4 pl-14 pr-5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />

              {isCompanyMaterialCode(
                searchInput
              ) && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-red-400/10 px-2 py-1 text-[9px] font-black uppercase text-red-300">

                  COMPANY CODE

                </div>
              )}

              {suggestionsOpen &&
                suggestions.length >
                  0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">

                      <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">

                        BMG Search Suggestions

                      </div>

                    </div>

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
                          className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50"
                        >

                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">

                            <Tag className="h-4 w-4 text-emerald-600" />

                          </div>

                          <div className="min-w-0">

                            <div className="font-bold text-sm text-slate-900">

                              {material.description ||
                                getBmgName(
                                  material
                                ) ||
                                "Unnamed material"}

                            </div>

                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">

                              {material.specifications ||
                                material.category ||
                                "Technical specification available in database"}

                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">

                              {getBmgIdentity(
                                material
                              ) && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-mono font-black text-emerald-700">

                                  {getBmgIdentity(
                                    material
                                  )}

                                </span>
                              )}

                              {material.category && (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-500">

                                  {material.category}

                                </span>
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
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">

                <CheckCircle2 className="h-4 w-4" />

                <span>
                  BMG database material selected:
                </span>

                <span className="font-bold">

                  {selectedMaterial.description ||
                    getBmgName(
                      selectedMaterial
                    ) ||
                    `Material ${selectedMaterial.id}`}

                </span>

              </div>
            )}

            {/* =================================================
                ADVANCED TECHNICAL SEARCH
            ================================================= */}

            <div className="mt-4">

              <button
                type="button"
                onClick={() =>
                  setAdvancedOpen(
                    (value) =>
                      !value
                  )
                }
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-emerald-300"
              >

                <SlidersHorizontal className="h-3.5 w-3.5" />

                {advancedOpen
                  ? "Hide technical filters"
                  : "Add technical specifications"}

              </button>

            </div>

            {advancedOpen && (
              <div className="mt-4 grid gap-4 lg:grid-cols-12">

                <div className="lg:col-span-8">

                  <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-300">

                    Technical Specifications

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
                    placeholder="Size, pressure class, material grade, standard, end connection, dimensions, operating conditions..."
                    className="w-full resize-none rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  />

                </div>

                <div className="lg:col-span-4">

                  <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-300">

                    Engineering Category

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
                    placeholder="Valve, Pump, Bearing..."
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  />

                </div>

              </div>
            )}

            {/* =================================================
                ACTIONS
            ================================================= */}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={() =>
                  void loadMaterials(
                    true
                  )
                }
                disabled={
                  materialsLoading
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >

                <RefreshCw
                  className={
                    materialsLoading
                      ? "h-4 w-4 animate-spin"
                      : "h-4 w-4"
                  }
                />

                Refresh Index

              </button>

              <button
                type="button"
                onClick={
                  clearSearch
                }
                disabled={
                  isSearching
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/10"
              >

                Clear

              </button>

              <button
                type="button"
                onClick={() =>
                  void runSearch()
                }
                disabled={
                  isSearching ||
                  materialsLoading
                }
                className="inline-flex min-w-[230px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >

                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />

                    ANALYZING SPECS...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />

                    FIND TECHNICAL MATCHES

                    <ArrowRight className="h-4 w-4" />
                  </>
                )}

              </button>

            </div>

          </div>

        </section>

        {/* ===================================================
            ERRORS
        =================================================== */}

        {materialsError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">

            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>

              <div className="font-bold">
                BMG material index could not be loaded
              </div>

              <div className="mt-1">
                {materialsError}
              </div>

            </div>

          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">

            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>

              <div className="font-bold">
                Search Notice
              </div>

              <div className="mt-1">
                {errorMessage}
              </div>

            </div>

          </div>
        )}

        {/* ===================================================
            SOURCE QUERY
        =================================================== */}

        {results?.query && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">

                  SEARCH IDENTITY

                </div>

                <h2 className="mt-1 text-xl font-black text-slate-900">

                  {results.query.ai_name ||
                    results.query.bmg_name ||
                    results.query.bmg_code ||
                    results.query.description ||
                    results.query.search_text ||
                    "Technical specification query"}

                </h2>

                <p className="mt-1 text-xs text-slate-500">

                  Technical matching across the entire
                  BMG material database.

                </p>

              </div>

              <div className="flex flex-wrap gap-2">

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">

                  <ShieldCheck className="h-3 w-3" />

                  Technical matching

                </span>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">

                  {TECHNICAL_MATCH_THRESHOLD}% threshold

                </span>

              </div>

            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

              <div className="rounded-2xl bg-slate-50 p-4">

                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  CANDIDATES
                </div>

                <div className="mt-1 font-mono text-2xl font-black text-slate-900">
                  {rankedMatches.length}
                </div>

              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">

                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                  TECHNICAL MATCHES
                </div>

                <div className="mt-1 font-mono text-2xl font-black text-emerald-700">
                  {qualifyingMatches.length}
                </div>

              </div>

              <div className="rounded-2xl bg-blue-50 p-4">

                <div className="text-[9px] font-black uppercase tracking-wider text-blue-600">
                  COMPANIES
                </div>

                <div className="mt-1 font-mono text-2xl font-black text-blue-700">
                  {resultCompanyCount}
                </div>

              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">

                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                  SHARED BMG GROUPS
                </div>

                <div className="mt-1 font-mono text-2xl font-black text-emerald-700">
                  {bmgGroups.length}
                </div>

              </div>

              <div className="rounded-2xl bg-slate-50 p-4">

                <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  BEST MATCH
                </div>

                <div className="mt-1 font-mono text-2xl font-black text-slate-900">

                  {bestMatch
                    ? `${getMatchPercent(
                        bestMatch
                      )}%`
                    : "—"}

                </div>

              </div>

            </div>

          </section>
        )}

        {/* ===================================================
            SHARED BMG IDENTITY GROUPS
        =================================================== */}

        {results &&
          bmgGroups.length >
            0 && (
            <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

                <div>

                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">

                    COMMON BMG IDENTITY

                  </div>

                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">

                    SHARED TECHNICAL GROUPS

                  </h2>

                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">

                    Technically equivalent materials are grouped
                    under the same company-neutral BMG identity.
                    The company material number remains only a
                    source identifier.

                  </p>

                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">

                  <ShieldCheck className="h-3.5 w-3.5" />

                  ONE TECHNICAL IDENTITY

                </div>

              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">

                {bmgGroups.map(
                  (
                    group
                  ) => (
                    <div
                      key={
                        group.identity
                      }
                      className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"
                    >

                      <div className="flex items-start justify-between gap-4">

                        <div>

                          <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">

                            BMG STANDARD IDENTITY

                          </div>

                          <div className="mt-1 break-all font-mono text-base font-black text-emerald-800">

                            {group.identity}

                          </div>

                        </div>

                        <div className="shrink-0 rounded-full bg-white px-3 py-1 font-mono text-xs font-black text-emerald-700">

                          {group.matches.length}{" "}
                          material
                          {group.matches.length !==
                          1
                            ? "s"
                            : ""}

                        </div>

                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">

                        {Array.from(
                          new Set(
                            group.matches.map(
                              (
                                match
                              ) =>
                                normalizeCompany(
                                  match.company
                                )
                            )
                          )
                        ).map(
                          (
                            company
                          ) => (
                            <span
                              key={
                                company
                              }
                              className="rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-black uppercase text-slate-700"
                            >
                              {company}
                            </span>
                          )
                        )}

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>
          )}

        {/* ===================================================
            BEST TECHNICAL MATCH
        =================================================== */}

        {results &&
          bestMatch && (
            <section>

              <div className="mb-4">

                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                  AI TECHNICAL ANALYSIS
                </div>

                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  BEST TECHNICAL MATCH
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  The highest-ranked technically compatible material
                  across the entire BMG database.
                </p>

              </div>

              <motion.div
                initial={{
                  opacity: 0,
                  y: 8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-md"
              >

                <div className="border-b border-emerald-100 bg-emerald-50/60 p-5 lg:p-6">

                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

                    <div className="min-w-0">

                      <div className="flex flex-wrap items-center gap-2">

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-white">

                          <CheckCircle2 className="h-3 w-3" />

                          BEST MATCH

                        </span>

                        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">

                          {normalizeCompany(
                            bestMatch.company
                          )}

                        </span>

                      </div>

                      <h3 className="mt-4 text-xl font-black text-slate-900 lg:text-2xl">

                        {bestMatch.description ||
                          getBmgName(
                            bestMatch
                          ) ||
                          "Technical material match"}

                      </h3>

                      {bestMatch.category && (
                        <div className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {bestMatch.category}
                        </div>
                      )}

                    </div>

                    <div className="shrink-0 text-left lg:text-right">

                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        TECHNICAL MATCH
                      </div>

                      <div className="mt-1 font-mono text-5xl font-black text-emerald-600">
                        {getMatchPercent(
                          bestMatch
                        )}
                        %
                      </div>

                      <div className="mt-1 text-[10px] font-bold text-emerald-700">
                        Above{" "}
                        {TECHNICAL_MATCH_THRESHOLD}%
                        threshold
                      </div>

                    </div>

                  </div>

                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-3 lg:p-6">

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      SOURCE COMPANY
                    </div>

                    <div className="mt-2 flex items-center gap-2">

                      <Building2 className="h-4 w-4 text-slate-500" />

                      <span className="font-black text-slate-900">
                        {normalizeCompany(
                          bestMatch.company
                        )}
                      </span>

                    </div>

                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      COMPANY MATERIAL CODE
                    </div>

                    <div className="mt-2 break-all font-mono text-sm font-black text-slate-900">
                      {bestMatch.material_number ||
                        "Not available"}
                    </div>

                    <div className="mt-1 text-[9px] text-slate-400">
                      Source identifier only
                    </div>

                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

                    <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                      BMG STANDARD IDENTITY
                    </div>

                    <div className="mt-2 break-all font-mono text-sm font-black text-emerald-700">
                      {getBmgIdentity(
                        bestMatch
                      ) ||
                        "BMG identity pending"}
                    </div>

                    <div className="mt-1 text-[9px] text-emerald-600">
                      Company-neutral identity
                    </div>

                  </div>

                </div>

                {bestMatch.reason ||
                  bestMatch.match_reason ? (
                  <div className="px-5 pb-4 lg:px-6">

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">

                        MATCH REASON

                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-600">

                        {bestMatch.reason ||
                          bestMatch.match_reason}

                      </div>

                    </div>

                  </div>
                ) : null}

                <div className="px-5 pb-5 lg:px-6 lg:pb-6">

                  <div className="mb-2 flex items-center justify-between">

                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Technical compatibility
                    </span>

                    <span className="font-mono text-xs font-black text-emerald-600">
                      {getMatchPercent(
                        bestMatch
                      )}
                      %
                    </span>

                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">

                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{
                        width: `${getMatchPercent(
                          bestMatch
                        )}%`,
                      }}
                    />

                  </div>

                </div>

              </motion.div>

            </section>
          )}

        {/* ===================================================
            ALL TECHNICAL MATCHES
        =================================================== */}

        {results &&
          rankedMatches.length >
            0 && (
            <section className="space-y-4">

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">

                <div>

                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                    CROSS-CPSE RESULTS
                  </div>

                  <h2 className="text-2xl font-black tracking-tight text-slate-900">
                    TECHNICAL MATCHES
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Ranked by technical compatibility,
                    independent of company.
                  </p>

                </div>

                <div className="flex items-center gap-2">

                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">
                    ≥ {TECHNICAL_MATCH_THRESHOLD}% MATCH
                  </span>

                </div>

              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                {rankedMatches.map(
                  (
                    result,
                    index
                  ) => {
                    const percent =
                      getMatchPercent(
                        result
                      );

                    const criticalConflict =
                      hasCriticalConflict(
                        result
                      );

                    const qualifying =
                      isTechnicalMatch(
                        result
                      );

                    return (
                      <motion.div
                        key={`${result.material_id}-${index}`}
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
                            0.035,
                        }}
                        className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          qualifying
                            ? "border-emerald-200"
                            : criticalConflict
                              ? "border-red-200"
                              : "border-slate-200"
                        }`}
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div className="flex min-w-0 items-center gap-3">

                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white">

                              #
                              {index + 1}

                            </div>

                            <div className="min-w-0">

                              <div className="text-sm font-black text-slate-900">

                                {normalizeCompany(
                                  result.company
                                )}

                              </div>

                              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                SOURCE CPSE
                              </div>

                            </div>

                          </div>

                          {qualifying ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                          ) : criticalConflict ? (
                            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                          ) : (
                            <XCircle className="h-5 w-5 shrink-0 text-slate-300" />
                          )}

                        </div>

                        <div className="mt-5">

                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            TECHNICAL MATCH
                          </div>

                          <div className="mt-1 flex items-end justify-between gap-3">

                            <div
                              className={`font-mono text-3xl font-black ${
                                qualifying
                                  ? "text-emerald-600"
                                  : criticalConflict
                                    ? "text-red-600"
                                    : "text-slate-500"
                              }`}
                            >
                              {percent}%
                            </div>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${recommendationClasses(
                                result.recommendation,
                                percent,
                                criticalConflict
                              )}`}
                            >
                              {recommendationLabel(
                                result.recommendation,
                                percent,
                                criticalConflict
                              )}
                            </span>

                          </div>

                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">

                          <div
                            className={`h-full rounded-full transition-all ${
                              qualifying
                                ? "bg-emerald-500"
                                : criticalConflict
                                  ? "bg-red-400"
                                  : "bg-slate-300"
                            }`}
                            style={{
                              width: `${percent}%`,
                            }}
                          />

                        </div>

                        <div className="mt-5 rounded-xl bg-slate-50 p-4">

                          <div className="font-mono text-[10px] font-black uppercase tracking-wider text-slate-400">
                            PART
                          </div>

                          <div className="mt-1 text-sm font-bold leading-5 text-slate-900">
                            {result.description ||
                              getBmgName(
                                result
                              ) ||
                              "Technical material"}
                          </div>

                          {result.category && (
                            <div className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              {result.category}
                            </div>
                          )}

                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">

                          <div className="rounded-xl border border-slate-200 bg-white p-3">

                            <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                              SOURCE CODE
                            </div>

                            <div className="mt-1 break-all font-mono text-[10px] font-bold text-slate-700">
                              {result.material_number ||
                                "—"}
                            </div>

                          </div>

                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">

                            <div className="text-[8px] font-black uppercase tracking-wider text-emerald-600">
                              BMG IDENTITY
                            </div>

                            <div className="mt-1 break-all font-mono text-[10px] font-bold text-emerald-700">
                              {getBmgIdentity(
                                result
                              ) ||
                                "Pending"}
                            </div>

                          </div>

                        </div>

                        {criticalConflict && (
                          <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3">

                            <div className="text-[8px] font-black uppercase tracking-wider text-red-600">
                              CRITICAL SPECIFICATION CONFLICT
                            </div>

                            <div className="mt-1 text-[10px] leading-4 text-red-700">

                              {result.reason ||
                                result.match_reason ||
                                "Critical technical specifications are incompatible."}

                            </div>

                          </div>
                        )}

                      </motion.div>
                    );
                  }
                )}

              </div>

            </section>
          )}

        {/* ===================================================
            BELOW THRESHOLD
        =================================================== */}

        {results &&
          belowThresholdMatches.length >
            0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex items-start gap-3">

                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />

                <div>

                  <h3 className="font-black text-slate-900">
                    Lower-confidence / incompatible candidates
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-slate-500">

                    {belowThresholdMatches.length} candidate
                    {belowThresholdMatches.length !==
                    1
                      ? "s"
                      : ""}{" "}
                    did not qualify as a technical equivalent.
                    Candidates with critical specification conflicts
                    are also excluded even when their general
                    similarity is high.

                  </p>

                </div>

              </div>

            </section>
          )}

        {/* ===================================================
            COMPLETE RESULT TABLE
        =================================================== */}

        {results &&
          rankedMatches.length >
            0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 px-5 py-4">

                <div className="flex items-center gap-3">

                  <Cpu className="h-5 w-5 text-indigo-600" />

                  <div>

                    <h3 className="font-black text-slate-900">
                      Complete Technical Match Index
                    </h3>

                    <p className="text-[11px] text-slate-500">
                      All candidates ranked independently
                      of company.
                    </p>

                  </div>

                </div>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full min-w-[1100px] text-left">

                  <thead className="bg-slate-50">

                    <tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">

                      <th className="px-5 py-3">
                        Rank
                      </th>

                      <th className="px-5 py-3">
                        Match
                      </th>

                      <th className="px-5 py-3">
                        Company
                      </th>

                      <th className="px-5 py-3">
                        Source Material
                      </th>

                      <th className="px-5 py-3">
                        BMG Identity
                      </th>

                      <th className="px-5 py-3">
                        Description
                      </th>

                      <th className="px-5 py-3">
                        Decision
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {rankedMatches.map(
                      (
                        match,
                        index
                      ) => {
                        const percent =
                          getMatchPercent(
                            match
                          );

                        const criticalConflict =
                          hasCriticalConflict(
                            match
                          );

                        const qualifying =
                          isTechnicalMatch(
                            match
                          );

                        return (
                          <tr
                            key={`${match.material_id}-${index}`}
                            className="hover:bg-slate-50"
                          >

                            <td className="px-5 py-4 font-mono text-xs font-black text-slate-900">
                              #
                              {index + 1}
                            </td>

                            <td className="px-5 py-4">

                              <div
                                className={`font-mono text-sm font-black ${
                                  qualifying
                                    ? "text-emerald-600"
                                    : criticalConflict
                                      ? "text-red-600"
                                      : "text-slate-500"
                                }`}
                              >
                                {percent}%
                              </div>

                            </td>

                            <td className="px-5 py-4">

                              <span className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-black text-white">
                                {normalizeCompany(
                                  match.company
                                )}
                              </span>

                            </td>

                            <td className="px-5 py-4 font-mono text-xs font-bold text-slate-800">

                              {match.material_number ||
                                "—"}

                            </td>

                            <td className="px-5 py-4 font-mono text-xs font-bold text-emerald-700">

                              {getBmgIdentity(
                                match
                              ) ||
                                "Pending"}

                            </td>

                            <td className="max-w-md px-5 py-4 text-xs leading-5 text-slate-600">

                              {match.description ||
                                getBmgName(
                                  match
                                ) ||
                                "—"}

                            </td>

                            <td className="px-5 py-4">

                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${recommendationClasses(
                                  match.recommendation,
                                  percent,
                                  criticalConflict
                                )}`}
                              >

                                {qualifying ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : criticalConflict ? (
                                  <AlertTriangle className="h-3 w-3" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}

                                {recommendationLabel(
                                  match.recommendation,
                                  percent,
                                  criticalConflict
                                )}

                              </span>

                            </td>

                          </tr>
                        );
                      }
                    )}

                  </tbody>

                </table>

              </div>

            </section>
          )}

        {/* ===================================================
            NO MATCH
        =================================================== */}

        {results &&
          rankedMatches.length ===
            0 && (
            <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">

                <Search className="h-8 w-8 text-slate-400" />

              </div>

              <h3 className="mt-5 text-xl font-black text-slate-900">
                No technical candidates found
              </h3>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">

                The technical matcher did not return a
                candidate for this query.

              </p>

            </section>
          )}

        {/* ===================================================
            EMPTY STATE
        =================================================== */}

        {!results &&
          !isSearching && (
            <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">

                <Sparkles className="h-8 w-8 text-emerald-600" />

              </div>

              <h3 className="mt-5 text-xl font-black text-slate-900">
                Ready for technical harmonization
              </h3>

              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">

                Search for a part name, engineering description,
                technical specification, or BMG identity. The
                matcher automatically compares it against
                materials from all participating CPSEs.

              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2">

                {[
                  "Gate Valve",
                  "SS304 Bearing",
                  "Steam Trap",
                  "15NB Valve",
                  "BMG-VLV-001",
                ].map(
                  (example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setSearchInput(
                          example
                        );

                        setSelectedMaterialId(
                          null
                        );

                        setSuggestionsOpen(
                          false
                        );

                        setTimeout(
                          () =>
                            void runSearch(),
                          0
                        );
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      {example}
                    </button>
                  )
                )}

              </div>

            </section>
          )}

      </div>
    </div>
  );
}