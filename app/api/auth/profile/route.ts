import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
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
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {
              // Cookies may not be writable
              // in some server contexts.
            }
          },
        },
      }
    );

    const {
      data: {
        user,
      },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          authenticated: false,
          error: 'Not authenticated',
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('user_profiles')
      .select(
        `
          user_id,
          full_name,
          user_type,
          role,
          company_name,
          is_active,
          created_at,
          updated_at
        `
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        'Profile lookup error:',
        profileError
      );

      return NextResponse.json(
        {
          authenticated: true,
          profile: null,
          error: 'Unable to load user profile',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          authenticated: true,
          profile: null,
          error: 'User profile not configured',
        },
        {
          status: 403,
        }
      );
    }

    if (!profile.is_active) {
      return NextResponse.json(
        {
          authenticated: true,
          profile: null,
          error: 'User account is inactive',
        },
        {
          status: 403,
        }
      );
    }

    const email = (
      user.email || ''
    ).trim().toLowerCase();

    if (
      profile.user_type === 'GOVERNMENT' &&
      !/^[^@]+@gov\.in$/.test(email)
    ) {
      return NextResponse.json(
        {
          authenticated: true,
          profile: null,
          error:
            'Government account requires an official @gov.in email address',
        },
        {
          status: 403,
        }
      );
    }

    return NextResponse.json({
      authenticated: true,
      profile: {
        user_id: profile.user_id,
        email,
        full_name:
          profile.full_name ||
          user.user_metadata?.full_name ||
          email.split('@')[0] ||
          'User',
        user_type: profile.user_type,
        role: profile.role,
        company_name:
          profile.company_name,
        is_active: profile.is_active,
      },
    });
  } catch (error) {
    console.error(
      'Unexpected profile API error:',
      error
    );

    return NextResponse.json(
      {
        authenticated: false,
        error: 'Internal server error',
      },
      {
        status: 500,
      }
    );
  }
}