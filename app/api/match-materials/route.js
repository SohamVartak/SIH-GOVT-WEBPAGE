import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

/* =========================================================
   CONFIGURATION
========================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  return value && typeof value === "object" && !Array.isArray(value);
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

/*
  IMPORTANT:
  Product-family detection deliberately does NOT use the complete
  specification/PDF text as its primary signal.

  This prevents a bearing datasheet containing words such as
  "valve", "pump", "pressure", etc. in harmonization/disclaimer
  text from being classified as those products.
*/

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
    const detected = detectProductFamilyFromText(explicitFamily);

    if (detected !== "generic") {
      return detected;
    }

    if (explicitFamily.length <= 40) {
      return explicitFamily;
    }
  }

  const category = normalize(getCategory(material));

  if (category) {
    const detected = detectProductFamilyFromText(category);

    if (detected !== "generic") {
      return detected;
    }
  }

  const description = normalize(getDescription(material));

  if (description) {
    const detected = detectProductFamilyFromText(description);

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
    const detected = detectProductFamilyFromText(designFeatures);

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
    const detected = detectProductFamilyFromText(otherAttributes);

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

  /*
    Bearing housing must be checked before bearing because
    "bearing housing" contains "bearing".
  */

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

function detectQueryFamily(search, specification, category) {
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

  const union = new Set([...setA, ...setB]).size;

  if (!union) {
    return 0;
  }

  const jaccard = intersection / union;
  const containment =
    intersection / Math.max(1, Math.min(setA.size, setB.size));

  return clamp(
    jaccard * 55 + containment * 45,
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
    const shorter = Math.min(x.length, y.length);
    const longer = Math.max(x.length, y.length);

    return clamp(
      75 + (shorter / Math.max(1, longer)) * 25,
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

  const difference = Math.abs(na - nb);
  const denominator = Math.max(Math.abs(na), Math.abs(nb), 1);

  const relativeDifference =
    difference / denominator;

  return clamp(
    100 - relativeDifference * 100,
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
      ...source.match(pattern) || []
    );
  }

  result.pressures.push(
    ...source.match(
      /\b(?:pn|class)\s*[-:]?\s*\d+(?:\.\d+)?\b/gi
    ) || []
  );

  result.temperatures.push(
    ...source.match(
      /\b-?\d+(?:\.\d+)?\s*(?:°?\s*c|°?\s*f|deg\s*c|deg\s*f)\b/gi
    ) || []
  );

  result.voltages.push(
    ...source.match(
      /\b\d+(?:\.\d+)?\s*(?:v|kv)\b/gi
    ) || []
  );

  result.speeds.push(
    ...source.match(
      /\b\d+(?:\.\d+)?\s*(?:rpm|r\/min)\b/gi
    ) || []
  );

  result.materials.push(
    ...source.match(
      /\b(?:ss\s*)?(?:304|316|316l|321|347|410|420|430)\b/gi
    ) || []
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
    if (normalize(source).includes(normalize(material))) {
      result.materials.push(material);
    }
  }

  result.standards.push(
    ...source.match(
      /\b(?:api|asme|ansi|astm|iso|iec|is|din|en|bs)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || []
  );

  result.designations.push(
    ...source.match(
      /\b(?:sn|dn|pn|model|type|size)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || []
  );

  result.sizes.push(
    ...source.match(
      /\b(?:dn|size)\s*[-:]?\s*\d+(?:\.\d+)?\b/gi
    ) || []
  );

  result.quantities.push(
    ...source.match(
      /\b(?:qty|quantity)\s*[:\-]?\s*\d+(?:\.\d+)?\b/gi
    ) || []
  );

  result.seals.push(
    ...source.match(
      /\b\d+\s+(?:felt|oil|mechanical|lip|rubber)\s+seals?\b/gi
    ) || []
  );

  result.ratings.push(
    ...source.match(
      /\b(?:class|pn|rating)\s*[-:]?\s*[a-z0-9.\-]+\b/gi
    ) || []
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

function hasCriticalConflict(source, candidate) {
  const sourceText = getTechnicalFeatureText(source);
  const candidateText = getTechnicalFeatureText(candidate);

  const sourceValues = extractTechnicalValues(sourceText);
  const candidateValues = extractTechnicalValues(candidateText);

  /*
    Explicit bearing designation conflicts.
    Example:
      6205 vs 6305
    should not be treated as equivalent merely because
    both are bearings.
  */

  const sourceDesignations = sourceValues.designations
    .map(normalize)
    .filter(Boolean);

  const candidateDesignations = candidateValues.designations
    .map(normalize)
    .filter(Boolean);

  if (
    sourceDesignations.length &&
    candidateDesignations.length
  ) {
    const sourceDesignationNumbers =
      sourceDesignations
        .map((x) => x.match(/\d+(?:\.\d+)?/g)?.join("-"))
        .filter(Boolean);

    const candidateDesignationNumbers =
      candidateDesignations
        .map((x) => x.match(/\d+(?:\.\d+)?/g)?.join("-"))
        .filter(Boolean);

    if (
      sourceDesignationNumbers.length &&
      candidateDesignationNumbers.length
    ) {
      const overlap = sourceDesignationNumbers.some(
        (value) =>
          candidateDesignationNumbers.includes(value)
      );

      if (!overlap) {
        const sourceFamily = getProductFamily(source);
        const candidateFamily = getProductFamily(candidate);

        if (
          sourceFamily === candidateFamily &&
          (
            sourceFamily === "bearing" ||
            sourceFamily === "bearing housing" ||
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

  /*
    Pressure class conflict.
  */

  const sourcePressure =
    sourceValues.pressures.map(normalize);

  const candidatePressure =
    candidateValues.pressures.map(normalize);

  if (
    sourcePressure.length &&
    candidatePressure.length &&
    !sourcePressure.some((value) =>
      candidatePressure.includes(value)
    )
  ) {
    return {
      conflict: true,
      reason:
        "Different pressure class/rating detected.",
    };
  }

  /*
    Voltage conflict.
  */

  const sourceVoltage =
    sourceValues.voltages.map(normalize);

  const candidateVoltage =
    candidateValues.voltages.map(normalize);

  if (
    sourceVoltage.length &&
    candidateVoltage.length &&
    !sourceVoltage.some((value) =>
      candidateVoltage.includes(value)
    )
  ) {
    return {
      conflict: true,
      reason:
        "Different electrical voltage detected.",
    };
  }

  /*
    Material conflict.
  */

  const sourceMaterials =
    sourceValues.materials.map(normalize);

  const candidateMaterials =
    candidateValues.materials.map(normalize);

  if (
    sourceMaterials.length &&
    candidateMaterials.length
  ) {
    const materialOverlap =
      sourceMaterials.some((value) =>
        candidateMaterials.some(
          (candidateValue) =>
            candidateValue === value ||
            candidateValue.includes(value) ||
            value.includes(candidateValue)
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

function calculateFeatureScore(source, candidate) {
  const sourceFamily = getProductFamily(source);
  const candidateFamily = getProductFamily(candidate);

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
    hasCriticalConflict(source, candidate);

  if (conflictResult.conflict) {
    return {
      score: 0,
      conflict: true,
      reason: conflictResult.reason,
    };
  }

  const sourceDescription =
    getDescription(source);

  const candidateDescription =
    getDescription(candidate);

  const descriptionScore =
    textSimilarity(
      sourceDescription,
      candidateDescription
    );

  const sourceCategory =
    getCategory(source);

  const candidateCategory =
    getCategory(candidate);

  const categoryScore =
    textSimilarity(
      sourceCategory,
      candidateCategory
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
    extractTechnicalValues(sourceFeatures);

  const candidateValues =
    extractTechnicalValues(candidateFeatures);

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
    const a = sourceValues[field] || [];
    const b = candidateValues[field] || [];

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
      criticalScore / criticalComparisons;
  }

  let score =
    descriptionScore * 0.30 +
    categoryScore * 0.10 +
    featureScore * 0.20 +
    familyScore * 0.25;

  if (criticalComparisons > 0) {
    score += criticalScore * 0.15;
  } else {
    /*
      Missing critical specifications should reduce confidence,
      not invent equivalence.
    */

    score *= 0.90;
  }

  /*
    Same product family is mandatory for strong technical matches.
  */

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
  const { data, error } = await supabase
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

async function loadMaterialAttributes(materialIds) {
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
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .in("material_id", materialIds);

      if (error || !data?.length) {
        continue;
      }

      for (const row of data) {
        const materialId =
          row.material_id ??
          row.materialId ??
          row.materialID;

        if (materialId === null || materialId === undefined) {
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

function attributesToText(attributes) {
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
          .map(([key, value]) =>
            `${key}: ${clean(value)}`
          )
          .join(" ");
      })
      .join(" ");
  }

  if (isObject(attributes)) {
    return Object.entries(attributes)
      .map(([key, value]) =>
        `${key}: ${clean(value)}`
      )
      .join(" ");
  }

  return clean(attributes);
}

function enrichMaterial(material, attributes = []) {
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

function enrichMaterials(materials, attributeMap) {
  return materials.map((material) => {
    const id = getMaterialId(material);

    return enrichMaterial(
      material,
      attributeMap[id] || []
    );
  });
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
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(MAX_CATALOG_RESULTS);

      if (error || !data?.length) {
        continue;
      }

      mappings.push(
        ...data.map((row) => ({
          ...row,
          _mapping_table: table,
        }))
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
  if (!row) {
    return "";
  }

  return clean(
    row.bmg_code ||
      row.bmgCode ||
      row.ncs_code ||
      row.ncsCode ||
      row.standard_code ||
      row.standardCode ||
      row.code ||
      ""
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
  const description = getDescription(material);

  const category = getCategory(material);

  const family =
    material?.product_family ||
    getProductFamily(material);

  const materialNumber =
    getMaterialNumber(material);

  const bmgCode =
    getBMGCodeFromRow(material);

  /*
    Specifications are intentionally included only as a
    secondary signal. They must NOT dominate family matching.
  */

  const specifications =
    getSpecifications(material);

  const technicalAttributes =
    material?.technical_attributes_text || "";

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
  const queryText =
    [query, specification, category]
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
    material?.technical_attributes_text || "";

  let score = 0;

  /*
    1. PRODUCT FAMILY IS THE STRONGEST SIGNAL.
  */

  if (
    queryFamily !== "generic" &&
    materialFamily !== "generic"
  ) {
    if (queryFamily === materialFamily) {
      score += 65;
    } else {
      /*
        Do not allow random PDF text to make a valve appear
        as a bearing just because "bearing" occurs somewhere
        inside the PDF.
      */

      return {
        score: 0,
        familyMatch: false,
        queryFamily,
        materialFamily,
      };
    }
  }

  /*
    2. Description.
  */

  const descriptionScore =
    textSimilarity(
      queryText,
      description
    );

  score += descriptionScore * 0.20;

  /*
    3. Category.
  */

  if (category) {
    score +=
      textSimilarity(
        category,
        materialCategory
      ) * 0.10;
  }

  /*
    4. Technical specifications as supporting evidence.
  */

  if (specification) {
    score +=
      textSimilarity(
        specification,
        materialSpecifications
      ) * 0.10;
  }

  /*
    5. Technical attributes.
  */

  if (materialTechnicalAttributes) {
    score +=
      textSimilarity(
        queryText,
        materialTechnicalAttributes
      ) * 0.05;
  }

  /*
    6. Exact description token occurrence.
  */

  const normalizedQuery =
    normalize(queryText);

  const normalizedDescription =
    normalize(description);

  if (
    normalizedQuery &&
    normalizedDescription &&
    normalizedDescription.includes(normalizedQuery)
  ) {
    score += 10;
  }

  return {
    score: clamp(score),
    familyMatch:
      queryFamily === "generic" ||
      materialFamily === "generic" ||
      queryFamily === materialFamily,
    queryFamily,
    materialFamily,
  };
}

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
    await loadMaterialAttributes(ids);

  const mappings =
    await loadBMGMappings();

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  /*
    Create a material -> BMG mapping index.
  */

  const materialBmgMap = new Map();

  for (const mapping of mappings) {
    const materialId =
      getMappingMaterialId(mapping);

    if (
      materialId === null ||
      materialId === undefined
    ) {
      continue;
    }

    const code =
      getBMGCodeFromRow(mapping);

    const bmgId =
      getBMGIdFromRow(mapping);

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

  for (const material of enriched) {
    const ranking =
      searchScoreForCatalog(
        search,
        specification,
        category,
        material
      );

    if (ranking.score <= 0) {
      continue;
    }

    const id =
      getMaterialId(material);

    const mappingsForMaterial =
      materialBmgMap.get(
        String(id)
      ) || [];

    const firstBmg =
      mappingsForMaterial.find(
        (mapping) => mapping.code
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
        getMaterialNumber(material),

      description:
        getDescription(material),

      specifications:
        getSpecifications(material),

      category:
        getCategory(material),

      bmg_code:
        firstBmg?.code ||
        material?.bmg_code ||
        material?.bmgCode ||
        null,

      bmg_id:
        firstBmg?.bmg_id ??
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
        getTechnicalFeatureText(material),

      similarity:
        Number(
          ranking.score.toFixed(1)
        ),

      product_family:
        ranking.materialFamily,

      query_family:
        ranking.queryFamily,

      search_text:
        buildSearchText(material),

      bmg_search_text:
        [
          firstBmg?.code,
          material?.ai_name,
        ]
          .filter(Boolean)
          .join(" "),

      is_equivalent: false,

      technical_match: false,

      classification:
        "CATALOG_SEARCH_RESULT",

      displayable: true,

      search_mode:
        "GLOBAL_CATALOG_SEARCH",
    });
  }

  /*
    Sort highest relevance first.
  */

  results.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  /*
    For a generic family query such as "bearing",
    return ALL bearing-family records, not only one.
  */

  const queryFamily =
    detectQueryFamily(
      search,
      specification,
      category
    );

  let finalResults = results;

  if (queryFamily !== "generic") {
    finalResults =
      results.filter(
        (result) =>
          result.product_family ===
          queryFamily
      );
  }

  /*
    If exact family filtering unexpectedly produces nothing,
    use the ranked results rather than returning an empty search.
  */

  if (
    queryFamily !== "generic" &&
    finalResults.length === 0
  ) {
    finalResults = results;
  }

  return {
    success: true,

    matched:
      finalResults.length > 0,

    search_mode:
      "GLOBAL_CATALOG_SEARCH",

    query:
      search || specification || category,

    total_results:
      finalResults.length,

    matches:
      finalResults.slice(
        0,
        MAX_CATALOG_RESULTS
      ),

    results:
      finalResults.slice(
        0,
        MAX_CATALOG_RESULTS
      ),

    best_match:
      finalResults[0] || null,

    data: {
      search_query: search,
      specification,
      category,
      query_family: queryFamily,
      total_results:
        finalResults.length,

      results:
        finalResults.slice(
          0,
          MAX_CATALOG_RESULTS
        ),
    },
  };
}

/* =========================================================
   BMG GROUP SEARCH
========================================================= */

/*
  This function is deliberately defensive because different
  versions of the project may store BMG data as:

    bmg_materials.bmg_code
    bmg_materials.ncs_code
    material_bmg_mapping.bmg_id
    material_bmg_mapping.ncs_id

  The important part is:

      BMG code
          ↓
      BMG record ID
          ↓
      material_bmg_mapping
          ↓
      materials

  It does NOT assume that the mapping table itself contains
  the textual BMG code.
*/

async function searchBMGGroup(bmgCode) {
  const requestedCode =
    clean(bmgCode);

  const normalizedRequestedCode =
    normalizeCode(requestedCode);

  if (!normalizedRequestedCode) {
    return {
      success: false,
      matched: false,
      search_mode: "BMG_GROUP_SEARCH",
      query: requestedCode,
      bmg_code: requestedCode,
      total_results: 0,
      matches: [],
      results: [],
      best_match: null,
      data: {
        bmg_code: requestedCode,
        total_results: 0,
        message: "BMG code is empty.",
      },
    };
  }

  /*
    ---------------------------------------------------------
    STEP 1
    Find matching BMG/NCS records.
    ---------------------------------------------------------
  */

  const bmgRecords = [];

  const bmgTables = [
    "bmg_materials",
    "ncs_materials",
  ];

  for (const table of bmgTables) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .limit(MAX_CATALOG_RESULTS);

      if (error || !data?.length) {
        continue;
      }

      for (const row of data) {
        const possibleCodes = unique([
          row?.bmg_code,
          row?.bmgCode,
          row?.ncs_code,
          row?.ncsCode,
          row?.standard_code,
          row?.standardCode,
          row?.code,
          row?.material_code,
          row?.materialCode,
        ]);

        const matched =
          possibleCodes.some(
            (code) =>
              normalizeCode(code) ===
              normalizedRequestedCode
          );

        if (matched) {
          bmgRecords.push({
            ...row,
            _bmg_table: table,
          });
        }
      }
    } catch {
      continue;
    }
  }

  /*
    ---------------------------------------------------------
    STEP 2
    Find mappings that reference the BMG record.
    ---------------------------------------------------------
  */

  const mappingRows = [];

  const mappingTables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  const bmgIds = unique(
    bmgRecords
      .map(getBMGIdFromRow)
      .filter(
        (value) =>
          value !== null &&
          value !== undefined
      )
      .map(String)
  );

  for (const table of mappingTables) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .limit(MAX_CATALOG_RESULTS);

      if (error || !data?.length) {
        continue;
      }

      for (const row of data) {
        const rowBmgId =
          getBMGIdFromRow(row);

        const rowCode =
          getBMGCodeFromRow(row);

        const idMatch =
          rowBmgId !== null &&
          rowBmgId !== undefined &&
          bmgIds.includes(
            String(rowBmgId)
          );

        const codeMatch =
          rowCode &&
          normalizeCode(rowCode) ===
            normalizedRequestedCode;

        if (idMatch || codeMatch) {
          mappingRows.push({
            ...row,
            _mapping_table: table,
          });
        }
      }
    } catch {
      continue;
    }
  }

  /*
    ---------------------------------------------------------
    STEP 3
    Some projects may have bmg_materials rows that directly
    contain material IDs. Handle that too.
    ---------------------------------------------------------
  */

  const directMaterialIds = [];

  for (const row of bmgRecords) {
    const directId =
      getMappingMaterialId(row);

    if (
      directId !== null &&
      directId !== undefined
    ) {
      directMaterialIds.push(
        String(directId)
      );
    }
  }

  /*
    ---------------------------------------------------------
    STEP 4
    Collect material IDs from mapping rows.
    ---------------------------------------------------------
  */

  const materialIds = unique([
    ...mappingRows
      .map(getMappingMaterialId)
      .filter(
        (value) =>
          value !== null &&
          value !== undefined
      )
      .map(String),

    ...directMaterialIds,
  ]);

  /*
    ---------------------------------------------------------
    STEP 5
    Fallback:
    Search mapping tables by BMG code even if there was no
    BMG master record.
    ---------------------------------------------------------
  */

  if (!mappingRows.length) {
    for (const table of mappingTables) {
      try {
        const { data, error } =
          await supabase
            .from(table)
            .select("*")
            .limit(MAX_CATALOG_RESULTS);

        if (error || !data?.length) {
          continue;
        }

        for (const row of data) {
          const rowCode =
            getBMGCodeFromRow(row);

          if (
            rowCode &&
            normalizeCode(rowCode) ===
              normalizedRequestedCode
          ) {
            mappingRows.push({
              ...row,
              _mapping_table: table,
            });

            const materialId =
              getMappingMaterialId(row);

            if (
              materialId !== null &&
              materialId !== undefined
            ) {
              materialIds.push(
                String(materialId)
              );
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  /*
    ---------------------------------------------------------
    STEP 6
    Load all materials if IDs are still missing.
    This is important for schemas where bmg_id is stored
    directly on materials.
    ---------------------------------------------------------
  */

  let materials = [];

  if (materialIds.length) {
    const numericIds =
      materialIds
        .map((id) => Number(id))
        .filter(Number.isFinite);

    const stringIds =
      materialIds;

    try {
      let query =
        supabase
          .from("materials")
          .select("*");

      if (numericIds.length) {
        query = query.in(
          "id",
          numericIds
        );
      } else {
        query = query.in(
          "id",
          stringIds
        );
      }

      const { data, error } =
        await query;

      if (!error && data) {
        materials = data;
      }
    } catch {
      materials = [];
    }
  }

  /*
    ---------------------------------------------------------
    STEP 7
    Direct material lookup by bmg_id / bmg_code.
    ---------------------------------------------------------
  */

  if (!materials.length) {
    const allMaterials =
      await loadAllMaterials();

    materials =
      allMaterials.filter((material) => {
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

        const idMatch =
          bmgIds.length &&
          materialBmgId !== null &&
          materialBmgId !== undefined &&
          bmgIds.includes(
            String(materialBmgId)
          );

        const codeMatch =
          materialCode &&
          normalizeCode(materialCode) ===
            normalizedRequestedCode;

        return (
          Boolean(idMatch) ||
          Boolean(codeMatch)
        );
      });
  }

  /*
    ---------------------------------------------------------
    STEP 8
    If still nothing, inspect all BMG/NCS records and
    material mappings one final time by textual reference.
    ---------------------------------------------------------
  */

  if (!materials.length) {
    const allMaterials =
      await loadAllMaterials();

    const allMappings = [];

    for (const table of mappingTables) {
      try {
        const { data, error } =
          await supabase
            .from(table)
            .select("*")
            .limit(MAX_CATALOG_RESULTS);

        if (!error && data) {
          allMappings.push(...data);
        }
      } catch {
        continue;
      }
    }

    const matchingMappingMaterialIds =
      allMappings
        .filter((row) => {
          const code =
            getBMGCodeFromRow(row);

          return (
            code &&
            normalizeCode(code) ===
              normalizedRequestedCode
          );
        })
        .map(getMappingMaterialId)
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )
        .map(String);

    if (matchingMappingMaterialIds.length) {
      materials =
        allMaterials.filter((material) =>
          matchingMappingMaterialIds.includes(
            String(getMaterialId(material))
          )
        );
    }
  }

  /*
    ---------------------------------------------------------
    STEP 9
    Enrich materials.
    ---------------------------------------------------------
  */

  const ids =
    materials
      .map(getMaterialId)
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      );

  const attributeMap =
    await loadMaterialAttributes(ids);

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  /*
    ---------------------------------------------------------
    STEP 10
    Build final BMG-group result.
    ---------------------------------------------------------
  */

  const results = enriched.map(
    (material) => {
      const materialId =
        getMaterialId(material);

      const mapping =
        mappingRows.find(
          (row) =>
            String(
              getMappingMaterialId(row)
            ) ===
            String(materialId)
        );

      const bmgRecord =
        bmgRecords.find((row) => {
          const id =
            getBMGIdFromRow(row);

          return (
            id !== null &&
            id !== undefined &&
            mapping &&
            String(id) ===
              String(
                getBMGIdFromRow(mapping)
              )
          );
        });

      const resolvedCode =
        getBMGCodeFromRow(mapping) ||
        getBMGCodeFromRow(bmgRecord) ||
        requestedCode;

      return {
        id: materialId,

        company:
          getCompany(material),

        company_id:
          material?.company_id ??
          material?.companyId ??
          null,

        material_number:
          getMaterialNumber(material),

        description:
          getDescription(material),

        specifications:
          getSpecifications(material),

        category:
          getCategory(material),

        bmg_code:
          resolvedCode,

        bmg_id:
          getBMGIdFromRow(mapping) ??
          getBMGIdFromRow(bmgRecord) ??
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

        verified: Boolean(
          material?.verified ??
          material?.is_verified ??
          false
        ),

        technical_features:
          material?.technical_features ||
          getTechnicalFeatureText(material),

        similarity: 100,

        product_family:
          getProductFamily(material),

        query_family:
          getProductFamily(material),

        search_text:
          buildSearchText(material),

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

  /*
    Remove duplicate material IDs.
  */

  const seen =
    new Set();

  const deduplicated =
    results.filter((result) => {
      const key =
        String(result.id);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });

  return {
    success: true,

    matched:
      deduplicated.length > 0,

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
      deduplicated[0] || null,

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
   AI TECHNICAL REVIEW
========================================================= */

function extractGeminiJson(text) {
  const source = clean(text);

  if (!source) {
    return null;
  }

  const fenced =
    source.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/i
    );

  const candidate =
    fenced?.[1] || source;

  try {
    return JSON.parse(candidate);
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

async function callGeminiTechnicalReview(
  source,
  candidate
) {
  if (!ai) {
    return null;
  }

  const sourceFamily =
    getProductFamily(source);

  const candidateFamily =
    getProductFamily(candidate);

  const sourceFeatures =
    getTechnicalFeatureText(source);

  const candidateFeatures =
    getTechnicalFeatureText(candidate);

  const conflict =
    hasCriticalConflict(
      source,
      candidate
    );

  const prompt = `
You are an industrial engineering harmonization reviewer.

Your task is to compare TWO material records and determine whether
they are technically equivalent/interchangeable candidates.

IMPORTANT RULES:

1. Compare engineering function and technical characteristics.
2. Do NOT use company material numbers as proof of equivalence.
3. Do NOT treat textual similarity alone as equivalence.
4. Product family must be compatible.
5. Explicit critical conflicts must block equivalence.
6. Missing specifications are UNKNOWN, not compatible by assumption.
7. Bearing housing is NOT automatically equivalent to a rolling bearing.
8. Different bearing designations such as 6205 and 6305 must not be treated
   as equivalent merely because both are bearings.
9. Different pressure classes such as PN16 and PN40 must not be treated
   as equivalent unless engineering evidence explicitly supports it.
10. Different materials such as SS304 and SS316 must be treated as a
    potential critical conflict.
11. Different voltages such as 230V and 415V must be treated as a critical
    conflict.
12. The result must be explainable.
13. A Gemini outage must never be interpreted as equivalence.

SOURCE MATERIAL:

Company:
${getCompany(source)}

Material number:
${getMaterialNumber(source)}

Description:
${getDescription(source)}

Category:
${getCategory(source)}

Product family:
${sourceFamily}

Technical information:
${sourceFeatures}

CANDIDATE MATERIAL:

Company:
${getCompany(candidate)}

Material number:
${getMaterialNumber(candidate)}

Description:
${getDescription(candidate)}

Category:
${getCategory(candidate)}

Product family:
${candidateFamily}

Technical information:
${candidateFeatures}

Deterministic conflict check:
${JSON.stringify(conflict)}

Return ONLY valid JSON in this structure:

{
  "technically_equivalent": true,
  "confidence": 0,
  "relationship": "exact|near|functional|non-equivalent|unknown",
  "critical_conflict": false,
  "reason": "short engineering explanation",
  "matching_features": [],
  "conflicting_features": [],
  "missing_features": [],
  "human_review_required": true
}

Use confidence from 0 to 100.
`;

  for (const model of GEMINI_MODELS) {
    try {
      const response =
        await ai.models.generateContent({
          model,
          contents: prompt,
        });

      const text =
        response?.text ||
        response?.response?.text ||
        "";

      const parsed =
        extractGeminiJson(text);

      if (parsed) {
        return parsed;
      }
    } catch {
      /*
        Try next Gemini model.
      */
    }
  }

  return null;
}

/* =========================================================
   TECHNICAL MATCH EXECUTION
========================================================= */

async function runMaterialTechnicalMatch(
  materialId,
  matchCount = FINAL_CANDIDATE_COUNT,
  matchThreshold = MIN_DISPLAY_SIMILARITY / 100
) {
  /*
    ---------------------------------------------------------
    Load source.
    ---------------------------------------------------------
  */

  const { data: sourceMaterial, error } =
    await supabase
      .from("materials")
      .select("*")
      .eq("id", materialId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load source material: ${error.message}`
    );
  }

  if (!sourceMaterial) {
    return {
      success: false,
      matched: false,
      message:
        `Material ${materialId} was not found.`,
      total_results: 0,
      matches: [],
      results: [],
      best_match: null,
    };
  }

  /*
    ---------------------------------------------------------
    Load catalog.
    ---------------------------------------------------------
  */

  const materials =
    await loadAllMaterials();

  const ids =
    materials
      .map(getMaterialId)
      .filter(
        (id) =>
          id !== null &&
          id !== undefined
      );

  const attributeMap =
    await loadMaterialAttributes(ids);

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  const source =
    enrichMaterial(
      sourceMaterial,
      attributeMap[
        getMaterialId(sourceMaterial)
      ] || []
    );

  const candidates = [];

  /*
    ---------------------------------------------------------
    Deterministic engineering scoring.
    ---------------------------------------------------------
  */

  for (const candidate of enriched) {
    const candidateId =
      getMaterialId(candidate);

    if (
      candidateId === null ||
      candidateId === undefined
    ) {
      continue;
    }

    if (
      String(candidateId) ===
      String(materialId)
    ) {
      continue;
    }

    const scoreResult =
      calculateFeatureScore(
        source,
        candidate
      );

    if (scoreResult.conflict) {
      continue;
    }

    if (
      scoreResult.score <
      MIN_DISPLAY_SIMILARITY
    ) {
      continue;
    }

    candidates.push({
      candidate,
      scoreResult,
    });
  }

  /*
    Sort deterministic technical candidates.
  */

  candidates.sort(
    (a, b) =>
      b.scoreResult.score -
      a.scoreResult.score
  );

  /*
    ---------------------------------------------------------
    Limit candidates per company so one company's giant
    catalog cannot completely dominate the result.
    ---------------------------------------------------------
  */

  const companyCounts =
    new Map();

  const balancedCandidates = [];

  for (const item of candidates) {
    const company =
      getCompany(item.candidate) ||
      "UNKNOWN";

    const count =
      companyCounts.get(company) || 0;

    if (
      count >=
      MAX_CANDIDATES_PER_COMPANY
    ) {
      continue;
    }

    companyCounts.set(
      company,
      count + 1
    );

    balancedCandidates.push(item);

    if (
      balancedCandidates.length >=
      Number(matchCount || FINAL_CANDIDATE_COUNT)
    ) {
      break;
    }
  }

  /*
    ---------------------------------------------------------
    Gemini technical review.
    ---------------------------------------------------------
  */

  const finalMatches = [];

  for (const item of balancedCandidates) {
    const candidate =
      item.candidate;

    const deterministic =
      item.scoreResult;

    let aiReview = null;

    if (
      deterministic.score >=
      MIN_AI_APPROVAL_CONFIDENCE
    ) {
      aiReview =
        await callGeminiTechnicalReview(
          source,
          candidate
        );
    }

    /*
      Gemini failure must NOT break the deterministic engine.
    */

    let finalScore =
      deterministic.score;

    let technicallyEquivalent =
      deterministic.score >=
      MIN_DISPLAY_SIMILARITY;

    let relationship =
      technicallyEquivalent
        ? "near"
        : "non-equivalent";

    let criticalConflict =
      false;

    let reason =
      deterministic.reason;

    let humanReviewRequired =
      true;

    let matchingFeatures = [];

    let conflictingFeatures = [];

    let missingFeatures = [];

    if (aiReview) {
      const aiConfidence =
        Number(
          aiReview.confidence
        );

      if (
        Number.isFinite(aiConfidence)
      ) {
        finalScore =
          clamp(
            deterministic.score * 0.60 +
              aiConfidence * 0.40
          );
      }

      criticalConflict =
        Boolean(
          aiReview.critical_conflict
        );

      if (criticalConflict) {
        technicallyEquivalent = false;
        finalScore = 0;
      } else {
        technicallyEquivalent =
          Boolean(
            aiReview.technically_equivalent
          ) &&
          finalScore >=
            MIN_DISPLAY_SIMILARITY;
      }

      relationship =
        clean(
          aiReview.relationship
        ) ||
        relationship;

      reason =
        clean(
          aiReview.reason
        ) ||
        reason;

      humanReviewRequired =
        aiReview.human_review_required !==
        false;

      matchingFeatures =
        Array.isArray(
          aiReview.matching_features
        )
          ? aiReview.matching_features
          : [];

      conflictingFeatures =
        Array.isArray(
          aiReview.conflicting_features
        )
          ? aiReview.conflicting_features
          : [];

      missingFeatures =
        Array.isArray(
          aiReview.missing_features
        )
          ? aiReview.missing_features
          : [];
    }

    /*
      Final safety rule:
      deterministic critical conflict always wins.
    */

    const deterministicConflict =
      hasCriticalConflict(
        source,
        candidate
      );

    if (deterministicConflict.conflict) {
      criticalConflict = true;
      technicallyEquivalent = false;
      finalScore = 0;

      reason =
        deterministicConflict.reason;
    }

    if (
      finalScore <
      MIN_DISPLAY_SIMILARITY
    ) {
      technicallyEquivalent = false;
    }

    finalMatches.push({
      id:
        getMaterialId(candidate),

      company:
        getCompany(candidate),

      company_id:
        candidate?.company_id ??
        candidate?.companyId ??
        null,

      material_number:
        getMaterialNumber(candidate),

      description:
        getDescription(candidate),

      specifications:
        getSpecifications(candidate),

      category:
        getCategory(candidate),

      bmg_code:
        candidate?.bmg_code ??
        candidate?.bmgCode ??
        null,

      bmg_id:
        candidate?.bmg_id ??
        candidate?.bmgId ??
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

      verified: Boolean(
        candidate?.verified ??
        candidate?.is_verified ??
        false
      ),

      technical_features:
        candidate?.technical_features ||
        getTechnicalFeatureText(candidate),

      similarity:
        Number(
          clamp(finalScore).toFixed(1)
        ),

      product_family:
        getProductFamily(candidate),

      source_product_family:
        getProductFamily(source),

      relationship,

      critical_conflict:
        criticalConflict,

      human_review_required:
        humanReviewRequired,

      matching_features:
        matchingFeatures,

      conflicting_features:
        conflictingFeatures,

      missing_features:
        missingFeatures,

      reason,

      is_equivalent:
        technicallyEquivalent,

      technical_match:
        technicallyEquivalent,

      classification:
        technicallyEquivalent
          ? "TECHNICAL_MATCH"
          : "TECHNICAL_REVIEW",

      displayable:
        finalScore >=
        MIN_DISPLAY_SIMILARITY,

      search_mode:
        "TECHNICAL_MATCH",
    });
  }

  finalMatches.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  /*
    Only display matches at/above threshold.
  */

  const displayMatches =
    finalMatches.filter(
      (match) =>
        match.similarity >=
        MIN_DISPLAY_SIMILARITY
    );

  return {
    success: true,

    matched:
      displayMatches.length > 0,

    search_mode:
      "TECHNICAL_MATCH",

    source_material_id:
      materialId,

    query:
      getDescription(source),

    total_results:
      displayMatches.length,

    matches:
      displayMatches,

    results:
      displayMatches,

    best_match:
      displayMatches[0] || null,

    data: {
      source_material:
        source,

      threshold:
        MIN_DISPLAY_SIMILARITY,

      match_count:
        displayMatches.length,

      results:
        displayMatches,
    },
  };
}

/* =========================================================
   EXISTING BMG LOOKUP FOR A MATERIAL
========================================================= */

async function findExistingBMGForMaterial(
  materialId
) {
  const tables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  for (const table of tables) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .eq("material_id", materialId)
          .limit(20);

      if (
        !error &&
        data?.length
      ) {
        return data[0];
      }
    } catch {
      continue;
    }
  }

  try {
    const { data } =
      await supabase
        .from("materials")
        .select("*")
        .eq("id", materialId)
        .maybeSingle();

    if (data) {
      const code =
        data?.bmg_code ??
        data?.bmgCode ??
        data?.ncs_code ??
        data?.ncsCode;

      const id =
        data?.bmg_id ??
        data?.bmgId ??
        data?.ncs_id ??
        data?.ncsId;

      if (code || id) {
        return {
          bmg_code: code || null,
          bmg_id: id || null,
          material_id: materialId,
        };
      }
    }
  } catch {
    // Ignore fallback failure.
  }

  return null;
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    const body =
      await request.json();

    const search =
      clean(
        body?.search ??
        body?.query ??
        body?.q ??
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
      -------------------------------------------------------
      BMG CODE SEARCH HAS HIGHEST PRIORITY.
      -------------------------------------------------------
    */

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
        )
      );
    }

    /*
      -------------------------------------------------------
      FREE-TEXT SEARCH.
      Search globally across ALL companies.
      -------------------------------------------------------
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
      -------------------------------------------------------
      MATERIAL TECHNICAL MATCH.
      -------------------------------------------------------
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
          "Provide search text, specification, category, bmgCode, or materialId.",
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

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const search =
      clean(
        searchParams.get("search") ||
        searchParams.get("query") ||
        ""
      );

    const specification =
      clean(
        searchParams.get(
          "specification"
        ) || ""
      );

    const category =
      clean(
        searchParams.get(
          "category"
        ) || ""
      );

    const bmgCode =
      clean(
        searchParams.get(
          "bmgCode"
        ) ||
        searchParams.get(
          "bmg_code"
        ) ||
        ""
      );

    const materialId =
      searchParams.get(
        "materialId"
      );

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
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

    if (materialId) {
      return NextResponse.json(
        await runMaterialTechnicalMatch(
          materialId,
          FINAL_CANDIDATE_COUNT,
          0.60
        )
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "AI Match Center API is running.",
        supported_searches: [
          "search",
          "specification",
          "category",
          "bmgCode",
          "materialId",
        ],
      }
    );
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
      },
      {
        status: 500,
      }
    );
  }
}