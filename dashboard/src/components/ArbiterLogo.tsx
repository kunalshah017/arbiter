import React from 'react';

export function ArbiterLogo({ className = '' }) {
  return (
    <svg 
      className={`w-8 h-8 border-[2.5px] border-[#1C293C] rounded bg-[#FDC800] shadow-[2px_2px_0px_#1C293C] ${className}`}
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M 50 15 L 20 85 L 35 85 L 42 65 L 58 65 L 65 85 L 80 85 L 50 15 Z" 
        fill="#1C293C" 
      />
      <path 
        d="M 50 35 L 45 50 L 55 50 Z" 
        fill="#FDC800" 
      />
      <rect 
        x="65" 
        y="15" 
        width="20" 
        height="20" 
        fill="#432DD7" 
        stroke="#1C293C" 
        strokeWidth="3" 
      />
    </svg>
  )
}
