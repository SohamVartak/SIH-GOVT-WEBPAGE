'use client';

import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';

interface LoginViewProps {
  onLoginSuccess?: (role: string) => void;
}

interface ProfileData {
  id?: string;
  email?: string;
  role?: string;
  user_type?: string;
  portal?: string;
  is_active?: boolean;
  full_name?: string;
  name?: string;
}

export default function LoginView({
  onLoginSuccess,
}: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isLoading) return;

    setLoginError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setLoginError('Please enter your email address.');
      return;
    }

    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      /*
       * =========================================================
       * STEP 1 — SUPABASE LOGIN
       * =========================================================
       */

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        console.error(
          'SUPABASE LOGIN ERROR:',
          error
        );

        setLoginError(
          error.message ||
            'Invalid email or password.'
        );

        setIsLoading(false);
        return;
      }

      /*
       * =========================================================
       * STEP 2 — MAKE SURE SUPABASE ACTUALLY RETURNED A SESSION
       * =========================================================
       */

      if (
        !data?.session?.access_token ||
        !data?.session?.refresh_token
      ) {
        console.error(
          'SUPABASE LOGIN: No complete session returned.',
          data
        );

        setLoginError(
          'Login succeeded but no authentication session was returned. Please try again.'
        );

        setIsLoading(false);
        return;
      }

      const accessToken =
        data.session.access_token;

      const refreshToken =
        data.session.refresh_token;

      /*
       * =========================================================
       * STEP 3 — EXPLICITLY SAVE THE SESSION IN THE BROWSER
       * =========================================================
       *
       * This is important for AdminView.
       *
       * AdminView later calls:
       *
       * supabase.auth.getSession()
       *
       * and needs the access_token to authenticate its API
       * requests.
       */

      const {
        data: savedSessionData,
        error: sessionError,
      } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error(
          'SUPABASE SESSION PERSIST ERROR:',
          sessionError
        );

        setLoginError(
          sessionError.message ||
            'Unable to save the login session. Please try again.'
        );

        setIsLoading(false);
        return;
      }

      if (
        !savedSessionData?.session?.access_token
      ) {
        console.error(
          'SUPABASE SESSION PERSIST: No access token after setSession.'
        );

        setLoginError(
          'Login succeeded but the authentication session could not be saved. Please try again.'
        );

        setIsLoading(false);
        return;
      }

      console.log(
        'SUPABASE BROWSER SESSION SAVED'
      );

      /*
       * =========================================================
       * STEP 4 — ESTABLISH SERVER SESSION
       * =========================================================
       *
       * The server receives the same Supabase tokens and creates
       * the authentication cookies required by Next.js API routes.
       */

      const sessionResponse = await fetch(
        '/api/auth/session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
        }
      );

      let sessionResult: any = null;

      try {
        sessionResult =
          await sessionResponse.json();
      } catch {
        sessionResult = null;
      }

      if (
        !sessionResponse.ok ||
        !sessionResult?.success
      ) {
        console.error(
          'SERVER SESSION ERROR:',
          sessionResult
        );

        setLoginError(
          sessionResult?.error ||
            'Login succeeded but the server session could not be established.'
        );

        setIsLoading(false);
        return;
      }

      console.log(
        'SERVER SESSION ESTABLISHED SUCCESSFULLY'
      );

      /*
       * =========================================================
       * STEP 5 — VERIFY THE BROWSER SESSION AGAIN
       * =========================================================
       *
       * This guarantees that AdminView will have an access token
       * when it loads.
       */

      const {
        data: verifiedSessionData,
        error: verifySessionError,
      } = await supabase.auth.getSession();

      if (verifySessionError) {
        console.error(
          'SUPABASE SESSION VERIFY ERROR:',
          verifySessionError
        );

        setLoginError(
          'Unable to verify your login session. Please try again.'
        );

        setIsLoading(false);
        return;
      }

      if (
        !verifiedSessionData?.session
          ?.access_token
      ) {
        console.error(
          'SUPABASE SESSION VERIFY: Access token missing.'
        );

        setLoginError(
          'Login session was not saved correctly. Please try logging in again.'
        );

        setIsLoading(false);
        return;
      }

      console.log(
        'SUPABASE SESSION VERIFIED SUCCESSFULLY'
      );

      /*
       * =========================================================
       * STEP 6 — LOAD USER PROFILE
       * =========================================================
       */

      const profileResponse = await fetch(
        '/api/auth/profile',
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${verifiedSessionData.session.access_token}`,
            'Cache-Control': 'no-cache',
          },
        }
      );

      let profileResult: any = null;

      try {
        profileResult =
          await profileResponse.json();
      } catch {
        profileResult = null;
      }

      if (!profileResponse.ok) {
        console.error(
          'PROFILE LOAD ERROR:',
          profileResult
        );

        setLoginError(
          profileResult?.error ||
            'Unable to load your user profile.'
        );

        setIsLoading(false);
        return;
      }

      const profile: ProfileData =
        profileResult?.profile ||
        profileResult?.data ||
        profileResult ||
        {};

      /*
       * =========================================================
       * STEP 7 — CHECK ACCOUNT STATUS
       * =========================================================
       */

      if (profile.is_active === false) {
        await supabase.auth.signOut();

        setLoginError(
          'Your account is currently inactive. Please contact the administrator.'
        );

        setIsLoading(false);
        return;
      }

      /*
       * =========================================================
       * STEP 8 — DETERMINE ROLE
       * =========================================================
       */

      const role = String(
        profile.role ||
          profile.user_type ||
          profile.portal ||
          ''
      )
        .trim()
        .toLowerCase();

      if (!role) {
        console.error(
          'LOGIN PROFILE HAS NO ROLE:',
          profile
        );

        setLoginError(
          'Your account does not have a valid portal role assigned.'
        );

        setIsLoading(false);
        return;
      }

      /*
       * =========================================================
       * STEP 9 — VALIDATE ALLOWED PORTAL ROLES
       * =========================================================
       *
       * Government/admin accounts are allowed into AdminView.
       * Company accounts continue through the normal company flow.
       */

      const isGovernmentRole =
        role.includes('government') ||
        role.includes('govt') ||
        role === 'admin' ||
        role.includes('government_admin') ||
        role.includes('government-admin');

      const isCompanyRole =
        role.includes('company') ||
        role.includes('vendor') ||
        role.includes('supplier');

      if (
        !isGovernmentRole &&
        !isCompanyRole
      ) {
        console.error(
          'UNSUPPORTED LOGIN ROLE:',
          role,
          profile
        );

        setLoginError(
          'Your account is not assigned to a valid portal.'
        );

        setIsLoading(false);
        return;
      }

      /*
       * =========================================================
       * STEP 10 — STORE ROLE LOCALLY
       * =========================================================
       */

      try {
        localStorage.setItem(
          'bmg_user_role',
          role
        );

        localStorage.setItem(
          'bmg_user_email',
          normalizedEmail
        );

        localStorage.setItem(
          'bmg_authenticated',
          'true'
        );
      } catch (storageError) {
        console.warn(
          'LOCAL STORAGE ERROR:',
          storageError
        );
      }

      /*
       * =========================================================
       * STEP 11 — LOGIN COMPLETE
       * =========================================================
       */

      console.log(
        'LOGIN SUCCESS:',
        {
          email: normalizedEmail,
          role,
          userId:
            verifiedSessionData.session.user
              ?.id,
        }
      );

      setIsLoading(false);

      /*
       * Give the parent application the authenticated role.
       */

      if (onLoginSuccess) {
        onLoginSuccess(role);
      }
    } catch (error: any) {
      console.error(
        'LOGIN UNEXPECTED ERROR:',
        error
      );

      setLoginError(
        error?.message ||
          'An unexpected error occurred during login. Please try again.'
      );

      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f5f7fa] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* =====================================================
              HEADER
          ====================================================== */}

          <div className="px-8 pt-8 pb-6 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 border border-gray-200">
              <div className="text-2xl font-bold text-gray-800">
                BM
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              Bharat Material Grid
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Secure portal login
            </p>
          </div>

          {/* =====================================================
              FORM
          ====================================================== */}

          <form
            onSubmit={handleLogin}
            className="px-8 pb-8"
          >
            {/* EMAIL */}

            <div className="mb-5">
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email address
              </label>

              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (loginError) {
                    setLoginError('');
                  }
                }}
                autoComplete="email"
                placeholder="Enter your email"
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-700 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* PASSWORD */}

            <div className="mb-5">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="login-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );

                    if (loginError) {
                      setLoginError('');
                    }
                  }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={isLoading}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-20 text-sm text-gray-900 outline-none transition focus:border-gray-700 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:cursor-not-allowed"
                >
                  {showPassword
                    ? 'Hide'
                    : 'Show'}
                </button>
              </div>
            </div>

            {/* ERROR */}

            {loginError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">
                  {loginError}
                </p>
              </div>
            )}

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>

            {/* INFO */}

            <div className="mt-6 text-center">
              <p className="text-xs leading-5 text-gray-500">
                Use your registered Bharat Material Grid
                account to access the portal.
              </p>
            </div>
          </form>
        </div>

        {/* FOOTER */}

        <div className="mt-5 text-center">
          <p className="text-xs text-gray-400">
            Bharat Material Grid
          </p>
        </div>
      </div>
    </div>
  );
}