// Applique le thème choisi avant le premier rendu, pour éviter un flash du thème par défaut.
// Seul "prestige" existe encore comme mise en page (les anciens thèmes Doré classique/Écarlate/Nuit Argentée ont été retirés) :
// une valeur différente encore en localStorage (ancien choix) est ignorée plutôt qu'appliquée.
// Apparence : sombre (défaut), clair, ou auto (suit le système) — clé « seeduction-mode ».
// Ambiance : Prestige (défaut), Cinéma, Terminal, Papier — clé « seeduction-ambiance » (Cinéma et Terminal imposent le sombre, Papier le clair).
// Couleur libre : « seeduction-accent-custom » garde les variables déjà calculées (voir lib/accentColor.ts), une série pour le fond sombre, une pour le clair.
// Fichier à part (et non un script dans la page) pour que la politique de sécurité du site puisse interdire les scripts « en ligne ».
(function () {
  var root = document.documentElement;
  try {
    root.setAttribute('data-theme', 'prestige');
    var accent = localStorage.getItem('seeduction-accent');
    if (accent && accent !== 'violet') root.setAttribute('data-accent', accent);
    var amb = localStorage.getItem('seeduction-ambiance');
    if (amb !== 'cinema' && amb !== 'terminal' && amb !== 'papier') amb = '';
    if (amb) root.setAttribute('data-ambiance', amb);
    var mode = localStorage.getItem('seeduction-mode');
    var light = amb ? amb === 'papier' : mode === 'light' || (mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (light) root.setAttribute('data-mode', 'light');
    if (accent === 'custom') {
      var c = JSON.parse(localStorage.getItem('seeduction-accent-custom') || 'null');
      var vars = c && (light ? c.light : c.dark);
      if (vars) for (var k in vars) if (!(amb && k.indexOf('--aurora') === 0)) root.style.setProperty(k, vars[k]);
    }
  } catch (e) {
    root.setAttribute('data-theme', 'prestige');
  }
})();
