import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function GET() {
  try {
    /*
     * ---------------------------------------------------------
     * 1. LOAD ALL MATERIALS
     * ---------------------------------------------------------
     */

    const { data: materials, error: materialsError } = await supabase
      .from("materials")
      .select(`
        id,
        company,
        company_id,
        material_number,
        description,
        specifications,
        category
      `)
      .order("id", { ascending: false })
      .limit(5000);

    if (materialsError) {
      console.error("MATERIALS LOAD ERROR:", materialsError);

      return Response.json(
        {
          success: false,
          error: materialsError.message,
          materials: [],
        },
        { status: 500 }
      );
    }

    /*
     * ---------------------------------------------------------
     * 2. GET REJECTED APPROVALS
     *
     * IMPORTANT:
     *
     * ai_code_approvals.company_material_id
     * is NOT materials.id.
     *
     * It refers to:
     *
     * company_materials.material_id
     * ---------------------------------------------------------
     */

    const { data: rejectedApprovals, error: rejectedError } =
      await supabase
        .from("ai_code_approvals")
        .select("company_material_id")
        .eq("approval_status", "REJECTED");

    if (rejectedError) {
      console.error("REJECTED APPROVAL LOAD ERROR:", rejectedError);

      return Response.json(
        {
          success: false,
          error: rejectedError.message,
          materials: [],
        },
        { status: 500 }
      );
    }

    const rejectedCompanyMaterialIds = [
      ...new Set(
        (rejectedApprovals || [])
          .map((row) => row.company_material_id)
          .filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              value !== ""
          )
      ),
    ];

    /*
     * ---------------------------------------------------------
     * 3. RESOLVE REJECTED COMPANY MATERIALS
     * ---------------------------------------------------------
     */

    const rejectedMaterialKeys = new Set();

    if (rejectedCompanyMaterialIds.length > 0) {
      const { data: rejectedCompanyMaterials, error: cmError } =
        await supabase
          .from("company_materials")
          .select(`
            material_id,
            company_id,
            company_material_code
          `)
          .in("material_id", rejectedCompanyMaterialIds);

      if (cmError) {
        console.error(
          "REJECTED COMPANY MATERIAL LOAD ERROR:",
          cmError
        );

        return Response.json(
          {
            success: false,
            error: cmError.message,
            materials: [],
          },
          { status: 500 }
        );
      }

      /*
       * Create a lookup like:
       *
       * company_id | material_code
       *
       * Example:
       *
       * 12|abc123
       * 15|bpcl-456
       */

      for (const row of rejectedCompanyMaterials || []) {
        const key = `${row.company_id}|${normalizeCode(
          row.company_material_code
        )}`;

        rejectedMaterialKeys.add(key);
      }
    }

    /*
     * ---------------------------------------------------------
     * 4. REMOVE REJECTED MATERIALS FROM THE RESULT
     * ---------------------------------------------------------
     */

    const activeMaterials = (materials || []).filter((material) => {
      const key = `${material.company_id}|${normalizeCode(
        material.material_number
      )}`;

      return !rejectedMaterialKeys.has(key);
    });

    /*
     * ---------------------------------------------------------
     * 5. RETURN ONLY ACTIVE MATERIALS
     * ---------------------------------------------------------
     */

    return Response.json(
      {
        success: true,
        materials: activeMaterials,
        count: activeMaterials.length,
        totalMaterials: (materials || []).length,
        rejectedMaterials:
          (materials || []).length - activeMaterials.length,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("ACTIVE MATERIALS API ERROR:", error);

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to load active materials",
        materials: [],
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}