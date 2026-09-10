import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(url, key);
}

async function countTable(
  supabase,
  table,
  column = "id"
) {
  const {
    count,
    error,
  } = await supabase
    .from(table)
    .select(column, {
      count: "exact",
      head: true,
    });

  if (error) {
    throw new Error(
      `Failed to count ${table}: ${error.message}`
    );
  }

  return count || 0;
}

async function countByStatus(
  supabase,
  table,
  statusColumn,
  statuses
) {
  const result = {};

  for (const status of statuses) {
    const {
      count,
      error,
    } = await supabase
      .from(table)
      .select(statusColumn, {
        count: "exact",
        head: true,
      })
      .eq(
        statusColumn,
        status
      );

    if (error) {
      throw new Error(
        `Failed to count ${table}.${statusColumn}=${status}: ${error.message}`
      );
    }

    result[status] = count || 0;
  }

  return result;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    /* ========================================================
       CORE MATERIAL COUNTS
    ======================================================== */

    const totalMaterials =
      await countTable(
        supabase,
        "materials",
        "id"
      );

    /* ========================================================
       EMBEDDING COVERAGE
    ======================================================== */

    const totalEmbeddings =
      await countTable(
        supabase,
        "material_embeddings",
        "material_id"
      );

    const embeddingCoverage =
      totalMaterials > 0
        ? Number(
            (
              (totalEmbeddings /
                totalMaterials) *
              100
            ).toFixed(2)
          )
        : 0;

    /* ========================================================
       NCS MASTER
    ======================================================== */

    const totalNCS =
      await countTable(
        supabase,
        "ncs_materials",
        "ncs_id"
      );

    const ncsStatuses =
      await countByStatus(
        supabase,
        "ncs_materials",
        "status",
        [
          "PROPOSED",
          "APPROVED",
          "REJECTED",
        ]
      );

    /* ========================================================
       STANDARDIZATION REQUESTS
    ======================================================== */

    const requestStatuses =
      await countByStatus(
        supabase,
        "standardization_requests",
        "status",
        [
          "PENDING",
          "APPROVED",
          "REJECTED",
          "NEEDS_MORE_DATA",
        ]
      );

    /* ========================================================
       MIGRATION
    ======================================================== */

    const migrationStatuses =
      await countByStatus(
        supabase,
        "material_migration_map",
        "migration_status",
        [
          "PENDING",
          "AI_PROPOSED",
          "UNDER_REVIEW",
          "APPROVED",
          "REJECTED",
          "MIGRATED",
        ]
      );

    const totalMigrationMappings =
      Object.values(
        migrationStatuses
      ).reduce(
        (sum, value) =>
          sum + Number(value || 0),
        0
      );

    const migrationCompleted =
      migrationStatuses.MIGRATED || 0;

    const migrationProgress =
      totalMigrationMappings > 0
        ? Number(
            (
              (migrationCompleted /
                totalMigrationMappings) *
              100
            ).toFixed(2)
          )
        : 0;

    /* ========================================================
       AUDIT
    ======================================================== */

    const auditTotal =
      await countTable(
        supabase,
        "material_audit_log",
        "audit_id"
      );

    const auditActions =
      await countByStatus(
        supabase,
        "material_audit_log",
        "action",
        [
          "APPROVE",
          "REJECT",
          "NEEDS_MORE_DATA",
        ]
      );

    /* ========================================================
       MATCH FEEDBACK
    ======================================================== */

    const feedbackTotal =
      await countTable(
        supabase,
        "material_match_feedback",
        "feedback_id"
      );

    const {
      count: positiveFeedback,
      error:
        positiveFeedbackError,
    } = await supabase
      .from(
        "material_match_feedback"
      )
      .select(
        "feedback_id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "label",
        1
      );

    if (
      positiveFeedbackError
    ) {
      throw new Error(
        `Failed to count positive ML feedback: ${positiveFeedbackError.message}`
      );
    }

    const {
      count: negativeFeedback,
      error:
        negativeFeedbackError,
    } = await supabase
      .from(
        "material_match_feedback"
      )
      .select(
        "feedback_id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "label",
        0
      );

    if (
      negativeFeedbackError
    ) {
      throw new Error(
        `Failed to count negative ML feedback: ${negativeFeedbackError.message}`
      );
    }

    /* ========================================================
       COMPANY COVERAGE
    ======================================================== */

    const {
      data: companyRows,
      error:
        companyError,
    } = await supabase
      .from("materials")
      .select("company");

    if (companyError) {
      throw new Error(
        `Failed to load company coverage: ${companyError.message}`
      );
    }

    const companyCounts =
      new Map();

    for (const row of
      companyRows || []) {
      const company =
        String(
          row.company || ""
        ).trim();

      if (!company) {
        continue;
      }

      companyCounts.set(
        company,
        (companyCounts.get(
          company
        ) || 0) + 1
      );
    }

    const companies =
      Array.from(
        companyCounts.entries()
      )
        .map(
          ([company, records]) => ({
            company,
            records,
          })
        )
        .sort(
          (a, b) =>
            b.records -
            a.records
        );

    /* ========================================================
       NATIONAL MASTER MAPPING
    ======================================================== */

    const totalMappings =
      await countTable(
        supabase,
        "material_ncs_mapping",
        "mapping_id"
      );

    const {
      count: verifiedMappings,
      error:
        verifiedMappingError,
    } = await supabase
      .from(
        "material_ncs_mapping"
      )
      .select(
        "mapping_id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "verified",
        true
      );

    if (
      verifiedMappingError
    ) {
      throw new Error(
        `Failed to count verified NCS mappings: ${verifiedMappingError.message}`
      );
    }

    /* ========================================================
       RESPONSE
    ======================================================== */

    return NextResponse.json({
      success: true,

      generated_at:
        new Date().toISOString(),

      materials: {
        total:
          totalMaterials,

        embeddings:
          totalEmbeddings,

        embedding_coverage_percent:
          embeddingCoverage,
      },

      ncs: {
        total:
          totalNCS,

        proposed:
          ncsStatuses.PROPOSED ||
          0,

        approved:
          ncsStatuses.APPROVED ||
          0,

        rejected:
          ncsStatuses.REJECTED ||
          0,
      },

      standardization_requests: {
        total:
          Object.values(
            requestStatuses
          ).reduce(
            (sum, value) =>
              sum +
              Number(
                value || 0
              ),
            0
          ),

        pending:
          requestStatuses.PENDING ||
          0,

        approved:
          requestStatuses.APPROVED ||
          0,

        rejected:
          requestStatuses.REJECTED ||
          0,

        needs_more_data:
          requestStatuses.NEEDS_MORE_DATA ||
          0,
      },

      migration: {
        total:
          totalMigrationMappings,

        pending:
          migrationStatuses.PENDING ||
          0,

        ai_proposed:
          migrationStatuses.AI_PROPOSED ||
          0,

        under_review:
          migrationStatuses.UNDER_REVIEW ||
          0,

        approved:
          migrationStatuses.APPROVED ||
          0,

        rejected:
          migrationStatuses.REJECTED ||
          0,

        migrated:
          migrationStatuses.MIGRATED ||
          0,

        progress_percent:
          migrationProgress,
      },

      audit: {
        total:
          auditTotal,

        approvals:
          auditActions.APPROVE ||
          0,

        rejections:
          auditActions.REJECT ||
          0,

        needs_more_data:
          auditActions.NEEDS_MORE_DATA ||
          0,
      },

      ml_feedback: {
        total:
          feedbackTotal,

        positive:
          positiveFeedback || 0,

        negative:
          negativeFeedback || 0,

        labeled:
          (positiveFeedback || 0) +
          (negativeFeedback || 0),
      },

      national_master: {
        total_mappings:
          totalMappings,

        verified_mappings:
          verifiedMappings || 0,

        verification_percent:
          totalMappings > 0
            ? Number(
                (
                  ((verifiedMappings ||
                    0) /
                    totalMappings) *
                  100
                ).toFixed(2)
              )
            : 0,
      },

      companies,
    });
  } catch (error) {
    console.error(
      "Dashboard stats error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load live dashboard statistics.",
        details:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}