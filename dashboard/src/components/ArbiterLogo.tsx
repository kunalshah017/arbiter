import React from 'react';
import logoUrl from '../assets/arbiter-logo.png';

export function ArbiterLogo({ className = '' }) {
  return (
    <img
      src={logoUrl}
      alt="Arbiter Logo"
      className={`w-10 h-10 object-cover border-[2.5px] border-[#1C293C] rounded shadow-[2px_2px_0px_#1C293C] ${className}`}
    />
  )
}
