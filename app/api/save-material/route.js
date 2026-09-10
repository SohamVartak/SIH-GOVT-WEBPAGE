import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

// ============================================================
// GEMINI EMBEDDINGS
// ============================================================

const EMBEDDING_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONALITY = 768;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================
// SUPABASE
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
// HELPERS
// ============================================================

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text.length > 0
    ? text
    : null;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function companyCode(company) {
  return normalizeText(company)
    .replace(
      /\s+/g,
      "-"
    )
    .toUpperCase();
}

function createFingerprint(data) {
  const parts = [
    data.material_name,
    data.product_type,
    data.description,
    data.company_material_code,
    data.material_family,
    data.dimensions?.size_range,
    data.dimensions?.nominal_size,
    data.dimensions?.diameter,
    data.dimensions?.length,
    data.dimensions?.width,
    data.dimensions?.height,
    data.dimensions?.thickness,
    data.dimensions?.face_to_face,
    data.dimensions?.pressure_class,
    JSON.stringify(
      data.materials || {}
    ),
    JSON.stringify(
      data.design_features || []
    ),
    JSON.stringify(
      data.standards || []
    ),
    data.pressure_rating,
    data.temperature_rating,
    JSON.stringify(
      data.end_connections || []
    ),
    data.testing_standard,
    data.actuation,
    data.manufacturer,
    data.model,
    data.part_number,
    data.application,
    data.unit_of_measure,
    data.drawing_number,
    data.revision,
    data.datasheet_number,
    data.design_code,
    JSON.stringify(
      data.additional_attributes || {}
    ),
  ];

  return normalizeText(
    parts
      .filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      )
      .join(" | ")
  );
}

function stringify(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value
    );
  } catch {
    return String(value);
  }
}

// ============================================================
// BUILD MATERIAL DETAILS
// ============================================================

function buildMaterialDetails(data) {
  return {
    material_type:
      clean(
        data.material_type
      ) ||
      clean(
        data.product_type
      ),

    material_family:
      clean(
        data.material_family
      ),

    dimensions:
      stringify(
        data.dimensions
      ),

    material_grade:
      clean(
        data.materials
          ?.primary_material
      ) ||
      clean(
        data.materials
          ?.grade
      ) ||
      clean(
        data.materials
          ?.body_material
      ),

    pressure_rating:
      clean(
        data.pressure_rating
      ),

    temperature_rating:
      clean(
        data.temperature_rating
      ),

    standard:
      Array.isArray(
        data.standards
      )
        ? data.standards.join(
            ", "
          )
        : clean(
            data.standards
          ),

    manufacturer:
      clean(
        data.manufacturer
      ),

    model:
      clean(
        data.model
      ),

    part_number:
      clean(
        data.part_number
      ),

    design_features:
      stringify(
        data.design_features
      ),

    application:
      clean(
        data.application
      ),

    unit_of_measure:
      clean(
        data.unit_of_measure
      ),

    raw_attributes: {
      materials:
        data.materials || {},

      standards:
        data.standards || [],

      end_connections:
        data.end_connections ||
        [],

      testing_standard:
        data.testing_standard ||
        null,

      actuation:
        data.actuation ||
        null,

      drawing_number:
        data.drawing_number ||
        null,

      revision:
        data.revision ||
        null,

      datasheet_number:
        data.datasheet_number ||
        null,

      design_code:
        data.design_code ||
        null,

      inspection_requirements:
        data.inspection_requirements ||
        [],

      quality_requirements:
        data.quality_requirements ||
        [],

      additional_attributes:
        data.additional_attributes ||
        {},
    },
  };
}

// ============================================================
// BUILD ENGINEERING SEARCH TEXT
//
// IMPORTANT:
// Company name and original company code are intentionally
// excluded from the embedding text.
// This prevents semantic search from becoming biased toward
// a specific CPSE instead of the engineering identity.
// ============================================================

function buildEmbeddingText(
  data,
  materialDetails
) {
  const parts = [
    `material name: ${
      clean(
        data.material_name
      ) || ""
    }`,

    `product type: ${
      clean(
        data.product_type
      ) || ""
    }`,

    `material type: ${
      clean(
        data.material_type
      ) || ""
    }`,

    `description: ${
      clean(
        data.description
      ) || ""
    }`,

    `specifications: ${
      clean(
        data.specifications
      ) ||
      clean(
        data.additional_attributes
          ?.specifications
      ) ||
      ""
    }`,

    `material family: ${
      materialDetails.material_family ||
      ""
    }`,

    `dimensions: ${
      materialDetails.dimensions ||
      ""
    }`,

    `material grade: ${
      materialDetails.material_grade ||
      ""
    }`,

    `pressure rating: ${
      materialDetails.pressure_rating ||
      ""
    }`,

    `temperature rating: ${
      materialDetails.temperature_rating ||
      ""
    }`,

    `standards: ${
      materialDetails.standard ||
      ""
    }`,

    `manufacturer: ${
      materialDetails.manufacturer ||
      ""
    }`,

    `model: ${
      materialDetails.model ||
      ""
    }`,

    `part number: ${
      materialDetails.part_number ||
      ""
    }`,

    `design features: ${
      materialDetails.design_features ||
      ""
    }`,

    `application: ${
      materialDetails.application ||
      ""
    }`,

    `end connections: ${
      stringify(
        data.end_connections
      ) || ""
    }`,

    `testing standard: ${
      clean(
        data.testing_standard
      ) || ""
    }`,

    `actuation: ${
      clean(
        data.actuation
      ) || ""
    }`,

    `drawing number: ${
      clean(
        data.drawing_number
      ) || ""
    }`,

    `revision: ${
      clean(
        data.revision
      ) || ""
    }`,

    `datasheet number: ${
      clean(
        data.datasheet_number
      ) || ""
    }`,

    `design code: ${
      clean(
        data.design_code
      ) || ""
    }`,

    `additional attributes: ${
      stringify(
        data.additional_attributes
      ) || ""
    }`,

    `materials: ${
      stringify(
        data.materials
      ) || ""
    }`,
  ];

  return parts
    .filter(
      (value) =>
        value &&
        value
          .trim()
          .length > 0
    )
    .join("\n");
}

// ============================================================
// GENERATE EMBEDDING
// ============================================================

async function generateEmbedding(
  text
) {
  const response =
    await ai.models.embedContent({
      model:
        EMBEDDING_MODEL,

      contents:
        text,

      config: {
        outputDimensionality:
          OUTPUT_DIMENSIONALITY,
      },
    });

  const values =
    response?.embeddings?.[0]
      ?.values;

  if (
    !Array.isArray(values) ||
    values.length !==
      OUTPUT_DIMENSIONALITY
  ) {
    throw new Error(
      `Invalid embedding returned. Expected ${OUTPUT_DIMENSIONALITY} dimensions.`
    );
  }

  return values;
}

// ============================================================
// SAVE EMBEDDING
// ============================================================

async function saveMaterialEmbedding(
  supabase,
  materialId,
  embedding,
  searchText
) {
  const {
    error,
  } = await supabase
    .from(
      "material_embeddings"
    )
    .upsert(
      {
        material_id:
          materialId,

        embedding,

        search_text:
          searchText,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "material_id",
      }
    );

  if (error) {
    throw new Error(
      `Failed to save material embedding: ${error.message}`
    );
  }
}

// ============================================================
// GET EXISTING BMG INFORMATION
// ============================================================

async function getBMGInfo(
  supabase,
  material
) {
  if (!material?.bmg_id) {
    return {
      bmg_id: null,
      bmg_code: null,
      ncs_name: null,
      bmg_status: null,
    };
  }

  const {
    data: bmg,
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
    .eq(
      "bmg_id",
      material.bmg_id
    )
    .maybeSingle();

  if (error) {
    console.error(
      "BMG lookup error:",
      error
    );

    return {
      bmg_id:
        material.bmg_id,
      bmg_code: null,
      ncs_name: null,
      bmg_status: null,
    };
  }

  if (!bmg) {
    return {
      bmg_id:
        material.bmg_id,
      bmg_code: null,
      ncs_name: null,
      bmg_status: null,
    };
  }

  return {
    bmg_id:
      bmg.bmg_id,

    bmg_code:
      bmg.bmg_code,

    ncs_name:
      bmg.ncs_name,

    bmg_status:
      bmg.status,
  };
}

// ============================================================
// RETURN EXISTING PRODUCT
// ============================================================

async function existingProductResponse(
  supabase,
  material,
  reason
) {
  const bmg =
    await getBMGInfo(
      supabase,
      material
    );

  return {
    success: true,

    duplicate: true,

    reason,

    message:
      "This product already exists in the database.",

    data: {
      material_id:
        material.id,

      unique_product_code:
        material.unique_product_code,

      bmg_id:
        bmg.bmg_id,

      bmg_code:
        bmg.bmg_code,

      ncs_name:
        bmg.ncs_name,

      bmg_status:
        bmg.bmg_status,

      company:
        material.company,

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

      duplicate_reason:
        reason,
    },
  };
}

// ============================================================
// FIND COMPANY
// ============================================================

async function getOrCreateCompany(
  supabase,
  companyName
) {
  const normalizedCompany =
    clean(companyName);

  if (!normalizedCompany) {
    throw new Error(
      "AI did not provide a company name."
    );
  }

  const {
    data:
      existingCompany,
    error:
      companyLookupError,
  } = await supabase
    .from("companies")
    .select(
      "company_id, company_name, company_type"
    )
    .ilike(
      "company_name",
      normalizedCompany
    )
    .maybeSingle();

  if (companyLookupError) {
    throw new Error(
      `Failed to find company: ${companyLookupError.message}`
    );
  }

  if (existingCompany) {
    return existingCompany;
  }

  const {
    data: newCompany,
    error:
      companyInsertError,
  } = await supabase
    .from("companies")
    .insert({
      company_name:
        normalizedCompany,

      company_type:
        "CPSE",
    })
    .select(
      "company_id, company_name, company_type"
    )
    .single();

  if (companyInsertError) {
    throw new Error(
      `Failed to create company: ${companyInsertError.message}`
    );
  }

  return newCompany;
}

// ============================================================
// FIND / CREATE FACILITY
// ============================================================

async function getOrCreateFacility(
  supabase,
  companyId,
  data
) {
  const facilityName =
    clean(
      data.facility_name
    ) ||
    "Unknown Facility";

  const {
    data:
      existingFacility,
    error:
      facilityLookupError,
  } = await supabase
    .from("facilities")
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
    .eq(
      "company_id",
      companyId
    )
    .ilike(
      "facility_name",
      facilityName
    )
    .maybeSingle();

  if (facilityLookupError) {
    throw new Error(
      `Failed to find facility: ${facilityLookupError.message}`
    );
  }

  if (existingFacility) {
    return existingFacility;
  }

  const location =
    data.location || {};

  const {
    data: newFacility,
    error:
      facilityInsertError,
  } = await supabase
    .from("facilities")
    .insert({
      company_id:
        companyId,

      facility_name:
        facilityName,

      city:
        clean(
          location.city
        ),

      state:
        clean(
          location.state
        ),

      country:
        clean(
          location.country
        ) || "India",

      address:
        clean(
          location.address
        ),
    })
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
    .single();

  if (facilityInsertError) {
    throw new Error(
      `Failed to create facility: ${facilityInsertError.message}`
    );
  }

  return newFacility;
}

// ============================================================
// FIND EXISTING PRODUCT
// ============================================================

async function findExistingProduct(
  supabase,
  companyId,
  materialNumber,
  fingerprint
) {
  // ----------------------------------------------------------
  // CHECK 1:
  // Same company + same material code
  // ----------------------------------------------------------

  if (materialNumber) {
    const {
      data:
        sameCodeRows,
      error:
        sameCodeError,
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
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "material_number",
        materialNumber
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .limit(1);

    if (sameCodeError) {
      throw new Error(
        `Failed duplicate check by material code: ${sameCodeError.message}`
      );
    }

    if (
      sameCodeRows &&
      sameCodeRows.length > 0
    ) {
      return {
        material:
          sameCodeRows[0],

        reason:
          "Same company and same original company material code already exists.",
      };
    }
  }

  // ----------------------------------------------------------
  // CHECK 2:
  // Same company + same fingerprint
  // ----------------------------------------------------------

  if (fingerprint) {
    const {
      data:
        fingerprintRows,
      error:
        fingerprintError,
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
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "product_fingerprint",
        fingerprint
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .limit(1);

    if (fingerprintError) {
      throw new Error(
        `Failed duplicate check by fingerprint: ${fingerprintError.message}`
      );
    }

    if (
      fingerprintRows &&
      fingerprintRows.length > 0
    ) {
      return {
        material:
          fingerprintRows[0],

        reason:
          "Same company and same technical product fingerprint already exists.",
      };
    }
  }

  return null;
}

// ============================================================
// CREATE UNIQUE COMPANY PRODUCT CODE
// ============================================================

function makeUniqueProductCode(
  companyName,
  materialId
) {
  return `BMG-${companyCode(
    companyName
  )}-${materialId}`;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request
) {
  try {
    const supabase =
      getSupabaseAdmin();

    const formData =
      await request.formData();

    // ========================================================
    // INPUT FILE
    // ========================================================

    const file =
      formData.get("file");

    if (
      !file ||
      typeof file === "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PDF file is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // AI STRUCTURED DATA
    // ========================================================

    const aiDataRaw =
      formData.get(
        "aiData"
      );

    if (
      !aiDataRaw ||
      typeof aiDataRaw !==
        "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "AI structured material data is required.",
        },
        {
          status: 400,
        }
      );
    }

    let data;

    try {
      data =
        JSON.parse(
          aiDataRaw
        );
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid AI structured material JSON.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // BASIC NORMALIZATION
    // ========================================================

    const companyName =
      clean(
        data.company
      );

    const materialNumber =
      clean(
        data.company_material_code
      );

    const materialName =
      clean(
        data.material_name
      );

    const description =
      clean(
        data.description
      );

    const specifications =
      clean(
        data.specifications
      ) ||
      clean(
        data.additional_attributes
          ?.specifications
      );

    const category =
      clean(
        data.category
      ) ||
      clean(
        data.material_family
      );

    // ========================================================
    // COMPANY
    // ========================================================

    const company =
      await getOrCreateCompany(
        supabase,
        companyName
      );

    // ========================================================
    // FACILITY
    // ========================================================

    const facility =
      await getOrCreateFacility(
        supabase,
        company.company_id,
        data
      );

    // ========================================================
    // FINGERPRINT
    // ========================================================

    const fingerprint =
      createFingerprint(
        data
      );

    // ========================================================
    // DUPLICATE DETECTION
    // ========================================================

    const existing =
      await findExistingProduct(
        supabase,
        company.company_id,
        materialNumber,
        fingerprint
      );

    if (existing) {
      return NextResponse.json(
        await existingProductResponse(
          supabase,
          existing.material,
          existing.reason
        )
      );
    }

    // ========================================================
    // READ PDF
    // ========================================================

    const fileBuffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    const originalFileName =
      clean(file.name) ||
      `datasheet-${Date.now()}.pdf`;

    // ========================================================
    // STORAGE PATH
    // ========================================================

    const safeCompany =
      companyCode(
        companyName
      ) || "UNKNOWN";

    const timestamp =
      Date.now();

    const safeFileName =
      originalFileName.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const storagePath =
      `${safeCompany}/${timestamp}-${safeFileName}`;

    // ========================================================
    // UPLOAD PDF
    // ========================================================

    const {
      error:
        storageError,
    } = await supabase.storage
      .from("datasheets")
      .upload(
        storagePath,
        fileBuffer,
        {
          contentType:
            file.type ||
            "application/pdf",

          upsert: false,
        }
      );

    if (storageError) {
      throw new Error(
        `Failed to upload PDF to storage: ${storageError.message}`
      );
    }

    // ========================================================
    // DATASHEET RECORD
    // ========================================================

    const {
      data:
        datasheet,
      error:
        datasheetError,
    } = await supabase
      .from("datasheets")
      .insert({
        company_id:
          company.company_id,

        facility_id:
          facility.facility_id,

        file_name:
          originalFileName,

        file_path:
          storagePath,

        file_type:
          "PDF",

        extraction_status:
          "EXTRACTED",

        extraction_error:
          null,

        extracted_at:
          new Date().toISOString(),

        total_rows_extracted:
          1,

        total_rows_added:
          0,

        total_rows_skipped:
          0,

        metadata: {
          uploaded_from:
            "Bharat Material Grid",

          company:
            companyName,

          facility:
            facility.facility_name,

          material_number:
            materialNumber,

          original_filename:
            originalFileName,
        },
      })
      .select()
      .single();

    if (datasheetError) {
      await supabase.storage
        .from("datasheets")
        .remove([
          storagePath,
        ]);

      throw new Error(
        `Failed to save datasheet record: ${datasheetError.message}`
      );
    }

    // ========================================================
    // INSERT MATERIAL
    // ========================================================

    const {
      data:
        insertedMaterial,
      error:
        materialInsertError,
    } = await supabase
      .from("materials")
      .insert({
        company:
          companyName,

        company_id:
          company.company_id,

        facility_id:
          facility.facility_id,

        material_number:
          materialNumber,

        description:
          description ||
          materialName,

        specifications:
          specifications,

        category:
          category,

        unique_product_code:
          null,

        product_fingerprint:
          fingerprint,

        bmg_id:
          null,
      })
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
      .single();

    if (materialInsertError) {
      await supabase.storage
        .from("datasheets")
        .remove([
          storagePath,
        ]);

      await supabase
        .from("datasheets")
        .delete()
        .eq(
          "datasheet_id",
          datasheet.datasheet_id
        );

      throw new Error(
        `Failed to insert material: ${materialInsertError.message}`
      );
    }

    // ========================================================
    // CREATE UNIQUE PRODUCT CODE
    // ========================================================

    const uniqueProductCode =
      makeUniqueProductCode(
        companyName,
        insertedMaterial.id
      );

    const {
      data:
        updatedMaterial,
      error:
        productCodeError,
    } = await supabase
      .from("materials")
      .update({
        unique_product_code:
          uniqueProductCode,
      })
      .eq(
        "id",
        insertedMaterial.id
      )
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
      .single();

    if (productCodeError) {
      throw new Error(
        `Failed to create unique product code: ${productCodeError.message}`
      );
    }

    // ========================================================
    // COMPANY MATERIAL RECORD
    // ========================================================

    const {
      data:
        companyMaterial,
      error:
        companyMaterialError,
    } = await supabase
      .from(
        "company_materials"
      )
      .insert({
        company_id:
          company.company_id,

        datasheet_id:
          datasheet.datasheet_id,

        source_material_id:
          updatedMaterial.id,

        company_material_code:
          materialNumber,

        material_name:
          materialName,

        description:
          description,

        raw_data:
          data,
      })
      .select()
      .single();

    if (companyMaterialError) {
      throw new Error(
        `Failed to save company material: ${companyMaterialError.message}`
      );
    }

    // ========================================================
    // MATERIAL DETAILS
    // ========================================================

    const materialDetails =
      buildMaterialDetails(
        data
      );

    const {
      data:
        savedDetails,
      error:
        detailsError,
    } = await supabase
      .from(
        "material_details"
      )
      .insert({
        material_id:
          updatedMaterial.id,

        ...materialDetails,
      })
      .select()
      .single();

    if (detailsError) {
      throw new Error(
        `Failed to save material technical details: ${detailsError.message}`
      );
    }

    // ========================================================
    // AUTOMATIC ML EMBEDDING
    // ========================================================

    let embeddingStatus =
      "FAILED";

    let embeddingError =
      null;

    try {
      const embeddingText =
        buildEmbeddingText(
          data,
          materialDetails
        );

      if (
        !embeddingText.trim()
      ) {
        throw new Error(
          "No technical information was available for embedding."
        );
      }

      console.log(
        `Generating automatic embedding for material ${updatedMaterial.id}...`
      );

      const embedding =
        await generateEmbedding(
          embeddingText
        );

      await saveMaterialEmbedding(
        supabase,
        updatedMaterial.id,
        embedding,
        embeddingText
      );

      embeddingStatus =
        "GENERATED";

      console.log(
        `Automatic embedding saved for material ${updatedMaterial.id}`
      );
    } catch (error) {
      embeddingStatus =
        "FAILED";

      embeddingError =
        error?.message ||
        String(error);

      /*
       * IMPORTANT:
       * The material itself remains successfully saved.
       *
       * A temporary Gemini/API problem must not
       * destroy the uploaded engineering record.
       */
      console.error(
        `Automatic embedding failed for material ${updatedMaterial.id}:`,
        error
      );
    }

    // ========================================================
    // UPDATE DATASHEET COUNTS
    // ========================================================

    await supabase
      .from("datasheets")
      .update({
        total_rows_added:
          1,

        total_rows_skipped:
          0,
      })
      .eq(
        "datasheet_id",
        datasheet.datasheet_id
      );

    // ========================================================
    // RETURN NEW PRODUCT
    // ========================================================

    return NextResponse.json({
      success: true,

      duplicate: false,

      message:
        "New material saved successfully.",

      data: {
        material_id:
          updatedMaterial.id,

        unique_product_code:
          uniqueProductCode,

        bmg_id:
          null,

        bmg_code:
          null,

        ncs_name:
          null,

        company:
          companyName,

        company_id:
          company.company_id,

        facility_id:
          facility.facility_id,

        facility_name:
          facility.facility_name,

        company_material_code:
          materialNumber,

        material_name:
          materialName,

        description:
          description,

        specifications:
          specifications,

        category:
          category,

        datasheet_id:
          datasheet.datasheet_id,

        company_material_id:
          companyMaterial.material_id,

        detail_id:
          savedDetails.detail_id,

        fingerprint:
          fingerprint,

        ml_embedding_status:
          embeddingStatus,

        ml_embedding_model:
          EMBEDDING_MODEL,

        ml_embedding_dimensions:
          OUTPUT_DIMENSIONALITY,

        ml_embedding_error:
          embeddingError,
      },
    });
  } catch (error) {
    console.error(
      "SAVE MATERIAL ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Failed to save material.",
      },
      {
        status: 500,
      }
    );
  }
}