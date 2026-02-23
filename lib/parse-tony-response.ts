import type { FeatureType } from "./tony-prompt"
import { FEATURE_STYLES } from "./tony-prompt"

export interface TonyFeature {
  id: string
  type: FeatureType
  label: string
  priority: number
  reason: string
  geometry: {
    type: "Polygon" | "LineString" | "Point"
    coordinates: number[][] | number[][][] | number[]
  }
  style: {
    color: string
    fillOpacity: number
    weight: number
  }
}

export interface ParsedTonyResponse {
  analysis: string
  priorities: string[]
  thisWeek: string
  features: TonyFeature[]
  rawText: string
}

export function parseTonyResponse(rawText: string): ParsedTonyResponse {
  const result: ParsedTonyResponse = {
    analysis: "",
    priorities: [],
    thisWeek: "",
    features: [],
    rawText,
  }

  // Extract ANALYSIS section
  const analysisMatch = rawText.match(/ANALYSIS:\s*\n([\s\S]*?)(?=\nPRIORITIES:|$)/)
  if (analysisMatch) result.analysis = analysisMatch[1].trim()

  // Extract PRIORITIES section
  const prioritiesMatch = rawText.match(/PRIORITIES:\s*\n([\s\S]*?)(?=\nTHIS_WEEK:|$)/)
  if (prioritiesMatch) {
    result.priorities = prioritiesMatch[1]
      .trim()
      .split("\n")
      .filter((line) => /^\d+[\.\)]/.test(line.trim()))
      .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean)
  }

  // Extract THIS_WEEK section
  const thisWeekMatch = rawText.match(/THIS_WEEK:\s*\n([\s\S]*?)(?=\nDRAW_FEATURES:|$)/)
  if (thisWeekMatch) result.thisWeek = thisWeekMatch[1].trim()

  // Extract JSON features block — handle both ```json and plain ``` fences
  const jsonMatch = rawText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      const rawFeatures: TonyFeature[] = parsed.features || []

      // Normalize styles: if Tony returns a style, merge with our defaults
      result.features = rawFeatures.map((f) => ({
        ...f,
        style: {
          ...(FEATURE_STYLES[f.type] ?? { color: "#ffffff", fillOpacity: 0.3, weight: 2 }),
          ...f.style,
        },
      }))
    } catch (e) {
      console.error("Failed to parse Tony features JSON:", e)

      // Attempt a more lenient extraction — find the first valid JSON object in the block
      try {
        const openBrace = jsonMatch[1].indexOf("{")
        const closeBrace = jsonMatch[1].lastIndexOf("}")
        if (openBrace !== -1 && closeBrace !== -1) {
          const trimmed = jsonMatch[1].slice(openBrace, closeBrace + 1)
          const parsed = JSON.parse(trimmed)
          result.features = (parsed.features || []).map((f: TonyFeature) => ({
            ...f,
            style: {
              ...(FEATURE_STYLES[f.type] ?? { color: "#ffffff", fillOpacity: 0.3, weight: 2 }),
              ...f.style,
            },
          }))
        }
      } catch {
        // Parsing fully failed — features stay empty
      }
    }
  }

  return result
}
