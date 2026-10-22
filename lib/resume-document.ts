import schema from "./contracts/resume-document-v1.schema.json";
import type { ParsedResume } from "./resume-parser";

export type ResumeBlock = { id: string; text: string; evidenceIds: string[] };
export type ResumeDocumentV1 = {
  schemaVersion: "ResumeDocumentV1"; id: string; revision: number;
  source: { fileSha256: string; textSha256: string; revision: string; validatorVersion: string };
  personalInfo: { id: string; name: string; title: string; email: string; phone: string; linkedin: string; github: string; location: string; extraContacts: string[] };
  summary: ResumeBlock[];
  skills: { id: string; category: string; items: ResumeBlock[] }[];
  experience: { id: string; role: string; company: string; location: string; duration: string; bullets: ResumeBlock[] }[];
  projects: { id: string; title: string; technologies: string[]; duration: string; bullets: ResumeBlock[] }[];
  education: { id: string; institution: string; location: string; degree: string; duration: string; details: ResumeBlock[] }[];
  additionalSections: { id: string; title: string; items: ResumeBlock[] }[];
  sectionOrder: string[];
  evidence: { id: string; fieldId: string; sourceSpan: string; spanStart: number; spanEnd: number; page: number | null; box: number[] | null; roleId: string | null; origin: "pdf" | "user" }[];
};
export type PublicationIssue = { code: string; message: string; fieldId: string | null };
type Schema = { $ref?: string; const?: unknown; enum?: unknown[]; type?: string | string[]; anyOf?: Schema[]; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean; items?: Schema; minLength?: number; minimum?: number; minItems?: number; maxItems?: number; pattern?: string };

// Executes the shared schema subset; no parallel hand-maintained validation model.
export function validateResumeDocument(value: unknown): asserts value is ResumeDocumentV1 {
  const check = (v: unknown, rule: Schema, path: string): void => {
    if (rule.$ref) { check(v, schema.$defs.block as Schema, path); return; }
    if (rule.anyOf) { for (const option of rule.anyOf) { try { check(v, option, path); return; } catch {} } throw new Error(`Invalid ${path}`); }
    const kind = v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" && Number.isInteger(v) ? "integer" : typeof v;
    if (rule.type && !(Array.isArray(rule.type) ? rule.type : [rule.type]).includes(kind)) throw new Error(`Invalid ${path}`);
    if (("const" in rule && v !== rule.const) || (rule.enum && !rule.enum.includes(v))) throw new Error(`Invalid ${path}`);
    if (typeof v === "number" && (!Number.isFinite(v) || (rule.minimum !== undefined && v < rule.minimum))) throw new Error(`Invalid ${path}`);
    if (typeof v === "string" && ((rule.minLength !== undefined && v.length < rule.minLength) || (rule.pattern && !new RegExp(rule.pattern).test(v)))) throw new Error(`Invalid ${path}`);
    if (Array.isArray(v)) {
      if ((rule.minItems !== undefined && v.length < rule.minItems) || (rule.maxItems !== undefined && v.length > rule.maxItems)) throw new Error(`Invalid ${path}`);
      if (rule.items) v.forEach((item, i) => check(item, rule.items!, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (rule.required?.some(k => !(k in o)) || (rule.additionalProperties === false && Object.keys(o).some(k => !rule.properties?.[k]))) throw new Error(`Invalid ${path}`);
      for (const [key, r] of Object.entries(rule.properties || {})) if (key in o) check(o[key], r, `${path}.${key}`);
    }
  };
  check(value, schema as Schema, "document");
  const document=value as ResumeDocumentV1;
  const ids = new Set<string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") { const o = v as Record<string, unknown>;
      if (typeof o.id === "string") { if (ids.has(o.id)) throw new Error("Duplicate field ID"); ids.add(o.id); }
      Object.values(o).forEach(visit);
    }
  };
  visit(value);
  const evidence = new Set(document.evidence.map(e => e.id));
  const blocks = [...document.summary, ...document.skills.flatMap(s => s.items), ...document.experience.flatMap(e => e.bullets), ...document.projects.flatMap(p => p.bullets), ...document.education.flatMap(e => e.details), ...document.additionalSections.flatMap(s => s.items)];
  if (blocks.some(b => b.evidenceIds.some(id => !evidence.has(id)))) throw new Error("Unknown source evidence");
  const fields=new Map<string,{owner:string|null;value:unknown;scalar:boolean}>();
  for(const [key,value]of Object.entries(document.personalInfo))if(key!=="id")fields.set(`${document.personalInfo.id}.${key}`,{owner:null,value,scalar:true});
  for(const [section,content]of [["skills","items"],["experience","bullets"],["projects","bullets"],["education","details"],["additionalSections","items"]] as const){
    for(const group of document[section]){
      const owner=section==="experience"||section==="projects"?group.id:null;
      for(const [key,value]of Object.entries(group))if(key!=="id"&&key!==content)fields.set(`${group.id}.${key}`,{owner,value,scalar:true});
      for(const block of (group as unknown as Record<string,ResumeBlock[]>)[content])fields.set(block.id,{owner,value:block.text,scalar:false});
    }
  }
  document.summary.forEach(b=>fields.set(b.id,{owner:null,value:b.text,scalar:false}));
  for(const item of document.evidence){
    const field=fields.get(item.fieldId);
    if(!field||(field.owner!==null&&item.roleId!==field.owner)||(field.scalar&&field.owner===null&&item.roleId!==null))throw new Error("Evidence references a different field or role");
    if(!item.sourceSpan||item.spanEnd-item.spanStart!==[...item.sourceSpan].length)throw new Error("Invalid source span");
    if((item.page===null)!==(item.box===null)||(item.box&&(item.box[0]>=item.box[2]||item.box[1]>=item.box[3])))throw new Error("Invalid source geometry");
  }
  for(const block of blocks)if(!block.evidenceIds.length||new Set(block.evidenceIds).size!==block.evidenceIds.length||block.evidenceIds.some(id=>document.evidence.find(e=>e.id===id)?.fieldId!==block.id))throw new Error("Block evidence belongs to another field");
  for(const [id,field]of fields)if(field.scalar&&(Array.isArray(field.value)?field.value.length:field.value)&&!document.evidence.some(e=>e.fieldId===id))throw new Error(`Missing source evidence for ${id}`);
  const sections=[...(["summary","skills","experience","projects","education"] as const).filter(k=>document[k].length),...document.additionalSections.map(s=>s.id)];
  if(new Set(document.sectionOrder).size!==document.sectionOrder.length||sections.length!==document.sectionOrder.length||sections.some(s=>!document.sectionOrder.includes(s)))throw new Error("Invalid section order");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function documentToEditor(d: ResumeDocumentV1): ParsedResume {
  return { personalInfo: { ...d.personalInfo }, summary: d.summary.map(b => b.text),
    skills: d.skills.map(s => ({category:s.category, items:s.items.map(b => b.text).join(", ")})),
    experience:d.experience.map(e=>({...e,bullets:e.bullets.map(b=>b.text)})),
    projects:d.projects.map(p=>({...p,technologies:p.technologies.join(", "),bullets:p.bullets.map(b=>b.text)})),
    education:d.education.map(e=>({...e,details:e.details.map(b=>b.text).join("\n")})),
    additionalSections:Object.fromEntries(d.additionalSections.map(s=>[s.id,{title:s.title,lines:s.items.map(b=>b.text)}])),
    sectionOrder:d.sectionOrder,rawMarkdown:"" };
}

// The editor changes text only, preserving IDs, evidence, and protected source fields.
export function applyEditorText(original: ResumeDocumentV1, edited: ParsedResume): ResumeDocumentV1 {
  const next = structuredClone(original);
  const replace = (blocks: ResumeBlock[], values: string[]) => {
    if (blocks.length !== values.length) throw new Error("Change source structure through a validated PDF upload.");
    blocks.forEach((b,i)=>{b.text=values[i];});
  };
  next.personalInfo.title=edited.personalInfo.title;
  replace(next.summary,edited.summary);
  next.experience.forEach((e,i)=>{e.role=edited.experience[i].role; replace(e.bullets,edited.experience[i].bullets);});
  next.projects.forEach((p,i)=>{p.title=edited.projects[i].title;replace(p.bullets,edited.projects[i].bullets);});
  // Skills and protected contacts/employers/dates/education are immutable here.
  // Do not comma-split atomic skills with parentheses.
  next.additionalSections.forEach(s=>replace(s.items,edited.additionalSections?.[s.id]?.lines || s.items.map(b=>b.text)));
  validateResumeDocument(next); return next;
}
