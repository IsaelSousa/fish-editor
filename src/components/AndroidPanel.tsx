import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Play, Smartphone, Monitor, AlertTriangle, CheckCircle, ExternalLink, Loader } from "lucide-react";

interface AvdInfo {
  name: string;
  target: string;
  abi: string;
  device: string;
  path: string;
}

interface AdbDevice {
  serial: string;
  state: string;
  is_emulator: boolean;
}

type Phase =
  | { kind: "idle" }
  | { kind: "launching"; avdName: string }
  | { kind: "searching"; pid: number; avdName: string; attempt: number }
  | { kind: "embedded"; pid: number; hwnd: number; avdName: string }
  | { kind: "error"; message: string };

const MAX_SEARCH_ATTEMPTS = 35; // ~70 seconds

export function AndroidPanel() {
  const [sdkPath, setSdkPath] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [avds, setAvds] = useState<AvdInfo[]>([]);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [loading, setLoading] = useState(true);

  const displayRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getDisplayRect = useCallback(() => {
    if (!displayRef.current) return null;
    const rect = displayRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr),
    };
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    let path: string | null = null;
    try {
      path = await invoke<string>("detect_android_sdk");
      setSdkPath(path);
      setSdkError(null);
    } catch (e) {
      setSdkError(String(e));
      setSdkPath(null);
      setLoading(false);
      return;
    }
    try { setAvds(await invoke<AvdInfo[]>("list_avds")); } catch { /* ignore */ }
    try { setDevices(await invoke<AdbDevice[]>("get_adb_devices", { sdkPath: path })); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!sdkPath) return;
    try { setDevices(await invoke<AdbDevice[]>("get_adb_devices", { sdkPath })); } catch { /* ignore */ }
  }, [sdkPath]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Embedding lifecycle ───────────────────────────────────────────────────

  const embedWindow = useCallback(async (hwnd: number) => {
    const rect = getDisplayRect();
    if (!rect) return;
    try {
      await invoke("embed_emulator_window", { emulatorHwnd: hwnd, ...rect });
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  }, [getDisplayRect]);

  const detach = useCallback(async () => {
    setPhase(prev => {
      if (prev.kind === "embedded") {
        invoke("detach_emulator_window", { emulatorHwnd: prev.hwnd }).catch(() => {});
      }
      return { kind: "idle" };
    });
  }, []);

  // Poll for emulator window by PID
  useEffect(() => {
    if (phase.kind !== "searching") return;

    const { pid, avdName, attempt } = phase;

    if (attempt >= MAX_SEARCH_ATTEMPTS) {
      setPhase({ kind: "error", message: "Emulator window did not appear within 70 seconds." });
      return;
    }

    pollTimerRef.current = setTimeout(async () => {
      try {
        const hwnd = await invoke<number>("find_emulator_window", { pid, avdName });
        setPhase({ kind: "embedded", pid, hwnd, avdName });
      } catch {
        setPhase({ kind: "searching", pid, avdName, attempt: attempt + 1 });
      }
    }, 2000);

    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [phase]);

  // Embed as soon as we reach embedded state
  useEffect(() => {
    if (phase.kind !== "embedded") return;
    // Small delay to ensure the div is rendered at its final size
    const t = setTimeout(() => embedWindow(phase.hwnd), 150);
    return () => clearTimeout(t);
  }, [phase.kind === "embedded" ? phase.hwnd : null]);

  // Track resize and reposition the embedded window
  useEffect(() => {
    if (phase.kind !== "embedded") return;
    const hwnd = (phase as { kind: "embedded"; hwnd: number }).hwnd;

    const reposition = async () => {
      const rect = getDisplayRect();
      if (!rect) return;
      try { await invoke("move_emulator_window", { emulatorHwnd: hwnd, ...rect }); } catch { /* ignore */ }
    };

    const observer = new ResizeObserver(reposition);
    if (displayRef.current) observer.observe(displayRef.current);
    window.addEventListener("resize", reposition);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [phase.kind === "embedded" ? (phase as any).hwnd : null, getDisplayRect]);

  // Detach when component unmounts while embedded
  useEffect(() => {
    return () => {
      setPhase(prev => {
        if (prev.kind === "embedded") {
          invoke("detach_emulator_window", { emulatorHwnd: prev.hwnd }).catch(() => {});
        }
        return prev;
      });
    };
  }, []);

  // ── Launch handler ────────────────────────────────────────────────────────

  const launch = useCallback(async (avdName: string) => {
    if (!sdkPath) return;
    setPhase({ kind: "launching", avdName });
    try {
      const pid = await invoke<number>("launch_emulator", { sdkPath, avdName });
      setPhase({ kind: "searching", pid, avdName, attempt: 0 });
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  }, [sdkPath]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const isEmbedded = phase.kind === "embedded";
  const isBusy = phase.kind === "launching" || phase.kind === "searching";
  const busyAvd = isBusy ? (phase as any).avdName as string : "";

  return (
    <div className="flex flex-col h-full bg-[#030303] text-[#00ff41] font-mono text-xs overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#003a00] shrink-0">
        <Smartphone size={14} />
        <span className="uppercase tracking-widest text-[11px]">Android Emulator</span>
        <div className="flex-1" />
        {isEmbedded && (
          <button
            onClick={detach}
            title="Detach emulator to standalone window"
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider border border-[#2d7a3a] text-[#2d7a3a] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors px-2 py-0.5 cursor-pointer"
          >
            <ExternalLink size={10} />
            Detach
          </button>
        )}
        {!isEmbedded && (
          <button onClick={loadData} title="Refresh" className="text-[#2d7a3a] hover:text-[#00ff41] transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* Embedded display area */}
      {isEmbedded && (
        <div
          ref={displayRef}
          className="flex-1 bg-black"
          style={{ minHeight: 0 }}
        />
      )}

      {/* Loading/searching state */}
      {isBusy && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#2d7a3a]">
          <Loader size={24} className="animate-spin text-[#00ff41]" />
          <p className="text-[11px] uppercase tracking-widest">
            {phase.kind === "launching" ? "Starting emulator..." : `Waiting for "${busyAvd}" window...`}
          </p>
          {phase.kind === "searching" && (
            <p className="text-[10px] opacity-50">
              Attempt {(phase as any).attempt} / {MAX_SEARCH_ATTEMPTS}
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {phase.kind === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <AlertTriangle size={20} className="text-[#ff4444]" />
          <p className="text-[#ff4444] text-center text-[11px]">{phase.message}</p>
          <button
            onClick={() => setPhase({ kind: "idle" })}
            className="text-[10px] uppercase tracking-wider border border-[#2d7a3a] text-[#2d7a3a] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors px-3 py-1 cursor-pointer"
          >
            Back
          </button>
        </div>
      )}

      {/* Idle: SDK status + AVD list + devices */}
      {phase.kind === "idle" && (
        <div className="flex-1 overflow-y-auto">
          {/* SDK Status */}
          <div className="px-4 py-3 border-b border-[#001a00]">
            <p className="text-[#2d7a3a] uppercase tracking-widest text-[10px] mb-2">Android SDK</p>
            {sdkError ? (
              <div className="flex items-start gap-2 text-[#ff4444]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span className="leading-relaxed">{sdkError}</span>
              </div>
            ) : sdkPath ? (
              <div className="flex items-start gap-2">
                <CheckCircle size={12} className="mt-0.5 shrink-0 text-[#00ff41]" />
                <span className="break-all text-[#6a9955]">{sdkPath}</span>
              </div>
            ) : (
              <span className="text-[#2d7a3a]">Detecting…</span>
            )}
          </div>

          {/* AVD list */}
          {!sdkError && (
            <div className="border-b border-[#001a00]">
              <p className="px-4 py-2 text-[#2d7a3a] uppercase tracking-widest text-[10px] border-b border-[#001a00]">
                Virtual Devices ({avds.length})
              </p>
              {avds.length === 0 && !loading && (
                <p className="px-4 py-4 text-[#2d7a3a] text-center">
                  No AVDs found. Create one in Android Studio.
                </p>
              )}
              {avds.map((avd) => {
                const api = avd.target.replace("android-", "API ");
                return (
                  <div
                    key={avd.name}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-[#001200] hover:bg-[#001a00] transition-colors"
                  >
                    <Monitor size={14} className="text-[#2d7a3a] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#00ff41] truncate">{avd.name}</p>
                      <p className="text-[#2d7a3a] text-[10px] mt-0.5">
                        {avd.device} · {api} · {avd.abi}
                      </p>
                    </div>
                    <button
                      onClick={() => launch(avd.name)}
                      className="flex items-center gap-1 px-2 py-1 border border-[#00ff41] text-[#00ff41] text-[10px] uppercase tracking-wider hover:bg-[#00ff41] hover:text-black transition-colors cursor-pointer shrink-0"
                    >
                      <Play size={10} />
                      Launch
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Connected devices */}
          {!sdkError && (
            <div>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[#001a00]">
                <p className="text-[#2d7a3a] uppercase tracking-widest text-[10px] flex-1">
                  Connected ({devices.length})
                </p>
                <button onClick={refreshDevices} className="text-[#2d7a3a] hover:text-[#00ff41] transition-colors">
                  <RefreshCw size={11} />
                </button>
              </div>
              {devices.length === 0 && (
                <p className="px-4 py-4 text-[#2d7a3a] text-center">No devices connected.</p>
              )}
              {devices.map((dev) => (
                <div key={dev.serial} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#001200]">
                  {dev.is_emulator
                    ? <Monitor size={13} className="text-[#00ccff] shrink-0" />
                    : <Smartphone size={13} className="text-[#ffcc00] shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-[#00ff41] truncate">{dev.serial}</p>
                    <p className="text-[#2d7a3a] text-[10px]">{dev.is_emulator ? "Emulator" : "Physical"}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${
                    dev.state === "device" ? "border-[#00ff41] text-[#00ff41]" : "border-[#ff4444] text-[#ff4444]"
                  }`}>
                    {dev.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
