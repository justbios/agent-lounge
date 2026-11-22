import { Sprite } from "../Sprite";

const ROWS = ["a.a.a", "aaaaa", "bbbbb"] as const;
const COLORS = { a: "#ffc456", b: "#c98a1e" };

/** A small pixel crown for whoever won. */
export default function Crown({ className = "mt-crown" }: { className?: string }) {
  return <Sprite rows={ROWS} palette={COLORS} className={className} />;
}
