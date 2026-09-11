import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase environment variables."
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* ============================================================
   HELPERS
============================================================ */

function uniquePositiveIntegers(values) {
  return [
    ...new Set(
      (values || [])
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0
        )
    ),
  ];
}

function uniqueValues(values) {
  return [
    ...new Set(
      (values || []).filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      )
    ),
  ];
}

/* ============================================================
   DELETE
============================================================ */

/**
 * DELETE /api/admin/datasheet
 *
 * Expected body:
 *
 * {
 *   "datasheetId": 22
 * }
 *
 * This removes the datasheet and all records belonging
 * specifically to that datasheet.
 */
export async function DELETE(request) {
  try {
    const body =
      await request.json();

    const datasheetId =
      Number(
        body?.datasheetId ??
        body?.datasheet_id ??
        body?.id
      );

    if (
      !Number.isInteger(
        datasheetId
      ) ||
      datasheetId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid datasheetId is required.",
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      `[ADMIN DELETE] Starting deletion for datasheet ${datasheetId}`
    );

    /* ========================================================
       1. FIND COMPANY MATERIALS
    ======================================================== */

    const {
      data: companyMaterials,
      error:
        companyMaterialsError,
    } =
      await supabase
        .from(
          "company_materials"
        )
        .select(
          "material_id, company_id, datasheet_id, company_material_code, material_name, description"
        )
        .eq(
          "datasheet_id",
          datasheetId
        );

    if (
      companyMaterialsError
    ) {
      console.error(
        "[ADMIN DELETE] company_materials lookup failed:",
        companyMaterialsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not find related company material records.",
          details:
            companyMaterialsError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !companyMaterials ||
      companyMaterials.length === 0
    ) {
      console.warn(
        `[ADMIN DELETE] No company_materials found for datasheet ${datasheetId}.`
      );
    }

    console.log(
      `[ADMIN DELETE] Found ${
        companyMaterials?.length || 0
      } company material record(s).`
    );

    /* ========================================================
       2. RESOLVE THE ACTUAL materials.id VALUES
       
       IMPORTANT:
       company_materials.material_id is NOT assumed to be
       materials.id.

       We resolve the actual materials rows using:
       - company_id
       - company_material_code
    ======================================================== */

    const actualMaterialIds =
      [];

    for (
      const companyMaterial of
        companyMaterials || []
    ) {
      const companyId =
        companyMaterial.company_id;

      const companyMaterialCode =
        companyMaterial.company_material_code;

      if (
        companyId !== null &&
        companyId !== undefined &&
        companyMaterialCode
      ) {
        const {
          data: matchingMaterials,
          error:
            materialLookupError,
        } =
          await supabase
            .from(
              "materials"
            )
            .select(
              "id, company_id, material_number, company, description"
            )
            .eq(
              "company_id",
              companyId
            )
            .eq(
              "material_number",
              companyMaterialCode
            );

        if (
          materialLookupError
        ) {
          console.warn(
            `[ADMIN DELETE] Could not resolve material for company material code ${companyMaterialCode}:`,
            materialLookupError.message
          );
        } else {
          for (
            const material of
              matchingMaterials ||
              []
          ) {
            if (
              material?.id
            ) {
              actualMaterialIds.push(
                Number(
                  material.id
                )
              );
            }
          }
        }
      }
    }

    /* --------------------------------------------------------
       Fallback:
       If the exact company/code lookup didn't find anything,
       inspect materials using the material name/description
       and company where possible.
    -------------------------------------------------------- */

    if (
      actualMaterialIds.length ===
      0
    ) {
      for (
        const companyMaterial of
          companyMaterials || []
      ) {
        const companyId =
          companyMaterial.company_id;

        const materialName =
          companyMaterial.material_name;

        const description =
          companyMaterial.description;

        if (
          companyId === null ||
          companyId === undefined
        ) {
          continue;
        }

        const possibleNumbers =
          uniqueValues([
            companyMaterial.company_material_code,
          ]);

        if (
          possibleNumbers.length >
          0
        ) {
          continue;
        }

        let query =
          supabase
            .from("materials")
            .select(
              "id, company_id, material_number, company, description"
            )
            .eq(
              "company_id",
              companyId
            );

        if (
          materialName
        ) {
          query =
            query.ilike(
              "description",
              `%${materialName}%`
            );
        } else if (
          description
        ) {
          query =
            query.ilike(
              "description",
              `%${description}%`
            );
        }

        const {
          data: fallbackMaterials,
          error:
            fallbackError,
        } =
          await query;

        if (
          fallbackError
        ) {
          console.warn(
            "[ADMIN DELETE] Fallback material lookup failed:",
            fallbackError.message
          );
        } else {
          for (
            const material of
              fallbackMaterials ||
              []
          ) {
            if (
              material?.id
            ) {
              actualMaterialIds.push(
                Number(
                  material.id
                )
              );
            }
          }
        }
      }
    }

    const materialIds =
      uniquePositiveIntegers(
        actualMaterialIds
      );

    console.log(
      `[ADMIN DELETE] Resolved actual materials.id values:`,
      materialIds
    );

    /* ========================================================
       3. CAPTURE NCS MAPPINGS BEFORE DELETING THEM
       
       The previous version deleted the mappings first and
       then tried to find their NCS IDs. That could never work.
    ======================================================== */

    let ncsIds =
      [];

    if (
      materialIds.length >
      0
    ) {
      const {
        data: existingMappings,
        error:
          mappingLookupError,
      } =
        await supabase
          .from(
            "material_ncs_mapping"
          )
          .select(
            "material_id, ncs_id"
          )
          .in(
            "material_id",
            materialIds
          );

      if (
        mappingLookupError
      ) {
        console.warn(
          "[ADMIN DELETE] Could not capture NCS mappings:",
          mappingLookupError.message
        );
      } else {
        ncsIds =
          uniqueValues(
            (
              existingMappings ||
              []
            ).map(
              (row) =>
                row.ncs_id
            )
          );
      }
    }

    console.log(
      `[ADMIN DELETE] Captured ${
        ncsIds.length
      } NCS ID(s) before mapping deletion.`
    );

    /* ========================================================
       4. FIND AI APPROVAL RECORDS
    ======================================================== */

    const companyMaterialIds =
      uniqueValues(
        (
          companyMaterials ||
          []
        ).map(
          (row) =>
            row.material_id
        )
      );

    let approvalIds =
      [];

    if (
      companyMaterialIds.length >
      0
    ) {
      const {
        data: approvals,
        error:
          approvalsLookupError,
      } =
        await supabase
          .from(
            "ai_code_approvals"
          )
          .select(
            "id, company_material_id"
          );

      if (
        approvalsLookupError
      ) {
        console.warn(
          "[ADMIN DELETE] Could not inspect AI approvals:",
          approvalsLookupError.message
        );
      } else {
        const companyMaterialIdSet =
          new Set(
            companyMaterialIds.map(
              (id) =>
                String(id)
            )
          );

        approvalIds =
          (
            approvals ||
            []
          )
            .filter(
              (approval) =>
                companyMaterialIdSet.has(
                  String(
                    approval.company_material_id
                  )
                )
            )
            .map(
              (approval) =>
                approval.id
            )
            .filter(Boolean);
      }
    }

    console.log(
      `[ADMIN DELETE] Found ${
        approvalIds.length
      } AI approval record(s).`
    );

    /* ========================================================
       5. DELETE AI APPROVAL RECORDS
    ======================================================== */

    if (
      approvalIds.length >
      0
    ) {
      const {
        error:
          approvalDeleteError,
      } =
        await supabase
          .from(
            "ai_code_approvals"
          )
          .delete()
          .in(
            "id",
            approvalIds
          );

      if (
        approvalDeleteError
      ) {
        console.error(
          "[ADMIN DELETE] AI approval deletion failed:",
          approvalDeleteError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not delete AI approval records.",
            details:
              approvalDeleteError.message,
          },
          {
            status: 500,
          }
        );
      }
    }

    /* ========================================================
       6. DELETE MATERIAL EMBEDDINGS
    ======================================================== */

    if (
      materialIds.length >
      0
    ) {
      const {
        error:
          embeddingError,
      } =
        await supabase
          .from(
            "material_embeddings"
          )
          .delete()
          .in(
            "material_id",
            materialIds
          );

      if (
        embeddingError
      ) {
        console.error(
          "[ADMIN DELETE] material_embeddings deletion failed:",
          embeddingError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not delete material embeddings.",
            details:
              embeddingError.message,
          },
          {
            status: 500,
          }
        );
      }

      console.log(
        `[ADMIN DELETE] Deleted embeddings for materials: ${materialIds.join(
          ", "
        )}`
      );
    }

    /* ========================================================
       7. DELETE MATERIAL ATTRIBUTES
    ======================================================== */

    if (
      materialIds.length >
      0
    ) {
      const {
        error:
          attributesError,
      } =
        await supabase
          .from(
            "material_attributes"
          )
          .delete()
          .in(
            "material_id",
            materialIds
          );

      if (
        attributesError
      ) {
        console.error(
          "[ADMIN DELETE] material_attributes deletion failed:",
          attributesError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not delete material attributes.",
            details:
              attributesError.message,
          },
          {
            status: 500,
          }
        );
      }

      console.log(
        `[ADMIN DELETE] Deleted attributes for materials: ${materialIds.join(
          ", "
        )}`
      );
    }

    /* ========================================================
       8. DELETE MATERIAL → NCS MAPPINGS
    ======================================================== */

    if (
      materialIds.length >
      0
    ) {
      const {
        error:
          mappingDeleteError,
      } =
        await supabase
          .from(
            "material_ncs_mapping"
          )
          .delete()
          .in(
            "material_id",
            materialIds
          );

      if (
        mappingDeleteError
      ) {
        console.error(
          "[ADMIN DELETE] material_ncs_mapping deletion failed:",
          mappingDeleteError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not delete material mappings.",
            details:
              mappingDeleteError.message,
          },
          {
            status: 500,
          }
        );
      }

      console.log(
        `[ADMIN DELETE] Deleted NCS mappings for materials: ${materialIds.join(
          ", "
        )}`
      );
    }

    /* ========================================================
       9. DELETE STANDARDIZATION REQUESTS
       
       Only remove requests for NCS IDs that no longer have
       any remaining material mapping.

       This prevents deleting another company's request when
       an NCS is shared by multiple materials.
    ======================================================== */

    if (
      ncsIds.length >
      0
    ) {
      const ncsIdsWithRemainingMappings =
        new Set();

      const {
        data: remainingMappings,
        error:
          remainingMappingError,
      } =
        await supabase
          .from(
            "material_ncs_mapping"
          )
          .select(
            "ncs_id"
          )
          .in(
            "ncs_id",
            ncsIds
          );

      if (
        remainingMappingError
      ) {
        console.warn(
          "[ADMIN DELETE] Could not check remaining NCS mappings:",
          remainingMappingError.message
        );
      } else {
        for (
          const mapping of
            remainingMappings ||
            []
        ) {
          if (
            mapping.ncs_id
          ) {
            ncsIdsWithRemainingMappings.add(
              String(
                mapping.ncs_id
              )
            );
          }
        }
      }

      const removableNcsIds =
        ncsIds.filter(
          (ncsId) =>
            !ncsIdsWithRemainingMappings.has(
              String(ncsId)
            )
        );

      if (
        removableNcsIds.length >
        0
      ) {
        const {
          error:
            requestDeleteError,
        } =
          await supabase
            .from(
              "standardization_requests"
            )
            .delete()
            .in(
              "ncs_id",
              removableNcsIds
            );

        if (
          requestDeleteError
        ) {
          console.warn(
            "[ADMIN DELETE] Standardization request deletion warning:",
            requestDeleteError.message
          );
        } else {
          console.log(
            `[ADMIN DELETE] Deleted standardization requests for NCS IDs: ${removableNcsIds.join(
              ", "
            )}`
          );
        }
      }
    }

    /* ========================================================
       10. DELETE ACTUAL MATERIALS
       
       IMPORTANT:
       This uses the resolved materials.id values, NOT
       company_materials.material_id.
    ======================================================== */

    if (
      materialIds.length >
      0
    ) {
      const {
        error:
          materialsDeleteError,
      } =
        await supabase
          .from(
            "materials"
          )
          .delete()
          .in(
            "id",
            materialIds
          );

      if (
        materialsDeleteError
      ) {
        console.error(
          "[ADMIN DELETE] materials deletion failed:",
          materialsDeleteError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not delete material records.",
            details:
              materialsDeleteError.message,
          },
          {
            status: 500,
          }
        );
      }

      console.log(
        `[ADMIN DELETE] Deleted materials: ${materialIds.join(
          ", "
        )}`
      );
    }

    /* ========================================================
       11. DELETE COMPANY MATERIALS
    ======================================================== */

    const {
      error:
        companyMaterialsDeleteError,
    } =
      await supabase
        .from(
          "company_materials"
        )
        .delete()
        .eq(
          "datasheet_id",
          datasheetId
        );

    if (
      companyMaterialsDeleteError
    ) {
      console.error(
        "[ADMIN DELETE] company_materials deletion failed:",
        companyMaterialsDeleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not delete company material records.",
          details:
            companyMaterialsDeleteError.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      `[ADMIN DELETE] Deleted company_materials for datasheet ${datasheetId}.`
    );

    /* ========================================================
       12. DELETE DATASHEET
    ======================================================== */

    const {
      error:
        datasheetDeleteError,
    } =
      await supabase
        .from(
          "datasheets"
        )
        .delete()
        .eq(
          "datasheet_id",
          datasheetId
        );

    if (
      datasheetDeleteError
    ) {
      console.error(
        "[ADMIN DELETE] datasheets deletion failed:",
        datasheetDeleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not delete datasheet.",
          details:
            datasheetDeleteError.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      `[ADMIN DELETE] Datasheet ${datasheetId} deleted successfully.`
    );

    /* ========================================================
       13. FINAL RESPONSE
    ======================================================== */

    return NextResponse.json({
      success: true,

      message:
        "Datasheet and all associated material records deleted successfully.",

      datasheetId,

      deletedMaterialIds:
        materialIds,

      deletedCompanyMaterialIds:
        companyMaterialIds,

      deletedApprovalIds:
        approvalIds,

      affectedNcsIds:
        ncsIds,
    });
  } catch (error) {
    console.error(
      "[ADMIN DELETE] Unexpected error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Failed to delete datasheet.",
      },
      {
        status: 500,
      }
    );
  }
}