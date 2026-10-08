import { extractInstallNotes } from './install-notes';

const NFO = [
  '╔══════════════════════════════════════╗',
  '║  Super.Editor.Pro.v12.3-GRP          ║',
  '╚══════════════════════════════════════╝',
  '',
  ' SYSTEM REQUIREMENTS:',
  '   Windows 10 or later, 4 GB RAM',
  '',
  ' INSTALL NOTES:',
  '   1. Unpack the release',
  '   2. Run setup.exe and install',
  '   3. Copy the crack to the install folder',
  '',
  ' RELEASE NOTES:',
  '   Cracked by GRP. Block the program in your firewall.',
  '',
  ' GREETZ:',
  '   to all our friends',
].join('\n');

describe('instructions extraites du NFO', () => {
  it('rubriques reconnues : configuration, installation, notes (les salutations sont ignorées)', () => {
    const s = extractInstallNotes(NFO);
    expect(s.map((x) => x.title)).toEqual(['Configuration requise', 'Installation', 'Notes']);
    expect(s[1].lines).toEqual(['1. Unpack the release', '2. Run setup.exe and install', '3. Copy the crack to the install folder']);
    expect(s[2].lines[0]).toMatch(/Block the program/);
    expect(JSON.stringify(s)).not.toMatch(/friends/);
  });

  it('NFO encadré dont les cadres sont mal décodés (CP437 lu en latin1)', () => {
    const nfo = ['³ HOW TO INSTALL', '³ 1) Mount the iso', '³ 2) Install', '', '', '³ OTHER'].join('\n');
    const s = extractInstallNotes(nfo);
    expect(s).toHaveLength(1);
    expect(s[0]).toEqual({ title: 'Installation', lines: ['1) Mount the iso', '2) Install'] });
  });

  it('rubrique sur une seule ligne et NFO sans instructions', () => {
    expect(extractInstallNotes('Installation: lancez setup.exe puis suivez les étapes')).toEqual([{ title: 'Installation', lines: ['lancez setup.exe puis suivez les étapes'] }]);
    expect(extractInstallNotes('General\nComplete name : film.mkv\nFormat : Matroska')).toEqual([]);
    expect(extractInstallNotes('')).toEqual([]);
  });
});
