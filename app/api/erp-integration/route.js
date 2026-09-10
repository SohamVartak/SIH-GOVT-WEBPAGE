import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing."
    );
  }

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  return createClient(url, key);
}

/* ============================================================
   GET
   ERP integration endpoint
============================================================ */

export async function GET(request) {
  try {
    const supabase =
      getSupabase();

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const legacyCode =
      String(
        searchParams.get(
          "legacyCode"
        ) || ""
      ).trim();

    const company =
      String(
        searchParams.get(
          "company"
        ) || ""
      ).trim();

    const nationalCode =
      String(
        searchParams.get(
          "nationalCode"
        ) || ""
      ).trim();

    /* ========================================================
       LEGACY CODE LOOKUP
    ======================================================== */

    if (legacyCode) {
      let query =
        supabase
          .from(
            "material_migration_map"
          )
          .select(
            `
              migration_id,
              material_id,
              ncs_id,
              cpse_company,
              legacy_material_number,
              legacy_description,
              national_material_code,
              migration_status,
              mapping_method,
              confidence,
              source_system,
              target_system,
              reviewed_by,
              reviewed_at,
              comments
            `
          )
          .eq(
            "legacy_material_number",
            legacyCode
          );

      if (company) {
        query =
          query.eq(
            "cpse_company",
            company
          );
      }

      const {
        data,
        error,
      } =
        await query;

      if (error) {
        throw new Error(
          `Legacy code lookup failed: ${error.message}`
        );
      }

      return NextResponse.json({
        success: true,

        mode:
          "LEGACY_CODE_LOOKUP",

        count:
          (data || []).length,

        records:
          data || [],
      });
    }

    /* ========================================================
       NATIONAL CODE LOOKUP
    ======================================================== */

    if (nationalCode) {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "material_migration_map"
          )
          .select(
            `
              migration_id,
              material_id,
              ncs_id,
              cpse_company,
              legacy_material_number,
              legacy_description,
              national_material_code,
              migration_status,
              mapping_method,
              confidence,
              source_system,
              target_system,
              reviewed_by,
              reviewed_at
            `
          )
          .eq(
            "national_material_code",
            nationalCode
          );

      if (error) {
        throw new Error(
          `National code lookup failed: ${error.message}`
        );
      }

      return NextResponse.json({
        success: true,

        mode:
          "NATIONAL_CODE_LOOKUP",

        count:
          (data || []).length,

        records:
          data || [],
      });
    }

    /* ========================================================
       NATIONAL MASTER EXPORT
    ======================================================== */

    const {
      data:
        mappings,
      error:
        mappingError,
    } =
      await supabase
        .from(
          "material_migration_map"
        )
        .select(
          `
            migration_id,
            material_id,
            ncs_id,
            cpse_company,
            legacy_material_number,
            legacy_description,
            national_material_code,
            migration_status,
            mapping_method,
            confidence,
            source_system,
            target_system,
            reviewed_by,
            reviewed_at,
            created_at,
            updated_at
          `
        )
        .order(
          "migration_id",
          {
            ascending: true,
          }
        );

    if (mappingError) {
      throw new Error(
        `Failed to load ERP mappings: ${mappingError.message}`
      );
    }

    const records =
      mappings || [];

    /*
     * ERP-safe payload.
     *
     * Only approved/migrated mappings are
     * exported as authoritative mappings.
     */
    const approved =
      records.filter(
        record =>
          record.migration_status ===
            "APPROVED" ||
          record.migration_status ===
            "MIGRATED"
      );

    const exportRecords =
      approved.map(
        record => ({
          legacy_material_number:
            record.legacy_material_number,

          cpse_company:
            record.cpse_company,

          national_material_code:
            record.national_material_code,

          ncs_id:
            record.ncs_id,

          material_id:
            record.material_id,

          mapping_status:
            record.migration_status,

          mapping_method:
            record.mapping_method,

          confidence:
            record.confidence,

          source_system:
            record.source_system,

          target_system:
            record.target_system,

          reviewed_by:
            record.reviewed_by,

          reviewed_at:
            record.reviewed_at,

          last_updated:
            record.updated_at,
        })
      );

    /* ========================================================
       SUMMARY
    ======================================================== */

    const summary = {
      total_registry_records:
        records.length,

      authoritative_mappings:
        exportRecords.length,

      pending:
        records.filter(
          r =>
            r.migration_status ===
            "PENDING"
        ).length,

      ai_proposed:
        records.filter(
          r =>
            r.migration_status ===
            "AI_PROPOSED"
        ).length,

      under_review:
        records.filter(
          r =>
            r.migration_status ===
            "UNDER_REVIEW"
        ).length,

      approved:
        records.filter(
          r =>
            r.migration_status ===
            "APPROVED"
        ).length,

      migrated:
        records.filter(
          r =>
            r.migration_status ===
            "MIGRATED"
        ).length,

      rejected:
        records.filter(
          r =>
            r.migration_status ===
            "REJECTED"
        ).length,
    };

    return NextResponse.json({
      success: true,

      mode:
        "ERP_NATIONAL_MASTER_EXPORT",

      integration_version:
        "BMG-ERP-1.0",

      generated_at:
        new Date().toISOString(),

      summary,

      records:
        exportRecords,
    });
  } catch (error) {
    console.error(
      "ERP integration error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "ERP integration request failed.",

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