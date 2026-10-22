package org.seeduction.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionTest {
    @Test fun comparesNumberByNumber() {
        assertTrue(compareVersions("1.10.0", "1.9.5") > 0)
        assertTrue(compareVersions("1.1.0", "1.1.1") < 0)
        assertEquals(0, compareVersions("2.0", "2.0.0"))
        assertTrue(compareVersions("1.2.3.4", "1.2.3") > 0)
    }
}
