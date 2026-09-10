import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { motion } from 'motion/react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../context/AppContext';

import {
  UploadCloud,
  FileArchive,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Building2,
  FolderOpen,
  Activity,
} from 'lucide-react';

type DatasheetCompanyMode =
  | 'AUTO'
  | string;

type DatasheetStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'UPLOADED'
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
  error?: string;
}

interface BulkDatasheetUploaderProps {
  companies?: string[];
}

const MAX_ZIP_SIZE =
  500 * 1024 * 1024;

const MAX_SINGLE_FILE_SIZE =
  100 * 1024 * 1024;

const UPLOAD_CONCURRENCY = 4;

function normalizePath(
  value: string
) {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function sanitizePathPart(
  value: string
) {
  return value
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '_');
}

function isPdfFile(
  fileName: string
) {
  return fileName
    .toLowerCase()
    .endsWith('.pdf');
}

function isDirectoryEntry(
  zipEntry: JSZip.JSZipObject
) {
  return zipEntry.dir;
}

function getFolderPath(
  relativePath: string
) {
  const normalized =
    normalizePath(relativePath);

  const parts =
    normalized.split('/');

  if (parts.length <= 1) {
    return '';
  }

  parts.pop();

  return parts.join('/');
}

function inferCompanyFromPath(
  relativePath: string,
  knownCompanies: string[]
) {
  const normalized =
    normalizePath(relativePath);

  const parts =
    normalized.split('/');

  if (parts.length <= 1) {
    return null;
  }

  const firstFolder =
    parts[0]
      ?.trim()
      .toUpperCase();

  if (!firstFolder) {
    return null;
  }

  const matchedCompany =
    knownCompanies.find(
      company =>
        company
          .trim()
          .toUpperCase() ===
        firstFolder
    );

  return (
    matchedCompany ||
    firstFolder
  );
}

function sanitizeStoragePath(
  value: string
) {
  return value
    .split('/')
    .map(part =>
      sanitizePathPart(part)
    )
    .filter(Boolean)
    .join('/');
}

function makeStoragePath(
  company: string | null,
  relativePath: string
) {
  const timestamp =
    Date.now();

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  const safeRelative =
    sanitizeStoragePath(
      relativePath
    );

  const safeCompany =
    sanitizePathPart(
      company || 'UNASSIGNED'
    );

  return `uploads/${safeCompany}/${timestamp}-${random}-${safeRelative}`;
}

export const BulkDatasheetUploader: React.FC<
  BulkDatasheetUploaderProps
> = ({
  companies = [],
}) => {
  const {
    addToast,
  } = useApp();

  const [selectedMode, setSelectedMode] =
    useState<
      DatasheetCompanyMode
    >('AUTO');

  const [selectedFiles, setSelectedFiles] =
    useState<FileItemState[]>([]);

  const [selectedZipName, setSelectedZipName] =
    useState('');

  const [isScanning, setIsScanning] =
    useState(false);

  const [isUploading, setIsUploading] =
    useState(false);

  const [overallProgress, setOverallProgress] =
    useState(0);

  const [uploadedCount, setUploadedCount] =
    useState(0);

  const [failedCount, setFailedCount] =
    useState(0);

  const [message, setMessage] =
    useState<string | null>(null);

  const knownCompanies =
    useMemo(() => {
      const result: string[] = [];

      companies.forEach(
        company => {
          const normalized =
            company
              ?.trim()
              .toUpperCase();

          if (
            normalized &&
            normalized !==
              'ALL COMPANIES' &&
            !result.includes(
              normalized
            )
          ) {
            result.push(
              normalized
            );
          }
        }
      );

      return result;
    }, [companies]);

  const displayCompanies =
    useMemo(() => {
      return [
        ...knownCompanies,
      ];
    }, [knownCompanies]);

  const totalFiles =
    selectedFiles.length;

  const pendingCount =
    selectedFiles.filter(
      item =>
        item.status ===
        'PENDING'
    ).length;

  const uploadingCount =
    selectedFiles.filter(
      item =>
        item.status ===
        'UPLOADING'
    ).length;

  const successfulCount =
    selectedFiles.filter(
      item =>
        item.status ===
        'UPLOADED'
    ).length;

  const reset = () => {
    setSelectedFiles([]);
    setSelectedZipName('');
    setIsScanning(false);
    setIsUploading(false);
    setOverallProgress(0);
    setUploadedCount(0);
    setFailedCount(0);
    setMessage(null);
  };

  const addToastMessage = (
    title: string,
    body: string,
    type:
      | 'success'
      | 'error'
      | 'warning'
      | 'info'
  ) => {
    addToast({
      title,
      message: body,
      type,
    });
  };

  const createFileItems =
    async (
      file: File
    ): Promise<
      DatasheetFileItem[]
    > => {
      const zip =
        await JSZip.loadAsync(
          file
        );

      const entries =
        Object.entries(
          zip.files
        );

      const pdfItems: DatasheetFileItem[] =
        [];

      entries.forEach(
        ([
          relativePath,
          zipEntry,
        ]) => {
          const normalizedPath =
            normalizePath(
              relativePath
            );

          if (
            isDirectoryEntry(
              zipEntry
            )
          ) {
            return;
          }

          if (
            normalizedPath
              .startsWith(
                '__MACOSX/'
              ) ||
            normalizedPath.includes(
              '/.__'
            ) ||
            normalizedPath
              .split('/')
              .some(
                part =>
                  part.startsWith(
                    '.'
                  )
              )
          ) {
            return;
          }

          if (
            !isPdfFile(
              normalizedPath
            )
          ) {
            return;
          }

          const folderPath =
            getFolderPath(
              normalizedPath
            );

          const company =
            selectedMode ===
            'AUTO'
              ? inferCompanyFromPath(
                  normalizedPath,
                  knownCompanies
                )
              : selectedMode;

          const fileName =
            normalizedPath
              .split('/')
              .pop() ||
            normalizedPath;

          pdfItems.push({
            id:
              `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}`,

            fileName,

            folderPath,

            relativePath:
              normalizedPath,

            size: 0,

            company,

            status: 'PENDING',
          });
        }
      );

      return pdfItems;
    };

  const scanZip =
    async (
      zipFile: File
    ) => {
      setIsScanning(true);
      setMessage(null);
      setSelectedFiles([]);

      try {
        if (
          zipFile.size >
          MAX_ZIP_SIZE
        ) {
          throw new Error(
            'ZIP file is larger than the 500 MB upload limit.'
          );
        }

        const items =
          await createFileItems(
            zipFile
          );

        if (
          items.length ===
          0
        ) {
          throw new Error(
            'No PDF datasheets were found inside the ZIP file.'
          );
        }

        setSelectedZipName(
          zipFile.name
        );

        setSelectedFiles(
          items
        );

        setOverallProgress(
          0
        );

        setUploadedCount(
          0
        );

        setFailedCount(
          0
        );

        setMessage(
          `${items.length.toLocaleString()} PDF datasheets discovered.`
        );

        addToastMessage(
          'ZIP Scanned Successfully',
          `${items.length.toLocaleString()} PDF datasheets were found recursively inside ${zipFile.name}.`,
          'success'
        );
      } catch (
        error
      ) {
        console.error(
          'ZIP scan error:',
          error
        );

        reset();

        addToastMessage(
          'ZIP Scan Failed',
          error instanceof Error
            ? error.message
            : 'Unable to read the ZIP file.',
          'error'
        );
      } finally {
        setIsScanning(false);
      }
    };

  const scanSinglePdf =
    (
      file: File
    ) => {
      if (
        file.size >
        MAX_SINGLE_FILE_SIZE
      ) {
        addToastMessage(
          'PDF Too Large',
          'This PDF is larger than the 100 MB upload limit.',
          'error'
        );
        return;
      }

      if (
        !isPdfFile(
          file.name
        )
      ) {
        addToastMessage(
          'Unsupported File',
          'Please select a PDF datasheet.',
          'error'
        );
        return;
      }

      const company =
        selectedMode ===
        'AUTO'
          ? null
          : selectedMode;

      const item:
        DatasheetFileItem =
        {
          id:
            `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 10)}`,

          fileName:
            file.name,

          folderPath: '',

          relativePath:
            file.name,

          size:
            file.size,

          company,

          status: 'PENDING',
        };

      setSelectedZipName(
        ''
      );

      setSelectedFiles([
        item,
      ]);

      setOverallProgress(
        0
      );

      setUploadedCount(
        0
      );

      setFailedCount(
        0
      );

      setMessage(
        'PDF ready for upload.'
      );
    };

  const uploadOneFile =
    async (
      zipFile: File,
      item: DatasheetFileItem
    ) => {
      try {
        /*
         * Reload ZIP and extract only the required
         * PDF entry in memory.
         */
        const zip =
          await JSZip.loadAsync(
            zipFile
          );

        const zipEntry =
          zip.files[
            item.relativePath
          ];

        if (
          !zipEntry
        ) {
          throw new Error(
            `PDF entry not found inside ZIP: ${item.relativePath}`
          );
        }

        const blob =
          await zipEntry.async(
            'blob'
          );

        const pdfFile =
          new File(
            [
              blob,
            ],
            item.fileName,
            {
              type:
                'application/pdf',
            }
          );

        const storagePath =
          makeStoragePath(
            item.company,
            item.relativePath
          );

        const {
          error:
            uploadError,
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
          uploadError
        ) {
          throw uploadError;
        }

        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth
            .getUser();

        if (
          userError ||
          !user
        ) {
          throw new Error(
            'You must be authenticated to upload datasheets.'
          );
        }

        const {
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
                zipFile.name,

              folder_path:
                item.folderPath ||
                null,

              storage_bucket:
                'datasheets',

              storage_path:
                storagePath,

              company_name:
                item.company,

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
            });

        if (
          databaseError
        ) {
          /*
           * Database row failed after Storage succeeded.
           * Remove the orphaned Storage object so the
           * database and Storage stay consistent.
           */
          await supabase.storage
            .from(
              'datasheets'
            )
            .remove([
              storagePath,
            ]);

          throw databaseError;
        }

        return {
          success: true,
          storagePath,
        };
      } catch (
        error
      ) {
        console.error(
          `Datasheet upload failed: ${item.relativePath}`,
          error
        );

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Upload failed.',
        };
      }
    };

  const uploadZip =
    async (
      zipFile: File
    ) => {
      if (
        selectedFiles.length ===
        0
      ) {
        addToastMessage(
          'Nothing to Upload',
          'Scan a ZIP file containing PDF datasheets first.',
          'warning'
        );
        return;
      }

      setIsUploading(true);
      setMessage(null);
      setUploadedCount(0);
      setFailedCount(0);

      const workingItems =
        [
          ...selectedFiles,
        ];

      let completed =
        0;

      let successful =
        0;

      let failed =
        0;

      const processItem =
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
            error:
              undefined,
          };

          setSelectedFiles([
            ...workingItems,
          ]);

          const result =
            await uploadOneFile(
              zipFile,
              workingItems[
                index
              ]
            );

          if (
            result.success
          ) {
            successful++;

            workingItems[
              index
            ] = {
              ...workingItems[
                index
              ],
              status:
                'UPLOADED',
              storagePath:
                result.storagePath,
            };
          } else {
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
                result.error,
            };
          }

          completed++;

          setUploadedCount(
            successful
          );

          setFailedCount(
            failed
          );

          setOverallProgress(
            Math.round(
              (completed /
                workingItems.length) *
                100
            )
          );

          setSelectedFiles([
            ...workingItems,
          ]);
        };

      /*
       * Small concurrency pool so large ZIPs don't cause
       * hundreds of simultaneous uploads.
       */
      let nextIndex =
        0;

      const worker =
        async () => {
          while (
            nextIndex <
            workingItems.length
          ) {
            const currentIndex =
              nextIndex++;

            await processItem(
              currentIndex
            );
          }
        };

      const workerCount =
        Math.min(
          UPLOAD_CONCURRENCY,
          workingItems.length
        );

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

      setIsUploading(false);

      if (
        failed === 0
      ) {
        setMessage(
          `${successful.toLocaleString()} datasheet PDFs uploaded and registered successfully.`
        );

        addToastMessage(
          'Bulk Datasheet Upload Complete',
          `${successful.toLocaleString()} PDF datasheets are now stored in Supabase Storage and registered in the database.`,
          'success'
        );
      } else {
        setMessage(
          `${successful.toLocaleString()} uploaded, ${failed.toLocaleString()} failed.`
        );

        addToastMessage(
          'Bulk Upload Completed With Errors',
          `${successful.toLocaleString()} PDFs uploaded successfully and ${failed.toLocaleString()} failed.`,
          'warning'
        );
      }
    };

  const handleZipInput =
    (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      event.currentTarget.value =
        '';

      if (!file) {
        return;
      }

      if (
        !file.name
          .toLowerCase()
          .endsWith('.zip')
      ) {
        addToastMessage(
          'Unsupported File',
          'Please select a .zip file.',
          'error'
        );
        return;
      }

      void scanZip(file);
    };

  const handlePdfInput =
    (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      event.currentTarget.value =
        '';

      if (!file) {
        return;
      }

      scanSinglePdf(
        file
      );
    };

  const selectMode =
    (
      value: DatasheetCompanyMode
    ) => {
      setSelectedMode(
        value
      );

      if (
        selectedFiles.length ===
        0
      ) {
        return;
      }

      setSelectedFiles(
        current =>
          current.map(
            item => ({
              ...item,
              company:
                value ===
                'AUTO'
                  ? inferCompanyFromPath(
                      item.relativePath,
                      knownCompanies
                    )
                  : value,
            })
          )
      );
    };

  /*
   * For AUTO mode, files sitting directly at the ZIP root
   * have no reliable company. We explicitly show them.
   */
  const unassignedAutoFiles =
    selectedMode ===
    'AUTO'
      ? selectedFiles.filter(
          item =>
            !item.company
        ).length
      : 0;

  return (
    <div className="space-y-5">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="bg-gradient-to-r from-[#001f3f] to-[#003b68] text-white rounded-2xl p-5">

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          <div>

            <div className="flex items-center gap-2">

              <span className="px-2 py-1 rounded-full bg-amber-400/10 border border-amber-300/30 text-amber-200 text-[9px] font-black uppercase tracking-wider">
                BULK DATASHEET INGESTION
              </span>

              <span className="text-[10px] text-slate-300 font-mono">
                PDF + ZIP
              </span>

            </div>

            <h2 className="text-lg font-black mt-2">
              Upload Datasheet Library
            </h2>

            <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Upload a single PDF or a ZIP containing nested folders and hundreds of PDF datasheets. Every PDF is stored individually in Supabase Storage and receives its own database registry record.
            </p>

          </div>

          <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold">

            <Database className="w-4 h-4" />

            Private Supabase Storage

          </div>

        </div>

      </div>

      {/* ===================================================
          COMPANY MODE
      =================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200 p-5">

        <div className="flex items-center gap-2">

          <Building2 className="w-4 h-4 text-blue-700" />

          <h3 className="text-sm font-black text-slate-900">
            Datasheet Company Assignment
          </h3>

        </div>

        <p className="text-xs text-slate-500 mt-1">
          Use automatic folder detection for ZIPs such as
          <span className="font-mono font-bold text-slate-700">
            {' '}BPCL/Valves/SteamTrap.pdf
          </span>
          , or choose one company for the entire upload.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">

          <button
            type="button"
            onClick={() =>
              selectMode('AUTO')
            }
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedMode ===
              'AUTO'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >

            <div className="text-xs font-black text-slate-900">
              Auto From Folder
            </div>

            <div className="text-[10px] text-slate-500 mt-1">
              First folder becomes the company
            </div>

          </button>

          {displayCompanies
            .slice(
              0,
              11
            )
            .map(
              company => (
                <button
                  key={
                    company
                  }
                  type="button"
                  onClick={() =>
                    selectMode(
                      company
                    )
                  }
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedMode ===
                    company
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >

                  <div className="text-xs font-black text-slate-900">
                    {
                      company
                    }
                  </div>

                  <div className="text-[10px] text-slate-500 mt-1">
                    Apply to this upload
                  </div>

                </button>
              )
            )}

        </div>

      </div>

      {/* ===================================================
          UPLOAD CARDS
      =================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* PDF */}

        <label className="bg-white rounded-2xl border border-slate-200 p-6 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all">

          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={
              handlePdfInput
            }
            disabled={
              isUploading ||
              isScanning
            }
          />

          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">

            <FileText className="w-6 h-6 text-blue-700" />

          </div>

          <h3 className="text-sm font-black text-slate-900 mt-4">
            Upload Single PDF
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Upload one individual datasheet directly.
          </p>

          <div className="mt-4 text-[10px] text-slate-400 font-mono">
            Maximum file size: 100 MB
          </div>

        </label>

        {/* ZIP */}

        <label className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-6 cursor-pointer hover:border-amber-500 hover:bg-amber-50/20 transition-all">

          <input
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={
              handleZipInput
            }
            disabled={
              isUploading ||
              isScanning
            }
          />

          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">

            <FileArchive className="w-6 h-6 text-amber-700" />

          </div>

          <h3 className="text-sm font-black text-slate-900 mt-4">
            Upload ZIP Bundle
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Recursively scan folders and register every PDF individually.
          </p>

          <div className="mt-4 text-[10px] text-slate-400 font-mono">
            Maximum ZIP size: 500 MB
          </div>

        </label>

      </div>

      {/* ===================================================
          ZIP INFO
      =================================================== */}

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
                  Recursive PDF discovery complete
                </div>

              </div>

            </div>

            <button
              type="button"
              onClick={
                reset
              }
              disabled={
                isUploading
              }
              className="text-xs font-bold text-slate-500 hover:text-red-600 disabled:opacity-50"
            >
              Clear
            </button>

          </div>

        </div>
      )}

      {/* ===================================================
          STATS
      =================================================== */}

      {totalFiles > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

          <MiniStat
            label="PDFs Found"
            value={totalFiles}
          />

          <MiniStat
            label="Pending"
            value={pendingCount}
          />

          <MiniStat
            label="Uploading"
            value={uploadingCount}
          />

          <MiniStat
            label="Uploaded"
            value={successfulCount}
          />

          <MiniStat
            label="Failed"
            value={failedCount}
            danger={
              failedCount >
              0
            }
          />

        </div>
      )}

      {/* ===================================================
          AUTO ASSIGNMENT WARNING
      =================================================== */}

      {unassignedAutoFiles >
        0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">

          <div className="flex items-start gap-3">

            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />

            <div>

              <div className="text-xs font-black text-amber-900">
                Company could not be inferred for{' '}
                {
                  unassignedAutoFiles
                }{' '}
                PDF(s)
              </div>

              <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                These files are located directly in the ZIP root and do not contain a company folder. Choose a specific company above before uploading them.
              </p>

            </div>

          </div>

        </div>
      )}

      {/* ===================================================
          DISCOVERED FILES
      =================================================== */}

      {selectedFiles.length >
        0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">

            <div className="flex items-center justify-between gap-3">

              <div>

                <h3 className="text-sm font-black text-slate-900">
                  Discovered PDF Datasheets
                </h3>

                <p className="text-[10px] text-slate-500 mt-1">
                  Every row below becomes an individual datasheet database record.
                </p>

              </div>

              <FileArchive className="w-5 h-5 text-slate-400" />

            </div>

          </div>

          <div className="max-h-[420px] overflow-auto">

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

                {selectedFiles
                  .slice(
                    0,
                    1000
                  )
                  .map(
                    item => (
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
                                {
                                  formatBytes(
                                    item.size
                                  )
                                }
                              </div>

                            </div>

                          </div>

                        </td>

                        <td className="px-4 py-3 text-slate-500">

                          <div className="flex items-center gap-1.5">

                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                            <span className="truncate max-w-[280px]">
                              {
                                item.folderPath ||
                                'ZIP root'
                              }
                            </span>

                          </div>

                        </td>

                        <td className="px-4 py-3">

                          <span className="inline-flex px-2 py-1 rounded-md bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-black">
                            {
                              item.company ||
                              'UNASSIGNED'
                            }
                          </span>

                        </td>

                        <td className="px-4 py-3">

                          <StatusBadge
                            status={
                              item.status
                            }
                          />

                          {item.error && (
                            <div className="text-[9px] text-red-600 mt-1 max-w-[220px]">
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

          {selectedFiles.length >
            1000 && (
            <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-400">
              Showing first 1,000 of{' '}
              {
                selectedFiles.length
              }{' '}
              discovered PDFs.
            </div>
          )}

        </div>
      )}

      {/* ===================================================
          PROGRESS
      =================================================== */}

      {(isScanning ||
        isUploading ||
        overallProgress >
          0) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-2">

              <Activity className="w-4 h-4 text-emerald-600" />

              <span className="text-xs font-black text-slate-900">
                {isScanning
                  ? 'Scanning ZIP...'
                  : isUploading
                  ? 'Uploading PDF datasheets...'
                  : 'Upload complete'}
              </span>

            </div>

            <span className="text-xs font-mono font-black text-emerald-700">
              {overallProgress}%
            </span>

          </div>

          <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">

            <motion.div
              className="h-full bg-emerald-600"
              initial={{
                width: '0%',
              }}
              animate={{
                width: `${overallProgress}%`,
              }}
              transition={{
                duration:
                  0.2,
              }}
            />

          </div>

        </div>
      )}

      {/* ===================================================
          RESULT MESSAGE
      =================================================== */}

      {message && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

          <div className="flex items-start gap-3">

            {failedCount >
            0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
            )}

            <div>

              <div className="text-xs font-black text-slate-900">
                Upload Status
              </div>

              <p className="text-[11px] text-slate-600 mt-1">
                {message}
              </p>

            </div>

          </div>

        </div>
      )}

      {/* ===================================================
          ACTION
      =================================================== */}

      {selectedZipName &&
        selectedFiles.length >
          0 && (
        <div className="flex items-center justify-end gap-3">

          <button
            type="button"
            onClick={
              reset
            }
            disabled={
              isUploading
            }
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={async () => {
              if (
                selectedMode ===
                'AUTO' &&
                unassignedAutoFiles >
                  0
              ) {
                addToastMessage(
                  'Company Assignment Required',
                  'Select a company before uploading PDFs that are located at the ZIP root.',
                  'error'
                );
                return;
              }

              /*
               * We need the original ZIP again.
               * The input file isn't stored by the browser
               * after scan, so ask the user to select it again.
               */
              addToastMessage(
                'Select ZIP Again',
                'Please select the same ZIP file again so the browser can extract and upload each PDF.',
                'info'
              );

              document
                .getElementById(
                  'bulk-datasheet-retry-input'
                )
                ?.click();
            }}
            disabled={
              isUploading ||
              isScanning ||
              successfulCount ===
                totalFiles
            }
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
          >

            {isUploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                Upload All PDFs
              </>
            )}

          </button>

          <input
            id="bulk-datasheet-retry-input"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={event => {
              const file =
                event.target.files?.[0];

              event.currentTarget.value =
                '';

              if (!file) {
                return;
              }

              if (
                !file.name
                  .toLowerCase()
                  .endsWith(
                    '.zip'
                  )
              ) {
                addToastMessage(
                  'Unsupported File',
                  'Please select the ZIP file containing the datasheets.',
                  'error'
                );
                return;
              }

              /*
               * Keep current discovered list and upload
               * directly from the newly selected ZIP.
               */
              void uploadZip(
                file
              );
            }}
          />

        </div>
      )}

      {/* ===================================================
          HOW IT WORKS
      =================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        <InfoCard
          icon={
            <FileArchive className="w-4 h-4 text-amber-600" />
          }
          title="1. Recursive ZIP Scan"
          text="Nested folders are scanned automatically and every PDF is discovered."
        />

        <InfoCard
          icon={
            <Database className="w-4 h-4 text-blue-600" />
          }
          title="2. Individual Storage"
          text="Every PDF gets its own private Supabase Storage object."
        />

        <InfoCard
          icon={
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          }
          title="3. Database Registry"
          text="Every PDF receives its own datasheet record with company, folder and processing status."
        />

      </div>

    </div>
  );
};

type FileItemState =
  DatasheetFileItem;

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

function StatusBadge({
  status,
}: {
  status: DatasheetStatus;
}) {
  if (
    status ===
    'UPLOADED'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black">
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

function formatBytes(
  bytes: number
) {
  if (
    bytes === 0
  ) {
    return '0 B';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
  ];

  const index =
    Math.floor(
      Math.log(
        bytes
      ) /
        Math.log(
          1024
        )
    );

  return `${(
    bytes /
    Math.pow(
      1024,
      index
    )
  ).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}