import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  try {
    if (!SUPABASE_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing NEXT_PUBLIC_SUPABASE_URL",
        },
        { status: 500 }
      );
    }

    if (!SUPABASE_PUBLIC_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const accessToken = body?.access_token;
    const refreshToken = body?.refresh_token;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Access token and refresh token are required.",
        },
        { status: 400 }
      );
    }

    /*
     * IMPORTANT:
     * Supabase SSR cookies must be attached to the exact response
     * that is returned to the browser.
     */
    const response = NextResponse.json({
      success: true,
    });

    const cookieStore = await cookies();

    const supabase = createServerClient(
      SUPABASE_URL,
      SUPABASE_PUBLIC_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                response.cookies.set(name, value, options);
              }
            );
          },
        },
      }
    );

    const {
      data,
      error,
    } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error(
        "AUTH SESSION SET ERROR:",
        error.message
      );

      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 401 }
      );
    }

    if (!data?.session) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase did not return an authenticated session.",
        },
        { status: 401 }
      );
    }

    /*
     * Additional application cookies.
     * These give our server-side APIs another reliable way
     * to authenticate the current user.
     */

    response.cookies.set(
      "bmg_access_token",
      data.session.access_token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      }
    );

    response.cookies.set(
      "bmg_refresh_token",
      data.session.refresh_token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      }
    );

    console.log(
      "SERVER SESSION ESTABLISHED:",
      data.user?.email || "unknown user"
    );

    return response;
  } catch (error) {
    console.error(
      "AUTH SESSION ROUTE ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to establish authentication session.",
      },
      { status: 500 }
    );
  }
}