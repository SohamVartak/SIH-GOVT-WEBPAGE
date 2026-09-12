import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

/* =========================================================
   CONFIG
========================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MATERIAL_TABLE = "materials";

const MAX_CATALOG_RESULTS = 5000;
const FINAL_CANDIDATE_COUNT = 30;

const MIN_DISPLAY_SIMILARITY = 60;
const MIN_AI_APPROVAL_CONFIDENCE = 60;

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
  if (value === null || value === undefined) {
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

function clamp(value, min = 0, max = 100) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.max(min, Math.min(max, n));
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


/* =========================================================
   GEMINI JSON
========================================================= */

function extractGeminiJson(text) {
  const value = clean(text);

  if (!value) {
    return null;
  }

  const direct = safeJsonParse(value);

  if (direct) {
    return direct;
  }

  const fenced = value
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsedFenced = safeJsonParse(fenced);

  if (parsedFenced) {
    return parsedFenced;
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (
    firstBrace >= 0 &&
    lastBrace > firstBrace
  ) {
    return safeJsonParse(
      value.slice(firstBrace, lastBrace + 1)
    );
  }

  return null;
}


/* =========================================================
   MATERIAL NORMALIZATION
========================================================= */

function normalizeMaterialRow(row) {
  if (!row) {
    return null;
  }

  const primaryId =
    row.id ??
    row.material_id ??
    row.materialId ??
    null;

  return {
    ...row,

    id: primaryId,

    material_id: primaryId,

    source_material_id:
      row.source_material_id ??
      row.sourceMaterialId ??
      primaryId,

    material_number:
      row.material_number ??
      row.materialNumber ??
      row.company_material_code ??
      null,

    description:
      row.description ??
      row.material_description ??
      row.material_name ??
      "",

    company:
      row.company ??
      row.company_name ??
      row.companyName ??
      "",

    company_id:
      row.company_id ??
      row.companyId ??
      null,

    material_name:
      row.material_name ??
      row.materialName ??
      row.description ??
      "",

    specifications:
      row.specifications ??
      row.specification ??
      "",

    category:
      row.category ??
      row.material_category ??
      "",
  };
}


/* =========================================================
   FIELD HELPERS
========================================================= */

function getCompany(row) {
  if (!row) {
    return "";
  }

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

function getCompanyId(row) {
  if (!row) {
    return null;
  }

  return (
    row.company_id ??
    row.companyId ??
    null
  );
}

function getMaterialNumber(row) {
  if (!row) {
    return "";
  }

  return clean(
    row.material_number ??
      row.materialNumber ??
      row.material_no ??
      row.materialNo ??
      row.material_code ??
      row.materialCode ??
      row.company_material_code ??
      row.companyMaterialCode ??
      row.item_code ??
      row.itemCode ??
      row.part_number ??
      row.partNumber ??
      ""
  );
}

function getDescription(row) {
  if (!row) {
    return "";
  }

  return clean(
    row.description ??
      row.material_description ??
      row.materialDescription ??
      row.short_description ??
      row.shortDescription ??
      row.material_name ??
      row.materialName ??
      row.name ??
      ""
  );
}

function getCategory(row) {
  if (!row) {
    return "";
  }

  return clean(
    row.category ??
      row.material_category ??
      row.materialCategory ??
      row.product_category ??
      row.productCategory ??
      row.product_family ??
      row.productFamily ??
      row.family ??
      ""
  );
}

function getSpecifications(row) {
  if (!row) {
    return "";
  }

  const value =
    row.specifications ??
    row.specification ??
    row.technical_specifications ??
    row.technicalSpecifications ??
    row.technicalSpecification ??
    row.spec ??
    row.raw_data ??
    "";

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return clean(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return clean(value);
  }
}


/* =========================================================
   IMPORTANT ID HELPERS
========================================================= */

/*
  company_materials DOES NOT HAVE id.

  Primary key:
      company_materials.material_id

  External/source ID:
      company_materials.source_material_id

  The frontend currently sends:
      materials.id

  Therefore we resolve:

      materials.id
          ↓
      company_materials.source_material_id
          ↓
      company_materials.material_id
*/

function getMaterialId(row) {
  if (!row) {
    return null;
  }

  return (
    row.id ??
    row.material_id ??
    row.materialId ??
    row.materialID ??
    null
  );
}

function getSourceMaterialId(row) {
  if (!row) {
    return null;
  }

  return (
    row.source_material_id ??
    row.sourceMaterialId ??
    row.id ??
    null
  );
}

function getAlternateMaterialIds(row) {
  if (!row) {
    return [];
  }

  return unique([
    row.id,
    row.material_id,
    row.materialId,
    row.materialID,
    row.source_material_id,
    row.sourceMaterialId,
  ]);
}


/* =========================================================
   RESOLVE MATERIAL ID
========================================================= */

async function resolveCompanyMaterialId(inputId) {
  const numericId = Number(inputId);

  if (!Number.isFinite(numericId)) {
    return null;
  }

  // CASE 1: Primary check in materials table
  try {
    const { data: matRows } = await supabase
      .from("materials")
      .select("id")
      .eq("id", numericId)
      .limit(1);

    if (matRows?.length) {
      return matRows[0].id;
    }
  } catch (err) {
    console.warn("materials resolver:", err?.message || err);
  }

  // CASE 2: Input is company_materials.material_id
  try {
    const { data: directRows } = await supabase
      .from("company_materials")
      .select("material_id")
      .eq("material_id", numericId)
      .limit(1);

    if (directRows?.length) {
      return directRows[0].material_id;
    }
  } catch (err) {
    console.warn("company_materials resolver:", err?.message || err);
  }

  // CASE 3: company_materials.source_material_id
  try {
    const { data: sourceRows } = await supabase
      .from("company_materials")
      .select("material_id")
      .eq("source_material_id", numericId)
      .limit(1);

    if (sourceRows?.length) {
      return sourceRows[0].material_id;
    }
  } catch (err) {
    console.warn("company_materials source resolver:", err?.message || err);
  }

  return numericId;
}


/* =========================================================
   PRODUCT FAMILY
========================================================= */

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
    family: "ball bearing",
    patterns: [
      "ball bearing",
      "deep groove bearing",
    ],
  },

  {
    family: "roller bearing",
    patterns: [
      "roller bearing",
      "taper roller bearing",
      "spherical roller bearing",
      "cylindrical roller bearing",
      "needle bearing",
    ],
  },

  {
    family: "bearing",
    patterns: [
      "bearing",
    ],
  },

  {
    family: "valve",
    patterns: [
      "ball valve",
      "gate valve",
      "globe valve",
      "check valve",
      "butterfly valve",
      "control valve",
      "safety valve",
      "relief valve",
      "needle valve",
      "valve",
    ],
  },

  {
    family: "pump",
    patterns: [
      "centrifugal pump",
      "gear pump",
      "screw pump",
      "reciprocating pump",
      "diaphragm pump",
      "submersible pump",
      "pump",
    ],
  },

  {
    family: "compressor",
    patterns: [
      "air compressor",
      "screw compressor",
      "reciprocating compressor",
      "compressor",
    ],
  },

  {
    family: "gasket",
    patterns: [
      "spiral wound gasket",
      "ring gasket",
      "metal gasket",
      "gasket",
    ],
  },

  {
    family: "hose",
    patterns: [
      "hydraulic hose",
      "rubber hose",
      "flexible hose",
      "hose",
    ],
  },

  {
    family: "filter",
    patterns: [
      "air filter",
      "oil filter",
      "fuel filter",
      "filter",
    ],
  },

  {
    family: "strainer",
    patterns: [
      "y strainer",
      "basket strainer",
      "strainer",
    ],
  },

  {
    family: "flange",
    patterns: [
      "blind flange",
      "slip on flange",
      "weld neck flange",
      "flange",
    ],
  },

  {
    family: "motor",
    patterns: [
      "electric motor",
      "induction motor",
      "motor",
    ],
  },

  {
    family: "coupling",
    patterns: [
      "flexible coupling",
      "gear coupling",
      "coupling",
    ],
  },

  {
    family: "shaft",
    patterns: [
      "drive shaft",
      "pump shaft",
      "shaft",
    ],
  },

  {
    family: "transformer",
    patterns: [
      "power transformer",
      "distribution transformer",
      "transformer",
    ],
  },

  {
    family: "cable",
    patterns: [
      "power cable",
      "control cable",
      "cable",
    ],
  },

  {
    family: "pipe",
    patterns: [
      "steel pipe",
      "seamless pipe",
      "erw pipe",
      "pipe",
    ],
  },

  {
    family: "bolt",
    patterns: [
      "hex bolt",
      "anchor bolt",
      "bolt",
    ],
  },

  {
    family: "nut",
    patterns: [
      "hex nut",
      "lock nut",
      "nut",
    ],
  },
];

function detectProductFamilyFromText(value) {
  const text = normalize(value);

  if (!text) {
    return null;
  }

  for (const item of PRODUCT_FAMILY_PATTERNS) {
    for (const pattern of item.patterns) {
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

function getProductFamily(material) {
  if (!material) {
    return null;
  }

  if (typeof material === "string") {
    return detectProductFamilyFromText(material);
  }

  const descriptionFamily =
    detectProductFamilyFromText(
      getDescription(material)
    );

  if (descriptionFamily) {
    return descriptionFamily;
  }

  const nameFamily =
    detectProductFamilyFromText(
      material.material_name ??
        material.name
    );

  if (nameFamily) {
    return nameFamily;
  }

  const explicitFamily = clean(
    material.product_family ??
      material.productFamily ??
      material.material_family ??
      material.materialFamily ??
      material.family ??
      ""
  );

  if (explicitFamily) {
    const detected =
      detectProductFamilyFromText(
        explicitFamily
      );

    if (detected) {
      return detected;
    }

    return normalize(explicitFamily);
  }

  const categoryFamily =
    detectProductFamilyFromText(
      getCategory(material)
    );

  if (categoryFamily) {
    return categoryFamily;
  }

  const technicalText = unique([
    material.technical_features,
    material.technicalFeatures,
    material.design_features,
    material.designFeatures,
    material.other_attributes,
    material.otherAttributes,
  ]).join(" ");

  return detectProductFamilyFromText(
    technicalText
  );
}

function detectQueryFamily(
  search,
  specification,
  category
) {
  return detectProductFamilyFromText(
    unique([
      search,
      category,
      specification,
    ]).join(" ")
  );
}


/* =========================================================
   FAMILY COMPATIBILITY
========================================================= */

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

  const q = normalize(queryFamily);
  const c = normalize(candidateFamily);

  if (q === c) {
    return true;
  }

  if (q === "bearing") {
    return [
      "bearing",
      "ball bearing",
      "roller bearing",
    ].includes(c);
  }

  if (q === "valve") {
    return [
      "valve",
      "ball valve",
      "gate valve",
      "globe valve",
      "check valve",
      "butterfly valve",
      "control valve",
    ].includes(c);
  }

  if (q === "pump") {
    return [
      "pump",
      "centrifugal pump",
      "gear pump",
      "screw pump",
      "reciprocating pump",
      "diaphragm pump",
      "submersible pump",
    ].includes(c);
  }

  return false;
}


/* =========================================================
   TEXT SIMILARITY
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

function tokenSimilarity(a, b) {
  const aa = new Set(tokenize(a));
  const bb = new Set(tokenize(b));

  if (!aa.size || !bb.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of aa) {
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

function substringSimilarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);

  if (!aa || !bb) {
    return 0;
  }

  if (aa === bb) {
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

function textSimilarity(a, b) {
  return clamp(
    Math.max(
      tokenSimilarity(a, b),
      substringSimilarity(a, b)
    )
  );
}


/* =========================================================
   TECHNICAL EXTRACTION
========================================================= */

function extractTechnicalValues(value) {
  const text = normalize(value);

  const empty = {
    dimensions: [],
    pressures: [],
    temperatures: [],
    voltages: [],
    speeds: [],
    materials: [],
    standards: [],
    designations: [],
    sizes: [],
    seals: [],
    ratings: [],
  };

  if (!text) {
    return empty;
  }

  const extract = (regex) =>
    unique(
      [...text.matchAll(regex)]
        .map(
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
      /\b(?:sn\d+|skf|nsk|ntn|timken|fag|ina|620\d+|630\d+|222\d+|223\d+|230\d+|231\d+|232\d+|302\d+|303\d+|320\d+|nu\d+|nj\d+)[a-z0-9.-]*\b/gi
    ),

    sizes: extract(
      /\b(?:size|dn|nb|nps)\s*[-:]?\s*\d+[a-z0-9.-]*\b/gi
    ),

    seals: extract(
      /\b(?:2rs|2z|rs|zz|rubber seal|felt seal|oil seal|seal)\b/gi
    ),

    ratings: extract(
      /\b(?:pn\s*\d+|class\s*\d+|ip\s*\d+)\b/gi
    ),
  };
}

function getTechnicalFeatureText(material) {
  if (!material) {
    return "";
  }

  return unique([
    material.technical_features,
    material.technicalFeatures,
    material.design_features,
    material.designFeatures,
    material.technical_attributes_text,
    material.technicalAttributesText,
    material.other_attributes,
    material.otherAttributes,
    getSpecifications(material),
  ]).join(" ");
}

function valuesOverlap(aValues, bValues) {
  if (
    !aValues?.length ||
    !bValues?.length
  ) {
    return false;
  }

  const b = new Set(
    bValues.map(normalize)
  );

  return aValues.some(
    (value) =>
      b.has(normalize(value))
  );
}

function hasCriticalConflict(source, candidate) {
  const sourceText =
    getTechnicalFeatureText(source);

  const candidateText =
    getTechnicalFeatureText(candidate);

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

  if (
    a.designations.length &&
    b.designations.length &&
    !valuesOverlap(
      a.designations,
      b.designations
    )
  ) {
    return true;
  }

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
    getProductFamily(source);

  const candidateFamily =
    getProductFamily(candidate);

  if (
    sourceFamily &&
    candidateFamily &&
    !searchFamilyCompatible(
      sourceFamily,
      candidateFamily
    )
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        `Different product families: ${sourceFamily} vs ${candidateFamily}.`,
    };
  }

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

  const descriptionScore =
    textSimilarity(
      getDescription(source),
      getDescription(candidate)
    );

  const categoryScore =
    textSimilarity(
      getCategory(source),
      getCategory(candidate)
    );

  const featureScore =
    textSimilarity(
      getTechnicalFeatureText(source),
      getTechnicalFeatureText(candidate)
    );

  const familyScore =
    sourceFamily &&
    candidateFamily &&
    searchFamilyCompatible(
      sourceFamily,
      candidateFamily
    )
      ? 100
      : 60;

  let score =
    descriptionScore * 0.35 +
    categoryScore * 0.10 +
    featureScore * 0.25 +
    familyScore * 0.30;

  const sourceValues =
    extractTechnicalValues(
      getTechnicalFeatureText(source)
    );

  const candidateValues =
    extractTechnicalValues(
      getTechnicalFeatureText(candidate)
    );

  const hasTechnicalData =
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

  if (!hasTechnicalData) {
    score *= 0.90;
  }

  if (
    sourceFamily &&
    candidateFamily &&
    searchFamilyCompatible(
      sourceFamily,
      candidateFamily
    )
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
  const [matResult, cmResult] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .limit(MAX_CATALOG_RESULTS),
    supabase
      .from("company_materials")
      .select("*")
      .limit(MAX_CATALOG_RESULTS),
  ]);

  if (matResult.error && cmResult.error) {
    throw new Error(
      `Unable to load materials: ${matResult.error?.message || cmResult.error?.message}`
    );
  }

  const materials = (matResult.data || []).map(normalizeMaterialRow).filter(Boolean);
  const companyMaterials = (cmResult.data || []).map(normalizeMaterialRow).filter(Boolean);

  const existingCodes = new Set(
    materials.map((m) => `${getCompany(m)}|${normalizeCode(getMaterialNumber(m))}`)
  );

  for (const cm of companyMaterials) {
    const key = `${getCompany(cm)}|${normalizeCode(getMaterialNumber(cm))}`;
    if (!existingCodes.has(key)) {
      materials.push(cm);
      existingCodes.add(key);
    }
  }

  return materials;
}

async function loadMaterialsByIds(ids) {
  const normalizedIds =
    unique(
      (ids || [])
        .map(String)
        .filter(Boolean)
    );

  if (!normalizedIds.length) {
    return [];
  }

  const numericIds =
    normalizedIds
      .map(Number)
      .filter(Number.isFinite);

  if (!numericIds.length) {
    return [];
  }

  const [matResult, cmResult] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .in("id", numericIds),
    supabase
      .from("company_materials")
      .select("*")
      .in("material_id", numericIds),
  ]);

  const rows = [
    ...(matResult.data || []),
    ...(cmResult.data || []),
  ];

  return rows
    .map(normalizeMaterialRow)
    .filter(Boolean);
}

async function loadMaterialById(materialId) {
  const numericId =
    Number(materialId);

  if (!Number.isFinite(numericId)) {
    return null;
  }

  // 1. Check materials table by id
  try {
    const { data: matData, error: matErr } =
      await supabase
        .from("materials")
        .select("*")
        .eq("id", numericId)
        .limit(1);

    if (!matErr && matData?.length) {
      return normalizeMaterialRow(matData[0]);
    }
  } catch (err) {
    console.warn("loadMaterialById materials error:", err?.message || err);
  }

  // 2. Check company_materials by material_id
  try {
    const { data: cmData, error: cmErr } =
      await supabase
        .from("company_materials")
        .select("*")
        .eq("material_id", numericId)
        .limit(1);

    if (!cmErr && cmData?.length) {
      return normalizeMaterialRow(cmData[0]);
    }
  } catch (err) {
    console.warn("loadMaterialById company_materials error:", err?.message || err);
  }

  // 3. Check company_materials by source_material_id
  try {
    const { data: srcData, error: srcErr } =
      await supabase
        .from("company_materials")
        .select("*")
        .eq("source_material_id", numericId)
        .limit(1);

    if (!srcErr && srcData?.length) {
      return normalizeMaterialRow(srcData[0]);
    }
  } catch (err) {
    console.warn("loadMaterialById source_material_id error:", err?.message || err);
  }

  return null;
}


/* =========================================================
   ATTRIBUTES
========================================================= */

async function loadMaterialAttributes(
  materialIds
) {
  const ids =
    unique(
      materialIds
        .map(String)
        .filter(Boolean)
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

  for (const table of tables) {
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
        const map = new Map();

        for (const row of data) {
          const id =
            row.material_id ??
            row.materialId ??
            row.materialID;

          if (
            id === null ||
            id === undefined
          ) {
            continue;
          }

          const key =
            String(id);

          const current =
            map.get(key) || [];

          current.push(row);

          map.set(
            key,
            current
          );
        }

        return map;
      }
    } catch (error) {
      console.warn(
        `Attribute table ${table} unavailable:`,
        error?.message || error
      );
    }
  }

  return new Map();
}


/* =========================================================
   BMG MAPPINGS
========================================================= */

async function loadBMGMappings() {
  const tables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  const rows = [];

  for (const table of tables) {
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
        rows.push(...data);
      }
    } catch (error) {
      console.warn(
        `BMG table ${table} unavailable:`,
        error?.message || error
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
  if (!attributes?.length) {
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
  const possibleIds =
    getAlternateMaterialIds(
      material
    );

  let attributes = [];

  for (const id of possibleIds) {
    const found =
      attributeMap.get(
        String(id)
      );

    if (found?.length) {
      attributes.push(...found);
    }
  }

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
        material.design_features,
        material.designFeatures,
        material.technical_attributes_text,
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

function looksLikeBMGCode(value) {
  const code =
    normalizeCode(value);

  return (
    code.startsWith("BMG") ||
    code.startsWith("NCS")
  );
}

function getBMGCodeFromRow(row) {
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

  for (const field of directFields) {
    const value =
      clean(row[field]);

    if (
      value &&
      looksLikeBMGCode(value)
    ) {
      return value;
    }
  }

  const excluded =
    new Set([
      "material_number",
      "materialNumber",
      "material_no",
      "materialNo",
      "material_code",
      "materialCode",
      "company_material_code",
      "companyMaterialCode",
      "item_code",
      "itemCode",
      "part_number",
      "partNumber",
    ]);

  for (
    const [key, value] of
    Object.entries(row)
  ) {
    if (excluded.has(key)) {
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
        looksLikeBMGCode(text)
      ) {
        return text;
      }
    }
  }

  const genericCode =
    clean(row.code);

  if (
    genericCode &&
    looksLikeBMGCode(genericCode)
  ) {
    return genericCode;
  }

  return null;
}

function getBMGIdFromRow(row) {
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

  for (const field of directFields) {
    if (
      row[field] !== null &&
      row[field] !== undefined
    ) {
      return row[field];
    }
  }

  for (
    const [key, value] of
    Object.entries(row)
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

  if (
    row.id !== null &&
    row.id !== undefined &&
    getBMGCodeFromRow(row)
  ) {
    return row.id;
  }

  return null;
}

function getMappingMaterialId(row) {
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
  const map = new Map();

  for (const mapping of mappings) {
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

function getMaterialBMGMappings(
  material,
  mappingsByMaterialId
) {
  const result = [];

  for (
    const id of
    getAlternateMaterialIds(
      material
    )
  ) {
    const found =
      mappingsByMaterialId.get(
        String(id)
      );

    if (found?.length) {
      result.push(...found);
    }
  }

  return result;
}

function getMaterialBMGCode(
  material,
  mappingsByMaterialId
) {
  const mappings =
    getMaterialBMGMappings(
      material,
      mappingsByMaterialId
    );

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

function buildSearchText(
  material
) {
  return unique([
    getMaterialNumber(material),
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
    getMaterialNumber(material),
    getDescription(material),
    getCategory(material),
    getProductFamily(material),
  ]).join(" ");
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
    materials.flatMap(
      getAlternateMaterialIds
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

  const simpleFamilySearch =
    Boolean(
      queryFamily &&
      queryTokens.length === 1 &&
      normalize(queryFamily) ===
        normalize(queryTokens[0])
    );

  const ranked = [];

  for (const material of enriched) {
    const materialFamily =
      getProductFamily(material);

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
        getDescription(material)
      );

    const candidateCategory =
      normalize(
        getCategory(material)
      );

    const materialNumber =
      normalize(
        getMaterialNumber(material)
      );

    const identityText =
      normalize(
        buildCatalogIdentityText(
          material
        )
      );

    const specificationText =
      normalize(
        getSpecifications(material)
      );

    let score = 0;

    if (
      queryFamily &&
      materialFamily &&
      searchFamilyCompatible(
        queryFamily,
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
    }

    if (category) {
      score +=
        textSimilarity(
          category,
          candidateCategory
        ) * 0.10;
    }

    if (specification) {
      score +=
        textSimilarity(
          specification,
          specificationText
        ) * 0.15;
    }

    if (
      normalizedSearch &&
      materialNumber.includes(
        normalizedSearch
      )
    ) {
      score =
        Math.max(
          score,
          90
        );
    }

    const directKeywordMatch =
      queryTokens.length > 0 &&
      queryTokens.every(
        (token) =>
          identityText.includes(token)
      );

    const exactPhraseMatch =
      Boolean(
        normalizedSearch &&
        identityText.includes(
          normalizedSearch
        )
      );

    if (simpleFamilySearch) {
      score =
        Math.max(
          score,
          75
        );
    }

    if (exactPhraseMatch) {
      score =
        Math.max(
          score,
          95
        );
    }

    if (directKeywordMatch) {
      score =
        Math.max(
          score,
          70
        );
    }

    if (
      !simpleFamilySearch &&
      !directKeywordMatch &&
      !exactPhraseMatch &&
      score <= 0
    ) {
      continue;
    }

    const materialId =
      getMaterialId(
        material
      );

    const bmgCode =
      getMaterialBMGCode(
        material,
        materialBmgMap
      );

    const mappingsForMaterial =
      getMaterialBMGMappings(
        material,
        materialBmgMap
      );

    const bmgId =
      mappingsForMaterial.find(
        (mapping) =>
          mapping.bmg_id !== null &&
          mapping.bmg_id !== undefined
      )?.bmg_id ??
      getBMGIdFromRow(
        material
      ) ??
      null;

    ranked.push({
      id: materialId,

      material_id:
        material?.material_id ??
        null,

      source_material_id:
        material?.source_material_id ??
        null,

      company:
        getCompany(material),

      company_id:
        getCompanyId(material),

      material_number:
        getMaterialNumber(material),

      description:
        getDescription(material),

      specifications:
        getSpecifications(material),

      category:
        getCategory(material),

      bmg_code:
        bmgCode,

      bmg_id:
        bmgId,

      ai_name:
        material?.ai_name ??
        material?.aiName ??
        null,

      bmg_status:
        material?.bmg_status ??
        material?.bmgStatus ??
        null,

      ai_confidence:
        material?.ai_confidence ??
        material?.aiConfidence ??
        null,

      match_status:
        material?.match_status ??
        material?.matchStatus ??
        null,

      verified:
        Boolean(
          material?.verified ??
          material?.is_verified ??
          false
        ),

      technical_features:
        getTechnicalFeatureText(
          material
        ),

      similarity:
        Number(
          clamp(score).toFixed(1)
        ),

      deterministic_similarity:
        Number(
          clamp(score).toFixed(1)
        ),

      gemini_confidence: null,

      product_family:
        materialFamily,

      query_family:
        queryFamily,

      technical_match: true,

      is_equivalent: false,

      gemini_approved: true,

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

      gemini_reason: null,

      search_mode:
        "CATALOG_SEARCH",

      catalog_match: true,

      displayable: true,

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

  const seen = new Set();

  const finalResults =
    ranked.filter(
      (result) => {
        const key =
          String(result.id);

        if (
          key === "null" ||
          key === "undefined"
        ) {
          return false;
        }

        if (seen.has(key)) {
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

    query: search,

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
      query: search,

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

  if (!normalizedRequestedCode) {
    return {
      success: false,
      matched: false,
      search_mode:
        "BMG_GROUP_SEARCH",
      query: requestedCode,
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

  for (const table of bmgTables) {
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
        for (const row of data) {
          const code =
            getBMGCodeFromRow(
              row
            );

          if (
            code &&
            normalizeCode(code) ===
              normalizedRequestedCode
          ) {
            bmgRecords.push(row);
          }
        }
      }
    } catch (error) {
      console.warn(
        `BMG table ${table} unavailable:`,
        error?.message || error
      );
    }
  }

  const bmgIds =
    unique(
      bmgRecords
        .map(getBMGIdFromRow)
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )
        .map(String)
    );

  const mappingTables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
    "bmg_materials",
  ];

  const mappingRows = [];

  for (const table of mappingTables) {
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
        for (const row of data) {
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
              normalizeCode(code) ===
                normalizedRequestedCode
            ) ||
            (
              rowBmgId !== null &&
              rowBmgId !== undefined &&
              bmgIds.includes(
                String(rowBmgId)
              )
            )
          ) {
            mappingRows.push(row);
          }
        }
      }
    } catch (error) {
      console.warn(
        `Mapping table ${table} unavailable:`,
        error?.message || error
      );
    }
  }

  const materialIds =
    unique([
      ...bmgRecords
        .map(
          getMappingMaterialId
        ),

      ...mappingRows
        .map(
          getMappingMaterialId
        ),
    ]);

  let materials =
    await loadMaterialsByIds(
      materialIds
    );

  const allMaterials =
    await loadAllMaterials();

  for (const material of allMaterials) {
    const directCode =
      getBMGCodeFromRow(
        material
      );

    const directBmgId =
      getBMGIdFromRow(
        material
      );

    if (
      (
        directCode &&
        normalizeCode(
          directCode
        ) ===
          normalizedRequestedCode
      ) ||
      (
        directBmgId !== null &&
        directBmgId !== undefined &&
        bmgIds.includes(
          String(directBmgId)
        )
      )
    ) {
      materials.push(
        material
      );
    }
  }

  const materialMap =
    new Map();

  for (const material of materials) {
    const id =
      getMaterialId(
        material
      );

    if (
      id !== null &&
      id !== undefined
    ) {
      materialMap.set(
        String(id),
        material
      );
    }
  }

  materials =
    [
      ...materialMap.values()
    ];

  const ids =
    materials.flatMap(
      getAlternateMaterialIds
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
        const materialIds =
          getAlternateMaterialIds(
            material
          );

        const mapping =
          mappingRows.find(
            (row) => {
              const mappingId =
                getMappingMaterialId(
                  row
                );

              return (
                mappingId !== null &&
                materialIds
                  .map(String)
                  .includes(
                    String(mappingId)
                  )
              );
            }
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

              return (
                id !== null &&
                id !== undefined &&
                mappingId !== null &&
                mappingId !== undefined &&
                String(id) ===
                  String(mappingId)
              );
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
          id:
            getMaterialId(
              material
            ),

          material_id:
            material?.material_id ??
            null,

          source_material_id:
            material?.source_material_id ??
            null,

          company:
            getCompany(material),

          company_id:
            getCompanyId(material),

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
            material?.ai_name ??
            material?.aiName ??
            null,

          bmg_status:
            material?.bmg_status ??
            material?.bmgStatus ??
            bmgRecord?.status ??
            null,

          ai_confidence:
            material?.ai_confidence ??
            material?.aiConfidence ??
            null,

          match_status:
            material?.match_status ??
            material?.matchStatus ??
            null,

          verified:
            Boolean(
              material?.verified ??
              material?.is_verified ??
              false
            ),

          technical_features:
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

  const seen = new Set();

  const finalResults =
    results.filter(
      (result) => {
        const key =
          String(result.id);

        if (
          key === "null" ||
          key === "undefined"
        ) {
          return false;
        }

        if (seen.has(key)) {
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
      getMaterialId(source),

    material_id:
      source?.material_id ??
      null,

    source_material_id:
      source?.source_material_id ??
      null,

    company:
      getCompany(source),

    material_number:
      getMaterialNumber(source),

    description:
      getDescription(source),

    category:
      getCategory(source),

    specifications:
      getSpecifications(source),

    product_family:
      getProductFamily(source),

    technical_features:
      getTechnicalFeatureText(source),
  };

  const candidatePayload =
    candidates.map(
      (candidate) => ({
        id:
          getMaterialId(
            candidate
          ),

        material_id:
          candidate?.material_id ??
          null,

        company:
          getCompany(candidate),

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
candidate materials from OTHER companies.

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

  for (const model of GEMINI_MODELS) {
    try {
      const response =
        await ai.models.generateContent({
          model,
          contents: prompt,
        });

      const text =
        typeof response?.text ===
        "function"
          ? response.text()
          : response?.text ||
            response?.candidates?.[0]
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
        `Gemini review failed with ${model}:`,
        error?.message || error
      );
    }
  }

  return null;
}


/* =========================================================
   TECHNICAL MATCH
========================================================= */

async function runMaterialTechnicalMatch(
  materialId,
  matchCount = FINAL_CANDIDATE_COUNT,
  matchThreshold = 0.60
) {
  const requestedId =
    Number(materialId);

  if (
    !Number.isFinite(
      requestedId
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

  /*
    ========================================================
    CRITICAL FIX

    Resolve materials.id -> company_materials.material_id
    BEFORE doing anything else.
    ========================================================
  */

  const resolvedMaterialId =
    await resolveCompanyMaterialId(
      requestedId
    );

  console.log(
    `AI matcher ID resolution: requested=${requestedId}, resolved company_materials.material_id=${resolvedMaterialId}`
  );

  if (
    resolvedMaterialId === null ||
    resolvedMaterialId === undefined
  ) {
    return {
      success: false,
      matched: false,
      message:
        `Material not found. Could not resolve material ID ${requestedId} to company_materials.material_id.`,
      requested_material_id:
        requestedId,
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  /*
    ALWAYS use the resolved company_materials.material_id
    from this point onward.
  */

  const sourceMaterial =
    await loadMaterialById(
      resolvedMaterialId
    );

  if (!sourceMaterial) {
    return {
      success: false,
      matched: false,
      message:
        `Material not found in company_materials.material_id=${resolvedMaterialId}.`,
      requested_material_id:
        requestedId,
      resolved_material_id:
        resolvedMaterialId,
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  console.log(
    `AI matcher source loaded: company_materials.material_id=${getMaterialId(sourceMaterial)}`
  );

  const allMaterials =
    await loadAllMaterials();

  const allIds =
    allMaterials.flatMap(
      getAlternateMaterialIds
    );

  /*
    Make absolutely sure the source ID is included
    for attribute lookup.
  */

  allIds.push(
    String(resolvedMaterialId)
  );

  const attributeMap =
    await loadMaterialAttributes(
      unique(allIds)
    );

  const mappings =
    await loadBMGMappings();

  const materialBmgMap =
    buildMaterialBMGMap(
      mappings
    );

  const enriched =
    enrichMaterials(
      allMaterials,
      attributeMap
    );

  /*
    IMPORTANT:
    Find source by PRIMARY company_materials.material_id,
    not by the original materials.id.
  */

  let source =
    enriched.find(
      (material) =>
        String(
          getMaterialId(material)
        ) ===
        String(
          resolvedMaterialId
        )
    );

  /*
    Fallback through source_material_id.
  */

  if (!source) {
    source =
      enriched.find(
        (material) =>
          String(
            getSourceMaterialId(
              material
            )
          ) ===
          String(
            requestedId
          )
      );
  }

  /*
    Final fallback: the directly loaded source row.
  */

  if (!source) {
    source =
      enrichMaterial(
        sourceMaterial,
        attributeMap
      );
  }

  if (!source) {
    return {
      success: false,
      matched: false,
      message:
        "Unable to enrich source material.",
      requested_material_id:
        requestedId,
      resolved_material_id:
        resolvedMaterialId,
      matches: [],
      results: [],
      total_results: 0,
      best_match: null,
    };
  }

  const sourceCompany =
    normalize(
      getCompany(source)
    );

  const candidates = [];

  for (const candidate of enriched) {
    /*
      NEVER compare the source against itself.
      Compare using company_materials.material_id.
    */

    if (
      String(
        getMaterialId(candidate)
      ) ===
      String(
        resolvedMaterialId
      )
    ) {
      continue;
    }

    /*
      Also exclude if candidate's source_material_id
      is the original materials.id.
    */

    if (
      String(
        getSourceMaterialId(
          candidate
        )
      ) ===
      String(
        requestedId
      )
    ) {
      continue;
    }

    const candidateCompany =
      normalize(
        getCompany(candidate)
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
      error?.message || error
    );
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
      Number(matchThreshold) ||
        0.60,
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
            String(candidateId)
          ) || null;

        const deterministicScore =
          clamp(
            item.technical_score
          );

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

        const candidateMappings =
          getMaterialBMGMappings(
            candidate,
            materialBmgMap
          );

        const candidateBmg =
          candidateMappings.find(
            (mapping) =>
              mapping.code
          );

        return {
          id:
            candidateId,

          material_id:
            candidate?.material_id ??
            null,

          source_material_id:
            candidate?.source_material_id ??
            null,

          company:
            getCompany(candidate),

          company_id:
            getCompanyId(
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
            candidate?.ai_name ??
            candidate?.aiName ??
            null,

          bmg_status:
            candidate?.bmg_status ??
            candidate?.bmgStatus ??
            null,

          ai_confidence:
            candidate?.ai_confidence ??
            candidate?.aiConfidence ??
            null,

          match_status:
            candidate?.match_status ??
            candidate?.matchStatus ??
            null,

          verified:
            Boolean(
              candidate?.verified ??
              candidate?.is_verified ??
              false
            ),

          technical_features:
            getTechnicalFeatureText(
              candidate
            ),

          similarity:
            Number(
              finalScore.toFixed(1)
            ),

          deterministic_similarity:
            Number(
              deterministicScore.toFixed(1)
            ),

          gemini_confidence:
            gemini
              ? Number(
                  clamp(
                    Number(
                      gemini.confidence
                    )
                  ).toFixed(1)
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
              threshold.toFixed(1)
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

  const sourceMappings =
    getMaterialBMGMappings(
      source,
      materialBmgMap
    );

  let sharedBmgCode =
    sourceMappings.find(
      (mapping) =>
        mapping.code
    )?.code ||
    getBMGCodeFromRow(
      source
    ) ||
    null;

  if (!sharedBmgCode) {
    for (const result of results) {
      if (result.bmg_code) {
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

    /*
      Keep both IDs visible so frontend/debugging
      knows exactly what happened.
    */

    requested_material_id:
      requestedId,

    material_id:
      resolvedMaterialId,

    source_material_id:
      source?.source_material_id ??
      requestedId,

    source: {
      id:
        getMaterialId(source),

      material_id:
        source?.material_id ??
        null,

      source_material_id:
        source?.source_material_id ??
        requestedId,

      company:
        getCompany(source),

      company_id:
        getCompanyId(source),

      material_number:
        getMaterialNumber(source),

      description:
        getDescription(source),

      specifications:
        getSpecifications(source),

      category:
        getCategory(source),

      bmg_code:
        sharedBmgCode,

      product_family:
        getProductFamily(source),
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
      requested_material_id:
        requestedId,

      material_id:
        resolvedMaterialId,

      threshold:
        Number(
          threshold.toFixed(1)
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
   FIND EXISTING BMG
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

  const materialIds =
    getAlternateMaterialIds(
      material
    ).map(String);

  const directMapping =
    mappings.find(
      (mapping) => {
        const id =
          getMappingMaterialId(
            mapping
          );

        return (
          id !== null &&
          materialIds.includes(
            String(id)
          )
        );
      }
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
      getCompany(material)
    );

  for (
    const candidate of
    allMaterials
  ) {
    if (
      getAlternateMaterialIds(
        candidate
      )
        .map(String)
        .some(
          (id) =>
            materialIds.includes(id)
        )
    ) {
      continue;
    }

    const candidateCompany =
      normalize(
        getCompany(candidate)
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
   REQUEST NORMALIZATION
========================================================= */

function getSearchValue(body) {
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

function getSpecificationValue(body) {
  return clean(
    body?.specification ??
      body?.specifications ??
      body?.spec ??
      ""
  );
}

function getCategoryValue(body) {
  return clean(
    body?.category ??
      body?.materialCategory ??
      ""
  );
}

function getBMGRequestCode(body) {
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

function getRequestedMaterialId(body) {
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
      getSearchValue(body);

    const specification =
      getSpecificationValue(
        body
      );

    const category =
      getCategoryValue(body);

    const requestedBmgCode =
      getBMGRequestCode(body);

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
      1. Explicit BMG code.
    */

    if (requestedBmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          requestedBmgCode
        )
      );
    }

    /*
      2. Search itself is a BMG code.
    */

    if (
      !materialId &&
      looksLikeBMGCode(search)
    ) {
      return NextResponse.json(
        await searchBMGGroup(
          search
        )
      );
    }

    /*
      3. Technical matching.

      IMPORTANT:
      runMaterialTechnicalMatch()
      now resolves materials.id -> company_materials.material_id.
    */

    if (
      materialId !== null &&
      materialId !== undefined &&
      materialId !== ""
    ) {
      console.log(
        `POST /api/match-materials received materialId=${materialId}`
      );

      return NextResponse.json(
        await runMaterialTechnicalMatch(
          materialId,
          matchCount,
          matchThreshold
        )
      );
    }

    /*
      4. Normal catalog search.
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
    const { searchParams } =
      new URL(
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
      looksLikeBMGCode(search)
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