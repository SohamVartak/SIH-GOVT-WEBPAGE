import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        {
          error: "No file uploaded",
        },
        { status: 400 }
      );
    }

    // Convert uploaded file to Uint8Array
    const buffer = new Uint8Array(await file.arrayBuffer());

    const fileName = file.name.toLowerCase();

    // =========================
    // PDF EXTRACTION
    // =========================
    if (
      file.type === "application/pdf" ||
      fileName.endsWith(".pdf")
    ) {
      const result = await extractText(buffer, {
        mergePages: true,
      });

      return NextResponse.json({
        success: true,
        fileName: file.name,
        fileType: "pdf",
        pages: result.totalPages,
        text: result.text,
      });
    }

    // =========================
    // EXCEL EXTRACTION
    // =========================
    if (
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls")
    ) {
      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const sheets = {};

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];

        sheets[sheetName] = XLSX.utils.sheet_to_json(
          worksheet,
          {
            defval: null,
          }
        );
      });

      return NextResponse.json({
        success: true,
        fileName: file.name,
        fileType: "excel",
        sheets,
      });
    }

    // =========================
    // UNSUPPORTED FILE
    // =========================
    return NextResponse.json(
      {
        success: false,
        error:
          "Unsupported file type. Please upload PDF or Excel.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Extraction error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to extract file",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}