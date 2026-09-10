import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../../lib/supabase';
import { UserRole, TabType } from '../../types';

import {
  AshokaEmblem,
  DigitalIndiaLogo,
  MakeInIndiaLogo,
  BMGPortalLogo,
  BMGNationalSeal
} from '../common/GovernmentLogos';

import {
  Search,
  Bell,
  Play,
  LogOut,
  ChevronDown,
  Globe,
  FileText,
  Phone,
  Layers,
  Cpu,
  TrendingUp,
  CheckSquare,
  Building,
  UploadCloud,
  ShieldCheck,
  Home,
  Sparkles,
  UserRound,
  Mail,
  Landmark
} from 'lucide-react';

export const GovHeader: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    currentUserRole,
    setCurrentUserRole,
    notifications,
    setIsNotificationsOpen,
    setIsCommandPaletteOpen,
    setIsAIAssistantOpen,
    startSIHDemo,
    reviews,
    candidates,
    language,
    setLanguage
  } = useApp();

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [isGovernmentUser, setIsGovernmentUser] = useState(false);

  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');

  const [fontSize, setFontSize] =
    useState<'sm' | 'base' | 'lg'>('base');

  const navContainerRef = useRef<HTMLDivElement>(null);

  const unreadCount =
    notifications.filter(
      n => !n.read
    ).length;

  const pendingReviewsCount =
    reviews.filter(
      r =>
        r.status === 'Pending' ||
        r.status === 'High Priority'
    ).length;

  const pendingMatchesCount =
    candidates.filter(
      c =>
        c.status === 'Pending'
    ).length;

  /* =========================================================
     LOAD AUTHENTICATED USER + GOVERNMENT PROFILE
  ========================================================= */

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      try {
        const {
          data,
          error
        } =
          await supabase.auth.getUser();

        if (
          error ||
          !data.user
        ) {
          if (mounted) {
            setUserName('User');
            setUserEmail('');
            setIsGovernmentUser(false);
          }

          return;
        }

        const user = data.user;

        const fullName =
          user.user_metadata?.full_name;

        if (mounted) {
          setUserName(
            fullName ||
            user.email?.split('@')[0] ||
            'User'
          );

          setUserEmail(
            user.email || ''
          );
        }

        /* =====================================================
           GET VERIFIED PROFILE FROM EXISTING AUTH API
        ===================================================== */

        try {
          const response =
            await fetch(
              '/api/auth/profile',
              {
                method: 'GET',
                cache: 'no-store'
              }
            );

          if (!response.ok) {
            if (mounted) {
              setIsGovernmentUser(false);
            }

            return;
          }

          const result =
            await response.json();

          const profile =
            result?.profile;

          if (!profile) {
            if (mounted) {
              setIsGovernmentUser(false);
            }

            return;
          }

          const governmentUser =
            profile.user_type === 'GOVERNMENT' &&
            profile.is_active === true;

          if (!mounted) {
            return;
          }

          setIsGovernmentUser(
            governmentUser
          );

          setUserName(
            profile.full_name ||
            fullName ||
            user.email?.split('@')[0] ||
            'User'
          );

          setUserEmail(
            profile.email ||
            user.email ||
            ''
          );

          /*
           * Keep browser session information synchronized
           * with the authenticated database profile.
           */
          sessionStorage.setItem(
            'bmg_user_type',
            profile.user_type || ''
          );

          sessionStorage.setItem(
            'bmg_user_role',
            profile.role || ''
          );

          sessionStorage.setItem(
            'bmg_company_name',
            profile.company_name || ''
          );

          /*
           * Safety guard:
           * normal users cannot remain on the admin page.
           */
          if (
            currentTab === 'admin' &&
            !governmentUser
          ) {
            setCurrentTab(
              'dashboard'
            );
          }

        } catch (profileError) {
          console.error(
            'Failed to load account profile:',
            profileError
          );

          if (mounted) {
            setIsGovernmentUser(false);
          }
        }

      } catch (error) {
        console.error(
          'Authentication error:',
          error
        );

        if (mounted) {
          setUserName('User');
          setUserEmail('');
          setIsGovernmentUser(false);
        }
      }
    };

    void loadUser();

    const {
      data: authListener
    } =
      supabase.auth.onAuthStateChange(
        () => {
          void loadUser();
        }
      );

    return () => {
      mounted = false;

      authListener.subscription.unsubscribe();
    };
  }, [
    currentTab,
    setCurrentTab
  ]);

  /* =========================================================
     AVAILABLE ROLES
  ========================================================= */

  const roles: UserRole[] = [
    'National Administrator',
    'CPSE Administrator (IOCL)',
    'CPSE Administrator (ONGC)',
    'Material Master Officer',
    'Procurement Officer',
    'Auditor',
    'Executive Management'
  ];

  /* =========================================================
     FONT SIZE
  ========================================================= */

  const handleFontSize = (
    size: 'sm' | 'base' | 'lg'
  ) => {
    setFontSize(size);

    if (
      size === 'sm'
    ) {
      document.documentElement.style.fontSize =
        '14px';

    } else if (
      size === 'lg'
    ) {
      document.documentElement.style.fontSize =
        '18px';

    } else {
      document.documentElement.style.fontSize =
        '16px';
    }
  };

  /* =========================================================
     NAVIGATION
  ========================================================= */

  const handleNavClick = (
    tabId: TabType,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    setCurrentTab(tabId);

    e.currentTarget.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
  };

  /* =========================================================
     NAV LINKS
  ========================================================= */

  const navLinks: {
    id: TabType;
    label: string;
    hindiLabel: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [

    {
      id: 'home',
      label: 'Home',
      hindiLabel: 'मुख्य पृष्ठ',
      icon: (
        <Home className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'dashboard',
      label: 'Command Center',
      hindiLabel: 'कमांड सेंटर',
      icon: (
        <Cpu className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'master',
      label: 'Material Catalog',
      hindiLabel: 'सामग्री सूची',
      icon: (
        <Layers className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'ai-match',
      label: 'AI Spec Matcher',
      hindiLabel: 'एआई मिलान',
      icon: (
        <Cpu className="w-3.5 h-3.5" />
      ),
      badge:
        pendingMatchesCount
    },

    {
      id: 'review-queue',
      label: 'Review Queue',
      hindiLabel: 'सत्यापन कतार',
      icon: (
        <CheckSquare className="w-3.5 h-3.5" />
      ),
      badge:
        pendingReviewsCount
    },

    {
      id: 'procurement',
      label: 'Bulk Savings & Deals',
      hindiLabel: 'थोक खरीद बचत',
      icon: (
        <TrendingUp className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'cpse',
      label: 'CPSE Directory',
      hindiLabel: 'सीपीएसई निर्देशिका',
      icon: (
        <Building className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'upload',
      label: 'Upload Dataset',
      hindiLabel: 'डेटा अपलोड',
      icon: (
        <UploadCloud className="w-3.5 h-3.5" />
      )
    },

    {
      id: 'audit',
      label: 'Audit & Transparency',
      hindiLabel: 'ऑडिट रिकॉर्ड्स',
      icon: (
        <ShieldCheck className="w-3.5 h-3.5" />
      )
    }
  ];

  /* =========================================================
     SIGN OUT
  ========================================================= */

  const handleSignOut = async () => {
    sessionStorage.removeItem(
      'bmg_user_type'
    );

    sessionStorage.removeItem(
      'bmg_user_role'
    );

    sessionStorage.removeItem(
      'bmg_company_name'
    );

    await supabase.auth.signOut();

    window.location.href = '/';
  };

  return (
    <header className="w-full bg-white border-b border-slate-200 shadow-sm z-30 select-none">

      {/* =====================================================
          1. TOP INDIAN TRICOLOR RIBBON
      ===================================================== */}

      <div className="h-1.5 w-full flex">

        <div className="flex-1 bg-[#FF9933]" />

        <div className="flex-1 bg-[#FFFFFF] border-y border-slate-100" />

        <div className="flex-1 bg-[#138808]" />

      </div>

      {/* =====================================================
          2. GOVERNMENT UTILITY STRIP
      ===================================================== */}

      <div className="bg-[#002244] text-white text-[11px] py-1.5 px-4 lg:px-8 flex flex-wrap items-center justify-between gap-2 border-b border-[#001833]">

        <div className="flex items-center gap-2 sm:gap-4 font-medium">

          <div className="flex items-center gap-1.5">

            <span className="text-sm">
              🇮🇳
            </span>

            <span className="font-bold text-slate-100">
              भारत सरकार
            </span>

            <span className="text-slate-300">
              | Government of India
            </span>

          </div>

          <span className="hidden md:inline text-slate-400">
            •
          </span>

          <span className="hidden md:inline text-slate-200">
            भारी उद्योग मंत्रालय (Ministry of Heavy Industries & Public Enterprises)
          </span>

        </div>

        {/* ===================================================
            RIGHT TOP ACTIONS
        =================================================== */}

        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 text-slate-300 ml-auto">

          {/* HELPLINE */}

          <div className="hidden xl:flex items-center gap-1 text-emerald-300 font-mono text-[10px]">

            <Phone className="w-3 h-3" />

            <span>
              1800-11-2026
            </span>

          </div>

          {/* FONT SIZE */}

          <div className="flex items-center gap-1 bg-[#001730] px-2 py-0.5 rounded border border-slate-700 text-[10px] font-mono">

            <span className="text-slate-400 mr-0.5">
              Text:
            </span>

            <button
              onClick={() =>
                handleFontSize('sm')
              }
              className={`px-1 rounded hover:text-white cursor-pointer ${
                fontSize === 'sm'
                  ? 'text-amber-400 font-bold'
                  : ''
              }`}
              title="Decrease text size"
            >
              A-
            </button>

            <button
              onClick={() =>
                handleFontSize('base')
              }
              className={`px-1 rounded hover:text-white cursor-pointer ${
                fontSize === 'base'
                  ? 'text-amber-400 font-bold'
                  : ''
              }`}
              title="Default text size"
            >
              A
            </button>

            <button
              onClick={() =>
                handleFontSize('lg')
              }
              className={`px-1 rounded hover:text-white cursor-pointer ${
                fontSize === 'lg'
                  ? 'text-amber-400 font-bold'
                  : ''
              }`}
              title="Increase text size"
            >
              A+
            </button>

          </div>

          {/* LANGUAGE */}

          <div className="flex items-center gap-1.5 bg-[#001730] px-2.5 py-0.5 rounded border border-slate-700 text-[10px]">

            <Globe className="w-3 h-3 text-amber-400" />

            <button
              onClick={() =>
                setLanguage('EN')
              }
              className={`px-1.5 py-0.5 rounded hover:text-white cursor-pointer transition-colors flex items-center gap-1 ${
                language === 'EN'
                  ? 'text-amber-300 font-bold bg-[#002f5e]'
                  : 'text-slate-300'
              }`}
              title="English"
            >

              <span>
                English
              </span>

              <span className="text-[8px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-1 rounded uppercase tracking-wider font-mono">
                Rec
              </span>

            </button>

            <span className="text-slate-600">
              |
            </span>

            <button
              onClick={() =>
                setLanguage('HI')
              }
              className={`px-1.5 py-0.5 rounded hover:text-white cursor-pointer transition-colors ${
                language === 'HI'
                  ? 'text-amber-300 font-bold bg-[#002f5e]'
                  : 'text-slate-300'
              }`}
              title="राजभाषा हिन्दी"
            >
              हिन्दी
            </button>

          </div>

          {/* DIVIDER */}

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* =================================================
              OFFICER LOGIN
          ================================================= */}

          <motion.button
            whileHover={{
              scale: 1.03
            }}
            whileTap={{
              scale: 0.97
            }}
            onClick={() =>
              setCurrentTab('login')
            }
            className="flex items-center gap-1.5 bg-[#001730] hover:bg-[#002f5e] border border-slate-600 px-2.5 py-1 rounded-md text-xs text-white transition-colors cursor-pointer"
            title="Open Officer Login"
          >

            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />

            <span className="font-bold text-[11px]">
              Officer Login
            </span>

          </motion.button>

          {/* =================================================
              GOVERNMENT ADMINISTRATION
              
              ONLY ACTIVE GOVERNMENT USERS SEE THIS
          ================================================= */}

          {isGovernmentUser && (
            <motion.button
              whileHover={{
                scale: 1.03,
                y: -1
              }}
              whileTap={{
                scale: 0.97
              }}
              onClick={() =>
                setCurrentTab('admin')
              }
              className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-md text-xs text-white transition-all cursor-pointer shadow-sm ${
                currentTab === 'admin'
                  ? 'bg-indigo-500 border-indigo-300'
                  : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-400/70'
              }`}
              title="Government Administration"
            >

              <Landmark className="w-3.5 h-3.5 text-indigo-100" />

              <span className="font-black text-[11px]">
                Government Administration
              </span>

            </motion.button>
          )}

          {/* =================================================
              ROLE SELECTOR
          ================================================= */}

          <div className="relative">

            <motion.button
              whileHover={{
                scale: 1.03
              }}
              whileTap={{
                scale: 0.97
              }}
              onClick={() =>
                setIsRoleDropdownOpen(
                  prev => !prev
                )
              }
              className="flex items-center gap-1.5 bg-[#001730] hover:bg-[#002f5e] border border-amber-400/50 hover:border-amber-400 px-2.5 py-1 rounded-md text-xs text-white transition-colors cursor-pointer shadow-xs"
              title="Change active officer role"
            >

              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />

              <span className="font-extrabold text-amber-300 text-[11px] tracking-wide">

                {currentUserRole.includes(
                  'National'
                )
                  ? 'National'
                  : currentUserRole.split(
                      ' '
                    )[0]}

              </span>

              <ChevronDown className="w-3 h-3 text-slate-300" />

            </motion.button>

            {isRoleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-300 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95">

                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">

                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Role-Based Access (RBAC)
                  </div>

                  <div className="text-xs text-slate-800 font-semibold mt-0.5">
                    {currentUserRole}
                  </div>

                </div>

                <div className="max-h-60 overflow-y-auto py-1">

                  {roles.map(
                    role => (
                      <button
                        key={
                          role
                        }
                        onClick={() => {
                          setCurrentUserRole(
                            role
                          );

                          setIsRoleDropdownOpen(
                            false
                          );
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          currentUserRole ===
                          role
                            ? 'bg-amber-50 text-amber-900 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >

                        <span>
                          {role}
                        </span>

                        {currentUserRole ===
                          role && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        )}

                      </button>
                    )
                  )}

                </div>

                <div className="pt-1 mt-1 border-t border-slate-100 px-1">

                  <button
                    onClick={() => {
                      setIsRoleDropdownOpen(
                        false
                      );

                      setCurrentTab(
                        'login'
                      );
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-rose-700 hover:bg-rose-50 rounded-lg flex items-center gap-2 font-bold transition-colors cursor-pointer"
                  >

                    <LogOut className="w-3.5 h-3.5" />

                    <span>
                      Go to Officer Login Page
                    </span>

                  </button>

                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* =====================================================
          3. MAIN EMBLEM & TITLE BAR
      ===================================================== */}

      <div className="py-3 px-4 lg:px-8 bg-gradient-to-r from-slate-50 via-white to-amber-50/30 border-b border-slate-200">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* GOVERNMENT EMBLEM + TITLE */}

          <div
            className="flex items-center gap-3.5 cursor-pointer group"
            onClick={() =>
              setCurrentTab('home')
            }
          >

            <motion.div
              whileHover={{
                scale: 1.05
              }}
              transition={{
                type: 'spring',
                stiffness: 350
              }}
            >

              <AshokaEmblem
                size={50}
                tricolor={true}
                className="shrink-0 drop-shadow-xs"
              />

            </motion.div>

            <div className="h-11 w-px bg-slate-200 hidden sm:block" />

            <div>

              <div className="flex items-center gap-2 flex-wrap">

                <h1 className="text-xl sm:text-2xl font-black text-[#002244] tracking-tight font-display">
                  भारत मटेरियल ग्रिड
                </h1>

                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                  BHARAT MATERIAL GRID
                </span>

                <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                  GOV.IN PORTAL
                </span>

              </div>

              <p className="text-xs text-slate-600 font-medium leading-tight mt-1">
                राष्ट्रीय सीपीएसई सामग्री मानकीकरण एवं समन्वय पोर्टल (National CPSE Material Standardization & Harmonization)
              </p>

            </div>

          </div>

          {/* RIGHT ACTIONS */}

          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">

            {/* NATIONAL BADGES */}

            <div className="hidden xl:flex items-center gap-3 pr-2 border-r border-slate-200">

              <DigitalIndiaLogo
                height={32}
              />

              <MakeInIndiaLogo
                height={32}
              />

            </div>

            {/* INTERACTIVE DEMO */}

            <motion.button
              whileHover={{
                scale: 1.03
              }}
              whileTap={{
                scale: 0.97
              }}
              onClick={
                startSIHDemo
              }
              className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs border border-emerald-500 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Launch guided interactive platform demonstration"
            >

              <Play className="w-3.5 h-3.5 fill-white text-white" />

              <span>
                Interactive Demo
              </span>

            </motion.button>

            {/* AI COPILOT */}

            <motion.button
              whileHover={{
                scale: 1.04
              }}
              whileTap={{
                scale: 0.96
              }}
              onClick={() =>
                setIsAIAssistantOpen(
                  true
                )
              }
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs px-3.5 py-2 rounded-lg border border-amber-400 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer group"
              title="Ask Bharat AI contextual reasoning & spec validation"
            >

              <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-amber-300 group-hover:rotate-12 transition-transform" />

              <span>
                AI Copilot
              </span>

            </motion.button>

            {/* SEARCH */}

            <motion.button
              whileHover={{
                scale: 1.03
              }}
              whileTap={{
                scale: 0.97
              }}
              onClick={() =>
                setIsCommandPaletteOpen(
                  true
                )
              }
              className="bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg border border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs group"
              title="Search materials, specifications, and CPSEs"
            >

              <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800" />

              <span className="hidden sm:inline">
                Search Catalog
              </span>

              <kbd className="hidden md:inline-block bg-slate-100 text-slate-500 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200">
                ⌘K
              </kbd>

            </motion.button>

            {/* NOTIFICATIONS */}

            <motion.button
              whileHover={{
                scale: 1.05
              }}
              whileTap={{
                scale: 0.95
              }}
              onClick={() =>
                setIsNotificationsOpen(
                  true
                )
              }
              className="relative p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 transition-colors cursor-pointer shadow-2xs"
              title="Official Circulars and Notifications"
            >

              <Bell className="w-4 h-4 text-slate-700" />

              {unreadCount >
                0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 border border-white">
                  {
                    unreadCount
                  }
                </span>
              )}

            </motion.button>

            {/* PROFILE */}

            <div className="relative">

              <motion.button
                whileHover={{
                  scale: 1.03
                }}
                whileTap={{
                  scale: 0.97
                }}
                onClick={() =>
                  setIsProfileOpen(
                    prev => !prev
                  )
                }
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="View signed-in user details"
              >

                <span className="w-7 h-7 rounded-full bg-[#002a5c] text-white flex items-center justify-center shrink-0">

                  <UserRound className="w-3.5 h-3.5" />

                </span>

                <span className="hidden xl:flex flex-col items-start leading-tight">

                  <span className="font-bold text-slate-800 max-w-28 truncate">
                    {userName}
                  </span>

                  <span className="text-[10px] text-slate-500">
                    My Account
                  </span>

                </span>

                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />

              </motion.button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 z-50">

                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">

                    <div className="w-10 h-10 rounded-full bg-[#002a5c] text-white flex items-center justify-center shrink-0">

                      <UserRound className="w-5 h-5" />

                    </div>

                    <div className="min-w-0">

                      <div className="text-sm font-bold text-slate-900 truncate">
                        {userName}
                      </div>

                      <div className="text-[11px] text-emerald-700 font-semibold">
                        {isGovernmentUser
                          ? 'Verified Government Account'
                          : 'Authenticated User'}
                      </div>

                    </div>

                  </div>

                  <div className="py-3 space-y-2">

                    <div className="flex items-start gap-2 text-xs text-slate-600">

                      <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />

                      <div className="min-w-0">

                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                          Email
                        </div>

                        <div className="font-medium text-slate-800 break-all">
                          {userEmail ||
                            'Not available'}
                        </div>

                      </div>

                    </div>

                  </div>

                  <button
                    onClick={async () => {
                      setIsProfileOpen(
                        false
                      );

                      await handleSignOut();
                    }}
                    className="w-full border-t border-slate-100 pt-2 text-left px-1 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 cursor-pointer flex items-center gap-2"
                  >

                    <LogOut className="w-3.5 h-3.5" />

                    Sign Out

                  </button>

                </div>
              )}

            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          4. FULL WIDTH NAVIGATION
      ===================================================== */}

      <nav
        ref={
          navContainerRef
        }
        className="bg-[#002a5c] text-white px-4 lg:px-8 overflow-x-auto shadow-inner scroll-smooth no-scrollbar"
      >

        <div className="flex items-center gap-1 min-w-max py-1">

          {navLinks.map(
            link => {

              const isActive =
                currentTab ===
                link.id;

              return (
                <motion.button
                  key={
                    link.id
                  }
                  whileHover={{
                    y: -1
                  }}
                  whileTap={{
                    scale: 0.97
                  }}
                  onClick={e =>
                    handleNavClick(
                      link.id,
                      e
                    )
                  }
                  className={`relative px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap rounded-t-md ${
                    isActive
                      ? 'bg-[#001730] text-amber-400 font-bold'
                      : 'text-slate-200 hover:bg-[#001f44] hover:text-white'
                  }`}
                >

                  <span>
                    {link.icon}
                  </span>

                  <span>
                    {language ===
                    'HI'
                      ? link.hindiLabel
                      : link.label}
                  </span>

                  {link.badge !==
                    undefined &&
                    link.badge >
                      0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-2xs">
                        {
                          link.badge
                        }
                      </span>
                    )}

                  {isActive && (
                    <motion.div
                      layoutId="activeNavTabIndicator"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400 rounded-t-sm shadow-xs"
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35
                      }}
                    />
                  )}

                </motion.button>
              );
            }
          )}

        </div>

      </nav>

      {/* =====================================================
          5. BREAKING CIRCULARS
      ===================================================== */}

      <div className="bg-amber-50 border-b border-amber-200/80 px-4 lg:px-8 py-1.5 flex items-center gap-3 text-xs overflow-hidden">

        <div className="flex items-center gap-1.5 bg-red-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded uppercase tracking-wider shrink-0 shadow-2xs font-mono">

          <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />

          <span>
            CIRCULAR
          </span>

        </div>

        <div className="text-slate-800 font-medium truncate flex-1 flex items-center gap-4 text-xs">

          <span>

            <strong>
              Latest Directive (MoP&NG):
            </strong>{' '}
            Mandatory CPSE Material Harmonization & Rate Contract Pooling initiated across 8 central enterprises. Total projected savings:{' '}

            <strong className="text-emerald-700">
              ₹342.8 Crore
            </strong>.

          </span>

          <span className="hidden lg:inline text-slate-400">
            •
          </span>

          <span className="hidden lg:inline text-slate-600">
            Next Technical Review Meeting: 15 Sept 2026 at Udyog Bhawan, New Delhi.
          </span>

        </div>

        <button
          onClick={() =>
            setIsNotificationsOpen(
              true
            )
          }
          className="text-[11px] font-bold text-blue-800 hover:underline shrink-0 hidden sm:inline cursor-pointer"
        >
          View All Circulars (3) →
        </button>

      </div>

    </header>
  );
};

export default GovHeader;