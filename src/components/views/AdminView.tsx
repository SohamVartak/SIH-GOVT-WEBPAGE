import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';

import {
  BookOpen,
  Cpu,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Save,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Building2,
  Landmark,
  Activity,
  Loader2,
  XCircle,
  UserCog,
  MailCheck,
  Ban,
  KeyRound,
} from 'lucide-react';

type AdminTab =
  | 'standards'
  | 'dictionary'
  | 'rules'
  | 'ai'
  | 'rbac';

type ManagedUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  user_type: 'GOVERNMENT' | 'COMPANY';
  role: string;
  company_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const AVAILABLE_ROLES = [
  'Pending User',
  'National Administrator',
  'CPSE Administrator (IOCL)',
  'CPSE Administrator (ONGC)',
  'Material Master Officer',
  'Procurement Officer',
  'Auditor',
  'Executive Management',
];

const USER_TYPES = [
  'COMPANY',
  'GOVERNMENT',
] as const;

export const AdminView: React.FC = () => {
  const { addToast } = useApp();

  const [activeTab, setActiveTab] =
    useState<AdminTab>('rules');

  /* =====================================================
     AI MODEL WEIGHTS
  ===================================================== */

  const [semanticWeight, setSemanticWeight] = useState(30);
  const [materialWeight, setMaterialWeight] = useState(25);
  const [gradeWeight, setGradeWeight] = useState(20);
  const [dimensionWeight, setDimensionWeight] = useState(25);

  /* =====================================================
     DICTIONARY
  ===================================================== */

  const [dictionarySearch, setDictionarySearch] =
    useState('');

  const abbreviations = [
    {
      abbr: 'SS',
      expansion: 'Stainless Steel',
      category: 'Metallurgy',
      standard: 'IS/ISO',
    },
    {
      abbr: 'CS / WCB',
      expansion: 'ASTM A216 Cast Carbon Steel',
      category: 'Castings',
      standard: 'ASME B16.34',
    },
    {
      abbr: 'FLGD',
      expansion: 'Flanged End Connection',
      category: 'Piping',
      standard: 'ASME B16.5',
    },
    {
      abbr: 'CL / #',
      expansion: 'Pressure Class (e.g., Class 150/300/600)',
      category: 'Pressure',
      standard: 'ASME',
    },
    {
      abbr: 'PTFE',
      expansion: 'Polytetrafluoroethylene (Teflon)',
      category: 'Polymers',
      standard: 'ASTM',
    },
    {
      abbr: 'OS&Y',
      expansion: 'Outside Screw and Yoke',
      category: 'Valves',
      standard: 'API 600',
    },
    {
      abbr: 'NBR',
      expansion: 'Nitrile Butadiene Rubber',
      category: 'Elastomers',
      standard: 'ASTM D2000',
    },
    {
      abbr: 'MS',
      expansion: 'Mild Steel (IS 2062 Grade E250)',
      category: 'Structural',
      standard: 'IS 2062',
    },
  ];

  const filteredAbbr =
    abbreviations.filter(item =>
      item.abbr
        .toLowerCase()
        .includes(dictionarySearch.toLowerCase()) ||
      item.expansion
        .toLowerCase()
        .includes(dictionarySearch.toLowerCase())
    );

  const handleSaveWeights = () => {
    addToast({
      title: 'AI Weights Updated',
      message:
        'Dual-encoder spec validation weights updated in runtime configuration.',
      type: 'success',
    });
  };

  /* =====================================================
     USER MANAGEMENT / RBAC
  ===================================================== */

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');

  const [userTypeFilter, setUserTypeFilter] =
    useState<'ALL' | 'GOVERNMENT' | 'COMPANY'>('ALL');

  const [statusFilter, setStatusFilter] =
    useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [editingUserId, setEditingUserId] =
    useState<string | null>(null);

  const [editingUserType, setEditingUserType] =
    useState<'GOVERNMENT' | 'COMPANY'>('COMPANY');

  const [editingRole, setEditingRole] =
    useState('Pending User');

  const [editingCompany, setEditingCompany] =
    useState('');

  const [editingActive, setEditingActive] =
    useState(false);

  const [savingUserId, setSavingUserId] =
    useState<string | null>(null);

  const [refreshingUsers, setRefreshingUsers] =
    useState(false);

  /* =====================================================
     LOAD USERS
  ===================================================== */

  const loadUsers = async () => {
    setUsersLoading(true);
    setRefreshingUsers(true);
    setUsersError(null);

    try {
      const response = await fetch(
        '/api/admin/user',
        {
          method: 'GET',
          cache: 'no-store',
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            'Unable to load user profiles.'
        );
      }

      setUsers(
        Array.isArray(result?.users)
          ? result.users
          : []
      );
    } catch (error: any) {
      console.error(
        'Admin user load error:',
        error
      );

      setUsersError(
        error?.message ||
          'Unable to load user profiles.'
      );

      setUsers([]);
    } finally {
      setUsersLoading(false);

      window.setTimeout(() => {
        setRefreshingUsers(false);
      }, 300);
    }
  };

  useEffect(() => {
    if (activeTab === 'rbac') {
      loadUsers();
    }
  }, [activeTab]);

  /* =====================================================
     USER EDITING
  ===================================================== */

  const startEditingUser = (
    user: ManagedUser
  ) => {
    setEditingUserId(user.user_id);

    setEditingUserType(
      user.user_type
    );

    setEditingRole(
      user.role || 'Pending User'
    );

    setEditingCompany(
      user.company_name || ''
    );

    setEditingActive(
      user.is_active
    );
  };

  const cancelEditingUser = () => {
    setEditingUserId(null);
    setEditingUserType('COMPANY');
    setEditingRole('Pending User');
    setEditingCompany('');
    setEditingActive(false);
  };

  /* =====================================================
     SAVE USER
  ===================================================== */

  const saveUser = async (
    userId: string
  ) => {
    setSavingUserId(userId);

    try {
      const currentUser =
        users.find(
          user =>
            user.user_id === userId
        );

      if (
        editingUserType ===
        'GOVERNMENT'
      ) {
        const email = (
          currentUser?.email || ''
        )
          .trim()
          .toLowerCase();

        if (
          !/^[^@\s]+@gov\.in$/i.test(
            email
          )
        ) {
          throw new Error(
            'Government users must have an official @gov.in email address.'
          );
        }
      }

      const response =
        await fetch(
          '/api/admin/user',
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              userId,
              userType:
                editingUserType,
              role: editingRole,
              companyName:
                editingCompany.trim() ||
                null,
              isActive:
                editingActive,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            'Unable to update user.'
        );
      }

      setUsers(
        currentUsers =>
          currentUsers.map(user =>
            user.user_id ===
            userId
              ? result.user
              : user
          )
      );

      cancelEditingUser();

      addToast({
        title:
          'User Profile Updated',
        message:
          'Account type, role, company and activation status were updated successfully.',
        type: 'success',
      });
    } catch (error: any) {
      console.error(
        'Admin user update error:',
        error
      );

      addToast({
        title:
          'Update Failed',
        message:
          error?.message ||
          'Unable to update user.',
        type: 'error',
      });
    } finally {
      setSavingUserId(null);
    }
  };

  /* =====================================================
     DERIVED USER DATA
  ===================================================== */

  const filteredUsers =
    users.filter(user => {
      const search =
        userSearch
          .trim()
          .toLowerCase();

      const matchesSearch =
        !search ||
        (
          user.email || ''
        )
          .toLowerCase()
          .includes(search) ||
        (
          user.full_name || ''
        )
          .toLowerCase()
          .includes(search) ||
        (
          user.company_name || ''
        )
          .toLowerCase()
          .includes(search) ||
        (
          user.role || ''
        )
          .toLowerCase()
          .includes(search);

      const matchesType =
        userTypeFilter ===
          'ALL' ||
        user.user_type ===
          userTypeFilter;

      const matchesStatus =
        statusFilter ===
          'ALL' ||
        (
          statusFilter ===
          'ACTIVE'
            ? user.is_active
            : !user.is_active
        );

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus
      );
    });

  const governmentUsersList =
    useMemo(
      () =>
        users.filter(
          user =>
            user.user_type ===
            'GOVERNMENT'
        ),
      [users]
    );

  const pendingGovernmentUsers =
    useMemo(
      () =>
        governmentUsersList.filter(
          user =>
            !user.is_active ||
            user.role ===
              'Pending User'
        ),
      [
        governmentUsersList,
      ]
    );

  const activeGovernmentUsers =
    useMemo(
      () =>
        governmentUsersList.filter(
          user =>
            user.is_active &&
            user.role !==
              'Pending User'
        ),
      [
        governmentUsersList,
      ]
    );

  const governmentAdministrators =
    useMemo(
      () =>
        governmentUsersList.filter(
          user =>
            user.role ===
            'National Administrator' ||
            user.role.startsWith(
              'CPSE Administrator'
            )
        ),
      [
        governmentUsersList,
      ]
    );

  const totalUsers =
    users.length;

  const activeUsers =
    users.filter(
      user =>
        user.is_active
    ).length;

  const pendingUsers =
    users.filter(
      user =>
        !user.is_active ||
        user.role ===
          'Pending User'
    ).length;

  const governmentUsers =
    governmentUsersList.length;

  const companyUsers =
    users.filter(
      user =>
        user.user_type ===
        'COMPANY'
    ).length;

  /* =====================================================
     QUICK GOVERNMENT ACTION
  ===================================================== */

  const quickGovernmentEdit = (
    user: ManagedUser
  ) => {
    startEditingUser(user);

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="bg-[#000a1e] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">

        <div>

          <div className="flex items-center gap-2">

            <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
              System Administration
            </span>

            <span className="text-xs text-slate-400 font-mono">
              Government Governance & Access Control
            </span>

          </div>

          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Platform Engine & Government Administration
          </h1>

          <p className="text-xs text-slate-300">
            Manage government officers, CPSE access,
            platform roles, engineering governance and
            secure account activation.
          </p>

        </div>

        <div className="flex items-center gap-2">

          <div className="px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-400/20">

            <div className="text-[9px] uppercase tracking-wider text-indigo-300 font-black">
              Government Users
            </div>

            <div className="text-lg font-black text-white font-mono">
              {governmentUsers}
            </div>

          </div>

          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20">

            <div className="text-[9px] uppercase tracking-wider text-emerald-300 font-black">
              Active
            </div>

            <div className="text-lg font-black text-white font-mono">
              {activeGovernmentUsers.length}
            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          TABS
      ===================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex items-center gap-1 overflow-x-auto text-xs">

        <button
          onClick={() =>
            setActiveTab('rules')
          }
          className={`px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab ===
            'rules'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          Spec Guard Rules
        </button>

        <button
          onClick={() =>
            setActiveTab('dictionary')
          }
          className={`px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab ===
            'dictionary'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4 text-cyan-400" />
          Domain Dictionary
        </button>

        <button
          onClick={() =>
            setActiveTab('ai')
          }
          className={`px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab ===
            'ai'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Cpu className="w-4 h-4 text-emerald-400" />
          AI Embedding & Weights
        </button>

        <button
          onClick={() =>
            setActiveTab('rbac')
          }
          className={`px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab ===
            'rbac'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-400" />
          Government & RBAC
        </button>

      </div>

      {/* =====================================================
          SPEC GUARD RULES
      ===================================================== */}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-base font-bold text-slate-900">
                Engineering Safety Guard Rules
              </h2>

              <p className="text-xs text-slate-500">
                Enforces physical zero-tolerance rules that
                override high semantic similarity.
              </p>

            </div>

            <button
              type="button"
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
              onClick={() =>
                addToast({
                  title:
                    'Safety Rule Editor',
                  message:
                    'Rule creation workflow will be connected to the governance rules store.',
                  type: 'info',
                })
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Add Safety Rule
            </button>

          </div>

          <div className="space-y-3 text-xs">

            <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 space-y-1.5">

              <div className="flex items-center justify-between font-bold text-rose-800">

                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Rule #SG-101: Zero Tolerance on Fastener & Bolt Lengths
                </span>

                <span className="font-mono text-[10px] bg-rose-200 px-2 py-0.5 rounded text-rose-900">
                  Active • Blocking
                </span>

              </div>

              <p className="text-slate-700 leading-relaxed">
                If candidate items differ in nominal length by
                &gt; 0mm, automated merge is strictly forbidden
                regardless of semantic text score.
              </p>

            </div>

            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1.5">

              <div className="flex items-center justify-between font-bold text-amber-800">

                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Rule #SG-104: Valve Pressure Class Incompatibility
                </span>

                <span className="font-mono text-[10px] bg-amber-200 px-2 py-0.5 rounded text-amber-900">
                  Active • Blocking
                </span>

              </div>

              <p className="text-slate-700 leading-relaxed">
                Class 150 and Class 300 ratings cannot be
                merged into a single common item.
              </p>

            </div>

            <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1.5">

              <div className="flex items-center justify-between font-bold text-emerald-800">

                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Rule #SG-108: Equivalent Metallurgy Dual-Naming
                </span>

                <span className="font-mono text-[10px] bg-emerald-200 px-2 py-0.5 rounded text-emerald-900">
                  Active • Auto-Map
                </span>

              </div>

              <p className="text-slate-700 leading-relaxed">
                Allow equivalence between AISI 304 and
                IS 04Cr18Ni10 when certified in Mill Test
                Certificates.
              </p>

            </div>

          </div>

        </div>
      )}

      {/* =====================================================
          DOMAIN DICTIONARY
      ===================================================== */}

      {activeTab === 'dictionary' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <div>

              <h2 className="text-base font-bold text-slate-900">
                Bharat Domain Dictionary
              </h2>

              <p className="text-xs text-slate-500">
                Standardizing Indian industrial CPSE abbreviations
                into formal specifications.
              </p>

            </div>

            <input
              type="text"
              value={dictionarySearch}
              onChange={e =>
                setDictionarySearch(
                  e.target.value
                )
              }
              placeholder="Search abbreviation or standard..."
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-amber-500 w-full sm:w-64"
            />

          </div>

          <div className="overflow-hidden border border-slate-200 rounded-xl">

            <table className="w-full text-left text-xs">

              <thead className="bg-slate-50 text-[10px] font-mono text-slate-500 uppercase border-b border-slate-200">

                <tr>
                  <th className="p-3">
                    Raw CPSE Abbreviation
                  </th>

                  <th className="p-3">
                    Canonical Expansion
                  </th>

                  <th className="p-3">
                    Category
                  </th>

                  <th className="p-3 text-right">
                    Governing Standard
                  </th>
                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100 font-mono">

                {filteredAbbr.map(
                  (item, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50"
                    >
                      <td className="p-3 font-bold text-amber-700">
                        {item.abbr}
                      </td>

                      <td className="p-3 font-sans font-semibold text-slate-900">
                        {item.expansion}
                      </td>

                      <td className="p-3 text-slate-600 font-sans">
                        {item.category}
                      </td>

                      <td className="p-3 text-right font-bold text-slate-800">
                        {item.standard}
                      </td>
                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </div>
      )}

      {/* =====================================================
          AI WEIGHTS
      ===================================================== */}

      {activeTab === 'ai' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">

          <div>

            <h2 className="text-base font-bold text-slate-900">
              AI Dual-Encoder Scoring Weights
            </h2>

            <p className="text-xs text-slate-500">
              Configure contribution of vector similarity vs
              physical parameters in overall confidence score.
            </p>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            <div className="space-y-2">

              <div className="flex justify-between text-xs font-mono">

                <span className="font-bold text-slate-700">
                  Semantic Text Similarity
                </span>

                <strong className="text-indigo-600">
                  {semanticWeight}%
                </strong>

              </div>

              <input
                type="range"
                min="10"
                max="50"
                value={semanticWeight}
                onChange={e =>
                  setSemanticWeight(
                    parseInt(
                      e.target.value
                    )
                  )
                }
                className="w-full accent-indigo-600"
              />

            </div>

            <div className="space-y-2">

              <div className="flex justify-between text-xs font-mono">

                <span className="font-bold text-slate-700">
                  Material & Metallurgy Match
                </span>

                <strong className="text-emerald-600">
                  {materialWeight}%
                </strong>

              </div>

              <input
                type="range"
                min="10"
                max="50"
                value={materialWeight}
                onChange={e =>
                  setMaterialWeight(
                    parseInt(
                      e.target.value
                    )
                  )
                }
                className="w-full accent-emerald-600"
              />

            </div>

            <div className="space-y-2">

              <div className="flex justify-between text-xs font-mono">

                <span className="font-bold text-slate-700">
                  Grade & Composition Match
                </span>

                <strong className="text-cyan-600">
                  {gradeWeight}%
                </strong>

              </div>

              <input
                type="range"
                min="10"
                max="50"
                value={gradeWeight}
                onChange={e =>
                  setGradeWeight(
                    parseInt(
                      e.target.value
                    )
                  )
                }
                className="w-full accent-cyan-600"
              />

            </div>

            <div className="space-y-2">

              <div className="flex justify-between text-xs font-mono">

                <span className="font-bold text-slate-700">
                  Physical Dimension & Geometry
                </span>

                <strong className="text-amber-600">
                  {dimensionWeight}%
                </strong>

              </div>

              <input
                type="range"
                min="10"
                max="50"
                value={dimensionWeight}
                onChange={e =>
                  setDimensionWeight(
                    parseInt(
                      e.target.value
                    )
                  )
                }
                className="w-full accent-amber-600"
              />

            </div>

          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">

            <button
              type="button"
              onClick={
                handleSaveWeights
              }
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer"
            >

              <Save className="w-4 h-4 text-emerald-400" />

              Apply Dynamic Weights

            </button>

          </div>

        </div>
      )}

      {/* =====================================================
          GOVERNMENT + RBAC
      ===================================================== */}

      {activeTab === 'rbac' && (
        <div className="space-y-5">

          {/* =================================================
              SYSTEM OVERVIEW
          ================================================= */}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

            <div className="bg-white rounded-2xl border border-slate-200 p-4">

              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                <Users className="w-4 h-4" />
                Total Accounts
              </div>

              <div className="text-2xl font-black text-slate-900 mt-2">
                {totalUsers}
              </div>

            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 p-4">

              <div className="flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                <UserCheck className="w-4 h-4" />
                Active
              </div>

              <div className="text-2xl font-black text-slate-900 mt-2">
                {activeUsers}
              </div>

            </div>

            <div className="bg-white rounded-2xl border border-amber-200 p-4">

              <div className="flex items-center gap-2 text-amber-600 text-[10px] font-black uppercase tracking-wider">
                <Activity className="w-4 h-4" />
                Pending
              </div>

              <div className="text-2xl font-black text-slate-900 mt-2">
                {pendingUsers}
              </div>

            </div>

            <div className="bg-white rounded-2xl border border-indigo-200 p-4">

              <div className="flex items-center gap-2 text-indigo-600 text-[10px] font-black uppercase tracking-wider">
                <Landmark className="w-4 h-4" />
                Government
              </div>

              <div className="text-2xl font-black text-slate-900 mt-2">
                {governmentUsers}
              </div>

            </div>

            <div className="bg-white rounded-2xl border border-blue-200 p-4">

              <div className="flex items-center gap-2 text-blue-600 text-[10px] font-black uppercase tracking-wider">
                <Building2 className="w-4 h-4" />
                Company
              </div>

              <div className="text-2xl font-black text-slate-900 mt-2">
                {companyUsers}
              </div>

            </div>

          </div>

          {/* =================================================
              GOVERNMENT ADMINISTRATION
          ================================================= */}

          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-[#172554] to-slate-950 overflow-hidden shadow-sm">

            <div className="p-5 border-b border-white/10">

              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                <div>

                  <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-indigo-200">

                    <Landmark className="w-3.5 h-3.5" />

                    Government Administration

                  </div>

                  <h2 className="text-xl font-black text-white mt-2">
                    Government Officer Access
                  </h2>

                  <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                    Dedicated control center for Government
                    accounts, CPSE administrators and
                    authorized government officers.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    loadUsers()
                  }
                  disabled={
                    refreshingUsers
                  }
                  className="self-start inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
                >

                  {refreshingUsers ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}

                  Refresh Government Registry

                </button>

              </div>

            </div>

            {/* GOVERNMENT METRICS */}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">

              <div className="bg-white/5 p-5">

                <div className="text-[9px] font-black uppercase tracking-wider text-indigo-300">
                  Registered Government
                </div>

                <div className="mt-1 text-3xl font-black text-white font-mono">
                  {governmentUsers}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  @gov.in government profiles
                </div>

              </div>

              <div className="bg-white/5 p-5">

                <div className="text-[9px] font-black uppercase tracking-wider text-amber-300">
                  Awaiting Approval
                </div>

                <div className="mt-1 text-3xl font-black text-white font-mono">
                  {pendingGovernmentUsers.length}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  Require administrator action
                </div>

              </div>

              <div className="bg-white/5 p-5">

                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-300">
                  Active Officers
                </div>

                <div className="mt-1 text-3xl font-black text-white font-mono">
                  {activeGovernmentUsers.length}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  Authorized portal access
                </div>

              </div>

              <div className="bg-white/5 p-5">

                <div className="text-[9px] font-black uppercase tracking-wider text-cyan-300">
                  Administrators
                </div>

                <div className="mt-1 text-3xl font-black text-white font-mono">
                  {governmentAdministrators.length}
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  National / CPSE admin roles
                </div>

              </div>

            </div>

            {/* PENDING GOVERNMENT */}

            <div className="p-5">

              <div className="flex items-center justify-between mb-4">

                <div>

                  <h3 className="text-sm font-black text-white">
                    Pending Government Registrations
                  </h3>

                  <p className="text-[10px] text-slate-400 mt-1">
                    These accounts remain inactive until
                    explicitly approved.
                  </p>

                </div>

                <span className="px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-300/20 text-[9px] font-black text-amber-300">
                  {pendingGovernmentUsers.length} PENDING
                </span>

              </div>

              {pendingGovernmentUsers.length === 0 ? (

                <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center">

                  <MailCheck className="w-8 h-8 mx-auto text-emerald-400" />

                  <div className="mt-2 text-sm font-bold text-white">
                    No pending government registrations
                  </div>

                  <div className="mt-1 text-[10px] text-slate-400">
                    All currently registered Government
                    accounts have been reviewed.
                  </div>

                </div>

              ) : (

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                  {pendingGovernmentUsers.map(
                    user => (
                      <div
                        key={
                          user.user_id
                        }
                        className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div className="flex items-start gap-3 min-w-0">

                            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center shrink-0">

                              <Landmark className="w-5 h-5 text-indigo-300" />

                            </div>

                            <div className="min-w-0">

                              <div className="font-bold text-white text-sm">
                                {user.full_name ||
                                  'Unnamed Government User'}
                              </div>

                              <div className="font-mono text-[10px] text-slate-400 mt-1 break-all">
                                {user.email ||
                                  'No email'}
                              </div>

                            </div>

                          </div>

                          <span className="shrink-0 px-2 py-1 rounded-lg bg-amber-400/10 border border-amber-300/20 text-[8px] font-black text-amber-300">
                            PENDING
                          </span>

                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">

                          <div className="rounded-lg bg-black/20 p-3">

                            <div className="text-[8px] uppercase tracking-wider text-slate-500">
                              Requested Role
                            </div>

                            <div className="mt-1 text-[10px] font-bold text-slate-200">
                              {user.role ||
                                'Pending User'}
                            </div>

                          </div>

                          <div className="rounded-lg bg-black/20 p-3">

                            <div className="text-[8px] uppercase tracking-wider text-slate-500">
                              Organization
                            </div>

                            <div className="mt-1 text-[10px] font-bold text-slate-200">
                              {user.company_name ||
                                'Government'}
                            </div>

                          </div>

                        </div>

                        <div className="flex gap-2 mt-4">

                          <button
                            type="button"
                            onClick={() =>
                              quickGovernmentEdit(
                                user
                              )
                            }
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-black text-slate-950 hover:bg-emerald-400"
                          >

                            <UserCheck className="w-3.5 h-3.5" />

                            Review / Approve

                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              quickGovernmentEdit(
                                user
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/10"
                          >

                            <UserCog className="w-3.5 h-3.5" />

                            Manage

                          </button>

                        </div>

                      </div>
                    )
                  )}

                </div>

              )}

            </div>

          </div>

          {/* =================================================
              GOVERNMENT ROLE GUIDE
          ================================================= */}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

            <div className="p-4 bg-white rounded-xl border border-indigo-200">

              <div className="flex items-center gap-2 font-bold text-indigo-900 text-sm">

                <KeyRound className="w-4 h-4 text-indigo-600" />

                National Administrator

              </div>

              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Full national governance, account
                administration, material master and platform
                configuration access.
              </p>

            </div>

            <div className="p-4 bg-white rounded-xl border border-blue-200">

              <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">

                <Building2 className="w-4 h-4 text-blue-600" />

                CPSE Administrator

              </div>

              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Company-specific administration for authorized
                CPSE organizations such as IOCL or ONGC.
              </p>

            </div>

            <div className="p-4 bg-white rounded-xl border border-emerald-200">

              <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">

                <ShieldCheck className="w-4 h-4 text-emerald-600" />

                Officer Roles

              </div>

              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Material Master, Procurement, Audit and
                Executive Management access is assigned by the
                administrator.
              </p>

            </div>

            <div className="p-4 bg-white rounded-xl border border-rose-200">

              <div className="flex items-center gap-2 font-bold text-rose-900 text-sm">

                <Ban className="w-4 h-4 text-rose-600" />

                Inactive Accounts

              </div>

              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Pending or deactivated Government accounts
                cannot be treated as authorized portal users.
              </p>

            </div>

          </div>

          {/* =================================================
              ALL USER MANAGEMENT
          ================================================= */}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">

            <div className="p-5 border-b border-slate-200">

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

                <div>

                  <h2 className="text-base font-bold text-slate-900">
                    Complete Account Registry
                  </h2>

                  <p className="text-xs text-slate-500 mt-1">
                    Manage Government and Company accounts,
                    role assignments and activation.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={
                    loadUsers
                  }
                  disabled={
                    refreshingUsers
                  }
                  className="self-start lg:self-auto px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 disabled:opacity-50"
                >

                  {refreshingUsers ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}

                  Refresh

                </button>

              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">

                <div className="relative">

                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                  <input
                    type="text"
                    value={
                      userSearch
                    }
                    onChange={e =>
                      setUserSearch(
                        e.target.value
                      )
                    }
                    placeholder="Search email, name, company or role..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 text-xs"
                  />

                </div>

                <select
                  value={
                    userTypeFilter
                  }
                  onChange={e =>
                    setUserTypeFilter(
                      e.target.value as
                        | 'ALL'
                        | 'GOVERNMENT'
                        | 'COMPANY'
                    )
                  }
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-none"
                >

                  <option value="ALL">
                    All account types
                  </option>

                  <option value="COMPANY">
                    Company / User
                  </option>

                  <option value="GOVERNMENT">
                    Government
                  </option>

                </select>

                <select
                  value={
                    statusFilter
                  }
                  onChange={e =>
                    setStatusFilter(
                      e.target.value as
                        | 'ALL'
                        | 'ACTIVE'
                        | 'INACTIVE'
                    )
                  }
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-none"
                >

                  <option value="ALL">
                    All statuses
                  </option>

                  <option value="ACTIVE">
                    Active only
                  </option>

                  <option value="INACTIVE">
                    Inactive / pending
                  </option>

                </select>

              </div>

            </div>

            {usersError && (
              <div className="m-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">

                <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />

                <div>

                  <div className="text-xs font-bold text-red-800">
                    Unable to load users
                  </div>

                  <div className="text-[11px] text-red-700 mt-1">
                    {usersError}
                  </div>

                </div>

              </div>
            )}

            {usersLoading ? (

              <div className="p-12 flex flex-col items-center justify-center">

                <Loader2 className="w-7 h-7 animate-spin text-blue-600" />

                <div className="text-xs font-bold text-slate-700 mt-3">
                  Loading user profiles...
                </div>

              </div>

            ) : filteredUsers.length === 0 ? (

              <div className="p-12 text-center">

                <Users className="w-9 h-9 text-slate-300 mx-auto" />

                <div className="text-sm font-bold text-slate-700 mt-3">
                  No users found
                </div>

                <div className="text-xs text-slate-400 mt-1">
                  {users.length === 0
                    ? 'No user profiles are currently configured.'
                    : 'Try changing the search or filters.'}
                </div>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[1050px] text-left">

                  <thead className="bg-slate-50 border-y border-slate-200">

                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">

                      <th className="px-5 py-3">
                        Account
                      </th>

                      <th className="px-5 py-3">
                        Type
                      </th>

                      <th className="px-5 py-3">
                        Organization
                      </th>

                      <th className="px-5 py-3">
                        Role
                      </th>

                      <th className="px-5 py-3">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {filteredUsers.map(
                      user => {

                        const editing =
                          editingUserId ===
                          user.user_id;

                        const saving =
                          savingUserId ===
                          user.user_id;

                        return (

                          <tr
                            key={
                              user.user_id
                            }
                            className="hover:bg-slate-50/70 align-top"
                          >

                            {/* ACCOUNT */}

                            <td className="px-5 py-4">

                              <div className="flex items-start gap-3">

                                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">

                                  {user.user_type ===
                                  'GOVERNMENT' ? (
                                    <Landmark className="w-4 h-4 text-indigo-600" />
                                  ) : (
                                    <Building2 className="w-4 h-4 text-blue-600" />
                                  )}

                                </div>

                                <div className="min-w-0">

                                  <div className="text-xs font-bold text-slate-900 truncate max-w-[250px]">
                                    {user.full_name ||
                                      'Unnamed User'}
                                  </div>

                                  <div className="text-[10px] font-mono text-slate-500 mt-1 truncate max-w-[250px]">
                                    {user.email ||
                                      'No email'}
                                  </div>

                                </div>

                              </div>

                            </td>

                            {/* TYPE */}

                            <td className="px-5 py-4">

                              {editing ? (

                                <select
                                  value={
                                    editingUserType
                                  }
                                  onChange={e =>
                                    setEditingUserType(
                                      e.target.value as
                                        | 'GOVERNMENT'
                                        | 'COMPANY'
                                    )
                                  }
                                  className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold focus:outline-none"
                                >

                                  {USER_TYPES.map(
                                    type => (

                                      <option
                                        key={
                                          type
                                        }
                                        value={
                                          type
                                        }
                                      >
                                        {type ===
                                        'GOVERNMENT'
                                          ? 'Government'
                                          : 'Company / User'}
                                      </option>

                                    )
                                  )}

                                </select>

                              ) : (

                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black ${
                                    user.user_type ===
                                    'GOVERNMENT'
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                      : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                >

                                  {user.user_type ===
                                  'GOVERNMENT' ? (
                                    <Landmark className="w-3 h-3" />
                                  ) : (
                                    <Building2 className="w-3 h-3" />
                                  )}

                                  {user.user_type ===
                                  'GOVERNMENT'
                                    ? 'GOVERNMENT'
                                    : 'COMPANY / USER'}

                                </span>

                              )}

                            </td>

                            {/* ORGANIZATION */}

                            <td className="px-5 py-4">

                              {editing ? (

                                <input
                                  type="text"
                                  value={
                                    editingCompany
                                  }
                                  onChange={e =>
                                    setEditingCompany(
                                      e.target.value
                                    )
                                  }
                                  placeholder="Company / CPSE name"
                                  className="w-[190px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:border-blue-500"
                                />

                              ) : (

                                <div className="text-xs font-semibold text-slate-700">

                                  {user.company_name ||
                                    (
                                      user.user_type ===
                                      'GOVERNMENT'
                                        ? 'Government'
                                        : 'Not assigned'
                                    )}

                                </div>

                              )}

                            </td>

                            {/* ROLE */}

                            <td className="px-5 py-4">

                              {editing ? (

                                <select
                                  value={
                                    editingRole
                                  }
                                  onChange={e =>
                                    setEditingRole(
                                      e.target.value
                                    )
                                  }
                                  className="w-[250px] px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold focus:outline-none"
                                >

                                  {AVAILABLE_ROLES.map(
                                    role => (

                                      <option
                                        key={
                                          role
                                        }
                                        value={
                                          role
                                        }
                                      >
                                        {role}
                                      </option>

                                    )
                                  )}

                                </select>

                              ) : (

                                <div className="text-xs font-bold text-slate-800">
                                  {user.role}
                                </div>

                              )}

                            </td>

                            {/* STATUS */}

                            <td className="px-5 py-4">

                              {editing ? (

                                <label className="flex items-center gap-2 cursor-pointer">

                                  <input
                                    type="checkbox"
                                    checked={
                                      editingActive
                                    }
                                    onChange={e =>
                                      setEditingActive(
                                        e.target.checked
                                      )
                                    }
                                    className="w-4 h-4 accent-emerald-600"
                                  />

                                  <span className="text-xs font-bold text-slate-700">
                                    Active
                                  </span>

                                </label>

                              ) : (

                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black ${
                                    user.is_active
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >

                                  {user.is_active ? (
                                    <UserCheck className="w-3 h-3" />
                                  ) : (
                                    <UserX className="w-3 h-3" />
                                  )}

                                  {user.is_active
                                    ? 'ACTIVE'
                                    : 'PENDING / INACTIVE'}

                                </span>

                              )}

                            </td>

                            {/* ACTION */}

                            <td className="px-5 py-4 text-right">

                              {editing ? (

                                <div className="flex items-center justify-end gap-2">

                                  <button
                                    type="button"
                                    onClick={() =>
                                      cancelEditingUser()
                                    }
                                    disabled={
                                      saving
                                    }
                                    className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600"
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      saveUser(
                                        user.user_id
                                      )
                                    }
                                    disabled={
                                      saving
                                    }
                                    className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                                  >

                                    {saving ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Save className="w-3.5 h-3.5" />
                                    )}

                                    Save

                                  </button>

                                </div>

                              ) : (

                                <button
                                  type="button"
                                  onClick={() =>
                                    startEditingUser(
                                      user
                                    )
                                  }
                                  className="px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-xs font-bold text-slate-700"
                                >
                                  Manage
                                </button>

                              )}

                            </td>

                          </tr>

                        );
                      }
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </div>

        </div>
      )}

    </div>
  );
};