"use client";

import React, { memo } from "react";

export const AiResumeBannerArt = memo(function AiResumeBannerArt() {
  return (
    <svg className="block w-full h-full object-contain pointer-events-none select-none" viewBox="0 0 830 440" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustration: an AI star rewriting a resume, with five emerald credit gems">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fbf8ef"/><stop offset=".6" stopColor="#f1ecdd"/><stop offset="1" stopColor="#e3dbc4"/>
    </linearGradient>
    <linearGradient id="starFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#e6ffb8"/><stop offset=".45" stopColor="#b9f46c"/><stop offset="1" stopColor="#7fc934"/>
    </linearGradient>
    <radialGradient id="starGlow"><stop offset="0" stopColor="#adee5e" stopOpacity=".45"/><stop offset="1" stopColor="#adee5e" stopOpacity="0"/></radialGradient>
    <radialGradient id="sceneGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#adee5e" stopOpacity=".16"/><stop offset="1" stopColor="#adee5e" stopOpacity="0"/></radialGradient>
    <radialGradient id="gemGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#22d38f" stopOpacity=".28"/><stop offset="1" stopColor="#22d38f" stopOpacity="0"/></radialGradient>
    <clipPath id="starClip"><path d="M0.0,-66.0 Q8.6,-8.6 66.0,0.0 Q8.6,8.6 0.0,66.0 Q-8.6,8.6 -66.0,0.0 Q-8.6,-8.6 0.0,-66.0 Z"/></clipPath>
    <radialGradient id="starLight"><stop offset="0" stopColor="#f4ffd0" stopOpacity=".75"/><stop offset="1" stopColor="#f4ffd0" stopOpacity="0"/></radialGradient>
    <clipPath id="paperClip"><path d="M3,2 C80,-1 170,1 248,0 C249,100 251,220 250,319 C170,321 80,318 33,320 L1,288 C2,210 -1,100 3,2 Z"/></clipPath>
    <clipPath id="shadeClip"><path d="M0,330 L0,150 C40,210 120,270 260,310 L260,330 Z"/></clipPath>
    <clipPath id="lowerRight"><path d="M66,-66 L66,66 L-66,66 Z"/></clipPath>
    <filter id="wobble" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale="3.2"/>
    </filter>
    <filter id="paint" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>

  <ellipse cx="450" cy="220" rx="330" ry="240" fill="url(#sceneGlow)"/>
  <ellipse cx="680" cy="360" rx="150" ry="100" fill="url(#gemGlow)"/>
  <path d="M14,398 Q14,388 24,388 L62,388 L62,426 Q62,436 52,436 L14,436 Z" fill="#1c1f26" stroke="#2b2f38" strokeWidth="1.5"/>
<path d="M62,350 Q62,340 72,340 L110,340 L110,378 Q110,388 100,388 L62,388 Z" fill="#1c1f26" stroke="#2b2f38" strokeWidth="1.5"/>
<path d="M110,302 Q110,292 120,292 L158,292 L158,330 Q158,340 148,340 L110,340 Z" fill="#1c1f26" stroke="#2b2f38" strokeWidth="1.5"/>
<path d="M158,254 Q158,244 168,244 L206,244 L206,282 Q206,292 196,292 L158,292 Z" fill="#1c1f26" stroke="#2b2f38" strokeWidth="1.5"/>

  {/* old resume */}
  <g transform="translate(286,244) rotate(-12) scale(1.1) translate(-115,-150)">
    <g filter="url(#wobble)"><path d="M2,1 C80,0 160,2 230,0 C231,100 232,200 231,300 C160,302 80,299 1,301 C2,200 0,100 2,1 Z" fill="#5b616d" stroke="#0f1218" strokeWidth="2.4"/>
<path d="M1,301 C2,220 0,150 2,110 C40,180 120,240 231,280 L231,300 C160,302 80,299 1,301 Z" fill="#454a55" opacity=".8" filter="url(#soft)"/>
<circle cx="32" cy="36" r="15" fill="#737986" stroke="#0f1218" strokeWidth="1.6"/>
<polyline points="58.0,29.9 76.4,29.7 94.8,30.1 113.2,29.7 131.6,30.0 150.0,29.9" fill="none" stroke="#30343c" strokeWidth="7.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="58.0,44.6 78.0,45.0 98.0,44.6 118.0,44.9" fill="none" stroke="#7c828e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,79.4 35.3,79.4 54.7,79.9 74.0,80.5 93.3,79.5 112.7,79.6 132.0,80.2 151.3,80.6 170.7,80.1 190.0,79.9" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,94.7 34.8,93.4 53.6,94.5 72.4,93.7 91.2,93.5 110.0,93.5 128.8,93.7 147.6,94.4 166.4,93.6 185.2,94.1 204.0,94.2" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,107.8 35.1,108.1 54.3,107.4 73.4,107.4 92.6,107.6 111.7,108.3 130.9,107.9 150.0,107.7" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,136.1 34.0,135.9 52.0,135.7 70.0,136.4 88.0,136.3 106.0,135.6 124.0,136.1 142.0,136.0 160.0,136.5 178.0,136.3 196.0,135.7" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,150.7 34.7,149.5 53.3,149.9 72.0,150.4 90.7,149.5 109.3,150.0 128.0,149.4 146.7,150.2 165.3,150.4 184.0,150.1" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,164.5 36.8,163.7 57.6,164.3 78.4,164.1 99.2,164.1 120.0,163.9" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,192.5 34.4,192.6 52.8,192.0 71.2,192.2 89.6,191.4 108.0,192.3 126.4,192.2 144.8,192.7 163.2,192.5 181.6,191.7 200.0,191.8" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,206.2 35.5,205.3 55.0,205.9 74.5,205.5 94.0,205.5 113.5,205.4 133.0,206.4 152.5,205.5 172.0,205.6" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,219.8 34.5,220.5 53.0,219.4 71.5,219.9 90.0,220.1" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,248.5 35.1,248.4 54.3,248.5 73.4,247.7 92.6,247.9 111.7,247.8 130.9,248.5 150.0,248.6" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,261.5 34.4,261.5 52.9,261.6 71.3,261.6 89.8,262.0 108.2,262.1 126.7,261.7 145.1,261.3 163.6,261.9 182.0,261.8" fill="none" stroke="#7c828e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></g>
  </g>

  {/* tailored resume */}
  <ellipse cx="450" cy="420" rx="170" ry="16" fill="#000" opacity=".6" filter="url(#shadow)"/>
  <g transform="translate(446,222) rotate(5) scale(1.17) translate(-125,-160)">
    <g filter="url(#wobble)"><path d="M3,2 C80,-1 170,1 248,0 C249,100 251,220 250,319 C170,321 80,318 1,320 C2,210 -1,100 3,2 Z" fill="url(#paper)"/>
<path d="M1,320 C2,230 0,160 3,120 C40,190 120,260 250,300 L250,319 C170,321 80,318 1,320 Z" fill="#cfc6ae" opacity=".55" filter="url(#soft)"/>
<path d="M248,0 C249,100 251,220 250,319" fill="none" stroke="#adee5e" strokeWidth="5" opacity=".75" filter="url(#soft)"/>
<path d="M1,288 C12,292 26,302 33,320 C22,312 10,306 1,288 Z" fill="#ddd5bf" stroke="#0f1218" strokeWidth="1.8" strokeLinejoin="round"/>
<circle cx="36" cy="40" r="17" fill="#e4dcc6" stroke="#0f1218" strokeWidth="1.8"/>
<circle cx="36" cy="35" r="6" fill="#9b9381"/><path d="M24,52 C26,44 46,44 48,52" fill="#9b9381"/>
<polyline points="64.0,33.1 84.8,33.4 105.6,33.2 126.4,33.0 147.2,33.1 168.0,33.1" fill="none" stroke="#1b1f27" strokeWidth="8.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="64.0,49.6 86.7,50.3 109.3,50.2 132.0,50.3" fill="none" stroke="#a49d8a" strokeWidth="4.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="16.0,72.3 34.0,71.9 52.0,71.9 70.0,71.6 88.0,72.1 106.0,71.6 124.0,71.6 142.0,71.7 160.0,71.7 178.0,71.8 196.0,71.6 214.0,71.5 232.0,71.7" fill="none" stroke="#c9c1aa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="18.0,91.8 36.7,91.9 55.3,91.8 74.0,92.1" fill="none" stroke="#4f7f1c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M16.0,116.0 C84.0,113.5 154.0,116.2 214.0,115.0 L211.0,130.0 C146.0,128.0 74.0,130.6 14.0,128.5 Z" fill="#adee5e" opacity="0.92"/>
<polyline points="20.0,108.2 38.6,107.5 57.2,107.7 75.8,107.8 94.4,107.8 113.0,107.5 131.6,108.5 150.2,108.7 168.8,108.0 187.4,108.0 206.0,107.4" fill="none" stroke="#8d8778" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="20.0,121.4 39.6,121.8 59.1,121.7 78.7,122.5 98.2,121.5 117.8,121.3 137.3,122.6 156.9,122.0 176.4,121.5 196.0,122.1" fill="none" stroke="#2a3a14" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="20.0,135.3 40.3,136.0 60.6,136.7 80.9,136.5 101.1,136.3 121.4,135.7 141.7,135.8 162.0,135.5" fill="none" stroke="#8d8778" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="18.0,160.1 40.0,160.0 62.0,160.1" fill="none" stroke="#4f7f1c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M16.0,184.0 C74.9,181.5 135.8,184.2 188.0,183.0 L185.0,198.0 C128.8,196.0 66.2,198.6 14.0,196.5 Z" fill="#adee5e" opacity="0.92"/>
<path d="M16.0,198.0 C53.9,195.5 93.8,198.2 128.0,197.0 L125.0,212.0 C89.2,210.0 48.2,212.6 14.0,210.5 Z" fill="#adee5e" opacity="0.80"/>
<polyline points="20.0,175.8 39.0,175.6 58.0,176.4 77.0,176.7 96.0,176.5 115.0,176.4 134.0,176.4 153.0,176.3 172.0,175.6 191.0,176.0 210.0,175.8" fill="none" stroke="#8d8778" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="20.0,189.3 39.8,189.3 59.5,189.7 79.2,189.7 99.0,190.3 118.8,190.6 138.5,189.9 158.2,190.6 178.0,190.7" fill="none" stroke="#2a3a14" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<polyline points="20.0,204.6 40.0,203.8 60.0,203.6 80.0,203.6 100.0,203.6 120.0,203.6" fill="none" stroke="#2a3a14" strokeWidth="3.0" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M222,121 l5,5 l10,-11" fill="none" stroke="#0f1218" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M222,189 l5,5 l10,-11" fill="none" stroke="#0f1218" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
<rect x="18" y="226" width="40" height="16" rx="8" fill="#e7e0cb" stroke="#0f1218" strokeWidth="1.4"/>
<polyline points="26.0,234.0 38.0,234.2 50.0,234.1" fill="none" stroke="#9b9381" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
<rect x="64" y="226" width="52" height="16" rx="8" fill="#adee5e" stroke="#0f1218" strokeWidth="1.4"/>
<polyline points="72.0,234.0 90.0,234.1 108.0,234.1" fill="none" stroke="#2a3a14" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
<rect x="122" y="226" width="34" height="16" rx="8" fill="#e7e0cb" stroke="#0f1218" strokeWidth="1.4"/>
<polyline points="130.0,233.8 139.0,234.1 148.0,234.2" fill="none" stroke="#9b9381" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
<rect x="162" y="226" width="46" height="16" rx="8" fill="#adee5e" stroke="#0f1218" strokeWidth="1.4"/>
<polyline points="170.0,234.1 185.0,234.1 200.0,234.0" fill="none" stroke="#2a3a14" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
<g clipPath="url(#paperClip)" stroke="#b9ae90" strokeWidth="1.6" strokeLinecap="round" opacity=".55"><g clipPath="url(#shadeClip)"><line x1="-30" y1="330" x2="40" y2="240"/><line x1="-22" y1="330" x2="48" y2="240"/><line x1="-14" y1="330" x2="56" y2="240"/><line x1="-6" y1="330" x2="64" y2="240"/><line x1="2" y1="330" x2="72" y2="240"/><line x1="10" y1="330" x2="80" y2="240"/><line x1="18" y1="330" x2="88" y2="240"/><line x1="26" y1="330" x2="96" y2="240"/><line x1="34" y1="330" x2="104" y2="240"/><line x1="42" y1="330" x2="112" y2="240"/><line x1="50" y1="330" x2="120" y2="240"/><line x1="58" y1="330" x2="128" y2="240"/><line x1="66" y1="330" x2="136" y2="240"/><line x1="74" y1="330" x2="144" y2="240"/><line x1="82" y1="330" x2="152" y2="240"/><line x1="90" y1="330" x2="160" y2="240"/><line x1="98" y1="330" x2="168" y2="240"/><line x1="106" y1="330" x2="176" y2="240"/><line x1="114" y1="330" x2="184" y2="240"/></g></g>
<g clipPath="url(#paperClip)"><circle cx="250" cy="0" r="170" fill="url(#starLight)"/><path d="M214.0,-12.0 Q221.5,38.5 272.0,46.0 Q221.5,53.5 214.0,104.0 Q206.5,53.5 156.0,46.0 Q206.5,38.5 214.0,-12.0 Z" fill="#3c3a2a" opacity=".22" filter="url(#soft)"/></g>
<path d="M3,2 C80,-1 170,1 248,0 C249,100 251,220 250,319 C170,321 80,318 33,320 L1,288 C2,210 -1,100 3,2 Z" fill="none" stroke="#0f1218" strokeWidth="2.6" strokeLinejoin="round"/></g>
    <rect x="18" y="262" width="122" height="26" rx="13" fill="#0f1218"/>
<circle cx="33" cy="275" r="5" fill="#adee5e"/>
<text x="45" y="279.5" fontFamily="var(--font-mono), ui-monospace, monospace" fontSize="11" fontWeight="600" letterSpacing="1" fill="#adee5e">96% MATCH</text>
  </g>

  {/* AI star */}
  <g transform="translate(600,92) rotate(10) scale(1.08)"><circle r="120" fill="url(#starGlow)"/>
<path d="M0.0,-66.0 Q8.6,-8.6 66.0,0.0 Q8.6,8.6 0.0,66.0 Q-8.6,8.6 -66.0,0.0 Q-8.6,-8.6 0.0,-66.0 Z" fill="url(#starFill)"/>
<g clipPath="url(#starClip)"><g stroke="#5e9a1e" strokeWidth="2.2" opacity=".55" filter="url(#wobble)"><g clipPath="url(#lowerRight)"><line x1="-40" y1="-80" x2="-100" y2="80" /><line x1="-33" y1="-80" x2="-93" y2="80" /><line x1="-26" y1="-80" x2="-86" y2="80" /><line x1="-19" y1="-80" x2="-79" y2="80" /><line x1="-12" y1="-80" x2="-72" y2="80" /><line x1="-5" y1="-80" x2="-65" y2="80" /><line x1="2" y1="-80" x2="-58" y2="80" /><line x1="9" y1="-80" x2="-51" y2="80" /><line x1="16" y1="-80" x2="-44" y2="80" /><line x1="23" y1="-80" x2="-37" y2="80" /><line x1="30" y1="-80" x2="-30" y2="80" /><line x1="37" y1="-80" x2="-23" y2="80" /><line x1="44" y1="-80" x2="-16" y2="80" /><line x1="51" y1="-80" x2="-9" y2="80" /><line x1="58" y1="-80" x2="-2" y2="80" /><line x1="65" y1="-80" x2="5" y2="80" /><line x1="72" y1="-80" x2="12" y2="80" /><line x1="79" y1="-80" x2="19" y2="80" /><line x1="86" y1="-80" x2="26" y2="80" /><line x1="93" y1="-80" x2="33" y2="80" /><line x1="100" y1="-80" x2="40" y2="80" /><line x1="107" y1="-80" x2="47" y2="80" /><line x1="114" y1="-80" x2="54" y2="80" /></g></g></g>
<path d="M-9.0,-35.0 Q-5.2,-14.8 15.0,-11.0 Q-5.2,-7.2 -9.0,13.0 Q-12.8,-7.2 -33.0,-11.0 Q-12.8,-14.8 -9.0,-35.0 Z" fill="#f2ffd9" opacity=".9"/>
<path d="M-6,-58 Q-3,-14 -52,-4" fill="none" stroke="#f6ffe6" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
<path d="M0.0,-66.0 Q8.6,-8.6 66.0,0.0 Q8.6,8.6 0.0,66.0 Q-8.6,8.6 -66.0,0.0 Q-8.6,-8.6 0.0,-66.0 Z" fill="none" stroke="#0f1218" strokeWidth="3.4" strokeLinejoin="round" filter="url(#wobble)"/></g>
  <g filter="url(#wobble)">
    <path d="M700.0,15.0 Q702.2,27.8 715.0,30.0 Q702.2,32.2 700.0,45.0 Q697.8,32.2 685.0,30.0 Q697.8,27.8 700.0,15.0 Z" fill="#adee5e" stroke="#0f1218" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M512.0,17.0 Q513.4,24.6 521.0,26.0 Q513.4,27.4 512.0,35.0 Q510.6,27.4 503.0,26.0 Q510.6,24.6 512.0,17.0 Z" fill="#adee5e" stroke="#0f1218" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M694.0,162.0 Q695.2,168.8 702.0,170.0 Q695.2,171.2 694.0,178.0 Q692.8,171.2 686.0,170.0 Q692.8,168.8 694.0,162.0 Z" fill="#f2ffd9" stroke="#0f1218" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M664,46 q10,-10 22,-12" fill="none" stroke="#adee5e" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M536,54 q-12,-4 -18,-14" fill="none" stroke="#adee5e" strokeWidth="2.4" strokeLinecap="round"/>
  </g>

  {/* credits: five emeralds */}
  <ellipse cx="752" cy="322" rx="20" ry="4" fill="#0b2a1f" opacity=".0"/>
<g transform="translate(752,290)" filter="url(#paint)"><polygon points="14.3,12.4 18.9,4.0 13.8,13.7" fill="#03261c" stroke="#076544" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.9,-6.4 14.5,-7.7 18.9,4.0" fill="#05422e" stroke="#0b8658" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.3,12.4 13.8,13.7 8.7,23.4" fill="#054f36" stroke="#0d9462" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="13.2,2.7 14.3,12.4 18.9,4.0" fill="#03261c" stroke="#055338" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.9,-6.4 10.2,-19.4 14.5,-7.7" fill="#03261c" stroke="#06593c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="13.2,2.7 18.9,4.0 14.9,-6.4" fill="#043f2c" stroke="#0b8256" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.2,12.4 8.7,23.4 14.3,12.4" fill="#05432e" stroke="#0b8659" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.5,19.2 8.7,23.4 -0.7,21.4" fill="#03261c" stroke="#054d35" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.2,12.4 1.5,19.2 8.7,23.4" fill="#03261c" stroke="#065d3e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,-9.0 14.9,-6.4 10.2,-19.4" fill="#03261c" stroke="#076543" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="13.2,2.7 8.2,12.4 14.3,12.4" fill="#043c2a" stroke="#0a7f54" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,-9.0 13.2,2.7 14.9,-6.4" fill="#054c34" stroke="#0c9160" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.8,-18.4 0.7,-21.4 10.2,-19.4" fill="#09764f" stroke="#1bb97d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.5,19.2 -0.7,21.4 -10.2,19.4" fill="#055137" stroke="#0d9764" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,-9.0 10.2,-19.4 2.8,-18.4" fill="#055137" stroke="#0d9663" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,1.8 13.2,2.7 8.2,12.4" fill="#09744d" stroke="#1ab77c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.5,-4.5 13.2,2.7 8.9,1.8" fill="#1bba7e" stroke="#086e4a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,1.8 8.2,12.4 6.2,7.0" fill="#17b177" stroke="#076443" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.5,-4.5 8.9,-9.0 13.2,2.7" fill="#09724c" stroke="#19b67a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.2,12.4 -1.3,10.4 1.5,19.2" fill="#043f2c" stroke="#0b8256" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.2,19.4 -11.1,19.2 -15.4,7.6 -14.5,7.7" fill="#076141" stroke="#12a76f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.3,10.4 -10.2,19.4 1.5,19.2" fill="#043f2c" stroke="#0b8256" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.8,-18.4 -8.7,-23.4 0.7,-21.4" fill="#065c3e" stroke="#10a36c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 8.9,1.8 6.2,7.0" fill="#45e1a5" stroke="#0fa06a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 6.5,-4.5 8.9,1.8" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.2,7.0 8.2,12.4 -1.3,10.4" fill="#086946" stroke="#15ae75" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 6.2,7.0 1.1,6.0" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.4,-5.6 8.9,-9.0 6.5,-4.5" fill="#19b57a" stroke="#086946" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.6,-11.0 8.9,-9.0 2.8,-18.4" fill="#065e3f" stroke="#11a56d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.2,7.0 -1.3,10.4 1.1,6.0" fill="#19b67b" stroke="#086a47" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.6,7.2 -10.2,19.4 -14.5,7.7" fill="#065c3e" stroke="#10a36c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 1.4,-5.6 6.5,-4.5" fill="#45e1a5" stroke="#0fa06a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-13.8,-13.7 -14.7,-13.8 -9.6,-23.5 -8.7,-23.4" fill="#0f9f69" stroke="#34da9b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.3,10.4 -10.6,7.2 -10.2,19.4" fill="#032a1f" stroke="#086946" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.6,-11.0 2.8,-18.4 -8.7,-23.4" fill="#065f40" stroke="#11a56e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.4,-5.6 -0.6,-11.0 8.9,-9.0" fill="#09764f" stroke="#1bb97d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 1.1,6.0 -1.3,-0.4" fill="#45e1a5" stroke="#0fa06a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-14.5,7.7 -15.4,7.6 -19.8,-4.1 -18.9,-4.0" fill="#076141" stroke="#12a76f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,0.7 -1.3,-0.4 1.4,-5.6" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-18.9,-4.0 -19.8,-4.1 -14.7,-13.8 -13.8,-13.7" fill="#0f9f69" stroke="#34da9b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.0,-11.6 -13.8,-13.7 -8.7,-23.4" fill="#e8fff4" stroke="#d1fdea" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.6,7.2 -14.5,7.7 -18.9,-4.0" fill="#0b8357" stroke="#20c486" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.1,6.0 -1.3,10.4 -5.7,-1.3" fill="#086b47" stroke="#16af76" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.3,-0.4 -0.6,-11.0 1.4,-5.6" fill="#13a870" stroke="#46e1a5" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.6,-11.0 -8.7,-23.4 -10.0,-11.6" fill="#13a971" stroke="#48e2a7" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.1,6.0 -5.7,-1.3 -1.3,-0.4" fill="#13a870" stroke="#46e1a6" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.3,10.4 -5.7,-1.3 -10.6,7.2" fill="#076644" stroke="#14ab73" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.0,-11.6 -18.9,-4.0 -13.8,-13.7" fill="#e8fff4" stroke="#7af4c5" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.3,-0.4 -5.7,-1.3 -0.6,-11.0" fill="#097850" stroke="#1bbb7f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.7,-1.3 -18.9,-4.0 -10.6,7.2" fill="#0a7f54" stroke="#1ec183" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.7,-1.3 -0.6,-11.0 -10.0,-11.6" fill="#0c8b5c" stroke="#23cb8b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.7,-1.3 -10.0,-11.6 -18.9,-4.0" fill="#086d49" stroke="#17b177" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-19.8,-4.1 -9.6,-23.5 -8.7,-23.4 10.2,-19.4 14.5,-7.7 18.9,4.0 13.8,13.7 8.7,23.4 7.8,23.2 -1.6,21.2 -11.1,19.2 -15.4,7.6" fill="none" stroke="#06150f" strokeWidth="1.60" strokeLinejoin="round"/>
<path d="M-3.4,-8.3 Q-2.7,-4.6 1.0,-3.8 Q-2.7,-3.1 -3.4,0.6 Q-4.1,-3.1 -7.9,-3.8 Q-4.1,-4.6 -3.4,-8.3 Z" fill="#f4fff9"/></g>
<ellipse cx="790" cy="397" rx="15" ry="3" fill="#0b2a1f" opacity=".0"/>
<g transform="translate(790,372)" filter="url(#paint)"><polygon points="11.2,-7.9 11.0,-8.5 14.2,-1.1" fill="#04402c" stroke="#0b8357" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="11.2,-7.9 7.8,-16.0 11.0,-8.5" fill="#03261c" stroke="#055338" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="10.5,5.6 14.2,-1.1 10.3,6.9" fill="#03261c" stroke="#065539" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.8,-1.3 14.2,-1.1 11.2,-7.9" fill="#04412d" stroke="#0b8457" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.2,-14.0 0.7,-15.4 7.8,-16.0" fill="#22c889" stroke="#0a8055" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.6,-8.7 11.2,-7.9 7.8,-16.0" fill="#03281d" stroke="#076745" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.8,-1.3 10.5,5.6 14.2,-1.1" fill="#03261c" stroke="#065a3d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="10.5,5.6 10.3,6.9 6.3,14.9" fill="#054731" stroke="#0c8b5c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.6,-8.7 7.8,-16.0 2.2,-14.0" fill="#086b48" stroke="#16b076" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.2,-14.0 -6.3,-14.9 0.7,-15.4" fill="#0d9763" stroke="#27d593" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.6,-8.7 9.8,-1.3 11.2,-7.9" fill="#054d34" stroke="#0d9260" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.3,14.9 5.7,15.1 -1.4,15.6 -0.7,15.4" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="5.9,6.7 6.3,14.9 10.5,5.6" fill="#05412d" stroke="#0b8558" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.8,-1.3 5.9,6.7 10.5,5.6" fill="#043f2c" stroke="#0b8256" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.8,-5.1 6.6,-8.7 9.8,-1.3" fill="#09764f" stroke="#1bb97d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.3,-6.9 -10.9,-6.7 -7.0,-14.7 -6.3,-14.9" fill="#0e9f69" stroke="#34da9b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.9,13.1 6.3,14.9 -0.7,15.4" fill="#03261c" stroke="#076443" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.8,-5.1 9.8,-1.3 6.5,-1.0" fill="#1dbe81" stroke="#09734d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.5,-8.2 2.2,-14.0 -6.3,-14.9" fill="#0e9e68" stroke="#33da9a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.5,-8.2 6.6,-8.7 2.2,-14.0" fill="#0b895a" stroke="#22c98a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.5,-1.0 9.8,-1.3 5.9,6.7" fill="#09754e" stroke="#1ab87d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="5.9,6.7 0.9,13.1 6.3,14.9" fill="#03261c" stroke="#065439" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.0,-4.8 6.6,-8.7 4.8,-5.1" fill="#1ec184" stroke="#09774f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 4.8,-5.1 6.5,-1.0" fill="#53e6ad" stroke="#12a76f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.5,-1.0 5.9,6.7 4.4,3.3" fill="#1dbf82" stroke="#09754e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.5,-6.5 -10.3,-6.9 -6.3,-14.9" fill="#e8fff4" stroke="#4ce3aa" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.7,15.4 -1.4,15.6 -8.5,16.1 -7.8,16.0" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.0,-4.8 -0.5,-8.2 6.6,-8.7" fill="#09724c" stroke="#19b67b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 6.5,-1.0 4.4,3.3" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 1.0,-4.8 4.8,-5.1" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.5,-8.2 -6.3,-14.9 -7.5,-6.5" fill="#25cf8f" stroke="#0b875a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.9,13.1 -0.7,15.4 -7.8,16.0" fill="#055036" stroke="#0d9663" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 4.4,3.3 0.6,3.6" fill="#53e6ad" stroke="#12a76f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-14.2,1.1 -14.8,1.2 -10.9,-6.7 -10.3,-6.9" fill="#0e9f69" stroke="#34da9b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 -1.1,-0.5 1.0,-4.8" fill="#53e6ad" stroke="#12a76f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.4,3.3 5.9,6.7 -1.2,7.2" fill="#0b8759" stroke="#21c788" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.1,-0.5 -0.5,-8.2 1.0,-4.8" fill="#1ebf82" stroke="#09754e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="5.9,6.7 -1.2,7.2 0.9,13.1" fill="#043c2a" stroke="#0a7f54" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.7,-0.8 0.6,3.6 -1.1,-0.5" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.5,-6.5 -14.2,1.1 -10.3,-6.9" fill="#85f6ca" stroke="#1dbf82" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.8,16.0 -8.5,16.1 -11.6,8.7 -11.0,8.5" fill="#076845" stroke="#15ad74" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.4,3.3 -1.2,7.2 0.6,3.6" fill="#1cbc80" stroke="#09714b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.2,7.2 -7.8,16.0 0.9,13.1" fill="#04402c" stroke="#0b8357" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-11.0,8.5 -11.6,8.7 -14.8,1.2 -14.2,1.1" fill="#076845" stroke="#15ad74" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-4.4,-0.2 -0.5,-8.2 -7.5,-6.5" fill="#17b177" stroke="#076443" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.1,-0.5 -4.4,-0.2 -0.5,-8.2" fill="#0a7d53" stroke="#1dbf82" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.6,3.6 -4.4,-0.2 -1.1,-0.5" fill="#1ec184" stroke="#09774f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-8.1,7.0 -7.8,16.0 -11.0,8.5" fill="#076544" stroke="#14ab72" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-4.4,-0.2 -7.5,-6.5 -14.2,1.1" fill="#0e9e68" stroke="#32da9a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.6,3.6 -1.2,7.2 -4.4,-0.2" fill="#0b8659" stroke="#21c688" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.2,7.2 -8.1,7.0 -7.8,16.0" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-8.1,7.0 -11.0,8.5 -14.2,1.1" fill="#13a870" stroke="#46e1a6" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-4.4,-0.2 -14.2,1.1 -8.1,7.0" fill="#19b67b" stroke="#086a47" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.2,7.2 -4.4,-0.2 -8.1,7.0" fill="#0a7951" stroke="#1cbc7f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-14.8,1.2 -7.0,-14.7 -6.3,-14.9 7.8,-16.0 14.2,-1.1 6.3,14.9 5.7,15.1 -8.5,16.1" fill="none" stroke="#06150f" strokeWidth="1.60" strokeLinejoin="round"/>
<path d="M1.8,-11.0 Q2.3,-8.3 5.0,-7.7 Q2.3,-7.2 1.8,-4.5 Q1.3,-7.2 -1.4,-7.7 Q1.3,-8.3 1.8,-11.0 Z" fill="#f4fff9"/></g>
<ellipse cx="580" cy="430" rx="17" ry="3" fill="#0b2a1f" opacity=".0"/>
<g transform="translate(580,402)" filter="url(#paint)"><polygon points="1.0,-16.3 -0.7,-17.5 7.6,-18.5" fill="#33da9a" stroke="#0d9663" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="12.8,5.5 16.5,-1.9 12.7,7.3" fill="#03261c" stroke="#06583c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.7,-10.9 12.2,-9.9 7.6,-18.5" fill="#032e21" stroke="#086e49" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="11.1,-2.6 16.5,-1.9 12.2,-9.9" fill="#043e2b" stroke="#0a8155" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.7,-10.9 7.6,-18.5 1.0,-16.3" fill="#097850" stroke="#1bbb7f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="11.1,-2.6 12.8,5.5 16.5,-1.9" fill="#03261c" stroke="#065d3f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.0,-16.3 -8.9,-16.6 -0.7,-17.5" fill="#0e9d67" stroke="#30d999" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="12.8,5.5 12.7,7.3 8.9,16.6" fill="#054832" stroke="#0c8d5d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="6.7,-10.9 11.1,-2.6 12.2,-9.9" fill="#04402c" stroke="#0b8357" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-12.7,-7.3 -13.4,-6.9 -9.6,-16.2 -8.9,-16.6" fill="#0e9d67" stroke="#30d999" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.6,-10.0 1.0,-16.3 -8.9,-16.6" fill="#18b378" stroke="#076645" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.6,-10.0 6.7,-10.9 1.0,-16.3" fill="#0c8b5c" stroke="#23cb8b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.9,-6.7 6.7,-10.9 11.1,-2.6" fill="#0a7c52" stroke="#1dbe81" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="7.3,6.6 8.9,16.6 12.8,5.5" fill="#054731" stroke="#0c8c5c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="8.9,16.6 8.2,16.9 -0.0,17.9 0.7,17.5" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="11.1,-2.6 7.3,6.6 12.8,5.5" fill="#05412d" stroke="#0b8458" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="4.9,-6.7 11.1,-2.6 7.3,-2.2" fill="#23cc8c" stroke="#0b8457" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.5,-6.2 6.7,-10.9 4.9,-6.7" fill="#1ab87c" stroke="#086c48" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="7.3,-2.2 11.1,-2.6 7.3,6.6" fill="#0a7d53" stroke="#1dbf82" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-9.5,-7.4 -12.7,-7.3 -8.9,-16.6" fill="#e8fff4" stroke="#69eeba" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.6,-10.0 -8.9,-16.6 -9.5,-7.4" fill="#4ce3a9" stroke="#11a46c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.5,-6.2 -1.6,-10.0 6.7,-10.9" fill="#0b8659" stroke="#21c788" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 4.9,-6.7 7.3,-2.2" fill="#5de9b3" stroke="#15ac73" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.2,14.4 8.9,16.6 0.7,17.5" fill="#03261c" stroke="#065439" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="7.3,6.6 2.2,14.4 8.9,16.6" fill="#03261c" stroke="#065338" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 0.5,-6.2 4.9,-6.7" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 7.3,-2.2 5.3,2.8" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="7.3,-2.2 7.3,6.6 5.3,2.8" fill="#24cd8d" stroke="#0b8558" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-16.5,1.9 -17.1,2.3 -13.4,-6.9 -12.7,-7.3" fill="#0e9d67" stroke="#30d999" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.6,-1.2 -1.6,-10.0 0.5,-6.2" fill="#20c486" stroke="#0a7b52" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.7,17.5 -0.0,17.9 -8.3,18.8 -7.6,18.5" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 -1.6,-1.2 0.5,-6.2" fill="#5de9b3" stroke="#15ac73" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 5.3,2.8 0.8,3.3" fill="#5de9b3" stroke="#15ac73" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-9.5,-7.4 -16.5,1.9 -12.7,-7.3" fill="#94f8d0" stroke="#20c486" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.2,14.4 0.7,17.5 -7.6,18.5" fill="#054630" stroke="#0c8a5b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.9,-1.7 0.8,3.3 -1.6,-1.2" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="5.3,2.8 7.3,6.6 -0.9,7.5" fill="#0a7b52" stroke="#1dbd81" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.4,-0.7 -1.6,-10.0 -9.5,-7.4" fill="#1ec183" stroke="#09774f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-1.6,-1.2 -5.4,-0.7 -1.6,-10.0" fill="#0a8155" stroke="#1fc284" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="7.3,6.6 -0.9,7.5 2.2,14.4" fill="#043e2b" stroke="#0a8156" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="5.3,2.8 -0.9,7.5 0.8,3.3" fill="#22c889" stroke="#0a8055" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-12.0,10.2 -12.7,10.6 -17.1,2.3 -16.5,1.9" fill="#076544" stroke="#14aa72" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.6,18.5 -8.3,18.8 -12.7,10.6 -12.0,10.2" fill="#076544" stroke="#14aa72" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.4,-0.7 -9.5,-7.4 -16.5,1.9" fill="#20c587" stroke="#0a7c52" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.8,3.3 -5.4,-0.7 -1.6,-1.2" fill="#1dbd81" stroke="#09734c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.9,7.5 -7.6,18.5 2.2,14.4" fill="#043f2c" stroke="#0b8156" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.8,3.3 -0.9,7.5 -5.4,-0.7" fill="#0c905f" stroke="#25cf8e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-8.9,8.0 -12.0,10.2 -16.5,1.9" fill="#13aa71" stroke="#49e2a8" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-8.9,8.0 -7.6,18.5 -12.0,10.2" fill="#076846" stroke="#15ad74" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-5.4,-0.7 -16.5,1.9 -8.9,8.0" fill="#24ce8e" stroke="#0b8659" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.9,7.5 -8.9,8.0 -7.6,18.5" fill="#032e21" stroke="#086f4a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.9,7.5 -5.4,-0.7 -8.9,8.0" fill="#0a7a51" stroke="#1cbd80" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-17.1,2.3 -13.4,-6.9 -9.6,-16.2 -8.9,-16.6 7.6,-18.4 12.0,-10.2 16.5,-1.9 12.7,7.3 8.9,16.6 8.2,16.9 -8.2,18.9" fill="none" stroke="#06150f" strokeWidth="1.60" strokeLinejoin="round"/>
<path d="M1.1,-13.3 Q1.7,-10.1 4.8,-9.6 Q1.7,-9.0 1.1,-5.8 Q0.5,-9.0 -2.6,-9.6 Q0.5,-10.1 1.1,-13.3 Z" fill="#f4fff9"/></g>
<ellipse cx="720" cy="432" rx="27" ry="6" fill="#0b2a1f" opacity=".0"/>
<g transform="translate(720,392)" filter="url(#paint)"><polygon points="-3.5,24.7 -1.7,25.9 -14.8,20.7" fill="#054731" stroke="#0c8c5c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.5,24.7 11.5,31.1 -1.7,25.9" fill="#03261c" stroke="#054e35" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-11.0,13.8 -14.8,20.7 -3.5,24.7" fill="#055137" stroke="#0d9663" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-11.0,13.8 -20.1,6.4 -14.8,20.7" fill="#05442f" stroke="#0b875a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="18.9,20.8 19.7,20.0 12.3,30.3 11.5,31.1" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.1,19.0 -3.5,24.7 11.5,31.1" fill="#03261c" stroke="#055238" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-16.8,-1.8 -26.3,-10.4 -20.1,6.4" fill="#1dbf82" stroke="#09744d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.5,20.2 18.9,20.8 11.5,31.1" fill="#04402c" stroke="#0b8357" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-18.6,-16.3 -26.3,-10.4 -18.9,-20.8" fill="#84f6ca" stroke="#1dbf82" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.1,19.0 11.5,31.1 14.5,20.2" fill="#054c34" stroke="#0c9160" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="2.1,19.0 -11.0,13.8 -3.5,24.7" fill="#054832" stroke="#0c8d5d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-11.0,13.8 -16.8,-1.8 -20.1,6.4" fill="#0d9764" stroke="#28d593" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-16.8,-1.8 -18.6,-16.3 -26.3,-10.4" fill="#1cbd80" stroke="#09724c" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="26.3,10.4 27.1,9.6 19.7,20.0 18.9,20.8" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.5,20.2 26.3,10.4 18.9,20.8" fill="#03261c" stroke="#065c3e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.6,9.0 -11.0,13.8 -16.8,-1.8" fill="#0c8e5e" stroke="#24cd8d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-18.6,-16.3 -18.9,-20.8 -11.5,-31.1" fill="#e8fff4" stroke="#4be3a9" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.5,11.9 -11.0,13.8 -7.6,9.0" fill="#24cd8d" stroke="#0b8558" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.5,11.9 2.1,19.0 -11.0,13.8" fill="#0b8256" stroke="#1fc385" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-7.6,9.0 -16.8,-1.8 -10.7,0.6" fill="#27d493" stroke="#0c8e5e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 -0.5,11.9 -7.6,9.0" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 -7.6,9.0 -10.7,0.6" fill="#6cefbc" stroke="#18b479" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.5,8.7 2.1,19.0 14.5,20.2" fill="#06553a" stroke="#0e9c66" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="20.5,-5.1 21.4,-5.9 27.1,9.6 26.3,10.4" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.5,6.3 2.1,19.0 -0.5,11.9" fill="#1ec184" stroke="#09774f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.5,8.7 14.5,20.2 26.3,10.4" fill="#03281d" stroke="#076645" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-16.8,-1.8 -9.4,-12.1 -18.6,-16.3" fill="#26d190" stroke="#0c8a5b" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-11.5,-31.1 -10.6,-31.9 2.5,-26.7 1.7,-25.9" fill="#086f4a" stroke="#18b378" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.7,0.6 -16.8,-1.8 -9.4,-12.1" fill="#0d9462" stroke="#26d391" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-9.4,-12.1 -11.5,-31.1 -18.6,-16.3" fill="#b8fbe0" stroke="#25d08f" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 3.5,6.3 -0.5,11.9" fill="#6cefbc" stroke="#18b479" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 -10.7,0.6 -6.7,-5.0" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.5,6.3 9.5,8.7 2.1,19.0" fill="#0d9562" stroke="#27d392" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-10.7,0.6 -9.4,-12.1 -6.7,-5.0" fill="#23cb8b" stroke="#0b8357" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="16.0,-2.5 20.5,-5.1 26.3,10.4" fill="#055036" stroke="#0d9663" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 0.4,-2.1 3.5,6.3" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-3.6,3.4 -6.7,-5.0 0.4,-2.1" fill="#6cefbc" stroke="#18b479" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.6,-20.8 -11.5,-31.1 1.7,-25.9" fill="#13a870" stroke="#46e1a6" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="9.5,8.7 26.3,10.4 16.0,-2.5" fill="#05442f" stroke="#0b885a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="14.8,-20.7 15.6,-21.5 21.4,-5.9 20.5,-5.1" fill="#043525" stroke="#09764e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="1.7,-25.9 2.5,-26.7 15.6,-21.5 14.8,-20.7" fill="#086f4a" stroke="#18b378" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-9.4,-12.1 -0.6,-20.8 -11.5,-31.1" fill="#42e0a4" stroke="#0e9f69" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.4,-2.1 9.5,8.7 3.5,6.3" fill="#25cf8f" stroke="#0b885a" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="16.0,-2.5 14.8,-20.7 20.5,-5.1" fill="#03261c" stroke="#054f36" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-0.6,-20.8 1.7,-25.9 14.8,-20.7" fill="#22ca8b" stroke="#0b8156" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-6.7,-5.0 -9.4,-12.1 3.8,-6.9" fill="#0c8e5e" stroke="#24cd8d" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-6.7,-5.0 3.8,-6.9 0.4,-2.1" fill="#24ce8d" stroke="#0b8659" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="0.4,-2.1 3.8,-6.9 9.5,8.7" fill="#0c905f" stroke="#25cf8e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,-6.9 9.5,8.7 16.0,-2.5" fill="#086a47" stroke="#16ae75" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-9.4,-12.1 3.8,-6.9 -0.6,-20.8" fill="#1ec082" stroke="#09754e" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,-6.9 16.0,-2.5 14.8,-20.7" fill="#043a28" stroke="#0a7c52" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="3.8,-6.9 14.8,-20.7 -0.6,-20.8" fill="#0d9864" stroke="#28d694" strokeWidth="0.50" strokeLinejoin="round"/>
<polygon points="-26.3,-10.4 -11.5,-31.1 -10.6,-31.9 2.5,-26.7 15.7,-21.5 21.4,-5.9 27.1,9.6 12.3,30.3 11.5,31.1 -14.8,20.7 -20.1,6.5" fill="none" stroke="#06150f" strokeWidth="1.60" strokeLinejoin="round"/>
<path d="M-13.6,-10.1 Q-12.7,-5.2 -7.8,-4.3 Q-12.7,-3.3 -13.6,1.5 Q-14.5,-3.3 -19.4,-4.3 Q-14.5,-5.2 -13.6,-10.1 Z" fill="#f4fff9"/></g>
<ellipse cx="650" cy="412" rx="46" ry="10" fill="#0b2a1f" opacity=".0"/>
<g transform="translate(650,348)" filter="url(#paint)"><polygon points="-3.9,-41.9 -25.5,-35.7 -2.0,-43.1" fill="#29d694" stroke="#0c905f" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.9,-41.9 -2.0,-43.1 21.5,-50.5" fill="#67edb9" stroke="#17b177" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-34.0,-13.2 -36.3,-10.4 -25.5,-35.7" fill="#b3fade" stroke="#24ce8e" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-16.5,-25.1 -3.9,-41.9 -25.5,-35.7" fill="#77f3c3" stroke="#1bb97d" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="28.0,-32.8 21.5,-50.5 34.3,-32.7" fill="#03261c" stroke="#066040" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-16.5,-25.1 -25.5,-35.7 -34.0,-13.2" fill="#e8fff4" stroke="#61ebb6" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="7.0,-32.5 21.5,-50.5 -3.9,-41.9" fill="#57e7b0" stroke="#13a971" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-34.0,-13.2 -47.1,14.9 -36.3,-10.4" fill="#5be9b2" stroke="#14ab72" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="7.0,-32.5 28.0,-32.8 21.5,-50.5" fill="#12a66e" stroke="#42dfa3" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-34.3,32.7 -33.4,34.4 -46.2,16.5 -47.1,14.9" fill="#054c34" stroke="#0c9160" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="28.0,-32.8 34.3,-32.7 47.1,-14.9" fill="#054d34" stroke="#0d9260" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-16.5,-25.1 7.0,-32.5 -3.9,-41.9" fill="#a3f9d7" stroke="#22c98a" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-27.3,0.2 -34.0,-13.2 -47.1,14.9" fill="#87f7cb" stroke="#1ec083" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-27.3,0.2 -16.5,-25.1 -34.0,-13.2" fill="#e8fff4" stroke="#5eeab4" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-32.2,24.6 -34.3,32.7 -47.1,14.9" fill="#19b67b" stroke="#086a47" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-10.6,-16.9 -16.5,-25.1 7.0,-32.5" fill="#18b379" stroke="#076745" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="47.1,-14.9 47.9,-13.2 37.2,12.1 36.3,10.4" fill="#043525" stroke="#09764e" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-27.3,0.2 -47.1,14.9 -32.2,24.6" fill="#8af7cc" stroke="#1ec183" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="19.8,-14.7 47.1,-14.9 28.0,-32.8" fill="#0b8457" stroke="#20c586" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-10.6,-16.9 7.0,-32.5 2.1,-20.9" fill="#5eeab4" stroke="#15ad74" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="7.0,-32.5 19.8,-14.7 28.0,-32.8" fill="#1cbc7f" stroke="#08714b" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-16.4,-3.3 -16.5,-25.1 -10.6,-16.9" fill="#5eeab4" stroke="#15ad74" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-16.4,-3.3 -27.3,0.2 -16.5,-25.1" fill="#15ae75" stroke="#076141" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-21.5,50.5 -20.7,52.2 -33.4,34.4 -34.3,32.7" fill="#054c34" stroke="#0c9160" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="2.1,-20.9 7.0,-32.5 19.8,-14.7" fill="#10a26b" stroke="#3add9f" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 -10.6,-16.9 2.1,-20.9" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 -16.4,-3.3 -10.6,-16.9" fill="#9af8d3" stroke="#21c688" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="29.7,5.0 47.1,-14.9 36.3,10.4" fill="#03261c" stroke="#076342" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-32.2,24.6 -21.5,50.5 -34.3,32.7" fill="#0d9260" stroke="#26d190" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 2.1,-20.9 9.0,-11.3" fill="#9af8d3" stroke="#21c688" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="19.8,-14.7 29.7,5.0 47.1,-14.9" fill="#054b33" stroke="#0c905f" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="2.1,-20.9 19.8,-14.7 9.0,-11.3" fill="#4ee4aa" stroke="#11a56d" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-9.6,6.4 -27.3,0.2 -16.4,-3.3" fill="#58e8b0" stroke="#13aa71" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="36.3,10.4 37.2,12.1 26.4,37.4 25.5,35.7" fill="#043525" stroke="#09764e" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 -9.6,6.4 -16.4,-3.3" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-14.5,18.0 -27.3,0.2 -32.2,24.6" fill="#a7f9d8" stroke="#23ca8b" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 9.0,-11.3 3.2,2.4" fill="#d2fdeb" stroke="#2dd897" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="2.0,43.1 2.9,44.8 -20.7,52.2 -21.5,50.5" fill="#043525" stroke="#09764e" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-3.7,-7.3 3.2,2.4 -9.6,6.4" fill="#9af8d3" stroke="#21c688" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="29.7,5.0 36.3,10.4 25.5,35.7" fill="#054831" stroke="#0c8c5d" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-9.6,6.4 -14.5,18.0 -27.3,0.2" fill="#0e9e68" stroke="#32da9a" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-14.5,18.0 -32.2,24.6 -21.5,50.5" fill="#0d9361" stroke="#26d190" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="25.5,35.7 26.4,37.4 2.9,44.8 2.0,43.1" fill="#043525" stroke="#09764e" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="9.0,-11.3 19.8,-14.7 9.0,10.6" fill="#17b177" stroke="#076443" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="9.0,-11.3 9.0,10.6 3.2,2.4" fill="#40dfa2" stroke="#0e9e68" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="19.8,-14.7 9.0,10.6 29.7,5.0" fill="#0b8256" stroke="#1fc385" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-0.4,33.7 2.0,43.1 -21.5,50.5" fill="#054d34" stroke="#0d9260" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="3.2,2.4 -14.5,18.0 -9.6,6.4" fill="#3add9f" stroke="#0e9a66" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-14.5,18.0 -21.5,50.5 -0.4,33.7" fill="#11a56e" stroke="#40dfa2" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="9.0,10.6 25.5,35.7 29.7,5.0" fill="#076141" stroke="#12a86f" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-0.4,33.7 25.5,35.7 2.0,43.1" fill="#03261c" stroke="#066041" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="3.2,2.4 9.0,10.6 -14.5,18.0" fill="#15ac73" stroke="#065e3f" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="9.0,10.6 -0.4,33.7 25.5,35.7" fill="#054530" stroke="#0c895b" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="9.0,10.6 -14.5,18.0 -0.4,33.7" fill="#13a870" stroke="#47e1a6" strokeWidth="0.83" strokeLinejoin="round"/>
<polygon points="-47.1,14.8 -25.5,-35.7 21.5,-50.5 34.3,-32.7 47.1,-14.8 47.9,-13.2 37.2,12.1 26.4,37.4 -20.7,52.2 -33.4,34.4 -46.2,16.6" fill="none" stroke="#06150f" strokeWidth="2.64" strokeLinejoin="round"/>
<path d="M-8.8,-35.6 Q-7.2,-27.3 1.1,-25.7 Q-7.2,-24.1 -8.8,-15.9 Q-10.4,-24.1 -18.7,-25.7 Q-10.4,-27.3 -8.8,-35.6 Z" fill="#f4fff9"/></g>
</svg>
  );
});
