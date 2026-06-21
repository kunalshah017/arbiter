import React from 'react';

export function ArbiterLogo({ className = '' }) {
  return (
    <svg 
      className={`w-10 h-10 border-[2.5px] border-[#1C293C] rounded bg-[#FDC800] shadow-[2px_2px_0px_#1C293C] ${className}`}
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background grid - faint */}
      <path d="M 0 50 L 100 50 M 50 0 L 50 100" stroke="#1C293C" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="4 4" />
      
      {/* Ascending Chart Line forming A peak */}
      <path 
        d="M 15 85 L 50 20 L 75 60 L 95 40" 
        stroke="#1C293C" 
        strokeWidth="10"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      
      {/* A Crossbar (Resistance flip to support) */}
      <path 
        d="M 32 55 L 68 55" 
        stroke="#432DD7" 
        strokeWidth="10"
        strokeLinecap="square"
      />

      {/* Upward Arrow on the final peak */}
      <path 
        d="M 85 45 L 85 25 L 105 45 Z" 
        fill="#16A34A" 
        stroke="#1C293C" 
        strokeWidth="4" 
        strokeLinejoin="miter"
      />
    </svg>
  )
}
