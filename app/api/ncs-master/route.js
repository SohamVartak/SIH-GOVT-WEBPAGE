import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL is missing.",
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    /* =====================================================
       1. LOAD NATIONAL COMMON MATERIALS
    ===================================================== */

    const {
      data: ncsRows,
      error: ncsError,
    } = await supabase
      .from("ncs_materials")
      .select(
        "ncs_id, ncs_code, ncs_name, category, subcategory, standard_specification, status"
      )
      .order(
        "ncs_id",
        {
          ascending: false,
        }
      );

    if (ncsError) {
      console.error(
        "NCS master lookup error:",
        ncsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            ncsError.message,
        },
        { status: 500 }
      );
    }

    const nationalMaterials =
      ncsRows || [];

    /* =====================================================
       2. LOAD NCS MAPPINGS
    ===================================================== */

    const ncsIds =
      nationalMaterials.map(
        (row) => row.ncs_id
      );

    let mappingRows = [];

    if (ncsIds.length > 0) {
      /*
       * Supabase .in() requests can become large,
       * so process NCS IDs in chunks.
       */
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
            "material_id, ncs_id, ai_confidence, match_status, verified"
          )
          .in(
            "ncs_id",
            chunk
          );

        if (error) {
          console.error(
            "NCS mapping lookup error:",
            error
          );

          return NextResponse.json(
            {
              success: false,
              error:
                error.message,
            },
            { status: 500 }
          );
        }

        mappingRows.push(
          ...(data || [])
        );
      }
    }

    /* =====================================================
       3. LOAD MATERIALS FOR THOSE MAPPINGS
    ===================================================== */

    const materialIds = [
      ...new Set(
        mappingRows
          .map(
            (row) =>
              row.material_id
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
            "id, company, company_id, material_number, description, specifications, category"
          )
          .in(
            "id",
            chunk
          );

        if (error) {
          console.error(
            "Mapped material lookup error:",
            error
          );

          return NextResponse.json(
            {
              success: false,
              error:
                error.message,
            },
            { status: 500 }
          );
        }

        materialRows.push(
          ...(data || [])
        );
      }
    }

    /* =====================================================
       4. INDEX MATERIALS
    ===================================================== */

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

    /* =====================================================
       5. GROUP MAPPINGS BY NCS
    ===================================================== */

    const mappingsByNcs =
      new Map();

    mappingRows.forEach(
      (mapping) => {
        const key =
          String(
            mapping.ncs_id
          );

        if (
          !mappingsByNcs.has(key)
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

    /* =====================================================
       6. BUILD NATIONAL MASTER RESPONSE
    ===================================================== */

    const results =
      nationalMaterials.map(
        (ncs) => {
          const mappings =
            mappingsByNcs.get(
              String(
                ncs.ncs_id
              )
            ) || [];

          const mappedMaterials =
            mappings
              .map(
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
                    mapping_id:
                      `${mapping.ncs_id}-${mapping.material_id}`,

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
                      Number.isFinite(
                        Number(
                          mapping.ai_confidence
                        )
                      )
                        ? Number(
                            mapping.ai_confidence
                          )
                        : 0,

                    match_status:
                      mapping.match_status ||
                      "UNKNOWN",

                    verified:
                      mapping.verified ===
                      true,
                  };
                }
              )
              .filter(Boolean);

          const companies = [
            ...new Set(
              mappedMaterials
                .map(
                  (material) =>
                    String(
                      material.company ||
                        ""
                    )
                      .trim()
                      .toUpperCase()
                )
                .filter(Boolean)
            ),
          ].sort();

          const verifiedCount =
            mappedMaterials.filter(
              (material) =>
                material.verified
            ).length;

          const proposedCount =
            mappedMaterials.filter(
              (material) =>
                !material.verified
            ).length;

          const confidenceValues =
            mappedMaterials
              .map(
                (material) =>
                  Number(
                    material.ai_confidence
                  )
              )
              .filter(
                (value) =>
                  Number.isFinite(
                    value
                  ) &&
                  value > 0
              );

          const averageConfidence =
            confidenceValues.length
              ? Number(
                  (
                    confidenceValues.reduce(
                      (sum, value) =>
                        sum + value,
                      0
                    ) /
                    confidenceValues.length
                  ).toFixed(1)
                )
              : 0;

          return {
            ncs_id:
              ncs.ncs_id,

            ncs_code:
              ncs.ncs_code,

            ncs_name:
              ncs.ncs_name ||
              "Unnamed National Material",

            category:
              ncs.category ||
              null,

            subcategory:
              ncs.subcategory ||
              null,

            standard_specification:
              ncs.standard_specification ||
              null,

            status:
              ncs.status ||
              "PROPOSED",

            cpse_count:
              companies.length,

            material_count:
              mappedMaterials.length,

            verified_count:
              verifiedCount,

            proposed_count:
              proposedCount,

            average_confidence:
              averageConfidence,

            companies,

            mappings:
              mappedMaterials,
          };
        }
      );

    /* =====================================================
       7. SUMMARY STATISTICS
    ===================================================== */

    const totalNationalMaterials =
      results.length;

    const approvedNationalMaterials =
      results.filter(
        (row) =>
          String(
            row.status || ""
          ).toUpperCase() ===
          "APPROVED"
      ).length;

    const proposedNationalMaterials =
      results.filter(
        (row) =>
          String(
            row.status || ""
          ).toUpperCase() ===
          "PROPOSED"
      ).length;

    const reviewNationalMaterials =
      results.filter(
        (row) => {
          const status =
            String(
              row.status || ""
            ).toUpperCase();

          return (
            status ===
              "PENDING_REVIEW" ||
            status ===
              "UNDER_REVIEW"
          );
        }
      ).length;

    const totalMappedMaterials =
      results.reduce(
        (sum, row) =>
          sum +
          row.material_count,
        0
      );

    const totalCPSEs =
      new Set(
        results
          .flatMap(
            (row) =>
              row.companies
          )
          .map(
            (company) =>
              String(company)
                .trim()
                .toUpperCase()
          )
      ).size;

    /* =====================================================
       8. RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,

      summary: {
        total_national_materials:
          totalNationalMaterials,

        approved_national_materials:
          approvedNationalMaterials,

        proposed_national_materials:
          proposedNationalMaterials,

        review_national_materials:
          reviewNationalMaterials,

        total_mapped_cpse_materials:
          totalMappedMaterials,

        participating_cpse_count:
          totalCPSEs,
      },

      results,
    });
  } catch (error) {
    console.error(
      "National master API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}