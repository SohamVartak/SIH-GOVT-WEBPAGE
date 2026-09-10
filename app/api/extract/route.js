import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractText } from "unpdf";

export const runtime = "nodejs";

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Ignore cookie write failures
          }
        },
      },
    }
  );
}

/*
 * Extract a simple material description from the PDF.
 * The actual AI engineering extraction will be added
 * in the next phase.
 */
function buildInitialMaterialData(
  text,
  fileName,
  companyName
) {
  const cleanedText = String(
    text || ""
  )
    .replace(/\s+/g, " ")
    .trim();

  let materialNumber = null;

  const materialNumberPatterns = [
    /material\s*(?:no|number|code)\s*[:\-]?\s*([A-Z0-9./_-]+)/i,
    /item\s*(?:no|number|code)\s*[:\-]?\s*([A-Z0-9./_-]+)/i,
    /part\s*(?:no|number|code)\s*[:\-]?\s*([A-Z0-9./_-]+)/i,
    /sap\s*(?:no|number|code)\s*[:\-]?\s*([A-Z0-9./_-]+)/i,
  ];

  for (
    const pattern of materialNumberPatterns
  ) {
    const match =
      cleanedText.match(pattern);

    if (
      match &&
      match[1]
    ) {
      materialNumber =
        match[1].trim();

      break;
    }
  }

  const description =
    cleanedText.slice(
      0,
      1000
    ) ||
    fileName;

  return {
    company:
      companyName ||
      null,

    material_number:
      materialNumber,

    description,

    specifications:
      cleanedText ||
      null,

    category:
      null,
  };
}

export async function POST(
  request
) {
  try {
    const supabase =
      await getSupabaseServer();

    /*
     * =====================================================
     * AUTHENTICATION
     * =====================================================
     */

    const {
      data: {
        user,
      },
      error: authError,
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Not authenticated",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================================
     * REQUEST
     * =====================================================
     */

    const body =
      await request.json();

    const datasheetId =
      Number(
        body?.datasheetId
      );

    if (
      !Number.isFinite(
        datasheetId
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid datasheetId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * LOAD DATASHEET REGISTRY
     * =====================================================
     */

    const {
      data: datasheet,
      error:
        datasheetError,
    } =
      await supabase
        .from(
          "datasheets"
        )
        .select(
          `
            datasheet_id,
            file_name,
            original_file_name,
            source_zip_name,
            folder_path,
            storage_bucket,
            storage_path,
            company_name,
            processing_status,
            extraction_status,
            embedding_status
          `
        )
        .eq(
          "datasheet_id",
          datasheetId
        )
        .maybeSingle();

    if (
      datasheetError
    ) {
      console.error(
        "Datasheet lookup error:",
        datasheetError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to locate datasheet.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !datasheet
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datasheet not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================================
     * MARK PROCESSING
     * =====================================================
     */

    await supabase
      .from(
        "datasheets"
      )
      .update({
        processing_status:
          "PROCESSING",

        extraction_status:
          "PROCESSING",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "datasheet_id",
        datasheetId
      );

    /*
     * =====================================================
     * DOWNLOAD PDF FROM STORAGE
     * =====================================================
     */

    const {
      data:
        pdfData,
      error:
        downloadError,
    } =
      await supabase.storage
        .from(
          datasheet.storage_bucket ||
            "datasheets"
        )
        .download(
          datasheet.storage_path
        );

    if (
      downloadError ||
      !pdfData
    ) {
      throw new Error(
        downloadError?.message ||
          "Unable to download PDF from Supabase Storage."
      );
    }

    /*
     * =====================================================
     * PDF TEXT EXTRACTION
     * =====================================================
     */

    const buffer =
      new Uint8Array(
        await pdfData.arrayBuffer()
      );

    const extraction =
      await extractText(
        buffer,
        {
          mergePages:
            true,
        }
      );

    const extractedText =
      String(
        extraction?.text ||
          ""
      ).trim();

    if (
      !extractedText
    ) {
      throw new Error(
        "No extractable text was found in the PDF."
      );
    }

    /*
     * =====================================================
     * INITIAL MATERIAL DATA
     * =====================================================
     */

    const materialData =
      buildInitialMaterialData(
        extractedText,
        datasheet.file_name,
        datasheet.company_name
      );

    /*
     * =====================================================
     * CREATE MATERIAL
     * =====================================================
     */

    let materialId =
      null;

    /*
     * Only create a material when we have enough
     * information to create a useful record.
     */
    if (
      materialData.description ||
      materialData.specifications
    ) {
      const {
        data:
          material,
        error:
          materialError,
      } =
        await supabase
          .from(
            "materials"
          )
          .insert({
            company:
              materialData.company,

            material_number:
              materialData.material_number,

            description:
              materialData.description,

            specifications:
              materialData.specifications,

            category:
              materialData.category,
          })
          .select(
            "id"
          )
          .single();

      if (
        materialError
      ) {
        throw new Error(
          materialError.message
        );
      }

      materialId =
        material.id;
    }

    /*
     * =====================================================
     * SAVE MATERIAL ATTRIBUTES
     * =====================================================
     */

    if (
      materialId
    ) {
      const {
        error:
          attributeError,
      } =
        await supabase
          .from(
            "material_attributes"
          )
          .insert({
            material_id:
              materialId,

            material_family:
              materialData.category,

            other_attributes:
              extractedText,
          });

      if (
        attributeError
      ) {
        console.warn(
          "Material attribute insert warning:",
          attributeError.message
        );
      }
    }

    /*
     * =====================================================
     * UPDATE DATASHEET STATUS
     * =====================================================
     */

    const {
      error:
        completionError,
    } =
      await supabase
        .from(
          "datasheets"
        )
        .update({
          processing_status:
            "PROCESSED",

          extraction_status:
            "COMPLETED",

          embedding_status:
            materialId
              ? "PENDING"
              : "FAILED",

          extracted_material_count:
            materialId
              ? 1
              : 0,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "datasheet_id",
          datasheetId
        );

    if (
      completionError
    ) {
      console.warn(
        "Datasheet completion update warning:",
        completionError.message
      );
    }

    return NextResponse.json({
      success: true,

      datasheetId,

      materialId,

      pages:
        extraction?.totalPages ||
        0,

      extractedCharacters:
        extractedText.length,

      processingStatus:
        "PROCESSED",

      extractionStatus:
        "COMPLETED",

      embeddingStatus:
        materialId
          ? "PENDING"
          : "FAILED",
    });

  } catch (
    error
  ) {

    console.error(
      "Datasheet processing error:",
      error
    );

    /*
     * Attempt to mark the datasheet as failed.
     */
    try {
      const supabase =
        await getSupabaseServer();

      const body =
        await request.clone().json();

      const datasheetId =
        Number(
          body?.datasheetId
        );

      if (
        Number.isFinite(
          datasheetId
        )
      ) {
        await supabase
          .from(
            "datasheets"
          )
          .update({
            processing_status:
              "FAILED",

            extraction_status:
              "FAILED",

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "datasheet_id",
            datasheetId
          );
      }
    } catch {
      // Ignore secondary status-update failure
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to process datasheet.",
      },
      {
        status: 500,
      }
    );
  }
}