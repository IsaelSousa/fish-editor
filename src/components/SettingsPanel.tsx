import { X } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { EditorSettings } from "../types";

interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function Row({ label, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#003a00]">
      <div className="flex-1 pr-8">
        <p className="text-[#00ff41] text-sm">{label}</p>
        {description && <p className="text-[#2d7a3a] text-xs mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      className="w-20 bg-[#001a00] text-[#00ff41] text-sm px-2 py-1 border border-[#003a00] outline-none focus:border-[#00ff41] text-center"
      style={{ caretColor: '#00ff41' }}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 bg-[#001a00] text-[#00ff41] text-sm px-2 py-1 border border-[#003a00] outline-none focus:border-[#00ff41] placeholder-[#2d7a3a]"
      style={{ caretColor: '#00ff41' }}
    />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 cursor-pointer border border-[#003a00] bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-[#001a00] text-[#00ff41] text-sm px-2 py-1 border border-[#003a00] outline-none focus:border-[#00ff41]"
        style={{ caretColor: '#00ff41' }}
      />
    </div>
  );
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="bg-[#001a00] text-[#00ff41] text-sm px-2 py-1 border border-[#003a00] outline-none focus:border-[#00ff41]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: '#000', color: '#00ff41' }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 transition-colors relative border ${
        value ? "bg-[#003300] border-[#00ff41]" : "bg-[#000] border-[#003a00]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 transition-transform ${
          value
            ? "translate-x-5 bg-[#00ff41]"
            : "translate-x-0.5 bg-[#2d7a3a]"
        }`}
        style={value ? { boxShadow: '0 0 6px #00ff41' } : undefined}
      />
    </button>
  );
}

function Section({ title }: { title: string }) {
  return (
    <h2 className="text-[#00ff41] text-xs font-semibold uppercase tracking-widest mt-6 mb-1" style={{ textShadow: '0 0 4px rgba(0,255,65,0.5)' }}>
      // {title}
    </h2>
  );
}

export function SettingsPanel() {
  const { settings, updateSettings, setSettingsOpen } = useEditorStore();

  function update(patch: Partial<EditorSettings>) {
    updateSettings(patch);
  }

  return (
    <div className="flex flex-col h-full bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#003a00] shrink-0">
        <h1 className="text-[#00ff41] text-base font-semibold uppercase tracking-widest" style={{ textShadow: '0 0 6px #00ff41' }}>
          [ Settings ]
        </h1>
        <button
          onClick={() => setSettingsOpen(false)}
          className="text-[#2d7a3a] hover:text-[#ff3300] hover:bg-[#1a0000] p-1 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {/* Editor */}
        <Section title="Editor" />

        <Row label="Font Size" description="Size of the editor font in pixels">
          <NumberInput value={settings.fontSize} min={8} max={32} onChange={(v) => update({ fontSize: v })} />
        </Row>

        <Row label="Font Family" description="Font family used in the editor">
          <TextInput
            value={settings.fontFamily}
            placeholder="Consolas, monospace"
            onChange={(v) => update({ fontFamily: v })}
          />
        </Row>

        <Row label="Font Color" description="Default text color in the editor">
          <ColorInput value={settings.fontColor} onChange={(v) => update({ fontColor: v })} />
        </Row>

        <Row label="Tab Size" description="Number of spaces per tab">
          <NumberInput value={settings.tabSize} min={1} max={16} onChange={(v) => update({ tabSize: v })} />
        </Row>

        <Row label="Word Wrap" description="Controls line wrapping">
          <SelectInput
            value={settings.wordWrap}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
              { value: "wordWrapColumn", label: "Column" },
              { value: "bounded", label: "Bounded" },
            ]}
            onChange={(v) => update({ wordWrap: v })}
          />
        </Row>

        <Row label="Minimap" description="Show overview minimap on the right">
          <Toggle value={settings.minimap} onChange={(v) => update({ minimap: v })} />
        </Row>

        <Row label="Line Numbers" description="Controls visibility of line numbers">
          <SelectInput
            value={settings.lineNumbers}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
              { value: "relative", label: "Relative" },
            ]}
            onChange={(v) => update({ lineNumbers: v })}
          />
        </Row>

        {/* Explorer */}
        <Section title="Explorer" />

        <Row label="File Tree Font Size" description="Size of file names in the explorer">
          <NumberInput
            value={settings.fileTreeFontSize}
            min={10}
            max={20}
            onChange={(v) => update({ fileTreeFontSize: v })}
          />
        </Row>

        <Row label="File Icon Size" description="Size of file/folder icons in the tree">
          <NumberInput
            value={settings.fileIconSize}
            min={10}
            max={24}
            onChange={(v) => update({ fileIconSize: v })}
          />
        </Row>

        <Row label="Header Icon Size" description="Size of action icons in the explorer header">
          <NumberInput
            value={settings.headerIconSize}
            min={10}
            max={24}
            onChange={(v) => update({ headerIconSize: v })}
          />
        </Row>
      </div>
    </div>
  );
}
