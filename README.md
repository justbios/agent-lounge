# Relay — живий конвеєр агентів

Гейміфікована візуалізація мультиагентного пайплайну: 8 агентів по черзі беруться
за роботу і передають «пакунок» один одному, а глядач бачить це в реальному часі —
з подіями, статусами, рівнями та лічильником передач.

Два режими:

- **демо**: піксельне інтернет-кафе на змодельованому прогоні. Кубик 🎲 перемішує
  столи й бере випадковий склад агентів.
- **наживо**: твої справжні сесії Claude Code. Головний Claude сидить за своїм столом;
  коли він запускає субагента, то встає й несе йому задачу, субагент працює (над
  головою хмарка з поточною дією), а потім приносить результат назад.

## Наживо: підключити свій Claude Code

```bash
npm install
npm run live          # збірка + сервер на http://127.0.0.1:3737 (лише localhost)
```

Далі хук у `~/.claude/settings.json`: готовий блок на сторінці `/connect`
(генерується з `lib/live/hookConfig.ts`). Хук асинхронний (`async: true`), мовчазний
і завжди виходить з 0: він не гальмує агентів, не витрачає токенів, а коли Relay не
запущений, curl просто тихо падає.

Події тримаються в пам'яті процесу Relay і нікуди з машини не йдуть. Перевірити без
справжнього Claude можна так: `node scripts/simulate-claude.mjs` програє вигадану сесію.

```
Claude Code hooks ──curl──▶ /api/claude-hook ──▶ lib/live/store (пам'ять)
                                                        │ SSE /api/live
                                                        ▼
                         useLiveFeed → buildLiveModel → CafeScene
```

## Демо локально

Потрібен **Node ≥ 18** (розроблялось на Node 20). На зовнішньому SSD dev-сервер
запускай з `--webpack`: Turbopack спотикається об macOS-файли `._*`.

```bash
npm install
npm run dev -- --webpack
# http://localhost:3000
```

## Як воно влаштоване

```
Оркестратор (Claude Agent SDK)         Next.js фронт
  emit(start|tool_call|handoff|…)         PipelineStage  ← анімований конвеєр
        │                                 ActivityLog    ← потік подій
        ▼                                 AgentRoster    ← статуси агентів
   Supabase: agent_events  ──realtime──▶  useAgentEvents(runId)
```

Один контракт на все — таблиця `agent_events`. Фронт малює те, що в ній є, і не знає,
звідки взялися події (SDK, Claude Code хуки, будь-що).

### Ключові файли

| Файл | Що це |
|---|---|
| `lib/types.ts` | тип події + опис 8 агентів (імена, ролі, кольори, іконки) |
| `lib/mockRun.ts` | детермінований змодельований прогін для replay-демо |
| `lib/useReplay.ts` | rAF-годинник, що програє прогін (play/pause/швидкість/цикли) |
| `lib/stage.ts` | геометрія конвеєра + стан вузлів і позиція пакунка з годинника |
| `components/PipelineStage.tsx` | анімований конвеєр (SVG-трек, вузли, пакунок) |
| `components/ActivityLog.tsx` | термінальний потік подій |
| `components/AgentRoster.tsx` | список агентів з живими статусами |
| `lib/cafe/*`, `components/cafe/*` | інтернет-кафе: розсадка, маршрути, модель сцени, піксельний рендер, кіт |
| `lib/live/*` | **наживо з Claude Code**: нормалізація хуків, in-memory store, SSE, модель кафе |
| `lib/useAgentEvents.ts` | хмарний режим (на майбутнє): backlog + Supabase Realtime |
| `orchestrator/` | `emit()` + приклад інтеграції з Agent SDK |
| `supabase/migrations/0001_agent_events.sql` | схема таблиць + RLS + realtime |

## Хмарний режим (щоб дивились інші, ще не зроблено)

1. Створи проєкт у Supabase, застосуй `supabase/migrations/0001_agent_events.sql`.
2. Заповни `.env` (див. `.env.example`).
3. У `PipelineDashboard` заміни `buildMockRun()` на `useAgentEvents(runId)` і
   збери `timings` з подій замість моку (події вже в правильному форматі).
4. Запусти оркестратор з `orchestrator/` — він пише `agent_events`, фронт оживає.

## Далі

- [x] live-режим на екрані (локально, з хуків Claude Code)
- [x] деплой демо на Vercel
- [ ] хмарний live через Supabase, щоб показувати іншим наживо
- [ ] звук/партикли на хендофах, ачівки, лідерборд запусків
