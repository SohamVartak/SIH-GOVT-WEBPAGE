export type TabType =
  | 'home'
  | 'dashboard'
  | 'upload'
  | 'quality'
  | 'ai-match'
  | 'review-queue'
  | 'master'
  | 'material-360'
  | 'procurement'
  | 'what-if'
  | 'cpse'
  | 'migration'
  | 'audit'
  | 'admin'
  | 'login';

export type UserRole = 
  | 'National Administrator'
  | 'CPSE Administrator (IOCL)'
  | 'CPSE Administrator (ONGC)'
  | 'Material Master Officer'
  | 'Procurement Officer'
  | 'Auditor'
  | 'Executive Management';

export interface CPSE {
  id: string;
  code: string;
  name: string;
  shortName: string;
  sector: 'Oil & Gas' | 'Power' | 'Steel' | 'Mining' | 'Heavy Engineering' | 'Petrochemicals';
  recordsUploaded: number;
  recordsNormalized: number;
  recordsMatched: number;
  reviewBacklog: number;
  qualityScore: number;
  completenessRate: number;
  status: 'Active' | 'Onboarding' | 'Syncing' | 'Review Required';
  nodalOfficer: string;
  email: string;
  lastUpload: string;
  logoColor: string;
  imageUrl?: string;
  facilityLocation?: string;
}

export interface MaterialSpecification {
  material: string;
  grade: string;
  diameter?: string;
  length?: string;
  pressureRating?: string;
  uom: string;
  standard?: string;
  endConnection?: string;
  coating?: string;
  temperatureRange?: string;
}

export interface CPSEMapping {
  cpseCode: string;
  cpseName: string;
  localMaterialCode: string;
  localDescription: string;
  localUOM: string;
  localCategory: string;
  mappedAt: string;
  mappedBy: string;
  annualDemand: number;
  unitPrice: number;
  currency: string;
  leadTimeDays: number;
}

export interface CommonMaterial {
  id: string; // e.g. BMG-FST-000001284
  bmgCode: string;
  standardName: string;
  category: 'Fasteners' | 'Industrial Valves' | 'Pumps' | 'Bearings' | 'Electrical Cables' | 'Gaskets' | 'Pipes' | 'Safety Equipment' | 'Instrumentation' | 'Lubricants';
  specifications: MaterialSpecification;
  mappings: CPSEMapping[];
  status: 'Approved' | 'Draft' | 'Needs Review' | 'Deprecated';
  version: string;
  lastUpdated: string;
  approvedBy?: string;
  approvedAt?: string;
  totalAnnualDemand: number;
  avgUnitPrice: number;
  potentialSavingsPercent: number;
  activeSuppliersCount: number;
  authorizedInventory: number;
  description: string;
}

export interface MatchScoreVector {
  semanticSimilarity: number;
  materialMatch: number;
  gradeMatch: number;
  dimensionMatch: number;
  specificationMatch: number;
  categoryUomMatch: number;
  overallConfidence: number;
}

export interface MatchCandidate {
  id: string; // e.g. CAND-8492
  pairNumber: number;
  recordA: {
    cpseCode: string;
    cpseName: string;
    localCode: string;
    rawDescription: string;
    normalizedName: string;
    specifications: MaterialSpecification;
    uom: string;
  };
  recordB: {
    cpseCode: string;
    cpseName: string;
    localCode: string;
    rawDescription: string;
    normalizedName: string;
    specifications: MaterialSpecification;
    uom: string;
  };
  scores: MatchScoreVector;
  riskLevel: 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical Mismatch';
  aiRecommendation: 'STANDARDIZE' | 'DO NOT AUTO-MERGE' | 'NEEDS HUMAN REVIEW' | 'REJECT';
  aiExplanation: string;
  criticalMismatchReason?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Needs More Data' | 'Deferred';
  category: string;
  modelVersion: string;
  createdTimestamp: string;
  targetBmgId?: string;
}

export interface ReviewItem {
  id: string;
  candidateId: string;
  bmgProposedId?: string;
  candidate: MatchCandidate;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'High Priority' | 'Needs More Data' | 'Approved' | 'Rejected' | 'Deferred';
  assignedTo?: string;
  assignedRole: string;
  differenceAnalysis: string[];
  submittedAt: string;
  actionNote?: string;
  actionTakenBy?: string;
  actionTakenAt?: string;
}

export interface QualityIssue {
  id: string;
  issueType: 'Missing Grade' | 'Invalid UOM' | 'Unknown Category' | 'Missing Dimensions' | 'Duplicate Material Code' | 'Incomplete Specification' | 'Non-Standard Abbreviation';
  cpseCode: string;
  cpseName: string;
  affectedRecordsCount: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Ignored';
  field: string;
  sampleRecord: string;
  suggestedFix: string;
  lastDetected: string;
}

export interface ProcurementOpportunity {
  id: string; // e.g. OPP-1042
  opportunityNumber: number;
  title: string;
  category: string;
  bmgMaterialId: string;
  bmgMaterialName: string;
  participatingCPSEs: string[];
  totalAggregatedDemandUnits: number;
  uom: string;
  estimatedBaselineSpendINR: number;
  projectedSavingsINR: number;
  projectedSavingsPercent: number;
  consolidationPotential: 'HIGH' | 'MEDIUM' | 'VERY HIGH';
  activeSuppliersCount: number;
  contractCycle: 'Q3-Q4 Annual Framework' | 'Immediate Joint Tender' | 'Biannual Rate Contract';
  status: 'Active' | 'In Evaluation' | 'Tender Drafted' | 'Closed';
  highlights: string[];
  leadCPSE: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  userRole: string;
  cpse: string;
  action: 
    | 'Material mapping approved'
    | 'Match rejected'
    | 'Candidate routed to human review'
    | 'Specification changed'
    | 'Standardization rule updated'
    | 'Dataset uploaded'
    | 'Common Material Created'
    | 'Model version deployed'
    | 'Clean-up rule executed';
  materialId: string;
  previousValue: string;
  newValue: string;
  reason: string;
  modelVersion: string;
  verificationHash: string;
}

export interface StandardizationRule {
  id: string;
  ruleCode: string;
  description: string;
  targetCategory: string;
  version: string;
  status: 'Active' | 'Draft' | 'Deprecated';
  lastUpdated: string;
  author: string;
  regexPattern?: string;
  autoAction: 'Normalize' | 'Flag Incomplete' | 'Reject Non-Standard';
}

export interface DomainDictionaryItem {
  id: string;
  abbreviation: string;
  expandedTerm: string;
  category: string;
  usageCount: number;
  status: 'Approved' | 'Review';
}

export interface AIModelVersion {
  modelName: string;
  version: string;
  precision: number;
  recall: number;
  f1Score: number;
  falseMergeRate: number;
  deploymentStatus: 'Production Active' | 'Staging' | 'Candidate';
  trainedOnRecords: number;
  lastDeployed: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'success' | 'warning' | 'info';
  timestamp: string;
  read: boolean;
  actionTab?: TabType;
  actionPayload?: any;
}
