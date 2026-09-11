import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   SUPABASE ADMIN CLIENT
========================================================= */

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function getAuthenticatedUser(request) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublicKey) {
    throw new Error(
      "Supabase URL and publishable/anon key are not configured."
    );
  }

  /* -------------------------------------------------------
     1. Authorization Bearer token
  ------------------------------------------------------- */

  const authorizationHeader =
    request?.headers?.get("authorization") || "";

  const bearerMatch =
    authorizationHeader.match(/^Bearer\s+(.+)$/i);

  const bearerToken =
    bearerMatch?.[1]?.trim() || null;

  if (bearerToken) {
    const tokenClient =
      createClient(
        supabaseUrl,
        supabasePublicKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    const {
      data: { user },
      error,
    } =
      await tokenClient.auth.getUser(
        bearerToken
      );

    if (!error && user) {
      console.log(
        "STANDARDIZATION AUTH: Bearer token accepted.",
        user.id,
        user.email
      );

      return user;
    }

    console.error(
      "STANDARDIZATION AUTH: Bearer token rejected:",
      error || "Unknown authentication error"
    );
  }

  /* -------------------------------------------------------
     2. bmg_access_token cookie
  ------------------------------------------------------- */

  const cookieStore =
    await cookies();

  const accessTokenCookie =
    cookieStore.get(
      "bmg_access_token"
    )?.value || null;

  if (accessTokenCookie) {
    const tokenClient =
      createClient(
        supabaseUrl,
        supabasePublicKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    const {
      data: { user },
      error,
    } =
      await tokenClient.auth.getUser(
        accessTokenCookie
      );

    if (!error && user) {
      console.log(
        "STANDARDIZATION AUTH: bmg_access_token accepted.",
        user.id,
        user.email
      );

      return user;
    }

    console.error(
      "STANDARDIZATION AUTH: bmg_access_token rejected:",
      error || "Unknown authentication error"
    );
  }

  /* -------------------------------------------------------
     3. Supabase SSR session
  ------------------------------------------------------- */

  const supabase =
    createServerClient(
      supabaseUrl,
      supabasePublicKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(
                ({
                  name,
                  value,
                  options,
                }) => {
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {
              // Cookie writes may not be available.
            }
          },
        },
      }
    );

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  if (error || !user) {
    console.error(
      "STANDARDIZATION AUTH ERROR:",
      error || "No authenticated user."
    );

    return null;
  }

  console.log(
    "STANDARDIZATION AUTH: Supabase SSR session accepted.",
    user.id,
    user.email
  );

  return user;
}

/* =========================================================
   GOVERNMENT ADMIN AUTHORIZATION
========================================================= */

async function requireGovernmentAdmin(
  request
) {
  const user =
    await getAuthenticatedUser(
      request
    );

  if (!user) {
    return {
      ok: false,
      status: 401,
      error:
        "Authentication required.",
    };
  }

  const adminSupabase =
    getAdminSupabase();

  let {
    data: profile,
    error: profileError,
  } =
    await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

  /*
   * Some project schemas use user_id/auth_user_id
   * instead of profiles.id.
   */

  if (!profile && !profileError) {
    const {
      data: allProfiles,
      error: allProfilesError,
    } =
      await adminSupabase
        .from("profiles")
        .select("*");

    if (allProfilesError) {
      console.error(
        "STANDARDIZATION PROFILE LOOKUP ERROR:",
        allProfilesError
      );

      return {
        ok: false,
        status: 500,
        error:
          "Unable to verify administrator profile.",
      };
    }

    const userId =
      String(user.id)
        .trim()
        .toLowerCase();

    const email =
      String(user.email || "")
        .trim()
        .toLowerCase();

    profile =
      allProfiles?.find(
        (p) => {
          const values = Object.entries(
            p || {}
          );

          return values.some(
            ([key, value]) => {
              if (
                value === null ||
                value === undefined ||
                typeof value ===
                  "object"
              ) {
                return false;
              }

              const normalized =
                String(value)
                  .trim()
                  .toLowerCase();

              if (
                [
                  "id",
                  "user_id",
                  "auth_user_id",
                  "uid",
                  "userid",
                  "authuserid",
                ].includes(
                  key.toLowerCase()
                )
              ) {
                return (
                  normalized ===
                  userId
                );
              }

              if (
                [
                  "email",
                  "user_email",
                  "account_email",
                  "login_email",
                ].includes(
                  key.toLowerCase()
                )
              ) {
                return (
                  normalized ===
                  email
                );
              }

              return false;
            }
          );
        }
      ) || null;
  }

  if (profileError) {
    console.error(
      "STANDARDIZATION PROFILE ERROR:",
      profileError
    );

    return {
      ok: false,
      status: 500,
      error:
        "Unable to verify administrator profile.",
    };
  }

  if (!profile) {
    console.error(
      "STANDARDIZATION ADMIN PROFILE NOT FOUND:",
      {
        userId: user.id,
        email: user.email,
      }
    );

    return {
      ok: false,
      status: 403,
      error:
        "Administrator profile was not found.",
    };
  }

  if (
    profile.is_active === false ||
    String(
      profile.is_active
    ).toLowerCase() ===
      "false"
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Administrator account is inactive.",
    };
  }

  const role =
    String(
      profile.role || ""
    ).toLowerCase();

  const userType =
    String(
      profile.user_type || ""
    ).toLowerCase();

  const department =
    String(
      profile.department || ""
    ).toLowerCase();

  const isAdmin =
    role.includes("admin") ||
    role.includes("government") ||
    role.includes("govt") ||
    userType.includes("admin") ||
    userType.includes("government") ||
    userType.includes("govt") ||
    department.includes("government") ||
    department.includes("govt");

  if (!isAdmin) {
    console.error(
      "STANDARDIZATION ADMIN AUTHORIZATION FAILED:",
      {
        userId: user.id,
        profileId: profile.id,
        role: profile.role,
        userType:
          profile.user_type,
        department:
          profile.department,
      }
    );

    return {
      ok: false,
      status: 403,
      error:
        "Government administrator access required.",
    };
  }

  return {
    ok: true,
    user,
    profile,
  };
}

/* =========================================================
   FIND MATERIAL
========================================================= */

async function findActualMaterial(
  adminSupabase,
  materialId
) {
  if (!materialId) {
    return null;
  }

  const {
    data,
    error,
  } =
    await adminSupabase
      .from("materials")
      .select("*")
      .eq("id", materialId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load material: ${error.message}`
    );
  }

  return data || null;
}

/* =========================================================
   LOAD COMPANY MATERIAL
========================================================= */

async function getCompanyMaterial(
  adminSupabase,
  companyMaterialId
) {
  if (!companyMaterialId) {
    return null;
  }

  /*
   * Your current schema uses:
   *
   * company_materials.material_id
   *
   * as the material relationship.
   */

  const {
    data,
    error,
  } =
    await adminSupabase
      .from("company_materials")
      .select("*")
      .eq(
        "material_id",
        companyMaterialId
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load company material: ${error.message}`
    );
  }

  return data || null;
}

/* =========================================================
   FIND COMPANY
========================================================= */

async function findCompany(
  adminSupabase,
  companyId,
  companyMaterial,
  approval
) {
  const {
    data: companies,
    error,
  } =
    await adminSupabase
      .from("companies")
      .select("*");

  if (error) {
    console.error(
      "COMPANY LOOKUP ERROR:",
      error
    );

    return null;
  }

  if (!companies?.length) {
    return null;
  }

  const target =
    String(companyId || "")
      .trim()
      .toLowerCase();

  if (target) {
    for (const company of companies) {
      for (const [
        key,
        value,
      ] of Object.entries(
        company || {}
      )) {
        if (
          value === null ||
          value === undefined ||
          typeof value ===
            "object"
        ) {
          continue;
        }

        if (
          String(value)
            .trim()
            .toLowerCase() ===
          target
        ) {
          console.log(
            "COMPANY MATCHED USING COLUMN:",
            key
          );

          return company;
        }
      }
    }
  }

  /*
   * Fallback to company information already
   * stored with the approval/material.
   */

  const approvalCompanyName =
    approval?.company_name ||
    companyMaterial?.company_name;

  if (approvalCompanyName) {
    const normalized =
      String(
        approvalCompanyName
      )
        .trim()
        .toLowerCase();

    const match =
      companies.find(
        (company) => {
          const names = [
            company?.name,
            company?.company_name,
            company?.title,
            company?.display_name,
          ]
            .filter(Boolean)
            .map((value) =>
              String(value)
                .trim()
                .toLowerCase()
            );

          return names.includes(
            normalized
          );
        }
      );

    if (match) {
      return match;
    }
  }

  return null;
}

/* =========================================================
   FIND BMG
========================================================= */

async function findBMGByCode(
  adminSupabase,
  standardCode
) {
  if (!standardCode) {
    return null;
  }

  const code =
    String(standardCode)
      .trim();

  if (!code) {
    return null;
  }

  /*
   * BMG code is the global technical identity.
   *
   * Search several likely code columns without
   * assuming only one exact schema.
   */

  const columns = [
    "bmg_code",
    "standard_code",
    "code",
    "material_code",
    "identity_code",
  ];

  for (const column of columns) {
    try {
      const {
        data,
        error,
      } =
        await adminSupabase
          .from("bmg_materials")
          .select("*")
          .eq(column, code)
          .limit(1)
          .maybeSingle();

      if (!error && data) {
        return data;
      }
    } catch {
      // Ignore unsupported columns.
    }
  }

  return null;
}

/* =========================================================
   FIND BMG BY MATERIAL MAPPING
========================================================= */

async function findMappedBMG(
  adminSupabase,
  materialId
) {
  if (!materialId) {
    return null;
  }

  try {
    const {
      data: mapping,
      error,
    } =
      await adminSupabase
        .from("material_bmg_mapping")
        .select("*")
        .eq(
          "material_id",
          materialId
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (
      !error &&
      mapping
    ) {
      return mapping;
    }
  } catch {
    // Continue to direct materials lookup.
  }

  return null;
}

/* =========================================================
   FINALIZE BMG
========================================================= */

async function finalizeBMGMapping(
  adminSupabase,
  approval,
  adminUser
) {
  const materialId =
    approval?.company_material_id;

  if (!materialId) {
    throw new Error(
      "The approval record does not contain a material ID."
    );
  }

  const material =
    await findActualMaterial(
      adminSupabase,
      materialId
    );

  if (!material) {
    throw new Error(
      "The material associated with this approval was not found."
    );
  }

  /*
   * The AI-assigned code comes from the approval.
   */

  const standardCode =
    String(
      approval.ai_standard_code ||
        approval.bmg_code ||
        approval.standard_code ||
        ""
    ).trim();

  if (!standardCode) {
    throw new Error(
      "No AI/BMG standard code is present on this approval."
    );
  }

  /*
   * First try to find the existing global BMG.
   *
   * We MUST reuse the same BMG code for technically
   * equivalent materials across companies.
   */

  let bmg =
    await findBMGByCode(
      adminSupabase,
      standardCode
    );

  /*
   * If BMG already exists, use it.
   */

  if (bmg) {
    console.log(
      "EXISTING GLOBAL BMG FOUND:",
      {
        bmgId: bmg.id,
        standardCode,
      }
    );
  } else {
    /*
     * If it does not exist, create the BMG record.
     *
     * Try the standard schema first.
     */

    const insertPayload = {
      bmg_code: standardCode,
      status: "APPROVED",
    };

    /*
     * Add a useful name/description when the
     * corresponding fields are available.
     */

    const possibleName =
      material.part_name ||
      material.name ||
      material.description ||
      approval.part_name ||
      standardCode;

    insertPayload.name =
      possibleName;

    insertPayload.description =
      material.description ||
      material.specifications ||
      approval.part_name ||
      null;

    let {
      data: insertedBMG,
      error: insertError,
    } =
      await adminSupabase
        .from("bmg_materials")
        .insert(
          insertPayload
        )
        .select("*")
        .maybeSingle();

    /*
     * Some schemas may not have name/description.
     * Retry using only the essential fields.
     */

    if (insertError) {
      console.error(
        "BMG FULL INSERT FAILED:",
        insertError
      );

      const {
        data: retryBMG,
        error: retryError,
      } =
        await adminSupabase
          .from("bmg_materials")
          .insert({
            bmg_code:
              standardCode,
            status:
              "APPROVED",
          })
          .select("*")
          .maybeSingle();

      if (retryError) {
        throw new Error(
          `Unable to create BMG standard: ${retryError.message}`
        );
      }

      insertedBMG =
        retryBMG;
    }

    bmg =
      insertedBMG;

    console.log(
      "NEW GLOBAL BMG CREATED:",
      {
        bmgId: bmg?.id,
        standardCode,
      }
    );
  }

  if (!bmg) {
    throw new Error(
      "BMG standard could not be loaded or created."
    );
  }

  /*
   * -------------------------------------------------------
   * CREATE / UPDATE MATERIAL → BMG MAPPING
   * -------------------------------------------------------
   */

  const mappingPayload = {
    material_id: materialId,
    bmg_id: bmg.id,
    is_active: true,
  };

  /*
   * Include approval metadata where supported.
   */

  mappingPayload.mapping_status =
    "APPROVED";

  mappingPayload.source =
    "GOVERNMENT_APPROVED";

  mappingPayload.approved_by =
    adminUser.id;

  mappingPayload.approved_at =
    new Date().toISOString();

  let mapping = null;

  try {
    /*
     * First deactivate previous active mappings.
     */

    await adminSupabase
      .from(
        "material_bmg_mapping"
      )
      .update({
        is_active: false,
      })
      .eq(
        "material_id",
        materialId
      )
      .eq(
        "is_active",
        true
      );

    const {
      data,
      error,
    } =
      await adminSupabase
        .from(
          "material_bmg_mapping"
        )
        .insert(
          mappingPayload
        )
        .select("*")
        .maybeSingle();

    if (error) {
      console.error(
        "BMG MAPPING FULL INSERT FAILED:",
        error
      );

      /*
       * Retry with only fields that are fundamental
       * to the mapping.
       */

      const {
        data: retryMapping,
        error: retryError,
      } =
        await adminSupabase
          .from(
            "material_bmg_mapping"
          )
          .insert({
            material_id:
              materialId,
            bmg_id:
              bmg.id,
            is_active:
              true,
          })
          .select("*")
          .maybeSingle();

      if (retryError) {
        throw new Error(
          `Unable to create material-BMG mapping: ${retryError.message}`
        );
      }

      mapping =
        retryMapping;
    } else {
      mapping = data;
    }
  } catch (error) {
    throw new Error(
      error?.message ||
        "Unable to create material-BMG mapping."
    );
  }

  /*
   * -------------------------------------------------------
   * UPDATE MATERIAL
   * -------------------------------------------------------
   */

  let materialUpdateSucceeded =
    false;

  try {
    const {
      error,
    } =
      await adminSupabase
        .from("materials")
        .update({
          bmg_id:
            bmg.id,
        })
        .eq(
          "id",
          materialId
        );

    if (!error) {
      materialUpdateSucceeded =
        true;
    } else {
      console.error(
        "MATERIAL BMG_ID UPDATE ERROR:",
        error
      );
    }
  } catch (error) {
    console.error(
      "MATERIAL BMG_ID UPDATE EXCEPTION:",
      error
    );
  }

  /*
   * The mapping is the authoritative relationship.
   * materials.bmg_id is updated when that column exists.
   */

  console.log(
    "BMG MAPPING FINALIZED:",
    {
      materialId,
      bmgId: bmg.id,
      standardCode,
      materialUpdateSucceeded,
      mappingId:
        mapping?.id || null,
      approvedBy:
        adminUser.id,
    }
  );

  return {
    material,
    bmg,
    mapping,
    standardCode,
  };
}

/* =========================================================
   REMOVE MATERIAL FROM AI SEARCH
========================================================= */

async function removeMaterialFromAISearch(
  adminSupabase,
  materialId
) {
  if (!materialId) {
    return;
  }

  try {
    await adminSupabase
      .from(
        "material_ncs_mapping"
      )
      .delete()
      .eq(
        "material_id",
        materialId
      );
  } catch (error) {
    console.error(
      "AI SEARCH NCS MAPPING DELETE ERROR:",
      error
    );
  }

  const possibleTables = [
    "ai_material_search",
    "ai_search_materials",
    "material_embeddings",
  ];

  for (const table of possibleTables) {
    try {
      const {
        error,
      } =
        await adminSupabase
          .from(table)
          .delete()
          .eq(
            "material_id",
            materialId
          );

      if (error) {
        console.log(
          `AI SEARCH TABLE ${table} NOT CHANGED:`,
          error.message
        );
      }
    } catch (error) {
      console.log(
        `AI SEARCH TABLE ${table} UNAVAILABLE:`,
        error
      );
    }
  }
}

/* =========================================================
   PURGE MATERIAL
========================================================= */

async function purgeMaterial(
  adminSupabase,
  materialId
) {
  if (!materialId) {
    throw new Error(
      "Material ID is required."
    );
  }

  await removeMaterialFromAISearch(
    adminSupabase,
    materialId
  );

  try {
    await adminSupabase
      .from(
        "material_bmg_mapping"
      )
      .delete()
      .eq(
        "material_id",
        materialId
      );
  } catch (error) {
    console.error(
      "BMG MAPPING DELETE ERROR:",
      error
    );
  }

  try {
    await adminSupabase
      .from(
        "material_ncs_mapping"
      )
      .delete()
      .eq(
        "material_id",
        materialId
      );
  } catch (error) {
    console.error(
      "MATERIAL NCS MAPPING DELETE ERROR:",
      error
    );
  }

  const {
    error:
      approvalDeleteError,
  } =
    await adminSupabase
      .from(
        "ai_code_approvals"
      )
      .delete()
      .eq(
        "company_material_id",
        materialId
      );

  if (approvalDeleteError) {
    console.error(
      "AI APPROVAL DELETE ERROR:",
      approvalDeleteError
    );
  }

  const {
    error:
      companyMaterialDeleteError,
  } =
    await adminSupabase
      .from(
        "company_materials"
      )
      .delete()
      .eq(
        "material_id",
        materialId
      );

  if (companyMaterialDeleteError) {
    throw new Error(
      `Unable to delete company material: ${companyMaterialDeleteError.message}`
    );
  }

  const {
    error:
      materialDeleteError,
  } =
    await adminSupabase
      .from("materials")
      .delete()
      .eq(
        "id",
        materialId
      );

  if (materialDeleteError) {
    throw new Error(
      `Unable to delete material: ${materialDeleteError.message}`
    );
  }

  return true;
}

/* =========================================================
   APPROVE MATERIAL
========================================================= */

async function approveMaterial(
  adminSupabase,
  approvalId,
  adminUser
) {
  if (!approvalId) {
    throw new Error(
      "Approval ID is required."
    );
  }

  const {
    data: approval,
    error: approvalError,
  } =
    await adminSupabase
      .from(
        "ai_code_approvals"
      )
      .select("*")
      .eq(
        "id",
        approvalId
      )
      .maybeSingle();

  if (approvalError) {
    throw new Error(
      `Unable to load approval: ${approvalError.message}`
    );
  }

  if (!approval) {
    throw new Error(
      "Approval record was not found."
    );
  }

  if (!adminUser?.id) {
    throw new Error(
      "Authenticated administrator UUID is missing."
    );
  }

  /*
   * Do not approve an already rejected record.
   */

  const currentStatus =
    String(
      approval.approval_status ||
        ""
    )
      .trim()
      .toUpperCase();

  if (
    currentStatus ===
    "REJECTED"
  ) {
    throw new Error(
      "A rejected approval cannot be approved."
    );
  }

  /*
   * -------------------------------------------------------
   * FIRST FINALIZE BMG
   * -------------------------------------------------------
   *
   * This is the important part.
   *
   * Government approval now turns the AI proposal into
   * an actual material → global BMG relationship.
   */

  const finalized =
    await finalizeBMGMapping(
      adminSupabase,
      approval,
      adminUser
    );

  const approvedBy =
    adminUser.id;

  const approvedAt =
    new Date().toISOString();

  /*
   * -------------------------------------------------------
   * THEN MARK APPROVAL AS APPROVED
   * -------------------------------------------------------
   */

  const {
    data:
      updatedApproval,
    error:
      updateError,
  } =
    await adminSupabase
      .from(
        "ai_code_approvals"
      )
      .update({
        approval_status:
          "APPROVED",

        approved_by:
          approvedBy,

        approved_at:
          approvedAt,
      })
      .eq(
        "id",
        approvalId
      )
      .select("*")
      .maybeSingle();

  if (updateError) {
    /*
     * At this point BMG has already been finalized.
     * Do not pretend the entire operation failed silently.
     */

    console.error(
      "APPROVAL STATUS UPDATE FAILED AFTER BMG FINALIZATION:",
      updateError
    );

    throw new Error(
      `BMG was finalized, but approval status could not be updated: ${updateError.message}`
    );
  }

  if (!updatedApproval) {
    throw new Error(
      "Approval update completed but the updated approval record could not be loaded."
    );
  }

  console.log(
    "STANDARDIZATION APPROVED AND BMG FINALIZED:",
    {
      approvalId,
      materialId:
        approval.company_material_id,
      bmgId:
        finalized.bmg?.id,
      standardCode:
        finalized.standardCode,
      approvedBy,
      approvedByEmail:
        adminUser.email,
      approvedAt,
    }
  );

  return {
    approval:
      updatedApproval,

    material:
      finalized.material,

    bmg:
      finalized.bmg,

    mapping:
      finalized.mapping,

    standardCode:
      finalized.standardCode,
  };
}

/* =========================================================
   REJECT MATERIAL
========================================================= */

async function rejectMaterial(
  adminSupabase,
  approvalId,
  reason,
  adminUser
) {
  if (!approvalId) {
    throw new Error(
      "Approval ID is required."
    );
  }

  const {
    data: approval,
    error: approvalError,
  } =
    await adminSupabase
      .from(
        "ai_code_approvals"
      )
      .select("*")
      .eq(
        "id",
        approvalId
      )
      .maybeSingle();

  if (approvalError) {
    throw new Error(
      `Unable to load approval: ${approvalError.message}`
    );
  }

  if (!approval) {
    throw new Error(
      "Approval record was not found."
    );
  }

  if (!adminUser?.id) {
    throw new Error(
      "Authenticated administrator UUID is missing."
    );
  }

  const currentStatus =
    String(
      approval.approval_status ||
        ""
    )
      .trim()
      .toUpperCase();

  if (
    currentStatus ===
    "APPROVED"
  ) {
    throw new Error(
      "An approved material cannot be rejected."
    );
  }

  const rejectionReason =
    String(reason || "")
      .trim() ||
    "Rejected by government administrator.";

  const rejectedBy =
    adminUser.id;

  const rejectedAt =
    new Date().toISOString();

  const {
    data:
      updatedApproval,
    error:
      updateError,
  } =
    await adminSupabase
      .from(
        "ai_code_approvals"
      )
      .update({
        approval_status:
          "REJECTED",

        rejected_by:
          rejectedBy,

        rejected_at:
          rejectedAt,

        rejection_reason:
          rejectionReason,
      })
      .eq(
        "id",
        approvalId
      )
      .select("*")
      .maybeSingle();

  if (updateError) {
    throw new Error(
      `Unable to reject material: ${updateError.message}`
    );
  }

  if (!updatedApproval) {
    throw new Error(
      "Rejection update completed but the updated approval record could not be loaded."
    );
  }

  console.log(
    "STANDARDIZATION REJECTED:",
    {
      approvalId,
      companyMaterialId:
        approval.company_material_id,
      rejectedBy,
      rejectedByEmail:
        adminUser.email,
      rejectedAt,
      rejectionReason,
    }
  );

  return {
    approval:
      updatedApproval,

    reason:
      rejectionReason,
  };
}

/* =========================================================
   GET APPROVAL RECORDS
========================================================= */

export async function GET(
  request
) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return Response.json(
        {
          success: false,
          error: auth.error,
        },
        {
          status:
            auth.status,
        }
      );
    }

    const adminSupabase =
      getAdminSupabase();

    const {
      data,
      error,
    } =
      await adminSupabase
        .from(
          "ai_code_approvals"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (error) {
      throw new Error(
        `Unable to load AI approvals: ${error.message}`
      );
    }

    const approvals =
      data || [];

    const enriched =
      [];

    /*
     * Cache company rows once instead of querying
     * companies for every approval.
     */

    let companies = [];

    try {
      const {
        data: companyRows,
      } =
        await adminSupabase
          .from("companies")
          .select("*");

      companies =
        companyRows || [];
    } catch {
      companies = [];
    }

    for (const approval of approvals) {
      let companyMaterial =
        null;

      let material =
        null;

      let company =
        null;

      if (
        approval.company_material_id
      ) {
        try {
          companyMaterial =
            await getCompanyMaterial(
              adminSupabase,
              approval.company_material_id
            );
        } catch (error) {
          console.error(
            "COMPANY MATERIAL LOAD ERROR:",
            error
          );
        }
      }

      if (
        companyMaterial?.material_id
      ) {
        try {
          material =
            await findActualMaterial(
              adminSupabase,
              companyMaterial.material_id
            );
        } catch (error) {
          console.error(
            "MATERIAL LOAD ERROR:",
            error
          );
        }
      }

      /*
       * Company lookup without assuming companies.id.
       */

      if (
        companyMaterial?.company_id
      ) {
        const target =
          String(
            companyMaterial.company_id
          )
            .trim()
            .toLowerCase();

        company =
          companies.find(
            (candidate) =>
              Object.values(
                candidate || {}
              ).some(
                (value) => {
                  if (
                    value ===
                      null ||
                    value ===
                      undefined ||
                    typeof value ===
                      "object"
                  ) {
                    return false;
                  }

                  return (
                    String(
                      value
                    )
                      .trim()
                      .toLowerCase() ===
                    target
                  );
                }
              )
          ) || null;
      }

      const companyName =
        company?.name ||
        company?.company_name ||
        companyMaterial?.company_name ||
        approval.company_name ||
        null;

      const companyEmail =
        company?.email ||
        company?.company_email ||
        companyMaterial?.company_email ||
        approval.company_email ||
        null;

      const partName =
        material?.part_name ||
        material?.name ||
        material?.description ||
        companyMaterial?.part_name ||
        approval.part_name ||
        null;

      const companyMaterialCode =
        companyMaterial?.material_code ||
        companyMaterial?.company_material_code ||
        companyMaterial?.code ||
        approval.company_material_code ||
        null;

      enriched.push({
        ...approval,

        company_name:
          companyName,

        company_email:
          companyEmail,

        part_name:
          partName,

        company_material_code:
          companyMaterialCode,

        company_material:
          companyMaterial,

        material,

        company,
      });
    }

    const total =
      enriched.length;

    const pending =
      enriched.filter(
        (item) =>
          String(
            item.approval_status ||
              "PENDING"
          )
            .toUpperCase() ===
          "PENDING"
      ).length;

    const approved =
      enriched.filter(
        (item) =>
          String(
            item.approval_status ||
              ""
          )
            .toUpperCase() ===
          "APPROVED"
      ).length;

    const rejected =
      enriched.filter(
        (item) =>
          String(
            item.approval_status ||
              ""
          )
            .toUpperCase() ===
          "REJECTED"
      ).length;

    console.log(
      "STANDARDIZATION APPROVALS LOADED:",
      {
        user:
          auth.user?.email,
        total,
        pending,
        approved,
        rejected,
      }
    );

    return Response.json({
      success: true,

      approvals:
        enriched,

      data:
        enriched,

      stats: {
        total,
        pending,
        approved,
        rejected,
      },
    });
  } catch (error) {
    console.error(
      "STANDARDIZATION GET ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to load standardization data.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request
) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return Response.json(
        {
          success: false,
          error: auth.error,
        },
        {
          status:
            auth.status,
        }
      );
    }

    const body =
      await request.json();

    const action =
      String(
        body.action ||
          body.type ||
          body.status ||
          ""
      )
        .trim()
        .toUpperCase();

    const approvalId =
      body.approvalId ||
      body.approval_id ||
      body.id ||
      null;

    const materialId =
      body.materialId ||
      body.material_id ||
      null;

    const reason =
      body.reason ||
      body.rejectionReason ||
      body.rejection_reason ||
      "";

    const adminSupabase =
      getAdminSupabase();

    /* -------------------------------------------------------
       APPROVE
    ------------------------------------------------------- */

    if (
      action ===
        "APPROVE" ||
      action ===
        "APPROVED"
    ) {
      if (!approvalId) {
        return Response.json(
          {
            success: false,
            error:
              "Approval ID is required.",
          },
          {
            status: 400,
          }
        );
      }

      const result =
        await approveMaterial(
          adminSupabase,
          approvalId,
          auth.user
        );

      return Response.json({
        success: true,

        action:
          "APPROVE",

        message:
          "Material approved and BMG standard finalized successfully.",

        ...result,
      });
    }

    /* -------------------------------------------------------
       REJECT
    ------------------------------------------------------- */

    if (
      action ===
        "REJECT" ||
      action ===
        "REJECTED"
    ) {
      if (!approvalId) {
        return Response.json(
          {
            success: false,
            error:
              "Approval ID is required.",
          },
          {
            status: 400,
          }
        );
      }

      const result =
        await rejectMaterial(
          adminSupabase,
          approvalId,
          reason,
          auth.user
        );

      return Response.json({
        success: true,

        action:
          "REJECT",

        message:
          "Material rejected successfully.",

        ...result,
      });
    }

    /* -------------------------------------------------------
       DELETE
    ------------------------------------------------------- */

    if (
      action ===
        "DELETE" ||
      action ===
        "REMOVE"
    ) {
      let resolvedMaterialId =
        materialId;

      if (
        !resolvedMaterialId &&
        approvalId
      ) {
        const {
          data: approval,
          error:
            approvalError,
        } =
          await adminSupabase
            .from(
              "ai_code_approvals"
            )
            .select(
              "company_material_id"
            )
            .eq(
              "id",
              approvalId
            )
            .maybeSingle();

        if (approvalError) {
          throw new Error(
            `Unable to load approval: ${approvalError.message}`
          );
        }

        if (!approval) {
          return Response.json(
            {
              success: false,
              error:
                "Approval record was not found.",
            },
            {
              status: 404,
            }
          );
        }

        const companyMaterial =
          await getCompanyMaterial(
            adminSupabase,
            approval.company_material_id
          );

        if (!companyMaterial) {
          return Response.json(
            {
              success: false,
              error:
                "Company material was not found.",
            },
            {
              status: 404,
            }
          );
        }

        resolvedMaterialId =
          companyMaterial.material_id;
      }

      if (!resolvedMaterialId) {
        return Response.json(
          {
            success: false,
            error:
              "Material ID or Approval ID is required.",
          },
          {
            status: 400,
          }
        );
      }

      await purgeMaterial(
        adminSupabase,
        resolvedMaterialId
      );

      console.log(
        "STANDARDIZATION MATERIAL DELETED:",
        {
          materialId:
            resolvedMaterialId,
          approvalId,
        }
      );

      return Response.json({
        success: true,

        action:
          "DELETE",

        message:
          "Material deleted successfully.",

        materialId:
          resolvedMaterialId,
      });
    }

    return Response.json(
      {
        success: false,
        error:
          "Invalid action. Use APPROVE, REJECT, or DELETE.",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "STANDARDIZATION POST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Standardization action failed.",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   DELETE HTTP METHOD
========================================================= */

export async function DELETE(
  request
) {
  try {
    const auth =
      await requireGovernmentAdmin(
        request
      );

    if (!auth.ok) {
      return Response.json(
        {
          success: false,
          error: auth.error,
        },
        {
          status:
            auth.status,
        }
      );
    }

    const adminSupabase =
      getAdminSupabase();

    const url =
      new URL(
        request.url
      );

    let materialId =
      url.searchParams.get(
        "materialId"
      ) ||
      url.searchParams.get(
        "material_id"
      );

    let approvalId =
      url.searchParams.get(
        "approvalId"
      ) ||
      url.searchParams.get(
        "approval_id"
      );

    if (
      !materialId &&
      !approvalId
    ) {
      try {
        const body =
          await request.json();

        materialId =
          body.materialId ||
          body.material_id ||
          null;

        approvalId =
          body.approvalId ||
          body.approval_id ||
          null;
      } catch {
        // No JSON body.
      }
    }

    if (
      !materialId &&
      approvalId
    ) {
      const {
        data: approval,
        error,
      } =
        await adminSupabase
          .from(
            "ai_code_approvals"
          )
          .select(
            "company_material_id"
          )
          .eq(
            "id",
            approvalId
          )
          .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to load approval: ${error.message}`
        );
      }

      if (!approval) {
        return Response.json(
          {
            success: false,
            error:
              "Approval record was not found.",
          },
          {
            status: 404,
          }
        );
      }

      const companyMaterial =
        await getCompanyMaterial(
          adminSupabase,
          approval.company_material_id
        );

      if (!companyMaterial) {
        return Response.json(
          {
            success: false,
            error:
              "Company material was not found.",
          },
          {
            status: 404,
          }
        );
      }

      materialId =
        companyMaterial.material_id;
    }

    if (!materialId) {
      return Response.json(
        {
          success: false,
          error:
            "Material ID or Approval ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    await purgeMaterial(
      adminSupabase,
      materialId
    );

    console.log(
      "STANDARDIZATION DELETE COMPLETED:",
      {
        materialId,
        approvalId,
      }
    );

    return Response.json({
      success: true,

      message:
        "Material deleted successfully.",

      materialId,
    });
  } catch (error) {
    console.error(
      "STANDARDIZATION DELETE ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to delete material.",
      },
      {
        status: 500,
      }
    );
  }
}