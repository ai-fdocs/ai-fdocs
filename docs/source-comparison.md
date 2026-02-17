# Сравнение источников «свежей» документации: Rust CLI, NPM CLI и VS Code extension

## Кратко

- **Rust (`cargo-ai-fdocs`)**:
  - в `lockfile` режиме — синк из **GitHub** по версии из lockfile;
  - в `latest-docs` режиме — версия из **crates.io**, API-документация из **docs.rs**, fallback в **GitHub**.
- **NPM (`ai-fdocs`)**:
  - default источник — **npm tarball** (URL берётся через npm registry);
  - альтернативно — **GitHub** (явно через `docs_source = "github"`).
- **VS Code extension**:
  - целевая архитектура: **самостоятельный модуль** с собственным fetch-пайплайном;
  - должен уметь одинаково работать с Rust и NPM источниками без обязательной прокладки через внешние CLI.

## По компонентам

### 1) Rust версия (`cargo-ai-fdocs`)

1. `latest-docs`:
   - источник версии: `https://crates.io/api/v1/crates/{crate}`;
   - источник контента: `https://docs.rs/crate/{crate}/{version}`;
   - при сбоях docs.rs используется fallback на GitHub.
2. `lockfile`:
   - работает по lockfile-версиям и синкает GitHub-файлы.

### 2) NPM версия (`ai-fdocs`)

1. По умолчанию:
   - `docs_source = "npm_tarball"`;
   - URL tarball подтягивается из `https://registry.npmjs.org`.
2. Альтернатива:
   - `docs_source = "github"`;
   - берутся файлы из репозитория через GitHub API + raw.githubusercontent.

### 3) VS Code версия (требуемое целевое поведение)

1. Extension должен иметь собственный слой `source adapters`, минимум:
   - `rust_latest_docs`: crates.io + docs.rs + GitHub fallback;
   - `npm_release_docs`: npm registry + npm tarball + GitHub fallback.
2. Extension должен выполнять `sync/status/check` через внутренний модуль, а не только через `exec` внешнего бинаря.
3. Формат локальных артефактов и статусов должен быть унифицирован между Rust и NPM внутри extension-модуля.

## Практический вывод

Если нужен максимально «релизный» источник для Node-пакетов — выбирай NPM CLI c `npm_tarball`.

Если нужен именно latest API-контент для Rust crates — используй Rust CLI в `--mode latest-docs` (crates.io + docs.rs, с fallback в GitHub).

Ключевое требование для дальнейшей реализации: VS Code extension не должен оставаться только UI-обёрткой. Ему нужна собственная модульная реализация источников документации, одинаково покрывающая Rust и NPM.

## Переходный статус

- Сейчас в репозитории extension всё ещё в основном работает как wrapper вокруг CLI.
- Этот документ фиксирует целевую архитектуру: самостоятельная реализация source-модуля в `vscode/`.
