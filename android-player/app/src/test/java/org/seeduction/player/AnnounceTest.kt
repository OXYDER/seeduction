package org.seeduction.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AnnounceTest {
    @Test fun readsAnnounceAndPasskey() {
        val url = "https://seeduction.org/tracker/a1b2c3d4-e5f6-7890-abcd-ef1234567890/announce?stream=1"
        val torrent = ("d8:announce" + url.length + ":" + url + "4:infod4:name3:abcee").toByteArray()
        assertEquals(url, announceOf(torrent))
        assertEquals("a1b2c3d4-e5f6-7890-abcd-ef1234567890", extractPasskey(announceOf(torrent)))
    }

    @Test fun missingAnnounce() {
        assertNull(announceOf("d4:infod4:name3:abcee".toByteArray()))
        assertNull(extractPasskey(null))
    }
}
