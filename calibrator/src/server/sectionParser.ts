export interface MarkdownSections {
  trace?: string;
  caseStudy?: string;
  discovery?: string;
  problemRecovery?: string;
  solution?: string;
  doppl?: string;
}

const sectionKeys: Record<string, keyof MarkdownSections> = {
  trace: "trace",
  "case study": "caseStudy",
  discovery: "discovery",
  "problem recovery": "problemRecovery",
  solution: "solution",
  doppl: "doppl",
};

export function parseMarkdownSections(markdown: string): MarkdownSections {
  const sections: MarkdownSections = {};
  const matches = [...markdown.matchAll(/^#\s+(.+)$/gm)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1]?.trim().toLowerCase() ?? "";
    const key = sectionKeys[title];
    if (!key || match.index === undefined) continue;

    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd).trim();
    if (body) sections[key] = body;
  }

  return sections;
}
