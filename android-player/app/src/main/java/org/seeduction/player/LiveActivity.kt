package org.seeduction.player

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

/**
 * Le direct : reçoit le lien seeduction://live/<jeton> de la page « Direct » du site, échange le jeton contre l'adresse du flux sur le relais, et le lit dans VLC
 * avec le son et l'image d'origine (AC3, E-AC3, 5.1… que le navigateur ne lit pas), toutes les pistes audio au choix. Aucun téléchargement ni partage : c'est un flux.
 */
class LiveActivity : AppCompatActivity() {
    private var libVlc: LibVLC? = null
    private var player: MediaPlayer? = null

    private lateinit var video: VLCVideoLayout
    private lateinit var bar: View
    private lateinit var loading: View
    private lateinit var loadingText: TextView
    private lateinit var loadingSub: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var retry: TextView
    private lateinit var bufferSpinner: View
    private lateinit var titleText: TextView
    private lateinit var toast: TextView

    private var job: Job? = null
    private var hideJob: Job? = null
    private var scaleIndex = 0
    private val scales = listOf(MediaPlayer.ScaleType.SURFACE_BEST_FIT, MediaPlayer.ScaleType.SURFACE_FIT_SCREEN, MediaPlayer.ScaleType.SURFACE_FILL, MediaPlayer.ScaleType.SURFACE_16_9, MediaPlayer.ScaleType.SURFACE_4_3)

    /** Adresse du direct sur le relais : sert aux nouvelles tentatives sans redemander un jeton (il n'est valable qu'une fois). */
    private var playbackUrl: String? = null
    private var retries = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        setContentView(R.layout.activity_live)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        video = findViewById(R.id.video); bar = findViewById(R.id.bar); loading = findViewById(R.id.loading)
        loadingText = findViewById(R.id.loadingText); loadingSub = findViewById(R.id.loadingSub); spinner = findViewById(R.id.spinner); retry = findViewById(R.id.retry)
        bufferSpinner = findViewById(R.id.bufferSpinner); titleText = findViewById(R.id.title); toast = findViewById(R.id.toast)
        hideSystemBars()

        findViewById<View>(R.id.back).setOnClickListener { finish() }
        retry.setOnClickListener { finish() }
        findViewById<View>(R.id.audio).setOnClickListener { chooseAudio() }
        findViewById<View>(R.id.aspect).setOnClickListener {
            scaleIndex = (scaleIndex + 1) % scales.size
            player?.videoScale = scales[scaleIndex]
            flash(listOf("Ajusté", "Plein écran", "Étiré", "16:9", "4:3")[scaleIndex])
        }
        val gestures = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean { toggleBar(); return true }
        })
        video.setOnTouchListener { _, ev -> gestures.onTouchEvent(ev); true }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun hideSystemBars() {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemBars() }

    private fun handleIntent(i: Intent) {
        val token = if (i.action == Intent.ACTION_VIEW) liveTokenOf(i.dataString) else null
        if (token == null) { showError("Aucun direct à ouvrir : touche « Ouvrir dans le lecteur Seeduction » sur la page Direct du site."); return }
        job?.cancel()
        releasePlayer()
        retries = 0
        showLoading("Ouverture du direct…", "")
        job = lifecycleScope.launch {
            try {
                val live = SiteApi.live(token)
                playbackUrl = live.playbackUrl
                titleText.text = "🔴 " + live.title
                setLoading("Connexion au direct…", "La première connexion peut prendre quelques secondes.")
                start(live.playbackUrl)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Journal.log("direct impossible : " + e.message)
                showError(e.message ?: "Impossible d'ouvrir le direct.")
            }
        }
    }

    private fun start(url: String) {
        releasePlayer()
        // Réseau : mémoire tampon de quelques secondes (un direct n'est jamais « chargé d'avance »), reconnexion automatique.
        val vlc = LibVLC(this, arrayListOf("--http-reconnect", "--network-caching=4000", "--live-caching=4000"))
        libVlc = vlc
        val mp = MediaPlayer(vlc)
        player = mp
        mp.attachViews(video, null, false, false)
        mp.videoScale = scales[scaleIndex]
        mp.setEventListener { ev -> runOnUiThread { onVlcEvent(ev) } }
        val media = Media(vlc, Uri.parse(url))
        media.setHWDecoderEnabled(true, false)
        mp.media = media
        media.release()
        mp.play()
        Journal.log("direct : VLC lancé")
    }

    private fun onVlcEvent(ev: MediaPlayer.Event) {
        when (ev.type) {
            MediaPlayer.Event.Playing -> { loading.visibility = View.GONE; bufferSpinner.visibility = View.GONE; retries = 0; showBar() }
            MediaPlayer.Event.Buffering -> bufferSpinner.visibility = if (ev.buffering < 100f && loading.visibility != View.VISIBLE) View.VISIBLE else View.GONE
            // Le relais met quelques secondes à se connecter au premier spectateur, et une coupure passagère est normale : on réessaie avant d'abandonner.
            MediaPlayer.Event.EncounteredError, MediaPlayer.Event.EndReached -> retry()
        }
    }

    private fun retry() {
        val url = playbackUrl ?: return
        if (retries >= MAX_RETRIES) {
            showError("Le direct n'est plus disponible (terminé ou interrompu). Reviens sur la page Direct du site pour voir la suite du programme.")
            return
        }
        retries++
        showLoading("Reconnexion au direct…", "Tentative $retries sur $MAX_RETRIES")
        job?.cancel()
        job = lifecycleScope.launch { delay(3000); start(url) }
    }

    // ------------------------------------------------------------------ commandes

    private fun toggleBar() { if (bar.visibility == View.VISIBLE) bar.visibility = View.GONE else showBar() }

    private fun showBar() {
        bar.visibility = View.VISIBLE
        hideJob?.cancel()
        hideJob = lifecycleScope.launch { delay(4000); bar.visibility = View.GONE }
    }

    private fun chooseAudio() {
        val mp = player ?: return
        val tracks = mp.audioTracks ?: emptyArray()
        if (tracks.isEmpty()) { flash("Aucune piste audio détectée"); return }
        val names = tracks.map { it.name ?: ("Piste " + it.id) }.toTypedArray()
        val checked = tracks.indexOfFirst { it.id == mp.audioTrack }.coerceAtLeast(0)
        AlertDialog.Builder(this)
            .setTitle("Piste audio")
            .setSingleChoiceItems(names, checked) { d, which -> mp.audioTrack = tracks[which].id; d.dismiss() }
            .setNegativeButton("Fermer", null)
            .show()
    }

    private fun flash(text: String) {
        toast.text = text; toast.visibility = View.VISIBLE
        toast.removeCallbacks(hideToast); toast.postDelayed(hideToast, 1200)
    }
    private val hideToast = Runnable { toast.visibility = View.GONE }

    private fun showLoading(text: String, sub: String) {
        loading.visibility = View.VISIBLE; spinner.visibility = View.VISIBLE; retry.visibility = View.GONE
        loadingText.text = text; loadingSub.text = sub
    }
    private fun setLoading(text: String, sub: String) { loadingText.text = text; loadingSub.text = sub }

    private fun showError(message: String) {
        loading.visibility = View.VISIBLE; spinner.visibility = View.GONE; retry.visibility = View.VISIBLE
        loadingText.text = message; loadingSub.text = ""
    }

    private fun releasePlayer() {
        try { player?.stop(); player?.detachViews(); player?.release() } catch (_: Exception) { /* déjà libéré */ }
        try { libVlc?.release() } catch (_: Exception) { /* déjà libéré */ }
        player = null; libVlc = null
    }

    override fun onStop() {
        super.onStop()
        player?.pause() // on ne garde pas un direct en lecture en arrière-plan
    }

    override fun onStart() {
        super.onStart()
        // Retour à l'écran : un direct mis en pause est périmé, on se reconnecte au présent.
        val url = playbackUrl
        if (player != null && url != null) start(url)
    }

    override fun onDestroy() {
        job?.cancel()
        releasePlayer()
        super.onDestroy()
    }

    companion object { private const val MAX_RETRIES = 6 }
}
