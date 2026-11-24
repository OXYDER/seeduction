package org.seeduction.player

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Un onglet du catalogue : sa vue et ce qu'il fait quand on y revient. */
interface VodScreen {
    val view: View
    fun onShow() {}
}

/**
 * « Seeduction Cinéma » : l'application de vidéo à la demande. Cinq onglets (Accueil, Films, Séries, Explorer, Recherche). Sans session, l'écran demande le code d'association affiché
 * sur la page « Lecteur » du site (ou s'ouvre par le lien seeduction://vod/<code>).
 */
class VodHomeActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var root: FrameLayout
    private var pairing = false
    private var screens: List<VodScreen> = emptyList()
    private var navItems: List<Pair<ImageView, TextView>> = emptyList()
    private var current = 0
    private lateinit var holder: FrameLayout

    private val tabs = listOf(
        Triple("Accueil", R.drawable.ic_home, 0), Triple("Films", R.drawable.ic_movie, 1), Triple("Séries", R.drawable.ic_tv, 2),
        Triple("Explorer", R.drawable.ic_explore, 3), Triple("Recherche", R.drawable.ic_search, 4),
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        prefs = Prefs(this)
        root = FrameLayout(this).apply { setBackgroundColor(Ui.BG) }
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (prefs.vodToken != null && current != 0) select(0) else { isEnabled = false; onBackPressedDispatcher.onBackPressed() } }
        })
        render()
        handleLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLink(intent)
    }

    /** Lien seeduction://vod/<code> (bouton du site) : on associe tout de suite. */
    private fun handleLink(i: Intent?) {
        val code = if (i?.action == Intent.ACTION_VIEW) i.data?.lastPathSegment else null
        if (!code.isNullOrBlank()) connect(code)
    }

    override fun onResume() {
        super.onResume()
        if (prefs.vodToken == null && screens.isNotEmpty()) render()
        if (prefs.vodToken != null && screens.isNotEmpty()) screens[current].onShow()
    }

    private fun render() {
        root.removeAllViews()
        screens = emptyList()
        if (prefs.vodToken == null) { renderPairing(); return }
        val tv = isTv()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        holder = FrameLayout(this)
        screens = listOf(HomeScreen(this), BrowseScreen(this, "film", "Films"), BrowseScreen(this, "serie", "Séries"), ExploreScreen(this), SearchScreen(this))
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(Ui.NAV)
            if (tv) { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(40), dp(10), dp(32), dp(10)) } else setPadding(0, dp(6), 0, dp(6))
        }
        if (tv) nav.addView(label("SEEDUCTION", 17f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.16f; setPadding(0, 0, dp(30), 0) })
        navItems = tabs.map { (name, ic, idx) ->
            val img = ImageView(this).apply { setImageResource(ic); setColorFilter(Ui.MUTED); layoutParams = LinearLayout.LayoutParams(dp(if (tv) 22 else 24), dp(if (tv) 22 else 24)) }
            val txt = label(name, if (tv) 12f else 10.5f, Ui.MUTED, Ui.bold).apply { setPadding(if (tv) dp(8) else 0, if (tv) 0 else dp(2), 0, 0) }
            val item = LinearLayout(this).apply {
                orientation = if (tv) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity = Gravity.CENTER; isClickable = true
                if (tv) setPadding(dp(16), dp(9), dp(18), dp(9)) else setPadding(0, dp(4), 0, dp(2))
                setOnClickListener { select(idx) }
                tvFocus(if (tv) 22f else 8f)
            }
            item.addView(img); item.addView(txt)
            nav.addView(item, if (tv) LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(6) } else LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            img to txt
        }
        if (tv) {
            nav.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
            nav.addView(icon(R.drawable.ic_settings, 22, Ui.TEXT).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)); isClickable = true; setOnClickListener { startActivity(Intent(this@VodHomeActivity, VodSettingsActivity::class.java)) }; tvFocus(24f) })
            nav.addView(icon(R.drawable.ic_more, 24, Ui.TEXT).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)); isClickable = true; setOnClickListener { menu(this) }; tvFocus(24f) })
        }
        val line = View(this).apply { setBackgroundColor(Ui.LINE) }
        if (tv) {
            col.addView(nav); col.addView(line, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1))
            col.addView(holder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        } else {
            col.addView(holder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            col.addView(line, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1)); col.addView(nav)
        }
        root.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        select(current)
    }

    fun select(idx: Int) {
        current = idx
        holder.removeAllViews()
        holder.addView(screens[idx].view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        navItems.forEachIndexed { i, (img, tv) -> val c = if (i == idx) Ui.GOLD else Ui.MUTED; img.setColorFilter(c); tv.setTextColor(c) }
        screens[idx].onShow()
    }

    /** Menu discret (⋮) : partages en cours, déconnexion. */
    fun menu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 4, 0, "Paramètres")
            menu.add(0, 1, 1, "Mes partages et téléchargements")
            menu.add(0, 2, 2, "Ouvrir Seeduction")
            menu.add(0, 3, 3, "Déconnecter le catalogue")
            setOnMenuItemClickListener {
                when (it.itemId) {
                    4 -> startActivity(Intent(this@VodHomeActivity, VodSettingsActivity::class.java))
                    1 -> startActivity(Intent(this@VodHomeActivity, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true))
                    2 -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE)))
                    3 -> { prefs.vodToken = null; prefs.vodUser = null; current = 0; render() }
                }
                true
            }
        }.show()
    }

    // ------------------------------------------------------------------ association

    private var deviceJob: Job? = null

    private fun renderPairing() { if (isTv()) renderTvPairing() else renderPhonePairing() }

    /** Télé ou box : un code s'affiche à l'écran, le membre le saisit sur le site (page « Lecteur ») ; rien à taper à la télécommande. */
    private fun renderTvPairing() {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(64), dp(32), dp(64), dp(32)) }
        val left = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        left.addView(label("SEEDUCTION", 30f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.18f })
        left.addView(label("CINÉMA", 13f, Ui.MUTED, Ui.bold).apply { letterSpacing = 0.5f; setPadding(0, dp(2), 0, dp(22)) })
        left.addView(label("Connecte cette télé à ton compte", 26f, Ui.TEXT, Ui.black))
        left.addView(label("Réservé aux donateurs ❤️, aux membres fondateurs et aux uploaders.", 14f, Ui.MUTED).apply { setPadding(0, dp(8), 0, dp(20)) })
        left.addView(label("1. Sur ton téléphone ou ton ordinateur, ouvre seeduction.org, page « Lecteur ».\n2. Dans « Seeduction Cinéma », zone « Connecter une télé ou une box ».\n3. Saisis le code affiché ici.", 15f, Ui.TEXT).apply { setLineSpacing(0f, 1.3f) })
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(26), 0, 0) }
        val right = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; background = roundRect(Ui.SURFACE, dpf(16f), Ui.LINE, 2); setPadding(dp(40), dp(36), dp(40), dp(36)) }
        right.addView(label("Ton code", 14f, Ui.MUTED, Ui.bold))
        val codeView = label("········", 44f, Ui.GOLD2, Ui.black).apply { typeface = Typeface.MONOSPACE; letterSpacing = 0.12f; setPadding(0, dp(10), 0, dp(10)) }
        right.addView(codeView)
        val status = label("Connexion au site…", 14f, Ui.MUTED).apply { gravity = Gravity.CENTER }
        right.addView(status)
        buttons.addView(pillButton("Nouveau code", null, true) { startDeviceFlow(codeView, status) })
        buttons.addView(View(this), LinearLayout.LayoutParams(dp(14), 1))
        buttons.addView(pillButton("Saisir un code", null, false) { renderPhonePairing() })
        buttons.addView(View(this), LinearLayout.LayoutParams(dp(14), 1))
        buttons.addView(pillButton("Partages", null, false) { startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true)) })
        left.addView(buttons)
        row.addView(left, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.25f))
        row.addView(right, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(48) })
        root.removeAllViews()
        root.addView(ScrollView(this).apply { addView(row); isFillViewport = true })
        startDeviceFlow(codeView, status)
    }

    private fun startDeviceFlow(codeView: TextView, status: TextView) {
        deviceJob?.cancel()
        codeView.text = "········"; status.text = "Connexion au site…"
        deviceJob = lifecycleScope.launch {
            try {
                val d = VodApi.deviceStart()
                codeView.text = d.userCode.take(4) + " " + d.userCode.drop(4)
                status.text = "En attente de la saisie sur le site…"
                val end = System.currentTimeMillis() + d.expiresInSeconds * 1000L
                while (System.currentTimeMillis() < end) {
                    delay(d.intervalSeconds * 1000L)
                    val name = VodApi.devicePoll(d.deviceCode, prefs)
                    if (name != null) {
                        Toast.makeText(this@VodHomeActivity, "Connecté" + (if (name.isNotEmpty()) " : $name" else ""), Toast.LENGTH_SHORT).show()
                        current = 0; render(); return@launch
                    }
                }
                status.text = "Code expiré : choisis « Nouveau code »."
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { status.text = "Impossible de joindre le site : " + (e.message ?: "erreur réseau") }
        }
    }

    private fun renderPhonePairing() {
        deviceJob?.cancel()
        root.removeAllViews()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(48), dp(24), dp(24)); gravity = Gravity.CENTER_HORIZONTAL }
        col.addView(label("SEEDUCTION", 26f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.18f })
        col.addView(label("CINÉMA", 12f, Ui.MUTED, Ui.bold).apply { letterSpacing = 0.5f; setPadding(0, dp(2), 0, dp(28)) })
        col.addView(label("Tous les films et séries\nde Seeduction, dans ta poche.", 22f, Ui.TEXT, Ui.black).apply { gravity = Gravity.CENTER })
        col.addView(label("Réservé aux donateurs ❤️, aux membres fondateurs et aux uploaders.", 13f, Ui.MUTED).apply { gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(22)) })
        col.addView(label("1. Sur le site, ouvre la page « Lecteur ».\n2. Touche « Connecter l'application » : un code s'affiche.\n3. Saisis-le ci-dessous.", 13.5f, Ui.TEXT).apply { setLineSpacing(0f, 1.25f) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val field = EditText(this).apply {
            hint = "CODE"; setHintTextColor(Ui.MUTED); setTextColor(Ui.TEXT); textSize = 26f; typeface = Typeface.MONOSPACE; letterSpacing = 0.25f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_DONE; gravity = Gravity.CENTER; setSingleLine()
            background = roundRect(Ui.SURFACE, dpf(10f), Ui.LINE, 1); setPadding(dp(12), dp(14), dp(12), dp(14))
        }
        col.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(22) })
        val go = pillButton("Connecter", null, true) { connect(field.text.toString()) }
        field.setOnEditorActionListener { _, _, _ -> connect(field.text.toString()); true }
        col.addView(go, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) })
        if (isTv()) col.addView(label("Afficher un code sur la télé", 13f, Ui.GOLD, Ui.bold).apply { setPadding(dp(8), dp(16), dp(8), dp(8)); isClickable = true; tvFocus(6f); setOnClickListener { renderTvPairing() } })
        col.addView(label("Ouvrir la page du site", 13f, Ui.GOLD, Ui.bold).apply { setPadding(dp(8), dp(16), dp(8), dp(10)); isClickable = true; tvFocus(6f); setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE + "/player"))) } })
        col.addView(label("Lecteur et partages", 13f, Ui.MUTED, Ui.bold).apply { setPadding(dp(8), dp(6), dp(8), dp(6)); isClickable = true; tvFocus(6f); setOnClickListener { startActivity(Intent(this@VodHomeActivity, MainActivity::class.java).putExtra(MainActivity.EXTRA_NO_REDIRECT, true)) } })
        root.addView(ScrollView(this).apply { addView(col); isFillViewport = true })
    }

    private fun connect(code: String) {
        val clean = code.uppercase().filter { it.isLetterOrDigit() }
        if (clean.length < 6) { Toast.makeText(this, "Saisis le code affiché sur le site.", Toast.LENGTH_SHORT).show(); return }
        pairing = true
        lifecycleScope.launch {
            try {
                val name = VodApi.pair(clean, prefs)
                Toast.makeText(this@VodHomeActivity, "Connecté" + (if (name.isNotEmpty()) " : $name" else ""), Toast.LENGTH_SHORT).show()
                pairing = false
                current = 0; render()
            } catch (e: Exception) {
                pairing = false
                Toast.makeText(this@VodHomeActivity, e.message ?: "Association impossible", Toast.LENGTH_LONG).show()
            }
        }
    }
}

// ====================================================================== Accueil

/** L'accueil : une grande affiche du jour, puis les rangées (reprendre, recommandations, nouveautés, sagas, genres...). */
class HomeScreen(private val act: VodHomeActivity) : VodScreen {
    private val col = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
    override val view: View = FrameLayout(act).apply {
        addView(ScrollView(act).apply { addView(col); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    private var loadedAt = 0L
    private var job: Job? = null

    override fun onShow() {
        if (System.currentTimeMillis() - loadedAt < 60_000 && col.childCount > 0) return
        val token = Prefs(act).vodToken ?: return
        if (col.childCount == 0) col.addView(act.label("Chargement du catalogue…", 14f, Ui.MUTED).apply { setPadding(act.dp(16), act.dp(80), act.dp(16), 0) })
        job?.cancel()
        job = act.lifecycleScope.launch {
            try {
                val home = VodApi.home(token)
                loadedAt = System.currentTimeMillis()
                col.removeAllViews()
                col.addView(hero(home.hero))
                if (home.rails.isEmpty()) col.addView(act.label("Rien à regarder pour l'instant : le catalogue ne montre que les titres qui ont au moins un seeder.", 14f, Ui.MUTED).apply { setPadding(act.dp(16), act.dp(24), act.dp(16), 0) })
                home.rails.forEach { col.addView(act.railView(it)) }
                col.addView(View(act), LinearLayout.LayoutParams(1, act.dp(28)))
            } catch (e: VodAuthException) {
                Prefs(act).vodToken = null; Toast.makeText(act, e.message, Toast.LENGTH_LONG).show(); act.recreate()
            } catch (e: Exception) {
                Journal.log("catalogue : " + e.message)
                col.removeAllViews()
                col.addView(act.label("Impossible de charger le catalogue :\n" + (e.message ?: "erreur réseau"), 14f, Ui.MUTED).apply { setPadding(act.dp(16), act.dp(80), act.dp(16), act.dp(12)) })
                col.addView(act.pillButton("Réessayer", null, true) { loadedAt = 0; onShow() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { leftMargin = act.dp(16) })
            }
        }
    }

    /** La grande affiche du jour : image, genre, titre, boutons Lecture et Infos. Sur téléphone, le logo et le menu flottent dessus ; sur télé, texte à gauche et image à droite. */
    private fun hero(h: VodItem?): View {
        val tv = act.isTv()
        val w = act.screenW()
        val frame = FrameLayout(act)
        val heroH = if (tv) (w * 0.36f).toInt() else (w * 1.28f).toInt()
        if (h != null && tv) {
            val imgW = (w * 0.52f).toInt()
            val img = ImageView(act).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            Images.load(img, h.cover, imgW * 2)
            frame.addView(img, FrameLayout.LayoutParams(imgW, heroH, Gravity.END))
            frame.addView(View(act).apply { background = android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Ui.BG, Color.TRANSPARENT)) }, FrameLayout.LayoutParams(imgW, heroH, Gravity.END))
            frame.addView(View(act).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (heroH * 0.35f).toInt(), Gravity.BOTTOM))
            val info = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(act.dp(48), act.dp(8), act.dp(16), act.dp(10)) }
            info.addView(act.label(if (h.kind == "serie") "SÉRIE" else "FILM", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f })
            info.addView(act.label(h.title, 30f, Ui.TEXT, Ui.black).apply { maxLines = 2; setPadding(0, act.dp(2), 0, act.dp(4)) })
            val line = (h.genres.take(3) + listOfNotNull(h.year?.toString())).joinToString("  •  ")
            if (line.isNotEmpty()) info.addView(act.label(line, 12.5f, Ui.TEXT, Ui.medium))
            h.synopsis?.let { info.addView(act.label(it, 12.5f, Color.parseColor("#D5DAE8")).apply { maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END; setPadding(0, act.dp(8), 0, 0) }) }
            val buttons = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, act.dp(14), 0, 0) }
            val play = act.pillButton("Lecture", R.drawable.ic_play, true) { act.startActivity(Intent(act, VodTitleActivity::class.java).putExtra(VodTitleActivity.EXTRA_ID, h.id).putExtra(VodTitleActivity.EXTRA_AUTOPLAY, true)) }
            buttons.addView(play)
            buttons.addView(View(act), LinearLayout.LayoutParams(act.dp(12), 1))
            buttons.addView(act.pillButton("Infos", R.drawable.ic_info, false) { act.openItem(h) })
            info.addView(buttons)
            frame.addView(info, FrameLayout.LayoutParams((w * 0.55f).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL or Gravity.START))
            play.post { play.requestFocus() }
            return frame
        }
        if (h != null) {
            val img = ImageView(act).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
            Images.load(img, h.cover, w * 2)
            frame.addView(img, FrameLayout.LayoutParams(w, heroH))
            frame.addView(View(act).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(w, (heroH * 0.62f).toInt(), Gravity.BOTTOM))
            frame.addView(View(act).apply { background = vGradient(Color.parseColor("#B006080F"), Color.TRANSPARENT) }, FrameLayout.LayoutParams(w, act.dp(90), Gravity.TOP))
            val info = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(act.dp(20), 0, act.dp(20), act.dp(14)) }
            info.addView(act.label(if (h.kind == "serie") "SÉRIE" else "FILM", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f })
            info.addView(act.label(h.title, 30f, Ui.TEXT, Ui.black).apply { gravity = Gravity.CENTER; maxLines = 2; setPadding(0, act.dp(2), 0, act.dp(4)); setShadowLayer(12f, 0f, 2f, Color.BLACK) })
            val line = (h.genres.take(3) + listOfNotNull(h.year?.toString())).joinToString("  •  ")
            if (line.isNotEmpty()) info.addView(act.label(line, 12.5f, Ui.TEXT, Ui.medium).apply { gravity = Gravity.CENTER })
            h.synopsis?.let { info.addView(act.label(it, 12.5f, Color.parseColor("#D5DAE8")).apply { gravity = Gravity.CENTER; maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END; setPadding(0, act.dp(8), 0, 0) }) }
            val buttons = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(0, act.dp(14), 0, 0) }
            buttons.addView(act.pillButton("Lecture", R.drawable.ic_play, true) { act.startActivity(Intent(act, VodTitleActivity::class.java).putExtra(VodTitleActivity.EXTRA_ID, h.id).putExtra(VodTitleActivity.EXTRA_AUTOPLAY, true)) })
            buttons.addView(View(act), LinearLayout.LayoutParams(act.dp(10), 1))
            buttons.addView(act.pillButton("Infos", R.drawable.ic_info, false) { act.openItem(h) })
            info.addView(buttons)
            frame.addView(info, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        } else frame.addView(View(act), FrameLayout.LayoutParams(w, act.dp(if (tv) 20 else 70)))
        if (!tv) {
            val top = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(act.dp(16), act.dp(10), act.dp(6), 0) }
            top.addView(act.label("SEEDUCTION", 17f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.16f; setShadowLayer(10f, 0f, 2f, Color.BLACK) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val gear = act.icon(R.drawable.ic_settings, 22, Ui.TEXT).apply { setPadding(act.dp(10), act.dp(10), act.dp(10), act.dp(10)); isClickable = true; layoutParams = LinearLayout.LayoutParams(act.dp(44), act.dp(44)); setOnClickListener { act.startActivity(Intent(act, VodSettingsActivity::class.java)) } }
            top.addView(gear)
            val more = act.icon(R.drawable.ic_more, 24, Ui.TEXT).apply { setPadding(act.dp(8), act.dp(8), act.dp(8), act.dp(8)); isClickable = true; layoutParams = LinearLayout.LayoutParams(act.dp(44), act.dp(44)); setOnClickListener { act.menu(this) } }
            top.addView(more)
            frame.addView(top, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        }
        return frame
    }
}

// ====================================================================== Films / Séries

private val SORTS = listOf("new" to "Nouveautés", "seeders" to "Les plus regardés", "name" to "Nom (A → Z)", "year" to "Année", "rating" to "Mieux notés")

/** Un onglet de liste complète (Films ou Séries) : filtre par genre, tri, grille infinie. */
class BrowseScreen(private val act: VodHomeActivity, private val kind: String, private val title: String) : VodScreen {
    private var genre: String? = null
    private var sort = "new"
    private val chips = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; setPadding(act.dp(16), 0, act.dp(16), act.dp(8)) }
    private val grid = PagedGrid(act) { page -> VodApi.browse(Prefs(act).vodToken ?: "", mapOf("kind" to kind, "genre" to genre, "sort" to sort), page) }
    private var started = false
    override val view: View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG)
        addView(act.label(title, 26f, Ui.TEXT, Ui.black).apply { setPadding(act.dp(16), act.dp(18), act.dp(16), act.dp(10)) })
        addView(HorizontalScrollView(act).apply { addView(chips); isHorizontalScrollBarEnabled = false })
        addView(grid.view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    init { drawChips() }

    private fun drawChips() {
        chips.removeAllViews()
        chips.addView(act.chip(genre ?: "Tous les genres", genre != null, true) { pickGenre() })
        chips.addView(View(act), LinearLayout.LayoutParams(act.dp(8), 1))
        chips.addView(act.chip(SORTS.first { it.first == sort }.second, false, true) { pickSort() })
    }

    private fun pickSort() {
        AlertDialog.Builder(act).setTitle("Trier par").setItems(SORTS.map { it.second }.toTypedArray()) { _, i -> sort = SORTS[i].first; drawChips(); grid.reset() }.show()
    }

    private fun pickGenre() {
        val token = Prefs(act).vodToken ?: return
        act.lifecycleScope.launch {
            try {
                val gs = VodApi.genres(token, kind)
                val names = listOf("Tous les genres") + gs.map { it.name + "  (" + it.count + ")" }
                AlertDialog.Builder(act).setTitle("Genre").setItems(names.toTypedArray()) { _, i -> genre = if (i == 0) null else gs[i - 1].name; drawChips(); grid.reset() }.show()
            } catch (e: Exception) { Toast.makeText(act, e.message ?: "Genres indisponibles", Toast.LENGTH_SHORT).show() }
        }
    }

    override fun onShow() { if (!started) { started = true; grid.reset() } }
}

// ====================================================================== Explorer

/** Explorer : par genre, par saga, de A à Z, et quelques raccourcis (nouveautés, mieux notés...). */
class ExploreScreen(private val act: VodHomeActivity) : VodScreen {
    private val col = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, act.dp(24)) }
    override val view: View = ScrollView(act).apply { addView(col); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false }
    private var loaded = false

    private fun section(t: String) = act.label(t, 17f, Ui.TEXT, Ui.black).apply { setPadding(act.dp(16), act.dp(22), act.dp(16), act.dp(10)) }

    private fun list(title: String, kind: String? = null, genre: String? = null, sort: String? = null, letter: String? = null, sagas: Boolean = false) {
        act.startActivity(Intent(act, VodListActivity::class.java).putExtra(VodListActivity.EXTRA_TITLE, title).putExtra(VodListActivity.EXTRA_KIND, kind)
            .putExtra(VodListActivity.EXTRA_GENRE, genre).putExtra(VodListActivity.EXTRA_SORT, sort).putExtra(VodListActivity.EXTRA_LETTER, letter).putExtra(VodListActivity.EXTRA_SAGAS, sagas))
    }

    private fun tile(text: String, sub: String?, hue: Float, onClick: () -> Unit): View {
        val d = android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR, intArrayOf(Color.HSVToColor(floatArrayOf(hue, 0.55f, 0.55f)), Color.HSVToColor(floatArrayOf((hue + 40f) % 360f, 0.6f, 0.22f)))).apply { cornerRadius = act.dpf(8f) }
        return LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.BOTTOM; setPadding(act.dp(12), act.dp(10), act.dp(12), act.dp(10)); background = d; isClickable = true; isFocusable = true; setOnClickListener { onClick() }; tvFocus(8f)
            addView(act.label(text, 15f, Ui.TEXT, Ui.black).apply { maxLines = 2 })
            if (sub != null) addView(act.label(sub, 11f, Color.parseColor("#D5DAE8")))
        }
    }

    private fun grid(views: List<View>, cols: Int, h: Int): View {
        val box = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(act.dp(12), 0, act.dp(12), 0) }
        views.chunked(cols).forEach { r ->
            val row = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL }
            r.forEach { v -> row.addView(v, LinearLayout.LayoutParams(0, h, 1f).apply { setMargins(act.dp(4), act.dp(4), act.dp(4), act.dp(4)) }) }
            repeat(cols - r.size) { row.addView(View(act), LinearLayout.LayoutParams(0, h, 1f).apply { setMargins(act.dp(4), act.dp(4), act.dp(4), act.dp(4)) }) }
            box.addView(row)
        }
        return box
    }

    override fun onShow() {
        if (loaded) return
        val token = Prefs(act).vodToken ?: return
        col.removeAllViews()
        col.addView(act.label("Explorer", 26f, Ui.TEXT, Ui.black).apply { setPadding(act.dp(16), act.dp(18), act.dp(16), 0) })
        col.addView(section("Raccourcis"))
        col.addView(grid(listOf(
            tile("Nouveautés", "Ajoutés récemment", 38f) { list("Nouveautés", sort = "new") },
            tile("Les plus regardés", "Les mieux seedés", 150f) { list("Les plus regardés", sort = "seeders") },
            tile("Mieux notés", "Les meilleures notes", 280f) { list("Mieux notés", sort = "rating") },
            tile("Sagas", "Films à suites", 340f) { list("Sagas", sagas = true) },
        ), 2, act.dp(72)))
        col.addView(section("Genres"))
        val genresBox = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
        col.addView(genresBox)
        col.addView(section("De A à Z"))
        val letters = ('A'..'Z').map { it.toString() } + "#"
        col.addView(grid(letters.map { l ->
            LinearLayout(act).apply {
                gravity = Gravity.CENTER; background = roundRect(Ui.SURFACE2, act.dpf(8f), Ui.LINE, 1); isClickable = true; isFocusable = true; tvFocus(8f)
                setOnClickListener { list("Titres en « $l »", sort = "name", letter = l) }
                addView(act.label(l, 17f, Ui.TEXT, Ui.black))
            }
        }, 7, act.dp(46)))
        act.lifecycleScope.launch {
            try {
                val gs = VodApi.genres(token, null)
                genresBox.addView(grid(gs.take(24).mapIndexed { i, g -> tile(g.name, g.count.toString() + " titres", (i * 47f) % 360f) { list(g.name, genre = g.name, sort = "seeders") } }, 2, act.dp(64)))
                loaded = true
            } catch (e: VodAuthException) { Prefs(act).vodToken = null; act.recreate() } catch (e: Exception) { genresBox.addView(act.label("Genres indisponibles : " + (e.message ?: "erreur réseau"), 13f, Ui.MUTED).apply { setPadding(act.dp(16), 0, act.dp(16), 0) }) }
        }
    }
}

// ====================================================================== Recherche

class SearchScreen(private val act: VodHomeActivity) : VodScreen {
    private var query = ""
    private val grid = PagedGrid(act) { page -> VodApi.browse(Prefs(act).vodToken ?: "", mapOf("q" to query, "sort" to "seeders"), page) }
    private val field = EditText(act).apply {
        hint = "Film, série, saga…"; setHintTextColor(Ui.MUTED); setTextColor(Ui.TEXT); textSize = 16f; setSingleLine(); inputType = InputType.TYPE_CLASS_TEXT; imeOptions = EditorInfo.IME_ACTION_SEARCH
        background = null; setPadding(act.dp(8), act.dp(12), act.dp(8), act.dp(12))
    }
    private var debounce: Job? = null
    override val view: View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG)
        val bar = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = roundRect(Ui.SURFACE, act.dpf(10f), Ui.LINE, 1); setPadding(act.dp(12), 0, act.dp(8), 0) }
        bar.addView(act.icon(R.drawable.ic_search, 22, Ui.MUTED))
        bar.addView(field, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(act.dp(16), act.dp(18), act.dp(16), act.dp(8)) })
        addView(grid.view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    init {
        field.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {
                query = s?.toString()?.trim() ?: ""
                debounce?.cancel()
                debounce = act.lifecycleScope.launch { delay(350); if (query.length >= 2) grid.reset() else grid.clear() }
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        field.setOnEditorActionListener { v, _, _ -> (act.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(v.windowToken, 0); true }
    }

    override fun onShow() { field.requestFocus() }
}
