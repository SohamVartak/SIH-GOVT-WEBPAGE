"use client";

import { useState } from "react";

export default function TestUploadPage() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFile = (selectedFile) => {
    if (!selectedFile) return;

    const fileName = selectedFile.name.toLowerCase();

    if (
      !fileName.endsWith(".pdf") &&
      !fileName.endsWith(".xlsx") &&
      !fileName.endsWith(".xls")
    ) {
      setError("Please upload a PDF or Excel file.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError("");
    setResult(null);
    setStage("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];

    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  const extractAndStructure = async () => {
    if (!file) {
      setError("Please select a PDF or Excel file first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // ==========================================
      // STEP 1 — EXTRACT FILE
      // ==========================================

      setStage("Extracting datasheet...");

      const formData = new FormData();
      formData.append("file", file);

      const extractResponse = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const extractData = await extractResponse.json();

      if (!extractResponse.ok || !extractData.success) {
        throw new Error(
          extractData.details ||
            extractData.error ||
            "File extraction failed."
        );
      }

      // ==========================================
      // STEP 2 — AI STRUCTURING
      // ==========================================

      if (extractData.fileType === "pdf") {
        if (!extractData.text) {
          throw new Error(
            "No text could be extracted from the PDF."
          );
        }

        setStage("Analysing datasheet with AI...");

        const aiResponse = await fetch("/api/ai-structure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: extractData.text,
          }),
        });

        const aiData = await aiResponse.json();

        if (!aiResponse.ok || !aiData.success) {
          throw new Error(
            aiData.details ||
              aiData.error ||
              "AI structuring failed."
          );
        }

        // ==========================================
        // STEP 3 — SAVE TO SUPABASE
        // ==========================================

        setStage("Saving material to database...");

        const saveResponse = await fetch(
          "/api/save-material",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              company: aiData.data.company,
              fileName: file.name,
              structuredData: aiData.data,
            }),
          }
        );

        const saveData = await saveResponse.json();

        if (!saveResponse.ok || !saveData.success) {
          throw new Error(
            saveData.details ||
              saveData.error ||
              "Failed to save material to database."
          );
        }

        // ==========================================
        // SUCCESS
        // ==========================================

        setStage("Completed");

        setResult({
          ...aiData.data,
          database: saveData.data,
        });
      }

      // ==========================================
      // EXCEL
      // ==========================================

      else if (extractData.fileType === "excel") {
        setStage("Excel extracted successfully.");

        setResult({
          source_type: "excel",
          file_name: extractData.fileName,
          sheets: extractData.sheets,
        });
      }
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Something went wrong while processing the file."
      );

      setStage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background:
            linear-gradient(
              rgba(255, 255, 255, 0.96),
              rgba(255, 255, 255, 0.96)
            ),
            linear-gradient(
              90deg,
              rgba(255, 153, 51, 0.08),
              transparent 35%,
              transparent 65%,
              rgba(19, 136, 8, 0.08)
            );
          color: #17202a;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }

        .topbar {
          height: 6px;
          background: linear-gradient(
            90deg,
            #ff9933 0%,
            #ff9933 33%,
            #ffffff 33%,
            #ffffff 66%,
            #138808 66%,
            #138808 100%
          );
          border-bottom: 1px solid #ddd;
        }

        .header {
          background: #ffffff;
          border-bottom: 1px solid #dfe4ea;
          padding: 18px 6%;
        }

        .headerInner {
          max-width: 1200px;
          margin: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .emblem {
          width: 54px;
          height: 54px;
          border: 2px solid #9da7b2;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 23px;
          font-weight: bold;
          color: #263746;
        }

        .brandText h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }

        .brandText p {
          margin: 4px 0 0;
          color: #68737d;
          font-size: 13px;
        }

        .badge {
          padding: 8px 13px;
          border-radius: 20px;
          background: #eef5ff;
          border: 1px solid #cdddf5;
          color: #315b8a;
          font-size: 12px;
          font-weight: 700;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 45px 20px 70px;
        }

        .titleSection {
          margin-bottom: 30px;
        }

        .eyebrow {
          color: #1c5b94;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .titleSection h2 {
          margin: 0;
          font-size: 36px;
          line-height: 1.15;
        }

        .titleSection p {
          max-width: 760px;
          margin-top: 12px;
          color: #64707c;
          font-size: 15px;
          line-height: 1.7;
        }

        .pipeline {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 28px;
        }

        .pipelineItem {
          background: #ffffff;
          border: 1px solid #dce2e8;
          border-radius: 12px;
          padding: 15px;
        }

        .pipelineNumber {
          font-size: 12px;
          color: #7a858f;
          font-weight: 700;
        }

        .pipelineTitle {
          margin-top: 5px;
          font-size: 14px;
          font-weight: 700;
        }

        .uploadCard {
          background: #ffffff;
          border: 1px solid #d7dde3;
          border-radius: 16px;
          padding: 30px;
          box-shadow: 0 8px 25px rgba(30, 45, 60, 0.06);
        }

        .dropZone {
          border: 2px dashed #b8c1ca;
          border-radius: 14px;
          padding: 45px 20px;
          text-align: center;
          cursor: pointer;
          transition: 0.2s;
          background: #fbfcfd;
        }

        .dropZone:hover,
        .dropZone.dragging {
          border-color: #527ca7;
          background: #f4f8fc;
        }

        .uploadIcon {
          width: 58px;
          height: 58px;
          margin: 0 auto 15px;
          border-radius: 50%;
          background: #edf3f8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 25px;
        }

        .dropZone h3 {
          margin: 0;
          font-size: 18px;
        }

        .dropZone p {
          color: #727d87;
          font-size: 13px;
          margin: 9px 0;
        }

        .browse {
          color: #1d5e95;
          font-weight: 700;
        }

        .fileInfo {
          margin-top: 18px;
          padding: 15px;
          background: #f4f7fa;
          border: 1px solid #dce2e8;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
        }

        .fileName {
          font-weight: 700;
          word-break: break-word;
        }

        .fileType {
          color: #71808e;
          font-size: 12px;
        }

        .button {
          width: 100%;
          margin-top: 20px;
          padding: 15px 20px;
          border: none;
          border-radius: 9px;
          background: #174f7c;
          color: white;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }

        .button:hover {
          background: #123f63;
        }

        .button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .status {
          margin-top: 18px;
          padding: 14px 16px;
          border-radius: 9px;
          background: #eef5fb;
          border: 1px solid #d3e1ed;
          color: #31566f;
          font-size: 14px;
        }

        .error {
          margin-top: 18px;
          padding: 14px 16px;
          border-radius: 9px;
          background: #fff2f2;
          border: 1px solid #efcaca;
          color: #a33333;
          font-size: 14px;
        }

        .result {
          margin-top: 30px;
          background: #ffffff;
          border: 1px solid #d7dde3;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 25px rgba(30, 45, 60, 0.06);
        }

        .resultHeader {
          padding: 20px 25px;
          border-bottom: 1px solid #e0e5ea;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
        }

        .resultHeader h3 {
          margin: 0;
          font-size: 20px;
        }

        .successBadge {
          padding: 7px 11px;
          background: #edf8ed;
          border: 1px solid #c8e4c8;
          color: #28752c;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
        }

        .resultBody {
          padding: 25px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }

        .field {
          border: 1px solid #e0e5e9;
          border-radius: 10px;
          padding: 14px;
          background: #fafbfc;
        }

        .fieldLabel {
          font-size: 11px;
          color: #7a858e;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .fieldValue {
          font-size: 14px;
          line-height: 1.5;
          font-weight: 600;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .sectionTitle {
          margin: 28px 0 14px;
          font-size: 16px;
          font-weight: 700;
          border-bottom: 1px solid #e1e5e9;
          padding-bottom: 8px;
        }

        .list {
          margin: 0;
          padding-left: 20px;
          color: #394550;
          line-height: 1.7;
        }

        .raw {
          margin-top: 25px;
        }

        .raw pre {
          background: #17202a;
          color: #e9eef2;
          padding: 18px;
          border-radius: 10px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.5;
        }

        .footer {
          border-top: 1px solid #dfe4e8;
          background: #f7f9fa;
          padding: 25px 20px;
          text-align: center;
          color: #74808b;
          font-size: 12px;
        }

        @media (max-width: 800px) {
          .pipeline {
            grid-template-columns: repeat(2, 1fr);
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .headerInner {
            align-items: flex-start;
            flex-direction: column;
          }

          .titleSection h2 {
            font-size: 29px;
          }
        }

        @media (max-width: 500px) {
          .pipeline {
            grid-template-columns: 1fr;
          }

          .uploadCard {
            padding: 18px;
          }

          .container {
            padding-left: 14px;
            padding-right: 14px;
          }
        }
      `}</style>

      <div className="topbar"></div>

      <header className="header">
        <div className="headerInner">
          <div className="brand">
            <div className="emblem">☼</div>

            <div className="brandText">
              <h1>Bharat Material Grid</h1>
              <p>
                Government of India · Material
                Standardisation Platform
              </p>
            </div>
          </div>

          <div className="badge">
            PHASE 1 · AI MATERIAL INGESTION
          </div>
        </div>
      </header>

      <section className="container">
        <div className="titleSection">
          <div className="eyebrow">
            Datasheet Intelligence
          </div>

          <h2>Upload & Analyse Datasheet</h2>

          <p>
            Upload a company material datasheet in PDF or
            Excel format. The system extracts technical
            information, analyses the material using AI,
            and stores the structured material record in
            the Bharat Material Grid database.
          </p>
        </div>

        <div className="pipeline">
          <div className="pipelineItem">
            <div className="pipelineNumber">01</div>
            <div className="pipelineTitle">
              Upload Datasheet
            </div>
          </div>

          <div className="pipelineItem">
            <div className="pipelineNumber">02</div>
            <div className="pipelineTitle">
              Extract Information
            </div>
          </div>

          <div className="pipelineItem">
            <div className="pipelineNumber">03</div>
            <div className="pipelineTitle">
              AI Analysis
            </div>
          </div>

          <div className="pipelineItem">
            <div className="pipelineNumber">04</div>
            <div className="pipelineTitle">
              Save to Database
            </div>
          </div>
        </div>

        <div className="uploadCard">
          <div
            className={`dropZone ${
              dragging ? "dragging" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() =>
              document
                .getElementById("fileInput")
                ?.click()
            }
          >
            <div className="uploadIcon">↑</div>

            <h3>
              Drag & drop your datasheet here
            </h3>

            <p>
              or{" "}
              <span className="browse">
                browse from your computer
              </span>
            </p>

            <p>
              Supported formats: PDF, XLS, XLSX
            </p>

            <input
              id="fileInput"
              type="file"
              accept=".pdf,.xls,.xlsx"
              style={{ display: "none" }}
              onChange={(e) =>
                handleFile(e.target.files?.[0])
              }
            />
          </div>

          {file && (
            <div className="fileInfo">
              <div>
                <div className="fileName">
                  {file.name}
                </div>

                <div className="fileType">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>

              <div>✓</div>
            </div>
          )}

          <button
            className="button"
            onClick={extractAndStructure}
            disabled={!file || loading}
          >
            {loading
              ? "Processing..."
              : "Extract & Analyse Datasheet"}
          </button>

          {stage && (
            <div className="status">
              <strong>Status:</strong> {stage}
            </div>
          )}

          {error && (
            <div className="error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {result && (
          <div className="result">
            <div className="resultHeader">
              <h3>Structured Material Record</h3>

              <div className="successBadge">
                ✓ Saved to Database
              </div>
            </div>

            <div className="resultBody">
              <div className="grid">
                <div className="field">
                  <div className="fieldLabel">
                    Company
                  </div>

                  <div className="fieldValue">
                    {result.company || "Not specified"}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">
                    Material Name
                  </div>

                  <div className="fieldValue">
                    {result.material_name ||
                      "Not specified"}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">
                    Company Material Code
                  </div>

                  <div className="fieldValue">
                    {result.company_material_code ||
                      "Not specified"}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">
                    Material Family
                  </div>

                  <div className="fieldValue">
                    {result.material_family ||
                      "Not specified"}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">
                    Product Type
                  </div>

                  <div className="fieldValue">
                    {result.product_type ||
                      "Not specified"}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">
                    Pressure Rating
                  </div>

                  <div className="fieldValue">
                    {result.pressure_rating ||
                      "Not specified"}
                  </div>
                </div>
              </div>

              {result.description && (
                <>
                  <div className="sectionTitle">
                    Description
                  </div>

                  <div className="field">
                    <div className="fieldValue">
                      {result.description}
                    </div>
                  </div>
                </>
              )}

              {result.dimensions && (
                <>
                  <div className="sectionTitle">
                    Dimensions
                  </div>

                  <div className="grid">
                    <div className="field">
                      <div className="fieldLabel">
                        Size Range
                      </div>

                      <div className="fieldValue">
                        {result.dimensions.size_range ||
                          "Not specified"}
                      </div>
                    </div>

                    <div className="field">
                      <div className="fieldLabel">
                        Pressure Class
                      </div>

                      <div className="fieldValue">
                        {result.dimensions.pressure_class ||
                          "Not specified"}
                      </div>
                    </div>

                    <div className="field">
                      <div className="fieldLabel">
                        Face-to-Face
                      </div>

                      <div className="fieldValue">
                        {result.dimensions.face_to_face ||
                          "Not specified"}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {result.materials && (
                <>
                  <div className="sectionTitle">
                    Materials of Construction
                  </div>

                  <div className="grid">
                    {Object.entries(result.materials)
                      .filter(
                        ([key, value]) =>
                          key !== "other" &&
                          value !== null &&
                          value !== undefined &&
                          value !== ""
                      )
                      .map(([key, value]) => (
                        <div
                          className="field"
                          key={key}
                        >
                          <div className="fieldLabel">
                            {key.replace(
                              /_/g,
                              " "
                            )}
                          </div>

                          <div className="fieldValue">
                            {typeof value ===
                            "object"
                              ? JSON.stringify(value)
                              : String(value)}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}

              {Array.isArray(result.standards) &&
                result.standards.length > 0 && (
                  <>
                    <div className="sectionTitle">
                      Standards
                    </div>

                    <ul className="list">
                      {result.standards.map(
                        (standard, index) => (
                          <li key={index}>
                            {standard}
                          </li>
                        )
                      )}
                    </ul>
                  </>
                )}

              {Array.isArray(
                result.design_features
              ) &&
                result.design_features.length > 0 && (
                  <>
                    <div className="sectionTitle">
                      Design Features
                    </div>

                    <ul className="list">
                      {result.design_features.map(
                        (feature, index) => (
                          <li key={index}>
                            {feature}
                          </li>
                        )
                      )}
                    </ul>
                  </>
                )}

              {result.database && (
                <>
                  <div className="sectionTitle">
                    Database Record
                  </div>

                  <div className="grid">
                    <div className="field">
                      <div className="fieldLabel">
                        Company ID
                      </div>

                      <div className="fieldValue">
                        {result.database.company_id}
                      </div>
                    </div>

                    <div className="field">
                      <div className="fieldLabel">
                        Datasheet ID
                      </div>

                      <div className="fieldValue">
                        {result.database.datasheet_id}
                      </div>
                    </div>

                    <div className="field">
                      <div className="fieldLabel">
                        Material ID
                      </div>

                      <div className="fieldValue">
                        {result.database.material_id}
                      </div>
                    </div>

                    <div className="field">
                      <div className="fieldLabel">
                        Company
                      </div>

                      <div className="fieldValue">
                        {result.database.company_name}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="raw">
                <div className="sectionTitle">
                  Complete AI Output
                </div>

                <pre>
                  {JSON.stringify(
                    result,
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="footer">
        Bharat Material Grid · Phase 1 AI Material
        Ingestion
      </footer>
    </main>
  );
}