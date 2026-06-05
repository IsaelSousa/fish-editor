const extensionMap: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  vue: "html",
  svelte: "html",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  tf: "hcl",
  r: "r",
  lua: "lua",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  elm: "elm",
  clj: "clojure",
  ini: "ini",
  env: "ini",
  txt: "plaintext",
  log: "plaintext",
};

export function getLanguageFromExtension(ext?: string): string {
  if (!ext) return "plaintext";
  return extensionMap[ext.toLowerCase()] || "plaintext";
}

export function getLanguageFromPath(filePath: string): string {
  const parts = filePath.split(".");
  if (parts.length < 2) {
    const name = filePath.split(/[/\\]/).pop()?.toLowerCase();
    if (name === "dockerfile" || name === "makefile") return name;
    return "plaintext";
  }
  const ext = parts[parts.length - 1];
  return getLanguageFromExtension(ext);
}
