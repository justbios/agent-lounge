# Relay — живий конвеєр агентів

Гейміфікована візуалізація мультиагентного пайплайну: 8 агентів по черзі беруться
за роботу і передають «пакунок» один одному, а глядач бачить це в реальному часі —
з подіями, статусами, рівнями та лічильником передач.

Зараз запускається в **replay-режимі** на змодельованому прогоні (жодного бекенду не
треба). Той самий UI вмикається на живі дані, коли оркестратор починає писати події.

## Запуск

Потрібен **Node ≥ 18** (розроблялось на Node 20).

```bash
npm install
npm run dev
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
| `lib/useAgentEvents.ts` | **live-режим**: backlog + Supabase Realtime |
| `orchestrator/` | `emit()` + приклад інтеграції з Agent SDK |
| `supabase/migrations/0001_agent_events.sql` | схема таблиць + RLS + realtime |

## Перемикання на живі дані

1. Створи проєкт у Supabase, застосуй `supabase/migrations/0001_agent_events.sql`.
2. Заповни `.env` (див. `.env.example`).
3. У `PipelineDashboard` заміни `buildMockRun()` на `useAgentEvents(runId)` і
   збери `timings` з подій замість моку (події вже в правильному форматі).
4. Запусти оркестратор з `orchestrator/` — він пише `agent_events`, фронт оживає.

## Далі

- [ ] `useAgentEvents` → адаптер подій у `timings` (live-режим на екрані)
- [ ] сторінка `/pipeline/[runId]` + список запусків
- [ ] деплой на Vercel
- [ ] звук/партикли на хендофах, ачівки, лідерборд запусків
