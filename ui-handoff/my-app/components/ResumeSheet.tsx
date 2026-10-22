"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { TypstThemeId } from "@/data/resume-templates";
import { parseResumeMarkdown, ParsedResume, serializeResumeToMarkdown, resumePlainText } from "@/lib/resume-parser";

interface ResumeSheetProps {
  markdown: string;
  themeId: TypstThemeId;
  zoom?: number;
  isEditable?: boolean;
  onMarkdownChange?: (newMarkdown: string) => void;
  onOverflowChange?: (isOverflow: boolean) => void;
  onPageCountChange?: (pageCount: number) => void;
}

export function ResumeSheet({
  markdown,
  themeId,
  zoom = 1,
  isEditable = false,
  onMarkdownChange,
  onOverflowChange,
  onPageCountChange,
}: ResumeSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [, setIsOverflowing] = useState(false);
  const [pageCount, setPageCount] = useState(1);

  // Parse markdown into structured model
  const parsedData = useMemo(() => {
    return parseResumeMarkdown(markdown);
  }, [markdown]);

  // A4 Page measurement & overflow checking
  const checkA4Pages = useCallback(() => {
    const sheetEl = sheetRef.current;
    const contentEl = contentRef.current;
    if (!sheetEl || !contentEl) return;

    // Standard A4 height (297mm) at 96 DPI: (297 / 25.4) * 96 ≈ 1122.52px
    const a4HeightPx = 1122.52;

    // Dynamically retrieve top and bottom padding of active theme
    const computedStyle = window.getComputedStyle(sheetEl);
    const paddingTop = parseFloat(computedStyle.paddingTop) || 30.24;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 30.24;

    // Measure unconstrained content stream height from contentRef (independent of paper minHeight)
    const contentHeight = contentEl.offsetHeight;
    const totalDocumentHeight = paddingTop + contentHeight + paddingBottom;

    // Tolerance buffer (18px ≈ 4.7mm) to absorb subpixel glyph metrics and trailing section margin-bottom
    const OVERFLOW_TOLERANCE_PX = 18;

    let calculatedPages = 1;
    if (totalDocumentHeight > a4HeightPx + OVERFLOW_TOLERANCE_PX) {
      calculatedPages = Math.max(1, Math.ceil((totalDocumentHeight - OVERFLOW_TOLERANCE_PX) / a4HeightPx));
    }

    const overflow = calculatedPages > 1;

    setPageCount((prev) => (prev !== calculatedPages ? calculatedPages : prev));
    setIsOverflowing((prev) => (prev !== overflow ? overflow : prev));
    onOverflowChange?.(overflow);
    onPageCountChange?.(calculatedPages);
  }, [onOverflowChange, onPageCountChange]);

  useEffect(() => {
    checkA4Pages();
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const observer = new ResizeObserver(() => {
      checkA4Pages();
    });
    observer.observe(contentEl);

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        checkA4Pages();
      });
    }

    return () => observer.disconnect();
  }, [checkA4Pages, markdown, themeId]);

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
    const contacts = [
      info.phone,
      info.email,
      info.linkedin,
      info.github,
      info.location,
      ...(info.extraContacts || []),
    ].filter(Boolean);

    // Theme 5: Classic Executive — Two-Column Split Grid
    if (themeId === 5) {
      return (
        <div className="flex justify-between items-start pb-[0.35em] mb-[0.4em] border-b-[0.5pt] border-black resume-section-header">
          {/* Left Column: Name & Title & Profiles */}
          <div className="flex flex-col max-w-[55%] break-words">
            <h1 className="text-[19pt] font-bold leading-tight tracking-tight">
              {renderEditable(info.name || "Full Name", (val) =>
                handleFieldChange((d) => { d.personalInfo.name = val; })
              )}
            </h1>
            {info.title && (
              <div className="text-[9pt] italic font-normal text-black mt-0.5 break-words">
                {renderEditable(info.title, (val) =>
                  handleFieldChange((d) => { d.personalInfo.title = val; })
                )}
              </div>
            )}
            <div className="text-[8.5pt] text-black mt-1 flex flex-wrap gap-x-3 gap-y-0.5 break-words">
              {info.linkedin && (
                <span className="break-all">
                  {renderEditable(info.linkedin, (val) =>
                    handleFieldChange((d) => { d.personalInfo.linkedin = val; })
                  )}
                </span>
              )}
              {info.github && (
                <span className="break-all">
                  {renderEditable(info.github, (val) =>
                    handleFieldChange((d) => { d.personalInfo.github = val; })
                  )}
                </span>
              )}
              {(info.extraContacts || []).map((contact, index) => <span key={index} className="break-all">{contact}</span>)}
            </div>
          </div>

          {/* Right Column: Contacts & Location */}
          <div className="flex flex-col items-end text-[8.5pt] text-black leading-snug max-w-[45%] break-words text-right">
            {info.email && (
              <div className="break-all">
                {renderEditable(info.email, (val) =>
                  handleFieldChange((d) => { d.personalInfo.email = val; })
                )}
              </div>
            )}
            {info.phone && (
              <div className="whitespace-nowrap">
                {renderEditable(info.phone, (val) =>
                  handleFieldChange((d) => { d.personalInfo.phone = val; })
                )}
              </div>
            )}
            {info.location && (
              <div className="break-words">
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
        <div className="mb-[0.45em] text-left resume-section-header">
          <h1 className="text-[21pt] font-normal leading-tight tracking-tight break-words">
            {renderEditable(info.name || "Full Name", (val) =>
              handleFieldChange((d) => { d.personalInfo.name = val; })
            )}
          </h1>
          {info.title && (
            <div className="text-[9.5pt] text-[#444444] font-medium mt-0.5 break-words">
              {renderEditable(info.title, (val) =>
                handleFieldChange((d) => { d.personalInfo.title = val; })
              )}
            </div>
          )}
          {contacts.length > 0 && (
            <div className="text-[8.8pt] text-[#444444] mt-1 flex flex-wrap items-center gap-1.5 break-words">
              {contacts.map((c, i) => (
                <React.Fragment key={i}>
                  <span className="break-all">{c}</span>
                  {i < contacts.length - 1 && <span className="opacity-60">•</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Theme 3: Modern Clean — Centered with gray subtitle & thin 0.5pt divider
    if (themeId === 3) {
      return (
        <div className="text-center mb-[0.4em] resume-section-header">
          <h1 className="text-[20pt] font-normal text-[#111111] leading-tight tracking-tight break-words">
            {renderEditable(info.name || "Full Name", (val) =>
              handleFieldChange((d) => { d.personalInfo.name = val; })
            )}
          </h1>
          {info.title && (
            <div className="text-[9.5pt] text-[#555555] font-normal mt-0.5 break-words">
              {renderEditable(info.title, (val) =>
                handleFieldChange((d) => { d.personalInfo.title = val; })
              )}
            </div>
          )}
          {contacts.length > 0 && (
            <div className="text-[8.5pt] text-[#555555] mt-1 flex justify-center items-center gap-x-2 gap-y-0.5 flex-wrap break-words">
              {contacts.map((c, i) => (
                <React.Fragment key={i}>
                  <span className="break-all">{c}</span>
                  {i < contacts.length - 1 && <span className="text-[#aaaaaa]">|</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Theme 2: Jake's Resume (Default) — Centered Bold with 0.6pt solid divider
    return (
      <div className="text-center mb-[0.4em] resume-section-header">
        <h1 className="text-[19pt] font-bold text-black leading-tight tracking-tight break-words">
          {renderEditable(info.name || "Full Name", (val) =>
            handleFieldChange((d) => { d.personalInfo.name = val; })
          )}
        </h1>
        {info.title && (
          <div className="text-[9.5pt] italic font-normal text-black mt-0.5 break-words">
            {renderEditable(info.title, (val) =>
              handleFieldChange((d) => { d.personalInfo.title = val; })
            )}
          </div>
        )}
        {contacts.length > 0 && (
          <div className="text-[8.5pt] text-black mt-1 flex justify-center items-center gap-x-2 gap-y-0.5 flex-wrap break-words">
            {contacts.map((c, i) => (
              <React.Fragment key={i}>
                <span className="break-all">{c}</span>
                {i < contacts.length - 1 && <span className="opacity-75">|</span>}
              </React.Fragment>
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
        <div className="border-l-[3.5pt] border-black pl-[0.5em] mt-[0.45em] mb-[0.25em] resume-section-header">
          <h2 className="text-[10.5pt] font-bold tracking-[0.5pt] uppercase leading-none">
            {title}
          </h2>
        </div>
      );
    }

    if (themeId === 3) {
      // Modern Clean: Uppercase Gray with 0.5pt divider
      return (
        <div className="border-b-[0.5pt] border-[#aaaaaa] pb-[1px] mt-[0.38em] mb-[0.25em] resume-section-header">
          <h2 className="text-[9.8pt] font-bold text-[#666666] tracking-[1.2pt] uppercase leading-none">
            {title}
          </h2>
        </div>
      );
    }

    if (themeId === 5) {
      // Classic Executive: Uppercase Serif with 0.5pt black divider
      return (
        <div className="border-b-[0.5pt] border-black pb-[1px] mt-[0.32em] mb-[0.25em] resume-section-header">
          <h2 className="text-[10pt] font-bold text-black uppercase tracking-[0.4pt] leading-none">
            {title}
          </h2>
        </div>
      );
    }

    // Theme 2: Jake's Resume: 10pt Bold with 0.6pt solid black divider
    return (
      <div className="border-b-[0.6pt] border-black pb-[1px] mt-[0.35em] mb-[0.25em] resume-section-header">
        <h2 className="text-[10pt] font-bold text-black leading-none">
          {title}
        </h2>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col items-center select-text">
      {/* Zoom Scaled Wrapper */}
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top center",
          transition: "transform 0.15s ease",
          width: "210mm",
          minHeight: `${pageCount * 297}mm`,
          height: "max-content",
        }}
        className="pseudo-pdf-container"
      >
        {/* Physical Paper Element: ISO A4 (210mm x 297mm per page) */}
        <div
          ref={sheetRef}
          style={{
            width: "210mm",
            minHeight: `${pageCount * 297}mm`,
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
            color: "#000000",
            ...themeStyles,
          }}
          className="relative shadow-[0_15px_45px_rgba(0,0,0,0.3)] bg-white transition-shadow duration-200 print:shadow-none print:m-0 print:border-none print:w-[210mm] print:min-h-[297mm]"
        >
          {/* Unconstrained content flow container measured by ResizeObserver */}
          <div ref={contentRef} className="resume-content-flow w-full flow-root">
            {/* Top Header */}
            {renderHeader()}

          {/* Sections */}
          {parsedData.sectionOrder.map((secKey) => {
            if (secKey === "summary" && parsedData.summary.length > 0) {
              return (
                <div key="sec-summary" className="mb-[0.3em] resume-section">
                  {renderSectionHeader("Professional Summary")}
                  <ul className="list-disc pl-[1.15em] mt-[0.15em] mb-[0.2em] space-y-[0.12em]">
                    {parsedData.summary.map((bullet, idx) => (
                      <li key={idx} className="leading-snug text-black break-words">
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
                <div key="sec-skills" className="mb-[0.3em] resume-section">
                  {renderSectionHeader("Technical Skills")}
                  <div className="mt-[0.15em] mb-[0.2em] space-y-[0.12em] text-black">
                    {parsedData.skills.map((skill, idx) => (
                      <div key={idx} className="leading-snug break-words">
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
                <div key="sec-experience" className="mb-[0.3em] resume-section">
                  {renderSectionHeader("Professional Experience")}
                  <div className="space-y-[0.35em] mt-[0.2em]">
                    {parsedData.experience.map((exp, idx) => (
                      <div key={idx} className="resume-section-item">
                        <div className="flex justify-between items-baseline leading-snug flex-wrap gap-x-2">
                          <div className="min-w-0 max-w-[70%] break-words">
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
                          <div className="text-right text-[8.2pt] font-normal shrink-0 ml-auto whitespace-nowrap">
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
                              <li key={bIdx} className="leading-snug text-black break-words">
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
                <div key="sec-projects" className="mb-[0.3em] resume-section">
                  {renderSectionHeader("Technical Projects")}
                  <div className="space-y-[0.35em] mt-[0.2em]">
                    {parsedData.projects.map((proj, idx) => (
                      <div key={idx} className="resume-section-item">
                        <div className="flex justify-between items-baseline leading-snug flex-wrap gap-x-2">
                          <div className="min-w-0 max-w-[70%] break-words">
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
                            <div className="text-right text-[8.2pt] font-normal shrink-0 ml-auto whitespace-nowrap">
                              {renderEditable(proj.duration, (val) =>
                                handleFieldChange((d) => { d.projects[idx].duration = val; })
                              )}
                            </div>
                          )}
                        </div>

                        {proj.bullets.length > 0 && (
                          <ul className="list-disc pl-[1.15em] mt-[0.12em] mb-[0.15em] space-y-[0.12em]">
                            {proj.bullets.map((bullet, bIdx) => (
                              <li key={bIdx} className="leading-snug text-black break-words">
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
                <div key="sec-education" className="mb-[0.3em] resume-section">
                  {renderSectionHeader("Education")}
                  <div className="space-y-[0.3em] mt-[0.2em]">
                    {parsedData.education.map((edu, idx) => (
                      <div key={idx} className="leading-snug resume-section-item">
                        <div className="flex justify-between items-baseline font-bold flex-wrap gap-x-2">
                          <span className="min-w-0 break-words">
                            {renderEditable(edu.institution, (val) =>
                              handleFieldChange((d) => { d.education[idx].institution = val; })
                            )}
                          </span>
                          <span className="text-[8.2pt] font-normal shrink-0 ml-auto whitespace-nowrap">
                            {edu.location}
                          </span>
                        </div>
                        {(edu.degree || edu.duration) && (
                          <div className="flex justify-between items-baseline text-[8.2pt] italic flex-wrap gap-x-2">
                            <span className="min-w-0 break-words">
                              {renderEditable(edu.degree, (val) =>
                                handleFieldChange((d) => { d.education[idx].degree = val; })
                              )}
                            </span>
                            <span className="not-italic shrink-0 ml-auto whitespace-nowrap">
                              {edu.duration}
                            </span>
                          </div>
                        )}
                        {edu.details && (
                          <div className="text-[8pt] text-[#222222] mt-0.5 break-words">
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

            const extra = parsedData.additionalSections?.[secKey];
            if (extra) {
              return <div key={secKey} className="mb-[0.3em]">
                {renderSectionHeader(extra.title)}
                {extra.lines.map((line, index) => <div key={index} className="break-words whitespace-pre-wrap">
                  {renderEditable(resumePlainText(line), value => handleFieldChange(data => {
                    data.additionalSections![secKey].lines[index] = value;
                  }))}
                </div>)}
              </div>;
            }
            return null;
          })}
          </div>

          {/* Multi-Page A4 Break Guides and Page Numbers (Active only when content genuinely exceeds 1 page) */}
          {pageCount > 1 && Array.from({ length: pageCount }).map((_, idx) => {
            const pageNum = idx + 1;
            const isLastPage = pageNum === pageCount;
            const pageBottomPx = pageNum * 1122.5;

            return (
              <React.Fragment key={pageNum}>
                {/* Visual Page Break Guide between pages */}
                {!isLastPage && (
                  <div
                    style={{ top: `${pageBottomPx}px` }}
                    className="no-print absolute left-0 right-0 z-30 pointer-events-none -translate-y-1/2 flex items-center justify-between px-3"
                  >
                    <div className="w-full border-b border-dashed border-neutral-400/80 flex justify-end">
                      <span className="bg-neutral-800 text-white text-[9px] font-mono px-2 py-0.5 rounded -translate-y-1/2 shadow-xs">
                        Page {pageNum} Ends · Page {pageNum + 1} Starts
                      </span>
                    </div>
                  </div>
                )}

                {/* Discrete Page Number in bottom margin */}
                <div
                  style={{ top: `${pageBottomPx - 24}px` }}
                  className="absolute right-8 text-[7.5pt] text-neutral-400 font-mono select-none pointer-events-none z-20"
                >
                  Page {pageNum} of {pageCount}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>

  );
}
