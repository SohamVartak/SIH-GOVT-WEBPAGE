import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

/* =========================================================
   CONFIG
========================================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const EMBEDDING_MODEL =
  "gemini-embedding-2";

const EMBEDDING_DIMENSIONS = 768;

const VECTOR_RETRIEVAL_COUNT = 100;

const FINAL_CANDIDATE_COUNT = 30;

const MIN_DISPLAY_SIMILARITY = 60;

const MIN_AI_APPROVAL_CONFIDENCE = 60;

const MAX_CANDIDATES_PER_COMPANY = 10;

const MAX_CATALOG_RESULTS = 5000;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  console.warn(
    "Supabase environment variables are missing."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;


/* =========================================================
   BASIC HELPERS
========================================================= */

function clean(value) {
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

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return clean(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function numberValue(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function clamp(
  value,
  min = 0,
  max = 100
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, n)
  );
}

function unique(values) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            clean(value) !== ""
        )
        .map(clean)
    ),
  ];
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


/* =========================================================
   GEMINI JSON EXTRACTION
========================================================= */

function extractGeminiJson(text) {
  const value = clean(text);

  if (!value) {
    return null;
  }

  const direct =
    safeJsonParse(value);

  if (direct) {
    return direct;
  }

  const fenced =
    value
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

  const fencedParsed =
    safeJsonParse(fenced);

  if (fencedParsed) {
    return fencedParsed;
  }

  const firstBrace =
    value.indexOf("{");

  const lastBrace =
    value.lastIndexOf("}");

  if (
    firstBrace >= 0 &&
    lastBrace > firstBrace
  ) {
    const candidate =
      value.slice(
        firstBrace,
        lastBrace + 1
      );

    return safeJsonParse(
      candidate
    );
  }

  return null;
}


/* =========================================================
   MATERIAL FIELD HELPERS
========================================================= */

function getCompany(row) {
  if (!row) return "";

  return clean(
    row.company ??
      row.company_name ??
      row.companyName ??
      row.cpse ??
      row.owner ??
      row.organization ??
      row.organization_name ??
      row.companyCode ??
      ""
  );
}

function getMaterialNumber(row) {
  if (!row) return "";

  return clean(
    row.material_number ??
      row.materialNumber ??
      row.material_no ??
      row.materialNo ??
      row.material_code ??
      row.materialCode ??
      row.item_code ??
      row.itemCode ??
      row.part_number ??
      row.partNumber ??
      ""
  );
}

function getDescription(row) {
  if (!row) return "";

  return clean(
    row.description ??
      row.material_description ??
      row.materialDescription ??
      row.short_description ??
      row.shortDescription ??
      row.name ??
      row.material_name ??
      row.materialName ??
      ""
  );
}

function getCategory(row) {
  if (!row) return "";

  return clean(
    row.category ??
      row.material_category ??
      row.materialCategory ??
      row.product_category ??
      row.productCategory ??
      row.family ??
      row.product_family ??
      row.productFamily ??
      ""
  );
}

function getSpecifications(row) {
  if (!row) return "";

  const value =
    row.specifications ??
    row.specification ??
    row.technical_specifications ??
    row.technicalSpecifications ??
    row.technicalSpecification ??
    row.spec;

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return clean(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return clean(value);
  }
}

function getMaterialId(row) {
  if (!row) return null;

  return (
    row.id ??
    row.material_id ??
    row.materialId ??
    row.materialID ??
    null
  );
}


/* =========================================================
   PRODUCT FAMILY DETECTION
========================================================= */

/*
  IMPORTANT:
  Longer / more specific families MUST come first.

  Therefore:

  "bearing housing"
       =>
  bearing housing

  and NOT

  bearing
*/

const PRODUCT_FAMILY_PATTERNS = [
  {
    family: "bearing housing",
    patterns: [
      "bearing housing",
      "bearing-housing",
      "pillow block",
      "pillow bearing",
      "plummer block",
      "plummer bearing",
      "sn housing",
      "split bearing housing",
    ],
  },

  {
    family: "mechanical seal",
    patterns: [
      "mechanical seal",
      "mechanical-seal",
      "shaft seal",
    ],
  },

  {
    family: "steam trap",
    patterns: [
      "steam trap",
      "steam-trap",
    ],
  },

  {
    family: "o-ring",
    patterns: [
      "o ring",
      "o-ring",
      "oring",
    ],
  },

  {
    family: "bearing",
    patterns: [
      "bearing",
      "ball bearing",
      "roller bearing",
      "needle bearing",
      "taper roller bearing",
      "spherical roller bearing",
      "cylindrical roller bearing",
      "deep groove bearing",
    ],
  },

  {
    family: "valve",
    patterns: [
      "valve",
      "ball valve",
      "gate valve",
      "globe valve",
      "check valve",
      "butterfly valve",
      "control valve",
      "safety valve",
      "relief valve",
    ],
  },

  {
    family: "pump",
    patterns: [
      "pump",
      "centrifugal pump",
      "gear pump",
      "screw pump",
      "reciprocating pump",
      "diaphragm pump",
    ],
  },

  {
    family: "compressor",
    patterns: [
      "compressor",
      "air compressor",
      "screw compressor",
      "reciprocating compressor",
    ],
  },

  {
    family: "gasket",
    patterns: [
      "gasket",
      "spiral wound gasket",
      "ring gasket",
      "metal gasket",
    ],
  },

  {
    family: "hose",
    patterns: [
      "hose",
      "hydraulic hose",
      "rubber hose",
      "flexible hose",
    ],
  },

  {
    family: "filter",
    patterns: [
      "filter",
      "air filter",
      "oil filter",
      "fuel filter",
    ],
  },

  {
    family: "strainer",
    patterns: [
      "strainer",
      "y strainer",
      "basket strainer",
    ],
  },

  {
    family: "flange",
    patterns: [
      "flange",
      "blind flange",
      "slip on flange",
      "weld neck flange",
    ],
  },

  {
    family: "motor",
    patterns: [
      "motor",
      "electric motor",
      "induction motor",
    ],
  },

  {
    family: "coupling",
    patterns: [
      "coupling",
      "flexible coupling",
      "gear coupling",
    ],
  },

  {
    family: "shaft",
    patterns: [
      "shaft",
      "drive shaft",
      "pump shaft",
    ],
  },

  {
    family: "transformer",
    patterns: [
      "transformer",
      "power transformer",
      "distribution transformer",
    ],
  },

  {
    family: "cable",
    patterns: [
      "cable",
      "power cable",
      "control cable",
    ],
  },

  {
    family: "pipe",
    patterns: [
      "pipe",
      "steel pipe",
      "seamless pipe",
      "erw pipe",
    ],
  },

  {
    family: "bolt",
    patterns: [
      "bolt",
      "hex bolt",
      "anchor bolt",
    ],
  },

  {
    family: "nut",
    patterns: [
      "nut",
      "hex nut",
      "lock nut",
    ],
  },
];

function detectProductFamilyFromText(
  value
) {
  const text =
    normalize(value);

  if (!text) {
    return null;
  }

  /*
    Specific phrases are checked before generic ones.
  */

  for (
    const item of
      PRODUCT_FAMILY_PATTERNS
  ) {
    for (
      const pattern of
        item.patterns
    ) {
      if (
        text.includes(
          normalize(pattern)
        )
      ) {
        return item.family;
      }
    }
  }

  return null;
}

function getProductFamily(
  materialOrText
) {
  if (
    materialOrText === null ||
    materialOrText === undefined
  ) {
    return null;
  }

  if (
    typeof materialOrText ===
    "string"
  ) {
    return detectProductFamilyFromText(
      materialOrText
    );
  }

  /*
    HIGH-SIGNAL FIELDS FIRST.

    This prevents a category such as:
      category = "Bearing"

    from overriding:
      description = "Bearing Housing SN509"
  */

  const description =
    getDescription(
      materialOrText
    );

  const descriptionFamily =
    detectProductFamilyFromText(
      description
    );

  if (descriptionFamily) {
    return descriptionFamily;
  }

  const nameFamily =
    detectProductFamilyFromText(
      materialOrText.name
    );

  if (nameFamily) {
    return nameFamily;
  }

  const shortDescriptionFamily =
    detectProductFamilyFromText(
      materialOrText.short_description
    );

  if (shortDescriptionFamily) {
    return shortDescriptionFamily;
  }

  /*
    Explicit product-family fields.
  */

  const explicitFamily =
    clean(
      materialOrText.product_family ??
        materialOrText.productFamily ??
        materialOrText.material_family ??
        materialOrText.materialFamily ??
        materialOrText.family ??
        ""
    );

  if (explicitFamily) {
    const detectedExplicit =
      detectProductFamilyFromText(
        explicitFamily
      );

    if (detectedExplicit) {
      return detectedExplicit;
    }

    return normalize(
      explicitFamily
    );
  }

  /*
    Category is only a fallback.
  */

  const category =
    getCategory(
      materialOrText
    );

  if (category) {
    const categoryFamily =
      detectProductFamilyFromText(
        category
      );

    if (categoryFamily) {
      return categoryFamily;
    }
  }

  /*
    Only then inspect shorter structured
    technical fields.

    We intentionally do NOT inspect the
    entire datasheet narrative first.
  */

  const structuredText =
    unique([
      materialOrText.design_features,
      materialOrText.designFeatures,
      materialOrText.technical_features,
      materialOrText.technicalFeatures,
      materialOrText.other_attributes,
      materialOrText.otherAttributes,
    ]).join(" ");

  const structuredFamily =
    detectProductFamilyFromText(
      structuredText
    );

  if (structuredFamily) {
    return structuredFamily;
  }

  return null;
}

function detectQueryFamily(
  search,
  specification,
  category
) {
  const combined =
    unique([
      search,
      category,
      specification,
    ]).join(" ");

  return detectProductFamilyFromText(
    combined
  );
}


/* =========================================================
   TOKEN / TEXT SIMILARITY
========================================================= */

function tokenize(value) {
  return unique(
    normalize(value)
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 2
      )
  );
}

function tokenSimilarity(
  a,
  b
) {
  const aa =
    new Set(tokenize(a));

  const bb =
    new Set(tokenize(b));

  if (
    aa.size === 0 ||
    bb.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (
    const token of aa
  ) {
    if (bb.has(token)) {
      intersection++;
    }
  }

  const union =
    new Set([
      ...aa,
      ...bb,
    ]).size;

  return union
    ? (intersection / union) * 100
    : 0;
}

function substringSimilarity(
  a,
  b
) {
  const aa =
    normalize(a);

  const bb =
    normalize(b);

  if (!aa || !bb) {
    return 0;
  }

  if (
    aa === bb
  ) {
    return 100;
  }

  if (
    aa.includes(bb) ||
    bb.includes(aa)
  ) {
    const shorter =
      Math.min(
        aa.length,
        bb.length
      );

    const longer =
      Math.max(
        aa.length,
        bb.length
      );

    return (
      80 +
      (shorter / longer) * 20
    );
  }

  return 0;
}

function textSimilarity(
  a,
  b
) {
  return clamp(
    Math.max(
      tokenSimilarity(a, b),
      substringSimilarity(a, b)
    )
  );
}

function numberSimilarity(
  a,
  b
) {
  const aa =
    numberValue(a);

  const bb =
    numberValue(b);

  if (
    aa === null ||
    bb === null
  ) {
    return 0;
  }

  if (aa === bb) {
    return 100;
  }

  const max =
    Math.max(
      Math.abs(aa),
      Math.abs(bb),
      1
    );

  const difference =
    Math.abs(aa - bb) /
    max;

  return clamp(
    100 -
      difference * 100
  );
}


/* =========================================================
   TECHNICAL VALUE EXTRACTION
========================================================= */

function extractTechnicalValues(
  value
) {
  const text =
    normalize(value);

  if (!text) {
    return {
      dimensions: [],
      pressures: [],
      temperatures: [],
      voltages: [],
      speeds: [],
      materials: [],
      standards: [],
      designations: [],
      sizes: [],
      quantities: [],
      seals: [],
      ratings: [],
    };
  }

  const extract =
    (regex) =>
      unique(
        [
          ...text.matchAll(regex),
        ].map(
          (match) =>
            match[0]
        )
      );

  return {
    dimensions: extract(
      /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|in)\b/gi
    ),

    pressures: extract(
      /\b\d+(?:\.\d+)?\s*(?:bar|mpa|psi|kg\/cm2|kgf\/cm2)\b/gi
    ),

    temperatures: extract(
      /\b-?\d+(?:\.\d+)?\s*(?:°c|deg c|c)\b/gi
    ),

    voltages: extract(
      /\b\d+(?:\.\d+)?\s*(?:v|kv|volt|volts)\b/gi
    ),

    speeds: extract(
      /\b\d+(?:\.\d+)?\s*(?:rpm|r\/min)\b/gi
    ),

    materials: extract(
      /\b(?:ss\s*304|ss\s*316|ss304|ss316|stainless steel|carbon steel|cast iron|mild steel|brass|bronze|aluminium|aluminum)\b/gi
    ),

    standards: extract(
      /\b(?:is|astm|ansi|api|din|iso|bs|jis|iec|en)\s*[-.]?\s*\d+[a-z0-9.-]*\b/gi
    ),

    designations: extract(
      /\b(?:sn|skf|nsk|ntn|timken|fag|ina|620\d|630\d|222\d|223\d|230\d|231\d|232\d|302\d|303\d|320\d|nu\d+|nj\d+)[a-z0-9.-]*\b/gi
    ),

    sizes: extract(
      /\b(?:size|dn|nb|nps)\s*[-:]?\s*\d+[a-z0-9.-]*\b/gi
    ),

    quantities: extract(
      /\b\d+\s*(?:pcs|pieces|nos|number|numbers|qty)\b/gi
    ),

    seals: extract(
      /\b(?:2rs|2z|rs|zz|rubber seal|felt seal|oil seal|seal)\b/gi
    ),

    ratings: extract(
      /\b(?:pn\s*\d+|class\s*\d+|ip\s*\d+)\b/gi
    ),
  };
}

function getTechnicalFeatureText(
  material
) {
  if (!material) {
    return "";
  }

  return unique([
    material.technical_features,
    material.technicalFeatures,
    material.design_features,
    material.designFeatures,
    material.other_attributes,
    material.otherAttributes,
    material.technical_attributes_text,
    material.technicalAttributesText,
    getSpecifications(material),
  ]).join(" ");
}


/* =========================================================
   TECHNICAL COMPARISON
========================================================= */

function valuesOverlap(
  aValues,
  bValues
) {
  if (
    !aValues?.length ||
    !bValues?.length
  ) {
    return false;
  }

  const b =
    new Set(
      bValues.map(normalize)
    );

  return aValues.some(
    (value) =>
      b.has(
        normalize(value)
      )
  );
}

function hasCriticalConflict(
  source,
  candidate
) {
  const sourceText =
    getTechnicalFeatureText(
      source
    );

  const candidateText =
    getTechnicalFeatureText(
      candidate
    );

  const a =
    extractTechnicalValues(
      [
        getDescription(source),
        getCategory(source),
        sourceText,
      ].join(" ")
    );

  const b =
    extractTechnicalValues(
      [
        getDescription(candidate),
        getCategory(candidate),
        candidateText,
      ].join(" ")
    );

  /*
    Explicit designation mismatch.
  */

  if (
    a.designations.length &&
    b.designations.length
  ) {
    const overlap =
      valuesOverlap(
        a.designations,
        b.designations
      );

    if (!overlap) {
      return true;
    }
  }

  /*
    Pressure mismatch.
  */

  if (
    a.pressures.length &&
    b.pressures.length &&
    !valuesOverlap(
      a.pressures,
      b.pressures
    )
  ) {
    return true;
  }

  /*
    Voltage mismatch.
  */

  if (
    a.voltages.length &&
    b.voltages.length &&
    !valuesOverlap(
      a.voltages,
      b.voltages
    )
  ) {
    return true;
  }

  /*
    Material mismatch.
  */

  if (
    a.materials.length &&
    b.materials.length &&
    !valuesOverlap(
      a.materials,
      b.materials
    )
  ) {
    return true;
  }

  /*
    Rating mismatch.
  */

  if (
    a.ratings.length &&
    b.ratings.length &&
    !valuesOverlap(
      a.ratings,
      b.ratings
    )
  ) {
    return true;
  }

  return false;
}

function calculateFeatureScore(
  source,
  candidate
) {
  const sourceFamily =
    getProductFamily(
      source
    );

  const candidateFamily =
    getProductFamily(
      candidate
    );

  /*
    Product family mismatch is a hard
    technical mismatch.

    Bearing != Bearing Housing.
  */

  if (
    sourceFamily &&
    candidateFamily &&
    sourceFamily !==
      candidateFamily
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        `Different product families: ${sourceFamily} vs ${candidateFamily}.`,
    };
  }

  const sourceDescription =
    getDescription(
      source
    );

  const candidateDescription =
    getDescription(
      candidate
    );

  const sourceCategory =
    getCategory(
      source
    );

  const candidateCategory =
    getCategory(
      candidate
    );

  const sourceFeatures =
    getTechnicalFeatureText(
      source
    );

  const candidateFeatures =
    getTechnicalFeatureText(
      candidate
    );

  const descriptionScore =
    textSimilarity(
      sourceDescription,
      candidateDescription
    );

  const categoryScore =
    textSimilarity(
      sourceCategory,
      candidateCategory
    );

  const featureScore =
    textSimilarity(
      sourceFeatures,
      candidateFeatures
    );

  const familyScore =
    sourceFamily &&
    candidateFamily &&
    sourceFamily ===
      candidateFamily
      ? 100
      : 60;

  const conflict =
    hasCriticalConflict(
      source,
      candidate
    );

  if (conflict) {
    return {
      score: 0,
      conflict: true,
      reason:
        "Critical technical specification conflict detected.",
    };
  }

  let score =
    descriptionScore * 0.30 +
    categoryScore * 0.10 +
    featureScore * 0.20 +
    familyScore * 0.25 +
    100 * 0.15;

  /*
    If neither side has enough critical
    specifications, slightly reduce confidence.
  */

  const sourceValues =
    extractTechnicalValues(
      sourceFeatures
    );

  const candidateValues =
    extractTechnicalValues(
      candidateFeatures
    );

  const hasCriticalTechnicalData =
    sourceValues.designations.length ||
    candidateValues.designations.length ||
    sourceValues.pressures.length ||
    candidateValues.pressures.length ||
    sourceValues.voltages.length ||
    candidateValues.voltages.length ||
    sourceValues.materials.length ||
    candidateValues.materials.length ||
    sourceValues.ratings.length ||
    candidateValues.ratings.length;

  if (
    !hasCriticalTechnicalData
  ) {
    score *= 0.90;
  }

  if (
    sourceFamily &&
    candidateFamily &&
    sourceFamily ===
      candidateFamily
  ) {
    score += 5;
  }

  return {
    score: clamp(score),
    conflict: false,
    reason:
      `Technical score ${clamp(score).toFixed(1)}%. ` +
      `Family: ${sourceFamily || "unknown"}.`,
  };
}


/* =========================================================
   DATABASE LOADERS
========================================================= */

async function loadAllMaterials() {
  const {
    data,
    error,
  } = await supabase
    .from("materials")
    .select("*")
    .limit(
      MAX_CATALOG_RESULTS
    );

  if (error) {
    throw new Error(
      `Unable to load materials: ${error.message}`
    );
  }

  return data || [];
}

async function loadMaterialById(
  materialId
) {
  /*
    IMPORTANT:
    No .single()
    No .maybeSingle()

    This prevents:
    "Cannot coerce the result to a single JSON object"
  */

  const {
    data,
    error,
  } = await supabase
    .from("materials")
    .select("*")
    .eq(
      "id",
      materialId
    )
    .limit(1);

  if (error) {
    throw new Error(
      `Unable to load material: ${error.message}`
    );
  }

  return data?.[0] || null;
}

async function loadMaterialsByIds(
  ids
) {
  const uniqueIds =
    unique(
      ids.map(String)
    );

  if (!uniqueIds.length) {
    return [];
  }

  const results = [];

  const chunkSize = 500;

  for (
    let i = 0;
    i < uniqueIds.length;
    i += chunkSize
  ) {
    const chunk =
      uniqueIds.slice(
        i,
        i + chunkSize
      );

    const {
      data,
      error,
    } = await supabase
      .from("materials")
      .select("*")
      .in(
        "id",
        chunk
      );

    if (error) {
      console.warn(
        "Material ID chunk failed:",
        error.message
      );

      continue;
    }

    results.push(
      ...(data || [])
    );
  }

  return results;
}

async function loadMaterialAttributes(
  materialIds
) {
  const ids =
    unique(
      materialIds.map(String)
    );

  if (!ids.length) {
    return new Map();
  }

  const tables = [
    "material_attributes",
    "material_attribute",
    "technical_attributes",
    "material_specs",
  ];

  for (
    const table of tables
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select("*")
        .in(
          "material_id",
          ids
        );

      if (
        !error &&
        data?.length
      ) {
        const map =
          new Map();

        for (
          const row of data
        ) {
          const id =
            row.material_id ??
            row.materialId;

          if (
            id === null ||
            id === undefined
          ) {
            continue;
          }

          const current =
            map.get(
              String(id)
            ) || [];

          current.push(row);

          map.set(
            String(id),
            current
          );
        }

        return map;
      }
    } catch (error) {
      console.warn(
        `Attribute table ${table} unavailable:`,
        error?.message ||
          error
      );
    }
  }

  return new Map();
}

async function loadBMGMappings() {
  const tables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  const rows = [];

  for (
    const table of tables
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select("*")
        .limit(
          MAX_CATALOG_RESULTS
        );

      if (
        !error &&
        data?.length
      ) {
        rows.push(
          ...data
        );
      }
    } catch (error) {
      console.warn(
        `BMG mapping table ${table} unavailable:`,
        error?.message ||
          error
      );
    }
  }

  return rows;
}


/* =========================================================
   ATTRIBUTE ENRICHMENT
========================================================= */

function attributesToText(
  attributes
) {
  if (
    !attributes?.length
  ) {
    return "";
  }

  return attributes
    .map((attribute) => {
      try {
        return JSON.stringify(
          attribute
        );
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

function enrichMaterial(
  material,
  attributeMap
) {
  const id =
    getMaterialId(
      material
    );

  const attributes =
    attributeMap.get(
      String(id)
    ) || [];

  const attributeText =
    attributesToText(
      attributes
    );

  return {
    ...material,

    material_attributes:
      attributes,

    technical_attributes_text:
      attributeText,

    technical_features:
      unique([
        material.technical_features,
        material.technicalFeatures,
        getTechnicalFeatureText(
          material
        ),
        attributeText,
      ]).join(" "),
  };
}

function enrichMaterials(
  materials,
  attributeMap
) {
  return materials.map(
    (material) =>
      enrichMaterial(
        material,
        attributeMap
      )
  );
}


/* =========================================================
   BMG HELPERS
========================================================= */

function looksLikeBMGCode(
  value
) {
  const code =
    normalizeCode(value);

  return (
    code.startsWith("BMG") ||
    code.startsWith("NCS")
  );
}

function getBMGCodeFromRow(
  row
) {
  if (!row) {
    return null;
  }

  const directFields = [
    "bmg_code",
    "bmgCode",
    "bmg_identity",
    "bmgIdentity",
    "bmg_standard_code",
    "bmgStandardCode",
    "bmg_standard_identity",
    "bmgStandardIdentity",
    "ncs_code",
    "ncsCode",
    "ncs_identity",
    "ncsIdentity",
    "standard_code",
    "standardCode",
    "standard_identity",
    "standardIdentity",
    "identity_code",
    "identityCode",
    "identity",
  ];

  for (
    const field of
      directFields
  ) {
    const value =
      clean(row[field]);

    if (
      value &&
      looksLikeBMGCode(
        value
      )
    ) {
      return value;
    }
  }

  /*
    Search unknown columns, but NEVER use
    company material number as BMG identity.
  */

  const excluded =
    new Set([
      "material_number",
      "materialNumber",
      "material_no",
      "materialNo",
      "material_code",
      "materialCode",
      "item_code",
      "itemCode",
      "part_number",
      "partNumber",
      "company_material_number",
      "companyMaterialNumber",
      "company_part_number",
      "companyPartNumber",
      "company_item_code",
      "companyItemCode",
    ]);

  for (
    const [
      key,
      value,
    ] of Object.entries(row)
  ) {
    if (
      excluded.has(key)
    ) {
      continue;
    }

    const lower =
      key.toLowerCase();

    if (
      lower.includes("bmg") ||
      lower.includes("ncs") ||
      lower.includes("standard") ||
      lower.includes("identity")
    ) {
      const text =
        clean(value);

      if (
        text &&
        looksLikeBMGCode(
          text
        )
      ) {
        return text;
      }
    }
  }

  /*
    Generic code is used only if it
    actually looks like a BMG/NCS code.
  */

  const genericCode =
    clean(row.code);

  if (
    genericCode &&
    looksLikeBMGCode(
      genericCode
    )
  ) {
    return genericCode;
  }

  return null;
}

function getBMGIdFromRow(
  row
) {
  if (!row) {
    return null;
  }

  const directFields = [
    "bmg_id",
    "bmgId",
    "bmgID",
    "ncs_id",
    "ncsId",
    "ncsID",
    "standard_id",
    "standardId",
    "standardID",
    "bmg_identity_id",
    "bmgIdentityId",
    "ncs_identity_id",
    "ncsIdentityId",
    "identity_id",
    "identityId",
  ];

  for (
    const field of
      directFields
  ) {
    if (
      row[field] !==
        null &&
      row[field] !==
        undefined
    ) {
      return row[field];
    }
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(row)
  ) {
    const lower =
      key.toLowerCase();

    if (
      (
        lower.includes("bmg") ||
        lower.includes("ncs") ||
        lower.includes("standard") ||
        lower.includes("identity")
      ) &&
      lower.endsWith("_id")
    ) {
      if (
        value !== null &&
        value !== undefined
      ) {
        return value;
      }
    }
  }

  /*
    Generic id is considered a BMG ID only
    when the row itself contains a BMG code.
  */

  if (
    row.id !== undefined &&
    row.id !== null &&
    getBMGCodeFromRow(row)
  ) {
    return row.id;
  }

  return null;
}

function getMappingMaterialId(
  row
) {
  if (!row) {
    return null;
  }

  return (
    row.material_id ??
    row.materialId ??
    row.materialID ??
    row.company_material_id ??
    row.companyMaterialId ??
    row.material_record_id ??
    row.materialRecordId ??
    row.item_material_id ??
    row.itemMaterialId ??
    row.source_material_id ??
    row.sourceMaterialId ??
    row.target_material_id ??
    row.targetMaterialId ??
    null
  );
}

function buildMaterialBMGMap(
  mappings
) {
  const map =
    new Map();

  for (
    const mapping of
      mappings
  ) {
    const materialId =
      getMappingMaterialId(
        mapping
      );

    if (
      materialId === null ||
      materialId === undefined
    ) {
      continue;
    }

    const code =
      getBMGCodeFromRow(
        mapping
      );

    const bmgId =
      getBMGIdFromRow(
        mapping
      );

    if (
      !code &&
      bmgId === null
    ) {
      continue;
    }

    const key =
      String(materialId);

    const current =
      map.get(key) || [];

    current.push({
      code,
      bmg_id: bmgId,
    });

    map.set(
      key,
      current
    );
  }

  return map;
}

function getMaterialBMGCode(
  material,
  mappingsByMaterialId
) {
  const materialId =
    getMaterialId(
      material
    );

  const mappings =
    mappingsByMaterialId.get(
      String(materialId)
    ) || [];

  const mapped =
    mappings.find(
      (mapping) =>
        mapping.code
    );

  return (
    mapped?.code ||
    getBMGCodeFromRow(
      material
    ) ||
    null
  );
}


/* =========================================================
   SEARCH TEXT
========================================================= */

/*
  Company material numbers are intentionally
  NOT included in identity search.
*/

function buildSearchText(
  material
) {
  return unique([
    getDescription(material),
    getCategory(material),
    getProductFamily(material),
    getBMGCodeFromRow(material),
    getSpecifications(material),
    material.technical_attributes_text,
    material.technical_features,
  ]).join(" ");
}

function buildCatalogIdentityText(
  material
) {
  return unique([
    getDescription(material),
    getCategory(material),
    getProductFamily(material),
    getBMGCodeFromRow(material),
  ]).join(" ");
}

function searchFamilyCompatible(
  queryFamily,
  candidateFamily
) {
  if (!queryFamily) {
    return true;
  }

  if (!candidateFamily) {
    return false;
  }

  /*
    Exact family matching.

    IMPORTANT:
      bearing
      !=
      bearing housing
  */

  return (
    normalize(
      queryFamily
    ) ===
    normalize(
      candidateFamily
    )
  );
}


/* =========================================================
   GLOBAL CATALOG SEARCH
========================================================= */

async function searchEntireCatalog({
  search = "",
  specification = "",
  category = "",
}) {
  const materials =
    await loadAllMaterials();

  const ids =
    materials
      .map(
        getMaterialId
      )
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      );

  const attributeMap =
    await loadMaterialAttributes(
      ids
    );

  const mappings =
    await loadBMGMappings();

  const materialBmgMap =
    buildMaterialBMGMap(
      mappings
    );

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  const normalizedSearch =
    normalize(search);

  const queryTokens =
    tokenize(search);

  const queryFamily =
    detectQueryFamily(
      search,
      specification,
      category
    );

  /*
    A one-word product-family query such as:
      bearing
      valve
      pump

    is treated as a family search.

    This prevents random datasheet text from
    generating false positives.
  */

  const simpleFamilySearch =
    Boolean(
      queryFamily &&
      queryTokens.length === 1 &&
      normalize(
        queryFamily
      ) ===
        normalize(
          queryTokens[0]
        )
    );

  const ranked = [];

  for (
    const material of
      enriched
  ) {
    const materialFamily =
      getProductFamily(
        material
      );

    /*
      Product-family searches require an
      exact family match.
    */

    if (
      queryFamily &&
      !searchFamilyCompatible(
        queryFamily,
        materialFamily
      )
    ) {
      continue;
    }

    const description =
      normalize(
        getDescription(
          material
        )
      );

    const candidateCategory =
      normalize(
        getCategory(
          material
        )
      );

    const familyText =
      normalize(
        materialFamily
      );

    const specifications =
      normalize(
        getSpecifications(
          material
        )
      );

    const technicalAttributes =
      normalize(
        material.technical_attributes_text
      );

    const identityText =
      normalize(
        buildCatalogIdentityText(
          material
        )
      );

    const fullSearchText =
      normalize(
        buildSearchText(
          material
        )
      );

    let score = 0;

    if (
      queryFamily &&
      materialFamily &&
      normalize(
        queryFamily
      ) ===
        normalize(
          materialFamily
        )
    ) {
      score += 65;
    }

    if (search) {
      score +=
        textSimilarity(
          search,
          description
        ) * 0.20;

      if (category) {
        score +=
          textSimilarity(
            category,
            candidateCategory
          ) * 0.10;
      }

      if (
        specification
      ) {
        score +=
          textSimilarity(
            specification,
            specifications
          ) * 0.10;
      }

      score +=
        textSimilarity(
          search,
          technicalAttributes
        ) * 0.05;
    }

    /*
      Direct keyword matching is based on
      meaningful catalog identity fields.

      We do NOT allow a random mention of
      "bearing" deep inside an unrelated
      datasheet to become a direct product match.
    */

    const directKeywordMatch =
      queryTokens.length > 0 &&
      queryTokens.every(
        (token) =>
          identityText.includes(
            token
          )
      );

    const exactPhraseMatch =
      normalizedSearch &&
      identityText.includes(
        normalizedSearch
      );

    /*
      For a family search, exact family
      compatibility is the primary condition.
    */

    if (
      simpleFamilySearch
    ) {
      score =
        Math.max(
          score,
          75
        );
    }

    if (
      exactPhraseMatch
    ) {
      score =
        Math.max(
          score,
          95
        );
    }

    if (
      directKeywordMatch
    ) {
      score =
        Math.max(
          score,
          70
        );
    }

    /*
      Generic family searches should never
      match merely because the word occurs
      in specifications.
    */

    if (
      simpleFamilySearch &&
      !searchFamilyCompatible(
        queryFamily,
        materialFamily
      )
    ) {
      continue;
    }

    /*
      For non-family searches, reject zero-
      relevance rows.
    */

    if (
      !simpleFamilySearch &&
      !directKeywordMatch &&
      !exactPhraseMatch &&
      score <= 0
    ) {
      continue;
    }

    const catalogScore =
      clamp(score);

    const materialId =
      getMaterialId(
        material
      );

    const bmgCode =
      getMaterialBMGCode(
        material,
        materialBmgMap
      );

    ranked.push({
      id: materialId,

      company:
        getCompany(
          material
        ),

      company_id:
        material?.company_id ??
        material?.companyId ??
        null,

      material_number:
        getMaterialNumber(
          material
        ),

      description:
        getDescription(
          material
        ),

      specifications:
        getSpecifications(
          material
        ),

      category:
        getCategory(
          material
        ),

      bmg_code:
        bmgCode,

      bmg_id:
        materialBmgMap.get(
          String(materialId)
        )?.find(
          (mapping) =>
            mapping.bmg_id !== null &&
            mapping.bmg_id !== undefined
        )?.bmg_id ??
        getBMGIdFromRow(
          material
        ) ??
        null,

      ai_name:
        material?.ai_name ||
        material?.aiName ||
        null,

      bmg_status:
        material?.bmg_status ||
        material?.bmgStatus ||
        null,

      ai_confidence:
        material?.ai_confidence ??
        material?.aiConfidence ??
        null,

      match_status:
        material?.match_status ||
        material?.matchStatus ||
        null,

      verified:
        Boolean(
          material?.verified ??
          material?.is_verified ??
          false
        ),

      technical_features:
        material?.technical_features ||
        getTechnicalFeatureText(
          material
        ),

      similarity:
        Number(
          catalogScore.toFixed(1)
        ),

      deterministic_similarity:
        Number(
          catalogScore.toFixed(1)
        ),

      gemini_confidence:
        null,

      product_family:
        materialFamily,

      query_family:
        queryFamily,

      technical_match:
        true,

      is_equivalent:
        false,

      gemini_approved:
        true,

      threshold:
        MIN_DISPLAY_SIMILARITY,

      classification:
        simpleFamilySearch
          ? "CATALOG_FAMILY_MATCH"
          : "CATALOG_MATCH",

      technical_reason:
        simpleFamilySearch
          ? `Matched product family: ${materialFamily}.`
          : "Catalog search match.",

      deterministic_reason:
        simpleFamilySearch
          ? `Matched product family: ${materialFamily}.`
          : "Deterministic catalog relevance match.",

      gemini_reason:
        null,

      search_mode:
        "CATALOG_SEARCH",

      catalog_match:
        true,

      displayable:
        true,

      bmg_group_code:
        bmgCode,

      shared_bmg_code:
        bmgCode,

      direct_keyword_match:
        Boolean(
          directKeywordMatch
        ),

      exact_phrase_match:
        Boolean(
          exactPhraseMatch
        ),

      search_text:
        buildSearchText(
          material
        ),

      bmg_search_text:
        unique([
          getBMGCodeFromRow(
            material
          ),
          bmgCode,
        ]).join(" "),
    });
  }

  ranked.sort(
    (a, b) => {
      if (
        b.exact_phrase_match !==
        a.exact_phrase_match
      ) {
        return (
          Number(
            b.exact_phrase_match
          ) -
          Number(
            a.exact_phrase_match
          )
        );
      }

      if (
        b.direct_keyword_match !==
        a.direct_keyword_match
      ) {
        return (
          Number(
            b.direct_keyword_match
          ) -
          Number(
            a.direct_keyword_match
          )
        );
      }

      return (
        b.similarity -
        a.similarity
      );
    }
  );

  /*
    Deduplicate material IDs.
  */

  const seen =
    new Set();

  const finalResults =
    ranked.filter(
      (result) => {
        const key =
          String(
            result.id
          );

        if (
          seen.has(key)
        ) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );

  return {
    success: true,

    matched:
      finalResults.length > 0,

    search_mode:
      "CATALOG_SEARCH",

    query:
      search,

    specification,

    category,

    query_family:
      queryFamily,

    total_results:
      finalResults.length,

    matches:
      finalResults,

    results:
      finalResults,

    best_match:
      finalResults[0] ||
      null,

    data: {
      query:
        search,

      specification,

      category,

      query_family:
        queryFamily,

      result_count:
        finalResults.length,

      results:
        finalResults,

      message:
        finalResults.length
          ? `Found ${finalResults.length} catalog result(s).`
          : "No relevant catalog material found.",
    },
  };
}


/* =========================================================
   BMG GROUP SEARCH
========================================================= */

async function searchBMGGroup(
  requestedCode
) {
  const normalizedRequestedCode =
    normalizeCode(
      requestedCode
    );

  if (
    !normalizedRequestedCode
  ) {
    return {
      success: false,
      matched: false,
      search_mode:
        "BMG_GROUP_SEARCH",
      query:
        requestedCode,
      total_results: 0,
      matches: [],
      results: [],
      best_match: null,
      message:
        "Invalid BMG code.",
    };
  }

  const bmgTables = [
    "bmg_materials",
    "ncs_materials",
    "bmg_master",
    "ncs_master",
    "bmg_standard",
    "ncs_standard",
    "bmg_identity",
    "bmg_identities",
  ];

  const bmgRecords = [];

  for (
    const table of
      bmgTables
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select("*")
        .limit(
          MAX_CATALOG_RESULTS
        );

      if (
        !error &&
        data?.length
      ) {
        for (
          const row of data
        ) {
          const code =
            getBMGCodeFromRow(
              row
            );

          if (
            code &&
            normalizeCode(
              code
            ) ===
              normalizedRequestedCode
          ) {
            bmgRecords.push(
              row
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        `BMG table ${table} unavailable:`,
        error?.message ||
          error
      );
    }
  }

  const bmgIds =
    unique(
      bmgRecords
        .map(
          getBMGIdFromRow
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )
        .map(String)
    );

  /*
    Find material mappings.
  */

  const mappingTables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
    "bmg_materials",
  ];

  const mappingRows = [];

  for (
    const table of
      mappingTables
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select("*")
        .limit(
          MAX_CATALOG_RESULTS
        );

      if (
        !error &&
        data?.length
      ) {
        for (
          const row of data
        ) {
          const code =
            getBMGCodeFromRow(
              row
            );

          const rowBmgId =
            getBMGIdFromRow(
              row
            );

          if (
            (
              code &&
              normalizeCode(
                code
              ) ===
                normalizedRequestedCode
            ) ||
            (
              rowBmgId !== null &&
              rowBmgId !== undefined &&
              bmgIds.includes(
                String(
                  rowBmgId
                )
              )
            )
          ) {
            mappingRows.push(
              row
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        `BMG mapping table ${table} unavailable:`,
        error?.message ||
          error
      );
    }
  }

  const directMaterialIds =
    unique(
      bmgRecords
        .map(
          getMappingMaterialId
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )
        .map(String)
    );

  const mappingMaterialIds =
    unique(
      mappingRows
        .map(
          getMappingMaterialId
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )
        .map(String)
    );

  const materialIds =
    unique([
      ...directMaterialIds,
      ...mappingMaterialIds,
    ]);

  let materials =
    await loadMaterialsByIds(
      materialIds
    );

  /*
    Direct BMG fields stored inside materials.
  */

  const allMaterials =
    await loadAllMaterials();

  const directBmgMaterialMatches =
    allMaterials.filter(
      (material) => {
        const directCode =
          getBMGCodeFromRow(
            material
          );

        if (
          directCode &&
          normalizeCode(
            directCode
          ) ===
            normalizedRequestedCode
        ) {
          return true;
        }

        const materialBmgId =
          material?.bmg_id ??
          material?.bmgId ??
          material?.ncs_id ??
          material?.ncsId ??
          material?.standard_id ??
          material?.standardId ??
          material?.bmg_identity_id ??
          material?.bmgIdentityId ??
          null;

        return (
          materialBmgId !== null &&
          materialBmgId !== undefined &&
          bmgIds.includes(
            String(
              materialBmgId
            )
          )
        );
      }
    );

  const materialById =
    new Map();

  for (
    const material of
      materials
  ) {
    const id =
      getMaterialId(
        material
      );

    if (
      id !== null &&
      id !== undefined
    ) {
      materialById.set(
        String(id),
        material
      );
    }
  }

  for (
    const material of
      directBmgMaterialMatches
  ) {
    const id =
      getMaterialId(
        material
      );

    if (
      id !== null &&
      id !== undefined
    ) {
      materialById.set(
        String(id),
        material
      );
    }
  }

  materials = [
    ...materialById.values(),
  ];

  const ids =
    materials
      .map(
        getMaterialId
      )
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      );

  const attributeMap =
    await loadMaterialAttributes(
      ids
    );

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  const results =
    enriched.map(
      (material) => {
        const materialId =
          getMaterialId(
            material
          );

        const mapping =
          mappingRows.find(
            (row) =>
              String(
                getMappingMaterialId(
                  row
                )
              ) ===
              String(
                materialId
              )
          );

        const bmgRecord =
          bmgRecords.find(
            (row) => {
              const id =
                getBMGIdFromRow(
                  row
                );

              const mappingId =
                mapping
                  ? getBMGIdFromRow(
                      mapping
                    )
                  : null;

              if (
                id !== null &&
                id !== undefined &&
                mappingId !== null &&
                mappingId !== undefined
              ) {
                return (
                  String(id) ===
                  String(mappingId)
                );
              }

              return false;
            }
          );

        const resolvedCode =
          getBMGCodeFromRow(
            mapping
          ) ||
          getBMGCodeFromRow(
            bmgRecord
          ) ||
          getBMGCodeFromRow(
            material
          ) ||
          requestedCode;

        const resolvedBmgId =
          getBMGIdFromRow(
            mapping
          ) ??
          getBMGIdFromRow(
            bmgRecord
          ) ??
          getBMGIdFromRow(
            material
          ) ??
          null;

        return {
          id: materialId,

          company:
            getCompany(
              material
            ),

          company_id:
            material?.company_id ??
            material?.companyId ??
            null,

          material_number:
            getMaterialNumber(
              material
            ),

          description:
            getDescription(
              material
            ),

          specifications:
            getSpecifications(
              material
            ),

          category:
            getCategory(
              material
            ),

          bmg_code:
            resolvedCode,

          bmg_id:
            resolvedBmgId,

          ai_name:
            material?.ai_name ||
            material?.aiName ||
            null,

          bmg_status:
            material?.bmg_status ||
            material?.bmgStatus ||
            bmgRecord?.status ||
            null,

          ai_confidence:
            material?.ai_confidence ??
            material?.aiConfidence ??
            null,

          match_status:
            material?.match_status ||
            material?.matchStatus ||
            null,

          verified:
            Boolean(
              material?.verified ??
              material?.is_verified ??
              false
            ),

          technical_features:
            material?.technical_features ||
            getTechnicalFeatureText(
              material
            ),

          similarity: 100,

          deterministic_similarity: 100,

          gemini_confidence: null,

          product_family:
            getProductFamily(
              material
            ),

          query_family:
            getProductFamily(
              material
            ),

          technical_match: true,

          is_equivalent: true,

          gemini_approved: true,

          threshold: 100,

          classification:
            "BMG_GROUP_MEMBER",

          technical_reason:
            "Material belongs to the requested BMG group.",

          deterministic_reason:
            "Material belongs to the requested BMG group.",

          gemini_reason: null,

          search_mode:
            "BMG_GROUP_SEARCH",

          catalog_match: true,

          displayable: true,

          bmg_group_code:
            resolvedCode,

          shared_bmg_code:
            resolvedCode,
        };
      }
    );

  /*
    Deduplicate material records.
  */

  const seen =
    new Set();

  const finalResults =
    results.filter(
      (result) => {
        const key =
          String(
            result.id
          );

        if (
          seen.has(key)
        ) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );

  return {
    success: true,

    matched:
      finalResults.length > 0,

    search_mode:
      "BMG_GROUP_SEARCH",

    query:
      requestedCode,

    total_results:
      finalResults.length,

    matches:
      finalResults,

    results:
      finalResults,

    best_match:
      finalResults[0] ||
      null,

    shared_bmg_code:
      requestedCode,

    bmg_code:
      requestedCode,

    data: {
      bmg_code:
        requestedCode,

      result_count:
        finalResults.length,

      results:
        finalResults,

      message:
        finalResults.length
          ? `Found ${finalResults.length} material(s) in BMG group ${requestedCode}.`
          : `No materials found for BMG group ${requestedCode}.`,
    },
  };
}


/* =========================================================
   GEMINI TECHNICAL REVIEW
========================================================= */

async function callGeminiTechnicalReview(
  source,
  candidates
) {
  if (
    !ai ||
    !candidates.length
  ) {
    return null;
  }

  const sourcePayload = {
    id:
      getMaterialId(
        source
      ),

    company:
      getCompany(
        source
      ),

    material_number:
      getMaterialNumber(
        source
      ),

    description:
      getDescription(
        source
      ),

    category:
      getCategory(
        source
      ),

    specifications:
      getSpecifications(
        source
      ),

    product_family:
      getProductFamily(
        source
      ),

    technical_features:
      getTechnicalFeatureText(
        source
      ),
  };

  const candidatePayload =
    candidates.map(
      (candidate) => ({
        id:
          getMaterialId(
            candidate
          ),

        company:
          getCompany(
            candidate
          ),

        material_number:
          getMaterialNumber(
            candidate
          ),

        description:
          getDescription(
            candidate
          ),

        category:
          getCategory(
            candidate
          ),

        specifications:
          getSpecifications(
            candidate
          ),

        product_family:
          getProductFamily(
            candidate
          ),

        technical_features:
          getTechnicalFeatureText(
            candidate
          ),
      })
    );

  const prompt = `
You are a technical material-equivalence reviewer.

Compare ONE source industrial material against
candidate materials from other companies.

RULES:

1. Compare technical specifications, NOT company material numbers.
2. Same product family is necessary for strong equivalence.
3. Critical differences prevent equivalence.
4. Bearing 6205 and bearing 6305 are NOT equivalent.
5. Bearing 6205-2RS and a different bearing designation are NOT automatically equivalent.
6. PN16 and PN40 are NOT equivalent where pressure rating matters.
7. SS304 and SS316 are NOT automatically equivalent.
8. 230V and 415V are NOT equivalent.
9. Different dimensions affecting interchangeability are NOT equivalent.
10. Bearing and bearing housing are different product families.
11. Do not invent missing specifications.
12. Missing information reduces confidence.
13. Gemini is ONLY a technical reviewer.
14. The deterministic technical engine remains authoritative.
15. Technically equivalent products can belong to the same BMG standard group.

SOURCE:
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

Return ONLY valid JSON:

{
  "matches": [
    {
      "candidate_id": 123,
      "technical_equivalence": true,
      "confidence": 92,
      "reason": "..."
    }
  ]
}
`;

  for (
    const model of
      GEMINI_MODELS
  ) {
    try {
      const response =
        await ai.models.generateContent(
          {
            model,
            contents: prompt,
          }
        );

      const text =
        typeof response?.text ===
        "function"
          ? response.text()
          : response?.text ||
            response
              ?.candidates?.[0]
              ?.content?.parts?.[0]
              ?.text ||
            "";

      const parsed =
        extractGeminiJson(
          text
        );

      if (
        parsed &&
        Array.isArray(
          parsed.matches
        )
      ) {
        return parsed;
      }
    } catch (error) {
      console.warn(
        `Gemini technical review failed with ${model}:`,
        error?.message ||
          error
      );
    }
  }

  return null;
}


/* =========================================================
   MATERIAL TECHNICAL MATCH
========================================================= */

async function runMaterialTechnicalMatch(
  materialId,
  matchCount =
    FINAL_CANDIDATE_COUNT,
  matchThreshold = 0.60
) {
  const numericMaterialId =
    Number(materialId);

  if (
    !Number.isFinite(
      numericMaterialId
    )
  ) {
    return {
      success: false,
      matched: false,
      message:
        "Invalid material ID.",
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  const sourceMaterial =
    await loadMaterialById(
      numericMaterialId
    );

  if (!sourceMaterial) {
    return {
      success: false,
      matched: false,
      message:
        "Material not found.",
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  const allMaterials =
    await loadAllMaterials();

  const allIds =
    allMaterials
      .map(
        getMaterialId
      )
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      );

  const attributeMap =
    await loadMaterialAttributes(
      allIds
    );

  const mappings =
    await loadBMGMappings();

  const materialBmgMap =
    buildMaterialBMGMap(
      mappings
    );

  const enrichedMaterials =
    enrichMaterials(
      allMaterials,
      attributeMap
    );

  const source =
    enrichedMaterials.find(
      (material) =>
        String(
          getMaterialId(
            material
          )
        ) ===
        String(
          numericMaterialId
        )
    );

  if (!source) {
    return {
      success: false,
      matched: false,
      message:
        "Unable to enrich source material.",
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  const sourceCompany =
    normalize(
      getCompany(
        source
      )
    );

  const candidates = [];

  for (
    const candidate of
      enrichedMaterials
  ) {
    if (
      String(
        getMaterialId(
          candidate
        )
      ) ===
      String(
        numericMaterialId
      )
    ) {
      continue;
    }

    const candidateCompany =
      normalize(
        getCompany(
          candidate
        )
      );

    /*
      Cross-company matching only.
    */

    if (
      sourceCompany &&
      candidateCompany &&
      sourceCompany ===
        candidateCompany
    ) {
      continue;
    }

    const technical =
      calculateFeatureScore(
        source,
        candidate
      );

    if (
      technical.conflict ||
      technical.score <
        MIN_DISPLAY_SIMILARITY
    ) {
      continue;
    }

    candidates.push({
      material:
        candidate,

      technical_score:
        technical.score,

      technical_reason:
        technical.reason,

      technical_conflict:
        technical.conflict,
    });
  }

  candidates.sort(
    (a, b) =>
      b.technical_score -
      a.technical_score
  );

  const requestedCount =
    Number(matchCount);

  const safeMatchCount =
    Number.isFinite(
      requestedCount
    ) &&
    requestedCount > 0
      ? Math.min(
          requestedCount,
          100
        )
      : FINAL_CANDIDATE_COUNT;

  const limitedCandidates =
    candidates.slice(
      0,
      safeMatchCount
    );

  let geminiReview = null;

  try {
    geminiReview =
      await callGeminiTechnicalReview(
        source,
        limitedCandidates.map(
          (item) =>
            item.material
        )
      );
  } catch (error) {
    console.warn(
      "Gemini review unavailable:",
      error?.message ||
        error
    );

    geminiReview = null;
  }

  const geminiMap =
    new Map();

  if (
    geminiReview &&
    Array.isArray(
      geminiReview.matches
    )
  ) {
    for (
      const review of
        geminiReview.matches
    ) {
      if (
        review?.candidate_id !==
          undefined &&
        review?.candidate_id !==
          null
      ) {
        geminiMap.set(
          String(
            review.candidate_id
          ),
          review
        );
      }
    }
  }

  const threshold =
    clamp(
      Number(
        matchThreshold
      ) || 0.60,
      0,
      1
    ) * 100;

  const results =
    limitedCandidates
      .map((item) => {
        const candidate =
          item.material;

        const candidateId =
          getMaterialId(
            candidate
          );

        const gemini =
          geminiMap.get(
            String(
              candidateId
            )
          ) || null;

        const deterministicScore =
          clamp(
            item.technical_score
          );

        /*
          Deterministic engine remains
          the primary score.
        */

        let finalScore =
          deterministicScore;

        if (
          gemini &&
          Number.isFinite(
            Number(
              gemini.confidence
            )
          )
        ) {
          finalScore =
            deterministicScore *
              0.70 +
            clamp(
              Number(
                gemini.confidence
              )
            ) *
              0.30;
        }

        const geminiApproved =
          gemini
            ? Boolean(
                gemini.technical_equivalence
              ) &&
              Number(
                gemini.confidence
              ) >=
                MIN_AI_APPROVAL_CONFIDENCE
            : true;

        const passesThreshold =
          finalScore >=
          threshold;

        const technicallyEquivalent =
          passesThreshold &&
          geminiApproved;

        const mappingsForCandidate =
          materialBmgMap.get(
            String(
              candidateId
            )
          ) || [];

        const candidateBmg =
          mappingsForCandidate.find(
            (mapping) =>
              mapping.code
          );

        return {
          id: candidateId,

          company:
            getCompany(
              candidate
            ),

          company_id:
            candidate?.company_id ??
            candidate?.companyId ??
            null,

          material_number:
            getMaterialNumber(
              candidate
            ),

          description:
            getDescription(
              candidate
            ),

          specifications:
            getSpecifications(
              candidate
            ),

          category:
            getCategory(
              candidate
            ),

          bmg_code:
            candidateBmg?.code ||
            getBMGCodeFromRow(
              candidate
            ) ||
            null,

          bmg_id:
            candidateBmg?.bmg_id ??
            getBMGIdFromRow(
              candidate
            ) ??
            null,

          ai_name:
            candidate?.ai_name ||
            candidate?.aiName ||
            null,

          bmg_status:
            candidate?.bmg_status ||
            candidate?.bmgStatus ||
            null,

          ai_confidence:
            candidate?.ai_confidence ??
            candidate?.aiConfidence ??
            null,

          match_status:
            candidate?.match_status ||
            candidate?.matchStatus ||
            null,

          verified:
            Boolean(
              candidate?.verified ??
              candidate?.is_verified ??
              false
            ),

          technical_features:
            candidate?.technical_features ||
            getTechnicalFeatureText(
              candidate
            ),

          similarity:
            Number(
              finalScore.toFixed(
                1
              )
            ),

          deterministic_similarity:
            Number(
              deterministicScore.toFixed(
                1
              )
            ),

          gemini_confidence:
            gemini
              ? Number(
                  clamp(
                    Number(
                      gemini.confidence
                    )
                  ).toFixed(
                    1
                  )
                )
              : null,

          product_family:
            getProductFamily(
              candidate
            ),

          query_family:
            getProductFamily(
              source
            ),

          technical_match:
            technicallyEquivalent,

          is_equivalent:
            technicallyEquivalent,

          gemini_approved:
            geminiApproved,

          threshold:
            Number(
              threshold.toFixed(
                1
              )
            ),

          classification:
            technicallyEquivalent
              ? "TECHNICAL_EQUIVALENT"
              : "TECHNICAL_CANDIDATE",

          technical_reason:
            gemini?.reason ||
            item.technical_reason,

          deterministic_reason:
            item.technical_reason,

          gemini_reason:
            gemini?.reason ||
            null,

          search_mode:
            "TECHNICAL_MATCH",
        };
      })
      .filter(
        (result) =>
          result.technical_match
      );

  results.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  /* =======================================================
     BMG CODE REUSE
  ======================================================= */

  let sharedBmgCode = null;

  const sourceMappingRows =
    materialBmgMap.get(
      String(
        getMaterialId(
          source
        )
      )
    ) || [];

  const sourceMappedCode =
    sourceMappingRows.find(
      (mapping) =>
        mapping.code
    )?.code || null;

  const sourceBmgCode =
    sourceMappedCode ||
    getBMGCodeFromRow(
      source
    ) ||
    null;

  if (sourceBmgCode) {
    sharedBmgCode =
      sourceBmgCode;
  }

  if (!sharedBmgCode) {
    for (
      const result of
        results
    ) {
      if (
        result.bmg_code
      ) {
        sharedBmgCode =
          result.bmg_code;

        break;
      }
    }
  }

  const finalResults =
    results.map(
      (result) => ({
        ...result,

        shared_bmg_code:
          sharedBmgCode,

        bmg_group_code:
          sharedBmgCode ||
          result.bmg_code ||
          null,
      })
    );

  return {
    success: true,

    matched:
      finalResults.length > 0,

    search_mode:
      "TECHNICAL_MATCH",

    material_id:
      numericMaterialId,

    source: {
      id:
        getMaterialId(
          source
        ),

      company:
        getCompany(
          source
        ),

      material_number:
        getMaterialNumber(
          source
        ),

      description:
        getDescription(
          source
        ),

      specifications:
        getSpecifications(
          source
        ),

      category:
        getCategory(
          source
        ),

      bmg_code:
        sourceBmgCode,

      product_family:
        getProductFamily(
          source
        ),
    },

    total_results:
      finalResults.length,

    matches:
      finalResults,

    results:
      finalResults,

    best_match:
      finalResults[0] ||
      null,

    shared_bmg_code:
      sharedBmgCode,

    data: {
      material_id:
        numericMaterialId,

      threshold:
        Number(
          threshold.toFixed(
            1
          )
        ),

      result_count:
        finalResults.length,

      gemini_used:
        Boolean(
          geminiReview
        ),

      shared_bmg_code:
        sharedBmgCode,

      results:
        finalResults,

      message:
        finalResults.length
          ? `Found ${finalResults.length} technically equivalent material(s).`
          : "No technically equivalent material found above the 60% threshold.",
    },
  };
}


/* =========================================================
   FIND EXISTING BMG FOR MATERIAL
========================================================= */

async function findExistingBMGForMaterial(
  material,
  allMaterials = []
) {
  if (!material) {
    return null;
  }

  const directCode =
    getBMGCodeFromRow(
      material
    );

  if (directCode) {
    return directCode;
  }

  const mappings =
    await loadBMGMappings();

  const materialId =
    getMaterialId(
      material
    );

  const directMapping =
    mappings.find(
      (mapping) =>
        String(
          getMappingMaterialId(
            mapping
          )
        ) ===
        String(
          materialId
        )
    );

  if (directMapping) {
    const mappingCode =
      getBMGCodeFromRow(
        directMapping
      );

    if (mappingCode) {
      return mappingCode;
    }
  }

  const sourceCompany =
    normalize(
      getCompany(
        material
      )
    );

  for (
    const candidate of
      allMaterials
  ) {
    if (
      String(
        getMaterialId(
          candidate
        )
      ) ===
      String(
        materialId
      )
    ) {
      continue;
    }

    const candidateCompany =
      normalize(
        getCompany(
          candidate
        )
      );

    if (
      sourceCompany &&
      candidateCompany &&
      sourceCompany ===
        candidateCompany
    ) {
      continue;
    }

    const technical =
      calculateFeatureScore(
        material,
        candidate
      );

    if (
      technical.conflict ||
      technical.score <
        MIN_DISPLAY_SIMILARITY
    ) {
      continue;
    }

    const candidateCode =
      getBMGCodeFromRow(
        candidate
      );

    if (candidateCode) {
      return candidateCode;
    }
  }

  return null;
}


/* =========================================================
   REQUEST BODY NORMALIZATION
========================================================= */

function getSearchValue(
  body
) {
  return clean(
    body?.search ??
      body?.searchText ??
      body?.query ??
      body?.q ??
      body?.materialName ??
      body?.description ??
      ""
  );
}

function getSpecificationValue(
  body
) {
  return clean(
    body?.specification ??
      body?.specifications ??
      body?.spec ??
      ""
  );
}

function getCategoryValue(
  body
) {
  return clean(
    body?.category ??
      body?.materialCategory ??
      ""
  );
}

function getBMGRequestCode(
  body
) {
  return clean(
    body?.bmgCode ??
      body?.bmg_code ??
      body?.bmgIdentity ??
      body?.bmg_identity ??
      body?.bmgStandardCode ??
      body?.bmg_standard_code ??
      body?.ncsCode ??
      body?.ncs_code ??
      ""
  );
}

function getRequestedMaterialId(
  body
) {
  return (
    body?.materialId ??
    body?.material_id ??
    body?.materialID ??
    null
  );
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

    const search =
      getSearchValue(
        body
      );

    const specification =
      getSpecificationValue(
        body
      );

    const category =
      getCategoryValue(
        body
      );

    const requestedBmgCode =
      getBMGRequestCode(
        body
      );

    const materialId =
      getRequestedMaterialId(
        body
      );

    const matchCount =
      Number(
        body?.matchCount ??
          body?.limit ??
          FINAL_CANDIDATE_COUNT
      );

    const matchThreshold =
      Number(
        body?.matchThreshold ??
          0.60
      );

    /*
      PRIORITY 1:
      Explicit BMG code.
    */

    if (
      requestedBmgCode
    ) {
      return NextResponse.json(
        await searchBMGGroup(
          requestedBmgCode
        )
      );
    }

    /*
      PRIORITY 2:
      Search itself is BMG code.
    */

    if (
      !materialId &&
      looksLikeBMGCode(
        search
      )
    ) {
      return NextResponse.json(
        await searchBMGGroup(
          search
        )
      );
    }

    /*
      PRIORITY 3:
      Selected material technical matching.
    */

    if (
      materialId !== null &&
      materialId !== undefined &&
      materialId !== ""
    ) {
      return NextResponse.json(
        await runMaterialTechnicalMatch(
          materialId,
          matchCount,
          matchThreshold
        )
      );
    }

    /*
      PRIORITY 4:
      Global catalog search.
    */

    if (
      search ||
      specification ||
      category
    ) {
      return NextResponse.json(
        await searchEntireCatalog({
          search,
          specification,
          category,
        })
      );
    }

    return NextResponse.json({
      success: true,
      matched: false,
      search_mode:
        "NO_SEARCH",
      query: "",
      total_results: 0,
      matches: [],
      results: [],
      best_match: null,
      message:
        "Provide a search term, specification, category, BMG code, or material ID.",
    });
  } catch (error) {
    console.error(
      "POST /api/match-materials error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        matched: false,
        search_mode:
          "ERROR",
        total_results: 0,
        matches: [],
        results: [],
        best_match: null,
        error:
          error?.message ||
          "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}


/* =========================================================
   GET
========================================================= */

export async function GET(
  request
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    const search =
      clean(
        searchParams.get(
          "search"
        ) ||
          searchParams.get(
            "searchText"
          ) ||
          searchParams.get(
            "query"
          ) ||
          searchParams.get(
            "q"
          ) ||
          searchParams.get(
            "materialName"
          ) ||
          ""
      );

    const specification =
      clean(
        searchParams.get(
          "specification"
        ) ||
          searchParams.get(
            "specifications"
          ) ||
          searchParams.get(
            "spec"
          ) ||
          ""
      );

    const category =
      clean(
        searchParams.get(
          "category"
        ) ||
          ""
      );

    const bmgCode =
      clean(
        searchParams.get(
          "bmgCode"
        ) ||
          searchParams.get(
            "bmg_code"
          ) ||
          searchParams.get(
            "bmgIdentity"
          ) ||
          searchParams.get(
            "bmg_identity"
          ) ||
          searchParams.get(
            "ncsCode"
          ) ||
          searchParams.get(
            "ncs_code"
          ) ||
          ""
      );

    const materialId =
      searchParams.get(
        "materialId"
      ) ||
      searchParams.get(
        "material_id"
      ) ||
      null;

    const matchCount =
      Number(
        searchParams.get(
          "matchCount"
        ) ||
          FINAL_CANDIDATE_COUNT
      );

    const matchThreshold =
      Number(
        searchParams.get(
          "matchThreshold"
        ) ||
          0.60
      );

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
        )
      );
    }

    if (
      !materialId &&
      looksLikeBMGCode(
        search
      )
    ) {
      return NextResponse.json(
        await searchBMGGroup(
          search
        )
      );
    }

    if (
      materialId !== null &&
      materialId !== ""
    ) {
      return NextResponse.json(
        await runMaterialTechnicalMatch(
          materialId,
          matchCount,
          matchThreshold
        )
      );
    }

    if (
      search ||
      specification ||
      category
    ) {
      return NextResponse.json(
        await searchEntireCatalog({
          search,
          specification,
          category,
        })
      );
    }

    return NextResponse.json({
      success: true,
      matched: false,
      search_mode:
        "NO_SEARCH",
      query: "",
      total_results: 0,
      matches: [],
      results: [],
      best_match: null,
      message:
        "Provide a search term, specification, category, BMG code, or material ID.",
    });
  } catch (error) {
    console.error(
      "GET /api/match-materials error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        matched: false,
        search_mode:
          "ERROR",
        total_results: 0,
        matches: [],
        results: [],
        best_match: null,
        error:
          error?.message ||
          "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}