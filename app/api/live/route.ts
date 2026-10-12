import { liveEnabled, liveStore, subscribe } from "@/lib/live/store";

export const dynamic = "force-dynamic";

const PING_MS = 15000;

export async function GET(req: Request) {
  if (!liveEnabled()) return new Response(null, { status: 404 });
  const enc = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const write = (chunk: string) => {
        try {
          ctrl.enqueue(enc.encode(chunk));
        } catch {
          stop();
        }
      };
      const send = (name: string, data: unknown) => write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

      send("snapshot", liveStore().events);
      const unsub = subscribe((e) => send("event", e));
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);
      stop = () => {
        unsub();
        clearInterval(ping);
        try {
          ctrl.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
