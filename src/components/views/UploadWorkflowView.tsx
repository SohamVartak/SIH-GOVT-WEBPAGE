import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { motion } from 'motion/react';

import { supabase } from '../../../lib/supabase';
import { useApp } from '../../context/AppContext';

import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Database,
  Sparkles,
  Building,
  RefreshCw,
  Cpu,
  ShieldCheck,
  XCircle,
  Layers,
  FileArchive,
  FileText,
  FolderOpen,
  Activity,
  Loader2,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

interface SourceRow {
  [key: string]: string;
}

interface Mapping {
  sourceColumn: string;
  targetColumn:
    | 'material_number'
    | 'description'
    | 'specifications'
    | 'category'
    | 'unmapped';
  confidence: number;
  reason: string;
}

interface StandardizedRow {
  company: string;
  material_number: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
}

interface NormalizationInputRow {
  sourceIndex: number;
  material_number: string | null;
  description: string | null;
  specifications: string | null;
  category: string | null;
}

type UploadMode = 'dataset' | 'datasheet';

type DatasheetCompanyMode = 'AUTO' | string;

type DatasheetStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED';

interface DatasheetFileItem {
  id: string;
  fileName: string;
  folderPath: string;
  relativePath: string;
  size: number;
  company: string | null;
  status: DatasheetStatus;
  storagePath?: string;
  datasheetId?: number;
  error?: string;
}

interface DatasheetUploadResult {
  success: boolean;
  storagePath?: string;
  datasheetId?: number;
  error?: string;
}

/* =========================================================
   CONSTANTS
========================================================= */

const STANDARD_FIELDS = [
  'material_number',
  'description',
  'specifications',
  'category',
] as const;

const NORMALIZATION_BATCH_SIZE = 20;

const MAX_ZIP_SIZE = 500 * 1024 * 1024;

const MAX_SINGLE_PDF_SIZE = 100 * 1024 * 1024;

const DATASHEET_UPLOAD_CONCURRENCY = 2;

/* =========================================================
   COMPANY DATA
========================================================= */

const KNOWN_COMPANIES = [
  'IOCL',
  'BPCL',
  'HPCL',
  'BHEL',
  'ONGC',
  'NTPC',
  'SAIL',
  'GAIL',
  'CIL',
  'CPCL',
];

const COMPANY_HEADER_NAMES = [
  'company',
  'company name',
  'cpse',
  'cpse code',
  'cpse name',
  'organization',
  'organisation',
  'organization name',
  'organisation name',
  'enterprise',
  'enterprise name',
];

const COMPANY_ALIASES: Record<string, string> = {
  IOCL: 'IOCL',
  'INDIAN OIL': 'IOCL',
  'INDIAN OIL CORPORATION': 'IOCL',
  'INDIAN OIL CORPORATION LIMITED': 'IOCL',
  'INDIAN OIL HALDIA': 'IOCL',
  'INDIAN OIL HALDIA REFINERY': 'IOCL',
  'INDIAN OIL (HALDIA REFINERY)': 'IOCL',

  BPCL: 'BPCL',
  'BHARAT PETROLEUM': 'BPCL',
  'BHARAT PETROLEUM CORPORATION': 'BPCL',
  'BHARAT PETROLEUM CORPORATION LIMITED': 'BPCL',

  HPCL: 'HPCL',
  'HINDUSTAN PETROLEUM': 'HPCL',
  'HINDUSTAN PETROLEUM CORPORATION': 'HPCL',
  'HINDUSTAN PETROLEUM CORPORATION LIMITED': 'HPCL',

  BHEL: 'BHEL',
  'BHARAT HEAVY ELECTRICALS': 'BHEL',
  'BHARAT HEAVY ELECTRICALS LIMITED': 'BHEL',

  ONGC: 'ONGC',
  'OIL AND NATURAL GAS': 'ONGC',
  'OIL AND NATURAL GAS CORPORATION': 'ONGC',
  'OIL AND NATURAL GAS CORPORATION LIMITED': 'ONGC',

  NTPC: 'NTPC',
  'NTPC LIMITED': 'NTPC',

  SAIL: 'SAIL',
  'STEEL AUTHORITY OF INDIA': 'SAIL',
  'STEEL AUTHORITY OF INDIA LIMITED': 'SAIL',

  GAIL: 'GAIL',
  'GAIL INDIA': 'GAIL',
  'GAIL INDIA LIMITED': 'GAIL',
  'GAS AUTHORITY OF INDIA': 'GAIL',
  'GAS AUTHORITY OF INDIA LIMITED': 'GAIL',

  CIL: 'CIL',
  'COAL INDIA': 'CIL',
  'COAL INDIA LIMITED': 'CIL',

  CPCL: 'CPCL',
  'CHENNAI PETROLEUM': 'CPCL',
  'CHENNAI PETROLEUM CORPORATION': 'CPCL',
  'CHENNAI PETROLEUM CORPORATION LIMITED': 'CPCL',
};

/* =========================================================
   COMPANY HELPERS
========================================================= */

function normalizeCompanyName(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const original = String(value)
    .replace(/\s+/g, ' ')
    .trim();

  if (!original) {
    return null;
  }

  const normalized = original.toUpperCase();

  if (COMPANY_ALIASES[normalized]) {
    return COMPANY_ALIASES[normalized];
  }

  for (const code of KNOWN_COMPANIES) {
    if (normalized === code) {
      return code;
    }
  }

  if (normalized.includes('INDIAN OIL')) {
    return 'IOCL';
  }

  if (normalized.includes('BHARAT PETROLEUM')) {
    return 'BPCL';
  }

  if (normalized.includes('HINDUSTAN PETROLEUM')) {
    return 'HPCL';
  }

  if (normalized.includes('BHARAT HEAVY ELECTRICALS')) {
    return 'BHEL';
  }

  if (normalized.includes('OIL AND NATURAL GAS')) {
    return 'ONGC';
  }

  if (normalized.includes('STEEL AUTHORITY')) {
    return 'SAIL';
  }

  if (normalized.includes('COAL INDIA')) {
    return 'CIL';
  }

  if (normalized.includes('CHENNAI PETROLEUM')) {
    return 'CPCL';
  }

  if (normalized.includes('GAS AUTHORITY')) {
    return 'GAIL';
  }

  if (normalized.includes('GAIL')) {
    return 'GAIL';
  }

  if (normalized.includes('NTPC')) {
    return 'NTPC';
  }

  return null;
}

function detectCompanyFromText(value: string): string | null {
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

  /* Exact company aliases first */
  const sortedAliases = Object.keys(COMPANY_ALIASES).sort(
    (a, b) => b.length - a.length
  );

  for (const alias of sortedAliases) {
    if (normalized.includes(alias)) {
      return COMPANY_ALIASES[alias];
    }
  }

  /* Known short codes */
  const patterns: Array<[string, RegExp]> = [
    ['IOCL', /\bIOCL\b/],
    ['BPCL', /\bBPCL\b/],
    ['HPCL', /\bHPCL\b/],
    ['BHEL', /\bBHEL\b/],
    ['ONGC', /\bONGC\b/],
    ['NTPC', /\bNTPC\b/],
    ['SAIL', /\bSAIL\b/],
    ['GAIL', /\bGAIL\b/],
    ['CIL', /\bCIL\b/],
    ['CPCL', /\bCPCL\b/],
  ];

  for (const [company, regex] of patterns) {
    if (regex.test(normalized)) {
      return company;
    }
  }

  return null;
}

function findCompanyColumn(headers: string[]): string | null {
  for (const header of headers) {
    const normalized = header.trim().toLowerCase();

    if (COMPANY_HEADER_NAMES.includes(normalized)) {
      return header;
    }
  }

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();

    if (
      normalized.includes('company') ||
      normalized.includes('cpse') ||
      normalized.includes('organization') ||
      normalized.includes('organisation') ||
      normalized.includes('enterprise')
    ) {
      return header;
    }
  }

  return null;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function sanitizePathPart(value: string): string {
  return value
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '_');
}

function sanitizeStoragePath(value: string): string {
  return value
    .split('/')
    .map((part) => sanitizePathPart(part))
    .filter(Boolean)
    .join('/');
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

function getFolderPath(relativePath: string): string {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/');

  if (parts.length <= 1) {
    return '';
  }

  parts.pop();

  return parts.join('/');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

/* =========================================================
   DATASHEET COMPANY DETECTION
========================================================= */

function detectDatasheetCompany(
  relativePath: string,
  selectedMode: DatasheetCompanyMode
): string | null {
  if (selectedMode !== 'AUTO') {
    return normalizeCompanyName(selectedMode);
  }

  const normalizedPath = normalizePath(relativePath);

  /*
   * Search the entire path, not only the first folder.
   * Examples:
   * IOCL/Haldia/Step01.pdf
   * Step01_IOCL_Haldia_4834093524.pdf
   * documents/Indian Oil/valve.pdf
   */
  return detectCompanyFromText(normalizedPath);
}

function makeStoragePath(
  company: string,
  relativePath: string
): string {
  const timestamp = Date.now();

  const random = Math.random()
    .toString(36)
    .slice(2, 10);

  const safeRelative = sanitizeStoragePath(relativePath);

  const safeCompany = sanitizePathPart(company);

  return `uploads/${safeCompany}/${timestamp}-${random}-${safeRelative}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export const UploadWorkflowView: React.FC = () => {
  const {
    cpses,
    addToast,
    setCurrentTab,
    companyOptions,
  } = useApp();

  /* =======================================================
     MODE
  ======================================================= */

  const [uploadMode, setUploadMode] =
    useState<UploadMode>('dataset');

  /* =======================================================
     DATASET
  ======================================================= */

  const [step, setStep] = useState(1);

  const [selectedCPSE, setSelectedCPSE] =
    useState('ALL COMPANIES');

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [fileName, setFileName] =
    useState('');

  const [isDragging, setIsDragging] =
    useState(false);

  const [sourceHeaders, setSourceHeaders] =
    useState<string[]>([]);

  const [sourceRows, setSourceRows] =
    useState<SourceRow[]>([]);

  const [mappings, setMappings] =
    useState<Mapping[]>([]);

  const [standardizedRows, setStandardizedRows] =
    useState<StandardizedRow[]>([]);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isNormalizing, setIsNormalizing] =
    useState(false);

  const [normalizationProgress, setNormalizationProgress] =
    useState(0);

  const [isImporting, setIsImporting] =
    useState(false);

  const [validationErrors, setValidationErrors] =
    useState<string[]>([]);

  const [validationWarnings, setValidationWarnings] =
    useState<string[]>([]);

  const [insertedCount, setInsertedCount] =
    useState(0);

  /* =======================================================
     DATASHEET
  ======================================================= */

  const [datasheetCompanyMode, setDatasheetCompanyMode] =
    useState<DatasheetCompanyMode>('AUTO');

  const [selectedDatasheetPdf, setSelectedDatasheetPdf] =
    useState<File | null>(null);

  const [selectedZipFile, setSelectedZipFile] =
    useState<File | null>(null);

  const [selectedZipName, setSelectedZipName] =
    useState('');

  const [datasheetFiles, setDatasheetFiles] =
    useState<DatasheetFileItem[]>([]);

  const [isScanningZip, setIsScanningZip] =
    useState(false);

  const [isUploadingDatasheets, setIsUploadingDatasheets] =
    useState(false);

  const [datasheetProgress, setDatasheetProgress] =
    useState(0);

  const [datasheetUploadedCount, setDatasheetUploadedCount] =
    useState(0);

  const [datasheetFailedCount, setDatasheetFailedCount] =
    useState(0);

  const [datasheetMessage, setDatasheetMessage] =
    useState<string | null>(null);

  /* =========================================================
     COMPANY RECORDS
  ========================================================= */

  const companyRecords = useMemo(() => {
    return cpses.map((cpse) => ({
      ...cpse,
      recordsUploaded: cpse.recordsUploaded || 0,
    }));
  }, [cpses]);

  const uploadCompanyOptions = useMemo(() => {
    const result: string[] = ['ALL COMPANIES'];

    companyRecords.forEach((company) => {
      const code = company.code?.trim().toUpperCase();

      if (code && !result.includes(code)) {
        result.push(code);
      }
    });

    (companyOptions || []).forEach((company) => {
      const normalized = company?.trim().toUpperCase();

      if (
        normalized &&
        normalized !== 'ALL COMPANIES' &&
        !result.includes(normalized)
      ) {
        result.push(normalized);
      }
    });

    KNOWN_COMPANIES.forEach((company) => {
      if (!result.includes(company)) {
        result.push(company);
      }
    });

    return result;
  }, [companyRecords, companyOptions]);

  const datasheetCompanyOptions = useMemo(() => {
    return uploadCompanyOptions.filter(
      (company) => company !== 'ALL COMPANIES'
    );
  }, [uploadCompanyOptions]);

  /* =========================================================
     CSV PARSER
  ========================================================= */

  const parseCSV = (
    text: string
  ): SourceRow[] => {
    const rows: string[][] = [];

    let currentRow: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (
        char === '"' &&
        insideQuotes &&
        next === '"'
      ) {
        currentValue += '"';
        i++;
        continue;
      }

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (
        char === ',' &&
        !insideQuotes
      ) {
        currentRow.push(currentValue.trim());
        currentValue = '';
        continue;
      }

      if (
        (char === '\n' || char === '\r') &&
        !insideQuotes
      ) {
        if (
          currentValue.length > 0 ||
          currentRow.length > 0
        ) {
          currentRow.push(currentValue.trim());
          rows.push(currentRow);
          currentRow = [];
          currentValue = '';
        }

        if (
          char === '\r' &&
          next === '\n'
        ) {
          i++;
        }

        continue;
      }

      currentValue += char;
    }

    if (
      currentValue.length > 0 ||
      currentRow.length > 0
    ) {
      currentRow.push(currentValue.trim());
      rows.push(currentRow);
    }

    if (rows.length === 0) {
      setSourceHeaders([]);
      return [];
    }

    const headers = rows[0].map(
      (header, index) =>
        header.trim() ||
        `Unnamed Column ${index + 1}`
    );

    setSourceHeaders(headers);

    return rows
      .slice(1)
      .filter((row) =>
        row.some(
          (value) => value.trim() !== ''
        )
      )
      .map((row) => {
        const objectRow: SourceRow = {};

        headers.forEach(
          (header, index) => {
            objectRow[header] =
              row[index] || '';
          }
        );

        return objectRow;
      });
  };

  /* =========================================================
     EXCEL HEADER SCORE
  ========================================================= */

  const scoreHeaderRow = (
    row: unknown[]
  ): number => {
    const keywords = [
      'material',
      'material code',
      'material no',
      'material number',
      'material description',
      'material desc',
      'item',
      'item no',
      'item number',
      'item code',
      'item description',
      'description',
      'short text',
      'long text',
      'specification',
      'specifications',
      'technical specification',
      'category',
      'material group',
      'group',
      'uom',
      'unit',
      'part',
      'part number',
      'part no',
      'code',
      'sap',
      'company',
      'company name',
      'cpse',
      'organization',
      'organisation',
      'enterprise',
    ];

    const cells = row.map((cell) =>
      String(cell ?? '')
        .trim()
        .toLowerCase()
    );

    let score = 0;

    const nonEmptyCells = cells.filter(
      (cell) => cell !== ''
    ).length;

    if (nonEmptyCells >= 2) {
      score += Math.min(
        nonEmptyCells,
        8
      );
    }

    cells.forEach((cell) => {
      if (!cell) {
        return;
      }

      const exact = keywords.some(
        (keyword) => cell === keyword
      );

      const contains = keywords.some(
        (keyword) => cell.includes(keyword)
      );

      if (exact) {
        score += 5;
      } else if (contains) {
        score += 2;
      }
    });

    if (
      cells.length === 1 &&
      cells[0].length > 20
    ) {
      score -= 5;
    }

    return score;
  };

  /* =========================================================
     EXCEL PARSER
  ========================================================= */

  const parseExcel = async (
    file: File
  ): Promise<SourceRow[]> => {
    const arrayBuffer = await file.arrayBuffer();

    const workbook = XLSX.read(
      arrayBuffer,
      {
        type: 'array',
        cellDates: false,
        raw: false,
      }
    );

    const firstSheetName =
      workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error(
        'The Excel workbook does not contain any worksheets.'
      );
    }

    const worksheet =
      workbook.Sheets[firstSheetName];

    const rawRows =
      XLSX.utils.sheet_to_json<unknown[]>(
        worksheet,
        {
          header: 1,
          defval: '',
          raw: false,
        }
      );

    if (
      !rawRows ||
      rawRows.length === 0
    ) {
      setSourceHeaders([]);
      return [];
    }

    let bestHeaderIndex = 0;
    let bestScore = -Infinity;

    const searchLimit =
      Math.min(rawRows.length, 30);

    for (
      let rowIndex = 0;
      rowIndex < searchLimit;
      rowIndex++
    ) {
      const score = scoreHeaderRow(
        rawRows[rowIndex]
      );

      if (score > bestScore) {
        bestScore = score;
        bestHeaderIndex = rowIndex;
      }
    }

    const headerRow =
      rawRows[bestHeaderIndex];

    const headers: string[] = [];
    const usedHeaders = new Set<string>();

    headerRow.forEach(
      (cell, index) => {
        let header =
          String(cell ?? '').trim();

        if (!header) {
          header =
            `Unnamed Column ${index + 1}`;
        }

        let uniqueHeader = header;
        let counter = 2;

        while (
          usedHeaders.has(
            uniqueHeader
          )
        ) {
          uniqueHeader =
            `${header}_${counter}`;
          counter++;
        }

        usedHeaders.add(
          uniqueHeader
        );

        headers.push(uniqueHeader);
      }
    );

    setSourceHeaders(headers);

    return rawRows
      .slice(bestHeaderIndex + 1)
      .filter((row) =>
        row.some(
          (value) =>
            String(value ?? '').trim() !== ''
        )
      )
      .map((row) => {
        const objectRow: SourceRow = {};

        headers.forEach(
          (header, columnIndex) => {
            objectRow[header] =
              String(
                row[columnIndex] ?? ''
              ).trim();
          }
        );

        return objectRow;
      });
  };

  /* =========================================================
     DATASET FILE HANDLER
  ========================================================= */

  const handleDatasetFile = async (
    file: File
  ) => {
    const extension =
      file.name
        .toLowerCase()
        .split('.')
        .pop() || '';

    const supportedExtensions = [
      'csv',
      'xlsx',
      'xls',
    ];

    if (
      !supportedExtensions.includes(
        extension
      )
    ) {
      addToast({
        title: 'Unsupported File',
        message:
          'Please upload an Excel (.xlsx/.xls) or CSV file.',
        type: 'error',
      });

      return;
    }

    setSelectedFile(file);
    setFileName(file.name);

    try {
      let rows: SourceRow[] = [];

      if (extension === 'csv') {
        rows = parseCSV(
          await file.text()
        );
      } else {
        rows = await parseExcel(file);
      }

      if (rows.length === 0) {
        throw new Error(
          'No usable data rows were found in the uploaded file.'
        );
      }

      setSourceRows(rows);
      setMappings([]);
      setStandardizedRows([]);
      setValidationErrors([]);
      setValidationWarnings([]);
      setInsertedCount(0);
      setNormalizationProgress(0);

      addToast({
        title: 'Dataset Loaded',
        message:
          `${rows.length.toLocaleString()} rows detected from ${file.name}`,
        type: 'success',
      });
    } catch (error) {
      console.error(
        'File parsing error:',
        error
      );

      setSelectedFile(null);
      setFileName('');
      setSourceRows([]);
      setSourceHeaders([]);

      addToast({
        title: 'File Read Failed',
        message:
          error instanceof Error
            ? error.message
            : 'The uploaded file could not be read.',
        type: 'error',
      });
    }
  };

  /* =========================================================
     AI SCHEMA MAPPING
  ========================================================= */

  const analyzeSchema =
    async (): Promise<boolean> => {
      if (
        !selectedFile ||
        sourceRows.length === 0
      ) {
        addToast({
          title: 'No Data',
          message:
            'Upload a CSV or Excel file containing material records first.',
          type: 'warning',
        });

        return false;
      }

      setIsAnalyzing(true);

      try {
        const sampleRows =
          sourceRows.slice(0, 8);

        const response =
          await fetch(
            '/api/analyze-csv',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                company:
                  selectedCPSE,
                headers:
                  sourceHeaders,
                sampleRows,
              }),
            }
          );

        if (!response.ok) {
          throw new Error(
            `AI schema analysis failed (${response.status})`
          );
        }

        const result =
          await response.json();

        const aiMappings =
          Array.isArray(
            result.mappings
          )
            ? result.mappings
            : [];

        if (
          aiMappings.length === 0
        ) {
          throw new Error(
            'The AI endpoint returned no mappings.'
          );
        }

        setMappings(
          aiMappings
        );

        setStep(3);

        addToast({
          title:
            'AI Schema Analysis Complete',
          message:
            `${aiMappings.length} source columns analyzed.`,
          type: 'success',
        });

        return true;
      } catch (error) {
        console.error(
          'AI schema mapping error:',
          error
        );

        const fallback =
          createFallbackMappings(
            sourceHeaders
          );

        setMappings(fallback);
        setStep(3);

        addToast({
          title:
            'Fallback Mapping Used',
          message:
            'The AI schema service was unavailable, so local schema detection was used.',
          type: 'warning',
        });

        return true;
      } finally {
        setIsAnalyzing(false);
      }
    };

  /* =========================================================
     BUILD MAPPED ROWS
  ========================================================= */

  const buildMappedRows =
    (): StandardizedRow[] => {
      const mappingLookup:
        Record<string, string> = {};

      mappings.forEach(
        (mapping) => {
          if (
            mapping.targetColumn &&
            mapping.targetColumn !==
              'unmapped'
          ) {
            mappingLookup[
              mapping.sourceColumn
            ] =
              mapping.targetColumn;
          }
        }
      );

      const companyColumn =
        selectedCPSE ===
        'ALL COMPANIES'
          ? findCompanyColumn(
              sourceHeaders
            )
          : null;

      if (
        selectedCPSE ===
          'ALL COMPANIES' &&
        !companyColumn
      ) {
        throw new Error(
          'ALL COMPANIES requires a Company column in the uploaded Excel/CSV file.'
        );
      }

      return sourceRows.map(
        (
          row,
          rowIndex
        ) => {
          let rowCompany:
            string | null =
            null;

          if (
            selectedCPSE !==
            'ALL COMPANIES'
          ) {
            rowCompany =
              normalizeCompanyName(
                selectedCPSE
              );
          } else {
            const rawCompany =
              companyColumn
                ? row[companyColumn]
                : '';

            rowCompany =
              normalizeCompanyName(
                rawCompany
              );

            if (!rowCompany) {
              throw new Error(
                `Row ${rowIndex + 2} does not contain a valid company value.`
              );
            }
          }

          if (
            !rowCompany ||
            rowCompany ===
              'ALL COMPANIES'
          ) {
            throw new Error(
              `Row ${rowIndex + 2} has an invalid company assignment.`
            );
          }

          const standardized:
            StandardizedRow =
            {
              company:
                rowCompany,
              material_number:
                null,
              description:
                null,
              specifications:
                null,
              category:
                null,
            };

          Object.entries(row).forEach(
            (
              [
                sourceColumn,
                value,
              ]
            ) => {
              if (
                companyColumn &&
                sourceColumn ===
                  companyColumn
              ) {
                return;
              }

              const target =
                mappingLookup[
                  sourceColumn
                ];

              if (!target) {
                return;
              }

              const cleaned =
                value.trim();

              if (
                target ===
                'material_number'
              ) {
                standardized.material_number =
                  cleaned || null;
              }

              if (
                target ===
                'description'
              ) {
                standardized.description =
                  cleaned || null;
              }

              if (
                target ===
                'specifications'
              ) {
                standardized.specifications =
                  cleaned || null;
              }

              if (
                target ===
                'category'
              ) {
                standardized.category =
                  cleaned || null;
              }
            }
          );

          return standardized;
        }
      );
    };

  /* =========================================================
     AI NORMALIZATION
  ========================================================= */

  const normalizeDataWithAI =
    async (
      rows: StandardizedRow[]
    ): Promise<StandardizedRow[]> => {
      if (rows.length === 0) {
        return [];
      }

      setIsNormalizing(true);
      setNormalizationProgress(0);

      const normalizedRows:
        StandardizedRow[] =
        new Array(rows.length);

      const rowsByCompany =
        new Map<
          string,
          {
            row: StandardizedRow;
            originalIndex: number;
          }[]
        >();

      rows.forEach(
        (
          row,
          originalIndex
        ) => {
          const company =
            normalizeCompanyName(
              row.company
            );

          if (!company) {
            throw new Error(
              `Row ${originalIndex + 2} has no valid company name.`
            );
          }

          const existing =
            rowsByCompany.get(
              company
            ) || [];

          existing.push({
            row: {
              ...row,
              company,
            },
            originalIndex,
          });

          rowsByCompany.set(
            company,
            existing
          );
        }
      );

      const totalBatches =
        Array.from(
          rowsByCompany.values()
        ).reduce(
          (
            total,
            companyRows
          ) =>
            total +
            Math.ceil(
              companyRows.length /
                NORMALIZATION_BATCH_SIZE
            ),
          0
        );

      let completedBatches = 0;

      try {
        for (
          const [
            company,
            companyRows,
          ] of rowsByCompany
        ) {
          for (
            let batchStart = 0;
            batchStart <
            companyRows.length;
            batchStart +=
              NORMALIZATION_BATCH_SIZE
          ) {
            const batch =
              companyRows.slice(
                batchStart,
                batchStart +
                  NORMALIZATION_BATCH_SIZE
              );

            const payloadRows:
              NormalizationInputRow[] =
              batch.map(
                (item) => ({
                  sourceIndex:
                    item.originalIndex,
                  material_number:
                    item.row
                      .material_number,
                  description:
                    item.row
                      .description,
                  specifications:
                    item.row
                      .specifications,
                  category:
                    item.row
                      .category,
                })
              );

            const response =
              await fetch(
                '/api/normalize-materials',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    company,
                    rows:
                      payloadRows,
                  }),
                }
              );

            if (!response.ok) {
              let message =
                `AI normalization failed for ${company} (${response.status})`;

              try {
                const errorBody =
                  await response.json();

                if (
                  errorBody?.error
                ) {
                  message =
                    errorBody.error;
                }
              } catch {
                // Ignore.
              }

              throw new Error(
                message
              );
            }

            const result =
              await response.json();

            if (
              !Array.isArray(
                result.rows
              )
            ) {
              throw new Error(
                `AI normalization returned an invalid rows array for ${company}.`
              );
            }

            if (
              result.rows.length !==
              batch.length
            ) {
              throw new Error(
                `AI normalized ${result.rows.length} rows instead of ${batch.length} for ${company}.`
              );
            }

            result.rows.forEach(
              (
                normalized:
                  StandardizedRow & {
                    sourceIndex?: number;
                  },
                localIndex:
                  number
              ) => {
                const fallbackIndex =
                  batch[
                    localIndex
                  ]
                    ?.originalIndex;

                const parsedSourceIndex =
                  Number(
                    normalized.sourceIndex
                  );

                const sourceIndex =
                  Number.isFinite(
                    parsedSourceIndex
                  )
                    ? parsedSourceIndex
                    : fallbackIndex;

                if (
                  !Number.isFinite(
                    sourceIndex
                  )
                ) {
                  throw new Error(
                    `Invalid source index returned by AI for ${company}.`
                  );
                }

                normalizedRows[
                  sourceIndex as number
                ] = {
                  company,
                  material_number:
                    nullableClean(
                      normalized.material_number
                    ),
                  description:
                    nullableClean(
                      normalized.description
                    ),
                  specifications:
                    nullableClean(
                      normalized.specifications
                    ),
                  category:
                    nullableClean(
                      normalized.category
                    ),
                };
              }
            );

            completedBatches++;

            setNormalizationProgress(
              totalBatches >
                0
                ? Math.round(
                    (completedBatches /
                      totalBatches) *
                      100
                  )
                : 100
            );
          }
        }

        for (
          let i = 0;
          i < normalizedRows.length;
          i++
        ) {
          if (!normalizedRows[i]) {
            throw new Error(
              `AI normalization did not return a result for row ${i + 1}.`
            );
          }

          if (
            normalizedRows[i]
              .company ===
            'ALL COMPANIES'
          ) {
            throw new Error(
              `Row ${i + 1} still contains ALL COMPANIES.`
            );
          }
        }

        setNormalizationProgress(
          100
        );

        return normalizedRows;
      } finally {
        setIsNormalizing(false);
      }
    };

  /* =========================================================
     NORMALIZE + VALIDATE
  ========================================================= */

  const normalizeAndValidate =
    async () => {
      if (mappings.length === 0) {
        addToast({
          title:
            'No Mapping Available',
          message:
            'Run AI schema mapping before normalization.',
          type: 'warning',
        });

        return;
      }

      try {
        const mappedRows =
          buildMappedRows();

        addToast({
          title:
            'AI Normalization Started',
          message:
            `Processing ${mappedRows.length.toLocaleString()} material records in batches of ${NORMALIZATION_BATCH_SIZE}.`,
          type: 'info',
        });

        const normalized =
          await normalizeDataWithAI(
            mappedRows
          );

        setStandardizedRows(
          normalized
        );

        runValidation(
          normalized
        );
      } catch (error) {
        console.error(
          'AI normalization error:',
          error
        );

        setValidationErrors([]);
        setValidationWarnings([]);

        addToast({
          title:
            'AI Normalization Failed',
          message:
            error instanceof Error
              ? error.message
              : 'The material data could not be normalized.',
          type: 'error',
        });
      }
    };

  /* =========================================================
     VALIDATION
  ========================================================= */

  const runValidation = (
    rows: StandardizedRow[]
  ) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const materialNumbers =
      new Map<
        string,
        number[]
      >();

    rows.forEach(
      (
        row,
        index
      ) => {
        const rowNumber =
          index + 2;

        if (
          !row.company ||
          row.company ===
            'ALL COMPANIES'
        ) {
          errors.push(
            `Row ${rowNumber}: Invalid company assignment.`
          );
        }

        if (
          !row.material_number &&
          !row.description &&
          !row.specifications
        ) {
          errors.push(
            `Row ${rowNumber}: Material number, description and specifications are all empty.`
          );
        }

        if (!row.material_number) {
          warnings.push(
            `Row ${rowNumber}: Material number is missing.`
          );
        }

        if (!row.description) {
          warnings.push(
            `Row ${rowNumber}: Description is missing.`
          );
        }

        if (!row.specifications) {
          warnings.push(
            `Row ${rowNumber}: Specifications are missing.`
          );
        }

        if (!row.category) {
          warnings.push(
            `Row ${rowNumber}: Category is missing.`
          );
        }

        if (row.material_number) {
          const key =
            `${row.company}::${row.material_number
              .trim()
              .toLowerCase()}`;

          const existing =
            materialNumbers.get(
              key
            ) || [];

          existing.push(
            rowNumber
          );

          materialNumbers.set(
            key,
            existing
          );
        }
      }
    );

    materialNumbers.forEach(
      (
        rowNumbers,
        key
      ) => {
        if (
          rowNumbers.length >
          1
        ) {
          const [
            company,
            materialNumber,
          ] =
            key.split(
              '::'
            );

          warnings.push(
            `Duplicate material number "${materialNumber}" found for ${company} in rows ${rowNumbers.join(', ')}.`
          );
        }
      }
    );

    setValidationErrors(
      errors
    );

    setValidationWarnings(
      warnings
    );

    setStep(4);

    if (errors.length === 0) {
      addToast({
        title:
          'AI Validation Complete',
        message:
          warnings.length > 0
            ? `${warnings.length} warning(s) found.`
            : 'Dataset passed validation without blocking errors.',
        type:
          warnings.length > 0
            ? 'warning'
            : 'success',
      });
    } else {
      addToast({
        title:
          'Validation Issues Found',
        message:
          `${errors.length} blocking error(s) found.`,
        type: 'error',
      });
    }
  };

  /* =========================================================
     DATASET IMPORT
  ========================================================= */

  const importToSupabase =
    async () => {
      if (
        standardizedRows.length ===
        0
      ) {
        addToast({
          title:
            'Nothing to Import',
          message:
            'There are no standardized records ready for import.',
          type:
            'warning',
        });

        return;
      }

      if (
        validationErrors.length >
        0
      ) {
        addToast({
          title:
            'Validation Failed',
          message:
            'Fix the validation errors before importing.',
          type:
            'error',
        });

        return;
      }

      const invalidRows =
        standardizedRows.filter(
          (
            row
          ) =>
            !row.company ||
            row.company ===
              'ALL COMPANIES'
        );

      if (
        invalidRows.length >
        0
      ) {
        addToast({
          title:
            'Invalid Company Assignment',
          message:
            'Import blocked because one or more rows do not have a real company assigned.',
          type:
            'error',
        });

        return;
      }

      setIsImporting(
        true
      );

      try {
        const chunkSize =
          500;

        let inserted = 0;

        for (
          let start = 0;
          start <
          standardizedRows.length;
          start +=
            chunkSize
        ) {
          const chunk =
            standardizedRows.slice(
              start,
              start +
                chunkSize
            );

          const {
            error,
          } =
            await supabase
              .from(
                'materials'
              )
              .insert(
                chunk
              );

          if (
            error
          ) {
            throw error;
          }

          inserted +=
            chunk.length;
        }

        setInsertedCount(
          inserted
        );

        setStep(6);

        addToast({
          title:
            'Database Updated',
          message:
            `${inserted.toLocaleString()} material records added to Supabase.`,
          type:
            'success',
        });
      } catch (
        error
      ) {
        console.error(
          'Supabase import error:',
          error
        );

        addToast({
          title:
            'Database Import Failed',
          message:
            error instanceof Error
              ? error.message
              : 'Could not insert the standardized records.',
          type:
            'error',
        });
      } finally {
        setIsImporting(
          false
        );
      }
    };

  /* =========================================================
     DATASHEET RESET
  ========================================================= */

  const resetDatasheetUploader =
    () => {
      if (
        isUploadingDatasheets
      ) {
        return;
      }

      setSelectedDatasheetPdf(
        null
      );

      setSelectedZipFile(
        null
      );

      setSelectedZipName(
        ''
      );

      setDatasheetFiles(
        []
      );

      setIsScanningZip(
        false
      );

      setDatasheetProgress(
        0
      );

      setDatasheetUploadedCount(
        0
      );

      setDatasheetFailedCount(
        0
      );

      setDatasheetMessage(
        null
      );

      setDatasheetCompanyMode(
        'AUTO'
      );
    };

  /* =========================================================
     SINGLE PDF
     AUTOMATIC COMPANY DETECTION
  ========================================================= */

  const handleSinglePdf = (
    file: File
  ) => {
    if (
      !isPdfFile(file.name)
    ) {
      addToast({
        title:
          'Unsupported File',
        message:
          'Please select a PDF datasheet.',
        type:
          'error',
      });

      return;
    }

    if (
      file.size >
      MAX_SINGLE_PDF_SIZE
    ) {
      addToast({
        title:
          'PDF Too Large',
        message:
          'This PDF is larger than the 100 MB limit.',
        type:
          'error',
      });

      return;
    }

    const detectedCompany =
      detectDatasheetCompany(
        file.name,
        datasheetCompanyMode
      );

    const item:
      DatasheetFileItem =
      {
        id:
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`,

        fileName:
          file.name,

        folderPath:
          '',

        relativePath:
          file.name,

        size:
          file.size,

        company:
          detectedCompany,

        status:
          'PENDING',
      };

    setSelectedDatasheetPdf(
      file
    );

    setSelectedZipFile(
      null
    );

    setSelectedZipName(
      ''
    );

    setDatasheetFiles([
      item,
    ]);

    setDatasheetProgress(
      0
    );

    setDatasheetUploadedCount(
      0
    );

    setDatasheetFailedCount(
      0
    );

    if (
      detectedCompany
    ) {
      setDatasheetMessage(
        `Company automatically detected as ${detectedCompany}. PDF is ready for upload.`
      );

      addToast({
        title:
          'Company Detected',
        message:
          `${file.name} → ${detectedCompany}`,
        type:
          'success',
      });
    } else {
      setDatasheetMessage(
        'Company could not be detected from the filename. Rename the PDF with a company name/code such as IOCL, BPCL, HPCL or BHEL.'
      );

      addToast({
        title:
          'Company Not Detected',
        message:
          'Use a filename containing the CPSE code/name. Example: Step01_IOCL_Haldia_4834093524.pdf',
        type:
          'warning',
      });
    }
  };

  /* =========================================================
     ZIP SCAN
  ========================================================= */

  const scanDatasheetZip =
    async (
      zipFile: File
    ) => {
      if (
        zipFile.size >
        MAX_ZIP_SIZE
      ) {
        addToast({
          title:
            'ZIP Too Large',
          message:
            'ZIP files are limited to 500 MB.',
          type:
            'error',
        });

        return;
      }

      setIsScanningZip(
        true
      );

      setDatasheetMessage(
        null
      );

      setDatasheetFiles(
        []
      );

      try {
        const zip =
          await JSZip.loadAsync(
            zipFile
          );

        const entries =
          Object.entries(
            zip.files
          );

        const items:
          DatasheetFileItem[] =
          [];

        for (
          const [
            relativePath,
            zipEntry,
          ] of entries
        ) {
          const normalizedPath =
            normalizePath(
              relativePath
            );

          if (zipEntry.dir) {
            continue;
          }

          if (
            normalizedPath.startsWith(
              '__MACOSX/'
            )
          ) {
            continue;
          }

          if (
            normalizedPath
              .split('/')
              .some(
                (part) =>
                  part.startsWith(
                    '.'
                  )
              )
          ) {
            continue;
          }

          if (
            !isPdfFile(
              normalizedPath
            )
          ) {
            continue;
          }

          const folderPath =
            getFolderPath(
              normalizedPath
            );

          const company =
            detectDatasheetCompany(
              normalizedPath,
              datasheetCompanyMode
            );

          const fileName =
            normalizedPath
              .split('/')
              .pop() ||
            normalizedPath;

          items.push({
            id:
              `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}-${items.length}`,

            fileName,

            folderPath,

            relativePath:
              normalizedPath,

            size: 0,

            company,

            status:
              'PENDING',
          });
        }

        if (
          items.length ===
          0
        ) {
          throw new Error(
            'No PDF datasheets were found inside the ZIP file.'
          );
        }

        setSelectedZipFile(
          zipFile
        );

        setSelectedDatasheetPdf(
          null
        );

        setSelectedZipName(
          zipFile.name
        );

        setDatasheetFiles(
          items
        );

        setDatasheetProgress(
          0
        );

        setDatasheetUploadedCount(
          0
        );

        setDatasheetFailedCount(
          0
        );

        const unassigned =
          items.filter(
            (item) =>
              !item.company
          ).length;

        setDatasheetMessage(
          unassigned > 0
            ? `${items.length.toLocaleString()} PDFs found. ${unassigned.toLocaleString()} could not be assigned automatically.`
            : `${items.length.toLocaleString()} PDFs found and company assignments detected automatically.`
        );

        addToast({
          title:
            'ZIP Scanned Successfully',
          message:
            `${items.length.toLocaleString()} PDF datasheets discovered.`,
          type:
            'success',
        });
      } catch (
        error
      ) {
        console.error(
          'ZIP scan error:',
          error
        );

        setSelectedZipFile(
          null
        );

        setSelectedZipName(
          ''
        );

        setDatasheetFiles(
          []
        );

        addToast({
          title:
            'ZIP Scan Failed',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to read the ZIP file.',
          type:
            'error',
        });
      } finally {
        setIsScanningZip(
          false
        );
      }
    };

  const processDatasheet = async (datasheetId: number) => {
  try {
    // =====================================================
    // STEP 1 — PROCESS DATASHEET
    // =====================================================

    const response = await fetch("/api/process-datasheet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        datasheetId,
      }),
    });

    let result: any = null;

    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.details ||
          result?.error ||
          `Datasheet processing failed (${response.status})`
      );
    }

    console.log(
      `Datasheet ${datasheetId} processed successfully:`,
      result
    );

    // =====================================================
    // STEP 2 — GET CREATED MATERIAL ID
    // =====================================================

    const materialId = Number(
      result?.material?.id ??
        result?.materialId ??
        result?.material_id ??
        result?.data?.materialId ??
        result?.data?.material_id
    );

    if (!Number.isInteger(materialId) || materialId <= 0) {
      console.error(
        "No valid material ID returned from process-datasheet:",
        result
      );

      throw new Error(
        "Datasheet was processed successfully, but no valid material ID was returned. AI matching could not be started."
      );
    }

    console.log(
      `Starting AI matching for materials.id=${materialId}`
    );

    // =====================================================
    // STEP 3 — AI MATERIAL MATCHING
    // =====================================================

    const matchResponse = await fetch("/api/match-materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        materialId,
        matchCount: 10,
      }),
    });

    let matchResult: any = null;

    try {
      matchResult = await matchResponse.json();
    } catch {
      matchResult = null;
    }

    if (!matchResponse.ok || !matchResult?.success) {
      console.error(
        `AI matching failed for materials.id=${materialId}:`,
        matchResult
      );

      throw new Error(
        matchResult?.details ||
          matchResult?.error ||
          `AI material matching failed (${matchResponse.status})`
      );
    }

    console.log(
      `AI matching completed successfully for materials.id=${materialId}:`,
      matchResult
    );

    // =====================================================
    // COMPLETE
    // =====================================================

    return {
      success: true,
      result,
      materialId,
      matchResult,
    };
  } catch (error) {
    console.error(
      `Datasheet processing/matching failed for ID ${datasheetId}:`,
      error
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Datasheet processing or AI matching failed.",
    };
  }
};
  /* =========================================================
     UPLOAD DATASHEET
  ========================================================= */

  const uploadDatasheetFile =
    async (
      pdfFile: File,
      item: DatasheetFileItem,
      sourceZipName:
        | string
        | null
    ): Promise<
      DatasheetUploadResult
    > => {
      let storagePath:
        | string
        | null =
        null;

      try {
        /* ================================================
           AUTH
        ================================================ */

        const {
          data: {
            session,
          },
          error:
            sessionError,
        } =
          await supabase.auth.getSession();

        if (
          sessionError
        ) {
          throw sessionError;
        }

        const user =
          session?.user ??
          null;

        if (!user) {
          throw new Error(
            'You must be authenticated to upload datasheets. Please log in again.'
          );
        }

        console.log(
          'Authenticated upload user:',
          user.id,
          user.email
        );

        /* ================================================
           COMPANY DETECTION
        ================================================ */

        const company =
          item.company ||
          detectDatasheetCompany(
            item.relativePath,
            datasheetCompanyMode
          );

        if (!company) {
          throw new Error(
            `Could not automatically detect the company for "${item.fileName}".`
          );
        }

        /* ================================================
           STORAGE PATH
        ================================================ */

        storagePath =
          makeStoragePath(
            company,
            item.relativePath
          );

        /* ================================================
           STORAGE UPLOAD
        ================================================ */

        const {
          error:
            storageError,
        } =
          await supabase.storage
            .from(
              'datasheets'
            )
            .upload(
              storagePath,
              pdfFile,
              {
                cacheControl:
                  '3600',

                contentType:
                  'application/pdf',

                upsert:
                  false,
              }
            );

        if (
          storageError
        ) {
          throw storageError;
        }

        /* ================================================
           DATABASE
           
           IMPORTANT:
           company_id is intentionally NOT supplied here.
           PostgreSQL trigger resolves it automatically
           from company_name.
        ================================================ */

        const {
          data:
            datasheetRow,
          error:
            databaseError,
        } =
          await supabase
            .from(
              'datasheets'
            )
            .insert({
              file_name:
                item.fileName,

              original_file_name:
                item.fileName,

              source_zip_name:
                sourceZipName,

              folder_path:
                item.folderPath ||
                null,

              storage_bucket:
                'datasheets',

              storage_path:
                storagePath,

              company_name:
                company,

              file_size:
                pdfFile.size,

              mime_type:
                'application/pdf',

              processing_status:
                'UPLOADED',

              extraction_status:
                'PENDING',

              embedding_status:
                'PENDING',

              extracted_material_count:
                0,

              uploaded_by:
                user.id,
            })
            .select(
              'datasheet_id'
            )
            .single();

        if (
          databaseError
        ) {
          if (
            storagePath
          ) {
            await supabase.storage
              .from(
                'datasheets'
              )
              .remove([
                storagePath,
              ]);
          }

          throw databaseError;
        }

        if (
          !datasheetRow?.datasheet_id
        ) {
          if (
            storagePath
          ) {
            await supabase.storage
              .from(
                'datasheets'
              )
              .remove([
                storagePath,
              ]);
          }

          throw new Error(
            'The datasheet was uploaded but no database ID was returned.'
          );
        }

        return {
          success:
            true,

          storagePath,

          datasheetId:
            Number(
              datasheetRow.datasheet_id
            ),
        };
      } catch (
        error
      ) {
        console.error(
          `Datasheet upload failed: ${item.relativePath}`,
          error
        );

        return {
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : 'Upload failed.',
        };
      }
    };

  /* =========================================================
     SINGLE PDF UPLOAD + PROCESS
  ========================================================= */

  const uploadSingleDatasheet =
    async () => {
      if (
        !selectedDatasheetPdf ||
        datasheetFiles.length ===
          0
      ) {
        addToast({
          title:
            'No PDF Selected',
          message:
            'Select a PDF datasheet first.',
          type:
            'warning',
        });

        return;
      }

      const item =
        datasheetFiles[0];

      let company =
        item.company;

      /* AUTO DETECTION */
      if (
        datasheetCompanyMode ===
        'AUTO'
      ) {
        company =
          detectDatasheetCompany(
            selectedDatasheetPdf.name,
            'AUTO'
          );
      } else {
        company =
          normalizeCompanyName(
            datasheetCompanyMode
          );
      }

      if (!company) {
        addToast({
          title:
            'Company Not Detected',
          message:
            'The PDF filename does not contain a recognizable company. Rename it with IOCL, BPCL, HPCL, BHEL, ONGC, etc.',
          type:
            'error',
        });

        setDatasheetFiles([
          {
            ...item,
            company: null,
            status:
              'FAILED',
            error:
              'Company could not be detected automatically.',
          },
        ]);

        return;
      }

      const updatedItem:
        DatasheetFileItem =
        {
          ...item,
          company,
        };

      setDatasheetFiles([
        updatedItem,
      ]);

      setIsUploadingDatasheets(
        true
      );

      setDatasheetProgress(
        10
      );

      setDatasheetMessage(
        `${company} detected. Uploading PDF to Supabase Storage...`
      );

      setDatasheetFiles([
        {
          ...updatedItem,
          status:
            'UPLOADING',
        },
      ]);

      try {
        /* =============================================
           UPLOAD
        ============================================= */

        const uploadResult =
          await uploadDatasheetFile(
            selectedDatasheetPdf,
            updatedItem,
            null
          );

        if (
          !uploadResult.success ||
          !uploadResult.datasheetId
        ) {
          throw new Error(
            uploadResult.error ||
              'The PDF upload failed.'
          );
        }

        const datasheetId =
          uploadResult.datasheetId;

        setDatasheetFiles([
          {
            ...updatedItem,
            status:
              'PROCESSING',
            size:
              selectedDatasheetPdf.size,
            storagePath:
              uploadResult.storagePath,
            datasheetId,
          },
        ]);

        setDatasheetProgress(
          45
        );

        setDatasheetMessage(
          `${company} datasheet uploaded. AI extraction and embedding are now running...`
        );

        /* =============================================
           PROCESS
        ============================================= */

        const processing =
          await processDatasheet(
            datasheetId
          );

        if (
          !processing.success
        ) {
          setDatasheetFiles([
            {
              ...updatedItem,
              status:
                'FAILED',
              size:
                selectedDatasheetPdf.size,
              storagePath:
                uploadResult.storagePath,
              datasheetId,
              error:
                processing.error,
            },
          ]);

          setDatasheetFailedCount(
            1
          );

          setDatasheetUploadedCount(
            0
          );

          setDatasheetProgress(
            100
          );

          setDatasheetMessage(
            processing.error ||
              'The PDF was uploaded but processing failed.'
          );

          addToast({
            title:
              'Datasheet Processing Failed',
            message:
              processing.error ||
              'The PDF was stored but AI processing failed.',
            type:
              'error',
          });

          return;
        }

        /* =============================================
           COMPLETE
        ============================================= */

        setDatasheetFiles([
          {
            ...updatedItem,
            status:
              'PROCESSED',
            size:
              selectedDatasheetPdf.size,
            storagePath:
              uploadResult.storagePath,
            datasheetId,
          },
        ]);

        setDatasheetUploadedCount(
          1
        );

        setDatasheetFailedCount(
          0
        );

        setDatasheetProgress(
          100
        );

        setDatasheetMessage(
          `${company} PDF uploaded, processed and embedded successfully.`
        );

        addToast({
          title:
            'Datasheet Processing Complete',
          message:
            `${selectedDatasheetPdf.name} → ${company} → Supabase → AI extraction → Gemini embedding`,
          type:
            'success',
        });
      } catch (
        error
      ) {
        console.error(
          'Single datasheet processing error:',
          error
        );

        setDatasheetFiles([
          {
            ...updatedItem,
            status:
              'FAILED',
            error:
              error instanceof Error
                ? error.message
                : 'Processing failed.',
          },
        ]);

        setDatasheetFailedCount(
          1
        );

        setDatasheetProgress(
          100
        );

        setDatasheetMessage(
          error instanceof Error
            ? error.message
            : 'The PDF processing failed.'
        );

        addToast({
          title:
            'Datasheet Processing Failed',
          message:
            error instanceof Error
              ? error.message
              : 'The PDF could not be processed.',
          type:
            'error',
        });
      } finally {
        setIsUploadingDatasheets(
          false
        );
      }
    };

  /* =========================================================
     ZIP UPLOAD + PROCESS
  ========================================================= */

  const uploadZipDatasheets =
    async () => {
      if (
        !selectedZipFile ||
        datasheetFiles.length ===
          0
      ) {
        addToast({
          title:
            'No ZIP Selected',
          message:
            'Scan a ZIP file containing PDF datasheets first.',
          type:
            'warning',
        });

        return;
      }

      /*
       * In AUTO mode, try one more time to detect every company
       * before blocking the upload.
       */
      const resolvedItems =
        datasheetFiles.map(
          (item) => ({
            ...item,
            company:
              item.company ||
              detectDatasheetCompany(
                item.relativePath,
                datasheetCompanyMode
              ),
          })
        );

      const missingCompanies =
        resolvedItems.filter(
          (item) =>
            !item.company
        );

      if (
        missingCompanies.length >
        0
      ) {
        addToast({
          title:
            'Company Could Not Be Detected',
          message:
            `${missingCompanies.length.toLocaleString()} PDF(s) do not contain a recognizable company name/code. Rename those PDFs or organize them under folders such as IOCL/, BPCL/, HPCL/, etc.`,
          type:
            'error',
        });

        setDatasheetFiles(
          resolvedItems
        );

        return;
      }

      setDatasheetFiles(
        resolvedItems
      );

      setIsUploadingDatasheets(
        true
      );

      setDatasheetProgress(
        0
      );

      setDatasheetUploadedCount(
        0
      );

      setDatasheetFailedCount(
        0
      );

      setDatasheetMessage(
        `Starting upload and AI processing of ${resolvedItems.length.toLocaleString()} PDFs...`
      );

      const workingItems =
        resolvedItems.map(
          (item) => ({
            ...item,
            status:
              'PENDING' as DatasheetStatus,
            error:
              undefined,
            datasheetId:
              undefined,
          })
        );

      setDatasheetFiles(
        workingItems
      );

      let zip:
        JSZip | null =
        null;

      try {
        zip =
          await JSZip.loadAsync(
            selectedZipFile
          );
      } catch (
        error
      ) {
        setIsUploadingDatasheets(
          false
        );

        addToast({
          title:
            'ZIP Read Failed',
          message:
            error instanceof Error
              ? error.message
              : 'The ZIP could not be reopened.',
          type:
            'error',
        });

        return;
      }

      let nextIndex = 0;
      let completed = 0;
      let successful = 0;
      let failed = 0;

      const total =
        workingItems.length;

      const processOne =
        async (
          index: number
        ) => {
          const item =
            workingItems[
              index
            ];

          if (!item) {
            return;
          }

          workingItems[
            index
          ] = {
            ...item,
            status:
              'UPLOADING',
          };

          setDatasheetFiles([
            ...workingItems,
          ]);

          try {
            const zipEntry =
              zip?.files[
                item.relativePath
              ];

            if (!zipEntry) {
              throw new Error(
                `PDF not found inside ZIP: ${item.relativePath}`
              );
            }

            const blob =
              await zipEntry.async(
                'blob'
              );

            const pdfFile =
              new File(
                [blob],
                item.fileName,
                {
                  type:
                    'application/pdf',
                }
              );

            if (
              pdfFile.size >
              MAX_SINGLE_PDF_SIZE
            ) {
              throw new Error(
                `PDF exceeds the ${formatBytes(
                  MAX_SINGLE_PDF_SIZE
                )} single-file limit.`
              );
            }

            workingItems[
              index
            ] = {
              ...workingItems[
                index
              ],
              size:
                pdfFile.size,
            };

            const uploadResult =
              await uploadDatasheetFile(
                pdfFile,
                workingItems[
                  index
                ],
                selectedZipFile.name
              );

            if (
              !uploadResult.success ||
              !uploadResult.datasheetId
            ) {
              throw new Error(
                uploadResult.error ||
                  'PDF upload failed.'
              );
            }

            const datasheetId =
              uploadResult.datasheetId;

            workingItems[
              index
            ] = {
              ...workingItems[
                index
              ],
              status:
                'PROCESSING',
              storagePath:
                uploadResult.storagePath,
              datasheetId,
            };

            setDatasheetFiles([
              ...workingItems,
            ]);

            const processing =
              await processDatasheet(
                datasheetId
              );

            if (
              !processing.success
            ) {
              throw new Error(
                processing.error ||
                  'Datasheet processing failed.'
              );
            }

            successful++;

            workingItems[
              index
            ] = {
              ...workingItems[
                index
              ],
              status:
                'PROCESSED',
              storagePath:
                uploadResult.storagePath,
              datasheetId,
            };
          } catch (
            error
          ) {
            failed++;

            workingItems[
              index
            ] = {
              ...workingItems[
                index
              ],
              status:
                'FAILED',
              error:
                error instanceof Error
                  ? error.message
                  : 'Upload/processing failed.',
            };

            console.error(
              `ZIP datasheet failed: ${item.relativePath}`,
              error
            );
          }

          completed++;

          setDatasheetUploadedCount(
            successful
          );

          setDatasheetFailedCount(
            failed
          );

          setDatasheetProgress(
            Math.round(
              (
                completed /
                total
              ) *
                100
            )
          );

          setDatasheetMessage(
            `${completed.toLocaleString()} of ${total.toLocaleString()} processed • ${successful.toLocaleString()} successful • ${failed.toLocaleString()} failed`
          );

          setDatasheetFiles([
            ...workingItems,
          ]);
        };

      const worker =
        async () => {
          while (true) {
            const index =
              nextIndex++;

            if (
              index >=
              workingItems.length
            ) {
              return;
            }

            await processOne(
              index
            );
          }
        };

      const workerCount =
        Math.min(
          DATASHEET_UPLOAD_CONCURRENCY,
          workingItems.length
        );

      try {
        await Promise.all(
          Array.from(
            {
              length:
                workerCount,
            },
            () =>
              worker()
          )
        );
      } finally {
        setIsUploadingDatasheets(
          false
        );
      }

      setDatasheetProgress(
        100
      );

      if (failed === 0) {
        setDatasheetMessage(
          `${successful.toLocaleString()} PDFs uploaded, processed and embedded successfully.`
        );

        addToast({
          title:
            'Bulk Datasheet Processing Complete',
          message:
            `${successful.toLocaleString()} PDF files completed successfully.`,
          type:
            'success',
        });
      } else {
        setDatasheetMessage(
          `${successful.toLocaleString()} processed successfully and ${failed.toLocaleString()} failed.`
        );

        addToast({
          title:
            'Bulk Processing Completed With Errors',
          message:
            `${successful.toLocaleString()} PDFs completed and ${failed.toLocaleString()} failed.`,
          type:
            'warning',
        });
      }
    };

  /* =========================================================
     DATASET RESET
  ========================================================= */

  const resetDatasetWizard =
    () => {
      setStep(1);
      setSelectedCPSE(
        'ALL COMPANIES'
      );
      setSelectedFile(
        null
      );
      setFileName('');
      setIsDragging(false);
      setSourceHeaders([]);
      setSourceRows([]);
      setMappings([]);
      setStandardizedRows([]);
      setIsAnalyzing(false);
      setIsNormalizing(false);
      setNormalizationProgress(
        0
      );
      setIsImporting(false);
      setValidationErrors([]);
      setValidationWarnings([]);
      setInsertedCount(0);
    };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* =====================================================
          MODE SELECTOR
      ===================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

          <button
            type="button"
            onClick={() =>
              setUploadMode(
                'dataset'
              )
            }
            className={`p-4 rounded-xl text-left transition-all ${
              uploadMode ===
              'dataset'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">

              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  uploadMode ===
                  'dataset'
                    ? 'bg-emerald-500/15'
                    : 'bg-slate-100'
                }`}
              >
                <FileSpreadsheet
                  className={`w-5 h-5 ${
                    uploadMode ===
                    'dataset'
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }`}
                />
              </div>

              <div>
                <div className="text-sm font-black">
                  Material Dataset
                </div>

                <div
                  className={`text-[10px] mt-1 ${
                    uploadMode ===
                    'dataset'
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  CSV / XLS / XLSX → AI normalization → materials
                </div>
              </div>

            </div>
          </button>


          <button
            type="button"
            onClick={() =>
              setUploadMode(
                'datasheet'
              )
            }
            className={`p-4 rounded-xl text-left transition-all ${
              uploadMode ===
              'datasheet'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">

              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  uploadMode ===
                  'datasheet'
                    ? 'bg-white/15'
                    : 'bg-slate-100'
                }`}
              >
                <FileArchive
                  className={`w-5 h-5 ${
                    uploadMode ===
                    'datasheet'
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                />
              </div>

              <div>
                <div className="text-sm font-black">
                  PDF / ZIP Datasheets
                </div>

                <div
                  className={`text-[10px] mt-1 ${
                    uploadMode ===
                    'datasheet'
                      ? 'text-emerald-50'
                      : 'text-slate-500'
                  }`}
                >
                  Auto company detection → upload → AI processing
                </div>
              </div>

            </div>
          </button>

        </div>
      </div>


      {/* =====================================================
          DATASHEET MODE
      ===================================================== */}

      {uploadMode ===
        'datasheet' && (

        <div className="space-y-5">

          {/* HEADER */}

          <div className="bg-gradient-to-r from-[#001f3f] to-[#003b68] text-white rounded-2xl p-5">

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <span className="px-2 py-1 rounded-full bg-amber-400/10 border border-amber-300/30 text-amber-200 text-[9px] font-black uppercase tracking-wider">
                    AI DATASHEET INGESTION
                  </span>

                  <span className="text-[10px] text-slate-300 font-mono">
                    PDF + ZIP
                  </span>

                </div>

                <h1 className="text-xl font-bold tracking-tight mt-2">
                  Upload Datasheet Library
                </h1>

                <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                  Company detection is automatic. The system reads the PDF filename or ZIP folder structure, resolves the correct CPSE, stores the PDF and starts AI processing.
                </p>

              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold">

                <Database className="w-4 h-4" />

                Supabase + Gemini AI

              </div>

            </div>

          </div>


          {/* AUTOMATIC DETECTION */}

          <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm">

            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">

                <Sparkles className="w-5 h-5 text-emerald-600" />

              </div>

              <div>

                <h2 className="text-sm font-black text-slate-900">
                  Automatic Company Detection
                </h2>

                <p className="text-xs text-slate-500 mt-1 leading-relaxed">

                  The system automatically recognizes companies such as

                  <span className="font-bold text-slate-700">
                    {' '}IOCL, BPCL, HPCL, BHEL, ONGC, NTPC, SAIL, GAIL, CIL and CPCL.
                  </span>

                </p>

                <p className="text-[10px] text-slate-400 font-mono mt-2">

                  Example:
                  Step01_IOCL_Haldia_4834093524.pdf

                </p>

                <div className="flex flex-wrap gap-2 mt-3">

                  {datasheetCompanyOptions.map(
                    (company) => (
                      <span
                        key={company}
                        className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[9px] font-black text-slate-600"
                      >
                        {company}
                      </span>
                    )
                  )}

                </div>

              </div>

            </div>

          </div>


          {/* UPLOAD CARDS */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* SINGLE PDF */}

            <label className="bg-white rounded-2xl border border-slate-200 p-6 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all">

              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={
                  isScanningZip ||
                  isUploadingDatasheets
                }
                onChange={
                  (event) => {
                    const file =
                      event
                        .target
                        .files?.[0];

                    event.currentTarget.value =
                      '';

                    if (file) {
                      handleSinglePdf(
                        file
                      );
                    }
                  }
                }
              />

              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">

                <FileText className="w-6 h-6 text-blue-700" />

              </div>

              <h3 className="text-sm font-black text-slate-900 mt-4">
                Upload Single PDF
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Company is detected automatically from the filename.
              </p>

              <div className="mt-4 text-[10px] text-slate-400 font-mono">
                Maximum size: 100 MB
              </div>

            </label>


            {/* ZIP */}

            <label className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-6 cursor-pointer hover:border-amber-500 hover:bg-amber-50/20 transition-all">

              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                disabled={
                  isScanningZip ||
                  isUploadingDatasheets
                }
                onChange={
                  (event) => {
                    const file =
                      event
                        .target
                        .files?.[0];

                    event.currentTarget.value =
                      '';

                    if (file) {
                      void scanDatasheetZip(
                        file
                      );
                    }
                  }
                }
              />

              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">

                {isScanningZip ? (
                  <Loader2 className="w-6 h-6 text-amber-700 animate-spin" />
                ) : (
                  <FileArchive className="w-6 h-6 text-amber-700" />
                )}

              </div>

              <h3 className="text-sm font-black text-slate-900 mt-4">
                Upload ZIP Bundle
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Company is detected from folder names or filenames for every PDF.
              </p>

              <div className="mt-4 text-[10px] text-slate-400 font-mono">
                Maximum ZIP size: 500 MB
              </div>

            </label>

          </div>


          {/* ZIP SELECTED */}

          {selectedZipName && (

            <div className="bg-white rounded-2xl border border-slate-200 p-5">

              <div className="flex items-center justify-between gap-3">

                <div className="flex items-center gap-3">

                  <FolderOpen className="w-5 h-5 text-amber-600" />

                  <div>

                    <div className="text-xs font-black text-slate-900">
                      {selectedZipName}
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      Recursive PDF discovery completed • automatic company detection enabled
                    </div>

                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    resetDatasheetUploader
                  }
                  disabled={
                    isUploadingDatasheets
                  }
                  className="text-xs font-bold text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Clear
                </button>

              </div>

            </div>

          )}


          {/* SINGLE PDF SELECTED */}

          {selectedDatasheetPdf && (

            <div className="bg-white rounded-2xl border border-blue-200 p-5">

              <div className="flex items-center justify-between gap-3">

                <div className="flex items-center gap-3">

                  <FileText className="w-5 h-5 text-blue-600" />

                  <div>

                    <div className="text-xs font-black text-slate-900">
                      {selectedDatasheetPdf.name}
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {formatBytes(
                        selectedDatasheetPdf.size
                      )}
                    </div>

                    {datasheetFiles[0]?.company && (

                      <div className="text-[10px] font-black text-emerald-700 mt-1">

                        Detected Company:
                        {' '}
                        {datasheetFiles[0].company}

                      </div>

                    )}

                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    resetDatasheetUploader
                  }
                  disabled={
                    isUploadingDatasheets
                  }
                  className="text-xs font-bold text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Clear
                </button>

              </div>

            </div>

          )}


          {/* STATS */}

          {datasheetFiles.length >
            0 && (

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">

              <MiniStat
                label="PDFs Found"
                value={
                  datasheetFiles.length
                }
              />

              <MiniStat
                label="Pending"
                value={
                  datasheetFiles.filter(
                    (item) =>
                      item.status ===
                      'PENDING'
                  ).length
                }
              />

              <MiniStat
                label="Uploading"
                value={
                  datasheetFiles.filter(
                    (item) =>
                      item.status ===
                      'UPLOADING'
                  ).length
                }
              />

              <MiniStat
                label="Processing"
                value={
                  datasheetFiles.filter(
                    (item) =>
                      item.status ===
                      'PROCESSING'
                  ).length
                }
              />

              <MiniStat
                label="Processed"
                value={
                  datasheetFiles.filter(
                    (item) =>
                      item.status ===
                      'PROCESSED'
                  ).length
                }
              />

              <MiniStat
                label="Failed"
                value={
                  datasheetFailedCount
                }
                danger={
                  datasheetFailedCount >
                  0
                }
              />

            </div>

          )}


          {/* PROGRESS */}

          {(isScanningZip ||
            isUploadingDatasheets ||
            datasheetProgress >
              0) && (

            <div className="bg-white rounded-2xl border border-slate-200 p-5">

              <div className="flex items-center justify-between">

                <div className="flex items-center gap-2">

                  <Activity className="w-4 h-4 text-emerald-600" />

                  <span className="text-xs font-black text-slate-900">

                    {isScanningZip
                      ? 'Scanning ZIP...'
                      : isUploadingDatasheets
                      ? 'Uploading + AI processing datasheets...'
                      : 'Processing complete'}

                  </span>

                </div>

                <span className="text-xs font-mono font-black text-emerald-700">
                  {datasheetProgress}%
                </span>

              </div>

              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">

                <motion.div
                  className="h-full bg-emerald-600"
                  initial={{
                    width:
                      '0%',
                  }}
                  animate={{
                    width:
                      `${datasheetProgress}%`,
                  }}
                  transition={{
                    duration:
                      0.2,
                  }}
                />

              </div>

            </div>

          )}


          {/* MESSAGE */}

          {datasheetMessage && (

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

              <div className="flex items-start gap-3">

                {datasheetFailedCount >
                0 ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                )}

                <div>

                  <div className="text-xs font-black text-slate-900">
                    Datasheet Processing Status
                  </div>

                  <p className="text-[11px] text-slate-600 mt-1">
                    {datasheetMessage}
                  </p>

                </div>

              </div>

            </div>

          )}


          {/* DISCOVERED FILES */}

          {datasheetFiles.length >
            0 && (

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">

                <div className="flex items-center justify-between gap-3">

                  <div>

                    <h3 className="text-sm font-black text-slate-900">
                      Discovered PDF Datasheets
                    </h3>

                    <p className="text-[10px] text-slate-500 mt-1">
                      Company is determined automatically and stored with each datasheet.
                    </p>

                  </div>

                  <FileArchive className="w-5 h-5 text-slate-400" />

                </div>

              </div>

              <div className="max-h-[500px] overflow-auto">

                <table className="w-full text-left text-xs">

                  <thead className="bg-white sticky top-0 border-b border-slate-200 z-10">

                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">

                      <th className="px-4 py-3">
                        PDF
                      </th>

                      <th className="px-4 py-3">
                        Folder
                      </th>

                      <th className="px-4 py-3">
                        Company
                      </th>

                      <th className="px-4 py-3">
                        Status
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {datasheetFiles
                      .slice(0, 1500)
                      .map(
                        (item) => (

                          <tr
                            key={
                              item.id
                            }
                            className="hover:bg-slate-50"
                          >

                            <td className="px-4 py-3">

                              <div className="flex items-center gap-2">

                                <FileText className="w-4 h-4 text-red-500 shrink-0" />

                                <div className="min-w-0">

                                  <div className="font-bold text-slate-800 truncate max-w-[320px]">
                                    {
                                      item.fileName
                                    }
                                  </div>

                                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {formatBytes(
                                      item.size
                                    )}
                                  </div>

                                  {item.datasheetId && (

                                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                      ID #
                                      {
                                        item.datasheetId
                                      }
                                    </div>

                                  )}

                                </div>

                              </div>

                            </td>


                            <td className="px-4 py-3 text-slate-500">

                              <div className="flex items-center gap-1.5">

                                <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                                <span className="truncate max-w-[300px]">
                                  {
                                    item.folderPath ||
                                    'ZIP root'
                                  }
                                </span>

                              </div>

                            </td>


                            <td className="px-4 py-3">

                              <span
                                className={`inline-flex px-2 py-1 rounded-md text-[10px] font-black ${
                                  item.company
                                    ? 'bg-blue-50 border border-blue-100 text-blue-700'
                                    : 'bg-amber-50 border border-amber-200 text-amber-700'
                                }`}
                              >
                                {
                                  item.company ||
                                  'NOT DETECTED'
                                }
                              </span>

                            </td>


                            <td className="px-4 py-3">

                              <DatasheetStatusBadge
                                status={
                                  item.status
                                }
                              />

                              {item.error && (

                                <div className="text-[9px] text-red-600 mt-1 max-w-[320px]">
                                  {
                                    item.error
                                  }
                                </div>

                              )}

                            </td>

                          </tr>

                        )
                      )}

                  </tbody>

                </table>

              </div>

              {datasheetFiles.length >
                1500 && (

                <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-400">
                  Showing first 1,500 of{' '}
                  {
                    datasheetFiles.length
                  }{' '}
                  PDFs.
                </div>

              )}

            </div>

          )}


          {/* ACTIONS */}

          <div className="flex items-center justify-end gap-3">

            {(selectedDatasheetPdf ||
              selectedZipFile) && (

              <button
                type="button"
                onClick={
                  resetDatasheetUploader
                }
                disabled={
                  isUploadingDatasheets
                }
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-50"
              >
                Reset
              </button>

            )}


            {selectedDatasheetPdf && (

              <button
                type="button"
                onClick={() =>
                  void uploadSingleDatasheet()
                }
                disabled={
                  isUploadingDatasheets ||
                  isScanningZip ||
                  datasheetFiles[0]
                    ?.status ===
                    'PROCESSED'
                }
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
              >

                {isUploadingDatasheets ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Upload + Process PDF
                  </>
                )}

              </button>

            )}


            {selectedZipFile &&
              datasheetFiles.length >
                0 && (

              <button
                type="button"
                onClick={() =>
                  void uploadZipDatasheets()
                }
                disabled={
                  isUploadingDatasheets ||
                  isScanningZip ||
                  datasheetFiles.every(
                    (item) =>
                      item.status ===
                      'PROCESSED'
                  )
                }
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
              >

                {isUploadingDatasheets ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing {datasheetProgress}%
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Upload + Process All PDFs
                  </>
                )}

              </button>

            )}

          </div>


          {/* HOW IT WORKS */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            <InfoCard
              icon={
                <Sparkles className="w-4 h-4 text-amber-600" />
              }
              title="1. Automatic Company Detection"
              text="The system reads company names and CPSE codes from PDF filenames and ZIP folder paths."
            />

            <InfoCard
              icon={
                <Database className="w-4 h-4 text-blue-600" />
              }
              title="2. Supabase Storage"
              text="Every PDF is stored as its own object and registered in the datasheets table."
            />

            <InfoCard
              icon={
                <Sparkles className="w-4 h-4 text-emerald-600" />
              }
              title="3. Automatic AI Processing"
              text="The backend extracts material information and generates Gemini embeddings for semantic search."
            />

          </div>

        </div>

      )}


      {/* =====================================================
          DATASET MODE
      ===================================================== */}

      {uploadMode ===
        'dataset' && (

        <>

          {/* HEADER */}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                    AI DATA INGESTION
                  </span>

                  <span className="text-xs text-slate-400 font-mono">
                    Step {step} of 6
                  </span>

                </div>

                <h1 className="text-xl font-bold text-white tracking-tight mt-1">
                  AI-Powered Material Data Ingestion
                </h1>

                <p className="text-xs text-slate-300 mt-1 max-w-3xl">
                  Upload messy CPSE material spreadsheets, identify their schema, normalize material data with AI, validate the result, and publish it into the Supabase material database.
                </p>

              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">

                <Database className="w-4 h-4" />

                Supabase Connected

              </div>

            </div>

          </div>


          {/* STEPPER */}

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">

            <div className="flex items-center justify-between overflow-x-auto gap-2 text-xs">

              {[
                'Source',
                'Upload',
                'AI Mapping',
                'Validation',
                'Preview',
                'Database',
              ].map(
                (
                  label,
                  index
                ) => {

                  const number =
                    index + 1;

                  return (

                    <div
                      key={
                        label
                      }
                      className={`flex items-center gap-2 whitespace-nowrap ${
                        step ===
                        number
                          ? 'text-emerald-700 font-bold'
                          : step >
                            number
                          ? 'text-emerald-600 font-semibold'
                          : 'text-slate-400'
                      }`}
                    >

                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                          step ===
                          number
                            ? 'bg-emerald-600 text-white'
                            : step >
                              number
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >

                        {step >
                        number
                          ? '✓'
                          : number}

                      </div>

                      {label}

                    </div>

                  );
                }
              )}

            </div>

          </div>


          {/* STEP 1 */}

          {step ===
            1 && (

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Select Source Company
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Select one company or use ALL COMPANIES for a multi-company dataset.
                </p>

              </div>


              <button
                type="button"
                onClick={() =>
                  setSelectedCPSE(
                    'ALL COMPANIES'
                  )
                }
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  selectedCPSE ===
                  'ALL COMPANIES'
                    ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">

                      <Layers className="w-5 h-5 text-blue-700" />

                    </div>

                    <div>

                      <span className="font-black text-sm text-slate-900">
                        ALL COMPANIES
                      </span>

                      <p className="text-xs text-slate-600 mt-0.5">
                        Universal multi-company material database
                      </p>

                    </div>

                  </div>

                </div>

              </button>


              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                {uploadCompanyOptions
                  .filter(
                    (company) =>
                      company !==
                      'ALL COMPANIES'
                  )
                  .map(
                    (
                      companyCode
                    ) => {

                      const company =
                        currentCompanyRecord(
                          companyRecords,
                          companyCode
                        );

                      return (

                        <button
                          key={
                            companyCode
                          }
                          type="button"
                          onClick={() =>
                            setSelectedCPSE(
                              companyCode
                            )
                          }
                          className={`p-4 rounded-xl border text-left transition-all ${
                            selectedCPSE ===
                            companyCode
                              ? 'border-emerald-600 bg-emerald-50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >

                          <div className="flex items-center justify-between">

                            <span className="font-bold text-sm text-slate-900">
                              {
                                companyCode
                              }
                            </span>

                            <Building className="w-4 h-4 text-slate-400" />

                          </div>

                          <p className="text-xs text-slate-600 mt-1">
                            {company?.name ||
                              'Company material database'}
                          </p>

                        </button>

                      );

                    }
                  )}

              </div>


              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">

                <div className="flex items-start gap-3">

                  <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5" />

                  <div>

                    <p className="text-sm font-bold text-amber-900">
                      Data safety
                    </p>

                    <p className="text-xs text-amber-800 mt-1">
                      In ALL COMPANIES mode, the Company column controls the company assignment for every row.
                    </p>

                  </div>

                </div>

              </div>


              <div className="flex justify-end pt-4 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setStep(2)
                  }
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  Continue

                  <ChevronRight className="w-4 h-4" />

                </button>

              </div>

            </div>

          )}


          {/* STEP 2 */}

          {step ===
            2 && (

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

              <div>

                <h2 className="text-base font-bold text-slate-900">

                  Upload{' '}

                  {selectedCPSE ===
                  'ALL COMPANIES'
                    ? 'Multi-Company'
                    : selectedCPSE}{' '}

                  Material Dataset

                </h2>

                <p className="text-xs text-slate-500 mt-1">

                  {selectedCPSE ===
                  'ALL COMPANIES'
                    ? 'The Company column will determine the actual CPSE for every row.'
                    : 'Upload a messy CSV or Excel material master.'}

                </p>

              </div>


              <label
                onDragOver={(event) => {

                  event.preventDefault();

                  setIsDragging(
                    true
                  );

                }}
                onDragLeave={() =>
                  setIsDragging(
                    false
                  )
                }
                onDrop={(event) => {

                  event.preventDefault();

                  setIsDragging(
                    false
                  );

                  const file =
                    event.dataTransfer
                      .files?.[0];

                  if (
                    file
                  ) {

                    void handleDatasetFile(
                      file
                    );

                  }

                }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all block ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-300 bg-slate-50/50 hover:border-emerald-500'
                }`}
              >

                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(event) => {

                    const file =
                      event.target
                        .files?.[0];

                    if (
                      file
                    ) {
                      void handleDatasetFile(
                        file
                      );
                    }

                    event.currentTarget.value =
                      '';

                  }}
                />

                <UploadCloud className="w-12 h-12 mx-auto text-slate-400 mb-4" />

                <p className="text-sm font-bold text-slate-900">
                  Drop Excel or CSV file here
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  or click to browse
                </p>

                {fileName && (

                  <div className="mt-5 inline-flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono">

                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />

                    <span className="max-w-[400px] truncate">
                      {
                        fileName
                      }
                    </span>

                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />

                  </div>

                )}

              </label>


              {sourceRows.length >
                0 && (

                <>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                    <StatCard
                      title="Rows Detected"
                      value={
                        sourceRows.length
                      }
                    />

                    <StatCard
                      title="Columns Detected"
                      value={
                        sourceHeaders.length
                      }
                    />

                    <StatCard
                      title="Selected Company"
                      value={
                        selectedCPSE
                      }
                      text
                    />

                  </div>


                  <div className="rounded-xl border border-slate-200 overflow-hidden">

                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">

                      <p className="text-xs font-bold text-slate-700">
                        Raw Data Preview
                      </p>

                      <p className="text-[11px] text-slate-500 mt-1">
                        First 10 records detected.
                      </p>

                    </div>

                    <div className="overflow-auto max-h-[420px]">

                      <table className="w-full text-left text-xs">

                        <thead className="bg-white border-b border-slate-200 sticky top-0">

                          <tr>

                            {sourceHeaders
                              .slice(
                                0,
                                10
                              )
                              .map(
                                (
                                  header
                                ) => (

                                  <th
                                    key={
                                      header
                                    }
                                    className="p-3 font-bold text-slate-700 whitespace-nowrap"
                                  >
                                    {
                                      header
                                    }
                                  </th>

                                )
                              )}

                          </tr>

                        </thead>

                        <tbody className="divide-y divide-slate-100">

                          {sourceRows
                            .slice(
                              0,
                              10
                            )
                            .map(
                              (
                                row,
                                rowIndex
                              ) => (

                                <tr
                                  key={
                                    rowIndex
                                  }
                                >

                                  {sourceHeaders
                                    .slice(
                                      0,
                                      10
                                    )
                                    .map(
                                      (
                                        header
                                      ) => (

                                        <td
                                          key={
                                            header
                                          }
                                          className="p-3 text-slate-600 align-top min-w-[160px] max-w-[350px]"
                                        >

                                          <div className="whitespace-pre-wrap break-words">
                                            {
                                              row[
                                                header
                                              ] ||
                                              '—'
                                            }
                                          </div>

                                        </td>

                                      )
                                    )}

                                </tr>

                              )
                            )}

                        </tbody>

                      </table>

                    </div>

                  </div>

                </>

              )}


              <div className="flex items-center justify-between pt-4 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setStep(
                      1
                    )
                  }
                  className="text-xs font-semibold text-slate-600 flex items-center gap-1"
                >

                  <ChevronLeft className="w-4 h-4" />

                  Back

                </button>


                <button
                  type="button"
                  disabled={
                    !selectedFile ||
                    sourceRows.length ===
                      0 ||
                    isAnalyzing
                  }
                  onClick={() =>
                    void analyzeSchema()
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      AI Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyze with AI
                    </>
                  )}

                </button>

              </div>

            </div>

          )}


          {/* STEP 3 */}

          {step ===
            3 && (

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

              <div className="flex items-center justify-between gap-4">

                <div>

                  <h2 className="text-base font-bold text-slate-900">
                    AI Schema Mapping
                  </h2>

                  <p className="text-xs text-slate-500 mt-1">
                    The AI has identified how uploaded fields map to the standard material structure.
                  </p>

                </div>

                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">

                  <Cpu className="w-5 h-5 text-indigo-600" />

                </div>

              </div>


              <div className="overflow-auto border border-slate-200 rounded-xl">

                <table className="w-full text-left text-xs">

                  <thead className="bg-slate-50 border-b border-slate-200">

                    <tr>

                      <th className="p-3">
                        Source Column
                      </th>

                      <th className="p-3">
                        Standard Field
                      </th>

                      <th className="p-3">
                        Confidence
                      </th>

                      <th className="p-3">
                        Reason
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {mappings.map(
                      (
                        mapping
                      ) => (

                        <tr
                          key={
                            mapping.sourceColumn
                          }
                        >

                          <td className="p-3 font-mono font-bold text-slate-800">
                            {
                              mapping.sourceColumn
                            }
                          </td>

                          <td className="p-3">

                            <span
                              className={`px-2 py-1 rounded text-[10px] font-mono ${
                                mapping.targetColumn ===
                                'unmapped'
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {
                                mapping.targetColumn
                              }
                            </span>

                          </td>

                          <td className="p-3 font-mono font-bold">
                            {
                              mapping.confidence
                            }%
                          </td>

                          <td className="p-3 text-slate-500 max-w-[450px]">
                            {
                              mapping.reason
                            }
                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>


              {isNormalizing && (

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-2">

                      <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />

                      <p className="text-sm font-bold text-emerald-900">
                        AI Normalizing Material Data
                      </p>

                    </div>

                    <span className="text-xs font-mono font-bold text-emerald-700">
                      {
                        normalizationProgress
                      }%
                    </span>

                  </div>

                  <div className="mt-3 h-2 bg-emerald-100 rounded-full overflow-hidden">

                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{
                        width:
                          `${normalizationProgress}%`,
                      }}
                    />

                  </div>

                </div>

              )}


              <div className="flex items-center justify-between pt-4 border-t border-slate-100">

                <button
                  type="button"
                  disabled={
                    isNormalizing
                  }
                  onClick={() =>
                    setStep(
                      2
                    )
                  }
                  className="text-xs font-semibold text-slate-600 disabled:opacity-50 flex items-center gap-1"
                >

                  <ChevronLeft className="w-4 h-4" />

                  Back

                </button>


                <button
                  type="button"
                  disabled={
                    mappings.length ===
                      0 ||
                    isNormalizing
                  }
                  onClick={() =>
                    void normalizeAndValidate()
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  {isNormalizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Normalizing {normalizationProgress}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Normalize & Validate
                    </>
                  )}

                </button>

              </div>

            </div>

          )}


          {/* STEP 4 */}

          {step ===
            4 && (

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  AI Data Validation
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  AI-normalized records are checked before database insertion.
                </p>

              </div>


              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <StatCard
                  title="Rows"
                  value={
                    standardizedRows.length
                  }
                />

                <StatCard
                  title="Errors"
                  value={
                    validationErrors.length
                  }
                  danger={
                    validationErrors.length >
                    0
                  }
                />

                <StatCard
                  title="Warnings"
                  value={
                    validationWarnings.length
                  }
                  warning={
                    validationWarnings.length >
                    0
                  }
                />

              </div>


              {validationErrors.length ===
                0 && (

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                  <div className="flex items-center gap-2">

                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />

                    <div>

                      <p className="text-sm font-bold text-emerald-900">
                        No blocking validation errors
                      </p>

                      <p className="text-xs text-emerald-800 mt-1">
                        The dataset can proceed to preview.
                      </p>

                    </div>

                  </div>

                </div>

              )}


              {validationErrors.length >
                0 && (

                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">

                  <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">

                    <XCircle className="w-4 h-4" />

                    Validation Errors

                  </div>

                  <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">

                    {validationErrors
                      .slice(0, 50)
                      .map(
                        (
                          error
                        ) => (

                          <p
                            key={
                              error
                            }
                            className="text-xs text-rose-700"
                          >
                            {
                              error
                            }
                          </p>

                        )
                      )}

                  </div>

                </div>

              )}


              {validationWarnings.length >
                0 && (

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">

                  <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">

                    <AlertTriangle className="w-4 h-4" />

                    Validation Warnings

                  </div>

                  <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">

                    {validationWarnings
                      .slice(0, 50)
                      .map(
                        (
                          warning
                        ) => (

                          <p
                            key={
                              warning
                            }
                            className="text-xs text-amber-700"
                          >
                            {
                              warning
                            }
                          </p>

                        )
                      )}

                  </div>

                </div>

              )}


              <div className="flex items-center justify-between pt-4 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setStep(
                      3
                    )
                  }
                  className="text-xs font-semibold text-slate-600 flex items-center gap-1"
                >

                  <ChevronLeft className="w-4 h-4" />

                  Back

                </button>


                <button
                  type="button"
                  disabled={
                    validationErrors.length >
                    0
                  }
                  onClick={() =>
                    setStep(
                      5
                    )
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  Preview Standardization

                  <ChevronRight className="w-4 h-4" />

                </button>

              </div>

            </div>

          )}


          {/* STEP 5 */}

          {step ===
            5 && (

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  AI-Standardized Data Preview
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Review the AI-normalized records before insertion.
                </p>

              </div>


              <div className="overflow-auto border border-slate-200 rounded-xl max-h-[550px]">

                <table className="w-full text-left text-xs">

                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">

                    <tr>

                      <th className="p-3">
                        Company
                      </th>

                      <th className="p-3">
                        Material Number
                      </th>

                      <th className="p-3">
                        Description
                      </th>

                      <th className="p-3">
                        Specifications
                      </th>

                      <th className="p-3">
                        Category
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {standardizedRows
                      .slice(0, 50)
                      .map(
                        (
                          row,
                          index
                        ) => (

                          <tr
                            key={
                              index
                            }
                          >

                            <td className="p-3 font-bold text-slate-800">
                              {
                                row.company
                              }
                            </td>

                            <td className="p-3 font-mono">
                              {
                                row.material_number ||
                                'N/A'
                              }
                            </td>

                            <td className="p-3 text-slate-600">
                              {
                                row.description ||
                                'N/A'
                              }
                            </td>

                            <td className="p-3 text-slate-600">
                              {
                                row.specifications ||
                                'N/A'
                              }
                            </td>

                            <td className="p-3 text-slate-600">
                              {
                                row.category ||
                                'N/A'
                              }
                            </td>

                          </tr>

                        )
                      )}

                  </tbody>

                </table>

              </div>


              <p className="text-[11px] text-slate-400">
                Showing first{' '}
                {
                  Math.min(
                    50,
                    standardizedRows.length
                  )
                }{' '}
                of{' '}
                {
                  standardizedRows.length
                }{' '}
                records.
              </p>


              <div className="flex items-center justify-between pt-4 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setStep(
                      4
                    )
                  }
                  className="text-xs font-semibold text-slate-600 flex items-center gap-1"
                >

                  <ChevronLeft className="w-4 h-4" />

                  Back

                </button>


                <button
                  type="button"
                  onClick={() =>
                    void importToSupabase()
                  }
                  disabled={
                    isImporting ||
                    standardizedRows.length ===
                      0
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Import Into Supabase
                    </>
                  )}

                </button>

              </div>

            </div>

          )}


          {/* STEP 6 */}

          {step ===
            6 && (

            <motion.div
              initial={{
                opacity: 0,
                y: 15,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6"
            >

              <div className="text-center">

                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">

                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />

                </div>

                <h2 className="text-xl font-bold text-slate-900 mt-4">
                  Database Update Successful
                </h2>

                <p className="text-sm text-slate-500 mt-2">
                  The AI-standardized material dataset has been inserted into Supabase.
                </p>

              </div>


              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">

                <StatCard
                  title="Rows Imported"
                  value={
                    insertedCount
                  }
                />

                <StatCard
                  title="Company Scope"
                  value={
                    selectedCPSE
                  }
                  text
                />

                <StatCard
                  title="Database"
                  value="Supabase"
                  text
                />

              </div>


              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 max-w-3xl mx-auto">

                <div className="flex items-start gap-3">

                  <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" />

                  <div>

                    <p className="text-sm font-bold text-emerald-900">
                      Live database ingestion complete
                    </p>

                    <p className="text-xs text-emerald-800 mt-1">
                      Material records were stored using their real company assignments.
                    </p>

                  </div>

                </div>

              </div>


              <div className="flex justify-center gap-3 pt-4 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setCurrentTab(
                      'master'
                    )
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >

                  Open Material Catalog

                  <ArrowRight className="w-4 h-4" />

                </button>


                <button
                  type="button"
                  onClick={
                    resetDatasetWizard
                  }
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 py-2.5 rounded-xl text-xs"
                >

                  Upload Another Dataset

                </button>

              </div>

            </motion.div>

          )}

        </>

      )}

    </div>
  );
};

/* =========================================================
   CURRENT COMPANY RECORD HELPER
========================================================= */

function currentCompanyRecord(
  companyRecords: any[],
  companyCode: string
) {
  return companyRecords.find(
    (item) =>
      item.code
        ?.trim()
        .toUpperCase() ===
      companyCode
  );
}

/* =========================================================
   FALLBACK MAPPING
========================================================= */

function createFallbackMappings(
  headers: string[]
): Mapping[] {
  return headers.map(
    (header) => {
      const value =
        header
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ''
          );

      if (
        value.includes(
          'materialnumber'
        ) ||
        value.includes(
          'materialno'
        ) ||
        value.includes(
          'materialcode'
        ) ||
        value.includes(
          'matnumber'
        ) ||
        value.includes(
          'matno'
        ) ||
        value.includes(
          'matcode'
        ) ||
        value.includes(
          'sapcode'
        ) ||
        value.includes(
          'sapno'
        ) ||
        value.includes(
          'itemcode'
        ) ||
        value.includes(
          'itemno'
        ) ||
        value.includes(
          'itemnumber'
        ) ||
        value.includes(
          'partnumber'
        ) ||
        value.includes(
          'partno'
        ) ||
        value ===
          'code' ||
        value.endsWith(
          'code'
        )
      ) {
        return {
          sourceColumn:
            header,

          targetColumn:
            'material_number',

          confidence:
            80,

          reason:
            'Column name resembles a material, SAP, item, part or code field.',
        };
      }

      if (
        value.includes(
          'description'
        ) ||
        value.includes(
          'desc'
        ) ||
        value.includes(
          'shorttext'
        ) ||
        value.includes(
          'longtext'
        ) ||
        value.includes(
          'itemdescription'
        ) ||
        value.includes(
          'materialdescription'
        ) ||
        value.includes(
          'materialdesc'
        ) ||
        value.includes(
          'itemdesc'
        ) ||
        value ===
          'name'
      ) {
        return {
          sourceColumn:
            header,

          targetColumn:
            'description',

          confidence:
            80,

          reason:
            'Column name resembles a material description or item text field.',
        };
      }

      if (
        value.includes(
          'specification'
        ) ||
        value.includes(
          'specifications'
        ) ||
        value.includes(
          'technical'
        ) ||
        value.includes(
          'technicalspec'
        ) ||
        value.includes(
          'longdescription'
        ) ||
        value.includes(
          'details'
        ) ||
        value.includes(
          'detail'
        )
      ) {
        return {
          sourceColumn:
            header,

          targetColumn:
            'specifications',

          confidence:
            80,

          reason:
            'Column name resembles a technical specification or detailed field.',
        };
      }

      if (
        value.includes(
          'category'
        ) ||
        value.includes(
          'materialgroup'
        ) ||
        value.includes(
          'materialtype'
        ) ||
        value.includes(
          'classification'
        ) ||
        value.includes(
          'class'
        ) ||
        value ===
          'group'
      ) {
        return {
          sourceColumn:
            header,

          targetColumn:
            'category',

          confidence:
            80,

          reason:
            'Column name resembles a material category, group or classification field.',
        };
      }

      if (
        value ===
          'company' ||
        value ===
          'companyname' ||
        value.includes(
          'company'
        ) ||
        value ===
          'cpse' ||
        value.includes(
          'organization'
        ) ||
        value.includes(
          'organisation'
        ) ||
        value.includes(
          'enterprise'
        )
      ) {
        return {
          sourceColumn:
            header,

          targetColumn:
            'unmapped',

          confidence:
            95,

          reason:
            'Company information is routing metadata and is handled separately.',
        };
      }

      return {
        sourceColumn:
          header,

        targetColumn:
          'unmapped',

        confidence:
          0,

        reason:
          'No reliable standard field was identified from the column name.',
      };
    }
  );
}

/* =========================================================
   NULLABLE CLEANER
========================================================= */

function nullableClean(
  value: unknown
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value)
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  if (
    !text ||
    text.toLowerCase() ===
      'null' ||
    text.toLowerCase() ===
      'n/a' ||
    text.toLowerCase() ===
      'na' ||
    text.toLowerCase() ===
      'none'
  ) {
    return null;
  }

  return text;
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  title,
  value,
  danger,
  warning,
  text,
}: {
  title: string;
  value: number | string;
  danger?: boolean;
  warning?: boolean;
  text?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-center ${
        danger
          ? 'bg-rose-50 border-rose-200'
          : warning
          ? 'bg-amber-50 border-amber-200'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      <p className="text-[10px] uppercase font-mono text-slate-500">
        {title}
      </p>

      <p
        className={`mt-1 font-bold ${
          text
            ? 'text-lg'
            : 'text-2xl'
        } ${
          danger
            ? 'text-rose-700'
            : warning
            ? 'text-amber-700'
            : 'text-slate-900'
        }`}
      >
        {typeof value ===
        'number'
          ? value.toLocaleString()
          : value}
      </p>
    </div>
  );
}

/* =========================================================
   MINI STAT
========================================================= */

function MiniStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger
          ? 'bg-rose-50 border-rose-200'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider font-black text-slate-500">
        {label}
      </div>

      <div
        className={`text-2xl font-black mt-1 ${
          danger
            ? 'text-rose-700'
            : 'text-slate-900'
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/* =========================================================
   DATASHEET STATUS BADGE
========================================================= */

function DatasheetStatusBadge({
  status,
}: {
  status: DatasheetStatus;
}) {
  if (
    status ===
    'UPLOADED'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[9px] font-black">
        <CheckCircle2 className="w-3 h-3" />
        UPLOADED
      </span>
    );
  }

  if (
    status ===
    'UPLOADING'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-black">
        <RefreshCw className="w-3 h-3 animate-spin" />
        UPLOADING
      </span>
    );
  }

  if (
    status ===
    'PROCESSING'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[9px] font-black">
        <Loader2 className="w-3 h-3 animate-spin" />
        PROCESSING
      </span>
    );
  }

  if (
    status ===
    'PROCESSED'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black">
        <CheckCircle2 className="w-3 h-3" />
        PROCESSED
      </span>
    );
  }

  if (
    status ===
    'FAILED'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-black">
        <XCircle className="w-3 h-3" />
        FAILED
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-black">
      PENDING
    </span>
  );
}

/* =========================================================
   INFO CARD
========================================================= */

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">

      <div className="flex items-center gap-2">

        {icon}

        <div className="text-xs font-black text-slate-900">
          {title}
        </div>

      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
        {text}
      </p>

    </div>
  );
}