"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileText,
  Package,
  ShieldCheck,
  Clock3,
  Search,
  Eye,
  Loader2,
  X,
  Mail,
  Building2,
  Hash,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { supabase } from "../../../lib/supabase";

/* =========================================================
   TYPES
========================================================= */

type AdminTab =
  | "approvals"
  | "datasheets"
  | "products";

type CompanyRecord = {
  company_id: number;
  company_name: string;
};

type ApprovalRecord = {
  id: string;
  company_name: string | null;
  company_material_id: number | null;
  part_name: string | null;
  company_material_code: string | null;
  ai_standard_code: string | null;
  ai_confidence: number | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  email_status: string;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
  updated_at: string;
};

type DatasheetRecord = {
  datasheet_id: number;
  company_id: number | null;
  company_name: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  extraction_status: string | null;
  created_at: string | null;
};

type ProductRecord = {
  material_id: number;
  company_id: number | null;
  company_name: string;
  datasheet_id: number | null;
  company_material_code: string | null;
  material_name: string | null;
  description: string | null;

  material_family: string | null;
  pressure_rating: string | null;
  temperature_rating: string | null;
  manufacturer: string | null;
  model: string | null;

  standards: unknown;
  dimensions: unknown;
  design_features: unknown;
  other_attributes: unknown;

  created_at: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString();
}

function formatConfidence(
  value: number | null
) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return "—";
  }

  return `${Number(value).toFixed(2)}%`;
}

function prettyStatus(
  value: string
) {
  return String(value || "")
    .replace(
      /_/g,
      " "
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function statusClass(
  status: string
) {
  switch (status) {
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "APPROVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function emailStatusClass(
  status: string
) {
  switch (status) {
    case "SENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "FAILED":
      return "border-red-200 bg-red-50 text-red-700";

    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";

    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function stringifyValue(
  value: unknown
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value,
      null,
      2
    );
  } catch {
    return String(value);
  }
}

/* =========================================================
   MAIN
========================================================= */

export default function AdminView() {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<AdminTab>(
      "approvals"
    );

  const [
    companies,
    setCompanies,
  ] =
    useState<CompanyRecord[]>(
      []
    );

  const [
    approvals,
    setApprovals,
  ] =
    useState<ApprovalRecord[]>(
      []
    );

  const [
    datasheets,
    setDatasheets,
  ] =
    useState<DatasheetRecord[]>(
      []
    );

  const [
    products,
    setProducts,
  ] =
    useState<ProductRecord[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    searchText,
    setSearchText,
  ] =
    useState("");

  const [
    showRejected,
    setShowRejected,
  ] =
    useState(false);

  const [
    processingId,
    setProcessingId,
  ] =
    useState<string | null>(
      null
    );

  const [
    expandedApprovalId,
    setExpandedApprovalId,
  ] =
    useState<string | null>(
      null
    );

  const [
    selectedProduct,
    setSelectedProduct,
  ] =
    useState<
      ProductRecord | null
    >(null);

  const [
    selectedDatasheet,
    setSelectedDatasheet,
  ] =
    useState<
      DatasheetRecord | null
    >(null);

  /* =========================================================
     LOAD ADMIN DATA
  ========================================================= */

  const loadAdminData =
    useCallback(
      async (
        showRefresh = false
      ) => {
        try {
          if (
            showRefresh
          ) {
            setRefreshing(
              true
            );
          }

          setErrorMessage("");
          setLoading(true);

          /* ---------------------------------------------
             1. LOAD COMPANIES
          --------------------------------------------- */

          const {
            data:
              companyRows,
            error:
              companyError,
          } =
            await supabase
              .from(
                "companies"
              )
              .select(
                "company_id, company_name"
              )
              .order(
                "company_name",
                {
                  ascending: true,
                }
              );

          if (
            companyError
          ) {
            throw new Error(
              `Failed to load companies: ${companyError.message}`
            );
          }

          const companyList =
            (
              companyRows ||
              []
            ).map(
              (
                row: any
              ) => ({
                company_id:
                  Number(
                    row.company_id
                  ),
                company_name:
                  String(
                    row.company_name ||
                      "Unknown Company"
                  ),
              })
            );

          setCompanies(
            companyList
          );

          const companyMap =
            new Map<
              number,
              string
            >();

          companyList.forEach(
            (
              company
            ) => {
              companyMap.set(
                company.company_id,
                company.company_name
              );
            }
          );

          /* ---------------------------------------------
             2. LOAD AI APPROVALS
             
             company_name is already stored directly
             in ai_code_approvals.
          --------------------------------------------- */

          const {
            data:
              approvalRows,
            error:
              approvalError,
          } =
            await supabase
              .from(
                "ai_code_approvals"
              )
              .select(
                `
                id,
                company_name,
                company_material_id,
                part_name,
                company_material_code,
                ai_standard_code,
                ai_confidence,
                approval_status,
                approved_by,
                approved_at,
                rejected_by,
                rejected_at,
                rejection_reason,
                email_status,
                email_sent_at,
                email_error,
                created_at,
                updated_at
                `
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              );

          if (
            approvalError
          ) {
            throw new Error(
              `Failed to load AI approvals: ${approvalError.message}`
            );
          }

          setApprovals(
            (
              approvalRows ||
              []
            ) as ApprovalRecord[]
          );

          /* ---------------------------------------------
             3. LOAD DATASHEETS
             
             We DO NOT use:
             companies(...)
             
             We manually map company_id.
          --------------------------------------------- */

          const {
            data:
              datasheetRows,
            error:
              datasheetError,
          } =
            await supabase
              .from(
                "datasheets"
              )
              .select(
                `
                datasheet_id,
                company_id,
                file_name,
                file_path,
                file_type,
                extraction_status,
                created_at
                `
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              );

          if (
            datasheetError
          ) {
            throw new Error(
              `Failed to load datasheets: ${datasheetError.message}`
            );
          }

          const normalizedDatasheets =
            (
              datasheetRows ||
              []
            ).map(
              (
                row: any
              ) => {
                const companyId =
                  row.company_id !==
                    null &&
                  row.company_id !==
                    undefined
                    ? Number(
                        row.company_id
                      )
                    : null;

                return {
                  datasheet_id:
                    Number(
                      row.datasheet_id
                    ),

                  company_id:
                    companyId,

                  company_name:
                    companyId !==
                      null &&
                    companyMap.has(
                      companyId
                    )
                      ? companyMap.get(
                          companyId
                        )!
                      : `Company ID ${companyId ?? "—"}`,

                  file_name:
                    row.file_name ||
                    null,

                  file_path:
                    row.file_path ||
                    null,

                  file_type:
                    row.file_type ||
                    null,

                  extraction_status:
                    row.extraction_status ||
                    null,

                  created_at:
                    row.created_at ||
                    null,
                };
              }
            );

          setDatasheets(
            normalizedDatasheets
          );

          /* ---------------------------------------------
             4. LOAD COMPANY MATERIALS
          --------------------------------------------- */

          const {
            data:
              materialRows,
            error:
              materialError,
          } =
            await supabase
              .from(
                "company_materials"
              )
              .select(
                `
                material_id,
                company_id,
                datasheet_id,
                company_material_code,
                material_name,
                description,
                created_at
                `
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              )
              .limit(
                5000
              );

          if (
            materialError
          ) {
            throw new Error(
              `Failed to load company materials: ${materialError.message}`
            );
          }

          /* ---------------------------------------------
             5. LOAD MATERIAL ATTRIBUTES
          --------------------------------------------- */

          const materialIds =
            (
              materialRows ||
              []
            )
              .map(
                (
                  row: any
                ) =>
                  Number(
                    row.material_id
                  )
              )
              .filter(
                (
                  id: number
                ) =>
                  Number.isInteger(
                    id
                  ) &&
                  id > 0
              );

          let attributeRows:
            any[] =
            [];

          if (
            materialIds.length >
            0
          ) {
            const {
              data,
              error,
            } =
              await supabase
                .from(
                  "material_attributes"
                )
                .select(
                  `
                  material_id,
                  material_family,
                  pressure_rating,
                  temperature_rating,
                  manufacturer,
                  model,
                  standards,
                  dimensions,
                  design_features,
                  other_attributes
                  `
                )
                .in(
                  "material_id",
                  materialIds
                );

            if (
              error
            ) {
              console.error(
                "Material attributes error:",
                error
              );

              /*
               * Keep the products visible even when
               * technical attributes are unavailable.
               */
            } else {
              attributeRows =
                data ||
                [];
            }
          }

          const attributeMap =
            new Map<
              number,
              any
            >();

          attributeRows.forEach(
            (
              row: any
            ) => {
              attributeMap.set(
                Number(
                  row.material_id
                ),
                row
              );
            }
          );

          /* ---------------------------------------------
             6. BUILD PRODUCT RECORDS
          --------------------------------------------- */

          const normalizedProducts =
            (
              materialRows ||
              []
            ).map(
              (
                row: any
              ) => {
                const materialId =
                  Number(
                    row.material_id
                  );

                const companyId =
                  row.company_id !==
                    null &&
                  row.company_id !==
                    undefined
                    ? Number(
                        row.company_id
                      )
                    : null;

                const attributes =
                  attributeMap.get(
                    materialId
                  ) || {};

                return {
                  material_id:
                    materialId,

                  company_id:
                    companyId,

                  company_name:
                    companyId !==
                      null &&
                    companyMap.has(
                      companyId
                    )
                      ? companyMap.get(
                          companyId
                        )!
                      : `Company ID ${companyId ?? "—"}`,

                  datasheet_id:
                    row.datasheet_id !==
                      null &&
                    row.datasheet_id !==
                      undefined
                      ? Number(
                          row.datasheet_id
                        )
                      : null,

                  company_material_code:
                    row.company_material_code ||
                    null,

                  material_name:
                    row.material_name ||
                    null,

                  description:
                    row.description ||
                    null,

                  material_family:
                    attributes.material_family ||
                    null,

                  pressure_rating:
                    attributes.pressure_rating ||
                    null,

                  temperature_rating:
                    attributes.temperature_rating ||
                    null,

                  manufacturer:
                    attributes.manufacturer ||
                    null,

                  model:
                    attributes.model ||
                    null,

                  standards:
                    attributes.standards ||
                    null,

                  dimensions:
                    attributes.dimensions ||
                    null,

                  design_features:
                    attributes.design_features ||
                    null,

                  other_attributes:
                    attributes.other_attributes ||
                    null,

                  created_at:
                    row.created_at ||
                    null,
                };
              }
            );

          setProducts(
            normalizedProducts
          );
        } catch (
          error
        ) {
          console.error(
            "Admin loading error:",
            error
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load administration data."
          );
        } finally {
          setLoading(false);

          if (
            showRefresh
          ) {
            setRefreshing(
              false
            );
          }
        }
      },
      []
    );

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    void loadAdminData();
  }, [
    loadAdminData,
  ]);

  /* =========================================================
     FILTER APPROVALS
  ========================================================= */

  const filteredApprovals =
    useMemo(() => {
      const query =
        searchText
          .trim()
          .toLowerCase();

      return approvals.filter(
        (
          approval
        ) => {
          if (
            !showRejected &&
            approval.approval_status ===
              "REJECTED"
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          return [
            approval.company_name,
            approval.part_name,
            approval.company_material_code,
            approval.ai_standard_code,
            approval.approval_status,
          ]
            .filter(
              Boolean
            )
            .some(
              (
                value
              ) =>
                String(
                  value
                )
                  .toLowerCase()
                  .includes(
                    query
                  )
            );
        }
      );
    }, [
      approvals,
      searchText,
      showRejected,
    ]);

  /* =========================================================
     FILTER DATASHEETS
  ========================================================= */

  const filteredDatasheets =
    useMemo(() => {
      const query =
        searchText
          .trim()
          .toLowerCase();

      if (!query) {
        return datasheets;
      }

      return datasheets.filter(
        (
          datasheet
        ) =>
          [
            datasheet.company_name,
            datasheet.file_name,
            datasheet.file_type,
            datasheet.extraction_status,
          ]
            .filter(
              Boolean
            )
            .some(
              (
                value
              ) =>
                String(
                  value
                )
                  .toLowerCase()
                  .includes(
                    query
                  )
            )
      );
    }, [
      datasheets,
      searchText,
    ]);

  /* =========================================================
     FILTER PRODUCTS
  ========================================================= */

  const filteredProducts =
    useMemo(() => {
      const query =
        searchText
          .trim()
          .toLowerCase();

      if (!query) {
        return products;
      }

      return products.filter(
        (
          product
        ) =>
          [
            product.company_name,
            product.material_name,
            product.company_material_code,
            product.description,
            product.material_family,
            product.manufacturer,
            product.model,
          ]
            .filter(
              Boolean
            )
            .some(
              (
                value
              ) =>
                String(
                  value
                )
                  .toLowerCase()
                  .includes(
                    query
                  )
            )
      );
    }, [
      products,
      searchText,
    ]);

  /* =========================================================
     COUNTS
  ========================================================= */

  const pendingCount =
    approvals.filter(
      (
        approval
      ) =>
        approval.approval_status ===
        "PENDING"
    ).length;

  const approvedCount =
    approvals.filter(
      (
        approval
      ) =>
        approval.approval_status ===
        "APPROVED"
    ).length;

  /* =========================================================
     APPROVE
  ========================================================= */

  const handleApprove =
    async (
      approval: ApprovalRecord
    ) => {
      if (
        approval.approval_status !==
        "PENDING"
      ) {
        return;
      }

      setProcessingId(
        approval.id
      );

      setErrorMessage("");

      try {
        const {
          data:
            userData,
        } =
          await supabase.auth.getUser();

        const userId =
          userData.user?.id;

        if (!userId) {
          throw new Error(
            "Administrator session not found."
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "ai_code_approvals"
            )
            .update({
              approval_status:
                "APPROVED",

              approved_by:
                userId,

              approved_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              approval.id
            )
            .eq(
              "approval_status",
              "PENDING"
            );

        if (error) {
          throw error;
        }

        /*
         * Email endpoint.
         * It can be added/finished separately.
         */

        try {
          await fetch(
            "/api/admin/code-approval-email",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  approvalId:
                    approval.id,
                }),
            }
          );
        } catch (
          emailError
        ) {
          console.error(
            "Email notification error:",
            emailError
          );
        }

        await loadAdminData();
      } catch (
        error
      ) {
        console.error(
          "Approval error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to approve AI code."
        );
      } finally {
        setProcessingId(
          null
        );
      }
    };

  /* =========================================================
     REJECT
  ========================================================= */

  const handleReject =
    async (
      approval: ApprovalRecord
    ) => {
      if (
        approval.approval_status !==
        "PENDING"
      ) {
        return;
      }

      const reason =
        window.prompt(
          "Enter the reason for rejecting this AI code assignment:"
        );

      if (
        reason ===
        null
      ) {
        return;
      }

      if (
        !reason.trim()
      ) {
        window.alert(
          "A rejection reason is required."
        );

        return;
      }

      setProcessingId(
        approval.id
      );

      setErrorMessage("");

      try {
        const {
          data:
            userData,
        } =
          await supabase.auth.getUser();

        const userId =
          userData.user?.id;

        if (!userId) {
          throw new Error(
            "Administrator session not found."
          );
        }

        const {
          error,
        } =
          await supabase
            .from(
              "ai_code_approvals"
            )
            .update({
              approval_status:
                "REJECTED",

              rejected_by:
                userId,

              rejected_at:
                new Date().toISOString(),

              rejection_reason:
                reason.trim(),

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              approval.id
            )
            .eq(
              "approval_status",
              "PENDING"
            );

        if (error) {
          throw error;
        }

        await loadAdminData();
      } catch (
        error
      ) {
        console.error(
          "Reject error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to reject AI code."
        );
      } finally {
        setProcessingId(
          null
        );
      }
    };

  /* =========================================================
     DELETE DATASHEET
  ========================================================= */

  const handleDeleteDatasheet =
    async (
      datasheet: DatasheetRecord
    ) => {
      const confirmed =
        window.confirm(
          `Remove this datasheet?\n\nCompany: ${datasheet.company_name}\nFile: ${datasheet.file_name || "Unnamed file"}`
        );

      if (!confirmed) {
        return;
      }

      const id =
        `datasheet-${datasheet.datasheet_id}`;

      setProcessingId(id);

      setErrorMessage("");

      try {
        const response =
          await fetch(
            "/api/admin/datasheet",
            {
              method:
                "DELETE",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  datasheetId:
                    datasheet.datasheet_id,
                }),
            }
          );

        const result =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Failed to remove datasheet."
          );
        }

        await loadAdminData();
      } catch (
        error
      ) {
        console.error(
          "Datasheet deletion error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to remove datasheet."
        );
      } finally {
        setProcessingId(
          null
        );
      }
    };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">

      <div className="mx-auto max-w-[1600px] space-y-6">

        {/* ===================================================
            HEADER
        =================================================== */}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#002244] via-[#003d73] to-[#0f172a] text-white shadow-sm">

          <div className="px-6 py-7 lg:px-8">

            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">

              <div>

                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">

                  <ShieldCheck className="h-3.5 w-3.5" />

                  Government Administration

                </div>

                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Material Governance
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Review AI-assigned BMG material codes,
                  inspect datasheets and manage material records.
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  void loadAdminData(
                    true
                  )
                }
                disabled={
                  refreshing
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
              >

                <RefreshCw
                  className={
                    refreshing
                      ? "h-4 w-4 animate-spin"
                      : "h-4 w-4"
                  }
                />

                Refresh Data

              </button>

            </div>

          </div>

          {/* =================================================
              STATS
          ================================================= */}

          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">

            <div className="border-r border-white/10 px-5 py-4">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Pending AI Codes
              </div>

              <div className="mt-1 flex items-center gap-2 text-2xl font-black text-amber-300">

                <Clock3 className="h-5 w-5" />

                {pendingCount}

              </div>

            </div>

            <div className="border-b border-white/10 px-5 py-4 sm:border-b-0 sm:border-r">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Approved
              </div>

              <div className="mt-1 flex items-center gap-2 text-2xl font-black text-emerald-300">

                <CheckCircle2 className="h-5 w-5" />

                {approvedCount}

              </div>

            </div>

            <div className="border-r border-white/10 px-5 py-4">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Datasheets
              </div>

              <div className="mt-1 flex items-center gap-2 text-2xl font-black text-white">

                <FileText className="h-5 w-5" />

                {datasheets.length}

              </div>

            </div>

            <div className="px-5 py-4">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Products
              </div>

              <div className="mt-1 flex items-center gap-2 text-2xl font-black text-white">

                <Package className="h-5 w-5" />

                {products.length}

              </div>

            </div>

          </div>

        </section>

        {/* ===================================================
            ERROR
        =================================================== */}

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">

            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

            <div className="min-w-0">

              <div className="font-bold">
                Administration data error
              </div>

              <div className="mt-1">
                {errorMessage}
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
              className="ml-auto rounded-lg p-1 hover:bg-red-100"
            >
              <X className="h-4 w-4" />
            </button>

          </div>
        )}

        {/* ===================================================
            TABS
        =================================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">

          <div className="grid gap-2 md:grid-cols-3">

            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "approvals"
                )
              }
              className={`rounded-xl px-4 py-4 text-left transition ${
                activeTab ===
                "approvals"
                  ? "bg-[#002244] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >

              <div className="flex items-center gap-3">

                <div className="rounded-lg bg-amber-50 p-2">

                  <ShieldCheck className="h-5 w-5 text-amber-600" />

                </div>

                <div>

                  <div className="text-sm font-black">
                    AI Code Approval
                  </div>

                  <div className="text-[10px] opacity-70">
                    {pendingCount} pending
                  </div>

                </div>

              </div>

            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "datasheets"
                )
              }
              className={`rounded-xl px-4 py-4 text-left transition ${
                activeTab ===
                "datasheets"
                  ? "bg-[#002244] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >

              <div className="flex items-center gap-3">

                <div className="rounded-lg bg-blue-50 p-2">

                  <FileText className="h-5 w-5 text-blue-600" />

                </div>

                <div>

                  <div className="text-sm font-black">
                    All Datasheets
                  </div>

                  <div className="text-[10px] opacity-70">
                    {datasheets.length} records
                  </div>

                </div>

              </div>

            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "products"
                )
              }
              className={`rounded-xl px-4 py-4 text-left transition ${
                activeTab ===
                "products"
                  ? "bg-[#002244] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >

              <div className="flex items-center gap-3">

                <div className="rounded-lg bg-emerald-50 p-2">

                  <Package className="h-5 w-5 text-emerald-600" />

                </div>

                <div>

                  <div className="text-sm font-black">
                    Product / Material Details
                  </div>

                  <div className="text-[10px] opacity-70">
                    {products.length} records
                  </div>

                </div>

              </div>

            </button>

          </div>

        </div>

        {/* ===================================================
            SEARCH
        =================================================== */}

        <div className="flex flex-col gap-3 md:flex-row md:items-center">

          <div className="relative flex-1">

            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={
                searchText
              }
              onChange={(
                event
              ) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder={
                activeTab ===
                "approvals"
                  ? "Search company, part, company code or AI code..."
                  : activeTab ===
                      "datasheets"
                    ? "Search company or datasheet..."
                    : "Search company, material or description..."
              }
              className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none shadow-sm focus:border-[#003d73] focus:ring-2 focus:ring-[#003d73]/10"
            />

          </div>

          {activeTab ===
            "approvals" && (
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">

              <input
                type="checkbox"
                checked={
                  showRejected
                }
                onChange={(
                  event
                ) =>
                  setShowRejected(
                    event.target.checked
                  )
                }
                className="h-4 w-4"
              />

              Show rejected

            </label>
          )}

        </div>

        {/* ===================================================
            AI CODE APPROVAL
        =================================================== */}

        {activeTab ===
          "approvals" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-5 py-4">

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                    AI GOVERNANCE QUEUE
                  </div>

                  <h2 className="mt-1 text-xl font-black text-slate-900">
                    AI Code Approval
                  </h2>

                </div>

                <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase text-amber-700">
                  {pendingCount} pending
                </div>

              </div>

            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500">

                <Loader2 className="h-5 w-5 animate-spin" />

                Loading...

              </div>
            ) : filteredApprovals.length ===
              0 ? (
              <div className="p-12 text-center">

                <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />

                <h3 className="mt-4 font-black text-slate-700">
                  No approval records found
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  AI material mappings waiting for government review will appear here.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1250px] text-left">

                  <thead className="bg-slate-50">

                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">

                      <th className="px-5 py-3">
                        Company
                      </th>

                      <th className="px-5 py-3">
                        Part / Material
                      </th>

                      <th className="px-5 py-3">
                        Company Code
                      </th>

                      <th className="px-5 py-3">
                        AI / BMG Code
                      </th>

                      <th className="px-5 py-3">
                        Confidence
                      </th>

                      <th className="px-5 py-3">
                        Status
                      </th>

                      <th className="px-5 py-3">
                        Email
                      </th>

                      <th className="px-5 py-3 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {filteredApprovals.map(
                      (
                        approval
                      ) => (
                        <React.Fragment
                          key={
                            approval.id
                          }
                        >

                          <tr className="hover:bg-slate-50">

                            <td className="px-5 py-4">

                              <div className="flex items-center gap-3">

                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#002244] text-[10px] font-black text-white">

                                  {(
                                    approval.company_name ||
                                    "UNK"
                                  )
                                    .slice(
                                      0,
                                      3
                                    )
                                    .toUpperCase()}

                                </div>

                                <div>

                                  <div className="font-black text-slate-900">
                                    {
                                      approval.company_name ||
                                      "Unknown Company"
                                    }
                                  </div>

                                  <div className="text-[10px] text-slate-400">
                                    Material ID{" "}
                                    {
                                      approval.company_material_id ??
                                      "—"
                                    }
                                  </div>

                                </div>

                              </div>

                            </td>

                            <td className="px-5 py-4">

                              <div className="font-bold text-slate-900">
                                {
                                  approval.part_name ||
                                  "Unnamed Material"
                                }
                              </div>

                            </td>

                            <td className="px-5 py-4">

                              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-700">

                                {
                                  approval.company_material_code ||
                                  "—"
                                }

                              </span>

                            </td>

                            <td className="px-5 py-4">

                              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-mono text-xs font-black text-emerald-700">

                                {
                                  approval.ai_standard_code ||
                                  "—"
                                }

                              </span>

                            </td>

                            <td className="px-5 py-4 font-mono text-sm font-black text-slate-900">

                              {
                                formatConfidence(
                                  approval.ai_confidence
                                )
                              }

                            </td>

                            <td className="px-5 py-4">

                              <span
                                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusClass(
                                  approval.approval_status
                                )}`}
                              >
                                {
                                  prettyStatus(
                                    approval.approval_status
                                  )
                                }
                              </span>

                            </td>

                            <td className="px-5 py-4">

                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${emailStatusClass(
                                  approval.email_status
                                )}`}
                              >

                                <Mail className="h-3 w-3" />

                                {
                                  prettyStatus(
                                    approval.email_status
                                  )
                                }

                              </span>

                            </td>

                            <td className="px-5 py-4">

                              <div className="flex justify-end gap-2">

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedApprovalId(
                                      expandedApprovalId ===
                                        approval.id
                                        ? null
                                        : approval.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                                >

                                  <Eye className="h-3.5 w-3.5" />

                                  Details

                                  {expandedApprovalId ===
                                  approval.id ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}

                                </button>

                                {approval.approval_status ===
                                  "PENDING" && (
                                  <>

                                    <button
                                      type="button"
                                      disabled={
                                        processingId ===
                                        approval.id
                                      }
                                      onClick={() =>
                                        void handleApprove(
                                          approval
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >

                                      {processingId ===
                                      approval.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      )}

                                      Approve

                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        processingId ===
                                        approval.id
                                      }
                                      onClick={() =>
                                        void handleReject(
                                          approval
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                                    >

                                      <XCircle className="h-3.5 w-3.5" />

                                      Reject

                                    </button>

                                  </>
                                )}

                              </div>

                            </td>

                          </tr>

                          {expandedApprovalId ===
                            approval.id && (
                            <tr className="bg-slate-50">

                              <td
                                colSpan={
                                  8
                                }
                                className="px-5 py-5"
                              >

                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Created
                                    </div>

                                    <div className="mt-1 text-xs font-bold text-slate-800">
                                      {
                                        formatDate(
                                          approval.created_at
                                        )
                                      }
                                    </div>

                                  </div>

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Approved At
                                    </div>

                                    <div className="mt-1 text-xs font-bold text-slate-800">
                                      {
                                        formatDate(
                                          approval.approved_at
                                        )
                                      }
                                    </div>

                                  </div>

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Email Sent
                                    </div>

                                    <div className="mt-1 text-xs font-bold text-slate-800">
                                      {
                                        formatDate(
                                          approval.email_sent_at
                                        )
                                      }
                                    </div>

                                  </div>

                                  <div className="rounded-xl border border-slate-200 bg-white p-4">

                                    <div className="text-[10px] font-bold uppercase text-slate-400">
                                      Rejection Reason
                                    </div>

                                    <div className="mt-1 text-xs text-slate-700">
                                      {
                                        approval.rejection_reason ||
                                        "—"
                                      }
                                    </div>

                                  </div>

                                </div>

                              </td>

                            </tr>
                          )}

                        </React.Fragment>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </section>
        )}

        {/* ===================================================
            DATASHEETS
        =================================================== */}

        {activeTab ===
          "datasheets" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-5 py-4">

              <div className="flex items-center gap-3">

                <div className="rounded-xl bg-blue-50 p-2.5">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>

                <div>

                  <h2 className="font-black text-slate-900">
                    All Datasheets
                  </h2>

                  <p className="text-xs text-slate-500">
                    All uploaded source documents with their associated companies.
                  </p>

                </div>

              </div>

            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500">

                <Loader2 className="h-5 w-5 animate-spin" />

                Loading datasheets...

              </div>
            ) : filteredDatasheets.length ===
              0 ? (
              <div className="p-12 text-center">

                <FileText className="mx-auto h-10 w-10 text-slate-300" />

                <h3 className="mt-4 font-black text-slate-700">
                  No datasheets found
                </h3>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1000px] text-left">

                  <thead className="bg-slate-50">

                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">

                      <th className="px-5 py-3">
                        Company
                      </th>

                      <th className="px-5 py-3">
                        Datasheet
                      </th>

                      <th className="px-5 py-3">
                        Type
                      </th>

                      <th className="px-5 py-3">
                        Extraction
                      </th>

                      <th className="px-5 py-3">
                        Uploaded
                      </th>

                      <th className="px-5 py-3 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {filteredDatasheets.map(
                      (
                        datasheet
                      ) => (
                        <tr
                          key={
                            datasheet.datasheet_id
                          }
                          className="hover:bg-slate-50"
                        >

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-2">

                              <Building2 className="h-4 w-4 text-slate-400" />

                              <span className="font-black text-slate-900">
                                {
                                  datasheet.company_name
                                }
                              </span>

                            </div>

                          </td>

                          <td className="px-5 py-4">

                            <button
                              type="button"
                              onClick={() =>
                                setSelectedDatasheet(
                                  datasheet
                                )
                              }
                              className="text-left"
                            >

                              <div className="font-bold text-blue-700 hover:underline">
                                {
                                  datasheet.file_name ||
                                  "Unnamed datasheet"
                                }
                              </div>

                              <div className="mt-1 text-[10px] text-slate-400">
                                ID{" "}
                                {
                                  datasheet.datasheet_id
                                }
                              </div>

                            </button>

                          </td>

                          <td className="px-5 py-4 text-xs text-slate-600">
                            {
                              datasheet.file_type ||
                              "—"
                            }
                          </td>

                          <td className="px-5 py-4">

                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600">
                              {
                                datasheet.extraction_status ||
                                "UNKNOWN"
                              }
                            </span>

                          </td>

                          <td className="px-5 py-4 text-xs text-slate-600">
                            {
                              formatDate(
                                datasheet.created_at
                              )
                            }
                          </td>

                          <td className="px-5 py-4 text-right">

                            <button
                              type="button"
                              disabled={
                                processingId ===
                                `datasheet-${datasheet.datasheet_id}`
                              }
                              onClick={() =>
                                void handleDeleteDatasheet(
                                  datasheet
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >

                              {processingId ===
                              `datasheet-${datasheet.datasheet_id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}

                              Remove

                            </button>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </section>
        )}

        {/* ===================================================
            PRODUCTS
        =================================================== */}

        {activeTab ===
          "products" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-5 py-4">

              <div className="flex items-center gap-3">

                <div className="rounded-xl bg-emerald-50 p-2.5">
                  <Package className="h-5 w-5 text-emerald-600" />
                </div>

                <div>

                  <h2 className="font-black text-slate-900">
                    Product / Material Details
                  </h2>

                  <p className="text-xs text-slate-500">
                    Structured records from company materials.
                  </p>

                </div>

              </div>

            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500">

                <Loader2 className="h-5 w-5 animate-spin" />

                Loading products...

              </div>
            ) : filteredProducts.length ===
              0 ? (
              <div className="p-12 text-center">

                <Package className="mx-auto h-10 w-10 text-slate-300" />

                <h3 className="mt-4 font-black text-slate-700">
                  No products found
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  No records were returned from company_materials.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1250px] text-left">

                  <thead className="bg-slate-50">

                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">

                      <th className="px-5 py-3">
                        Company
                      </th>

                      <th className="px-5 py-3">
                        Material
                      </th>

                      <th className="px-5 py-3">
                        Company Code
                      </th>

                      <th className="px-5 py-3">
                        Family
                      </th>

                      <th className="px-5 py-3">
                        Manufacturer
                      </th>

                      <th className="px-5 py-3">
                        Model
                      </th>

                      <th className="px-5 py-3 text-right">
                        Details
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {filteredProducts.map(
                      (
                        product
                      ) => (
                        <tr
                          key={
                            product.material_id
                          }
                          className="hover:bg-slate-50"
                        >

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-2">

                              <Building2 className="h-4 w-4 text-slate-400" />

                              <span className="font-black text-slate-900">
                                {
                                  product.company_name
                                }
                              </span>

                            </div>

                          </td>

                          <td className="max-w-sm px-5 py-4">

                            <div className="font-bold text-slate-900">
                              {
                                product.material_name ||
                                "Unnamed Material"
                              }
                            </div>

                            <div className="mt-1 truncate text-xs text-slate-500">
                              {
                                product.description ||
                                "No description"
                              }
                            </div>

                          </td>

                          <td className="px-5 py-4">

                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-700">
                              {
                                product.company_material_code ||
                                "—"
                              }
                            </span>

                          </td>

                          <td className="px-5 py-4 text-xs font-bold text-slate-700">
                            {
                              product.material_family ||
                              "—"
                            }
                          </td>

                          <td className="px-5 py-4 text-xs text-slate-600">
                            {
                              product.manufacturer ||
                              "—"
                            }
                          </td>

                          <td className="px-5 py-4 text-xs text-slate-600">
                            {
                              product.model ||
                              "—"
                            }
                          </td>

                          <td className="px-5 py-4 text-right">

                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProduct(
                                  product
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"
                            >

                              <Eye className="h-3.5 w-3.5" />

                              View Details

                            </button>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </section>
        )}

      </div>

      {/* =====================================================
          PRODUCT MODAL
      ===================================================== */}

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">

          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">

              <div>

                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                  MATERIAL DETAILS
                </div>

                <h2 className="mt-1 text-xl font-black text-slate-900">
                  {
                    selectedProduct.material_name ||
                    "Unnamed Material"
                  }
                </h2>

                <div className="mt-1 text-xs font-bold text-slate-500">

                  {
                    selectedProduct.company_name
                  }

                  {" • "}

                  {
                    selectedProduct.company_material_code ||
                    "No company code"
                  }

                </div>

              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedProduct(
                    null
                  )
                }
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>

            </div>

            <div className="max-h-[calc(90vh-90px)] overflow-y-auto p-6">

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Description
                  </div>

                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {
                      selectedProduct.description ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Material Family
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-800">
                    {
                      selectedProduct.material_family ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Manufacturer
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-800">
                    {
                      selectedProduct.manufacturer ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Model
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-800">
                    {
                      selectedProduct.model ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Pressure Rating
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-800">
                    {
                      selectedProduct.pressure_rating ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Temperature Rating
                  </div>

                  <div className="mt-2 text-sm font-bold text-slate-800">
                    {
                      selectedProduct.temperature_rating ||
                      "—"
                    }
                  </div>

                </div>

              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">

                <div className="rounded-xl border border-slate-200 bg-white p-4">

                  <div className="mb-2 text-[10px] font-black uppercase text-slate-400">
                    Standards
                  </div>

                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                    {
                      stringifyValue(
                        selectedProduct.standards
                      )
                    }
                  </pre>

                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">

                  <div className="mb-2 text-[10px] font-black uppercase text-slate-400">
                    Dimensions
                  </div>

                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                    {
                      stringifyValue(
                        selectedProduct.dimensions
                      )
                    }
                  </pre>

                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">

                  <div className="mb-2 text-[10px] font-black uppercase text-slate-400">
                    Design Features
                  </div>

                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                    {
                      stringifyValue(
                        selectedProduct.design_features
                      )
                    }
                  </pre>

                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">

                  <div className="mb-2 text-[10px] font-black uppercase text-slate-400">
                    Other Attributes
                  </div>

                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                    {
                      stringifyValue(
                        selectedProduct.other_attributes
                      )
                    }
                  </pre>

                </div>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* =====================================================
          DATASHEET MODAL
      ===================================================== */}

      {selectedDatasheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">

          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">

              <div>

                <div className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                  DATASHEET
                </div>

                <h2 className="mt-1 text-xl font-black text-slate-900">
                  {
                    selectedDatasheet.file_name ||
                    "Unnamed Datasheet"
                  }
                </h2>

              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedDatasheet(
                    null
                  )
                }
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>

            </div>

            <div className="space-y-4 p-6">

              <div className="grid gap-4 sm:grid-cols-2">

                <div className="rounded-xl bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Company
                  </div>

                  <div className="mt-1 font-black text-slate-900">
                    {
                      selectedDatasheet.company_name
                    }
                  </div>

                </div>

                <div className="rounded-xl bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Datasheet ID
                  </div>

                  <div className="mt-1 font-mono font-black text-slate-900">
                    {
                      selectedDatasheet.datasheet_id
                    }
                  </div>

                </div>

                <div className="rounded-xl bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    File Type
                  </div>

                  <div className="mt-1 font-bold text-slate-800">
                    {
                      selectedDatasheet.file_type ||
                      "—"
                    }
                  </div>

                </div>

                <div className="rounded-xl bg-slate-50 p-4">

                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Extraction
                  </div>

                  <div className="mt-1 font-bold text-slate-800">
                    {
                      selectedDatasheet.extraction_status ||
                      "—"
                    }
                  </div>

                </div>

              </div>

              <div className="rounded-xl border border-slate-200 p-4">

                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Storage Path
                </div>

                <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-700">
                  {
                    selectedDatasheet.file_path ||
                    "—"
                  }
                </div>

              </div>

              <div className="text-right">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedDatasheet(
                      null
                    )
                  }
                  className="rounded-xl bg-[#002244] px-5 py-3 text-xs font-black text-white hover:bg-[#003d73]"
                >
                  Close
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}