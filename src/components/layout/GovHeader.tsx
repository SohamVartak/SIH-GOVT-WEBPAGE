import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { UserRole, TabType } from '../../types';
import { supabase } from '../../../lib/supabase';

import {
  AshokaEmblem,
  DigitalIndiaLogo,
  MakeInIndiaLogo,
} from '../common/GovernmentLogos';

import {
  Search,
  Bell,
  Play,
  LogOut,
  ChevronDown,
  Globe,
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
    setLanguage,

    /* COMPANY FILTER */
    companyOptions,
    selectedCompany,
    setSelectedCompany,
  } = useApp();


  /* =========================================================
     DROPDOWN STATES
  ========================================================= */

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] =
    useState(false);

  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] =
    useState(false);

  const [isProfileOpen, setIsProfileOpen] =
    useState(false);


  /* =========================================================
     FONT SIZE
  ========================================================= */

  const [fontSize, setFontSize] =
    useState<'sm' | 'base' | 'lg'>('base');


  /* =========================================================
     USER
  ========================================================= */

  const [userName, setUserName] =
    useState('User');

  const [userEmail, setUserEmail] =
    useState('');


  /* =========================================================
     NAVIGATION REF
  ========================================================= */

  const navContainerRef =
    useRef<HTMLDivElement>(null);


  /* =========================================================
     NOTIFICATION COUNT
  ========================================================= */

  const unreadCount =
    notifications.filter(
      n => !n.read
    ).length;


  /* =========================================================
     REVIEW COUNT
  ========================================================= */

  const pendingReviewsCount =
    reviews.filter(
      r =>
        r.status === 'Pending' ||
        r.status === 'High Priority'
    ).length;


  /* =========================================================
     AI MATCH COUNT
  ========================================================= */

  const pendingMatchesCount =
    candidates.filter(
      c =>
        c.status === 'Pending'
    ).length;


  /* =========================================================
     GET CURRENT SUPABASE USER
  ========================================================= */

  useEffect(() => {

    const getUser = async () => {

      const {
        data: { user },
      } = await supabase.auth.getUser();


      if (user) {

        const fullName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'User';


        setUserName(
          fullName
        );


        setUserEmail(
          user.email || ''
        );
      }
    };


    getUser();


    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {

          if (session?.user) {

            const fullName =
              session.user.user_metadata?.full_name ||
              session.user.user_metadata?.name ||
              session.user.email?.split('@')[0] ||
              'User';


            setUserName(
              fullName
            );


            setUserEmail(
              session.user.email || ''
            );

          } else {

            setUserName(
              'User'
            );

            setUserEmail(
              ''
            );
          }
        }
      );


    return () => {

      subscription.unsubscribe();

    };

  }, []);


  /* =========================================================
     ROLES
  ========================================================= */

  const roles: UserRole[] = [
    'National Administrator',
    'CPSE Administrator (IOCL)',
    'CPSE Administrator (ONGC)',
    'Material Master Officer',
    'Procurement Officer',
    'Auditor',
    'Executive Management',
  ];


  /* =========================================================
     FONT SIZE HANDLER
  ========================================================= */

  const handleFontSize = (
    size: 'sm' | 'base' | 'lg'
  ) => {

    setFontSize(
      size
    );


    if (size === 'sm') {

      document.documentElement.style.fontSize =
        '14px';

    } else if (size === 'lg') {

      document.documentElement.style.fontSize =
        '18px';

    } else {

      document.documentElement.style.fontSize =
        '16px';
    }
  };


  /* =========================================================
     NAVIGATION HANDLER
  ========================================================= */

  const handleNavClick = (
    tabId: TabType,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {

    setCurrentTab(
      tabId
    );


    e.currentTarget.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };


  /* =========================================================
     COMPANY SELECTION
  ========================================================= */

  const handleCompanySelect = (
    company: string
  ) => {

    setSelectedCompany(
      company
    );

    setIsCompanyDropdownOpen(
      false
    );
  };


  /* =========================================================
     LOGOUT
  ========================================================= */

  const handleLogout = async () => {

    setIsProfileOpen(
      false
    );


    await supabase.auth.signOut();


    window.location.href =
      '/';
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
      ),
    },

    {
      id: 'dashboard',
      label: 'Command Center',
      hindiLabel: 'कमांड सेंटर',
      icon: (
        <Cpu className="w-3.5 h-3.5" />
      ),
    },

    {
      id: 'master',
      label: 'Material Catalog',
      hindiLabel: 'सामग्री सूची',
      icon: (
        <Layers className="w-3.5 h-3.5" />
      ),
    },

    {
      id: 'ai-match',
      label: 'AI Spec Matcher',
      hindiLabel: 'एआई मिलान',
      icon: (
        <Cpu className="w-3.5 h-3.5" />
      ),
      badge:
        pendingMatchesCount,
    },

    {
      id: 'review-queue',
      label: 'Review Queue',
      hindiLabel: 'सत्यापन कतार',
      icon: (
        <CheckSquare className="w-3.5 h-3.5" />
      ),
      badge:
        pendingReviewsCount,
    },

    {
     
         id: 'procurement',
          label: 'Part Search & Datasheets',
          hindiLabel: 'पार्ट खोज एवं डेटाशीट',
         icon:
         ( <Search className="w-3.5 h-3.5" />
         )
      
    },

    {
      id: 'cpse',
      label: 'CPSE Directory',
      hindiLabel: 'सीपीएसई निर्देशिका',
      icon: (
        <Building className="w-3.5 h-3.5" />
      ),
    },

    {
      id: 'upload',
      label: 'Upload Dataset',
      hindiLabel: 'डेटा अपलोड',
      icon: (
        <UploadCloud className="w-3.5 h-3.5" />
      ),
    },

    {
      id: 'audit',
      label: 'Audit & Transparency',
      hindiLabel: 'ऑडिट रिकॉर्ड्स',
      icon: (
        <ShieldCheck className="w-3.5 h-3.5" />
      ),
    },
  ];


  /* =========================================================
     UI
  ========================================================= */

  return (

    <header className="w-full bg-white border-b border-slate-200 shadow-sm z-30 select-none">

      {/* =====================================================
          1. INDIAN TRICOLOR RIBBON
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

        {/* LEFT */}

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


        {/* RIGHT */}

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
            >
              हिन्दी
            </button>

          </div>


          <div className="h-4 w-px bg-slate-700 hidden sm:block" />


          {/* =================================================
              COMPANY SELECTOR
          ================================================= */}

          <div className="relative">

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              onClick={() =>
                setIsCompanyDropdownOpen(
                  prev => !prev
                )
              }
              className="flex items-center gap-1.5 bg-[#001730] hover:bg-[#002f5e] border border-emerald-400/60 hover:border-emerald-400 px-2.5 py-1 rounded-md text-xs text-white transition-colors cursor-pointer shadow-xs"
              title="Select company data"
            >

              <Building className="w-3.5 h-3.5 text-emerald-400" />


              <div className="flex flex-col items-start leading-tight">

                <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">
                  Company
                </span>

                <span className="font-extrabold text-emerald-300 text-[11px] tracking-wide max-w-32 truncate">
                  {selectedCompany}
                </span>

              </div>


              <ChevronDown
                className={`w-3 h-3 text-slate-300 transition-transform ${
                  isCompanyDropdownOpen
                    ? 'rotate-180'
                    : ''
                }`}
              />

            </motion.button>


            {isCompanyDropdownOpen && (

              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-300 rounded-xl shadow-2xl py-1.5 z-[80]">

                {/* HEADER */}

                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">

                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Material Database Scope
                  </div>

                  <div className="text-xs text-slate-800 font-semibold mt-0.5">
                    Select company
                  </div>

                </div>


                {/* COMPANY LIST */}

                <div className="max-h-72 overflow-y-auto py-1">

                  {companyOptions.length === 0 ? (

                    <div className="px-3 py-4 text-center text-xs text-slate-500">

                      No companies available

                    </div>

                  ) : (

                    companyOptions.map(
                      company => {

                        const isSelected =
                          selectedCompany ===
                          company;


                        return (

                          <button
                            key={company}
                            onClick={() =>
                              handleCompanySelect(
                                company
                              )
                            }
                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >

                            <span className="flex items-center gap-2">

                              {company ===
                              'ALL COMPANIES' ? (

                                <Layers className="w-3.5 h-3.5 text-blue-600" />

                              ) : (

                                <Building className="w-3.5 h-3.5 text-slate-400" />

                              )}

                              <span>
                                {company}
                              </span>

                            </span>


                            {isSelected && (

                              <span className="w-2 h-2 rounded-full bg-emerald-600" />

                            )}

                          </button>

                        );
                      }
                    )

                  )}

                </div>


                {/* FOOTER */}

                <div className="border-t border-slate-100 px-3 py-2 bg-slate-50">

                  <div className="text-[9px] text-slate-500 leading-relaxed">

                    Company filters only change the displayed
                    material records. Original database records
                    remain unchanged.

                  </div>

                </div>

              </div>

            )}

          </div>


          {/* DIVIDER */}

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />


          {/* =================================================
              ROLE SELECTOR
          ================================================= */}

          <div className="relative">

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              onClick={() =>
                setIsRoleDropdownOpen(
                  prev => !prev
                )
              }
              className="flex items-center gap-1.5 bg-[#001730] hover:bg-[#002f5e] border border-amber-400/50 hover:border-amber-400 px-2.5 py-1 rounded-md text-xs text-white transition-colors cursor-pointer shadow-xs"
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

              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-300 rounded-xl shadow-2xl py-1.5 z-[80]">

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
                        key={role}
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

              </div>

            )}

          </div>

        </div>

      </div>


      {/* =====================================================
          3. MAIN TITLE BAR
      ===================================================== */}

      <div className="py-3 px-4 lg:px-8 bg-gradient-to-r from-slate-50 via-white to-amber-50/30 border-b border-slate-200">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* TITLE */}

          <div
            className="flex items-center gap-3.5 cursor-pointer group"
            onClick={() =>
              setCurrentTab(
                'home'
              )
            }
          >

            <motion.div
              whileHover={{
                scale: 1.05,
              }}
              transition={{
                type: 'spring',
                stiffness: 350,
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
                राष्ट्रीय सीपीएसई सामग्री मानकीकरण एवं समन्वय पोर्टल
                (National CPSE Material Standardization & Harmonization)
              </p>

            </div>

          </div>


          {/* RIGHT */}

          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">

            {/* BADGES */}

            <div className="hidden xl:flex items-center gap-3 pr-2 border-r border-slate-200">

              <DigitalIndiaLogo
                height={32}
              />

              <MakeInIndiaLogo
                height={32}
              />

            </div>


            {/* DEMO */}

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              onClick={
                startSIHDemo
              }
              className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs border border-emerald-500 transition-all flex items-center gap-1.5 cursor-pointer"
            >

              <Play className="w-3.5 h-3.5 fill-white text-white" />

              <span>
                Interactive Demo
              </span>

            </motion.button>


            {/* AI COPILOT */}

            <motion.button
              whileHover={{
                scale: 1.04,
              }}
              whileTap={{
                scale: 0.96,
              }}
              onClick={() =>
                setIsAIAssistantOpen(
                  true
                )
              }
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs px-3.5 py-2 rounded-lg border border-amber-400 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer group"
            >

              <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-amber-300 group-hover:rotate-12 transition-transform" />

              <span>
                AI Copilot
              </span>

            </motion.button>


            {/* SEARCH */}

            <motion.button
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{
                scale: 0.97,
              }}
              onClick={() =>
                setIsCommandPaletteOpen(
                  true
                )
              }
              className="bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg border border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs group"
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
                scale: 1.05,
              }}
              whileTap={{
                scale: 0.95,
              }}
              onClick={() =>
                setIsNotificationsOpen(
                  true
                )
              }
              className="relative p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 transition-colors cursor-pointer shadow-2xs"
            >

              <Bell className="w-4 h-4 text-slate-700" />


              {unreadCount > 0 && (

                <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 border border-white">

                  {unreadCount}

                </span>

              )}

            </motion.button>


            {/* =================================================
                ACCOUNT
            ================================================= */}

            <div className="relative">

              <motion.button
                whileHover={{
                  scale: 1.03,
                }}
                whileTap={{
                  scale: 0.97,
                }}
                onClick={() =>
                  setIsProfileOpen(
                    prev => !prev
                  )
                }
                className="flex items-center gap-2 bg-[#002a5c] hover:bg-[#001f44] text-white px-3 py-2 rounded-lg border border-slate-300 shadow-sm transition-all cursor-pointer"
              >

                <div className="w-7 h-7 rounded-full bg-amber-400 text-[#002a5c] flex items-center justify-center shrink-0">

                  <UserRound className="w-4 h-4" />

                </div>


                <div className="hidden md:flex flex-col items-start leading-tight max-w-32">

                  <span className="text-xs font-bold truncate w-full text-left">
                    {userName}
                  </span>

                  <span className="text-[9px] text-slate-300">
                    My Account
                  </span>

                </div>


                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isProfileOpen
                      ? 'rotate-180'
                      : ''
                  }`}
                />

              </motion.button>


              {/* ACCOUNT DROPDOWN */}

              {isProfileOpen && (

                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 z-[100]">

                  <div className="flex items-center gap-3 pb-4 border-b border-slate-200">

                    <div className="w-12 h-12 rounded-full bg-[#002a5c] text-white flex items-center justify-center shrink-0">

                      <UserRound className="w-6 h-6" />

                    </div>


                    <div className="min-w-0">

                      <div className="text-base font-bold text-slate-900 truncate">
                        {userName}
                      </div>

                      <div className="text-xs text-emerald-700 font-semibold">
                        Signed in
                      </div>

                    </div>

                  </div>


                  <div className="py-4">

                    <div className="flex items-start gap-3">

                      <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />


                      <div className="min-w-0">

                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                          Email
                        </div>


                        <div className="mt-1 text-sm font-medium text-slate-800 break-all">
                          {userEmail ||
                            'Not available'}
                        </div>

                      </div>

                    </div>

                  </div>


                  <button
                    onClick={
                      handleLogout
                    }
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                  >

                    <LogOut className="w-4 h-4" />

                    Logout

                  </button>

                </div>

              )}

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          4. NAVIGATION
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
                  key={link.id}
                  whileHover={{
                    y: -1,
                  }}
                  whileTap={{
                    scale: 0.97,
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
                      {link.badge}
                    </span>

                  )}


                  {isActive && (

                    <motion.div
                      layoutId="activeNavTabIndicator"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400 rounded-t-sm shadow-xs"
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35,
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
          5. CIRCULAR STRIP
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

            Mandatory CPSE Material Harmonization & Rate Contract Pooling
            initiated across 8 central enterprises. Total projected
            savings:{' '}

            <strong className="text-emerald-700">
              ₹342.8 Crore
            </strong>.

          </span>


          <span className="hidden lg:inline text-slate-400">
            •
          </span>


          <span className="hidden lg:inline text-slate-600">

            Next Technical Review Meeting: 15 Sept 2026 at Udyog Bhawan,
            New Delhi.

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