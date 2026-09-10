import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const ALLOWED_ROLES = [
  'National Administrator',
  'CPSE Administrator (IOCL)',
  'CPSE Administrator (ONGC)',
  'Material Master Officer',
  'Procurement Officer',
  'Auditor',
  'Executive Management',
  'Pending User',
];

const ALLOWED_USER_TYPES = [
  'GOVERNMENT',
  'COMPANY',
];

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
            // Some server contexts may not allow cookie writes.
          }
        },
      },
    }
  );
}

async function requireNationalAdministrator() {
  const supabase =
    await getSupabaseServer();

  const {
    data: {
      user,
    },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return {
      supabase,
      user: null,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error: 'Not authenticated',
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
  } = await supabase
    .from('user_profiles')
    .select(
      'user_id, email, full_name, user_type, role, company_name, is_active'
    )
    .eq(
      'user_id',
      user.id
    )
    .maybeSingle();

  if (profileError) {
    console.error(
      'Admin profile lookup error:',
      profileError
    );

    return {
      supabase,
      user,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            'Unable to verify administrator profile',
        },
        {
          status: 500,
        }
      ),
    };
  }

  if (
    !profile ||
    !profile.is_active ||
    profile.role !==
      'National Administrator'
  ) {
    return {
      supabase,
      user,
      profile: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            'National Administrator access required',
        },
        {
          status: 403,
        }
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

export async function GET() {
  try {
    const {
      supabase,
      response,
    } =
      await requireNationalAdministrator();

    if (response) {
      return response;
    }

    const {
      data: users,
      error,
    } = await supabase
      .from('user_profiles')
      .select(
        `
          user_id,
          email,
          full_name,
          user_type,
          role,
          company_name,
          is_active,
          created_at,
          updated_at
        `
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        'Admin users fetch error:',
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to load users',
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      users: users || [],
    });
  } catch (error) {
    console.error(
      'Admin users GET error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(request) {
  try {
    const {
      supabase,
      user,
      profile: adminProfile,
      response,
    } =
      await requireNationalAdministrator();

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
            error:
              'National Administrator access required',
          },
          {
            status: 403,
          }
        )
      );
    }

    const body =
      await request.json();

    const targetUserId = String(
      body?.userId || ''
    ).trim();

    if (!targetUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'userId is required',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Never allow the administrator to
     * modify their own account through
     * User Management.
     */
    if (targetUserId === user.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your own National Administrator account cannot be modified here.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: existingUser,
      error: existingError,
    } =
      await supabase
        .from('user_profiles')
        .select(
          'user_id, email, full_name, user_type, role, company_name, is_active'
        )
        .eq(
          'user_id',
          targetUserId
        )
        .maybeSingle();

    if (existingError) {
      console.error(
        'Target profile lookup error:',
        existingError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to locate target user',
        },
        {
          status: 500,
        }
      );
    }

    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error:
            'User profile not found',
        },
        {
          status: 404,
        }
      );
    }

    const updates = {};

    /*
     * USER TYPE
     */
    if (
      body.userType !==
      undefined
    ) {
      const requestedType =
        String(
          body.userType
        ).toUpperCase();

      if (
        !ALLOWED_USER_TYPES.includes(
          requestedType
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Invalid user type',
          },
          {
            status: 400,
          }
        );
      }

      if (
        requestedType ===
        'GOVERNMENT'
      ) {
        const targetEmail =
          String(
            existingUser.email ||
              ''
          )
            .trim()
            .toLowerCase();

        if (
          !/^[^@\s]+@gov\.in$/i.test(
            targetEmail
          )
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Government users must have an official @gov.in email address.',
            },
            {
              status: 400,
            }
          );
        }
      }

      updates.user_type =
        requestedType;
    }

    /*
     * ROLE
     */
    if (
      body.role !==
      undefined
    ) {
      const requestedRole =
        String(
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
            error:
              'Invalid role',
          },
          {
            status: 400,
          }
        );
      }

      /*
       * We do not allow another account
       * to be promoted to National Administrator
       * through this endpoint.
       */
      if (
        requestedRole ===
        'National Administrator'
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Additional National Administrator accounts must be provisioned separately.',
          },
          {
            status: 400,
          }
        );
      }

      updates.role =
        requestedRole;
    }

    /*
     * COMPANY
     */
    if (
      body.companyName !==
      undefined
    ) {
      updates.company_name =
        body.companyName
          ? String(
              body.companyName
            ).trim()
          : null;
    }

    /*
     * ACTIVE STATUS
     */
    if (
      body.isActive !==
      undefined
    ) {
      updates.is_active =
        Boolean(
          body.isActive
        );
    }

    if (
      Object.keys(updates)
        .length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No valid changes supplied',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * FINAL GOVERNMENT EMAIL CHECK
     */
    const resultingType =
      String(
        updates.user_type ??
          existingUser.user_type
      ).toUpperCase();

    if (
      resultingType ===
      'GOVERNMENT'
    ) {
      const targetEmail =
        String(
          existingUser.email ||
            ''
        )
          .trim()
          .toLowerCase();

      if (
        !/^[^@\s]+@gov\.in$/i.test(
          targetEmail
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Government users must have an official @gov.in email address.',
          },
          {
            status: 400,
          }
        );
      }
    }

    updates.updated_at =
      new Date().toISOString();

    const {
      data: updatedUser,
      error: updateError,
    } =
      await supabase
        .from('user_profiles')
        .update(updates)
        .eq(
          'user_id',
          targetUserId
        )
        .select(
          `
            user_id,
            email,
            full_name,
            user_type,
            role,
            company_name,
            is_active,
            created_at,
            updated_at
          `
        )
        .single();

    if (updateError) {
      console.error(
        'Admin user update error:',
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            updateError.message ||
            'Unable to update user',
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error(
      'Admin users PATCH error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      {
        status: 500,
      }
    );
  }
}