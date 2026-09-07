import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const text = body.text;

    if (!text) {
      return NextResponse.json(
        {
          success: false,
          error: "No extracted text provided",
        },
        { status: 400 }
      );
    }

    const prompt = `
You are an industrial material datasheet analysis AI.

Analyze the following datasheet text and convert it into structured
technical material information.

IMPORTANT:
- Do not invent information.
- Only use information present in the datasheet.
- Preserve the original company material code.
- Preserve the original material name.
- Extract technical specifications accurately.
- If a field is not present, use null.
- Return ONLY valid JSON.
- Do not include markdown or explanations.

Return this structure:

{
  "company": null,
  "material_name": null,
  "company_material_code": null,
  "material_family": null,
  "description": null,
  "product_type": null,
  "design_features": [],
  "dimensions": {
    "size_range": null,
    "pressure_class": null,
    "face_to_face": null
  },
  "materials": {
    "body": null,
    "bonnet": null,
    "disc": null,
    "seat": null,
    "stem": null,
    "bolts": null,
    "nuts": null,
    "gasket": null,
    "packing": null,
    "gland": null,
    "handwheel": null,
    "other": []
  },
  "standards": [],
  "pressure_rating": null,
  "temperature_rating": null,
  "end_connections": [],
  "testing_standard": null,
  "actuation": null,
  "manufacturer": null,
  "model": null,
  "additional_attributes": {}
}

DATASHEET TEXT:

${text}
`;

    const response = await ai.models.generateContent({
  model: "gemini-3.6-flash",
  contents: prompt,
    });

    const responseText = response.text;

    if (!responseText) {
      throw new Error("AI returned an empty response");
    }

    let structuredData;

    try {
      structuredData = JSON.parse(responseText);
    } catch (error) {
      console.error("AI JSON parsing error:", responseText);

      return NextResponse.json(
        {
          success: false,
          error: "AI returned invalid JSON",
          rawResponse: responseText,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: structuredData,
    });
  } catch (error) {
    console.error("AI structuring error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to structure datasheet",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}