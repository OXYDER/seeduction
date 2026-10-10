// Reconnaît le client BitTorrent d'après le « peer_id » qu'il envoie au tracker (style Azureus : « -qB4630- » = qBittorrent 4.6.3.0).

const CLIENTS: Record<string, string> = {
  qB: 'qBittorrent', TR: 'Transmission', UT: 'µTorrent', UM: 'µTorrent Mac', UW: 'µTorrent Web', LT: 'libtorrent (rasterbar)', lt: 'libtorrent (rTorrent)',
  DE: 'Deluge', AZ: 'Vuze (Azureus)', BT: 'BitTorrent', KT: 'KTorrent', BC: 'BitComet', BI: 'BiglyBT', FD: 'Free Download Manager',
  WW: 'WebTorrent', WD: 'WebTorrent Desktop', XL: 'Xunlei', SD: 'Thunder', TS: 'Torrentstorm', BS: 'BTSlave', LW: 'LimeWire', FL: 'Flud',
  PD: 'Pando', RT: 'Retriever', VG: 'Vagaa', BE: 'BitTorrent SDK', 'SW': 'SwarmScope', 'BW': 'BitWombat', TT: 'TuoTu', MP: 'MooPolice', 'LP': 'Lphant',
  'AR': 'Arctic', 'BG': 'BTG', 'BR': 'BitRocket', 'EB': 'EBit', 'ES': 'Electric Sheep', 'HL': 'Halite', 'KG': 'KGet', 'QD': 'QQDownload',
  'SS': 'SwarmScope', 'ST': 'SymTorrent', 'TN': 'Torrent .NET', 'XT': 'XanTorrent', 'ZT': 'ZipTorrent',
};

export interface PeerClient { client: string; version: string | null; known: boolean }

export function parsePeerClient(peerId: string): PeerClient {
  const id = peerId ?? '';
  const m = /^-([A-Za-z]{2})([0-9A-Za-z]{4})-/.exec(id);
  if (m) {
    const name = CLIENTS[m[1]];
    // 4 chiffres = numéro de version (4630 → 4.6.3.0) ; les lettres éventuelles de fin (UT355W) sont ignorées
    const digits = /^\d{4}/.test(m[2]) ? m[2].split('').join('.') : /^\d{3}/.test(m[2]) ? m[2].slice(0, 3).split('').join('.') : null;
    return { client: name ?? `Inconnu (${m[1]})`, version: digits, known: !!name };
  }
  if (/^M\d+-\d+-\d+--/.test(id)) return { client: 'BitTorrent (ancien)', version: id.slice(1, id.indexOf('--')).replace(/-/g, '.'), known: true };
  if (/^exbc/.test(id)) return { client: 'BitComet', version: null, known: true };
  return { client: 'Inconnu', version: null, known: false };
}
