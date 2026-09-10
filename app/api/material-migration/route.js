import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ============================================================
   SUPABASE
============================================================ */

function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey
  );
}

/* ============================================================
   HELPERS
============================================================ */

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/* ============================================================
   GET
   Load migration registry
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

    const status =
      cleanText(
        searchParams.get(
          "status"
        )
      );

    const company =
      cleanText(
        searchParams.get(
          "company"
        )
      );

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
            comments,
            created_at,
            updated_at
          `
        )
        .order(
          "migration_id",
          {
            ascending: false,
          }
        );

    if (status) {
      query =
        query.eq(
          "migration_status",
          status
        );
    }

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
        `Failed to load migration records: ${error.message}`
      );
    }

    const records =
      data || [];

    const summary = {
      total:
        records.length,

      pending:
        records.filter(
          row =>
            row.migration_status ===
            "PENDING"
        ).length,

      ai_proposed:
        records.filter(
          row =>
            row.migration_status ===
            "AI_PROPOSED"
        ).length,

      under_review:
        records.filter(
          row =>
            row.migration_status ===
            "UNDER_REVIEW"
        ).length,

      approved:
        records.filter(
          row =>
            row.migration_status ===
            "APPROVED"
        ).length,

      rejected:
        records.filter(
          row =>
            row.migration_status ===
            "REJECTED"
        ).length,

      migrated:
        records.filter(
          row =>
            row.migration_status ===
            "MIGRATED"
        ).length,
    };

    return NextResponse.json({
      success: true,
      summary,
      count:
        records.length,
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
      {
        status: 500,
      }
    );
  }
}

/* ============================================================
   POST
   Create migration mapping

   Supports:
   1. Manual mapping
   2. AI/NCS-based proposal
============================================================ */

export async function POST(request) {
  try {
    const supabase =
      getSupabase();

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const materialId =
      safeNumber(
        body.materialId
      );

    const ncsId =
      safeNumber(
        body.ncsId
      );

    const cpseCompany =
      cleanText(
        body.cpseCompany
      );

    const legacyMaterialNumber =
      cleanText(
        body.legacyMaterialNumber
      );

    let legacyDescription =
      cleanText(
        body.legacyDescription
      );

    let nationalMaterialCode =
      cleanText(
        body.nationalMaterialCode
      );

    let confidence =
      safeNumber(
        body.confidence
      );

    let mappingMethod =
      cleanText(
        body.mappingMethod
      );

    let migrationStatus =
      cleanText(
        body.migrationStatus
      );

    const sourceSystem =
      cleanText(
        body.sourceSystem
      ) ||
      "LEGACY_ERP";

    const targetSystem =
      cleanText(
        body.targetSystem
      ) ||
      "NATIONAL_MATERIAL_MASTER";

    const comments =
      cleanText(
        body.comments
      );

    /* ========================================================
       VALIDATION
    ======================================================== */

    if (!cpseCompany) {
      return NextResponse.json(
        {
          success: false,
          error:
            "cpseCompany is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !legacyMaterialNumber
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "legacyMaterialNumber is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Default status/method
     */
    if (
      !migrationStatus
    ) {
      migrationStatus =
        "PENDING";
    }

    if (
      !mappingMethod
    ) {
      mappingMethod =
        "MANUAL";
    }

    /* ========================================================
       AI / NCS AUTO PROPOSAL
       
       When materialId is supplied and no national code was
       supplied, attempt to find an existing verified NCS
       mapping for that material.
    ======================================================== */

    let proposalSource =
      null;

    if (
      Number.isInteger(
        materialId
      ) &&
      materialId > 0 &&
      !nationalMaterialCode
    ) {

      /*
       * Get material details.
       */
      const {
        data:
          material,
        error:
          materialError,
      } =
        await supabase
          .from(
            "materials"
          )
          .select(
            `
              id,
              company,
              material_number,
              description,
              specifications
            `
          )
          .eq(
            "id",
            materialId
          )
          .maybeSingle();

      if (
        materialError
      ) {
        throw new Error(
          `Failed to load source material: ${materialError.message}`
        );
      }

      if (
        material
      ) {

        if (
          !legacyDescription
        ) {
          legacyDescription =
            cleanText(
              material.description
            );
        }

        /*
         * First preference:
         * verified material -> NCS mapping
         */
        const {
          data:
            verifiedMappings,
          error:
            mappingError,
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
            .or(
              "verified.eq.true,status.eq.VERIFIED"
            )
            .limit(
              10
            );

        if (
          mappingError
        ) {
          throw new Error(
            `Failed to load NCS mapping: ${mappingError.message}`
          );
        }

        if (
          verifiedMappings &&
          verifiedMappings.length
        ) {

          const firstMapping =
            verifiedMappings[0];

          const resolvedNcsId =
            safeNumber(
              firstMapping.ncs_id
            );

          if (
            Number.isInteger(
              resolvedNcsId
            ) &&
            resolvedNcsId > 0
          ) {

            const {
              data:
                ncs,
              error:
                ncsError,
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
                  resolvedNcsId
                )
                .maybeSingle();

            if (
              ncsError
            ) {
              throw new Error(
                `Failed to load NCS record: ${ncsError.message}`
              );
            }

            if (
              ncs &&
              ncs.national_material_code
            ) {

              nationalMaterialCode =
                cleanText(
                  ncs.national_material_code
                );

              confidence =
                confidence ??
                100;

              mappingMethod =
                "VERIFIED_NCS_MAPPING";

              migrationStatus =
                "AI_PROPOSED";

              proposalSource = {
                type:
                  "VERIFIED_NCS_MAPPING",

                ncs_id:
                  resolvedNcsId,

                national_material_code:
                  nationalMaterialCode,

                ncs_status:
                  ncs.status ||
                  null,
              };
            }
          }
        }

        /*
         * Second preference:
         * Explicit NCS ID supplied by caller.
         */
        if (
          !nationalMaterialCode &&
          Number.isInteger(
            ncsId
          ) &&
          ncsId > 0
        ) {

          const {
            data:
              ncs,
            error:
              ncsError,
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

          if (
            ncsError
          ) {
            throw new Error(
              `Failed to load supplied NCS record: ${ncsError.message}`
            );
          }

          if (
            ncs &&
            ncs.national_material_code
          ) {

            nationalMaterialCode =
              cleanText(
                ncs.national_material_code
              );

            confidence =
              confidence ??
              (
                ncs.status ===
                "APPROVED"
                  ? 100
                  : 90
              );

            mappingMethod =
              "NCS_REFERENCE";

            migrationStatus =
              "AI_PROPOSED";

            proposalSource = {
              type:
                "NCS_REFERENCE",

              ncs_id:
                ncsId,

              national_material_code:
                nationalMaterialCode,

              ncs_status:
                ncs.status ||
                null,
            };
          }
        }
      }
    }

    /* ========================================================
       STATUS VALIDATION
    ======================================================== */

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
        {
          status: 400,
        }
      );
    }

    /* ========================================================
       CONFIDENCE VALIDATION
    ======================================================== */

    if (
      confidence !==
        null &&
      confidence !==
        undefined
    ) {

      if (
        !Number.isFinite(
          confidence
        ) ||
        confidence < 0 ||
        confidence > 100
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "confidence must be between 0 and 100.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /* ========================================================
       SAFE AUTO-PROPOSAL RULE
    ======================================================== */

    /*
     * Never automatically mark an AI proposal as MIGRATED.
     *
     * Migration must pass:
     *
     * AI_PROPOSED
     *       ↓
     * UNDER_REVIEW
     *       ↓
     * APPROVED
     *       ↓
     * MIGRATED
     */
    if (
      mappingMethod !==
        "MANUAL" &&
      migrationStatus ===
        "MIGRATED"
    ) {
      migrationStatus =
        "AI_PROPOSED";
    }

    /* ========================================================
       INSERT
    ======================================================== */

    const insertPayload = {
      material_id:
        Number.isInteger(
          materialId
        ) &&
        materialId > 0
          ? materialId
          : null,

      ncs_id:
        Number.isInteger(
          ncsId
        ) &&
        ncsId > 0
          ? ncsId
          : (
              proposalSource?.ncs_id ||
              null
            ),

      cpse_company:
        cpseCompany,

      legacy_material_number:
        legacyMaterialNumber,

      legacy_description:
        legacyDescription ||
        null,

      national_material_code:
        nationalMaterialCode ||
        null,

      migration_status:
        migrationStatus,

      mapping_method:
        mappingMethod,

      confidence:
        confidence,

      source_system:
        sourceSystem,

      target_system:
        targetSystem,

      comments:
        comments ||
        (
          proposalSource
            ? `Automatically proposed from ${proposalSource.type}.`
            : null
        ),
    };

    const {
      data,
      error,
    } =
      await supabase
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
          proposalSource
            ? "Migration proposal created from existing National Material mapping."
            : "Migration mapping created successfully.",

        proposal_generated:
          Boolean(
            proposalSource
          ),

        proposal_source:
          proposalSource,

        record:
          data,
      },
      {
        status: 201,
      }
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
      {
        status: 500,
      }
    );
  }
}

/* ============================================================
   PATCH
   Review / approve / reject / migrate
============================================================ */

export async function PATCH(request) {
  try {
    const supabase =
      getSupabase();

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const migrationId =
      safeNumber(
        body.migrationId
      );

    const migrationStatus =
      cleanText(
        body.migrationStatus
      );

    const nationalMaterialCode =
      body.nationalMaterialCode !==
      undefined
        ? cleanText(
            body.nationalMaterialCode
          )
        : undefined;

    const reviewer =
      body.reviewedBy !==
      undefined
        ? cleanText(
            body.reviewedBy
          )
        : undefined;

    const comments =
      body.comments !==
      undefined
        ? cleanText(
            body.comments
          )
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
        {
          status: 400,
        }
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
        {
          status: 400,
        }
      );
    }

    /* ========================================================
       LOAD CURRENT RECORD
    ======================================================== */

    const {
      data:
        existing,
      error:
        existingError,
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
            national_material_code,
            migration_status,
            mapping_method,
            confidence
          `
        )
        .eq(
          "migration_id",
          migrationId
        )
        .maybeSingle();

    if (
      existingError
    ) {
      throw new Error(
        `Failed to load migration record: ${existingError.message}`
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Migration record not found.",
        },
        {
          status: 404,
        }
      );
    }

    /* ========================================================
       STATE TRANSITION GUARD
    ======================================================== */

    const currentStatus =
      existing.migration_status;

    /*
     * MIGRATED is terminal in this workflow.
     */
    if (
      currentStatus ===
        "MIGRATED" &&
      migrationStatus !==
        "MIGRATED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A migrated record cannot be moved back to an earlier state.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * AI proposed records should go through review
     * before becoming approved.
     */
    if (
      migrationStatus ===
        "APPROVED" &&
      (
        currentStatus ===
          "PENDING" ||
        currentStatus ===
          "AI_PROPOSED"
      ) &&
      !reviewer
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A reviewer identity is required before approval.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * MIGRATED requires approval.
     */
    if (
      migrationStatus ===
        "MIGRATED" &&
      currentStatus !==
        "APPROVED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only APPROVED migration mappings can be marked as MIGRATED.",
        },
        {
          status: 409,
        }
      );
    }

    /* ========================================================
       UPDATE
    ======================================================== */

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
        comments ||
        null;
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "material_migration_map"
        )
        .update(
          updateData
        )
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

      previous_status:
        currentStatus,

      new_status:
        migrationStatus,

      record:
        data,
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
      {
        status: 500,
      }
    );
  }
}