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

/* ============================================================
   GET
   Returns migration records + summary
============================================================ */

export async function GET(request) {
  try {
    const supabase = getSupabase();

    const { searchParams } = new URL(request.url);

    const status =
      searchParams.get("status") || null;

    const company =
      searchParams.get("company") || null;

    let query = supabase
      .from("material_migration_map")
      .select(`
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
        comments,
        created_at,
        updated_at
      `)
      .order("migration_id", {
        ascending: false,
      });

    if (status) {
      query = query.eq(
        "migration_status",
        status
      );
    }

    if (company) {
      query = query.eq(
        "cpse_company",
        company
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw new Error(
        `Failed to load migration records: ${error.message}`
      );
    }

    const records = data || [];

    const summary = {
      total: records.length,

      pending: records.filter(
        (row) =>
          row.migration_status ===
          "PENDING"
      ).length,

      ai_proposed: records.filter(
        (row) =>
          row.migration_status ===
          "AI_PROPOSED"
      ).length,

      under_review: records.filter(
        (row) =>
          row.migration_status ===
          "UNDER_REVIEW"
      ).length,

      approved: records.filter(
        (row) =>
          row.migration_status ===
          "APPROVED"
      ).length,

      rejected: records.filter(
        (row) =>
          row.migration_status ===
          "REJECTED"
      ).length,

      migrated: records.filter(
        (row) =>
          row.migration_status ===
          "MIGRATED"
      ).length,
    };

    return NextResponse.json({
      success: true,
      summary,
      count: records.length,
      records,
    });
  } catch (error) {
    console.error(
      "Material migration GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load material migration records.",
        details:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST
   Creates a migration mapping
============================================================ */

export async function POST(request) {
  try {
    const supabase = getSupabase();

    const body =
      await request
        .json()
        .catch(() => ({}));

    const materialId =
      body.materialId
        ? Number(body.materialId)
        : null;

    const ncsId =
      body.ncsId
        ? Number(body.ncsId)
        : null;

    const cpseCompany =
      String(
        body.cpseCompany || ""
      ).trim();

    const legacyMaterialNumber =
      String(
        body.legacyMaterialNumber ||
          ""
      ).trim();

    const legacyDescription =
      String(
        body.legacyDescription ||
          ""
      ).trim();

    const nationalMaterialCode =
      String(
        body.nationalMaterialCode ||
          ""
      ).trim();

    const migrationStatus =
      String(
        body.migrationStatus ||
          "PENDING"
      ).trim();

    const mappingMethod =
      String(
        body.mappingMethod ||
          "MANUAL"
      ).trim();

    const confidence =
      body.confidence !==
        undefined &&
      body.confidence !== null
        ? Number(body.confidence)
        : null;

    const sourceSystem =
      String(
        body.sourceSystem ||
          "LEGACY_ERP"
      ).trim();

    const targetSystem =
      String(
        body.targetSystem ||
          "NATIONAL_MATERIAL_MASTER"
      ).trim();

    const comments =
      String(
        body.comments || ""
      ).trim();

    if (!cpseCompany) {
      return NextResponse.json(
        {
          success: false,
          error:
            "cpseCompany is required.",
        },
        { status: 400 }
      );
    }

    if (!legacyMaterialNumber) {
      return NextResponse.json(
        {
          success: false,
          error:
            "legacyMaterialNumber is required.",
        },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      "PENDING",
      "AI_PROPOSED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "MIGRATED",
    ];

    if (
      !allowedStatuses.includes(
        migrationStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Invalid migrationStatus. Allowed values: ${allowedStatuses.join(
              ", "
            )}`,
        },
        { status: 400 }
      );
    }

    if (
      confidence !== null &&
      (!Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 100)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "confidence must be between 0 and 100.",
        },
        { status: 400 }
      );
    }

    const insertPayload = {
      material_id:
        Number.isInteger(materialId) &&
        materialId > 0
          ? materialId
          : null,

      ncs_id:
        Number.isInteger(ncsId) &&
        ncsId > 0
          ? ncsId
          : null,

      cpse_company:
        cpseCompany,

      legacy_material_number:
        legacyMaterialNumber,

      legacy_description:
        legacyDescription || null,

      national_material_code:
        nationalMaterialCode || null,

      migration_status:
        migrationStatus,

      mapping_method:
        mappingMethod,

      confidence,

      source_system:
        sourceSystem,

      target_system:
        targetSystem,

      comments:
        comments || null,
    };

    const {
      data,
      error,
    } = await supabase
      .from(
        "material_migration_map"
      )
      .insert(
        insertPayload
      )
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to create migration mapping: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "Migration mapping created successfully.",
        record: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Material migration POST error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to create material migration mapping.",
        details:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   PATCH
   Updates review / migration status
============================================================ */

export async function PATCH(request) {
  try {
    const supabase = getSupabase();

    const body =
      await request
        .json()
        .catch(() => ({}));

    const migrationId =
      Number(
        body.migrationId
      );

    const migrationStatus =
      String(
        body.migrationStatus ||
          ""
      ).trim();

    const nationalMaterialCode =
      body.nationalMaterialCode !==
      undefined
        ? String(
            body.nationalMaterialCode ||
              ""
          ).trim()
        : undefined;

    const reviewer =
      body.reviewedBy !==
      undefined
        ? String(
            body.reviewedBy ||
              ""
          ).trim()
        : undefined;

    const comments =
      body.comments !==
      undefined
        ? String(
            body.comments ||
              ""
          ).trim()
        : undefined;

    if (
      !Number.isInteger(
        migrationId
      ) ||
      migrationId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid migrationId is required.",
        },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      "PENDING",
      "AI_PROPOSED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "MIGRATED",
    ];

    if (
      !allowedStatuses.includes(
        migrationStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid migrationStatus is required.",
        },
        { status: 400 }
      );
    }

    const updateData = {
      migration_status:
        migrationStatus,

      updated_at:
        new Date().toISOString(),
    };

    if (
      nationalMaterialCode !==
      undefined
    ) {
      updateData.national_material_code =
        nationalMaterialCode ||
        null;
    }

    if (
      reviewer !==
      undefined
    ) {
      updateData.reviewed_by =
        reviewer ||
        null;

      updateData.reviewed_at =
        new Date().toISOString();
    }

    if (
      comments !==
      undefined
    ) {
      updateData.comments =
        comments || null;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "material_migration_map"
      )
      .update(updateData)
      .eq(
        "migration_id",
        migrationId
      )
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to update migration record: ${error.message}`
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Migration record updated successfully.",
      record: data,
    });
  } catch (error) {
    console.error(
      "Material migration PATCH error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to update material migration record.",
        details:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}