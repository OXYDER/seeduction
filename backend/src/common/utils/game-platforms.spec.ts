import { detectGamePlatforms, detectPlatformIds, platformIdsFromRawg } from './game-platforms';
import { detectAttrs } from './attr-detect';

describe('plateformes de jeux', () => {
  it('reconnaît une console dans le nom', () => {
    expect(detectPlatformIds('Farming Simulator 25 PS5-DUPLEX', ['pkg'])).toEqual(['ps5']);
    expect(detectPlatformIds('Elden Ring XBOX360-COMPLEX', [])).toEqual(['xbox360']);
  });

  it('reconnaît une console par ses fichiers', () => {
    expect(detectPlatformIds('Mario Kart World', ['nsp'])).toEqual(['switch']);
    expect(detectPlatformIds('Some Game', ['apk'])).toEqual(['android']);
  });

  it('la plateforme précise prime sur la générale', () => {
    expect(detectPlatformIds('Mario Kart World Switch 2 NSP', ['nsp'])).toEqual(['switch2']);
    expect(detectPlatformIds('Mario Kart 8 Wii U', ['wux'])).toEqual(['wiiu']);
    expect(detectPlatformIds('Zelda 3DS', ['3ds'])).toEqual(['3ds']);
  });

  it('un repack PC est du Windows, sauf si une console est nommée', () => {
    expect(detectPlatformIds('Cyberpunk 2077 [FitGirl Repack]', ['exe'])).toEqual(['windows']);
    expect(detectPlatformIds('Game PS4 repack', ['exe'])).toEqual(['ps4']);
  });

  it("ne devine rien quand le nom n'en dit rien", () => {
    expect(detectPlatformIds('Hogwarts Legacy', [])).toEqual([]);
  });

  it('traduit les plateformes de RAWG', () => {
    expect(platformIdsFromRawg('PC, PlayStation 5, Xbox Series S/X, Nintendo Switch, iOS').sort()).toEqual(['ios', 'ps5', 'switch', 'windows', 'xboxseries'].sort());
    expect(platformIdsFromRawg('PlayStation 4')).toEqual(['ps4']);
    expect(platformIdsFromRawg('')).toEqual([]);
  });
});

describe('plateforme lue dans le NFO', () => {
  const nfo = 'Metal Gear Solid The Twin Snakes\n\nGenre(s) : Action, Adventure\nPlateforme(s) : GameCube\n\nPour Wii (je ne connais pas la procédure)\nremake de la version Playstation\nFormat : ISO';
  it('la ligne « Plateforme(s) » prime sur le reste du texte', () => {
    expect(detectGamePlatforms('GGSPA4', ['GGSPA4/game.iso'], nfo)).toEqual(['gamecube']);
  });
  it('sans ligne étiquetée, seul le nom compte', () => {
    expect(detectGamePlatforms('GGSPA4', ['game.iso'], 'pour Wii et PlayStation')).toEqual([]);
    expect(detectGamePlatforms('[NGC] Metal.Gear.Solid.The.Twin.Snakes [PAL-MULTI] ISO', [], undefined)).toEqual(['gamecube']);
  });
  it('les filtres du jeu viennent aussi du NFO', () => {
    const a = detectAttrs({ name: 'GGSPA4', files: [{ path: 'game.iso' }], nfo, top: 'Jeux Vidéo', leaf: 'Jeux Nintendo' });
    expect(a.consoleNintendo).toEqual(['GameCube']);
    expect(a.genreJeux).toEqual(['Action', 'Aventure']);
  });
});
