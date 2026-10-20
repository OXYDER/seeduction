import { ipv6ToBuffer } from './tracker.controller';

describe('ipv6ToBuffer', () => {
  it('adresse complète et abrégée, avec le port', () => {
    const a = ipv6ToBuffer('2001:db8::1', 6881)!;
    expect(a.length).toBe(18);
    expect(a.subarray(0, 4).toString('hex')).toBe('20010db8');
    expect(a.readUInt16BE(14)).toBe(1);
    expect(a.readUInt16BE(16)).toBe(6881);
    expect(ipv6ToBuffer('2001:db8:0:0:0:0:0:1', 1)!.subarray(0, 16).equals(ipv6ToBuffer('2001:db8::1', 1)!.subarray(0, 16))).toBe(true);
    expect(ipv6ToBuffer('::1', 80)!.readUInt16BE(14)).toBe(1);
  });
  it('adresse illisible : ignorée', () => {
    expect(ipv6ToBuffer('pas-une-adresse', 80)).toBeNull();
    expect(ipv6ToBuffer('1.2.3.4', 80)).toBeNull();
    expect(ipv6ToBuffer('1:2:3', 80)).toBeNull();
  });
});
