"use client";
import { useEffect,useRef,useState } from "react";
import { ResumeSheet } from "./ResumeSheet";
import { RESUME_TEMPLATES,getTemplateById } from "@/data/resume-templates";
import { applyEditorText,documentToEditor,validateResumeDocument,type ResumeDocumentV1,type PublicationIssue } from "@/lib/resume-document";
import { lockBodyScroll,unlockBodyScroll } from "@/lib/utils/scrollLock";
import type { ResumeModalProps } from "./ResumeModal";

type Publication={documentRevision:number;documentHash:string;publicationStatus:"ready"|"blocked";artifactId:string|null;pdfSha256:string|null;issues:PublicationIssue[]};
export function CertifiedResumeModal({isOpen,onClose,jobId,expectedGenerationId,templateId,readOnly=false}:ResumeModalProps){
  const [document,setDocument]=useState<ResumeDocumentV1|null>(null);
  const [publication,setPublication]=useState<Publication|null>(null);
  const [template,setTemplate]=useState(templateId||"mit-capd");
  const [mode,setMode]=useState<"view"|"edit">("view");
  const [pdf,setPdf]=useState<string|null>(null);
  const [busy,setBusy]=useState(true);
  const [dirty,setDirty]=useState(false);
  const [issues,setIssues]=useState<PublicationIssue[]>([]);
  const sequence=useRef(0);
  const blobUrl=useRef<string|null>(null);
  const clearPdf=()=>{if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);blobUrl.current=null;setPdf(null);setPublication(null);};
  const errorIssue=(message:string):PublicationIssue=>({code:"PUBLICATION_BLOCKED",message,fieldId:null});
  const urlFor=(artifactId:string,download=false)=>`/api/resume/publication/${artifactId}/pdf?jobId=${jobId}${download?"&download=1":""}`;
  async function checkedBytes(p:Publication,download=false){
    if(!p.artifactId||!p.pdfSha256)throw new Error("Required PDF checks have not passed.");
    const response=await fetch(urlFor(p.artifactId,download),{cache:"no-store"});
    if(!response.ok)throw new Error("This PDF is no longer current. Update preview and retry.");
    const bytes=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
    if(digest!==p.pdfSha256)throw new Error("PDF verification failed. Retry preview.");
    return new Blob([bytes],{type:"application/pdf"});
  }
  async function preview(d:ResumeDocumentV1,hash:string,selected:string,token:number){
    const response=await fetch("/api/resume/publication",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"preview",jobId,generationId:d.id,documentRevision:d.revision,documentHash:hash,templateId:selected})});
    const p=await response.json() as Publication;
    if(token!==sequence.current)return;
    setIssues(p.issues||[]);setPublication(p);
    if(!response.ok||p.publicationStatus!=="ready")return;
    const bytes=await checkedBytes(p);
    if(token!==sequence.current)return;
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
    blobUrl.current=URL.createObjectURL(bytes);setPdf(blobUrl.current);
  }
  useEffect(()=>{
    if(!isOpen)return;
    lockBodyScroll();const operations=sequence;const token=++operations.current;
    const selected=templateId||"mit-capd";
    void(async()=>{
      try{
        if(!jobId)throw new Error("Select a generated job resume first.");
        const query=new URLSearchParams({jobId,templateId:selected,...expectedGenerationId?{generationId:expectedGenerationId}:{}});
        const response=await fetch(`/api/resume/publication?${query}`,{cache:"no-store"});const result=await response.json();
        if(token!==sequence.current)return;
        if(!result.document){setIssues(result.issues||[errorIssue("Validate your source PDF and generate a new draft.")]);return;}
        validateResumeDocument(result.document);setDocument(result.document);
        await preview(result.document,result.documentHash,selected,token);
      }catch(error){if(token===sequence.current)setIssues([errorIssue(error instanceof Error?error.message:"Preview unavailable. Retry shortly.")]);}
      finally{if(token===sequence.current)setBusy(false);}
    })();
    return()=>{++operations.current;if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);blobUrl.current=null;unlockBodyScroll();};
    // The session resets only when its requested generation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isOpen,jobId,expectedGenerationId,templateId]);

  async function saveAndPreview(selected=template){
    if(!document)return;const token=++sequence.current;setBusy(true);setIssues([]);clearPdf();
    try{
      const response=await fetch("/api/resume/publication",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save",jobId,generationId:document.id,documentRevision:document.revision,document,templateId:selected})});
      const result=await response.json();if(token!==sequence.current)return;
      if(!response.ok||!result.document){setIssues(result.issues||[errorIssue("Save failed. Reload the latest draft.")]);return;}
      validateResumeDocument(result.document);setDocument(result.document);setDirty(false);setMode("view");
      await preview(result.document,result.documentHash,selected,token);
    }catch(error){if(token===sequence.current)setIssues([errorIssue(error instanceof Error?error.message:"Checks could not finish. Retry preview.")]);}
    finally{if(token===sequence.current)setBusy(false);}
  }
  async function retry(){
    if(!document)return;if(dirty)return saveAndPreview();
    const token=++sequence.current;setBusy(true);clearPdf();
    try{
      const response=await fetch(`/api/resume/publication?${new URLSearchParams({jobId:jobId!,generationId:document.id,templateId:template})}`,{cache:"no-store"});
      const result=await response.json();if(token!==sequence.current)return;if(!result.document)throw new Error(result.issues?.[0]?.message||"Reload the latest draft.");
      setDocument(result.document);await preview(result.document,result.documentHash,template,token);
    }catch(error){if(token===sequence.current)setIssues([errorIssue(error instanceof Error?error.message:"Preview unavailable")]);}
    finally{if(token===sequence.current)setBusy(false);}
  }
  async function download(){
    if(!publication||dirty||busy)return;setBusy(true);
    try{const bytes=await checkedBytes(publication,true);const url=URL.createObjectURL(bytes);const a=window.document.createElement("a");a.href=url;a.download="resume.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){clearPdf();setIssues([errorIssue(error instanceof Error?error.message:"Download unavailable")]);}
    finally{setBusy(false);}
  }
  if(!isOpen)return null;
  return <div className="fixed inset-0 z-[100] bg-black/75 flex flex-col" role="dialog" aria-modal="true" aria-label="Resume preview">
    <div className="flex flex-wrap items-center gap-3 p-3 bg-bg-card text-text-primary border-b border-border">
      <strong className="mr-auto">Resume</strong>
      <select aria-label="Resume template" value={template} disabled={busy||readOnly||!document} onChange={event=>{const value=event.target.value;setTemplate(value);clearPdf();void saveAndPreview(value);}} className="bg-bg-card border rounded p-2">
        {RESUME_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {!readOnly&&<button disabled={busy||!document} onClick={()=>setMode(mode==="edit"?"view":"edit")} className="border rounded px-3 py-2">{mode==="edit"?"View PDF":"Edit"}</button>}
      {dirty?<button disabled={busy} onClick={()=>void saveAndPreview()} className="border rounded px-3 py-2">Save &amp; check</button>:<button disabled={busy||!document} onClick={()=>void retry()} className="border rounded px-3 py-2">Update preview</button>}
      <button disabled={busy||dirty||!pdf||publication?.publicationStatus!=="ready"} onClick={()=>void download()} className="border rounded px-3 py-2 disabled:opacity-40">Download PDF</button>
      <button aria-label="Close resume" onClick={onClose} className="px-3 py-2">✕</button>
    </div>
    {(busy||dirty)&&<p className="bg-bg-card text-text-primary px-4 py-2" role="status">Preview updating{dirty?" — save edits to check the new version.":"…"}</p>}
    {issues.length>0&&<div role="alert" className="bg-amber-50 text-amber-950 px-4 py-3"><p>Download blocked until required checks pass.</p><ul>{issues.map((issue,i)=><li key={`${issue.code}-${i}`}>{issue.message}{issue.fieldId?` (${issue.fieldId})`:""}</li>)}</ul></div>}
    <div className="flex-1 overflow-auto p-3 flex justify-center">
      {mode==="edit"&&document?<div className="text-black"><p className="bg-white px-4 py-2">Edit titles, summary, and bullets. Source corrections require a new validated PDF upload.</p><ResumeSheet markdown="" structuredData={documentToEditor(document)} themeId={getTemplateById(template).themeId} isEditable onStructuredChange={edited=>{try{setDocument(applyEditorText(document,edited));setDirty(true);++sequence.current;clearPdf();}catch(error){setIssues([errorIssue(error instanceof Error?error.message:"Edit rejected")]);}}}/></div>
        :pdf?<object data={pdf} type="application/pdf" className="w-full h-full min-h-[70vh]" aria-label="Exact certified resume PDF"><p className="text-white">PDF preview is unavailable in this browser. Use Download PDF to view the certified file.</p></object>
        :!busy&&<p className="text-white p-6">No certified PDF is available for this revision. You can edit the draft and retry checks.</p>}
    </div>
  </div>;
}
