import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const BUCKET =
  process.env.SUPABASE_DATASHEET_BUCKET ||
  "datasheets";

async function requireNationalAdministrator(
  request
) {
  const authHeader =
    request.headers.get(
      "authorization"
    ) || "";

  const match =
    authHeader.match(
      /^Bearer\s+(.+)$/i
    );

  if (!match) {
    return {
      ok: false,

      response:
        NextResponse.json(
          {
            error:
              "Authentication required.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const token =
    match[1];

  const {
    data,
    error,
  } =
    await supabaseAdmin.auth.getUser(
      token
    );

  if (
    error ||
    !data?.user
  ) {
    return {
      ok: false,

      response:
        NextResponse.json(
          {
            error:
              "Invalid or expired session.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabaseAdmin
      .from("profiles")
      .select(
        "id, user_type, role, is_active"
      )
      .eq(
        "id",
        data.user.id
      )
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.user_type !==
      "GOVERNMENT" ||
    profile.role !==
      "National Administrator" ||
    profile.is_active !==
      true
  ) {
    return {
      ok: false,

      response:
        NextResponse.json(
          {
            error:
              "Government National Administrator access required.",
          },
          {
            status: 403,
          }
        ),
    };
  }

  return {
    ok: true,
    user: data.user,
    profile,
  };
}

export async function POST(
  request
) {
  try {
    const auth =
      await requireNationalAdministrator(
        request
      );

    if (!auth.ok) {
      return auth.response;
    }

    const body =
      await request
        .json()
        .catch(() => ({}));

    const datasheetId =
      body?.datasheetId;

    if (!datasheetId) {
      return NextResponse.json(
        {
          error:
            "datasheetId is required.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: datasheet,
      error: datasheetError,
    } =
      await supabaseAdmin
        .from("datasheets")
        .select(
          "id, file_name, file_path, file_type"
        )
        .eq(
          "id",
          datasheetId
        )
        .maybeSingle();

    if (datasheetError) {
      return NextResponse.json(
        {
          error:
            "Unable to locate datasheet.",
          details:
            datasheetError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!datasheet) {
      return NextResponse.json(
        {
          error:
            "Datasheet not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (!datasheet.file_path) {
      return NextResponse.json(
        {
          error:
            "This datasheet has no stored file path.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: signed,
      error: signedError,
    } =
      await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(
          datasheet.file_path,
          60,
          {
            download:
              datasheet.file_name ||
              true,
          }
        );

    if (
      signedError ||
      !signed?.signedUrl
    ) {
      return NextResponse.json(
        {
          error:
            "Unable to create a download link.",
          details:
            signedError?.message ||
            "No signed URL returned.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      fileName:
        datasheet.file_name,
      fileType:
        datasheet.file_type,
      url:
        signed.signedUrl,
      expiresInSeconds: 60,
    });
  } catch (error) {
    console.error(
      "Admin datasheet download error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unexpected error while generating datasheet download.",
        details:
          error?.message ||
          "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}