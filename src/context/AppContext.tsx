import React, {
  createContext,
  useContext,
  useState,
  useEffect
} from 'react';

import {
  TabType,
  UserRole,
  CPSE,
  CommonMaterial,
  MatchCandidate,
  ReviewItem,
  QualityIssue,
  ProcurementOpportunity,
  AuditEvent,
  StandardizationRule,
  DomainDictionaryItem,
  AIModelVersion,
  NotificationItem
} from '../types';

import {
  INITIAL_CPSES,
  INITIAL_CANDIDATES,
  INITIAL_REVIEWS,
  INITIAL_QUALITY_ISSUES,
  INITIAL_PROCUREMENT_OPPORTUNITIES,
  INITIAL_AUDIT_EVENTS,
  INITIAL_RULES,
  INITIAL_DICTIONARY,
  INITIAL_AI_MODELS,
  INITIAL_NOTIFICATIONS
} from '../data/mockData';

import { supabase } from '../../lib/supabase';

/* =========================================================
   DATABASE MATERIAL
========================================================= */

export interface DatabaseMaterial {
  id: number;
  company: string;
  material_number: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
}

/* =========================================================
   TOAST
========================================================= */

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

/* =========================================================
   RBAC PERMISSION TYPES
========================================================= */

export type Permission =
  | 'APPROVE_MATERIAL'
  | 'REJECT_MATERIAL'
  | 'MIGRATE_MATERIAL'
  | 'AUDIT'
  | 'MANAGE_CPSE'
  | 'PROCUREMENT'
  | 'ADMIN';

/* =========================================================
   APP CONTEXT TYPE
========================================================= */

interface AppContextType {
  currentTab: TabType;
  setCurrentTab: (tab: TabType) => void;

  currentUserRole: UserRole;
  setCurrentUserRole: (role: UserRole) => void;

  hasPermission: (
    permission: Permission
  ) => boolean;

  language: 'EN' | 'HI';
  setLanguage: (lang: 'EN' | 'HI') => void;

  /* Data entities */
  cpses: CPSE[];
  commonMaterials: CommonMaterial[];
  materials: DatabaseMaterial[];
  filteredMaterials: DatabaseMaterial[];
  materialsLoading: boolean;

  /* Company filter */
  companyOptions: string[];
  selectedCompany: string;
  setSelectedCompany: (company: string) => void;

  candidates: MatchCandidate[];
  reviews: ReviewItem[];
  qualityIssues: QualityIssue[];
  procurementOpportunities: ProcurementOpportunity[];
  auditEvents: AuditEvent[];
  rules: StandardizationRule[];
  dictionary: DomainDictionaryItem[];
  models: AIModelVersion[];
  notifications: NotificationItem[];
  toasts: ToastMessage[];

  /* Navigation & selection */
  selectedMaterialId: string | null;
  setSelectedMaterialId: (id: string | null) => void;

  selectedCandidateId: string | null;
  setSelectedCandidateId: (id: string | null) => void;

  selectedCPSEId: string | null;
  setSelectedCPSEId: (id: string | null) => void;

  selectedOpportunityId: string | null;
  setSelectedOpportunityId: (id: string | null) => void;

  selectedIssueId: string | null;
  setSelectedIssueId: (id: string | null) => void;

  /* Drawers & Modals */
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;

  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;

  isAIAssistantOpen: boolean;
  setIsAIAssistantOpen: (open: boolean) => void;

  isSIHDemoOpen: boolean;
  setIsSIHDemoOpen: (open: boolean) => void;

  demoStep: number;
  setDemoStep: (step: number) => void;

  /* Actions */
  approveMatch: (
    candidateId: string,
    note?: string
  ) => void;

  rejectMatch: (
    candidateId: string,
    reason?: string
  ) => void;

  requestMoreData: (
    candidateId: string,
    note?: string
  ) => void;

  deferMatch: (
    candidateId: string
  ) => void;

  createCommonMaterial: (
    material: Partial<CommonMaterial>
  ) => void;

  executeCleanupRule: (
    issueId: string
  ) => void;

  addToast: (
    toast: Omit<ToastMessage, 'id'>
  ) => void;

  removeToast: (
    id: string
  ) => void;

  markNotificationAsRead: (
    id: string
  ) => void;

  startSIHDemo: () => void;

  openMaterial360: (
    bmgId: string
  ) => void;

  openCandidateMatch: (
    candidateId: string
  ) => void;
}

/* =========================================================
   CONTEXT
========================================================= */

const AppContext =
  createContext<AppContextType | undefined>(
    undefined
  );

/* =========================================================
   PROVIDER
========================================================= */

export const AppProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {

  /* =======================================================
     BASIC APP STATE
  ======================================================= */

  const [currentTab, setCurrentTab] =
    useState<TabType>('home');

  const [currentUserRole, setCurrentUserRole] =
    useState<UserRole>(
      'National Administrator'
    );

  const [language, setLanguage] =
    useState<'EN' | 'HI'>('EN');

  /* =======================================================
     DATA COLLECTIONS
  ======================================================= */

  const [cpses, setCpses] =
    useState<CPSE[]>(
      INITIAL_CPSES
    );

  /*
    commonMaterials is kept empty because the material catalog
    now comes directly from the real Supabase materials table.
  */
  const [commonMaterials, setCommonMaterials] =
    useState<CommonMaterial[]>(
      []
    );

  /* =======================================================
     REAL DATABASE MATERIALS
  ======================================================= */

  const [materials, setMaterials] =
    useState<DatabaseMaterial[]>(
      []
    );

  const [materialsLoading, setMaterialsLoading] =
    useState(true);

  /* =======================================================
     COMPANY FILTER
  ======================================================= */

  const [selectedCompany, setSelectedCompany] =
    useState<string>(
      'ALL COMPANIES'
    );

  /* =======================================================
     COMPANY OPTIONS
  ======================================================= */

  const companyOptions =
    React.useMemo(() => {

      const companySet =
        new Set<string>();

      /*
        Preserve existing CPSE/company options.
      */
      INITIAL_CPSES.forEach(
        cpse => {

          const code =
            cpse.code
              ?.trim()
              .toUpperCase();

          if (code) {
            companySet.add(
              code
            );
          }
        }
      );

      /*
        Add every company actually found
        in the Supabase materials table.
      */
      materials.forEach(
        material => {

          const company =
            material.company
              ?.trim()
              .toUpperCase();

          if (company) {
            companySet.add(
              company
            );
          }
        }
      );

      /*
        Universal option always comes first.
      */
      return [
        'ALL COMPANIES',
        ...Array.from(
          companySet
        ).sort()
      ];

    }, [materials]);

  /* =======================================================
     FILTERED MATERIALS
  ======================================================= */

  const filteredMaterials =
    React.useMemo(() => {

      if (
        selectedCompany ===
        'ALL COMPANIES'
      ) {
        return materials;
      }

      const normalizedSelectedCompany =
        selectedCompany
          .trim()
          .toUpperCase();

      return materials.filter(
        material => {

          const company =
            material.company
              ?.trim()
              .toUpperCase();

          return (
            company ===
            normalizedSelectedCompany
          );
        }
      );

    }, [
      materials,
      selectedCompany
    ]);

  /* =======================================================
     EXISTING NON-MATERIAL COLLECTIONS
  ======================================================= */

  const [candidates, setCandidates] =
    useState<MatchCandidate[]>(
      INITIAL_CANDIDATES
    );

  const [reviews, setReviews] =
    useState<ReviewItem[]>(
      INITIAL_REVIEWS
    );

  const [qualityIssues, setQualityIssues] =
    useState<QualityIssue[]>(
      INITIAL_QUALITY_ISSUES
    );

  const [procurementOpportunities, setProcurementOpportunities] =
    useState<ProcurementOpportunity[]>(
      INITIAL_PROCUREMENT_OPPORTUNITIES
    );

  const [auditEvents, setAuditEvents] =
    useState<AuditEvent[]>(
      INITIAL_AUDIT_EVENTS
    );

  const [rules, setRules] =
    useState<StandardizationRule[]>(
      INITIAL_RULES
    );

  const [dictionary, setDictionary] =
    useState<DomainDictionaryItem[]>(
      INITIAL_DICTIONARY
    );

  const [models, setModels] =
    useState<AIModelVersion[]>(
      INITIAL_AI_MODELS
    );

  const [notifications, setNotifications] =
    useState<NotificationItem[]>(
      INITIAL_NOTIFICATIONS
    );

  const [toasts, setToasts] =
    useState<ToastMessage[]>(
      []
    );

  /* =======================================================
     SELECTION STATES
  ======================================================= */

  const [selectedMaterialId, setSelectedMaterialId] =
    useState<string | null>(
      null
    );

  const [selectedCandidateId, setSelectedCandidateId] =
    useState<string | null>(
      'CAND-8492'
    );

  const [selectedCPSEId, setSelectedCPSEId] =
    useState<string | null>(
      null
    );

  const [selectedOpportunityId, setSelectedOpportunityId] =
    useState<string | null>(
      'OPP-1042'
    );

  const [selectedIssueId, setSelectedIssueId] =
    useState<string | null>(
      null
    );

  /* =======================================================
     MODALS / OVERLAYS
  ======================================================= */

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] =
    useState<boolean>(
      false
    );

  const [isNotificationsOpen, setIsNotificationsOpen] =
    useState<boolean>(
      false
    );

  const [isAIAssistantOpen, setIsAIAssistantOpen] =
    useState<boolean>(
      false
    );

  const [isSIHDemoOpen, setIsSIHDemoOpen] =
    useState<boolean>(
      false
    );

  const [demoStep, setDemoStep] =
    useState<number>(
      0
    );

  /* =======================================================
     RBAC PERMISSIONS
  ======================================================= */

  const canApproveMaterials =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole ===
      'Material Master Officer';

  const canRejectMaterials =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole ===
      'Material Master Officer';

  const canPerformMigration =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole ===
      'Material Master Officer';

  const canAudit =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole ===
      'Auditor';

  const canManageCPSE =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole.startsWith(
      'CPSE Administrator'
    );

  const canProcure =
    currentUserRole ===
      'National Administrator' ||
    currentUserRole ===
      'Procurement Officer';

  const canAdminister =
    currentUserRole ===
      'National Administrator';

  const hasPermission = (
    permission: Permission
  ) => {

    switch (
      permission
    ) {
      case 'APPROVE_MATERIAL':
        return canApproveMaterials;

      case 'REJECT_MATERIAL':
        return canRejectMaterials;

      case 'MIGRATE_MATERIAL':
        return canPerformMigration;

      case 'AUDIT':
        return canAudit;

      case 'MANAGE_CPSE':
        return canManageCPSE;

      case 'PROCUREMENT':
        return canProcure;

      case 'ADMIN':
        return canAdminister;

      default:
        return false;
    }
  };

  /* =======================================================
     CTRL + K COMMAND PALETTE
  ======================================================= */

  useEffect(() => {

    const handleKeyDown = (
      e: KeyboardEvent
    ) => {

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k'
      ) {

        e.preventDefault();

        setIsCommandPaletteOpen(
          prev => !prev
        );
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };

  }, []);

  /* =======================================================
     LOAD ALL REAL MATERIAL DATA FROM SUPABASE
  ======================================================= */

  useEffect(() => {

    const loadMaterials =
      async () => {

        setMaterialsLoading(
          true
        );

        try {

          const pageSize =
            1000;

          let from = 0;

          const allMaterials:
            DatabaseMaterial[] =
              [];

          while (true) {

            const to =
              from +
              pageSize -
              1;

            const {
              data,
              error
            } =
              await supabase
                .from('materials')
                .select(
                  'id, company, material_number, description, specifications, category'
                )
                .order(
                  'id',
                  {
                    ascending: true
                  }
                )
                .range(
                  from,
                  to
                );

            if (error) {

              console.error(
                'Failed to load materials:',
                error
              );

              setMaterials(
                []
              );

              break;
            }

            const currentPage =
              (data || []) as DatabaseMaterial[];

            allMaterials.push(
              ...currentPage
            );

            console.log(
              `Loaded page starting at ${from}: ${currentPage.length} records`
            );

            if (
              currentPage.length <
              pageSize
            ) {
              break;
            }

            from +=
              pageSize;
          }

          setMaterials(
            allMaterials
          );

          console.log(
            `Total materials loaded from Supabase: ${allMaterials.length}`
          );

          const companyCounts:
            Record<
              string,
              number
            > = {};

          allMaterials.forEach(
            material => {

              const company =
                material.company
                  ?.trim()
                  .toUpperCase();

              if (!company) {
                return;
              }

              companyCounts[
                company
              ] =
                (
                  companyCounts[
                    company
                  ] || 0
                ) + 1;
            }
          );

          console.log(
            'Company material counts:',
            companyCounts
          );

        } catch (error) {

          console.error(
            'Unexpected error while loading materials:',
            error
          );

          setMaterials(
            []
          );

        } finally {

          setMaterialsLoading(
            false
          );
        }
      };

    loadMaterials();

  }, []);

  /* =======================================================
     KEEP SELECTED COMPANY VALID
  ======================================================= */

  useEffect(() => {

    if (
      !companyOptions.includes(
        selectedCompany
      )
    ) {

      setSelectedCompany(
        'ALL COMPANIES'
      );
    }

  }, [
    companyOptions,
    selectedCompany
  ]);

  /* =======================================================
     UPDATE CPSE MATERIAL COUNTS FROM REAL DATABASE
  ======================================================= */

  useEffect(() => {

    if (
      materialsLoading
    ) {
      return;
    }

    const companyCounts:
      Record<
        string,
        number
      > = {};

    materials.forEach(
      material => {

        const company =
          material.company
            ?.trim()
            .toUpperCase();

        if (!company) {
          return;
        }

        companyCounts[
          company
        ] =
          (
            companyCounts[
              company
            ] || 0
          ) + 1;
      }
    );

    setCpses(
      prevCpses =>
        prevCpses.map(
          cpse => {

            const code =
              cpse.code
                ?.trim()
                .toUpperCase();

            const actualMaterialCount =
              companyCounts[
                code
              ] || 0;

            return {
              ...cpse,

              recordsUploaded:
                actualMaterialCount,

              recordsNormalized:
                0,

              recordsMatched:
                0,

              reviewBacklog:
                0,

              qualityScore:
                0,

              completenessRate:
                0,

              lastUpload:
                actualMaterialCount >
                0
                  ? 'Material database connected'
                  : 'No material data available'
            };
          }
        )
    );

  }, [
    materials,
    materialsLoading
  ]);

  /* =======================================================
     TOAST FUNCTIONS
  ======================================================= */

  const addToast = (
    toast: Omit<
      ToastMessage,
      'id'
    >
  ) => {

    const id =
      'toast-' +
      Math.random()
        .toString(36)
        .substring(2, 9);

    const newToast:
      ToastMessage = {
        ...toast,
        id
      };

    setToasts(
      prev => [
        ...prev,
        newToast
      ]
    );

    setTimeout(
      () => {
        removeToast(
          id
        );
      },
      4500
    );
  };

  const removeToast = (
    id: string
  ) => {

    setToasts(
      prev =>
        prev.filter(
          toast =>
            toast.id !==
            id
        )
    );
  };

  /* =======================================================
     NOTIFICATIONS
  ======================================================= */

  const markNotificationAsRead = (
    id: string
  ) => {

    setNotifications(
      prev =>
        prev.map(
          notification =>
            notification.id ===
            id
              ? {
                  ...notification,
                  read: true
                }
              : notification
        )
    );
  };

  /* =======================================================
     MATERIAL 360 NAVIGATION
  ======================================================= */

  const openMaterial360 = (
    bmgId: string
  ) => {

    setSelectedMaterialId(
      bmgId
    );

    setCurrentTab(
      'material-360'
    );
  };

  /* =======================================================
     AI MATCH NAVIGATION
  ======================================================= */

  const openCandidateMatch = (
    candidateId: string
  ) => {

    setSelectedCandidateId(
      candidateId
    );

    setCurrentTab(
      'ai-match'
    );
  };

  /* =======================================================
     APPROVE MATCH
  ======================================================= */

  const approveMatch = (
    candidateId: string,
    note?: string
  ) => {

    if (
      !hasPermission(
        'APPROVE_MATERIAL'
      )
    ) {

      addToast({
        title:
          'Permission Denied',

        message:
          'Your current role is not authorized to approve material mappings.',

        type:
          'error'
      });

      return;
    }

    const candidate =
      candidates.find(
        c =>
          c.id ===
          candidateId
      );

    if (!candidate) {
      return;
    }

    setCandidates(
      prev =>
        prev.map(
          candidateItem =>
            candidateItem.id ===
            candidateId
              ? {
                  ...candidateItem,
                  status:
                    'Approved'
                }
              : candidateItem
        )
    );

    setReviews(
      prev =>
        prev.map(
          review =>
            review.candidateId ===
            candidateId
              ? {
                  ...review,

                  status:
                    'Approved',

                  actionNote:
                    note ||
                    'Approved by Officer. Common Material Identity mapped.',

                  actionTakenBy:
                    currentUserRole,

                  actionTakenAt:
                    new Date().toLocaleString(
                      'en-IN',
                      {
                        timeZone:
                          'Asia/Kolkata'
                      }
                    ) +
                    ' IST'
                }
              : review
        )
    );

    const targetBmgId =
      candidate.targetBmgId ||
      'UNASSIGNED';

    const newAudit:
      AuditEvent = {

        id:
          'AUD-' +
          Math.floor(
            1000 +
            Math.random() *
              9000
          ),

        timestamp:
          new Date().toLocaleString(
            'en-IN',
            {
              timeZone:
                'Asia/Kolkata'
            }
          ) +
          ' IST',

        user:
          currentUserRole,

        userRole:
          currentUserRole,

        cpse:
          `${candidate.recordA.cpseCode} / ${candidate.recordB.cpseCode}`,

        action:
          'Material mapping approved',

        materialId:
          targetBmgId,

        previousValue:
          `Candidate Pair #${candidate.pairNumber} (Pending Review)`,

        newValue:
          `Approved Standard Mapping to ${targetBmgId}`,

        reason:
          note ||
          `Verified engineering equivalence with ${candidate.scores.overallConfidence}% confidence score.`,

        modelVersion:
          candidate.modelVersion,

        verificationHash:
          'NOT_AVAILABLE'
      };

    setAuditEvents(
      prev => [
        newAudit,
        ...prev
      ]
    );

    addToast({

      title:
        'Candidate Match Approved',

      message:
        `Standardized ${candidate.recordA.localCode} & ${candidate.recordB.localCode}.`,

      type:
        'success'
    });
  };

  /* =======================================================
     REJECT MATCH
  ======================================================= */

  const rejectMatch = (
    candidateId: string,
    reason?: string
  ) => {

    if (
      !hasPermission(
        'REJECT_MATERIAL'
      )
    ) {

      addToast({
        title:
          'Permission Denied',

        message:
          'Your current role is not authorized to reject material mappings.',

        type:
          'error'
      });

      return;
    }

    const candidate =
      candidates.find(
        c =>
          c.id ===
          candidateId
      );

    if (!candidate) {
      return;
    }

    setCandidates(
      prev =>
        prev.map(
          candidateItem =>
            candidateItem.id ===
            candidateId
              ? {
                  ...candidateItem,
                  status:
                    'Rejected'
                }
              : candidateItem
        )
    );

    setReviews(
      prev =>
        prev.map(
          review =>
            review.candidateId ===
            candidateId
              ? {
                  ...review,

                  status:
                    'Rejected',

                  actionNote:
                    reason ||
                    'Rejected due to engineering specification divergence.',

                  actionTakenBy:
                    currentUserRole,

                  actionTakenAt:
                    new Date().toLocaleString(
                      'en-IN',
                      {
                        timeZone:
                          'Asia/Kolkata'
                      }
                    ) +
                    ' IST'
                }
              : review
        )
    );

    const newAudit:
      AuditEvent = {

        id:
          'AUD-' +
          Math.floor(
            1000 +
            Math.random() *
              9000
          ),

        timestamp:
          new Date().toLocaleString(
            'en-IN',
            {
              timeZone:
                'Asia/Kolkata'
            }
          ) +
          ' IST',

        user:
          currentUserRole,

        userRole:
          currentUserRole,

        cpse:
          `${candidate.recordA.cpseCode} / ${candidate.recordB.cpseCode}`,

        action:
          'Match rejected',

        materialId:
          candidate.id,

        previousValue:
          `Candidate Pair #${candidate.pairNumber}`,

        newValue:
          'Rejected - Preserved Discrete Inventory Identities',

        reason:
          reason ||
          candidate.criticalMismatchReason ||
          'Specification mismatch detected by human officer.',

        modelVersion:
          candidate.modelVersion,

        verificationHash:
          'NOT_AVAILABLE'
      };

    setAuditEvents(
      prev => [
        newAudit,
        ...prev
      ]
    );

    addToast({

      title:
        'Match Candidate Rejected',

      message:
        `Preserved separate identities for ${candidate.recordA.localCode} & ${candidate.recordB.localCode}.`,

      type:
        'warning'
    });
  };

  /* =======================================================
     REQUEST MORE DATA
  ======================================================= */

  const requestMoreData = (
    candidateId: string,
    note?: string
  ) => {

    setCandidates(
      prev =>
        prev.map(
          candidate =>
            candidate.id ===
            candidateId
              ? {
                  ...candidate,
                  status:
                    'Needs More Data'
                }
              : candidate
        )
    );

    setReviews(
      prev =>
        prev.map(
          review =>
            review.candidateId ===
            candidateId
              ? {
                  ...review,

                  status:
                    'Needs More Data',

                  actionNote:
                    note ||
                    'Additional engineering data requested.',

                  actionTakenBy:
                    currentUserRole,

                  actionTakenAt:
                    new Date().toLocaleString(
                      'en-IN',
                      {
                        timeZone:
                          'Asia/Kolkata'
                      }
                    ) +
                    ' IST'
                }
              : review
        )
    );

    addToast({

      title:
        'Clarification Requested',

      message:
        'Additional engineering data requested.',

      type:
        'info'
    });
  };

  /* =======================================================
     DEFER MATCH
  ======================================================= */

  const deferMatch = (
    candidateId: string
  ) => {

    setCandidates(
      prev =>
        prev.map(
          candidate =>
            candidate.id ===
            candidateId
              ? {
                  ...candidate,
                  status:
                    'Deferred'
                }
              : candidate
        )
    );

    setReviews(
      prev =>
        prev.map(
          review =>
            review.candidateId ===
            candidateId
              ? {
                  ...review,
                  status:
                    'Deferred'
                }
              : review
        )
    );

    addToast({

      title:
        'Review Deferred',

      message:
        'Item moved to deferred review.',

      type:
        'info'
    });
  };

  /* =======================================================
     CREATE COMMON MATERIAL
  ======================================================= */

  const createCommonMaterial = (
    material: Partial<CommonMaterial>
  ) => {

    const newId =
      `LOCAL-${Date.now()}`;

    const newMaterial:
      CommonMaterial = {

      id:
        newId,

      bmgCode:
        newId,

      standardName:
        material.standardName ||
        'Unassigned Material',

      category:
        material.category ||
        'Uncategorized',

      specifications:
        material.specifications ||
        {
          material:
            'Not Available',

          grade:
            'Not Available',

          uom:
            'Not Available'
        },

      mappings:
        material.mappings ||
        [],

      status:
        'Approved',

      version:
        'Local',

      lastUpdated:
        new Date().toLocaleString(
          'en-IN',
          {
            timeZone:
              'Asia/Kolkata'
          }
        ) +
        ' IST',

      approvedBy:
        currentUserRole,

      approvedAt:
        new Date()
          .toISOString()
          .split('T')[0],

      totalAnnualDemand:
        material.totalAnnualDemand ||
        0,

      avgUnitPrice:
        material.avgUnitPrice ||
        0,

      potentialSavingsPercent:
        material.potentialSavingsPercent ||
        0,

      activeSuppliersCount:
        material.activeSuppliersCount ||
        0,

      authorizedInventory:
        material.authorizedInventory ||
        0,

      description:
        material.description ||
        'No description available.'
    };

    setCommonMaterials(
      prev => [
        newMaterial,
        ...prev
      ]
    );

    addToast({

      title:
        'Material Created',

      message:
        `${newMaterial.standardName} created locally.`,

      type:
        'success'
    });

    openMaterial360(
      newId
    );
  };

  /* =======================================================
     CLEANUP RULE
  ======================================================= */

  const executeCleanupRule = (
    issueId: string
  ) => {

    const issue =
      qualityIssues.find(
        q =>
          q.id ===
          issueId
      );

    if (!issue) {
      return;
    }

    setQualityIssues(
      prev =>
        prev.map(
          issueItem =>
            issueItem.id ===
            issueId
              ? {
                  ...issueItem,
                  status:
                    'Resolved'
                }
              : issueItem
        )
    );

    const newAudit:
      AuditEvent = {

      id:
        'AUD-' +
        Math.floor(
          1000 +
          Math.random() *
            9000
        ),

      timestamp:
        new Date().toLocaleString(
          'en-IN',
          {
            timeZone:
              'Asia/Kolkata'
          }
        ) +
        ' IST',

      user:
        currentUserRole,

      userRole:
        currentUserRole,

      cpse:
        issue.cpseCode,

      action:
        'Clean-up rule executed',

      materialId:
        issue.id,

      previousValue:
        `${issue.affectedRecordsCount} records flagged with ${issue.issueType}`,

      newValue:
        'Rule applied. Actual remediation count pending database integration.',

      reason:
        issue.suggestedFix,

      modelVersion:
        'Rule Engine',

      verificationHash:
        'NOT_AVAILABLE'
    };

    setAuditEvents(
      prev => [
        newAudit,
        ...prev
      ]
    );

    addToast({

      title:
        'Cleanup Executed',

      message:
        `Cleanup action recorded for ${issue.cpseCode}.`,

      type:
        'success'
    });
  };

  /* =======================================================
     SIH DEMO
  ======================================================= */

  const startSIHDemo = () => {

    setDemoStep(
      1
    );

    setIsSIHDemoOpen(
      true
    );
  };

  /* =======================================================
     PROVIDER
  ======================================================= */

  return (
    <AppContext.Provider
      value={{

        currentTab,
        setCurrentTab,

        currentUserRole,
        setCurrentUserRole,

        hasPermission,

        language,
        setLanguage,

        cpses,

        commonMaterials,

        materials,

        filteredMaterials,

        materialsLoading,

        companyOptions,

        selectedCompany,

        setSelectedCompany,

        candidates,

        reviews,

        qualityIssues,

        procurementOpportunities,

        auditEvents,

        rules,

        dictionary,

        models,

        notifications,

        toasts,

        selectedMaterialId,
        setSelectedMaterialId,

        selectedCandidateId,
        setSelectedCandidateId,

        selectedCPSEId,
        setSelectedCPSEId,

        selectedOpportunityId,
        setSelectedOpportunityId,

        selectedIssueId,
        setSelectedIssueId,

        isCommandPaletteOpen,
        setIsCommandPaletteOpen,

        isNotificationsOpen,
        setIsNotificationsOpen,

        isAIAssistantOpen,
        setIsAIAssistantOpen,

        isSIHDemoOpen,
        setIsSIHDemoOpen,

        demoStep,
        setDemoStep,

        approveMatch,

        rejectMatch,

        requestMoreData,

        deferMatch,

        createCommonMaterial,

        executeCleanupRule,

        addToast,

        removeToast,

        markNotificationAsRead,

        startSIHDemo,

        openMaterial360,

        openCandidateMatch

      }}
    >
      {children}
    </AppContext.Provider>
  );
};

/* =========================================================
   useApp
========================================================= */

export const useApp = () => {

  const context =
    useContext(
      AppContext
    );

  if (!context) {

    throw new Error(
      'useApp must be used within an AppProvider'
    );
  }

  return context;
};