import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ALLOWED_ROLES = [
  "National Administrator",
  "CPSE Administrator (IOCL)",
  "CPSE Administrator (ONGC)",
  "Material Master Officer",
  "Procurement Officer",
  "Auditor",
  "Executive Management",
  "Pending User",
];

const ALLOWED_USER_TYPES = [
  "GOVERNMENT",
  "COMPANY",
];

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(name, value, options);
              }
            );
          } catch {
            // Some server contexts may not allow cookie writes.
          }
        },
      },
    }
  );
}

/* =========================================================
   VERIFY NATIONAL ADMINISTRATOR
========================================================= */

async function requireNationalAdministrator() {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase,
      user: null,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error: "Not authenticated",
        },
        { status: 401 }
      ),
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id, full_name, user_type, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Admin profile lookup error:", profileError);

    return {
      supabase,
      user,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error: "Unable to verify administrator profile",
        },
        { status: 500 }
      ),
    };
  }

  if (
    !profile ||
    profile.is_active !== true ||
    profile.user_type !== "GOVERNMENT" ||
    profile.role !== "National Administrator"
  ) {
    return {
      supabase,
      user,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error: "National Administrator access required",
        },
        { status: 403 }
      ),
    };
  }

  return {
    supabase,
    user,
    profile,
    response: null,
  };
}

/* =========================================================
   GET ALL USERS
========================================================= */

export async function GET() {
  try {
    const {
      supabase,
      response,
    } = await requireNationalAdministrator();

    if (response) {
      return response;
    }

    const {
      data: profiles,
      error,
    } = await supabase
      .from("profiles")
      .select(
        `
          id,
          full_name,
          user_type,
          role,
          is_active,
          created_at
        `
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("Admin profiles fetch error:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Unable to load users",
        },
        { status: 500 }
      );
    }

    const users = (profiles || []).map((profile) => ({
      user_id: profile.id,
      email:
        profile.id === undefined
          ? ""
          : "",
      full_name: profile.full_name || "",
      user_type: profile.user_type || "",
      role: profile.role || "",
      company_name: null,
      is_active: profile.is_active === true,
      created_at: profile.created_at,
      updated_at: profile.created_at,
    }));

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Admin users GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH USER
========================================================= */

export async function PATCH(request: Request) {
  try {
    const {
      supabase,
      user,
      profile: adminProfile,
      response,
    } = await requireNationalAdministrator();

    if (
      response ||
      !user ||
      !adminProfile
    ) {
      return (
        response ||
        NextResponse.json(
          {
            success: false,
            error: "National Administrator access required",
          },
          { status: 403 }
        )
      );
    }

    const body = await request.json();

    const targetUserId = String(
      body?.userId || ""
    ).trim();

    if (!targetUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "userId is required",
        },
        { status: 400 }
      );
    }

    /* Never allow admin to modify itself */
    if (targetUserId === user.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Your own National Administrator account cannot be modified here.",
        },
        { status: 400 }
      );
    }

    const {
      data: existingUser,
      error: existingError,
    } = await supabase
      .from("profiles")
      .select(
        "id, full_name, user_type, role, is_active, created_at"
      )
      .eq("id", targetUserId)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Target profile lookup error:",
        existingError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to locate target user",
        },
        { status: 500 }
      );
    }

    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "User profile not found",
        },
        { status: 404 }
      );
    }

    const updates: {
      user_type?: string;
      role?: string;
      is_active?: boolean;
      full_name?: string;
    } = {};

    /* =====================================================
       USER TYPE
    ===================================================== */

    if (body.userType !== undefined) {
      const requestedType = String(
        body.userType
      )
        .trim()
        .toUpperCase();

      if (
        !ALLOWED_USER_TYPES.includes(
          requestedType
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid user type",
          },
          { status: 400 }
        );
      }

      updates.user_type = requestedType;
    }

    /* =====================================================
       ROLE
    ===================================================== */

    if (body.role !== undefined) {
      const requestedRole = String(
        body.role
      ).trim();

      if (
        !ALLOWED_ROLES.includes(
          requestedRole
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid role",
          },
          { status: 400 }
        );
      }

      /* Do not permit promotion to National Administrator */
      if (
        requestedRole ===
        "National Administrator"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Additional National Administrator accounts must be provisioned separately.",
          },
          { status: 400 }
        );
      }

      updates.role = requestedRole;
    }

    /* =====================================================
       FULL NAME
    ===================================================== */

    if (body.fullName !== undefined) {
      updates.full_name = String(
        body.fullName
      ).trim();
    }

    /* =====================================================
       ACTIVE STATUS
    ===================================================== */

    if (body.isActive !== undefined) {
      updates.is_active = Boolean(
        body.isActive
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid changes supplied",
        },
        { status: 400 }
      );
    }

    /* =====================================================
       GOVERNMENT TYPE CHECK
    ===================================================== */

    const resultingType = String(
      updates.user_type ??
        existingUser.user_type ??
        ""
    ).toUpperCase();

    if (
      resultingType ===
      "GOVERNMENT"
    ) {
      /*
       * The current profiles table doesn't contain
       * an email column, so email validation is handled
       * during authentication for the administrator.
       */
    }

    /* =====================================================
       UPDATE
    ===================================================== */

    const {
      data: updatedProfile,
      error: updateError,
    } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", targetUserId)
      .select(
        `
          id,
          full_name,
          user_type,
          role,
          is_active,
          created_at
        `
      )
      .single();

    if (updateError) {
      console.error(
        "Admin profile update error:",
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            updateError.message ||
            "Unable to update user",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        user_id: updatedProfile.id,
        email: "",
        full_name:
          updatedProfile.full_name || "",
        user_type:
          updatedProfile.user_type || "",
        role:
          updatedProfile.role || "",
        company_name: null,
        is_active:
          updatedProfile.is_active === true,
        created_at:
          updatedProfile.created_at,
        updated_at:
          updatedProfile.created_at,
      },
    });
  } catch (error) {
    console.error(
      "Admin users PATCH error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}