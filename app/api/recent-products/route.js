import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ============================================================
// SUPABASE ADMIN
// ============================================================

function getSupabaseAdmin() {
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

// ============================================================
// GET RECENT PRODUCTS
//
// Default: latest 20 products
//
// Optional:
// /api/recent-products?limit=10
// ============================================================

export async function GET(
  request
) {
  try {
    const supabase =
      getSupabaseAdmin();

    const url =
      new URL(
        request.url
      );

    let limit =
      Number(
        url.searchParams.get(
          "limit"
        )
      );

    if (
      !limit ||
      Number.isNaN(limit)
    ) {
      limit = 20;
    }

    // Keep this endpoint small for testing.
    limit = Math.min(
      Math.max(
        limit,
        1
      ),
      50
    );

    // ========================================================
    // LOAD RECENT MATERIALS
    // ========================================================

    const {
      data: materials,
      error: materialsError,
    } = await supabase
      .from("materials")
      .select(
        `
          id,
          company,
          company_id,
          facility_id,
          material_number,
          description,
          specifications,
          category,
          unique_product_code,
          product_fingerprint,
          bmg_id
        `
      )
      .order(
        "id",
        {
          ascending: false,
        }
      )
      .limit(
        limit
      );

    if (materialsError) {
      throw new Error(
        `Failed to load recent products: ${materialsError.message}`
      );
    }

    if (
      !materials ||
      materials.length === 0
    ) {
      return NextResponse.json({
        success: true,
        count: 0,
        products: [],
      });
    }

    // ========================================================
    // IDS
    // ========================================================

    const materialIds =
      materials.map(
        (material) =>
          material.id
      );

    const companyIds = [
      ...new Set(
        materials
          .map(
            (material) =>
              material.company_id
          )
          .filter(
            (value) =>
              value !== null &&
              value !== undefined
          )
      ),
    ];

    const facilityIds = [
      ...new Set(
        materials
          .map(
            (material) =>
              material.facility_id
          )
          .filter(
            (value) =>
              value !== null &&
              value !== undefined
          )
      ),
    ];

    const bmgIds = [
      ...new Set(
        materials
          .map(
            (material) =>
              material.bmg_id
          )
          .filter(
            (value) =>
              value !== null &&
              value !== undefined
          )
      ),
    ];

    // ========================================================
    // LOAD COMPANIES
    // ========================================================

    let companies = [];

    if (
      companyIds.length > 0
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "companies"
        )
        .select(
          `
            company_id,
            company_name,
            company_type
          `
        )
        .in(
          "company_id",
          companyIds
        );

      if (error) {
        throw new Error(
          `Failed to load companies: ${error.message}`
        );
      }

      companies =
        data || [];
    }

    // ========================================================
    // LOAD FACILITIES
    // ========================================================

    let facilities = [];

    if (
      facilityIds.length > 0
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "facilities"
        )
        .select(
          `
            facility_id,
            company_id,
            facility_name,
            city,
            state,
            country,
            address
          `
        )
        .in(
          "facility_id",
          facilityIds
        );

      if (error) {
        throw new Error(
          `Failed to load facilities: ${error.message}`
        );
      }

      facilities =
        data || [];
    }

    // ========================================================
    // LOAD BMG
    // ========================================================

    let bmgRows = [];

    if (
      bmgIds.length > 0
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "bmg_materials"
        )
        .select(
          `
            bmg_id,
            bmg_code,
            ncs_name,
            category,
            subcategory,
            ncs_standard_specification,
            status
          `
        )
        .in(
          "bmg_id",
          bmgIds
        );

      if (error) {
        throw new Error(
          `Failed to load BMG identities: ${error.message}`
        );
      }

      bmgRows =
        data || [];
    }

    // ========================================================
    // LOAD TECHNICAL DETAILS
    // ========================================================

    const {
      data: details,
      error: detailsError,
    } = await supabase
      .from(
        "material_details"
      )
      .select("*")
      .in(
        "material_id",
        materialIds
      );

    if (detailsError) {
      throw new Error(
        `Failed to load technical details: ${detailsError.message}`
      );
    }

    // ========================================================
    // LOAD BMG MAPPINGS
    // ========================================================

    const {
      data: mappings,
      error: mappingsError,
    } = await supabase
      .from(
        "material_bmg_mapping"
      )
      .select(
        `
          mapping_id,
          material_id,
          bmg_id,
          match_status,
          ai_confidence,
          ai_reason,
          verified,
          verified_by,
          verified_at,
          active
        `
      )
      .in(
        "material_id",
        materialIds
      )
      .eq(
        "active",
        true
      );

    if (mappingsError) {
      throw new Error(
        `Failed to load BMG mappings: ${mappingsError.message}`
      );
    }

    // ========================================================
    // MAPS
    // ========================================================

    const companyMap =
      new Map();

    for (
      const company of
      companies
    ) {
      companyMap.set(
        company.company_id,
        company
      );
    }

    const facilityMap =
      new Map();

    for (
      const facility of
      facilities
    ) {
      facilityMap.set(
        facility.facility_id,
        facility
      );
    }

    const bmgMap =
      new Map();

    for (
      const bmg of
      bmgRows
    ) {
      bmgMap.set(
        bmg.bmg_id,
        bmg
      );
    }

    const detailMap =
      new Map();

    for (
      const detail of
      details || []
    ) {
      detailMap.set(
        detail.material_id,
        detail
      );
    }

    const mappingMap =
      new Map();

    for (
      const mapping of
      mappings || []
    ) {
      mappingMap.set(
        mapping.material_id,
        mapping
      );
    }

    // ========================================================
    // BUILD RESPONSE
    // ========================================================

    const products =
      materials.map(
        (material) => {
          const company =
            companyMap.get(
              material.company_id
            );

          const facility =
            facilityMap.get(
              material.facility_id
            );

          const bmg =
            bmgMap.get(
              material.bmg_id
            );

          const detail =
            detailMap.get(
              material.id
            );

          const mapping =
            mappingMap.get(
              material.id
            );

          return {
            material_id:
              material.id,

            company:
              company?.company_name ||
              material.company ||
              null,

            company_id:
              material.company_id,

            company_type:
              company?.company_type ||
              null,

            company_material_code:
              material.material_number,

            material_name:
              material.description,

            description:
              material.description,

            specifications:
              material.specifications,

            category:
              material.category,

            unique_product_code:
              material.unique_product_code,

            product_fingerprint:
              material.product_fingerprint,

            facility: {
              facility_id:
                material.facility_id,

              facility_name:
                facility?.facility_name ||
                null,

              city:
                facility?.city ||
                null,

              state:
                facility?.state ||
                null,

              country:
                facility?.country ||
                null,

              address:
                facility?.address ||
                null,
            },

            bmg: bmg
              ? {
                  bmg_id:
                    bmg.bmg_id,

                  bmg_code:
                    bmg.bmg_code,

                  ncs_name:
                    bmg.ncs_name,

                  category:
                    bmg.category,

                  subcategory:
                    bmg.subcategory,

                  ncs_standard_specification:
                    bmg.ncs_standard_specification,

                  status:
                    bmg.status,
                }
              : {
                  bmg_id:
                    null,

                  bmg_code:
                    null,

                  ncs_name:
                    null,

                  category:
                    null,

                  subcategory:
                    null,

                  ncs_standard_specification:
                    null,

                  status:
                    null,
                },

            bmg_mapping:
              mapping
                ? {
                    mapping_id:
                      mapping.mapping_id,

                    match_status:
                      mapping.match_status,

                    ai_confidence:
                      mapping.ai_confidence,

                    ai_reason:
                      mapping.ai_reason,

                    verified:
                      mapping.verified,

                    verified_by:
                      mapping.verified_by,

                    verified_at:
                      mapping.verified_at,

                    active:
                      mapping.active,
                  }
                : null,

            technical_details:
              detail || null,
          };
        }
      );

    // ========================================================
    // RESPONSE
    // ========================================================

    return NextResponse.json({
      success:
        true,

      count:
        products.length,

      products:
        products,
    });
  } catch (error) {
    console.error(
      "RECENT PRODUCTS ERROR:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          "Failed to load recent products.",

        details:
          error?.message ||
          String(error),
      },
      {
        status:
          500,
      }
    );
  }
}