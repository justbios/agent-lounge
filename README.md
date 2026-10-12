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

Два способи, і обидва — одна фраза для свого Claude Code.

### Хмарно, через сайт (для всіх)

На https://agent-pipeline-viz-one.vercel.app/connect сайт видає особистий ключ і готову фразу з хуками. Claude
дописує їх у `~/.claude/settings.json`, і далі агенти видно на сайті, з будь-якого пристрою (посилання
`/#k=<ключ>`). Нічого завантажувати не треба.

```
Claude Code hooks ──curl──▶ Vercel /api/claude-hook?k=<ключ> ──▶ normalize ──▶ Supabase rpc relay_ingest
                                                                                  │ realtime.send(relay:<sha256(ключ)>)
сторінка: rpc relay_snapshot (знімок) + Realtime broadcast ◀───────────────────────┘
```

- Supabase-проєкт `relay` (`tebhpitpwijkrxthxpcy`, Франкфурт) в окремій організації `Relay` (`wetxsehqqnjowburqbvf`).
  З safeapp/Guard не ділить нічого: ні організації, ні білінгу, ні ключів. Схема в `supabase/migrations/0003_live_rooms.sql`.
- Таблиця закрита RLS, ходять лише дві функції за ключем. Кімната — це `sha256(ключ)`, сам ключ ніде не лежить.
- Події живуть добу (pg_cron) і не більше 5000 на кімнату.
- На сервер іде лише нормалізоване: короткі описи дій, імена агентів, назва папки. Вміст файлів і повні тексти
  відкидаються одразу у `lib/live/normalize.ts`.
- Хуки на `UserPromptSubmit` і `SessionStart` додають список файлів з `.claude/agents`, тож за столи сідає вся
  команда, навіть хто ще не працював.
- Змінні для Vercel: `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (див. `.env.example`).

### Локально (нічого не йде в мережу)

Для власника репозиторію: інструкція для Claude лежить у [`public/setup.md`](public/setup.md). Руками:

```bash
git clone https://github.com/justbios/agent-pipeline-viz.git ~/relay
cd ~/relay
npm install
npm run setup         # хук у ~/.claude/settings.json + Relay у фоні на http://127.0.0.1:3737
```

| Команда | Що робить |
|---|---|
| `npm run setup` | `hooks` + `up` |
| `npm run hooks` / `npm run unhook` | додає / прибирає хук у `~/.claude/settings.json` (або `$CLAUDE_CONFIG_DIR`). Решту налаштувань не чіпає, бекап `settings.json.bak-relay`, повторний запуск нічого не міняє |
| `npm run up` / `npm run down` | збирає й тримає Relay у фоні (лог `data/server.log`) / зупиняє. `npm run up -- --restart` після `git pull` |
| `npm run live` | те саме на передньому плані, в терміналі |

Сторінка сама обирає режим: на `127.0.0.1` / `localhost` вона читає локальний Relay, на будь-якому іншому домені
хмарну кімнату. Хуки обох режимів живуть у `lib/live/hookConfig.mjs`. Вони асинхронні (`async: true`), мовчазні й
завжди виходять з 0: не гальмують агентів, не витрачають токенів, а коли адресат недоступний, curl тихо падає.

Події тримаються в пам'яті процесу Relay (і в `data/live-events.jsonl`, щоб пережити перезапуск) і нікуди з машини не йдуть. Перевірити без
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

## Стара заготовка: оркестратор Agent SDK (не підключена)

До хмарного режиму вище не має стосунку: окремі таблиці `agent_events` і `/api/ingest`, у проєкті `relay` їх немає.

1. Створи проєкт у Supabase, застосуй `supabase/migrations/0001_agent_events.sql`.
2. Заповни `.env` (див. `.env.example`).
3. У `PipelineDashboard` заміни `buildMockRun()` на `useAgentEvents(runId)` і
   збери `timings` з подій замість моку (події вже в правильному форматі).
4. Запусти оркестратор з `orchestrator/` — він пише `agent_events`, фронт оживає.

## Далі

- [x] live-режим на екрані (локально, з хуків Claude Code)
- [x] деплой демо на Vercel
- [x] хмарний live через Supabase: кожен підключає свій Claude однією фразою
- [ ] звук/партикли на хендофах, ачівки, лідерборд запусків
