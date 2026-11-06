import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const time = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
  const offset = "UTC" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);

  return (
    <div className="flex flex-col items-end px-space-sm">
      <time className="font-mono text-telemetry-md tracking-wider text-on-surface">{time}</time>
      <span className="font-mono text-label-caps text-on-surface-variant">{offset}</span>
    </div>
  );
}
