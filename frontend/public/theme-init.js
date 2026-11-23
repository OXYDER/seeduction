// Applique le thème choisi avant le premier rendu, pour éviter un flash du thème par défaut.
// Seul "prestige" existe encore (les anciens thèmes Doré classique/Écarlate/Nuit Argentée ont été retirés) :
// une valeur différente encore en localStorage (ancien choix) est ignorée plutôt qu'appliquée.
// Apparence : sombre (défaut), clair, ou auto (suit le système) — clé « seeduction-mode ».
// Fichier à part (et non un script dans la page) pour que la politique de sécurité du site puisse interdire les scripts « en ligne ».
(function () {
  try {
    document.documentElement.setAttribute('data-theme', 'prestige');
    var accent = localStorage.getItem('seeduction-accent');
    if (accent && accent !== 'violet') document.documentElement.setAttribute('data-accent', accent);
    var mode = localStorage.getItem('seeduction-mode');
    var light = mode === 'light' || (mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (light) document.documentElement.setAttribute('data-mode', 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'prestige');
  }
})();
