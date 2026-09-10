"use client";

import {
  useEffect,
  useState,
} from "react";

export default function TestUploadPage() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [recentProducts, setRecentProducts] =
    useState([]);

  const [recentLoading, setRecentLoading] =
    useState(false);

  const [selectedRecentProduct, setSelectedRecentProduct] =
    useState(null);

  // ==========================================================
  // LOAD RECENT PRODUCTS
  // ==========================================================

  const loadRecentProducts = async () => {
    setRecentLoading(true);

    try {
      const response = await fetch(
        "/api/recent-products?limit=20",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            "Failed to load recent products."
        );
      }

      setRecentProducts(
        data.products || []
      );
    } catch (err) {
      console.error(
        "Recent products error:",
        err
      );

      setError(
        err?.message ||
          "Failed to load recent products."
      );
    } finally {
      setRecentLoading(false);
    }
  };

  // ==========================================================
  // LOAD RECENT PRODUCTS ON PAGE LOAD
  // ==========================================================

  useEffect(() => {
    loadRecentProducts();
  }, []);

  // ==========================================================
  // FILE SELECTION
  // ==========================================================

  const handleFileSelect = (
    selectedFile
  ) => {
    setError("");
    setResult(null);
    setStage("");
    setSelectedRecentProduct(null);

    if (!selectedFile) {
      return;
    }

    const fileName =
      selectedFile.name.toLowerCase();

    const isValid =
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls");

    if (!isValid) {
      setError(
        "Unsupported file type. Please upload a PDF or Excel file."
      );
      return;
    }

    setFile(selectedFile);
  };

  // ==========================================================
  // DRAG / DROP
  // ==========================================================

  const handleDragOver = (
    event
  ) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (
    event
  ) => {
    event.preventDefault();
    setDragging(false);
  };

  const handleDrop = (
    event
  ) => {
    event.preventDefault();
    setDragging(false);

    const droppedFile =
      event.dataTransfer.files?.[0];

    handleFileSelect(
      droppedFile
    );
  };

  // ==========================================================
  // BMG ASSIGNMENT
  // ==========================================================

  const assignBMG = async (
    materialId
  ) => {
    if (!materialId) {
      throw new Error(
        "Material ID was not returned by the database."
      );
    }

    setStage(
      "AI is checking existing BMG Common Codes and assigning the correct common identity..."
    );

    const response =
      await fetch(
        "/api/assign-bmg",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            materialId,
          }),
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.details ||
          data.error ||
          "Failed to assign BMG Common Code."
      );
    }

    return data;
  };

  // ==========================================================
  // MAIN INGESTION PIPELINE
  //
  // PDF
  // ↓
  // Extract
  // ↓
  // AI Structure
  // ↓
  // Save / Detect Duplicate
  // ↓
  // BMG Assignment
  // ↓
  // Display
  // ==========================================================

  const extractAndStructure =
    async () => {
      if (!file) {
        setError(
          "Please select a PDF or Excel file first."
        );
        return;
      }

      setLoading(true);
      setError("");
      setResult(null);
      setStage("");

      try {
        // ======================================================
        // STEP 1 — EXTRACT
        // ======================================================

        setStage(
          "Extracting datasheet information..."
        );

        const extractFormData =
          new FormData();

        extractFormData.append(
          "file",
          file
        );

        const extractResponse =
          await fetch(
            "/api/extract",
            {
              method: "POST",
              body: extractFormData,
            }
          );

        const extractData =
          await extractResponse.json();

        if (
          !extractResponse.ok ||
          !extractData.success
        ) {
          throw new Error(
            extractData.details ||
              extractData.error ||
              "Failed to extract datasheet."
          );
        }

        // ======================================================
        // EXCEL
        // ======================================================

        if (
          extractData.fileType ===
          "excel"
        ) {
          setStage(
            "Excel extracted successfully."
          );

          setResult({
            type: "excel",

            fileName:
              file.name,

            sheets:
              extractData.sheets,
          });

          return;
        }

        // ======================================================
        // STEP 2 — AI STRUCTURING
        // ======================================================

        setStage(
          "AI is identifying the company, facility, product and technical information..."
        );

        const aiResponse =
          await fetch(
            "/api/ai-structure",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                text:
                  extractData.text,
              }),
            }
          );

        const aiData =
          await aiResponse.json();

        if (
          !aiResponse.ok ||
          !aiData.success
        ) {
          throw new Error(
            aiData.details ||
              aiData.error ||
              "AI failed to structure the datasheet."
          );
        }

        const structuredData =
          aiData.data || {};

        const detectedCompany =
          structuredData.company?.trim();

        if (!detectedCompany) {
          throw new Error(
            "AI could not identify the company from the datasheet."
          );
        }

        // ======================================================
        // STEP 3 — SAVE
        // ======================================================

        setStage(
          "Saving PDF, product, facility, location and technical information..."
        );

        const saveFormData =
          new FormData();

        saveFormData.append(
          "file",
          file
        );

        saveFormData.append(
          "aiData",
          JSON.stringify(
            structuredData
          )
        );

        const saveResponse =
          await fetch(
            "/api/save-material",
            {
              method: "POST",
              body: saveFormData,
            }
          );

        const saveData =
          await saveResponse.json();

        if (
          !saveResponse.ok ||
          !saveData.success
        ) {
          throw new Error(
            saveData.details ||
              saveData.error ||
              "Failed to save material to database."
          );
        }

        // ======================================================
        // FINAL SAVED DATA
        // ======================================================

        let finalSavedData = {
          ...(saveData.data || {}),
        };

        // ======================================================
        // STEP 4 — BMG
        // ======================================================

        const existingBmgCode =
          finalSavedData.bmg_code ||
          finalSavedData.bmg_common_code;

        let bmgData =
          null;

        if (
          existingBmgCode
        ) {
          setStage(
            "Existing product found. Existing BMG Common Code and NCS name loaded."
          );
        } else {
          const materialId =
            finalSavedData.material_id;

          if (!materialId) {
            throw new Error(
              "Material was saved, but no material ID was returned, so BMG assignment cannot continue."
            );
          }

          bmgData =
            await assignBMG(
              materialId
            );

          finalSavedData = {
            ...finalSavedData,

            ...(bmgData.data || {}),
          };
        }

        // ======================================================
        // REFRESH RECENT PRODUCTS
        // ======================================================

        await loadRecentProducts();

        // ======================================================
        // DUPLICATE
        // ======================================================

        if (
          saveData.duplicate
        ) {
          setStage(
            "Existing company product found. No duplicate product was created."
          );

          setResult({
            type: "pdf",

            fileName:
              file.name,

            extractedText:
              extractData.text,

            structuredData:
              structuredData,

            savedData:
              finalSavedData,

            duplicate:
              true,
          });

          return;
        }

        // ======================================================
        // NEW PRODUCT
        // ======================================================

        setStage(
          "Product saved and BMG Common Code assigned successfully."
        );

        setResult({
          type: "pdf",

          fileName:
            file.name,

          extractedText:
            extractData.text,

          structuredData:
            structuredData,

          savedData:
            finalSavedData,

          duplicate:
            false,
        });
      } catch (err) {
        console.error(
          "Upload processing error:",
          err
        );

        setError(
          err?.message ||
            "Something went wrong while processing the file."
        );
      } finally {
        setLoading(false);
      }
    };

  // ==========================================================
  // RESET
  // ==========================================================

  const resetUpload = () => {
    setFile(null);
    setResult(null);
    setError("");
    setStage("");
    setLoading(false);
    setSelectedRecentProduct(
      null
    );

    loadRecentProducts();
  };

  // ==========================================================
  // FORMAT JSON
  // ==========================================================

  const formatJSON = (
    data
  ) => {
    try {
      return JSON.stringify(
        data,
        null,
        2
      );
    } catch {
      return String(data);
    }
  };

  // ==========================================================
  // LOCATION HELPER
  // ==========================================================

  const getLocationText =
    () => {
      const location =
        result
          ?.structuredData
          ?.location || {};

      const parts = [
        location.address,
        location.city,
        location.state,
        location.country,
        location.postal_code,
      ].filter(Boolean);

      return parts.length
        ? parts.join(", ")
        : "Location not specified";
    };

  // ==========================================================
  // BMG COMMON CODE
  // ==========================================================

  const getBmgCommonCode =
    () => {
      return (
        result?.savedData
          ?.bmg_code ||
        result?.savedData
          ?.bmg_common_code ||
        "NOT ASSIGNED"
      );
    };

  // ==========================================================
  // NCS NAME
  // ==========================================================

  const getNcsName = () => {
    return (
      result?.savedData
        ?.ncs_name ||
      result?.savedData
        ?.ncs_standard_name ||
      "NOT ASSIGNED"
    );
  };

  // ==========================================================
  // SELECT RECENT PRODUCT
  // ==========================================================

  const openRecentProduct = (
    product
  ) => {
    setSelectedRecentProduct(
      product
    );

    setError("");
  };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main
      style={{
        minHeight:
          "100vh",

        background:
          "linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#172033",
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header
        style={{
          background:
            "#ffffff",

          borderBottom:
            "1px solid #d8dee8",

          padding:
            "18px 32px",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          boxShadow:
            "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                "13px",

              fontWeight:
                700,

              color:
                "#666",

              letterSpacing:
                "0.08em",

              textTransform:
                "uppercase",
            }}
          >
            Government of India
          </div>

          <div
            style={{
              fontSize:
                "24px",

              fontWeight:
                800,

              marginTop:
                "3px",
            }}
          >
            Bharat Material Grid
          </div>

          <div
            style={{
              fontSize:
                "13px",

              color:
                "#687386",

              marginTop:
                "3px",
            }}
          >
            Industrial Material
            Harmonization Platform
          </div>
        </div>

        <div
          style={{
            display:
              "flex",

            gap:
              "4px",

            alignItems:
              "center",
          }}
        >
          <div
            style={{
              width:
                "70px",

              height:
                "4px",

              background:
                "#ff9933",
            }}
          />

          <div
            style={{
              width:
                "70px",

              height:
                "4px",

              background:
                "#138808",
            }}
          />
        </div>
      </header>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <div
        style={{
          maxWidth:
            "1400px",

          margin:
            "0 auto",

          padding:
            "50px 24px 80px",
        }}
      >
        {/* ====================================================
            TITLE
        ==================================================== */}

        <div
          style={{
            marginBottom:
              "30px",
          }}
        >
          <div
            style={{
              fontSize:
                "13px",

              color:
                "#667085",

              marginBottom:
                "8px",
            }}
          >
            DATA INGESTION
          </div>

          <h1
            style={{
              margin:
                0,

              fontSize:
                "34px",

              fontWeight:
                800,

              letterSpacing:
                "-0.02em",
            }}
          >
            Datasheet Upload
          </h1>

          <p
            style={{
              marginTop:
                "10px",

              color:
                "#667085",

              maxWidth:
                "900px",

              lineHeight:
                1.7,
            }}
          >
            Upload a company datasheet.
            The system extracts the
            product, company, facility,
            location and technical
            information, detects
            duplicates and assigns
            the appropriate BMG Common
            Code.
          </p>
        </div>

        {/* ====================================================
            UPLOAD + RECENT PRODUCTS
        ==================================================== */}

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "minmax(0, 1.5fr) minmax(320px, 0.8fr)",

            gap:
              "24px",

            alignItems:
              "start",
          }}
        >
          {/* ==================================================
              UPLOAD CARD
          ================================================== */}

          <section
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #dce2ea",

              borderRadius:
                "16px",

              padding:
                "30px",

              boxShadow:
                "0 8px 30px rgba(15,23,42,0.06)",
            }}
          >
            <div
              onDragOver={
                handleDragOver
              }
              onDragLeave={
                handleDragLeave
              }
              onDrop={
                handleDrop
              }
              style={{
                border:
                  dragging
                    ? "2px solid #1d4ed8"
                    : "2px dashed #b8c1cf",

                borderRadius:
                  "14px",

                padding:
                  "55px 25px",

                textAlign:
                  "center",

                background:
                  dragging
                    ? "#eff6ff"
                    : "#f8fafc",

                transition:
                  "all 0.2s ease",
              }}
            >
              <div
                style={{
                  fontSize:
                    "42px",

                  marginBottom:
                    "14px",
                }}
              >
                ↑
              </div>

              <h2
                style={{
                  margin:
                    "0 0 8px",

                  fontSize:
                    "21px",
                }}
              >
                Upload Datasheet
              </h2>

              <p
                style={{
                  margin:
                    "0 auto 22px",

                  color:
                    "#667085",

                  maxWidth:
                    "550px",

                  lineHeight:
                    1.6,
                }}
              >
                Drag and drop a PDF
                or Excel datasheet
                here, or select one
                from your computer.
              </p>

              <label
                style={{
                  display:
                    "inline-block",

                  padding:
                    "12px 24px",

                  background:
                    "#123b70",

                  color:
                    "#ffffff",

                  borderRadius:
                    "8px",

                  cursor:
                    "pointer",

                  fontWeight:
                    700,
                }}
              >
                Browse File

                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  style={{
                    display:
                      "none",
                  }}
                  onChange={(
                    event
                  ) =>
                    handleFileSelect(
                      event
                        .target
                        .files?.[0]
                    )
                  }
                />
              </label>

              <div
                style={{
                  marginTop:
                    "18px",

                  fontSize:
                    "12px",

                  color:
                    "#7a8494",
                }}
              >
                Supported formats:
                PDF, XLS, XLSX
              </div>
            </div>

            {/* ==================================================
                SELECTED FILE
            ================================================== */}

            {file && (
              <div
                style={{
                  marginTop:
                    "22px",

                  padding:
                    "18px",

                  background:
                    "#f8fafc",

                  border:
                    "1px solid #e1e6ee",

                  borderRadius:
                    "10px",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "space-between",

                  gap:
                    "20px",

                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        "13px",

                      color:
                        "#667085",

                      marginBottom:
                        "5px",
                    }}
                  >
                    Selected file
                  </div>

                  <div
                    style={{
                      fontWeight:
                        700,

                      wordBreak:
                        "break-word",
                    }}
                  >
                    {file.name}
                  </div>

                  <div
                    style={{
                      fontSize:
                        "12px",

                      color:
                        "#7a8494",

                      marginTop:
                        "4px",
                    }}
                  >
                    {(
                      file.size /
                      1024
                    ).toFixed(
                      1
                    )}{" "}
                    KB
                  </div>
                </div>

                {!loading && (
                  <button
                    onClick={
                      resetUpload
                    }
                    style={{
                      border:
                        "1px solid #d1d7e0",

                      background:
                        "#ffffff",

                      borderRadius:
                        "7px",

                      padding:
                        "9px 15px",

                      cursor:
                        "pointer",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}

            {/* ==================================================
                PROCESS BUTTON
            ================================================== */}

            {file &&
              !result && (
                <button
                  onClick={
                    extractAndStructure
                  }
                  disabled={
                    loading
                  }
                  style={{
                    width:
                      "100%",

                    marginTop:
                      "22px",

                    padding:
                      "15px 20px",

                    border:
                      "none",

                    borderRadius:
                      "9px",

                    background:
                      loading
                        ? "#8492a6"
                        : "#123b70",

                    color:
                      "#ffffff",

                    fontSize:
                      "15px",

                    fontWeight:
                      700,

                    cursor:
                      loading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {loading
                    ? "Processing..."
                    : "Extract, Save & Assign BMG"}
                </button>
              )}

            {/* ==================================================
                STATUS
            ================================================== */}

            {loading && (
              <div
                style={{
                  marginTop:
                    "20px",

                  padding:
                    "16px 18px",

                  borderRadius:
                    "9px",

                  background:
                    "#eff6ff",

                  border:
                    "1px solid #bfdbfe",

                  color:
                    "#1e40af",

                  fontSize:
                    "14px",

                  fontWeight:
                    600,
                }}
              >
                {stage}
              </div>
            )}

            {/* ==================================================
                ERROR
            ================================================== */}

            {error && (
              <div
                style={{
                  marginTop:
                    "20px",

                  padding:
                    "16px 18px",

                  borderRadius:
                    "9px",

                  background:
                    "#fef2f2",

                  border:
                    "1px solid #fecaca",

                  color:
                    "#b42318",

                  fontSize:
                    "14px",

                  lineHeight:
                    1.6,
                }}
              >
                <strong>
                  Error:
                </strong>{" "}
                {error}
              </div>
            )}
          </section>

          {/* ==================================================
              RECENT PRODUCTS
          ================================================== */}

          <section
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #dce2ea",

              borderRadius:
                "16px",

              padding:
                "22px",

              boxShadow:
                "0 8px 30px rgba(15,23,42,0.06)",

              position:
                "sticky",

              top:
                "20px",
            }}
          >
            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap:
                  "10px",

                marginBottom:
                  "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize:
                      "12px",

                    fontWeight:
                      700,

                    color:
                      "#667085",

                    letterSpacing:
                      "0.06em",

                    textTransform:
                      "uppercase",

                    marginBottom:
                      "5px",
                  }}
                >
                  Testing
                </div>

                <h2
                  style={{
                    margin:
                      0,

                    fontSize:
                      "21px",
                  }}
                >
                  Recent Products
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  loadRecentProducts
                }
                disabled={
                  recentLoading
                }
                style={{
                  border:
                    "1px solid #d1d7e0",

                  background:
                    "#ffffff",

                  borderRadius:
                    "7px",

                  padding:
                    "8px 11px",

                  cursor:
                    recentLoading
                      ? "not-allowed"
                      : "pointer",

                  fontSize:
                    "12px",

                  fontWeight:
                    700,
                }}
              >
                {recentLoading
                  ? "Loading..."
                  : "Refresh"}
              </button>
            </div>

            <p
              style={{
                margin:
                  "0 0 18px",

                color:
                  "#667085",

                fontSize:
                  "13px",

                lineHeight:
                  1.5,
              }}
            >
              View recently uploaded
              products without
              uploading the PDF again.
            </p>

            {recentLoading &&
              recentProducts.length ===
                0 && (
                <div
                  style={{
                    padding:
                      "18px",

                    border:
                      "1px solid #e1e6ee",

                    borderRadius:
                      "10px",

                    background:
                      "#f8fafc",

                    color:
                      "#667085",

                    fontSize:
                      "13px",
                  }}
                >
                  Loading recent
                  products...
                </div>
              )}

            {!recentLoading &&
              recentProducts.length ===
                0 && (
                <div
                  style={{
                    padding:
                      "18px",

                    border:
                      "1px solid #e1e6ee",

                    borderRadius:
                      "10px",

                    background:
                      "#f8fafc",

                    color:
                      "#667085",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.5,
                  }}
                >
                  No recently
                  uploaded products
                  found.
                </div>
              )}

            <div
              style={{
                display:
                  "flex",

                flexDirection:
                  "column",

                gap:
                  "12px",

                maxHeight:
                  "620px",

                overflowY:
                  "auto",

                paddingRight:
                  "4px",
              }}
            >
              {recentProducts.map(
                (product) => {
                  const isSelected =
                    selectedRecentProduct
                      ?.material_id ===
                    product.material_id;

                  return (
                    <button
                      type="button"
                      key={
                        product.material_id
                      }
                      onClick={() =>
                        openRecentProduct(
                          product
                        )
                      }
                      style={{
                        width:
                          "100%",

                        textAlign:
                          "left",

                        border:
                          isSelected
                            ? "2px solid #1d4ed8"
                            : "1px solid #e1e6ee",

                        borderRadius:
                          "10px",

                        padding:
                          "15px",

                        background:
                          isSelected
                            ? "#eff6ff"
                            : "#f8fafc",

                        cursor:
                          "pointer",
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            "16px",

                          fontWeight:
                            800,

                          color:
                            "#172033",

                          marginBottom:
                            "6px",

                          wordBreak:
                            "break-word",
                        }}
                      >
                        {product.material_name ||
                          "Unnamed Product"}
                      </div>

                      <div
                        style={{
                          fontSize:
                            "12px",

                          color:
                            "#667085",

                          marginBottom:
                            "10px",
                        }}
                      >
                        {product.company ||
                          "Unknown Company"}
                      </div>

                      <div
                        style={{
                          display:
                            "grid",

                          gap:
                            "5px",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              "12px",
                          }}
                        >
                          <strong>
                            Company Code:
                          </strong>{" "}
                          {product.company_material_code ||
                            "Not available"}
                        </div>

                        <div
                          style={{
                            fontSize:
                              "12px",
                          }}
                        >
                          <strong>
                            Unique Code:
                          </strong>{" "}
                          {product.unique_product_code ||
                            "Not assigned"}
                        </div>

                        <div
                          style={{
                            fontSize:
                              "12px",

                            color:
                              "#5b21b6",

                            fontWeight:
                              700,
                          }}
                        >
                          <strong>
                            BMG:
                          </strong>{" "}
                          {product.bmg
                            ?.bmg_code ||
                            "Not assigned"}
                        </div>

                        <div
                          style={{
                            fontSize:
                              "12px",

                            color:
                              "#047857",

                            fontWeight:
                              700,
                          }}
                        >
                          <strong>
                            NCS:
                          </strong>{" "}
                          {product.bmg
                            ?.ncs_name ||
                            "Not assigned"}
                        </div>
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {/* ==================================================
                SELECTED RECENT PRODUCT
            ================================================== */}

            {selectedRecentProduct && (
              <div
                style={{
                  marginTop:
                    "18px",

                  padding:
                    "17px",

                  border:
                    "2px solid #123b70",

                  borderRadius:
                    "10px",

                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "12px",

                    fontWeight:
                      700,

                    color:
                      "#667085",

                    textTransform:
                      "uppercase",

                    marginBottom:
                      "7px",
                  }}
                >
                  Selected Product
                </div>

                <div
                  style={{
                    fontSize:
                      "18px",

                    fontWeight:
                      800,

                    marginBottom:
                      "12px",

                    wordBreak:
                      "break-word",
                  }}
                >
                  {
                    selectedRecentProduct
                      .material_name
                  }
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gap:
                      "8px",

                    fontSize:
                      "13px",
                  }}
                >
                  <div>
                    <strong>
                      Company:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .company
                    }
                  </div>

                  <div>
                    <strong>
                      Company Code:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .company_material_code ||
                      "Not available"
                    }
                  </div>

                  <div>
                    <strong>
                      Unique Product Code:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .unique_product_code ||
                      "Not available"
                    }
                  </div>

                  <div
                    style={{
                      color:
                        "#5b21b6",

                      fontWeight:
                        700,
                    }}
                  >
                    <strong>
                      BMG Common Code:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .bmg
                        ?.bmg_code ||
                      "Not assigned"
                    }
                  </div>

                  <div
                    style={{
                      color:
                        "#047857",

                      fontWeight:
                        700,
                    }}
                  >
                    <strong>
                      NCS Standard Name:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .bmg
                        ?.ncs_name ||
                      "Not assigned"
                    }
                  </div>

                  <div>
                    <strong>
                      Material ID:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .material_id
                    }
                  </div>

                  <div>
                    <strong>
                      Facility:
                    </strong>{" "}
                    {
                      selectedRecentProduct
                        .facility
                        ?.facility_name ||
                      "Not available"
                    }
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedRecentProduct(
                      null
                    )
                  }
                  style={{
                    marginTop:
                      "14px",

                    width:
                      "100%",

                    padding:
                      "9px 12px",

                    border:
                      "1px solid #d1d7e0",

                    borderRadius:
                      "7px",

                    background:
                      "#ffffff",

                    cursor:
                      "pointer",

                    fontWeight:
                      600,
                  }}
                >
                  Clear Selection
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ======================================================
            PDF RESULT
        ====================================================== */}

        {result &&
          result.type ===
            "pdf" && (
            <section
              style={{
                marginTop:
                  "30px",

                background:
                  "#ffffff",

                border:
                  "1px solid #dce2ea",

                borderRadius:
                  "16px",

                padding:
                  "30px",

                boxShadow:
                  "0 8px 30px rgba(15,23,42,0.06)",
              }}
            >
              {/* ==================================================
                  RESULT HEADER
              ================================================== */}

              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "space-between",

                  gap:
                    "20px",

                  marginBottom:
                    "28px",

                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display:
                        "inline-block",

                      padding:
                        "6px 12px",

                      borderRadius:
                        "20px",

                      background:
                        result.duplicate
                          ? "#fff7ed"
                          : "#ecfdf3",

                      color:
                        result.duplicate
                          ? "#c2410c"
                          : "#027a48",

                      fontSize:
                        "12px",

                      fontWeight:
                        700,

                      marginBottom:
                        "10px",
                    }}
                  >
                    {result.duplicate
                      ? "⚠ EXISTING PRODUCT"
                      : "✓ PRODUCT SAVED"}
                  </div>

                  <h2
                    style={{
                      margin:
                        0,

                      fontSize:
                        "25px",
                    }}
                  >
                    {result.duplicate
                      ? "Existing Product Found"
                      : "Material Ingestion Complete"}
                  </h2>

                  <p
                    style={{
                      margin:
                        "8px 0 0",

                      color:
                        "#667085",
                    }}
                  >
                    {result.fileName}
                  </p>
                </div>

                <button
                  onClick={
                    resetUpload
                  }
                  style={{
                    padding:
                      "10px 17px",

                    background:
                      "#ffffff",

                    border:
                      "1px solid #d1d7e0",

                    borderRadius:
                      "8px",

                    cursor:
                      "pointer",

                    fontWeight:
                      600,
                  }}
                >
                  Upload Another
                </button>
              </div>

              {/* ==================================================
                  WORKFLOW STATUS
              ================================================== */}

              <div
                style={{
                  marginBottom:
                    "25px",

                  padding:
                    "16px 18px",

                  borderRadius:
                    "10px",

                  background:
                    "#eff6ff",

                  border:
                    "1px solid #bfdbfe",

                  color:
                    "#1e3a8a",

                  lineHeight:
                    1.6,
                }}
              >
                <strong>
                  Processing complete.
                </strong>{" "}
                {result.duplicate
                  ? "The existing product record was reused."
                  : "The new product was saved."}{" "}
                BMG Common Code:
                <strong>
                  {" "}
                  {getBmgCommonCode()}
                </strong>
                .
              </div>

              {/* ==================================================
                  PRODUCT IDENTITY
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Product Identity
                </h3>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",

                    gap:
                      "14px",
                  }}
                >
                  <InfoCard
                    label="Unique Product Code"
                    value={
                      result.savedData
                        ?.unique_product_code
                    }
                    highlight={
                      true
                    }
                  />

                  <InfoCard
                    label="BMG Common Code"
                    value={
                      getBmgCommonCode()
                    }
                    commonCode={
                      true
                    }
                  />

                  <InfoCard
                    label="NCS Standard Name"
                    value={
                      getNcsName()
                    }
                    ncsName={
                      true
                    }
                  />

                  <InfoCard
                    label="Company"
                    value={
                      result.savedData
                        ?.company ||
                      result.savedData
                        ?.company_name ||
                      result.structuredData
                        ?.company
                    }
                  />

                  <InfoCard
                    label="Company Material Code"
                    value={
                      result.savedData
                        ?.company_material_code ||
                      result.structuredData
                        ?.company_material_code
                    }
                  />

                  <InfoCard
                    label="Material ID"
                    value={
                      result.savedData
                        ?.material_id
                    }
                  />

                  <InfoCard
                    label="Material Name"
                    value={
                      result.savedData
                        ?.material_name ||
                      result.structuredData
                        ?.material_name
                    }
                  />

                  <InfoCard
                    label="Material Family"
                    value={
                      result.structuredData
                        ?.material_family
                    }
                  />

                  <InfoCard
                    label="Product Type"
                    value={
                      result.structuredData
                        ?.product_type
                    }
                  />

                  <InfoCard
                    label="BMG Status"
                    value={
                      result.savedData
                        ?.bmg_status ||
                      "PROPOSED"
                    }
                  />

                  <InfoCard
                    label="AI Confidence"
                    value={
                      result.savedData
                        ?.ai_confidence !==
                      undefined
                        ? `${result.savedData.ai_confidence}%`
                        : "Not available"
                    }
                  />
                </div>
              </section>

              {/* ==================================================
                  FACILITY / LOCATION
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Facility & Location
                </h3>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(230px, 1fr))",

                    gap:
                      "14px",
                  }}
                >
                  <InfoCard
                    label="Facility / Plant"
                    value={
                      result.savedData
                        ?.facility_name ||
                      result.structuredData
                        ?.facility_name
                    }
                  />

                  <InfoCard
                    label="City"
                    value={
                      result.savedData
                        ?.location
                        ?.city ||
                      result.structuredData
                        ?.location
                        ?.city
                    }
                  />

                  <InfoCard
                    label="State"
                    value={
                      result.savedData
                        ?.location
                        ?.state ||
                      result.structuredData
                        ?.location
                        ?.state
                    }
                  />

                  <InfoCard
                    label="Country"
                    value={
                      result.savedData
                        ?.location
                        ?.country ||
                      result.structuredData
                        ?.location
                        ?.country
                    }
                  />

                  <InfoCard
                    label="Postal Code"
                    value={
                      result.savedData
                        ?.location
                        ?.postal_code ||
                      result.structuredData
                        ?.location
                        ?.postal_code
                    }
                  />

                  <InfoCard
                    label="Facility ID"
                    value={
                      result.savedData
                        ?.facility_id
                    }
                  />

                  <InfoCard
                    label="Full Location"
                    value={
                      getLocationText()
                    }
                  />
                </div>
              </section>

              {/* ==================================================
                  BMG STANDARDIZATION
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  BMG Standardization
                </h3>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(250px, 1fr))",

                    gap:
                      "14px",
                  }}
                >
                  <InfoCard
                    label="BMG Common Code"
                    value={
                      getBmgCommonCode()
                    }
                    commonCode={
                      true
                    }
                  />

                  <InfoCard
                    label="NCS Standard Name"
                    value={
                      getNcsName()
                    }
                    ncsName={
                      true
                    }
                  />

                  <InfoCard
                    label="BMG Assignment"
                    value={
                      result.savedData
                        ?.action ||
                      (result.duplicate
                        ? "Existing Assignment"
                        : "AI Assigned")
                    }
                  />

                  <InfoCard
                    label="AI Confidence"
                    value={
                      result.savedData
                        ?.ai_confidence !==
                      undefined
                        ? `${result.savedData.ai_confidence}%`
                        : "Not available"
                    }
                  />

                  <InfoCard
                    label="Government Review"
                    value={
                      result.savedData
                        ?.government_review ||
                      "PENDING"
                    }
                  />
                </div>

                {result.savedData
                  ?.ai_reason && (
                  <div
                    style={{
                      marginTop:
                        "14px",

                      padding:
                        "16px",

                      border:
                        "1px solid #e1e6ee",

                      borderRadius:
                        "10px",

                      background:
                        "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "12px",

                        fontWeight:
                          700,

                        color:
                          "#667085",

                        marginBottom:
                          "7px",
                      }}
                    >
                      AI Assignment Reason
                    </div>

                    <div
                      style={{
                        lineHeight:
                          1.6,

                        fontSize:
                          "14px",
                      }}
                    >
                      {
                        result.savedData
                          .ai_reason
                      }
                    </div>
                  </div>
                )}

                {Array.isArray(
                  result.savedData
                    ?.matched_aspects
                ) &&
                  result.savedData
                    .matched_aspects
                    .length >
                    0 && (
                    <div
                      style={{
                        marginTop:
                          "14px",

                        padding:
                          "16px",

                        border:
                          "1px solid #e1e6ee",

                        borderRadius:
                          "10px",

                        background:
                          "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            "12px",

                          fontWeight:
                            700,

                          color:
                            "#667085",

                          marginBottom:
                            "8px",
                        }}
                      >
                        Matched Technical Aspects
                      </div>

                      <div
                        style={{
                          display:
                            "flex",

                          flexWrap:
                            "wrap",

                          gap:
                            "8px",
                        }}
                      >
                        {result.savedData
                          .matched_aspects
                          .map(
                            (
                              item,
                              index
                            ) => (
                              <span
                                key={
                                  index
                                }
                                style={{
                                  padding:
                                    "6px 10px",

                                  borderRadius:
                                    "20px",

                                  background:
                                    "#eef2ff",

                                  border:
                                    "1px solid #c7d2fe",

                                  fontSize:
                                    "12px",

                                  fontWeight:
                                    600,
                                }}
                              >
                                {
                                  item
                                }
                              </span>
                            )
                          )}
                      </div>
                    </div>
                  )}

                {Array.isArray(
                  result.savedData
                    ?.differences
                ) &&
                  result.savedData
                    .differences
                    .length >
                    0 && (
                    <div
                      style={{
                        marginTop:
                          "14px",

                        padding:
                          "16px",

                        border:
                          "1px solid #e1e6ee",

                        borderRadius:
                          "10px",

                        background:
                          "#fff7ed",
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            "12px",

                          fontWeight:
                            700,

                          color:
                            "#9a3412",

                          marginBottom:
                            "8px",
                        }}
                      >
                        Technical Differences Considered
                      </div>

                      {result.savedData
                        .differences
                        .map(
                          (
                            item,
                            index
                          ) => (
                            <div
                              key={
                                index
                              }
                              style={{
                                padding:
                                  "6px 0",

                                fontSize:
                                  "13px",

                                lineHeight:
                                  1.5,
                              }}
                            >
                              •{" "}
                              {
                                item
                              }
                            </div>
                          )
                        )}
                    </div>
                  )}
              </section>

              {/* ==================================================
                  TECHNICAL INFORMATION
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Technical Information
                </h3>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(250px, 1fr))",

                    gap:
                      "14px",
                  }}
                >
                  <DetailCard
                    label="Description"
                    value={
                      result.structuredData
                        ?.description
                    }
                  />

                  <DetailCard
                    label="Pressure Rating"
                    value={
                      result.structuredData
                        ?.pressure_rating
                    }
                  />

                  <DetailCard
                    label="Temperature Rating"
                    value={
                      result.structuredData
                        ?.temperature_rating
                    }
                  />

                  <DetailCard
                    label="Manufacturer"
                    value={
                      result.structuredData
                        ?.manufacturer
                    }
                  />

                  <DetailCard
                    label="Model"
                    value={
                      result.structuredData
                        ?.model
                    }
                  />

                  <DetailCard
                    label="Part Number"
                    value={
                      result.structuredData
                        ?.part_number
                    }
                  />

                  <DetailCard
                    label="Testing Standard"
                    value={
                      result.structuredData
                        ?.testing_standard
                    }
                  />

                  <DetailCard
                    label="Actuation"
                    value={
                      result.structuredData
                        ?.actuation
                    }
                  />

                  <DetailCard
                    label="Application"
                    value={
                      result.structuredData
                        ?.application
                    }
                  />

                  <DetailCard
                    label="Unit of Measure"
                    value={
                      result.structuredData
                        ?.unit_of_measure
                    }
                  />

                  <DetailCard
                    label="Drawing Number"
                    value={
                      result.structuredData
                        ?.drawing_number
                    }
                  />

                  <DetailCard
                    label="Revision"
                    value={
                      result.structuredData
                        ?.revision
                    }
                  />

                  <DetailCard
                    label="Datasheet Number"
                    value={
                      result.structuredData
                        ?.datasheet_number
                    }
                  />

                  <DetailCard
                    label="Design Code"
                    value={
                      result.structuredData
                        ?.design_code
                    }
                  />

                  <DetailCard
                    label="Standards"
                    value={(
                      result
                        .structuredData
                        ?.standards ||
                      []
                    ).join(
                      ", "
                    )}
                  />

                  <DetailCard
                    label="End Connections"
                    value={(
                      result
                        .structuredData
                        ?.end_connections ||
                      []
                    ).join(
                      ", "
                    )}
                  />
                </div>
              </section>

              {/* ==================================================
                  DIMENSIONS
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Dimensions
                </h3>

                <pre
                  style={{
                    margin:
                      0,

                    background:
                      "#f8fafc",

                    border:
                      "1px solid #e1e6ee",

                    borderRadius:
                      "10px",

                    padding:
                      "18px",

                    whiteSpace:
                      "pre-wrap",

                    overflow:
                      "auto",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {formatJSON(
                    result.structuredData
                      ?.dimensions
                  )}
                </pre>
              </section>

              {/* ==================================================
                  MATERIAL COMPONENTS
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Material / Component Details
                </h3>

                <pre
                  style={{
                    margin:
                      0,

                    background:
                      "#f8fafc",

                    border:
                      "1px solid #e1e6ee",

                    borderRadius:
                      "10px",

                    padding:
                      "18px",

                    whiteSpace:
                      "pre-wrap",

                    overflow:
                      "auto",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {formatJSON(
                    result.structuredData
                      ?.materials
                  )}
                </pre>
              </section>

              {/* ==================================================
                  DESIGN FEATURES
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Design Features
                </h3>

                <div
                  style={{
                    display:
                      "flex",

                    flexDirection:
                      "column",

                    gap:
                      "8px",
                  }}
                >
                  {(
                    result
                      .structuredData
                      ?.design_features ||
                    []
                  ).length >
                  0 ? (
                    result
                      .structuredData
                      .design_features
                      .map(
                        (
                          feature,
                          index
                        ) => (
                          <div
                            key={
                              index
                            }
                            style={{
                              padding:
                                "12px 14px",

                              background:
                                "#f8fafc",

                              border:
                                "1px solid #e1e6ee",

                              borderRadius:
                                "8px",

                              fontSize:
                                "14px",

                              lineHeight:
                                1.5,
                            }}
                          >
                            {
                              feature
                            }
                          </div>
                        )
                      )
                  ) : (
                    <div
                      style={{
                        padding:
                          "12px 14px",

                        color:
                          "#667085",

                        background:
                          "#f8fafc",

                        border:
                          "1px solid #e1e6ee",

                        borderRadius:
                          "8px",
                      }}
                    >
                      No design
                      features
                      explicitly
                      extracted.
                    </div>
                  )}
                </div>
              </section>

              {/* ==================================================
                  ADDITIONAL ATTRIBUTES
              ================================================== */}

              <section
                style={{
                  marginBottom:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Additional Extracted Attributes
                </h3>

                <pre
                  style={{
                    margin:
                      0,

                    background:
                      "#f8fafc",

                    border:
                      "1px solid #e1e6ee",

                    borderRadius:
                      "10px",

                    padding:
                      "18px",

                    whiteSpace:
                      "pre-wrap",

                    overflow:
                      "auto",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.6,
                  }}
                >
                  {formatJSON(
                    result
                      .structuredData
                      ?.additional_attributes
                  )}
                </pre>
              </section>

              {/* ==================================================
                  DATABASE / SOURCE
              ================================================== */}

              <section
                style={{
                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Database & Source
                </h3>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(230px, 1fr))",

                    gap:
                      "14px",
                  }}
                >
                  <InfoCard
                    label="Datasheet ID"
                    value={
                      result.savedData
                        ?.datasheet_id
                    }
                  />

                  <InfoCard
                    label="Storage Path"
                    value={
                      result.savedData
                        ?.storage_path ||
                      result.savedData
                        ?.file_path
                    }
                  />

                  <InfoCard
                    label="Product Fingerprint"
                    value={
                      result.savedData
                        ?.fingerprint ||
                      result.savedData
                        ?.product_fingerprint
                    }
                  />

                  <InfoCard
                    label="Unique Product Code"
                    value={
                      result.savedData
                        ?.unique_product_code
                    }
                  />

                  <InfoCard
                    label="BMG Common Code"
                    value={
                      getBmgCommonCode()
                    }
                    commonCode={
                      true
                    }
                  />

                  <InfoCard
                    label="NCS Status"
                    value={
                      result.savedData
                        ?.bmg_status ||
                      "PROPOSED"
                    }
                  />

                  <InfoCard
                    label="Comparison"
                    value="NOT STARTED"
                  />
                </div>
              </section>

              {/* ==================================================
                  RAW AI JSON
              ================================================== */}

              <section
                style={{
                  marginTop:
                    "30px",

                  borderTop:
                    "1px solid #e1e6ee",

                  paddingTop:
                    "28px",
                }}
              >
                <h3
                  style={{
                    fontSize:
                      "20px",

                    margin:
                      "0 0 16px",
                  }}
                >
                  Complete Extracted Data
                </h3>

                <div
                  style={{
                    background:
                      "#0f172a",

                    color:
                      "#e2e8f0",

                    borderRadius:
                      "10px",

                    padding:
                      "20px",

                    overflow:
                      "auto",

                    fontSize:
                      "13px",

                    lineHeight:
                      1.65,

                    whiteSpace:
                      "pre-wrap",

                    maxHeight:
                      "700px",
                  }}
                >
                  {formatJSON(
                    result.structuredData
                  )}
                </div>
              </section>
            </section>
          )}

        {/* ======================================================
            EXCEL RESULT
        ====================================================== */}

        {result &&
          result.type ===
            "excel" && (
            <section
              style={{
                marginTop:
                  "30px",

                background:
                  "#ffffff",

                border:
                  "1px solid #dce2ea",

                borderRadius:
                  "16px",

                padding:
                  "30px",

                boxShadow:
                  "0 8px 30px rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  marginBottom:
                    "20px",

                  gap:
                    "20px",

                  flexWrap:
                    "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display:
                        "inline-block",

                      padding:
                        "6px 12px",

                      borderRadius:
                        "20px",

                      background:
                        "#eff6ff",

                      color:
                        "#1d4ed8",

                      fontSize:
                        "12px",

                      fontWeight:
                        700,

                      marginBottom:
                        "10px",
                    }}
                  >
                    ✓ EXTRACTED
                  </div>

                  <h2
                    style={{
                      margin:
                        0,
                    }}
                  >
                    Excel Datasheet
                  </h2>
                </div>

                <button
                  onClick={
                    resetUpload
                  }
                  style={{
                    padding:
                      "10px 17px",

                    background:
                      "#ffffff",

                    border:
                      "1px solid #d1d7e0",

                    borderRadius:
                      "8px",

                    cursor:
                      "pointer",
                  }}
                >
                  Upload Another
                </button>
              </div>

              {Object.entries(
                result.sheets ||
                  {}
              ).map(
                ([
                  sheetName,
                  rows,
                ]) => (
                  <div
                    key={
                      sheetName
                    }
                    style={{
                      marginTop:
                        "25px",
                    }}
                  >
                    <h3>
                      {
                        sheetName
                      }
                    </h3>

                    <div
                      style={{
                        background:
                          "#0f172a",

                        color:
                          "#e2e8f0",

                        padding:
                          "20px",

                        borderRadius:
                          "10px",

                        overflow:
                          "auto",

                        maxHeight:
                          "500px",

                        fontSize:
                          "13px",

                        whiteSpace:
                          "pre-wrap",
                      }}
                    >
                      {formatJSON(
                        rows
                      )}
                    </div>
                  </div>
                )
              )}
            </section>
          )}
      </div>

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer
        style={{
          background:
            "#172033",

          color:
            "#cbd5e1",

          padding:
            "25px",

          textAlign:
            "center",

          fontSize:
            "12px",
        }}
      >
        Bharat Material Grid
        {" • "}
        Industrial Material
        Harmonization Platform
      </footer>
    </main>
  );
}

// ==========================================================
// INFO CARD
// ==========================================================

function InfoCard({
  label,
  value,
  highlight = false,
  commonCode = false,
  ncsName = false,
}) {
  const isUnassigned =
    value ===
      "NOT ASSIGNED" ||
    value ===
      "NOT ASSIGNED YET";

  return (
    <div
      style={{
        padding:
          "16px",

        border:
          highlight
            ? "2px solid #1d4ed8"
            : commonCode
            ? "2px solid #7c3aed"
            : ncsName
            ? "2px solid #059669"
            : "1px solid #e1e6ee",

        borderRadius:
          "10px",

        background:
          highlight
            ? "#eff6ff"
            : commonCode
            ? "#f5f3ff"
            : ncsName
            ? "#ecfdf5"
            : "#f8fafc",
      }}
    >
      <div
        style={{
          fontSize:
            "11px",

          textTransform:
            "uppercase",

          letterSpacing:
            "0.06em",

          color:
            highlight
              ? "#1d4ed8"
              : commonCode
              ? "#7c3aed"
              : ncsName
              ? "#047857"
              : "#667085",

          marginBottom:
            "7px",

          fontWeight:
            700,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight:
            700,

          fontSize:
            highlight ||
            commonCode ||
            ncsName
              ? "16px"
              : "14px",

          wordBreak:
            "break-word",

          color:
            highlight
              ? "#1e3a8a"
              : commonCode
              ? "#5b21b6"
              : ncsName
              ? "#047857"
              : "#172033",

          fontStyle:
            isUnassigned
              ? "italic"
              : "normal",
        }}
      >
        {value ??
          "Not available"}
      </div>
    </div>
  );
}

// ==========================================================
// DETAIL CARD
// ==========================================================

function DetailCard({
  label,
  value,
}) {
  return (
    <div
      style={{
        border:
          "1px solid #e1e6ee",

        borderRadius:
          "10px",

        padding:
          "16px",

        background:
          "#ffffff",
      }}
    >
      <div
        style={{
          fontSize:
            "12px",

          color:
            "#667085",

          marginBottom:
            "6px",

          fontWeight:
            600,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            "14px",

          fontWeight:
            700,

          lineHeight:
            1.5,

          wordBreak:
            "break-word",
        }}
      >
        {value ??
          "Not specified"}
      </div>
    </div>
  );
}