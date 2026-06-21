import React from 'react';

const TOKEN_DOMAINS: Record<string, string> = {
    'BNB': 'binance.com',
    'ETH': 'ethereum.org',
    'XRP': 'ripple.com',
    'DOGE': 'dogecoin.com',
    'ADA': 'cardano.org',
    'LINK': 'chain.link',
    'AVAX': 'avax.network',
    'DOT': 'polkadot.network',
    'UNI': 'uniswap.org',
    'CAKE': 'pancakeswap.finance',
    'DEXE': 'dexe.network',
    'ACH': 'alchemytech.io',
    'ELF': 'aelf.com',
    'DUSK': 'dusk.network',
    'PENDLE': 'pendle.finance',
    'TON': 'ton.org',
}

export function TokenLogo({ symbol, className = "w-5 h-5 rounded-full border-[1.5px] border-[#1C293C] bg-white" }: { symbol: string, className?: string }) {
    const domain = TOKEN_DOMAINS[symbol.toUpperCase()] || `${symbol.toLowerCase()}.org`;
    return (
        <img 
            src={`https://img.logo.dev/${domain}?token=pk_BShsdiwDTuyRVVBW5GadOg&retina=true&size=60`} 
            alt={symbol} 
            className={className}
            onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FDC800" stroke="%231C293C" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
            }}
        />
    )
}
