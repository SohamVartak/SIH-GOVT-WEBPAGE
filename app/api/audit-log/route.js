import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
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

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    const {
      data,
      error,
    } = await supabase
      .from("material_audit_log")
      .select(
        `
          audit_id,
          material_id,
          ncs_id,
          request_id,
          action,
          previous_status,
          new_status,
          performed_by,
          comments,
          metadata,
          created_at
        `
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(200);

    if (error) {
      throw new Error(
        `Failed to load audit logs: ${error.message}`
      );
    }

    const logs =
      (data || []).map(
        (row) => ({
          audit_id:
            row.audit_id,

          material_id:
            row.material_id,

          ncs_id:
            row.ncs_id,

          request_id:
            row.request_id,

          action:
            row.action,

          previous_status:
            row.previous_status,

          new_status:
            row.new_status,

          performed_by:
            row.performed_by,

          comments:
            row.comments,

          metadata:
            row.metadata || {},

          created_at:
            row.created_at,
        })
      );

    const summary = {
      total:
        logs.length,

      approvals:
        logs.filter(
          (log) =>
            log.action ===
            "APPROVE"
        ).length,

      rejections:
        logs.filter(
          (log) =>
            log.action ===
            "REJECT"
        ).length,

      needs_more_data:
        logs.filter(
          (log) =>
            log.action ===
            "NEEDS_MORE_DATA"
        ).length,
    };

    return NextResponse.json({
      success: true,

      summary,

      count:
        logs.length,

      logs,
    });
  } catch (error) {
    console.error(
      "Audit log API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Failed to load audit logs.",

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