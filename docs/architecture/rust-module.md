# Основной модуль: `cargo-ai-fdocs` (Rust)

## 1) Назначение

`cargo-ai-fdocs` синхронизирует документацию зависимостей Rust-проекта по **точным версиям из `Cargo.lock`** и сохраняет её в локальный каталог для AI-инструментов (Copilot/Cursor/Windsurf и т.д.).

Ключевая идея: AI получает контекст по тем версиям библиотек, которые реально используются в проекте, а не по устаревшим данным из обучения.

---

## 2) Архитектура и роли модулей

## Оркестратор CLI

- `src/main.rs` — точка входа и маршрутизация команд:
  - `sync` — полная синхронизация;
  - `status` — вывод состояния;
  - `check` — CI-проверка актуальности;
  - `init` — генерация `ai-fdocs.toml`.

## Конфигурация

- `src/config.rs`:
  - загрузка/валидация `ai-fdocs.toml`;
  - дефолты;
  - совместимость со старым форматом `sources`.

## Резолвер версий

- `src/resolver.rs`:
  - достаёт версии crate из `Cargo.lock`.

## Сетевой fetcher (GitHub)

- `src/fetcher/github.rs`:
  - определяет git ref (тег/ветка) для нужной версии;
  - скачивает контент файлов;
  - применяет ретраи/таймауты;
  - классифицирует ошибки (auth/rate-limit/network/not-found).

## Хранилище и кеш

- `src/storage.rs`:
  - запись файлов, `.aifd-meta.toml`, `_SUMMARY.md`;
  - проверка кеша по fingerprint конфига;
  - prune старых папок.

## Отчётность

- `src/status.rs`:
  - строит статусы `Synced / SyncedFallback / Outdated / Missing / Corrupted`.
- `src/index.rs`:
  - генерирует общий `_INDEX.md`.

## Инициализация

- `src/init.rs`:
  - анализирует `Cargo.toml`;
  - запрашивает metadata crates.io;
  - пытается извлечь GitHub-репозиторий зависимости.

---

## 3) Потоки данных (куда и как «стучится»)

## 3.1 `sync`

### Входные источники

1. `ai-fdocs.toml` (локальный файл).
2. `Cargo.lock` (локальный файл).

### Внешние HTTP вызовы

Для каждого crate из конфига:

1. **Проверка тегов через GitHub API**
   - `GET https://api.github.com/repos/{owner}/{repo}/git/ref/tags/{candidate}`
   - кандидаты: `v{version}`, `{version}`, `{crate}-v{version}`, `{crate}-{version}`.

2. **Fallback до default branch** (если теги не найдены)
   - `GET https://api.github.com/repos/{owner}/{repo}`
   - берётся `default_branch`, помечается `is_fallback = true`.

3. **Скачивание файлов через raw.githubusercontent.com**
   - `GET https://raw.githubusercontent.com/{owner}/{repo}/{git_ref}/{path}`
   - по default списку или явному `files` из конфига.

### Локальный выход

- `docs/ai/vendor-docs/rust/{crate}@{version}/...`
- `.aifd-meta.toml`
- `_SUMMARY.md`
- общий `_INDEX.md`

---

## 4) Тайминги, интервалы, ретраи

## 4.1 Сетевые настройки Rust fetcher

- Таймаут HTTP клиента: **30 секунд** на запрос.
- Ретраи: до **3 попыток**.
- Начальный backoff: **500ms**, затем экспоненциально (`500ms`, `1000ms`).
- Повторяются только:
  - server error (`5xx`),
  - timeout/connect/request сетевые ошибки.
- `401` => auth ошибка (без ретраев).
- `403`/`429` => rate-limit ошибка (без ретраев).

## 4.2 Параллелизм

- `sync` запускает обработку crate параллельно.
- Лимит параллелизма регулируется `settings.sync_concurrency` (default `8`).

---

## 5) Поведение команд

## `cargo ai-fdocs init`

Что делает:

1. Проверяет, существует ли целевой `ai-fdocs.toml`.
2. Читает `Cargo.toml` и собирает зависимости (`dependencies` + `workspace.dependencies`).
3. По каждой зависимости запрашивает crates.io:
   - `GET https://crates.io/api/v1/crates/{crate}`
4. Из `repository/homepage` пытается извлечь `owner/repo` GitHub.
5. Пишет базовый `ai-fdocs.toml`.

Ограничения:

- Если репозиторий не GitHub или нераспознан — crate пропускается.
- Если конфиг существует, нужен `--force`.

## `cargo ai-fdocs sync [--force]`

Что делает:

1. Загружает конфиг и lockfile.
2. При `prune = true` удаляет устаревшие папки.
3. Для каждой crate:
   - пропускает, если не найдена в `Cargo.lock`;
   - пропускает по кешу, если fingerprint конфига не изменился (`--force` отключает это);
   - резолвит git ref;
   - качает docs файлы;
   - даже при частичном фейле сохраняет то, что удалось скачать (best-effort);
   - если ничего не скачано — считает ошибкой crate.
4. Генерирует общий `_INDEX.md`.
5. Возвращает итоговую статистику (synced/cached/skipped/errors + breakdown по типам ошибок).

## `cargo ai-fdocs status [--format table|json]`

Что делает:

- Сравнивает конфиг + lock версии + сохранённую мету.
- Выводит статус по каждой crate.
- Формат:
  - `table` (по умолчанию),
  - `json`.

## `cargo ai-fdocs check [--format table|json]`

Что делает:

- Выполняет ту же диагностику, что `status`.
- Если найдены проблемы (`Outdated/Missing/Corrupted`) — завершает команду ошибкой (non-zero exit code).
- В GitHub Actions дополнительно пишет `::error` аннотации по проблемным crate.

---

## 6) Формат конфигурации и скрытые настройки

## 6.1 Явные настройки (`[settings]`)

- `output_dir` (default: `docs/ai/vendor-docs` → Rust сохраняется в подпапку `rust`)
- `max_file_size_kb` (default `200`)
- `prune` (default `true`)
- `sync_concurrency` (default `8`, обязательно > 0)

## 6.2 Настройки crate (`[crates.<name>]`)

- `repo` — `owner/repo` (предпочтительный формат)
- `subpath` — для монорепо
- `files` — явный список файлов (тогда все эти файлы считаются required)
- `ai_notes` — подсказки для индекса/summary

## 6.3 Скрытые/неочевидные настройки

1. **`GITHUB_TOKEN` / `GH_TOKEN`**
   - если не заданы, лимит GitHub API существенно ниже;
   - с токеном повышается лимит.

2. **Fallback-режим по git ref**
   - если тег не найден, берётся default branch;
   - это не фатальная ошибка, но помечается как fallback.

3. **Кеш-инвалидация через fingerprint**
   - любые важные изменения crate-конфига приводят к resync.

4. **Header injection в markdown/html**
   - в сохранённый файл добавляется служебный заголовок с origin/ref/path/date.

5. **CHANGELOG post-processing**
   - changelog дополнительно сокращается по версии.

6. **Обрезка больших файлов**
   - файл обрезается до `max_file_size_kb`, добавляется маркер `[TRUNCATED ...]`.

---

## 7) Варианты использования

## 7.1 Локально (разработчик)

1. `cargo ai-fdocs init`
2. донастроить `ai-fdocs.toml`
3. `cargo ai-fdocs sync`
4. добавить `docs/ai/vendor-docs/** linguist-generated=true` в `.gitattributes`

## 7.2 CI (quality gate)

- запускать `cargo ai-fdocs check` в PR/merge pipeline;
- при проблемах пайплайн падает, выводит проблемные зависимости.

## 7.3 Плановый refresh

- по расписанию запускать `cargo ai-fdocs sync`;
- коммитить обновлённую docs-папку в репозиторий.

---

## 8) Поведение при сбоях (degraded mode)

Проект работает по best-effort логике:

- ошибка по одной crate не валит весь `sync`;
- уже существующий кеш не удаляется автоматически (кроме целевого prune-правила);
- проблемы отражаются в `status/check`.

Это позволяет не блокировать основной pipeline разработки из-за временных сетевых проблем.
