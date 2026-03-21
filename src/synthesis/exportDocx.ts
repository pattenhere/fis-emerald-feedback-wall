import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { marked } from "marked";
import type { Tokens } from "marked";

type ExportMode = "roadmap" | "prd";
type MarkdownTokenList = Tokens.Generic[];

export interface ExportDocxOptions {
  markdown: string;
  mode: ExportMode;
  eventName?: string;
  eventSlug?: string;
  generatedAt?: string | Date;
}

const COLOR_EMERALD = "4BCD3E";
const COLOR_NAVY = "012834";
const LETTER_WIDTH_DXA = 12240;
const LETTER_HEIGHT_DXA = 15840;
const MARGIN_DXA = 1440;
const FOOTER_RIGHT_TAB_DXA = LETTER_WIDTH_DXA - MARGIN_DXA * 2;
const BODY_SPACING = { before: 0, after: 120, line: 276, lineRule: LineRuleType.AUTO } as const;
const CONTENT_TABLE_WIDTH_DXA = 9360;
const CONTENT_TABLE_COLUMN_WIDTHS = [2200, 7160] as const;

const resolveDate = (value?: string | Date): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
};

const slugify = (value: string): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "");

const buildFilename = (mode: ExportMode, eventSlug: string | undefined, generatedAt: Date): string => {
  const y = generatedAt.getFullYear();
  const m = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const d = String(generatedAt.getDate()).padStart(2, "0");
  const datePart = `${y}-${m}-${d}`;
  const safeSlug = slugify(String(eventSlug ?? ""));
  const modePart = mode === "prd" ? "prd" : "roadmap";
  return safeSlug
    ? `emerald-synthesis-${modePart}-${safeSlug}-${datePart}.docx`
    : `emerald-synthesis-${modePart}-${datePart}.docx`;
};

type InlineRunOptions = {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  font?: string;
  color?: string;
  underline?: Record<string, never> | undefined;
};

const inlineRun = (text: string, opts: InlineRunOptions = {}): TextRun =>
  new TextRun({
    text,
    bold: false,
    italics: false,
    size: 21,
    font: "Arial",
    color: "1E293B",
    ...opts,
  });

const parseInlineTokens = (tokens: Tokens.Generic[] | undefined, bold = false, italics = false): TextRun[] => {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const runs: TextRun[] = [];
  for (const token of tokens) {
    if (token.type === "text") {
      runs.push(inlineRun(token.text ?? "", { bold: Boolean(bold), italics: Boolean(italics), color: contextColor(italics) }));
      continue;
    }
    if (token.type === "strong") {
      runs.push(...parseInlineTokens(token.tokens as Tokens.Generic[] | undefined, true, italics));
      continue;
    }
    if (token.type === "em") {
      runs.push(...parseInlineTokens(token.tokens as Tokens.Generic[] | undefined, bold, true));
      continue;
    }
    if (token.type === "codespan") {
      runs.push(inlineRun(token.text ?? "", { bold: Boolean(bold), italics: Boolean(italics), font: "Courier New", color: contextColor(italics) }));
      continue;
    }
    if (token.type === "br") {
      runs.push(inlineRun("\n", { bold: Boolean(bold), italics: Boolean(italics), color: contextColor(italics) }));
      continue;
    }
    if (token.type === "link") {
      runs.push(
        inlineRun(token.text ?? token.href ?? "", {
          bold: Boolean(bold),
          italics: Boolean(italics),
          underline: {},
          color: "005A9C",
        }),
      );
      continue;
    }
    runs.push(inlineRun((token as { raw?: string }).raw ?? "", { bold: Boolean(bold), italics: Boolean(italics), color: contextColor(italics) }));
  }
  return runs;
};

const contextColor = (italics: boolean): string => (italics ? "0F6E56" : "1E293B");

const headingRuns = (text: string, size: number): TextRun[] => [
  new TextRun({
    text,
    bold: true,
    size,
    color: COLOR_NAVY,
    font: "Arial Black",
  }),
];

const normalizeQuoteText = (value: string): string =>
  String(value ?? "")
    .replace(/^\s*>+\s*/gu, "")
    .trim()
    .replace(/^[*_]+/u, "")
    .replace(/[*_]+$/u, "")
    .trim();

const parseBlockquote = (token: Tokens.Blockquote): { quote: string; attribution: string | null } => {
  const lines = (Array.isArray(token.tokens) ? token.tokens : [])
    .flatMap((item) => {
      if (item.type === "paragraph") return String(item.text ?? "").split(/\r?\n/gu);
      return String((item as { raw?: string }).raw ?? "").split(/\r?\n/gu);
    })
    .map((line) => normalizeQuoteText(line))
    .filter(Boolean);

  if (lines.length === 0) return { quote: "", attribution: null };
  const last = lines[lines.length - 1] ?? "";
  if (/^[—-]\s+/u.test(last)) {
    return {
      quote: lines.slice(0, -1).join(" ").trim(),
      attribution: last.replace(/^[—-]\s+/u, "").trim() || null,
    };
  }
  return { quote: lines.join(" ").trim(), attribution: null };
};

const horizontalRule = (): Paragraph =>
  new Paragraph({
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: "CBD5E1",
        space: 1,
      },
    },
    spacing: { before: 160, after: 160 },
    children: [],
  });

const h3ItemSeparator = (): Paragraph =>
  new Paragraph({
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: "E2E8F0",
        space: 1,
      },
    },
    spacing: { before: 80, after: 0 },
    children: [],
  });

const parsePipeTableBlock = (value: string): { header: string[]; rows: string[][] } | null => {
  const lines = String(value ?? "")
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;
  if (!lines[0]?.startsWith("|")) return null;
  const separatorLine = lines[1] ?? "";
  if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/u.test(separatorLine)) return null;

  const parseLine = (line: string): string[] =>
    line
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .split("|")
      .map((cell) => cell.trim());

  const header = parseLine(lines[0] ?? "");
  const rows = lines.slice(2).filter((line) => line.startsWith("|")).map(parseLine);
  if (header.length < 2) return null;
  return { header: header.slice(0, 2), rows: rows.map((row) => [row[0] ?? "", row[1] ?? ""]) };
};

const createP2BacklogTable = (header: string[], rows: string[][]): Table => {
  const makeCell = (
    text: string,
    options: { bold?: boolean; fill?: string; colIndex?: 0 | 1; isHeader?: boolean; rowIndex?: number } = {},
  ): TableCell =>
    new TableCell({
      width: { size: CONTENT_TABLE_COLUMN_WIDTHS[options.colIndex ?? 0], type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      },
      shading: {
        type: ShadingType.CLEAR,
        fill:
          options.fill ??
          (typeof options.rowIndex === "number" && options.rowIndex % 2 === 0
            ? "F8FAFC"
            : "FFFFFF"),
        color: "auto",
      },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO },
          children: [
            new TextRun({
              text,
              bold: Boolean(options.bold),
              italics: false,
              size: 19,
              font: "Arial",
              color: COLOR_NAVY,
            }),
          ],
        }),
      ],
    });

  const headerRow = new TableRow({
    children: [
      makeCell(header[0] ?? "Theme", { bold: true, fill: "C8E6C9", colIndex: 0, isHeader: true }),
      makeCell(header[1] ?? "Summary", { bold: true, fill: "C8E6C9", colIndex: 1, isHeader: true }),
    ],
  });

  const bodyRows = rows.map((row, rowIndex) => {
    const themeText = (row[0] ?? "").trim();
    const summaryText = (row[1] ?? "").replace(/^\*\*\s*/u, "").trim();
    return new TableRow({
      children: [
        makeCell(themeText, { bold: true, colIndex: 0, rowIndex }),
        makeCell(summaryText, { bold: false, colIndex: 1, rowIndex }),
      ],
    });
  });

  return new Table({
    width: { size: CONTENT_TABLE_WIDTH_DXA, type: WidthType.DXA },
    rows: [headerRow, ...bodyRows],
  });
};

const blockquoteParagraph = (text: string): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({
        text: normalizeQuoteText(text),
        italics: true,
        size: 20,
        font: "Arial",
        color: "0F6E56",
      }),
    ],
    spacing: { before: 80, after: 80, line: 276, lineRule: LineRuleType.AUTO },
    indent: { left: 720 },
    border: {
      left: {
        style: BorderStyle.SINGLE,
        size: 12,
        color: "1D9E75",
        space: 8,
      },
    },
    shading: {
      type: ShadingType.CLEAR,
      fill: "E1F5EE",
      color: "auto",
    },
  });

const blockquoteAttribution = (role: string): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({
        text: `— ${role}`,
        italics: false,
        size: 18,
        font: "Arial",
        color: "64748B",
      }),
    ],
    spacing: { before: 0, after: 80, line: 276, lineRule: LineRuleType.AUTO },
    indent: { left: 720 },
  });

const createParagraphsFromTokens = (tokens: MarkdownTokenList): Array<Paragraph | Table> => {
  const blocks: Array<Paragraph | Table> = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.type === "space") {
      continue;
    }

    if (token.type === "hr") {
      blocks.push(horizontalRule());
      continue;
    }

    if (token.type === "heading") {
      const headingText = token.text ?? "";
      if (token.depth === 1) {
        blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: headingRuns(headingText, 40) }));
      } else if (token.depth === 2) {
        blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: headingRuns(headingText, 28) }));
      } else {
        blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 60 }, children: headingRuns(headingText, 24) }));
      }
      continue;
    }

    if (token.type === "paragraph") {
      const plain = String(token.text ?? "").trim();
      if (!plain) continue;
      if (plain === "---") {
        blocks.push(horizontalRule());
        continue;
      }
      const parsedPipeTable = parsePipeTableBlock(token.raw ?? token.text ?? "");
      if (parsedPipeTable) {
        blocks.push(createP2BacklogTable(parsedPipeTable.header, parsedPipeTable.rows));
        continue;
      }
      const runs = parseInlineTokens(token.tokens as Tokens.Generic[] | undefined);
      blocks.push(
        new Paragraph({
          children: runs.length > 0 ? runs : [inlineRun(token.text ?? "", { bold: false, italics: false, color: "1E293B" })],
          spacing: BODY_SPACING,
        }),
      );
      const nextToken = tokens[index + 1];
      if (nextToken?.type === "heading" && nextToken.depth === 3) {
        blocks.push(h3ItemSeparator());
      }
      continue;
    }

    if (token.type === "blockquote") {
      const parsed = parseBlockquote(token as Tokens.Blockquote);
      if (parsed.quote) blocks.push(blockquoteParagraph(parsed.quote));
      if (parsed.attribution) blocks.push(blockquoteAttribution(parsed.attribution));
      continue;
    }

    if (token.type === "list") {
      for (const item of token.items) {
        const itemRuns = parseInlineTokens((item.tokens as Tokens.Generic[] | undefined) ?? []);
        const fallback = String(item.text ?? "");
        blocks.push(
          new Paragraph({
            children: itemRuns.length > 0 ? itemRuns : [inlineRun(fallback, { bold: false, italics: false, color: "1E293B" })],
            spacing: BODY_SPACING,
            indent: { left: 720, hanging: 360 },
            bullet: token.ordered ? undefined : { level: 0 },
            numbering: token.ordered ? { reference: "emerald-numbered-list", level: 0 } : undefined,
          }),
        );
      }
      continue;
    }

    if (token.type === "table") {
      const tableToken = token as unknown as Tokens.Table;
      const header = tableToken.header.map((cell: Tokens.TableCell) => String(cell.text ?? ""));
      const rows = tableToken.rows.map((row: Tokens.TableCell[]) => [
        String(row[0]?.text ?? ""),
        String(row[1]?.text ?? ""),
      ]);
      blocks.push(createP2BacklogTable([header[0] ?? "Theme", header[1] ?? "Summary"], rows));
      continue;
    }

    blocks.push(
      new Paragraph({
        children: [inlineRun((token as { raw?: string }).raw ?? "", { bold: false, italics: false, color: "1E293B" })],
        spacing: BODY_SPACING,
      }),
    );
  }

  return blocks;
};

export const exportSynthesisOutputDocx = async ({
  markdown,
  mode,
  eventName,
  eventSlug,
  generatedAt,
}: ExportDocxOptions): Promise<{ filename: string }> => {
  const source = String(markdown ?? "").trim();
  if (!source) {
    throw new Error("No synthesis output to export.");
  }

  let cleanedMarkdown = source;
  cleanedMarkdown = cleanedMarkdown.replace(/^#\s+Emerald Feedback Wall.*(?:\r?\n)?/m, "");

  const metadataMatch = cleanedMarkdown.match(/^Generated: .+ · Macros active:.*$/m);
  const generatedMacroLine = metadataMatch ? metadataMatch[0].trim() : null;
  if (generatedMacroLine) {
    cleanedMarkdown = cleanedMarkdown.replace(/^Generated: .+ · Macros active:.*(?:\r?\n)?/m, "");
  }

  cleanedMarkdown = cleanedMarkdown.trim();

  const generatedDate = resolveDate(generatedAt);
  const filename = buildFilename(mode, eventSlug, generatedDate);
  const subtitle = mode === "prd" ? "Synthesis PRD" : "Synthesis Roadmap";
  const generatedLabel = `Generated: ${generatedDate.toLocaleDateString()} at ${generatedDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  const tokens = marked.lexer(cleanedMarkdown) as MarkdownTokenList;

  const docxDocument = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 21 },
          paragraph: { spacing: BODY_SPACING },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "emerald-numbered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: LETTER_WIDTH_DXA, height: LETTER_HEIGHT_DXA },
            margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: FOOTER_RIGHT_TAB_DXA }],
                children: [
                  new TextRun({ text: "Emerald Feedback Wall · Prototype recommendations only", size: 17, color: "6B7280", font: "Arial" }),
                  new TextRun({ text: "\t" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 17, color: "6B7280", font: "Arial" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Emerald Feedback Wall", color: COLOR_EMERALD, bold: true, size: 56, font: "Arial Black" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: subtitle, color: COLOR_NAVY, bold: true, size: 36, font: "Arial" })],
          }),
          ...(String(eventName ?? "").trim()
            ? [
                new Paragraph({
                  spacing: { after: 40 },
                  children: [new TextRun({ text: `Event: ${String(eventName).trim()}`, size: 18, color: "64748B", font: "Arial" })],
                }),
              ]
            : []),
          new Paragraph({
            spacing: { after: generatedMacroLine ? 40 : 200 },
            children: [new TextRun({ text: generatedLabel, size: 18, color: "64748B", font: "Arial" })],
          }),
          ...(generatedMacroLine
            ? [
                new Paragraph({
                  spacing: { after: 200 },
                  children: [new TextRun({ text: generatedMacroLine, size: 18, color: "64748B", font: "Arial" })],
                }),
              ]
            : []),
          new Paragraph({
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: "CBD5E1",
                space: 1,
              },
            },
            spacing: { before: 0, after: 0 },
            children: [],
          }),
          new Paragraph({ children: [new PageBreak()] }),
          ...createParagraphsFromTokens(tokens),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(docxDocument);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return { filename };
};
