package org.seeduction.player

import fi.iki.elonen.NanoHTTPD
import java.io.InputStream

/** Ce que le serveur local demande au moteur : retrouver une lecture et ouvrir une zone de son fichier. */
interface StreamSource {
    fun streamEntry(id: String): Entry?
    fun openStream(entry: Entry, start: Long, end: Long): InputStream
}

/** Petit serveur HTTP local (127.0.0.1) : VLC lit le fichier comme n'importe quel flux HTTP, avec les demandes de zone (Range) pour avancer et reculer dans la vidéo. */
class StreamServer(private val service: StreamSource) : NanoHTTPD("127.0.0.1", 0) {

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "mkv" -> "video/x-matroska"
        "mp4", "m4v" -> "video/mp4"
        "avi" -> "video/x-msvideo"
        "webm" -> "video/webm"
        "mov" -> "video/quicktime"
        "ts", "m2ts" -> "video/mp2t"
        "mp3" -> "audio/mpeg"
        "flac" -> "audio/flac"
        "m4a", "aac" -> "audio/aac"
        "ogg", "opus" -> "audio/ogg"
        else -> "application/octet-stream"
    }

    override fun serve(session: IHTTPSession): Response {
        val id = session.uri.removePrefix("/stream/")
        val entry = service.streamEntry(id) ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Lecture inconnue")
        val size = entry.map.size
        if (size <= 0) return newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "")

        var start = 0L
        var end = size - 1
        val range = session.headers["range"]
        var partial = false
        if (range != null && range.startsWith("bytes=")) {
            val spec = range.removePrefix("bytes=").substringBefore(',').trim()
            val a = spec.substringBefore('-'); val b = spec.substringAfter('-', "")
            if (a.isEmpty() && b.isNotEmpty()) { start = (size - b.toLong()).coerceAtLeast(0) } // « les N derniers octets »
            else if (a.isNotEmpty()) { start = a.toLong(); if (b.isNotEmpty()) end = minOf(b.toLong(), size - 1) }
            partial = true
        }
        if (start >= size) {
            val r = newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "")
            r.addHeader("Content-Range", "bytes */$size")
            return r
        }
        val length = end - start + 1
        val mime = mimeOf(entry.map.name)
        if (session.method == Method.HEAD) {
            val r = newFixedLengthResponse(if (partial) Response.Status.PARTIAL_CONTENT else Response.Status.OK, mime, "")
            r.addHeader("Accept-Ranges", "bytes"); r.addHeader("Content-Length", length.toString())
            return r
        }
        val stream = service.openStream(entry, start, end)
        val r = newFixedLengthResponse(if (partial) Response.Status.PARTIAL_CONTENT else Response.Status.OK, mime, stream, length)
        r.addHeader("Accept-Ranges", "bytes")
        if (partial) r.addHeader("Content-Range", "bytes $start-$end/$size")
        return r
    }
}
