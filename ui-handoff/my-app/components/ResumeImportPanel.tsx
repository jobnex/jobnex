"use client";

import { useRef, useState } from "react";
import { Check, Eye, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useR2Storage } from "@/lib/hooks/useR2Storage";
import { UNSUPPORTED_LAYOUT } from "@/lib/resume-upload-policy";
import { deleteUserResume, getPresignedDownloadUrl } from "@/app/actions/storage";

export function ResumeImportPanel({currentKey,currentFileName,onConfirmed,autofill=true}: {
  currentKey?:string|null;currentFileName?:string|null;themeId?:2|3|5|6;onConfirmed:()=>void;autofill?:boolean;
}) {
  const picker=useRef<HTMLInputElement>(null);
  const pending=useRef(false);
  const {uploadFile}=useR2Storage();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const request=async(body:object)=>{
    const response=await fetch('/api/job-hunt/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if (!response.ok || !result.success) throw new Error([result.message||result.error||UNSUPPORTED_LAYOUT,result.detail].filter(Boolean).join(' '));
    return result;
  };
  const upload=async(file:File)=>{
    if(pending.current)return;
    setError('');
    if(!file.name.toLowerCase().endsWith('.pdf')) {setError('Upload a PDF. Export Word files to PDF first.');return;}
    if(file.size>10*1024*1024){setError('PDFs must be 10 MB or smaller.');return;}
    pending.current=true;setBusy(true);
    try{
      const uploaded=await uploadFile({file,category:'resume'});
      if(!uploaded.success || !uploaded.objectKey)throw new Error(uploaded.error||'Upload failed. Please retry.');
      const validated=await request({operation:'preview',objectKey:uploaded.objectKey,fileName:file.name});
      if(!validated.accepted)throw new Error(UNSUPPORTED_LAYOUT);
      await request({operation:'confirm',importId:validated.importId,revision:validated.revision,markdown:validated.markdown,autofill});
      onConfirmed();
    }catch(e){setError(e instanceof Error?e.message:'Validation failed. Please retry.');}
    finally{pending.current=false;setBusy(false);}
  };
  const preview=async()=>{
    if(!currentKey||pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{const result=await getPresignedDownloadUrl(currentKey);if(!result.success||!result.downloadUrl)throw new Error('Preview unavailable.');window.open(result.downloadUrl,'_blank','noopener,noreferrer');}
    catch(e){setError(e instanceof Error?e.message:'Preview unavailable.');}
    finally{pending.current=false;setBusy(false);}
  };
  const remove=async()=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{const result=await deleteUserResume();if(!result.success)throw new Error(result.error||'Could not remove resume. Please retry.');onConfirmed();}
    catch(e){setError(e instanceof Error?e.message:'Could not remove resume. Please retry.');}
    finally{pending.current=false;setBusy(false);}
  };
  return <div className="mb-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])void upload(e.dataTransfer.files[0]);}}>
    <input ref={picker} className="sr-only" type="file" accept=".pdf,application/pdf" aria-label="Choose resume PDF" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}} />
    {currentKey?<div className="flex items-center justify-between w-full p-3 sm:px-4 sm:py-3.5 rounded-md bg-bg-input border border-border-subtle/50 gap-2">
      <button type="button" disabled={busy} onClick={()=>picker.current?.click()} title="Replace resume" className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer disabled:cursor-wait">
        <span className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center shrink-0">{busy?<Loader2 className="w-5 h-5 animate-spin"/>:<Check className="w-5 h-5"/>}</span>
        <span className="min-w-0"><span className="block font-bold text-sm truncate">{currentFileName||'Uploaded_Resume.pdf'}</span><span role="status" className="block text-xs text-text-muted">{busy?'Checking PDF format…':'Uploaded resume'}</span></span>
      </button>
      <div className="flex gap-2 shrink-0">
        <button type="button" disabled={busy} onClick={()=>void preview()} aria-label="Preview resume" className="h-10 px-4 rounded-full text-xs font-semibold bg-white dark:bg-[#202330] inline-flex items-center gap-2 disabled:opacity-60"><Eye className="w-4 h-4"/>Preview</button>
        <button type="button" disabled={busy} onClick={()=>void remove()} aria-label="Delete resume" className="w-10 h-10 rounded-full flex items-center justify-center text-red-600 bg-red-100/80 dark:bg-red-950/40 disabled:opacity-60"><Trash2 className="w-4 h-4"/></button>
      </div>
    </div>:<button type="button" disabled={busy} onClick={()=>picker.current?.click()} className="w-full flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed border-border-input rounded-md hover:border-text-subtle gap-2 disabled:cursor-wait">
      <span className="w-10 h-10 rounded-full bg-bg-input flex items-center justify-center">{busy?<Loader2 className="w-5 h-5 animate-spin"/>:<UploadCloud className="w-5 h-5 text-text-muted"/>}</span>
      <span className="font-bold text-sm">{busy?'Checking PDF format…':'Click to upload or drag and drop'}</span>
      <span className="text-xs text-text-muted">PDF up to 10 MB · Single-column resume</span>
    </button>}
    {error&&<p role="alert" className="text-red-600 text-sm mt-3">{error}</p>}
  </div>;
}
