import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL is missing."
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing."
        },
        { status: 500 }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    const id =
      request.nextUrl.searchParams.get(
        "id"
      );

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datasheet ID is required."
        },
        { status: 400 }
      );
    }

    /* ================================================
       FIND DATASHEET
    ================================================ */

    const {
      data: datasheet,
      error: datasheetError
    } = await supabase
      .from("datasheets")
      .select(
        "datasheet_id, file_name, file_path, file_type"
      )
      .eq(
        "datasheet_id",
        id
      )
      .single();

    if (
      datasheetError ||
      !datasheet
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Datasheet was not found."
        },
        { status: 404 }
      );
    }

    if (!datasheet.file_path) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This datasheet does not have a stored file path."
        },
        { status: 404 }
      );
    }

    /* ================================================
       CREATE SECURE TEMPORARY DOWNLOAD URL
    ================================================ */

    const {
      data: signedUrlData,
      error: signedUrlError
    } = await supabase.storage
      .from("datasheets")
      .createSignedUrl(
        datasheet.file_path,
        60 * 10
      );

    if (
      signedUrlError ||
      !signedUrlData?.signedUrl
    ) {
      console.error(
        "Signed URL error:",
        signedUrlError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to create datasheet download link.",
          details:
            signedUrlError?.message ||
            null
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url:
        signedUrlData.signedUrl,
      fileName:
        datasheet.file_name,
      fileType:
        datasheet.file_type
    });
  } catch (error) {
    console.error(
      "Datasheet download API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          String(error)
      },
      { status: 500 }
    );
  }
}