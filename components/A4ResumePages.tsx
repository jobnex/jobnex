"use client";

import React, { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";

type ElementProps = { children?: React.ReactNode; className?: string };

export function resumePageEnds(heights: number[], headings: boolean[], available: number): number[] {
  const ends: number[] = [];
  let used = 0;
  for (let index = 0; index < heights.length; index++) {
    // Keep a section + entry heading chain with its first content block.
    // Looking ahead only one block leaves the section alone on the prior page.
    let needed = heights[index];
    for (let next = index; headings[next] && next + 1 < heights.length; next++) {
      needed += heights[next + 1];
    }
    if (used > 0 && used + needed > available) {
      ends.push(index);
      used = 0;
    }
    used += heights[index];
  }
  ends.push(heights.length);
  return ends;
}

// Split at headings, individual bullets, and entries; retain React edit handlers.
function blocksFrom(node: React.ReactNode): React.ReactNode[] {
  return Children.toArray(node).flatMap((child): React.ReactNode[] => {
    if (!isValidElement<ElementProps>(child)) return [child];
    if (child.type === React.Fragment) return blocksFrom(child.props.children);
    if (child.type === "ul") {
      return Children.toArray(child.props.children).map((bullet) => cloneElement(child, {}, bullet));
    }
    const className = child.props.className || "";
    const nested = Children.toArray(child.props.children);
    const container = child.type === "div" && !className.includes("flex") &&
      !className.includes("leading-snug") && nested.some((item) =>
        isValidElement(item) && (item.type === "div" || item.type === "ul"));
    return container ? blocksFrom(child.props.children).map((block) => cloneElement(child, {}, block)) : [child];
  });
}

export function A4ResumePages({ children, style, zoom = 1, onPageCountChange }: {
  children: React.ReactNode;
  style: React.CSSProperties;
  zoom?: number;
  onPageCountChange?: (count: number) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState<number[]>([]);
  const blocks = blocksFrom(children);

  useEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const paginate = () => {
      const available = measure.clientHeight;
      const units = Array.from(measure.children) as HTMLElement[];
      const heights = units.map((unit) => unit.getBoundingClientRect().height);
      const headings = units.map((unit) => unit.querySelector("h2, h3, .items-baseline") !== null);
      const next = resumePageEnds(heights, headings, available);
      setEnds((previous) => previous.join(",") === next.join(",") ? previous : next);
      onPageCountChange?.(next.length);
    };
    paginate();
    const observer = new ResizeObserver(paginate);
    observer.observe(measure);
    for (const unit of Array.from(measure.children)) observer.observe(unit);
    let disposed = false;
    document.fonts.ready.then(() => { if (!disposed) paginate(); });
    return () => { disposed = true; observer.disconnect(); };
  }, [children, onPageCountChange]);

  const pageEnds = ends.length && ends[ends.length - 1] === blocks.length ? ends : [blocks.length];
  return (
    <div className="resume-sheet-root relative select-text" style={{ width: `calc(210mm * ${zoom})` }}>
      <div aria-hidden="true" inert className="resume-page-measure no-print" style={{
        ...style, position: "absolute", visibility: "hidden", pointerEvents: "none",
        width: "210mm", height: "297mm", boxSizing: "border-box",
      }}>
        <div ref={measureRef} style={{ height: "100%" }}>
          {blocks.map((block, index) => <div key={index} style={{ display: "flow-root" }}>{block}</div>)}
        </div>
      </div>
      {pageEnds.map((end, page) => {
        const start = page === 0 ? 0 : pageEnds[page - 1];
        return (
          <div key={page} className="resume-page-frame" style={{
            height: `calc(297mm * ${zoom})`, marginBottom: "24px", position: "relative",
          }}>
            <div className="resume-paper pseudo-pdf-container bg-white text-black shadow-[0_15px_45px_rgba(0,0,0,0.3)]"
              data-page-number={page + 1} aria-label={`Resume page ${page + 1} of ${pageEnds.length}`}
              style={{ ...style, width: "210mm", minHeight: "297mm", height: "297mm", boxSizing: "border-box",
                transform: `scale(${zoom})`, transformOrigin: "top left", backgroundColor: "white", color: "black" }}>
              {blocks.slice(start, end).map((block, index) => <div key={start + index} style={{ display: "flow-root" }}>{block}</div>)}
            </div>
            <span className="no-print absolute bottom-2 right-3 text-[10px] text-gray-500 pointer-events-none">
              {page + 1} / {pageEnds.length}
            </span>
          </div>
        );
      })}
    </div>
  );
}
