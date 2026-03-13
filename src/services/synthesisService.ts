import type {
  SynthesisRequest,
  SynthesisResponse,
  SynthesisStreamChunk,
} from "../types/synthesis";

const SYNTHESIS_API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;

export const buildPromptEnvelope = (request: SynthesisRequest): string => {
  return [
    `Mode: ${request.mode}`,
    "Signal Summary:",
    `- Total feature votes: ${request.context.summary.totalFeatureVotes}`,
    `- Screen feedback count: ${request.context.summary.screenFeedbackCount}`,
    `- Kudos count: ${request.context.summary.kudosCount}`,
    "",
    "Compiled Inputs:",
    request.context.promptBody,
  ].join("\n");
};

export const streamSynthesis = async function* (
  request: SynthesisRequest,
): AsyncGenerator<SynthesisStreamChunk, SynthesisResponse> {
  const prompt = buildPromptEnvelope(request);
  const markdown = synthesizeLocally(request.mode, prompt);

  for (const token of markdown.split(" ")) {
    await new Promise((resolve) => setTimeout(resolve, 18));
    yield { token: `${token} `, done: false };
  }

  return {
    mode: request.mode,
    markdown,
    generatedAt: new Date().toISOString(),
  };
};

export const getSynthesisEndpointInfo = (): string => {
  if (!SYNTHESIS_API_BASE) {
    return "Synthesis endpoint not configured";
  }
  return `Configured endpoint: ${SYNTHESIS_API_BASE}`;
};

interface ParsedFeature {
  text: string;
  votes: number;
  workflow: string;
}

interface ParsedFeedback {
  app: string;
  screen: string;
  type: string;
  text: string;
}

interface ParsedKudos {
  role: string;
  consentPublic: boolean;
  text: string;
}

const section = (prompt: string, heading: string, nextHeading: string): string => {
  const start = prompt.indexOf(heading);
  const end = prompt.indexOf(nextHeading);
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return prompt.slice(start + heading.length, end).trim();
};

const parseFeatures = (value: string): ParsedFeature[] => {
  return value
    .split("\n")
    .filter((line) => /^\d+\./.test(line))
    .map((line) => {
      const text = line.split("|")[0].replace(/^\d+\.\s*/, "").trim();
      const votesMatch = line.match(/votes=(\d+)/);
      const workflowMatch = line.match(/workflow=(.*)$/);
      return {
        text,
        votes: votesMatch ? Number(votesMatch[1]) : 0,
        workflow: workflowMatch ? workflowMatch[1].trim() : "n/a",
      };
    });
};

const parseScreenFeedback = (value: string): ParsedFeedback[] => {
  return value
    .split("\n")
    .filter((line) => /^\d+\./.test(line))
    .map((line) => {
      const app = line.match(/app=([^|]+)/)?.[1]?.trim() ?? "unknown";
      const screen = line.match(/screen=([^|]+)/)?.[1]?.trim() ?? "unknown";
      const type = line.match(/type=([^|]+)/)?.[1]?.trim() ?? "suggestion";
      const text = line.match(/text=(.*)$/)?.[1]?.trim() ?? "n/a";
      return { app, screen, type, text };
    });
};

const parseKudos = (value: string): ParsedKudos[] => {
  return value
    .split("\n")
    .filter((line) => /^\d+\./.test(line))
    .map((line) => {
      const role = line.match(/role=([^|]+)/)?.[1]?.trim() ?? "unspecified";
      const consentPublic = line.includes("consentPublic=yes");
      const text = line.match(/text=(.*)$/)?.[1]?.trim() ?? "";
      return { role, consentPublic, text };
    });
};

const topPatterns = (feedback: ParsedFeedback[]): string[] => {
  const counts = new Map<string, number>();
  for (const item of feedback) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} appears ${count} times across screens.`);
};

const synthesizeLocally = (mode: "roadmap" | "prd", prompt: string): string => {
  const featureSection = section(prompt, "Feature Requests", "Screen Feedback");
  const feedbackSection = section(prompt, "Screen Feedback", "Kudos");
  const kudosSection = prompt.split("Kudos")[1]?.trim() ?? "";

  const features = parseFeatures(featureSection).sort((a, b) => b.votes - a.votes);
  const feedback = parseScreenFeedback(feedbackSection);
  const kudos = parseKudos(kudosSection);
  const publicQuotes = kudos.filter((item) => item.consentPublic).slice(0, 3);
  const patterns = topPatterns(feedback);
  const p0 = features.slice(0, 2);
  const p1 = features.slice(2, 6);
  const p2 = features.slice(6);

  if (mode === "roadmap") {
    const p0Lines = p0.length
      ? p0.map((item, index) => `${index + 1}. ${item.text} (8-hour prototype scope)`).join("\n")
      : "1. No clear P0 signal yet.";
    const p1Lines = p1.length
      ? p1
          .map(
            (item, index) =>
              `${index + 1}. ${item.text} — rationale: ${item.workflow !== "n/a" ? item.workflow : "high vote demand"}`,
          )
          .join("\n")
      : "1. No P1 themes yet.";
    const p2Lines = p2.length ? p2.map((item, index) => `${index + 1}. ${item.text}`).join("\n") : "1. None";
    const patternLines = patterns.length
      ? patterns.map((line, index) => `${index + 1}. ${line}`).join("\n")
      : "1. Collect more feedback to establish stable patterns.";
    const quoteLines = publicQuotes.length
      ? publicQuotes.map((quote, index) => `${index + 1}. "${quote.text}" (${quote.role.toUpperCase()})`).join("\n")
      : "1. No consent-approved quotes yet.";

    return [
      "# Roadmap Draft",
      "",
      "## P0 - Build Tonight",
      p0Lines,
      "",
      "## P1 - Next Sprint",
      p1Lines,
      "",
      "## P2 - Backlog",
      p2Lines,
      "",
      "## Patterns & Insights",
      patternLines,
      "",
      "## Marketing Moments",
      quoteLines,
    ].join("\n");
  }

  const acceptance = p0.length
    ? p0
        .map(
          (item, index) =>
            `${index + 1}. ${item.text}: can be demoed in <8 hours with a clickable happy path and synthetic data.`,
        )
        .join("\n")
    : "1. Define a P0 feature once vote signals are captured.";

  return [
    "# PRD Draft",
    "",
    "## Overview",
    "This overnight draft consolidates conference signals into a focused Day 2 prototype plan.",
    "",
    "## Problem Statement",
    `Attendees submitted ${features.length} feature requests and ${feedback.length} screen signals, indicating friction in high-volume operational workflows.`,
    "",
    "## Scope - Tonight's Build",
    p0.length ? p0.map((item, index) => `${index + 1}. ${item.text}`).join("\n") : "1. No P0 signals yet.",
    "",
    "## Out of Scope",
    "1. Long-tail enhancements not in top-voted themes.",
    "2. Production hardening, authentication, and integration work.",
    "",
    "## User Stories",
    "1. As an operations lead, I want to upvote feature ideas so top priorities emerge quickly.",
    "2. As an attendee, I want to tag screen issues so the team can group feedback accurately.",
    "3. As a product manager, I want workflow context on requests so implementation is actionable.",
    "4. As a facilitator, I want PIN-gated synthesis so attendee and admin actions remain separated.",
    "5. As marketing, I want consent-approved quotes so event proof points are publishable.",
    "",
    "## Acceptance Criteria",
    acceptance,
    "",
    "## Design Guidance",
    patterns.length ? patterns.map((line, index) => `${index + 1}. ${line}`).join("\n") : "1. Emphasize clarity in feedback categorization and submission flow.",
    "",
    "## Success Metrics",
    "1. Day 2 demo includes at least one completed P0 flow.",
    "2. Facilitators can explain how captured feedback mapped directly to prototype changes.",
  ].join("\n");
};
