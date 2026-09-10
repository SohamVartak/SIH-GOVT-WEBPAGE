import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { extractText } from "unpdf";

export const runtime = "nodejs";

/* =========================================================
   CONFIGURATION
========================================================= */

const EMBEDDING_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONALITY = 768;

/* =========================================================
   GEMINI CLIENT
========================================================= */

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/* =========================================================
   SAFE TEXT HELPERS
========================================================= */

function safeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value);
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value)
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return normalizeValue(match[1]);
    }
  }

  return null;
}

/* =========================================================
   MATERIAL NUMBER EXTRACTION
========================================================= */

function extractMaterialNumber(text) {
  return firstMatch(text, [
    /(?:material\s*(?:no|number|code)|material\s*id)\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

    /(?:item\s*(?:no|number|code))\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

    /(?:part\s*(?:no|number|code))\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

    /(?:sap\s*(?:no|number|code))\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

    /(?:catalogue\s*(?:no|number|code))\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

    /(?:catalog\s*(?:no|number|code))\s*[:#-]?\s*([A-Z0-9._/-]+)/i,
  ]);
}

/* =========================================================
   DESCRIPTION EXTRACTION
========================================================= */

function extractDescription(text) {
  const value = firstMatch(text, [
    /(?:material\s*description|description)\s*[:\-]\s*(.+)/i,

    /(?:item\s*description)\s*[:\-]\s*(.+)/i,

    /(?:product\s*description)\s*[:\-]\s*(.+)/i,

    /(?:equipment\s*description)\s*[:\-]\s*(.+)/i,
  ]);

  if (value) {
    return value.slice(0, 1000);
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .slice(0, 10)
    .join(" ")
    .slice(0, 1000);
}

/* =========================================================
   CATEGORY DETECTION
========================================================= */

function detectCategory(text) {
  const lower = text.toLowerCase();

  /*
   * IMPORTANT:
   * Valve is intentionally checked BEFORE sealing terms.
   *
   * A valve datasheet can contain words such as:
   * seal, gasket, packing, seat, etc.
   *
   * Therefore those words must not cause the whole item
   * to be classified as "Sealing".
   */

  if (
    lower.includes("check valve") ||
    lower.includes("swing check valve") ||
    lower.includes("gate valve") ||
    lower.includes("globe valve") ||
    lower.includes("ball valve") ||
    lower.includes("butterfly valve") ||
    lower.includes("plug valve") ||
    lower.includes("needle valve") ||
    lower.includes("control valve") ||
    lower.includes("relief valve") ||
    lower.includes("safety valve") ||
    lower.includes("non return valve") ||
    lower.includes("non-return valve") ||
    lower.includes("nrv") ||
    lower.includes("valve")
  ) {
    return "Valve";
  }

  if (
    lower.includes("pump") ||
    lower.includes("centrifugal pump") ||
    lower.includes("pump assembly")
  ) {
    return "Pump";
  }

  if (
    lower.includes("bearing") ||
    lower.includes("roller bearing") ||
    lower.includes("ball bearing") ||
    lower.includes("thrust bearing")
  ) {
    return "Bearing";
  }

  if (
    lower.includes("motor") ||
    lower.includes("electric motor") ||
    lower.includes("induction motor")
  ) {
    return "Motor";
  }

  if (
    lower.includes("bolt") ||
    lower.includes("nut") ||
    lower.includes("screw") ||
    lower.includes("fastener") ||
    lower.includes("washer")
  ) {
    return "Fastener";
  }

  if (
    lower.includes("pipe") ||
    lower.includes("tube") ||
    lower.includes("piping") ||
    lower.includes("flange")
  ) {
    return "Piping";
  }

  if (
    lower.includes("transformer") ||
    lower.includes("switchgear") ||
    lower.includes("electrical panel") ||
    lower.includes("breaker") ||
    lower.includes("contactor")
  ) {
    return "Electrical";
  }

  if (
    lower.includes("compressor") ||
    lower.includes("compressor package")
  ) {
    return "Compressor";
  }

  if (
    lower.includes("filter") ||
    lower.includes("strainer")
  ) {
    return "Filtration";
  }

  /*
   * Sealing is checked after Valve so that valve
   * datasheets containing "seal" or "gasket" don't
   * get misclassified.
   */

  if (
    lower.includes("o-ring") ||
    lower.includes("o ring") ||
    lower.includes("oring") ||
    lower.includes("seal") ||
    lower.includes("gasket") ||
    lower.includes("packing")
  ) {
    return "Sealing";
  }

  return "General";
}

/* =========================================================
   ENGINEERING ATTRIBUTE EXTRACTION
========================================================= */

function buildAttributes(
  text,
  materialNumber,
  description,
  category
) {
  const lower = text.toLowerCase();

  const attributes = {
    material_number:
      materialNumber,

    description:
      description,

    category:
      category,

    material_family:
      category,

    dimensions:
      null,

    material_grade:
      null,

    pressure_rating:
      null,

    temperature_rating:
      null,

    standards:
      null,

    manufacturer:
      null,

    model:
      null,

    design_features:
      null,

    size:
      null,

    thickness:
      null,

    hardness:
      null,

    color:
      null,

    application:
      null,

    other_attributes:
      null,
  };

  /* =======================================================
     DIMENSIONS
  ======================================================= */

  attributes.dimensions =
    firstMatch(
      text,
      [
        /(?:dimensions?)\s*[:\-]\s*(.{1,300})/i,

        /(?:dimension\s*details)\s*[:\-]\s*(.{1,300})/i,

        /(?:dim)\.?\s*[:\-]\s*(.{1,300})/i,
      ]
    );

  /* =======================================================
     MATERIAL / GRADE
  ======================================================= */

  attributes.material_grade =
    firstMatch(
      text,
      [
        /(?:material\s*grade|material|grade)\s*[:\-]\s*(.{1,150})/i,

        /(?:material\s*specification)\s*[:\-]\s*(.{1,150})/i,

        /(?:material\s*type)\s*[:\-]\s*(.{1,150})/i,
      ]
    );

  /* =======================================================
     PRESSURE
  ======================================================= */

  attributes.pressure_rating =
    firstMatch(
      text,
      [
        /(?:pressure\s*(?:rating|class))\s*[:\-]?\s*(.{1,100})/i,

        /(?:working\s*pressure)\s*[:\-]?\s*(.{1,100})/i,

        /(?:rated\s*pressure)\s*[:\-]?\s*(.{1,100})/i,

        /\b(Class\s*[0-9A-Z/-]+)\b/i,
      ]
    );

  /* =======================================================
     TEMPERATURE
  ======================================================= */

  attributes.temperature_rating =
    firstMatch(
      text,
      [
        /(?:temperature\s*(?:rating|range))\s*[:\-]?\s*(.{1,120})/i,

        /(?:working\s*temperature)\s*[:\-]?\s*(.{1,120})/i,

        /(?:operating\s*temperature)\s*[:\-]?\s*(.{1,120})/i,

        /(?:rated\s*temperature)\s*[:\-]?\s*(.{1,120})/i,
      ]
    );

  /* =======================================================
     STANDARDS
  ======================================================= */

  attributes.standards =
    firstMatch(
      text,
      [
        /(?:standard|standards)\s*[:\-]\s*(.{1,300})/i,

        /(?:specification|specifications)\s*[:\-]\s*(.{1,300})/i,

        /\b(ISO\s*[0-9][0-9A-Z./-]*)\b/i,

        /\b(ASTM\s*[A-Z0-9./-]+)\b/i,

        /\b(ASME\s*[A-Z0-9./-]+)\b/i,

        /\b(API\s*[0-9A-Z./-]+)\b/i,

        /\b(DIN\s*[A-Z0-9./-]+)\b/i,

        /\b(BS\s*[A-Z0-9./-]+)\b/i,

        /\b(IS\s*[A-Z0-9./-]+)\b/i,
      ]
    );

  /* =======================================================
     MANUFACTURER
  ======================================================= */

  attributes.manufacturer =
    firstMatch(
      text,
      [
        /(?:manufacturer|make|manufacturer\s*name)\s*[:\-]\s*(.{1,200})/i,

        /(?:manufactured\s*by)\s*[:\-]\s*(.{1,200})/i,

        /(?:brand)\s*[:\-]\s*(.{1,200})/i,
      ]
    );

  /* =======================================================
     MODEL
  ======================================================= */

  attributes.model =
    firstMatch(
      text,
      [
        /(?:model|model\s*no|model\s*number)\s*[:#-]?\s*([A-Z0-9._/-]+)/i,

        /(?:type|type\s*no|type\s*number)\s*[:#-]?\s*([A-Z0-9._/-]+)/i,
      ]
    );

  /* =======================================================
     SIZE
  ======================================================= */

  attributes.size =
    firstMatch(
      text,
      [
        /(?:size|nominal\s*size|nominal\s*diameter|dn)\s*[:#-]?\s*([A-Z0-9./xX -]+)/i,

        /\b(DN\s*[0-9]+)\b/i,

        /\b(NPS\s*[0-9./]+)\b/i,
      ]
    );

  /* =======================================================
     THICKNESS
  ======================================================= */

  attributes.thickness =
    firstMatch(
      text,
      [
        /(?:thickness|wall\s*thickness)\s*[:\-]?\s*([0-9.]+\s*(?:mm|cm|in|inch)?)\b/i,
      ]
    );

  /* =======================================================
     HARDNESS
  ======================================================= */

  attributes.hardness =
    firstMatch(
      text,
      [
        /(?:hardness)\s*[:\-]?\s*(.{1,80})/i,
      ]
    );

  /* =======================================================
     COLOR
  ======================================================= */

  attributes.color =
    firstMatch(
      text,
      [
        /(?:colour|color)\s*[:\-]\s*(.{1,80})/i,
      ]
    );

  /* =======================================================
     APPLICATION
  ======================================================= */

  attributes.application =
    firstMatch(
      text,
      [
        /(?:application|service|usage|used\s*for)\s*[:\-]\s*(.{1,250})/i,

        /(?:intended\s*use)\s*[:\-]\s*(.{1,250})/i,
      ]
    );

  /* =======================================================
     DESIGN FEATURES
  ======================================================= */

  attributes.design_features =
    firstMatch(
      text,
      [
        /(?:design\s*features)\s*[:\-]\s*(.{1,300})/i,

        /(?:features)\s*[:\-]\s*(.{1,300})/i,

        /(?:construction)\s*[:\-]\s*(.{1,300})/i,
      ]
    );

  /* =======================================================
     AUTOMATIC MATERIAL GRADE DETECTION
  ======================================================= */

  if (
    !attributes.material_grade &&
    (
      lower.includes("ss304") ||
      lower.includes("ss 304") ||
      lower.includes(
        "stainless steel 304"
      )
    )
  ) {
    attributes.material_grade =
      "SS304";
  }

  if (
    !attributes.material_grade &&
    (
      lower.includes("ss316") ||
      lower.includes("ss 316") ||
      lower.includes(
        "stainless steel 316"
      )
    )
  ) {
    attributes.material_grade =
      "SS316";
  }

  if (
    !attributes.material_grade &&
    (
      lower.includes("ss 316l") ||
      lower.includes("ss316l")
    )
  ) {
    attributes.material_grade =
      "SS316L";
  }

  if (
    !attributes.material_grade &&
    lower.includes(
      "carbon steel"
    )
  ) {
    attributes.material_grade =
      "Carbon Steel";
  }

  if (
    !attributes.material_grade &&
    lower.includes(
      "alloy steel"
    )
  ) {
    attributes.material_grade =
      "Alloy Steel";
  }

  if (
    !attributes.material_grade &&
    lower.includes(
      "cast iron"
    )
  ) {
    attributes.material_grade =
      "Cast Iron";
  }

  /* =======================================================
     RAW TEXT
  ======================================================= */

  attributes.other_attributes =
    text
      .slice(0, 15000)
      .trim();

  return attributes;
}

/* =========================================================
   BUILD EMBEDDING SEARCH TEXT
========================================================= */

function buildSearchText(
  material,
  detail
) {
  return [
    `company: ${safeText(
      material.company
    )}`,

    `material number: ${safeText(
      material.material_number
    )}`,

    `description: ${safeText(
      material.description
    )}`,

    `category: ${safeText(
      material.category
    )}`,

    `specifications: ${safeText(
      material.specifications
    )}`,

    `material family: ${safeText(
      detail?.material_family
    )}`,

    `dimensions: ${safeText(
      detail?.dimensions
    )}`,

    `material grade: ${safeText(
      detail?.material_grade
    )}`,

    `pressure rating: ${safeText(
      detail?.pressure_rating
    )}`,

    `temperature rating: ${safeText(
      detail?.temperature_rating
    )}`,

    `standards: ${safeText(
      detail?.standards
    )}`,

    `manufacturer: ${safeText(
      detail?.manufacturer
    )}`,

    `model: ${safeText(
      detail?.model
    )}`,

    `design features: ${safeText(
      detail?.design_features
    )}`,

    `size: ${safeText(
      detail?.size
    )}`,

    `thickness: ${safeText(
      detail?.thickness
    )}`,

    `hardness: ${safeText(
      detail?.hardness
    )}`,

    `application: ${safeText(
      detail?.application
    )}`,

    `other attributes: ${safeText(
      detail?.other_attributes
    )}`,
  ]
    .filter(
      (value) =>
        value.trim() !== ""
    )
    .join("\n");
}

/* =========================================================
   GEMINI EMBEDDING
========================================================= */

async function generateEmbedding(
  searchText
) {
  const response =
    await ai.models.embedContent({
      model:
        EMBEDDING_MODEL,

      contents:
        searchText,

      config: {
        outputDimensionality:
          OUTPUT_DIMENSIONALITY,
      },
    });

  const values =
    response
      ?.embeddings?.[0]
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

/* =========================================================
   UPDATE DATASHEET
========================================================= */

async function updateDatasheet(
  supabase,
  datasheetId,
  values
) {
  const {
    error,
  } =
    await supabase
      .from("datasheets")
      .update({
        ...values,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "datasheet_id",
        datasheetId
      );

  if (error) {
    console.error(
      "Failed to update datasheet:",
      error
    );
  }
}

/* =========================================================
   MAIN POST ROUTE
========================================================= */

export async function POST(
  request
) {
  let authSupabase = null;
  let adminSupabase = null;
  let datasheetId = null;

  try {
    /* =====================================================
       ENVIRONMENT VALIDATION
    ===================================================== */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const publishableKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    const geminiApiKey =
      process.env.GEMINI_API_KEY;

    if (!supabaseUrl) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL is missing."
      );
    }

    if (!publishableKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing."
      );
    }

    if (!serviceRoleKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is missing."
      );
    }

    if (!geminiApiKey) {
      throw new Error(
        "GEMINI_API_KEY is missing."
      );
    }

    /* =====================================================
       AUTHENTICATION
    ===================================================== */

    const cookieStore =
      await cookies();

    authSupabase =
      createServerClient(
        supabaseUrl,
        publishableKey,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },

            setAll(
              cookiesToSet
            ) {
              try {
                cookiesToSet.forEach(
                  ({
                    name,
                    value,
                    options,
                  }) => {
                    cookieStore.set(
                      name,
                      value,
                      options
                    );
                  }
                );
              } catch {
                // Ignore cookie write failures.
              }
            },
          },
        }
      );

    const {
      data: {
        user,
      },
      error:
        authError,
    } =
      await authSupabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Authentication required.",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       SERVICE ROLE CLIENT
    ===================================================== */

    adminSupabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken:
              false,

            persistSession:
              false,
          },
        }
      );

    /* =====================================================
       REQUEST BODY
    ===================================================== */

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    datasheetId =
      Number(
        body?.datasheetId
      );

    if (
      !Number.isInteger(
        datasheetId
      ) ||
      datasheetId <=
        0
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

    /* =====================================================
       LOAD DATASHEET
    ===================================================== */

    const {
      data: datasheet,
      error:
        datasheetError,
    } =
      await adminSupabase
        .from("datasheets")
        .select("*")
        .eq(
          "datasheet_id",
          datasheetId
        )
        .single();

    if (
      datasheetError ||
      !datasheet
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Datasheet not found.",

          details:
            datasheetError?.message ||
            null,
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       PROCESSING START
    ===================================================== */

    await updateDatasheet(
      adminSupabase,
      datasheetId,
      {
        processing_status:
          "PROCESSING",

        extraction_status:
          "PROCESSING",

        embedding_status:
          "PENDING",
      }
    );

    /* =====================================================
       STORAGE VALIDATION
    ===================================================== */

    if (
      !datasheet.storage_bucket ||
      !datasheet.storage_path
    ) {
      throw new Error(
        "Datasheet has no storage bucket or storage path."
      );
    }

    /* =====================================================
       DOWNLOAD PDF
    ===================================================== */

    const {
      data: pdfFile,
      error:
        downloadError,
    } =
      await adminSupabase.storage
        .from(
          datasheet.storage_bucket
        )
        .download(
          datasheet.storage_path
        );

    if (
      downloadError ||
      !pdfFile
    ) {
      throw new Error(
        downloadError?.message ||
          "Unable to download PDF from Supabase Storage."
      );
    }

    /* =====================================================
       PDF EXTRACTION
    ===================================================== */

    const buffer =
      new Uint8Array(
        await pdfFile.arrayBuffer()
      );

    const extracted =
      await extractText(
        buffer,
        {
          mergePages:
            true,
        }
      );

    const text =
      normalizeValue(
        extracted?.text
      ) || "";

    if (!text) {
      throw new Error(
        "PDF extraction completed but no readable text was found."
      );
    }

    console.log(
      `Extracted ${text.length} characters from datasheet ${datasheetId}`
    );

    /* =====================================================
       MATERIAL INFORMATION
    ===================================================== */

    const extractedMaterialNumber =
      extractMaterialNumber(
        text
      );

    const fallbackMaterialNumber =
      String(
        datasheet.original_file_name ||
          datasheet.file_name ||
          ""
      )
        .replace(
          /\.pdf$/i,
          ""
        )
        .trim()
        .slice(
          0,
          150
        );

    const materialNumber =
      normalizeValue(
        extractedMaterialNumber
      ) ||
      normalizeValue(
        fallbackMaterialNumber
      ) ||
      `DATASHEET-${datasheetId}`;

    const description =
      extractDescription(
        text
      );

    const category =
      detectCategory(
        text
      );

    console.log(
      `Detected category: ${category}`
    );

    const attributes =
      buildAttributes(
        text,
        materialNumber,
        description,
        category
      );

    /* =====================================================
       COMPANY
    ===================================================== */

    const company =
      normalizeValue(
        datasheet.company_name
      ) ||
      "Unknown";

    /* =====================================================
       MATERIAL PAYLOAD
       
       materials primary key = id
    ===================================================== */

    const materialPayload = {
      company,

      material_number:
        materialNumber,

      description:
        description ||
        datasheet.original_file_name ||
        datasheet.file_name ||
        "Imported datasheet material",

      specifications:
        text,

      category,
    };

    /* =====================================================
       FIND MATERIAL
    ===================================================== */

    const {
      data:
        existingMaterial,
      error:
        materialLookupError,
    } =
      await adminSupabase
        .from("materials")
        .select(
          "id, company, material_number, description, specifications, category"
        )
        .eq(
          "material_number",
          materialPayload.material_number
        )
        .eq(
          "company",
          materialPayload.company
        )
        .maybeSingle();

    if (
      materialLookupError
    ) {
      throw new Error(
        `Material lookup failed: ${materialLookupError.message}`
      );
    }

    let material =
      null;

    let materialCreated =
      false;

    /* =====================================================
       UPDATE EXISTING MATERIAL
    ===================================================== */

    if (
      existingMaterial?.id
    ) {
      const {
        data:
          updatedMaterial,
        error:
          materialUpdateError,
      } =
        await adminSupabase
          .from("materials")
          .update({
            description:
              materialPayload.description,

            specifications:
              materialPayload.specifications,

            category:
              materialPayload.category,
          })
          .eq(
            "id",
            existingMaterial.id
          )
          .select(
            "id, company, material_number, description, specifications, category"
          )
          .single();

      if (
        materialUpdateError
      ) {
        throw new Error(
          `Existing material update failed: ${materialUpdateError.message}`
        );
      }

      material =
        updatedMaterial;
    }

    /* =====================================================
       INSERT NEW MATERIAL
    ===================================================== */

    else {
      const {
        data:
          insertedMaterial,
        error:
          materialInsertError,
      } =
        await adminSupabase
          .from("materials")
          .insert(
            materialPayload
          )
          .select(
            "id, company, material_number, description, specifications, category"
          )
          .single();

      if (
        materialInsertError
      ) {
        throw new Error(
          `Material insert failed: ${materialInsertError.message}`
        );
      }

      material =
        insertedMaterial;

      materialCreated =
        true;
    }

    if (
      !material?.id
    ) {
      throw new Error(
        "Material ID was not returned from materials table."
      );
    }

    const materialsId =
      material.id;

    console.log(
      `materials.id=${materialsId}`
    );

    /* =====================================================
       COMPANY MATERIAL
       
       material_attributes.material_id
       references company_materials.material_id
    ===================================================== */

    let companyMaterial =
      null;

    /* =====================================================
       FIND BY COMPANY + DATASHEET
    ===================================================== */

    if (
      datasheet.company_id !== null &&
      datasheet.company_id !== undefined
    ) {
      const {
        data:
          existingCompanyMaterial,
        error:
          companyMaterialLookupError,
      } =
        await adminSupabase
          .from(
            "company_materials"
          )
          .select(
            "material_id, company_id, datasheet_id, company_material_code, material_name, description"
          )
          .eq(
            "company_id",
            datasheet.company_id
          )
          .eq(
            "datasheet_id",
            datasheetId
          )
          .maybeSingle();

      if (
        companyMaterialLookupError
      ) {
        throw new Error(
          `Company material lookup failed: ${companyMaterialLookupError.message}`
        );
      }

      companyMaterial =
        existingCompanyMaterial;
    }

    /* =====================================================
       FIND BY COMPANY MATERIAL CODE
    ===================================================== */

    if (
      !companyMaterial &&
      materialNumber
    ) {
      const {
        data:
          existingByCode,
        error:
          existingByCodeError,
      } =
        await adminSupabase
          .from(
            "company_materials"
          )
          .select(
            "material_id, company_id, datasheet_id, company_material_code, material_name, description"
          )
          .eq(
            "company_material_code",
            materialNumber
          )
          .maybeSingle();

      if (
        existingByCodeError
      ) {
        throw new Error(
          `Company material code lookup failed: ${existingByCodeError.message}`
        );
      }

      companyMaterial =
        existingByCode;
    }

    /* =====================================================
       CREATE COMPANY MATERIAL
    ===================================================== */

    if (
      !companyMaterial
    ) {
      const companyMaterialPayload = {
        company_id:
          datasheet.company_id,

        datasheet_id:
          datasheetId,

        company_material_code:
          materialNumber,

        material_name:
          description ||
          materialNumber,

        description:
          description ||
          text.slice(
            0,
            1000
          ),
      };

      const {
        data:
          insertedCompanyMaterial,
        error:
          companyMaterialInsertError,
      } =
        await adminSupabase
          .from(
            "company_materials"
          )
          .insert(
            companyMaterialPayload
          )
          .select(
            "material_id, company_id, datasheet_id, company_material_code, material_name, description"
          )
          .single();

      if (
        companyMaterialInsertError
      ) {
        throw new Error(
          `Company material insert failed: ${companyMaterialInsertError.message}`
        );
      }

      companyMaterial =
        insertedCompanyMaterial;
    }

    if (
      !companyMaterial?.material_id
    ) {
      throw new Error(
        "Company material material_id was not returned."
      );
    }

    const companyMaterialId =
      companyMaterial.material_id;

    console.log(
      `company_materials.material_id=${companyMaterialId}`
    );

    /* =====================================================
       UPDATE COMPANY MATERIAL
    ===================================================== */

    const {
      error:
        companyMaterialUpdateError,
    } =
      await adminSupabase
        .from(
          "company_materials"
        )
        .update({
          company_material_code:
            materialNumber,

          material_name:
            description ||
            materialNumber,

          description:
            description ||
            text.slice(
              0,
              1000
            ),
        })
        .eq(
          "material_id",
          companyMaterialId
        );

    if (
      companyMaterialUpdateError
    ) {
      throw new Error(
        `Company material update failed: ${companyMaterialUpdateError.message}`
      );
    }

    /* =====================================================
       MATERIAL ATTRIBUTES
       
       No ON CONFLICT is used because
       material_attributes.material_id is not covered
       by a unique constraint.
    ===================================================== */

    const attributePayload = {
      material_id:
        companyMaterialId,

      material_family:
        attributes.material_family,

      dimensions:
        attributes.dimensions,

      material_grade:
        attributes.material_grade,

      pressure_rating:
        attributes.pressure_rating,

      temperature_rating:
        attributes.temperature_rating,

      standards:
        attributes.standards,

      manufacturer:
        attributes.manufacturer,

      model:
        attributes.model,

      design_features:
        attributes.design_features,

      other_attributes:
        attributes.other_attributes,
    };

    /* =====================================================
       FIND EXISTING ATTRIBUTES
    ===================================================== */

    const {
      data:
        existingAttributes,
      error:
        attributeLookupError,
    } =
      await adminSupabase
        .from(
          "material_attributes"
        )
        .select(
          "material_id"
        )
        .eq(
          "material_id",
          companyMaterialId
        )
        .maybeSingle();

    if (
      attributeLookupError
    ) {
      throw new Error(
        `Material attributes lookup failed: ${attributeLookupError.message}`
      );
    }

    /* =====================================================
       UPDATE ATTRIBUTES
    ===================================================== */

    if (
      existingAttributes
    ) {
      const {
        error:
          attributeUpdateError,
      } =
        await adminSupabase
          .from(
            "material_attributes"
          )
          .update({
            material_family:
              attributes.material_family,

            dimensions:
              attributes.dimensions,

            material_grade:
              attributes.material_grade,

            pressure_rating:
              attributes.pressure_rating,

            temperature_rating:
              attributes.temperature_rating,

            standards:
              attributes.standards,

            manufacturer:
              attributes.manufacturer,

            model:
              attributes.model,

            design_features:
              attributes.design_features,

            other_attributes:
              attributes.other_attributes,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "material_id",
            companyMaterialId
          );

      if (
        attributeUpdateError
      ) {
        throw new Error(
          `Material attributes update failed: ${attributeUpdateError.message}`
        );
      }

      console.log(
        `Material attributes updated for company_materials.material_id=${companyMaterialId}`
      );
    }

    /* =====================================================
       INSERT ATTRIBUTES
    ===================================================== */

    else {
      const {
        error:
          attributeInsertError,
      } =
        await adminSupabase
          .from(
            "material_attributes"
          )
          .insert(
            attributePayload
          );

      if (
        attributeInsertError
      ) {
        throw new Error(
          `Material attributes insert failed: ${attributeInsertError.message}`
        );
      }

      console.log(
        `Material attributes inserted for company_materials.material_id=${companyMaterialId}`
      );
    }

    /* =====================================================
       EXTRACTION COMPLETE
    ===================================================== */

    await updateDatasheet(
      adminSupabase,
      datasheetId,
      {
        processing_status:
          "PROCESSING",

        extraction_status:
          "COMPLETED",

        embedding_status:
          "PROCESSING",

        extracted_material_count:
          1,
      }
    );

    /* =====================================================
       LOAD ATTRIBUTES FOR EMBEDDING
    ===================================================== */

    const {
      data:
        embeddingDetail,
      error:
        embeddingDetailError,
    } =
      await adminSupabase
        .from(
          "material_attributes"
        )
        .select(
          [
            "material_id",
            "material_family",
            "dimensions",
            "material_grade",
            "pressure_rating",
            "temperature_rating",
            "standards",
            "manufacturer",
            "model",
            "design_features",
            "other_attributes",
          ].join(",")
        )
        .eq(
          "material_id",
          companyMaterialId
        )
        .maybeSingle();

    if (
      embeddingDetailError
    ) {
      throw new Error(
        `Failed to load material attributes for embedding: ${embeddingDetailError.message}`
      );
    }

    /* =====================================================
       SEARCH TEXT
    ===================================================== */

    const searchText =
      buildSearchText(
        material,
        embeddingDetail
      );

    if (
      !searchText.trim()
    ) {
      throw new Error(
        "Material does not contain searchable information for embedding."
      );
    }

    /* =====================================================
       GENERATE EMBEDDING
    ===================================================== */

    console.log(
      `Generating Gemini embedding for materials.id=${materialsId}...`
    );

    const embedding =
      await generateEmbedding(
        searchText
      );

    if (
      !Array.isArray(
        embedding
      ) ||
      embedding.length !==
        OUTPUT_DIMENSIONALITY
    ) {
      throw new Error(
        `Embedding dimension mismatch. Expected ${OUTPUT_DIMENSIONALITY}.`
      );
    }

    /* =====================================================
       SAVE EMBEDDING
       
       material_embeddings.material_id
       references materials.id
    ===================================================== */

    const {
      error:
        embeddingSaveError,
    } =
      await adminSupabase
        .from(
          "material_embeddings"
        )
        .upsert(
          {
            material_id:
              materialsId,

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

    if (
      embeddingSaveError
    ) {
      throw new Error(
        `Failed to save embedding: ${embeddingSaveError.message}`
      );
    }

    console.log(
      `Embedding saved using materials.id=${materialsId}`
    );

    /* =====================================================
       FINAL DATASHEET STATUS
    ===================================================== */

    await updateDatasheet(
      adminSupabase,
      datasheetId,
      {
        processing_status:
          "PROCESSED",

        extraction_status:
          "COMPLETED",

        embedding_status:
          "COMPLETED",

        extracted_material_count:
          1,
      }
    );

    /* =====================================================
       SUCCESS RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,

      message:
        "Datasheet processed and embedded successfully.",

      datasheet: {
        datasheet_id:
          datasheetId,

        file_name:
          datasheet.file_name,

        company_name:
          datasheet.company_name,

        processing_status:
          "PROCESSED",

        extraction_status:
          "COMPLETED",

        embedding_status:
          "COMPLETED",
      },

      material: {
        id:
          materialsId,

        company:
          material.company,

        material_number:
          material.material_number,

        description:
          material.description,

        category:
          material.category,

        created:
          materialCreated,
      },

      company_material: {
        material_id:
          companyMaterialId,

        company_id:
          companyMaterial.company_id,

        datasheet_id:
          companyMaterial.datasheet_id,

        company_material_code:
          companyMaterial.company_material_code,

        material_name:
          companyMaterial.material_name,
      },

      embedding: {
        model:
          EMBEDDING_MODEL,

        dimensions:
          OUTPUT_DIMENSIONALITY,

        generated:
          true,

        saved:
          true,
      },

      extraction: {
        pages:
          extracted?.totalPages ||
          null,

        text_length:
          text.length,

        attributes,
      },
    });
  } catch (error) {
    console.error(
      "process-datasheet error:",
      error
    );

    /* =====================================================
       FAILURE STATUS
    ===================================================== */

    if (
      adminSupabase &&
      Number.isInteger(
        datasheetId
      ) &&
      datasheetId > 0
    ) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      try {
        const {
          data:
            currentDatasheet,
        } =
          await adminSupabase
            .from(
              "datasheets"
            )
            .select(
              "processing_status, extraction_status, embedding_status"
            )
            .eq(
              "datasheet_id",
              datasheetId
            )
            .maybeSingle();

        if (
          currentDatasheet?.embedding_status ===
          "PROCESSING"
        ) {
          await updateDatasheet(
            adminSupabase,
            datasheetId,
            {
              processing_status:
                "FAILED",

              extraction_status:
                "COMPLETED",

              embedding_status:
                "FAILED",
            }
          );
        } else {
          await updateDatasheet(
            adminSupabase,
            datasheetId,
            {
              processing_status:
                "FAILED",

              extraction_status:
                "FAILED",
            }
          );
        }
      } catch (
        statusError
      ) {
        console.error(
          "Failed to update failure status:",
          statusError
        );
      }

      return NextResponse.json(
        {
          success: false,

          error:
            "Datasheet processing failed.",

          details:
            errorMessage,

          datasheet_id:
            datasheetId,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to process datasheet.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}