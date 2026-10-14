"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function Code({ text, wrap }: { text: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={wrap ? "codeblock wrap" : "codeblock"}>
      <button
        className="copybtn"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "скопійовано" : "копіювати"}
      </button>
      <pre>{text}</pre>
    </div>
  );
}
