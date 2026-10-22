package org.seeduction.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LiveLinkTest {
    @Test fun readsTheTokenOfALiveLink() {
        assertEquals("3f2c-41", liveTokenOf("seeduction://live/3f2c-41"))
        assertEquals("abc", liveTokenOf("SEEDUCTION://live/abc?x=1"))
    }

    @Test fun ignoresOtherLinks() {
        assertNull(liveTokenOf("seeduction://stream/abc"))
        assertNull(liveTokenOf("https://seeduction.org/live/abc"))
        assertNull(liveTokenOf("seeduction://live/"))
        assertNull(liveTokenOf(null))
    }
}
