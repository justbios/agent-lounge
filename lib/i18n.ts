"use client";

import { useCallback, useEffect } from "react";
import { Lang, speechNow, useSpeech } from "./live/speech";

/**
 * The language of the café's own buttons, menus and cards. It follows the language picked for agents' actions:
 * English reads English; Ukrainian and Russian read Ukrainian, as the whole site did before.
 */
export type Ui = "en" | "uk";

/** A text in both interface languages, for tables of names and descriptions. */
export interface Two {
  uk: string;
  en: string;
}

export const uiOf = (lang: Lang): Ui => (lang === "en" ? "en" : "uk");

/** The viewer's interface language, for components. The server and the first render read English. */
export function useUi(): Ui {
  return uiOf(useSpeech().lang);
}

/**
 * The language right now, outside React: canvas drawing, event handlers, timers. Never during render, where the
 * server and the first client render must agree on {@link useUi}.
 */
export const uiNow = (): Ui => uiOf(speechNow().lang);

/** Ukrainian first, English second: tr(ui, "підсумок", "recap"). */
export function tr(ui: Ui, uk: string, en: string): string {
  return ui === "en" ? en : uk;
}

/** {@link tr} bound to the viewer's language: const t = useTr(); t("підсумок", "recap"). */
export function useTr(): (uk: string, en: string) => string {
  const ui = useUi();
  return useCallback((uk: string, en: string) => (ui === "en" ? en : uk), [ui]);
}

/** English noun form for a count: enPlural(1, "action", "actions") → «action». */
export function enPlural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

/** Keeps <html lang> on the viewer's language, for screen readers and the browser's own translate offer. */
export function HtmlLang() {
  const ui = useUi();
  useEffect(() => {
    document.documentElement.lang = ui;
  }, [ui]);
  return null;
}
