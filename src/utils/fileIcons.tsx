import React from "react";
import { FileEntry } from "../types";
import {
  Folder,
  FileCode,
  FileText,
  FileJson,
  Image,
  File,
} from "lucide-react";

const colorMap: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#61dafb",
  py: "#3572a5",
  rs: "#dea584",
  go: "#00add8",
  java: "#b07219",
  html: "#e44d26",
  css: "#563d7c",
  scss: "#c6538c",
  json: "#f5a623",
  yaml: "#cb171e",
  yml: "#cb171e",
  md: "#083fa1",
  sh: "#89e051",
  sql: "#e38c00",
  toml: "#9c4121",
  dockerfile: "#0db7ed",
};

export function getFileIcon(entry: FileEntry, size: number = 14): React.JSX.Element {
  if (entry.is_dir) {
    return <Folder size={size} className="text-[#e8c100] flex-shrink-0" />;
  }

  const ext = entry.extension?.toLowerCase();
  const color = ext ? colorMap[ext] : undefined;

  if (!ext) return <File size={size} className="text-[#858585] flex-shrink-0" />;

  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext)) {
    return <Image size={size} className="text-[#4ec9b0] flex-shrink-0" />;
  }

  if (["json", "jsonc"].includes(ext)) {
    return <FileJson size={size} style={{ color: color || "#f5a623" }} className="flex-shrink-0" />;
  }

  if (["md", "txt", "log"].includes(ext)) {
    return <FileText size={size} style={{ color: color || "#83a598" }} className="flex-shrink-0" />;
  }

  if (color) {
    return <FileCode size={size} style={{ color }} className="flex-shrink-0" />;
  }

  return <File size={size} className="text-[#858585] flex-shrink-0" />;
}
