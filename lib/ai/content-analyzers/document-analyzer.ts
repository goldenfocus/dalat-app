import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface DocumentAnalysis {
  ai_description: string;
  ai_title: string;
  ai_tags: string[];
  pdf_summary: string;
  pdf_extracted_text: string;
  pdf_page_count: number | null;
  pdf_key_topics: string[];
  content_language: string;
  quality_score: number;
}

/**
 * Extract text from a PDF using pdf.js (runs in Node.js environment).
 * Falls back to fetching raw text for non-PDF documents.
 */
async function extractDocumentText(
  fileUrl: string,
  mimeType: string | null
): Promise<{ text: string; pageCount: number | null }> {
  // For PDFs, we'd normally use pdf.js, but in a serverless environment
  // we'll use Claude's document understanding capabilities directly
  // by sending the document URL

  // Check if it's a PDF
  const isPdf = mimeType?.includes("pdf") || fileUrl.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    // For other documents (txt, etc.), fetch raw content
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }
      const text = await response.text();
      return { text: text.slice(0, 50000), pageCount: null }; // Limit to 50k chars
    } catch (error) {
      console.error("Error fetching document:", error);
      return { text: "", pageCount: null };
    }
  }

  // For PDFs, we'll let Claude analyze it directly
  // Return empty text and let the summarization handle it with the URL
  return { text: "", pageCount: null };
}

/**
 * Summarize document content using Claude.
 * Can analyze PDFs directly via URL.
 */
async function summarizeDocument(
  fileUrl: string,
  extractedText: string | null,
  filename: string | null
): Promise<{
  ai_description: string;
  ai_title: string;
  pdf_summary: string;
  ai_tags: string[];
  pdf_key_topics: string[];
  content_language: string;
  pdf_extracted_text: string;
  pdf_page_count: number | null;
}> {
  const isPdf = fileUrl.toLowerCase().includes(".pdf");

  // Build the prompt
  const prompt = `Analyze this document${filename ? ` (${filename})` : ""} for SEO and search indexing.

${extractedText ? `Document content:\n${extractedText.slice(0, 10000)}` : "Please analyze the document at the provided URL."}

Return JSON with these fields:
{
  "ai_description": "2-3 sentence SEO description of the document",
  "ai_title": "Short descriptive title (5-10 words)",
  "pdf_summary": "Detailed summary of the document content (2-4 sentences)",
  "ai_tags": ["array", "of", "relevant", "keywords", "max 10"],
  "pdf_key_topics": ["main", "topics", "covered"],
  "content_language": "detected language code (en, vi, etc.)",
  "pdf_extracted_text": "Key excerpts or full text summary (up to 2000 chars)",
  "pdf_page_count": number or null if unknown
}

Focus on Đà Lạt/Vietnamese context when relevant.
Output ONLY the JSON object.`;

  try {
    // For PDFs, we can use Claude's document understanding
    const messageContent: Anthropic.MessageCreateParams["messages"][0]["content"] = isPdf
      ? [
          {
            type: "document",
            source: {
              type: "url",
              url: fileUrl,
            },
          } as unknown as Anthropic.DocumentBlockParam,
          {
            type: "text",
            text: prompt,
          },
        ]
      : [
          {
            type: "text",
            text: prompt,
          },
        ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Could not parse document summary response");
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      ai_description: String(result.ai_description || ""),
      ai_title: String(result.ai_title || filename || "Document"),
      pdf_summary: String(result.pdf_summary || ""),
      ai_tags: Array.isArray(result.ai_tags)
        ? result.ai_tags.slice(0, 10).map(String)
        : [],
      pdf_key_topics: Array.isArray(result.pdf_key_topics)
        ? result.pdf_key_topics.map(String)
        : [],
      content_language: String(result.content_language || "en"),
      pdf_extracted_text: String(result.pdf_extracted_text || extractedText || ""),
      pdf_page_count:
        typeof result.pdf_page_count === "number" ? result.pdf_page_count : null,
    };
  } catch (error) {
    console.error("Error summarizing document:", error);
    return {
      ai_description: filename ? `Document: ${filename}` : "Document shared at event",
      ai_title: filename || "Document",
      pdf_summary: extractedText?.slice(0, 500) || "Document content",
      ai_tags: ["document", "pdf"],
      pdf_key_topics: [],
      content_language: "en",
      pdf_extracted_text: extractedText?.slice(0, 2000) || "",
      pdf_page_count: null,
    };
  }
}

/**
 * Analyze a document (PDF, DOC, etc.) for metadata extraction.
 */
export async function analyzeDocument(
  fileUrl: string,
  mimeType: string | null,
  filename: string | null
): Promise<DocumentAnalysis> {
  // Extract text if possible
  const { text: extractedText, pageCount } = await extractDocumentText(
    fileUrl,
    mimeType
  );

  // Summarize using Claude
  const summary = await summarizeDocument(fileUrl, extractedText, filename);

  // Calculate quality score based on content richness
  let qualityScore = 0.5;
  if (summary.pdf_summary.length > 100) qualityScore += 0.1;
  if (summary.ai_tags.length > 3) qualityScore += 0.1;
  if (summary.pdf_key_topics.length > 0) qualityScore += 0.1;
  if (summary.pdf_extracted_text.length > 500) qualityScore += 0.1;
  qualityScore = Math.min(1, qualityScore);

  return {
    ai_description: summary.ai_description,
    ai_title: summary.ai_title,
    ai_tags: summary.ai_tags,
    pdf_summary: summary.pdf_summary,
    pdf_extracted_text: summary.pdf_extracted_text.slice(0, 10000), // Limit storage
    pdf_page_count: summary.pdf_page_count || pageCount,
    pdf_key_topics: summary.pdf_key_topics,
    content_language: summary.content_language,
    quality_score: qualityScore,
  };
}
