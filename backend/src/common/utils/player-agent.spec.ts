import { playerFromUserAgent } from './player-agent';

describe('lecteur Seeduction d\u2019après le User-Agent', () => {
  it('reconna\u00eet Android et le bureau, avec la version', () => {
    expect(playerFromUserAgent('Seeduction-Android/1.1.1')).toEqual({ platform: 'ANDROID', version: '1.1.1' });
    expect(playerFromUserAgent('Seeduction-Player/1.1.1 (win32)')).toEqual({ platform: 'WINDOWS', version: '1.1.1' });
    expect(playerFromUserAgent('Seeduction-Player/1.1.1 (darwin)')).toEqual({ platform: 'MAC', version: '1.1.1' });
    expect(playerFromUserAgent('Seeduction-Player/1.0.0')).toEqual({ platform: 'DESKTOP', version: '1.0.0' });
  });
  it('ignore les navigateurs et les autres outils', () => {
    expect(playerFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBeNull();
    expect(playerFromUserAgent(undefined)).toBeNull();
  });
});
