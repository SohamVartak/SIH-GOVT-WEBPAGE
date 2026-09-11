import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    /* =========================================================
       SUPABASE
    ========================================================= */

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL is missing.",
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    /* =========================================================
       DATASHEET ID
    ========================================================= */

    const id =
      request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Datasheet ID is required.",
        },
        { status: 400 }
      );
    }

    /* =========================================================
       FIND DATASHEET
       
       Select the complete row instead of assuming that
       file_path is the only storage column.
    ========================================================= */

    const {
      data: datasheet,
      error: datasheetError,
    } = await supabase
      .from("datasheets")
      .select("*")
      .eq("datasheet_id", id)
      .maybeSingle();

    if (datasheetError) {
      console.error(
        "Datasheet lookup error:",
        datasheetError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to read the datasheet record.",
          details: datasheetError.message,
        },
        { status: 500 }
      );
    }

    if (!datasheet) {
      return NextResponse.json(
        {
          success: false,
          error: "Datasheet was not found.",
        },
        { status: 404 }
      );
    }

    console.log(
      "DATASHEET DOWNLOAD RECORD:",
      {
        datasheet_id:
          datasheet.datasheet_id,

        file_name:
          datasheet.file_name,

        file_path:
          datasheet.file_path,

        storage_path:
          datasheet.storage_path,

        path:
          datasheet.path,

        file_url:
          datasheet.file_url,

        url:
          datasheet.url,

        storage_bucket:
          datasheet.storage_bucket,
      }
    );

    /* =========================================================
       FIND STORAGE PATH
       
       Prefer the normal file_path field, but support other
       storage-path names if the database uses them.
    ========================================================= */

    const possiblePathFields = [
      "file_path",
      "storage_path",
      "file_storage_path",
      "storage_key",
      "object_path",
      "file_key",
      "path",
    ];

    let filePath = null;

    for (const field of possiblePathFields) {
      const value = datasheet[field];

      if (
        typeof value === "string" &&
        value.trim()
      ) {
        filePath = value.trim();
        break;
      }
    }

    /* =========================================================
       HANDLE FULL STORAGE URL
       
       If the database contains a complete URL instead of
       a storage path, return that URL directly.
    ========================================================= */

    const possibleUrlFields = [
      "file_url",
      "storage_url",
      "public_url",
      "url",
    ];

    let existingUrl = null;

    for (const field of possibleUrlFields) {
      const value = datasheet[field];

      if (
        typeof value === "string" &&
        value.trim()
      ) {
        const trimmed = value.trim();

        if (
          trimmed.startsWith("http://") ||
          trimmed.startsWith("https://")
        ) {
          existingUrl = trimmed;
          break;
        }
      }
    }

    /* =========================================================
       IF A COMPLETE URL EXISTS
    ========================================================= */

    if (existingUrl) {
      return NextResponse.json({
        success: true,
        url: existingUrl,
        fileName:
          datasheet.file_name ||
          "datasheet",
        fileType:
          datasheet.file_type ||
          null,
      });
    }

    /* =========================================================
       NO STORAGE REFERENCE
    ========================================================= */

    if (!filePath) {
      console.error(
        "DATASHEET HAS NO STORAGE PATH:",
        datasheet
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "The datasheet record exists, but no Supabase storage file path is stored for it.",
          datasheetId:
            datasheet.datasheet_id,
          fileName:
            datasheet.file_name || null,
        },
        { status: 404 }
      );
    }

    /* =========================================================
       DETERMINE STORAGE BUCKET
       
       Normally this is "datasheets".
    ========================================================= */

    const bucket =
      typeof datasheet.storage_bucket ===
        "string" &&
      datasheet.storage_bucket.trim()
        ? datasheet.storage_bucket.trim()
        : "datasheets";

    /* =========================================================
       CLEAN STORAGE PATH
       
       Supabase createSignedUrl expects the object path,
       not the full storage URL.
    ========================================================= */

    let cleanPath = filePath.trim();

    const storageMarker =
      `/storage/v1/object/`;

    if (cleanPath.includes(storageMarker)) {
      const markerIndex =
        cleanPath.indexOf(storageMarker);

      let storagePart =
        cleanPath.substring(
          markerIndex + storageMarker.length
        );

      storagePart =
        storagePart
          .replace(/^sign\//, "")
          .replace(/^public\//, "")
          .replace(/^authenticated\//, "")
          .replace(/^upload\//, "");

      const bucketPrefix =
        `${bucket}/`;

      if (
        storagePart.startsWith(
          bucketPrefix
        )
      ) {
        storagePart =
          storagePart.substring(
            bucketPrefix.length
          );
      }

      cleanPath = storagePart;
    }

    /* =========================================================
       REMOVE BUCKET PREFIX IF PRESENT
    ========================================================= */

    const bucketPrefix =
      `${bucket}/`;

    if (
      cleanPath.startsWith(
        bucketPrefix
      )
    ) {
      cleanPath =
        cleanPath.substring(
          bucketPrefix.length
        );
    }

    if (!cleanPath) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The datasheet storage path is empty.",
        },
        { status: 404 }
      );
    }

    console.log(
      "CREATING DATASHEET SIGNED URL:",
      {
        bucket,
        path: cleanPath,
        datasheetId:
          datasheet.datasheet_id,
      }
    );

    /* =========================================================
       CREATE SIGNED DOWNLOAD URL
    ========================================================= */

    const {
      data: signedUrlData,
      error: signedUrlError,
    } = await supabase.storage
      .from(bucket)
      .createSignedUrl(
        cleanPath,
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
            "Unable to create the datasheet download link.",
          details:
            signedUrlError?.message ||
            null,
          bucket,
          path: cleanPath,
        },
        { status: 500 }
      );
    }

    /* =========================================================
       SUCCESS
    ========================================================= */

    return NextResponse.json({
      success: true,

      url:
        signedUrlData.signedUrl,

      fileName:
        datasheet.file_name ||
        "datasheet",

      fileType:
        datasheet.file_type ||
        null,
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
          String(error),
      },
      { status: 500 }
    );
  }
}