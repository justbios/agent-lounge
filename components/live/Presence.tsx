import { Eye } from "lucide-react";
import { Guest } from "@/lib/live/social";

const SHOWN = 2;

/** Who else has this café open right now; the first three also sit at the bar. */
export default function Presence({ guests }: { guests: Guest[] }) {
  if (!guests.length) return null;
  const names = guests.map((g) => g.name);
  const more = names.length - SHOWN;
  return (
    <span className="presence" title={`зараз тут: ${names.join(", ")}`}>
      <Eye size={13} />
      <span>
        {names.slice(0, SHOWN).join(", ")}
        {more > 0 && ` +${more}`}
      </span>
    </span>
  );
}
