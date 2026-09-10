import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

/* ============================================================
   GEMINI
============================================================ */

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

const MAX_MODEL_ATTEMPTS = 3;

/* ============================================================
   EMBEDDING
============================================================ */

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;

/* ============================================================
   MATCHING LIMITS
============================================================ */

const VECTOR_RETRIEVAL_COUNT = 100;
const FINAL_CANDIDATE_COUNT = 30;
const MAX_CANDIDATES_PER_COMPANY = 5;

/* ============================================================
   TEXT HELPERS
============================================================ */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompany(value) {
  return normalizeText(value).toUpperCase();
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

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

/* ============================================================
   GEMINI RETRY
============================================================ */

function getErrorStatus(error) {
  return (
    error?.status ||
    error?.code ||
    error?.error?.status ||
    error?.error?.code ||
    null
  );
}

function isRetryableGeminiError(error) {
  const status = Number(getErrorStatus(error));

  if (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }

  const message = String(
    error?.message ||
      error ||
      ""
  ).toLowerCase();

  return (
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable") ||
    message.includes("resource exhausted") ||
    message.includes("deadline exceeded") ||
    message.includes("timeout")
  );
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function generateWithRetry(
  prompt,
  config
) {
  let lastError = null;

  for (
    let modelIndex = 0;
    modelIndex < GEMINI_MODELS.length;
    modelIndex++
  ) {
    const model =
      GEMINI_MODELS[modelIndex];

    for (
      let attempt = 1;
      attempt <= MAX_MODEL_ATTEMPTS;
      attempt++
    ) {
      try {
        console.log(
          `Gemini attempt: model=${model}, attempt=${attempt}/${MAX_MODEL_ATTEMPTS}`
        );

        const response =
          await ai.models.generateContent({
            model,
            contents: prompt,
            config,
          });

        console.log(
          `Gemini success using ${model}`
        );

        return {
          response,
          model,
        };
      } catch (error) {
        lastError = error;

        const retryable =
          isRetryableGeminiError(error);

        console.error(
          `Gemini error: model=${model}, attempt=${attempt}, status=${getErrorStatus(
            error
          )}, retryable=${retryable}`,
          error
        );

        if (!retryable) {
          throw error;
        }

        if (
          attempt < MAX_MODEL_ATTEMPTS
        ) {
          const baseDelay =
            1500 *
            Math.pow(
              2,
              attempt - 1
            );

          const jitter =
            Math.floor(
              Math.random() * 750
            );

          const delay =
            baseDelay + jitter;

          console.log(
            `Retrying Gemini in ${delay}ms...`
          );

          await sleep(delay);
        }
      }
    }

    console.warn(
      `Gemini model ${model} exhausted after ${MAX_MODEL_ATTEMPTS} attempts. Trying fallback model.`
    );
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models were unavailable."
    )
  );
}

/* ============================================================
   MATERIAL ATTRIBUTE TEXT
============================================================ */

function buildAttributeText(detail) {
  if (!detail) {
    return "";
  }

  return [
    detail.material_family,
    detail.dimensions,
    detail.material_grade,
    detail.pressure_rating,
    detail.temperature_rating,
    detail.standards,
    detail.manufacturer,
    detail.model,
    detail.design_features,
    detail.other_attributes,
  ]
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    )
    .map((value) => {
      if (
        typeof value === "object"
      ) {
        try {
          return JSON.stringify(
            value
          );
        } catch {
          return "";
        }
      }

      return String(value);
    })
    .join(" ");
}

function buildMaterialText(
  material,
  detail
) {
  return [
    material.company,
    material.material_number,
    material.description,
    material.specifications,
    material.category,
    buildAttributeText(detail),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildEngineeringText(
  material,
  detail
) {
  return [
    `material name: ${
      material.description || ""
    }`,
    `material family: ${
      detail?.material_family || ""
    }`,
    `specifications: ${
      material.specifications || ""
    }`,
    `category: ${
      material.category || ""
    }`,
    `dimensions: ${
      detail?.dimensions || ""
    }`,
    `material grade: ${
      detail?.material_grade || ""
    }`,
    `pressure rating: ${
      detail?.pressure_rating || ""
    }`,
    `temperature rating: ${
      detail?.temperature_rating || ""
    }`,
    `standards: ${
      detail?.standards || ""
    }`,
    `manufacturer: ${
      detail?.manufacturer || ""
    }`,
    `model: ${
      detail?.model || ""
    }`,
    `design features: ${
      detail?.design_features || ""
    }`,
    `other attributes: ${
      detail?.other_attributes || ""
    }`,
  ]
    .filter(
      (value) =>
        String(value).trim().length > 0
    )
    .join("\n");
}

function getMaterialFamily(
  material,
  detail
) {
  return normalizeText(
    detail?.material_family ||
      material?.category ||
      ""
  );
}

/* ============================================================
   PRODUCT FAMILY DETECTION
============================================================ */

function getProductFamily(
  material,
  detail
) {
  const text =
    normalizeText(
      buildMaterialText(
        material,
        detail
      )
    );

  const families = [
    {
      name: "steam_trap",
      terms: [
        "steam trap",
        "thermostatic trap",
        "thermodynamic trap",
      ],
    },

    {
      name: "gate_valve",
      terms: [
        "gate valve",
      ],
    },

    {
      name: "globe_valve",
      terms: [
        "globe valve",
      ],
    },

    {
      name: "ball_valve",
      terms: [
        "ball valve",
      ],
    },

    {
      name: "check_valve",
      terms: [
        "check valve",
        "swing check",
        "non return valve",
      ],
    },

    {
      name: "butterfly_valve",
      terms: [
        "butterfly valve",
      ],
    },

    {
      name: "pump",
      terms: [
        "pump",
      ],
    },

    {
      name: "compressor",
      terms: [
        "compressor",
      ],
    },

    {
      name: "mechanical_seal",
      terms: [
        "mechanical seal",
      ],
    },

    {
      name: "hose",
      terms: [
        "hose",
        "flexible hose",
      ],
    },

    {
      name: "filter",
      terms: [
        "filter",
      ],
    },

    {
      name: "strainer",
      terms: [
        "strainer",
      ],
    },

    {
      name: "flange",
      terms: [
        "flange",
      ],
    },

    {
      name: "gasket",
      terms: [
        "gasket",
      ],
    },

    {
      name: "bearing",
      terms: [
        "bearing",
      ],
    },

    {
      name: "motor",
      terms: [
        "motor",
      ],
    },

    {
      name: "coupling",
      terms: [
        "coupling",
      ],
    },

    {
      name: "shaft",
      terms: [
        "shaft",
        "journal shaft",
      ],
    },

    {
      name: "transformer",
      terms: [
        "transformer",
      ],
    },

    {
      name: "cable",
      terms: [
        "cable",
      ],
    },
  ];

  for (
    const family of families
  ) {
    for (
      const term of family.terms
    ) {
      if (
        text.includes(term)
      ) {
        return family.name;
      }
    }
  }

  return null;
}

/* ============================================================
   ENGINEERING RETRIEVAL SCORE
============================================================ */

function calculateEngineeringScore(
  source,
  sourceDetail,
  candidate,
  candidateDetail
) {
  const descriptionScore =
    tokenSimilarity(
      source.description,
      candidate.description
    );

  const specificationScore =
    tokenSimilarity(
      source.specifications,
      candidate.specifications
    );

  const fullTextScore =
    tokenSimilarity(
      buildMaterialText(
        source,
        sourceDetail
      ),
      buildMaterialText(
        candidate,
        candidateDetail
      )
    );

  const familyTextScore =
    tokenSimilarity(
      getMaterialFamily(
        source,
        sourceDetail
      ),
      getMaterialFamily(
        candidate,
        candidateDetail
      )
    );

  const sourceProductFamily =
    getProductFamily(
      source,
      sourceDetail
    );

  const candidateProductFamily =
    getProductFamily(
      candidate,
      candidateDetail
    );

  let productFamilyScore = 0;

  if (
    sourceProductFamily &&
    candidateProductFamily
  ) {
    productFamilyScore =
      sourceProductFamily ===
      candidateProductFamily
        ? 1
        : 0;
  }

  const gradeScore =
    tokenSimilarity(
      sourceDetail?.material_grade,
      candidateDetail?.material_grade
    );

  const dimensionScore =
    tokenSimilarity(
      sourceDetail?.dimensions,
      candidateDetail?.dimensions
    );

  const pressureScore =
    tokenSimilarity(
      sourceDetail?.pressure_rating,
      candidateDetail?.pressure_rating
    );

  const temperatureScore =
    tokenSimilarity(
      sourceDetail?.temperature_rating,
      candidateDetail?.temperature_rating
    );

  const standardScore =
    tokenSimilarity(
      sourceDetail?.standards,
      candidateDetail?.standards
    );

  let score =
    descriptionScore * 0.20 +
    specificationScore * 0.20 +
    fullTextScore * 0.10 +
    familyTextScore * 0.10 +
    productFamilyScore * 0.20 +
    gradeScore * 0.05 +
    dimensionScore * 0.05 +
    pressureScore * 0.04 +
    temperatureScore * 0.02 +
    standardScore * 0.04;

  /*
   * Strongly penalize known product-family
   * conflicts.
   */
  if (
    sourceProductFamily &&
    candidateProductFamily &&
    sourceProductFamily !==
      candidateProductFamily
  ) {
    score *= 0.20;
  }

  return {
    descriptionScore:
      Number(
        (
          descriptionScore * 100
        ).toFixed(1)
      ),

    specificationScore:
      Number(
        (
          specificationScore * 100
        ).toFixed(1)
      ),

    fullTextScore:
      Number(
        (
          fullTextScore * 100
        ).toFixed(1)
      ),

    familyScore:
      Number(
        (
          familyTextScore * 100
        ).toFixed(1)
      ),

    productFamilyScore:
      Number(
        (
          productFamilyScore * 100
        ).toFixed(1)
      ),

    gradeScore:
      Number(
        (
          gradeScore * 100
        ).toFixed(1)
      ),

    dimensionScore:
      Number(
        (
          dimensionScore * 100
        ).toFixed(1)
      ),

    pressureScore:
      Number(
        (
          pressureScore * 100
        ).toFixed(1)
      ),

    temperatureScore:
      Number(
        (
          temperatureScore * 100
        ).toFixed(1)
      ),

    standardScore:
      Number(
        (
          standardScore * 100
        ).toFixed(1)
      ),

    engineeringScore:
      Number(
        (
          score * 100
        ).toFixed(2)
      ),

    sourceProductFamily,
    candidateProductFamily,
  };
}

/* ============================================================
   LOAD ALL MATERIALS
============================================================ */

async function loadAllMaterials(
  supabase
) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const to =
      from +
      pageSize -
      1;

    const {
      data,
      error,
    } = await supabase
      .from("materials")
      .select(
        "id, company, company_id, material_number, description, specifications, category"
      )
      .order(
        "id",
        {
          ascending: true,
        }
      )
      .range(
        from,
        to
      );

    if (error) {
      throw new Error(
        `Failed to load material catalog: ${error.message}`
      );
    }

    const page =
      data || [];

    all.push(
      ...page
    );

    if (
      page.length <
      pageSize
    ) {
      break;
    }

    from +=
      pageSize;
  }

  return all;
}

/* ============================================================
   LOAD MATERIAL ATTRIBUTES
============================================================ */

async function loadMaterialAttributes(
  supabase,
  materialIds
) {
  if (
    !materialIds.length
  ) {
    return {};
  }

  const attributesByMaterialId =
    {};

  const chunkSize = 500;

  for (
    let index = 0;
    index <
    materialIds.length;
    index +=
      chunkSize
  ) {
    const chunk =
      materialIds.slice(
        index,
        index +
          chunkSize
      );

    /*
     * These are the columns confirmed
     * to exist in your material_attributes
     * table.
     */
    const {
      data,
      error,
    } = await supabase
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
      .in(
        "material_id",
        chunk
      );

    if (error) {
      throw new Error(
        `Failed to load material attributes: ${error.message}`
      );
    }

    for (
      const row of
        data || []
    ) {
      attributesByMaterialId[
        row.material_id
      ] = row;
    }
  }

  return attributesByMaterialId;
}

/* ============================================================
   GENERATE EMBEDDING
============================================================ */

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
          EMBEDDING_DIMENSIONS,
      },
    });

  const values =
    response?.embeddings?.[0]
      ?.values;

  if (
    !Array.isArray(values) ||
    values.length !==
      EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `Invalid embedding returned. Expected ${EMBEDDING_DIMENSIONS} dimensions.`
    );
  }

  return values;
}

/* ============================================================
   GET OR CREATE SOURCE EMBEDDING
============================================================ */

async function getSourceEmbedding(
  supabase,
  source,
  sourceDetail
) {
  const {
    data: existing,
    error:
      existingError,
  } = await supabase
    .from(
      "material_embeddings"
    )
    .select(
      "material_id, embedding"
    )
    .eq(
      "material_id",
      source.id
    )
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Failed to load source embedding: ${existingError.message}`
    );
  }

  if (
    existing?.embedding
  ) {
    return {
      embedding:
        existing.embedding,

      generatedNow:
        false,
    };
  }

  const engineeringText =
    buildEngineeringText(
      source,
      sourceDetail
    );

  if (
    !engineeringText.trim()
  ) {
    throw new Error(
      "Source material has no technical information available for embedding."
    );
  }

  console.log(
    `Source material ${source.id} has no embedding. Generating one now...`
  );

  const embedding =
    await generateEmbedding(
      engineeringText
    );

  const {
    error: saveError,
  } = await supabase
    .from(
      "material_embeddings"
    )
    .upsert(
      {
        material_id:
          source.id,

        embedding,

        search_text:
          engineeringText,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "material_id",
      }
    );

  if (saveError) {
    throw new Error(
      `Failed to save source embedding: ${saveError.message}`
    );
  }

  return {
    embedding,

    generatedNow:
      true,
  };
}

/* ============================================================
   VECTOR RETRIEVAL
============================================================ */

async function vectorRetrieve(
  supabase,
  embedding
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "match_material_embeddings",
    {
      query_embedding:
        embedding,

      match_count:
        VECTOR_RETRIEVAL_COUNT,
    }
  );

  if (error) {
    throw new Error(
      `Vector retrieval failed: ${error.message}`
    );
  }

  return data || [];
}

/* ============================================================
   ENRICH VECTOR CANDIDATES
============================================================ */

function enrichVectorCandidates(
  vectorResults,
  materialsById,
  attributesById
) {
  return vectorResults
    .map((row) => {
      const materialId =
        Number(
          row.material_id
        );

      const material =
        materialsById.get(
          materialId
        );

      if (!material) {
        return null;
      }

      return {
        material,

        detail:
          attributesById[
            materialId
          ] || null,

        semanticSimilarity:
          Number(
            (
              Number(
                row.similarity
              ) * 100
            ).toFixed(2)
          ),
      };
    })
    .filter(Boolean);
}

/* ============================================================
   HYBRID CANDIDATE SELECTION
============================================================ */

function selectHybridCandidates(
  source,
  sourceDetail,
  allMaterials,
  attributesById,
  vectorCandidates
) {
  const vectorById =
    new Set();

  for (
    const candidate of
      vectorCandidates
  ) {
    vectorById.add(
      candidate.material.id
    );
  }

  const combined = [];

  /* ----------------------------------------------------------
     VECTOR CANDIDATES
  ---------------------------------------------------------- */

  for (
    const candidate of
      vectorCandidates
  ) {
    if (
      candidate.material.id ===
      source.id
    ) {
      continue;
    }

    if (
      normalizeCompany(
        candidate.material.company
      ) ===
      normalizeCompany(
        source.company
      )
    ) {
      continue;
    }

    const engineering =
      calculateEngineeringScore(
        source,
        sourceDetail,
        candidate.material,
        candidate.detail
      );

    const semantic =
      candidate.semanticSimilarity /
      100;

    const engineeringScore =
      engineering.engineeringScore /
      100;

    const hybridScore =
      semantic * 0.70 +
      engineeringScore *
        0.30;

    combined.push({
      ...candidate,

      ...engineering,

      hybridScore:
        Number(
          (
            hybridScore * 100
          ).toFixed(2)
        ),

      retrievalSource:
        "VECTOR",
    });
  }

  /* ----------------------------------------------------------
     LEXICAL FALLBACK
  ---------------------------------------------------------- */

  for (
    const material of
      allMaterials
  ) {
    if (
      material.id ===
      source.id
    ) {
      continue;
    }

    if (
      normalizeCompany(
        material.company
      ) ===
      normalizeCompany(
        source.company
      )
    ) {
      continue;
    }

    if (
      vectorById.has(
        material.id
      )
    ) {
      continue;
    }

    const detail =
      attributesById[
        material.id
      ] || null;

    const engineering =
      calculateEngineeringScore(
        source,
        sourceDetail,
        material,
        detail
      );

    /*
     * Only allow meaningful fallback
     * candidates.
     */
    if (
      engineering.engineeringScore <
      8
    ) {
      continue;
    }

    combined.push({
      material,

      detail,

      semanticSimilarity:
        0,

      ...engineering,

      hybridScore:
        Number(
          (
            engineering.engineeringScore *
            0.30
          ).toFixed(2)
        ),

      retrievalSource:
        "LEXICAL_FALLBACK",
    });
  }

  combined.sort(
    (a, b) =>
      b.hybridScore -
      a.hybridScore
  );

  /* ----------------------------------------------------------
     COMPANY DIVERSITY
  ---------------------------------------------------------- */

  const companyCounts =
    new Map();

  const selected = [];

  for (
    const candidate of
      combined
  ) {
    const company =
      normalizeCompany(
        candidate.material
          .company
      );

    const current =
      companyCounts.get(
        company
      ) || 0;

    if (
      current >=
      MAX_CANDIDATES_PER_COMPANY
    ) {
      continue;
    }

    companyCounts.set(
      company,
      current + 1
    );

    selected.push(
      candidate
    );

    if (
      selected.length >=
      FINAL_CANDIDATE_COUNT
    ) {
      break;
    }
  }

  return selected;
}

/* ============================================================
   AI ENGINEERING COMPARISON
============================================================ */

async function askAIToCompare(
  source,
  sourceDetail,
  candidates
) {
  const sourcePayload = {
    company:
      source.company,

    material_number:
      source.material_number,

    description:
      source.description,

    specifications:
      source.specifications,

    category:
      source.category,

    technical_attributes:
      safeObject(
        sourceDetail
      ),
  };

  const candidatePayload =
    candidates.map(
      (
        candidate,
        index
      ) => ({
        candidate_number:
          index + 1,

        company:
          candidate.material
            .company,

        material_id:
          candidate.material
            .id,

        material_number:
          candidate.material
            .material_number,

        description:
          candidate.material
            .description,

        specifications:
          candidate.material
            .specifications,

        category:
          candidate.material
            .category,

        technical_attributes:
          safeObject(
            candidate.detail
          ),

        semantic_similarity:
          candidate.semanticSimilarity,

        engineering_score:
          candidate.engineeringScore,

        hybrid_score:
          candidate.hybridScore,

        retrieval_source:
          candidate.retrievalSource,

        product_family:
          candidate.candidateProductFamily,
      })
    );

  const prompt = `
You are the engineering comparison engine
for a Government of India National Unified
Material Master system.

Determine whether EVERY supplied candidate
from another CPSE represents the same,
duplicate, near-duplicate, or functionally
equivalent engineering material as the source.

The retrieval layer has already ranked these
candidates using semantic embeddings and
engineering signals. You are the final technical
verification layer.

==================================================
CLASSIFICATIONS
==================================================

IDENTICAL
Same engineering item and relevant technical
properties agree.

DUPLICATE
Same physical/engineering item represented
with different CPSE material codes or descriptions.

NEAR_DUPLICATE
Very similar material with minor differences
requiring engineering review.

FUNCTIONALLY_EQUIVALENT
Different naming/coding but sufficient technical
evidence supports the same functional use.

NO_MATCH
Insufficient evidence or important technical
incompatibility.

==================================================
ENGINEERING RULES
==================================================

1. Never compare the same CPSE.

2. Product name similarity alone is insufficient.

3. Different CPSE codes do not prove different
   engineering identity.

4. Never invent specifications.

5. Missing technical data is NOT proof of
   equivalence.

6. A major product-family conflict should normally
   result in NO_MATCH.

7. Different manufacturers can still be equivalent
   when engineering evidence supports it.

8. Prioritize:
   - product type
   - material family
   - dimensions
   - nominal size
   - material grade
   - pressure rating
   - temperature rating
   - standards
   - end connections when available
   - application when available
   - manufacturer
   - model
   - design features

9. A steam trap should not be considered equivalent
   to a hose, pump, check valve, mechanical seal,
   shaft, or unrelated item just because the word
   "steam" occurs in both records.

10. Government approval is required before an NCS
    becomes official.

11. Do not generate an NCS code.

12. Return an assessment for EVERY candidate.

13. Confidence must reflect only the evidence
    provided in the records.

==================================================
SOURCE
==================================================

${JSON.stringify(
  sourcePayload,
  null,
  2
)}

==================================================
CANDIDATES
==================================================

${JSON.stringify(
  candidatePayload,
  null,
  2
)}
`;

  const result =
    await generateWithRetry(
      prompt,
      {
        responseMimeType:
          "application/json",

        responseSchema: {
          type: "object",

          properties: {
            matches: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  candidate_number: {
                    type: "integer",
                  },

                  is_equivalent: {
                    type: "boolean",
                  },

                  classification: {
                    type: "string",
                  },

                  confidence: {
                    type: "number",
                  },

                  matched_aspects: {
                    type: "array",

                    items: {
                      type: "string",
                    },
                  },

                  differences: {
                    type: "array",

                    items: {
                      type: "string",
                    },
                  },

                  critical_conflicts: {
                    type: "array",

                    items: {
                      type: "string",
                    },
                  },

                  reason: {
                    type: "string",
                  },

                  common_material_name: {
                    type: "string",
                  },
                },

                required: [
                  "candidate_number",
                  "is_equivalent",
                  "classification",
                  "confidence",
                  "matched_aspects",
                  "differences",
                  "critical_conflicts",
                  "reason",
                  "common_material_name",
                ],
              },
            },
          },

          required: [
            "matches",
          ],
        },
      }
    );

  const response =
    result.response;

  const responseText =
    response.text;

  if (!responseText) {
    throw new Error(
      `Gemini returned an empty response using ${result.model}.`
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      `Gemini returned invalid JSON using ${result.model}.`
    );
  }

  if (
    !Array.isArray(
      parsed.matches
    )
  ) {
    parsed.matches = [];
  }

  parsed.model =
    result.model;

  return parsed;
}

/* ============================================================
   EXISTING NCS
============================================================ */

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
        ascending:
          false,
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

/* ============================================================
   NCS CODE
============================================================ */

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

  return `NCS-${
    normalized ||
    "MATERIAL"
  }-${suffix}`;
}

/* ============================================================
   CREATE / REUSE NCS
============================================================ */

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
      .from(
        "ncs_materials"
      )
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

  while (
    attempt < 5
  ) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "ncs_materials"
      )
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
          sourceMaterial.specifications ||
          null,

        status:
          "PROPOSED",
      })
      .select(
        "ncs_id, ncs_code, ncs_name, status"
      )
      .single();

    if (
      !error &&
      data
    ) {
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

/* ============================================================
   SAVE MAPPINGS
============================================================ */

async function saveMappings(
  supabase,
  ncs,
  sourceMaterial,
  strongestMatch,
  acceptedMatches
) {
  const rows = [];

  rows.push({
    material_id:
      sourceMaterial.id,

    ncs_id:
      ncs.ncs_id,

    ai_confidence:
      strongestMatch?.ai?.confidence ??
      0,

    ai_reason:
      strongestMatch?.ai?.reason ||
      "AI proposed a common national material identity.",

    match_status:
      "AI_PROPOSED",

    verified:
      false,
  });

  for (
    const match of
      acceptedMatches
  ) {
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

/* ============================================================
   GOVERNMENT REVIEW REQUEST
============================================================ */

async function ensureGovernmentReviewRequest(
  supabase,
  ncs
) {
  const {
    data: existingRequest,
    error:
      requestLookupError,
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

  if (
    requestLookupError
  ) {
    throw new Error(
      `Failed to check standardization request: ${requestLookupError.message}`
    );
  }

  if (
    existingRequest
  ) {
    return existingRequest;
  }

  const {
    data,
    error,
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
    })
    .select(
      "request_id"
    )
    .single();

  if (error) {
    throw new Error(
      `Failed to create government review request: ${error.message}`
    );
  }

  return data;
}

/* ============================================================
   MAIN POST
============================================================ */

export async function POST(
  request
) {
  try {
    /* --------------------------------------------------------
       ENVIRONMENT
    -------------------------------------------------------- */

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
        {
          status: 500,
        }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        {
          status: 500,
        }
      );
    }

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

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /* --------------------------------------------------------
       BODY
    -------------------------------------------------------- */

    const body =
      await request.json();

    const materialId =
      Number(
        body.materialId
      );

    if (
      !Number.isInteger(
        materialId
      ) ||
      materialId <= 0
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

    /* --------------------------------------------------------
       SOURCE
    -------------------------------------------------------- */

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

    if (
      sourceError ||
      !source
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Source material not found.",
          details:
            sourceError?.message ||
            null,
        },
        {
          status: 404,
        }
      );
    }

    /* --------------------------------------------------------
       LOAD MATERIALS
    -------------------------------------------------------- */

    const allMaterials =
      await loadAllMaterials(
        supabase
      );

    if (
      !allMaterials.length
    ) {
      return NextResponse.json({
        success: true,

        matched: false,

        message:
          "No materials exist in the catalog.",

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

    /* --------------------------------------------------------
       LOAD ATTRIBUTES
    -------------------------------------------------------- */

    const materialIds =
      allMaterials.map(
        (material) =>
          material.id
      );

    const attributesByMaterialId =
      await loadMaterialAttributes(
        supabase,
        materialIds
      );

    const sourceDetail =
      attributesByMaterialId[
        source.id
      ] || null;

    /* --------------------------------------------------------
       SOURCE EMBEDDING
    -------------------------------------------------------- */

    const {
      embedding:
        sourceEmbedding,
      generatedNow:
        embeddingGeneratedNow,
    } =
      await getSourceEmbedding(
        supabase,
        source,
        sourceDetail
      );

    /* --------------------------------------------------------
       VECTOR RETRIEVAL
    -------------------------------------------------------- */

    const vectorResults =
      await vectorRetrieve(
        supabase,
        sourceEmbedding
      );

    console.log(
      `Vector retrieval returned ${vectorResults.length} candidate(s) for material ${source.id}.`
    );

    /* --------------------------------------------------------
       MATERIAL MAP
    -------------------------------------------------------- */

    const materialsById =
      new Map(
        allMaterials.map(
          (material) => [
            Number(
              material.id
            ),
            material,
          ]
        )
      );

    /* --------------------------------------------------------
       ENRICH VECTOR CANDIDATES
    -------------------------------------------------------- */

    const vectorCandidates =
      enrichVectorCandidates(
        vectorResults,
        materialsById,
        attributesByMaterialId
      );

    /* --------------------------------------------------------
       HYBRID RANKING
    -------------------------------------------------------- */

    const preliminaryCandidates =
      selectHybridCandidates(
        source,
        sourceDetail,
        allMaterials,
        attributesByMaterialId,
        vectorCandidates
      );

    if (
      preliminaryCandidates.length ===
      0
    ) {
      return NextResponse.json({
        success: true,

        matched: false,

        message:
          "No relevant cross-company material candidates were found by the ML retrieval layer.",

        data: {
          source_material_id:
            source.id,

          source_company:
            source.company,

          source_material_code:
            source.material_number,

          source_description:
            source.description,

          embedding_model:
            EMBEDDING_MODEL,

          embedding_generated_now:
            embeddingGeneratedNow,

          vector_candidates_found:
            vectorCandidates.length,

          candidates_considered:
            0,

          matches: [],
        },
      });
    }

    /* --------------------------------------------------------
       GEMINI
    -------------------------------------------------------- */

    const aiResult =
      await askAIToCompare(
        source,
        sourceDetail,
        preliminaryCandidates
      );

    /* --------------------------------------------------------
       VALIDATE AI RESULTS
    -------------------------------------------------------- */

    const acceptedMatches =
      [];

    for (
      const aiMatch of
        safeArray(
          aiResult.matches
        )
    ) {
      const candidateIndex =
        Number(
          aiMatch.candidate_number
        ) - 1;

      const candidate =
        preliminaryCandidates[
          candidateIndex
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
        Math.max(
          0,
          Math.min(
            100,
            numberOrZero(
              aiMatch.confidence
            )
          )
        );

      const classification =
        String(
          aiMatch.classification ||
            ""
        )
          .trim()
          .toUpperCase();

      const criticalConflicts =
        safeArray(
          aiMatch.critical_conflicts
        );

      if (
        criticalConflicts.length >
        0
      ) {
        continue;
      }

      if (
        confidence <
        75
      ) {
        continue;
      }

      const acceptedClassifications =
        new Set([
          "IDENTICAL",
          "DUPLICATE",
          "NEAR_DUPLICATE",
          "FUNCTIONALLY_EQUIVALENT",
        ]);

      if (
        !acceptedClassifications.has(
          classification
        )
      ) {
        continue;
      }

      const combinedConfidence =
        Number(
          (
            confidence * 0.80 +
            candidate.hybridScore *
              0.20
          ).toFixed(1)
        );

      acceptedMatches.push({
        candidate,

        ai: {
          confidence:
            Math.max(
              0,
              Math.min(
                100,
                combinedConfidence
              )
            ),

          rawAiConfidence:
            confidence,

          classification,

          matched_aspects:
            safeArray(
              aiMatch.matched_aspects
            ),

          differences:
            safeArray(
              aiMatch.differences
            ),

          critical_conflicts:
            criticalConflicts,

          reason:
            aiMatch.reason ||
            "AI identified technical evidence supporting cross-company equivalence.",

          common_material_name:
            aiMatch.common_material_name ||
            null,
        },
      });
    }

    acceptedMatches.sort(
      (a, b) =>
        b.ai.confidence -
        a.ai.confidence
    );

    /* --------------------------------------------------------
       NO MATCH
    -------------------------------------------------------- */

    if (
      acceptedMatches.length ===
      0
    ) {
      const evaluatedCandidates =
        safeArray(
          aiResult.matches
        )
          .map(
            (
              aiMatch
            ) => {
              const candidateIndex =
                Number(
                  aiMatch.candidate_number
                ) - 1;

              const candidate =
                preliminaryCandidates[
                  candidateIndex
                ];

              if (!candidate) {
                return null;
              }

              return {
                candidate_number:
                  Number(
                    aiMatch.candidate_number
                  ),

                material_id:
                  candidate.material
                    .id,

                company:
                  candidate.material
                    .company,

                material_number:
                  candidate.material
                    .material_number,

                description:
                  candidate.material
                    .description,

                specifications:
                  candidate.material
                    .specifications,

                category:
                  candidate.material
                    .category,

                semantic_similarity:
                  candidate.semanticSimilarity,

                engineering_score:
                  candidate.engineeringScore,

                hybrid_score:
                  candidate.hybridScore,

                retrieval_source:
                  candidate.retrievalSource,

                product_family:
                  candidate.candidateProductFamily,

                ai_confidence:
                  numberOrZero(
                    aiMatch.confidence
                  ),

                is_equivalent:
                  aiMatch.is_equivalent ===
                  true,

                classification:
                  String(
                    aiMatch.classification ||
                      ""
                  )
                    .trim()
                    .toUpperCase(),

                matched_aspects:
                  safeArray(
                    aiMatch.matched_aspects
                  ),

                differences:
                  safeArray(
                    aiMatch.differences
                  ),

                critical_conflicts:
                  safeArray(
                    aiMatch.critical_conflicts
                  ),

                reason:
                  aiMatch.reason ||
                  "No reason returned by AI.",

                common_material_name:
                  aiMatch.common_material_name ||
                  null,
              };
            }
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              b.ai_confidence -
              a.ai_confidence
          );

      return NextResponse.json({
        success:
          true,

        matched:
          false,

        message:
          `Gemini (${
            aiResult.model ||
            "configured model"
          }) evaluated ${
            preliminaryCandidates.length
          } ML-retrieved candidate(s) but did not identify a sufficiently strong technical equivalent.`,

        data: {
          source_material_id:
            source.id,

          source_company:
            source.company,

          source_material_code:
            source.material_number,

          source_description:
            source.description,

          embedding_model:
            EMBEDDING_MODEL,

          embedding_generated_now:
            embeddingGeneratedNow,

          retrieval_method:
            "ML_VECTOR_PLUS_ENGINEERING_HYBRID",

          vector_candidates_found:
            vectorCandidates.length,

          candidates_considered:
            preliminaryCandidates.length,

          ai_model_used:
            aiResult.model ||
            null,

          evaluated_candidates:
            evaluatedCandidates,

          matches: [],
        },
      });
    }

    /* --------------------------------------------------------
       COMMON NAME
    -------------------------------------------------------- */

    const commonNames =
      acceptedMatches
        .map(
          (match) =>
            match.ai
              .common_material_name
        )
        .filter(
          (name) =>
            typeof name ===
              "string" &&
            name.trim()
        );

    const commonMaterialName =
      commonNames[0] ||
      sourceDetail?.material_family ||
      source.category ||
      source.description ||
      "Standard Material";

    /* --------------------------------------------------------
       MATCHED IDS
    -------------------------------------------------------- */

    const matchedIds = [
      source.id,

      ...acceptedMatches.map(
        (match) =>
          match.candidate
            .material.id
      ),
    ];

    /* --------------------------------------------------------
       NCS
    -------------------------------------------------------- */

    const ncs =
      await getOrCreateNCS(
        supabase,
        matchedIds,
        commonMaterialName,
        source
      );

    /* --------------------------------------------------------
       SAVE MAPPINGS
    -------------------------------------------------------- */

    const savedMappings =
      await saveMappings(
        supabase,
        ncs,
        source,
        acceptedMatches[0],
        acceptedMatches
      );

    /* --------------------------------------------------------
       GOVERNMENT REVIEW
    -------------------------------------------------------- */

    const governmentReview =
      await ensureGovernmentReviewRequest(
        supabase,
        ncs
      );

    /* --------------------------------------------------------
       SUCCESS
    -------------------------------------------------------- */

    return NextResponse.json({
      success:
        true,

      matched:
        true,

      message:
        "ML-retrieved cross-company material equivalence identified and submitted for government review.",

      data: {
        source_material_id:
          source.id,

        source_company:
          source.company,

        source_material_code:
          source.material_number,

        source_description:
          source.description,

        embedding_model:
          EMBEDDING_MODEL,

        embedding_generated_now:
          embeddingGeneratedNow,

        retrieval_method:
          "ML_VECTOR_PLUS_ENGINEERING_HYBRID",

        vector_candidates_found:
          vectorCandidates.length,

        candidates_considered:
          preliminaryCandidates.length,

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

        government_request_id:
          governmentReview?.request_id ||
          null,

        ai_model_used:
          aiResult.model ||
          null,

        matches:
          acceptedMatches.map(
            (match) => ({
              material_id:
                match.candidate
                  .material.id,

              company:
                match.candidate
                  .material
                  .company,

              material_number:
                match.candidate
                  .material
                  .material_number,

              description:
                match.candidate
                  .material
                  .description,

              specifications:
                match.candidate
                  .material
                  .specifications,

              category:
                match.candidate
                  .material
                  .category,

              semantic_similarity:
                match.candidate
                  .semanticSimilarity,

              engineering_score:
                match.candidate
                  .engineeringScore,

              hybrid_score:
                match.candidate
                  .hybridScore,

              retrieval_source:
                match.candidate
                  .retrievalSource,

              product_family:
                match.candidate
                  .candidateProductFamily,

              confidence:
                match.ai
                  .confidence,

              raw_ai_confidence:
                match.ai
                  .rawAiConfidence,

              classification:
                match.ai
                  .classification,

              matched_aspects:
                match.ai
                  .matched_aspects,

              differences:
                match.ai
                  .differences,

              critical_conflicts:
                match.ai
                  .critical_conflicts,

              reason:
                match.ai
                  .reason,
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
        success:
          false,

        error:
          "Failed to compare and standardize material.",

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