import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../../lib/supabase';

import {
  AshokaEmblem,
  DigitalIndiaLogo,
  MakeInIndiaLogo,
  CPSEBrandBadge,
} from '../common/GovernmentLogos';

import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Home,
  Building2,
  Landmark,
  UserRound,
  KeyRound,
  Fingerprint,
  ChevronLeft,
  Globe2,
  BadgeCheck,
} from 'lucide-react';

import { AnimatedButton } from '../ui/AnimatedButton';

type PortalType = 'select' | 'user' | 'government';

type UserProfile = {
  user_id: string;
  email: string;
  full_name: string;
  user_type: 'GOVERNMENT' | 'COMPANY';
  role: string;
  company_name: string | null;
  is_active: boolean;
};

export const LoginView: React.FC = () => {
  const {
    setCurrentTab,
    setCurrentUserRole,
    addToast,
  } = useApp();

  const [portal, setPortal] =
    useState<PortalType>('select');

  const isGovernment = portal === 'government';

  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');
  const [showPassword, setShowPassword] =
    useState(false);
  const [rememberMe, setRememberMe] =
    useState(true);

  const [captchaCode, setCaptchaCode] =
    useState('7B8Y9K');
  const [captchaInput, setCaptchaInput] =
    useState('');
  const [
    isCaptchaSpinning,
    setIsCaptchaSpinning,
  ] = useState(false);

  const [isLoading, setIsLoading] =
    useState(false);
  const [isSuccess, setIsSuccess] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const generateNewCaptcha = () => {
    setIsCaptchaSpinning(true);

    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let code = '';

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(
        Math.floor(
          Math.random() * chars.length
        )
      );
    }

    window.setTimeout(() => {
      setCaptchaCode(code);
      setCaptchaInput('');
      setIsCaptchaSpinning(false);
    }, 250);
  };

  const resetLogin = () => {
    setPortal('select');
    setEmail('');
    setPassword('');
    setCaptchaInput('');
    setErrorMessage(null);
    setIsLoading(false);
    setIsSuccess(false);
    setShowPassword(false);
  };

  const openUserPortal = () => {
    setPortal('user');
    setEmail('');
    setPassword('');
    setCaptchaInput('');
    setErrorMessage(null);
    setIsSuccess(false);
  };

  const openGovernmentPortal = () => {
    setPortal('government');
    setEmail('');
    setPassword('');
    setCaptchaInput('');
    setErrorMessage(null);
    setIsSuccess(false);
  };

  const validateGovernmentEmail = (
    value: string
  ) => {
    return /^[^\s@]+@gov\.in$/i.test(
      value.trim()
    );
  };

  const validateUserEmail = (
    value: string
  ) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
      value.trim()
    );
  };

  const loadUserProfile = async (): Promise<{
    success: boolean;
    profile?: UserProfile;
    error?: string;
  }> => {
    try {
      const response = await fetch(
        '/api/auth/profile',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error:
            result?.error ||
            'Unable to load account profile.',
        };
      }

      if (!result?.profile) {
        return {
          success: false,
          error:
            'Your account profile has not been configured.',
        };
      }

      return {
        success: true,
        profile: result.profile,
      };
    } catch (error) {
      console.error(
        'Profile API error:',
        error
      );

      return {
        success: false,
        error:
          'Unable to verify your account profile.',
      };
    }
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setErrorMessage(null);

    const normalizedEmail =
      email.trim().toLowerCase();

    if (
      !normalizedEmail ||
      !password.trim()
    ) {
      setErrorMessage(
        'Please enter your email address and password.'
      );
      return;
    }

    if (isGovernment) {
      if (
        !validateGovernmentEmail(
          normalizedEmail
        )
      ) {
        setErrorMessage(
          'Government access requires an official @gov.in email address.'
        );
        return;
      }
    } else {
      if (
        !validateUserEmail(
          normalizedEmail
        )
      ) {
        setErrorMessage(
          'Please enter a valid company or user email address.'
        );
        return;
      }
    }

    if (
      captchaInput.trim().toUpperCase() !==
      captchaCode.toUpperCase()
    ) {
      setErrorMessage(
        'Invalid security code. Please enter the characters shown.'
      );

      generateNewCaptcha();

      return;
    }

    setIsLoading(true);

    try {
      /*
       * =====================================================
       * 1. AUTHENTICATE WITH SUPABASE
       * =====================================================
       */

      const {
        data,
        error,
      } =
        await supabase.auth.signInWithPassword(
          {
            email: normalizedEmail,
            password,
          }
        );

      if (error) {
        console.error(
          'Supabase login error:',
          error
        );

        setErrorMessage(
          error.message ===
            'Invalid login credentials'
            ? 'Invalid email or password.'
            : error.message
        );

        setIsLoading(false);

        return;
      }

      if (!data.user) {
        setErrorMessage(
          'Authentication completed but no user account was returned.'
        );

        setIsLoading(false);

        return;
      }

      /*
       * =====================================================
       * 2. LOAD REAL DATABASE PROFILE
       * =====================================================
       */

      const profileResult =
        await loadUserProfile();

      if (
        !profileResult.success ||
        !profileResult.profile
      ) {
        await supabase.auth.signOut();

        setErrorMessage(
          profileResult.error ||
            'Your account profile could not be verified.'
        );

        setIsLoading(false);

        return;
      }

      const profile =
        profileResult.profile;

      /*
       * =====================================================
       * 3. VERIFY PORTAL TYPE
       * =====================================================
       */

      if (isGovernment) {
        /*
         * Government portal:
         *
         * Must be:
         * GOVERNMENT
         * AND
         * @gov.in
         */

        if (
          profile.user_type !==
          'GOVERNMENT'
        ) {
          await supabase.auth.signOut();

          setErrorMessage(
            'This account is not registered as a Government account. Please use the User / Company Portal.'
          );

          setIsLoading(false);

          return;
        }

        if (
          !validateGovernmentEmail(
            profile.email
          )
        ) {
          await supabase.auth.signOut();

          setErrorMessage(
            'Government accounts must use an official @gov.in email address.'
          );

          setIsLoading(false);

          return;
        }
      } else {
        /*
         * User / Company portal:
         *
         * Must be:
         * COMPANY
         */

        if (
          profile.user_type !==
          'COMPANY'
        ) {
          await supabase.auth.signOut();

          setErrorMessage(
            'This account is registered for the Government Portal. Please use the Government Portal.'
          );

          setIsLoading(false);

          return;
        }
      }

      /*
       * =====================================================
       * 4. VERIFY ACTIVE ACCOUNT
       * =====================================================
       */

      if (!profile.is_active) {
        await supabase.auth.signOut();

        setErrorMessage(
          'Your account is currently inactive. Please contact the system administrator.'
        );

        setIsLoading(false);

        return;
      }

      /*
       * =====================================================
       * 5. APPLY REAL DATABASE ROLE
       * =====================================================
       *
       * IMPORTANT:
       * No hardcoded IOCL or Government role.
       * The role now comes from user_profiles.role.
       */

      setCurrentUserRole(
        profile.role as any
      );

      /*
       * =====================================================
       * 6. SUCCESS
       * =====================================================
       */

      setIsLoading(false);
      setIsSuccess(true);

      addToast({
        title: isGovernment
          ? 'Government Authentication Successful'
          : 'Authentication Successful',

        message: isGovernment
          ? `Welcome ${profile.full_name}. Government portal access verified.`
          : `Welcome ${profile.full_name}. ${profile.company_name ? `${profile.company_name} workspace access verified.` : 'Company workspace access verified.'}`,

        type: 'success',
      });

      window.setTimeout(() => {
        window.history.pushState(
          {},
          '',
          '/'
        );

        setCurrentTab('dashboard');
      }, 700);

    } catch (error: any) {
      console.error(
        'Unexpected authentication error:',
        error
      );

      setErrorMessage(
        error?.message ||
          'Unable to authenticate at this time. Please try again.'
      );

      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900 flex flex-col overflow-hidden">

      {/* TOP TRICOLOR STRIP */}
      <div className="h-1.5 w-full flex shrink-0">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white border-y border-slate-200" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      {/* HEADER */}
      <header className="bg-[#001f3f] text-white border-b border-[#0b355d]">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3 min-w-0">

            <div className="shrink-0">
              <AshokaEmblem
                size={42}
                color="#ffffff"
                goldTone={true}
              />
            </div>

            <div className="min-w-0">

              <div className="flex items-center gap-2 flex-wrap">

                <h1 className="text-base sm:text-lg font-black tracking-tight">
                  भारत मटेरियल ग्रिड
                </h1>

                <span className="hidden sm:inline-flex px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/10 text-[9px] font-black tracking-wider text-amber-300 uppercase">
                  Bharat Material Grid
                </span>

              </div>

              <p className="text-[10px] sm:text-xs text-slate-300 mt-0.5">
                National Material Harmonization & Intelligence Platform
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={() =>
              setCurrentTab('home')
            }
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 bg-[#002b50] hover:bg-amber-500 hover:text-slate-950 transition-all text-xs font-bold shrink-0"
          >
            <Home className="w-3.5 h-3.5" />

            <span className="hidden sm:inline">
              Public Portal
            </span>
          </button>

        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8 relative">

        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="absolute bottom-0 right-0 w-96 h-96 bg-amber-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-6xl">

          {/* =================================================
              PORTAL SELECTION
          ================================================= */}

          {portal === 'select' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 25,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 0.45,
              }}
              className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden"
            >

              <div className="grid grid-cols-1 lg:grid-cols-2">

                {/* LEFT */}
                <div className="bg-gradient-to-br from-[#002244] via-[#001b38] to-[#001226] text-white p-7 sm:p-10 lg:p-12">

                  <div className="flex items-center gap-4">

                    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">

                      <AshokaEmblem
                        size={44}
                        color="#ffffff"
                        goldTone={true}
                      />

                    </div>

                    <div>

                      <div className="text-[10px] text-amber-300 font-black tracking-[0.18em] uppercase">
                        Secure Access Gateway
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-black mt-1">
                        Choose your portal
                      </h2>

                    </div>

                  </div>

                  <div className="mt-8 space-y-5">

                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                      Bharat Material Grid provides separate secure workspaces for participating users, companies, CPSEs and authorized Government of India officials.
                    </p>

                    <div className="grid grid-cols-3 gap-2.5">

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">

                        <Fingerprint className="w-5 h-5 text-emerald-400" />

                        <div className="text-[10px] font-bold text-slate-300 mt-2">
                          Secure
                        </div>

                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">

                        <ShieldCheck className="w-5 h-5 text-amber-400" />

                        <div className="text-[10px] font-bold text-slate-300 mt-2">
                          Role Based
                        </div>

                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">

                        <BadgeCheck className="w-5 h-5 text-blue-400" />

                        <div className="text-[10px] font-bold text-slate-300 mt-2">
                          Verified
                        </div>

                      </div>

                    </div>

                  </div>

                  <div className="mt-10 pt-5 border-t border-white/10">

                    <div className="text-[10px] font-black text-slate-400 tracking-wider uppercase">
                      Bharat Material Grid
                    </div>

                    <div className="text-xs text-slate-300 mt-1">
                      National digital infrastructure for material standardization and intelligent procurement.
                    </div>

                  </div>

                </div>

                {/* RIGHT */}
                <div className="p-6 sm:p-8 lg:p-10 bg-[#fbfdff]">

                  <div className="mb-7">

                    <div className="text-[10px] font-black text-blue-700 uppercase tracking-[0.16em]">
                      ACCESS PORTAL
                    </div>

                    <h3 className="text-xl sm:text-2xl font-black text-[#002244] mt-1">
                      How would you like to sign in?
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-500 mt-2">
                      Select the workspace that matches your organization.
                    </p>

                  </div>

                  <div className="space-y-4">

                    {/* USER */}
                    <motion.button
                      type="button"
                      whileHover={{
                        y: -3,
                      }}
                      whileTap={{
                        scale: 0.98,
                      }}
                      onClick={
                        openUserPortal
                      }
                      className="w-full text-left rounded-2xl border border-blue-200 bg-white hover:border-blue-400 hover:shadow-lg transition-all p-5 group"
                    >

                      <div className="flex items-start gap-4">

                        <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                          <Building2 className="w-6 h-6" />
                        </div>

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center justify-between gap-3">

                            <h4 className="font-black text-base text-slate-900">
                              User / Company Portal
                            </h4>

                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-700 group-hover:translate-x-1 transition-all" />

                          </div>

                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                            For CPSEs, participating companies, procurement teams and authorized users.
                          </p>

                          <div className="flex items-center gap-2 mt-3 flex-wrap">

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                              MATERIAL SEARCH
                            </span>

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                              DATASHEETS
                            </span>

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                              PROCUREMENT
                            </span>

                          </div>

                        </div>

                      </div>

                    </motion.button>

                    {/* GOVERNMENT */}
                    <motion.button
                      type="button"
                      whileHover={{
                        y: -3,
                      }}
                      whileTap={{
                        scale: 0.98,
                      }}
                      onClick={
                        openGovernmentPortal
                      }
                      className="w-full text-left rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/50 hover:border-amber-400 hover:shadow-lg transition-all p-5 group"
                    >

                      <div className="flex items-start gap-4">

                        <div className="w-12 h-12 rounded-xl bg-[#002244] text-white border border-[#003b68] flex items-center justify-center shrink-0">
                          <Landmark className="w-6 h-6" />
                        </div>

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center justify-between gap-3">

                            <h4 className="font-black text-base text-[#002244]">
                              Government Portal
                            </h4>

                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />

                          </div>

                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                            Restricted workspace for authorized Government of India officials.
                          </p>

                          <div className="flex items-center gap-2 mt-3 flex-wrap">

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-[#002244] text-white">
                              @GOV.IN ONLY
                            </span>

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              RBAC
                            </span>

                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                              GOVERNANCE
                            </span>

                          </div>

                        </div>

                      </div>

                    </motion.button>

                  </div>

                  <div className="mt-7 p-4 rounded-xl bg-slate-50 border border-slate-200">

                    <div className="flex items-start gap-2.5">

                      <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />

                      <div>

                        <div className="text-xs font-bold text-slate-800">
                          Security Notice
                        </div>

                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                          Government access is intended only for authorized officials. Access privileges are determined by the authenticated account and assigned role.
                        </p>

                      </div>

                    </div>

                  </div>

                  <div className="mt-6 flex items-center justify-center gap-4 opacity-70">

                    <DigitalIndiaLogo
                      className="h-7 w-auto"
                    />

                    <MakeInIndiaLogo
                      className="h-7 w-auto"
                    />

                    <CPSEBrandBadge
                      className="h-7 w-auto"
                    />

                  </div>

                </div>

              </div>

            </motion.div>
          )}

          {/* =================================================
              LOGIN FORM
          ================================================= */}

          {portal !== 'select' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 25,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 0.45,
              }}
              className="grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden"
            >

              {/* LEFT PANEL */}
              <div
                className={`lg:col-span-5 text-white p-7 sm:p-9 flex flex-col justify-between relative overflow-hidden ${
                  isGovernment
                    ? 'bg-gradient-to-br from-[#002244] via-[#001a38] to-[#001023]'
                    : 'bg-gradient-to-br from-[#0b3766] via-[#0b4b84] to-[#092f55]'
                }`}
              >

                <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />

                <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />

                <div className="relative z-10">

                  <button
                    type="button"
                    onClick={
                      resetLogin
                    }
                    className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Change Portal
                  </button>

                  <div className="mt-8 flex items-center gap-4">

                    <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">

                      {isGovernment ? (
                        <Landmark className="w-7 h-7 text-amber-300" />
                      ) : (
                        <Building2 className="w-7 h-7 text-blue-200" />
                      )}

                    </div>

                    <div>

                      <div className="text-[10px] uppercase font-black tracking-[0.16em] text-amber-300">
                        {isGovernment
                          ? 'Government Access'
                          : 'User / Company Access'}
                      </div>

                      <h2 className="text-2xl font-black mt-1">
                        {isGovernment
                          ? 'Government Portal'
                          : 'User Portal'}
                      </h2>

                    </div>

                  </div>

                  <div className="mt-8">

                    <p className="text-sm text-slate-300 leading-relaxed">
                      {isGovernment
                        ? 'Authorized Government of India officials can access governance, standardization, review, audit, ERP migration and administrative functions.'
                        : 'Participating companies and users can access material search, technical datasheets, procurement intelligence and company workflows.'}
                    </p>

                  </div>

                  <div className="mt-7 space-y-3">

                    <div className="flex items-center gap-3">

                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />

                      <span className="text-xs text-slate-200">
                        {isGovernment
                          ? 'Government role-based access'
                          : 'Company workspace access'}
                      </span>

                    </div>

                    <div className="flex items-center gap-3">

                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />

                      <span className="text-xs text-slate-200">
                        Secure credential verification
                      </span>

                    </div>

                    <div className="flex items-center gap-3">

                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />

                      <span className="text-xs text-slate-200">
                        Audited system access
                      </span>

                    </div>

                  </div>

                  {isGovernment && (
                    <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">

                      <div className="flex items-center gap-2">

                        <ShieldCheck className="w-4 h-4 text-amber-300" />

                        <span className="text-xs font-black text-amber-200">
                          GOVERNMENT RESTRICTION
                        </span>

                      </div>

                      <p className="text-[10px] text-slate-300 leading-relaxed mt-2">

                        Only verified official Government of India email addresses ending in

                        <span className="font-black text-white">
                          {' '}@gov.in
                        </span>

                        {' '}are accepted by this portal.

                      </p>

                    </div>
                  )}

                </div>

                <div className="relative z-10 mt-10 pt-5 border-t border-white/10">

                  <div className="flex items-center gap-2 text-emerald-300">

                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />

                    <span className="text-[10px] font-mono font-bold">
                      SECURE ACCESS GATEWAY
                    </span>

                  </div>

                  <p className="text-[10px] text-slate-400 mt-2">
                    Bharat Material Grid • National Material Intelligence Platform
                  </p>

                </div>

              </div>

              {/* RIGHT LOGIN */}
              <div className="lg:col-span-7 p-6 sm:p-9 lg:p-11 bg-white">

                <div className="max-w-xl mx-auto">

                  <div className="mb-7">

                    <div className="flex items-center justify-between gap-4">

                      <div>

                        <div
                          className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                            isGovernment
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >

                          {isGovernment ? (
                            <Landmark className="w-3.5 h-3.5" />
                          ) : (
                            <UserRound className="w-3.5 h-3.5" />
                          )}

                          <span>
                            {isGovernment
                              ? 'Government Authentication'
                              : 'User / Company Authentication'}
                          </span>

                        </div>

                        <h3 className="text-2xl sm:text-3xl font-black text-[#002244] mt-3">

                          {isGovernment
                            ? 'Government Sign In'
                            : 'Sign In to Bharat Material Grid'}

                        </h3>

                        <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">

                          {isGovernment
                            ? 'Use your official Government of India credentials to continue.'
                            : 'Use your registered company or user credentials to continue.'}

                        </p>

                      </div>

                      <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 items-center justify-center">

                        {isGovernment ? (
                          <AshokaEmblem
                            size={38}
                            color="#002244"
                            goldTone={true}
                          />
                        ) : (
                          <Building2 className="w-7 h-7 text-blue-700" />
                        )}

                      </div>

                    </div>

                  </div>

                  {/* ERROR */}
                  <AnimatePresence>

                    {errorMessage && (
                      <motion.div
                        initial={{
                          opacity: 0,
                          y: -8,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        exit={{
                          opacity: 0,
                          y: -8,
                        }}
                        className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3"
                      >

                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />

                        <div className="text-xs font-semibold leading-relaxed">
                          {errorMessage}
                        </div>

                      </motion.div>
                    )}

                  </AnimatePresence>

                  {/* FORM */}
                  <form
                    onSubmit={
                      handleSubmit
                    }
                    className="space-y-5"
                  >

                    {/* EMAIL */}
                    <div>

                      <label className="block text-xs font-black text-slate-800 mb-1.5">

                        {isGovernment
                          ? 'Official Government Email'
                          : 'Company / User Email'}

                      </label>

                      <div className="relative">

                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                        <input
                          type="email"
                          required
                          value={email}
                          onChange={e =>
                            setEmail(
                              e.target.value
                            )
                          }
                          placeholder={
                            isGovernment
                              ? 'officer@ministry.gov.in'
                              : 'user@company.com'
                          }
                          autoComplete="email"
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-slate-50 focus:bg-white outline-none transition-all text-sm ${
                            isGovernment
                              ? 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                              : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />

                      </div>

                      <div className="mt-1.5 text-[10px] text-slate-400">

                        {isGovernment
                          ? 'Accepted domain: @gov.in'
                          : 'Use the email registered with Bharat Material Grid'}

                      </div>

                    </div>

                    {/* PASSWORD */}
                    <div>

                      <div className="flex items-center justify-between mb-1.5">

                        <label className="text-xs font-black text-slate-800">
                          Password
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            addToast({
                              title:
                                'Password Recovery',
                              message:
                                'Password recovery will use the registered account recovery flow.',
                              type: 'info',
                            })
                          }
                          className="text-[10px] font-bold text-blue-700 hover:underline"
                        >
                          Forgot password?
                        </button>

                      </div>

                      <div className="relative">

                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                        <input
                          type={
                            showPassword
                              ? 'text'
                              : 'password'
                          }
                          required
                          value={password}
                          onChange={e =>
                            setPassword(
                              e.target.value
                            )
                          }
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          className={`w-full pl-10 pr-11 py-3 rounded-xl border bg-slate-50 focus:bg-white outline-none transition-all text-sm ${
                            isGovernment
                              ? 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                              : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(
                              prev =>
                                !prev
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          aria-label={
                            showPassword
                              ? 'Hide password'
                              : 'Show password'
                          }
                        >

                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}

                        </button>

                      </div>

                    </div>

                    {/* CAPTCHA */}
                    <div>

                      <div className="flex items-center justify-between mb-1.5">

                        <label className="text-xs font-black text-slate-800">
                          Security Verification
                        </label>

                        <span className="text-[10px] text-slate-400 font-mono">
                          CAPTCHA
                        </span>

                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5">

                          <div className="flex-1 text-center">

                            <span className="font-mono text-lg font-black tracking-[0.25em] text-[#002244] select-none">
                              {captchaCode}
                            </span>

                          </div>

                          <button
                            type="button"
                            onClick={
                              generateNewCaptcha
                            }
                            className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-[#002244]"
                            title="Generate new code"
                          >

                            <RefreshCw
                              className={`w-4 h-4 ${
                                isCaptchaSpinning
                                  ? 'animate-spin'
                                  : ''
                              }`}
                            />

                          </button>

                        </div>

                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={
                            captchaInput
                          }
                          onChange={e =>
                            setCaptchaInput(
                              e.target.value.toUpperCase()
                            )
                          }
                          placeholder="Enter code"
                          autoComplete="off"
                          className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-mono font-bold tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                        />

                      </div>

                    </div>

                    {/* REMEMBER */}
                    <div className="flex items-center justify-between gap-4">

                      <label className="flex items-center gap-2 cursor-pointer">

                        <input
                          type="checkbox"
                          checked={
                            rememberMe
                          }
                          onChange={e =>
                            setRememberMe(
                              e.target.checked
                            )
                          }
                          className="w-4 h-4 rounded border-slate-300 accent-[#002244]"
                        />

                        <span className="text-xs text-slate-600">
                          Remember this session
                        </span>

                      </label>

                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-bold">

                        <ShieldCheck className="w-3.5 h-3.5" />

                        Secure Session

                      </div>

                    </div>

                    {/* SUBMIT */}
                    <div className="pt-1">

                      <AnimatedButton
                        type="submit"
                        variant="primary"
                        size="lg"
                        isLoading={
                          isLoading
                        }
                        loadingText={
                          isGovernment
                            ? 'Verifying Government Credentials...'
                            : 'Verifying Account...'
                        }
                        isSuccess={
                          isSuccess
                        }
                        successText={
                          isGovernment
                            ? 'Government Access Granted'
                            : 'Access Granted'
                        }
                        className={`w-full py-3.5 text-sm font-black border shadow-sm ${
                          isGovernment
                            ? 'bg-gradient-to-r from-[#002244] to-[#003d6b] hover:from-[#00305a] hover:to-[#00518a] border-[#00345e]'
                            : 'bg-gradient-to-r from-[#0756a0] to-[#0a6bc3] hover:from-[#064986] hover:to-[#095ba7] border-blue-600'
                        } text-white`}
                        icon={
                          <ArrowRight className="w-4 h-4" />
                        }
                        iconPosition="right"
                      >

                        {isGovernment
                          ? 'Sign In to Government Portal'
                          : 'Sign In to User Portal'}

                      </AnimatedButton>

                    </div>

                  </form>

                  {/* BACK */}
                  <div className="mt-6">

                    <button
                      type="button"
                      onClick={
                        resetLogin
                      }
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-all"
                    >

                      <ChevronLeft className="w-3.5 h-3.5" />

                      Back to Portal Selection

                    </button>

                  </div>

                  {/* SECURITY */}
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">

                    <div className="flex items-start gap-2.5">

                      <KeyRound className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />

                      <div>

                        <div className="text-[11px] font-black text-slate-800">
                          Account Security
                        </div>

                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                          Never share your password or verification code. Access permissions are determined by the authenticated account.
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* FOOTER ROW */}
                  <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">

                    <div className="flex items-center gap-1.5">

                      <Globe2 className="w-3.5 h-3.5" />

                      <span>
                        India National Portal
                      </span>

                    </div>

                    <span>
                      BHARAT MATERIAL GRID
                    </span>

                  </div>

                </div>

              </div>

            </motion.div>
          )}

        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#001730] text-slate-400 border-t border-slate-800 px-4 py-3 text-center text-[10px] sm:text-xs">
        Bharat Material Grid • Secure Digital Access Gateway • Government of India
      </footer>

    </div>
  );
};