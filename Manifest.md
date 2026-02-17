# AI Fresh Docs (cargo-ai-fdocs) — Manifest (v0.1-alpha, updated)

> Архитектурная карта монорепозитория и границы компонентов: [README.md](./README.md).
> Техническая документация отдельных Rust/NPM библиотек: [cargo/docs/architecture/README.md](./cargo/docs/architecture/README.md).
> Отдельный детальный план интеграции latest-docs: `MANIFEST_DOCSRS_LATEST.md`.
> API-контракт интеграции: `docs/API_CONTRACT.md`.

## 1. Продуктовая цель

### Проблема
AI-ассистенты (Cursor, Copilot, Claude Code и др.) часто генерируют код по устаревшей документации зависимостей.

### Решение
`cargo-ai-fdocs` синхронизирует документацию библиотек из GitHub в локальную папку проекта, чтобы AI работал с актуальным контекстом, привязанным к версиям из lockfile.

### Продуктовые принципы
- **Точность контекста:** документация соответствует фактически используемым версиям зависимостей.
- **Предсказуемость:** повторный запуск при одинаковом входе даёт сопоставимый результат.
- **Низкая инвазивность:** инструмент не вмешивается в исходный код проекта.
- **Best-effort UX:** частичные сетевые/источниковые сбои не ломают весь поток.

## 2. Границы документа

Этот манифест фиксирует **только** продуктовые договорённости, план и roadmap.

Архитектурные подробности (структура монорепо, модули, технические потоки, операционные детали) не дублируются здесь и читаются из:
- корневого [README.md](./README.md) — общая карта репозитория;
- [cargo/docs/architecture/README.md](./cargo/docs/architecture/README.md) — техдок отдельных Rust/NPM библиотек.

## 3. Продуктовый roadmap

### Ближайший этап (alpha → beta hardening)
- Повысить надёжность синхронизации и прозрачность деградаций.
- Довести CI-сценарии проверки свежести документации до стабильного контракта.
- Улучшить UX навигации по синхронизированным документам в больших графах зависимостей.
---


### Repository note: npm sibling implementation
- В папке [`npm/`](./npm) находится NPM-версия библиотеки: **npm-ai-fdocs** (Node.js/TypeScript).
- Для `npm/` действует цель функционального паритета с основной реализацией AI Fresh Docs с поправкой на экосистему NPM.
- Должны быть унифицированы: набор команд (`init/sync/status/check`), принципы структуры выходных папок и общая модель статусов/кеша.

## 3. CLI и команды (alpha)

Текущий рабочий сценарий:

```bash
cargo ai-fdocs sync
cargo ai-fdocs sync --force
cargo ai-fdocs status
```

> Примечание: продукт называется **AI Fresh Docs**, а cargo-subcommand в проекте — `ai-fdocs`.

---

## 4. Конфигурация (текущий формат)

Файл: `ai-fdocs.toml` в корне проекта.

```toml
[settings]
output_dir = "fdocs/rust"
max_file_size_kb = 200
prune = true
sync_concurrency = 8

[crates.axum]
repo = "tokio-rs/axum"
ai_notes = "Web framework layer"

[crates.sqlx]
repo = "launchbadge/sqlx"
files = ["README.md", "CHANGELOG.md", "docs/migration-guide.md"]
ai_notes = "Use sqlx::query! where possible"
```

### Семантика полей
- `settings.output_dir` — куда сохранять docs.
- `settings.max_file_size_kb` — лимит размера файла с обрезкой.
- `settings.prune` — удалять устаревшие папки версий.
- `settings.sync_concurrency` — количество параллельных sync-воркеров (по умолчанию `8`).
- `crates.<name>.repo` — источник документации в формате `owner/repo`.
- `crates.<name>.subpath` — опциональный префикс для monorepo (для дефолтных файлов).
- `crates.<name>.files` — явный список файлов (если не указан, используются дефолтные).
- `crates.<name>.ai_notes` — заметки для AI в индексах.

Legacy-формат `sources = [{ type = "github", repo = "..." }]` остаётся поддержанным для обратной совместимости.

---

## 5. Алгоритм `sync` (alpha-контракт)

1. Прочитать `ai-fdocs.toml`.
2. Прочитать `Cargo.lock` и получить `crate -> version`.
3. (Опционально) выполнить pruning.
4. Для каждого crate из конфига:
   - проверить, есть ли версия в lock;
   - проверить кэш (`crate@version` + `.aifd-meta.toml` + fingerprint конфигурации `repo/subpath/files`);
   - определить git ref (тег, иначе fallback на branch);
   - скачать нужные файлы;
   - обработать CHANGELOG;
   - сохранить файлы и метаданные.
5. Перегенерировать `fdocs/rust/_INDEX.md`.
6. Показать итог (`synced/cached/skipped/errors`).

Важно: ошибки по отдельным крейтам/файлам не валят весь sync целиком — обработка best-effort, чтобы остальная документация продолжала обновляться.

---

## 6. Выходная структура

```text
fdocs/rust/
├── _INDEX.md
├── axum@0.8.1/
│   ├── .aifd-meta.toml
│   ├── _SUMMARY.md
│   ├── README.md
│   └── CHANGELOG.md
└── sqlx@0.8.2/
    ├── .aifd-meta.toml
    ├── _SUMMARY.md
    ├── README.md
    └── docs__migration-guide.md
```

---

## 7. Сетевой слой

- Поддержка токена: `GITHUB_TOKEN` / `GH_TOKEN`.
- Без токена — warning про лимиты GitHub API.
- Fallback на default branch, если тег версии не найден.

---

## 8. Roadmap до стабильной рабочей версии

### Ближайший этап (hardening alpha -> beta)
Статус (текущее состояние):
- ✅ retry/backoff и базовая классификация сетевых ошибок реализованы.
- ✅ `check --format json` и CI-рецепты оформлены.
- ✅ кроссплатформенный smoke CI (Linux/macOS/Windows) добавлен.
- ✅ policy совместимости/semver зафиксирована в `COMPATIBILITY.md`.
- ⏳ остаётся: интеграционные сценарии (lockfile/fallback/partial failures) и UX `_INDEX.md` для больших графов.
- ⏳ остаётся: рефакторинг `save_crate_files` (`too_many_arguments`).

- Надёжность сети: retry/backoff для GitHub API и raw-download, явная классификация ошибок (auth/rate-limit/not-found/network).
- Тестовое покрытие: интеграционные сценарии для lockfile-resolve, fallback на branch, частичные ошибки (best-effort).
- Наблюдаемость: более детальная итоговая статистика `sync` по типам ошибок и источникам.

### v0.2 (CI-first)
- Стабилизировать `check` как gate для CI.
- Поддерживать машиночитаемый формат статусов для автоматизации отчётов.
- Закрепить типовые CI-рецепты (sync/check + cache стратегия).

### v0.3 (stability envelope)
- Зафиксировать совместимость форматов метаданных и миграционные правила.
- Унифицировать CLI/сообщения между ключевыми командами.

### v1.0 (stable)
- Финализировать semver-обещания CLI и форматов данных.
- Подтвердить кроссплатформенную зрелость через regression/smoke прогоны.
- Опубликовать публичную policy по поддерживаемым версиям и обратной совместимости.

## 4. Критерии готовности продукта

- Инструмент воспроизводимо обновляет docs-контекст для AI по lockfile/конфигурации.
- CI получает однозначный сигнал о состоянии docs (OK/нужна синхронизация/ошибка источника).
- Для команд разработки документированы и понятны безопасные деградации и границы ответственности.
