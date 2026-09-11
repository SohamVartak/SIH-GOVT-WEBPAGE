import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   SUPABASE
========================================================= */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing Supabase environment variables."
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* =========================================================
   CONFIGURATION
========================================================= */

const MIN_DISPLAY_SIMILARITY = 60;

const MIN_BMG_MATCH_CONFIDENCE = 60;

const MAX_MATERIALS = 10000;

const MAX_ATTRIBUTES = 30000;

const MAX_RESULTS = 30;

const EMBEDDING_MODEL =
  "gemini-embedding-2";

/* =========================================================
   COMPANY CODE PREFIXES
========================================================= */

const COMPANY_CODE_PREFIXES = [
  "BPCL-",
  "HPCL-",
  "IOCL-",
  "BHEL-",
  "ONGC-",
  "HOCL-",
];

/* =========================================================
   BASIC HELPERS
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 2
    );
}

function unique(array) {
  return [
    ...new Set(array),
  ];
}

function isCompanyMaterialCode(
  value
) {
  const normalized =
    cleanText(value).toUpperCase();

  if (!normalized) {
    return false;
  }

  return COMPANY_CODE_PREFIXES.some(
    (prefix) =>
      normalized.startsWith(prefix)
  );
}

/* =========================================================
   NUMERIC HELPERS
========================================================= */

function clamp(
  value,
  min = 0,
  max = 100
) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

/* =========================================================
   MATERIAL TEXT
========================================================= */

function buildMaterialText(
  material,
  attributes = []
) {
  const parts = [];

  /*
   * IMPORTANT:
   *
   * Material number is intentionally NOT used as
   * the technical identity.
   */

  if (material.description) {
    parts.push(
      `description: ${cleanText(
        material.description
      )}`
    );
  }

  if (material.specifications) {
    parts.push(
      `specifications: ${cleanText(
        material.specifications
      )}`
    );
  }

  if (material.category) {
    parts.push(
      `category: ${cleanText(
        material.category
      )}`
    );
  }

  if (material.material_family) {
    parts.push(
      `material family: ${cleanText(
        material.material_family
      )}`
    );
  }

  if (material.dimensions) {
    parts.push(
      `dimensions: ${cleanText(
        material.dimensions
      )}`
    );
  }

  if (material.grade) {
    parts.push(
      `grade: ${cleanText(
        material.grade
      )}`
    );
  }

  if (material.pressure_class) {
    parts.push(
      `pressure class: ${cleanText(
        material.pressure_class
      )}`
    );
  }

  if (material.temperature_range) {
    parts.push(
      `temperature: ${cleanText(
        material.temperature_range
      )}`
    );
  }

  if (material.standards) {
    parts.push(
      `standards: ${cleanText(
        material.standards
      )}`
    );
  }

  if (material.design_features) {
    parts.push(
      `design features: ${cleanText(
        material.design_features
      )}`
    );
  }

  /*
   * Material attributes from Supabase.
   */

  for (const attribute of attributes) {
    if (!attribute) {
      continue;
    }

    const name =
      cleanText(
        attribute.attribute_name ||
          attribute.name ||
          attribute.key
      );

    const value =
      cleanText(
        attribute.attribute_value ||
          attribute.value ||
          attribute.attribute_text
      );

    if (name && value) {
      parts.push(
        `${name}: ${value}`
      );
    } else if (value) {
      parts.push(value);
    }
  }

  return parts.join(" | ");
}

/* =========================================================
   TECHNICAL FIELD EXTRACTION
========================================================= */

function getTechnicalFields(
  material
) {
  return {
    description: normalizeText(
      material.description
    ),

    specifications: normalizeText(
      material.specifications
    ),

    category: normalizeText(
      material.category
    ),

    family: normalizeText(
      material.material_family
    ),

    dimensions: normalizeText(
      material.dimensions
    ),

    grade: normalizeText(
      material.grade
    ),

    pressure: normalizeText(
      material.pressure_class
    ),

    temperature: normalizeText(
      material.temperature_range
    ),

    standards: normalizeText(
      material.standards
    ),

    design: normalizeText(
      material.design_features
    ),
  };
}

/* =========================================================
   WORD OVERLAP
========================================================= */

function calculateTokenOverlap(
  query,
  candidate
) {
  const queryTokens =
    unique(tokenize(query));

  const candidateTokens =
    new Set(
      tokenize(candidate)
    );

  if (
    queryTokens.length === 0
  ) {
    return 0;
  }

  let matched = 0;

  for (const token of queryTokens) {
    if (
      candidateTokens.has(token)
    ) {
      matched++;
      continue;
    }

    /*
     * Partial technical-word matching.
     *
     * bearing ↔ bearings
     * valve ↔ valves
     * gasket ↔ gaskets
     */

    for (const candidateToken of candidateTokens) {
      if (
        candidateToken.startsWith(
          token
        ) ||
        token.startsWith(
          candidateToken
        )
      ) {
        if (
          Math.min(
            token.length,
            candidateToken.length
          ) >= 4
        ) {
          matched++;
          break;
        }
      }
    }
  }

  return clamp(
    (matched /
      queryTokens.length) *
      100
  );
}

/* =========================================================
   EXACT PHRASE MATCH
========================================================= */

function phraseMatchScore(
  query,
  candidate
) {
  const q =
    normalizeText(query);

  const c =
    normalizeText(candidate);

  if (!q || !c) {
    return 0;
  }

  if (c === q) {
    return 100;
  }

  if (c.includes(q)) {
    return 95;
  }

  return 0;
}

/* =========================================================
   TECHNICAL MATCH SCORE
========================================================= */

function calculateFeatureScore(
  queryMaterial,
  candidateMaterial,
  queryText
) {
  const queryFields =
    getTechnicalFields(
      queryMaterial
    );

  const candidateFields =
    getTechnicalFields(
      candidateMaterial
    );

  /*
   * Build candidate technical text.
   */

  const candidateText =
    buildMaterialText(
      candidateMaterial
    );

  /*
   * Generic text matching.
   */

  const generalOverlap =
    calculateTokenOverlap(
      queryText,
      candidateText
    );

  const descriptionOverlap =
    calculateTokenOverlap(
      queryFields.description,
      candidateFields.description
    );

  const specificationOverlap =
    calculateTokenOverlap(
      queryFields.specifications,
      candidateFields.specifications
    );

  const categoryOverlap =
    calculateTokenOverlap(
      queryFields.category,
      candidateFields.category
    );

  const familyOverlap =
    calculateTokenOverlap(
      queryFields.family,
      candidateFields.family
    );

  const dimensionsOverlap =
    calculateTokenOverlap(
      queryFields.dimensions,
      candidateFields.dimensions
    );

  const gradeOverlap =
    calculateTokenOverlap(
      queryFields.grade,
      candidateFields.grade
    );

  const pressureOverlap =
    calculateTokenOverlap(
      queryFields.pressure,
      candidateFields.pressure
    );

  const temperatureOverlap =
    calculateTokenOverlap(
      queryFields.temperature,
      candidateFields.temperature
    );

  const standardsOverlap =
    calculateTokenOverlap(
      queryFields.standards,
      candidateFields.standards
    );

  /*
   * Exact phrase matches are particularly important for
   * direct searches like "bearing".
   */

  const exactDescription =
    phraseMatchScore(
      queryText,
      candidateFields.description
    );

  const exactSpecifications =
    phraseMatchScore(
      queryText,
      candidateFields.specifications
    );

  /*
   * Weighted technical score.
   */

  let score = 0;

  score +=
    generalOverlap * 0.20;

  score +=
    descriptionOverlap * 0.25;

  score +=
    specificationOverlap * 0.25;

  score +=
    categoryOverlap * 0.10;

  score +=
    familyOverlap * 0.08;

  score +=
    dimensionsOverlap * 0.04;

  score +=
    gradeOverlap * 0.03;

  score +=
    pressureOverlap * 0.02;

  score +=
    temperatureOverlap * 0.01;

  score +=
    standardsOverlap * 0.02;

  /*
   * Exact description/specification phrase bonus.
   */

  if (exactDescription > 0) {
    score =
      Math.max(
        score,
        exactDescription
      );
  }

  if (exactSpecifications > 0) {
    score =
      Math.max(
        score,
        exactSpecifications
      );
  }

  /*
   * If the query contains a specific technical word
   * and that word occurs in the candidate description,
   * make sure the candidate isn't unfairly suppressed.
   */

  const queryTokens =
    tokenize(queryText);

  const candidateDescription =
    candidateFields.description;

  let technicalWordHits = 0;

  for (const token of queryTokens) {
    if (
      candidateDescription.includes(
        token
      )
    ) {
      technicalWordHits++;
    }
  }

  if (
    queryTokens.length > 0 &&
    technicalWordHits > 0
  ) {
    const directWordScore =
      (technicalWordHits /
        queryTokens.length) *
      100;

    score =
      Math.max(
        score,
        directWordScore
      );
  }

  /*
   * Category/family consistency bonus.
   */

  if (
    queryFields.category &&
    candidateFields.category
  ) {
    const categorySimilarity =
      calculateTokenOverlap(
        queryFields.category,
        candidateFields.category
      );

    if (
      categorySimilarity >= 50
    ) {
      score += 5;
    }
  }

  if (
    queryFields.family &&
    candidateFields.family
  ) {
    const familySimilarity =
      calculateTokenOverlap(
        queryFields.family,
        candidateFields.family
      );

    if (
      familySimilarity >= 50
    ) {
      score += 5;
    }
  }

  /*
   * Prevent score from exceeding 100.
   */

  return clamp(
    score
  );
}

/* =========================================================
   QUERY MATERIAL
========================================================= */

function buildQueryMaterial({
  description,
  specifications,
  category,
}) {
  return {
    description:
      cleanText(description),

    specifications:
      cleanText(specifications),

    category:
      cleanText(category),

    material_family: "",
    dimensions: "",
    grade: "",
    pressure_class: "",
    temperature_range: "",
    standards: "",
    design_features: "",
  };
}

/* =========================================================
   TEXT QUERY DETECTION
========================================================= */

function isTextSearchRequest(
  body
) {
  return Boolean(
    cleanText(body.description) ||
      cleanText(
        body.specifications
      ) ||
      cleanText(body.category)
  );
}

/* =========================================================
   GEMINI EMBEDDING
========================================================= */

async function generateEmbedding(
  text
) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            model:
              `models/${EMBEDDING_MODEL}`,

            content: {
              parts: [
                {
                  text,
                },
              ],
            },

            outputDimensionality: 768,
          }),
        }
      );

    if (!response.ok) {
      console.warn(
        "Gemini embedding unavailable:",
        response.status
      );

      return null;
    }

    const data =
      await response.json();

    const values =
      data?.embedding?.values;

    if (
      !Array.isArray(values) ||
      values.length === 0
    ) {
      return null;
    }

    return values;
  } catch (error) {
    console.warn(
      "Gemini embedding failed. Continuing with deterministic matching.",
      error
    );

    return null;
  }
}

/* =========================================================
   COSINE SIMILARITY
========================================================= */

function cosineSimilarity(
  a,
  b
) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    dot +=
      a[i] * b[i];

    normA +=
      a[i] * a[i];

    normB +=
      b[i] * b[i];
  }

  if (
    normA === 0 ||
    normB === 0
  ) {
    return 0;
  }

  return (
    dot /
    (Math.sqrt(normA) *
      Math.sqrt(normB))
  );
}

/* =========================================================
   BMG CODE
========================================================= */

function hashString(
  value
) {
  let hash = 2166136261;

  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    hash ^=
      value.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return (
    hash >>> 0
  )
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
}

function determineFamily(
  material
) {
  const text =
    normalizeText(
      [
        material.description,
        material.specifications,
        material.category,
        material.material_family,
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (
    /\bbearing\b|\bbearings\b/.test(
      text
    )
  ) {
    return "BEARING";
  }

  if (
    /\bvalve\b|\bvalves\b/.test(
      text
    )
  ) {
    return "VALVE";
  }

  if (
    /\bpump\b|\bpumps\b/.test(
      text
    )
  ) {
    return "PUMP";
  }

  if (
    /\bgasket\b|\bgaskets\b/.test(
      text
    )
  ) {
    return "GASKET";
  }

  if (
    /\bo-ring\b|\bo ring\b|\boring\b/.test(
      text
    )
  ) {
    return "O-RING";
  }

  if (
    /\bbolt\b|\bnut\b|\bfastener\b/.test(
      text
    )
  ) {
    return "FASTENER";
  }

  if (
    /\bfilter\b|\bstrainer\b/.test(
      text
    )
  ) {
    return "FILTER";
  }

  if (
    /\bmotor\b/.test(
      text
    )
  ) {
    return "MOTOR";
  }

  if (
    /\bpipe\b|\btube\b|\bpiping\b/.test(
      text
    )
  ) {
    return "PIPING";
  }

  if (
    /\bseal\b|\bsealing\b/.test(
      text
    )
  ) {
    return "SEAL";
  }

  return "MATERIAL";
}

function generateBmgCode(
  material
) {
  const family =
    determineFamily(
      material
    );

  /*
   * IMPORTANT:
   *
   * Company
   * company material number
   * manufacturer
   * model
   *
   * are deliberately excluded.
   */

  const fingerprint =
    [
      family,

      normalizeText(
        material.description
      ),

      normalizeText(
        material.specifications
      ),

      normalizeText(
        material.category
      ),

      normalizeText(
        material.material_family
      ),

      normalizeText(
        material.dimensions
      ),

      normalizeText(
        material.grade
      ),

      normalizeText(
        material.pressure_class
      ),

      normalizeText(
        material.temperature_range
      ),

      normalizeText(
        material.standards
      ),

      normalizeText(
        material.design_features
      ),
    ]
      .filter(Boolean)
      .join("|");

  return `BMG-${family}-${hashString(
    fingerprint
  )}`;
}

/* =========================================================
   FETCH MATERIALS
========================================================= */

async function fetchMaterials() {
  const {
    data,
    error,
  } =
    await supabase
      .from("materials")
      .select("*")
      .limit(
        MAX_MATERIALS
      );

  if (error) {
    throw new Error(
      `Unable to load materials: ${error.message}`
    );
  }

  return data || [];
}

/* =========================================================
   FETCH ATTRIBUTES
========================================================= */

async function fetchAttributes(
  materialIds
) {
  if (
    !Array.isArray(
      materialIds
    ) ||
    materialIds.length === 0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "material_attributes"
      )
      .select("*")
      .in(
        "material_id",
        materialIds
      )
      .limit(
        MAX_ATTRIBUTES
      );

  if (error) {
    /*
     * Attribute table failure should NOT destroy
     * the main search.
     */

    console.warn(
      "material_attributes could not be loaded:",
      error.message
    );

    return [];
  }

  return data || [];
}

/* =========================================================
   ATTRIBUTE MAP
========================================================= */

function createAttributeMap(
  attributes
) {
  const map =
    new Map();

  for (const attribute of attributes) {
    const materialId =
      attribute.material_id;

    if (
      materialId === null ||
      materialId === undefined
    ) {
      continue;
    }

    if (
      !map.has(materialId)
    ) {
      map.set(
        materialId,
        []
      );
    }

    map
      .get(materialId)
      .push(attribute);
  }

  return map;
}

/* =========================================================
   SEARCH MATERIALS BY TEXT
========================================================= */

function searchCatalogByText({
  materials,
  attributeMap,
  queryText,
  queryMaterial,
  matchThreshold,
  matchCount,
}) {
  const scored = [];

  const queryTokens =
    unique(
      tokenize(queryText)
    );

  for (const material of materials) {
    if (!material) {
      continue;
    }

    const attributes =
      attributeMap.get(
        material.id
      ) || [];

    const technicalText =
      buildMaterialText(
        material,
        attributes
      );

    if (!technicalText) {
      continue;
    }

    /*
     * Fast keyword gate.
     *
     * This is critical for searches like "bearing".
     */

    const normalizedCatalogText =
      normalizeText(
        technicalText
      );

    let directHits = 0;

    for (const token of queryTokens) {
      if (
        normalizedCatalogText.includes(
          token
        )
      ) {
        directHits++;
      }
    }

    /*
     * If query is a direct word/phrase and it exists
     * anywhere in the material/datasheet information,
     * allow it into scoring.
     */

    const containsQuery =
      queryTokens.length > 0 &&
      directHits > 0;

    const featureScore =
      calculateFeatureScore(
        queryMaterial,
        {
          ...material,

          /*
           * Attributes become part of technical fields
           * through specifications.
           */

          specifications: [
            material.specifications,
            ...attributes.map(
              (attribute) =>
                cleanText(
                  attribute.attribute_name ||
                    attribute.name ||
                    attribute.key
                ) +
                " " +
                cleanText(
                  attribute.attribute_value ||
                    attribute.value ||
                    attribute.attribute_text
                )
            ),
          ]
            .filter(Boolean)
            .join(" "),
        },
        queryText
      );

    /*
     * Direct keyword boost.
     *
     * This makes a search for "bearing" actually find
     * datasheets/materials containing bearing.
     */

    let finalScore =
      featureScore;

    if (containsQuery) {
      const directScore =
        clamp(
          (directHits /
            queryTokens.length) *
            100
        );

      finalScore =
        Math.max(
          finalScore,
          directScore
        );

      /*
       * Small bonus for exact word presence.
       */

      finalScore += 5;
    }

    finalScore =
      clamp(finalScore);

    /*
     * Don't return irrelevant records.
     *
     * But if the actual search term exists in the
     * technical text, allow it through even when the
     * weighted technical score is slightly lower.
     */

    if (
      finalScore <
        matchThreshold &&
      !containsQuery
    ) {
      continue;
    }

    if (
      containsQuery &&
      finalScore < 60
    ) {
      finalScore = 60;
    }

    scored.push({
      material,

      attributes,

      score: finalScore,

      containsQuery,
    });
  }

  scored.sort(
    (a, b) => {
      /*
       * Direct technical keyword hits first,
       * then score.
       */

      if (
        a.containsQuery !==
        b.containsQuery
      ) {
        return a.containsQuery
          ? -1
          : 1;
      }

      return (
        b.score -
        a.score
      );
    }
  );

  return scored.slice(
    0,
    matchCount
  );
}

/* =========================================================
   FIND EXISTING BMG MAPPING
========================================================= */

async function findExistingBmgMapping(
  materialId
) {
  try {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "material_ncs_mapping"
        )
        .select(
          "material_id, ncs_id, ai_confidence, match_status, verified"
        )
        .eq(
          "material_id",
          materialId
        )
        .limit(1);

    if (
      error ||
      !data ||
      data.length === 0
    ) {
      return null;
    }

    const mapping =
      data[0];

    const {
      data: ncsData,
      error: ncsError,
    } =
      await supabase
        .from(
          "ncs_materials"
        )
        .select(
          "id, ncs_id, ncs_code, ncs_name, status"
        )
        .eq(
          "id",
          mapping.ncs_id
        )
        .limit(1);

    if (
      ncsError ||
      !ncsData ||
      ncsData.length === 0
    ) {
      return null;
    }

    return {
      mapping,

      ncs:
        ncsData[0],
    };
  } catch {
    return null;
  }
}

/* =========================================================
   FIND EXISTING BMG CODE
========================================================= */

async function findExistingBmgCode(
  materialId
) {
  const mapping =
    await findExistingBmgMapping(
      materialId
    );

  if (!mapping) {
    return null;
  }

  return (
    mapping.ncs?.ncs_code ||
    mapping.ncs?.ncs_id ||
    null
  );
}

/* =========================================================
   RESULT FORMATTER
========================================================= */

async function formatMatch(
  item,
  rank
) {
  const material =
    item.material;

  const existingMapping =
    await findExistingBmgMapping(
      material.id
    );

  const bmgCode =
    existingMapping?.ncs
      ?.ncs_code ||
    existingMapping?.ncs
      ?.ncs_id ||
    generateBmgCode(
      material
    );

  const bmgName =
    existingMapping?.ncs
      ?.ncs_name ||
    material.description ||
    "Technical material";

  const percent =
    Math.round(
      clamp(
        item.score
      )
    );

  let recommendation =
    "NO_MATCH";

  if (
    percent >= 80
  ) {
    recommendation =
      "LIKELY_MATCH";
  } else if (
    percent >=
    MIN_DISPLAY_SIMILARITY
  ) {
    recommendation =
      "REVIEW";
  }

  return {
    rank,

    material_id:
      material.id,

    company:
      material.company ||
      null,

    material_number:
      material.material_number ||
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
      existingMapping?.ncs
        ?.ncs_id ||
      null,

    bmg_code:
      bmgCode,

    ai_name:
      bmgName,

    bmg_name:
      bmgName,

    similarity:
      percent / 100,

    similarity_percent:
      percent,

    technical_match_percent:
      percent,

    match_percent:
      percent,

    recommendation,

    /*
     * Internal flag; useful for debugging but can be
     * ignored by the frontend.
     */

    _direct_keyword_match:
      item.containsQuery,
  };
}

/* =========================================================
   GET QUERY MATERIAL BY ID
========================================================= */

async function getMaterialById(
  materialId
) {
  const numericId =
    Number(materialId);

  if (
    !Number.isFinite(
      numericId
    )
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("materials")
      .select("*")
      .eq(
        "id",
        numericId
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load source material: ${error.message}`
    );
  }

  return data;
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request
) {
  try {
    const body =
      await request.json();

    const {
      materialId,
      description,
      specifications,
      category,
      matchCount,
      matchThreshold,
    } = body || {};

    const requestedCount =
      Number(matchCount);

    const resultLimit =
      Number.isFinite(
        requestedCount
      )
        ? Math.min(
            Math.max(
              requestedCount,
              1
            ),
            MAX_RESULTS
          )
        : MAX_RESULTS;

    const requestedThreshold =
      Number(
        matchThreshold
      );

    const thresholdPercent =
      Number.isFinite(
        requestedThreshold
      )
        ? clamp(
            requestedThreshold <=
              1
              ? requestedThreshold *
                  100
              : requestedThreshold
          )
        : MIN_DISPLAY_SIMILARITY;

    /* =====================================================
       LOAD FULL CATALOG
    ===================================================== */

    const materials =
      await fetchMaterials();

    if (
      materials.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "No materials found in the BMG database.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       LOAD ATTRIBUTES
    ===================================================== */

    const materialIds =
      materials
        .map(
          (material) =>
            material.id
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        );

    const attributes =
      await fetchAttributes(
        materialIds
      );

    const attributeMap =
      createAttributeMap(
        attributes
      );

    /* =====================================================
       MODE 1:
       MATERIAL-ID SEARCH
    ===================================================== */

    let queryMaterial = null;

    let queryText = "";

    if (
      materialId !== null &&
      materialId !== undefined
    ) {
      queryMaterial =
        await getMaterialById(
          materialId
        );

      if (!queryMaterial) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Source material was not found.",
          },
          {
            status: 404,
          }
        );
      }

      const sourceAttributes =
        attributeMap.get(
          queryMaterial.id
        ) || [];

      queryText =
        buildMaterialText(
          queryMaterial,
          sourceAttributes
        );
    } else if (
      isTextSearchRequest(
        body
      )
    ) {
      /* ===================================================
         MODE 2:
         FREE TEXT SEARCH
      =================================================== */

      queryMaterial =
        buildQueryMaterial({
          description,
          specifications,
          category,
        });

      queryText =
        [
          cleanText(
            description
          ),

          cleanText(
            specifications
          ),

          cleanText(
            category
          ),
        ]
          .filter(Boolean)
          .join(" ");
    } else {
      return NextResponse.json(
        {
          success: false,

          error:
            "Provide either materialId or a technical search query.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       EMBEDDING — OPTIONAL
    ===================================================== */

    let queryEmbedding =
      null;

    try {
      queryEmbedding =
        await generateEmbedding(
          queryText
        );
    } catch {
      queryEmbedding =
        null;
    }

    /* =====================================================
       DETERMINISTIC TECHNICAL SEARCH
    ===================================================== */

    const scored =
      searchCatalogByText({
        materials,

        attributeMap,

        queryText,

        queryMaterial,

        matchThreshold:
          thresholdPercent,

        matchCount:
          resultLimit,
      });

    /* =====================================================
       IF MATERIAL-ID SEARCH:
       DO NOT MATCH THE SOURCE MATERIAL ITSELF
    ===================================================== */

    const filtered =
      materialId !== null &&
      materialId !== undefined
        ? scored.filter(
            (item) =>
              Number(
                item.material.id
              ) !==
              Number(
                materialId
              )
          )
        : scored;

    /* =====================================================
       OPTIONAL VECTOR BOOST
    ===================================================== */

    /*
     * Vector matching is supplemental only.
     *
     * It NEVER overrides deterministic technical matching.
     *
     * This means Gemini outage cannot break the search.
     */

    if (
      queryEmbedding &&
      filtered.length > 0
    ) {
      for (
        const item of filtered
      ) {
        /*
         * If an embedding exists in the database,
         * use it when available.
         */

        const candidateEmbedding =
          item.material.embedding;

        if (
          Array.isArray(
            candidateEmbedding
          )
        ) {
          const vectorSimilarity =
            cosineSimilarity(
              queryEmbedding,
              candidateEmbedding
            );

          const vectorPercent =
            clamp(
              vectorSimilarity *
                100
            );

          /*
           * Vector score is supplemental.
           */

          item.score =
            Math.max(
              item.score,
              vectorPercent
            );
        }
      }

      filtered.sort(
        (a, b) =>
          b.score -
          a.score
      );
    }

    /* =====================================================
       FORMAT RESULTS
    ===================================================== */

    const formattedMatches =
      [];

    for (
      let i = 0;
      i <
      filtered.length;
      i++
    ) {
      const formatted =
        await formatMatch(
          filtered[i],
          i + 1
        );

      /*
       * Only display >= threshold.
       */

      if (
        formatted.match_percent >=
        thresholdPercent
      ) {
        formattedMatches.push(
          formatted
        );
      }
    }

    /* =====================================================
       QUERY INFO
    ===================================================== */

    const queryBmgMapping =
      queryMaterial?.id
        ? await findExistingBmgMapping(
            queryMaterial.id
          )
        : null;

    const queryBmgCode =
      queryBmgMapping?.ncs
        ?.ncs_code ||
      queryBmgMapping?.ncs
        ?.ncs_id ||
      (
        queryMaterial
          ? generateBmgCode(
              queryMaterial
            )
          : null
      );

    const queryBmgName =
      queryBmgMapping?.ncs
        ?.ncs_name ||
      queryMaterial?.description ||
      null;

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        mode:
          materialId !== null &&
          materialId !== undefined
            ? "material"
            : "text",

        query: {
          material_id:
            queryMaterial?.id ||
            null,

          company:
            queryMaterial?.company ||
            null,

          /*
           * Source company code is returned only as
           * metadata. It is NOT used as the search identity.
           */

          material_number:
            queryMaterial?.material_number ||
            null,

          description:
            queryMaterial?.description ||
            cleanText(
              description
            ) ||
            null,

          specifications:
            queryMaterial?.specifications ||
            cleanText(
              specifications
            ) ||
            null,

          category:
            queryMaterial?.category ||
            cleanText(
              category
            ) ||
            null,

          search_text:
            queryText,

          bmg_id:
            queryBmgMapping?.ncs
              ?.ncs_id ||
            null,

          bmg_code:
            queryBmgCode,

          ai_name:
            queryBmgName,

          bmg_name:
            queryBmgName,
        },

        embedding: {
          model:
            EMBEDDING_MODEL,

          dimensions:
            queryEmbedding
              ? queryEmbedding.length
              : 0,

          generated:
            Boolean(
              queryEmbedding
            ),
        },

        threshold:
          thresholdPercent,

        count:
          formattedMatches.length,

        matches:
          formattedMatches,

        /*
         * Compatibility fields for the existing
         * frontend.
         */

        company_results:
          formattedMatches,

        best_match_by_company:
          formattedMatches,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Semantic search error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Semantic search failed.",

        details:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      {
        status: 500,
      }
    );
  }
}