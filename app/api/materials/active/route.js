import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* ============================================================
   BASIC HELPERS
============================================================ */

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/* ============================================================
   GET ACTIVE MATERIALS
============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. LOAD MATERIALS
    ======================================================== */

    const {
      data: materials,
      error: materialsError,
    } = await supabase
      .from("materials")
      .select(`
        id,
        company,
        company_id,
        material_number,
        description,
        specifications,
        category
      `)
      .order("id", {
        ascending: false,
      })
      .limit(5000);

    if (materialsError) {
      console.error(
        "MATERIALS LOAD ERROR:",
        materialsError
      );

      return Response.json(
        {
          success: false,
          error: materialsError.message,
          materials: [],
        },
        {
          status: 500,
        }
      );
    }

    /* ========================================================
       2. LOAD REJECTED AI APPROVALS
    ======================================================== */

    const {
      data: rejectedApprovals,
      error: rejectedError,
    } = await supabase
      .from("ai_code_approvals")
      .select(`
        company_material_id
      `)
      .eq(
        "approval_status",
        "REJECTED"
      );

    /*
     * Rejected approvals are supplementary information.
     *
     * If this table cannot be read, we should NOT prevent
     * the entire material list from loading.
     */

    if (rejectedError) {
      console.warn(
        "REJECTED APPROVAL LOAD WARNING:",
        rejectedError.message
      );
    }

    /* ========================================================
       3. COLLECT REJECTED MATERIAL IDs
    ======================================================== */

    const rejectedMaterialIds = [
      ...new Set(
        (rejectedApprovals || [])
          .map(
            (row) =>
              row.company_material_id
          )
          .filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              value !== ""
          )
          .map(
            (value) =>
              Number(value)
          )
          .filter(
            (value) =>
              Number.isFinite(value)
          )
      ),
    ];

    /* ========================================================
       4. RESOLVE REJECTED COMPANY MATERIALS
    ======================================================== */

    const rejectedMaterialKeys =
      new Set();

    if (
      rejectedMaterialIds.length > 0
    ) {
      /*
       * IMPORTANT:
       *
       * company_materials DOES NOT HAVE an "id" column.
       *
       * Your table contains:
       *
       * material_id
       * company_id
       * datasheet_id
       * company_material_code
       * material_name
       * description
       *
       * Therefore we use material_id here.
       */

      const {
        data: rejectedCompanyMaterials,
        error: companyMaterialError,
      } = await supabase
        .from("company_materials")
        .select(`
          material_id,
          company_id,
          company_material_code
        `)
        .in(
          "material_id",
          rejectedMaterialIds
        );

      if (companyMaterialError) {
        console.warn(
          "REJECTED COMPANY MATERIAL LOAD WARNING:",
          companyMaterialError.message
        );
      } else {
        /*
         * Create lookup keys using:
         *
         * company_id + company material code
         */

        for (
          const row of
            rejectedCompanyMaterials ||
            []
        ) {
          const key =
            `${row.company_id}|` +
            `${normalizeCode(
              row.company_material_code
            )}`;

          rejectedMaterialKeys.add(
            key
          );
        }
      }
    }

    /* ========================================================
       5. REMOVE REJECTED MATERIALS
    ======================================================== */

    const activeMaterials =
      (materials || []).filter(
        (material) => {
          const key =
            `${material.company_id}|` +
            `${normalizeCode(
              material.material_number
            )}`;

          return !rejectedMaterialKeys.has(
            key
          );
        }
      );

    /* ========================================================
       6. LOAD BMG MAPPINGS
    ======================================================== */

    const materialIds =
      activeMaterials
        .map(
          (material) =>
            Number(material.id)
        )
        .filter(
          (id) =>
            Number.isFinite(id)
        );

    const bmgByMaterialId =
      new Map();

    if (
      materialIds.length > 0
    ) {
      try {
        /* ====================================================
           6A. MATERIAL -> BMG MAPPING
        ==================================================== */

        const {
          data: mappings,
          error: mappingError,
        } = await supabase
          .from(
            "material_ncs_mapping"
          )
          .select(`
            material_id,
            ncs_id,
            ai_confidence,
            match_status,
            verified
          `)
          .in(
            "material_id",
            materialIds
          );

        if (mappingError) {
          console.warn(
            "BMG MAPPING LOAD WARNING:",
            mappingError.message
          );
        } else if (
          mappings &&
          mappings.length > 0
        ) {
          /* ==================================================
             6B. COLLECT BMG IDS
          ================================================== */

          const ncsIds = [
            ...new Set(
              mappings
                .map(
                  (row) =>
                    row.ncs_id
                )
                .filter(
                  (value) =>
                    value !== null &&
                    value !== undefined &&
                    value !== ""
                )
            ),
          ];

          /* ==================================================
             6C. LOAD BMG STANDARDS
          ================================================== */

          if (
            ncsIds.length > 0
          ) {
            const {
              data: ncsMaterials,
              error: ncsError,
            } = await supabase
              .from(
                "ncs_materials"
              )
              .select(`
                ncs_id,
                ncs_code,
                ncs_name,
                status
              `)
              .in(
                "ncs_id",
                ncsIds
              );

            if (ncsError) {
              console.warn(
                "BMG STANDARD LOAD WARNING:",
                ncsError.message
              );
            } else {
              /* ==============================================
                 6D. INDEX BMG STANDARDS
              ============================================== */

              const ncsMap =
                new Map(
                  (
                    ncsMaterials ||
                    []
                  ).map(
                    (row) => [
                      String(
                        row.ncs_id
                      ),
                      row,
                    ]
                  )
                );

              /* ==============================================
                 6E. SELECT BEST MAPPING
              ============================================== */

              const bestMappingByMaterial =
                new Map();

              for (
                const mapping of
                  mappings
              ) {
                const materialId =
                  Number(
                    mapping.material_id
                  );

                const ncs =
                  ncsMap.get(
                    String(
                      mapping.ncs_id
                    )
                  );

                if (!ncs) {
                  continue;
                }

                const current =
                  bestMappingByMaterial.get(
                    materialId
                  );

                const currentVerified =
                  current?.verified ===
                  true;

                const newVerified =
                  mapping.verified ===
                  true;

                const currentConfidence =
                  Number(
                    current?.ai_confidence ||
                      0
                  );

                const newConfidence =
                  Number(
                    mapping.ai_confidence ||
                      0
                  );

                let shouldReplace =
                  false;

                if (!current) {
                  shouldReplace =
                    true;
                } else if (
                  newVerified &&
                  !currentVerified
                ) {
                  shouldReplace =
                    true;
                } else if (
                  newVerified ===
                    currentVerified &&
                  newConfidence >
                    currentConfidence
                ) {
                  shouldReplace =
                    true;
                }

                if (
                  shouldReplace
                ) {
                  bestMappingByMaterial.set(
                    materialId,
                    {
                      mapping,
                      ncs,
                    }
                  );
                }
              }

              /* ==============================================
                 6F. BUILD FINAL BMG LOOKUP
              ============================================== */

              for (
                const [
                  materialId,
                  value,
                ] of bestMappingByMaterial
              ) {
                bmgByMaterialId.set(
                  materialId,
                  {
                    bmg_code:
                      value.ncs
                        .ncs_code ||
                      null,

                    ai_name:
                      value.ncs
                        .ncs_name ||
                      null,

                    bmg_id:
                      value.ncs
                        .ncs_id ||
                      null,

                    bmg_status:
                      value.ncs
                        .status ||
                      null,

                    ai_confidence:
                      Number(
                        value.mapping
                          .ai_confidence ||
                          0
                      ),

                    match_status:
                      value.mapping
                        .match_status ||
                      null,

                    verified:
                      value.mapping
                        .verified ===
                      true,
                  }
                );
              }
            }
          }
        }
      } catch (error) {
        /*
         * BMG data is supplementary.
         *
         * The active-material endpoint must still work if
         * BMG tables have a temporary problem.
         */

        console.warn(
          "BMG MAPPING LOAD WARNING:",
          error?.message
        );
      }
    }

    /* ========================================================
       7. ADD BMG INFORMATION
    ======================================================== */

    const finalMaterials =
      activeMaterials.map(
        (material) => {
          const mapping =
            bmgByMaterialId.get(
              Number(
                material.id
              )
            );

          return {
            ...material,

            bmg_code:
              mapping?.bmg_code ||
              null,

            ai_name:
              mapping?.ai_name ||
              null,

            bmg_id:
              mapping?.bmg_id ||
              null,

            bmg_status:
              mapping?.bmg_status ||
              null,

            ai_confidence:
              mapping?.ai_confidence ??
              null,

            match_status:
              mapping?.match_status ||
              null,

            verified:
              mapping?.verified ??
              false,
          };
        }
      );

    /* ========================================================
       8. RETURN MATERIALS
    ======================================================== */

    return Response.json(
      {
        success: true,

        materials:
          finalMaterials,

        count:
          finalMaterials.length,

        totalMaterials:
          (materials || []).length,

        rejectedMaterials:
          (materials || []).length -
          finalMaterials.length,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "=================================================="
    );

    console.error(
      "ACTIVE MATERIALS API ERROR:",
      error
    );

    console.error(
      "=================================================="
    );

    return Response.json(
      {
        success: false,

        error:
          error?.message ||
          "Failed to load active materials",

        materials: [],
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}