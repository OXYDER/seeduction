package org.seeduction.player

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity

/** Une liste complète d'affiches : « Tout voir » d'une rangée, un genre, une lettre de A à Z, les sagas, ou les films d'une saga. */
class VodListActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = Prefs(this).vodToken ?: run { finish(); return }
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Catalogue"
        val kind = intent.getStringExtra(EXTRA_KIND)
        val genre = intent.getStringExtra(EXTRA_GENRE)
        val sort = intent.getStringExtra(EXTRA_SORT)
        val letter = intent.getStringExtra(EXTRA_LETTER)
        val sagaId = intent.getStringExtra(EXTRA_SAGA)
        val sagas = intent.getBooleanExtra(EXTRA_SAGAS, false)

        val grid = PagedGrid(this) { page ->
            when {
                sagaId != null -> if (page > 1) Pair(emptyList(), false) else Pair(VodApi.saga(token, sagaId).items, false)
                sagas -> if (page > 1) Pair(emptyList(), false) else Pair(VodApi.sagas(token), false)
                else -> VodApi.browse(token, mapOf("kind" to kind, "genre" to genre, "sort" to sort, "letter" to letter), page)
            }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG) }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(6), dp(10), dp(16), dp(6)) }
        bar.addView(icon(R.drawable.ic_back, 24, Ui.TEXT).apply { setPadding(dp(10), dp(10), dp(10), dp(10)); layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)); isClickable = true; setOnClickListener { finish() }; tvFocus(24f) })
        bar.addView(label(title, 20f, Ui.TEXT, Ui.black).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END })
        col.addView(bar)
        col.addView(grid.view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(col)
        grid.reset()
    }

    companion object {
        const val EXTRA_TITLE = "title"
        const val EXTRA_KIND = "kind"
        const val EXTRA_GENRE = "genre"
        const val EXTRA_SORT = "sort"
        const val EXTRA_LETTER = "letter"
        const val EXTRA_SAGA = "saga"
        const val EXTRA_SAGAS = "sagas"
    }
}
