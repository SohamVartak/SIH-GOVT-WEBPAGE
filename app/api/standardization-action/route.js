import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ============================================================
   HELPERS
============================================================ */

function safeText(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  return String(value).trim();
}

function normalizeAction(value) {
  return safeText(value).toUpperCase();
}

/* ============================================================
   POST
============================================================ */

export async function POST(request) {
  try {
    /* --------------------------------------------------------
       ENVIRONMENT
    -------------------------------------------------------- */

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

    /* --------------------------------------------------------
       REQUEST BODY
    -------------------------------------------------------- */

    const body = await request.json();

    const requestId = body.requestId;
    const action = normalizeAction(body.action);
    const reviewer =
      safeText(body.reviewer) ||
      "Material Master Officer";

    const comments =
      safeText(body.comments);

    if (
      requestId === null ||
      requestId === undefined ||
      requestId === ""
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "requestId is required.",
        },
        { status: 400 }
      );
    }

    const allowedActions = new Set([
      "APPROVE",
      "REJECT",
      "NEEDS_MORE_DATA",
    ]);

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid action. Use APPROVE, REJECT, or NEEDS_MORE_DATA.",
        },
        { status: 400 }
      );
    }

    /* --------------------------------------------------------
       1. LOAD REQUEST
    -------------------------------------------------------- */

    const {
      data: standardizationRequest,
      error: requestError,
    } = await supabase
      .from("standardization_requests")
      .select(
        [
          "request_id",
          "ncs_id",
          "status",
          "created_by_ai",
          "reviewed_by",
          "review_date",
          "government_comments",
        ].join(",")
      )
      .eq(
        "request_id",
        requestId
      )
      .single();

    if (
      requestError ||
      !standardizationRequest
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Standardization request was not found.",
          details:
            requestError?.message ||
            null,
        },
        { status: 404 }
      );
    }

    /* --------------------------------------------------------
       2. LOAD NCS
    -------------------------------------------------------- */

    const {
      data: ncs,
      error: ncsError,
    } = await supabase
      .from("ncs_materials")
      .select(
        "ncs_id, ncs_code, ncs_name, category, status"
      )
      .eq(
        "ncs_id",
        standardizationRequest.ncs_id
      )
      .single();

    if (
      ncsError ||
      !ncs
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Associated national material record was not found.",
          details:
            ncsError?.message ||
            null,
        },
        { status: 404 }
      );
    }

    /* --------------------------------------------------------
       3. LOAD MAPPINGS
    -------------------------------------------------------- */

    const {
      data: mappings,
      error: mappingsError,
    } = await supabase
      .from("material_ncs_mapping")
      .select(
        [
          "material_id",
          "ncs_id",
          "ai_confidence",
          "ai_reason",
          "match_status",
          "verified",
        ].join(",")
      )
      .eq(
        "ncs_id",
        ncs.ncs_id
      );

    if (mappingsError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to load national material mappings.",
          details:
            mappingsError.message,
        },
        { status: 500 }
      );
    }

    const mappingRows =
      mappings || [];

    const reviewDate =
      new Date().toISOString();

    /* ========================================================
       ACTION: APPROVE
    ======================================================== */

    if (action === "APPROVE") {
      /* ------------------------------------------------------
         A. APPROVE THE NATIONAL MATERIAL
      ------------------------------------------------------ */

      const {
        error: ncsUpdateError,
      } = await supabase
        .from("ncs_materials")
        .update({
          status:
            "APPROVED",
        })
        .eq(
          "ncs_id",
          ncs.ncs_id
        );

      if (ncsUpdateError) {
        throw new Error(
          `Failed to approve national material: ${ncsUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         B. VERIFY ALL MAPPINGS
      ------------------------------------------------------ */

      const {
        error: mappingUpdateError,
      } = await supabase
        .from(
          "material_ncs_mapping"
        )
        .update({
          verified:
            true,

          match_status:
            "VERIFIED",
        })
        .eq(
          "ncs_id",
          ncs.ncs_id
        );

      if (mappingUpdateError) {
        throw new Error(
          `Failed to verify material mappings: ${mappingUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         C. APPROVE GOVERNMENT REQUEST
      ------------------------------------------------------ */

      const {
        data: updatedRequest,
        error:
          requestUpdateError,
      } = await supabase
        .from(
          "standardization_requests"
        )
        .update({
          status:
            "APPROVED",

          reviewed_by:
            reviewer,

          review_date:
            reviewDate,

          government_comments:
            comments ||
            "National material identity approved by authorized reviewer.",
        })
        .eq(
          "request_id",
          requestId
        )
        .select()
        .single();

      if (requestUpdateError) {
        throw new Error(
          `Failed to approve standardization request: ${requestUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         D. AUDIT ENTRY
      ------------------------------------------------------ */

      await createAuditEntry(
        supabase,
        {
          requestId,
          ncs,
          action:
            "NATIONAL_MATERIAL_APPROVED",
          reviewer,
          comments:
            comments ||
            "National material identity approved by authorized reviewer.",
          previousValue:
            standardizationRequest.status ||
            "PENDING_REVIEW",
          newValue:
            "APPROVED",
        }
      );

      return NextResponse.json({
        success: true,

        action:
          "APPROVE",

        message:
          "National material identity approved successfully.",

        data: {
          request:
            updatedRequest,

          ncs: {
            ncs_id:
              ncs.ncs_id,

            ncs_code:
              ncs.ncs_code,

            ncs_name:
              ncs.ncs_name,

            status:
              "APPROVED",
          },

          mappings_updated:
            mappingRows.length,
        },
      });
    }

    /* ========================================================
       ACTION: REJECT
    ======================================================== */

    if (action === "REJECT") {
      /* ------------------------------------------------------
         A. REJECT NCS
      ------------------------------------------------------ */

      const {
        error: ncsUpdateError,
      } = await supabase
        .from("ncs_materials")
        .update({
          status:
            "REJECTED",
        })
        .eq(
          "ncs_id",
          ncs.ncs_id
        );

      if (ncsUpdateError) {
        throw new Error(
          `Failed to reject national material: ${ncsUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         B. PRESERVE MATERIALS BUT MARK MAPPING REJECTED
      ------------------------------------------------------ */

      const {
        error: mappingUpdateError,
      } = await supabase
        .from(
          "material_ncs_mapping"
        )
        .update({
          match_status:
            "REJECTED",

          verified:
            false,
        })
        .eq(
          "ncs_id",
          ncs.ncs_id
        );

      if (mappingUpdateError) {
        throw new Error(
          `Failed to reject material mappings: ${mappingUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         C. REJECT REQUEST
      ------------------------------------------------------ */

      const {
        data: updatedRequest,
        error:
          requestUpdateError,
      } = await supabase
        .from(
          "standardization_requests"
        )
        .update({
          status:
            "REJECTED",

          reviewed_by:
            reviewer,

          review_date:
            reviewDate,

          government_comments:
            comments ||
            "National material mapping rejected. Existing CPSE material identities remain separate.",
        })
        .eq(
          "request_id",
          requestId
        )
        .select()
        .single();

      if (requestUpdateError) {
        throw new Error(
          `Failed to reject standardization request: ${requestUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         D. AUDIT
      ------------------------------------------------------ */

      await createAuditEntry(
        supabase,
        {
          requestId,
          ncs,
          action:
            "NATIONAL_MATERIAL_REJECTED",
          reviewer,
          comments:
            comments ||
            "National material mapping rejected. Existing CPSE material identities remain separate.",
          previousValue:
            standardizationRequest.status ||
            "PENDING_REVIEW",
          newValue:
            "REJECTED",
        }
      );

      return NextResponse.json({
        success: true,

        action:
          "REJECT",

        message:
          "National material proposal rejected. Existing CPSE materials were preserved.",

        data: {
          request:
            updatedRequest,

          ncs: {
            ncs_id:
              ncs.ncs_id,

            ncs_code:
              ncs.ncs_code,

            ncs_name:
              ncs.ncs_name,

            status:
              "REJECTED",
          },

          mappings_updated:
            mappingRows.length,
        },
      });
    }

    /* ========================================================
       ACTION: NEEDS MORE DATA
    ======================================================== */

    if (
      action ===
      "NEEDS_MORE_DATA"
    ) {
      /* ------------------------------------------------------
         A. MARK REQUEST
      ------------------------------------------------------ */

      const {
        data: updatedRequest,
        error:
          requestUpdateError,
      } = await supabase
        .from(
          "standardization_requests"
        )
        .update({
          status:
            "NEEDS_MORE_DATA",

          reviewed_by:
            reviewer,

          review_date:
            reviewDate,

          government_comments:
            comments ||
            "Additional technical documentation required before national material approval.",
        })
        .eq(
          "request_id",
          requestId
        )
        .select()
        .single();

      if (requestUpdateError) {
        throw new Error(
          `Failed to request more data: ${requestUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         B. MARK MAPPINGS AS NEEDING DATA
      ------------------------------------------------------ */

      const {
        error: mappingUpdateError,
      } = await supabase
        .from(
          "material_ncs_mapping"
        )
        .update({
          match_status:
            "NEEDS_MORE_DATA",

          verified:
            false,
        })
        .eq(
          "ncs_id",
          ncs.ncs_id
        );

      if (mappingUpdateError) {
        throw new Error(
          `Failed to update mappings for additional data: ${mappingUpdateError.message}`
        );
      }

      /* ------------------------------------------------------
         C. AUDIT
      ------------------------------------------------------ */

      await createAuditEntry(
        supabase,
        {
          requestId,
          ncs,
          action:
            "MORE_DATA_REQUESTED",
          reviewer,
          comments:
            comments ||
            "Additional technical documentation required before national material approval.",
          previousValue:
            standardizationRequest.status ||
            "PENDING_REVIEW",
          newValue:
            "NEEDS_MORE_DATA",
        }
      );

      return NextResponse.json({
        success: true,

        action:
          "NEEDS_MORE_DATA",

        message:
          "Additional technical data has been requested.",

        data: {
          request:
            updatedRequest,

          ncs: {
            ncs_id:
              ncs.ncs_id,

            ncs_code:
              ncs.ncs_code,

            ncs_name:
              ncs.ncs_name,

            status:
              ncs.status,
          },

          mappings_updated:
            mappingRows.length,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Unsupported action.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "Standardization action error:",
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

/* ============================================================
   AUDIT ENTRY
============================================================ */

async function createAuditEntry(
  supabase,
  {
    requestId,
    ncs,
    action,
    reviewer,
    comments,
    previousValue,
    newValue,
  }
) {
  /*
   * First try a structured audit table.
   *
   * If that table does not exist in the current
   * prototype schema, we do not block the main
   * approval/rejection operation.
   */

  const auditPayload = {
    request_id:
      requestId,

    ncs_id:
      ncs.ncs_id,

    action,

    performed_by:
      reviewer,

    previous_value:
      previousValue,

    new_value:
      newValue,

    comments:
      comments ||
      null,

    created_at:
      new Date().toISOString(),
  };

  const {
    error,
  } = await supabase
    .from(
      "material_audit_log"
    )
    .insert(
      auditPayload
    );

  if (error) {
    console.warn(
      "Audit log insert warning:",
      error.message
    );
  }
}