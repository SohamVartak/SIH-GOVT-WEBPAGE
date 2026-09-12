import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

/* =========================================================
   CONFIGURATION
========================================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

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
    .replace(/[^a-z0-9]/g, "");
}

function numberValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const match = String(value).match(
    /-?\d+(?:\.\d+)?/
  );

  if (!match) {
    return null;
  }

  const n = Number(match[0]);

  return Number.isFinite(n) ? n : null;
}

function clamp(value, min = 0, max = 100) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, numeric)
  );
}

function unique(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          value !== ""
      )
    ),
  ];
}

function isObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeJsonParse(value) {
  if (
    isObject(value) ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (
    !value ||
    typeof value !== "string"
  ) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* =========================================================
   GEMINI JSON EXTRACTION
========================================================= */

function extractGeminiJson(text) {
  const source = clean(text);

  if (!source) {
    return null;
  }

  const direct = safeJsonParse(source);

  if (direct) {
    return direct;
  }

  const fenced = source.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );

  if (fenced) {
    const parsed = safeJsonParse(
      fenced[1]
    );

    if (parsed) {
      return parsed;
    }
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const possibleJson =
      source.slice(
        firstBrace,
        lastBrace + 1
      );

    const parsed =
      safeJsonParse(possibleJson);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

/* =========================================================
   COMPANY / MATERIAL HELPERS
========================================================= */

function getCompany(material) {
  return clean(
    material?.company ||
      material?.company_name ||
      material?.companyName ||
      material?.cpse ||
      material?.owner ||
      material?.organization ||
      material?.organization_name ||
      material?.companyCode ||
      ""
  );
}

function getMaterialNumber(material) {
  return clean(
    material?.material_number ||
      material?.materialNumber ||
      material?.material_no ||
      material?.materialNo ||
      material?.material_code ||
      material?.materialCode ||
      material?.item_code ||
      material?.itemCode ||
      material?.part_number ||
      material?.partNumber ||
      ""
  );
}

function getDescription(material) {
  return clean(
    material?.description ||
      material?.material_description ||
      material?.materialDescription ||
      material?.short_description ||
      material?.shortDescription ||
      material?.name ||
      material?.material_name ||
      material?.materialName ||
      ""
  );
}

function getCategory(material) {
  return clean(
    material?.category ||
      material?.material_category ||
      material?.materialCategory ||
      material?.product_category ||
      material?.productCategory ||
      material?.family ||
      material?.product_family ||
      material?.productFamily ||
      ""
  );
}

function getSpecifications(material) {
  const value =
    material?.specifications ??
    material?.specification ??
    material?.technical_specifications ??
    material?.technicalSpecifications ??
    material?.technicalSpecification ??
    material?.spec ??
    "";

  if (
    isObject(value) ||
    Array.isArray(value)
  ) {
    return JSON.stringify(value);
  }

  return clean(value);
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

function detectProductFamilyFromText(value) {
  const text = normalize(value);

  if (!text) {
    return "generic";
  }

  /*
    IMPORTANT:
    More specific families MUST come before
    broader families.

    Example:
    "bearing housing" must never become
    simply "bearing".
  */

  const families = [
    {
      name: "bearing housing",
      patterns: [
        /\bbearing\s+housing\b/,
        /\bpillow\s*block\b/,
        /\bpillow\s*\/?\s*bearing\s+housing\b/,
        /\bsn\d{3,5}\b/,
        /\bucp\d{2,4}\b/,
        /\bufc\d{2,4}\b/,
        /\bplummer\s+block\b/,
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
      name: "ball bearing",
      patterns: [
        /\bball\s+bearing\b/,
      ],
    },

    {
      name: "roller bearing",
      patterns: [
        /\broller\s+bearing\b/,
        /\btapered\s+roller\b/,
        /\bcylindrical\s+roller\b/,
        /\bneedle\s+bearing\b/,
        /\bthrust\s+bearing\b/,
      ],
    },

    {
      name: "bearing",
      patterns: [
        /\bbearing\b/,
      ],
    },

    {
      name: "gate valve",
      patterns: [
        /\bgate\s+valve\b/,
      ],
    },

    {
      name: "globe valve",
      patterns: [
        /\bglobe\s+valve\b/,
      ],
    },

    {
      name: "ball valve",
      patterns: [
        /\bball\s+valve\b/,
      ],
    },

    {
      name: "butterfly valve",
      patterns: [
        /\bbutterfly\s+valve\b/,
      ],
    },

    {
      name: "check valve",
      patterns: [
        /\bcheck\s+valve\b/,
      ],
    },

    {
      name: "control valve",
      patterns: [
        /\bcontrol\s+valve\b/,
      ],
    },

    {
      name: "needle valve",
      patterns: [
        /\bneedle\s+valve\b/,
      ],
    },

    {
      name: "valve",
      patterns: [
        /\bvalve\b/,
      ],
    },

    {
      name: "centrifugal pump",
      patterns: [
        /\bcentrifugal\s+pump\b/,
      ],
    },

    {
      name: "reciprocating pump",
      patterns: [
        /\breciprocating\s+pump\b/,
      ],
    },

    {
      name: "gear pump",
      patterns: [
        /\bgear\s+pump\b/,
      ],
    },

    {
      name: "submersible pump",
      patterns: [
        /\bsubmersible\s+pump\b/,
      ],
    },

    {
      name: "pump",
      patterns: [
        /\bpump\b/,
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
      name: "o-ring",
      patterns: [
        /\bo[\s-]?ring\b/,
        /\bo\s+ring\b/,
      ],
    },

    {
      name: "spiral wound gasket",
      patterns: [
        /\bspiral\s+wound\s+gasket\b/,
      ],
    },

    {
      name: "gasket",
      patterns: [
        /\bgasket\b/,
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

function getProductFamily(materialOrText) {
  if (typeof materialOrText === "string") {
    return detectProductFamilyFromText(
      materialOrText
    );
  }

  const material =
    materialOrText || {};

  /*
    Strong description evidence gets priority
    over a vague category such as "bearing".

    This fixes:
      category = Bearing
      description = Bearing Housing SN...
    being classified as "bearing".
  */

  const strongFields = [
    getDescription(material),
    material?.design_features,
    material?.designFeatures,
    material?.technical_features,
    material?.technicalFeatures,
    material?.other_attributes,
    material?.otherAttributes,
    getSpecifications(material),
  ];

  for (const field of strongFields) {
    const detected =
      detectProductFamilyFromText(field);

    if (detected !== "generic") {
      return detected;
    }
  }

  const explicitFields = [
    material?.product_family,
    material?.productFamily,
    material?.material_family,
    material?.materialFamily,
    material?.family,
    getCategory(material),
  ];

  for (const field of explicitFields) {
    const detected =
      detectProductFamilyFromText(field);

    if (detected !== "generic") {
      return detected;
    }

    const explicitFamily =
      normalize(field);

    if (
      explicitFamily &&
      explicitFamily.length <= 40
    ) {
      return explicitFamily;
    }
  }

  return "generic";
}

function detectQueryFamily(
  search,
  specification,
  category
) {
  /*
    Search text has highest priority.

    Example:
    search = "bearing housing"
    category = "bearing"

    The query should remain
    "bearing housing".
  */

  const sources = [
    clean(search),
    clean(specification),
    clean(category),
  ].filter(Boolean);

  /*
    Check the complete query first.
  */

  const combined =
    sources.join(" ");

  const combinedFamily =
    detectProductFamilyFromText(
      combined
    );

  if (
    combinedFamily !== "generic"
  ) {
    /*
      Explicitly preserve bearing housing.
    */
    if (
      normalize(combined).includes(
        "bearing housing"
      ) ||
      /\bpillow\s*block\b/i.test(
        combined
      )
    ) {
      return "bearing housing";
    }

    return combinedFamily;
  }

  return "generic";
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

  const jaccard =
    intersection / union;

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
      containment * 45
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

  if (
    x.includes(y) ||
    y.includes(x)
  ) {
    const shorter =
      Math.min(
        x.length,
        y.length
      );

    const longer =
      Math.max(
        x.length,
        y.length
      );

    return clamp(
      75 +
        (shorter /
          Math.max(
            1,
            longer
          )) *
          25
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

function numberSimilarity(a, b) {
  const na = numberValue(a);
  const nb = numberValue(b);

  if (na === null || nb === null) {
    return 0;
  }

  if (na === nb) {
    return 100;
  }

  const difference =
    Math.abs(na - nb);

  const denominator =
    Math.max(
      Math.abs(na),
      Math.abs(nb),
      1
    );

  return clamp(
    100 -
      (difference / denominator) *
        100
  );
}

/* =========================================================
   TECHNICAL ATTRIBUTE EXTRACTION
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

  result.dimensions.push(
    ...(source.match(
      /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|in)\b/gi
    ) || [])
  );

  result.dimensions.push(
    ...(source.match(
      /\b\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?(?:\s*[xX×]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm|m|inch|in)?\b/gi
    ) || [])
  );

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
    "fkm",
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
      /\b(?:6\d{3}|7\d{3}|n[uj]?\d{3,5}|nu\d{3,5}|nj\d{3,5}|n\d{3,5})[-a-z0-9]*\b/gi
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
    material?.productFamily,
    material?.material_family,
    material?.description,
    material?.short_description,
    material?.design_features,
    material?.designFeatures,
    material?.technical_features,
    material?.technicalFeatures,
    material?.other_attributes,
    material?.otherAttributes,
    material?.specifications,
    material?.specification,
    material?.technical_specifications,
    material?.technicalSpecification,
    material?.technical_attributes_text,
  ];

  for (const value of fields) {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      if (
        isObject(value) ||
        Array.isArray(value)
      ) {
        parts.push(
          JSON.stringify(value)
        );
      } else {
        parts.push(clean(value));
      }
    }
  }

  return unique(parts).join(" ");
}

/* =========================================================
   CRITICAL CONFLICT DETECTION
========================================================= */

function valuesOverlap(first, second) {
  const a = first.map(normalize);
  const b = second.map(normalize);

  return a.some((value) =>
    b.includes(value)
  );
}

function hasCriticalConflict(
  source,
  candidate
) {
  const sourceValues =
    extractTechnicalValues(
      getTechnicalFeatureText(source)
    );

  const candidateValues =
    extractTechnicalValues(
      getTechnicalFeatureText(candidate)
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
    const sourceNumbers =
      sourceDesignations
        .map(
          (value) =>
            value
              .match(
                /\d+(?:\.\d+)?/g
              )
              ?.join("-")
        )
        .filter(Boolean);

    const candidateNumbers =
      candidateDesignations
        .map(
          (value) =>
            value
              .match(
                /\d+(?:\.\d+)?/g
              )
              ?.join("-")
        )
        .filter(Boolean);

    const overlap =
      sourceNumbers.some(
        (value) =>
          candidateNumbers.includes(
            value
          )
      );

    const sourceFamily =
      getProductFamily(source);

    const candidateFamily =
      getProductFamily(candidate);

    if (
      !overlap &&
      sourceFamily === candidateFamily &&
      [
        "bearing",
        "ball bearing",
        "roller bearing",
        "bearing housing",
        "valve",
        "flange",
      ].includes(sourceFamily)
    ) {
      return {
        conflict: true,
        reason:
          "Different technical designation or size detected.",
      };
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
    !valuesOverlap(
      sourcePressure,
      candidatePressure
    )
  ) {
    return {
      conflict: true,
      reason:
        "Different pressure class or pressure rating detected.",
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
    !valuesOverlap(
      sourceVoltage,
      candidateVoltage
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

  /*
    Technical equivalence requires the same
    actual product family.

    Therefore:

      bearing != bearing housing
      valve != pump
      gasket != o-ring
  */

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

  /*
    If one side is known and the other is generic,
    do not automatically declare equivalence.
  */

  if (
    sourceFamily !== "generic" &&
    candidateFamily === "generic"
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        `Candidate product family could not be verified as ${sourceFamily}.`,
    };
  }

  if (
    sourceFamily === "generic" &&
    candidateFamily !== "generic"
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        "Source product family could not be verified.",
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
      sourceFamily ===
      candidateFamily
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
    candidateFamily ===
      sourceFamily
  ) {
    score += 5;
  }

  return {
    score: clamp(score),
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

async function loadMaterialById(
  materialId
) {
  const numericId =
    Number(materialId);

  if (
    !Number.isFinite(numericId)
  ) {
    return null;
  }

  /*
    NEVER use .single()
    NEVER use .maybeSingle()

    Duplicate rows must not crash
    the API.
  */

  const { data, error } =
    await supabase
      .from("materials")
      .select("*")
      .eq("id", numericId)
      .limit(1);

  if (error) {
    throw new Error(
      `Unable to load source material: ${error.message}`
    );
  }

  return Array.isArray(data) &&
    data.length
    ? data[0]
    : null;
}

async function loadMaterialsByIds(
  ids
) {
  const cleanIds = unique(
    ids
      .filter(
        (id) =>
          id !== null &&
          id !== undefined &&
          id !== ""
      )
      .map(String)
  );

  if (!cleanIds.length) {
    return [];
  }

  const results = [];
  const chunkSize = 500;

  for (
    let i = 0;
    i < cleanIds.length;
    i += chunkSize
  ) {
    const chunk =
      cleanIds.slice(
        i,
        i + chunkSize
      );

    const numericIds =
      chunk
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
        numericIds.length ===
        chunk.length
      ) {
        query = query.in(
          "id",
          numericIds
        );
      } else {
        query = query.in(
          "id",
          chunk
        );
      }

      const { data, error } =
        await query;

      if (!error && data) {
        results.push(...data);
      }
    } catch {
      continue;
    }
  }

  return results;
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

        result[materialId].push(
          row
        );
      }

      break;
    } catch {
      continue;
    }
  }

  return result;
}

async function loadBMGMappings() {
  const tables = [
    "material_bmg_mapping",
    "material_ncs_mapping",
  ];

  const allMappings = [];

  for (const table of tables) {
    try {
      const { data, error } =
        await supabase
          .from(table)
          .select("*")
          .limit(
            MAX_CATALOG_RESULTS
          );

      if (error) {
        console.warn(
          `Could not load ${table}:`,
          error.message
        );
        continue;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          allMappings.push({
            ...row,
            _mapping_table: table,
          });
        }
      }
    } catch (error) {
      console.warn(
        `Exception while loading ${table}:`,
        error?.message ||
          error
      );
    }
  }

  return allMappings;
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
    return Object.entries(
      attributes
    )
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
    attributesToText(
      attributes
    );

  return {
    ...material,

    technical_attributes_text:
      attributeText,

    technical_features: [
      getSpecifications(
        material
      ),
      getDescription(
        material
      ),
      getCategory(
        material
      ),
      material?.product_family,
      material?.design_features,
      material?.other_attributes,
      material?.technical_features,
      attributeText,
    ]
      .filter(Boolean)
      .join(" "),

    product_family:
      getProductFamily(
        material
      ),
  };
}

function enrichMaterials(
  materials,
  attributeMap
) {
  return materials.map(
    (material) => {
      const id =
        getMaterialId(
          material
        );

      return enrichMaterial(
        material,
        attributeMap[id] || []
      );
    }
  );
}

/* =========================================================
   BMG CODE EXTRACTION
========================================================= */

function getBMGCodeFromRow(row) {
  if (!row) {
    return null;
  }

  const directCode =
    row.bmg_code ??
    row.bmgCode ??
    row.bmg_identity ??
    row.bmgIdentity ??
    row.bmg_standard_code ??
    row.bmgStandardCode ??
    row.bmg_standard_identity ??
    row.bmgStandardIdentity ??
    row.ncs_code ??
    row.ncsCode ??
    row.ncs_identity ??
    row.ncsIdentity ??
    row.standard_code ??
    row.standardCode ??
    row.standard_identity ??
    row.standardIdentity ??
    row.identity_code ??
    row.identityCode ??
    row.identity ??
    null;

  if (
    directCode !== null &&
    directCode !== undefined &&
    clean(directCode)
  ) {
    return clean(
      directCode
    );
  }

  for (const [key, value] of Object.entries(row)) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const normalizedKey =
      normalize(key).replace(
        /\s+/g,
        "_"
      );

    /*
      NEVER treat company material numbers
      as BMG identities.
    */

    if (
      normalizedKey.includes(
        "material_number"
      ) ||
      normalizedKey.includes(
        "material_no"
      ) ||
      normalizedKey.includes(
        "materialnumber"
      ) ||
      normalizedKey.includes(
        "materialno"
      ) ||
      normalizedKey.includes(
        "part_number"
      ) ||
      normalizedKey.includes(
        "part_no"
      ) ||
      normalizedKey.includes(
        "item_number"
      ) ||
      normalizedKey.includes(
        "item_no"
      ) ||
      normalizedKey.includes(
        "company_material"
      ) ||
      normalizedKey.includes(
        "company_part"
      ) ||
      normalizedKey.includes(
        "company_item"
      )
    ) {
      continue;
    }

    if (
      normalizedKey.includes(
        "bmg"
      ) &&
      (
        normalizedKey.includes(
          "code"
        ) ||
        normalizedKey.includes(
          "identity"
        ) ||
        normalizedKey.includes(
          "standard"
        ) ||
        normalizedKey.includes(
          "number"
        )
      )
    ) {
      return clean(value);
    }

    if (
      normalizedKey.includes(
        "ncs"
      ) &&
      (
        normalizedKey.includes(
          "code"
        ) ||
        normalizedKey.includes(
          "identity"
        ) ||
        normalizedKey.includes(
          "standard"
        ) ||
        normalizedKey.includes(
          "number"
        )
      )
    ) {
      return clean(value);
    }

    if (
      normalizedKey.includes(
        "standard"
      ) &&
      (
        normalizedKey.includes(
          "code"
        ) ||
        normalizedKey.includes(
          "identity"
        ) ||
        normalizedKey.includes(
          "number"
        )
      )
    ) {
      return clean(value);
    }

    if (
      normalizedKey.includes(
        "identity"
      ) &&
      (
        normalizedKey.includes(
          "code"
        ) ||
        normalizedKey.includes(
          "number"
        )
      )
    ) {
      return clean(value);
    }
  }

  if (
    row.code !== null &&
    row.code !== undefined &&
    looksLikeBMGCode(
      row.code
    )
  ) {
    return clean(
      row.code
    );
  }

  return null;
}

/* =========================================================
   BMG ID EXTRACTION
========================================================= */

function getBMGIdFromRow(row) {
  if (!row) {
    return null;
  }

  const directId =
    row.bmg_id ??
    row.bmgId ??
    row.bmgID ??
    row.ncs_id ??
    row.ncsId ??
    row.ncsID ??
    row.standard_id ??
    row.standardId ??
    row.standardID ??
    row.bmg_identity_id ??
    row.bmgIdentityId ??
    row.ncs_identity_id ??
    row.ncsIdentityId ??
    row.identity_id ??
    row.identityId ??
    null;

  if (
    directId !== null &&
    directId !== undefined
  ) {
    return directId;
  }

  for (const [key, value] of Object.entries(row)) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const normalizedKey =
      normalize(key).replace(
        /\s+/g,
        "_"
      );

    if (
      (
        normalizedKey.includes(
          "bmg"
        ) ||
        normalizedKey.includes(
          "ncs"
        ) ||
        normalizedKey.includes(
          "standard"
        ) ||
        normalizedKey.includes(
          "identity"
        )
      ) &&
      normalizedKey.endsWith(
        "_id"
      )
    ) {
      return value;
    }
  }

  if (
    row.id !== undefined &&
    row.id !== null &&
    getBMGCodeFromRow(row)
  ) {
    return row.id;
  }

  return null;
}

/* =========================================================
   MAPPING MATERIAL ID
========================================================= */

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

/* =========================================================
   BMG HELPERS
========================================================= */

function looksLikeBMGCode(value) {
  const text = clean(value);

  if (!text) {
    return false;
  }

  const normalized =
    normalizeCode(text);

  return (
    normalized.startsWith(
      "bmg"
    ) ||
    normalized.startsWith(
      "ncs"
    )
  );
}

function getMaterialBMGCode(
  material,
  mappingsByMaterialId = null
) {
  const materialId =
    getMaterialId(
      material
    );

  if (
    mappingsByMaterialId &&
    materialId !== null &&
    materialId !== undefined
  ) {
    const mappings =
      mappingsByMaterialId.get(
        String(materialId)
      ) || [];

    for (const mapping of mappings) {
      const code =
        getBMGCodeFromRow(
          mapping
        );

      if (code) {
        return code;
      }
    }
  }

  return (
    getBMGCodeFromRow(
      material
    ) || null
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

    const key =
      String(materialId);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push({
      code:
        getBMGCodeFromRow(
          mapping
        ),
      bmg_id:
        getBMGIdFromRow(
          mapping
        ),
    });
  }

  return map;
}

/* =========================================================
   GLOBAL SEARCH TEXT
========================================================= */

function buildSearchText(
  material
) {
  /*
    IMPORTANT:
    Company material number is intentionally
    NOT included here.

    BMG identity is the common identity.
  */

  return normalize(
    [
      getDescription(
        material
      ),
      getCategory(
        material
      ),
      material?.product_family ||
        getProductFamily(
          material
        ),
      getBMGCodeFromRow(
        material
      ),
      getSpecifications(
        material
      ),
      material?.technical_attributes_text,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/* =========================================================
   SEARCH FAMILY COMPATIBILITY
========================================================= */

function searchFamilyCompatible(
  queryFamily,
  candidateFamily
) {
  if (
    queryFamily ===
      "generic"
  ) {
    return true;
  }

  /*
    IMPORTANT FIX:

    A known query family can NEVER match
    a generic candidate.

    This is what prevents:

      bearing
      ->
      SPM analyzer
      fuse base
      TMT bars
      scrap
      structural steel

    from appearing simply because the old
    fallback score was 75.
  */

  if (
    candidateFamily ===
    "generic"
  ) {
    return false;
  }

  /*
    Catalog discovery:

    "bearing" can discover both:
      bearing
      bearing housing

    But technical equivalence still keeps
    those families separate.
  */

  if (
    queryFamily ===
    "bearing"
  ) {
    return (
      candidateFamily ===
        "bearing" ||
      candidateFamily ===
        "ball bearing" ||
      candidateFamily ===
        "roller bearing" ||
      candidateFamily ===
        "bearing housing"
    );
  }

  /*
    Broad bearing subtype searches can
    discover their parent bearing family.
  */

  if (
    queryFamily ===
    "ball bearing"
  ) {
    return (
      candidateFamily ===
        "ball bearing" ||
      candidateFamily ===
        "bearing"
    );
  }

  if (
    queryFamily ===
    "roller bearing"
  ) {
    return (
      candidateFamily ===
        "roller bearing" ||
      candidateFamily ===
        "bearing"
    );
  }

  return (
    queryFamily ===
    candidateFamily
  );
}

/* =========================================================
   GLOBAL CATALOG SCORE
========================================================= */

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
    getProductFamily(
      material
    );

  /*
    If query identifies a family,
    candidate must belong to that family.

    Generic candidates are rejected.
  */

  if (
    queryFamily !==
      "generic"
  ) {
    if (
      !searchFamilyCompatible(
        queryFamily,
        materialFamily
      )
    ) {
      return {
        score: 0,
        familyMatch: false,
        queryFamily,
        materialFamily,
      };
    }
  }

  let score = 0;

  if (
    queryFamily !==
      "generic" &&
    materialFamily !==
      "generic"
  ) {
    score += 65;
  }

  const descriptionScore =
    textSimilarity(
      queryText,
      getDescription(
        material
      )
    );

  score +=
    descriptionScore *
    0.20;

  if (category) {
    score +=
      textSimilarity(
        category,
        getCategory(
          material
        )
      ) * 0.10;
  }

  if (specification) {
    score +=
      textSimilarity(
        specification,
        getSpecifications(
          material
        )
      ) * 0.10;
  }

  if (
    material?.technical_attributes_text
  ) {
    score +=
      textSimilarity(
        queryText,
        material
          .technical_attributes_text
      ) * 0.05;
  }

  return {
    score: clamp(score),
    familyMatch:
      queryFamily ===
        "generic" ||
      searchFamilyCompatible(
        queryFamily,
        materialFamily
      ),
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

  /*
    A one-word known family search
    means "show the catalog family".

    Example:
      bearing
      valve
      pump
      gasket
  */

  const simpleFamilySearch =
    queryTokens.length === 1 &&
    queryFamily !==
      "generic";

  const results = [];

  for (const material of enriched) {
    const ranking =
      searchScoreForCatalog(
        search,
        specification,
        category,
        material
      );

    const materialFamily =
      getProductFamily(
        material
      );

    /*
      HARD FAMILY FILTER

      This is the primary fix for the
      incorrect "bearing" results.
    */

    if (
      queryFamily !==
        "generic"
    ) {
      if (
        !searchFamilyCompatible(
          queryFamily,
          materialFamily
        )
      ) {
        continue;
      }
    }

    const normalizedDescription =
      normalize(
        getDescription(
          material
        )
      );

    const normalizedCategory =
      normalize(
        getCategory(
          material
        )
      );

    const normalizedFamily =
      normalize(
        materialFamily
      );

    const normalizedSpecifications =
      normalize(
        getSpecifications(
          material
        )
      );

    const normalizedTechnicalAttributes =
      normalize(
        material
          ?.technical_attributes_text ||
          ""
      );

    let directKeywordMatch =
      false;

    /*
      For a family search, only mark direct
      match after the family filter passed.
    */

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
            ) ||
            normalizedTechnicalAttributes.includes(
              normalizedSearch
            )
          )
      );

    /*
      For simple family searches, every
      correctly classified family record
      is a valid catalog result.

      There is NO generic fallback here.
    */

    if (
      simpleFamilySearch
    ) {
      directKeywordMatch = true;
    }

    /*
      For normal searches, require an actual
      textual match or a positive family score.

      Never use an arbitrary score such as 75
      to include unrelated material.
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
      simpleFamilySearch
    ) {
      catalogScore =
        Math.max(
          catalogScore,
          65
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
      getMaterialId(
        material
      );

    const mappingsForMaterial =
      materialBmgMap.get(
        String(id)
      ) || [];

    const firstBmg =
      mappingsForMaterial.find(
        (mapping) =>
          mapping.code
      );

    const bmgCode =
      firstBmg?.code ||
      getBMGCodeFromRow(
        material
      ) ||
      null;

    results.push({
      id,

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
        firstBmg?.bmg_id ??
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

      bmg_search_text: [
        bmgCode,
        material?.ai_name,
        getDescription(
          material
        ),
      ]
        .filter(Boolean)
        .join(" "),

      is_equivalent: false,

      technical_match: false,

      classification:
        "CATALOG_SEARCH_RESULT",

      displayable: true,

      search_mode:
        "CATALOG_SEARCH",

      catalog_match: true,

      direct_keyword_match:
        directKeywordMatch,

      exact_phrase_match:
        exactPhraseMatch,
    });
  }

  results.sort((a, b) => {
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
  });

  const seenMaterialIds =
    new Set();

  const deduplicated =
    results.filter(
      (result) => {
        const key =
          String(
            result.id
          );

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

    query: [
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
      query: requestedCode,
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
    "bmg_standard",
    "ncs_standard",
    "bmg_identity",
    "bmg_identities",
  ];

  const bmgRecords = [];

  for (const table of bmgTables) {
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

      for (const row of data) {
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
            value !== null &&
            value !== undefined
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

      for (const row of data) {
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
            String(
              rowBmgId
            )
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

  for (const row of bmgRecords) {
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

  const mappingMaterialIds =
    mappingRows
      .map(
        getMappingMaterialId
      )
      .filter(
        (value) =>
          value !== null &&
          value !== undefined
      )
      .map(String);

  const materialIds =
    unique([
      ...mappingMaterialIds,
      ...directMaterialIds,
    ]);

  let materials = [];

  if (materialIds.length) {
    materials =
      await loadMaterialsByIds(
        materialIds
      );
  }

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

  for (const material of materials) {
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

              return (
                id !== null &&
                id !== undefined &&
                mappingId !== null &&
                mappingId !== undefined &&
                String(id) ===
                  String(
                    mappingId
                  )
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