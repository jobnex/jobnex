"use client";

import React, { useMemo } from "react";
import { A4ResumePages } from "@/components/A4ResumePages";
import { uniqueContacts } from "@/lib/resume-contacts";
import { TypstThemeId } from "@/data/resume-templates";
import { parseResumeMarkdown, ParsedResume, serializeResumeToMarkdown } from "@/lib/resume-parser";

interface ResumeSheetProps {
  markdown: string;
  themeId: TypstThemeId;
  zoom?: number;
  isEditable?: boolean;
  onMarkdownChange?: (newMarkdown: string) => void;
  onPageCountChange?: (count: number) => void;
}

export function ResumeSheet({
  markdown,
  themeId,
  zoom = 1,
  isEditable = false,
  onMarkdownChange,
  onPageCountChange,
}: ResumeSheetProps) {

  // Parse markdown into structured model
  const parsedData = useMemo(() => {
    return parseResumeMarkdown(markdown);
  }, [markdown]);


  // Inline edit handlers that update structured data and re-serialize
  const handleFieldChange = (
    updater: (data: ParsedResume) => void
  ) => {
    if (!onMarkdownChange) return;
    const clone: ParsedResume = structuredClone(parsedData);
    updater(clone);
    const newMd = serializeResumeToMarkdown(clone);
    onMarkdownChange(newMd);
  };

  // Get theme-specific root styles
  const getThemeRootStyles = () => {
    switch (themeId) {
      case 5: // Classic Executive (Times New Roman Serif)
        return {
          fontFamily: '"Times New Roman", Times, Georgia, serif',
          fontSize: "8.6pt",
          lineHeight: "calc(8.6pt + 0.46em)",
          padding: "0.8cm 1.0cm",
        };
      case 3: // Modern Clean (Arial Deedy)
        return {
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "8.5pt",
          lineHeight: "calc(8.5pt + 0.48em)",
          padding: "0.8cm 1.0cm",
        };
      case 6: // Minimal Tech (Vertical Accent)
        return {
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "8.8pt",
          lineHeight: "calc(8.8pt + 0.48em)",
          padding: "0.8cm 1.1cm",
        };
      case 2: // Jake's Resume (Standard Tech ATS)
      default:
        return {
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: "8.5pt",
          lineHeight: "calc(8.5pt + 0.48em)",
          padding: "0.8cm 1.0cm",
        };
    }
  };

  const themeStyles = getThemeRootStyles();

  // Helper for inline editable element
  const renderEditable = (
    value: string,
    onSave: (val: string) => void,
    className = "",
    tag: "div" | "span" | "p" | "h1" | "h2" | "h3" = "span"
  ) => {
    const Tag = tag;
    if (!isEditable) {
      return <Tag className={className}>{value}</Tag>;
    }

    return (
      <Tag
        contentEditable
        suppressContentEditableWarning
        className={`${className} outline-none focus:bg-amber-50 focus:ring-1 focus:ring-amber-300 rounded-xs transition-colors cursor-text`}
        onBlur={(e: React.FocusEvent<HTMLElement>) => {
          const text = e.currentTarget.innerText.trim();
          if (text !== value) {
            onSave(text);
          }
        }}
      >
        {value}
      </Tag>
    );
  };

  // Header Rendering based on Theme
  const renderHeader = () => {
    const info = parsedData.personalInfo;
    const contacts = uniqueContacts([
      info.phone,
      info.email,
      info.linkedin,
      info.github,
      info.location,
      ...(info.extraContacts || []),
    ]);

    // Theme 5: Classic Executive — Two-Column Split Grid
    if (themeId === 5) {
      return (
        <div className="flex justify-between items-start gap-4 pb-[0.35em] mb-[0.4em] border-b-[0.5pt] border-black">
          {/* Left Column: Name & Title & Profiles */}
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="text-[19pt] font-bold leading-tight tracking-tight">
              {renderEditable(info.name || "Full Name", (val) =>
                handleFieldChange((d) => { d.personalInfo.name = val; })
              )}
            </h1>
            {info.title && (
              <div className="text-[9pt] italic font-normal text-black mt-0.5">
                {renderEditable(info.title, (val) =>
                  handleFieldChange((d) => { d.personalInfo.title = val; })
                )}
              </div>
            )}
            <div className="text-[8.5pt] text-black mt-1 flex flex-wrap gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
              {(info.extraContacts || []).map((value, index) => <span key={index}>{value}</span>)}
              {info.linkedin && (
                <span>
                  {renderEditable(info.linkedin, (val) =>
                    handleFieldChange((d) => { d.personalInfo.linkedin = val; })
                  )}
                </span>
              )}
              {info.github && (
                <span>
                  {renderEditable(info.github, (val) =>
                    handleFieldChange((d) => { d.personalInfo.github = val; })
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Contacts & Location */}
          <div className="flex flex-col items-end max-w-[45%] text-right text-[8.5pt] text-black leading-snug [overflow-wrap:anywhere]">
            {info.email && (
              <div>
                {renderEditable(info.email, (val) =>
                  handleFieldChange((d) => { d.personalInfo.email = val; })
                )}
              </div>
            )}
            {info.phone && (
              <div>
                {renderEditable(info.phone, (val) =>
                  handleFieldChange((d) => { d.personalInfo.phone = val; })
                )}
              </div>
            )}
            {info.location && (
              <div>
                {renderEditable(info.location, (val) =>
                  handleFieldChange((d) => { d.personalInfo.location = val; })
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Theme 6: Minimal Tech — Left-Aligned Header
    if (themeId === 6) {
      return (
        <div className="mb-[0.45em] text-left">
          <h1 className="text-[21pt] font-normal leading-tight tracking-tight">
            {renderEditable(info.name || "Full Name", (val) =>
              handleFieldChange((d) => { d.personalInfo.name = val; })
            )}
          </h1>
          {info.title && (
            <div className="text-[9.5pt] text-[#444444] font-medium mt-0.5">
              {renderEditable(info.title, (val) =>
                handleFieldChange((d) => { d.personalInfo.title = val; })
              )}
            </div>
          )}
          {contacts.length > 0 && (
            <div className="text-[8.8pt] text-[#444444] mt-1 flex flex-wrap items-center gap-1.5">
              {contacts.map((c, i) => (
                <span key={i} className="inline-flex max-w-full min-w-0 items-baseline gap-2">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c}</span>
                  {i < contacts.length - 1 && <span className="opacity-60">•</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Theme 3: Modern Clean — Centered with gray subtitle & thin 0.5pt divider
    if (themeId === 3) {
      return (
        <div className="text-center mb-[0.4em]">
          <h1 className="text-[20pt] font-normal text-[#111111] leading-tight tracking-tight">
            {renderEditable(info.name || "Full Name", (val) =>
              handleFieldChange((d) => { d.personalInfo.name = val; })
            )}
          </h1>
          {info.title && (
            <div className="text-[9.5pt] text-[#555555] font-normal mt-0.5">
              {renderEditable(info.title, (val) =>
                handleFieldChange((d) => { d.personalInfo.title = val; })
              )}
            </div>
          )}
          {contacts.length > 0 && (
            <div className="text-[8.5pt] text-[#555555] mt-1 flex justify-center items-center gap-2 flex-wrap">
              {contacts.map((c, i) => (
                <span key={i} className="inline-flex max-w-full min-w-0 items-baseline gap-2">
                  {i > 0 && <span className="shrink-0 text-[#aaaaaa]">|</span>}
                  <span className="min-w-0 [overflow-wrap:anywhere]">{c}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Theme 2: Jake's Resume (Default) — Centered Bold with 0.6pt solid divider
    return (
      <div className="text-center mb-[0.4em]">
        <h1 className="text-[19pt] font-bold text-black leading-tight tracking-tight">
          {renderEditable(info.name || "Full Name", (val) =>
            handleFieldChange((d) => { d.personalInfo.name = val; })
          )}
        </h1>
        {info.title && (
          <div className="text-[9.5pt] italic font-normal text-black mt-0.5">
            {renderEditable(info.title, (val) =>
              handleFieldChange((d) => { d.personalInfo.title = val; })
            )}
          </div>
        )}
        {contacts.length > 0 && (
          <div className="text-[8.5pt] text-black mt-1 flex justify-center items-center gap-2 flex-wrap">
            {contacts.map((c, i) => (
              <span key={i} className="inline-flex max-w-full min-w-0 items-baseline gap-2">
                {i > 0 && <span className="shrink-0 opacity-75">|</span>}
                <span className="min-w-0 [overflow-wrap:anywhere]">{c}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Section Header Rendering based on Theme
  const renderSectionHeader = (title: string) => {
    if (themeId === 6) {
      // Minimal Tech: Vertical Accent Bar (border-left 3.5pt solid black)
      return (
        <div className="border-l-[3.5pt] border-black pl-[0.5em] mt-[0.45em] mb-[0.25em]">
          <h2 className="text-[10.5pt] font-bold tracking-[0.5pt] uppercase leading-none">
            {title}
          </h2>
        </div>
      );
    }

    if (themeId === 3) {
      // Modern Clean: Uppercase Gray with 0.5pt divider
      return (
        <div className="border-b-[0.5pt] border-[#aaaaaa] pb-[1px] mt-[0.38em] mb-[0.25em]">
          <h2 className="text-[9.8pt] font-bold text-[#666666] tracking-[1.2pt] uppercase leading-none">
            {title}
          </h2>
        </div>
      );
    }

    if (themeId === 5) {
      // Classic Executive: Uppercase Serif with 0.5pt black divider
      return (
        <div className="border-b-[0.5pt] border-black pb-[1px] mt-[0.32em] mb-[0.25em]">
          <h2 className="text-[10pt] font-bold text-black uppercase tracking-[0.4pt] leading-none">
            {title}
          </h2>
        </div>
      );
    }

    // Theme 2: Jake's Resume: 10pt Bold with 0.6pt solid black divider
    return (
      <div className="border-b-[0.6pt] border-black pb-[1px] mt-[0.35em] mb-[0.25em]">
        <h2 className="text-[10pt] font-bold text-black leading-none">
          {title}
        </h2>
      </div>
    );
  };

  return (
    <A4ResumePages style={themeStyles} zoom={zoom} onPageCountChange={onPageCountChange}>
          {/* Top Header */}
          {renderHeader()}

          {/* Sections */}
          {parsedData.sectionOrder.map((secKey) => {
            if (secKey === "summary" && parsedData.summary.length > 0) {
              return (
                <div key="sec-summary" className="mb-[0.3em]">
                  {renderSectionHeader("Professional Summary")}
                  <ul className="list-disc pl-[1.15em] mt-[0.15em] mb-[0.2em] space-y-[0.12em]">
                    {parsedData.summary.map((bullet, idx) => (
                      <li key={idx} className="leading-snug text-black [overflow-wrap:anywhere]">
                        {renderEditable(bullet, (val) =>
                          handleFieldChange((d) => { d.summary[idx] = val; })
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }

            if (secKey === "skills" && parsedData.skills.length > 0) {
              return (
                <div key="sec-skills" className="mb-[0.3em]">
                  {renderSectionHeader("Technical Skills")}
                  <div className="mt-[0.15em] mb-[0.2em] space-y-[0.12em] text-black">
                    {parsedData.skills.map((skill, idx) => (
                      <div key={idx} className="leading-snug">
                        <span className="font-bold">
                          {renderEditable(skill.category, (val) =>
                            handleFieldChange((d) => { d.skills[idx].category = val; })
                          )}
                          :{" "}
                        </span>
                        <span>
                          {renderEditable(skill.items, (val) =>
                            handleFieldChange((d) => { d.skills[idx].items = val; })
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (secKey === "experience" && parsedData.experience.length > 0) {
              return (
                <div key="sec-experience" className="mb-[0.3em]">
                  {renderSectionHeader("Professional Experience")}
                  <div className="space-y-[0.35em] mt-[0.2em]">
                    {parsedData.experience.map((exp, idx) => (
                      <div key={idx}>
                        <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-0.5 leading-snug [overflow-wrap:anywhere]">
                          <div>
                            <span className="font-bold">
                              {renderEditable(exp.role, (val) =>
                                handleFieldChange((d) => { d.experience[idx].role = val; })
                              )}
                            </span>
                            {exp.company && (
                              <span className="italic font-normal">
                                {" "}
                                |{" "}
                                {renderEditable(exp.company, (val) =>
                                  handleFieldChange((d) => { d.experience[idx].company = val; })
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-right text-[8.2pt] font-normal max-w-full ml-auto [overflow-wrap:anywhere]">
                            {exp.location && <span>{exp.location} | </span>}
                            <span>
                              {renderEditable(exp.duration, (val) =>
                                handleFieldChange((d) => { d.experience[idx].duration = val; })
                              )}
                            </span>
                          </div>
                        </div>

                        {exp.bullets.length > 0 && (
                          <ul className="list-disc pl-[1.15em] mt-[0.12em] mb-[0.15em] space-y-[0.12em]">
                            {exp.bullets.map((bullet, bIdx) => (
                              <li key={bIdx} className="leading-snug text-black [overflow-wrap:anywhere]">
                                {renderEditable(bullet, (val) =>
                                  handleFieldChange((d) => { d.experience[idx].bullets[bIdx] = val; })
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (secKey === "projects" && parsedData.projects.length > 0) {
              return (
                <div key="sec-projects" className="mb-[0.3em]">
                  {renderSectionHeader("Technical Projects")}
                  <div className="space-y-[0.35em] mt-[0.2em]">
                    {parsedData.projects.map((proj, idx) => (
                      <div key={idx}>
                        <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-0.5 leading-snug [overflow-wrap:anywhere]">
                          <div>
                            <span className="font-bold">
                              {renderEditable(proj.title, (val) =>
                                handleFieldChange((d) => { d.projects[idx].title = val; })
                              )}
                            </span>
                            {proj.technologies && (
                              <span className="font-normal">
                                {" "}
                                | {proj.technologies}
                              </span>
                            )}
                          </div>
                          {proj.duration && (
                            <div className="text-right text-[8.2pt] font-normal max-w-full ml-auto [overflow-wrap:anywhere]">
                              {renderEditable(proj.duration, (val) =>
                                handleFieldChange((d) => { d.projects[idx].duration = val; })
                              )}
                            </div>
                          )}
                        </div>

                        {proj.bullets.length > 0 && (
                          <ul className="list-disc pl-[1.15em] mt-[0.12em] mb-[0.15em] space-y-[0.12em]">
                            {proj.bullets.map((bullet, bIdx) => (
                              <li key={bIdx} className="leading-snug text-black [overflow-wrap:anywhere]">
                                {renderEditable(bullet, (val) =>
                                  handleFieldChange((d) => { d.projects[idx].bullets[bIdx] = val; })
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (secKey === "education" && parsedData.education.length > 0) {
              return (
                <div key="sec-education" className="mb-[0.3em]">
                  {renderSectionHeader("Education")}
                  <div className="space-y-[0.3em] mt-[0.2em]">
                    {parsedData.education.map((edu, idx) => (
                      <div key={idx} className="leading-snug">
                        <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-0.5 font-bold [overflow-wrap:anywhere]">
                          <span>
                            {renderEditable(edu.institution, (val) =>
                              handleFieldChange((d) => { d.education[idx].institution = val; })
                            )}
                          </span>
                          <span className="text-[8.2pt] font-normal">
                            {edu.location}
                          </span>
                        </div>
                        {(edu.degree || edu.duration) && (
                          <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-0.5 text-[8.2pt] italic [overflow-wrap:anywhere]">
                            <span>
                              {renderEditable(edu.degree, (val) =>
                                handleFieldChange((d) => { d.education[idx].degree = val; })
                              )}
                            </span>
                            <span className="not-italic">
                              {edu.duration}
                            </span>
                          </div>
                        )}
                        {edu.details && (
                          <div className="text-[8pt] text-[#222222] mt-0.5">
                            {renderEditable(edu.details, (val) =>
                              handleFieldChange((d) => { d.education[idx].details = val; })
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}
    </A4ResumePages>
  );
}
