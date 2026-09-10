import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;
const MAX_MATCHES = 100;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing."
    );
  }

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getGemini() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing."
    );
  }

  return new GoogleGenAI({
    apiKey: key,
  });
}

function safeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value);
}

function normalizeText(value) {
  return safeText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function buildMaterialSearchText(material) {
  return [
    `company: ${normalizeText(material.company)}`,
    `material number: ${normalizeText(
      material.material_number
    )}`,
    `description: ${normalizeText(
      material.description
    )}`,
    `category: ${normalizeText(
      material.category
    )}`,
    `specifications: ${normalizeText(
      material.specifications
    )}`,
  ]
    .filter(
      (value) => value.trim() !== ""
    )
    .join("\n");
}

function buildQuerySearchText({
  company,
  materialNumber,
  description,
  specifications,
  category,
}) {
  return [
    company
      ? `company: ${normalizeText(company)}`
      : "",

    materialNumber
      ? `material number: ${normalizeText(
          materialNumber
        )}`
      : "",

    description
      ? `description: ${normalizeText(
          description
        )}`
      : "",

    category
      ? `category: ${normalizeText(category)}`
      : "",

    specifications
      ? `specifications: ${normalizeText(
          specifications
        )}`
      : "",
  ]
    .filter(
      (value) => value.trim() !== ""
    )
    .join("\n");
}

async function generateEmbedding(text) {
  const ai = getGemini();

  const response =
    await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality:
          EMBEDDING_DIMENSIONS,
      },
    });

  const embedding =
    response?.embeddings?.[0]?.values;

  if (!Array.isArray(embedding)) {
    throw new Error(
      "Gemini did not return an embedding."
    );
  }

  if (
    embedding.length !==
    EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `Invalid embedding dimensions. Expected ${EMBEDDING_DIMENSIONS}, received ${embedding.length}.`
    );
  }

  return embedding;
}

function normalizeSimilarity(value) {
  const numeric = Number(value ?? 0);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, numeric)
  );
}

function groupBestMatchesByCompany(
  matches
) {
  const map = new Map();

  for (const match of matches) {
    const company =
      normalizeText(
        match.company
      ) || "Unknown";

    const existing =
      map.get(company);

    if (
      !existing ||
      match.similarity >
        existing.similarity
    ) {
      map.set(company, match);
    }
  }

  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      b.similarity -
      a.similarity
  );
}

export async function POST(request) {
  try {
    const supabase =
      getSupabase();

    const body =
      await request
        .json()
        .catch(() => ({}));

    const rawMaterialId =
      body?.materialId;

    const materialId =
      rawMaterialId !== undefined &&
      rawMaterialId !== null &&
      String(rawMaterialId).trim() !== ""
        ? Number(rawMaterialId)
        : null;

    const matchCount =
      body?.matchCount !==
      undefined
        ? Number(
            body.matchCount
          )
        : 10;

    const company =
      normalizeText(
        body?.company
      );

    const materialNumber =
      normalizeText(
        body?.materialNumber
      );

    const description =
      normalizeText(
        body?.description
      );

    const specifications =
      normalizeText(
        body?.specifications
      );

    const category =
      normalizeText(
        body?.category
      );

    if (
      !Number.isInteger(
        matchCount
      ) ||
      matchCount < 1 ||
      matchCount > MAX_MATCHES
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `matchCount must be between 1 and ${MAX_MATCHES}.`,
        },
        { status: 400 }
      );
    }

    const usingMaterial =
      Number.isInteger(
        materialId
      ) &&
      materialId > 0;

    const usingQuery =
      Boolean(
        company ||
          materialNumber ||
          description ||
          specifications ||
          category
      );

    if (
      !usingMaterial &&
      !usingQuery
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Provide a materialId or a material/specification query.",
        },
        { status: 400 }
      );
    }

    /* =====================================================
       SOURCE
    ===================================================== */

    let sourceMaterial =
      null;

    let sourceEmbedding =
      null;

    let excludeMaterialId =
      null;

    let sourceSearchText =
      "";

    /* =====================================================
       MODE 1:
       EXISTING MATERIAL
    ===================================================== */

    if (usingMaterial) {
      const {
        data: material,
        error:
          materialError,
      } =
        await supabase
          .from("materials")
          .select(
            `
            id,
            company,
            material_number,
            description,
            specifications,
            category
            `
          )
          .eq(
            "id",
            materialId
          )
          .single();

      if (
        materialError ||
        !material
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Source material not found.",
            material_id:
              materialId,
            details:
              materialError?.message ||
              null,
          },
          { status: 404 }
        );
      }

      sourceMaterial =
        material;

      excludeMaterialId =
        material.id;

      /*
       * First try stored embedding.
       */

      const {
        data:
          storedEmbedding,
      } =
        await supabase
          .from(
            "material_embeddings"
          )
          .select(
            `
            material_id,
            embedding,
            search_text
            `
          )
          .eq(
            "material_id",
            material.id
          )
          .maybeSingle();

      if (
        storedEmbedding &&
        Array.isArray(
          storedEmbedding.embedding
        ) &&
        storedEmbedding.embedding.length ===
          EMBEDDING_DIMENSIONS
      ) {
        sourceEmbedding =
          storedEmbedding.embedding;

        sourceSearchText =
          storedEmbedding.search_text ||
          buildMaterialSearchText(
            material
          );
      }

      /*
       * Generate one if missing.
       */

      if (!sourceEmbedding) {
        sourceSearchText =
          buildMaterialSearchText(
            material
          );

        if (
          !sourceSearchText
        ) {
          throw new Error(
            "Source material contains no searchable information."
          );
        }

        sourceEmbedding =
          await generateEmbedding(
            sourceSearchText
          );

        const {
          error:
            embeddingSaveError,
        } =
          await supabase
            .from(
              "material_embeddings"
            )
            .upsert(
              {
                material_id:
                  material.id,

                embedding:
                  sourceEmbedding,

                search_text:
                  sourceSearchText,

                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "material_id",
              }
            );

        if (
          embeddingSaveError
        ) {
          throw new Error(
            `Failed to store source embedding: ${embeddingSaveError.message}`
          );
        }
      }
    }

    /* =====================================================
       MODE 2:
       DIRECT QUERY
    ===================================================== */

    else {
      sourceSearchText =
        buildQuerySearchText({
          company,
          materialNumber,
          description,
          specifications,
          category,
        });

      if (
        !sourceSearchText
      ) {
        throw new Error(
          "Query contains no searchable information."
        );
      }

      sourceEmbedding =
        await generateEmbedding(
          sourceSearchText
        );

      sourceMaterial = {
        id: null,
        company:
          company || null,
        material_number:
          materialNumber || null,
        description:
          description || null,
        specifications:
          specifications || null,
        category:
          category || null,
      };
    }

    /* =====================================================
       VECTOR SEARCH
    ===================================================== */

    const {
      data: rawMatches,
      error:
        matchError,
    } =
      await supabase.rpc(
        "match_materials",
        {
          query_embedding:
            sourceEmbedding,

          match_count:
            matchCount,

          exclude_material_id:
            excludeMaterialId,
        }
      );

    if (
      matchError
    ) {
      throw new Error(
        `Vector search failed: ${matchError.message}`
      );
    }

    const vectorMatches =
      Array.isArray(
        rawMatches
      )
        ? rawMatches
        : [];

    const matchIds =
      vectorMatches
        .map(
          (row) =>
            Number(
              row.material_id
            )
        )
        .filter(
          (id) =>
            Number.isInteger(
              id
            ) &&
            id > 0
        );

    /* =====================================================
       LOAD MATCHED MATERIAL DATA
    ===================================================== */

    let matchedMaterials =
      [];

    if (
      matchIds.length >
      0
    ) {
      const {
        data,
        error,
      } =
        await supabase
          .from("materials")
          .select(
            `
            id,
            company,
            material_number,
            description,
            specifications,
            category
            `
          )
          .in(
            "id",
            matchIds
          );

      if (error) {
        throw new Error(
          `Failed to load matched materials: ${error.message}`
        );
      }

      matchedMaterials =
        data || [];
    }

    const materialMap =
      new Map();

    for (
      const material of matchedMaterials
    ) {
      materialMap.set(
        Number(material.id),
        material
      );
    }

    /* =====================================================
       FORMAT RESULTS
    ===================================================== */

    const matches =
      vectorMatches.map(
        (row, index) => {
          const id =
            Number(
              row.material_id
            );

          const material =
            materialMap.get(
              id
            );

          const similarity =
            normalizeSimilarity(
              row.similarity ??
                row.score
            );

          return {
            rank:
              index + 1,

            material_id:
              id,

            company:
              material?.company ||
              null,

            material_number:
              material?.material_number ||
              null,

            description:
              material?.description ||
              null,

            category:
              material?.category ||
              null,

            similarity,

            similarity_percent:
              Number(
                (
                  similarity *
                  100
                ).toFixed(2)
              ),

            recommendation:
              similarity >= 0.85
                ? "LIKELY_MATCH"
                : similarity >= 0.65
                  ? "REVIEW"
                  : "LOW_CONFIDENCE",
          };
        }
      );

    /* =====================================================
       COMPANY BEST MATCHES
    ===================================================== */

    const bestMatchByCompany =
      groupBestMatchesByCompany(
        matches
      );

    /* =====================================================
       ALL IMPORTANT COMPANIES
    ===================================================== */

    const knownCompanies = [
      "IOCL",
      "BPCL",
      "HPCL",
      "BHEL",
      "ONGC",
      "NTPC",
      "SAIL",
      "GAIL",
      "CIL",
      "CPCL",
    ];

    const companyMatchMap =
      new Map(
        bestMatchByCompany.map(
          (match) => [
            match.company
              ?.trim()
              .toUpperCase(),
            match,
          ]
        )
      );

    const companyResults =
      knownCompanies.map(
        (companyName) => {
          const match =
            companyMatchMap.get(
              companyName
            );

          if (match) {
            return match;
          }

          return {
            rank: null,

            material_id:
              null,

            company:
              companyName,

            material_number:
              null,

            description:
              null,

            category:
              null,

            similarity:
              0,

            similarity_percent:
              0,

            recommendation:
              "NO_MATCH",
          };
        }
      );

    return NextResponse.json({
      success: true,

      mode:
        usingMaterial
          ? "MATERIAL"
          : "QUERY",

      query: {
        material_id:
          sourceMaterial.id,

        company:
          sourceMaterial.company,

        material_number:
          sourceMaterial.material_number,

        description:
          sourceMaterial.description,

        category:
          sourceMaterial.category,

        specifications:
          sourceMaterial.specifications,

        search_text:
          sourceSearchText,
      },

      embedding: {
        model:
          EMBEDDING_MODEL,

        dimensions:
          EMBEDDING_DIMENSIONS,

        generated:
          true,
      },

      count:
        matches.length,

      matches,

      best_match_by_company:
        bestMatchByCompany,

      company_results:
        companyResults,
    });
  } catch (error) {
    console.error(
      "Semantic search error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Semantic search failed.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}