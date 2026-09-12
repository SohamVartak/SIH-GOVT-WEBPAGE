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

const EMBEDDING_MODEL =
  "gemini-embedding-2";

const EMBEDDING_DIMENSIONS =
  768;

const VECTOR_RETRIEVAL_COUNT =
  100;

const FINAL_CANDIDATE_COUNT =
  30;

const MIN_DISPLAY_SIMILARITY =
  60;

const MIN_AI_APPROVAL_CONFIDENCE =
  60;

const MAX_CANDIDATES_PER_COMPANY =
  10;

const MAX_CATALOG_RESULTS =
  5000;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const supabase =
  createClient(
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
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /[/\\|,_;:()[\]{}]/g,
      " "
    )
    .replace(
      /[^a-z0-9.\- ]/g,
      " "
    )
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
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const match =
    String(value).match(
      /-?\d+(?:\.\d+)?/
    );

  if (!match) {
    return null;
  }

  const n =
    Number(match[0]);

  return Number.isFinite(n)
    ? n
    : null;
}

function clamp(
  value,
  min = 0,
  max = 100
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      numeric
    )
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
    return JSON.stringify(
      value
    );
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

function getProductFamily(
  materialOrText
) {
  if (
    typeof materialOrText ===
    "string"
  ) {
    return detectProductFamilyFromText(
      materialOrText
    );
  }

  const material =
    materialOrText || {};

  const explicitFamily =
    normalize(
      material?.product_family ||
        material?.productFamily ||
        material?.material_family ||
        material?.materialFamily ||
        material?.family ||
        ""
    );

  if (explicitFamily) {
    const detected =
      detectProductFamilyFromText(
        explicitFamily
      );

    if (
      detected !==
      "generic"
    ) {
      return detected;
    }

    if (
      explicitFamily.length <=
      40
    ) {
      return explicitFamily;
    }
  }

  const category =
    normalize(
      getCategory(
        material
      )
    );

  if (category) {
    const detected =
      detectProductFamilyFromText(
        category
      );

    if (
      detected !==
      "generic"
    ) {
      return detected;
    }
  }

  const description =
    normalize(
      getDescription(
        material
      )
    );

  if (description) {
    const detected =
      detectProductFamilyFromText(
        description
      );

    if (
      detected !==
      "generic"
    ) {
      return detected;
    }
  }

  const designFeatures =
    normalize(
      material?.design_features ||
        material?.designFeatures ||
        material?.technical_features_short ||
        material?.technicalFeatures ||
        ""
    );

  if (designFeatures) {
    const detected =
      detectProductFamilyFromText(
        designFeatures
      );

    if (
      detected !==
      "generic"
    ) {
      return detected;
    }
  }

  const otherAttributes =
    normalize(
      material?.other_attributes ||
        material?.otherAttributes ||
        ""
    );

  if (otherAttributes) {
    const detected =
      detectProductFamilyFromText(
        otherAttributes
      );

    if (
      detected !==
      "generic"
    ) {
      return detected;
    }
  }

  return "generic";
}

function detectProductFamilyFromText(
  value
) {
  const text =
    normalize(value);

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

  for (
    const family of families
  ) {
    for (
      const pattern of
        family.patterns
    ) {
      if (
        pattern.test(text)
      ) {
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
  const ta =
    tokenize(a);

  const tb =
    tokenize(b);

  if (
    !ta.length ||
    !tb.length
  ) {
    return 0;
  }

  const setA =
    new Set(ta);

  const setB =
    new Set(tb);

  let intersection = 0;

  for (
    const token of setA
  ) {
    if (
      setB.has(token)
    ) {
      intersection++;
    }
  }

  const union =
    new Set([
      ...setA,
      ...setB,
    ]).size;

  if (!union) {
    return 0;
  }

  const jaccard =
    intersection /
    union;

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

function substringSimilarity(
  a,
  b
) {
  const x =
    normalize(a);

  const y =
    normalize(b);

  if (
    !x ||
    !y
  ) {
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

function textSimilarity(
  a,
  b
) {
  return Math.max(
    tokenSimilarity(
      a,
      b
    ),
    substringSimilarity(
      a,
      b
    )
  );
}

/* =========================================================
   NUMBER / TECHNICAL VALUE SIMILARITY
========================================================= */

function numberSimilarity(
  a,
  b
) {
  const na =
    numberValue(a);

  const nb =
    numberValue(b);

  if (
    na === null ||
    nb === null
  ) {
    return 0;
  }

  if (na === nb) {
    return 100;
  }

  const difference =
    Math.abs(
      na - nb
    );

  const denominator =
    Math.max(
      Math.abs(na),
      Math.abs(nb),
      1
    );

  const relativeDifference =
    difference /
    denominator;

  return clamp(
    100 -
      relativeDifference *
        100
  );
}

/* =========================================================
   CRITICAL ATTRIBUTE EXTRACTION
========================================================= */

function extractTechnicalValues(
  text
) {
  const source =
    clean(text);

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

  for (
    const pattern of
      dimensionPatterns
  ) {
    result.dimensions.push(
      ...(source.match(
        pattern
      ) || [])
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
    "fkm",
    "ceramic",
    "rubber",
  ];

  for (
    const material of
      materialWords
  ) {
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

  /*
    IMPORTANT:
    This captures bearing designations such as:

    6205
    6305
    6205-2RS
    NU2205
    NJ2205
    22205
  */

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

  for (
    const key of
      Object.keys(result)
  ) {
    result[key] =
      unique(
        result[key].map(
          clean
        )
      );
  }

  return result;
}

/* =========================================================
   TECHNICAL FEATURE TEXT
========================================================= */

function getTechnicalFeatureText(
  material
) {
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

  for (
    const value of fields
  ) {
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
          JSON.stringify(
            value
          )
        );
      } else {
        parts.push(
          clean(value)
        );
      }
    }
  }

  return unique(parts).join(
    " "
  );
}

/* =========================================================
   CRITICAL CONFLICT DETECTION
========================================================= */

function valuesOverlap(
  first,
  second
) {
  const a =
    first.map(normalize);

  const b =
    second.map(normalize);

  return a.some(
    (value) =>
      b.includes(value)
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

  const sourceValues =
    extractTechnicalValues(
      sourceText
    );

  const candidateValues =
    extractTechnicalValues(
      candidateText
    );

  /*
    ---------------------------------------------------------
    BEARING / PRODUCT DESIGNATION
    ---------------------------------------------------------
  */

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
            value.match(
              /\d+(?:\.\d+)?/g
            )?.join("-")
        )
        .filter(Boolean);

    const candidateNumbers =
      candidateDesignations
        .map(
          (value) =>
            value.match(
              /\d+(?:\.\d+)?/g
            )?.join("-")
        )
        .filter(Boolean);

    if (
      sourceNumbers.length &&
      candidateNumbers.length
    ) {
      const overlap =
        sourceNumbers.some(
          (value) =>
            candidateNumbers.includes(
              value
            )
        );

      const sourceFamily =
        getProductFamily(
          source
        );

      const candidateFamily =
        getProductFamily(
          candidate
        );

      if (
        !overlap &&
        sourceFamily ===
          candidateFamily &&
        (
          sourceFamily ===
            "bearing" ||
          sourceFamily ===
            "bearing housing" ||
          sourceFamily ===
            "valve" ||
          sourceFamily ===
            "flange"
        )
      ) {
        return {
          conflict: true,
          reason:
            "Different technical designation or size detected.",
        };
      }
    }
  }

  /*
    ---------------------------------------------------------
    PRESSURE
    ---------------------------------------------------------
  */

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

  /*
    ---------------------------------------------------------
    VOLTAGE
    ---------------------------------------------------------
  */

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

  /*
    ---------------------------------------------------------
    MATERIAL
    ---------------------------------------------------------
  */

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
              candidateValue ===
                value ||
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

  /*
    ---------------------------------------------------------
    STANDARD
    ---------------------------------------------------------
  */

  const sourceStandards =
    sourceValues.standards.map(
      normalize
    );

  const candidateStandards =
    candidateValues.standards.map(
      normalize
    );

  if (
    sourceStandards.length &&
    candidateStandards.length
  ) {
    /*
      Standards are not always enough by themselves
      to reject equivalence, but explicit conflicting
      standards are considered a warning.
    */
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
    getProductFamily(
      source
    );

  const candidateFamily =
    getProductFamily(
      candidate
    );

  /*
    Product family is mandatory whenever both
    products have a recognizable family.
  */

  if (
    sourceFamily !==
      "generic" &&
    candidateFamily !==
      "generic" &&
    sourceFamily !==
      candidateFamily
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

  if (
    conflictResult.conflict
  ) {
    return {
      score: 0,
      conflict: true,
      reason:
        conflictResult.reason,
    };
  }

  const descriptionScore =
    textSimilarity(
      getDescription(
        source
      ),
      getDescription(
        candidate
      )
    );

  const categoryScore =
    textSimilarity(
      getCategory(source),
      getCategory(
        candidate
      )
    );

  const sourceFeatures =
    getTechnicalFeatureText(
      source
    );

  const candidateFeatures =
    getTechnicalFeatureText(
      candidate
    );

  const featureScore =
    textSimilarity(
      sourceFeatures,
      candidateFeatures
    );

  let familyScore = 0;

  if (
    sourceFamily !==
      "generic" &&
    candidateFamily !==
      "generic"
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

  for (
    const field of
      criticalFields
  ) {
    const a =
      sourceValues[field] ||
      [];

    const b =
      candidateValues[field] ||
      [];

    if (
      !a.length ||
      !b.length
    ) {
      continue;
    }

    criticalComparisons++;

    let best = 0;

    for (
      const av of a
    ) {
      for (
        const bv of b
      ) {
        best =
          Math.max(
            best,
            textSimilarity(
              av,
              bv
            ),
            numberSimilarity(
              av,
              bv
            )
          );
      }
    }

    criticalScore +=
      best;
  }

  if (
    criticalComparisons > 0
  ) {
    criticalScore =
      criticalScore /
      criticalComparisons;
  }

  let score =
    descriptionScore *
      0.30 +
    categoryScore *
      0.10 +
    featureScore *
      0.20 +
    familyScore *
      0.25;

  if (
    criticalComparisons > 0
  ) {
    score +=
      criticalScore *
      0.15;
  } else {
    score *= 0.90;
  }

  if (
    sourceFamily !==
      "generic" &&
    candidateFamily ===
      sourceFamily
  ) {
    score += 5;
  }

  score =
    clamp(score);

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
  const {
    data,
    error,
  } =
    await supabase
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

async function loadMaterialAttributes(
  materialIds
) {
  if (
    !materialIds.length
  ) {
    return {};
  }

  const possibleTables = [
    "material_attributes",
    "material_attribute",
    "technical_attributes",
    "material_specs",
  ];

  const result = {};

  for (
    const table of
      possibleTables
  ) {
    try {
      const {
        data,
        error,
      } =
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

      for (
        const row of data
      ) {
        const materialId =
          row.material_id ??
          row.materialId ??
          row.materialID;

        if (
          materialId === null ||
          materialId ===
            undefined
        ) {
          continue;
        }

        if (
          !result[materialId]
        ) {
          result[materialId] =
            [];
        }

        result[
          materialId
        ].push(row);
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
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(MAX_CATALOG_RESULTS);

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
        error?.message || error
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

  if (
    Array.isArray(
      attributes
    )
  ) {
    return attributes
      .map((row) => {
        if (
          !isObject(row)
        ) {
          return clean(row);
        }

        return Object.entries(
          row
        )
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
              `${key}: ${clean(
                value
              )}`
          )
          .join(" ");
      })
      .join(" ");
  }

  if (
    isObject(attributes)
  ) {
    return Object.entries(
      attributes
    )
      .map(
        ([key, value]) =>
          `${key}: ${clean(
            value
          )}`
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

    technical_features:
      [
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
        attributeMap[
          id
        ] || []
      );
    }
  );
}

/* =========================================================
   BMG CODE EXTRACTION
========================================================= */

function getBMGCodeFromRow(
  row
) {
  if (!row) {
    return null;
  }

  /*
    Known explicit BMG/NCS identity fields.
  */

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

  /*
    Some schemas use names such as:

      bmg_standard
      bmg_identity_number
      bmg_code_value
      ncs_standard_code
      standard_identity_number

    Therefore inspect all keys.

    IMPORTANT:
    Company material numbers are NOT accepted.
  */

  const entries =
    Object.entries(row);

  for (
    const [key, value] of
      entries
  ) {
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
      Explicitly ignore company/material-number
      fields so they cannot become BMG identity.
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
      )
    ) {
      continue;
    }

    /*
      BMG fields.
    */

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

    /*
      NCS fields.
    */

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

    /*
      Standard fields.
    */

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

    /*
      Generic identity fields.
    */

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

  return null;
}

/* =========================================================
   BMG ID EXTRACTION
========================================================= */

function getBMGIdFromRow(
  row
) {
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
    row.bmg_identity_id ??
    row.identity_id ??
    row.identityId ??
    null;

  if (
    directId !== null &&
    directId !== undefined
  ) {
    return directId;
  }

  const entries =
    Object.entries(row);

  for (
    const [key, value] of
      entries
  ) {
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
        )
      ) &&
      normalizedKey.endsWith(
        "_id"
      )
    ) {
      return value;
    }
  }

  /*
    Only use a generic id when the row itself
    clearly represents a BMG/NCS identity.
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

/* =========================================================
   MAPPING MATERIAL ID
========================================================= */

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
    row.material ??
    row.company_material_id ??
    row.companyMaterialId ??
    row.material_record_id ??
    row.materialRecordId ??
    row.item_material_id ??
    row.itemMaterialId ??
    null
  );
}

/* =========================================================
   SEARCH / BMG CODE HELPERS
========================================================= */

function looksLikeBMGCode(
  value
) {
  const text =
    clean(value);

  if (!text) {
    return false;
  }

  const normalized =
    normalizeCode(
      text
    );

  return (
    normalized.startsWith(
      "bmg-"
    ) ||
    normalized.startsWith(
      "bmg"
    ) ||
    normalized.startsWith(
      "ncs-"
    ) ||
    normalized.startsWith(
      "ncs"
    )
  );
}

/* =========================================================
   GLOBAL CATALOG SEARCH TEXT
========================================================= */

function buildSearchText(
  material
) {
  const description =
    getDescription(
      material
    );

  const category =
    getCategory(
      material
    );

  const family =
    material?.product_family ||
    getProductFamily(
      material
    );

  const bmgCode =
    getBMGCodeFromRow(
      material
    );

  const specifications =
    getSpecifications(
      material
    );

  const technicalAttributes =
    material?.technical_attributes_text ||
    "";

  /*
    Company material number is intentionally
    NOT included.
  */

  return normalize(
    [
      description,
      category,
      family,
      bmgCode,
      specifications,
      technicalAttributes,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/* =========================================================
   GLOBAL CATALOG SEARCH SCORE
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

  const description =
    getDescription(
      material
    );

  const materialCategory =
    getCategory(
      material
    );

  const materialSpecifications =
    getSpecifications(
      material
    );

  const materialTechnicalAttributes =
    material?.technical_attributes_text ||
    "";

  let score = 0;

  if (
    queryFamily !==
      "generic" &&
    materialFamily !==
      "generic"
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
    descriptionScore *
    0.20;

  if (category) {
    score +=
      textSimilarity(
        category,
        materialCategory
      ) *
      0.10;
  }

  if (specification) {
    score +=
      textSimilarity(
        specification,
        materialSpecifications
      ) *
      0.10;
  }

  if (
    materialTechnicalAttributes
  ) {
    score +=
      textSimilarity(
        queryText,
        materialTechnicalAttributes
      ) *
      0.05;
  }

  const normalizedQuery =
    normalize(
      queryText
    );

  const normalizedDescription =
    normalize(
      description
    );

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
    score: clamp(
      score
    ),

    familyMatch:
      queryFamily ===
        "generic" ||
      materialFamily ===
        "generic" ||
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

  const enriched =
    enrichMaterials(
      materials,
      attributeMap
    );

  const materialBmgMap =
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
      materialId ===
        undefined
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
        String(
          materialId
        )
      )
    ) {
      materialBmgMap.set(
        String(
          materialId
        ),
        []
      );
    }

    materialBmgMap
      .get(
        String(
          materialId
        )
      )
      .push({
        code,
        bmg_id:
          bmgId,
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
    queryTokens.length ===
      1 &&
    queryFamily !==
      "generic";

  for (
    const material of
      enriched
  ) {
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
      IMPORTANT:

      Searching "bearing" should return
      ALL bearing materials, not only
      technically equivalent materials.
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
        material?.technical_attributes_text ||
          ""
      );

    let directKeywordMatch =
      false;

    for (
      const token of
        queryTokens
    ) {
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
        directKeywordMatch =
          true;

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
      materialFamily ===
        queryFamily
    ) {
      directKeywordMatch =
        true;
    }

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

    if (
      exactPhraseMatch
    ) {
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
        firstBmg?.code ||
        getBMGCodeFromRow(
          material
        ) ||
        null,

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

      bmg_search_text:
        [
          firstBmg?.code,
          getBMGCodeFromRow(
            material
          ),
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
      finalResults.length >
      0,

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

  /*
    =======================================================
    STEP 1
    Load all possible BMG master tables.
    =======================================================
  */

  const bmgTables = [
    "bmg_materials",
    "ncs_materials",
    "bmg_master",
    "ncs_master",
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

  /*
    =======================================================
    STEP 2
    Get BMG IDs.
    =======================================================
  */

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

  /*
    =======================================================
    STEP 3
    Load mapping tables.
    =======================================================
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
          rowBmgId !==
            undefined &&
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

  /*
    =======================================================
    STEP 4
    Collect material IDs.
    =======================================================
  */

  const directMaterialIds =
    [];

  for (
    const row of
      bmgRecords
  ) {
    const directId =
      getMappingMaterialId(
        row
      );

    if (
      directId !== null &&
      directId !==
        undefined
    ) {
      directMaterialIds.push(
        String(
          directId
        )
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
            value !==
              undefined
        )
        .map(String),

      ...directMaterialIds,
    ]);

  /*
    =======================================================
    STEP 5
    Load mapped materials.
    =======================================================
  */

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
        materials =
          data;
      }
    } catch {
      materials = [];
    }
  }

  /*
    =======================================================
    STEP 6
    DIRECT MATERIAL BMG FALLBACK

    This is important because some database schemas
    store BMG identity directly inside materials.
    =======================================================
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

        if (
          materialBmgId !==
            null &&
          materialBmgId !==
            undefined &&
          bmgIds.includes(
            String(
              materialBmgId
            )
          )
        ) {
          return true;
        }

        return false;
      }
    );

  /*
    =======================================================
    STEP 7
    Merge all material sources.
    =======================================================
  */

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

  /*
    =======================================================
    STEP 8
    Additional mapping fallback.
    =======================================================
  */

  if (
    materialById.size ===
      0 &&
    mappingRows.length
  ) {
    const mappingMaterialIds =
      unique(
        mappingRows
          .map(
            getMappingMaterialId
          )
          .filter(
            (value) =>
              value !== null &&
              value !==
                undefined
          )
          .map(String)
      );

    if (
      mappingMaterialIds.length
    ) {
      const numericIds =
        mappingMaterialIds
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
              mappingMaterialIds
            );
        }

        const {
          data,
          error,
        } =
          await query;

        if (
          !error &&
          data?.length
        ) {
          for (
            const material of
              data
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
        }
      } catch {
        /* Ignore fallback error */
      }
    }
  }

  materials = [
    ...materialById.values(),
  ];

  /*
    =======================================================
    STEP 9
    Enrich materials.
    =======================================================
  */

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

  /*
    =======================================================
    STEP 10
    Build BMG group result.
    =======================================================
  */

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
                id !==
                  undefined &&
                mappingId !==
                  null &&
                mappingId !==
                  undefined &&
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

          similarity:
            100,

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
              getDescription(
                material
              ),
            ]
              .filter(Boolean)
              .join(" "),

          is_equivalent:
            true,

          technical_match:
            true,

          classification:
            "BMG_GROUP_MEMBER",

          displayable:
            true,

          search_mode:
            "BMG_GROUP_SEARCH",
        };
      }
    );

  /*
    =======================================================
    STEP 11
    Deduplicate by material ID.
    =======================================================
  */

  const seen =
    new Set();

  const deduplicated =
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

      direct_material_match_count:
        directBmgMaterialMatches.length,

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

function extractGeminiJson(
  text
) {
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

  if (
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

Your task is to compare ONE source industrial material
against candidate materials from other companies.

IMPORTANT RULES:

1. Compare technical specifications, NOT company material numbers.
2. Same product family is necessary for strong equivalence.
3. Critical differences prevent equivalence.
4. Bearing 6205 and bearing 6305 are NOT equivalent.
5. Bearing 6205-2RS and a different bearing designation are NOT automatically equivalent.
6. PN16 and PN40 are NOT equivalent where pressure rating matters.
7. SS304 and SS316 are NOT automatically equivalent.
8. 230V and 415V are NOT equivalent.
9. Different dimensions affecting interchangeability are NOT equivalent.
10. Do not invent missing specifications.
11. Missing information should reduce confidence rather than being guessed.
12. Gemini is ONLY a technical reviewer.
13. The deterministic technical engine remains authoritative.
14. If products are technically equivalent, they can belong to the same BMG standard group.

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
        response?.text ||
        response
          ?.candidates?.[0]
          ?.content
          ?.parts?.[0]
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
  matchCount =
    FINAL_CANDIDATE_COUNT,
  matchThreshold = 0.60
) {
  const numericMaterialId =
    Number(
      materialId
    );

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

  if (
    !sourceMaterial
  ) {
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
      Do not compare a material against another
      material belonging to the same company.
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
    Number(
      matchCount
    );

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
    ) *
    100;

  const results =
    limitedCandidates
      .map(
        (item) => {
          /*
            THIS IS THE IMPORTANT LINE THAT WAS
            BROKEN IN YOUR CURRENT FILE.
          */

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
              getBMGCodeFromRow(
                candidate
              ),

            bmg_id:
              getBMGIdFromRow(
                candidate
              ),

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
        }
      )
      .filter(
        (result) =>
          result.technical_match
      );

  results.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  /*
    =======================================================
    IMPORTANT:

    If a technically equivalent candidate already has
    a BMG code, reuse it.

    The route does NOT generate a new BMG code here.
    =======================================================
  */

  let sharedBmgCode = null;

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

  /*
    If the source itself already has a BMG code,
    preserve it.
  */

  const sourceBmgCode =
    getBMGCodeFromRow(
      source
    );

  if (
    sourceBmgCode
  ) {
    sharedBmgCode =
      sourceBmgCode;
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
      finalResults.length >
      0,

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

  /*
    1. Existing BMG code directly on material.
  */

  const directCode =
    getBMGCodeFromRow(
      material
    );

  if (directCode) {
    return directCode;
  }

  /*
    2. Existing BMG mapping.
  */

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

  /*
    3. Find technically equivalent material
       that already belongs to a BMG group.
  */

  const candidates =
    allMaterials.filter(
      (candidate) => {
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
          return false;
        }

        const sourceCompany =
          normalize(
            getCompany(
              material
            )
          );

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
          return false;
        }

        return true;
      }
    );

  for (
    const candidate of
      candidates
  ) {
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
      =======================================================
      PRIORITY 1
      Explicit BMG code search.
      =======================================================
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
      =======================================================
      PRIORITY 2
      If search itself looks like a BMG code,
      treat it as BMG group search.
      =======================================================
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
      =======================================================
      PRIORITY 3
      Selected material technical matching.

      This is important because the frontend can send
      both materialId and search text.
      =======================================================
    */

    if (
      materialId !== null &&
      materialId !== undefined &&
      materialId !== ""
    ) {
      const technicalResult =
        await runMaterialTechnicalMatch(
          materialId,
          matchCount,
          matchThreshold
        );

      return NextResponse.json(
        technicalResult
      );
    }

    /*
      =======================================================
      PRIORITY 4
      Global catalog search.

      This is used for queries such as:

        bearing
        valve
        o-ring
        6205 bearing
        stainless steel valve
        steam trap
        pump
      =======================================================
    */

    if (
      search ||
      specification ||
      category
    ) {
      const catalogResult =
        await searchEntireCatalog({
          search,
          specification,
          category,
        });

      return NextResponse.json(
        catalogResult
      );
    }

    /*
      =======================================================
      NO SEARCH
      =======================================================
    */

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

    /*
      =======================================================
      Explicit BMG search.
      =======================================================
    */

    if (bmgCode) {
      return NextResponse.json(
        await searchBMGGroup(
          bmgCode
        )
      );
    }

    /*
      =======================================================
      Search itself may be a BMG code.
      =======================================================
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
      =======================================================
      Selected material technical matching.
      =======================================================
    */

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

    /*
      =======================================================
      Global catalog search.
      =======================================================
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