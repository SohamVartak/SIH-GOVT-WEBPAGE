import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

// ============================================================
// GEMINI CLIENT
// ============================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL_NAME =
  "gemini-3.6-flash";

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function isRetryableServerError(error) {
  const status =
    error?.status ||
    error?.code;

  const message =
    String(
      error?.message ||
        error ||
        ""
    ).toLowerCase();

  return (
    status === 503 ||
    message.includes(
      "service unavailable"
    ) ||
    message.includes(
      "temporarily unavailable"
    ) ||
    message.includes(
      "high demand"
    ) ||
    message.includes(
      "overloaded"
    )
  );
}

function isQuotaError(error) {
  const status =
    error?.status ||
    error?.code;

  const message =
    String(
      error?.message ||
        error ||
        ""
    ).toLowerCase();

  return (
    status === 429 ||
    message.includes(
      "quota exceeded"
    ) ||
    message.includes(
      "resource_exhausted"
    ) ||
    message.includes(
      "free_tier"
    ) ||
    message.includes(
      "rate limit"
    )
  );
}

function cleanString(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    return value;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

// ============================================================
// DEFAULT OBJECTS
// ============================================================

function createDefaultLocation() {
  return {
    address: null,
    city: null,
    state: null,
    country: null,
    postal_code: null,
  };
}

function createDefaultDimensions() {
  return {
    size_range: null,
    nominal_size: null,
    diameter: null,
    length: null,
    width: null,
    height: null,
    thickness: null,
    face_to_face: null,
    pressure_class: null,
    other_dimensions: {},
  };
}

function createDefaultMaterials() {
  return {
    body: null,
    bonnet: null,
    cover: null,
    disc: null,
    seat: null,
    stem: null,
    shaft: null,
    bolts: null,
    nuts: null,
    gasket: null,
    packing: null,
    gland: null,
    handwheel: null,
    seal: null,
    other: [],
  };
}

// ============================================================
// NORMALIZE STRUCTURED DATA
// ============================================================

function normalizeStructuredData(
  structuredData
) {
  if (
    !structuredData ||
    typeof structuredData !==
      "object" ||
    Array.isArray(
      structuredData
    )
  ) {
    throw new Error(
      "AI returned an invalid structured object."
    );
  }

  // ----------------------------------------------------------
  // LOCATION
  // ----------------------------------------------------------

  if (
    !structuredData.location ||
    typeof structuredData.location !==
      "object" ||
    Array.isArray(
      structuredData.location
    )
  ) {
    structuredData.location =
      createDefaultLocation();
  } else {
    const location =
      structuredData.location;

    structuredData.location = {
      address:
        cleanString(
          location.address
        ),

      city:
        cleanString(
          location.city
        ),

      state:
        cleanString(
          location.state
        ),

      country:
        cleanString(
          location.country
        ),

      postal_code:
        cleanString(
          location.postal_code
        ),
    };
  }

  // ----------------------------------------------------------
  // DESIGN FEATURES
  // ----------------------------------------------------------

  if (
    !Array.isArray(
      structuredData.design_features
    )
  ) {
    structuredData.design_features =
      [];
  }

  // ----------------------------------------------------------
  // STANDARDS
  // ----------------------------------------------------------

  if (
    !Array.isArray(
      structuredData.standards
    )
  ) {
    structuredData.standards =
      [];
  }

  // ----------------------------------------------------------
  // END CONNECTIONS
  // ----------------------------------------------------------

  if (
    !Array.isArray(
      structuredData.end_connections
    )
  ) {
    structuredData.end_connections =
      [];
  }

  // ----------------------------------------------------------
  // INSPECTION REQUIREMENTS
  // ----------------------------------------------------------

  if (
    !Array.isArray(
      structuredData.inspection_requirements
    )
  ) {
    structuredData.inspection_requirements =
      [];
  }

  // ----------------------------------------------------------
  // QUALITY REQUIREMENTS
  // ----------------------------------------------------------

  if (
    !Array.isArray(
      structuredData.quality_requirements
    )
  ) {
    structuredData.quality_requirements =
      [];
  }

  // ----------------------------------------------------------
  // MATERIALS
  // ----------------------------------------------------------

  if (
    !structuredData.materials ||
    typeof structuredData.materials !==
      "object" ||
    Array.isArray(
      structuredData.materials
    )
  ) {
    structuredData.materials =
      createDefaultMaterials();
  } else {
    const defaultMaterials =
      createDefaultMaterials();

    structuredData.materials = {
      ...defaultMaterials,
      ...structuredData.materials,
    };

    if (
      !Array.isArray(
        structuredData.materials.other
      )
    ) {
      structuredData.materials.other =
        [];
    }
  }

  // ----------------------------------------------------------
  // DIMENSIONS
  // ----------------------------------------------------------

  if (
    !structuredData.dimensions ||
    typeof structuredData.dimensions !==
      "object" ||
    Array.isArray(
      structuredData.dimensions
    )
  ) {
    structuredData.dimensions =
      createDefaultDimensions();
  } else {
    structuredData.dimensions = {
      ...createDefaultDimensions(),
      ...structuredData.dimensions,
    };

    if (
      !structuredData
        .dimensions
        .other_dimensions ||
      typeof structuredData
        .dimensions
        .other_dimensions !==
        "object" ||
      Array.isArray(
        structuredData
          .dimensions
          .other_dimensions
      )
    ) {
      structuredData
        .dimensions
        .other_dimensions =
        {};
    }
  }

  // ----------------------------------------------------------
  // ADDITIONAL ATTRIBUTES
  // ----------------------------------------------------------

  if (
    !structuredData.additional_attributes ||
    typeof structuredData.additional_attributes !==
      "object" ||
    Array.isArray(
      structuredData.additional_attributes
    )
  ) {
    structuredData.additional_attributes =
      {};
  }

  // ----------------------------------------------------------
  // EMPTY STRING → NULL
  // ----------------------------------------------------------

  const nullableFields = [
    "company",
    "company_full_name",
    "facility_name",
    "material_name",
    "company_material_code",
    "material_family",
    "description",
    "product_type",
    "pressure_rating",
    "temperature_rating",
    "testing_standard",
    "actuation",
    "manufacturer",
    "model",
    "part_number",
    "application",
    "unit_of_measure",
    "drawing_number",
    "revision",
    "datasheet_number",
    "design_code",
  ];

  for (
    const field of nullableFields
  ) {
    structuredData[field] =
      cleanString(
        structuredData[field]
      );
  }

  return structuredData;
}

// ============================================================
// COMPANY / FACILITY CLEANUP
// ============================================================

function separateCompanyAndFacility(
  structuredData
) {
  if (
    typeof structuredData.company !==
    "string"
  ) {
    return structuredData;
  }

  const company =
    structuredData.company.trim();

  if (!company) {
    structuredData.company =
      null;

    return structuredData;
  }

  // If facility is already identified,
  // don't split the company name again.
  if (
    structuredData.facility_name
  ) {
    structuredData.company =
      company;

    return structuredData;
  }

  // Handle common separators:
  // IOCL — Haldia
  // IOCL - Haldia
  // IOCL | Haldia

  const separatorMatch =
    company.match(
      /^(.+?)\s*(?:—|–|\||\s+-\s+)\s*(.+)$/
    );

  if (
    separatorMatch
  ) {
    const possibleCompany =
      separatorMatch[1].trim();

    const possibleFacility =
      separatorMatch[2].trim();

    // Only split when both sides
    // contain meaningful text.
    if (
      possibleCompany &&
      possibleFacility
    ) {
      structuredData.company =
        possibleCompany;

      structuredData.facility_name =
        possibleFacility;
    }
  }

  return structuredData;
}

// ============================================================
// BUILD PROMPT
// ============================================================

function buildPrompt(text) {
  return `
You are an industrial material datasheet extraction AI
for the Bharat Material Grid, a Government of India
industrial material harmonization platform.

Analyse the supplied datasheet text and extract the material
information into STRICT JSON.

IMPORTANT RULES:

1. DO NOT invent information.
2. Use ONLY information explicitly present in the datasheet.
3. If information is unavailable, return null.
4. Preserve the original company material code exactly.
5. Preserve the original product/material name.
6. Do NOT combine company and factory/plant/location into the
   company field.
7. Identify the organization/company separately from the
   manufacturing plant/factory/refinery/site.
8. Extract the facility/plant/refinery/location whenever
   present.
9. Extract city, state and country whenever explicitly present.
10. If the datasheet only gives a facility name but does not
    explicitly give city/state, keep the facility name but
    return unknown location fields as null.
11. Never guess a city or state from a facility name.
12. Preserve technical values and units exactly when possible.
13. Extract ALL available technical attributes.
14. Do not remove information merely because it does not fit
    a predefined field.
15. Put additional information into additional_attributes.
16. Return ONLY valid JSON.
17. Do NOT return markdown.
18. Do NOT return explanations outside JSON.

COMPANY / FACILITY RULE:

For example, if the document says:

"Indian Oil Corporation Limited - Haldia Refinery"

the correct interpretation should be:

company = "IOCL" or the explicitly stated company name
facility_name = "Haldia Refinery"

Never return:

company = "IOCL — Haldia"

A plant, refinery, depot, terminal, works, factory or
manufacturing site is a FACILITY, not a separate company.

IMPORTANT PRESERVATION RULE:

The original company material code and original product name
are source values. Do not standardize, rewrite or replace them.

RETURN THIS EXACT JSON STRUCTURE:

{
  "company": null,

  "company_full_name": null,

  "facility_name": null,

  "location": {
    "address": null,
    "city": null,
    "state": null,
    "country": null,
    "postal_code": null
  },

  "material_name": null,

  "company_material_code": null,

  "material_family": null,

  "description": null,

  "product_type": null,

  "design_features": [],

  "dimensions": {
    "size_range": null,
    "nominal_size": null,
    "diameter": null,
    "length": null,
    "width": null,
    "height": null,
    "thickness": null,
    "face_to_face": null,
    "pressure_class": null,
    "other_dimensions": {}
  },

  "materials": {
    "body": null,
    "bonnet": null,
    "cover": null,
    "disc": null,
    "seat": null,
    "stem": null,
    "shaft": null,
    "bolts": null,
    "nuts": null,
    "gasket": null,
    "packing": null,
    "gland": null,
    "handwheel": null,
    "seal": null,
    "other": []
  },

  "standards": [],

  "pressure_rating": null,

  "temperature_rating": null,

  "end_connections": [],

  "testing_standard": null,

  "actuation": null,

  "manufacturer": null,

  "model": null,

  "part_number": null,

  "application": null,

  "unit_of_measure": null,

  "drawing_number": null,

  "revision": null,

  "datasheet_number": null,

  "design_code": null,

  "inspection_requirements": [],

  "quality_requirements": [],

  "additional_attributes": {}
}

DATASHEET TEXT:

${text}
`;
}

// ============================================================
// GEMINI CALL
//
// We retry ONLY temporary 503-type failures.
//
// 429 quota errors are NOT retried because repeatedly sending
// requests cannot restore a daily free-tier quota.
// ============================================================

async function generateStructuredData(
  prompt
) {
  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt++
  ) {
    try {
      console.log(
        `AI structure request ${attempt}/3 using ${MODEL_NAME}`
      );

      const response =
        await ai.models.generateContent(
          {
            model:
              MODEL_NAME,

            contents:
              prompt,

            config: {
              responseMimeType:
                "application/json",
            },
          }
        );

      const responseText =
        response?.text;

      if (
        !responseText
      ) {
        throw new Error(
          "AI returned an empty response."
        );
      }

      let structuredData;

      try {
        structuredData =
          JSON.parse(
            responseText
          );
      } catch (
        parseError
      ) {
        console.error(
          "AI JSON parsing error:",
          responseText
        );

        throw new Error(
          "AI returned invalid JSON."
        );
      }

      return structuredData;
    } catch (
      error
    ) {
      lastError =
        error;

      // --------------------------------------------------------
      // QUOTA ERROR
      // --------------------------------------------------------

      if (
        isQuotaError(
          error
        )
      ) {
        throw new Error(
          "Gemini API quota has been exhausted for this project. No more AI requests can be made until the quota resets or the Gemini project is upgraded."
        );
      }

      // --------------------------------------------------------
      // NON-RETRYABLE ERROR
      // --------------------------------------------------------

      if (
        !isRetryableServerError(
          error
        )
      ) {
        throw error;
      }

      // --------------------------------------------------------
      // RETRYABLE 503
      // --------------------------------------------------------

      if (
        attempt <
        3
      ) {
        const waitTime =
          attempt === 1
            ? 2000
            : 5000;

        console.log(
          `Gemini temporarily unavailable. Retrying in ${waitTime} ms...`
        );

        await sleep(
          waitTime
        );
      }
    }
  }

  throw new Error(
    `Gemini was temporarily unavailable after 3 attempts. Last error: ${
      lastError?.message ||
      String(lastError)
    }`
  );
}

// ============================================================
// POST
// ============================================================

export async function POST(
  request
) {
  try {
    // ========================================================
    // GEMINI CONFIGURATION
    // ========================================================

    if (
      !process.env.GEMINI_API_KEY
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "GEMINI_API_KEY is missing.",

          details:
            "Add GEMINI_API_KEY to your environment variables.",
        },
        {
          status:
            500,
        }
      );
    }

    // ========================================================
    // REQUEST
    // ========================================================

    const body =
      await request.json();

    const text =
      body?.text;

    if (
      !text ||
      !String(text).trim()
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "No extracted datasheet text provided.",
        },
        {
          status:
            400,
        }
      );
    }

    const datasheetText =
      String(text).trim();

    // ========================================================
    // PROMPT
    // ========================================================

    const prompt =
      buildPrompt(
        datasheetText
      );

    // ========================================================
    // GEMINI
    // ========================================================

    const rawStructuredData =
      await generateStructuredData(
        prompt
      );

    // ========================================================
    // NORMALIZE
    // ========================================================

    let structuredData =
      normalizeStructuredData(
        rawStructuredData
      );

    structuredData =
      separateCompanyAndFacility(
        structuredData
      );

    // Run normalization one more time
    // after company/facility separation.
    structuredData =
      normalizeStructuredData(
        structuredData
      );

    // ========================================================
    // FINAL VALIDATION
    // ========================================================

    if (
      !structuredData.company &&
      !structuredData.company_full_name
    ) {
      console.warn(
        "AI structure did not identify a company."
      );
    }

    if (
      !structuredData.material_name &&
      !structuredData.company_material_code &&
      !structuredData.description
    ) {
      console.warn(
        "AI structure returned very limited product identity information."
      );
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return NextResponse.json({
      success:
        true,

      data:
        structuredData,
    });
  } catch (
    error
  ) {
    console.error(
      "AI STRUCTURING ERROR:",
      error
    );

    // ========================================================
    // QUOTA ERROR
    // ========================================================

    if (
      isQuotaError(
        error
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Gemini API quota exhausted.",

          details:
            "The Gemini Free Tier request quota for this project has been reached. Wait for the quota reset or upgrade the Gemini project.",

          code:
            "GEMINI_QUOTA_EXHAUSTED",
        },
        {
          status:
            429,
        }
      );
    }

    // ========================================================
    // TEMPORARY AI ERROR
    // ========================================================

    if (
      isRetryableServerError(
        error
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Gemini AI is temporarily unavailable.",

          details:
            error?.message ||
            String(error),

          code:
            "GEMINI_TEMPORARILY_UNAVAILABLE",
        },
        {
          status:
            503,
        }
      );
    }

    // ========================================================
    // GENERAL ERROR
    // ========================================================

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Failed to structure datasheet.",

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