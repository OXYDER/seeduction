import { passwordProblem } from './password-policy';

describe('passwordProblem', () => {
  it('accepte une phrase de passe ou un mot de passe aléatoire', () => {
    expect(passwordProblem('Le canard mauve traverse la rue 42')).toBeNull();
    expect(passwordProblem('k7#Vd9!qPz2m')).toBeNull();
    expect(passwordProblem('Nouveau-mot-de-passe-9')).toBeNull();
  });
  it('refuse trop court et trop long', () => {
    expect(passwordProblem('abc12')).toMatch(/trop court/);
    expect(passwordProblem('x'.repeat(200))).toMatch(/trop long/);
  });
  it('refuse les mots de passe courants, avec ou sans majuscules, accents ou chiffres de fin', () => {
    for (const p of ['password', 'Password1', 'MotDePasse', 'azerty123', 'Canadiens2024', 'seeduction99', 'qwertyuiop', 'iloveyou1']) expect(passwordProblem(p)).toMatch(/trop courant/);
  });
  it('refuse les suites évidentes et les répétitions', () => {
    expect(passwordProblem('12345678')).not.toBeNull();
    expect(passwordProblem('abcdefghij')).toMatch(/suite évidente/);
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/répétitif/);
    expect(passwordProblem('1234567890')).toMatch(/chiffres|suite/);
  });
  it('refuse un mot de passe qui contient le pseudo ou le début du courriel', () => {
    expect(passwordProblem('Marie-Claude-2024!', { username: 'marieclaude' })).toBeNull(); // le tiret change le mot : seul le texte exact est refusé
    expect(passwordProblem('xxMarieClaudexx', { username: 'MarieClaude' })).toMatch(/pseudo/);
    expect(passwordProblem('ZoeDupuis!!77', { username: 'zz', email: 'zoedupuis@exemple.com' })).toMatch(/courriel/);
  });
  it('un pseudo très court n\'interdit rien', () => {
    expect(passwordProblem('Ma phrase longue toto 77', { username: 'to' })).toBeNull();
  });
});
