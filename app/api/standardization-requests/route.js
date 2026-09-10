import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ============================================================
   HELPERS
============================================================ */

function safeText(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return String(value);
}

function numberOrZero(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeStatus(status) {
  const value = String(
    status || ""
  )
    .trim()
    .toUpperCase();

  if (
    value === "PENDING_REVIEW" ||
    value === "PENDING"
  ) {
    return "Pending";
  }

  if (
    value === "UNDER_REVIEW"
  ) {
    return "High Priority";
  }

  if (
    value === "APPROVED"
  ) {
    return "Approved";
  }

  if (
    value === "REJECTED"
  ) {
    return "Rejected";
  }

  if (
    value === "NEEDS_MORE_DATA"
  ) {
    return "Needs More Data";
  }

  return value || "Pending";
}

/* ============================================================
   GET
============================================================ */

export async function GET() {
  try {
    /* --------------------------------------------------------
       ENVIRONMENT
    -------------------------------------------------------- */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL is missing.",
        },
        {
          status: 500,
        }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /* ========================================================
       1. LOAD STANDARDIZATION REQUESTS
    ======================================================== */

    const {
      data: requestRows,
      error: requestError,
    } = await supabase
      .from(
        "standardization_requests"
      )
      .select(
        [
          "request_id",
          "ncs_id",
          "status",
          "created_by_ai",
          "reviewed_by",
          "review_date",
          "government_comments",
        ].join(",")
      )
      .order(
        "request_id",
        {
          ascending: false,
        }
      );

    if (requestError) {
      return NextResponse.json(
        {
          success: false,
          error:
            requestError.message,
        },
        {
          status: 500,
        }
      );
    }

    const requests =
      requestRows || [];

    if (requests.length === 0) {
      return NextResponse.json({
        success: true,

        summary: {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          needs_more_data: 0,
        },

        results: [],
      });
    }

    /* ========================================================
       2. NCS IDS
    ======================================================== */

    const ncsIds = [
      ...new Set(
        requests
          .map(
            (request) =>
              request.ncs_id
          )
          .filter(Boolean)
      ),
    ];

    /* ========================================================
       3. LOAD NCS RECORDS
    ======================================================== */

    let ncsRows = [];

    if (ncsIds.length > 0) {
      const chunkSize = 500;

      for (
        let start = 0;
        start < ncsIds.length;
        start += chunkSize
      ) {
        const chunk =
          ncsIds.slice(
            start,
            start + chunkSize
          );

        const {
          data,
          error,
        } = await supabase
          .from(
            "ncs_materials"
          )
          .select(
            [
              "ncs_id",
              "ncs_code",
              "ncs_name",
              "category",
              "subcategory",
              "standard_specification",
              "status",
            ].join(",")
          )
          .in(
            "ncs_id",
            chunk
          );

        if (error) {
          return NextResponse.json(
            {
              success: false,
              error:
                error.message,
            },
            {
              status: 500,
            }
          );
        }

        ncsRows.push(
          ...(data || [])
        );
      }
    }

    const ncsMap =
      new Map();

    ncsRows.forEach(
      (row) => {
        ncsMap.set(
          String(row.ncs_id),
          row
        );
      }
    );

    /* ========================================================
       4. LOAD NCS MAPPINGS
    ======================================================== */

    const mappingsByNcs =
      new Map();

    const allMappingRows = [];

    if (ncsIds.length > 0) {
      const chunkSize = 500;

      for (
        let start = 0;
        start < ncsIds.length;
        start += chunkSize
      ) {
        const chunk =
          ncsIds.slice(
            start,
            start + chunkSize
          );

        const {
          data,
          error,
        } = await supabase
          .from(
            "material_ncs_mapping"
          )
          .select(
            [
              "material_id",
              "ncs_id",
              "ai_confidence",
              "ai_reason",
              "match_status",
              "verified",
            ].join(",")
          )
          .in(
            "ncs_id",
            chunk
          );

        if (error) {
          return NextResponse.json(
            {
              success: false,
              error:
                error.message,
            },
            {
              status: 500,
            }
          );
        }

        allMappingRows.push(
          ...(data || [])
        );
      }
    }

    allMappingRows.forEach(
      (mapping) => {
        const key =
          String(
            mapping.ncs_id
          );

        if (
          !mappingsByNcs.has(
            key
          )
        ) {
          mappingsByNcs.set(
            key,
            []
          );
        }

        mappingsByNcs
          .get(key)
          .push(mapping);
      }
    );

    /* ========================================================
       5. LOAD MATERIAL RECORDS
    ======================================================== */

    const materialIds = [
      ...new Set(
        allMappingRows
          .map(
            (mapping) =>
              mapping.material_id
          )
          .filter(Boolean)
      ),
    ];

    let materialRows = [];

    if (materialIds.length > 0) {
      const chunkSize = 500;

      for (
        let start = 0;
        start < materialIds.length;
        start += chunkSize
      ) {
        const chunk =
          materialIds.slice(
            start,
            start + chunkSize
          );

        const {
          data,
          error,
        } = await supabase
          .from("materials")
          .select(
            [
              "id",
              "company",
              "company_id",
              "material_number",
              "description",
              "specifications",
              "category",
            ].join(",")
          )
          .in(
            "id",
            chunk
          );

        if (error) {
          return NextResponse.json(
            {
              success: false,
              error:
                error.message,
            },
            {
              status: 500,
            }
          );
        }

        materialRows.push(
          ...(data || [])
        );
      }
    }

    const materialMap =
      new Map();

    materialRows.forEach(
      (material) => {
        materialMap.set(
          String(material.id),
          material
        );
      }
    );

    /* ========================================================
       6. BUILD REVIEW ITEMS
    ======================================================== */

    const results =
      requests.map(
        (request) => {
          const ncs =
            ncsMap.get(
              String(
                request.ncs_id
              )
            ) || null;

          const mappings =
            mappingsByNcs.get(
              String(
                request.ncs_id
              )
            ) || [];

          const materialMappings =
            mappings.map(
              (mapping) => {
                const material =
                  materialMap.get(
                    String(
                      mapping.material_id
                    )
                  );

                if (!material) {
                  return null;
                }

                return {
                  material_id:
                    material.id,

                  company:
                    material.company ||
                    "Unknown Company",

                  company_id:
                    material.company_id ||
                    null,

                  material_number:
                    material.material_number ||
                    null,

                  description:
                    material.description ||
                    null,

                  specifications:
                    material.specifications ||
                    null,

                  category:
                    material.category ||
                    null,

                  ai_confidence:
                    numberOrZero(
                      mapping.ai_confidence
                    ),

                  ai_reason:
                    mapping.ai_reason ||
                    null,

                  match_status:
                    mapping.match_status ||
                    "AI_PROPOSED",

                  verified:
                    mapping.verified ===
                    true,
                };
              }
            )
            .filter(Boolean);

          /*
           * Highest confidence mapping is useful
           * for displaying the proposal priority.
           */
          const confidenceValues =
            materialMappings
              .map(
                (mapping) =>
                  mapping.ai_confidence
              )
              .filter(
                (value) =>
                  Number.isFinite(
                    value
                  )
              );

          const highestConfidence =
            confidenceValues.length
              ? Math.max(
                  ...confidenceValues
                )
              : 0;

          const companies = [
            ...new Set(
              materialMappings
                .map(
                  (mapping) =>
                    String(
                      mapping.company
                    )
                      .trim()
                      .toUpperCase()
                )
                .filter(Boolean)
            ),
          ];

          let priority =
            "Medium";

          if (
            highestConfidence >=
            95
          ) {
            priority = "High";
          }

          if (
            highestConfidence >=
            98
          ) {
            priority = "Critical";
          }

          /*
           * Build differences from the AI reasons
           * without inventing engineering data.
           */
          const differenceAnalysis =
            materialMappings
              .map(
                (mapping) =>
                  mapping.ai_reason
              )
              .filter(Boolean);

          return {
            request_id:
              request.request_id,

            ncs_id:
              request.ncs_id,

            ncs_code:
              ncs?.ncs_code ||
              null,

            ncs_name:
              ncs?.ncs_name ||
              null,

            ncs_category:
              ncs?.category ||
              null,

            ncs_specification:
              ncs?.standard_specification ||
              null,

            ncs_status:
              ncs?.status ||
              "PROPOSED",

            status:
              normalizeStatus(
                request.status
              ),

            database_status:
              request.status ||
              null,

            priority,

            highest_confidence:
              highestConfidence,

            created_by_ai:
              request.created_by_ai ===
              true,

            reviewed_by:
              request.reviewed_by ||
              null,

            review_date:
              request.review_date ||
              null,

            government_comments:
              request.government_comments ||
              null,

            companies,

            mappings:
              materialMappings,

            difference_analysis:
              differenceAnalysis,

            submitted_at:
              request.request_id
                ? String(
                    request.request_id
                  )
                : "Pending",
          };
        }
      );

    /* ========================================================
       7. SUMMARY
    ======================================================== */

    const pending =
      results.filter(
        (item) =>
          item.status ===
            "Pending" ||
          item.status ===
            "High Priority"
      ).length;

    const approved =
      results.filter(
        (item) =>
          item.status ===
          "Approved"
      ).length;

    const rejected =
      results.filter(
        (item) =>
          item.status ===
          "Rejected"
      ).length;

    const needsMoreData =
      results.filter(
        (item) =>
          item.status ===
          "Needs More Data"
      ).length;

    /* ========================================================
       8. RESPONSE
    ======================================================== */

    return NextResponse.json({
      success: true,

      summary: {
        total:
          results.length,

        pending,

        approved,

        rejected,

        needs_more_data:
          needsMoreData,
      },

      results,
    });
  } catch (error) {
    console.error(
      "Standardization requests API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}