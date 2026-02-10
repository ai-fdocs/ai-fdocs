# NPM-клон: `ai-fdocs` в `npn/` (Node.js/TypeScript)

## 1) Назначение

NPM-клон повторяет ключевую бизнес-логику Rust-версии для JavaScript/TypeScript экосистемы:

- берёт зависимости из lockfile;
- подтягивает документацию для конкретных версий пакетов;
- складывает в локальный `vendor-docs/node`;
- даёт команды `init/sync/status/check` для локальной работы и CI.

---

## 2) Архитектура и модули

## CLI

- `npn/src/cli.ts` — команды и централизованная обработка ошибок.

## Команды

- `npn/src/commands/init.ts`
- `npn/src/commands/sync.ts`
- `npn/src/commands/status.ts`
- `npn/src/commands/check.ts`

## Конфиг

- `npn/src/config.ts` — чтение `ai-fdocs.toml`.

## Резолвер lockfile

- `npn/src/resolver.ts` — поддержка:
  - `package-lock.json`,
  - `pnpm-lock.yaml`,
  - `yarn.lock`.

## Интеграции с внешними источниками

- `npn/src/fetcher.ts`:
  - GitHub API / raw.githubusercontent.com;
  - альтернативный режим fetch из npm tarball.
- `npn/src/registry.ts`:
  - npm registry metadata;
  - извлечение GitHub repo и subpath.

## Хранилище

- `npn/src/storage.ts`:
  - запись файлов/меты;
  - кеш-проверка;
  - prune.

---

## 3) Куда и как «стучится»

## 3.1 `init`

Для каждого кандидата из `package.json` (dependencies + devDependencies):

1. `GET https://registry.npmjs.org/{package}`
2. Из поля `repository` извлекается GitHub-репо.
3. Если есть `repository.directory`, сохраняется как `subpath`.

Особенности:

- при HTTP `429` на metadata используется пауза `2 секунды`, затем **одна повторная попытка**;
- если нет repo/не GitHub — пакет пропускается.

## 3.2 `sync` в режиме GitHub (по умолчанию)

Для каждого пакета из конфига:

1. Резолв версии из lockfile.
2. Проверка refs:
   - `GET https://api.github.com/repos/{repo}/git/ref/heads/{ref}`
   - `GET https://api.github.com/repos/{repo}/git/ref/tags/{ref}`
   - кандидаты: `v{version}`, `{version}`;
   - fallback: `main`, затем `master`.
3. Получение дерева репозитория:
   - `GET https://api.github.com/repos/{repo}/git/trees/{ref}?recursive=1`
4. Скачивание файлов:
   - `GET https://raw.githubusercontent.com/{repo}/{ref}/{path}`

## 3.3 `sync` в режиме npm tarball (эксперимент)

Если `settings.experimental_npm_tarball = true`:

1. Запрос версии пакета:
   - `GET https://registry.npmjs.org/{package}/{version}`
2. Берётся `dist.tarball`.
3. Скачивается tarball и распаковывается локально.
4. Из архива выбираются docs-файлы по тем же правилам (или explicit `files`).

---

## 4) Тайминги, интервалы и ограничения

## 4.1 Параллелизм

- В `sync` используется `p-limit`.
- Жёсткий лимит: `MAX_CONCURRENT = 8` (константа в коде, не конфигурируется через TOML).

## 4.2 Временные паузы

- `init`:
  - каждые 10 пакетов делается `sleep(50ms)` для более мягкой нагрузки;
  - каждые 30 пакетов печатается прогресс.
- npm registry metadata:
  - при `429` — `sleep(2000ms)` и один retry.

## 4.3 Лимиты отбора файлов

- default режим выбирает md/docs/license/readme/changelog из дерева;
- в обоих режимах итог ограничивается первыми **40** файлами.

---

## 5) Поведение команд

## `ai-fdocs init [--overwrite]`

Что делает:

1. Проверяет наличие `ai-fdocs.toml`.
2. Читает `package.json` (dependencies + devDependencies).
3. Фильтрует служебные/шумные пакеты (например, `typescript`, `eslint`, `@types/*` и др.).
4. Запрашивает npm registry metadata.
5. Генерирует `ai-fdocs.toml`:
   - `output_dir = "docs/ai/vendor-docs/node"`
   - `prune = true`
   - `max_file_size_kb = 512`
   - `experimental_npm_tarball = false`

## `ai-fdocs sync [--force]`

Что делает:

1. Читает конфиг и lockfile.
2. Если `prune=true`, очищает устаревшие каталоги.
3. Для каждого пакета:
   - `not in lockfile` => `skipped`;
   - если валиден кеш и нет `--force` => `cached`;
   - иначе скачивает docs (GitHub или tarball-режим);
   - при успехе сохраняет файлы и мету;
   - генерирует `_SUMMARY.md` для пакета.
4. Генерирует общий индекс.
5. Печатает статистику по категориям: synced/cached/skipped/errors.

## `ai-fdocs status`

- Проверяет наличие директории и `.aifd-meta.toml`;
- сверяет config hash;
- показывает состояния:
  - `✅ Synced`
  - `⚠️ Synced (fallback: main/master)`
  - `⚠️ Config changed (resync needed)`
  - `❌ Missing`
  - `❌ Not in lockfile`

Дополнительно:

- подсказка по `.gitattributes`;
- статус GitHub token (set/not set).

## `ai-fdocs check`

- Проверяет, что все пакеты синхронизированы и актуальны.
- При проблемах печатает список и завершает процесс с code `1`.
- При успехе — code `0`.

---

## 6) Настройки и скрытые параметры

## 6.1 Явные TOML-настройки

`[settings]`:

- `output_dir` (default `docs/ai/vendor-docs/node`)
- `prune` (default `true`)
- `max_file_size_kb` (default `512`)
- `experimental_npm_tarball` (default `false`)

`[packages.<name>]`:

- `repo` (обязательно для sync через GitHub)
- `subpath` (монорепо подпуть)
- `files` (явный список)
- `ai_notes`

## 6.2 Скрытые/неочевидные параметры

1. **`GITHUB_TOKEN` / `GH_TOKEN`**
   - применяются для GitHub API запросов.

2. **Кеш-инвалидация по `config_hash`**
   - хранится в `.aifd-meta.toml`;
   - изменения в `repo/subpath/files/ai_notes` (и связанных полях) требуют resync.

3. **Header injection**
   - для `.md/.html/.htm` добавляется служебный заголовок источника.

4. **Обрезка файлов**
   - контент обрезается до `max_file_size_kb`, добавляется пометка `[TRUNCATED ...]`.

5. **Обработка changelog**
   - changelog-файлы проходят дополнительное сокращение.

---

## 7) Варианты использования

## Локальный сценарий

1. `npm install`
2. `npm run build`
3. `node dist/cli.js init`
4. редактировать `ai-fdocs.toml`
5. `node dist/cli.js sync`

## CI-гейт

- запускать `node dist/cli.js check`;
- при неактуальной документации job падает.

## Экспериментальный tarball-сценарий

- включить `experimental_npm_tarball = true`;
- использовать, если GitHub-источник нестабилен/неполон для части пакетов.

---

## 8) Degraded mode

NPM-клон также best-effort:

- сбой по одному пакету не должен прерывать весь sync;
- старый кеш сохраняется;
- проблемы явно отражаются в статусах/check.

Итог: ухудшается только «свежесть контекста», но не стабильность проекта.
