import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ============================================================
   SUPABASE
============================================================ */

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

  return createClient(
    url,
    key
  );
}

/* ============================================================
   HELPERS
============================================================ */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function safeNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/* ============================================================
   LOAD VERIFIED NCS MAPPING FOR MATERIAL
============================================================ */

async function findNcsForMaterial(
  supabase,
  materialId
) {
  const {
    data: mappings,
    error: mappingError,
  } =
    await supabase
      .from(
        "material_ncs_mapping"
      )
      .select(
        `
          mapping_id,
          material_id,
          ncs_id,
          verified,
          status
        `
      )
      .eq(
        "material_id",
        materialId
      )
      .limit(
        20
      );

  if (mappingError) {
    throw new Error(
      `Failed to load material NCS mappings: ${mappingError.message}`
    );
  }

  const verified =
    (mappings || []).find(
      mapping =>
        mapping.verified === true ||
        mapping.status ===
          "VERIFIED"
    );

  /*
   * Prefer verified mapping.
   */
  if (verified) {
    return verified;
  }

  /*
   * Otherwise use an explicitly approved mapping.
   */
  const approved =
    (mappings || []).find(
      mapping =>
        mapping.status ===
        "APPROVED"
    );

  return approved || null;
}

/* ============================================================
   LOAD NCS RECORD
============================================================ */

async function getNcs(
  supabase,
  ncsId
) {
  if (
    !Number.isInteger(
      ncsId
    ) ||
    ncsId <= 0
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "ncs_materials"
      )
      .select(
        `
          ncs_id,
          national_material_code,
          standard_name,
          status
        `
      )
      .eq(
        "ncs_id",
        ncsId
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load NCS ${ncsId}: ${error.message}`
    );
  }

  return data || null;
}

/* ============================================================
   CREATE ONE PROPOSAL
============================================================ */

async function buildProposal(
  supabase,
  material
) {
  const materialId =
    safeNumber(
      material.id
    );

  if (
    !Number.isInteger(
      materialId
    ) ||
    materialId <= 0
  ) {
    return {
      success: false,
      reason:
        "Invalid material ID.",
    };
  }

  const existingNcsMapping =
    await findNcsForMaterial(
      supabase,
      materialId
    );

  if (
    !existingNcsMapping
  ) {
    return {
      success: false,
      reason:
        "No verified or approved NCS mapping found.",
    };
  }

  const ncsId =
    safeNumber(
      existingNcsMapping.ncs_id
    );

  const ncs =
    await getNcs(
      supabase,
      ncsId
    );

  if (
    !ncs ||
    !cleanText(
      ncs.national_material_code
    )
  ) {
    return {
      success: false,
      reason:
        "NCS record or National Material Code not available.",
    };
  }

  /*
   * Only approved NCS records receive the highest confidence.
   *
   * Verified mapping + approved NCS:
   * 100
   *
   * Verified mapping + proposed NCS:
   * 90
   *
   * Approved mapping:
   * 85
   */
  let confidence = 85;

  if (
    existingNcsMapping.verified ===
      true &&
    ncs.status ===
      "APPROVED"
  ) {
    confidence = 100;
  } else if (
    existingNcsMapping.verified ===
      true
  ) {
    confidence = 90;
  }

  const mappingMethod =
    existingNcsMapping.verified ===
      true
      ? "VERIFIED_NCS_MAPPING"
      : "APPROVED_NCS_MAPPING";

  return {
    success: true,

    material_id:
      materialId,

    ncs_id:
      ncsId,

    national_material_code:
      cleanText(
        ncs.national_material_code
      ),

    legacy_material_number:
      cleanText(
        material.material_number
      ),

    legacy_description:
      cleanText(
        material.description
      ),

    cpse_company:
      cleanText(
        material.company
      ).toUpperCase(),

    confidence,

    mapping_method:
      mappingMethod,

    ncs_status:
      cleanText(
        ncs.status
      ) || null,

    ncs_standard_name:
      cleanText(
        ncs.standard_name
      ) || null,
  };
}

/* ============================================================
   POST
   BULK MIGRATION PROPOSALS
============================================================ */

export async function POST(
  request
) {
  try {
    const supabase =
      getSupabase();

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    /*
     * Optional list of explicit material IDs.
     *
     * Example:
     * {
     *   "materialIds": [1,2,3,4]
     * }
     *
     * Without materialIds, the endpoint processes
     * the first `limit` records that do not already
     * have a migration mapping.
     */
    const suppliedIds =
      Array.isArray(
        body.materialIds
      )
        ? body.materialIds
            .map(id =>
              Number(id)
            )
            .filter(
              id =>
                Number.isInteger(
                  id
                ) &&
                id > 0
            )
        : [];

    let limit =
      safeNumber(
        body.limit
      );

    if (
      !Number.isInteger(
        limit
      ) ||
      limit <= 0
    ) {
      limit = 50;
    }

    /*
     * Safety cap for one request.
     */
    limit =
      Math.min(
        limit,
        250
      );

    /* ========================================================
       LOAD MATERIALS
    ======================================================== */

    let materialsQuery =
      supabase
        .from("materials")
        .select(
          `
            id,
            company,
            material_number,
            description,
            specifications,
            category
          `
        )
        .order(
          "id",
          {
            ascending: true,
          }
        )
        .limit(
          limit
        );

    if (
      suppliedIds.length
    ) {
      materialsQuery =
        supabase
          .from("materials")
          .select(
            `
              id,
              company,
              material_number,
              description,
              specifications,
              category
            `
          )
          .in(
            "id",
            suppliedIds.slice(
              0,
              250
            )
          )
          .order(
            "id",
            {
              ascending: true,
            }
          );
    }

    const {
      data: materials,
      error: materialError,
    } =
      await materialsQuery;

    if (materialError) {
      throw new Error(
        `Failed to load materials: ${materialError.message}`
      );
    }

    const selectedMaterials =
      materials || [];

    if (
      selectedMaterials.length ===
      0
    ) {
      return NextResponse.json({
        success: true,

        message:
          "No source materials found for bulk migration proposal.",

        requested:
          suppliedIds.length ||
          limit,

        processed:
          0,

        created:
          0,

        skipped:
          0,

        failed:
          0,

        proposals:
          [],

        skipped_records:
          [],
      });
    }

    /* ========================================================
       EXISTING MIGRATION RECORDS
       
       Prevent duplicate proposals.
    ======================================================== */

    const selectedMaterialIds =
      selectedMaterials.map(
        material =>
          Number(
            material.id
          )
      );

    const {
      data: existingMappings,
      error: existingMappingError,
    } =
      await supabase
        .from(
          "material_migration_map"
        )
        .select(
          `
            migration_id,
            material_id,
            migration_status,
            national_material_code
          `
        )
        .in(
          "material_id",
          selectedMaterialIds
        );

    if (
      existingMappingError
    ) {
      throw new Error(
        `Failed to check existing migration mappings: ${existingMappingError.message}`
      );
    }

    const existingByMaterial =
      new Map();

    for (
      const row of
        existingMappings || []
    ) {
      const id =
        Number(
          row.material_id
        );

      if (
        !existingByMaterial.has(
          id
        )
      ) {
        existingByMaterial.set(
          id,
          []
        );
      }

      existingByMaterial
        .get(id)
        .push(row);
    }

    /* ========================================================
       BUILD PROPOSALS
    ======================================================== */

    const proposals =
      [];

    const skippedRecords =
      [];

    const failedRecords =
      [];

    for (
      const material of
        selectedMaterials
    ) {
      const materialId =
        Number(
          material.id
        );

      /*
       * Do not create another migration
       * record for an already registered material.
       */
      if (
        existingByMaterial.has(
          materialId
        )
      ) {
        skippedRecords.push({
          material_id:
            materialId,

          material_number:
            cleanText(
              material.material_number
            ),

          reason:
            "Migration mapping already exists.",
        });

        continue;
      }

      try {
        const proposal =
          await buildProposal(
            supabase,
            material
          );

        if (
          !proposal.success
        ) {
          skippedRecords.push({
            material_id:
              materialId,

            material_number:
              cleanText(
                material.material_number
              ),

            reason:
              proposal.reason,
          });

          continue;
        }

        proposals.push(
          proposal
        );
      } catch (error) {
        failedRecords.push({
          material_id:
            materialId,

          material_number:
            cleanText(
              material.material_number
            ),

          error:
            error?.message ||
            String(error),
        });
      }
    }

    /* ========================================================
       INSERT PROPOSALS
    ======================================================== */

    const insertRows =
      proposals.map(
        proposal => ({
          material_id:
            proposal.material_id,

          ncs_id:
            proposal.ncs_id,

          cpse_company:
            proposal.cpse_company,

          legacy_material_number:
            proposal.legacy_material_number,

          legacy_description:
            proposal.legacy_description ||
            null,

          national_material_code:
            proposal.national_material_code,

          migration_status:
            "AI_PROPOSED",

          mapping_method:
            proposal.mapping_method,

          confidence:
            proposal.confidence,

          source_system:
            "LEGACY_ERP",

          target_system:
            "NATIONAL_MATERIAL_MASTER",

          comments:
            `Bulk migration proposal generated from ${proposal.mapping_method}. NCS status: ${proposal.ncs_status || "UNKNOWN"}.`,
        })
      );

    let createdRecords =
      [];

    if (
      insertRows.length
    ) {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            "material_migration_map"
          )
          .insert(
            insertRows
          )
          .select();

      if (error) {
        throw new Error(
          `Failed to insert bulk migration proposals: ${error.message}`
        );
      }

      createdRecords =
        data || [];
    }

    /* ========================================================
       SUMMARY
    ======================================================== */

    const createdCount =
      createdRecords.length;

    const skippedCount =
      skippedRecords.length;

    const failedCount =
      failedRecords.length;

    return NextResponse.json({
      success: true,

      message:
        "Bulk migration proposal processing completed.",

      requested:
        selectedMaterials.length,

      processed:
        selectedMaterials.length,

      created:
        createdCount,

      skipped:
        skippedCount,

      failed:
        failedCount,

      status:
        "AI_PROPOSED",

      proposals:
        createdRecords,

      skipped_records:
        skippedRecords,

      failed_records:
        failedRecords,
    });
  } catch (error) {
    console.error(
      "Bulk migration proposal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to generate bulk migration proposals.",

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