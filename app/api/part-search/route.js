import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const clean = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

const normalize = (value) => {
  return clean(value).toUpperCase();
};

export async function GET(request) {
  try {
    /* =====================================================
       SUPABASE CONFIGURATION
    ===================================================== */

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL is missing."
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing."
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    /* =====================================================
       READ SEARCH QUERY
    ===================================================== */

    const searchParams =
      request.nextUrl.searchParams;

    const query = (
      searchParams.get("q") || ""
    ).trim();

    if (!query) {
      return NextResponse.json({
        success: true,
        query: "",
        total: 0,
        companies: [],
        results: []
      });
    }

    const searchPattern = `%${query}%`;

    /* =====================================================
       1. SEARCH MAIN MATERIAL TABLE
    ===================================================== */

    const {
      data: materialRows,
      error: materialError
    } = await supabase
      .from("materials")
      .select(
        "id, company, material_number, description, specifications, category"
      )
      .or(
        [
          `material_number.ilike.${searchPattern}`,
          `description.ilike.${searchPattern}`,
          `specifications.ilike.${searchPattern}`,
          `category.ilike.${searchPattern}`
        ].join(",")
      )
      .limit(300);

    if (materialError) {
      console.error(
        "Material search error:",
        materialError
      );

      return NextResponse.json(
        {
          success: false,
          error: materialError.message
        },
        { status: 500 }
      );
    }

    /* =====================================================
       2. SEARCH COMPANY MATERIAL TABLE
    ===================================================== */

    const {
      data: companyMaterialRows,
      error: companyMaterialError
    } = await supabase
      .from("company_materials")
      .select(
        "material_id, company_id, datasheet_id, company_material_code, material_name, description"
      )
      .or(
        [
          `company_material_code.ilike.${searchPattern}`,
          `material_name.ilike.${searchPattern}`,
          `description.ilike.${searchPattern}`
        ].join(",")
      )
      .limit(300);

    if (companyMaterialError) {
      console.error(
        "Company material search warning:",
        companyMaterialError
      );
    }

    const companyMaterials =
      companyMaterialRows || [];

    /* =====================================================
       3. COLLECT RELATED IDS
    ===================================================== */

    const companyIds = [
      ...new Set(
        companyMaterials
          .map(row => row.company_id)
          .filter(Boolean)
      )
    ];

    const datasheetIds = [
      ...new Set(
        companyMaterials
          .map(row => row.datasheet_id)
          .filter(Boolean)
      )
    ];

    const materialIds = [
      ...new Set(
        companyMaterials
          .map(row => row.material_id)
          .filter(Boolean)
      )
    ];

    /* =====================================================
       4. LOAD COMPANY NAMES
    ===================================================== */

    let companyRows = [];

    if (companyIds.length > 0) {
      const {
        data,
        error
      } = await supabase
        .from("companies")
        .select(
          "company_id, company_name"
        )
        .in(
          "company_id",
          companyIds
        );

      if (error) {
        console.error(
          "Company lookup error:",
          error
        );
      } else {
        companyRows = data || [];
      }
    }

    const companyMap = new Map();

    companyRows.forEach(company => {
      companyMap.set(
        String(company.company_id),
        company.company_name
      );
    });

    /* =====================================================
       5. LOAD DATASHEET RECORDS
    ===================================================== */

    let datasheetRows = [];

    if (datasheetIds.length > 0) {
      const {
        data,
        error
      } = await supabase
        .from("datasheets")
        .select(
          "datasheet_id, file_name, file_path, file_type"
        )
        .in(
          "datasheet_id",
          datasheetIds
        );

      if (error) {
        console.error(
          "Datasheet lookup error:",
          error
        );
      } else {
        datasheetRows = data || [];
      }
    }

    const datasheetMap = new Map();

    datasheetRows.forEach(datasheet => {
      datasheetMap.set(
        String(datasheet.datasheet_id),
        datasheet
      );
    });

    /* =====================================================
       6. LOAD MATERIAL ATTRIBUTES
    ===================================================== */

    let attributeRows = [];

    if (materialIds.length > 0) {
      const {
        data,
        error
      } = await supabase
        .from("material_attributes")
        .select(
          "material_id, material_family, dimensions, material_grade, pressure_rating, temperature_rating, standards, manufacturer, model, design_features, other_attributes"
        )
        .in(
          "material_id",
          materialIds
        );

      if (error) {
        console.error(
          "Material attributes lookup error:",
          error
        );
      } else {
        attributeRows = data || [];
      }
    }

    const attributeMap = new Map();

    attributeRows.forEach(attribute => {
      attributeMap.set(
        String(attribute.material_id),
        attribute
      );
    });

    /* =====================================================
       7. INDEX MAIN MATERIAL RECORDS
    ===================================================== */

    const materialMap = new Map();

    (materialRows || []).forEach(material => {
      materialMap.set(
        String(material.id),
        material
      );
    });

    /* =====================================================
       8. CREATE RESULTS FROM COMPANY MATERIALS
    ===================================================== */

    const structuredResults =
      companyMaterials.map(row => {

        const material =
          materialMap.get(
            String(row.material_id)
          ) || null;

        const datasheet =
          row.datasheet_id
            ? datasheetMap.get(
                String(row.datasheet_id)
              )
            : null;

        const attributes =
          attributeMap.get(
            String(row.material_id)
          ) || null;

        const company =
          companyMap.get(
            String(row.company_id)
          ) ||
          material?.company ||
          "Unknown Company";

        return {
          company,

          company_id:
            row.company_id || null,

          material_id:
            row.material_id || null,

          material_number:
            material?.material_number ||
            null,

          company_material_code:
            row.company_material_code ||
            null,

          material_name:
            row.material_name ||
            material?.description ||
            null,

          description:
            row.description ||
            material?.description ||
            null,

          specifications:
            material?.specifications ||
            null,

          category:
            material?.category ||
            null,

          bmg_id:
            material?.bmg_id ||
            null,

          datasheet_id:
            row.datasheet_id ||
            null,

          datasheet_file_name:
            datasheet?.file_name ||
            null,

          datasheet_file_path:
            datasheet?.file_path ||
            null,

          datasheet_file_type:
            datasheet?.file_type ||
            null,

          attributes
        };
      });

    /* =====================================================
       9. ADD MATERIAL TABLE RESULTS
          THAT HAVE NO COMPANY_MATERIAL RECORD
    ===================================================== */

    const structuredMaterialIds =
      new Set(
        companyMaterials
          .map(row =>
            String(row.material_id)
          )
          .filter(Boolean)
      );

    const fallbackResults =
      (materialRows || [])
        .filter(
          material =>
            !structuredMaterialIds.has(
              String(material.id)
            )
        )
        .map(material => ({
          company:
            material.company ||
            "Unknown Company",

          company_id:
            null,

          material_id:
            material.id,

          material_number:
            material.material_number ||
            null,

          company_material_code:
            material.material_number ||
            null,

          material_name:
            material.description ||
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

          bmg_id:
            material.bmg_id ||
            null,

          datasheet_id:
            null,

          datasheet_file_name:
            null,

          datasheet_file_path:
            null,

          datasheet_file_type:
            null,

          attributes:
            null
        }));

    /* =====================================================
       10. COMBINE RESULTS
    ===================================================== */

    const combinedResults = [
      ...structuredResults,
      ...fallbackResults
    ];

    /* =====================================================
       11. REMOVE DUPLICATES
    ===================================================== */

    const seen = new Set();

    const results =
      combinedResults.filter(result => {

        const key = [
          normalize(result.company),
          normalize(
            result.company_material_code
          ),
          normalize(
            result.material_number
          ),
          normalize(
            result.material_name
          )
        ].join("|");

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });

    /* =====================================================
       12. COMPANY LIST
    ===================================================== */

    const companies = [
      ...new Set(
        results
          .map(result =>
            normalize(result.company)
          )
          .filter(Boolean)
      )
    ].sort();

    /* =====================================================
       13. RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,
      query,
      total: results.length,
      companies,
      results
    });

  } catch (error) {

    console.error(
      "Part search API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          String(error)
      },
      { status: 500 }
    );
  }
}