package com.vernu.sms.helpers

import com.google.android.gms.common.ConnectionResult
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RegistrationChecksTest {
    @Test
    fun acceptsADashboardDeviceId() {
        assertTrue(RegistrationChecks.isValidDeviceId("6a1b2c3d4e5f60718293a4b5"))
        assertTrue(RegistrationChecks.isValidDeviceId("  6A1B2C3D4E5F60718293A4B5 "))
    }

    @Test
    fun rejectsIdsWithTheWrongLengthOrCharacters() {
        assertFalse(RegistrationChecks.isValidDeviceId(""))
        assertFalse(RegistrationChecks.isValidDeviceId("6a1b2c3d4e5f60718293a4b"))
        assertFalse(RegistrationChecks.isValidDeviceId("6a1b2c3d4e5f60718293a4b5c"))
        assertFalse(RegistrationChecks.isValidDeviceId("6a1b2c3d4e5f60718293a4bz"))
        // An API key pasted into the Device ID field
        assertFalse(RegistrationChecks.isValidDeviceId("a1b2c3d4-e5f6-7081-92a3-b4c5d6e7f809"))
    }

    @Test
    fun saysNothingWhenPlayServicesWorks() {
        assertNull(RegistrationChecks.playServicesMessage(ConnectionResult.SUCCESS))
    }

    @Test
    fun namesEachPlayServicesProblem() {
        val missing = RegistrationChecks.playServicesMessage(ConnectionResult.SERVICE_MISSING)
        val outdated = RegistrationChecks.playServicesMessage(ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED)
        val disabled = RegistrationChecks.playServicesMessage(ConnectionResult.SERVICE_DISABLED)

        assertNotNull(missing)
        assertTrue(missing!!.contains("does not have Google Play services"))
        assertTrue(outdated!!.contains("out of date"))
        assertTrue(disabled!!.contains("turned off"))
    }
}
