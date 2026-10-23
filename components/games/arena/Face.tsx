import { seedOf } from "@/lib/arena/rng";
import type { Fighter } from "@/lib/arena/types";
import { portrait } from "./portraits";

/** A squad agent's face in the menu, the same one it has in battle; three.js comes with it, so it loads on its own. */
export default function Face({ f }: { f: Pick<Fighter, "body" | "color" | "name"> }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="arena-face" src={portrait(f.body, f.color, seedOf(f.name))} alt="" />;
}
