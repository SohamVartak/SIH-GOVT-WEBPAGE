import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    // ==========================================
    // SUPABASE CONFIGURATION
    // ==========================================

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "NEXT_PUBLIC_SUPABASE_URL is missing.",
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error: "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // ==========================================
    // READ REQUEST
    // ==========================================

    const body = await request.json();

    const {
      company,
      fileName,
      structuredData,
    } = body;

    if (!company || !structuredData) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company and structured data are required.",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 1. FIND COMPANY
    // ==========================================

    const {
      data: companyResults,
      error: companyError,
    } = await supabase
      .from("companies")
      .select("company_id, company_name")
      .ilike("company_name", company)
      .limit(1);

    if (companyError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to find company.",
          details: companyError.message,
        },
        { status: 500 }
      );
    }

    if (
      !companyResults ||
      companyResults.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Company "${company}" was not found in the database.`,
        },
        { status: 400 }
      );
    }

    const companyData = companyResults[0];

    // ==========================================
    // 2. CREATE DATASHEET RECORD
    // ==========================================

    const {
      data: datasheet,
      error: datasheetError,
    } = await supabase
      .from("datasheets")
      .insert({
        company_id:
          companyData.company_id,

        file_name:
          fileName || null,

        file_type:
          "pdf",
      })
      .select()
      .single();

    if (datasheetError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to create datasheet record.",
          details:
            datasheetError.message,
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 3. CREATE COMPANY MATERIAL
    // ==========================================

    const {
      data: material,
      error: materialError,
    } = await supabase
      .from("company_materials")
      .insert({
        company_id:
          companyData.company_id,

        datasheet_id:
          datasheet.datasheet_id,

        company_material_code:
          structuredData.company_material_code ||
          null,

        material_name:
          structuredData.material_name ||
          null,

        description:
          structuredData.description ||
          null,
      })
      .select()
      .single();

    if (materialError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to create material record.",
          details:
            materialError.message,
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 4. CREATE MATERIAL ATTRIBUTES
    // ==========================================

    const dimensions =
      structuredData.dimensions || {};

    const materials =
      structuredData.materials || {};

    const {
      error: attributesError,
    } = await supabase
      .from("material_attributes")
      .insert({
        material_id:
          material.material_id,

        material_family:
          structuredData.material_family ||
          null,

        dimensions:
          dimensions,

        material_grade:
          materials.body ||
          null,

        pressure_rating:
          structuredData.pressure_rating ||
          null,

        temperature_rating:
          structuredData.temperature_rating ||
          null,

        standards:
          structuredData.standards ||
          [],

        manufacturer:
          structuredData.manufacturer ||
          null,

        model:
          structuredData.model ||
          null,

        design_features:
          structuredData.design_features ||
          [],

        other_attributes:
          structuredData.additional_attributes ||
          {},
      });

    if (attributesError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to create material attributes.",
          details:
            attributesError.message,
        },
        { status: 500 }
      );
    }

    // ==========================================
    // SUCCESS
    // ==========================================

    return NextResponse.json({
      success: true,

      message:
        "Material saved successfully.",

      data: {
        company_id:
          companyData.company_id,

        company_name:
          companyData.company_name,

        datasheet_id:
          datasheet.datasheet_id,

        material_id:
          material.material_id,
      },
    });

  } catch (error) {
    console.error(
      "Save material error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to save material.",

        details:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}