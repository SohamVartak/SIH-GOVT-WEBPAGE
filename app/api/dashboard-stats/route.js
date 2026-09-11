import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/* ============================================================
   SAFE COUNT
============================================================ */

async function countTable(supabase, table, column = "id") {
  try {
    const { count, error } = await supabase
      .from(table)
      .select(column, {
        count: "exact",
        head: true,
      });

    if (error) {
      console.warn(`Count failed for ${table}:`, error.message);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.warn(`Count exception for ${table}:`, error);
    return 0;
  }
}

/* ============================================================
   SAFE STATUS COUNT
============================================================ */

async function countStatus(
  supabase,
  table,
  column,
  status
) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select(column, {
        count: "exact",
        head: true,
      })
      .eq(column, status);

    if (error) {
      return 0;
    }

    return count || 0;
  } catch {
    return 0;
  }
}

/* ============================================================
   GET
============================================================ */

export async function GET() {
  try {
    const supabase = getSupabase();

    /* ========================================================
       MATERIALS
    ======================================================== */

    const totalMaterials = await countTable(
      supabase,
      "materials",
      "id"
    );

    /* ========================================================
       MATERIAL DETAILS
    ======================================================== */

    const totalMaterialDetails = await countTable(
      supabase,
      "material_details",
      "id"
    );

    /* ========================================================
       EMBEDDINGS
    ======================================================== */

    const totalEmbeddings = await countTable(
      supabase,
      "material_embeddings",
      "material_id"
    );

    const embeddingCoverage =
      totalMaterials > 0
        ? Number(
            (
              (totalEmbeddings / totalMaterials) *
              100
            ).toFixed(1)
          )
        : 0;

    /* ========================================================
       BMG MASTER
    ======================================================== */

    const totalBMG = await countTable(
      supabase,
      "bmg_materials",
      "id"
    );

    const proposedBMG = await countStatus(
      supabase,
      "bmg_materials",
      "status",
      "PROPOSED"
    );

    const approvedBMG = await countStatus(
      supabase,
      "bmg_materials",
      "status",
      "APPROVED"
    );

    const rejectedBMG = await countStatus(
      supabase,
      "bmg_materials",
      "status",
      "REJECTED"
    );

    /* ========================================================
       BMG MATERIAL MAPPINGS
    ======================================================== */

    const totalBMGMappings = await countTable(
      supabase,
      "material_bmg_mapping",
      "mapping_id"
    );

    const activeBMGMappings = await countStatus(
      supabase,
      "material_bmg_mapping",
      "mapping_status",
      "ACTIVE"
    );

    const proposedBMGMappings = await countStatus(
      supabase,
      "material_bmg_mapping",
      "mapping_status",
      "AI_PROPOSED"
    );

    const pendingBMGMappings = await countStatus(
      supabase,
      "material_bmg_mapping",
      "mapping_status",
      "PENDING_REVIEW"
    );

    const approvedBMGMappings = await countStatus(
      supabase,
      "material_bmg_mapping",
      "mapping_status",
      "APPROVED"
    );

    /* ========================================================
       BMG REVIEW REQUESTS
    ======================================================== */

    const totalReviewRequests = await countTable(
      supabase,
      "bmg_standardization_requests",
      "request_id"
    );

    const pendingReviewRequests = await countStatus(
      supabase,
      "bmg_standardization_requests",
      "status",
      "PENDING_REVIEW"
    );

    const approvedReviewRequests = await countStatus(
      supabase,
      "bmg_standardization_requests",
      "status",
      "APPROVED"
    );

    const rejectedReviewRequests = await countStatus(
      supabase,
      "bmg_standardization_requests",
      "status",
      "REJECTED"
    );

    /* ========================================================
       COMPANY COVERAGE
    ======================================================== */

    let companies = [];

    try {
      const { data: companyRows, error } = await supabase
        .from("materials")
        .select("company");

      if (!error && companyRows) {
        const companyCounts = new Map();

        for (const row of companyRows) {
          const company = String(
            row.company || ""
          ).trim();

          if (!company) {
            continue;
          }

          companyCounts.set(
            company,
            (companyCounts.get(company) || 0) + 1
          );
        }

        companies = Array.from(
          companyCounts.entries()
        )
          .map(([company, records]) => ({
            company,
            records,
          }))
          .sort(
            (a, b) =>
              b.records - a.records
          );
      }
    } catch (error) {
      console.warn(
        "Company coverage failed:",
        error
      );
    }

    /* ========================================================
       ASSIGNED MATERIALS
    ======================================================== */

    let assignedMaterials = 0;
    let unassignedMaterials = totalMaterials;

    try {
      const { data, error } = await supabase
        .from("materials")
        .select("id, bmg_id");

      if (!error && data) {
        assignedMaterials = data.filter(
          material =>
            material.bmg_id !== null &&
            material.bmg_id !== undefined &&
            String(material.bmg_id).trim() !== ""
        ).length;

        unassignedMaterials =
          Math.max(
            0,
            data.length - assignedMaterials
          );
      }
    } catch (error) {
      console.warn(
        "Assigned material calculation failed:",
        error
      );
    }

    const bmgAssignmentCoverage =
      totalMaterials > 0
        ? Number(
            (
              (assignedMaterials /
                totalMaterials) *
              100
            ).toFixed(1)
          )
        : 0;

    /* ========================================================
       RESPONSE
    ======================================================== */

    return NextResponse.json(
      {
        success: true,

        generated_at:
          new Date().toISOString(),

        materials: {
          total: totalMaterials,

          details:
            totalMaterialDetails,

          embeddings:
            totalEmbeddings,

          embedding_coverage_percent:
            embeddingCoverage,

          assigned_bmg:
            assignedMaterials,

          unassigned_bmg:
            unassignedMaterials,

          bmg_assignment_coverage_percent:
            bmgAssignmentCoverage,
        },

        bmg: {
          total:
            totalBMG,

          proposed:
            proposedBMG,

          approved:
            approvedBMG,

          rejected:
            rejectedBMG,

          mappings:
            totalBMGMappings,

          active_mappings:
            activeBMGMappings,

          ai_proposed_mappings:
            proposedBMGMappings,

          pending_mappings:
            pendingBMGMappings,

          approved_mappings:
            approvedBMGMappings,
        },

        review: {
          total:
            totalReviewRequests,

          pending:
            pendingReviewRequests,

          approved:
            approvedReviewRequests,

          rejected:
            rejectedReviewRequests,
        },

        companies,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
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