/** Preserve supplied contacts across extracted text and structured editor data. */
export function contactKey(value: string): string {
  const clean = value.trim();
  if (/^(?:https?:\/\/|www\.)|^[\w-]+\.[A-Za-z]{2,}(?:\/|$)/i.test(clean) && !clean.includes("@")) {
    return clean.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();
  }
  return clean.toLowerCase().replace(/\s+/g, " ");
}

export function uniqueContacts(values: unknown[]): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => typeof value === "string" && !!value.trim())
    .map(value => value.trim()).filter(value => {
      const key = contactKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function extractContacts(text: string) {
  const emails = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
  const phones: string[] = [];
  const links: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(/(?<!\w)(?:\+\d{1,3}[\s.-]*)?\(?\d[\d\s().-]{5,}\d(?:\s*(?:ext\.?|x)\s*\d{1,6})?(?!\w)/gi)) {
      const value = match[0].trim();
      const base = value.split(/\s*(?:ext\.?|x)\s*\d/i)[0];
      const digits = base.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15 || /^(?:19|20)\d{2}\s*[-./]\s*(?:19|20)\d{2}$/.test(base) || /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/.test(base)) continue;
      if (line.slice((match.index || 0) + match[0].length).trimStart().startsWith("%") || /\b(?:salary|revenue|budget|employee id)\b/i.test(line)) continue;
      phones.push(value);
    }
    const emailSpans = [...line.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)];
    for (const match of line.matchAll(/(?:https?:\/\/|www\.)[^\s<>|]+|(?:[\w-]+\.)+[A-Za-z]{2,}(?:\/[^\s<>|]*)?/gi)) {
      if (emailSpans.some(email => match.index! < email.index! + email[0].length &&
          match.index! + match[0].length > email.index!)) continue;
      const value = match[0].replace(/[.,;:)\]}]+$/, "");
      if (!/^https?:\/\//i.test(value) && /\.(?:js|ts|py|jsx|tsx|sql|pdf|docx?)$/i.test(value)) continue;
      if (value.toLowerCase() === "asp.net") continue;
      links.push(value);
    }
  }
  return { emails: uniqueContacts(emails), phones: uniqueContacts(phones), links: uniqueContacts(links) };
}

export function contactValues(personal: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const groups = [["email","emails"],["phoneNumber","phone","phones"],["location"],["linkedin","linkedinUrl"],["github","githubUrl"],["website","portfolio","portfolioUrl"],["links"]];
  const values: unknown[] = [];
  for (const group of groups) {
    const owner = group.some(key => key in personal) ? personal : header;
    const key = group.find(key => key in owner);
    const value = key ? owner[key] : undefined;
    values.push(...(Array.isArray(value) ? value : [value]));
  }
  const known = new Set(["name","fullName","title",...groups.flat()]);
  for (const [key,value] of Object.entries({...header,...personal})) {
    if (!known.has(key)) values.push(...(Array.isArray(value) ? value : [value]));
  }
  for (const [singular,plural] of [["email","emails"],["phoneNumber","phones"]]) {
    const owner = plural in personal ? personal : header;
    if (personal[singular] !== "" && Array.isArray(owner[plural])) values.push(...(owner[plural] as unknown[]).slice(singular in personal ? 1 : 0));
  }
  const titleParts = String(personal.title || header.title || "").split("|").map(contactKey);
  return uniqueContacts(values).filter(value => !titleParts.includes(contactKey(value)));
}

export function preserveContactHeader(markdown: string, values: string[]) {
  const index = markdown.search(/^##\s/m);
  const header = (index < 0 ? markdown : markdown.slice(0,index)).trimEnd();
  const missing = uniqueContacts(values).filter(value => !header.includes(value));
  return header + (missing.length ? "\n" + missing.join(" | ") : "") + (index < 0 ? "" : "\n\n" + markdown.slice(index));
}
