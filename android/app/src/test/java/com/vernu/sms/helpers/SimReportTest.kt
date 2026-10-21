package com.vernu.sms.helpers

import com.vernu.sms.dtos.SimUsedDTO
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SimReportTest {
    @Test
    fun dropsAndroidSentinelIds() {
        assertNull(SimReport.usableSubscriptionId(null))
        assertNull(SimReport.usableSubscriptionId(-1))
        assertNull(SimReport.usableSubscriptionId(Int.MAX_VALUE))
        assertEquals(0, SimReport.usableSubscriptionId(0))
        assertEquals(19, SimReport.usableSubscriptionId(19))
    }

    @Test
    fun dropsImpossibleSlots() {
        assertNull(SimReport.usableSlotIndex(null))
        assertNull(SimReport.usableSlotIndex(-1))
        assertNull(SimReport.usableSlotIndex(8))
        assertEquals(1, SimReport.usableSlotIndex(1))
    }

    @Test
    fun namesWhyTheSimWasPicked() {
        assertEquals("requested", SimReport.selectionFor(19, true, true))
        assertEquals("requested_invalid_fallback", SimReport.selectionFor(18, false, true))
        assertEquals("requested_invalid_fallback", SimReport.selectionFor(18, false, false))
        assertEquals("app_preferred", SimReport.selectionFor(null, false, true))
        assertEquals("system_default", SimReport.selectionFor(null, false, false))
    }

    @Test
    fun anEmptySimBecomesNull() {
        assertNull(SimReport.compact(null))
        assertNull(SimReport.compact(SimUsedDTO()))
        val dto = SimUsedDTO().apply { slotIndex = 0 }
        assertEquals(dto, SimReport.compact(dto))
    }

    @Test
    fun survivesTheIntentRoundTrip() {
        val sim = SimUsedDTO().apply {
            subscriptionId = 19
            slotIndex = 1
            carrierName = "Smart"
            countryIso = "ph"
            mcc = "515"
            mnc = "03"
        }
        val json = SimReport(sim, "requested").toJson()
        assertFalse(json.contains("displayName"))

        val back = SimReport.fromJson(json)!!
        assertEquals("requested", back.selection)
        assertEquals(19, back.simUsed!!.subscriptionId)
        assertEquals(1, back.simUsed!!.slotIndex)
        assertEquals("Smart", back.simUsed!!.carrierName)
        assertNull(back.simUsed!!.displayName)
        assertEquals("ph", back.simUsed!!.countryIso)
        assertEquals("515", back.simUsed!!.mcc)
        assertEquals("03", back.simUsed!!.mnc)
    }

    @Test
    fun keepsTheReasonWhenTheSimIsUnknown() {
        val back = SimReport.fromJson(SimReport(null, "system_default").toJson())!!
        assertNull(back.simUsed)
        assertEquals("system_default", back.selection)
        assertTrue(SimReport(SimUsedDTO(), null).toJson().contains("{}"))
    }

    @Test
    fun ignoresBrokenExtras() {
        assertNull(SimReport.fromJson(null))
        assertNull(SimReport.fromJson(""))
        assertNull(SimReport.fromJson("not json"))
        assertNull(SimReport.fromJson("{\"selection\":\"requested\"}")!!.simUsed)
    }

    @Test
    fun keepsAnEmptySimSoTheServerClearsTheOldOne() {
        val json = SimReport(SimUsedDTO(), "system_default").toJson()
        assertTrue(json.contains("\"simUsed\":{}"))
        assertTrue(SimReport.fromJson(json)!!.simUsed!!.isEmpty())
    }

    @Test
    fun splitsTheOperatorCode() {
        assertEquals("310" to "260", SimReport.splitOperator("310260"))
        assertEquals("515" to "03", SimReport.splitOperator("51503"))
        assertEquals(null to null, SimReport.splitOperator(null))
        assertEquals(null to null, SimReport.splitOperator(""))
        assertEquals(null to null, SimReport.splitOperator("3102"))
        assertEquals(null to null, SimReport.splitOperator("000000"))
        // Arabic-Indic digits are not network codes
        assertEquals(null to null, SimReport.splitOperator("\u0665\u0661\u0665\u0660\u0663"))
    }

    @Test
    fun checksNetworkCodes() {
        assertEquals("515", SimReport.mccOrNull(" 515 "))
        assertNull(SimReport.mccOrNull("000"))
        assertNull(SimReport.mccOrNull("51"))
        assertEquals("03", SimReport.mncOrNull("03"))
        assertNull(SimReport.mncOrNull("3"))
        assertNull(SimReport.mncOrNull("abcd"))
    }
}
