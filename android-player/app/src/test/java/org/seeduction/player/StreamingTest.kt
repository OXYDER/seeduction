package org.seeduction.player

import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.libtorrent4j.SessionManager
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.TcpEndpoint
import org.libtorrent4j.TorrentBuilder
import org.libtorrent4j.TorrentInfo
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Random

/**
 * Essai du vrai moteur sur le PC : un seeder local (libtorrent) partage un fichier de 8 Mo, le lecteur le télécharge et le sert par morceaux (lecture au milieu, à la fin, par HTTP avec Range)
 * exactement comme VLC le demandera sur le téléphone. Vérifie que chaque octet lu est le bon et que les zones demandées sont téléchargées en priorité.
 */
class StreamingTest {
    @get:Rule val tmp = TemporaryFolder()

    private lateinit var data: ByteArray
    private lateinit var torrent: ByteArray
    private lateinit var seeder: SessionManager
    private lateinit var engine: TorrentEngine
    private val seederPort = 46000 + Random().nextInt(2000)

    @Before fun setUp() {
        val src = tmp.newFolder("src")
        data = ByteArray(8 * 1024 * 1024).also { Random(42).nextBytes(it) }
        val file = File(src, "video.mkv").also { it.writeBytes(data) }
        torrent = TorrentBuilder().path(file).pieceSize(256 * 1024).generate().entry().bencode()

        seeder = SessionManager()
        val sp = SettingsPack()
        sp.listenInterfaces("127.0.0.1:$seederPort")
        sp.isEnableDht = false
        sp.isEnableLsd = false
        seeder.start(SessionParams(sp))
        seeder.download(TorrentInfo(torrent), src)
        // le seeder vérifie son fichier avant de pouvoir le partager
        val hash = TorrentInfo(torrent).infoHash()
        val until = System.currentTimeMillis() + 30_000
        while (System.currentTimeMillis() < until) {
            val h = seeder.find(hash)
            if (h != null && h.isValid && h.status().isSeeding) break
            Thread.sleep(200)
        }
        assertTrue("le seeder n'est pas prêt", seeder.find(hash)?.status()?.isSeeding == true)

        engine = TorrentEngine(tmp.newFolder("dl"))
        engine.start()
    }

    @After fun tearDown() {
        engine.stop()
        seeder.stop()
    }

    private fun add() = engine.add(torrent, 0, listOf(TcpEndpoint("127.0.0.1", seederPort)))

    private fun InputStream.readExactly(n: Int): ByteArray {
        val out = ByteArray(n)
        var off = 0
        while (off < n) {
            val r = read(out, off, n - off)
            if (r < 0) break
            off += r
        }
        return out.copyOf(off)
    }

    @Test fun readsTheMiddleOfTheFileFirst() {
        val handle = add()
        val map = FileMap(handle.torrentFile(), 0)
        assertEquals(8L * 1024 * 1024, map.size)
        // la fin du fichier avant son début : la lecture au milieu / à la fin doit marcher sans avoir tout téléchargé
        val tail = PieceInputStream(engine, handle, map, engine.fileOf(map), map.size - 100_000, map.size - 1) { false }.use { it.readExactly(100_000) }
        assertArrayEquals(data.copyOfRange(data.size - 100_000, data.size), tail)
        val mid = PieceInputStream(engine, handle, map, engine.fileOf(map), 3_000_000, 3_999_999) { false }.use { it.readExactly(1_000_000) }
        assertArrayEquals(data.copyOfRange(3_000_000, 4_000_000), mid)
    }

    @Test fun prebufferBecomesReady() {
        val handle = add()
        val map = FileMap(handle.torrentFile(), 0)
        engine.primePrebuffer(handle, map)
        val until = System.currentTimeMillis() + 30_000
        while (engine.prebuffer(handle, map) < 0.999f && System.currentTimeMillis() < until) Thread.sleep(200)
        assertTrue("tampon de départ non prêt", engine.prebuffer(handle, map) >= 0.999f)
    }

    @Test fun servesRangesOverHttpLikeVlc() {
        val handle = add()
        val map = FileMap(handle.torrentFile(), 0)
        val info = SessionInfo(id = "t1", infoHash = handle.infoHash().toHex(), name = "video.mkv", torrentId = "x", fileIndex = 0, coverImage = null, passkey = null, addedAt = 0)
        val entry = Entry(info, handle, map)
        val source = object : StreamSource {
            override fun streamEntry(id: String) = if (id == "t1") entry else null
            override fun openStream(entry: Entry, start: Long, end: Long): InputStream {
                engine.prioritize(entry.handle, entry.map, start)
                return PieceInputStream(engine, entry.handle, entry.map, engine.fileOf(entry.map), start, end) { entry.closed }
            }
        }
        val server = StreamServer(source)
        server.start(60_000, false)
        try {
            val base = "http://127.0.0.1:${server.listeningPort}/stream/t1"
            fun get(range: String?): Pair<HttpURLConnection, ByteArray> {
                val c = URL(base).openConnection() as HttpURLConnection
                if (range != null) c.setRequestProperty("Range", range)
                c.readTimeout = 60_000
                val body = c.inputStream.use { it.readBytes() }
                return c to body
            }
            // fin de fichier d'abord (l'index d'un .mkv), puis une zone au milieu, puis un « Range » ouvert
            val (c1, b1) = get("bytes=-65536")
            assertEquals(206, c1.responseCode)
            assertEquals("bytes ${data.size - 65536}-${data.size - 1}/${data.size}", c1.getHeaderField("Content-Range"))
            assertArrayEquals(data.copyOfRange(data.size - 65536, data.size), b1)

            val (c2, b2) = get("bytes=2000000-2299999")
            assertEquals(206, c2.responseCode)
            assertArrayEquals(data.copyOfRange(2_000_000, 2_300_000), b2)

            val (c3, b3) = get("bytes=7500000-")
            assertEquals(206, c3.responseCode)
            assertEquals("bytes", c3.getHeaderField("Accept-Ranges"))
            assertArrayEquals(data.copyOfRange(7_500_000, data.size), b3)

            val head = URL(base).openConnection() as HttpURLConnection
            head.requestMethod = "HEAD"
            assertEquals(200, head.responseCode)
            assertEquals(data.size.toString(), head.getHeaderField("Content-Length"))
            assertEquals("video/x-matroska", head.contentType)

            val unknown = URL("http://127.0.0.1:${server.listeningPort}/stream/inconnu").openConnection() as HttpURLConnection
            assertEquals(404, unknown.responseCode)
        } finally { server.stop() }
    }
}
