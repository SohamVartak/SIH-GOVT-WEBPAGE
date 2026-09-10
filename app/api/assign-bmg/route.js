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

  return text || null;
}

// ============================================================
// BUILD SOURCE MATERIAL PROFILE
// ============================================================

function buildMaterialProfile(
  material,
  detail
) {
  return {
    company:
      material?.company || null,

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
    .eq(
      "id",
      materialId
    )
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
    .eq(
      "material_id",
      materialId
    )
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
// LOAD EXISTING BMG IDENTITIES
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
    .order(
      "bmg_id",
      {
        ascending: true,
      }
    );

  if (bmgError) {
    throw new Error(
      `Failed to load BMG identities: ${bmgError.message}`
    );
  }

  if (
    !bmgRows ||
    bmgRows.length === 0
  ) {
    return [];
  }

  const {
    data: mappings,
    error: mappingError,
  } = await supabase
    .from(
      "material_bmg_mapping"
    )
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
    .eq(
      "active",
      true
    )
    .neq(
      "material_id",
      sourceMaterialId
    );

  if (mappingError) {
    throw new Error(
      `Failed to load BMG mappings: ${mappingError.message}`
    );
  }

  if (
    !mappings ||
    mappings.length === 0
  ) {
    return [];
  }

  const materialIds = [
    ...new Set(
      mappings.map(
        (row) =>
          row.material_id
      )
    ),
  ];

  if (
    materialIds.length === 0
  ) {
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
    .in(
      "id",
      materialIds
    );

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
    .in(
      "material_id",
      materialIds
    );

  if (detailsError) {
    throw new Error(
      `Failed to load representative material details: ${detailsError.message}`
    );
  }

  const materialMap =
    new Map();

  for (
    const material of
    materials || []
  ) {
    materialMap.set(
      material.id,
      material
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

  const groups =
    new Map();

  for (
    const bmg of
    bmgRows
  ) {
    groups.set(
      bmg.bmg_id,
      {
        bmg,
        representatives: [],
      }
    );
  }

  for (
    const mapping of
    mappings
  ) {
    const group =
      groups.get(
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
// BUILD AI PROMPT
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
            .slice(0, 5)
            .map(
              (item) =>
                item.profile
            ),
      })
    );

  return `
You are the BMG material identity engine for Bharat Material Grid.

Your task is to determine whether the NEW MATERIAL is
technically equivalent to an existing BMG Common Material Identity.

BMG Common Code represents one common technical identity.

Different companies may share the same BMG code.

The original company material number must NEVER be changed.

Do NOT determine equivalence using only similar wording.

Analyze engineering characteristics including:

- product type
- product function
- material family
- material grade
- dimensions
- pressure rating
- temperature rating
- standards
- end connections
- design features
- manufacturer
- model
- part number
- application
- technical specifications
- description

Rules:

1. Technical equivalence is required.
2. Missing information is uncertainty, not equality.
3. Never invent missing technical information.
4. Critical engineering conflicts should prevent reuse.
5. Different companies may share one BMG code.
6. Different company material numbers may share one BMG code.
7. Do not create a new BMG identity merely because the wording differs.
8. Do not reuse an existing BMG identity merely because the wording is similar.
9. If no technically equivalent identity exists, create a new BMG identity.
10. The NCS name must be a neutral standardized product name.
11. Never include a company name in the NCS name.
12. Return ONLY valid JSON.

NEW MATERIAL:

${JSON.stringify(
  sourceProfile,
  null,
  2
)}

EXISTING BMG IDENTITIES:

${JSON.stringify(
  existingPayload,
  null,
  2
)}

Return exactly one JSON object.

For an existing match:

{
  "decision": "REUSE_EXISTING",
  "existing_bmg_id": 123,
  "confidence": 95,
  "ncs_name": "O-RING",
  "category": "SEAL",
  "subcategory": "O-RING",
  "reason": "Technically equivalent based on product function and engineering characteristics.",
  "matched_aspects": [
    "product type",
    "dimensions",
    "material"
  ],
  "differences": []
}

For a new identity:

{
  "decision": "CREATE_NEW",
  "existing_bmg_id": null,
  "confidence": 90,
  "ncs_name": "O-RING",
  "category": "SEAL",
  "subcategory": "O-RING",
  "reason": "No existing BMG identity is technically equivalent.",
  "matched_aspects": [],
  "differences": []
}
`;
}

// ============================================================
// TEMPORARY GEMINI ERROR DETECTION
// ============================================================

function isTemporaryGeminiError(
  error
) {
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
    message.includes(
      "unavailable"
    ) ||
    message.includes(
      "high demand"
    ) ||
    message.includes(
      "temporarily"
    ) ||
    message.includes(
      "rate limit"
    ) ||
    message.includes(
      "overloaded"
    )
  );
}

// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

// ============================================================
// AI CALL
//
// Only gemini-3.6-flash is used.
// It gets 4 attempts on temporary 503/429 errors.
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

  let lastError =
    null;

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
          JSON.parse(
            text
          );
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
      lastError =
        error;

      console.error(
        `BMG AI attempt ${attempt} failed:`,
        error
      );

      // ------------------------------------------------------
      // STOP immediately for non-temporary errors.
      // ------------------------------------------------------

      if (
        !isTemporaryGeminiError(
          error
        )
      ) {
        throw error;
      }

      // ------------------------------------------------------
      // No delay after final attempt.
      // ------------------------------------------------------

      if (
        attempt >= 4
      ) {
        break;
      }

      // ------------------------------------------------------
      // Increasing retry delay.
      // ------------------------------------------------------

      const waitTime =
        attempt === 1
          ? 2000
          : attempt === 2
          ? 4000
          : 8000;

      console.log(
        `Gemini temporarily unavailable. Retrying in ${waitTime} ms...`
      );

      await sleep(
        waitTime
      );
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
// CREATE NEW BMG IDENTITY
// ============================================================

async function createNewBMG(
  supabase,
  decision,
  sourceMaterial
) {
  const ncsName =
    clean(
      decision.ncs_name
    ) ||
    clean(
      sourceMaterial.description
    ) ||
    "UNCLASSIFIED MATERIAL";

  const category =
    clean(
      decision.category
    ) ||
    clean(
      sourceMaterial.category
    );

  const subcategory =
    clean(
      decision.subcategory
    );

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
  // Deactivate previous active mappings.
  // ----------------------------------------------------------

  const {
    error:
      deactivateError,
  } = await supabase
    .from(
      "material_bmg_mapping"
    )
    .update({
      active:
        false,
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
  // Create mapping.
  // ----------------------------------------------------------

  const {
    data: mapping,
    error:
      mappingError,
  } = await supabase
    .from(
      "material_bmg_mapping"
    )
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
  // Store BMG ID directly on materials.
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
          success:
            false,

          error:
            "GEMINI_API_KEY is missing.",
        },
        {
          status:
            500,
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
          success:
            false,

          error:
            "A valid materialId is required.",
        },
        {
          status:
            400,
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
    // ALREADY HAS BMG
    //
    // In this situation we DO NOT call Gemini.
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
          success:
            true,

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
    // DETERMINE BMG IDENTITY
    // ========================================================

    let bmg;
    let action;

    // ========================================================
    // REUSE EXISTING
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
      // SAFETY THRESHOLD
      // ------------------------------------------------------

      if (
        confidence < 80
      ) {
        throw new Error(
          `AI confidence (${confidence}%) is below the 80% threshold required to reuse an existing BMG identity.`
        );
      }

      bmg =
        candidate.bmg;

      action =
        "REUSE_EXISTING";
    }

    // ========================================================
    // CREATE NEW
    // ========================================================

    else {
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
    // SAVE MAPPING
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
    // RETURN RESULT
    // ========================================================

    return NextResponse.json({
      success:
        true,

      action:
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
        success:
          false,

        error:
          error?.message ||
          "Failed to assign BMG Common Code.",

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