import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
  AlertCircle,
  Home,
} from 'lucide-react';

import { useApp } from '../../context/AppContext';
import { supabase } from '../../../lib/supabase';

import {
  AshokaEmblem,
  DigitalIndiaLogo,
  MakeInIndiaLogo,
  CPSEBrandBadge,
} from '../common/GovernmentLogos';

type RegistrationType = 'company' | 'government';

export const RegisterView: React.FC = () => {
  const {
    setCurrentTab,
    addToast,
  } = useApp();

  const [registrationType, setRegistrationType] =
    useState<RegistrationType>('company');

  const [fullName, setFullName] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [companyName, setCompanyName] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [isSuccess, setIsSuccess] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const isGovernment =
    registrationType === 'government';

  const validateEmail = (
    value: string
  ) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
      value.trim()
    );
  };

  const validateGovernmentEmail = (
    value: string
  ) => {
    return /^[^\s@]+@gov\.in$/i.test(
      value.trim()
    );
  };

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCompanyName('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setErrorMessage(null);
    setIsLoading(false);
    setIsSuccess(false);
  };

  const handleTypeChange = (
    type: RegistrationType
  ) => {
    setRegistrationType(type);
    resetForm();
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setErrorMessage(null);

    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedName =
      fullName.trim();

    const normalizedCompany =
      companyName.trim();

    if (!normalizedName) {
      setErrorMessage(
        'Please enter your full name.'
      );
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setErrorMessage(
        'Please enter a valid email address.'
      );
      return;
    }

    if (
      isGovernment &&
      !validateGovernmentEmail(
        normalizedEmail
      )
    ) {
      setErrorMessage(
        'Government registration requires an official @gov.in email address.'
      );
      return;
    }

    if (
      !isGovernment &&
      !normalizedCompany
    ) {
      setErrorMessage(
        'Please enter your company or CPSE name.'
      );
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        'Password must contain at least 8 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        'Passwords do not match.'
      );
      return;
    }

    setIsLoading(true);

    try {
      /*
       * =====================================================
       * SUPABASE AUTH REGISTRATION
       * =====================================================
       *
       * The database trigger on auth.users will create:
       *
       * user_type = COMPANY
       * role      = Pending User
       * is_active = false
       *
       * for every newly created account.
       *
       * Government accounts are NOT automatically granted
       * Government privileges.
       */

      const {
        data,
        error,
      } =
        await supabase.auth.signUp({
          email:
            normalizedEmail,

          password,

          options: {
            data: {
              full_name:
                normalizedName,

              /*
               * Store requested registration
               * type as metadata only.
               *
               * The database profile remains
               * Pending User until approved.
               */
              requested_user_type:
                isGovernment
                  ? 'GOVERNMENT'
                  : 'COMPANY',

              requested_company:
                normalizedCompany ||
                null,
            },
          },
        });

      if (error) {
        console.error(
          'Supabase registration error:',
          error
        );

        if (
          error.message
            ?.toLowerCase()
            .includes(
              'already registered'
            )
        ) {
          setErrorMessage(
            'An account with this email already exists. Please sign in instead.'
          );
        } else {
          setErrorMessage(
            error.message ||
              'Unable to create your account.'
          );
        }

        setIsLoading(false);
        return;
      }

      if (!data.user) {
        setErrorMessage(
          'Registration did not return a user account.'
        );

        setIsLoading(false);
        return;
      }

      /*
       * =====================================================
       * SUCCESS
       * =====================================================
       */

      /*
       * Supabase may require email confirmation.
       * In either case, the account should NOT receive
       * application access until the administrator
       * provisions the profile.
       */

      setIsLoading(false);
      setIsSuccess(true);

      addToast({
        title:
          'Registration Submitted',

        message:
          isGovernment
            ? 'Your Government registration was submitted. An authorized administrator must verify and activate the account.'
            : 'Your company registration was submitted. An administrator must verify and activate the account.',

        type: 'success',
      });

      window.setTimeout(() => {
        resetForm();
        setRegistrationType(
          'company'
        );
        setCurrentTab('login');
      }, 1800);

    } catch (error: any) {
      console.error(
        'Unexpected registration error:',
        error
      );

      setErrorMessage(
        error?.message ||
          'Unable to complete registration.'
      );

      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900 flex flex-col">

      {/* TOP TRICOLOR */}
      <div className="h-1.5 w-full flex shrink-0">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white border-y border-slate-200" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      {/* HEADER */}
      <header className="bg-[#001f3f] text-white border-b border-[#0b355d]">

        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <AshokaEmblem
              size={42}
              color="#ffffff"
              goldTone={true}
            />

            <div>

              <div className="flex items-center gap-2">

                <h1 className="text-base sm:text-lg font-black">
                  भारत मटेरियल ग्रिड
                </h1>

                <span className="hidden sm:inline-flex px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/10 text-[9px] font-black tracking-wider text-amber-300 uppercase">
                  Bharat Material Grid
                </span>

              </div>

              <p className="text-[10px] sm:text-xs text-slate-300">
                National Material Harmonization & Intelligence Platform
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={() =>
              setCurrentTab('home')
            }
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 bg-[#002b50] hover:bg-amber-500 hover:text-slate-950 transition-all text-xs font-bold"
          >

            <Home className="w-3.5 h-3.5" />

            <span className="hidden sm:inline">
              Public Portal
            </span>

          </button>

        </div>

      </header>

      {/* MAIN */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">

        <div className="w-full max-w-5xl">

          <motion.div
            initial={{
              opacity: 0,
              y: 20,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.4,
            }}
            className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden"
          >

            <div className="grid grid-cols-1 lg:grid-cols-5">

              {/* LEFT */}
              <div className="lg:col-span-2 bg-gradient-to-br from-[#002244] via-[#001b38] to-[#001226] text-white p-7 sm:p-9">

                <div className="flex items-center gap-3">

                  <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">

                    {isGovernment ? (
                      <Landmark className="w-6 h-6 text-amber-300" />
                    ) : (
                      <Building2 className="w-6 h-6 text-blue-200" />
                    )}

                  </div>

                  <div>

                    <div className="text-[9px] uppercase tracking-[0.18em] font-black text-amber-300">
                      Secure Registration
                    </div>

                    <h2 className="text-xl font-black mt-1">
                      Create your account
                    </h2>

                  </div>

                </div>

                <p className="text-sm text-slate-300 leading-relaxed mt-7">
                  Register for access to the Bharat Material Grid platform. New accounts remain pending until verified and activated by an authorized administrator.
                </p>

                <div className="mt-7 space-y-4">

                  <div className="flex items-start gap-3">

                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />

                    <div>
                      <div className="text-xs font-bold text-white">
                        Verified registration
                      </div>

                      <div className="text-[10px] text-slate-400 mt-1">
                        Accounts are checked before platform access is granted.
                      </div>
                    </div>

                  </div>

                  <div className="flex items-start gap-3">

                    <ShieldCheck className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />

                    <div>
                      <div className="text-xs font-bold text-white">
                        Role-based access
                      </div>

                      <div className="text-[10px] text-slate-400 mt-1">
                        Your permissions depend on your approved account role.
                      </div>
                    </div>

                  </div>

                  <div className="flex items-start gap-3">

                    <Lock className="w-4 h-4 text-blue-300 mt-0.5 shrink-0" />

                    <div>
                      <div className="text-xs font-bold text-white">
                        Protected credentials
                      </div>

                      <div className="text-[10px] text-slate-400 mt-1">
                        Authentication is handled by Supabase Auth.
                      </div>
                    </div>

                  </div>

                </div>

                {isGovernment && (
                  <div className="mt-8 p-4 rounded-xl border border-amber-400/25 bg-amber-400/10">

                    <div className="flex items-center gap-2">

                      <Landmark className="w-4 h-4 text-amber-300" />

                      <span className="text-xs font-black text-amber-200">
                        GOVERNMENT REGISTRATION
                      </span>

                    </div>

                    <p className="text-[10px] text-slate-300 leading-relaxed mt-2">
                      Only official <span className="font-black text-white">@gov.in</span> email addresses can request Government account registration. Registration does not itself grant Government privileges.
                    </p>

                  </div>
                )}

                <div className="mt-8 pt-5 border-t border-white/10">

                  <div className="flex items-center justify-center gap-4 opacity-75">

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

              {/* RIGHT */}
              <div className="lg:col-span-3 p-6 sm:p-9 lg:p-10">

                {/* TYPE SELECTOR */}

                <div className="mb-7">

                  <div className="text-[10px] font-black text-blue-700 uppercase tracking-[0.16em]">
                    ACCOUNT TYPE
                  </div>

                  <h3 className="text-2xl font-black text-[#002244] mt-1">
                    Select registration type
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-500 mt-2">
                    Choose the account category you are requesting.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-5">

                    <button
                      type="button"
                      onClick={() =>
                        handleTypeChange(
                          'company'
                        )
                      }
                      className={`p-4 rounded-xl border text-left transition-all ${
                        !isGovernment
                          ? 'border-blue-400 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >

                      <Building2
                        className={`w-5 h-5 ${
                          !isGovernment
                            ? 'text-blue-700'
                            : 'text-slate-400'
                        }`}
                      />

                      <div className="text-xs font-black text-slate-900 mt-2">
                        User / Company
                      </div>

                      <div className="text-[10px] text-slate-500 mt-1">
                        CPSEs and participating companies
                      </div>

                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleTypeChange(
                          'government'
                        )
                      }
                      className={`p-4 rounded-xl border text-left transition-all ${
                        isGovernment
                          ? 'border-amber-400 bg-amber-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >

                      <Landmark
                        className={`w-5 h-5 ${
                          isGovernment
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }`}
                      />

                      <div className="text-xs font-black text-slate-900 mt-2">
                        Government
                      </div>

                      <div className="text-[10px] text-slate-500 mt-1">
                        Authorized officials
                      </div>

                    </button>

                  </div>

                </div>

                {/* ERROR */}

                {errorMessage && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      y: -5,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3"
                  >

                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />

                    <p className="text-xs font-semibold text-red-800 leading-relaxed">
                      {errorMessage}
                    </p>

                  </motion.div>
                )}

                {/* FORM */}

                <form
                  onSubmit={
                    handleSubmit
                  }
                  className="space-y-4"
                >

                  {/* NAME */}

                  <div>

                    <label className="block text-xs font-black text-slate-800 mb-1.5">
                      Full Name
                    </label>

                    <div className="relative">

                      <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        type="text"
                        required
                        value={
                          fullName
                        }
                        onChange={e =>
                          setFullName(
                            e.target.value
                          )
                        }
                        placeholder="Enter your full name"
                        autoComplete="name"
                        className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
                      />

                    </div>

                  </div>

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
                        value={
                          email
                        }
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
                        className={`w-full pl-10 pr-3 py-3 rounded-xl border bg-slate-50 focus:bg-white focus:outline-none text-sm ${
                          isGovernment
                            ? 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                            : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                        }`}
                      />

                    </div>

                    <div className="text-[10px] text-slate-400 mt-1">

                      {isGovernment
                        ? 'Registration requires an @gov.in address.'
                        : 'Use the email associated with your organization.'}

                    </div>

                  </div>

                  {/* COMPANY */}

                  {!isGovernment && (
                    <div>

                      <label className="block text-xs font-black text-slate-800 mb-1.5">
                        Company / CPSE Name
                      </label>

                      <div className="relative">

                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                        <input
                          type="text"
                          required
                          value={
                            companyName
                          }
                          onChange={e =>
                            setCompanyName(
                              e.target.value
                            )
                          }
                          placeholder="e.g. IOCL, BPCL, ONGC"
                          className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
                        />

                      </div>

                    </div>
                  )}

                  {/* PASSWORD */}

                  <div>

                    <label className="block text-xs font-black text-slate-800 mb-1.5">
                      Password
                    </label>

                    <div className="relative">

                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        type={
                          showPassword
                            ? 'text'
                            : 'password'
                        }
                        required
                        value={
                          password
                        }
                        onChange={e =>
                          setPassword(
                            e.target.value
                          )
                        }
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                        className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
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
                      >

                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}

                      </button>

                    </div>

                  </div>

                  {/* CONFIRM */}

                  <div>

                    <label className="block text-xs font-black text-slate-800 mb-1.5">
                      Confirm Password
                    </label>

                    <div className="relative">

                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        type={
                          showConfirmPassword
                            ? 'text'
                            : 'password'
                        }
                        required
                        value={
                          confirmPassword
                        }
                        onChange={e =>
                          setConfirmPassword(
                            e.target.value
                          )
                        }
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                        className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(
                            prev =>
                              !prev
                          )
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >

                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}

                      </button>

                    </div>

                  </div>

                  {/* SECURITY NOTICE */}

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">

                    <div className="flex items-start gap-2.5">

                      <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />

                      <p className="text-[10px] text-slate-500 leading-relaxed">

                        New accounts are created as
                        <span className="font-bold text-slate-700">
                          {' '}Pending User
                        </span>
                        {' '}and remain inactive until an authorized administrator verifies the registration.

                      </p>

                    </div>

                  </div>

                  {/* SUBMIT */}

                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      isSuccess
                    }
                    className={`w-full py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all shadow-sm ${
                      isGovernment
                        ? 'bg-gradient-to-r from-[#002244] to-[#003d6b] hover:from-[#00305a] hover:to-[#00518a]'
                        : 'bg-gradient-to-r from-[#0756a0] to-[#0a6bc3] hover:from-[#064986] hover:to-[#095ba7]'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >

                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />

                        Creating Account...
                      </>
                    ) : isSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />

                        Registration Submitted
                      </>
                    ) : (
                      <>
                        {isGovernment
                          ? 'Request Government Registration'
                          : 'Create Company Account'}

                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}

                  </button>

                </form>

                {/* LOGIN LINK */}

                <div className="mt-6 pt-5 border-t border-slate-100 text-center">

                  <p className="text-xs text-slate-500">
                    Already have an account?
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentTab(
                        'login'
                      )
                    }
                    className="mt-2 text-xs font-black text-blue-700 hover:underline"
                  >
                    Return to Secure Login
                  </button>

                </div>

              </div>

            </div>

          </motion.div>

        </div>

      </main>

      <footer className="bg-[#001730] text-slate-400 border-t border-slate-800 px-4 py-3 text-center text-[10px] sm:text-xs">
        Bharat Material Grid • Secure Registration Gateway • Government of India
      </footer>

    </div>
  );
};