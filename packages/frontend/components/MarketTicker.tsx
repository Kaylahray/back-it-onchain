"use client";

import { useEffect, useState } from "react";

const MARKETS = ["XLM/USD", "ETH/USD", "BTC/USD", "USDC/USD", "ARB/USD"];

export default function MarketTicker() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [charPos, setCharPos] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const current = MARKETS[idx % MARKETS.length];

    if (!deleting) {
      if (charPos < current.length) {
        timeout = setTimeout(() => {
          setText(current.slice(0, charPos + 1));
          setCharPos((c) => c + 1);
        }, 70);
      } else {
        timeout = setTimeout(() => setDeleting(true), 1000);
      }
    } else {
      if (charPos > 0) {
        timeout = setTimeout(() => {
          setText(current.slice(0, charPos - 1));
          setCharPos((c) => c - 1);
        }, 40);
      } else {
        setDeleting(false);
        setIdx((i) => i + 1);
      }
    }

    return () => clearTimeout(timeout);
  }, [charPos, deleting, idx]);

  return (
    <div className="inline-flex items-center gap-3 text-sm md:text-base text-muted-foreground/90 px-4 py-2 rounded-full bg-background/60 border border-border/40 shadow-sm">
      <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse inline-block" />
      <span className="font-medium">Recent</span>
      <span className="font-mono text-primary ml-2">{text}<span className="opacity-70">█</span></span>
    </div>
  );
}
