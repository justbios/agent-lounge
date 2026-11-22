import { notFound } from "next/navigation";
import Lab from "@/components/lab/Lab";

/**
 * The games' lab, for development only: one game on the whole window, straight into a match against an agent, to
 * look at and to drive from Playwright. docs/lab.md has the addresses. A production build answers 404 here.
 */
export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (k: string) => {
    const n = Number(one(k));
    return one(k) !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return (
    <Lab
      game={one("game")}
      level={one("level")}
      auto={one("auto") === "1"}
      seed={num("seed")}
      speed={num("speed")}
      clock={num("clock")}
      second={one("side") === "o"}
    />
  );
}
