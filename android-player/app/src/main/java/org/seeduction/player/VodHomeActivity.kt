package org.seeduction.player

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
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
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Un onglet du catalogue : sa vue et ce qu'il fait quand on y revient. */
interface VodScreen {
    val view: View
    fun onShow() {}
}

/**
 * Seeduction : l'application de vidéo à la demande. Quatre onglets (Accueil, Films, Séries, Recherche). Sans session : connexion par identifiant (ou courriel) et mot de passe,
 * ou, sur une télé, par QR code / code affiché à l'écran et saisi sur le site.
 */
class VodHomeActivity : AppCompatActivity() {
    override fun onStart() { super.onStart(); Presence.enter(this) }
    override fun onStop() { super.onStop(); Presence.leave() }

    private lateinit var prefs: Prefs
    private lateinit var root: FrameLayout
    private var screens: List<VodScreen> = emptyList()
    private var navItems: List<Pair<ImageView, TextView>> = emptyList()
    private var current = 0
    private lateinit var holder: FrameLayout
    private var deviceJob: Job? = null
    private var loginButton: View? = null

    private val tabs = listOf(
        Triple("Accueil", R.drawable.ic_home, 0), Triple("Films", R.drawable.ic_movie, 1), Triple("Séries", R.drawable.ic_tv, 2), Triple("Recherche", R.drawable.ic_search, 3),
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
        if (!code.isNullOrBlank()) pairWithCode(code)
    }

    override fun onResume() {
        super.onResume()
        if (prefs.vodToken == null && screens.isNotEmpty()) render()
        if (prefs.vodToken != null && screens.isNotEmpty()) screens[current].onShow()
        prefs.vodToken?.let { tk -> lifecycleScope.launch { ConnectionSpeed.ensure(prefs, tk) } }
    }

    private fun render() {
        deviceJob?.cancel()
        root.removeAllViews()
        screens = emptyList()
        if (prefs.vodToken == null) { renderLogin(); return }
        val tv = isTv()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        holder = FrameLayout(this)
        screens = listOf(HomeScreen(this), BrowseScreen(this, "film", "Films"), BrowseScreen(this, "serie", "Séries"), SearchScreen(this))
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(Ui.NAV)
            if (tv) { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(40), dp(10), dp(32), dp(10)) } else setPadding(0, dp(6), 0, dp(6))
        }
        if (tv) nav.addView(label("SEEDUCTION", 17f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.16f; setPadding(0, 0, dp(30), 0) })
        navItems = tabs.map { (name, ic, idx) ->
            val img = ImageView(this).apply { setImageResource(ic); setColorFilter(Ui.MUTED); layoutParams = LinearLayout.LayoutParams(dp(if (tv) 22 else 24), dp(if (tv) 22 else 24)) }
            val txt = label(name, if (tv) 12f else 10.5f, Ui.MUTED, Ui.bold).apply { setPadding(if (tv) dp(8) else 0, if (tv) 0 else dp(2), 0, 0); gravity = Gravity.CENTER_HORIZONTAL }
            val item = LinearLayout(this).apply {
                orientation = if (tv) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity = Gravity.CENTER; isClickable = true
                if (tv) setPadding(dp(16), dp(9), dp(18), dp(9)) else setPadding(0, dp(4), 0, dp(2))
                setOnClickListener { select(idx) }
                tvFocus(if (tv) 22f else 8f)
            }
            item.addView(img); item.addView(txt, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            nav.addView(item, if (tv) LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(6) } else LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            img to txt
        }
        if (tv) {
            nav.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
            nav.addView(avatar(36))
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

    // ================================================================== connexion

    private fun inputField(hint: String, type: Int): EditText = EditText(this).apply {
        this.hint = hint; setHintTextColor(Ui.MUTED); setTextColor(Ui.TEXT); textSize = if (isTv()) 18f else 16f
        inputType = type; setSingleLine(); setPadding(dp(16), dp(15), dp(16), dp(15))
        val normal = roundRect(Ui.SURFACE, dpf(8f), Ui.LINE, dp(1)); val focused = roundRect(Ui.SURFACE, dpf(8f), Ui.GOLD, dp(2))
        background = normal
        setOnFocusChangeListener { _, f -> background = if (f) focused else normal }
    }

    private var loginError: TextView? = null

    private fun showLoginError(msg: String?) { loginError?.text = msg ?: ""; loginError?.visibility = if (msg.isNullOrEmpty()) View.GONE else View.VISIBLE }

    private fun setLoginBusy(busy: Boolean) {
        val b = loginButton as? LinearLayout ?: return
        (b.getChildAt(b.childCount - 1) as? TextView)?.text = if (busy) "Connexion…" else "Se connecter"
        b.isEnabled = !busy; b.alpha = if (busy) 0.6f else 1f
    }

    /** Le formulaire : identifiant ou courriel, mot de passe, bouton. */
    private fun loginForm(): LinearLayout {
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val id = inputField("Identifiant ou courriel", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS).apply { imeOptions = EditorInfo.IME_ACTION_NEXT }
        val pw = inputField("Mot de passe", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD).apply { imeOptions = EditorInfo.IME_ACTION_DONE }
        val err = label("", 13f, Color.parseColor("#FF8A9B"), Ui.medium).apply { visibility = View.GONE; setPadding(dp(2), dp(10), dp(2), 0) }
        loginError = err
        val go = pillButton("Se connecter", null, true) { doLogin(id.text.toString().trim(), pw.text.toString(), null) }
        loginButton = go
        pw.setOnEditorActionListener { v, _, _ -> (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(v.windowToken, 0); go.performClick(); true }
        val lp = { top: Int -> LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) } }
        form.addView(id, lp(0)); form.addView(pw, lp(12)); form.addView(err, lp(0)); form.addView(go, lp(18))
        return form
    }

    private fun doLogin(identifier: String, password: String, totp: String?) {
        if (identifier.isEmpty() || password.isEmpty()) { showLoginError("Saisis ton identifiant (ou courriel) et ton mot de passe."); return }
        showLoginError(null); setLoginBusy(true)
        lifecycleScope.launch {
            try {
                val r = VodApi.login(identifier, password, totp)
                if (r.message != null) { showLoginError(r.message); return@launch }
                val token = r.token ?: return@launch
                if (r.needsProfile) pickProfile(token) { finishLogin(it) } else finishLogin(token)
            } catch (e: ApiError) {
                val m = e.message ?: ""
                if (e.code == 401 && m.contains("2FA", true) && m.contains("requis", true)) askTotp(identifier, password)
                else showLoginError(if (e.code == 401) "Identifiant ou mot de passe incorrect." else m)
            } catch (e: Exception) { showLoginError("Impossible de joindre le site : " + (e.message ?: "erreur réseau")) }
            finally { setLoginBusy(false) }
        }
    }

    /** Dernière étape : la session longue de l'application (refusée sans droit au catalogue). */
    private fun finishLogin(token: String) {
        lifecycleScope.launch {
            try {
                val name = VodApi.longSession(token, prefs)
                Toast.makeText(this@VodHomeActivity, "Bienvenue" + (if (name.isNotEmpty()) " $name" else ""), Toast.LENGTH_SHORT).show()
                current = 0; render()
            } catch (e: ApiError) { showLoginError(e.message) }
            catch (e: Exception) { showLoginError("Impossible de joindre le site : " + (e.message ?: "erreur réseau")) }
            finally { setLoginBusy(false) }
        }
    }

    private fun askTotp(identifier: String, password: String) {
        val input = EditText(this).apply { hint = "Code à 6 chiffres"; inputType = InputType.TYPE_CLASS_NUMBER; setPadding(dp(20), dp(16), dp(20), dp(8)) }
        AlertDialog.Builder(this).setTitle("Double authentification").setMessage("Saisis le code de ton application d'authentification.").setView(input)
            .setPositiveButton("Valider") { _, _ -> doLogin(identifier, password, input.text.toString().trim()) }.setNegativeButton("Annuler", null).show()
    }

    /** Compte famille : choix du profil, puis son PIN. */
    private fun pickProfile(accountToken: String, done: (String) -> Unit) {
        lifecycleScope.launch {
            try {
                val ps = VodApi.familyProfiles(accountToken).filter { !it.blocked }
                if (ps.isEmpty()) { showLoginError("Aucun profil disponible sur ce compte."); return@launch }
                AlertDialog.Builder(this@VodHomeActivity).setTitle("Qui regarde ?").setItems(ps.map { it.name }.toTypedArray()) { _, i -> askPin(accountToken, ps[i], done) }
                    .setNegativeButton("Annuler", null).show()
            } catch (e: ApiError) { showLoginError(e.message) } catch (e: Exception) { showLoginError("Impossible de joindre le site.") }
        }
    }

    private fun askPin(accountToken: String, p: FamilyProfile, done: (String) -> Unit) {
        val input = EditText(this).apply { hint = "PIN"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD; setPadding(dp(20), dp(16), dp(20), dp(8)) }
        AlertDialog.Builder(this).setTitle("PIN de " + p.name).setView(input)
            .setPositiveButton("OK") { _, _ ->
                lifecycleScope.launch {
                    try { done(VodApi.familySelect(accountToken, p.id, input.text.toString())) }
                    catch (e: ApiError) { Toast.makeText(this@VodHomeActivity, e.message, Toast.LENGTH_LONG).show(); askPin(accountToken, p, done) }
                    catch (e: Exception) { showLoginError("Impossible de joindre le site.") }
                }
            }.setNegativeButton("Annuler", null).show()
    }

    private fun renderLogin() { if (isTv()) renderTvLogin() else renderPhoneLogin() }

    private fun logoBlock(big: Boolean): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(label("SEEDUCTION", if (big) 34f else 28f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.18f })
        addView(label("Films et séries, quand tu veux.", if (big) 15f else 13.5f, Ui.MUTED, Ui.medium).apply { setPadding(0, dp(4), 0, 0) })
    }

    private fun renderPhoneLogin() {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(28), dp(56), dp(28), dp(24)) }
        col.addView(logoBlock(false))
        col.addView(label("Connexion", 24f, Ui.TEXT, Ui.black).apply { setPadding(0, dp(40), 0, dp(18)) })
        col.addView(loginForm())
        col.addView(label("Se connecter avec un code", 14f, Ui.GOLD, Ui.bold).apply { setPadding(dp(4), dp(26), dp(4), dp(8)); isClickable = true; tvFocus(6f); setOnClickListener { renderCodeEntry() } })
        col.addView(label("Réservé aux donateurs ❤️, aux membres fondateurs et aux uploaders. Mot de passe oublié ? Rendez-vous sur le site.", 12f, Ui.MUTED).apply { setPadding(dp(4), dp(16), dp(4), 0); setLineSpacing(0f, 1.2f) })
        root.addView(ScrollView(this).apply { addView(col); isFillViewport = true })
    }

    /** Télé : le formulaire à gauche, à droite un QR code et un code à saisir sur le site (aucune frappe à la télécommande). */
    private fun renderTvLogin() {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(64), dp(28), dp(64), dp(28)) }
        val left = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        left.addView(logoBlock(true))
        left.addView(label("Connexion", 26f, Ui.TEXT, Ui.black).apply { setPadding(0, dp(34), 0, dp(16)) })
        left.addView(loginForm(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        left.addView(label("Réservé aux donateurs ❤️, aux membres fondateurs et aux uploaders.", 12.5f, Ui.MUTED).apply { setPadding(0, dp(18), 0, 0) })
        val right = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; background = roundRect(Ui.SURFACE, dpf(16f), Ui.LINE, 2); setPadding(dp(30), dp(26), dp(30), dp(26)) }
        right.addView(label("Plus simple : avec ton téléphone", 15f, Ui.TEXT, Ui.black).apply { gravity = Gravity.CENTER })
        val qr = ImageView(this).apply { setBackgroundColor(Color.WHITE); setPadding(dp(8), dp(8), dp(8), dp(8)); scaleType = ImageView.ScaleType.FIT_CENTER; alpha = 0.25f }
        right.addView(qr, LinearLayout.LayoutParams(dp(176), dp(176)).apply { topMargin = dp(14) })
        right.addView(label("Scanne le QR code, ou va sur seeduction.org/tv et saisis :", 12.5f, Ui.MUTED).apply { gravity = Gravity.CENTER; setPadding(0, dp(14), 0, dp(4)) })
        val codeView = label("········", 30f, Ui.GOLD2, Ui.black).apply { typeface = Typeface.MONOSPACE; letterSpacing = 0.1f; gravity = Gravity.CENTER }
        right.addView(codeView)
        val status = label("Connexion au site…", 12.5f, Ui.MUTED).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(8)) }
        right.addView(status)
        right.addView(pillButton("Nouveau code", null, false) { startDeviceFlow(codeView, status, qr) })
        row.addView(left, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(right, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.8f).apply { leftMargin = dp(56) })
        root.addView(ScrollView(this).apply { addView(row); isFillViewport = true })
        startDeviceFlow(codeView, status, qr)
    }

    private fun startDeviceFlow(codeView: TextView, status: TextView, qr: ImageView) {
        deviceJob?.cancel()
        codeView.text = "········"; status.text = "Connexion au site…"; qr.alpha = 0.25f
        deviceJob = lifecycleScope.launch {
            try {
                val d = VodApi.deviceStart()
                codeView.text = d.userCode.take(4) + " " + d.userCode.drop(4)
                qr.setImageBitmap(qrBitmap(Config.SITE + "/tv?code=" + d.userCode, 480)); qr.alpha = 1f
                status.text = "En attente de la saisie sur le site…"
                val end = System.currentTimeMillis() + d.expiresInSeconds * 1000L
                while (isActive && System.currentTimeMillis() < end) {
                    delay(d.intervalSeconds * 1000L)
                    val name = VodApi.devicePoll(d.deviceCode, prefs)
                    if (name != null) {
                        Toast.makeText(this@VodHomeActivity, "Bienvenue" + (if (name.isNotEmpty()) " $name" else ""), Toast.LENGTH_SHORT).show()
                        current = 0; render(); return@launch
                    }
                }
                status.text = "Code expiré : choisis « Nouveau code »."; qr.alpha = 0.25f
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { status.text = "Impossible de joindre le site : " + (e.message ?: "erreur réseau") }
        }
    }

    /** Saisie du code à 8 caractères affiché sur la page de l'application du site (Connecter l'application). */
    private fun renderCodeEntry() {
        deviceJob?.cancel()
        root.removeAllViews()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(28), dp(56), dp(28), dp(24)) }
        col.addView(logoBlock(false))
        col.addView(label("Connexion par code", 24f, Ui.TEXT, Ui.black).apply { setPadding(0, dp(36), 0, dp(10)) })
        col.addView(label("Sur le site, ouvre la page de l'application et touche « Connecter l'application » : un code s'affiche. Saisis-le ici.", 13.5f, Ui.MUTED).apply { setLineSpacing(0f, 1.25f) })
        val field = inputField("CODE", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS).apply { textSize = 24f; typeface = Typeface.MONOSPACE; letterSpacing = 0.2f; gravity = Gravity.CENTER; imeOptions = EditorInfo.IME_ACTION_DONE }
        col.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(20) })
        val go = pillButton("Connecter", null, true) { pairWithCode(field.text.toString()) }
        field.setOnEditorActionListener { _, _, _ -> go.performClick(); true }
        col.addView(go, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
        col.addView(label("Retour à la connexion", 14f, Ui.GOLD, Ui.bold).apply { setPadding(dp(4), dp(22), dp(4), dp(8)); isClickable = true; tvFocus(6f); setOnClickListener { render() } })
        root.addView(ScrollView(this).apply { addView(col); isFillViewport = true })
    }

    private fun pairWithCode(code: String) {
        val clean = code.uppercase().filter { it.isLetterOrDigit() }
        if (clean.length < 6) { Toast.makeText(this, "Saisis le code affiché sur le site.", Toast.LENGTH_SHORT).show(); return }
        lifecycleScope.launch {
            try {
                val name = VodApi.pair(clean, prefs)
                Toast.makeText(this@VodHomeActivity, "Bienvenue" + (if (name.isNotEmpty()) " $name" else ""), Toast.LENGTH_SHORT).show()
                current = 0; render()
            } catch (e: Exception) { Toast.makeText(this@VodHomeActivity, e.message ?: "Connexion impossible", Toast.LENGTH_LONG).show() }
        }
    }
}

// ====================================================================== Affiche d'ouverture qui défile

/** Les grandes affiches de l'accueil : elles défilent toutes les 7 secondes (fondu), avec titre, genres, synopsis et boutons Lecture et Infos. */
class HeroCarousel(private val act: AppCompatActivity, private val heroes: List<VodItem>) {
    val view = FrameLayout(act)
    private val tv = act.isTv()
    /** Écran en largeur (télé, box, tablette couchée) : affiche à droite et texte à gauche, jamais une affiche plein écran. */
    private val wide = tv || act.screenW() > act.screenH()
    private val img = ImageView(act).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
    private val kind = act.label("", 11f, Ui.GOLD, Ui.bold).apply { letterSpacing = 0.4f }
    private val title = act.label("", 30f, Ui.TEXT, Ui.black).apply { maxLines = 2 }
    private val genres = act.label("", 12.5f, Ui.TEXT, Ui.medium)
    private val synopsis = act.label("", 12.5f, Color.parseColor("#D5DAE8")).apply { maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END }
    private val dots = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL }
    private var index = 0
    lateinit var playButton: View

    init {
        val w = act.screenW()
        val heroH = if (wide) minOf((w * 0.36f).toInt(), (act.screenH() * 0.62f).toInt()) else (w * 1.2f).toInt()
        val info = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
        if (wide) {
            val imgW = (w * 0.52f).toInt()
            view.addView(img, FrameLayout.LayoutParams(imgW, heroH, Gravity.END))
            view.addView(View(act).apply { background = android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Ui.BG, Color.TRANSPARENT)) }, FrameLayout.LayoutParams(imgW, heroH, Gravity.END))
            view.addView(View(act).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (heroH * 0.35f).toInt(), Gravity.BOTTOM))
            info.setPadding(act.dp(48), act.dp(8), act.dp(16), act.dp(10))
        } else {
            view.addView(img, FrameLayout.LayoutParams(w, heroH))
            view.addView(View(act).apply { background = vGradient(Color.TRANSPARENT, Ui.BG) }, FrameLayout.LayoutParams(w, (heroH * 0.62f).toInt(), Gravity.BOTTOM))
            view.addView(View(act).apply { background = vGradient(Color.parseColor("#B006080F"), Color.TRANSPARENT) }, FrameLayout.LayoutParams(w, act.dp(90), Gravity.TOP))
            info.gravity = Gravity.CENTER_HORIZONTAL; info.setPadding(act.dp(20), 0, act.dp(20), act.dp(14))
            title.gravity = Gravity.CENTER; genres.gravity = Gravity.CENTER; synopsis.gravity = Gravity.CENTER
            title.setShadowLayer(12f, 0f, 2f, Color.BLACK)
        }
        title.setPadding(0, act.dp(2), 0, act.dp(4)); synopsis.setPadding(0, act.dp(8), 0, 0)
        info.addView(kind); info.addView(title); info.addView(genres); info.addView(synopsis)
        val buttons = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = if (wide) Gravity.START else Gravity.CENTER; setPadding(0, act.dp(14), 0, 0) }
        playButton = act.pillButton("Lecture", R.drawable.ic_play, true) { act.startActivity(Intent(act, VodTitleActivity::class.java).putExtra(VodTitleActivity.EXTRA_ID, heroes[index].id).putExtra(VodTitleActivity.EXTRA_AUTOPLAY, true)) }
        buttons.addView(playButton)
        buttons.addView(View(act), LinearLayout.LayoutParams(act.dp(12), 1))
        buttons.addView(act.pillButton("Infos", R.drawable.ic_info, false) { act.openItem(heroes[index]) })
        info.addView(buttons)
        if (heroes.size > 1) {
            dots.gravity = if (wide) Gravity.START else Gravity.CENTER
            dots.setPadding(0, act.dp(14), 0, 0)
            info.addView(dots)
        }
        if (wide) view.addView(info, FrameLayout.LayoutParams((w * 0.55f).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL or Gravity.START))
        else view.addView(info, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        if (!tv) {
            val top = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(act.dp(16), act.dp(12), act.dp(14), 0) }
            top.addView(act.label("SEEDUCTION", 18f, Ui.GOLD, Ui.black).apply { letterSpacing = 0.16f; setShadowLayer(10f, 0f, 2f, Color.BLACK) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            top.addView(act.avatar(34))
            view.addView(top, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        }
        show(0, false)
        heroes.drop(1).forEach { Images.prefetch(it.cover, w * 2) }
        if (heroes.size > 1) act.lifecycleScope.launch {
            while (isActive) { delay(7000); if (view.isAttachedToWindow) show((index + 1) % heroes.size, true) }
        }
        if (tv) playButton.post { playButton.requestFocus() }
    }

    private fun show(i: Int, fade: Boolean) {
        index = i
        val h = heroes[i]
        if (fade) { img.animate().cancel(); img.alpha = 0f }
        Images.load(img, h.cover, act.screenW() * 2)
        if (fade) img.animate().alpha(1f).setDuration(500).start()
        kind.text = if (h.kind == "serie") "SÉRIE" else "FILM"
        title.text = h.title
        genres.text = (h.genres.take(3) + listOfNotNull(h.year?.toString())).joinToString("  •  ")
        genres.visibility = if (genres.text.isEmpty()) View.GONE else View.VISIBLE
        synopsis.text = h.synopsis ?: ""
        synopsis.visibility = if (h.synopsis.isNullOrEmpty()) View.GONE else View.VISIBLE
        dots.removeAllViews()
        if (heroes.size > 1) heroes.indices.forEach { d ->
            dots.addView(View(act).apply { background = roundRect(if (d == i) Ui.GOLD else Color.parseColor("#55FFFFFF"), act.dpf(3f)) }, LinearLayout.LayoutParams(act.dp(if (d == i) 18 else 6), act.dp(6)).apply { setMargins(act.dp(3), 0, act.dp(3), 0) })
        }
    }
}

// ====================================================================== Accueil

/** L'accueil : les affiches qui défilent, puis les rangées (reprendre, recommandations, Top 10, nouveautés, sagas, genres...). */
class HomeScreen(private val act: VodHomeActivity) : VodScreen {
    private val col = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
    override val view: View = FrameLayout(act).apply {
        addView(ScrollView(act).apply { addView(col); setBackgroundColor(Ui.BG); isVerticalScrollBarEnabled = false }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    private var loadedAt = 0L
    private var job: Job? = null
    private var pulse: android.animation.ValueAnimator? = null

    override fun onShow() {
        if (System.currentTimeMillis() - loadedAt < 60_000 && col.childCount > 0 && pulse == null) return
        val token = Prefs(act).vodToken ?: return
        if (col.childCount == 0) { val (sk, anim) = act.skeleton(); pulse = anim; col.addView(sk) }
        job?.cancel()
        job = act.lifecycleScope.launch {
            try {
                val home = VodApi.home(token)
                loadedAt = System.currentTimeMillis()
                pulse?.cancel(); pulse = null
                col.removeAllViews()
                if (home.heroes.isNotEmpty()) col.addView(HeroCarousel(act, home.heroes).view) else col.addView(View(act), LinearLayout.LayoutParams(1, act.dp(if (act.isTv()) 16 else 56)))
                if (home.rails.isEmpty()) col.addView(act.label("Rien à regarder pour l'instant : le catalogue ne montre que les titres qui ont au moins un seeder.", 14f, Ui.MUTED).apply { setPadding(act.dp(16), act.dp(24), act.dp(16), 0) })
                home.rails.forEach { col.addView(act.railView(it)) }
                col.addView(View(act), LinearLayout.LayoutParams(1, act.dp(28)))
            } catch (e: VodAuthException) {
                Prefs(act).vodToken = null; Toast.makeText(act, e.message, Toast.LENGTH_LONG).show(); act.recreate()
            } catch (e: Exception) {
                Journal.log("catalogue : " + e.message)
                pulse?.cancel(); pulse = null
                col.removeAllViews()
                col.addView(act.label("Impossible de charger le catalogue :\n" + (e.message ?: "erreur réseau"), 14f, Ui.MUTED).apply { setPadding(act.dp(16), act.dp(80), act.dp(16), act.dp(12)) })
                col.addView(act.pillButton("Réessayer", null, true) { loadedAt = 0; onShow() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { leftMargin = act.dp(16) })
            }
        }
    }
}

// ====================================================================== Films / Séries

private val SORTS = listOf("new" to "Nouveautés", "seeders" to "Les plus regardés", "name" to "Nom (A → Z)", "year" to "Année", "rating" to "Mieux notés")

/** Un onglet de liste complète (Films ou Séries) : catégories (genres), tri, grille infinie ; les sagas pour les films. */
class BrowseScreen(private val act: VodHomeActivity, private val kind: String, private val title: String) : VodScreen {
    private var genre: String? = null
    private var sort = "new"
    private val chips = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; setPadding(act.dp(if (act.isTv()) 48 else 16), 0, act.dp(16), act.dp(8)) }
    private val grid = PagedGrid(act) { page -> VodApi.browse(Prefs(act).vodToken ?: "", mapOf("kind" to kind, "genre" to genre, "sort" to sort), page) }
    private var started = false
    override val view: View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG)
        val head = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(act.dp(if (act.isTv()) 48 else 16), act.dp(16), act.dp(14), act.dp(8)) }
        head.addView(act.label(title, 26f, Ui.TEXT, Ui.black), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (!act.isTv()) head.addView(act.avatar(34))
        addView(head)
        addView(HorizontalScrollView(act).apply { addView(chips); isHorizontalScrollBarEnabled = false })
        addView(grid.view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    init { drawChips() }

    private fun drawChips() {
        chips.removeAllViews()
        chips.addView(act.chip(genre ?: "Catégories", genre != null, true) { pickGenre() })
        chips.addView(View(act), LinearLayout.LayoutParams(act.dp(8), 1))
        chips.addView(act.chip(SORTS.first { it.first == sort }.second, false, true) { pickSort() })
        if (kind == "film") {
            chips.addView(View(act), LinearLayout.LayoutParams(act.dp(8), 1))
            chips.addView(act.chip("Sagas", false) { act.startActivity(Intent(act, VodListActivity::class.java).putExtra(VodListActivity.EXTRA_TITLE, "Sagas").putExtra(VodListActivity.EXTRA_SAGAS, true)) })
        }
    }

    private fun pickSort() {
        AlertDialog.Builder(act).setTitle("Trier par").setItems(SORTS.map { it.second }.toTypedArray()) { _, i -> sort = SORTS[i].first; drawChips(); grid.reset() }.show()
    }

    private fun pickGenre() {
        val token = Prefs(act).vodToken ?: return
        act.lifecycleScope.launch {
            try {
                val gs = VodApi.genres(token, kind)
                val names = listOf("Toutes les catégories") + gs.map { it.name + "  (" + it.count + ")" }
                AlertDialog.Builder(act).setTitle("Catégories").setItems(names.toTypedArray()) { _, i -> genre = if (i == 0) null else gs[i - 1].name; drawChips(); grid.reset() }.show()
            } catch (e: Exception) { Toast.makeText(act, e.message ?: "Catégories indisponibles", Toast.LENGTH_SHORT).show() }
        }
    }

    override fun onShow() { if (!started) { started = true; grid.reset() } }
}

// ====================================================================== Recherche

class SearchScreen(private val act: VodHomeActivity) : VodScreen {
    private var query = ""
    private val grid = PagedGrid(act) { page -> VodApi.browse(Prefs(act).vodToken ?: "", mapOf("q" to query, "sort" to "seeders"), page) }
    private val field = EditText(act).apply {
        hint = "Films, séries, sagas…"; setHintTextColor(Ui.MUTED); setTextColor(Ui.TEXT); textSize = 16f; setSingleLine(); inputType = InputType.TYPE_CLASS_TEXT; imeOptions = EditorInfo.IME_ACTION_SEARCH
        background = null; setPadding(act.dp(8), act.dp(13), act.dp(8), act.dp(13))
    }
    private var debounce: Job? = null
    override val view: View = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG)
        val bar = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = roundRect(Ui.SURFACE, act.dpf(10f), Ui.LINE, 1); setPadding(act.dp(12), 0, act.dp(8), 0) }
        bar.addView(act.icon(R.drawable.ic_search, 22, Ui.MUTED))
        bar.addView(field, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(act.dp(if (act.isTv()) 48 else 16), act.dp(18), act.dp(if (act.isTv()) 48 else 16), act.dp(8)) })
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
