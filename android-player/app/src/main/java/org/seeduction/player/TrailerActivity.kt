package org.seeduction.player

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity

/** Bande-annonce d'un titre : la vidéo YouTube de la fiche, lue plein écran ; « Ouvrir dans YouTube » en secours si l'intégration est refusée. */
class TrailerActivity : AppCompatActivity() {
    private var web: WebView? = null
    private var custom: View? = null
    private var customCb: WebChromeClient.CustomViewCallback? = null
    private lateinit var root: FrameLayout

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val key = intent.getStringExtra(EXTRA_KEY)?.takeIf { Regex("^[\\w-]{6,20}$").matches(it) } ?: run { finish(); return }
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        val w = WebView(this)
        web = w
        w.settings.apply { javaScriptEnabled = true; mediaPlaybackRequiresUserGesture = false; domStorageEnabled = true; mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW }
        w.setBackgroundColor(Color.BLACK)
        w.webViewClient = WebViewClient()
        w.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, cb: CustomViewCallback) {
                custom = view; customCb = cb
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                w.visibility = View.GONE
            }
            override fun onHideCustomView() {
                custom?.let { root.removeView(it) }; custom = null; customCb?.onCustomViewHidden(); customCb = null; w.visibility = View.VISIBLE
            }
        }
        val html = "<html><body style='margin:0;background:#000'><iframe src='https://www.youtube.com/embed/$key?autoplay=1&rel=0&playsinline=1&modestbranding=1' " +
            "style='position:fixed;inset:0;width:100%;height:100%;border:0' allow='autoplay; fullscreen; encrypted-media; picture-in-picture' allowfullscreen></iframe></body></html>"
        w.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "utf-8", null)
        root.addView(w, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(8), dp(8), dp(12), dp(8)) }
        bar.addView(icon(R.drawable.ic_back, 24, Color.WHITE).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); background = roundRect(Color.parseColor("#99000000"), dpf(24f)); isClickable = true; isFocusable = true; setOnClickListener { finish() }; tvFocus(24f) }, LinearLayout.LayoutParams(dp(46), dp(46)))
        bar.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        bar.addView(chip("Ouvrir dans YouTube", false) {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$key"))
            try { startActivity(i) } catch (_: ActivityNotFoundException) { try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$key"))) } catch (_: ActivityNotFoundException) { /* aucun navigateur */ } }
        })
        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        setContentView(root)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (custom != null) { web?.webChromeClient?.onHideCustomView(); return }
        @Suppress("DEPRECATION") super.onBackPressed()
    }

    override fun onPause() { super.onPause(); web?.onPause() }
    override fun onResume() { super.onResume(); web?.onResume() }
    override fun onDestroy() { web?.apply { stopLoading(); loadUrl("about:blank"); destroy() }; web = null; super.onDestroy() }

    companion object {
        const val EXTRA_KEY = "key"
        const val EXTRA_TITLE = "title"
    }
}
