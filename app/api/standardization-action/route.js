import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ============================================================
   HELPERS
============================================================ */

function safeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

function normalizeAction(value) {
  return safeText(value)
    .trim()
    .toUpperCase();
}

/* ============================================================
   SAVE ML FEEDBACK
============================================================ */

async function saveMatchFeedback(
  supabase,
  {
    requestId,
    ncsId,
    mappings,
    action,
    reviewer,
    comments,
  }
) {
  /*
   * Only final government decisions
   * become training labels.
   *
   * APPROVE  = 1
   * REJECT   = 0
   * NEEDS_MORE_DATA = no label
   */
  if (
    action !== "APPROVE" &&
    action !== "REJECT"
  ) {
    return {
      saved: 0,
      skipped: true,
    };
  }

  if (
    !Array.isArray(mappings) ||
    mappings.length < 2
  ) {
    return {
      saved: 0,
      skipped: true,
    };
  }

  /*
   * The source mapping is created by
   * match-materials with this exact
   * generic reason.
   *
   * Candidate mappings contain the
   * Gemini-generated reason.
   */
  const sourceMapping =
    mappings.find(
      (mapping) =>
        safeText(
          mapping.ai_reason
        ).trim() ===
        "AI proposed a common national material identity."
    ) || mappings[0];

  const sourceMaterialId =
    Number(
      sourceMapping.material_id
    );

  if (
    !Number.isInteger(
      sourceMaterialId
    )
  ) {
    return {
      saved: 0,
      skipped: true,
    };
  }

  const candidateMappings =
    mappings.filter(
      (mapping) =>
        Number(
          mapping.material_id
        ) !==
        sourceMaterialId
    );

  if (
    candidateMappings.length ===
    0
  ) {
    return {
      saved: 0,
      skipped: true,
    };
  }

  const label =
    action === "APPROVE"
      ? 1
      : 0;

  /*
   * Check existing feedback for
   * this exact review request so
   * repeated button clicks don't
   * create duplicate training rows.
   */
  const {
    data: existingRows,
    error: existingError,
  } = await supabase
    .from(
      "material_match_feedback"
    )
    .select(
      "source_material_id, candidate_material_id"
    )
    .eq(
      "request_id",
      requestId
    )
    .eq(
      "label",
      label
    );

  if (existingError) {
    throw new Error(
      `Failed to check existing ML feedback: ${existingError.message}`
    );
  }

  const existingKeys =
    new Set(
      (existingRows || []).map(
        (row) =>
          `${row.source_material_id}:${row.candidate_material_id}`
      )
    );

  const rows = [];

  for (
    const mapping of candidateMappings
  ) {
    const candidateMaterialId =
      Number(
        mapping.material_id
      );

    if (
      !Number.isInteger(
        candidateMaterialId
      )
    ) {
      continue;
    }

    const key =
      `${sourceMaterialId}:${candidateMaterialId}`;

    if (
      existingKeys.has(key)
    ) {
      continue;
    }

    rows.push({
      source_material_id:
        sourceMaterialId,

      candidate_material_id:
        candidateMaterialId,

      ncs_id:
        ncsId,

      request_id:
        requestId,

      label,

      classification:
        null,

      ai_confidence:
        mapping.ai_confidence ??
        null,

      reviewer:
        reviewer || null,

      reviewer_comments:
        comments || null,
    });
  }

  if (!rows.length) {
    return {
      saved: 0,
      skipped: true,
    };
  }

  const {
    error: feedbackError,
  } = await supabase
    .from(
      "material_match_feedback"
    )
    .insert(rows);

  if (feedbackError) {
    throw new Error(
      `Failed to save ML feedback: ${feedbackError.message}`
    );
  }

  return {
    saved: rows.length,
    skipped: false,
  };
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
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

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

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /* --------------------------------------------------------
       BODY
    -------------------------------------------------------- */

    const body =
      await request
        .json()
        .catch(() => ({}));

    const requestId =
      Number(
        body.requestId
      );

    const action =
      normalizeAction(
        body.action
      );

    const reviewer =
      safeText(
        body.reviewer ||
          "Material Master Officer"
      ).trim();

    const comments =
      safeText(
        body.comments
      ).trim();

    if (
      !Number.isInteger(
        requestId
      ) ||
      requestId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid requestId is required.",
        },
        {
          status: 400,
        }
      );
    }

    const allowedActions =
      new Set([
        "APPROVE",
        "REJECT",
        "NEEDS_MORE_DATA",
      ]);

    if (
      !allowedActions.has(
        action
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid action. Use APPROVE, REJECT, or NEEDS_MORE_DATA.",
        },
        {
          status: 400,
        }
      );
    }

    /* --------------------------------------------------------
       LOAD STANDARDIZATION REQUEST
    -------------------------------------------------------- */

    const {
      data: standardizationRequest,
      error: requestError,
    } = await supabase
      .from(
        "standardization_requests"
      )
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
            "Standardization request not found.",

          details:
            requestError?.message ||
            null,
        },
        {
          status: 404,
        }
      );
    }

    const ncsId =
      standardizationRequest.ncs_id;

    /* --------------------------------------------------------
       LOAD NCS
    -------------------------------------------------------- */

    let ncs = null;

    if (
      ncsId !== null &&
      ncsId !== undefined
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "ncs_materials"
        )
        .select(
          [
            "ncs_id",
            "ncs_code",
            "ncs_name",
            "category",
            "status",
          ].join(",")
        )
        .eq(
          "ncs_id",
          ncsId
        )
        .single();

      if (
        error ||
        !data
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Associated NCS record not found.",

            details:
              error?.message ||
              null,
          },
          {
            status: 404,
          }
        );
      }

      ncs = data;
    }

    /* --------------------------------------------------------
       LOAD NCS MAPPINGS
    -------------------------------------------------------- */

    let mappings = [];

    if (
      ncsId !== null &&
      ncsId !== undefined
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "material_ncs_mapping"
        )
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
          ncsId
        )
        .order(
          "material_id",
          {
            ascending: true,
          }
        );

      if (error) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Failed to load NCS mappings.",

            details:
              error.message,
          },
          {
            status: 500,
          }
        );
      }

      mappings =
        data || [];
    }

    /* --------------------------------------------------------
       MATERIAL IDS
    -------------------------------------------------------- */

    const materialIds =
      mappings
        .map(
          (mapping) =>
            Number(
              mapping.material_id
            )
        )
        .filter(
          (id) =>
            Number.isInteger(id)
        );

    let materials = [];

    if (
      materialIds.length
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("materials")
        .select(
          [
            "id",
            "company",
            "material_number",
            "description",
            "specifications",
            "category",
          ].join(",")
        )
        .in(
          "id",
          materialIds
        );

      if (error) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Failed to load mapped materials.",

            details:
              error.message,
          },
          {
            status: 500,
          }
        );
      }

      materials =
        data || [];
    }

    const materialById =
      new Map(
        materials.map(
          (material) => [
            Number(
              material.id
            ),
            material,
          ]
        )
      );

    const previousRequestStatus =
      standardizationRequest.status;

    const previousNcsStatus =
      ncs?.status ||
      null;

    /* --------------------------------------------------------
       DETERMINE NEW STATES
    -------------------------------------------------------- */

    let newRequestStatus;
    let newNcsStatus =
      previousNcsStatus;

    if (
      action === "APPROVE"
    ) {
      newRequestStatus =
        "APPROVED";

      newNcsStatus =
        "APPROVED";
    } else if (
      action === "REJECT"
    ) {
      newRequestStatus =
        "REJECTED";

      newNcsStatus =
        "REJECTED";
    } else {
      newRequestStatus =
        "NEEDS_MORE_DATA";

      if (
        !newNcsStatus
      ) {
        newNcsStatus =
          "PROPOSED";
      }
    }

    /* --------------------------------------------------------
       UPDATE NCS
    -------------------------------------------------------- */

    if (
      ncsId !== null &&
      ncsId !== undefined &&
      newNcsStatus !==
        previousNcsStatus
    ) {
      const {
        error,
      } = await supabase
        .from(
          "ncs_materials"
        )
        .update({
          status:
            newNcsStatus,
        })
        .eq(
          "ncs_id",
          ncsId
        );

      if (error) {
        throw new Error(
          `Failed to update NCS status: ${error.message}`
        );
      }
    }

    /* --------------------------------------------------------
       UPDATE MAPPINGS
    -------------------------------------------------------- */

    let newMappingStatus;

    if (
      action === "APPROVE"
    ) {
      newMappingStatus =
        "VERIFIED";
    } else if (
      action === "REJECT"
    ) {
      newMappingStatus =
        "REJECTED";
    } else {
      newMappingStatus =
        "NEEDS_MORE_DATA";
    }

    if (
      ncsId !== null &&
      ncsId !== undefined &&
      materialIds.length
    ) {
      const mappingUpdate =
        {
          match_status:
            newMappingStatus,

          verified:
            action ===
            "APPROVE",
        };

      const {
        error,
      } = await supabase
        .from(
          "material_ncs_mapping"
        )
        .update(
          mappingUpdate
        )
        .eq(
          "ncs_id",
          ncsId
        );

      if (error) {
        throw new Error(
          `Failed to update NCS mappings: ${error.message}`
        );
      }
    }

    /* --------------------------------------------------------
       UPDATE GOVERNMENT REQUEST
    -------------------------------------------------------- */

    const {
      data:
        updatedRequest,
      error:
        updateRequestError,
    } = await supabase
      .from(
        "standardization_requests"
      )
      .update({
        status:
          newRequestStatus,

        reviewed_by:
          reviewer || null,

        review_date:
          new Date().toISOString(),

        government_comments:
          comments || null,
      })
      .eq(
        "request_id",
        requestId
      )
      .select(
        [
          "request_id",
          "ncs_id",
          "status",
          "reviewed_by",
          "review_date",
          "government_comments",
        ].join(",")
      )
      .single();

    if (
      updateRequestError ||
      !updatedRequest
    ) {
      throw new Error(
        `Failed to update standardization request: ${
          updateRequestError?.message ||
          "unknown error"
        }`
      );
    }

    /* --------------------------------------------------------
       SAVE ML TRAINING FEEDBACK
    -------------------------------------------------------- */

    const feedback =
      await saveMatchFeedback(
        supabase,
        {
          requestId,
          ncsId,
          mappings,
          action,
          reviewer,
          comments,
        }
      );

    /* --------------------------------------------------------
       AUDIT METADATA
    -------------------------------------------------------- */

    const auditMaterials =
      mappings.map(
        (mapping) => {
          const material =
            materialById.get(
              Number(
                mapping.material_id
              )
            );

          return {
            material_id:
              Number(
                mapping.material_id
              ),

            company:
              material?.company ||
              null,

            material_number:
              material?.material_number ||
              null,

            description:
              material?.description ||
              null,

            previous_match_status:
              mapping.match_status ||
              null,

            new_match_status:
              newMappingStatus,

            previous_verified:
              mapping.verified ===
              true,

            new_verified:
              action ===
              "APPROVE",

            ai_confidence:
              mapping.ai_confidence ??
              null,
          };
        }
      );

    /* --------------------------------------------------------
       SAVE AUDIT LOG
    -------------------------------------------------------- */

    const auditRow = {
      material_id:
        auditMaterials.length ===
        1
          ? auditMaterials[0]
              .material_id
          : null,

      ncs_id:
        ncsId !== null &&
        ncsId !== undefined
          ? ncsId
          : null,

      request_id:
        requestId,

      action,

      previous_status:
        previousRequestStatus,

      new_status:
        newRequestStatus,

      performed_by:
        reviewer || null,

      comments:
        comments || null,

      metadata: {
        entity:
          "standardization_request",

        ncs_code:
          ncs?.ncs_code ||
          null,

        ncs_name:
          ncs?.ncs_name ||
          null,

        previous_ncs_status:
          previousNcsStatus,

        new_ncs_status:
          newNcsStatus,

        mapping_status:
          newMappingStatus,

        mapping_count:
          auditMaterials.length,

        ml_feedback_rows_saved:
          feedback.saved,

        ml_feedback_label:
          action ===
          "APPROVE"
            ? 1
            : action ===
              "REJECT"
              ? 0
              : null,

        materials:
          auditMaterials,

        action_timestamp:
          new Date().toISOString(),
      },
    };

    const {
      error:
        auditError,
    } = await supabase
      .from(
        "material_audit_log"
      )
      .insert(
        auditRow
      );

    /* --------------------------------------------------------
       AUDIT ERROR
    -------------------------------------------------------- */

    if (auditError) {
      console.error(
        "Audit log insert failed:",
        auditError
      );

      return NextResponse.json({
        success: true,

        audit_saved: false,

        ml_feedback_saved:
          feedback.saved,

        warning:
          `Review action was completed, but the audit log could not be saved: ${auditError.message}`,

        data: {
          request_id:
            requestId,

          action,

          request_status:
            newRequestStatus,

          ncs_id:
            ncsId,

          ncs_status:
            newNcsStatus,

          mapping_status:
            newMappingStatus,

          reviewer,

          ml_feedback_rows_saved:
            feedback.saved,
        },
      });
    }

    /* --------------------------------------------------------
       SUCCESS
    -------------------------------------------------------- */

    return NextResponse.json({
      success: true,

      audit_saved: true,

      ml_feedback_saved:
        feedback.saved,

      message:
        `Government review action ${action} completed successfully.`,

      data: {
        request_id:
          requestId,

        action,

        request_status:
          newRequestStatus,

        previous_request_status:
          previousRequestStatus,

        ncs_id:
          ncsId,

        ncs_code:
          ncs?.ncs_code ||
          null,

        ncs_status:
          newNcsStatus,

        previous_ncs_status:
          previousNcsStatus,

        mapping_status:
          newMappingStatus,

        mappings_affected:
          mappings.length,

        ml_feedback_rows_saved:
          feedback.saved,

        ml_training_label:
          action ===
          "APPROVE"
            ? 1
            : action ===
              "REJECT"
              ? 0
              : null,

        reviewer,

        review_date:
          updatedRequest.review_date,

        comments:
          updatedRequest.government_comments,
      },
    });
  } catch (error) {
    console.error(
      "Standardization action error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to complete government review action.",

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