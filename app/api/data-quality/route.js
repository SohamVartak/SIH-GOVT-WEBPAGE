import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(url, key);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  const first = new Set(
    normalize(a)
      .split(" ")
      .filter(word => word.length >= 2)
  );

  const second = new Set(
    normalize(b)
      .split(" ")
      .filter(word => word.length >= 2)
  );

  if (!first.size || !second.size) {
    return 0;
  }

  let common = 0;

  for (const word of first) {
    if (second.has(word)) {
      common++;
    }
  }

  const union = new Set([
    ...first,
    ...second,
  ]).size;

  return union
    ? common / union
    : 0;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const pageSize = 1000;
    let from = 0;

    const materials = [];

    while (true) {
      const to =
        from +
        pageSize -
        1;

      const {
        data,
        error,
      } = await supabase
        .from("materials")
        .select(
          `
            id,
            company,
            material_number,
            description,
            specifications,
            category
          `
        )
        .order("id", {
          ascending: true,
        })
        .range(
          from,
          to
        );

      if (error) {
        throw new Error(
          `Failed to load materials: ${error.message}`
        );
      }

      const page = data || [];

      materials.push(
        ...page
      );

      if (
        page.length <
        pageSize
      ) {
        break;
      }

      from +=
        pageSize;
    }

    /* ========================================================
       BASIC QUALITY COUNTS
    ======================================================== */

    const missingCompany = [];
    const missingMaterialNumber = [];
    const missingDescription = [];
    const missingSpecifications = [];
    const incompleteRecords = [];

    const companyMaterialMap =
      new Map();

    for (
      const material of materials
    ) {
      const company =
        cleanText(
          material.company
        );

      const materialNumber =
        cleanText(
          material.material_number
        );

      const description =
        cleanText(
          material.description
        );

      const specifications =
        cleanText(
          material.specifications
        );

      const missingFields = [];

      if (!company) {
        missingFields.push(
          "company"
        );

        missingCompany.push(
          material
        );
      }

      if (!materialNumber) {
        missingFields.push(
          "material_number"
        );

        missingMaterialNumber.push(
          material
        );
      }

      if (!description) {
        missingFields.push(
          "description"
        );

        missingDescription.push(
          material
        );
      }

      if (!specifications) {
        missingFields.push(
          "specifications"
        );

        missingSpecifications.push(
          material
        );
      }

      if (
        missingFields.length
      ) {
        incompleteRecords.push({
          id:
            material.id,

          company:
            company ||
            null,

          material_number:
            materialNumber ||
            null,

          description:
            description ||
            null,

          missing_fields:
            missingFields,
        });
      }

      /*
       * Duplicate material-number grouping
       * is checked within CPSE/company first.
       */
      const normalizedCompany =
        company.toUpperCase();

      const normalizedCode =
        materialNumber.toUpperCase();

      if (
        normalizedCompany &&
        normalizedCode
      ) {
        const key =
          `${normalizedCompany}::${normalizedCode}`;

        if (
          !companyMaterialMap.has(
            key
          )
        ) {
          companyMaterialMap.set(
            key,
            []
          );
        }

        companyMaterialMap
          .get(key)
          .push(material);
      }
    }

    /* ========================================================
       DUPLICATE MATERIAL NUMBERS
    ======================================================== */

    const duplicateMaterialNumbers =
      [];

    for (
      const [
        key,
        rows,
      ] of companyMaterialMap.entries()
    ) {
      if (
        rows.length >
        1
      ) {
        duplicateMaterialNumbers.push({
          key,
          company:
            rows[0].company,
          material_number:
            rows[0].material_number,
          count:
            rows.length,
          material_ids:
            rows.map(
              row =>
                row.id
            ),
        });
      }
    }

    /* ========================================================
       POTENTIAL DESCRIPTION DUPLICATES
    ======================================================== */

    const descriptionGroups =
      new Map();

    for (
      const material of materials
    ) {
      const normalizedDescription =
        normalize(
          material.description
        );

      if (
        normalizedDescription.length <
        5
      ) {
        continue;
      }

      if (
        !descriptionGroups.has(
          normalizedDescription
        )
      ) {
        descriptionGroups.set(
          normalizedDescription,
          []
        );
      }

      descriptionGroups
        .get(
          normalizedDescription
        )
        .push(
          material
        );
    }

    const exactDescriptionDuplicates =
      Array.from(
        descriptionGroups.entries()
      )
        .filter(
          ([, rows]) =>
            rows.length > 1
        )
        .map(
          ([
            normalizedDescription,
            rows,
          ]) => ({
            normalized_description:
              normalizedDescription,

            count:
              rows.length,

            material_ids:
              rows.map(
                row =>
                  row.id
              ),

            companies:
              Array.from(
                new Set(
                  rows.map(
                    row =>
                      cleanText(
                        row.company
                      )
                  )
                )
              ),
          })
        );

    /* ========================================================
       CROSS-COMPANY POTENTIAL DUPLICATES
    ======================================================== */

    const sampleLimit =
      600;

    const comparisonMaterials =
      materials
        .filter(
          material =>
            cleanText(
              material.description
            ).length >=
            5
        )
        .slice(
          0,
          sampleLimit
        );

    const potentialCrossCompanyMatches =
      [];

    for (
      let i = 0;
      i <
        comparisonMaterials.length;
      i++
    ) {
      const source =
        comparisonMaterials[i];

      const sourceCompany =
        cleanText(
          source.company
        ).toUpperCase();

      for (
        let j = i + 1;
        j <
          comparisonMaterials.length;
        j++
      ) {
        const candidate =
          comparisonMaterials[j];

        const candidateCompany =
          cleanText(
            candidate.company
          ).toUpperCase();

        if (
          !sourceCompany ||
          !candidateCompany ||
          sourceCompany ===
            candidateCompany
        ) {
          continue;
        }

        const score =
          similarity(
            source.description,
            candidate.description
          );

        if (
          score >=
          0.75
        ) {
          potentialCrossCompanyMatches.push({
            source_material_id:
              source.id,

            source_company:
              source.company,

            source_description:
              source.description,

            candidate_material_id:
              candidate.id,

            candidate_company:
              candidate.company,

            candidate_description:
              candidate.description,

            similarity_percent:
              Number(
                (
                  score *
                  100
                ).toFixed(2)
              ),
          });
        }
      }
    }

    potentialCrossCompanyMatches.sort(
      (a, b) =>
        b.similarity_percent -
        a.similarity_percent
    );

    const limitedPotentialMatches =
      potentialCrossCompanyMatches.slice(
        0,
        200
      );

    /* ========================================================
       QUALITY SCORE
    ======================================================== */

    const total =
      materials.length;

    const complete =
      total -
      incompleteRecords.length;

    const completenessPercent =
      total > 0
        ? Number(
            (
              (complete /
                total) *
              100
            ).toFixed(2)
          )
        : 0;

    const duplicateCodeCount =
      duplicateMaterialNumbers.reduce(
        (sum, group) =>
          sum +
          Math.max(
            0,
            group.count - 1
          ),
        0
      );

    const qualityPenalty =
      total > 0
        ? (
            incompleteRecords.length /
              total
          ) *
            50 +
          (
            duplicateCodeCount /
              total
          ) *
            30
        : 0;

    const qualityScore =
      Math.max(
        0,
        Number(
          (
            100 -
            qualityPenalty
          ).toFixed(2)
        )
      );

    /* ========================================================
       CATEGORY / COMPANY SUMMARY
    ======================================================== */

    const companies =
      new Map();

    const categories =
      new Map();

    for (
      const material of materials
    ) {
      const company =
        cleanText(
          material.company
        );

      const category =
        cleanText(
          material.category
        );

      if (company) {
        companies.set(
          company,
          (
            companies.get(
              company
            ) || 0
          ) + 1
        );
      }

      if (category) {
        categories.set(
          category,
          (
            categories.get(
              category
            ) || 0
          ) + 1
        );
      }
    }

    return NextResponse.json({
      success: true,

      generated_at:
        new Date().toISOString(),

      summary: {
        total_records:
          total,

        complete_records:
          complete,

        incomplete_records:
          incompleteRecords.length,

        completeness_percent:
          completenessPercent,

        quality_score:
          qualityScore,

        missing_company:
          missingCompany.length,

        missing_material_number:
          missingMaterialNumber.length,

        missing_description:
          missingDescription.length,

        missing_specifications:
          missingSpecifications.length,

        duplicate_material_numbers:
          duplicateCodeCount,

        duplicate_material_number_groups:
          duplicateMaterialNumbers.length,

        exact_description_duplicate_groups:
          exactDescriptionDuplicates.length,

        potential_cross_company_matches:
          limitedPotentialMatches.length,
      },

      issues: {
        incomplete_records:
          incompleteRecords.slice(
            0,
            200
          ),

        duplicate_material_numbers:
          duplicateMaterialNumbers.slice(
            0,
            200
          ),

        exact_description_duplicates:
          exactDescriptionDuplicates.slice(
            0,
            200
          ),

        potential_cross_company_matches:
          limitedPotentialMatches,
      },

      company_distribution:
        Array.from(
          companies.entries()
        )
          .map(
            ([company, records]) => ({
              company,
              records,
            })
          )
          .sort(
            (a, b) =>
              b.records -
              a.records
          ),

      category_distribution:
        Array.from(
          categories.entries()
        )
          .map(
            ([category, records]) => ({
              category,
              records,
            })
          )
          .sort(
            (a, b) =>
              b.records -
              a.records
          )
          .slice(
            0,
            100
          ),
    });
  } catch (error) {
    console.error(
      "Data quality API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to analyze material data quality.",
        details:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}