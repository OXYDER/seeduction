package org.seeduction.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackerWireTest {
    private fun b(s: String) = s.toByteArray(Charsets.ISO_8859_1)

    @Test fun parsesCompactIpv4AndIpv6Peers() {
        val v4 = byteArrayOf(10, 0, 0, 5, 0x1A, 0xE1.toByte())                       // 10.0.0.5:6881
        val v6 = ByteArray(16).also { it[15] = 1 } + byteArrayOf(0x1F, 0x90.toByte()) // [::1]:8080
        val body = b("d8:completei2e10:incompletei1e8:intervali900e5:peers6:") + v4 + b("6:peers618:") + v6 + b("e")
        val r = TrackerWire.parse(body)
        assertEquals(900, r.interval); assertEquals(2, r.complete); assertEquals(1, r.incomplete)
        assertEquals(2, r.peers.size)
        assertEquals("10.0.0.5" to 6881, r.peers[0])
        assertEquals(8080, r.peers[1].second)
        assertTrue(r.peers[1].first.contains(":"))
    }

    @Test fun readsFailureReason() {
        val r = TrackerWire.parse(b("d14:failure reason16:Torrent inconnu.e"))
        assertEquals("Torrent inconnu.", r.failure)
    }

    @Test fun readsDictionaryPeerList() {
        val r = TrackerWire.parse(b("d8:intervali60e5:peersld2:ip7:1.2.3.44:porti51413eeee"))
        assertEquals(listOf("1.2.3.4" to 51413), r.peers)
    }

    @Test fun buildsTheAnnounceUrl() {
        val u = TrackerWire.announceUrl("https://x.org/tracker/abc/announce?stream=1", "00ff10", "-LT2000-aaaaaaaaaaaa", 6881, 5, 7, 9, "started")
        assertEquals("https://x.org/tracker/abc/announce?stream=1&info_hash=%00%FF%10&peer_id=-LT2000-aaaaaaaaaaaa&port=6881&uploaded=5&downloaded=7&left=9&compact=1&numwant=60&event=started", u)
        assertTrue(TrackerWire.announceUrl("https://x.org/a", "00", "p", 1, 0, 0, 0, null).startsWith("https://x.org/a?info_hash=%00"))
    }

    @Test fun peerIdLooksLikeAClient() {
        val id = TrackerWire.newPeerId()
        assertEquals(20, id.length); assertTrue(id.startsWith("-LT2000-"))
    }
}
