import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

/* =========================================================
   CONFIGURATION
========================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const EMBEDDING_MODEL = "gemini-embedding-2";
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
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[/\\|,_;:()[\]{}]/g, " ")
    .replace(/[^a-z0-9.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_/\\]/g, "-");
}

function numberValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const match = String(value).match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const n = Number(match[0]);

  return Number.isFinite(n) ? n : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeJsonParse(value) {
  if (isObject(value) || Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* =========================================================
   COMPANY / MATERIAL HELPERS
========================================================= */

function getCompany(material) {
  return clean(
    material?.company ||
      material?.company_name ||
      material?.cpse ||
      material?.owner ||
      material?.organization ||
      material?.companyCode ||
      ""
  );
}

function getMaterialNumber(material) {
  return clean(
    material?.material_number ||
      material?.materialNumber ||
      material?.material_code ||
      material?.materialCode ||
      material?.code ||
      material?.item_code ||
      ""
  );
}

function getDescription(material) {
  return clean(
    material?.description ||
      material?.material_description ||
      material?.short_description ||
      material?.name ||
      material?.material_name ||
      ""
  );
}

function getCategory(material) {
  return clean(
    material?.category ||
      material?.material_category ||
      material?.product_category ||
      material?.family ||
      material?.product_family ||
      ""
  );
}

function getSpecifications(material) {
  return clean(
    material?.specifications ||
      material?.specification ||
      material?.technical_specifications ||
      material?.technicalSpecification ||
      material?.spec ||
      ""
  );
}

function getMaterialId(material) {
  return (
    material?.id ??
    material?.material_id ??
    material?.materialId ??
    material?.materialID ??
    null
  );
}

/* =========================================================
   PRODUCT FAMILY DETECTION
========================================================= */

function getProductFamily(materialOrText) {
  if (typeof materialOrText === "string") {
    return detectProductFamilyFromText(materialOrText);
  }

  const material = materialOrText || {};

  const explicitFamily = normalize(
    material?.product_family ||
      material?.productFamily ||
      material?.material_family ||
      material?.materialFamily ||
      material?.family ||
      ""
  );

  if (explicitFamily) {
    const detected =
      detectProductFamilyFromText(explicitFamily);

    if (detected !== "generic") {
      return detected;
    }

    if (explicitFamily.length <= 40) {
      return explicitFamily;
    }
  }

  const category = normalize(getCategory(material));

  if (category) {
    const detected =
      detectProductFamilyFromText(category);

    if (detected !== "generic") {
      return detected;
    }
  }

  const description = normalize(getDescription(material));

  if (description) {
    const detected =
      detectProductFamilyFromText(description);

    if (detected !== "generic") {
      return detected;
    }
  }

  const designFeatures = normalize(
    material?.design_features ||
      material?.designFeatures ||
      material?.technical_features_short ||
      material?.technicalFeatures ||
      ""
  );

  if (designFeatures) {
    const detected =
      detectProductFamilyFromText(designFeatures);

    if (detected !== "generic") {
      return detected;
    }
  }

  const otherAttributes = normalize(
    material?.other_attributes ||
      material?.otherAttributes ||
      ""
  );

  if (otherAttributes) {
    const detected =
      detectProductFamilyFromText(otherAttributes);

    if (detected !== "generic") {
      return detected;
    }
  }

  return "generic";
}

function detectProductFamilyFromText(value) {
  const text = normalize(value);

  if (!text) {
    return "generic";
  }

  const families = [
    {
      name: "bearing housing",
      patterns: [
        /\bbearing\s+housing\b/,
        /\bpillow\s*block\b/,
        /\bpillow\s*\/?\s*bearing\s+housing\b/,
        /\bsn\d{3,5}\b/,
      ],
    },

    {
      name: "bearing",
      patterns: [
        /\bbearing\b/,
        /\bball\s+bearing\b/,
        /\broller\s+bearing\b/,
        /\btapered\s+roller\b/,
        /\bcylindrical\s+roller\b/,
        /\bneedle\s+bearing\b/,
        /\bthrust\s+bearing\b/,
      ],
    },

    {
      name: "steam trap",
      patterns: [
        /\bsteam\s+trap\b/,
        /\btrap\b.*\bsteam\b/,
        /\bthermodynamic\s+trap\b/,
        /\bfloat\s+trap\b/,
        /\binverted\s+bucket\b/,
      ],
    },

    {
      name: "valve",
      patterns: [
        /\bvalve\b/,
        /\bgate\s+valve\b/,
        /\bglobe\s+valve\b/,
        /\bball\s+valve\b/,
        /\bbutterfly\s+valve\b/,
        /\bcheck\s+valve\b/,
        /\bneedle\s+valve\b/,
        /\bcontrol\s+valve\b/,
      ],
    },

    {
      name: "pump",
      patterns: [
        /\bpump\b/,
        /\bcentrifugal\s+pump\b/,
        /\breciprocating\s+pump\b/,
        /\bgear\s+pump\b/,
        /\bsubmersible\s+pump\b/,
      ],
    },

    {
      name: "compressor",
      patterns: [
        /\bcompressor\b/,
        /\bscrew\s+compressor\b/,
        /\breciprocating\s+compressor\b/,
        /\bcentrifugal\s+compressor\b/,
      ],
    },

    {
      name: "mechanical seal",
      patterns: [
        /\bmechanical\s+seal\b/,
        /\bpump\s+seal\b/,
        /\bmechanical\s+shaft\s+seal\b/,
      ],
    },

    {
      name: "o-ring",
      patterns: [
        /\bo[\s-]?ring\b/,
        /\bo\s+ring\b/,
      ],
    },

    {
      name: "gasket",
      patterns: [
        /\bgasket\b/,
        /\bspiral\s+wound\s+gasket\b/,
        /\bgraphite\s+gasket\b/,
        /\bptfe\s+gasket\b/,
      ],
    },

    {
      name: "hose",
      patterns: [
        /\bhose\b/,
        /\brubber\s+hose\b/,
        /\bhydraulic\s+hose\b/,
        /\bflexible\s+hose\b/,
      ],
    },

    {
      name: "filter",
      patterns: [
        /\bfilter\b/,
        /\bfilter\s+element\b/,
        /\bcartridge\s+filter\b/,
      ],
    },

    {
      name: "strainer",
      patterns: [
        /\bstrainer\b/,
        /\by[\s-]?strainer\b/,
        /\bbasket\s+strainer\b/,
        /\bduplex\s+strainer\b/,
      ],
    },

    {
      name: "flange",
      patterns: [
        /\bflange\b/,
        /\bweld\s+neck\s+flange\b/,
        /\bslip\s+on\s+flange\b/,
        /\bblind\s+flange\b/,
      ],
    },

    {
      name: "motor",
      patterns: [
        /\bmotor\b/,
        /\binduction\s+motor\b/,
        /\belectric\s+motor\b/,
        /\btefc\b/,
      ],
    },

    {
      name: "coupling",
      patterns: [
        /\bcoupling\b/,
        /\bflexible\s+coupling\b/,
        /\bgear\s+coupling\b/,
        /\bgrid\s+coupling\b/,
      ],
    },

    {
      name: "shaft",
      patterns: [
        /\bshaft\b/,
        /\bpump\s+shaft\b/,
        /\bdrive\s+shaft\b/,
      ],
    },

    {
      name: "transformer",
      patterns: [
        /\btransformer\b/,
        /\bpower\s+transformer\b/,
        /\bdistribution\s+transformer\b/,
      ],
    },

    {
      name: "cable",
      patterns: [
        /\bcable\b/,
        /\bpower\s+cable\b/,
        /\bcontrol\s+cable\b/,
        /\binstrumentation\s+cable\b/,
      ],
    },

    {
      name: "pipe",
      patterns: [
        /\bpipe\b/,
        /\bpiping\b/,
        /\bseamless\s+pipe\b/,
        /\bwelded\s+pipe\b/,
      ],
    },

    {
      name: "bolt",
      patterns: [
        /\bbolt\b/,
        /\bhex\s+bolt\b/,
        /\bstud\s+bolt\b/,
      ],
    },

    {
      name: "nut",
      patterns: [
        /\bnut\b/,
        /\bhex\s+nut\b/,
      ],
    },
  ];

  for (const family of families) {
    for (const pattern of family.patterns) {
      if (pattern.test(text)) {
        return family.name;
      }
    }
  }

  return "generic";
}

/* =========================================================
   QUERY FAMILY
========================================================= */

function detectQueryFamily(
  search,
  specification,
  category
) {
  const combined = [
    clean(search),
    clean(specification),
    clean(category),
  ]
    .filter(Boolean)
    .join(" ");

  return detectProductFamilyFromText(combined);
}

/* =========================================================
   TOKEN / TEXT SIMILARITY
========================================================= */

function tokenize(value) {
  return unique(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  );
}

function tokenSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);

  if (!ta.length || !tb.length) {
    return 0;
  }

  const setA = new Set(ta);
  const setB = new Set(tb);

  let intersection = 0;

  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([
    ...setA,
    ...setB,
  ]).size;

  if (!union) {
    return 0;
  }

  const jaccard = intersection / union;

  const containment =
    intersection /
    Math.max(
      1,
      Math.min(
        setA.size,
        setB.size
      )
    );

  return clamp(
    jaccard * 55 +
      containment * 45,
    0,
    100
  );
}

function substringSimilarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);

  if (!x || !y) {
    return 0;
  }

  if (x === y) {
    return 100;
  }

  if (x.includes(y) || y.includes(x)) {
    const shorter = Math.min(
      x.length,
      y.length
    );

    const longer = Math.max(
      x.length,
      y.length
    );

    return clamp(
      75 +
        (shorter /
          Math.max(1, longer)) *
          25,
      0,
      100
    );
  }

  return 0;
}

function textSimilarity(a, b) {
  return Math.max(
    tokenSimilarity(a, b),
    substringSimilarity(a, b)
  );
}

/* =========================================================
   NUMBER / TECHNICAL VALUE SIMILARITY
========================================================= */

function numberSimilarity(a, b) {
  const na = numberValue(a);
  const nb = numberValue(b);

  if (na === null || nb === null) {
    return 0;
  }

  if (na === nb) {
    return 100;
  }

  const difference = Math.abs(
    na - nb
  );

  const denominator = Math.max(
    Math.abs(na),
    Math.abs(nb),
    1
  );

  const relativeDifference =
    difference / denominator;

  return clamp(
    100 -
      relativeDifference * 100,
    0,
    100
  );
}

/* =========================================================
   CRITICAL ATTRIBUTE EXTRACTION
========================================================= */

function extractTechnicalValues(text) {
  const source = clean(text);

  const result = {
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

  if (!source) {
    return result;
  }

  const dimensionPatterns = [
    /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|in)\b/gi,

    /\b\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?(?:\s*[xX×]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm|m|inch|in)?\b/gi,
  ];

  for (const pattern of dimensionPatterns) {
    result.dimensions.push(
      ...(source.match(pattern) || [])
    );
  }

  result.pressures.push(
    ...(source.match(
      /\b(?:pn|class)\s*[-:]?\s*\d+(?:\.\d+)?\b/gi
    ) || [])
  );

  result.temperatures.push(
    ...(source.match(
      /\b-?\d+(?:\.\d+)?\s*(?:°?\s*c|°?\s*f|deg\s*c|deg\s*f)\b/gi
    ) || [])
  );

  result.voltages.push(
    ...(source.match(
      /\b\d+(?:\.\d+)?\s*(?:v|kv)\b/gi
    ) || [])
  );

  result.speeds.push(
    ...(source.match(
      /\b\d+(?:\.\d+)?\s*(?:rpm|r\/min)\b/gi
    ) || [])
  );

  result.materials.push(
    ...(source.match(
      /\b(?:ss\s*)?(?:304|316|316l|321|347|410|420|430)\b/gi
    ) || [])
  );

  const materialWords = [
    "stainless steel",
    "carbon steel",
    "cast iron",
    "ductile iron",
    "forged steel",
    "bronze",
    "brass",
    "ptfe",
    "teflon",
    "graphite",
    "nitrile",
    "nbr",
    "epdm",
    "viton",
    "fk m",
    "ceramic",
    "rubber",
  ];

  for (const material of materialWords) {
    if (
      normalize(source).includes(
        normalize(material)
      )
    ) {
      result.materials.push(
        material
      );
    }
  }

  result.standards.push(
    ...(source.match(
      /\b(?:api|asme|ansi|astm|iso|iec|is|din|en|bs)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || [])
  );

  result.designations.push(
    ...(source.match(
      /\b(?:sn|dn|pn|model|type|size)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || [])
  );

  result.sizes.push(
    ...(source.match(
      /\b(?:dn|size)\s*[-:]?\s*\d+(?:\.\d+)?\b/gi
    ) || [])
  );

  result.quantities.push(
    ...(source.match(
      /\b(?:qty|quantity)\s*[:\-]?\s*\d+(?:\.\d+)?\b/gi
    ) || [])
  );

  result.seals.push(
    ...(source.match(
      /\b\d+\s+(?:felt|oil|mechanical|lip|rubber)\s+seals?\b/gi
    ) || [])
  );

  result.ratings.push(
    ...(source.match(
      /\b(?:class|pn|rating)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || [])
  );

  for (const key of Object.keys(result)) {
    result[key] = unique(
      result[key].map(clean)
    );
  }

  return result;
}

/* =========================================================
   TECHNICAL FEATURE TEXT
========================================================= */

function getTechnicalFeatureText(material) {
  const parts = [];

  const fields = [
    material?.category,
    material?.product_family,
    material?.material_family,
    material?.description,
    material?.short_description,
    material?.design_features,
    material?.designFeatures,
    material?.other_attributes,
    material?.otherAttributes,
    material?.specifications,
    material?.specification,
    material?.technical_specifications,
    material?.technicalSpecification,
    material?.technical_attributes_text,
  ];

  for (const value of fields) {
    if (value) {
      parts.push(clean(value));
    }
  }

  return unique(parts).join(" ");
}

/* =========================================================
   CRITICAL CONFLICT DETECTION
========================================================= */

function hasCriticalConflict(
  source,
  candidate
) {
  const sourceText =
    getTechnicalFeatureText(source);

  const candidateText =
    getTechnicalFeatureText(candidate);

  const sourceValues =
    extractTechnicalValues(
      sourceText
    );

  const candidateValues =
    extractTechnicalValues(
      candidateText
    );

  const sourceDesignations =
    sourceValues.designations
      .map(normalize)
      .filter(Boolean);

  const candidateDesignations =
    candidateValues.designations
      .map(normalize)
      .filter(Boolean);

  if (
    sourceDesignations.length &&
    candidateDesignations.length
  ) {
    const sourceDesignationNumbers =
      sourceDesignations
        .map(
          (x) =>
            x
              .match(
                /\d+(?:\.\d+)?/g
              )
              ?.join("-")
        )
        .filter(Boolean);

    const candidateDesignationNumbers =
      candidateDesignations
        .map(
          (x) =>
            x
              .match(
                /\d+(?:\.\d+)?/g
              )
              ?.join("-")
        )
        .filter(Boolean);

    if (
      sourceDesignationNumbers.length &&
      candidateDesignationNumbers.length
    ) {
      const overlap =
        sourceDesignationNumbers.some(
          (value) =>
            candidateDesignationNumbers.includes(
              value
            )
        );

      if (!overlap) {
        const sourceFamily =
          getProductFamily(source);

        const candidateFamily =
          getProductFamily(candidate);

        if (
          sourceFamily ===
            candidateFamily &&
          (
            sourceFamily === "bearing" ||
            sourceFamily ===
              "bearing housing" ||
            sourceFamily === "valve" ||
            sourceFamily === "flange"
          )
        ) {
          return {
            conflict: true,
            reason:
              "Different technical designation/size detected.",
          };
        }
      }
    }
  }

  const sourcePressure =
    sourceValues.pressures.map(
      normalize
    );

  const candidatePressure =
    candidateValues.pressures.map(
      normalize
    );

  if (
    sourcePressure.length &&
    candidatePressure.length &&
    !sourcePressure.some(
      (value) =>
        candidatePressure.includes(
          value
        )
    )
  ) {
    return {
      conflict: true,
      reason:
        "Different pressure class/rating detected.",
    };
  }

  const sourceVoltage =
    sourceValues.voltages.map(
      normalize
    );

  const candidateVoltage =
    candidateValues.voltages.map(
      normalize
    );

  if (
    sourceVoltage.length &&
    candidateVoltage.length &&
    !sourceVoltage.some(
      (value) =>
        candidateVoltage.includes(
          value
        )
    )
  ) {
    return {
      conflict: true,
      reason:
        "Different electrical voltage detected.",
    };
  }

  const sourceMaterials =
    sourceValues.materials.map(
      normalize
    );

  const candidateMaterials =
    candidateValues.materials.map(
      normalize
    );

  if (
    sourceMaterials.length &&
    candidateMaterials.length
  ) {
    const materialOverlap =
      sourceMaterials.some(
        (value) =>
          candidateMaterials.some(
            (candidateValue) =>
              candidateValue === value ||
              candidateValue.includes(
                value
              ) ||
              value.includes(
                candidateValue
              )
          )
      );

    if (!materialOverlap) {
      return {
        conflict: true,
        reason:
          "Different explicit material detected.",
      };
    }
  }

  return {
    conflict: false,
    reason: "",
  };
}

/* =========================================================
   TECHNICAL FEATURE SCORE
========================================================= */

function calculateFeatureScore(
  source,
  candidate
) {
  const sourceFamily =
    getProductFamily(source);

  const candidateFamily =
    getProductFamily(candidate);

  if (
    sourceFamily !== "generic" &&
    candidateFamily !== "generic" &&
    sourceFamily !== candidateFamily
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        `Different product families: ${sourceFamily} vs ${candidateFamily}`,
    };
  }

  const conflictResult =
    hasCriticalConflict(
      source,
      candidate
    );

  if (conflictResult.conflict) {
    return {
      score: 0,
      conflict: true,
      reason:
        conflictResult.reason,
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

  const sourceFeatures =
    getTechnicalFeatureText(source);

  const candidateFeatures =
    getTechnicalFeatureText(candidate);

  const featureScore =
    textSimilarity(
      sourceFeatures,
      candidateFeatures
    );

  let familyScore = 0;

  if (
    sourceFamily !== "generic" &&
    candidateFamily !== "generic"
  ) {
    familyScore =
      sourceFamily === candidateFamily
        ? 100
        : 0;
  }

  const sourceValues =
    extractTechnicalValues(
      sourceFeatures
    );

  const candidateValues =
    extractTechnicalValues(
      candidateFeatures
    );

  let criticalScore = 0;
  let criticalComparisons = 0;

  const criticalFields = [
    "dimensions",
    "pressures",
    "temperatures",
    "voltages",
    "speeds",
    "materials",
    "standards",
    "designations",
    "sizes",
    "ratings",
  ];

  for (const field of criticalFields) {
    const a =
      sourceValues[field] || [];

    const b =
      candidateValues[field] || [];

    if (!a.length || !b.length) {
      continue;
    }

    criticalComparisons++;

    let best = 0;

    for (const av of a) {
      for (const bv of b) {
        best = Math.max(
          best,
          textSimilarity(av, bv),
          numberSimilarity(av, bv)
        );
      }
    }

    criticalScore += best;
  }

  if (criticalComparisons > 0) {
    criticalScore =
      criticalScore /
      criticalComparisons;
  }

  let score =
    descriptionScore * 0.30 +
    categoryScore * 0.10 +
    featureScore * 0.20 +
    familyScore * 0.25;

  if (criticalComparisons > 0) {
    score +=
      criticalScore * 0.15;
  } else {
    score *= 0.90;
  }

  if (
    sourceFamily !== "generic" &&
    candidateFamily === sourceFamily
  ) {
    score += 5;
  }

  score = clamp(score);

  return {
    score,
    conflict: false,
    reason:
      criticalComparisons > 0
        ? "Same technical family with compatible explicit attributes."
        : "Same technical family; some critical attributes are unspecified.",
  };
}

/* =========================================================
   DATABASE LOADERS
========================================================= */

async function loadAllMaterials() {
  const { data, error } =
    await supabase
      .from("materials")
      .select("*")
      .limit(MAX_CATALOG_RESULTS);

  if (error) {
    throw new Error(
      `Unable to load materials: ${error.message}`
    );
  }

  return data || [];
}

async function loadMaterialAttributes(
  materialIds
) {
  if (!materialIds.length) {
    return {};
  }

  const possibleTables = [
    "material_attributes",
    "material_attribute",
    "technical_attributes",
    "material_specs",
  ];

  const result = {};

  for (const table of possibleTables) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .in(
            "material_id",
            materialIds
          );

      if (
        error ||
        !data?.length
      ) {
        continue;
      }

      for (const row of data) {
        const materialId =
          row.material_id ??
          row.materialId ??
          row.materialID;

        if (
          materialId === null ||
          materialId === undefined
        ) {
          continue;
        }

        if (!result[materialId]) {
          result[materialId] = [];
        }

        result[materialId].push(row);
      }

      break;
    } catch {
      continue;
    }
  }

  return result;
}

/* =========================================================
   ATTRIBUTE ENRICHMENT
========================================================= */

function attributesToText(
  attributes
) {
  if (!attributes) {
    return "";
  }

  if (Array.isArray(attributes)) {
    return attributes
      .map((row) => {
        if (!isObject(row)) {
          return clean(row);
        }

        return Object.entries(row)
          .filter(
            ([key]) =>
              ![
                "id",
                "material_id",
                "materialId",
                "created_at",
                "updated_at",
              ].includes(key)
          )
          .map(
            ([key, value]) =>
              `${key}: ${clean(value)}`
          )
          .join(" ");
      })
      .join(" ");
  }

  if (isObject(attributes)) {
    return Object.entries(attributes)
      .map(
        ([key, value]) =>
          `${key}: ${clean(value)}`
      )
      .join(" ");
  }

  return clean(attributes);
}

function enrichMaterial(
  material,
  attributes = []
) {
  const attributeText =
    attributesToText(attributes);

  return {
    ...material,

    technical_attributes_text:
      attributeText,

    technical_features:
      [
        material?.specifications,
        material?.description,
        material?.category,
        material?.product_family,
        material?.design_features,
        material?.other_attributes,
        attributeText,
      ]
        .filter(Boolean)
        .join(" "),

    product_family:
      getProductFamily(material),
  };
}

function enrichMaterials(
  materials,
  attributeMap
) {
  return materials.map(
    (material) => {
      const id =
        getMaterialId(material);

      return enrichMaterial(
        material,
        attributeMap[id] || []
      );
    }
  );
}

/* =========================================================
   BMG MAPPING LOADING
========================================================= */

async function loadBMGMappings() {
  const mappings = [];

  const tableNames = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  for (const table of tableNames) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .limit(
            MAX_CATALOG_RESULTS
          );

      if (
        error ||
        !data?.length
      ) {
        continue;
      }

      mappings.push(
        ...data.map(
          (row) => ({
            ...row,
            _mapping_table: table,
          })
        )
      );
    } catch {
      continue;
    }
  }

  return mappings;
}

/* =========================================================
   BMG CODE EXTRACTION
========================================================= */

function getBMGCodeFromRow(row) {
  if (!row) return null;

  return (
    row.bmg_code ||
    row.bmgCode ||
    row.ncs_code ||
    row.ncsCode ||
    row.identity_code ||
    row.identityCode ||
    row.standard_code ||
    row.standardCode ||
    row.material_code ||
    row.materialCode ||
    row.code ||
    null
  );
}

function getBMGIdFromRow(row) {
  if (!row) {
    return null;
  }

  return (
    row.bmg_id ??
    row.bmgId ??
    row.ncs_id ??
    row.ncsId ??
    row.standard_id ??
    row.standardId ??
    null
  );
}

function getMappingMaterialId(row) {
  if (!row) {
    return null;
  }

  return (
    row.material_id ??
    row.materialId ??
    row.materialID ??
    row.material ??
    null
  );
}

/* =========================================================
   GLOBAL CATALOG SEARCH
========================================================= */

function buildSearchText(material) {
  const description =
    getDescription(material);

  const category =
    getCategory(material);

  const family =
    material?.product_family ||
    getProductFamily(material);

  const materialNumber =
    getMaterialNumber(material);

  const bmgCode =
    getBMGCodeFromRow(material);

  const specifications =
    getSpecifications(material);

  const technicalAttributes =
    material?.technical_attributes_text ||
    "";

  return normalize(
    [
      description,
      category,
      family,
      materialNumber,
      bmgCode,
      specifications,
      technicalAttributes,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function searchScoreForCatalog(
  query,
  specification,
  category,
  material
) {
  const queryText = [
    query,
    specification,
    category,
  ]
    .filter(Boolean)
    .join(" ");

  const queryFamily =
    detectQueryFamily(
      query,
      specification,
      category
    );

  const materialFamily =
    getProductFamily(material);

  const description =
    getDescription(material);

  const materialCategory =
    getCategory(material);

  const materialSpecifications =
    getSpecifications(material);

  const materialTechnicalAttributes =
    material?.technical_attributes_text ||
    "";

  let score = 0;

  if (
    queryFamily !== "generic" &&
    materialFamily !== "generic"
  ) {
    if (
      queryFamily ===
      materialFamily
    ) {
      score += 65;
    } else {
      return {
        score: 0,
        familyMatch: false,
        queryFamily,
        materialFamily,
      };
    }
  }

  const descriptionScore =
    textSimilarity(
      queryText,
      description
    );

  score +=
    descriptionScore * 0.20;

  if (category) {
    score +=
      textSimilarity(
        category,
        materialCategory
      ) * 0.10;
  }

  if (specification) {
    score +=
      textSimilarity(
        specification,
        materialSpecifications
      ) * 0.10;
  }

  if (materialTechnicalAttributes) {
    score +=
      textSimilarity(
        queryText,
        materialTechnicalAttributes
      ) * 0.05;
  }

  const normalizedQuery =
    normalize(queryText);

  const normalizedDescription =
    normalize(description);

  if (
    normalizedQuery &&
    normalizedDescription &&
    normalizedDescription.includes(
      normalizedQuery
    )
  ) {
    score += 10;
  }

  return {
    score: clamp(score),
    familyMatch:
      queryFamily === "generic" ||
      materialFamily === "generic" ||
      queryFamily ===
        materialFamily,
    queryFamily,
    materialFamily,
  };
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

  const ids = materials
    .map(getMaterialId)
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

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  const materialBmgMap =
    new Map();

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
      !materialBmgMap.has(
        String(materialId)
      )
    ) {
      materialBmgMap.set(
        String(materialId),
        []
      );
    }

    materialBmgMap
      .get(String(materialId))
      .push({
        code,
        bmg_id: bmgId,
      });
  }

  const results = [];

  const normalizedSearch =
    normalize(
      [
        search,
        specification,
        category,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const queryTokens =
    tokenize(
      normalizedSearch
    );

  const queryFamily =
    detectQueryFamily(
      search,
      specification,
      category
    );

  const simpleFamilySearch =
    queryTokens.length === 1 &&
    queryFamily !== "generic";

  for (const material of enriched) {
    const ranking =
      searchScoreForCatalog(
        search,
        specification,
        category,
        material
      );

    const materialFamily =
      getProductFamily(material);

    /*
      -------------------------------------------------------
      IMPORTANT FAMILY SEARCH RULE

      "bearing" MUST return every bearing.

      "valve" MUST return every valve.

      "pump" MUST return every pump.

      We do NOT use the 60% equivalence threshold for this.
      This endpoint is catalog discovery.
      -------------------------------------------------------
    */

    if (
      simpleFamilySearch
    ) {
      if (
        materialFamily !==
        queryFamily
      ) {
        continue;
      }
    }

    const normalizedDescription =
      normalize(
        getDescription(material)
      );

    const normalizedCategory =
      normalize(
        getCategory(material)
      );

    const normalizedFamily =
      normalize(
        materialFamily
      );

    const normalizedSpecifications =
      normalize(
        getSpecifications(material)
      );

    const normalizedTechnicalAttributes =
      normalize(
        material?.technical_attributes_text ||
          ""
      );

    let directKeywordMatch =
      false;

    for (const token of queryTokens) {
      if (
        normalizedDescription.includes(
          token
        ) ||
        normalizedCategory.includes(
          token
        ) ||
        normalizedFamily.includes(
          token
        ) ||
        normalizedSpecifications.includes(
          token
        ) ||
        normalizedTechnicalAttributes.includes(
          token
        )
      ) {
        directKeywordMatch = true;
        break;
      }
    }

    const exactPhraseMatch =
      Boolean(
        normalizedSearch &&
        (
          normalizedDescription.includes(
            normalizedSearch
          ) ||
          normalizedCategory.includes(
            normalizedSearch
          ) ||
          normalizedFamily.includes(
            normalizedSearch
          ) ||
          normalizedSpecifications.includes(
            normalizedSearch
          )
        )
      );

    if (
      simpleFamilySearch &&
      materialFamily === queryFamily
    ) {
      directKeywordMatch = true;
    }

    /*
      Multi-word searches still need an actual
      textual match.
    */

    if (
      !simpleFamilySearch &&
      !directKeywordMatch &&
      !exactPhraseMatch &&
      ranking.score <= 0
    ) {
      continue;
    }

    let catalogScore =
      ranking.score;

    if (
      simpleFamilySearch &&
      materialFamily ===
        queryFamily
    ) {
      catalogScore =
        Math.max(
          catalogScore,
          75
        );
    }

    if (exactPhraseMatch) {
      catalogScore =
        Math.max(
          catalogScore,
          95
        );
    } else if (
      directKeywordMatch
    ) {
      catalogScore =
        Math.max(
          catalogScore,
          70
        );
    }

    const id =
      getMaterialId(material);

    const mappingsForMaterial =
      materialBmgMap.get(
        String(id)
      ) || [];

    const firstBmg =
      mappingsForMaterial.find(
        (mapping) =>
          mapping.code
      );

    results.push({
      id,

      company:
        getCompany(material),

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
        firstBmg?.code ||
        material?.bmg_code ||
        material?.bmgCode ||
        material?.ncs_code ||
        material?.ncsCode ||
        null,

      bmg_id:
        firstBmg?.bmg_id ||
        material?.bmg_id ||
        material?.bmgId ||
        material?.ncs_id ||
        material?.ncsId ||
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
          clamp(
            catalogScore
          ).toFixed(1)
        ),

      product_family:
        materialFamily,

      query_family:
        ranking.queryFamily,

      search_text:
        buildSearchText(
          material
        ),

      bmg_search_text:
        [
          firstBmg?.code,
          material?.ai_name,
          getDescription(
            material
          ),
        ]
          .filter(Boolean)
          .join(" "),

      is_equivalent:
        false,

      technical_match:
        false,

      classification:
        "CATALOG_SEARCH_RESULT",

      displayable:
        true,

      search_mode:
        "CATALOG_SEARCH",

      catalog_match:
        true,

      direct_keyword_match:
        directKeywordMatch,

      exact_phrase_match:
        exactPhraseMatch,
    });
  }

  results.sort(
    (a, b) => {
      if (
        Boolean(
          b.exact_phrase_match
        ) !==
        Boolean(
          a.exact_phrase_match
        )
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
        Boolean(
          b.direct_keyword_match
        ) !==
        Boolean(
          a.direct_keyword_match
        )
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

  const seenMaterialIds =
    new Set();

  const deduplicated =
    results.filter(
      (result) => {
        const key =
          String(result.id);

        if (
          seenMaterialIds.has(
            key
          )
        ) {
          return false;
        }

        seenMaterialIds.add(
          key
        );

        return true;
      }
    );

  const finalResults =
    deduplicated.slice(
      0,
      MAX_CATALOG_RESULTS
    );

  return {
    success: true,

    matched:
      finalResults.length > 0,

    search_mode:
      "CATALOG_SEARCH",

    query:
      [
        search,
        specification,
        category,
      ]
        .filter(Boolean)
        .join(" "),

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
          ? `Found ${finalResults.length} catalog material(s).`
          : "No catalog materials matched the search.",
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
        "BMG code is required.",
    };
  }

  const bmgTables = [
    "bmg_materials",
    "ncs_materials",
    "bmg_master",
    "ncs_master",
  ];

  const mappingTables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
    "bmg_materials",
  ];

  const bmgRecords = [];

  for (
    const table of bmgTables
  ) {
    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(table)
          .select("*")
          .limit(
            MAX_CATALOG_RESULTS
          );

      if (
        error ||
        !data?.length
      ) {
        continue;
      }

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
          bmgRecords.push({
            ...row,
            _bmg_table:
              table,
          });
        }
      }
    } catch {
      continue;
    }
  }

  const bmgIds =
    unique(
      bmgRecords
        .map(
          getBMGIdFromRow
        )
        .filter(
          (value) =>
            value !==
              null &&
            value !==
              undefined
        )
        .map(String)
    );

  const mappingRows = [];

  for (
    const table of mappingTables
  ) {
    try {
      const {
        data,
        error,
      } =
        await supabase
          .from(table)
          .select("*")
          .limit(
            MAX_CATALOG_RESULTS
          );

      if (
        error ||
        !data?.length
      ) {
        continue;
      }

      for (
        const row of data
      ) {
        const rowBmgId =
          getBMGIdFromRow(
            row
          );

        const rowCode =
          getBMGCodeFromRow(
            row
          );

        const idMatch =
          rowBmgId !== null &&
          rowBmgId !== undefined &&
          bmgIds.includes(
            String(rowBmgId)
          );

        const codeMatch =
          rowCode &&
          normalizeCode(
            rowCode
          ) ===
            normalizedRequestedCode;

        if (
          idMatch ||
          codeMatch
        ) {
          mappingRows.push({
            ...row,
            _mapping_table:
              table,
          });
        }
      }
    } catch {
      continue;
    }
  }

  const directMaterialIds = [];

  for (
    const row of bmgRecords
  ) {
    const directId =
      getMappingMaterialId(
        row
      );

    if (
      directId !== null &&
      directId !== undefined
    ) {
      directMaterialIds.push(
        String(directId)
      );
    }
  }

  const materialIds =
    unique([
      ...mappingRows
        .map(
          getMappingMaterialId
        )
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
        .map(String),

      ...directMaterialIds,
    ]);

  let materials = [];

  if (
    materialIds.length
  ) {
    const numericIds =
      materialIds
        .map(Number)
        .filter(
          Number.isFinite
        );

    try {
      let query =
        supabase
          .from("materials")
          .select("*");

      if (
        numericIds.length
      ) {
        query =
          query.in(
            "id",
            numericIds
          );
      } else {
        query =
          query.in(
            "id",
            materialIds
          );
      }

      const {
        data,
        error,
      } =
        await query;

      if (
        !error &&
        data
      ) {
        materials = data;
      }
    } catch {
      materials = [];
    }
  }

  if (
    !materials.length
  ) {
    const allMaterials =
      await loadAllMaterials();

    materials =
      allMaterials.filter(
        (material) => {
          const materialBmgId =
            material?.bmg_id ??
            material?.bmgId ??
            material?.ncs_id ??
            material?.ncsId;

          const materialCode =
            material?.bmg_code ??
            material?.bmgCode ??
            material?.ncs_code ??
            material?.ncsCode;

          return (
            (
              materialBmgId !==
                null &&
              materialBmgId !==
                undefined &&
              bmgIds.includes(
                String(
                  materialBmgId
                )
              )
            ) ||
            (
              materialCode &&
              normalizeCode(
                materialCode
              ) ===
                normalizedRequestedCode
            )
          );
        }
      );
  }

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

              return (
                id !== null &&
                id !== undefined &&
                mapping &&
                String(id) ===
                  String(
                    getBMGIdFromRow(
                      mapping
                    )
                  )
              );
            }
          );

       const resolvedCode =
  getBMGCodeFromRow(mapping) ||
  getBMGCodeFromRow(bmgRecord) ||
  getBMGCodeFromRow(material) ||
  requestedCode;

        return {
          id:
            materialId,

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
            getBMGIdFromRow(
              mapping
            ) ??
            getBMGIdFromRow(
              bmgRecord
            ) ??
            material?.bmg_id ??
            material?.bmgId ??
            null,

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

          product_family:
            getProductFamily(
              material
            ),

          query_family:
            getProductFamily(
              material
            ),

          search_text:
            buildSearchText(
              material
            ),

          bmg_search_text:
            [
              resolvedCode,
              material?.ai_name,
              material?.description,
            ]
              .filter(Boolean)
              .join(" "),

          is_equivalent: true,

          technical_match: true,

          classification:
            "BMG_GROUP_MEMBER",

          displayable: true,

          search_mode:
            "BMG_GROUP_SEARCH",
        };
      }
    );

  const seen = new Set();

  const deduplicated =
    results.filter(
      (result) => {
        const key =
          String(result.id);

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
      deduplicated.length >
      0,

    search_mode:
      "BMG_GROUP_SEARCH",

    query:
      requestedCode,

    bmg_code:
      requestedCode,

    total_results:
      deduplicated.length,

    matches:
      deduplicated,

    results:
      deduplicated,

    best_match:
      deduplicated[0] ||
      null,

    data: {
      bmg_code:
        requestedCode,

      bmg_record_count:
        bmgRecords.length,

      mapping_count:
        mappingRows.length,

      material_count:
        deduplicated.length,

      total_results:
        deduplicated.length,

      message:
        deduplicated.length
          ? `Found ${deduplicated.length} material(s) mapped to ${requestedCode}.`
          : "No materials are currently mapped to this BMG code.",
    },
  };
}

/* =========================================================
   GEMINI JSON EXTRACTION
========================================================= */

function extractGeminiJson(text) {
  const source =
    clean(text);

  if (!source) {
    return null;
  }

  const fenced =
    source.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/i
    );

  const candidate =
    fenced?.[1] ||
    source;

  try {
    return JSON.parse(
      candidate
    );
  } catch {
    const objectMatch =
      candidate.match(
        /\{[\s\S]*\}/
      );

    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(
        objectMatch[0]
      );
    } catch {
      return null;
    }
  }
}

/* =========================================================
   GEMINI TECHNICAL REVIEW
========================================================= */

async function callGeminiTechnicalReview(
  source,
  candidates
) {
  if (!ai) {
    return null;
  }

  if (!candidates.length) {
    return null;
  }

  const sourcePayload = {
    id: getMaterialId(source),
    company: getCompany(source),
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

Your job is to compare ONE source industrial material
against candidate materials from other companies.

IMPORTANT RULES:

1. Compare technical specifications, not company material numbers.
2. Same product family is necessary for strong equivalence.
3. Critical differences must prevent equivalence.
4. Bearing 6205 and bearing 6305 are NOT equivalent.
5. PN16 and PN40 are NOT equivalent where pressure rating matters.
6. SS304 and SS316 are NOT automatically equivalent.
7. 230V and 415V are NOT equivalent.
8. Different dimensions that affect interchangeability are NOT equivalent.
9. Do not invent missing specifications.
10. Gemini is only a reviewer. The deterministic technical engine remains authoritative.
11. If candidates are technically equivalent, they should belong to the same BMG standard group.

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

Return ONLY valid JSON in this format:

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
    const model of GEMINI_MODELS
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
        response?.text ||
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
        `Gemini technical review failed with ${model}:`,
        error?.message
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
  matchCount = FINAL_CANDIDATE_COUNT,
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

  const {
    data: sourceMaterial,
    error: sourceError,
  } =
    await supabase
      .from("materials")
      .select("*")
      .eq(
        "id",
        numericMaterialId
      )
      .maybeSingle();

  if (
    sourceError
  ) {
    throw new Error(
      `Unable to load source material: ${sourceError.message}`
    );
  }

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
      getCompany(source)
    );

  const candidates = [];

  for (
    const candidate of enrichedMaterials
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
      Same-company records are not useful for
      cross-company equivalence.
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

  const limitedCandidates =
    candidates.slice(
      0,
      Math.min(
        Number(matchCount) ||
          FINAL_CANDIDATE_COUNT,
        100
      )
    );

  /*
    Gemini is optional.

    If Gemini is unavailable, the deterministic
    technical engine still returns the result.
  */

  let geminiReview =
    null;

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
      error?.message
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
        undefined
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
      .map(
        (item) => {
          const candidate =
            item.material;

          const candidateId =
            getMaterialId(
              candidate
            );

          const review =
            geminiMap.get(
              String(
                candidateId
              )
            );

          const deterministicScore =
            item.technical_score;

          let finalScore =
            deterministicScore;

          if (
            review &&
            Number.isFinite(
              Number(
                review.confidence
              )
            )
          ) {
            /*
              Gemini may refine confidence, but it
              cannot override a deterministic critical
              conflict because conflicting candidates
              were already removed.
            */

            finalScore =
              deterministicScore *
                0.70 +
              clamp(
                Number(
                  review.confidence
                ),
                0,
                100
              ) *
                0.30;
          }

          finalScore =
            clamp(
              finalScore
            );

          const aiApproved =
            review
              ? Boolean(
                  review.technical_equivalence
                ) &&
                Number(
                  review.confidence
                ) >=
                  MIN_AI_APPROVAL_CONFIDENCE
              : null;

          const technicallyEquivalent =
            finalScore >=
              threshold &&
            (
              aiApproved ===
                null ||
              aiApproved ===
                true
            );

          return {
            id:
              candidateId,

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
              candidate?.bmg_code ||
              candidate?.bmgCode ||
              candidate?.ncs_code ||
              candidate?.ncsCode ||
              null,

            bmg_id:
              candidate?.bmg_id ??
              candidate?.bmgId ??
              candidate?.ncs_id ??
              candidate?.ncsId ??
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
              review?.confidence ??
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
              review?.confidence ??
              null,

            product_family:
              getProductFamily(
                candidate
              ),

            query_family:
              getProductFamily(
                source
              ),

            technical_reason:
              review?.reason ||
              item.technical_reason,

            is_equivalent:
              technicallyEquivalent,

            technical_match:
              technicallyEquivalent,

            classification:
              technicallyEquivalent
                ? "TECHNICAL_MATCH"
                : "TECHNICAL_CANDIDATE",

            displayable:
              finalScore >=
              MIN_DISPLAY_SIMILARITY,

            search_mode:
              "TECHNICAL_MATCH",

            source_material_id:
              numericMaterialId,

            source_company:
              getCompany(
                source
              ),

            source_description:
              getDescription(
                source
              ),
          };
        }
      )
      .filter(
        (result) =>
          result.displayable
      );

  results.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  return {
    success: true,

    matched:
      results.length > 0,

    search_mode:
      "TECHNICAL_MATCH",

    source_material: {
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

      product_family:
        getProductFamily(
          source
        ),
    },

    total_results:
      results.length,

    matches:
      results,

    results:
      results,

    best_match:
      results[0] ||
      null,

    threshold:
      threshold,

    gemini_available:
      Boolean(
        geminiReview
      ),

    message:
      results.length
        ? `Found ${results.length} technically compatible material(s).`
        : "No technically compatible material was found above the 60% threshold.",
  };
}

/* =========================================================
   FIND EXISTING BMG
========================================================= */

async function findExistingBMGForMaterial(
  material,
  allMaterials = null
) {
  const mappings =
    await loadBMGMappings();

  const materialId =
    getMaterialId(
      material
    );

  /*
    1. Existing mapping for this material.
  */

  const directMapping =
    mappings.find(
      (mapping) =>
        String(
          getMappingMaterialId(
            mapping
          )
        ) ===
        String(materialId) &&
        getBMGCodeFromRow(
          mapping
        )
    );

  if (directMapping) {
    return {
      bmg_code:
        getBMGCodeFromRow(
          directMapping
        ),

      bmg_id:
        getBMGIdFromRow(
          directMapping
        ),

      source:
        "existing_material_mapping",

      confidence: 100,
    };
  }

  /*
    2. Check the materials table itself.
  */

  const materialBmgCode =
    getBMGCodeFromRow(
      material
    );

  if (materialBmgCode) {
    return {
      bmg_code:
        materialBmgCode,

      bmg_id:
        getBMGIdFromRow(
          material
        ),

      source:
        "material_record",

      confidence: 100,
    };
  }

  /*
    3. Look for technically equivalent materials
       and reuse their BMG code.
  */

  const catalog =
    allMaterials ||
    (await loadAllMaterials());

  const ids =
    catalog
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
      catalog,
      attributeMap
    );

  const source =
    enriched.find(
      (item) =>
        String(
          getMaterialId(
            item
          )
        ) ===
        String(materialId)
    ) ||
    enrichMaterial(
      material
    );

  const sourceFamily =
    getProductFamily(
      source
    );

  const candidates = [];

  for (
    const candidate of enriched
  ) {
    if (
      String(
        getMaterialId(
          candidate
        )
      ) ===
      String(materialId)
    ) {
      continue;
    }

    if (
      sourceFamily !==
        "generic" &&
      getProductFamily(
        candidate
      ) !==
        sourceFamily
    ) {
      continue;
    }

    const score =
      calculateFeatureScore(
        source,
        candidate
      );

    if (
      score.conflict ||
      score.score <
        MIN_DISPLAY_SIMILARITY
    ) {
      continue;
    }

    const candidateId =
      getMaterialId(
        candidate
      );

    const candidateMappings =
      mappings.filter(
        (mapping) =>
          String(
            getMappingMaterialId(
              mapping
            )
          ) ===
          String(candidateId)
      );

    const bmgMapping =
      candidateMappings.find(
        (mapping) =>
          getBMGCodeFromRow(
            mapping
          )
      );

    const candidateBmgCode =
      getBMGCodeFromRow(
        candidate
      ) ||
      getBMGCodeFromRow(
        bmgMapping
      );

    if (!candidateBmgCode) {
      continue;
    }

    candidates.push({
      bmg_code:
        candidateBmgCode,

      bmg_id:
        getBMGIdFromRow(
          bmgMapping
        ) ??
        getBMGIdFromRow(
          candidate
        ),

      similarity:
        score.score,

      material_id:
        candidateId,

      company:
        getCompany(
          candidate
        ),
    });
  }

  candidates.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  if (
    candidates.length
  ) {
    return {
      ...candidates[0],

      source:
        "technically_equivalent_material",

      confidence:
        candidates[0].similarity,
    };
  }

  return null;
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
      clean(
        body?.search ??
        body?.searchText ??
        body?.query ??
        body?.q ??
        body?.materialName ??
        body?.description ??
        ""
      );

    const specification =
      clean(
        body?.specification ??
        body?.specifications ??
        body?.spec ??
        ""
      );

    const category =
      clean(
        body?.category ??
        ""
      );

    const bmgCode =
      clean(
        body?.bmgCode ??
        body?.bmg_code ??
        body?.bmgIdentity ??
        body?.bmg_identity ??
        body?.ncsCode ??
        body?.ncs_code ??
        ""
      );

    const materialId =
      body?.materialId ??
      body?.material_id ??
      body?.id ??
      null;

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
      BMG GROUP SEARCH
    */

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
        )
      );
    }

    /*
      GLOBAL CATALOG SEARCH
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

    /*
      TECHNICAL MATERIAL MATCH
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

    return NextResponse.json(
      {
        success: false,

        matched: false,

        message:
          "Search input is required.",

        notice:
          "Enter a part name, specification, category, BMG code, or select a material.",

        total_results: 0,

        matches: [],

        results: [],

        best_match: null,
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/match-materials error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        matched: false,

        error:
          error?.message ||
          "Internal server error.",

        total_results: 0,

        matches: [],

        results: [],

        best_match: null,
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
        ""
      );

    const materialId =
      searchParams.get(
        "materialId"
      ) ||
      searchParams.get(
        "material_id"
      );

    /*
      BMG GROUP SEARCH
    */

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
        )
      );
    }

    /*
      GLOBAL CATALOG SEARCH
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

    /*
      TECHNICAL MATERIAL MATCH
    */

    if (materialId) {
      return NextResponse.json(
        await runMaterialTechnicalMatch(
          materialId,
          FINAL_CANDIDATE_COUNT,
          0.60
        )
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "AI Match Center API is running.",

      supported_searches: [
        "search",
        "searchText",
        "query",
        "specification",
        "category",
        "bmgCode",
        "bmgIdentity",
        "materialId",
      ],
    });
  } catch (error) {
    console.error(
      "GET /api/match-materials error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Internal server error.",

        total_results: 0,

        matches: [],

        results: [],

        best_match: null,
      },
      {
        status: 500,
      }
    );
  }
}