import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((word) => word.trim())
      .filter((word) => word.length >= 2)
  );
}

function tokenSimilarity(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (!aTokens.size || !bTokens.size) {
    return 0;
  }

  let common = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      common++;
    }
  }

  const union = new Set([
    ...aTokens,
    ...bTokens,
  ]).size;

  return union === 0 ? 0 : common / union;
}

function buildMaterialText(material, detail) {
  const detailText = detail
    ? [
        detail.material_type,
        detail.material_family,
        detail.dimensions,
        detail.material_grade,
        detail.pressure_rating,
        detail.temperature_rating,
        detail.standard,
        detail.manufacturer,
        detail.model,
        detail.part_number,
        detail.design_features,
        detail.application,
        JSON.stringify(detail.raw_attributes || {}),
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return [
    material.company,
    material.material_number,
    material.description,
    material.specifications,
    material.category,
    detailText,
  ]
    .filter(Boolean)
    .join(" ");
}

function companyKey(company) {
  return normalizeText(company).toUpperCase();
}

async function loadAllMaterials(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const to = from + pageSize - 1;

    const {
      data,
      error,
    } = await supabase
      .from("materials")
      .select(
        "id, company, company_id, material_number, description, specifications, category"
      )
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Failed to load material catalog: ${error.message}`
      );
    }

    const page = data || [];

    all.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return all;
}

async function loadDetailsForMaterials(
  supabase,
  materialIds
) {
  if (!materialIds.length) {
    return {};
  }

  const detailsByMaterialId = {};

  const chunkSize = 500;

  for (
    let index = 0;
    index < materialIds.length;
    index += chunkSize
  ) {
    const chunk = materialIds.slice(
      index,
      index + chunkSize
    );

    const {
      data,
      error,
    } = await supabase
      .from("material_details")
      .select(
        [
          "material_id",
          "material_type",
          "material_family",
          "dimensions",
          "material_grade",
          "pressure_rating",
          "temperature_rating",
          "standard",
          "manufacturer",
          "model",
          "part_number",
          "design_features",
          "application",
          "raw_attributes",
        ].join(",")
      )
      .in("material_id", chunk);

    if (error) {
      throw new Error(
        `Failed to load material details: ${error.message}`
      );
    }

    for (const row of data || []) {
      detailsByMaterialId[row.material_id] = row;
    }
  }

  return detailsByMaterialId;
}

function selectBestCandidatePerCompany(
  source,
  sourceDetail,
  materials,
  detailsByMaterialId
) {
  const sourceText = buildMaterialText(
    source,
    sourceDetail
  );

  const sourceFamily = normalizeText(
    sourceDetail?.material_family ||
      source.category
  );

  const candidates = [];

  for (const material of materials) {
    if (material.id === source.id) {
      continue;
    }

    if (
      companyKey(material.company) ===
      companyKey(source.company)
    ) {
      continue;
    }

    const detail =
      detailsByMaterialId[material.id];

    const candidateText =
      buildMaterialText(
        material,
        detail
      );

    const descriptionScore =
      tokenSimilarity(
        source.description,
        material.description
      );

    const specificationScore =
      tokenSimilarity(
        source.specifications,
        material.specifications
      );

    const fullTextScore =
      tokenSimilarity(
        sourceText,
        candidateText
      );

    const candidateFamily =
      normalizeText(
        detail?.material_family ||
          material.category
      );

    const familyScore =
      sourceFamily &&
      candidateFamily
        ? tokenSimilarity(
            sourceFamily,
            candidateFamily
          )
        : 0;

    const preliminaryScore =
      (
        descriptionScore * 0.30 +
        specificationScore * 0.30 +
        fullTextScore * 0.25 +
        familyScore * 0.15
      ) * 100;

    candidates.push({
      material,
      detail,
      preliminaryScore:
        Number(
          preliminaryScore.toFixed(2)
        ),
    });
  }

  /*
   * Only keep the strongest candidates.
   * We then keep ONE candidate per company.
   */
  candidates.sort(
    (a, b) =>
      b.preliminaryScore -
      a.preliminaryScore
  );

  const selected = [];
  const companiesSeen = new Set();

  for (const candidate of candidates) {
    const company =
      companyKey(
        candidate.material.company
      );

    if (companiesSeen.has(company)) {
      continue;
    }

    companiesSeen.add(company);
    selected.push(candidate);

    if (selected.length >= 30) {
      break;
    }
  }

  return selected;
}

async function askAIToCompare(
  source,
  sourceDetail,
  candidates
) {
  const sourcePayload = {
    company: source.company,
    material_number:
      source.material_number,
    description:
      source.description,
    specifications:
      source.specifications,
    category:
      source.category,
    technical_attributes:
      sourceDetail || {},
  };

  const candidatePayload =
    candidates.map(
      (candidate, index) => ({
        candidate_number:
          index + 1,

        company:
          candidate.material.company,

        material_id:
          candidate.material.id,

        material_number:
          candidate.material.material_number,

        description:
          candidate.material.description,

        specifications:
          candidate.material.specifications,

        category:
          candidate.material.category,

        technical_attributes:
          candidate.detail || {},

        preliminary_score:
          candidate.preliminaryScore,
      })
    );

  const prompt = `
You are an industrial material standardization AI
for a Government of India material harmonization system.

Your job is to determine whether a source material is
technically equivalent to candidate materials from OTHER
companies.

STRICT RULES:

1. Never compare a material with the same company.
2. Never rely only on product name similarity.
3. Compare engineering information such as:
   - product type
   - material family
   - dimensions
   - material / grade
   - pressure rating
   - temperature rating
   - standards
   - end connection
   - manufacturer
   - model
   - design features
   - application
   - detailed specifications
4. Missing information must NOT be treated as matching.
5. Do not invent specifications.
6. A candidate should only be considered an equivalent
   when the available technical evidence supports it.
7. We want at most ONE best candidate from each company.
8. Government approval is required before a proposed NCS
   identity becomes official.

SOURCE MATERIAL:

${JSON.stringify(
  sourcePayload,
  null,
  2
)}

CANDIDATES:

${JSON.stringify(
  candidatePayload,
  null,
  2
)}

Return ONLY valid JSON in this exact form:

{
  "matches": [
    {
      "candidate_number": 1,
      "is_equivalent": true,
      "confidence": 96,
      "matched_aspects": [
        "..."
      ],
      "differences": [
        "..."
      ],
      "reason": "...",
      "common_material_name": "..."
    }
  ]
}

Use confidence from 0 to 100.

Only include candidates with
"is_equivalent": true.

Do not create a common code yourself.
The server will manage NCS code creation/reuse.
`;

  const response =
    await ai.models.generateContent({
      model:
        "gemini-3.6-flash",
      contents: prompt,
    });

  const responseText =
    response.text;

  if (!responseText) {
    throw new Error(
      "AI comparison returned an empty response."
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(responseText);
  } catch {
    throw new Error(
      "AI comparison returned invalid JSON."
    );
  }

  if (
    !Array.isArray(
      parsed.matches
    )
  ) {
    parsed.matches = [];
  }

  return parsed;
}

async function findExistingNCS(
  supabase,
  materialIds
) {
  if (!materialIds.length) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "material_ncs_mapping"
    )
    .select(
      "ncs_id, ai_confidence, match_status, verified"
    )
    .in(
      "material_id",
      materialIds
    )
    .not(
      "ncs_id",
      "is",
      null
    )
    .order(
      "verified",
      {
        ascending: false,
      }
    )
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to find existing NCS mapping: ${error.message}`
    );
  }

  if (!data?.length) {
    return null;
  }

  return data[0].ncs_id;
}

function makeNCSCode(
  commonName,
  sourceMaterialId
) {
  const normalized =
    normalizeText(
      commonName
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 24);

  const suffix =
    String(
      sourceMaterialId
    )
      .padStart(6, "0")
      .slice(-6);

  return `NCS-${normalized || "MATERIAL"}-${suffix}`;
}

async function getOrCreateNCS(
  supabase,
  matchedMaterialIds,
  commonMaterialName,
  sourceMaterial
) {
  const existingNCSId =
    await findExistingNCS(
      supabase,
      matchedMaterialIds
    );

  if (existingNCSId) {
    const {
      data,
      error,
    } = await supabase
      .from("ncs_materials")
      .select(
        "ncs_id, ncs_code, ncs_name, status"
      )
      .eq(
        "ncs_id",
        existingNCSId
      )
      .single();

    if (error) {
      throw new Error(
        `Failed to load existing NCS record: ${error.message}`
      );
    }

    return data;
  }

  let ncsCode =
    makeNCSCode(
      commonMaterialName,
      sourceMaterial.id
    );

  let attempt = 0;

  while (attempt < 5) {
    const {
      data,
      error,
    } = await supabase
      .from("ncs_materials")
      .insert({
        ncs_code:
          ncsCode,

        ncs_name:
          commonMaterialName ||
          sourceMaterial.description ||
          "Unclassified Material",

        category:
          sourceMaterial.category ||
          null,

        subcategory:
          null,

        standard_specification:
          null,

        status:
          "PROPOSED",
      })
      .select(
        "ncs_id, ncs_code, ncs_name, status"
      )
      .single();

    if (!error && data) {
      return data;
    }

    attempt++;

    ncsCode =
      `${makeNCSCode(
        commonMaterialName,
        sourceMaterial.id
      )}-${attempt}`;
  }

  throw new Error(
    "Failed to create NCS proposal."
  );
}

async function saveMappings(
  supabase,
  ncs,
  sourceMaterial,
  sourceMatch,
  acceptedMatches
) {
  const rows = [];

  rows.push({
    material_id:
      sourceMaterial.id,

    ncs_id:
      ncs.ncs_id,

    ai_confidence:
      sourceMatch?.confidence ??
      0,

    ai_reason:
      sourceMatch?.reason ||
      "AI proposed common material identity.",

    match_status:
      "AI_PROPOSED",

    verified:
      false,
  });

  for (const match of acceptedMatches) {
    rows.push({
      material_id:
        match.candidate.material.id,

      ncs_id:
        ncs.ncs_id,

      ai_confidence:
        match.ai.confidence,

      ai_reason:
        match.ai.reason,

      match_status:
        "AI_PROPOSED",

      verified:
        false,
    });
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "material_ncs_mapping"
    )
    .upsert(
      rows,
      {
        onConflict:
          "material_id,ncs_id",
        ignoreDuplicates:
          false,
      }
    )
    .select();

  if (error) {
    throw new Error(
      `Failed to save NCS mappings: ${error.message}`
    );
  }

  return data || [];
}

export async function POST(request) {
  try {
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

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

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "GEMINI_API_KEY is missing.",
        },
        { status: 500 }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    const body =
      await request.json();

    const materialId =
      Number(
        body.materialId
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
        { status: 400 }
      );
    }

    // ============================================================
    // 1. LOAD SOURCE MATERIAL
    // ============================================================

    const {
      data: source,
      error: sourceError,
    } = await supabase
      .from("materials")
      .select(
        "id, company, company_id, material_number, description, specifications, category"
      )
      .eq(
        "id",
        materialId
      )
      .single();

    if (sourceError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Source material not found.",
          details:
            sourceError.message,
        },
        { status: 404 }
      );
    }

    const {
      data: sourceDetail,
      error: sourceDetailError,
    } = await supabase
      .from("material_details")
      .select(
        [
          "material_id",
          "material_type",
          "material_family",
          "dimensions",
          "material_grade",
          "pressure_rating",
          "temperature_rating",
          "standard",
          "manufacturer",
          "model",
          "part_number",
          "design_features",
          "application",
          "raw_attributes",
        ].join(",")
      )
      .eq(
        "material_id",
        materialId
      )
      .maybeSingle();

    if (sourceDetailError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to load source material details.",
          details:
            sourceDetailError.message,
        },
        { status: 500 }
      );
    }

    // ============================================================
    // 2. LOAD MATERIAL CATALOG
    // ============================================================

    const allMaterials =
      await loadAllMaterials(
        supabase
      );

    const materialIds =
      allMaterials.map(
        (material) =>
          material.id
      );

    const detailsByMaterialId =
      await loadDetailsForMaterials(
        supabase,
        materialIds
      );

    // ============================================================
    // 3. PRESELECT CANDIDATES
    // ============================================================

    const preliminaryCandidates =
      selectBestCandidatePerCompany(
        source,
        sourceDetail,
        allMaterials,
        detailsByMaterialId
      );

    if (
      preliminaryCandidates.length ===
      0
    ) {
      return NextResponse.json({
        success: true,
        matched: false,
        message:
          "No cross-company candidates were found.",
        data: {
          source_material_id:
            source.id,
          source_company:
            source.company,
          candidates_considered:
            0,
          matches: [],
        },
      });
    }

    // ============================================================
    // 4. AI ENGINEERING COMPARISON
    // ============================================================

    const aiResult =
      await askAIToCompare(
        source,
        sourceDetail,
        preliminaryCandidates
      );

    const acceptedMatches = [];

    for (const aiMatch of aiResult.matches) {
      const candidate =
        preliminaryCandidates[
          Number(
            aiMatch.candidate_number
          ) - 1
        ];

      if (!candidate) {
        continue;
      }

      if (
        aiMatch.is_equivalent !==
          true
      ) {
        continue;
      }

      const confidence =
        Number(
          aiMatch.confidence
        );

      if (
        Number.isNaN(
          confidence
        ) ||
        confidence < 75
      ) {
        continue;
      }

      acceptedMatches.push({
        candidate,
        ai: {
          confidence,
          matched_aspects:
            Array.isArray(
              aiMatch.matched_aspects
            )
              ? aiMatch.matched_aspects
              : [],

          differences:
            Array.isArray(
              aiMatch.differences
            )
              ? aiMatch.differences
              : [],

          reason:
            aiMatch.reason ||
            "AI identified technical equivalence.",
        },
      });
    }

    // ============================================================
    // 5. REQUIRE AT LEAST ONE OTHER COMPANY MATCH
    // ============================================================

    if (
      acceptedMatches.length ===
      0
    ) {
      return NextResponse.json({
        success: true,
        matched: false,
        message:
          "No sufficiently strong cross-company equivalent was identified.",
        data: {
          source_material_id:
            source.id,

          source_company:
            source.company,

          candidates_considered:
            preliminaryCandidates.length,

          matches: [],
        },
      });
    }

    // ============================================================
    // 6. DETERMINE COMMON NAME
    // ============================================================

    const commonNames =
      acceptedMatches
        .map(
          (match) =>
            match.ai
              .common_material_name
        )
        .filter(Boolean);

    const commonMaterialName =
      commonNames[0] ||
      sourceDetail?.material_family ||
      source.category ||
      source.description ||
      "Standard Material";

    // ============================================================
    // 7. CHECK WHETHER A MATCHED MATERIAL ALREADY
    //    HAS AN NCS ID
    // ============================================================

    const matchedIds = [
      source.id,
      ...acceptedMatches.map(
        (match) =>
          match.candidate.material.id
      ),
    ];

    const ncs =
      await getOrCreateNCS(
        supabase,
        matchedIds,
        commonMaterialName,
        source
      );

    // ============================================================
    // 8. SAVE AI PROPOSALS
    // ============================================================

    const savedMappings =
      await saveMappings(
        supabase,
        ncs,
        source,
        {
          confidence:
            Math.max(
              ...acceptedMatches.map(
                (match) =>
                  match.ai.confidence
              )
            ),

          reason:
            `AI identified ${acceptedMatches.length} cross-company equivalent material(s).`,
        },
        acceptedMatches
      );

    // ============================================================
    // 9. CREATE GOVERNMENT STANDARDIZATION REQUEST
    // ============================================================

    const {
      data: existingRequest,
      error: requestLookupError,
    } = await supabase
      .from(
        "standardization_requests"
      )
      .select(
        "request_id"
      )
      .eq(
        "ncs_id",
        ncs.ncs_id
      )
      .eq(
        "status",
        "PENDING_REVIEW"
      )
      .limit(1)
      .maybeSingle();

    if (requestLookupError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to check standardization request.",
          details:
            requestLookupError.message,
        },
        { status: 500 }
      );
    }

    if (!existingRequest) {
      const {
        error:
          requestInsertError,
      } = await supabase
        .from(
          "standardization_requests"
        )
        .insert({
          ncs_id:
            ncs.ncs_id,

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
        });

      if (requestInsertError) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Failed to create government review request.",
            details:
              requestInsertError.message,
          },
          { status: 500 }
        );
      }
    }

    // ============================================================
    // 10. RETURN RESULT
    // ============================================================

    return NextResponse.json({
      success: true,

      matched: true,

      data: {
        source_material_id:
          source.id,

        source_company:
          source.company,

        source_material_code:
          source.material_number,

        ncs_id:
          ncs.ncs_id,

        ncs_code:
          ncs.ncs_code,

        ncs_name:
          ncs.ncs_name,

        ncs_status:
          ncs.status,

        government_review_required:
          true,

        matches:
          acceptedMatches.map(
            (match) => ({
              material_id:
                match.candidate
                  .material.id,

              company:
                match.candidate
                  .material.company,

              material_number:
                match.candidate
                  .material
                  .material_number,

              description:
                match.candidate
                  .material
                  .description,

              confidence:
                match.ai.confidence,

              matched_aspects:
                match.ai
                  .matched_aspects,

              differences:
                match.ai
                  .differences,

              reason:
                match.ai.reason,
            })
          ),

        mappings_saved:
          savedMappings.length,
      },
    });
  } catch (error) {
    console.error(
      "Material matching error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to compare and standardize material.",
        details:
          error?.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}