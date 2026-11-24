import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** QR code en SVG (généré ici, rien n'est envoyé à un service externe). Toujours noir sur blanc avec une marge, pour rester lisible quel que soit le thème. */
export default function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { count: n + 8, path: d };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${count} ${count}`} width={size} height={size} role="img" aria-label={label ?? 'QR code'} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 8, display: 'block', maxWidth: '100%', height: 'auto' }}>
      <path d={path} fill="#000" />
    </svg>
  );
}
