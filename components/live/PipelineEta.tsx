"use client";

import { CSSProperties } from "react";
import { Timer } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { Ui, tr, useTr, useUi } from "@/lib/i18n";
import { Eta, etaText, fmtSpan, toldText, usualText } from "@/lib/live/eta";
import type { LiveScene } from "@/lib/live/liveModel";
import Sheet from "./Sheet";

const ICON = { display: "inline", verticalAlign: "-1px", marginRight: 4 } as const;
const HOUR = 3_600_000;
const FIVE = 300_000;

/** The clock time a guess lands on, over an hour away in fives of minutes, and its day when that is not today. */
function clockAt(at: number, now: number, ui: Ui): { day: string; time: string } {
  const loc = ui === "en" ? "en-GB" : "uk-UA";
  const d = new Date(at - now > HOUR ? Math.round(at / FIVE) * FIVE : at);
  const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return { day: "", time };
  today.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return { day: tr(ui, "завтра", "tomorrow"), time };
  const wd = d.toLocaleDateString(loc, { weekday: "short" });
  return { day: tr(ui, `у ${wd}`, wd), time };
}

/** When the guess lands: "at 18:40", "tomorrow at 06:00", "tomorrow, not before 06:00" when some agent has no guess. */
function landsAt(e: Eta, now: number, ui: Ui): string | null {
  if (e.left == null || e.wrap) return null;
  const { day, time } = clockAt(now + e.left, now, ui);
  const at = e.more ? tr(ui, `не раніше ${time}`, `not before ${time}`) : tr(ui, `о ${time}`, `at ${time}`);
  return day ? `${day}${e.more ? "," : ""} ${at}` : at;
}

/** The stat bar's "pipeline ≈ 2 h 20 min, at 18:40": Claude's guess, the longest of the agents it waits on. */
export function PipelineStat({ eta, now, onOpen }: { eta: Eta | null | undefined; now: number; onOpen: () => void }) {
  const t = useTr();
  const ui = useUi();
  if (!eta) return null;
  const at = landsAt(eta, now, ui);
  return (
    <button
      className="stat stat-btn"
      onClick={onOpen}
      title={
        eta.told
          ? t(
              `коли закінчить пайплайн: ${toldText(eta.told, ui)}; натисни, щоб побачити агентів`,
              `when the pipeline ends: ${toldText(eta.told, ui)}; click for agents`,
            )
          : t("коли закінчить пайплайн; натисни, щоб побачити агентів", "when the pipeline ends; click for agents")
      }
    >
      <span className="stat-k">
        <Timer size={11} style={ICON} />
        {t("пайплайн", "pipeline")}
      </span>
      <span className="stat-v">{(eta.left != null || eta.told) && etaText(eta, ui) || t("невідомо", "unknown")}</span>
      {at && <span className="stat-at">{at}</span>}
    </button>
  );
}

interface Row {
  seat: number;
  eta: Eta;
  elapsed: number;
}

/** What each agent of the pipeline still needs and when it lands, and what the ones already back took. */
export function PipelineSheet({
  scene,
  model,
  etas,
  now,
  onClose,
}: {
  scene: LiveScene;
  model: CafeModel;
  etas: (Eta | null)[];
  now: number;
  onClose: () => void;
}) {
  const t = useTr();
  const ui = useUi();
  const clock = now - scene.origin;
  const all = etas[0];
  const busy: Row[] = etas
    .map((eta, seat) => (seat > 0 && eta ? { seat, eta, elapsed: clock - (scene.runs?.[seat]?.start ?? clock) } : null))
    .filter((r): r is Row => r !== null)
    .sort((a, b) => (b.eta.left ?? -1) - (a.eta.left ?? -1));
  const back = (scene.finished ?? []).filter((f) => f.end >= (scene.turn ?? 0)).reverse();
  const own = all?.todo;
  const at = all && landsAt(all, now, ui);
  const lead = all?.more ? t("Щонайменше", "At least") : t("Ще", "Still");
  const span = all?.left != null && `${lead} ${fmtSpan(all.left, ui)}`;

  const told = all?.told;
  const head = !all
    ? t("Зараз пайплайн не працює", "No pipeline is running now")
    : all.wrap
      ? t("Майже готово", "Wrapping up")
      : !span
        ? told?.over
          ? t("Довше, ніж казав Claude", "Taking longer than Claude said")
          : t("Поки невідомо, коли закінчить", "No guess yet of when it finishes")
        : `${span}${at ? ` — ${at}` : ""}`;
  const longest = all?.waitsOn != null ? model.agents[all.waitsOn].name : null;
  const why = longest && t(`чекає на ${longest}`, `waiting on ${longest}`);
  const unknown = busy.filter((r) => r.eta.left == null).length;
  const progress = told?.total ? Math.round((100 * (told.done ?? 0)) / told.total) : null;

  return (
    <Sheet
      label={t("пайплайн", "pipeline")}
      title={t("Пайплайн", "Pipeline")}
      sub={t("приблизний час", "a rough guess")}
      onClose={onClose}
    >
      <div className="pipe-sum">
        <b>{head}</b>
        <span>
          {[
            told && toldText(told, ui),
            told?.total ? `${told.done ?? 0}/${told.total}` : null,
            told?.now && t(`зараз: ${told.now}`, `now: ${told.now}`),
            why,
            own && t(`у Claude кроки ${own.done}/${own.total}`, `Claude's steps ${own.done}/${own.total}`),
            unknown && !told ? t(`без оцінки: ${unknown}`, `no guess: ${unknown}`) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {progress != null && (
          <span className="pipe-bar" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
        {all && !told && busy.length > 0 && (
          <small className="pipe-warn">
            {t(
              "Claude ще не казав, скільки лишилось усій роботі, тож тут лише агенти, які працюють зараз: наступних " +
                "раундів (рев'ю, QA, повторів) цей час не бачить. Хуки спитають Claude з його наступною відповіддю.",
              "Claude hasn't said yet how long the whole job takes, so this counts only the agents working now, not " +
                "the rounds still to come (reviews, QA, re-runs). The hooks will ask Claude at its next turn.",
            )}
          </small>
        )}
      </div>

      {busy.length > 0 && (
        <section className="recap-sec">
          <div className="share-ttl">{t("Працюють", "Working")}</div>
          <ul className="pipe-list">
            {busy.map(({ seat, eta, elapsed }) => {
              const a = model.agents[seat];
              const steps = eta.todo;
              const pct = steps ? Math.round((100 * steps.done) / steps.total) : null;
              const pace = eta.stepMs != null && !eta.wrap ? fmtSpan(eta.stepMs, ui) : null;
              const lands = landsAt(eta, now, ui);
              return (
                <li key={seat} style={{ "--c": a.color } as CSSProperties}>
                  <span className="pipe-dot" />
                  <span className="pipe-who">
                    <b>{a.name}</b>
                    <small>
                      {[
                        t(`працює ${fmtSpan(elapsed, ui)}`, `working ${fmtSpan(elapsed, ui)}`),
                        steps ? t(`кроки ${steps.done}/${steps.total}`, `steps ${steps.done}/${steps.total}`) : null,
                        pace ? t(`~${pace} на крок`, `~${pace} a step`) : null,
                        usualText(eta, ui),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {pct != null && (
                      <span className="pipe-bar" aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="pipe-left">
                    <b>{eta.left == null ? "?" : etaText(eta, ui)}</b>
                    <small>
                      {eta.left != null
                        ? (lands ?? "")
                        : steps
                          ? t("час буде з першим кроком", "a time with the first step")
                          : t("ще не з чим порівняти", "nothing to compare with yet")}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {back.length > 0 && (
        <section className="recap-sec">
          <div className="share-ttl">{t("Уже повернулись", "Already back")}</div>
          <ul className="pipe-list done">
            {back.map((f) => {
              const a = model.agents[f.seat];
              return (
                <li key={`${f.seat}-${f.end}`} style={{ "--c": a.color } as CSSProperties}>
                  <span className="pipe-dot" />
                  <span className="pipe-who">
                    <b>{a.name}</b>
                  </span>
                  <span className="pipe-left">
                    <b>{t(`за ${fmtSpan(f.end - f.start, ui)}`, `took ${fmtSpan(f.end - f.start, ui)}`)}</b>
                    <small>{clockAt(scene.origin + f.end, now, ui).time}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="alerts-hint">
        {t(
          "Час приблизний. Поки Claude працює з агентами, хуки раз на ~20 хвилин просять його дописати у " +
            "відповідь рядок «⏱ 95m · 6/10 · що зараз»: скільки, на його думку, лишилось усій роботі, разом з " +
            "раундами, яких ще не почато. Від цього рядка й рахується час пайплайну; коли якийсь агент явно " +
            "потребує більше, береться його час. Агент зі списком задач: скільки пунктів лишилось, помножене на " +
            "час одного пункту. Агент без списку: скільки зазвичай тривають його роботи, мінус те, що він уже " +
            "працює. Вимкнути запитання: RELAY_CHECKIN=0 у змінних середовища Claude Code.",
          "A rough guess. While Claude works with agents, the hooks ask it every ~20 minutes to add a line like " +
            "“⏱ 95m · 6/10 · what now” to its reply: how long it thinks the whole job still takes, rounds not " +
            "started yet included. The pipeline's time counts down from that line, unless some agent clearly needs " +
            "longer. An agent with a task list: the steps left times the time one step takes. An agent without " +
            "one: how long its jobs usually take, less the time it has already worked. To stop the questions, set " +
            "RELAY_CHECKIN=0 in Claude Code's environment.",
        )}
      </p>
    </Sheet>
  );
}
