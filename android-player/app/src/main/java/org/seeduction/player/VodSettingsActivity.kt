package org.seeduction.player

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/** Paramètres de Seeduction Cinéma : lecteur intégré ou externe, partage en Wi-Fi, compte, partages en cours, diagnostic, mise à jour. */
class VodSettingsActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var col: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        prefs = Prefs(this)
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dp(30)) }
        setContentView(ScrollView(this).apply { addView(col); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false })
        render()
    }

    private fun section(t: String) = label(t.uppercase(), 11.5f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.12f; setPadding(dp(18), dp(24), dp(18), dp(8)) }

    private fun card(vararg views: View) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; background = roundRect(Ui.SURFACE, dpf(10f))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(16), 0, dp(16), 0) }
        views.forEach { addView(it) }
    }

    /** Une ligne à choix unique (bouton radio dessiné) avec titre et explication. */
    private fun choice(title: String, desc: String, selected: Boolean, onClick: () -> Unit): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(16), dp(14), dp(14), dp(14)); isClickable = true; isFocusable = true
            setOnClickListener { onClick() }
        }
        val txt = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        txt.addView(label(title, 15f, Ui.TEXT, Ui.bold))
        txt.addView(label(desc, 12.5f, Ui.MUTED).apply { setPadding(0, dp(3), 0, 0); setLineSpacing(0f, 1.15f) })
        row.addView(txt, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val dot = View(this).apply {
            background = if (selected) roundRect(Ui.GOLD, dpf(11f)) else roundRect(android.graphics.Color.TRANSPARENT, dpf(11f), Ui.MUTED, dp(2))
            layoutParams = LinearLayout.LayoutParams(dp(22), dp(22)).apply { leftMargin = dp(12) }
        }
        if (selected) { val chk = icon(R.drawable.ic_check, 16, Ui.INK); val fl = android.widget.FrameLayout(this).apply { layoutParams = LinearLayout.LayoutParams(dp(22), dp(22)).apply { leftMargin = dp(12) }; background = roundRect(Ui.GOLD, dpf(11f)) }; chk.layoutParams = android.widget.FrameLayout.LayoutParams(dp(16), dp(16), Gravity.CENTER); fl.addView(chk); row.addView(fl) }
        else row.addView(dot)
        return row
    }

    private fun divider() = View(this).apply { setBackgroundColor(Ui.LINE); layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply { leftMargin = dp(16) } }

    private fun action(title: String, desc: String?, color: Int = Ui.TEXT, onClick: () -> Unit): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(14)); isClickable = true; isFocusable = true; setOnClickListener { onClick() } }
        row.addView(label(title, 15f, color, Ui.bold))
        if (desc != null) row.addView(label(desc, 12.5f, Ui.MUTED).apply { setPadding(0, dp(3), 0, 0) })
        return row
    }

    private fun externalPlayers(): List<String> {
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("http://127.0.0.1/stream/x"), "video/*")
        return packageManager.queryIntentActivities(view, 0).filter { it.activityInfo.packageName != packageName }.map { it.loadLabel(packageManager).toString() }.distinct()
    }

    private fun render() {
        col.removeAllViews()
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(6), dp(12), dp(16), dp(4)) }
        bar.addView(icon(R.drawable.ic_back, 24, Ui.TEXT).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)); isClickable = true; setOnClickListener { finish() } })
        bar.addView(label("Paramètres", 22f, Ui.TEXT, Ui.black))
        col.addView(bar)

        // --- Lecture
        col.addView(section("Lecture"))
        val externals = externalPlayers()
        col.addView(card(
            choice("Lecteur intégré", "Lit la vidéo dans l'application : reprise là où tu t'es arrêté, sous-titres partagés par les membres, pistes audio, statut « en train de regarder » sur le site. Recommandé.", prefs.playerMode == PlayerMode.INTERNAL) { prefs.playerMode = PlayerMode.INTERNAL; render() },
            divider(),
            choice("Lecteur externe", "Ouvre une autre application vidéo installée (VLC, MX Player…) à chaque lecture. La reprise et le statut sur le site ne sont pas suivis par l'application." +
                (if (externals.isEmpty()) "\nAucune application vidéo externe détectée : la lecture se fera dans l'application." else "\nDétectées : " + externals.take(4).joinToString(", ") + "."), prefs.playerMode == PlayerMode.EXTERNAL) { prefs.playerMode = PlayerMode.EXTERNAL; render() },
        ))

        // --- Partage
        col.addView(section("Partage"))
        val wifi = Switch(this).apply {
            text = "Partager seulement en Wi-Fi"; setTextColor(Ui.TEXT); textSize = 15f; typeface = Ui.bold; isChecked = prefs.wifiOnlySeed; setPadding(dp(16), dp(14), dp(16), dp(4))
            setOnCheckedChangeListener { _, on -> prefs.wifiOnlySeed = on }
        }
        col.addView(card(wifi, label("Après la lecture, le partage continue en arrière-plan pour aider les autres membres. Sur données mobiles, il se met en pause si ce réglage est actif ; une lecture en cours n'est jamais coupée.", 12.5f, Ui.MUTED).apply { setPadding(dp(16), 0, dp(16), dp(14)); setLineSpacing(0f, 1.15f) },
            divider(), action("Mes partages et téléchargements", "Arrêter, reprendre ou supprimer ce qui est téléchargé.") { startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true)) }))

        // --- Compte
        col.addView(section("Compte"))
        col.addView(card(
            action("Connecté" + (prefs.vodUser?.let { " : $it" } ?: ""), "Le catalogue est réservé aux donateurs, fondateurs et uploaders.") {},
            divider(),
            action("Déconnecter le catalogue", "Il faudra un nouveau code d'association depuis le site.", Ui.TEXT) {
                AlertDialog.Builder(this).setTitle("Déconnecter ?").setMessage("L'application oubliera ta session. Tes partages en cours ne sont pas touchés.")
                    .setPositiveButton("Déconnecter") { _, _ -> prefs.vodToken = null; prefs.vodUser = null; startActivity(Intent(this, VodHomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)); finish() }
                    .setNegativeButton("Annuler", null).show()
            },
            divider(),
            action("Ouvrir Seeduction", Config.SITE.removePrefix("https://")) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE))) },
        ))

        // --- Application
        col.addView(section("Application"))
        col.addView(card(
            action("Rechercher une mise à jour", "Version " + Config.APP_VERSION) { checkUpdate() },
            divider(),
            action("Partager le journal de diagnostic", "Utile si une lecture ne démarre pas.") {
                val log = try { java.io.File(filesDir, "lecteur.log").readText().takeLast(20000) } catch (_: Exception) { "(journal vide)" }
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, "Journal de Seeduction Cinéma").putExtra(Intent.EXTRA_TEXT, log), "Envoyer le journal"))
            },
        ))
    }

    private fun checkUpdate() {
        lifecycleScope.launch {
            val rel = try { SiteApi.latestAndroid() } catch (e: Exception) { Toast.makeText(this@VodSettingsActivity, "Impossible de joindre le site pour vérifier les mises à jour.", Toast.LENGTH_LONG).show(); return@launch }
            if (rel == null || compareVersions(rel.version, Config.APP_VERSION) <= 0) { Toast.makeText(this@VodSettingsActivity, "Ton application est à jour (version " + Config.APP_VERSION + ").", Toast.LENGTH_LONG).show(); return@launch }
            AlertDialog.Builder(this@VodSettingsActivity).setTitle("Mise à jour disponible")
                .setMessage("Version " + rel.version + " (" + formatSize(rel.size) + ")." + (rel.notes?.let { "\n\nNouveautés : $it" } ?: "") + "\n\nLe fichier se télécharge dans ton navigateur : touche-le ensuite pour l'installer par-dessus (tes partages sont conservés).")
                .setPositiveButton("Télécharger") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE + rel.url))) }
                .setNegativeButton("Plus tard", null).show()
        }
    }
}
