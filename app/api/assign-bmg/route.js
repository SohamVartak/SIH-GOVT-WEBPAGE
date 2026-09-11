import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

// ============================================================
// GEMINI
// ============================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================
// SUPABASE ADMIN CLIENT
// ============================================================

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(url, key);
}

// ============================================================
// HELPERS
// ============================================================

function clean(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function normalizeText(value) {
  return clean(value)
    ?.toLowerCase()
    .replace(/\s+/g, " ")
    .trim() || null;
}

// ============================================================
// BUILD MATERIAL PROFILE
// ============================================================

function buildMaterialProfile(material, detail) {
  return {
    company: material?.company || null,

    // IMPORTANT:
    // This is contextual information only.
    // It is NEVER the BMG identity.
    company_material_code:
      material?.material_number || null,

    description:
      material?.description || null,

    specifications:
      material?.specifications || null,

    category:
      material?.category || null,

    material_type:
      detail?.material_type || null,

    material_family:
      detail?.material_family || null,

    dimensions:
      detail?.dimensions || null,

    material_grade:
      detail?.material_grade || null,

    pressure_rating:
      detail?.pressure_rating || null,

    temperature_rating:
      detail?.temperature_rating || null,

    standard:
      detail?.standard || null,

    manufacturer:
      detail?.manufacturer || null,

    model:
      detail?.model || null,

    part_number:
      detail?.part_number || null,

    design_features:
      detail?.design_features || null,

    application:
      detail?.application || null,

    unit_of_measure:
      detail?.unit_of_measure || null,

    raw_attributes:
      detail?.raw_attributes || {},
  };
}

// ============================================================
// LOAD SOURCE MATERIAL
// ============================================================

async function loadSourceMaterial(
  supabase,
  materialId
) {
  const {
    data: material,
    error: materialError,
  } = await supabase
    .from("materials")
    .select(
      [
        "id",
        "company",
        "company_id",
        "facility_id",
        "material_number",
        "description",
        "specifications",
        "category",
        "unique_product_code",
        "product_fingerprint",
        "bmg_id",
      ].join(",")
    )
    .eq("id", materialId)
    .single();

  if (materialError) {
    throw new Error(
      `Failed to load source material: ${materialError.message}`
    );
  }

  const {
    data: detail,
    error: detailError,
  } = await supabase
    .from("material_details")
    .select("*")
    .eq("material_id", materialId)
    .maybeSingle();

  if (detailError) {
    throw new Error(
      `Failed to load material details: ${detailError.message}`
    );
  }

  return {
    material,
    detail,
  };
}

// ============================================================
// LOAD EXISTING BMG GROUPS
//
// A BMG group is a COMMON technical identity.
//
// It is NOT:
// - company specific
// - material-number specific
// - manufacturer specific
//
// All existing mapped materials are supplied to Gemini as
// evidence for the identity of each BMG group.
// ============================================================

async function loadExistingBMGs(
  supabase,
  sourceMaterialId
) {
  const {
    data: bmgRows,
    error: bmgError,
  } = await supabase
    .from("bmg_materials")
    .select(
      [
        "bmg_id",
        "bmg_code",
        "ncs_name",
        "category",
        "subcategory",
        "ncs_standard_specification",
        "status",
      ].join(",")
    )
    .order("bmg_id", {
      ascending: true,
    });

  if (bmgError) {
    throw new Error(
      `Failed to load BMG identities: ${bmgError.message}`
    );
  }

  if (!bmgRows || bmgRows.length === 0) {
    return [];
  }

  const {
    data: mappings,
    error: mappingError,
  } = await supabase
    .from("material_bmg_mapping")
    .select(
      [
        "mapping_id",
        "material_id",
        "bmg_id",
        "match_status",
        "ai_confidence",
        "ai_reason",
        "verified",
        "active",
      ].join(",")
    )
    .eq("active", true)
    .neq("material_id", sourceMaterialId);

  if (mappingError) {
    throw new Error(
      `Failed to load BMG mappings: ${mappingError.message}`
    );
  }

  if (!mappings || mappings.length === 0) {
    return [];
  }

  const materialIds = [
    ...new Set(
      mappings.map(
        (row) => row.material_id
      )
    ),
  ];

  if (materialIds.length === 0) {
    return [];
  }

  const {
    data: materials,
    error: materialsError,
  } = await supabase
    .from("materials")
    .select(
      [
        "id",
        "company",
        "company_id",
        "material_number",
        "description",
        "specifications",
        "category",
      ].join(",")
    )
    .in("id", materialIds);

  if (materialsError) {
    throw new Error(
      `Failed to load representative materials: ${materialsError.message}`
    );
  }

  const {
    data: details,
    error: detailsError,
  } = await supabase
    .from("material_details")
    .select("*")
    .in("material_id", materialIds);

  if (detailsError) {
    throw new Error(
      `Failed to load representative material details: ${detailsError.message}`
    );
  }

  const materialMap = new Map();

  for (const material of materials || []) {
    materialMap.set(
      material.id,
      material
    );
  }

  const detailMap = new Map();

  for (const detail of details || []) {
    detailMap.set(
      detail.material_id,
      detail
    );
  }

  const groups = new Map();

  for (const bmg of bmgRows) {
    groups.set(
      bmg.bmg_id,
      {
        bmg,
        representatives: [],
      }
    );
  }

  for (const mapping of mappings) {
    const group = groups.get(
      mapping.bmg_id
    );

    if (!group) {
      continue;
    }

    const material =
      materialMap.get(
        mapping.material_id
      );

    if (!material) {
      continue;
    }

    const detail =
      detailMap.get(
        mapping.material_id
      );

    group.representatives.push({
      mapping,

      profile:
        buildMaterialProfile(
          material,
          detail
        ),
    });
  }

  return Array.from(
    groups.values()
  );
}

// ============================================================
// BUILD BMG ASSIGNMENT PROMPT
// ============================================================

function buildBMGPrompt(
  sourceProfile,
  existingBMGs
) {
  const existingPayload =
    existingBMGs.map(
      (group) => ({
        bmg_id:
          group.bmg.bmg_id,

        bmg_code:
          group.bmg.bmg_code,

        ncs_name:
          group.bmg.ncs_name,

        category:
          group.bmg.category,

        subcategory:
          group.bmg.subcategory,

        ncs_standard_specification:
          group.bmg
            .ncs_standard_specification,

        status:
          group.bmg.status,

        representative_materials:
          group.representatives
            .slice(0, 10)
            .map(
              (item) =>
                item.profile
            ),
      })
    );

  return `
You are the BMG Common Material Identity Assignment Engine
for Bharat Material Grid.

Your ONLY job is to determine which COMMON BMG technical
identity the NEW MATERIAL belongs to.

============================================================
ABSOLUTE RULE
============================================================

ONE TECHNICALLY EQUIVALENT PRODUCT = ONE BMG IDENTITY.

A BMG identity is GLOBAL across companies.

Therefore:

IOCL equivalent product
+
BPCL equivalent product
+
HPCL equivalent product
+
BHEL equivalent product

MUST all use the SAME BMG ID when their technical identity
is equivalent.

Example:

IOCL:
Deep Groove Ball Bearing 6205
Material Code: IOCL-12345

→ BMG-BEARING-001


BPCL:
Ball Bearing 6205
Material Code: BPCL-98765

→ BMG-BEARING-001


HPCL:
Bearing 6205
Material Code: HPCL-55555

→ BMG-BEARING-001

The company material numbers are DIFFERENT, but the BMG
identity is the SAME.

============================================================
DO NOT CREATE DUPLICATE BMG IDENTITIES
============================================================

Before creating a new BMG identity, you MUST examine
EVERY supplied existing BMG identity.

If an existing BMG represents the same technical product,
you MUST reuse it.

Never create a new BMG simply because:

- company is different
- company material number is different
- manufacturer is different
- description wording is different
- abbreviations are different
- spelling is different
- datasheet wording is different
- one description is more detailed
- one company uses a different naming convention

These differences do NOT justify a new BMG.

============================================================
TECHNICAL EQUIVALENCE
============================================================

Determine equivalence primarily from engineering
characteristics.

Evaluate:

1. Product type
2. Product function
3. Material family
4. Material grade
5. Dimensions
6. Pressure rating
7. Temperature rating
8. Voltage
9. Current
10. Power
11. Capacity
12. Flow rate
13. Speed/RPM
14. Size
15. Standard
16. End connection
17. Design features
18. Application
19. Technical specifications
20. Manufacturer/model/part number when technically useful

Manufacturer, model and part number are supporting evidence.

They are NOT automatically BMG identity boundaries.

============================================================
CRITICAL SPECIFICATIONS
============================================================

A superficial similarity is NOT enough.

If a critical engineering characteristic conflicts,
the materials may require different BMG identities.

Examples:

Bearing 6205
vs
Bearing 6305

→ DIFFERENT BMG

SS304
vs
SS316

→ DIFFERENT BMG when material grade is technically defining

PN16
vs
PN40

→ DIFFERENT BMG when pressure rating is technically defining

230V
vs
415V

→ DIFFERENT BMG when voltage is technically defining

10 mm
vs
20 mm

→ DIFFERENT BMG when dimension is technically defining

Different incompatible standards may also require
different BMG identities.

============================================================
SIMILARITY VS EQUIVALENCE
============================================================

Similarity percentage alone does NOT decide the BMG.

For example:

99% textual similarity
does NOT automatically mean same BMG.

60% textual similarity
does NOT automatically mean different BMG.

The important question is:

"Are these technically equivalent products for the
purpose represented by the BMG identity?"

Technical equivalence is more important than wording.

============================================================
60% THRESHOLD
============================================================

60% is the minimum confidence required for assigning an
existing BMG identity.

However:

60% confidence alone does NOT prove equivalence.

You must first determine that the existing BMG is
technically compatible.

Then:

IF technically equivalent
AND confidence >= 60

→ REUSE_EXISTING

IF technically incompatible
OR no equivalent BMG exists

→ CREATE_NEW

============================================================
MISSING DATA
============================================================

Do not invent specifications.

Missing information creates uncertainty.

However, missing information alone does NOT prove that
two products are different.

Use all available evidence.

============================================================
BMG IDENTITY
============================================================

The BMG identity must describe the COMMON PRODUCT.

Never include:

- company name
- company material number
- company-specific code
- internal company identifier

The company material number belongs only to the original
company material record.

============================================================
NCS NAME
============================================================

Return a neutral standardized product name.

Examples:

O-RING
BALL BEARING
GATE VALVE
GASKET
PRESSURE GAUGE
ELECTRIC MOTOR

Do not use company-specific naming.

============================================================
DECISION PROCESS
============================================================

Follow these steps internally:

STEP 1:
Understand the technical identity of the new material.

STEP 2:
Inspect EVERY existing BMG identity.

STEP 3:
Compare the new material against representative materials
belonging to each BMG.

STEP 4:
Identify critical technical specifications.

STEP 5:
Reject BMGs containing critical engineering conflicts.

STEP 6:
If an existing BMG is technically equivalent, REUSE it.

STEP 7:
Only if NO existing BMG is technically equivalent,
CREATE a new BMG identity.

============================================================
VERY IMPORTANT
============================================================

If the new material is technically equivalent to an existing
BMG, you MUST NOT return CREATE_NEW.

Even if:

- the company differs
- the material number differs
- description differs
- manufacturer differs
- wording differs
- confidence is 80%
- confidence is 90%
- confidence is 95%
- confidence is 99%

REUSE the existing BMG.

============================================================
OUTPUT
============================================================

Return exactly ONE JSON object.

For existing BMG:

{
  "decision": "REUSE_EXISTING",
  "existing_bmg_id": 123,
  "confidence": 95,
  "ncs_name": "BALL BEARING",
  "category": "BEARING",
  "subcategory": "DEEP GROOVE BALL BEARING",
  "reason": "Technically equivalent to the existing BMG common identity.",
  "matched_aspects": [
    "product type",
    "bearing series",
    "dimensions",
    "application"
  ],
  "differences": []
}

For new BMG:

{
  "decision": "CREATE_NEW",
  "existing_bmg_id": null,
  "confidence": 90,
  "ncs_name": "BALL BEARING",
  "category": "BEARING",
  "subcategory": "DEEP GROOVE BALL BEARING",
  "reason": "No existing BMG identity is technically equivalent.",
  "matched_aspects": [],
  "differences": []
}

============================================================
FINAL DUPLICATE CHECK
============================================================

Before returning CREATE_NEW, ask:

"Could any existing BMG represent the same technical
product identity?"

If YES:

→ REUSE_EXISTING

If NO:

→ CREATE_NEW

This check is mandatory.

============================================================
NEW MATERIAL
============================================================

${JSON.stringify(
  sourceProfile,
  null,
  2
)}

============================================================
EXISTING BMG IDENTITIES
============================================================

${JSON.stringify(
  existingPayload,
  null,
  2
)}
`;
}

// ============================================================
// GEMINI TEMPORARY ERROR DETECTION
// ============================================================

function isTemporaryGeminiError(error) {
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
    status === 429 ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

// ============================================================
// ASK GEMINI
// ============================================================

async function askAIForBMG(
  sourceProfile,
  existingBMGs
) {
  const prompt =
    buildBMGPrompt(
      sourceProfile,
      existingBMGs
    );

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= 4;
    attempt++
  ) {
    try {
      console.log(
        `BMG AI attempt ${attempt}/4 using gemini-3.6-flash`
      );

      const response =
        await ai.models.generateContent({
          model:
            "gemini-3.6-flash",

          contents:
            prompt,

          config: {
            responseMimeType:
              "application/json",
          },
        });

      const text =
        response?.text;

      if (!text) {
        throw new Error(
          "BMG AI returned an empty response."
        );
      }

      let parsed;

      try {
        parsed =
          JSON.parse(text);
      } catch {
        console.error(
          "Invalid BMG AI JSON:",
          text
        );

        throw new Error(
          "BMG AI returned invalid JSON."
        );
      }

      return parsed;
    } catch (error) {
      lastError = error;

      console.error(
        `BMG AI attempt ${attempt} failed:`,
        error
      );

      if (
        !isTemporaryGeminiError(
          error
        )
      ) {
        throw error;
      }

      if (attempt >= 4) {
        break;
      }

      const waitTime =
        attempt === 1
          ? 2000
          : attempt === 2
          ? 4000
          : 8000;

      console.log(
        `Gemini temporarily unavailable. Retrying in ${waitTime} ms...`
      );

      await sleep(waitTime);
    }
  }

  throw new Error(
    `Gemini 3.6 Flash was unavailable after 4 attempts. Last error: ${
      lastError?.message ||
      String(lastError)
    }`
  );
}

// ============================================================
// CREATE NEW BMG
// ============================================================

async function createNewBMG(
  supabase,
  decision,
  sourceMaterial
) {
  const ncsName =
    clean(decision.ncs_name) ||
    clean(sourceMaterial.description) ||
    "UNCLASSIFIED MATERIAL";

  const category =
    clean(decision.category) ||
    clean(sourceMaterial.category) ||
    "UNCLASSIFIED";

  const subcategory =
    clean(decision.subcategory);

  const {
    data: bmg,
    error,
  } = await supabase
    .from("bmg_materials")
    .insert({
      ncs_name:
        ncsName,

      category:
        category,

      subcategory:
        subcategory,

      ncs_standard_specification:
        null,

      status:
        "PROPOSED",
    })
    .select(
      [
        "bmg_id",
        "bmg_code",
        "ncs_name",
        "category",
        "subcategory",
        "ncs_standard_specification",
        "status",
      ].join(",")
    )
    .single();

  if (error) {
    throw new Error(
      `Failed to create BMG identity: ${error.message}`
    );
  }

  return bmg;
}

// ============================================================
// MAP MATERIAL TO BMG
// ============================================================

async function mapMaterialToBMG(
  supabase,
  materialId,
  bmgId,
  confidence,
  reason
) {
  // ----------------------------------------------------------
  // Deactivate any previous active mapping
  // ----------------------------------------------------------

  const {
    error:
      deactivateError,
  } = await supabase
    .from("material_bmg_mapping")
    .update({
      active: false,
    })
    .eq(
      "material_id",
      materialId
    )
    .eq(
      "active",
      true
    );

  if (deactivateError) {
    throw new Error(
      `Failed to deactivate old BMG mapping: ${deactivateError.message}`
    );
  }

  // ----------------------------------------------------------
  // Create new active mapping
  // ----------------------------------------------------------

  const {
    data: mapping,
    error:
      mappingError,
  } = await supabase
    .from("material_bmg_mapping")
    .insert({
      material_id:
        materialId,

      bmg_id:
        bmgId,

      match_status:
        "AI_PROPOSED",

      ai_confidence:
        confidence,

      ai_reason:
        reason,

      verified:
        false,

      verified_by:
        null,

      verified_at:
        null,

      active:
        true,
    })
    .select(
      [
        "mapping_id",
        "material_id",
        "bmg_id",
        "match_status",
        "ai_confidence",
        "ai_reason",
        "verified",
        "active",
      ].join(",")
    )
    .single();

  if (mappingError) {
    throw new Error(
      `Failed to create BMG mapping: ${mappingError.message}`
    );
  }

  // ----------------------------------------------------------
  // Also store BMG ID on materials
  // ----------------------------------------------------------

  const {
    error:
      materialUpdateError,
  } = await supabase
    .from("materials")
    .update({
      bmg_id:
        bmgId,
    })
    .eq(
      "id",
      materialId
    );

  if (materialUpdateError) {
    throw new Error(
      `Failed to update material BMG ID: ${materialUpdateError.message}`
    );
  }

  return mapping;
}

// ============================================================
// GOVERNMENT REVIEW REQUEST
// ============================================================

async function createReviewRequest(
  supabase,
  bmgId
) {
  const {
    data: existingRequest,
    error:
      lookupError,
  } = await supabase
    .from(
      "bmg_standardization_requests"
    )
    .select(
      "request_id, bmg_id, status, created_at"
    )
    .eq(
      "bmg_id",
      bmgId
    )
    .eq(
      "status",
      "PENDING_REVIEW"
    )
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `Failed to check government review request: ${lookupError.message}`
    );
  }

  if (existingRequest) {
    return existingRequest;
  }

  const {
    data: request,
    error:
      requestError,
  } = await supabase
    .from(
      "bmg_standardization_requests"
    )
    .insert({
      bmg_id:
        bmgId,

      status:
        "PENDING_REVIEW",

      created_by_ai:
        true,

      reviewed_by:
        null,

      review_date:
        null,

      government_comments:
        null,
    })
    .select(
      [
        "request_id",
        "bmg_id",
        "status",
        "created_by_ai",
        "reviewed_by",
        "review_date",
        "government_comments",
        "created_at",
      ].join(",")
    )
    .single();

  if (requestError) {
    throw new Error(
      `Failed to create BMG government review request: ${requestError.message}`
    );
  }

  return request;
}

// ============================================================
// MAIN POST
// ============================================================

export async function POST(
  request
) {
  try {
    const supabase =
      getSupabaseAdmin();

    // ========================================================
    // ENVIRONMENT CHECK
    // ========================================================

    if (
      !process.env.GEMINI_API_KEY
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "GEMINI_API_KEY is missing.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // READ REQUEST
    // ========================================================

    const body =
      await request.json();

    const materialId =
      Number(
        body?.materialId
      );

    if (
      !materialId ||
      Number.isNaN(
        materialId
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid materialId is required.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // LOAD SOURCE MATERIAL
    // ========================================================

    const {
      material,
      detail,
    } =
      await loadSourceMaterial(
        supabase,
        materialId
      );

    // ========================================================
    // ALREADY ASSIGNED
    //
    // Do not create duplicate mappings.
    // ========================================================

    if (
      material.bmg_id
    ) {
      const {
        data: existingBMG,
        error:
          existingBMGError,
      } = await supabase
        .from(
          "bmg_materials"
        )
        .select(
          [
            "bmg_id",
            "bmg_code",
            "ncs_name",
            "category",
            "subcategory",
            "ncs_standard_specification",
            "status",
          ].join(",")
        )
        .eq(
          "bmg_id",
          material.bmg_id
        )
        .maybeSingle();

      if (existingBMGError) {
        throw new Error(
          `Failed to load existing BMG identity: ${existingBMGError.message}`
        );
      }

      if (existingBMG) {
        return NextResponse.json({
          success: true,

          action:
            "ALREADY_ASSIGNED",

          data: {
            material_id:
              material.id,

            unique_product_code:
              material.unique_product_code,

            bmg_id:
              existingBMG.bmg_id,

            bmg_code:
              existingBMG.bmg_code,

            ncs_name:
              existingBMG.ncs_name,

            bmg_status:
              existingBMG.status,

            government_review:
              "PENDING",
          },
        });
      }
    }

    // ========================================================
    // BUILD SOURCE PROFILE
    // ========================================================

    const sourceProfile =
      buildMaterialProfile(
        material,
        detail
      );

    // ========================================================
    // LOAD EXISTING BMG IDENTITIES
    // ========================================================

    const existingBMGs =
      await loadExistingBMGs(
        supabase,
        materialId
      );

    console.log(
      `Loaded ${existingBMGs.length} existing BMG identities for material ${materialId}.`
    );

    // ========================================================
    // ASK GEMINI
    // ========================================================

    const decision =
      await askAIForBMG(
        sourceProfile,
        existingBMGs
      );

    // ========================================================
    // VALIDATE AI RESPONSE
    // ========================================================

    if (
      !decision ||
      typeof decision !==
        "object"
    ) {
      throw new Error(
        "AI returned an invalid BMG decision."
      );
    }

    const confidence =
      Number(
        decision.confidence
      );

    if (
      Number.isNaN(
        confidence
      ) ||
      confidence < 0 ||
      confidence > 100
    ) {
      throw new Error(
        "AI returned an invalid confidence score."
      );
    }

    if (
      decision.decision !==
        "REUSE_EXISTING" &&
      decision.decision !==
        "CREATE_NEW"
    ) {
      throw new Error(
        `Invalid AI BMG decision: ${decision.decision}`
      );
    }

    // ========================================================
    // DETERMINE BMG
    // ========================================================

    let bmg;
    let action;

    // ========================================================
    // REUSE EXISTING BMG
    // ========================================================

    if (
      decision.decision ===
      "REUSE_EXISTING"
    ) {
      const existingBmgId =
        Number(
          decision.existing_bmg_id
        );

      if (
        !existingBmgId ||
        Number.isNaN(
          existingBmgId
        )
      ) {
        throw new Error(
          "AI selected REUSE_EXISTING but returned an invalid BMG ID."
        );
      }

      // ------------------------------------------------------
      // SECURITY / VALIDATION
      //
      // Gemini cannot assign an arbitrary BMG ID.
      // The BMG must actually exist in the candidate list.
      // ------------------------------------------------------

      const candidate =
        existingBMGs.find(
          (item) =>
            Number(
              item.bmg.bmg_id
            ) ===
            existingBmgId
        );

      if (!candidate) {
        throw new Error(
          "AI attempted to reuse a BMG identity that was not in the supplied candidate list."
        );
      }

      // ------------------------------------------------------
      // 60% ASSIGNMENT THRESHOLD
      // ------------------------------------------------------

      if (
        confidence < 60
      ) {
        throw new Error(
          `AI confidence (${confidence}%) is below the 60% threshold required to reuse an existing BMG identity.`
        );
      }

      bmg =
        candidate.bmg;

      action =
        "REUSE_EXISTING";
    }

    // ========================================================
    // CREATE NEW BMG
    // ========================================================

    else {
      /*
       * Gemini is only allowed to create a new identity after
       * checking every existing BMG identity.
       *
       * The prompt explicitly requires this.
       */

      bmg =
        await createNewBMG(
          supabase,
          decision,
          material
        );

      action =
        "CREATE_NEW";
    }

    // ========================================================
    // SAVE MATERIAL → BMG MAPPING
    // ========================================================

    const reason =
      clean(
        decision.reason
      ) ||
      "BMG identity assigned by AI material standardization engine.";

    const mapping =
      await mapMaterialToBMG(
        supabase,
        materialId,
        bmg.bmg_id,
        confidence,
        reason
      );

    // ========================================================
    // GOVERNMENT REVIEW
    // ========================================================

    const reviewRequest =
      await createReviewRequest(
        supabase,
        bmg.bmg_id
      );

    // ========================================================
    // LOG ASSIGNMENT
    // ========================================================

    console.log(
      JSON.stringify(
        {
          materialId,
          company:
            material.company,
          companyMaterialNumber:
            material.material_number,
          action,
          bmgId:
            bmg.bmg_id,
          bmgCode:
            bmg.bmg_code,
          confidence,
        },
        null,
        2
      )
    );

    // ========================================================
    // RETURN RESULT
    // ========================================================

    return NextResponse.json({
      success: true,

      action,

      data: {
        material_id:
          materialId,

        unique_product_code:
          material.unique_product_code,

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

        bmg_status:
          bmg.status,

        ai_confidence:
          confidence,

        ai_reason:
          reason,

        matched_aspects:
          Array.isArray(
            decision.matched_aspects
          )
            ? decision.matched_aspects
            : [],

        differences:
          Array.isArray(
            decision.differences
          )
            ? decision.differences
            : [],

        mapping_id:
          mapping.mapping_id,

        government_review:
          reviewRequest.status,

        standardization_request_id:
          reviewRequest.request_id,
      },
    });
  } catch (error) {
    console.error(
      "BMG ASSIGNMENT ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Failed to assign BMG Common Code.",

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