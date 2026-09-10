import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const EMBEDDING_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONALITY = 768;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;

function safeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "object"
  ) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value);
}

function buildSearchText(material, detail) {
  return [
    `company: ${safeText(material.company)}`,
    `material number: ${safeText(
      material.material_number
    )}`,
    `description: ${safeText(
      material.description
    )}`,
    `specifications: ${safeText(
      material.specifications
    )}`,
    `category: ${safeText(
      material.category
    )}`,
    `material family: ${safeText(
      detail?.material_family
    )}`,
    `dimensions: ${safeText(
      detail?.dimensions
    )}`,
    `material grade: ${safeText(
      detail?.material_grade
    )}`,
    `pressure rating: ${safeText(
      detail?.pressure_rating
    )}`,
    `temperature rating: ${safeText(
      detail?.temperature_rating
    )}`,
    `standards: ${safeText(
      detail?.standards
    )}`,
    `manufacturer: ${safeText(
      detail?.manufacturer
    )}`,
    `model: ${safeText(
      detail?.model
    )}`,
    `design features: ${safeText(
      detail?.design_features
    )}`,
    `other attributes: ${safeText(
      detail?.other_attributes
    )}`,
  ]
    .filter(
      (value) =>
        value.trim() !== ""
    )
    .join("\n");
}

async function getEmbedding(text) {
  const response =
    await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality:
          OUTPUT_DIMENSIONALITY,
      },
    });

  const values =
    response?.embeddings?.[0]
      ?.values;

  if (
    !Array.isArray(values) ||
    values.length !==
      OUTPUT_DIMENSIONALITY
  ) {
    throw new Error(
      `Invalid embedding returned. Expected ${OUTPUT_DIMENSIONALITY} dimensions.`
    );
  }

  return values;
}

async function loadMaterialBatch(
  supabase,
  start,
  limit
) {
  const {
    data,
    error,
  } = await supabase
    .from("materials")
    .select(
      "id, company, material_number, description, specifications, category"
    )
    .order("id", {
      ascending: true,
    })
    .range(
      start,
      start + limit - 1
    );

  if (error) {
    throw new Error(
      `Failed to load materials: ${error.message}`
    );
  }

  return data || [];
}

async function loadAttributes(
  supabase,
  materialIds
) {
  if (!materialIds.length) {
    return {};
  }

  const result = {};
  const chunkSize = 500;

  for (
    let i = 0;
    i < materialIds.length;
    i += chunkSize
  ) {
    const chunk =
      materialIds.slice(
        i,
        i + chunkSize
      );

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
      const row of data || []
    ) {
      result[
        row.material_id
      ] = row;
    }
  }

  return result;
}

async function saveEmbedding(
  supabase,
  materialId,
  embedding,
  searchText
) {
  const {
    error,
  } = await supabase
    .from(
      "material_embeddings"
    )
    .upsert(
      {
        material_id:
          materialId,

        embedding,

        search_text:
          searchText,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "material_id",
      }
    );

  if (error) {
    throw new Error(
      `Failed to save embedding for material ${materialId}: ${error.message}`
    );
  }
}

export async function POST(
  request
) {
  try {
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    const geminiApiKey =
      process.env.GEMINI_API_KEY;

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

    if (!geminiApiKey) {
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

    const body =
      await request
        .json()
        .catch(() => ({}));

    const materialId =
      body.materialId
        ? Number(
            body.materialId
          )
        : null;

    const startRaw =
      body.start;

    const limitRaw =
      body.limit;

    const start =
      Number.isInteger(
        Number(startRaw)
      ) &&
      Number(startRaw) >= 0
        ? Number(startRaw)
        : 0;

    let limit =
      Number.isInteger(
        Number(limitRaw)
      ) &&
      Number(limitRaw) > 0
        ? Number(limitRaw)
        : DEFAULT_BATCH_SIZE;

    if (
      limit >
      MAX_BATCH_SIZE
    ) {
      limit =
        MAX_BATCH_SIZE;
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /* ========================================================
       SINGLE MATERIAL TEST
    ======================================================== */

    if (
      Number.isInteger(
        materialId
      ) &&
      materialId > 0
    ) {
      const {
        data: material,
        error: materialError,
      } = await supabase
        .from("materials")
        .select(
          "id, company, material_number, description, specifications, category"
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
              "Requested material was not found.",
          },
          {
            status: 404,
          }
        );
      }

      const attributes =
        await loadAttributes(
          supabase,
          [material.id]
        );

      const detail =
        attributes[
          material.id
        ] || null;

      const searchText =
        buildSearchText(
          material,
          detail
        );

      if (
        !searchText.trim()
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Material does not contain searchable information.",
          },
          {
            status: 400,
          }
        );
      }

      console.log(
        `Generating embedding for material ${material.id}...`
      );

      const embedding =
        await getEmbedding(
          searchText
        );

      await saveEmbedding(
        supabase,
        material.id,
        embedding,
        searchText
      );

      console.log(
        `Embedding saved for material ${material.id}`
      );

      return NextResponse.json({
        success: true,

        mode: "single",

        embedding_model:
          EMBEDDING_MODEL,

        dimensions:
          OUTPUT_DIMENSIONALITY,

        requested_material_id:
          material.id,

        processed: 1,

        failed_count: 0,

        failed: [],
      });
    }

    /* ========================================================
       BATCH MODE
    ======================================================== */

    const materials =
      await loadMaterialBatch(
        supabase,
        start,
        limit
      );

    if (
      !materials.length
    ) {
      return NextResponse.json({
        success: true,

        mode: "batch",

        embedding_model:
          EMBEDDING_MODEL,

        dimensions:
          OUTPUT_DIMENSIONALITY,

        start,

        requested_limit:
          limit,

        total_selected: 0,

        processed: 0,

        failed_count: 0,

        failed: [],

        next_start: null,

        complete: true,
      });
    }

    const materialIds =
      materials.map(
        (material) =>
          material.id
      );

    const attributes =
      await loadAttributes(
        supabase,
        materialIds
      );

    let processed = 0;
    const failed = [];

    for (
      const material of materials
    ) {
      try {
        const detail =
          attributes[
            material.id
          ] || null;

        const searchText =
          buildSearchText(
            material,
            detail
          );

        if (
          !searchText.trim()
        ) {
          failed.push({
            material_id:
              material.id,

            error:
              "No searchable material information.",
          });

          continue;
        }

        console.log(
          `Generating embedding for material ${material.id}...`
        );

        const embedding =
          await getEmbedding(
            searchText
          );

        await saveEmbedding(
          supabase,
          material.id,
          embedding,
          searchText
        );

        processed++;

        console.log(
          `Embedding saved for material ${material.id}`
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              100
            )
        );
      } catch (error) {
        console.error(
          `Embedding failed for material ${material.id}:`,
          error
        );

        failed.push({
          material_id:
            material.id,

          error:
            error?.message ||
            String(error),
        });
      }
    }

    const nextStart =
      start +
      materials.length;

    const complete =
      materials.length <
      limit;

    return NextResponse.json({
      success: true,

      mode: "batch",

      embedding_model:
        EMBEDDING_MODEL,

      dimensions:
        OUTPUT_DIMENSIONALITY,

      start,

      requested_limit:
        limit,

      total_selected:
        materials.length,

      processed,

      failed_count:
        failed.length,

      failed,

      next_start:
        complete
          ? null
          : nextStart,

      complete,
    });
  } catch (error) {
    console.error(
      "Embedding generation error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to generate material embeddings.",

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