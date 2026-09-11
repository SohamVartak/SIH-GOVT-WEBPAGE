import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const ACCESS_COOKIE = "bmg_access_token";

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function getAdminSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase URL or service role key is missing."
    );
  }

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

/* ---------------------------------------------------------
   GET ACCESS TOKEN
--------------------------------------------------------- */

async function getAccessToken(request) {
  const authorization =
    request?.headers?.get("authorization");

  if (
    authorization &&
    authorization.toLowerCase().startsWith("bearer ")
  ) {
    const token = authorization
      .substring(7)
      .trim();

    if (token) {
      console.log(
        "ADMIN APPROVAL AUTH: Using Authorization Bearer token."
      );

      return token;
    }
  }

  try {
    const cookieStore = await cookies();

    const cookieToken =
      cookieStore.get(ACCESS_COOKIE)?.value;

    if (cookieToken) {
      console.log(
        "ADMIN APPROVAL AUTH: Using bmg_access_token cookie."
      );

      return cookieToken;
    }
  } catch (error) {
    console.error(
      "ADMIN APPROVAL COOKIE READ ERROR:",
      error
    );
  }

  try {
    if (
      SUPABASE_URL &&
      SUPABASE_PUBLIC_KEY
    ) {
      const cookieStore = await cookies();

      const supabase =
        createServerClient(
          SUPABASE_URL,
          SUPABASE_PUBLIC_KEY,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll();
              },

              setAll() {},
            },
          }
        );

      const {
        data,
        error,
      } = await supabase.auth.getSession();

      if (
        !error &&
        data?.session?.access_token
      ) {
        console.log(
          "ADMIN APPROVAL AUTH: Using Supabase SSR session."
        );

        return data.session.access_token;
      }
    }
  } catch (error) {
    console.error(
      "ADMIN APPROVAL SSR AUTH ERROR:",
      error
    );
  }

  console.error(
    "ADMIN APPROVAL AUTH: No access token found."
  );

  return null;
}

/* ---------------------------------------------------------
   FIND ADMIN PROFILE
--------------------------------------------------------- */

async function findUserProfile(
  adminSupabase,
  user
) {
  const {
    data: profiles,
    error: profileError,
  } = await adminSupabase
    .from("profiles")
    .select("*");

  if (profileError) {
    console.error(
      "ADMIN APPROVAL PROFILE QUERY ERROR:",
      profileError
    );

    throw new Error(
      "Unable to read administrator profiles."
    );
  }

  if (
    !profiles ||
    profiles.length === 0
  ) {
    console.error(
      "ADMIN APPROVAL PROFILE TABLE IS EMPTY."
    );

    return null;
  }

  const authUserId =
    String(user?.id || "")
      .trim()
      .toLowerCase();

  const authEmail =
    String(user?.email || "")
      .trim()
      .toLowerCase();

  const uuidColumnCandidates = [
    "id",
    "user_id",
    "auth_user_id",
    "uid",
    "userId",
    "authUserId",
  ];

  for (const profile of profiles) {
    for (const column of uuidColumnCandidates) {
      if (
        profile &&
        profile[column] !== null &&
        profile[column] !== undefined
      ) {
        const profileValue =
          String(profile[column])
            .trim()
            .toLowerCase();

        if (
          authUserId &&
          profileValue === authUserId
        ) {
          console.log(
            "ADMIN PROFILE MATCHED BY:",
            column
          );

          return profile;
        }
      }
    }
  }

  const emailColumnCandidates = [
    "email",
    "user_email",
    "account_email",
    "login_email",
  ];

  for (const profile of profiles) {
    for (const column of emailColumnCandidates) {
      if (
        profile &&
        profile[column] !== null &&
        profile[column] !== undefined
      ) {
        const profileValue =
          String(profile[column])
            .trim()
            .toLowerCase();

        if (
          authEmail &&
          profileValue === authEmail
        ) {
          console.log(
            "ADMIN PROFILE MATCHED BY EMAIL COLUMN:",
            column
          );

          return profile;
        }
      }
    }
  }

  console.error(
    "ADMIN PROFILE NOT FOUND FOR AUTH USER:",
    {
      userId: user?.id,
      email: user?.email,
      profileCount: profiles.length,
      profileColumns:
        profiles[0]
          ? Object.keys(profiles[0])
          : [],
    }
  );

  return null;
}

/* ---------------------------------------------------------
   AUTHENTICATE GOVERNMENT ADMIN
--------------------------------------------------------- */

async function requireGovernmentAdmin(request) {
  const accessToken =
    await getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "Authentication required. Please log in again.",
        },
        401
      ),
    };
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLIC_KEY
  ) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "Supabase authentication configuration is missing.",
        },
        500
      ),
    };
  }

  const authSupabase =
    createClient(
      SUPABASE_URL,
      SUPABASE_PUBLIC_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

  const {
    data: userData,
    error: userError,
  } =
    await authSupabase.auth.getUser(
      accessToken
    );

  if (
    userError ||
    !userData?.user
  ) {
    console.error(
      "ADMIN APPROVAL SUPABASE USER ERROR:",
      userError
    );

    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "Your login session is invalid or expired. Please log in again.",
        },
        401
      ),
    };
  }

  const user = userData.user;

  console.log(
    "ADMIN APPROVAL AUTHENTICATED USER:",
    {
      id: user.id,
      email: user.email,
    }
  );

  const adminSupabase =
    getAdminSupabase();

  let profile;

  try {
    profile =
      await findUserProfile(
        adminSupabase,
        user
      );
  } catch (error) {
    console.error(
      "ADMIN APPROVAL PROFILE LOOKUP ERROR:",
      error
    );

    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            error?.message ||
            "Unable to verify administrator profile.",
        },
        500
      ),
    };
  }

  if (!profile) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "Administrator profile was not found for the logged-in account.",
        },
        403
      ),
    };
  }

  console.log(
    "ADMIN APPROVAL PROFILE FOUND:",
    {
      id: profile.id,
      user_id: profile.user_id,
      auth_user_id:
        profile.auth_user_id,
      email: profile.email,
      role: profile.role,
      user_type: profile.user_type,
    }
  );

  const possibleRoles = [
    profile.role,
    profile.user_role,
    profile.account_type,
    profile.type,
  ]
    .filter(Boolean)
    .map((value) =>
      String(value)
        .trim()
        .toLowerCase()
    );

  const userType = String(
    profile.user_type || ""
  )
    .trim()
    .toLowerCase();

  const isGovernment =
    userType === "government" ||
    userType === "government admin" ||
    userType === "govt" ||
    userType.includes("government") ||
    userType.includes("govt");

  const isAdminRole =
    possibleRoles.some(
      (role) =>
        role === "admin" ||
        role === "administrator" ||
        role === "national administrator" ||
        role.includes("government") ||
        role.includes("govt")
    );

  if (
    !isGovernment &&
    !isAdminRole
  ) {
    console.error(
      "ADMIN APPROVAL ROLE DENIED:",
      {
        userType,
        possibleRoles,
      }
    );

    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "Government administrator access required.",
        },
        403
      ),
    };
  }

  if (
    profile.is_active === false
  ) {
    return {
      ok: false,
      response: json(
        {
          success: false,
          error:
            "This administrator account is inactive.",
        },
        403
      ),
    };
  }

  return {
    ok: true,
    user,
    profile,
    accessToken,
  };
}

/* ---------------------------------------------------------
   NORMALIZE APPROVAL
--------------------------------------------------------- */

function normalizeApproval(
  approval,
  companyMaterial,
  material,
  company
) {
  return {
    ...approval,

    company_material:
      companyMaterial || null,

    material:
      material || null,

    company:
      company || null,

    company_name:
      approval.company_name ||
      company?.name ||
      company?.company_name ||
      company?.title ||
      company?.display_name ||
      companyMaterial?.company_name ||
      "",

    company_material_id:
      approval.company_material_id,

    company_material_code:
      approval.company_material_code ||
      companyMaterial?.material_code ||
      companyMaterial?.company_material_code ||
      companyMaterial?.code ||
      material?.material_number ||
      "",

    part_name:
      approval.part_name ||
      material?.part_name ||
      material?.name ||
      material?.description ||
      companyMaterial?.part_name ||
      "",

    ai_standard_code:
      approval.ai_standard_code || "",

    ai_confidence:
      approval.ai_confidence ?? null,

    approval_status:
      approval.approval_status ||
      "PENDING",

    company_email:
      approval.company_email ||
      company?.email ||
      company?.company_email ||
      companyMaterial?.company_email ||
      "",

    email_status:
      approval.email_status || null,
  };
}

/* ---------------------------------------------------------
   MATCH COMPANY WITHOUT ASSUMING companies.id
--------------------------------------------------------- */

function findCompanyByCompanyId(
  companies,
  companyId
) {
  if (
    !companyId ||
    !Array.isArray(companies)
  ) {
    return null;
  }

  const target =
    String(companyId)
      .trim()
      .toLowerCase();

  /*
   * We deliberately do NOT assume the companies table
   * has an "id" column.
   *
   * Instead, compare the supplied company_id against
   * every scalar value in each company row.
   *
   * This makes the lookup compatible with schemas using
   * company_id, company_code, uuid, code, etc.
   */

  for (const company of companies) {
    if (!company) {
      continue;
    }

    for (const [key, value] of Object.entries(
      company
    )) {
      if (
        value === null ||
        value === undefined ||
        typeof value === "object"
      ) {
        continue;
      }

      const candidate =
        String(value)
          .trim()
          .toLowerCase();

      if (
        candidate === target
      ) {
        console.log(
          "COMPANY MATCHED USING COLUMN:",
          key
        );

        return company;
      }
    }
  }

  return null;
}

/* ---------------------------------------------------------
   GET
--------------------------------------------------------- */

export async function GET(request) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return auth.response;
    }

    const adminSupabase =
      getAdminSupabase();

    const { searchParams } =
      new URL(request.url);

    const requestedStatus =
      String(
        searchParams.get("status") ||
          "ALL"
      )
        .trim()
        .toUpperCase();

    /*
     * Load approval queue.
     */

    let approvalQuery =
      adminSupabase
        .from("ai_code_approvals")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (
      requestedStatus !== "ALL"
    ) {
      approvalQuery =
        approvalQuery.eq(
          "approval_status",
          requestedStatus
        );
    }

    const {
      data: approvalRows,
      error: approvalError,
    } = await approvalQuery;

    if (approvalError) {
      console.error(
        "AI CODE APPROVALS QUERY ERROR:",
        approvalError
      );

      return json(
        {
          success: false,
          error:
            approvalError.message,
        },
        500
      );
    }

    const approvals =
      approvalRows || [];

    /*
     * company_materials lookup
     *
     * ai_code_approvals.company_material_id
     * ->
     * company_materials.material_id
     */

    const companyMaterialIds =
      [
        ...new Set(
          approvals
            .map(
              (row) =>
                row.company_material_id
            )
            .filter(
              (id) =>
                id !== null &&
                id !== undefined
            )
        ),
      ];

    let companyMaterials = [];

    if (
      companyMaterialIds.length > 0
    ) {
      const {
        data,
        error,
      } = await adminSupabase
        .from("company_materials")
        .select("*")
        .in(
          "material_id",
          companyMaterialIds
        );

      if (error) {
        console.error(
          "COMPANY MATERIALS QUERY ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error.message,
          },
          500
        );
      }

      companyMaterials =
        data || [];
    }

    /*
     * Materials
     *
     * company_materials.material_id
     * ->
     * materials.id
     */

    const materialIds =
      [
        ...new Set(
          companyMaterials
            .map(
              (row) =>
                row.material_id
            )
            .filter(
              (id) =>
                id !== null &&
                id !== undefined
            )
        ),
      ];

    let materials = [];

    if (
      materialIds.length > 0
    ) {
      const {
        data,
        error,
      } = await adminSupabase
        .from("materials")
        .select("*")
        .in(
          "id",
          materialIds
        );

      if (error) {
        console.error(
          "MATERIALS QUERY ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error.message,
          },
          500
        );
      }

      materials =
        data || [];
    }

    /*
     * Companies
     *
     * IMPORTANT:
     *
     * Do NOT use:
     *
     *   .in("id", companyIds)
     *
     * because the companies table does not
     * contain an id column.
     *
     * Instead, load the complete company rows and
     * match company_materials.company_id against
     * their actual scalar values.
     */

    let companies = [];

    const {
      data: companyRows,
      error: companyError,
    } = await adminSupabase
      .from("companies")
      .select("*");

    if (companyError) {
      console.error(
        "COMPANIES QUERY ERROR:",
        companyError
      );

      return json(
        {
          success: false,
          error:
            companyError.message,
        },
        500
      );
    }

    companies =
      companyRows || [];

    console.log(
      "COMPANIES LOADED:",
      {
        count:
          companies.length,
        columns:
          companies[0]
            ? Object.keys(
                companies[0]
              )
            : [],
      }
    );

    /*
     * Enrich approval records.
     */

    const enriched =
      approvals.map(
        (approval) => {
          const companyMaterial =
            companyMaterials.find(
              (row) =>
                String(
                  row.material_id
                ) ===
                String(
                  approval.company_material_id
                )
            ) || null;

          const material =
            companyMaterial
              ? materials.find(
                  (row) =>
                    String(
                      row.id
                    ) ===
                    String(
                      companyMaterial.material_id
                    )
                ) || null
              : null;

          const company =
            companyMaterial
              ? findCompanyByCompanyId(
                  companies,
                  companyMaterial.company_id
                )
              : null;

          return normalizeApproval(
            approval,
            companyMaterial,
            material,
            company
          );
        }
      );

    /*
     * Counts
     */

    const total =
      approvalRows?.length || 0;

    const pending =
      approvalRows?.filter(
        (row) =>
          String(
            row.approval_status || ""
          ).toUpperCase() ===
          "PENDING"
      ).length || 0;

    const approved =
      approvalRows?.filter(
        (row) =>
          String(
            row.approval_status || ""
          ).toUpperCase() ===
          "APPROVED"
      ).length || 0;

    const rejected =
      approvalRows?.filter(
        (row) =>
          String(
            row.approval_status || ""
          ).toUpperCase() ===
          "REJECTED"
      ).length || 0;

    console.log(
      "ADMIN APPROVALS LOADED:",
      {
        user:
          auth.user.email,
        total,
        pending,
        approved,
        rejected,
      }
    );

    return json({
      success: true,
      approvals: enriched,

      /*
       * Keep both names so existing frontend versions
       * continue to work.
       */
      counts: {
        total,
        pending,
        approved,
        rejected,
      },

      stats: {
        total,
        pending,
        approved,
        rejected,
      },
    });
  } catch (error) {
    console.error(
      "ADMIN APPROVAL GET ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load approval records.",
      },
      500
    );
  }
}

/* ---------------------------------------------------------
   POST
   APPROVE / REJECT / DELETE
--------------------------------------------------------- */

export async function POST(request) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return auth.response;
    }

    const body =
      await request.json();

    const approvalId =
      body?.approvalId ||
      body?.approval_id ||
      body?.id;

    const action =
      String(
        body?.action || ""
      )
        .trim()
        .toUpperCase();

    const rejectionReason =
      body?.rejectionReason ||
      body?.rejection_reason ||
      body?.reason ||
      "";

    if (!approvalId) {
      return json(
        {
          success: false,
          error:
            "Approval ID is required.",
        },
        400
      );
    }

    if (
      ![
        "APPROVE",
        "REJECT",
        "DELETE",
      ].includes(action)
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid action. Use APPROVE, REJECT, or DELETE.",
        },
        400
      );
    }

    /*
     * Forward to the central standardization-action route.
     */

    const headers = {
      "Content-Type":
        "application/json",

      Authorization:
        `Bearer ${auth.accessToken}`,
    };

    const origin =
      new URL(request.url).origin;

    const actionResponse =
      await fetch(
        `${origin}/api/standardization-action`,
        {
          method: "POST",

          headers,

          body: JSON.stringify({
            approvalId,
            action,
            rejectionReason,
          }),

          cache: "no-store",
        }
      );

    const result =
      await actionResponse
        .json()
        .catch(() => ({
          success: false,
          error:
            "Invalid response from standardization action.",
        }));

    return json(
      result,
      actionResponse.status
    );
  } catch (error) {
    console.error(
      "ADMIN APPROVAL POST ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to process approval action.",
      },
      500
    );
  }
}

/* ---------------------------------------------------------
   DELETE
--------------------------------------------------------- */

export async function DELETE(request) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return auth.response;
    }

    const body =
      await request.json();

    const approvalId =
      body?.approvalId ||
      body?.approval_id ||
      body?.id;

    if (!approvalId) {
      return json(
        {
          success: false,
          error:
            "Approval ID is required.",
        },
        400
      );
    }

    const origin =
      new URL(request.url).origin;

    const actionResponse =
      await fetch(
        `${origin}/api/standardization-action`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${auth.accessToken}`,
          },

          body: JSON.stringify({
            approvalId,
            action: "DELETE",
          }),

          cache: "no-store",
        }
      );

    const result =
      await actionResponse
        .json()
        .catch(() => ({
          success: false,
          error:
            "Invalid response from standardization action.",
        }));

    return json(
      result,
      actionResponse.status
    );
  } catch (error) {
    console.error(
      "ADMIN APPROVAL DELETE ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to delete approval record.",
      },
      500
    );
  }
}