package org.seeduction.player

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout
import java.io.File
import kotlin.coroutines.resume

/**
 * Le lecteur : reçoit le lien seeduction://stream/<jeton> du site, échange le jeton contre le .torrent du membre, télécharge le fichier dans l'ordre (le moteur du service), puis le lit avec VLC
 * (tous les formats, toutes les pistes audio et les sous-titres). Il signale « en train de regarder » et la position au site, comme le lecteur Windows.
 */
class PlayerActivity : AppCompatActivity() {
    private var service: TorrentService? = null
    private var connection: ServiceConnection? = null
    private var libVlc: LibVLC? = null
    private var player: MediaPlayer? = null

    private lateinit var video: VLCVideoLayout
    private lateinit var controls: View
    private lateinit var loading: View
    private lateinit var loadingText: TextView
    private lateinit var loadingSub: TextView
    private lateinit var spinner: ProgressBar
    private lateinit var retry: TextView
    private lateinit var bufferSpinner: View
    private lateinit var seek: SeekBar
    private lateinit var timeText: TextView
    private lateinit var titleText: TextView
    private lateinit var statsText: TextView
    private lateinit var playPause: TextView
    private lateinit var seekToast: TextView

    private var info: SessionInfo? = null
    private var loadJob: Job? = null
    private var tickJob: Job? = null
    private var hideJob: Job? = null
    private var lastEntryId: String? = null
    private var userSeeking = false
    private var lengthMs = 0L
    private var scaleIndex = 0
    private val scales = listOf(MediaPlayer.ScaleType.SURFACE_BEST_FIT, MediaPlayer.ScaleType.SURFACE_FIT_SCREEN, MediaPlayer.ScaleType.SURFACE_FILL, MediaPlayer.ScaleType.SURFACE_16_9, MediaPlayer.ScaleType.SURFACE_4_3)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* sans réponse : le partage marche, seule la notification manque */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Journal.init(this)
        setContentView(R.layout.activity_player)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        video = findViewById(R.id.video); controls = findViewById(R.id.controls); loading = findViewById(R.id.loading)
        loadingText = findViewById(R.id.loadingText); loadingSub = findViewById(R.id.loadingSub); spinner = findViewById(R.id.spinner); retry = findViewById(R.id.retry)
        bufferSpinner = findViewById(R.id.bufferSpinner); seek = findViewById(R.id.seek); timeText = findViewById(R.id.time); titleText = findViewById(R.id.title)
        statsText = findViewById(R.id.stats); playPause = findViewById(R.id.playPause); seekToast = findViewById(R.id.seekToast)
        hideSystemBars()

        findViewById<View>(R.id.back).setOnClickListener { finish() }
        retry.setOnClickListener { finish() }
        playPause.setOnClickListener { togglePause() }
        findViewById<View>(R.id.rewind).setOnClickListener { seekBy(-10_000) }
        findViewById<View>(R.id.forward).setOnClickListener { seekBy(10_000) }
        findViewById<View>(R.id.audio).setOnClickListener { chooseTrack(audio = true) }
        findViewById<View>(R.id.subs).setOnClickListener { chooseTrack(audio = false) }
        findViewById<View>(R.id.aspect).setOnClickListener {
            scaleIndex = (scaleIndex + 1) % scales.size
            player?.videoScale = scales[scaleIndex]
            flash(listOf("Ajusté", "Plein écran", "Étiré", "16:9", "4:3")[scaleIndex])
        }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser && lengthMs > 0) timeText.text = formatClock(progress * lengthMs / 1000 / 1000) + " / " + formatClock(lengthMs / 1000)
            }
            override fun onStartTrackingTouch(sb: SeekBar?) { userSeeking = true; showControls() }
            override fun onStopTrackingTouch(sb: SeekBar?) {
                userSeeking = false
                if (lengthMs > 0) player?.time = (seek.progress.toLong() * lengthMs / 1000)
                showControls()
            }
        })

        val gestures = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean { toggleControls(); return true }
            override fun onDoubleTap(e: MotionEvent): Boolean {
                val w = video.width.coerceAtLeast(1)
                when {
                    e.x < w / 3f -> seekBy(-10_000)
                    e.x > w * 2f / 3f -> seekBy(10_000)
                    else -> togglePause()
                }
                return true
            }
        })
        video.setOnTouchListener { _, ev -> gestures.onTouchEvent(ev); true }

        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
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

    // ------------------------------------------------------------------ démarrage d'une lecture

    private fun handleIntent(i: Intent) {
        val token = if (i.action == Intent.ACTION_VIEW) i.data?.lastPathSegment else null
        val existing = i.getStringExtra(EXTRA_SESSION)
        if (token == null && existing == null) { showError("Aucune lecture à ouvrir : clique sur « Ouvrir dans le lecteur Seeduction » depuis le site."); return }
        loadJob?.cancel()
        releasePlayer()
        showLoading("Connexion à Seeduction…", "")
        loadJob = lifecycleScope.launch {
            try {
                val svc = ensureService()
                val entryInfo: SessionInfo = if (token != null) {
                    val play = SiteApi.session(token)
                    setLoading("Préparation du téléchargement…", play.torrentName ?: "")
                    withContext(Dispatchers.IO) { svc.addSession(play) }
                } else svc.entry(existing!!)?.info ?: throw IllegalStateException("Cette lecture n'existe plus : relance-la depuis Seeduction.")
                info = entryInfo
                lastEntryId = entryInfo.id
                titleText.text = entryInfo.name
                svc.resume(entryInfo.id)
                waitForBuffer(svc, entryInfo)
                val start = startPosition(entryInfo)
                startPlayback(svc, entryInfo, start)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Journal.log("lecture impossible : " + e.message)
                showError(e.message ?: "Lecture impossible")
            }
        }
    }

    private suspend fun ensureService(): TorrentService {
        service?.let { return it }
        val intent = Intent(this, TorrentService::class.java)
        ContextCompat.startForegroundService(this, intent)
        return suspendCancellableCoroutine { cont ->
            val conn = object : ServiceConnection {
                override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                    val s = (binder as TorrentService.LocalBinder).service
                    service = s
                    if (cont.isActive) cont.resume(s)
                }
                override fun onServiceDisconnected(name: ComponentName?) { service = null }
            }
            connection = conn
            bindService(intent, conn, Context.BIND_AUTO_CREATE)
            cont.invokeOnCancellation { try { unbindService(conn) } catch (_: Exception) { /* déjà détaché */ } }
        }
    }

    /** Attend le début du fichier (et sa fin, où se trouve souvent l'index) : la lecture démarre ensuite sans à-coups. */
    private suspend fun waitForBuffer(svc: TorrentService, info: SessionInfo) {
        val t0 = System.currentTimeMillis()
        while (true) {
            val ready = withContext(Dispatchers.Default) { svc.prebuffer(info.id) }
            val st = withContext(Dispatchers.Default) { svc.stats(info.id) }
            val waited = (System.currentTimeMillis() - t0) / 1000
            val peers = st?.peers ?: 0
            if (ready >= 0.999f || (waited > 90 && ready >= 0.5f)) return
            val percent = (ready * 100).toInt()
            setLoading(
                if (peers == 0 && waited > 8) "Recherche de pairs…" else "Mise en mémoire tampon… $percent %",
                (if (peers > 0) "$peers pair(s) · ↓ ${formatSpeed(st?.downRate ?: 0)}" else "Connexion au swarm") +
                    (if (peers == 0 && waited > 8) "\n" + diagnostic(svc, info) else "") +
                    (if (waited > 60 && peers == 0) "\nAucun pair pour l'instant. S'il y a des seeders sur le site, ils sont peut-être injoignables depuis ce réseau (essaie en Wi-Fi). Touche « Partager le journal » dans l'application pour me l'envoyer." else ""),
            )
            delay(500)
        }
    }

    /** Ce que fait le moteur quand aucun pair n'arrive : état du torrent, tracker contacté ou non (et sa réponse), pairs connus. Aussi écrit dans le journal. */
    private fun diagnostic(svc: TorrentService, info: SessionInfo): String {
        val h = svc.entry(info.id)?.handle ?: return ""
        val st = try { h.status() } catch (_: Exception) { null }
        val lines = mutableListOf<String>()
        if (st != null) lines.add("État : " + st.state().name + " · pairs connus : " + st.listPeers() + " · seeders vus : " + st.listSeeds())
        lines.addAll(svc.engine.trackerLines(h))
        lines.addAll(svc.engine.recentEvents(2))
        Journal.log("diagnostic : " + lines.joinToString(" | "))
        return lines.joinToString("\n") { it.take(170) }
    }

    private suspend fun startPosition(info: SessionInfo): Int {
        val local = Prefs(this).position(info.torrentId, info.fileIndex)
        val remote = if (info.passkey != null && info.torrentId != null) SiteApi.serverPosition(info.passkey, info.torrentId, info.fileIndex) else 0
        return maxOf(local, remote)
    }

    private fun startPlayback(svc: TorrentService, info: SessionInfo, startSeconds: Int) {
        val args = arrayListOf("--http-reconnect", "--network-caching=3000", "--file-caching=3000")
        val vlc = LibVLC(this, args)
        libVlc = vlc
        val mp = MediaPlayer(vlc)
        player = mp
        mp.attachViews(video, null, false, false)
        mp.videoScale = scales[scaleIndex]
        mp.setEventListener { ev -> runOnUiThread { onVlcEvent(ev) } }
        val media = Media(vlc, Uri.parse(svc.streamUrl(info.id)))
        media.setHWDecoderEnabled(true, false)
        // Reprise : 5 secondes avant le dernier point connu, sauf si on avait quasiment fini.
        if (startSeconds > 10) media.addOption(":start-time=" + (startSeconds - 5))
        mp.media = media
        media.release()
        mp.play()
        Journal.log("VLC lancé sur " + svc.streamUrl(info.id) + " (reprise à " + startSeconds + " s)")

        tickJob?.cancel()
        tickJob = lifecycleScope.launch { tick(svc, info) }
        if (info.passkey != null && info.torrentId != null) {
            lifecycleScope.launch {
                val subs = SiteApi.subtitles(info.passkey, info.torrentId, info.fileIndex, File(cacheDir, "sous-titres/" + info.id))
                val french = subs.firstOrNull { it.iso3 == "fra" }
                for (s in subs) player?.addSlave(IMedia.Slave.Type.Subtitle, Uri.fromFile(s.file), s === french)
                if (subs.isNotEmpty()) Journal.log(subs.size.toString() + " sous-titre(s) partagé(s) ajouté(s)")
            }
        }
    }

    private fun onVlcEvent(ev: MediaPlayer.Event) {
        when (ev.type) {
            MediaPlayer.Event.Playing -> { loading.visibility = View.GONE; bufferSpinner.visibility = View.GONE; playPause.text = "⏸"; showControls() }
            MediaPlayer.Event.Paused -> { playPause.text = "▶" }
            MediaPlayer.Event.Buffering -> bufferSpinner.visibility = if (ev.buffering < 100f && loading.visibility != View.VISIBLE) View.VISIBLE else View.GONE
            MediaPlayer.Event.LengthChanged -> lengthMs = ev.lengthChanged
            MediaPlayer.Event.EndReached -> {
                info?.let { Prefs(this).savePosition(it.torrentId, it.fileIndex, 0) }
                sendPing(finalPosition = true)
                finish()
            }
            MediaPlayer.Event.EncounteredError -> showError("VLC n'arrive pas à lire ce fichier.")
        }
    }

    // ------------------------------------------------------------------ boucle : barre de lecture, statistiques, « regarde » sur le site

    private suspend fun tick(svc: TorrentService, info: SessionInfo) {
        var n = 0
        while (true) {
            delay(1000)
            n++
            val mp = player ?: continue
            val pos = mp.time; val len = mp.length
            if (len > 0) lengthMs = len
            if (!userSeeking && lengthMs > 0) {
                seek.progress = (pos * 1000 / lengthMs).toInt().coerceIn(0, 1000)
                timeText.text = formatClock(pos / 1000) + " / " + formatClock(lengthMs / 1000)
            }
            if (controls.visibility == View.VISIBLE) {
                val st = withContext(Dispatchers.Default) { svc.stats(info.id) }
                if (st != null) statsText.text = "↓ " + formatSpeed(st.downRate) + " · ↑ " + formatSpeed(st.upRate) + " · " + st.peers + " pairs · " + (st.progress * 100).toInt() + " %"
            }
            if (n % 3 == 0) sendPing(finalPosition = false)
        }
    }

    private fun sendPing(finalPosition: Boolean) {
        val i = info ?: return
        val mp = player ?: return
        val sec = if (finalPosition && lengthMs > 0) (lengthMs / 1000).toInt() else (mp.time / 1000).toInt()
        val dur = (lengthMs / 1000).toInt()
        if (sec > 0) Prefs(this).savePosition(i.torrentId, i.fileIndex, sec)
        if (i.passkey != null && i.torrentId != null && sec > 0) AppScope.scope.launch { SiteApi.watching(i.passkey, i.torrentId, i.fileIndex, sec, dur) }
    }

    // ------------------------------------------------------------------ commandes

    private fun togglePause() {
        val mp = player ?: return
        if (mp.isPlaying) mp.pause() else mp.play()
        showControls()
    }

    private fun seekBy(deltaMs: Long) {
        val mp = player ?: return
        if (lengthMs <= 0) return
        mp.time = (mp.time + deltaMs).coerceIn(0, lengthMs - 1000)
        flash(if (deltaMs < 0) "⏪ 10 s" else "10 s ⏩")
    }

    private fun flash(text: String) {
        seekToast.text = text
        seekToast.visibility = View.VISIBLE
        seekToast.removeCallbacks(hideToast)
        seekToast.postDelayed(hideToast, 700)
    }
    private val hideToast = Runnable { seekToast.visibility = View.GONE }

    private fun toggleControls() { if (controls.visibility == View.VISIBLE) controls.visibility = View.GONE else showControls() }

    private fun showControls() {
        controls.visibility = View.VISIBLE
        hideJob?.cancel()
        hideJob = lifecycleScope.launch { delay(4000); if (player?.isPlaying == true && !userSeeking) controls.visibility = View.GONE }
    }

    private fun chooseTrack(audio: Boolean) {
        val mp = player ?: return
        val tracks = (if (audio) mp.audioTracks else mp.spuTracks) ?: emptyArray()
        if (tracks.isEmpty()) { flash(if (audio) "Une seule piste audio" else "Aucun sous-titre"); return }
        val current = if (audio) mp.audioTrack else mp.spuTrack
        val names = tracks.map { it.name ?: ("Piste " + it.id) }.toTypedArray()
        val checked = tracks.indexOfFirst { it.id == current }.coerceAtLeast(0)
        AlertDialog.Builder(this)
            .setTitle(if (audio) "Piste audio" else "Sous-titres")
            .setSingleChoiceItems(names, checked) { d, which ->
                if (audio) mp.audioTrack = tracks[which].id else mp.spuTrack = tracks[which].id
                d.dismiss()
            }
            .setNegativeButton("Fermer", null)
            .show()
    }

    // ------------------------------------------------------------------ états à l'écran

    private fun showLoading(text: String, sub: String) {
        loading.visibility = View.VISIBLE; spinner.visibility = View.VISIBLE; retry.visibility = View.GONE
        loadingText.text = text; loadingSub.text = sub
    }
    private fun setLoading(text: String, sub: String) { loadingText.text = text; loadingSub.text = sub }

    private fun showError(message: String) {
        loading.visibility = View.VISIBLE; spinner.visibility = View.GONE; retry.visibility = View.VISIBLE
        loadingText.text = message; loadingSub.text = ""
        bufferSpinner.visibility = View.GONE
    }

    private fun releasePlayer() {
        tickJob?.cancel(); hideJob?.cancel()
        try { player?.stop() } catch (_: Exception) { /* déjà arrêté */ }
        try { player?.detachViews() } catch (_: Exception) { /* déjà détaché */ }
        try { player?.release() } catch (_: Exception) { /* déjà libéré */ }
        try { libVlc?.release() } catch (_: Exception) { /* déjà libéré */ }
        player = null; libVlc = null
    }

    override fun onStop() {
        super.onStop()
        if (player?.isPlaying == true) player?.pause()
        sendPing(finalPosition = false)
    }

    override fun onDestroy() {
        val i = info
        sendPing(finalPosition = false)
        if (i?.passkey != null) AppScope.scope.launch { SiteApi.stopWatching(i.passkey) }
        loadJob?.cancel()
        releasePlayer()
        connection?.let { try { unbindService(it) } catch (_: Exception) { /* déjà détaché */ } }
        super.onDestroy()
    }

    companion object { const val EXTRA_SESSION = "session" }
}
