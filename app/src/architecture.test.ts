import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md rule 2: code under src/server/adapters/ may be imported only from
// src/server/gateway/handlers/ (and by other adapters, e.g. fiber.ts -> http.ts).

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(APP_ROOT, "src");
const ADAPTERS = path.join(SRC, "server", "adapters");
const ALLOWED_IMPORTERS = [ADAPTERS, path.join(SRC, "server", "gateway", "handlers")];
const SOURCE_FILE = /\.(c|m)?(t|j)sx?$/;
const ADAPTER_SPECIFIER = /(^|\/)server\/adapters(\/|$)/;
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^'"]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

interface SourceFile {
  file: string;
  source: string;
}

function findAdapterImportViolations(files: SourceFile[]): string[] {
  const violations: string[] = [];
  for (const { file, source } of files) {
    if (ALLOWED_IMPORTERS.some((dir) => isInside(file, dir))) continue;
    for (const specifier of importSpecifiers(source)) {
      const target = specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : specifier;
      const importsAdapter = specifier.startsWith(".") ? isInside(target, ADAPTERS) : ADAPTER_SPECIFIER.test(target);
      if (importsAdapter) violations.push(`${toPosix(path.relative(APP_ROOT, file))} imports "${specifier}"`);
    }
  }
  return violations;
}

/** Report paths with "/" on every OS, so the expected messages don't depend on path.sep. */
function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function importSpecifiers(source: string): string[] {
  return IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]!));
}

function isInside(file: string, dir: string): boolean {
  const relative = path.relative(dir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function appSourceFiles(): SourceFile[] {
  const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => file !== import.meta.filename);
  files.push(path.join(APP_ROOT, "main.wasp.ts"));
  return files.map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

describe("adapter import boundary", () => {
  it("only gateway handlers (and adapters themselves) import src/server/adapters", () => {
    expect(findAdapterImportViolations(appSourceFiles())).toEqual([]);
  });

  it("flags relative, aliased and dynamic adapter imports from anywhere else", () => {
    const at = (relative: string, source: string) => ({ file: path.join(SRC, relative), source });

    const violations = findAdapterImportViolations([
      at("features/thread/tools.ts", 'import { searchCompanies } from "../../server/adapters/fiber";'),
      at("server/jobs/pipeline.ts", 'const ploid = await import("@/server/adapters/ploid");'),
      at("server/gateway/engine.ts", 'export { http } from "../adapters/http";'),
      at("server/gateway/handlers/fiber.ts", 'import { searchCompanies } from "../../adapters/fiber";'),
      at("server/adapters/fiber.ts", 'import { createHttpClient } from "./http";'),
      at("features/goals/operations.ts", 'import { CompanyRecordSchema } from "../../shared/contracts";'),
    ]);

    expect(violations).toEqual([
      'src/features/thread/tools.ts imports "../../server/adapters/fiber"',
      'src/server/jobs/pipeline.ts imports "@/server/adapters/ploid"',
      'src/server/gateway/engine.ts imports "../adapters/http"',
    ]);
  });
});
