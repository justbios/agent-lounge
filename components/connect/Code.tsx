"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTr } from "@/lib/i18n";

export default function Code({ text, wrap }: { text: string; wrap?: boolean }) {
  const t = useTr();
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
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t("скопійовано", "copied") : t("копіювати", "copy")}
      </button>
      <pre>{text}</pre>
    </div>
  );
}
