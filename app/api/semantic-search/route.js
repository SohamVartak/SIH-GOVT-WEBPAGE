import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   CONFIG
========================================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const EMBEDDING_MODEL =
  "gemini-embedding-2";

const EMBEDDING_DIMENSIONS =
  768;

const APPROVAL_THRESHOLD =
  0.85;

/* =========================================================
   CLIENTS
========================================================= */

function getSupabase() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function getGemini() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Gemini API key is not configured."
    );
  }

  return new GoogleGenerativeAI(
    GEMINI_API_KEY
  );
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function json(
  data,
  status = 200
) {
  return Response.json(
    data,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
    a.length === 0 ||
    b.length === 0
  ) {
    return 0;
  }

  const length =
    Math.min(
      a.length,
      b.length
    );

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (
    let i = 0;
    i < length;
    i++
  ) {
    const x =
      Number(a[i]) || 0;

    const y =
      Number(b[i]) || 0;

    dot += x * y;
    normA += x * x;
    normB += y * y;
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
   GEMINI EMBEDDING
========================================================= */

async function createEmbedding(
  text
) {
  const genAI =
    getGemini();

  const model =
    genAI.getGenerativeModel({
      model:
        EMBEDDING_MODEL,
    });

  const result =
    await model.embedContent({
      content: {
        parts: [
          {
            text,
          },
        ],
      },
      outputDimensionality:
        EMBEDDING_DIMENSIONS,
    });

  const values =
    result?.embedding
      ?.values;

  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    throw new Error(
      "Gemini returned an empty embedding."
    );
  }

  return values;
}

/* =========================================================
   MATERIAL SEARCH TEXT
========================================================= */

function buildMaterialText(
  material
) {
  return [
    material.company,
    material.material_number,
    material.description,
    material.specifications,
    material.category,
  ]
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
    .join(" | ");
}

/* =========================================================
   LOAD MATERIALS
========================================================= */

async function loadMaterials(
  supabase
) {
  const {
    data,
    error,
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
    );

  if (error) {
    throw new Error(
      `Failed to load materials: ${error.message}`
    );
  }

  return data || [];
}

/* =========================================================
   LOAD COMPANY MATERIALS
========================================================= */

async function loadCompanyMaterials(
  supabase
) {
  const {
    data,
    error,
  } = await supabase
    .from("company_materials")
    .select("*");

  if (error) {
    throw new Error(
      `Failed to load company materials: ${error.message}`
    );
  }

  return data || [];
}

/* =========================================================
   RESOLVE MATERIAL → COMPANY MATERIAL
========================================================= */

/*
 * THIS IS THE MOST IMPORTANT FIX.
 *
 * materials.id is NOT the same thing as
 * company_materials.material_id.
 *
 * We resolve:
 *
 * materials.id
 *      ↓
 * company_id + material_number
 *      ↓
 * company_materials.company_id + company_material_code
 *      ↓
 * company_materials.material_id
 */

function findCompanyMaterialForMaterial(
  material,
  companyMaterials
) {
  if (!material) {
    return null;
  }

  const materialCompanyId =
    material.company_id;

  const materialCode =
    normalizeCode(
      material.material_number
    );

  /*
   * -------------------------------------------------------
   * Exact company ID + material code
   * -------------------------------------------------------
   */

  if (
    materialCompanyId !==
      null &&
    materialCompanyId !==
      undefined &&
    materialCode
  ) {
    const exact =
      companyMaterials.find(
        (row) =>
          String(
            row.company_id
          ) ===
            String(
              materialCompanyId
            ) &&
          normalizeCode(
            row.company_material_code
          ) === materialCode
      );

    if (exact) {
      return exact;
    }
  }

  /*
   * -------------------------------------------------------
   * Material code only fallback
   * -------------------------------------------------------
   */

  if (materialCode) {
    const matches =
      companyMaterials.filter(
        (row) =>
          normalizeCode(
            row.company_material_code
          ) === materialCode
      );

    if (
      matches.length ===
      1
    ) {
      return matches[0];
    }
  }

  return null;
}

/* =========================================================
   LOAD REJECTED MATERIALS
========================================================= */

/*
 * ai_code_approvals contains:
 *
 * company_material_id
 *
 * which points to:
 *
 * company_materials.material_id
 *
 * NOT materials.id.
 *
 * Therefore rejected IDs must be converted before
 * filtering materials.
 */

async function getRejectedMaterialIds(
  supabase,
  materials,
  companyMaterials
) {
  const {
    data: rejectedApprovals,
    error,
  } = await supabase
    .from("ai_code_approvals")
    .select(
      "company_material_id, approval_status"
    )
    .eq(
      "approval_status",
      "REJECTED"
    );

  if (error) {
    throw new Error(
      `Failed to load rejected approvals: ${error.message}`
    );
  }

  if (
    !rejectedApprovals ||
    rejectedApprovals.length === 0
  ) {
    return new Set();
  }

  const rejectedCompanyMaterialIds =
    new Set(
      rejectedApprovals
        .map(
          (row) =>
            String(
              row.company_material_id
            )
        )
        .filter(Boolean)
    );

  const rejectedActualMaterialIds =
    new Set();

  for (
    const material of materials
  ) {
    const companyMaterial =
      findCompanyMaterialForMaterial(
        material,
        companyMaterials
      );

    if (!companyMaterial) {
      continue;
    }

    if (
      rejectedCompanyMaterialIds.has(
        String(
          companyMaterial.material_id
        )
      )
    ) {
      rejectedActualMaterialIds.add(
        String(material.id)
      );
    }
  }

  return rejectedActualMaterialIds;
}

/* =========================================================
   LOAD EXISTING EMBEDDINGS
========================================================= */

async function loadEmbeddings(
  supabase
) {
  const {
    data,
    error,
  } = await supabase
    .from("material_embeddings")
    .select("*");

  if (error) {
    throw new Error(
      `Failed to load material embeddings: ${error.message}`
    );
  }

  return data || [];
}

/* =========================================================
   FIND EMBEDDING COLUMN
========================================================= */

function getEmbeddingFromRow(
  row
) {
  if (
    Array.isArray(
      row.embedding
    )
  ) {
    return row.embedding;
  }

  if (
    typeof row.embedding ===
    "string"
  ) {
    try {
      const parsed =
        JSON.parse(
          row.embedding
        );

      if (
        Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/* =========================================================
   CREATE / UPDATE EMBEDDING
========================================================= */

async function saveEmbedding(
  supabase,
  materialId,
  embedding,
  sourceText
) {
  /*
   * Delete existing embedding first.
   *
   * This avoids duplicate rows when the material has
   * already been embedded.
   */

  const {
    error: deleteError,
  } = await supabase
    .from("material_embeddings")
    .delete()
    .eq(
      "material_id",
      materialId
    );

  if (deleteError) {
    throw new Error(
      `Failed to replace old embedding: ${deleteError.message}`
    );
  }

  /*
   * Try the normal embedding insert.
   */

  const {
    error: insertError,
  } = await supabase
    .from("material_embeddings")
    .insert({
      material_id:
        materialId,
      embedding,
      source_text:
        sourceText,
    });

  if (insertError) {
    /*
     * Some versions of the table may not have
     * source_text.
     *
     * Retry with only the required columns.
     */

    const {
      error:
        fallbackError,
    } = await supabase
      .from(
        "material_embeddings"
      )
      .insert({
        material_id:
          materialId,
        embedding,
      });

    if (fallbackError) {
      throw new Error(
        `Failed to save embedding: ${fallbackError.message}`
      );
    }
  }
}

/* =========================================================
   ENSURE EMBEDDINGS
========================================================= */

async function ensureEmbeddings(
  supabase,
  materials,
  rejectedIds,
  existingEmbeddings
) {
  const embeddingMap =
    new Map();

  for (
    const row of
      existingEmbeddings
  ) {
    const embedding =
      getEmbeddingFromRow(
        row
      );

    if (
      embedding &&
      row.material_id !==
        null &&
      row.material_id !==
        undefined
    ) {
      embeddingMap.set(
        String(
          row.material_id
        ),
        embedding
      );
    }
  }

  const activeMaterials =
    materials.filter(
      (material) =>
        !rejectedIds.has(
          String(material.id)
        )
    );

  /*
   * Generate embeddings only when missing.
   */

  for (
    const material of
      activeMaterials
  ) {
    const key =
      String(
        material.id
      );

    if (
      embeddingMap.has(
        key
      )
    ) {
      continue;
    }

    const sourceText =
      buildMaterialText(
        material
      );

    if (!sourceText) {
      continue;
    }

    console.log(
      "Creating embedding for material:",
      material.id
    );

    const embedding =
      await createEmbedding(
        sourceText
      );

    await saveEmbedding(
      supabase,
      material.id,
      embedding,
      sourceText
    );

    embeddingMap.set(
      key,
      embedding
    );
  }

  return embeddingMap;
}

/* =========================================================
   BUILD STANDARD CODE
========================================================= */

function buildStandardCode(
  partName,
  bestMatches
) {
  const cleanName =
    normalizeText(
      partName
    )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 30);

  const companyCodes =
    bestMatches
      .map(
        (match) =>
          `${match.company}:${match.material_number}`
      )
      .join("|");

  /*
   * Simple deterministic hash.
   */

  let hash = 0;

  const text =
    `${cleanName}|${companyCodes}`;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    hash =
      (hash << 5) -
      hash +
      text.charCodeAt(i);

    hash |= 0;
  }

  const positiveHash =
    Math.abs(hash);

  const hashPart =
    positiveHash
      .toString(36)
      .toUpperCase()
      .slice(0, 8);

  return `BM-${hashPart}`;
}

/* =========================================================
   GROUP BEST MATCHES BY COMPANY
========================================================= */

function groupBestMatchesByCompany(
  matches
) {
  const groups =
    new Map();

  for (
    const match of
      matches
  ) {
    const companyKey =
      normalizeText(
        match.company
      );

    if (!companyKey) {
      continue;
    }

    if (
      !groups.has(
        companyKey
      )
    ) {
      groups.set(
        companyKey,
        []
      );
    }

    groups
      .get(companyKey)
      .push(match);
  }

  /*
   * Only the best result from each company is needed
   * for the Government approval queue.
   */

  const best = [];

  for (
    const companyMatches of
      groups.values()
  ) {
    companyMatches.sort(
      (a, b) =>
        b.similarity -
        a.similarity
    );

    best.push(
      companyMatches[0]
    );
  }

  best.sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );

  return best;
}

/* =========================================================
   CREATE APPROVAL QUEUE
========================================================= */

async function createApprovalQueue(
  supabase,
  partName,
  bestMatches
) {
  const eligible =
    bestMatches.filter(
      (match) =>
        match.similarity >=
        APPROVAL_THRESHOLD
    );

  if (
    eligible.length === 0
  ) {
    return [];
  }

  const standardCode =
    buildStandardCode(
      partName,
      eligible
    );

  const inserted =
    [];

  for (
    const match of
      eligible
  ) {
    /*
     * CRITICAL:
     *
     * match.material_id is materials.id.
     *
     * We must NOT insert that value into
     * ai_code_approvals.company_material_id.
     *
     * match.company_material_id is the actual
     * company_materials.material_id.
     */

    if (
      match.company_material_id ===
        null ||
      match.company_material_id ===
        undefined
    ) {
      console.warn(
        "Skipping approval because company_material_id could not be resolved:",
        match.material_id
      );

      continue;
    }

    const {
      data: existing,
      error:
        existingError,
    } = await supabase
      .from("ai_code_approvals")
      .select("id, approval_status")
      .eq(
        "company_material_id",
        match.company_material_id
      )
      .eq(
        "approval_status",
        "PENDING"
      )
      .maybeSingle();

    if (
      existingError
    ) {
      console.warn(
        "Existing approval lookup failed:",
        existingError
      );
    }

    /*
     * Do not create duplicate pending approval records.
     */

    if (existing) {
      inserted.push(
        existing
      );
      continue;
    }

    const {
      data,
      error,
    } = await supabase
      .from("ai_code_approvals")
      .insert({
        company_name:
          match.company,

        company_material_id:
          match.company_material_id,

        part_name:
          partName,

        company_material_code:
          match.material_number,

        ai_standard_code:
          standardCode,

        ai_confidence:
          match.similarity,

        approval_status:
          "PENDING",

        company_email:
          match.company_email ||
          null,

        email_status:
          "NOT_SENT",
      })
      .select("*")
      .single();

    if (error) {
      console.error(
        "APPROVAL INSERT ERROR:",
        error
      );

      throw new Error(
        `Failed to create approval queue record: ${error.message}`
      );
    }

    inserted.push(
      data
    );
  }

  return inserted;
}

/* =========================================================
   FIND COMPANY EMAIL
========================================================= */

function findCompanyEmail(
  material,
  companyMaterials
) {
  const companyMaterial =
    findCompanyMaterialForMaterial(
      material,
      companyMaterials
    );

  if (!companyMaterial) {
    return null;
  }

  return (
    companyMaterial.company_email ||
    companyMaterial.email ||
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
    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return json(
        {
          success: false,
          error:
            "Supabase server configuration is missing.",
        },
        500
      );
    }

    if (!GEMINI_API_KEY) {
      return json(
        {
          success: false,
          error:
            "Gemini API key is missing.",
        },
        500
      );
    }

    const body =
      await request.json();

    /*
     * -------------------------------------------------------
     * INPUT
     * -------------------------------------------------------
     *
     * Supported:
     *
     * {
     *   materialId: 4,
     *   matchCount: 10
     * }
     *
     * OR:
     *
     * {
     *   partName: "O-ring",
     *   specifications: "..."
     * }
     */

    const materialId =
      body.materialId ??
      null;

    const requestedPartName =
      String(
        body.partName ||
          body.part_name ||
          ""
      ).trim();

    const requestedSpecifications =
      String(
        body.specifications ||
          body.specification ||
          ""
      ).trim();

    const matchCount =
      Math.max(
        1,
        Math.min(
          Number(
            body.matchCount ||
              body.match_count ||
              10
          ),
          50
        )
      );

    const supabase =
      getSupabase();

    /*
     * -------------------------------------------------------
     * LOAD DATABASE
     * -------------------------------------------------------
     */

    const materials =
      await loadMaterials(
        supabase
      );

    const companyMaterials =
      await loadCompanyMaterials(
        supabase
      );

    /*
     * -------------------------------------------------------
     * FILTER REJECTED MATERIALS
     * -------------------------------------------------------
     */

    const rejectedIds =
      await getRejectedMaterialIds(
        supabase,
        materials,
        companyMaterials
      );

    const activeMaterials =
      materials.filter(
        (material) =>
          !rejectedIds.has(
            String(material.id)
          )
      );

    if (
      activeMaterials.length ===
      0
    ) {
      return json(
        {
          success: false,
          error:
            "No active materials are available for semantic search.",
        },
        404
      );
    }

    /*
     * -------------------------------------------------------
     * LOAD / GENERATE EMBEDDINGS
     * -------------------------------------------------------
     */

    const existingEmbeddings =
      await loadEmbeddings(
        supabase
      );

    const embeddingMap =
      await ensureEmbeddings(
        supabase,
        activeMaterials,
        rejectedIds,
        existingEmbeddings
      );

    /*
     * -------------------------------------------------------
     * DETERMINE QUERY
     * -------------------------------------------------------
     */

    let queryText =
      requestedPartName;

    let sourceMaterial =
      null;

    if (
      materialId !== null
    ) {
      sourceMaterial =
        activeMaterials.find(
          (material) =>
            String(
              material.id
            ) ===
            String(
              materialId
            )
        );

      if (
        !sourceMaterial
      ) {
        return json(
          {
            success: false,
            error:
              "The requested material does not exist or has been rejected.",
          },
          404
        );
      }

      queryText =
        buildMaterialText(
          sourceMaterial
        );
    } else if (
      requestedSpecifications
    ) {
      queryText =
        `${requestedPartName} | ${requestedSpecifications}`;
    }

    if (!queryText) {
      return json(
        {
          success: false,
          error:
            "A materialId, partName, or search text is required.",
        },
        400
      );
    }

    /*
     * -------------------------------------------------------
     * QUERY EMBEDDING
     * -------------------------------------------------------
     */

    const queryEmbedding =
      await createEmbedding(
        queryText
      );

    /*
     * -------------------------------------------------------
     * SEMANTIC MATCHING
     * -------------------------------------------------------
     */

    const matches =
      [];

    for (
      const material of
        activeMaterials
    ) {
      const embedding =
        embeddingMap.get(
          String(
            material.id
          )
        );

      if (
        !embedding
      ) {
        continue;
      }

      const similarity =
        cosineSimilarity(
          queryEmbedding,
          embedding
        );

      const companyMaterial =
        findCompanyMaterialForMaterial(
          material,
          companyMaterials
        );

      const companyEmail =
        findCompanyEmail(
          material,
          companyMaterials
        );

      matches.push({
        material_id:
          material.id,

        company_material_id:
          companyMaterial
            ?.material_id ??
          null,

        company:
          material.company,

        company_id:
          material.company_id,

        material_number:
          material.material_number,

        description:
          material.description,

        specifications:
          material.specifications,

        category:
          material.category,

        similarity,

        confidence:
          Math.round(
            similarity * 10000
          ) / 100,

        company_email:
          companyEmail,
      });
    }

    /*
     * Highest similarity first.
     */

    matches.sort(
      (a, b) =>
        b.similarity -
        a.similarity
    );

    const topMatches =
      matches.slice(
        0,
        matchCount
      );

    /*
     * -------------------------------------------------------
     * BEST MATCH PER COMPANY
     * -------------------------------------------------------
     */

    const bestMatches =
      groupBestMatchesByCompany(
        topMatches
      );

    /*
     * -------------------------------------------------------
     * CREATE GOVERNMENT APPROVAL QUEUE
     * -------------------------------------------------------
     */

    let approvalQueue =
      [];

    if (
      sourceMaterial
    ) {
      approvalQueue =
        await createApprovalQueue(
          supabase,
          sourceMaterial.description ||
            sourceMaterial.material_number ||
            requestedPartName,
          bestMatches
        );
    } else {
      approvalQueue =
        await createApprovalQueue(
          supabase,
          requestedPartName,
          bestMatches
        );
    }

    /*
     * -------------------------------------------------------
     * RESPONSE
     * -------------------------------------------------------
     */

    return json(
      {
        success: true,

        query: {
          materialId:
            materialId,

          text:
            queryText,
        },

        totalActiveMaterials:
          activeMaterials.length,

        totalMatches:
          matches.length,

        matches:
          topMatches.map(
            (match) => ({
              ...match,

              similarity:
                Math.round(
                  match.similarity *
                    10000
                ) /
                100,

              similarityPercent:
                Math.round(
                  match.similarity *
                    100
                ),
            })
          ),

        bestMatches:
          bestMatches.map(
            (match) => ({
              ...match,

              similarity:
                Math.round(
                  match.similarity *
                    10000
                ) /
                100,

              similarityPercent:
                Math.round(
                  match.similarity *
                    100
                ),
            })
          ),

        approvalQueue,

        approvalThreshold:
          APPROVAL_THRESHOLD,

        embeddingModel:
          EMBEDDING_MODEL,

        embeddingDimensions:
          EMBEDDING_DIMENSIONS,
      },
      200
    );
  } catch (error) {
    console.error(
      "SEMANTIC SEARCH ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "Semantic search failed.",
      },
      500
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
    const url =
      new URL(
        request.url
      );

    const materialId =
      url.searchParams.get(
        "materialId"
      );

    const matchCount =
      Number(
        url.searchParams.get(
          "matchCount"
        ) || 10
      );

    /*
     * Convert GET into the same semantic-search
     * implementation used by POST.
     */

    const fakeRequest =
      new Request(
        request.url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            materialId:
              materialId
                ? Number(
                    materialId
                  )
                : null,

            matchCount,
          }),
        }
      );

    return POST(
      fakeRequest
    );
  } catch (error) {
    console.error(
      "SEMANTIC SEARCH GET ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "Semantic search failed.",
      },
      500
    );
  }
}